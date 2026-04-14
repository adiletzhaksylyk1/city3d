/**
 * renderer.js — GeoJSON → Three.js geometry (Section 5.5.2 / 5.5.3).
 *
 * renderBuildings():
 *   • Parses GeoJSON Polygon features
 *   • Converts lon/lat rings → Three.js Shape
 *   • Extrudes using THREE.ExtrudeGeometry (height from properties)
 *   • Batches by material+colour → merged BufferGeometry per batch
 *   • Returns a THREE.Group
 *
 * renderStreets():
 *   • Parses GeoJSON LineString features
 *   • Maps street_type → colour
 *   • Returns a THREE.Group of THREE.Line objects
 */

import * as THREE from "three";
import { BufferGeometryUtils } from "three/addons/utils/BufferGeometryUtils.js";
import { lonLatToScene } from "./geo.js";

// ── Colour helpers ────────────────────────────────────────────────────────────

/** Parse a hex color string (#RRGGBB) or named CSS color to THREE.Color */
function parseColor(colorStr, fallback = "#9E9E9E") {
  if (!colorStr || typeof colorStr !== "string") return new THREE.Color(fallback);
  try {
    return new THREE.Color(colorStr);
  } catch {
    return new THREE.Color(fallback);
  }
}

/** Material-based fallback colours (match geometry.py _MATERIAL_COLORS) */
const MATERIAL_COLORS = {
  brick:    "#C8A882",
  concrete: "#9E9E9E",
  glass:    "#B3E5FC",
  wood:     "#8D6E63",
  stone:    "#90A4AE",
  plaster:  "#F5F5F5",
};

function resolveColor(props) {
  if (props.color && props.color !== "#CCCCCC") {
    return parseColor(props.color);
  }
  if (props.material && MATERIAL_COLORS[props.material]) {
    return new THREE.Color(MATERIAL_COLORS[props.material]);
  }
  return new THREE.Color("#9E9E9E");
}

// ── Material cache ────────────────────────────────────────────────────────────

const _matCache = new Map();

function getMaterial(color, type = "building") {
  const key = `${type}:${color.getHexString()}`;
  if (_matCache.has(key)) return _matCache.get(key);

  let mat;
  if (type === "building") {
    mat = new THREE.MeshLambertMaterial({
      color,
      side: THREE.FrontSide,
    });
  } else {
    // Glass-like treatment for tall buildings
    mat = new THREE.MeshLambertMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    });
  }

  _matCache.set(key, mat);
  return mat;
}

export function disposeMaterials() {
  for (const mat of _matCache.values()) mat.dispose();
  _matCache.clear();
}

// ── Building extrusion (Section 5.5.2) ───────────────────────────────────────

/**
 * Convert a GeoJSON Polygon exterior ring to a THREE.Shape.
 * @param {Array<[number, number]>} ring   [[lon, lat], ...]
 * @returns {THREE.Shape}
 */
function ringToShape(ring) {
  const shape = new THREE.Shape();
  for (let i = 0; i < ring.length; i++) {
    const [lon, lat] = ring[i];
    const { x, z } = lonLatToScene(lon, lat);
    if (i === 0) shape.moveTo(x, z);
    else         shape.lineTo(x, z);
  }
  shape.autoClose = true;
  return shape;
}

/**
 * Resolve building height from GeoJSON feature properties.
 * @param {object} props
 * @returns {number} height in scene units (metres)
 */
function resolveHeight(props) {
  // Explicit height
  if (props.height && props.height > 0) return props.height;
  // Infer from floors
  if (props.floors && props.floors > 0) return props.floors * 3.0;
  // building:levels (OSM tag)
  const lv = props["building:levels"];
  if (lv && lv > 0) return parseFloat(lv) * 3.0;
  return 12.0;   // default
}

const EXTRUDE_SETTINGS_BASE = {
  bevelEnabled: false,
  steps: 1,
};

/**
 * Render all building features into a Three.js Group.
 *
 * Geometry is batched by (material × colour) key then merged with
 * BufferGeometryUtils.mergeGeometries() to minimise draw calls
 * (Section 5.5.2, Listing 5.2).
 *
 * @param {object}       featureCollection  GeoJSON FeatureCollection
 * @param {THREE.Scene}  scene
 * @returns {{ group: THREE.Group, count: number, centres: THREE.Vector3[] }}
 */
