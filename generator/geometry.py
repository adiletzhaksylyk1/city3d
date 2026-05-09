
from __future__ import annotations

import random
from typing import Dict, List, Tuple

from config import LODConfig


def parse_height_raw(raw, default: float = 12.0) -> float:
    """Parse a raw height value (e.g. '15.0m', '20', None) into a float.

    Shared utility used by both GeoJSON export and DB writer to avoid
    duplicating the same parsing logic.
    """
    if raw is None:
        return default
    try:
        return float(str(raw).lower().replace("m", "").strip())
    except (ValueError, TypeError, AttributeError):
        return default

def get_building_height(
    data: Dict,
    lod_config: LODConfig,
    default: float = 12.0,
) -> float:
    if lod_config.lod_level == 0:
        return 0.1

    height: float | None = None

    if lod_config.use_height and data.get("height"):
        try:
            raw = str(data["height"]).lower().replace("m", "").strip()
            height = float(raw)
        except (ValueError, TypeError):
            height = None

    if height is None and lod_config.use_levels:
        levels = data.get("building:levels")
        if levels is not None:
            try:
                height = float(levels) * 3.0
            except (ValueError, TypeError):
                height = None

    # 3. Fallbacks
    if height is None:
        if lod_config.lod_level == 1:
            height = random.uniform(10, 50)
        else:
            height = default

    return max(height, 1.0)


_NAMED_COLORS: Dict[str, Tuple[float, float, float]] = {
    "red":     (0.80, 0.20, 0.20),
    "blue":    (0.20, 0.40, 0.80),
    "green":   (0.20, 0.60, 0.20),
    "yellow":  (0.90, 0.85, 0.20),
    "white":   (0.95, 0.95, 0.95),
    "grey":    (0.60, 0.60, 0.60),
    "gray":    (0.60, 0.60, 0.60),
    "brown":   (0.50, 0.30, 0.15),
    "orange":  (0.90, 0.55, 0.15),
    "black":   (0.10, 0.10, 0.10),
    "beige":   (0.80, 0.75, 0.65),
    "cream":   (0.90, 0.87, 0.78),
}

_MATERIAL_COLORS: Dict[str, List[Tuple[float, float, float]]] = {
    "brick":    [(0.78, 0.66, 0.51), (0.71, 0.54, 0.36), (0.63, 0.32, 0.18)],
    "concrete": [(0.62, 0.62, 0.62), (0.69, 0.75, 0.77), (0.47, 0.57, 0.61)],
    "glass":    [(0.70, 0.90, 0.99), (0.51, 0.83, 0.98), (0.31, 0.76, 0.97)],
    "wood":     [(0.55, 0.43, 0.39), (0.47, 0.33, 0.27), (0.43, 0.30, 0.25)],
    "stone":    [(0.56, 0.64, 0.68), (0.47, 0.57, 0.61), (0.38, 0.49, 0.54)],
    "plaster":  [(0.96, 0.96, 0.96), (0.93, 0.93, 0.93), (0.88, 0.88, 0.88)],
}


def _hex_to_rgb(hex_color: str) -> Tuple[float, float, float]:
    h = hex_color.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return r, g, b


def get_building_color(
    data: Dict,
    lod_config: LODConfig,
) -> Tuple[float, float, float]:

    if not lod_config.use_colors:
        v = random.uniform(0.55, 0.80)
        return (v, v, v)

    colour_tag = str(data.get("building:colour", "")).strip().lower()

    if colour_tag in _NAMED_COLORS:
        return _NAMED_COLORS[colour_tag]

    if colour_tag.startswith("#") and len(colour_tag) in (4, 7):
        try:
            return _hex_to_rgb(colour_tag)
        except ValueError:
            pass

    material = str(data.get("building:material", "concrete")).lower()
    if material in _MATERIAL_COLORS:
        return random.choice(_MATERIAL_COLORS[material])

    v = random.uniform(0.55, 0.80)
    return (v, v, v)


def get_roof_height(data: Dict, lod_config: LODConfig) -> float:
    """Return the roof protrusion height above the main building body."""
    if not lod_config.use_roof_shapes:
        return 0.0
    try:
        raw = str(data.get("roof:height", "0")).lower().replace("m", "").strip()
        return max(0.0, float(raw))
    except (ValueError, TypeError):
        return 0.0


def get_roof_shape(data: Dict, lod_config: LODConfig) -> str:
    if not lod_config.use_roof_shapes:
        return "flat"
    return str(data.get("roof:shape", "flat")).lower()
