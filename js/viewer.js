// The page: loads one region (manifest.json + one GLB per layer), shows layer toggles,
// a table of structures and the pre-cut fractures. Plain 3D view here; VR mode is in xr.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { computeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { initXR } from './xr.js';
import { frameOf, displacedMatrix, articularEdge, cortexPoints, measure, readoutLines, makeCollider, overlap } from './reduce.js';
import { SOFT, makeSkinnable, initTissue } from './tissue.js';
import { initJoints } from './joints.js';

// fast pointing at big meshes (needed for VR rays)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// region from the address (?region=thigh_right); the list of regions is data: assets/regions.json
const REGION_ID = (new URLSearchParams(location.search).get('region') || 'leg_right').replace(/[^a-z_]/g, '');
const REGION = './assets/' + REGION_ID + '/';
const LAYERS_ON = { bones: true, muscles: true, joints: true, arteries: true, veins: true, nerves: true, skin: false };

// Display colours only (the shapes come from Z-Anatomy, untouched).
const COLOURS = {
  bones: 0xe6dcc8, cartilage: 0xbfd6e2, muscles: 0xa5453c, tendon: 0xe9e2d2,
  arteries: 0xd32f2f, veins: 0x2f62c0, nerves: 0xe6c53a, skin: 0xd8a78a, joints: 0xb08a55,
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
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });   // alpha: pass-through shows behind
renderer.setClearColor(0x000000, 0);
renderer.xr.enabled = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.prepend(renderer.domElement);

const scene = new THREE.Scene();          // no background: the page colour (or the room in VR) shows
scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3f48, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 20);
camera.add(sun);            // light travels with the camera
sun.position.set(0.3, 0.5, 1);
scene.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

const stage = new THREE.Group();  // where the model stands in the room (moved, turned, scaled in VR)
const root = new THREE.Group();   // holds the whole region; true scale, 1 unit = 1 metre
scene.add(stage);
stage.add(root);

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
    lab.innerHTML = `<input type="checkbox" data-layer="${id}" ${group.visible ? 'checked' : ''}>
      <span class="sw" style="background:#${COLOURS[id].toString(16).padStart(6, '0')}"></span>
      <span>${L.label}</span><span class="n">${L.structures.length}</span>`;
    lab.querySelector('input').addEventListener('change', (e) => { group.visible = e.target.checked; });
    layersEl.append(lab);

    // table rows
    const g = document.createElement('tr');
    g.className = 'grp';
    g.innerHTML = `<td>${L.label} (${L.structures.length})</td><td class="num">${num(L.triangles)}</td><td class="num">${kb(L.bytes)}</td><td></td>`;
    rowsEl.append(g);
    const rowByName = {};
    for (const s of L.structures) {
      const tr = document.createElement('tr');
      tr.className = 'row';
      tr.innerHTML = `<td>${s.name.replace(/\.r$/, '')}</td><td class="num">${num(s.triangles)}</td><td class="num">${kb(s.bytes_alone)}</td>`
        + '<td class="vis"><button class="hide" title="Hide or show this structure">hide</button><button class="iso" title="Show only the isolated structures (click several to isolate a group)">isolate</button></td>';
      tr.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('hide')) return setHidden(s.name, !vis.hidden.has(s.name));
        if (ev.target.classList.contains('iso')) return toggleIsolate(s.name);
        select(selected === s.name ? null : s.name);
      });
      rowsEl.append(tr);
      rowByName[s.name] = tr;
    }
    totalTris += L.triangles; totalBytes += L.bytes; count += L.structures.length;

    if (SOFT.includes(id)) makeSkinnable(group);       // so that soft tissue can follow the fragments
    // register meshes under their Z-Anatomy name (kept in the GLB as extras.za_name)
    group.traverse((o) => {
      if (!o.isMesh) return;
      let n = o;
      while (n && !n.userData.za_name) n = n.parent;
      const name = n ? n.userData.za_name : o.name;
      o.userData.za_name = name;
      o.material = o.userData.baseMat = material(colourKey(id, o.material.name));
      (structures[name] ||= { node: n, meshes: [], row: rowByName[name], layer: id }).meshes.push(o);
    });
  }
  const t = document.createElement('tr');
  t.className = 'grp';
  t.innerHTML = `<td>Total (${count})</td><td class="num">${num(totalTris)}</td><td class="num">${kb(totalBytes)}</td><td></td>`;
  rowsEl.append(t);

  // centre the region and frame it (front view: patient faces the camera).
  // Bones shown only for context (e.g. the whole tibia in the foot region) stay out of the frame.
  const box = new THREE.Box3();
  for (const s of manifest.layers.bones.structures) if (!s.context_only && structures[s.name]) box.expandByObject(structures[s.name].node);
  if (box.isEmpty()) box.setFromObject(layerGroups.bones);
  const c = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const d = Math.max(size.x, size.y, size.z);       // = the height for leg and thigh, the length for the foot
  root.position.sub(c);
  camera.position.set(0.25 * d, 0.1 * d, 2.6 * d);
  controls.target.set(0, 0, 0);
  controls.update();
  // the region's main bone (data: main_bone in regions/<id>.json), for the length in the subtitle
  const len = (s) => s.bbox_max[2] - s.bbox_min[2];
  const bones = manifest.layers.bones.structures;
  const main = bones.find((s) => s.name === manifest.main_bone) || bones.filter((s) => !s.context_only).sort((a, b) => len(b) - len(a))[0];
  const mm = (axisLength(structures[main.name]) * 1000).toFixed(0);
  document.getElementById('sub').textContent = `${manifest.title} · true scale (${main.name.replace(/\.[rl]$/, '').toLowerCase()} ${mm} mm long)`;
  initRegions();
  select(null);
  applyVisibility();
  await initFractures(loader);
  for (const s of manifest.layers.bones.structures) {           // fast pointing at intact bones (Phase 7b: they can be held)
    if (structures[s.name]) structures[s.name].meshes.forEach((m) => { if (!m.geometry.boundsTree) m.geometry.computeBoundsTree(); });
  }
  joints = await initJoints({ region: REGION, structures, fx, layerGroups, onTear: () => { if (xr.active) xr.draw(); } });
  if (joints) { joints.onFracture(null); initJointsPanel(); }
  tissue = initTissue({ layerGroups, fx, collider, boneColliders, followerBone,
    pieces: () => (joints ? joints.pieces() : []), pieceHome: (n) => joints && joints.homeOf(n),
    softMaterials: () => ['muscles', 'tendon', 'joints', 'arteries', 'veins', 'nerves', 'skin'].map(material) });
  tissue.rebind();
  const gh = document.getElementById('ghost');
  gh.addEventListener('input', () => setGhost(+gh.value));
  document.getElementById('pull').addEventListener('change', (ev) => { sim.pull = ev.target.checked; });
  document.getElementById('collide').addEventListener('change', (ev) => { sim.collide = ev.target.checked; sim.note = ''; sim.slow = 0; syncToggles(); });
  document.getElementById('showall').addEventListener('click', showAll);
  xr = initXR({ renderer, scene, camera, controls, stage, layerGroups, fx, showFracture, setSpread,
    resetFragments, setPosition, collider, boneColliders, updateReadout, resize, advance, sim, measure, readoutLines,
    setGhost, syncToggles, tissue: () => tissue, setLayer, setQuality, femurLines, joints: () => joints,
    vis: { state: vis, setHidden, toggleIsolate, showAll, select, shown, structures } });
  window.viewer = { THREE, camera, controls, scene, stage, root, showFracture, setSpread, resetFragments, setPosition,
    measure, collider, overlap, advance, sim, tissue, setGhost, setLayer, setQuality, femurState, fx, xr,
    layerGroups, renderer, vis, setHidden, toggleIsolate, showAll, structures, joints, ready: true };   // for testing
}

