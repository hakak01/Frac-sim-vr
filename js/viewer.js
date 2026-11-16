// Phase 1 asset viewer: loads one region (manifest.json + one GLB per layer),
// shows layer toggles and a table of structures. No VR yet (Phase 3).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const REGION = './assets/leg_right/';
const LAYERS_ON = { bones: true, muscles: true, arteries: true, veins: true, nerves: true, skin: false };

// Display colours only (the shapes come from Z-Anatomy, untouched).
const COLOURS = {
  bones: 0xe6dcc8, cartilage: 0xbfd6e2, muscles: 0xa5453c, tendon: 0xe9e2d2,
  arteries: 0xd32f2f, veins: 0x2f62c0, nerves: 0xe6c53a, skin: 0xd8a78a,
};
function colourKey(layer, matName) {
  if (matName === 'Cartilage') return 'cartilage';
  if (matName === 'Tendon') return 'tendon';
  return layer;
}

const view = document.getElementById('view');
const label = document.getElementById('label');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171c);
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f48, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
camera.add(sun);            // light travels with the camera
sun.position.set(0.3, 0.5, 1);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const root = new THREE.Group();   // holds the whole region; true scale, 1 unit = 1 metre
scene.add(root);

const materials = {};
function material(key) {
  if (!materials[key]) {
    materials[key] = new THREE.MeshStandardMaterial({
      color: COLOURS[key], roughness: 0.65, metalness: 0, side: THREE.DoubleSide,
    });
  }
  return materials[key];
}
const highlight = new THREE.MeshStandardMaterial({
  color: 0x4fb3ff, emissive: 0x114466, roughness: 0.5, side: THREE.DoubleSide,
});

const layerGroups = {};      // layer id -> THREE.Group
const structures = {};       // Z-Anatomy name -> { node, meshes, row }
let selected = null;

function select(name) {
  if (selected) {
    structures[selected].meshes.forEach((m) => { m.material = m.userData.baseMat; });
    structures[selected].row.classList.remove('sel');
  }
  selected = name && structures[name] ? name : null;
  if (!selected) { label.textContent = 'Tap a structure for its name'; return; }
  const s = structures[selected];
  s.meshes.forEach((m) => { m.material = highlight; });
  s.row.classList.add('sel');
  label.textContent = selected.replace(/\.r$/, '') + '  (right)';
}

const kb = (b) => (b / 1024).toFixed(b < 10240 ? 1 : 0) + ' KB';
const num = (n) => n.toLocaleString('en-GB');

async function main() {
  const manifest = await (await fetch(REGION + 'manifest.json')).json();
  const draco = new DRACOLoader().setDecoderPath('./vendor/three/examples/jsm/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const layersEl = document.getElementById('layers');
  const rowsEl = document.getElementById('rows');
  let totalTris = 0, totalBytes = 0, count = 0;

  for (const [id, L] of Object.entries(manifest.layers)) {
    const gltf = await loader.loadAsync(REGION + L.file);
    const group = gltf.scene;
    group.visible = !!LAYERS_ON[id];
    layerGroups[id] = group;
    root.add(group);

    // layer checkbox
    const lab = document.createElement('label');
    lab.innerHTML = `<input type="checkbox" ${group.visible ? 'checked' : ''}>
      <span class="sw" style="background:#${COLOURS[id].toString(16).padStart(6, '0')}"></span>
      <span>${L.label}</span><span class="n">${L.structures.length}</span>`;
    lab.querySelector('input').addEventListener('change', (e) => { group.visible = e.target.checked; });
    layersEl.append(lab);

    // table rows
    const g = document.createElement('tr');
    g.className = 'grp';
    g.innerHTML = `<td>${L.label} (${L.structures.length})</td><td class="num">${num(L.triangles)}</td><td class="num">${kb(L.bytes)}</td>`;
    rowsEl.append(g);
    const rowByName = {};
    for (const s of L.structures) {
      const tr = document.createElement('tr');
      tr.className = 'row';
      tr.innerHTML = `<td>${s.name.replace(/\.r$/, '')}</td><td class="num">${num(s.triangles)}</td><td class="num">${kb(s.bytes_alone)}</td>`;
      tr.addEventListener('click', () => select(selected === s.name ? null : s.name));
      rowsEl.append(tr);
      rowByName[s.name] = tr;
    }
    totalTris += L.triangles; totalBytes += L.bytes; count += L.structures.length;

    // register meshes under their Z-Anatomy name (kept in the GLB as extras.za_name)
    group.traverse((o) => {
      if (!o.isMesh) return;
      let n = o;
      while (n && !n.userData.za_name) n = n.parent;
      const name = n ? n.userData.za_name : o.name;
      o.userData.za_name = name;
      o.material = o.userData.baseMat = material(colourKey(id, o.material.name));
      (structures[name] ||= { node: n, meshes: [], row: rowByName[name] }).meshes.push(o);
    });
  }
  const t = document.createElement('tr');
  t.className = 'grp';
  t.innerHTML = `<td>Total (${count})</td><td class="num">${num(totalTris)}</td><td class="num">${kb(totalBytes)}</td>`;
  rowsEl.append(t);

  // centre the region and frame it (front view: patient faces the camera)
  const box = new THREE.Box3().setFromObject(layerGroups.bones);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  root.position.sub(c);
  camera.position.set(0.25 * size.y, 0.1 * size.y, 2.6 * size.y);
  controls.target.set(0, 0, 0);
  controls.update();
  const tibia = manifest.layers.bones.structures.find((s) => s.name.startsWith('Tibia'));
  const mm = ((tibia.bbox_max[2] - tibia.bbox_min[2]) * 1000).toFixed(0);
  document.getElementById('sub').textContent = `${manifest.title} · true scale (tibia ${mm} mm long)`;
  select(null);
  window.viewer = { camera, controls, scene, root, ready: true };   // for testing and debugging
}

// picking
const ray = new THREE.Raycaster();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  const r = renderer.domElement.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1,
    -((e.clientY - r.top) / r.height) * 2 + 1), camera);
  const visible = Object.values(layerGroups).filter((g) => g.visible);
  const hit = ray.intersectObjects(visible, true)[0];
  select(hit ? hit.object.userData.za_name : null);
  if (hit) structures[hit.object.userData.za_name].row.scrollIntoView({ block: 'nearest' });
});

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

main().catch((err) => { label.textContent = 'Could not load assets: ' + err.message; console.error(err); });
