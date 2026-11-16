// Plain 3D viewer: loads one region (manifest.json + one GLB per layer), shows layer
// toggles, a table of structures and (Phase 2) the pre-cut fractures. No VR yet (Phase 3).
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
  fxcortex: 0xf2ead2, fxcancellous: 0xb9604f, fxmarrow: 0x8c3a2c,
};
const FX_MATERIAL = { Bone: 'bones', Cartilage: 'cartilage', FractureCortex: 'fxcortex',
  FractureCancellous: 'fxcancellous', FractureMarrow: 'fxmarrow' };
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
  await initFractures(loader);
  window.viewer = { camera, controls, scene, root, showFracture, setSpread, fx, ready: true };   // for testing
}

// ---- Phase 2: pre-cut fractures -------------------------------------------
const fx = { index: {}, group: null, hidden: [], fragments: [], loader: null, spread: 0 };
const SEGMENTS = { 41: '41 Proximal tibia', 42: '42 Tibial shaft', 43: '43 Distal tibia',
  44: '44 Malleolar segment', '4F': '4F Fibula' };

async function initFractures(loader) {
  const sel = document.getElementById('fx');
  fx.loader = loader;
  let idx;
  try { idx = await (await fetch(REGION + 'fractures/index.json')).json(); } catch (e) { sel.disabled = true; return; }
  const groups = {};
  for (const e of idx.fractures) { fx.index[e.id] = e; (groups[e.segment] ||= []).push(e); }
  for (const [seg, list] of Object.entries(groups)) {
    const og = document.createElement('optgroup');
    og.label = SEGMENTS[seg] || seg;
    for (const e of list) {
      const o = document.createElement('option');
      o.value = e.id;
      o.textContent = e.id + ' – ' + e.name.split(', ').slice(-1)[0];
      og.append(o);
    }
    sel.append(og);
  }
  sel.addEventListener('change', () => showFracture(sel.value));
  const sp = document.getElementById('spread');
  sp.addEventListener('input', () => setSpread(+sp.value));
}

function setSpread(mm) {
  fx.spread = mm;
  document.getElementById('spreadv').textContent = mm + ' mm';
  for (const f of fx.fragments) f.node.position.copy(f.dir).multiplyScalar(f.fixed ? 0 : mm / 1000);
}

async function showFracture(id) {
  if (fx.group) fx.group.removeFromParent();
  fx.hidden.forEach((n) => { n.visible = true; });
  Object.assign(fx, { group: null, hidden: [], fragments: [] });
  const info = document.getElementById('fxinfo');
  info.innerHTML = '';
  select(null);
  const e = fx.index[id];
  if (!e) return;
  const src = e.sources.map((s) => `<li>${s.ref}${s.page ? ', p. ' + s.page : ''}. PMID ${s.pmid}</li>`).join('');
  info.innerHTML = `<p><b>${e.id}</b> ${e.name}</p>`
    + (e.qualification ? `<p>Shown: ${e.qualification}</p>` : '')
    + (e.soft_tissue ? `<p>${e.soft_tissue}</p>` : '')
    + (e.fragments.length ? `<p>${e.fragments.length} fragments, ${num(e.triangles)} triangles, ${kb(e.bytes)}</p>` : '')
    + (e.note ? `<p>${e.note}</p>` : '') + `<p>${e.line_basis}</p><ul>${src}</ul>`
    + '<p>Cortex thickness is modelled, not measured.</p>';
  if (!e.file) return;
  const gltf = await fx.loader.loadAsync(REGION + 'fractures/' + e.file);
  if (document.getElementById('fx').value !== id && document.getElementById('fx').value !== '') return;
  fx.group = gltf.scene;
  layerGroups.bones.add(fx.group);                 // follows the Bones tick box
  for (const name of e.bones) {
    const s = structures[name];
    if (s && s.node) { s.node.visible = false; fx.hidden.push(s.node); }
  }
  const biggest = {};
  for (const node of fx.group.children) {
    const u = node.userData;
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.material = material(FX_MATERIAL[o.material.name] || 'bones');
      o.userData.fragLabel = `${e.id} · ${u.bone}: ${u.fragment}`;
    });
    const dir = new THREE.Vector3(...u.centroid).sub(new THREE.Vector3(...u.site));
    const f = { node, dir: dir.lengthSq() ? dir.normalize() : dir, vol: u.volume_cm3, bone: u.bone, fixed: false };
    fx.fragments.push(f);
    if (!biggest[u.bone] || f.vol > biggest[u.bone].vol) biggest[u.bone] = f;
  }
  Object.values(biggest).forEach((f) => { f.fixed = true; });   // the main fragment stays in place
  setSpread(fx.spread);
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
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const hit = ray.intersectObjects(Object.values(layerGroups), true).find((h) => shown(h.object));
  if (hit && hit.object.userData.fragLabel) { select(null); label.textContent = hit.object.userData.fragLabel; return; }
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