// ---- Phase 2: pre-cut fractures -------------------------------------------
const fx = { index: {}, data: null, group: null, hidden: [], fragments: [], followers: [], loader: null, spread: 0, token: 0, current: '',
  position: 'displaced',        // position: 'displaced' (typical displacement) or 'reduced' (anatomical)
  quality: '', shownQuality: '' };   // bone quality chosen ('' = the fracture's default) and the one shown
let xr = { update() {} };
let joints = null;            // Phase 7b (regions with assets/<region>/joint_model.json)
let tissue = { update() {}, rebind() {}, setGhost() {} };

function setGhost(percent) {                 // 100 = solid soft tissue, 0 = invisible
  document.getElementById('ghost').value = percent;
  document.getElementById('ghostv').textContent = percent + ' %';
  tissue.setGhost(percent / 100);
}
// ---- hide or isolate single structures (view only: a hidden bone still blocks bone) ----
// Keys: a Z-Anatomy name (the structure and, if it is cut, all its fragments) or a fragment label
// ("tibia: distal"; VR only). Isolated: only the isolated keys are shown.
const vis = { hidden: new Set(), iso: new Set() };
const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
function visibleKey(...keys) {
  if (keys.some((k) => vis.hidden.has(k))) return false;
  return !vis.iso.size || keys.some((k) => vis.iso.has(k));
}
function applyVisibility() {
  for (const [name, s] of Object.entries(structures)) {
    const on = visibleKey(name);
    s.meshes.forEach((m) => { m.visible = on; });
    if (s.row) {
      s.row.classList.toggle('off', !on);
      s.row.querySelector('.hide').textContent = vis.hidden.has(name) ? 'show' : 'hide';
      s.row.querySelector('.iso').classList.toggle('on', vis.iso.has(name));
    }
  }
  for (const f of fx.fragments) f.holder.visible = visibleKey(f.za, f.label);
  const n = vis.hidden.size, k = vis.iso.size;
  document.getElementById('visnote').textContent = n || k
    ? [n ? `${n} hidden` : '', k ? `isolated: ${[...vis.iso].map((x) => x.replace(/\.[rl]$/, '')).join(', ')}` : ''].filter(Boolean).join(' · ')
    : 'Everything shown (within the layers that are ticked).';
  document.getElementById('showall').disabled = !(n || k);
  if (xr.draw && xr.active) xr.draw();
}
function setHidden(key, on) {
  if (on) { vis.hidden.add(key); vis.iso.delete(key); } else vis.hidden.delete(key);
  applyVisibility();
}
function toggleIsolate(key) {
  if (vis.iso.has(key)) vis.iso.delete(key);
  else {
    vis.iso.add(key); vis.hidden.delete(key);
    const s = structures[key];
    if (s && !layerGroups[s.layer].visible) setLayer(s.layer, true);   // its layer must be on to see it
    const f = fx.fragments.find((x) => x.label === key);
    if (f && !layerGroups.bones.visible) setLayer('bones', true);
  }
  applyVisibility();
}
function showAll() { vis.hidden.clear(); vis.iso.clear(); applyVisibility(); }

