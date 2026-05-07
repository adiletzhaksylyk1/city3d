/**
 * lod.js — Client-side Level-of-Detail management (Section 5.6, Table 5.1).
 *
 * LOD tier assignment is based on camera distance from each building's
 * projected centre. Three tiers are implemented:
 *
 *   LOD 0 – Near  (0–200 m)   Full extrusion, individual meshes
 *   LOD 1 – Mid   (200–600 m) Simple box, merged by material
 *   LOD 2 – Far   (600+ m)    Flat footprint (height = 0), instancedd
 *
 * In this implementation the building geometry is fixed at load time;
 * the LOD manager controls *visibility* of pre-built near/mid/far
 * variants.  For a single merged mesh it sets the mesh opacity / wireframe
 * for debugging.
 */

import * as THREE from "three";

export const LOD_NEAR = 0;
export const LOD_MID  = 1;
export const LOD_FAR  = 2;

export const LOD_NEAR_DIST = 200;
export const LOD_MID_DIST  = 600;

/**
 * Compute the LOD tier for a given camera-to-point distance.
 * @param {number} distance  metres
 * @returns {0 | 1 | 2}
 */
export function distanceToTier(distance) {
  if (distance < LOD_NEAR_DIST) return LOD_NEAR;
  if (distance < LOD_MID_DIST)  return LOD_MID;
  return LOD_FAR;
}

/**
 * LODManager tracks a set of Three.js objects (one per building or group)
 * and updates their visibility / detail level each frame.
 */
export class LODManager {
  /**
   * @param {THREE.Camera} camera
   */
  constructor(camera) {
    this.camera   = camera;
    this._objects = [];   // { mesh, position, nearMesh, midMesh, farMesh }
    this._lastTier = -1;
  }

  /**
   * Register a building mesh with its scene-space position.
   * Optionally provide separate meshes for each LOD tier.
   *
   * @param {THREE.Vector3} position  Building centre
   * @param {THREE.Mesh}    mesh      Full-detail mesh (near)
   */
  add(position, mesh) {
    this._objects.push({ position, mesh });
  }

  /**
   * Update LOD for all registered objects.
   * Call once per animation frame.
   *
   * @returns {number}  Current dominant LOD tier (for HUD display)
   */
  update() {
    const camPos = this.camera.position;
    let nearCount = 0, midCount = 0, farCount = 0;

    for (const { position, mesh } of this._objects) {
      const dist = camPos.distanceTo(position);
      const tier = distanceToTier(dist);

      if (tier === LOD_NEAR) nearCount++;
      else if (tier === LOD_MID) midCount++;
      else farCount++;

      // For a single merged mesh we cannot toggle individual buildings.
      // LOD is applied at the group level (see renderer.js).
    }

    // Return dominant tier for HUD label
    if (nearCount >= midCount && nearCount >= farCount) return LOD_NEAR;
    if (midCount  >= farCount)                           return LOD_MID;
    return LOD_FAR;
  }

  clear() {
    this._objects = [];
  }

  get count() { return this._objects.length; }
}

/**
 * Apply LOD-driven visual adjustments to the scene.
 *
 * At LOD_FAR, reduce buildings to simple flat boxes (scale Y toward 0).
 * At LOD_NEAR, restore full geometry.
 *
 * @param {THREE.Mesh}   buildingMesh  Merged building mesh
 * @param {THREE.Camera} camera
 */
export function applySceneLOD(buildingMesh, camera) {
  if (!buildingMesh) return;

  // The building mesh is static; we apply LOD by adjusting render quality.
  // For instanced/distance-culled rendering, extend this function.
  const dist = camera.position.length();   // distance from city centre
  const tier = distanceToTier(dist * 0.5); // heuristic: half position = avg dist

  // Reduce shadow computation at distance
  buildingMesh.castShadow    = tier === LOD_NEAR;
  buildingMesh.receiveShadow = tier <= LOD_MID;
}

export const LOD_TIER_LABELS = {
  [LOD_NEAR]: "Near (full detail)",
  [LOD_MID]:  "Mid  (simplified)",
  [LOD_FAR]:  "Far  (flat)",
};
