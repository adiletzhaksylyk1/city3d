-- =============================================================================
-- queries.sql — Viewport-bounded spatial queries for the Node.js API
-- (Section 5.3.2)
--
-- These are the queries executed by the API server.
-- $1 = minLon, $2 = minLat, $3 = maxLon, $4 = maxLat
-- $5 = lod_level (optional filter)
-- =============================================================================


-- =============================================================================
-- Q1: Buildings within viewport bounding box
--
-- Returns a GeoJSON FeatureCollection built entirely in SQL via
-- ST_AsGeoJSON + json_build_object + json_agg (Section 5.3.2)
-- This means the Node.js API can forward the result directly to the client.
-- =============================================================================
SELECT json_build_object(
    'type',     'FeatureCollection',
    'features', COALESCE(json_agg(f.feature), '[]'::json)
) AS geojson
FROM (
    SELECT json_build_object(
        'type',       'Feature',
        'geometry',   ST_AsGeoJSON(b.geom)::json,
        'properties', json_build_object(
            'id',            b.id,
            'height',        b.height,
            'floors',        b.floors,
            'material',      b.material,
            'color',         b.color,
            'building_type', b.building_type,
            'roof_shape',    b.roof_shape,
            'lod_level',     b.lod_level,
            'name',          b.name
        )
    ) AS feature
    FROM buildings b
    WHERE b.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND ST_Intersects(b.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
      -- Optional LOD filter (omit clause when not filtering by LOD)
      -- AND b.lod_level = $5
    ORDER BY b.id
) f;


-- =============================================================================
-- Q2: Streets within viewport bounding box
-- =============================================================================
SELECT json_build_object(
    'type',     'FeatureCollection',
    'features', COALESCE(json_agg(f.feature), '[]'::json)
) AS geojson
FROM (
    SELECT json_build_object(
        'type',       'Feature',
        'geometry',   ST_AsGeoJSON(s.geom)::json,
        'properties', json_build_object(
            'id',          s.id,
            'name',        s.name,
            'street_type', s.street_type,
            'width',       s.width,
            'lanes',       s.lanes
        )
    ) AS feature
    FROM streets s
    WHERE s.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
      AND ST_Intersects(s.geom, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    ORDER BY s.id
) f;


-- =============================================================================
-- Q3: Building count in viewport (for LOD switching decisions)
-- =============================================================================
SELECT COUNT(*) AS building_count
FROM buildings
WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326);


-- =============================================================================
-- Q4: Full city extent (for initial camera positioning)
-- =============================================================================
SELECT
    ST_XMin(extent) AS min_lon,
    ST_YMin(extent) AS min_lat,
    ST_XMax(extent) AS max_lon,
    ST_YMax(extent) AS max_lat,
    ST_X(ST_Centroid(extent)) AS center_lon,
    ST_Y(ST_Centroid(extent)) AS center_lat
FROM (
    SELECT ST_Extent(geom) AS extent FROM buildings
) sub;