// region picker: reloads the page with ?region=<id>
async function initRegions() {
  const sel = document.getElementById('region');
  let list = [];
  try { list = await (await fetch('./assets/regions.json')).json(); } catch (e) { sel.hidden = true; return; }
  for (const r of list) sel.add(new Option(r.title, r.id, false, r.id === REGION_ID));
  sel.addEventListener('change', () => { location.search = '?region=' + sel.value; });
}

function setLayer(id, on) {
  layerGroups[id].visible = on;
  const box = document.querySelector(`#layers input[data-layer="${id}"]`);
  if (box) box.checked = on;
}
const SEGMENTS = { 41: '41 Proximal tibia', 42: '42 Tibial shaft', 43: '43 Distal tibia',
  44: '44 Malleolar segment', '4F': '4F Fibula', 81: '81 Talus', 82: '82 Calcaneus' };

async function initFractures(loader) {
  const sel = document.getElementById('fx');
  fx.loader = loader;
  let idx;
  try { idx = await (await fetch(REGION + 'fractures/index.json')).json(); } catch (e) { sel.disabled = true; return; }
  const groups = {};
  fx.data = idx;
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
  document.getElementById('quality').addEventListener('change', (ev) => setQuality(ev.target.value));
  const sp = document.getElementById('spread');
  sp.addEventListener('input', () => setSpread(+sp.value));
  for (const r of document.querySelectorAll('input[name=pos]')) r.addEventListener('change', () => setPosition(r.value));
}

function setSpread(mm) {
  fx.spread = mm;
  document.getElementById('spread').value = mm;
  document.getElementById('spreadv').textContent = mm + ' mm';
  // the explode offset is on the holder; the fragment itself keeps the pose the user gave it
  for (const f of fx.fragments) f.holder.position.copy(f.dir).multiplyScalar(f.fixed ? 0 : mm / 1000);
  updateReadout();
}

// collider of a fragment or of an intact bone (built once, when first needed)
// Small or thin fragments get a finer, less shrunk shape; big ones a lighter one.
function colliderSize(x) {
  if (x.vol === undefined || x.vol > 10) return [0.0008, 0.0016];      // [shrink, point spacing] in metres
  return x.vol > 2 ? [0.0005, 0.001] : [0.0003, 0.0006];
}
function collider(x) { return (x.collider ||= makeCollider(x.node, ...colliderSize(x))); }
// length of a bone along its own long axis (principal axis of its points), metres.
// For upright long bones this equals the height; for the calcaneus it is the heel-to-front length.
function axisLength(st) {
  const p = [], v = new THREE.Vector3();
  for (const m of st.meshes) {
    const a = m.geometry.attributes.position;
    m.updateWorldMatrix(true, false);
    for (let i = 0; i < a.count; i++) { v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld); p.push(v.x, v.y, v.z); }
  }
  const n = p.length / 3, mu = [0, 0, 0], C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) mu[k] += p[3 * i + k] / n;
  for (let i = 0; i < n; i++) for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) C[3 * r + k] += (p[3 * i + r] - mu[r]) * (p[3 * i + k] - mu[k]);
  let u = [0.3, 1, 0.2];
  for (let it = 0; it < 100; it++) {          // power iteration: the direction of largest spread
    const w = [0, 1, 2].map((r) => C[3 * r] * u[0] + C[3 * r + 1] * u[1] + C[3 * r + 2] * u[2]);
    const l = Math.hypot(...w) || 1; u = w.map((x) => x / l);
  }
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const t = p[3 * i] * u[0] + p[3 * i + 1] * u[1] + p[3 * i + 2] * u[2]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
  return hi - lo;
}

function boneColliders(withFollowers = false) {   // intact bones on screen (not replaced by fragments)
  return Object.values(structures).filter((s) => s.layer === 'bones' && s.node && s.node.visible
    && (withFollowers || !isFollower(s.node))).map(collider);
}

// ---- Phase 6d: the leg (tibia, fibula, intact patella) moves with the femur fragment that carries the knee ----
const isFollower = (node) => fx.followers.some((x) => x.node === node);
function followerBone(c) {           // for the soft tissue: a follower counts as the knee fragment
  const pi = joints ? joints.pieces().indexOf(c.obj) : -1;       // a free bone of the joint model is its own piece
  if (pi >= 0) return fx.fragments.length + 1 + pi;
  const k = fx.followers.find((x) => x.node === c.obj);
  return k ? fx.fragments.indexOf(k.frag) + 1 : 0;
}
const FW = { m: new THREE.Matrix4(), q: new THREE.Quaternion(), tw: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3() };
function updateFollowers() {
  for (const x of fx.followers) {
    const f = x.frag, ax = f.frame.M;
    f.holder.updateMatrix(); f.node.updateMatrix();
    FW.m.copy(f.holder.matrix).multiply(f.node.matrix);
    FW.m.decompose(FW.p, FW.q, FW.s);
    // the joint (knee, or ankle for the talus) takes up the forwards/backwards tilt:
    // keep the turn without its part about the medial-lateral axis, pivot = the joint centre
    const d = FW.q.x * ax.x + FW.q.y * ax.y + FW.q.z * ax.z;
    FW.tw.set(ax.x * d, ax.y * d, ax.z * d, FW.q.w).normalize();
    const swing = FW.q.clone().multiply(FW.tw.clone().invert());
    const k0 = new THREE.Vector3(...x.pivot), k1 = k0.clone().applyMatrix4(FW.m);
    const F = new THREE.Matrix4().makeTranslation(k1.x, k1.y, k1.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(swing))
      .multiply(new THREE.Matrix4().makeTranslation(-k0.x, -k0.y, -k0.z));
    if (joints && joints.takes(x.node)) { joints.setBase(x.node, F, !f.fixed); continue; }   // 7b: the ligaments place it from there
    x.node.matrixAutoUpdate = false;
    x.node.matrix.copy(F).multiply(x.home);
    x.node.matrixWorldNeedsUpdate = true;
  }
}

