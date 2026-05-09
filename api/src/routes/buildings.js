/**
 * buildings.js — /api/buildings routes
 *
 * GET /api/buildings?bbox=minLon,minLat,maxLon,maxLat[&lod=0-4]
 * GET /api/buildings/extent
 * GET /api/buildings/count?bbox=...
 */

"use strict";

const { Router } = require("express");
const { query }  = require("../db");
const { validateBbox, validateLod } = require("../middleware/validate");

const router = Router();

// ── SQL ───────────────────────────────────────────────────────────────────────

/**
 * Build the buildings viewport query with optional LOD filter.
 * Eliminates the previous duplication of two nearly-identical SQL strings.
 *
 * @param {boolean} withLod  Whether to add a lod_level filter clause
 * @returns {string} Parameterised SQL
 */
function buildBuildingsSQL(withLod) {
  return `
SELECT json_build_object(
  'type',     'FeatureCollection',
  'features', COALESCE(json_agg(f.feature ORDER BY f.id), '[]'::json)
) AS geojson
FROM (
  SELECT
    b.id,
    json_build_object(
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
    ${withLod ? "AND b.lod_level = $5" : ""}
) f
`;
}

const BUILDINGS_SQL     = buildBuildingsSQL(false);
const BUILDINGS_LOD_SQL = buildBuildingsSQL(true);

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * GET /api/buildings
 * Returns GeoJSON FeatureCollection of buildings within the viewport.
 */
router.get("/", validateBbox, validateLod, async (req, res) => {
  const { minLon, minLat, maxLon, maxLat } = req.bbox;
  const t0 = Date.now();

  try {
    const params = [minLon, minLat, maxLon, maxLat];
    const sql = req.lod !== null
      ? (params.push(req.lod), BUILDINGS_LOD_SQL)
      : BUILDINGS_SQL;

    const result  = await query(sql, params);
    const geojson = result.rows[0].geojson;
    const count   = geojson.features ? geojson.features.length : 0;

    res
      .status(200)
      .set("Content-Type", "application/geo+json")
      .set("X-Query-Time-Ms", String(Date.now() - t0))
      .set("X-Feature-Count", String(count))
      .json(geojson);

  } catch (err) {
    console.error("[buildings] Query error:", err.message);
    res.status(500).json({
      error: "Database query failed",
      message: err.message,
    });
  }
});

/**
 * GET /api/buildings/extent
 * Returns the bounding box + centre of all buildings in the database.
 * Used by the Three.js client to set the initial camera position.
 */
router.get("/extent", async (_req, res) => {
  const sql = `
    SELECT
      ST_XMin(e) AS min_lon,
      ST_YMin(e) AS min_lat,
      ST_XMax(e) AS max_lon,
      ST_YMax(e) AS max_lat,
      ST_X(ST_Centroid(e)) AS center_lon,
      ST_Y(ST_Centroid(e)) AS center_lat
    FROM (SELECT ST_Extent(geom) AS e FROM buildings) sub
  `;

  try {
    const result = await query(sql);
    const row = result.rows[0];

    if (!row.min_lon) {
      return res.status(404).json({ error: "No buildings in database" });
    }

    res.json({
      bbox:   [row.min_lon, row.min_lat, row.max_lon, row.max_lat],
      center: [row.center_lon, row.center_lat],
    });
  } catch (err) {
    console.error("[buildings/extent] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/buildings/count
 * Quick count of buildings in a viewport (for LOD switching decisions).
 */
router.get("/count", validateBbox, async (req, res) => {
  const { minLon, minLat, maxLon, maxLat } = req.bbox;
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM buildings
    WHERE geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)
  `;

  try {
    const result = await query(sql, [minLon, minLat, maxLon, maxLat]);
    res.json({ count: result.rows[0].count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
