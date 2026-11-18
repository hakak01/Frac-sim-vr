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
  // the region's main bone (data: main_bone in regions/<id>.json), for the length in the subtitle
  const len = (s) => s.bbox_max[2] - s.bbox_min[2];
  const bones = manifest.layers.bones.structures;
  const main = bones.find((s) => s.name === manifest.main_bone) || bones.filter((s) => !s.context_only).sort((a, b) => len(b) - len(a))[0];
  const mm = (len(main) * 1000).toFixed(0);
  document.getElementById('sub').textContent = `${manifest.title} · true scale (${main.name.replace(/\.[rl]$/, '').toLowerCase()} ${mm} mm long)`;
  initRegions();
  select(null);
  await initFractures(loader);
  tissue = initTissue({ layerGroups, fx, collider, boneColliders,
    softMaterials: () => ['muscles', 'tendon', 'joints', 'arteries', 'veins', 'nerves', 'skin'].map(material) });
  tissue.rebind();
  const gh = document.getElementById('ghost');
  gh.addEventListener('input', () => setGhost(+gh.value));
  document.getElementById('pull').addEventListener('change', (ev) => { sim.pull = ev.target.checked; });
  document.getElementById('collide').addEventListener('change', (ev) => { sim.collide = ev.target.checked; sim.note = ''; sim.slow = 0; syncToggles(); });
  xr = initXR({ renderer, scene, camera, controls, stage, layerGroups, fx, showFracture, setSpread,
    resetFragments, setPosition, collider, boneColliders, updateReadout, resize, advance, sim, measure, readoutLines,
    setGhost, syncToggles, tissue: () => tissue, setLayer, setQuality });
  window.viewer = { THREE, camera, controls, scene, stage, root, showFracture, setSpread, resetFragments, setPosition,
    measure, collider, overlap, advance, sim, tissue, setGhost, setLayer, setQuality, fx, xr,
    layerGroups, renderer, ready: true };   // for testing
}

// ---- Phase 2: pre-cut fractures -------------------------------------------
const fx = { index: {}, data: null, group: null, hidden: [], fragments: [], loader: null, spread: 0, token: 0, current: '',
  position: 'displaced',        // position: 'displaced' (typical displacement) or 'reduced' (anatomical)
  quality: '', shownQuality: '' };   // bone quality chosen ('' = the fracture's default) and the one shown
let xr = { update() {} };
let tissue = { update() {}, rebind() {}, setGhost() {} };

