from __future__ import annotations

import json
from typing import List, Dict, Optional

import numpy as np
import geopandas as gpd
import psycopg2
from psycopg2.extras import execute_batch
from shapely.geometry import Polygon, LineString

from config import GeneratorConfig, LODConfig
from geometry import parse_height_raw, get_building_height, get_building_color, get_roof_shape


def _polygon_to_wkt(poly: Polygon) -> str:
    return poly.wkt


def _linestring_to_wkt(line: LineString) -> str:
    return line.wkt


def _reproject_buildings(
    buildings: gpd.GeoDataFrame,
    target_crs: str = "EPSG:4326",
) -> gpd.GeoDataFrame:
    if buildings.crs is None:
        raise ValueError("GeoDataFrame has no CRS set — cannot reproject.")
    return buildings.to_crs(target_crs)


def _reproject_lines(
    lines: List[LineString],
    source_crs: str = "EPSG:2154",
    target_crs: str = "EPSG:4326",
) -> List[LineString]:
    if not lines:
        return []
    gdf = gpd.GeoDataFrame(geometry=lines, crs=source_crs)
    gdf = gdf.to_crs(target_crs)
    return list(gdf.geometry)



_CREATE_SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS buildings (
    id            SERIAL PRIMARY KEY,
    geom          GEOMETRY(Polygon, 4326) NOT NULL,
    height        REAL        NOT NULL DEFAULT 10.0,
    floors        INTEGER     GENERATED ALWAYS AS
                      (GREATEST(1, ROUND(height / 3.0)::INT)) STORED,
    material      VARCHAR(64) DEFAULT 'concrete',
    color         VARCHAR(16) DEFAULT '#CCCCCC',
    building_type VARCHAR(32) DEFAULT 'residential',
    roof_shape    VARCHAR(32) DEFAULT 'flat',
    lod_level     SMALLINT    NOT NULL DEFAULT 2,
    name          VARCHAR(128),
    created_at    TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buildings_geom
    ON buildings USING GIST (geom);

CREATE TABLE IF NOT EXISTS streets (
    id          SERIAL PRIMARY KEY,
    geom        GEOMETRY(LineString, 4326) NOT NULL,
    name        VARCHAR(128),
    street_type VARCHAR(32) DEFAULT 'residential',
    width       REAL        DEFAULT 8.0,
    lanes       SMALLINT    DEFAULT 2,
    created_at  TIMESTAMP   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streets_geom
    ON streets USING GIST (geom);
"""


def ensure_schema(conn: psycopg2.extensions.connection) -> None:
    with conn.cursor() as cur:
        cur.execute(_CREATE_SCHEMA_SQL)
    conn.commit()
    print("[db_writer] Schema verified / created.")


_INSERT_BUILDING = """
INSERT INTO buildings
    (geom, height, material, color, building_type, roof_shape, lod_level)
VALUES
    (ST_GeomFromText(%s, 4326), %s, %s, %s, %s, %s, %s)
"""


def insert_buildings(
    conn: psycopg2.extensions.connection,
    buildings: gpd.GeoDataFrame,
    lod_config: LODConfig,
    batch_size: int = 500,
) -> int:

    rows = []
    for _, row in buildings.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue

        data = row.to_dict()
        height = get_building_height(data, lod_config)

        if lod_config.use_materials:
            material = str(data.get("building:material", "concrete") or "concrete")
        else:
            material = "concrete"

        if lod_config.use_colors:
            color_rgb = get_building_color(data, lod_config)
            color = f"#{int(color_rgb[0]*255):02x}{int(color_rgb[1]*255):02x}{int(color_rgb[2]*255):02x}"
        else:
            color = "#CCCCCC"

        building_type = str(data.get("building:type", "residential") or "residential")
        roof_shape    = get_roof_shape(data, lod_config)

        rows.append((
            _polygon_to_wkt(geom),
            height,
            material,
            color,
            building_type,
            roof_shape,
            lod_config.lod_level,
        ))

    with conn.cursor() as cur:
        execute_batch(cur, _INSERT_BUILDING, rows, page_size=batch_size)

    conn.commit()
    print(f"[db_writer] Inserted {len(rows)} buildings.")
    return len(rows)


_INSERT_STREET = """
INSERT INTO streets (geom, street_type, width, lanes)
VALUES (ST_GeomFromText(%s, 4326), %s, %s, %s)
"""

_STREET_TYPES = ["residential", "arterial", "highway"]
_STREET_WIDTHS = {"residential": 8.0, "arterial": 14.0, "highway": 20.0}
_STREET_LANES  = {"residential": 2,   "arterial": 4,    "highway": 6}


def insert_streets(
    conn: psycopg2.extensions.connection,
    streets: List[LineString],
    batch_size: int = 200,
) -> int:

    import random
    rows = []
    n = len(streets)

    for i, line in enumerate(streets):
        if line is None or line.is_empty:
            continue

        if i >= n - 2:
            st = "arterial"
        else:
            st = random.choices(
                ["residential", "arterial"],
                weights=[7, 3],
            )[0]

        rows.append((
            _linestring_to_wkt(line),
            st,
            _STREET_WIDTHS[st],
            _STREET_LANES[st],
        ))

    with conn.cursor() as cur:
        execute_batch(cur, _INSERT_STREET, rows, page_size=batch_size)

    conn.commit()
    print(f"[db_writer] Inserted {len(rows)} street segments.")
    return len(rows)


def write_city_to_db(
    cfg: GeneratorConfig,
    buildings: gpd.GeoDataFrame,
    streets: List[LineString],
    lod_configs: List[LODConfig],
) -> None:
    print(f"[db_writer] Connecting to {cfg.db_host}:{cfg.db_port}/{cfg.db_name} ...")

    try:
        conn = psycopg2.connect(cfg.dsn)
    except psycopg2.OperationalError as e:
        print(f"[db_writer] WARNING: Could not connect to database: {e}")
        print("[db_writer] Skipping database write. Use --no-db flag to suppress.")
        return

    try:
        ensure_schema(conn)

        buildings_wgs = _reproject_buildings(buildings)
        streets_wgs   = _reproject_lines(streets)

        with conn.cursor() as cur:
            cur.execute("TRUNCATE TABLE buildings, streets RESTART IDENTITY;")
        conn.commit()

        for lod_config in lod_configs:
            insert_buildings(conn, buildings_wgs, lod_config)

        if any(lc.use_streets for lc in lod_configs):
            insert_streets(conn, streets_wgs)

    except Exception as e:
        conn.rollback()
        print(f"[db_writer] ERROR: {e}")
        raise
    finally:
        conn.close()

    print("[db_writer] City written to database successfully.")
