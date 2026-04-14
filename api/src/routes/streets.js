/**
 * streets.js — /api/streets route
 *
 * GET /api/streets?bbox=minLon,minLat,maxLon,maxLat
 *
 * Returns a GeoJSON FeatureCollection of street LineStrings within the
 * requested viewport.  Streets are only fully featured at LOD 4; at lower
 * LODs the client can call this endpoint to get simplified road data.
 */

"use strict";

const { Router } = require("express");
const { query }  = require("../db");
const { validateBbox } = require("../middleware/validate");

const router = Router();

// ── SQL ───────────────────────────────────────────────────────────────────────

const STREETS_SQL = `
SELECT json_build_object(
  'type',     'FeatureCollection',
  'features', COALESCE(json_agg(f.feature ORDER BY f.id), '[]'::json)
) AS geojson
FROM (
  SELECT
    s.id,
    json_build_object(
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
) f
`;

// ── Route ─────────────────────────────────────────────────────────────────────

/**
 * GET /api/streets
 * Query params:
 *   bbox (required) — minLon,minLat,maxLon,maxLat
 */
router.get("/", validateBbox, async (req, res) => {
  const { minLon, minLat, maxLon, maxLat } = req.bbox;
  const t0 = Date.now();

  try {
    const result  = await query(STREETS_SQL, [minLon, minLat, maxLon, maxLat]);
    const geojson = result.rows[0].geojson;
    const count   = geojson.features ? geojson.features.length : 0;

    res
      .status(200)
      .set("Content-Type", "application/geo+json")
      .set("X-Query-Time-Ms", String(Date.now() - t0))
      .set("X-Feature-Count", String(count))
      .json(geojson);

  } catch (err) {
    console.error("[streets] Query error:", err.message);
    res.status(500).json({
      error: "Database query failed",
      message: err.message,
    });
  }
});

module.exports = router;
