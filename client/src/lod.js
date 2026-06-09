/**
 * lod.js — Client-side Level-of-Detail management.
 *
 * LOD tier assignment is based on camera distance from the orbit-controls target.
 * Two render geometries are used:
 *
 *   LOD 2 – Near/Mid  (0–750 units)   Full ExtrudeGeometry, shadows based on tier
 *   LOD 0 – Far       (750+ units)    Flat ShapeGeometry footprint, no shadows
 */

import * as THREE from "three";

export const LOD_NEAR = 0;
export const LOD_MID  = 1;
export const LOD_FAR  = 2;

export const LOD_NEAR_DIST = 350;   // scene units — full detail + shadows
export const LOD_MID_DIST  = 750;   // scene units — full detail, no shadows

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
 * Compute the current LOD tier from camera distance to a scene target.
 *
 * @param {THREE.Camera} camera
 * @param {THREE.Vector3} target  The scene centre / orbit controls target
 * @returns {0 | 1 | 2}
 */
export function computeSceneTier(camera, target) {
  const dist = camera.position.distanceTo(target);
  return distanceToTier(dist);
}

/**
 * Apply LOD-driven visual adjustments to the scene.
 *
 * At LOD_FAR, disable shadow casting for performance.
 * At LOD_NEAR, enable full shadows.
 *
 * @param {THREE.Mesh}    buildingMesh  Merged building mesh (or Group)
 * @param {THREE.Camera}  camera
 * @param {THREE.Vector3} target  Orbit controls target (city centre)
 */
export function applySceneLOD(buildingMesh, camera, target) {
  if (!buildingMesh) return;

  const tier = computeSceneTier(camera, target);

  // Map camera-distance tier → render LOD level.
  // LOD 2 = full ExtrudeGeometry (near + mid); LOD 0 = flat footprint (far).
  let targetDataLod;
  if (tier === LOD_FAR) targetDataLod = 0;   // flat footprints
  else                  targetDataLod = 2;   // full extrusion

  // We need to find the available LOD levels in the mesh
  const availableLods = new Set();
  if (buildingMesh.isGroup) {
    buildingMesh.traverse((child) => {
      if (child.isMesh && child.userData.lodLevel !== undefined) {
        availableLods.add(child.userData.lodLevel);
      }
    });
  }

  // If the exact targetDataLod is not available, find the closest one
  let activeDataLod = targetDataLod;
  if (availableLods.size > 0 && !availableLods.has(targetDataLod)) {
    let minDiff = Infinity;
    for (const lod of availableLods) {
      const diff = Math.abs(lod - targetDataLod);
      if (diff < minDiff) {
        minDiff = diff;
        activeDataLod = lod;
      }
    }
  }

  // buildingMesh is always a THREE.Group (created by renderBuildings)
  buildingMesh.traverse((child) => {
    if (child.isMesh) {
      if (child.userData.lodLevel !== undefined) {
        child.visible = (child.userData.lodLevel === activeDataLod);
      } else {
        child.visible = true; // no lodLevel → always visible
      }

      // Adjust shadows only for visible meshes
      if (child.visible) {
        child.castShadow    = tier === LOD_NEAR;
        child.receiveShadow = tier <= LOD_MID;
      }
    }
  });

  // Debug logging for LOD selection changes
  if (buildingMesh.userData._lastActiveLod !== activeDataLod) {
    console.log(`[LOD] Distance tier: ${tier} -> Target LOD: ${targetDataLod} -> Active LOD: ${activeDataLod}`);
    buildingMesh.userData._lastActiveLod = activeDataLod;
  }

  return tier;
}

export const LOD_TIER_LABELS = {
  [LOD_NEAR]: "Near (full detail + shadows)",
  [LOD_MID]:  "Mid  (full detail)",
  [LOD_FAR]:  "Far  (flat footprints)",
};
