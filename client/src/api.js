/**
 * api.js — Data fetching layer for the Three.js client.
 *
 * Supports two source modes:
 *   "geojson" — load from a static local GeoJSON file (dev/offline mode)
 *   "api"     — fetch from the live Node.js REST API
 */

const API_BASE = "/api";
const GEOJSON_PATH = "/city.geojson";   // served from client/public/

let _sourceMode = "geojson";            // default: use local file
let _lodFilter = 2;                 // null = no filter

/** Set data source: "geojson" | "api" */
export function setSourceMode(mode) {
  if (mode !== "geojson" && mode !== "api") throw new Error(`Unknown mode: ${mode}`);
  _sourceMode = mode;
}

export function getSourceMode() { return _sourceMode; }

/** Set LOD filter (null = all LOD levels) */
export function setLodFilter(lod) {
  _lodFilter = lod === "" || lod === null ? null : parseInt(lod, 10);
}

// ── GeoJSON file mode ──────────────────────────────────────────────────────

let _cachedGeojson = null;

async function loadGeojsonFile() {
  if (_cachedGeojson) return _cachedGeojson;

  const res = await fetch(GEOJSON_PATH);
  if (!res.ok) throw new Error(`Failed to load ${GEOJSON_PATH}: ${res.status}`);

  _cachedGeojson = await res.json();
  return _cachedGeojson;
}

function filterFeatures(geojson, type) {
  const features = (geojson.features || []).filter(
    (f) => f.properties?.type === type
  );

  // Apply LOD filter if set
  const filtered = _lodFilter !== null
    ? features.filter((f) => f.properties?.lod_level === _lodFilter)
    : features;

  return { type: "FeatureCollection", features: filtered };
}

// ── Live API mode ──────────────────────────────────────────────────────────

async function fetchFromApi(endpoint, bbox) {
  const params = new URLSearchParams({ bbox });
  if (_lodFilter !== null) params.set("lod", String(_lodFilter));

  const url = `${API_BASE}/${endpoint}?${params}`;
  const res = await fetch(url);

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(`API error ${res.status}: ${err.message || err.error}`);
  }

  return res.json();
}

export async function fetchExtent() {
  if (_sourceMode === "geojson") {
    // Compute extent from the GeoJSON file
    const geojson = await loadGeojsonFile();
    const coords = [];

    for (const f of geojson.features || []) {
      const geom = f.geometry;
      if (geom?.type === "Polygon") {
        for (const [lon, lat] of geom.coordinates[0]) {
          coords.push([lon, lat]);
        }
      } else if (geom?.type === "LineString") {
        for (const [lon, lat] of geom.coordinates) {
          coords.push([lon, lat]);
        }
      }
    }

    if (!coords.length) return null;

    const lons = coords.map((c) => c[0]);
    const lats = coords.map((c) => c[1]);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);

    return {
      bbox: [minLon, minLat, maxLon, maxLat],
      center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
    };
  }

  // Live API mode
  const res = await fetch(`${API_BASE}/buildings/extent`);
  if (!res.ok) throw new Error("Failed to fetch city extent");
  return res.json();
}

export async function fetchBuildings(bbox) {
  if (_sourceMode === "geojson") {
    const geojson = await loadGeojsonFile();
    return filterFeatures(geojson, "building");
  }
  return fetchFromApi("buildings", bbox);
}

export async function fetchStreets(bbox) {
  if (_sourceMode === "geojson") {
    const geojson = await loadGeojsonFile();
    return filterFeatures(geojson, "street");
  }
  return fetchFromApi("streets", bbox);
}
