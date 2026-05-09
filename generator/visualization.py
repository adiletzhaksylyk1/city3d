from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional, Dict

import pyvista as pv
import geopandas as gpd
from shapely.geometry import mapping

from config import LODConfig
from geometry import parse_height_raw, get_building_height, get_building_color, get_roof_shape, get_roof_height



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
    lod_configs: List[LODConfig],
) -> None:

    features = []

    for lod_config in lod_configs:
        for _, row in buildings.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue

            data = row.to_dict()
            height = get_building_height(data, lod_config)

            props: Dict = {
                "type": "building",
                "lod_level": lod_config.lod_level,
                "height": height,
            }

            if lod_config.use_levels:
                props["building:levels"] = data.get("building:levels")
            
            if lod_config.use_materials:
                props["building:material"] = data.get("building:material", "concrete")
            else:
                props["building:material"] = "concrete"

            if lod_config.use_colors:
                color_rgb = get_building_color(data, lod_config)
                props["building:colour"] = f"#{int(color_rgb[0]*255):02x}{int(color_rgb[1]*255):02x}{int(color_rgb[2]*255):02x}"
            else:
                props["building:colour"] = "#CCCCCC"

            props["building:type"] = data.get("building:type", "residential")

            if lod_config.use_roof_shapes:
                props["roof:shape"] = get_roof_shape(data, lod_config)
                props["roof:height"] = get_roof_height(data, lod_config)
            else:
                props["roof:shape"] = "flat"
                props["roof:height"] = 0.0

            import math
            clean_props = {}
            for k, v in props.items():
                if v is None:
                    continue
                if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
                    continue
                clean_props[k] = v

            features.append({
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": clean_props,
            })

    # Add streets if any config requires it (LOD >= 4)
    if any(lc.use_streets for lc in lod_configs):
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
