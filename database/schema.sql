-- =============================================================================
-- schema.sql — PostGIS spatial database schema for the 3D city generator
-- (Section 4.3 of the thesis)
--
-- Run with:
--   psql $DATABASE_URL -f schema.sql
-- =============================================================================

-- Require PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- =============================================================================
-- Table: buildings
-- =============================================================================
CREATE TABLE IF NOT EXISTS buildings (
    id            SERIAL        PRIMARY KEY,

    -- Spatial column: simple polygon in WGS84 (required by GeoJSON / RFC 7946)
    geom          GEOMETRY(Polygon, 4326) NOT NULL,

    -- Height attributes
    height        REAL          NOT NULL DEFAULT 10.0,
    floors        INTEGER       GENERATED ALWAYS AS
                      (GREATEST(1, ROUND(height / 3.0)::INT)) STORED,

    -- Appearance
    material      VARCHAR(64)   DEFAULT 'concrete',
    color         VARCHAR(16)   DEFAULT '#CCCCCC',

    -- Classification
    building_type VARCHAR(32)   DEFAULT 'residential',
    roof_shape    VARCHAR(32)   DEFAULT 'flat',

    -- LOD control
    lod_level     SMALLINT      NOT NULL DEFAULT 2,

    -- Optional metadata
    name          VARCHAR(128),
    osm_id        BIGINT,                          -- for OSM integration (Phase 2)

    created_at    TIMESTAMP     DEFAULT NOW()
);

-- GIST spatial index — enables fast bounding-box queries (Section 4.3.3)
CREATE INDEX IF NOT EXISTS idx_buildings_geom
    ON buildings USING GIST (geom);

-- Index for LOD filtering
CREATE INDEX IF NOT EXISTS idx_buildings_lod
    ON buildings (lod_level);

-- =============================================================================
-- Table: streets
-- =============================================================================
CREATE TABLE IF NOT EXISTS streets (
    id          SERIAL        PRIMARY KEY,

    geom        GEOMETRY(LineString, 4326) NOT NULL,

    name        VARCHAR(128),
    street_type VARCHAR(32)   DEFAULT 'residential',
    width       REAL          DEFAULT 8.0,
    lanes       SMALLINT      DEFAULT 2,

    osm_id      BIGINT,

    created_at  TIMESTAMP     DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_streets_geom
    ON streets USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_streets_type
    ON streets (street_type);

-- =============================================================================
-- Convenience view: buildings_geojson
-- Returns each building as a GeoJSON Feature (used by the API)
-- =============================================================================
CREATE OR REPLACE VIEW buildings_geojson AS
SELECT
    id,
    ST_AsGeoJSON(geom)::json                    AS geometry,
    json_build_object(
        'id',            id,
        'height',        height,
        'floors',        floors,
        'material',      material,
        'color',         color,
        'building_type', building_type,
        'roof_shape',    roof_shape,
        'lod_level',     lod_level,
        'name',          name
    )                                           AS properties
FROM buildings;

-- =============================================================================
-- Convenience view: streets_geojson
-- =============================================================================
CREATE OR REPLACE VIEW streets_geojson AS
SELECT
    id,
    ST_AsGeoJSON(geom)::json                    AS geometry,
    json_build_object(
        'id',          id,
        'name',        name,
        'street_type', street_type,
        'width',       width,
        'lanes',       lanes
    )                                           AS properties
FROM streets;

-- =============================================================================
-- Helper function: bbox_to_envelope
-- Parses 'minLon,minLat,maxLon,maxLat' text into a geometry envelope
-- =============================================================================
CREATE OR REPLACE FUNCTION bbox_to_envelope(bbox TEXT)
RETURNS GEOMETRY AS $$
DECLARE
    parts TEXT[];
BEGIN
    parts := string_to_array(bbox, ',');
    RETURN ST_MakeEnvelope(
        parts[1]::FLOAT,  -- minLon (west)
        parts[2]::FLOAT,  -- minLat (south)
        parts[3]::FLOAT,  -- maxLon (east)
        parts[4]::FLOAT,  -- maxLat (north)
        4326
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;