function setGhost(percent) {                 // 100 = solid soft tissue, 0 = invisible
  document.getElementById('ghost').value = percent;
  document.getElementById('ghostv').textContent = percent + ' %';
  tissue.setGhost(percent / 100);
}
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
  44: '44 Malleolar segment', '4F': '4F Fibula' };

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
function boneColliders() {          // intact bones that are on screen (not replaced by fragments)
  return Object.values(structures).filter((s) => s.layer === 'bones' && s.node && s.node.visible).map(collider);
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
  if (f.preset.use_impaction) return m;      // a depressed fragment sits in the crushed zone cut for it
  const a = collider(f);
  // against everything placed so far, and the pieces still to be placed, at their home position
  // (pairs that already touch at home are left out)
  const blockers = waiting.filter((o) => !overlap(collider(o), a, I, I));
  const hits = (pose) => placed.some(([c, w]) => overlap(c, a, w, pose)) || blockers.some((o) => overlap(o.collider, a, I, pose));
  if (!hits(m)) return m;
  // Not free: try smaller versions of the deformity, cheapest first. Cost in "mm": shortening
  // given up counts 1 per mm; deformity given up counts 10 per 100 %; moving the fragment
  // further apart counts 1.5 per mm along the bone, 1 per mm outward (small pieces only).
  const axial = f.frame.D.clone().multiplyScalar(f.isDistal ? 1 : -1), sh = f.preset.shortening_mm || 0;
  const piece = !!(f.preset.away_mm || f.preset.proximal_mm || f.preset.use_impaction);
  const moves = [[null, 0, 0]];
  for (let d = 1; d <= 10; d++) moves.push([axial, d, 1.5 * d]);
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
  for (const f of fx.fragments) if (f.fixed) { f.displacedM = I.clone(); placed.push([collider(f), I]); }
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
    ...Object.values(structures).filter((s) => s.layer === 'bones' && s.node && s.node.visible).map((s) => [collider(s), s])];
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
  el.innerHTML = fx.fragments.filter((f) => !f.fixed).map((f) => `<div class="ro"><b>${f.label}</b>`
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
  Object.assign(fx, { group: null, hidden: [], fragments: [] });
  const info = document.getElementById('fxinfo');
  info.innerHTML = '';
  document.getElementById('readout').innerHTML = '';
  select(null);
  const e = fx.index[id];
  if (!e) { tissue.rebind(); return; }
  const src = e.sources.map((s) => `<li>${s.ref}${s.page ? ', p. ' + s.page : ''}. PMID ${s.pmid}</li>`).join('');
  info.innerHTML = `<p><b>${e.id}</b> ${e.name}</p>`
    + (e.qualification ? `<p>Shown: ${e.qualification}</p>` : '')
    + (e.soft_tissue ? `<p>${e.soft_tissue}</p>` : '')
    + (e.fragments.length ? `<p>${e.fragments.length} fragments, ${num(e.triangles)} triangles, ${kb(e.bytes)}</p>` : '')
    + (e.note ? `<p>${e.note}</p>` : '') + `<p>${e.line_basis}</p><ul>${src}</ul>`
    + '<p>Cortex thickness is modelled, not measured.</p>';
  // where the typical displacement of each moving fragment comes from
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
  if (!e.file) { tissue.rebind(); return; }
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
      label: `${u.bone}: ${u.fragment}`, fixed: false, frame, site,
      isDistal: new THREE.Vector3(...u.centroid).sub(site).dot(frame.D) > 0,
      preset: fx.data.displacements[meta.displace] || null, presetName: meta.displace || '',
      edge: articular && u.bone === 'tibia' ? articularEdge(node) : [], cortex: cortexPoints(node), ref: null, collider: null };
    node.userData.frag = f;
    fx.fragments.push(f);
    if (!biggest[u.bone] || f.vol > biggest[u.bone].vol) biggest[u.bone] = f;
  }
  Object.values(biggest).forEach((f) => { f.fixed = true; });   // the main fragment stays in place
  for (const f of fx.fragments) f.ref = biggest[f.bone];
  fitColliders();
  placeAll();
  for (const f of fx.fragments) {             // a depressed fragment must also be free in its crushed zone
    for (const sh of [0.0011, 0.0014, 0.0018]) {
      if (f.fixed || !f.preset || !f.preset.use_impaction || f.collider.shrink >= sh) continue;
      if (!overlap(collider(f.ref), f.collider, new THREE.Matrix4(), f.displacedM)) break;
      f.collider = makeCollider(f.node, Math.max(sh, colliderSize(f)[0] + 0.0003), colliderSize(f)[1]);
    }
  }
  setSpread(fx.spread);
  setPosition(fx.position);
  tissue.rebind();
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
  if (renderer.xr.isPresenting) return;
  const w = view.clientWidth, h = view.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(view);
resize();
let lastT = performance.now(), readoutAt = 0;
renderer.setAnimationLoop(() => {
  const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  sim.fps = sim.fps ? sim.fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05 : 60;
  if (renderer.xr.isPresenting) xr.update(); else controls.update();
  if (stepPull(dt) && now - readoutAt > 200) { readoutAt = now; updateReadout(); }
  tissue.update(4);
  renderer.render(scene, camera);
});

main().catch((err) => { label.textContent = 'Could not load assets: ' + err.message; console.error(err); });