// ---- Phase 6d: femur readout (neck-shaft angle, version, length) against the intact femur ----
function femurState() {
  const L = fx.data && fx.data.femur, e = fx.index[fx.current], c = e && e.carriers;
  if (!L || !c) return null;
  const find = (n) => fx.fragments.find((f) => f.bone === 'femur' && f.node.userData.fragment === n);
  const h = find(c.head), s = find(c.shaft), k = find(c.knee);
  if (!h || !s || !k) return null;
  const M = (f) => { f.holder.updateMatrix(); f.node.updateMatrix(); return f.holder.matrix.clone().multiply(f.node.matrix); };
  const Mh = M(h), Ms = M(s), Mk = M(k);
  const P = (m, a) => new THREE.Vector3(...a).applyMatrix4(m);
  const D = (m, a) => new THREE.Vector3(...a).applyMatrix3(new THREE.Matrix3().setFromMatrix4(m)).normalize();
  const hc = P(Mh, L.head_centre), kc = P(Mk, L.knee_centre), neck = D(Mh, L.neck_dir), shaft = D(Ms, L.shaft_dir);
  const mech = kc.clone().sub(hc).normalize();
  const flat = (v) => v.clone().sub(mech.clone().multiplyScalar(v.dot(mech))).normalize();
  const pn = flat(neck), pc = flat(P(Mk, L.cond_med).sub(P(Mk, L.cond_lat)));
  const ver = THREE.MathUtils.radToDeg(pn.angleTo(pc)) * (pn.dot(flat(D(Mk, L.anterior))) >= 0 ? 1 : -1);
  return { nsa: THREE.MathUtils.radToDeg(neck.angleTo(shaft)), ver, len: hc.distanceTo(kc) * 1000, intact: L.intact };
}
function femurLines() {
  const s = femurState();
  if (!s) return [];
  const i = s.intact, dl = s.len - i.length_mm;
  const verTxt = (x) => `${Math.abs(x).toFixed(0)}° ${x >= 0 ? 'anteversion' : 'retroversion'}`;
  return [['Neck-shaft angle', `${s.nsa.toFixed(0)}° (normal side ${i.neck_shaft_deg}°)`],
    ['Femoral version', `${verTxt(s.ver)} (normal side ${verTxt(i.version_deg)})`],
    ['Length, head to knee centre', `${s.len.toFixed(0)} mm (normal side ${i.length_mm.toFixed(0)}; ${Math.abs(dl) < 0.5 ? 'equal' : `${Math.abs(dl).toFixed(0)} mm ${dl < 0 ? 'short' : 'long'}`})`]];
}

// Collision shapes are slightly smaller than the bone. Where two fragments still touch in the
// anatomical position (inside corners), the moving one is made a little smaller again, so that
// 'reduced' is always a free position.
function fitColliders() {
  const I = new THREE.Matrix4();
  for (const f of fx.fragments) collider(f);
  for (const f of fx.fragments) {
    if (f.fixed) continue;
    for (const sh of [0.0011, 0.0014, 0.0018]) {
      if (!fx.fragments.some((o) => o !== f && overlap(o.collider, f.collider, I, I))) break;
      f.collider = makeCollider(f.node, Math.max(sh, colliderSize(f)[0] + 0.0003), colliderSize(f)[1]);
    }
  }
}

// Typical displaced pose of a moving fragment (from fractures.json), made free of overlap
// with its main fragment: bone cannot start inside bone.
function typicalPose(f, placed, waiting) {
  const I = new THREE.Matrix4();
  if (f.fixed || !f.preset) return I;
  let m = displacedMatrix(f, f.preset);
  if (f.preset.use_impaction || (f.preset.pose && f.preset.pose.impaction)) return m;   // a depressed fragment sits in the crushed zone cut for it
  const a = collider(f);
  // against everything placed so far, and the pieces still to be placed, at their home position
  // (pairs that already touch at home are left out)
  const blockers = waiting.filter((o) => !overlap(collider(o), a, I, I));
  // Foot poses (7c): things this piece already touches at home (e.g. the talar head and the navicular, a joint) may
  // keep touching, but not deeper than the inner shapes (2 mm smaller), as when the piece is held by hand.
  // Leg and thigh fractures keep their Phase 4 rule (start positions unchanged).
  const inner = (c) => (c.inner ||= makeCollider(c.obj, c.shrink + 0.002, 0.0016));
  const homeTouch = new Set(f.preset.pose && f.preset.pose.data ? placed.filter(([c, w]) => overlap(c, a, w, I)).map(([c]) => c) : []);
  const hits = (pose) => placed.some(([c, w]) => (homeTouch.has(c) ? overlap(inner(c), inner(a), w, pose) : overlap(c, a, w, pose)))
    || blockers.some((o) => overlap(o.collider, a, I, pose));
  if (!hits(m)) return m;
  // Not free: try smaller versions of the deformity, cheapest first. Cost in "mm": shortening
  // given up counts 1 per mm; deformity given up counts 10 per 100 %; moving the fragment
  // further apart counts 1.5 per mm along the bone, 1 per mm outward (small pieces only).
  const axial = f.frame.D.clone().multiplyScalar(f.isDistal ? 1 : -1);
  const pose = f.preset.pose, sh = f.preset.shortening_mm || (pose ? Math.hypot(...pose.t) * 1000 : 0);
  const piece = !!(f.preset.away_mm || f.preset.proximal_mm || f.preset.use_impaction);
  const moves = [[null, 0, 0]];
  if (pose) {                                // muscle pose: slide sideways past the other fragment (cheaper than losing the shift)
    for (const dir of [f.frame.M, f.frame.M.clone().negate(), f.frame.A, f.frame.A.clone().negate()]) {
      for (let d = 2; d <= (pose.data ? 6 : 16); d += 2) moves.push([dir, d, 0.8 * d]);   // foot poses (7c): short slides only
    }
  } else {
    for (let d = 1; d <= 10; d++) moves.push([axial, d, 1.5 * d]);
  }
  if (piece) for (let d = 1; d <= 15; d++) moves.push([f.dir, d, d]);
  const tries = [];
  for (const k of [1, 0.75, 0.5, 0.25, 0]) {
    for (const s of [1, 0.75, 0.5, 0.25]) {
      for (const [dir, d, c] of moves) tries.push({ k, s, d, out: dir === f.dir, dir, cost: sh * (1 - k) + 10 * (1 - s) + c });
    }
  }
  tries.sort((x, y) => x.cost - y.cost);
  for (const t of tries) {
    m = displacedMatrix(f, f.preset, t.k, t.s);
    if (t.d) m.premultiply(new THREE.Matrix4().makeTranslation(...t.dir.clone().multiplyScalar(t.d / 1000).toArray()));
    if (!hits(m)) { f.startNote = { k: t.k, s: t.s, d: t.d, out: t.out }; return m; }
  }
  return I;                                  // nothing free: start reduced
}

