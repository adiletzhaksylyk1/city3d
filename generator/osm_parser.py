import xml.etree.ElementTree as ET
from typing import Tuple, List, Dict
import geopandas as gpd
from shapely.geometry import Polygon, LineString

def load_osm_city(osm_file: str) -> Tuple[gpd.GeoDataFrame, List[LineString]]:
    print(f"[osm_parser] Parsing OSM file: {osm_file}")
    
    try:
        tree = ET.parse(osm_file)
        root = tree.getroot()
    except Exception as e:
        print(f"[osm_parser] Failed to read OSM XML: {e}")
        return gpd.GeoDataFrame(), []

    nodes = {}
    # First pass: collect all node coordinates
    for node in root.findall('node'):
        nid = node.get('id')
        try:
            lon = float(node.get('lon'))
            lat = float(node.get('lat'))
            nodes[nid] = (lon, lat)
        except (ValueError, TypeError):
            continue

    polygons = []
    attrs = []
    streets = []

    # Second pass: reconstruct ways (buildings & streets)
    for way in root.findall('way'):
        tags = {}
        for tag in way.findall('tag'):
            tags[tag.get('k')] = tag.get('v')
        
        nd_refs = [nd.get('ref') for nd in way.findall('nd')]
        if len(nd_refs) < 2:
            continue

        coords = [nodes[ref] for ref in nd_refs if ref in nodes]
        if len(coords) < 2:
            continue

        # Check if it's a building
        if 'building' in tags:
            # Need at least 3 points for a valid linear ring
            if len(coords) >= 3:
                # Close the polygon if it's not closed
                if coords[0] != coords[-1]:
                    coords.append(coords[0])
                try:
                    poly = Polygon(coords)
                    if poly.is_valid and not poly.is_empty:
                        polygons.append(poly)
                        
                        # Extract building tags directly into raw attributes
                        data = {}
                        if 'building:levels' in tags:
                            data['building:levels'] = tags['building:levels']
                        if 'height' in tags:
                            data['height'] = tags['height']
                        if 'building:material' in tags:
                            data['building:material'] = tags['building:material']
                        if 'building:colour' in tags:
                            data['building:colour'] = tags['building:colour']
                        if 'roof:shape' in tags:
                            data['roof:shape'] = tags['roof:shape']
                        if 'roof:height' in tags:
                            data['roof:height'] = tags['roof:height']
                        
                        building_type = tags.get('building', 'yes')
                        data['building:type'] = building_type if building_type != 'yes' else 'residential'
                        
                        attrs.append(data)
                except Exception:
                    pass
        
        # Check if it's a street
        elif 'highway' in tags:
            try:
                line = LineString(coords)
                if line.is_valid and not line.is_empty:
                    streets.append(line)
            except Exception:
                pass

    print(f"[osm_parser] Successfully parsed {len(polygons)} buildings and {len(streets)} streets.")

    # Create GeoDataFrame in WGS84 (EPSG:4326)
    if not polygons:
        buildings = gpd.GeoDataFrame(columns=['geometry'], geometry=[], crs="EPSG:4326")
    else:
        buildings = gpd.GeoDataFrame(attrs, geometry=polygons, crs="EPSG:4326")
    
    # Project to the generator's internal CRS (EPSG:3857) so the pipeline works seamlessly
    buildings = buildings.to_crs("EPSG:3857")
    
    if streets:
        streets_gdf = gpd.GeoDataFrame(geometry=streets, crs="EPSG:4326")
        streets_gdf = streets_gdf.to_crs("EPSG:3857")
        streets = list(streets_gdf.geometry)
    else:
        streets = []

    return buildings, streets

def load_osm_place(place: str) -> Tuple[gpd.GeoDataFrame, List[LineString]]:
    print(f"[osm_parser] Loading OSM place: {place}")

    try:
        import osmnx as ox
        ox.settings.timeout = 180
        ox.settings.use_cache = True
        ox.settings.log_console = True
    except ImportError:
        print("[osm_parser] osmnx is not installed. Run: pip install osmnx")
        return gpd.GeoDataFrame(), []

    try:
        tags = {"building": True}
        buildings = ox.features_from_place(place, tags)

        if buildings.empty:
            print("[osm_parser] No buildings found.")
            buildings_gdf = gpd.GeoDataFrame(columns=["geometry"], geometry=[], crs="EPSG:4326")
        else:
            buildings = buildings.reset_index()
            buildings = buildings[buildings.geometry.type.isin(["Polygon", "MultiPolygon"])]

            attrs = []
            polygons = []

            for _, row in buildings.iterrows():
                geom = row.geometry
                if geom is None or geom.is_empty:
                    continue

                data = {}

                for key in [
                    "building",
                    "building:levels",
                    "height",
                    "building:material",
                    "building:colour",
                    "roof:shape",
                    "roof:height",
                ]:
                    if key in row and row[key] is not None:
                        data[key] = row[key]

                building_type = data.get("building", "yes")
                data["building:type"] = building_type if building_type != "yes" else "residential"

                polygons.append(geom)
                attrs.append(data)

            buildings_gdf = gpd.GeoDataFrame(attrs, geometry=polygons, crs="EPSG:4326")

        print(f"[osm_parser] Loaded buildings: {len(buildings_gdf)}")

        graph = ox.graph_from_place(place, network_type="drive")
        _, edges = ox.graph_to_gdfs(graph)

        streets_gdf = edges.reset_index()
        streets_gdf = streets_gdf[streets_gdf.geometry.notnull()]
        streets_gdf = streets_gdf[streets_gdf.geometry.type.isin(["LineString", "MultiLineString"])]

        streets = []

        for geom in streets_gdf.geometry:
            if geom.geom_type == "LineString":
                streets.append(geom)
            elif geom.geom_type == "MultiLineString":
                streets.extend(list(geom.geoms))

        print(f"[osm_parser] Loaded streets: {len(streets)}")

        buildings_gdf = buildings_gdf.to_crs("EPSG:3857")

        if streets:
            streets_gdf = gpd.GeoDataFrame(geometry=streets, crs="EPSG:4326")
            streets_gdf = streets_gdf.to_crs("EPSG:3857")
            streets = list(streets_gdf.geometry)

        return buildings_gdf, streets

    except Exception as e:
        print(f"[osm_parser] Failed to load OSM place: {e}")
        return gpd.GeoDataFrame(), []