export function renderBuildings(featureCollection, scene) {
  // Remove old buildings group if present
  const old = scene.getObjectByName("buildings");
  if (old) {
    old.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
    scene.remove(old);
  }

  const group = new THREE.Group();
  group.name  = "buildings";

  /** @type {Map<string, { geos: THREE.BufferGeometry[], color: THREE.Color, isGlass: boolean }>} */
  const batches = new Map();
  const centres = [];

  let count = 0;

  for (const feature of featureCollection.features || []) {
    const geom  = feature.geometry;
    const props = feature.properties || {};

    if (!geom || geom.type !== "Polygon") continue;

    const ring   = geom.coordinates[0];
    const height = resolveHeight(props);
    const color  = resolveColor(props);
    const isGlass = (props.material === "glass" && height > 30);

    // Build a Shape from the coordinate ring
    const shape = ringToShape(ring);

    // Extrude: depth = height, rotate X so extrusion goes up (Y axis)
    const extrudeSettings = { ...EXTRUDE_SETTINGS_BASE, depth: height };
    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);

    // Three.js extrudes along Z; rotate so buildings go up the Y axis
    geo.rotateX(-Math.PI / 2);

    // Batch key
    const key = `${isGlass ? "glass" : "solid"}:${color.getHexString()}`;
    if (!batches.has(key)) {
      batches.set(key, { geos: [], color, isGlass });
    }
    batches.get(key).geos.push(geo);

    // Record building centre for LOD / raycasting
    geo.computeBoundingBox();
    const centre = new THREE.Vector3();
    geo.boundingBox.getCenter(centre);
    centres.push(centre);

    count++;
  }

  // Merge each batch into a single mesh
  for (const [, { geos, color, isGlass }] of batches) {
    if (!geos.length) continue;

    const merged = geos.length > 1
      ? BufferGeometryUtils.mergeGeometries(geos, false)
      : geos[0];

    const mat  = getMaterial(color, isGlass ? "glass" : "building");
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.name = "building-batch";

    // Store feature properties for raycasting info panel
    mesh.userData.features = featureCollection.features;

    group.add(mesh);

    // Dispose individual geos after merge
    if (geos.length > 1) geos.forEach((g) => g.dispose());
  }

  scene.add(group);
  console.log(`[renderer] Buildings: ${count} features → ${batches.size} draw calls`);

  return { group, count, centres };
}

// ── Street rendering (Section 5.5.3) ─────────────────────────────────────────

/** Street type → THREE.Color (matches thesis Table / Listing 5.3) */
const STREET_COLORS = {
  highway:     new THREE.Color(0xFFCC00),   // amber
  arterial:    new THREE.Color(0x666666),   // dark grey
  residential: new THREE.Color(0xAAAAAA),   // light grey
};

/**
 * Render street LineString features into a Three.js Group.
 *
 * @param {object}      featureCollection  GeoJSON FeatureCollection
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, count: number }}
 */
export function renderStreets(featureCollection, scene) {
  const old = scene.getObjectByName("streets");
  if (old) {
    old.traverse((o) => { if (o.isLine) o.geometry.dispose(); });
    scene.remove(old);
  }

  const group = new THREE.Group();
  group.name  = "streets";
  let count   = 0;

  for (const feature of featureCollection.features || []) {
    const geom  = feature.geometry;
    const props = feature.properties || {};

    if (!geom || geom.type !== "LineString") continue;

    const streetType = props.street_type || "residential";
    const color = STREET_COLORS[streetType] ?? STREET_COLORS.residential;

    const points = geom.coordinates.map(([lon, lat]) => {
      const { x, z } = lonLatToScene(lon, lat);
      return new THREE.Vector3(x, 0.3, z);   // slightly above ground
    });

    if (points.length < 2) continue;

    const geo  = new THREE.BufferGeometry().setFromPoints(points);
    const mat  = new THREE.LineBasicMaterial({ color, linewidth: 1 });
    const line = new THREE.Line(geo, mat);
    line.name  = "street";

    group.add(line);
    count++;
  }

  scene.add(group);
  console.log(`[renderer] Streets: ${count} segments`);

  return { group, count };
}

// ── Raycasting helper ─────────────────────────────────────────────────────────

/**
 * Find the GeoJSON feature closest to a raycaster intersection.
 * Returns feature properties or null.
 *
 * @param {THREE.Raycaster} raycaster
 * @param {THREE.Scene}     scene
 * @returns {object|null}
 */
export function pickBuilding(raycaster, scene) {
  const buildingGroup = scene.getObjectByName("buildings");
  if (!buildingGroup) return null;

  const meshes = [];
  buildingGroup.traverse((o) => { if (o.isMesh) meshes.push(o); });

  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;

  // The hit mesh stores feature data in userData
  const hit = hits[0];
  const features = hit.object.userData.features;
  if (!features) return null;

  // Find the closest feature centre to the intersection point
  let best = null, bestDist = Infinity;
  for (const f of features) {
    if (!f.geometry || f.geometry.type !== "Polygon") continue;
    const [lon, lat] = f.geometry.coordinates[0][0];
    const { x, z }  = lonLatToScene(lon, lat);
    const d = hit.point.distanceTo(new THREE.Vector3(x, hit.point.y, z));
    if (d < bestDist) { bestDist = d; best = f; }
  }

  return best ? best.properties : null;
}