// Start positions for all fragments: main fragments and intact bones first, then the moving
// fragments from the largest to the smallest, each one free of everything placed before it.
function placeAll() {
  const I = new THREE.Matrix4();
  fx.group.updateWorldMatrix(true, false);
  const toGroup = new THREE.Matrix4().copy(fx.group.matrixWorld).invert();
  const placed = boneColliders().map((c) => [c, toGroup.clone().multiply(c.obj.matrixWorld)]);
  for (const f of fx.fragments) {      // main fragments: home, or turned in the hip socket (Phase 6d)
    if (!f.fixed) continue;
    f.displacedM = f.preset && f.preset.pose ? displacedMatrix(f, f.preset) : I.clone();
    placed.push([collider(f), f.displacedM]);
  }
  const order = fx.fragments.filter((x) => !x.fixed).sort((x, y) => y.vol - x.vol);
  order.forEach((f, i) => {
    f.startNote = null;
    f.displacedM = typicalPose(f, placed, order.slice(i + 1));
    placed.push([collider(f), f.displacedM]);
  });
}

// 'reduced': every fragment in its anatomical home position.
// 'displaced': the typical displacement from fractures.json (start of a reduction).
function setPosition(mode) {
  fx.position = mode;
  for (const r of document.querySelectorAll('input[name=pos]')) r.checked = r.value === mode;
  const I = new THREE.Matrix4();
  for (const f of fx.fragments) {
    (mode === 'displaced' ? f.displacedM : I).decompose(f.node.position, f.node.quaternion, f.node.scale);
    f.touch = null;
  }
  updateReadout();
}

// ---- Phase 4: bone cannot pass through bone; optional pull toward the typical deformity ----
const sim = { collide: true, pull: false, ms: 0, last: 0, slow: 0, note: '', fps: 0 };
const T = { p: new THREE.Vector3(), q: new THREE.Quaternion(), s: new THREE.Vector3(), tp: new THREE.Vector3(),
  tq: new THREE.Quaternion(), ts: new THREE.Vector3(), m: new THREE.Matrix4(), w: new THREE.Matrix4(), one: new THREE.Vector3(1, 1, 1) };

function others(f) {                          // everything fragment f could hit: [collider, owner]
  return [...fx.fragments.filter((o) => o !== f).map((o) => [collider(o), o]),
    ...Object.values(structures).filter((s) => s.layer === 'bones' && s.node && s.node.visible && !isFollower(s.node)).map((s) => [collider(s), s])];
}
function touchingSet(f, local) {              // what fragment f would overlap at the pose `local`
  f.holder.updateWorldMatrix(true, false);
  T.w.multiplyMatrices(f.holder.matrixWorld, local);
  const me = collider(f), out = new Map();
  for (const [c, owner] of others(f)) if (overlap(me, c, T.w, c.obj.matrixWorld)) out.set(c, owner);
  return out;
}
// Second, deeper shape (2 mm smaller). Pairs that already touch are allowed to keep touching
// (so nothing gets stuck), but never deep enough for these inner shapes to meet.
const core = (x) => (x.core ||= makeCollider(x.node, collider(x).shrink + (x.vol !== undefined && x.vol < 10 ? 0.0008 : 0.002), colliderSize(x)[1]));
function deep(f, local, touching) {
  T.w.multiplyMatrices(f.holder.matrixWorld, local);
  for (const [c, owner] of touching) if (overlap(core(f), core(owner), T.w, c.obj.matrixWorld)) return true;
  return false;
}

