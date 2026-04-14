from __future__ import annotations

from typing import List, Tuple, Dict

import geopandas as gpd
from shapely.geometry import Polygon, MultiPolygon


def generate_footprints(
    buildings: gpd.GeoDataFrame,
) -> Tuple[List[Polygon], List[Dict]]:

    footprints: List[Polygon] = []
    data: List[Dict] = []

    for _, row in buildings.iterrows():
        geom = row.geometry

        if geom is None or geom.is_empty:
            continue

        if isinstance(geom, MultiPolygon):
            for part in geom.geoms:
                if not part.is_empty:
                    footprints.append(part)
                    data.append(row.to_dict())

        elif isinstance(geom, Polygon):
            footprints.append(geom)
            data.append(row.to_dict())

        else:
            continue

    return footprints, data


def filter_by_lod(
    footprints: List[Polygon],
    data: List[Dict],
    min_area: float = 10.0,
) -> Tuple[List[Polygon], List[Dict]]:
    result_fp, result_data = [], []
    for fp, d in zip(footprints, data):
        if fp.area >= min_area:
            result_fp.append(fp)
            result_data.append(d)
    return result_fp, result_data
