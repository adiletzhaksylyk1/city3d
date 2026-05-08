from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Dict

import numpy as np
import pyvista as pv
import geopandas as gpd
from shapely.geometry import mapping

from config import LODConfig, GeneratorConfig
from geometry import get_building_height, get_building_color



def visualize_mesh(
    mesh: pv.PolyData,
    location: str,
    lod_config: LODConfig,
    street_mesh: Optional[pv.PolyData] = None,
    screenshot: Optional[str] = None,
    off_screen: bool = False,
) -> None:

    pl = pv.Plotter(off_screen=off_screen, title=f"3D City — {location} [{lod_config}]")
    pl.set_background("black")

    if mesh.n_cells > 0:
        if "RGB" in mesh.point_data:
            pl.add_mesh(
                mesh,
                scalars="RGB",
                rgb=True,
                show_edges=False,
            )
        else:
            pl.add_mesh(mesh, color="#9E9E9E", show_edges=False)

    if street_mesh is not None and street_mesh.n_cells > 0:
        pl.add_mesh(street_mesh, color="white", line_width=2, render_lines_as_tubes=False)

    radius = 600
    ground = pv.Plane(
        center=(0, 0, -0.1),
        direction=(0, 0, 1),
        i_size=radius * 2,
        j_size=radius * 2,
    )
    pl.add_mesh(ground, color="#1A1A2E", show_edges=False)

    pl.camera_position = [
        (0, -radius * 1.2, radius * 0.8),
        (0, 0, 0),
        (0, 0, 1),
    ]

    if screenshot:
        pl.screenshot(screenshot)
        print(f"[viz] Screenshot saved: {screenshot}")
    else:
        pl.show()



def export_geojson(
    buildings: gpd.GeoDataFrame,
    streets: List,
    output_path: str,
    lod_config: LODConfig,
) -> None:

    features = []


    for _, row in buildings.iterrows():
        geom = row.geometry
        if geom is None or geom.is_empty:
            continue

        props: Dict = {
            "type": "building",
            "lod_level": lod_config.lod_level,
        }

        raw = row.get("height", None)
        try:
            props["height"] = float(str(raw).lower().replace("m", "").strip())
        except (ValueError, TypeError, AttributeError):
            props["height"] = 12.0

        for key in [
            "building:levels",
            "building:material",
            "building:colour",
            "building:type",
            "roof:shape",
            "roof:height",
        ]:
            val = row.get(key, None)
            if val is not None:
                props[key] = val

        features.append({
            "type": "Feature",
            "geometry": mapping(geom),
            "properties": props,
        })

    for line in streets:
        if line is None or line.is_empty:
            continue
        features.append({
            "type": "Feature",
            "geometry": mapping(line),
            "properties": {
                "type": "street",
                "street_type": "residential",
            },
        })

    collection = {
        "type": "FeatureCollection",
        "features": features,
    }

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(collection, indent=2))
    print(f"[viz] GeoJSON exported: {out} ({len(features)} features)")



def visualize_and_export(
    mesh: pv.PolyData,
    location: str,
    lod_config: LODConfig,
    buildings_gdf: gpd.GeoDataFrame, # Pass the GDF here to export it
    streets_list: List,              # Pass the streets here
    street_mesh: Optional[pv.PolyData] = None,
    screenshot: Optional[str] = None,
    off_screen: bool = False,
) -> None:
    BASE_DIR = Path(__file__).resolve().parent.parent
    export_path = BASE_DIR / "client/public/city.geojson"
    
    export_geojson(
        buildings=buildings_gdf,
        streets=streets_list,
        output_path=str(export_path),
        lod_config=lod_config
    )

    # 2. Show the PyVista window
    visualize_mesh(
        mesh=mesh,
        location=location,
        lod_config=lod_config,
        street_mesh=street_mesh,
        screenshot=screenshot,
        off_screen=off_screen,
    )
