from __future__ import annotations

from typing import List, Dict, Tuple

import numpy as np
import pyvista as pv
from shapely.geometry import Polygon

from config import LODConfig
from geometry import get_building_height, get_building_color


def _make_building_mesh(
    coords: np.ndarray,
    height: float,
) -> Tuple[np.ndarray, List[int]]:

    ring = coords[:-1]
    n = len(ring)

    base = np.column_stack([ring, np.zeros(n)])        # z = 0
    top  = np.column_stack([ring, np.full(n, height)]) # z = height

    pts = np.vstack([base, top])   # shape (2n, 3)

    faces: List[int] = []

    faces += [n] + list(range(n - 1, -1, -1))

    # Roof face
    faces += [n] + list(range(n, 2 * n))

    for i in range(n):
        j = (i + 1) % n
        faces += [4, i, j, n + j, n + i]

    return pts, faces



def _face_colors(
    n_vertices: int,
    color: Tuple[float, float, float],
    height: float,
) -> np.ndarray:
    r, g, b = [int(c * 255) for c in color]
    colors = np.full((n_vertices, 3), [r, g, b], dtype=np.uint8)

    n = n_vertices // 2
    dark = np.array([max(0, r - 30), max(0, g - 30), max(0, b - 30)], dtype=np.uint8)
    colors[:n] = dark

    return colors


def extrude_buildings(
    footprints: List[Polygon],
    data_list: List[Dict],
    lod_config: LODConfig,
    add_colors: bool = True,
) -> pv.PolyData:

    all_pts:   List[np.ndarray] = []
    all_faces: List[np.ndarray] = []
    all_colors: List[np.ndarray] = []
    offset = 0

    for poly, data in zip(footprints, data_list):
        if not isinstance(poly, Polygon) or poly.is_empty:
            continue

        h      = get_building_height(data, lod_config)
        color  = get_building_color(data, lod_config)
        coords = np.array(poly.exterior.coords)

        pts, raw_faces = _make_building_mesh(coords, h)

        face_arr = np.array(raw_faces, dtype=int)
        i = 0
        while i < len(face_arr):
            face_count = face_arr[i]
            face_arr[i + 1 : i + 1 + face_count] += offset
            i += face_count + 1

        all_pts.append(pts)
        all_faces.append(face_arr)

        if add_colors:
            all_colors.append(_face_colors(len(pts), color, h))

        offset += len(pts)

    if not all_pts:
        return pv.PolyData()

    merged_pts   = np.vstack(all_pts)
    merged_faces = np.concatenate(all_faces)

    mesh = pv.PolyData(merged_pts, merged_faces)

    if add_colors and all_colors:
        mesh["RGB"] = np.vstack(all_colors)

    return mesh
