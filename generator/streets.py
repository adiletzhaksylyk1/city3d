
from __future__ import annotations

from typing import List, Optional

import numpy as np
import pyvista as pv
from shapely.geometry import LineString

from config import LODConfig


_STREET_COLORS = {
    "highway":     (1.00, 0.80, 0.00),   # amber
    "arterial":    (0.40, 0.40, 0.40),   # dark grey
    "residential": (0.67, 0.67, 0.67),   # light grey
    "default":     (0.67, 0.67, 0.67),
}


def _linestrings_to_polydata(lines: List[LineString]) -> pv.PolyData:

    pts_list: List[np.ndarray] = []

    for geom in lines:
        if not isinstance(geom, LineString) or geom.is_empty:
            continue
        xs, ys = geom.xy
        pts = np.column_stack([xs, ys, np.zeros(len(xs))])
        pts_list.append(pts)

    if not pts_list:
        return pv.PolyData()

    all_pts = np.concatenate(pts_list, axis=0)

    lines_conn: List[int] = []
    offset = 0
    for pts in pts_list:
        n = len(pts)
        lines_conn += [n] + list(range(offset, offset + n))
        offset += n

    return pv.PolyData(all_pts, lines=np.array(lines_conn))


def create_street_mesh(
    streets: List[LineString],
    lod_config: LODConfig,
) -> Optional[pv.PolyData]:

    if not lod_config.use_streets:
        return None

    return _linestrings_to_polydata(streets)


def streetGraph_to_pyvista(streets: List[LineString]) -> pv.PolyData:
    """Alias kept for backward compatibility."""
    return _linestrings_to_polydata(streets)
