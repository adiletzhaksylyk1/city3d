/**
 * scene.js — Three.js scene initialisation (Section 5.5.1).
 *
 * Sets up:
 *   - WebGLRenderer  (antialiased, shadow-capable)
 *   - PerspectiveCamera at 45° overlooking the city
 *   - OrbitControls for mouse interaction
 *   - AmbientLight + DirectionalLight (mid-afternoon sun simulation)
 *   - Ground plane
 *   - Axes helper (dev only)
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ── Renderer ──────────────────────────────────────────────────────────────────

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha:     false,
    powerPreference: "high-performance",
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace   = THREE.SRGBColorSpace;
  renderer.toneMapping       = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  container.appendChild(renderer.domElement);
  return renderer;
}

// ── Camera ────────────────────────────────────────────────────────────────────

export function createCamera(container) {
  const aspect = container.clientWidth / container.clientHeight;
  const camera = new THREE.PerspectiveCamera(50, aspect, 1, 20_000);

  // Initial position: above-and-south of the city at 45°
  camera.position.set(0, 600, 800);
  camera.lookAt(0, 0, 0);

  return camera;
}

// ── Controls ──────────────────────────────────────────────────────────────────

export function createControls(camera, renderer) {
  const controls = new OrbitControls(camera, renderer.domElement);

  controls.enableDamping  = true;
  controls.dampingFactor  = 0.06;
  controls.minDistance    = 50;
  controls.maxDistance    = 8_000;
  controls.maxPolarAngle  = Math.PI / 2 - 0.02;   // don't go below ground
  controls.target.set(0, 0, 0);
  controls.update();

  return controls;
}

// ── Lighting ──────────────────────────────────────────────────────────────────

export function createLights(scene) {
  // Ambient — soft fill light
  const ambient = new THREE.AmbientLight(0xb0c4de, 0.6);
  scene.add(ambient);

  // Directional — simulates mid-afternoon sun from south-west
  const sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
  sun.position.set(500, 1000, 300);
  sun.castShadow = true;

  // Shadow camera covers the city footprint
  const d = 700;
  sun.shadow.camera.left   = -d;
  sun.shadow.camera.right  =  d;
  sun.shadow.camera.top    =  d;
  sun.shadow.camera.bottom = -d;
  sun.shadow.camera.near   = 10;
  sun.shadow.camera.far    = 3_000;
  sun.shadow.mapSize.width  = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.bias = -0.0005;

  scene.add(sun);

  // Hemisphere — sky/ground colour gradient
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x3d3d3d, 0.4);
  scene.add(hemi);

  return { ambient, sun, hemi };
}

// ── Ground plane ──────────────────────────────────────────────────────────────

export function createGround(scene, size = 3000) {
  const geo = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e });

  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  ground.receiveShadow = true;

  scene.add(ground);
  return ground;
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a14);
  scene.fog = new THREE.FogExp2(0x0a0a14, 0.00035);
  return scene;
}

// ── Resize handler ────────────────────────────────────────────────────────────

export function onResize(camera, renderer, container) {
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}