// Move fragment f toward the pose `target` (Matrix4 in its holder), stopping at bone contact.
// Overlaps that already exist are tolerated, so a fragment can always be pulled free.
function advance(f, target) {
  if (!sim.collide) { target.decompose(f.node.position, f.node.quaternion, f.node.scale); f.touch = null; return; }
  target.decompose(T.tp, T.tq, T.ts);
  if (T.tp.lengthSq() < 9e-8 && T.tq.angleTo(T.q.identity()) < 0.005) {   // within 0.3 mm of home: home is always free
    f.node.position.copy(T.tp); f.node.quaternion.copy(T.tq); f.touch = null; return;
  }
  if (f.node.position.distanceTo(T.tp) < 5e-5 && f.node.quaternion.angleTo(T.tq) < 0.001) return;   // hand is still
  const t0 = performance.now();
  f.node.updateMatrix();
  if (!f.touch) { f.touch = touchingSet(f, f.node.matrix); f.deep = f.touch.size > 0 && deep(f, f.node.matrix, f.touch); }
  T.p.copy(f.node.position); T.q.copy(f.node.quaternion);
  target.decompose(T.tp, T.tq, T.ts);
  const n = sim.last > 4 ? 1 : Math.min(3, Math.max(1, Math.ceil((T.p.distanceTo(T.tp) + T.q.angleTo(T.tq) * 0.05) / 0.004)));
  for (let k = 1; k <= n; k++) {
    const cp = T.p.clone().lerp(T.tp, k / n), cq = T.q.clone().slerp(T.tq, k / n);
    const now = touchingSet(f, T.m.compose(cp, cq, T.one));
    if (![...now.keys()].every((c) => f.touch.has(c))) break;  // would enter another bone: stop here
    if (now.size && !f.deep && deep(f, T.m, now)) break;       // already touching, but this would go deep
    f.node.position.copy(cp); f.node.quaternion.copy(cq);
    f.touch = now;
  }
  sim.last = performance.now() - t0;
  sim.ms = sim.ms * 0.9 + sim.last * 0.1;
  if (sim.ms > 8) {                                            // not fast enough for the headset: say so, switch off
    if (++sim.slow > 90) { sim.collide = false; sim.note = 'Collision was switched off: too slow on this device.'; syncToggles(); }
  } else sim.slow = 0;
}

// Optional: loose fragments are pulled back toward the typical deformity (a spring, not a muscle force model).
function stepPull(dt) {
  if (!sim.pull) return false;
  let moved = false;
  for (const f of fx.fragments) {
    if (f.fixed || f.held || !f.displacedM) continue;
    if (f.pullWait > 0) { f.pullWait--; continue; }       // stuck against bone: try again a little later
    f.displacedM.decompose(T.tp, T.tq, T.ts);
    if (f.node.position.distanceTo(T.tp) < 1e-4 && f.node.quaternion.angleTo(T.tq) < 1e-3) continue;
    const a = 1 - Math.exp(-dt / 0.5);
    const p0 = f.node.position.clone(), away = f.frame.D.clone().multiplyScalar(f.isDistal ? 1 : -1);
    const goal = f.node.position.clone().lerp(T.tp, a), turn = f.node.quaternion.clone().slerp(T.tq, a);
    for (const lift of [0, 0.0005, 0.001, 0.0015]) {     // if the rough ends lock, ride over them a little
      advance(f, new THREE.Matrix4().compose(goal.clone().addScaledVector(away, lift), turn, T.one));
      if (f.node.position.distanceTo(p0) > 1e-6 || !sim.collide) break;
    }
    if (f.node.position.distanceTo(p0) < 1e-6 && sim.collide) f.pullWait = 20;
    moved = true;
  }
  return moved;
}

function syncToggles() {
  document.getElementById('pull').checked = sim.pull;
  document.getElementById('collide').checked = sim.collide;
  document.getElementById('simnote').textContent = sim.note;
}
const resetFragments = () => setPosition('reduced');

// numbers for every moving fragment, on the page
function updateReadout() {
  const el = document.getElementById('readout');
  const fl = femurLines();
  el.innerHTML = (fl.length ? '<div class="ro"><b>Femur (against the normal side)</b>'
    + fl.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('') + '</div>' : '')
    + fx.fragments.filter((f) => !f.fixed).map((f) => `<div class="ro"><b>${f.label}</b>`
    + readoutLines(measure(f, f.ref)).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('') + '</div>').join('');
}

// bone quality (young / elderly cortex): the same fracture, cut again with the other modelled cortex
function setQuality(q) {
  fx.quality = q || '';
  document.getElementById('quality').value = fx.quality;
  return fx.current ? showFracture(fx.current) : Promise.resolve();
}

