from __future__ import annotations

import random
import math
from typing import List, Dict, Tuple

import numpy as np
import geopandas as gpd
from shapely.geometry import Polygon, LineString, Point, MultiPolygon
from shapely import affinity

from config import LODConfig, GeneratorConfig


_MATERIALS = ["brick", "concrete", "wood", "glass", "stone", "plaster"]
_COLORS = {
    "brick":    ["#C8A882", "#B5895A", "#A0522D"],
    "concrete": ["#9E9E9E", "#B0BEC5", "#78909C"],
    "glass":    ["#B3E5FC", "#81D4FA", "#4FC3F7"],
    "wood":     ["#8D6E63", "#795548", "#6D4C41"],
    "stone":    ["#90A4AE", "#78909C", "#607D8B"],
    "plaster":  ["#F5F5F5", "#EEEEEE", "#E0E0E0"],
}
_ROOF_SHAPES = ["flat", "gabled", "hipped", "pyramidal", "shed"]
_BUILDING_TYPES = ["residential", "office", "commercial", "industrial", "public"]


def _sample_height(mu: float, sigma: float) -> float:
    log_mean = math.log(mu)
    h = random.lognormvariate(log_mean, sigma)
    return round(max(3.0, min(h, 200.0)), 1)


def _material_for_height(height: float) -> str:
    if height < 8:
        return random.choices(["brick", "wood", "plaster"], weights=[5, 3, 2])[0]
    elif height < 20:
        return random.choices(["brick", "concrete", "plaster"], weights=[4, 4, 2])[0]
    elif height < 50:
        return random.choices(["concrete", "brick", "glass"], weights=[5, 3, 2])[0]
    else:
        return random.choices(["glass", "concrete"], weights=[6, 4])[0]


def _building_type_for_height(height: float) -> str:
    if height < 8:
        return random.choices(
            ["residential", "commercial", "industrial"], weights=[5, 3, 2]
        )[0]
    elif height < 30:
        return random.choices(
            ["residential", "office", "commercial"], weights=[5, 3, 2]
        )[0]
    else:
        return random.choices(["office", "residential", "public"], weights=[6, 3, 1])[0]


def _generate_building_attrs(height: float) -> Dict:
    data: Dict = {}
    data["height"] = f"{height:.1f}m"
    data["building:levels"] = max(1, round(height / 3.0))

    material = _material_for_height(height)
    building_type = _building_type_for_height(height)

    data["building:material"] = material
    data["building:colour"] = random.choice(_COLORS.get(material, ["#CCCCCC"]))

    if height < 8:
        data["roof:shape"] = random.choices(
            ["gabled", "hipped", "flat"], weights=[4, 3, 3]
        )[0]
    else:
        data["roof:shape"] = random.choices(
            ["flat", "gabled", "pyramidal"], weights=[6, 2, 2]
        )[0]
    data["roof:height"] = round(random.uniform(1.0, min(5.0, height * 0.15)), 1)

    data["building:type"] = building_type
    return data



def _make_rotated_rect(cx: float, cy: float, w: float, d: float, angle: float) -> Polygon:
    rect = Polygon([
        (-w / 2, -d / 2),
        ( w / 2, -d / 2),
        ( w / 2,  d / 2),
        (-w / 2,  d / 2),
    ])
    rect = affinity.rotate(rect, math.degrees(angle), origin=(0, 0))
    rect = affinity.translate(rect, cx, cy)
    return rect


def _generate_buildings(
    center: np.ndarray,
    radius: float,
    n_buildings: int,
    height_mu: float,
    height_sigma: float,
    rng: random.Random,
) -> Tuple[List[Polygon], List[Dict]]:
    polys: List[Polygon] = []
    attrs: List[Dict] = []

    attempts = 0
    max_attempts = n_buildings * 10

    while len(polys) < n_buildings and attempts < max_attempts:
        attempts += 1

        angle = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.05 * radius, 0.92 * radius)

        cx = center[0] + r * math.cos(angle)
        cy = center[1] + r * math.sin(angle)

        density_factor = 1.0 - 0.4 * (r / radius)
        w = rng.uniform(8, 40) * density_factor + 8
        d = rng.uniform(8, 35) * density_factor + 8

        building_angle = rng.choice([0, math.pi / 2]) + rng.uniform(-0.1, 0.1)

        poly = _make_rotated_rect(cx, cy, w, d, building_angle)

        if any(poly.intersects(p) for p in polys[-30:]):
            continue

        height = _sample_height(height_mu, height_sigma)
        polys.append(poly)
        attrs.append(_generate_building_attrs(height))

    return polys, attrs

def _generate_streets(
    center: np.ndarray,
    radius: float,
    grid_size: int = 12,
    add_diagonals: bool = True,
) -> List[LineString]:
    streets: List[LineString] = []

    xmin, xmax = center[0] - radius, center[0] + radius
    ymin, ymax = center[1] - radius, center[1] + radius

    # +1 to get proper closed blocks at boundaries
    xs = np.linspace(xmin, xmax, grid_size + 1)
    ys = np.linspace(ymin, ymax, grid_size + 1)

    for x in xs:
        streets.append(LineString([(x, ymin), (x, ymax)]))

    for y in ys:
        streets.append(LineString([(xmin, y), (xmax, y)]))

    if add_diagonals:
        streets.append(LineString([(xmin, ymin), (xmax, ymax)]))
        streets.append(LineString([(xmin, ymax), (xmax, ymin)]))

    return streets


def generate_synthetic_city(
    cfg: GeneratorConfig,
) -> Tuple[gpd.GeoDataFrame, List[LineString], LODConfig]:

    rng = random.Random()
    lod_config = cfg.lod_config
    center = np.array([0.0, 0.0])

    print(f"[generator] Generating city: {cfg.location!r}")
    print(f"[generator] LOD: {lod_config}")
    print(f"[generator] Target buildings: {cfg.n_buildings}, radius: {cfg.radius} m")

    polys, attrs = _generate_buildings(
        center=center,
        radius=cfg.radius,
        n_buildings=cfg.n_buildings,
        height_mu=cfg.height_mu,
        height_sigma=cfg.height_sigma,
        rng=rng,
    )

    print(f"[generator] Placed {len(polys)} buildings")

    buildings = gpd.GeoDataFrame(attrs, geometry=polys, crs="EPSG:3857")

    streets = _generate_streets(
        center=center,
        radius=cfg.radius,
        grid_size=cfg.n_grid_lines,
        add_diagonals=cfg.add_diagonals,
    )

    print(f"[generator] Generated {len(streets)} street segments")

    return buildings, streets, lod_config
