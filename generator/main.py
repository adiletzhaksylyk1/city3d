
from __future__ import annotations

import argparse

from config import GeneratorConfig, LODConfig
from city_generator import generate_synthetic_city
from building_processing import generate_footprints, filter_by_lod
from mesh_builder import extrude_buildings
from streets import create_street_mesh
from visualization import visualize_mesh, export_geojson
from shapely import affinity


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="3D Visual Map Generator")

    p.add_argument("--location",    default="Synthetic City", help="City name")
    p.add_argument("--radius",      type=float, default=500.0, help="City radius (m)")
    p.add_argument("--lod",         type=int,   default=2,     choices=[0,1,2,3,4],
                   help="Level of Detail (0=minimal … 4=maximum)")
    p.add_argument("--buildings",   type=int,   default=150,   help="Number of buildings")
    p.add_argument("--grid",        type=int,   default=12,    help="Street grid density")
    p.add_argument("--no-diagonals",action="store_true",       help="Disable diagonal streets")

    p.add_argument("--no-db",    action="store_true",       help="Skip writing city to PostGIS")
    p.add_argument("--no-viewer",   action="store_true",       help="Skip 3D viewer (headless)")
    p.add_argument("--screenshot",  default=None,              help="Save screenshot PNG")
    p.add_argument("--geojson",     default="../client/public/city.geojson",
                   help="Path for GeoJSON export")
    p.add_argument("--osm-place", default=None, help="OSM place name, e.g. 'Astana, Kazakhstan'")
    p.add_argument("--osm-file",    default=None,              help="Path to a real OpenStreetMap XML file (.osm) to parse")

    p.add_argument("--db-host",     default="localhost")
    p.add_argument("--db-port",     type=int, default=5432)
    p.add_argument("--db-name",     default="city3d")
    p.add_argument("--db-user",     default="postgres") 
    p.add_argument("--db-password", default="postgres")

    return p.parse_args()

def center_geometries_for_viewer(buildings, streets):
    from shapely import affinity

    bounds = buildings.total_bounds
    cx = (bounds[0] + bounds[2]) / 2
    cy = (bounds[1] + bounds[3]) / 2

    buildings_local = buildings.copy()
    buildings_local["geometry"] = buildings_local.geometry.apply(
        lambda g: affinity.translate(g, xoff=-cx, yoff=-cy)
    )

    streets_local = [
        affinity.translate(s, xoff=-cx, yoff=-cy)
        for s in streets
    ]

    return buildings_local, streets_local

def main() -> None:
    args = parse_args()

    cfg = GeneratorConfig(
        location      = args.location,
        radius        = args.radius,
        n_buildings   = args.buildings,
        n_grid_lines  = args.grid,
        add_diagonals = not args.no_diagonals,
        lod_level     = args.lod,
        db_host       = args.db_host,
        db_port       = args.db_port,
        db_name       = args.db_name,
        db_user       = args.db_user,
        db_password   = args.db_password,
    )

    print("=" * 60)
    print(f"  3D Visual Map Generator")
    print(f"  Location : {cfg.location}")
    print(f"  {cfg.lod_config}")
    print("=" * 60)

    if args.osm_place:
        from osm_parser import load_osm_place
        buildings, streets = load_osm_place(args.osm_place)
        print("=" * 60)
        print(f"  Real OSM City Loaded: {args.osm_place}")
        print("=" * 60)
    elif args.osm_file:
        from osm_parser import load_osm_city
        buildings, streets = load_osm_city(args.osm_file)
        print("=" * 60)
        print(f"  Real OSM City Loaded: {args.osm_file}")
        print("=" * 60)
    else:
        buildings, streets, _ = generate_synthetic_city(cfg)

    viewer_buildings = buildings
    viewer_streets = streets

    if args.osm_place or args.osm_file:
        viewer_buildings, viewer_streets = center_geometries_for_viewer(buildings, streets)

    footprints, data = generate_footprints(viewer_buildings)
    footprints, data = filter_by_lod(footprints, data, min_area=10.0)
    print(f"[main] Footprints ready: {len(footprints)}")

    mesh        = extrude_buildings(footprints, data, cfg.lod_config)
    street_mesh = create_street_mesh(viewer_streets, cfg.lod_config)
    print(f"[main] Mesh: {mesh.n_cells} cells, {mesh.n_points} points")

    # GeoJSON export (reproject to WGS84 for browser consumption)
    try:
        from db_writer import _reproject_buildings, _reproject_lines
        buildings_wgs = _reproject_buildings(buildings)
        streets_wgs   = _reproject_lines(streets)
        lod_configs = [LODConfig(i) for i in range(5)]
        export_geojson(buildings_wgs, streets_wgs, args.geojson, lod_configs)
    except Exception as e:
        print(f"[main] GeoJSON export failed: {e}")

    # Database write (unless --no-db)
    if not args.no_db:
        from db_writer import write_city_to_db
        write_city_to_db(cfg, buildings, streets, [LODConfig(i) for i in range(5)])

    if not args.no_viewer or args.screenshot:
        visualize_mesh(
            mesh        = mesh,
            location    = cfg.location,
            lod_config  = cfg.lod_config,
            street_mesh = street_mesh,
            screenshot  = args.screenshot,
            off_screen  = bool(args.screenshot),
        )

    print("[main] Done.")



if __name__ == "__main__":
    main()