async function showFracture(id) {
  const token = ++fx.token;
  fx.current = id || '';
  document.getElementById('fx').value = fx.current;
  if (fx.group) fx.group.removeFromParent();
  fx.hidden.forEach((n) => { n.visible = true; });
  for (const x of fx.followers) {                 // the leg goes back home
    x.node.matrix.copy(x.home); x.node.matrix.decompose(x.node.position, x.node.quaternion, x.node.scale);
    x.node.matrixAutoUpdate = x.auto; x.node.updateMatrixWorld(true);
  }
  fx.followers = [];
  for (const k of [...vis.hidden, ...vis.iso]) if (k.includes(': ')) { vis.hidden.delete(k); vis.iso.delete(k); }   // fragments of the old fracture
  Object.assign(fx, { group: null, hidden: [], fragments: [] });
  const info = document.getElementById('fxinfo');
  info.innerHTML = '';
  document.getElementById('readout').innerHTML = '';
  select(null);
  const e = fx.index[id];
  const settle = () => { if (joints) { joints.onFracture(e); jointsPanel(); } applyVisibility(); tissue.rebind(); };
  if (!e) { settle(); return; }
  const src = e.sources.map((s) => `<li>${s.ref}${s.page ? ', p. ' + s.page : ''}. PMID ${s.pmid}</li>`).join('');
  info.innerHTML = `<p><b>${e.id}</b> ${e.name}</p>`
    + (e.qualification ? `<p>Shown: ${e.qualification}</p>` : '')
    + (e.soft_tissue ? `<p>${e.soft_tissue}</p>` : '')
    + (e.fragments.length ? `<p>${e.fragments.length} fragments, ${num(e.triangles)} triangles, ${kb(e.bytes)}</p>` : '')
    + (e.note ? `<p>${e.note}</p>` : '') + `<p>${e.line_basis}</p><ul>${src}</ul>`
    + '<p>Cortex thickness is modelled, not measured.</p>';
  // where the typical displacement of each moving fragment comes from
  const pulled = e.fragments.filter((x) => x.pose && x.pose.muscles && x.pose.muscles.length);
  if (pulled.length) info.innerHTML += '<p><b>Muscle pull</b> (direction from the muscles, size a teaching value)</p><ul>'
    + pulled.map((x) => `<li>${x.name}: ${x.pose.muscles.map(([m, s]) => `${m.replace(/ muscle$/, '')} ${Math.round(s * 100)} %`).join(', ')}</li>`).join('') + '</ul>';
  const used = [...new Set(e.fragments.map((x) => x.displace).filter(Boolean))];
  if (used.length) {
    info.innerHTML += '<p><b>Typical displacement</b></p><ul>' + used.map((k) => {
      const d = fx.data.displacements[k];
      return `<li>${k.replace(/_/g, ' ')}: ${d.basis}` + (d.sources.length ? ' ' + d.sources.map((x) => `${x.ref} (PMID ${x.pmid}): ${x.claim}.`).join(' ') : '') + '</li>';
    }).join('') + '</ul><p>If the full displacement would push bone into bone, the fracture starts with a smaller one.</p>';
  }
  const q = e.files ? (e.files[fx.quality] ? fx.quality : e.bone_quality) : '';
  fx.shownQuality = q;
  document.getElementById('qualrow').hidden = !e.files;
  if (q) info.innerHTML += `<p>Bone quality shown: <b>${q === 'elderly' ? 'elderly (thinner cortex, wider canal)' : 'young adult'}</b>`
    + `${q === e.bone_quality ? ' (default for this fracture)' : ''}. Both are modelled.</p>`;
  if (e.tags) info.innerHTML += '<p>' + Object.entries(e.tags).filter(([k]) => !k.endsWith('_modelled'))
    .map(([k, x]) => `${k[0].toUpperCase() + k.slice(1)}: ${x}`).join(' · ') + '</p>';
  if (e.measured && e.measured.lateral_wall_mm != null) info.innerHTML += `<p>Lateral wall on this model: ${e.measured.lateral_wall_mm} mm`
    + ` (AO/OTA: >20.5 mm intact, ≤20.5 mm incompetent; Hsu 2013)</p>`;
  if (e.torn) info.innerHTML += `<p><b>Torn ligaments</b> (shown red): ${e.torn.join(', ')}. ${e.torn_basis || ''}</p>`;
  if (!e.file) { settle(); return; }
  const gltf = await fx.loader.loadAsync(REGION + 'fractures/' + (q ? e.files[q] : e.file));
  if (token !== fx.token) return;                  // another fracture was chosen meanwhile
  fx.group = gltf.scene;
  layerGroups.bones.add(fx.group);                 // follows the Bones tick box
  for (const name of e.bones) {
    const s = structures[name];
    if (s && s.node) { s.node.visible = false; fx.hidden.push(s.node); }
  }
  const biggest = {};
  // step and gap are shown for joint fractures only (types B and C, and the malleolar segment)
  const articular = e.segment === '44' || (['41', '43'].includes(e.segment) && e.code[2] !== 'A');
  for (const node of [...fx.group.children]) {
    const u = node.userData;
    node.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.matName = o.material.name;
      o.material = material(FX_MATERIAL[o.material.name] || 'bones');
      o.userData.fragLabel = `${e.id} · ${u.bone}: ${u.fragment}`;
      o.geometry.computeBoundsTree();
    });
    const holder = new THREE.Group();              // carries the explode offset
    fx.group.add(holder);
    holder.add(node);
    const dir = new THREE.Vector3(...u.centroid).sub(new THREE.Vector3(...u.site));
    const meta = e.fragments.find((x) => x.bone === u.bone && x.name === u.fragment) || {};
    const frame = frameOf(fx.data, u.bone);
    const site = new THREE.Vector3(...u.site);
    const f = { node, holder, dir: dir.lengthSq() ? dir.normalize() : dir, vol: u.volume_cm3, bone: u.bone,
      label: `${u.bone}: ${u.fragment}`, za: u.za_name || '', fixed: false, frame, site,
      isDistal: new THREE.Vector3(...u.centroid).sub(site).dot(frame.D) > 0,
      preset: meta.pose ? { pose: meta.pose } : (fx.data.displacements[meta.displace] || null), presetName: meta.displace || '',
      edge: articular && u.bone === 'tibia' ? articularEdge(node) : [], cortex: cortexPoints(node), ref: null, collider: null };
    node.userData.frag = f;
    fx.fragments.push(f);
    if (!biggest[u.bone] || f.vol > biggest[u.bone].vol) biggest[u.bone] = f;
  }
  // the main fragment: the one that carries the femoral head (in the hip socket) or holds the patella, else the largest
  if (e.anchor) for (const f of fx.fragments) if (f.node.userData.fragment === e.anchor) biggest[f.bone] = f;
  Object.values(biggest).forEach((f) => { f.fixed = true; });   // the main fragment stays in place
  for (const [name, fragName] of Object.entries(e.followers || {})) {
    // femur region: the leg follows the knee fragment; leg region (7a): the talus follows the plafond fragment
    const spec = (fx.data.follow || {})[name];
    const bone = spec ? spec.bone : 'femur', pivot = spec ? spec.pivot : fx.data.femur && fx.data.femur.knee_centre;
    const s = structures[name], frag = fx.fragments.find((f) => f.bone === bone && f.node.userData.fragment === fragName);
    if (s && s.node && frag && pivot) fx.followers.push({ node: s.node, frag, pivot, home: s.node.matrix.clone(), auto: s.node.matrixAutoUpdate });
  }
  for (const f of fx.fragments) f.ref = biggest[f.bone];
  fitColliders();
  placeAll();
  for (const f of fx.fragments) {             // a depressed fragment must also be free in its crushed zone
    for (const sh of [0.0011, 0.0014, 0.0018]) {
      if (f.fixed || !f.preset || !(f.preset.use_impaction || (f.preset.pose && f.preset.pose.impaction)) || f.collider.shrink >= sh) continue;
      if (!overlap(collider(f.ref), f.collider, new THREE.Matrix4(), f.displacedM)) break;
      f.collider = makeCollider(f.node, Math.max(sh, colliderSize(f)[0] + 0.0003), colliderSize(f)[1]);
    }
  }
  setSpread(fx.spread);
  setPosition(fx.position);
  settle();
}

