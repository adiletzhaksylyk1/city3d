/**
 * geo.js — Coordinate transformation utilities.
 *
 * The generator outputs geometry in EPSG:2154 (metres), but the database
 * stores and the API returns everything in WGS84 (lon/lat degrees).
 *
 * Three.js uses a right-handed Y-up coordinate system:
 *   X = East, Y = Up (height), Z = South
 *
 * GIS convention: X = East (lon), Y = North (lat), Z = Up
 *
 * We apply a local equirectangular projection centred on the city's
 * centroid, accurate to ~0.1% at city scale (Section 7.4).
 */

/** City centroid in WGS84 degrees — updated after first API call. */
let _originLon = 0;
let _originLat = 0;
let _scale     = 1;   // metres per degree at this latitude

const DEG_TO_RAD = Math.PI / 180;
const EARTH_RADIUS = 6_378_137; // metres (WGS84 semi-major axis)

/**
 * Set the projection origin from the city extent centroid.
 * Call this once after fetching /api/buildings/extent.
 *
 * @param {number} lon  Centre longitude (degrees)
 * @param {number} lat  Centre latitude  (degrees)
 */
export function setOrigin(lon, lat) {
  _originLon = lon;
  _originLat = lat;
  // Metres per degree of longitude at this latitude
  _scale = EARTH_RADIUS * Math.cos(lat * DEG_TO_RAD) * DEG_TO_RAD;
}

/**
 * Convert WGS84 (lon, lat) to Three.js scene coordinates (x, z).
 * Y (height) is handled separately.
 *
 * @param {number} lon
 * @param {number} lat
 * @returns {{ x: number, z: number }}
 */
export function lonLatToScene(lon, lat) {
  const x =  (lon - _originLon) * _scale;
  const z = -(lat - _originLat) * EARTH_RADIUS * DEG_TO_RAD;  // north → negative Z
  return { x, z };
}

/**
 * Convert a GeoJSON Polygon ring (array of [lon, lat] pairs) to a
 * flat array of Three.js {x, z} objects.
 *
 * @param {Array<[number, number]>} ring
 * @returns {Array<{x: number, z: number}>}
 */
export function ringToScene(ring) {
  return ring.map(([lon, lat]) => lonLatToScene(lon, lat));
}

/**
 * Compute a bounding box in WGS84 from the current Three.js camera position.
 * Used for viewport-bounded API queries.
 *
 * @param {THREE.Camera} camera
 * @param {number} halfSpanDeg  Half-width of bbox in degrees (default 0.05)
 * @returns {{ minLon, minLat, maxLon, maxLat }}
 */
export function cameraToBbox(camera, halfSpanDeg = 0.05) {
  const { x, z } = camera.position;

  // Convert scene x,z back to lon/lat
  const lon = _originLon + x / _scale;
  const lat = _originLat - z / (EARTH_RADIUS * DEG_TO_RAD);

  return {
    minLon: lon - halfSpanDeg,
    minLat: lat - halfSpanDeg,
    maxLon: lon + halfSpanDeg,
    maxLat: lat + halfSpanDeg,
  };
}

/**
 * Format a bbox object as the API query string value.
 * @param {{ minLon, minLat, maxLon, maxLat }} bbox
 * @returns {string}
 */
export function bboxToString({ minLon, minLat, maxLon, maxLat }) {
  return [minLon, minLat, maxLon, maxLat]
    .map((v) => v.toFixed(6))
    .join(",");
}
