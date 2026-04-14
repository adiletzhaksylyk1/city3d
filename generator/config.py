import os
from dataclasses import dataclass, field
from typing import Optional


class LODConfig:
    """Level-of-Detail configuration.

    LOD 0 — Minimal:   Flat footprints (height = 0.1 m)
    LOD 1 — Basic:     Simple height extrusion, random height fallback
    LOD 2 — Standard:  building:levels support
    LOD 3 — Detailed:  Roof shapes, colours, materials
    LOD 4 — Maximum:   All data including streets
    """

    LOD_LEVELS = {
        0: "Minimal - Flat footprints",
        1: "Basic - Simple extrusion",
        2: "Standard - Building levels",
        3: "Detailed - Parts, roofs, colors",
        4: "Maximum - All data incl. streets",
    }

    def __init__(self, lod_level: int = 2):
        if lod_level not in self.LOD_LEVELS:
            raise ValueError(
                f"LOD level must be one of {list(self.LOD_LEVELS.keys())}, got {lod_level}"
            )
        self.lod_level = lod_level

    @property
    def use_height(self) -> bool:
        return self.lod_level >= 1

    @property
    def use_levels(self) -> bool:
        return self.lod_level >= 2

    @property
    def use_parts(self) -> bool:
        return self.lod_level >= 3

    @property
    def use_roof_shapes(self) -> bool:
        return self.lod_level >= 3

    @property
    def use_colors(self) -> bool:
        return self.lod_level >= 3

    @property
    def use_materials(self) -> bool:
        return self.lod_level >= 3

    @property
    def use_streets(self) -> bool:
        return self.lod_level >= 4

    @property
    def use_underground(self) -> bool:
        return self.lod_level >= 4

    @property
    def use_min_level(self) -> bool:
        return self.lod_level >= 4

    def __repr__(self) -> str:
        return f"LODConfig(lod_level={self.lod_level})"

    def __str__(self) -> str:
        return f"LOD {self.lod_level}: {self.LOD_LEVELS[self.lod_level]}"

    def to_dict(self) -> dict:
        return {
            "lod_level": self.lod_level,
            "description": self.LOD_LEVELS[self.lod_level],
            "use_height": self.use_height,
            "use_levels": self.use_levels,
            "use_roof_shapes": self.use_roof_shapes,
            "use_colors": self.use_colors,
            "use_materials": self.use_materials,
            "use_streets": self.use_streets,
        }


@dataclass
class GeneratorConfig:
    """Top-level configuration for a city generation run."""

    # City geometry
    location: str = "Synthetic City"
    radius: float = 500.0
    n_buildings: int = 150
    n_grid_lines: int = 12
    add_diagonals: bool = True

    # LOD
    lod_level: int = 2

    height_mu: float = 15.0
    height_sigma: float = 0.6

    db_host: str = field(default_factory=lambda: os.getenv("DB_HOST", "localhost"))
    db_port: int = field(default_factory=lambda: int(os.getenv("DB_PORT", "5432")))
    db_name: str = field(default_factory=lambda: os.getenv("DB_NAME", "city3d"))
    db_user: str = field(default_factory=lambda: os.getenv("DB_USER", "postgres"))
    db_password: str = field(default_factory=lambda: os.getenv("DB_PASSWORD", "postgres"))

    export_geojson: bool = True
    geojson_path: str = "output/city.geojson"
    export_mesh: bool = True

    @property
    def lod_config(self) -> LODConfig:
        return LODConfig(self.lod_level)

    @property
    def db_url(self) -> str:
        return (
            f"postgresql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def dsn(self) -> str:
        return (
            f"host={self.db_host} port={self.db_port} "
            f"dbname={self.db_name} user={self.db_user} "
            f"password={self.db_password}"
        )
