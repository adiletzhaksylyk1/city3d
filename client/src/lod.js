/**
 * lod.js — Client-side Level-of-Detail management (Section 5.6, Table 5.1).
 *
 * LOD tier assignment is based on camera distance from each building's
 * projected centre. Three tiers are implemented:
 *
 *   LOD 0 – Near  (0–200 m)   Full extrusion, shadows enabled
 *   LOD 1 – Mid   (200–600 m) Simplified, receive-shadow only
 *   LOD 2 – Far   (600+ m)    No shadows (performance optimisation)
 *
 * The LOD manager controls shadow quality on the merged building mesh
 * based on camera distance from the scene target (controls.target).
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

  // Map tier to the target data LOD level
  let targetDataLod = 2; // Default to standard
  if (tier === LOD_NEAR) targetDataLod = 4;
  else if (tier === LOD_MID) targetDataLod = 2;
  else if (tier === LOD_FAR) targetDataLod = 0;

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

  // Adjust visibility and shadows
  if (buildingMesh.isGroup) {
    buildingMesh.traverse((child) => {
      if (child.isMesh) {
        // Toggle visibility based on activeDataLod
        if (child.userData.lodLevel !== undefined) {
          child.visible = (child.userData.lodLevel === activeDataLod);
        } else {
          child.visible = true; // no lodLevel -> always visible
        }

        // Only adjust shadows for visible meshes to save performance
        if (child.visible) {
          child.castShadow    = tier === LOD_NEAR;
          child.receiveShadow = tier <= LOD_MID;
        }
      }
    });
  } else {
    buildingMesh.castShadow    = tier === LOD_NEAR;
    buildingMesh.receiveShadow = tier <= LOD_MID;
  }

  // Debug logging for LOD selection changes
  if (buildingMesh.userData._lastActiveLod !== activeDataLod) {
    console.log(`[LOD] Distance tier: ${tier} -> Target LOD: ${targetDataLod} -> Active LOD: ${activeDataLod}`);
    buildingMesh.userData._lastActiveLod = activeDataLod;
  }

  return tier;
}

export const LOD_TIER_LABELS = {
  [LOD_NEAR]: "Near (full detail)",
  [LOD_MID]:  "Mid  (simplified)",
  [LOD_FAR]:  "Far  (flat)",
};