// ---- Phase 7b: joints and ligaments on the page ----
function initJointsPanel() {
  document.getElementById('jointsec').hidden = false;
  const fib = document.getElementById('fibres'), ct = document.getElementById('cantear');
  fib.addEventListener('change', () => { joints.showFibres = fib.checked; });
  ct.addEventListener('change', () => { joints.canTear = ct.checked; });
  const bt = document.getElementById('stressbtns');
  for (const t of joints.cfg.stress_tests) {
    const b = document.createElement('button'); b.textContent = t.name; b.dataset.test = t.id;
    b.addEventListener('click', () => { joints.startStress(t.id); jointsPanel(); });
    bt.append(b);
  }
  const mk = (txt, fn) => { const b = document.createElement('button'); b.textContent = txt; b.addEventListener('click', () => { fn(); jointsPanel(); }); bt.append(b); };
  mk('Stop (let go)', () => joints.stopStress());
  mk('Repair all', () => joints.repairAll());
  mk('Tear / repair the selected ligament', () => { if (!selected || !joints.toggleLigament(selected)) joints.note = 'Select a ligament first (tap it, or its row in the table).'; });
  jointsPanel();
}
function jointsPanel() {           // torn groups as buttons (red = torn)
  if (!joints) return;
  const el = document.getElementById('tornlist');
  const groups = Object.keys(joints.cfg.groups).filter((g) => joints.tethers.some((t) => t.group === g));
  const torn = joints.tornGroups();
  el.innerHTML = '';
  for (const g of groups) {
    const b = document.createElement('button');
    b.textContent = g; b.className = torn.includes(g) ? 'torn' : '';
    b.title = torn.includes(g) ? 'Torn: click to repair' : 'Intact: click to tear';
    b.addEventListener('click', () => { joints.toggleGroup(g); jointsPanel(); });
    el.append(b);
  }
  for (const b of document.querySelectorAll('#stressbtns button[data-test]')) b.classList.toggle('on', !!(joints.stress && joints.stress.test.id === b.dataset.test));
  document.getElementById('cantear').checked = joints.canTear;
  jointsReadout();
}
function jointsReadout() {
  const st = joints.stress;
  document.getElementById('jointro').innerHTML = `<b>${st ? st.test.name + (st.k < 1 ? ' (pushing…)' : ' (end point)') : 'Talus against the tibia'}</b>`
    + joints.lines().map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
  const src = st ? st.test.sources.map((x) => `${x.ref}, PMID ${x.pmid}${x.claim ? ' (' + x.claim + ')' : ''}`).join('; ') : '';
  document.getElementById('jointnote').innerHTML = (joints.note ? joints.note : '') + (src ? `<br><small>Sources: ${src}</small>` : '');
  const tornNow = joints.tornGroups().join(',');
  if (tornNow !== jointsReadout.last) { jointsReadout.last = tornNow; if (jointsReadout.last !== undefined) jointsPanel(); }
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
  const hit = ray.intersectObjects(Object.values(layerGroups), true).find((h) => shown(h.object));
  if (hit && hit.object.userData.fragLabel) { select(null); label.textContent = hit.object.userData.fragLabel; return; }
  select(hit ? hit.object.userData.za_name : null);
  if (hit) structures[hit.object.userData.za_name].row.scrollIntoView({ block: 'nearest' });
});

function resize() {
  if (renderer.xr.isPresenting) return;
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();
let lastT = performance.now(), readoutAt = 0, jointsAt = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  sim.fps = sim.fps ? sim.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05 : 60;
  if (renderer.xr.isPresenting) xr.update(); else controls.update();
  if (stepPull(dt) && now - readoutAt > 200) { readoutAt = now; updateReadout(); }
  updateFollowers();
  if (joints) joints.step();
  if (joints && now - jointsAt > 200) { jointsAt = now; jointsReadout(); }
  tissue.update(4);
  // With a headset depth image three.js skips its own clear; clear to transparent so the room shows through.
  if (renderer.xr.isPresenting && renderer.xr.hasDepthSensing()) renderer.clear();
  renderer.render(scene, camera);
});

main().catch((err) => { label.textContent = 'Could not load assets: ' + err.message; console.error(err); });
