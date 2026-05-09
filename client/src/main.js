/**
 * main.js — Three.js client entry point (Layer 4).
 *
 * Orchestrates:
 *   1. Scene, camera, renderer, controls, lights, ground (scene.js)
 *   2. City extent fetch → camera positioning (api.js)
 *   3. Building + street data fetch → geometry (renderer.js)
 *   4. 60 Hz render loop with LOD + incremental loading (lod.js)
 *   5. HUD stats, info panel, LOD selector, source toggle (DOM)
 *   6. Raycasting for building click (renderer.js)
 *
 * Section references: 5.5, 5.6, 5.7
 */

import * as THREE from "three";

import {
  createRenderer,
  createCamera,
  createControls,
  createScene,
  createLights,
  createGround,
  onResize,
} from "./scene.js";

import {
  fetchExtent,
  fetchBuildings,
  fetchStreets,
  setSourceMode,
  setLodFilter,
} from "./api.js";

import {
  setOrigin,
  cameraToBbox,
  bboxToString,
} from "./geo.js";

import {
  renderBuildings,
  renderStreets,
  pickBuilding,
} from "./renderer.js";

import {
  applySceneLOD,
  LOD_TIER_LABELS,
} from "./lod.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────

const container  = document.getElementById("canvas-container");
const loading    = document.getElementById("loading");
const loadingMsg = document.getElementById("loading-msg");

const statBuildings = document.getElementById("stat-buildings");
const statStreets   = document.getElementById("stat-streets");
const statFps       = document.getElementById("stat-fps");
const statLod       = document.getElementById("stat-lod");

const infoPanel    = document.getElementById("info-panel");
const infoHeight   = document.getElementById("info-height");
const infoFloors   = document.getElementById("info-floors");
const infoMaterial = document.getElementById("info-material");
const infoType     = document.getElementById("info-type");
const infoRoof     = document.getElementById("info-roof");
const infoLod      = document.getElementById("info-lod");

const lodSelect   = document.getElementById("lod-select");
const btnGeojson  = document.getElementById("btn-geojson");
const btnApi      = document.getElementById("btn-api");

// ── State ─────────────────────────────────────────────────────────────────────

let buildingCount = 0;
let streetCount   = 0;
let isLoading     = false;
let refreshPending = false;

// FPS tracking
let fpsFrames = 0, fpsLast = performance.now(), fps = 0;

function setLoadingMsg(msg) { loadingMsg.textContent = msg; }

function hideLoading() {
  loading.classList.add("hidden");
  setTimeout(() => { loading.style.display = "none"; }, 600);
}

// ── Scene setup ───────────────────────────────────────────────────────────────

const scene    = createScene();
const renderer = createRenderer(container);
const camera   = createCamera(container);
const controls = createControls(camera, renderer);

createLights(scene);
createGround(scene);

// ── Raycasting ────────────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointer   = new THREE.Vector2();

renderer.domElement.addEventListener("click", (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width)  * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const props = pickBuilding(raycaster, scene);

  if (props) {
    infoHeight.textContent   = props.height   ? `${props.height} m`   : "—";
    infoFloors.textContent   = props.floors   ?? "—";
    infoMaterial.textContent = props.material ?? props["building:material"] ?? "—";
    infoType.textContent     = props.building_type ?? "—";
    infoRoof.textContent     = props.roof_shape    ?? "—";
    infoLod.textContent      = props.lod_level     ?? "—";
    infoPanel.classList.add("visible");
  } else {
    infoPanel.classList.remove("visible");
  }
});

// ── City load ─────────────────────────────────────────────────────────────────

async function loadCity() {
  setLoadingMsg("Fetching city extent…");

  const extent = await fetchExtent();
  if (!extent) throw new Error("No city data found. Run main.py to generate a city.");

  const [centerLon, centerLat] = extent.center;
  setOrigin(centerLon, centerLat);

  // Position camera above city centre
  camera.position.set(0, 600, 800);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();

  setLoadingMsg("Loading buildings…");
  await refreshCity();

  setLoadingMsg("Done!");
  hideLoading();
}

async function refreshCity() {
  if (isLoading) {
    refreshPending = true;
    return;
  }
  isLoading = true;
  refreshPending = false;

  try {
    const bbox    = cameraToBbox(camera, 0.08);  // 0.08° ≈ ~8 km at city scale
    const bboxStr = bboxToString(bbox);

    const currentMode = btnApi.classList.contains("active") ? "api" : "geojson";
    const currentLod = lodSelect.value;

    const [buildingsGJ, streetsGJ] = await Promise.all([
      fetchBuildings(bboxStr),
      fetchStreets(bboxStr),
    ]);

    // Check if mode/filter changed while fetching
    const newMode = btnApi.classList.contains("active") ? "api" : "geojson";
    if (currentMode !== newMode || currentLod !== lodSelect.value) {
      return; // Skip rendering, a new refresh is already pending
    }

    const { count: bc } = renderBuildings(buildingsGJ, scene);
    const { count: sc } = renderStreets(streetsGJ, scene);

    buildingCount = bc;
    streetCount   = sc;

    statBuildings.textContent = bc;
    statStreets.textContent   = sc;

  } finally {
    isLoading = false;
    if (refreshPending) {
      refreshCity().catch(console.error);
    }
  }
}

// ── Incremental loading (Section 5.7) ─────────────────────────────────────────

let lastCameraPos = new THREE.Vector3();
const CAMERA_MOVE_THRESHOLD = 80;   // scene units before re-fetching

function checkIncrementalLoad() {
  if (isLoading) return;
  const moved = camera.position.distanceTo(lastCameraPos);
  if (moved > CAMERA_MOVE_THRESHOLD) {
    lastCameraPos.copy(camera.position);
    refreshCity().catch(console.error);
  }
}

// ── Render loop (Section 5.7) ─────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);

  // Controls damping
  controls.update();

  // LOD — use orbit controls target as the reference point
  const buildingGroup = scene.getObjectByName("buildings");
  const tier = applySceneLOD(buildingGroup, camera, controls.target);
  statLod.textContent = LOD_TIER_LABELS[tier] ?? "—";

  // Incremental load check
  checkIncrementalLoad();

  // FPS counter
  fpsFrames++;
  const now = performance.now();
  if (now - fpsLast >= 500) {
    fps = Math.round(fpsFrames * 1000 / (now - fpsLast));
    fpsLast  = now;
    fpsFrames = 0;
    statFps.textContent = fps;
  }

  renderer.render(scene, camera);
}

// ── Event listeners ───────────────────────────────────────────────────────────

// Window resize
window.addEventListener("resize", () => onResize(camera, renderer, container));

// LOD selector
lodSelect.addEventListener("change", () => {
  setLodFilter(lodSelect.value || null);
  refreshCity().catch(console.error);
});

// Source mode toggle
btnGeojson.addEventListener("click", () => {
  setSourceMode("geojson");
  btnGeojson.classList.add("active");
  btnApi.classList.remove("active");
  refreshCity().catch(console.error);
});

btnApi.addEventListener("click", () => {
  setSourceMode("api");
  btnApi.classList.add("active");
  btnGeojson.classList.remove("active");
  refreshCity().catch(console.error);
});

// ── Boot ──────────────────────────────────────────────────────────────────────

loadCity()
  .then(() => animate())
  .catch((err) => {
    console.error("[main] Boot error:", err);
    setLoadingMsg(`Error: ${err.message}`);
    // Still start the render loop so scene is visible
    animate();
  });
