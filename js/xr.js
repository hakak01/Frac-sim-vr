// Phase 3: VR mode (WebXR). Pass-through ('immersive-ar') when the headset has it,
// else plain VR ('immersive-vr'). Works with controllers and with hand tracking.
//
//   Trigger or pinch while pointing at a fragment  -> hold and move that fragment
//   Trigger or pinch on empty space, or Grip       -> hold and move the whole model
//   Two hands on the whole model                   -> turn it and make it bigger or smaller
//   Point at the panel + trigger or pinch          -> fracture menu, explode, reset, exit
import * as THREE from 'three';

const TABLE_HEIGHT = 0.95;                 // metres from the floor to the middle of the model
const MODEL_AT = [0, TABLE_HEIGHT, -0.45]; // in front of where the user stood when VR started
const PANEL_AT = [-0.5, 1.2, -0.55];
const PANEL_W = 0.52, PANEL_H = 0.42, PX_PER_M = 2000;      // canvas 1040 x 840
const TABS = ['', '41', '42', '43', '44', '4F'];
const TAB_NAME = { '': 'Intact' };
const MAX_EXPLODE = 30;                    // mm
const SCALE_LIMITS = [0.25, 4];

export function initXR(v) {
  const { renderer, scene, stage, fx } = v;
  const btn = document.getElementById('xrbtn');
  const note = document.getElementById('xrnote');
  const api = { active: false, mode: null, update() {}, enter: null, panel: null, controllers: [] };
  if (!navigator.xr) {
    note.textContent = 'VR is not available in this browser. Open this page in the Meta Quest Browser.';
    return api;
  }

  // ---------------------------------------------------------------- panel
  const cv = document.createElement('canvas');
  cv.width = PANEL_W * PX_PER_M; cv.height = PANEL_H * PX_PER_M;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W, PANEL_H),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  panel.visible = false;
  scene.add(panel);
  const ui = { tab: '41', hover: '', regions: [] };

  function wrap(text, maxw, lines) {
    const out = []; let cur = '';
    for (const w of text.split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (g.measureText(t).width > maxw && cur) { out.push(cur); cur = w; } else cur = t;
    }
    out.push(cur);
    if (out.length > lines) { out.length = lines; out[lines - 1] = out[lines - 1].replace(/.{3}$/, '…'); }
    return out;
  }
  function button(x, y, w, h, text, action, on, font = 26) {
    g.fillStyle = on ? '#4fb3ff' : '#2b333d';
    g.beginPath(); g.roundRect(x, y, w, h, 10); g.fill();
    g.fillStyle = on ? '#06202f' : '#e8ebef';
    g.font = `600 ${font}px system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, x + w / 2, y + h / 2 + 1);
    ui.regions.push({ x, y, w, h, action });
  }
  function draw() {
    const W = cv.width;
    ui.regions = [];
    g.fillStyle = '#1d2229'; g.fillRect(0, 0, W, cv.height);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const e = fx.index[fx.current];
    g.fillStyle = '#e8ebef'; g.font = '700 36px system-ui, sans-serif';
    g.fillText(e ? e.id : 'Intact bones', 24, 50);
    g.fillStyle = '#9aa5b1'; g.font = '24px system-ui, sans-serif';
    if (e) {
      wrap(e.name + (e.qualification ? ' (' + e.qualification + ')' : ''), W - 48, 2)
        .forEach((l, i) => g.fillText(l, 24, 84 + i * 28));
    } else g.fillText('Choose a segment, then an AO/OTA code.', 24, 84);
    g.fillStyle = '#4fb3ff';
    g.fillText(ui.hover, 24, 146);
    const tw = (W - 48 - 5 * 8) / 6;
    TABS.forEach((t, i) => button(24 + i * (tw + 8), 160, tw, 60, TAB_NAME[t] || t,
      t === '' ? () => choose('') : () => { ui.tab = t; draw(); }, t === '' ? !fx.current : ui.tab === t));
    const list = Object.values(fx.index).filter((x) => x.segment === ui.tab && x.file);
    const cw = (W - 48 - 5 * 8) / 6;
    list.slice(0, 30).forEach((x, i) => button(24 + (i % 6) * (cw + 8), 236 + Math.floor(i / 6) * 72, cw, 64,
      x.id, () => choose(x.id), x.id === fx.current, x.id.length > 7 ? 21 : 26));
    // explode slider
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#e8ebef'; g.font = '26px system-ui, sans-serif';
    g.fillText(`Explode: ${fx.spread} mm`, 24, 632);
    g.fillStyle = '#3a444f'; g.beginPath(); g.roundRect(60, 660, W - 120, 12, 6); g.fill();
    const kx = 60 + (W - 120) * fx.spread / MAX_EXPLODE;
    g.fillStyle = '#4fb3ff'; g.beginPath(); g.arc(kx, 666, 22, 0, 6.3); g.fill();
    ui.regions.push({ x: 24, y: 636, w: W - 48, h: 64, slider: true });
    button(24, 724, (W - 56) / 2, 92, 'Reset', reset, false, 32);
    button(32 + (W - 56) / 2, 724, (W - 56) / 2, 92, 'Exit VR', () => renderer.xr.getSession().end(), false, 32);
    tex.needsUpdate = true;
  }
  async function choose(id) {
    ui.hover = '';
    const p = v.showFracture(id);
    draw();
    await p;
    draw();
  }
  function setExplode(mm) {
    if (mm === fx.spread) return;
    v.setSpread(mm);
    draw();
  }
  function hover(text) {
    if (text === ui.hover) return;
    ui.hover = text;
    draw();
  }

  // ---------------------------------------------------------------- placement
  // Supine leg: knee to the user's left, ankle to the right, front of the leg up.
  const HOME = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0)).setPosition(...MODEL_AT);
  function setStage(m) { m.decompose(stage.position, stage.quaternion, stage.scale); stage.updateMatrixWorld(true); }
  function reset() {
    v.resetFragments();
    v.setSpread(0);
    setStage(HOME);
    for (const c of ctrls) c.userData.hold = null;
    draw();
  }

  // ---------------------------------------------------------------- controllers and hands
  const caster = new THREE.Raycaster();
  caster.firstHitOnly = true;
  const M = () => new THREE.Matrix4();
  const tmp = { o: new THREE.Vector3(), d: new THREE.Vector3(), m: M(), inv: M() };
  const ctrls = [0, 1].map((i) => {
    const c = renderer.xr.getController(i);          // pointing ray of a controller or of a hand
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, -1)]),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), new THREE.MeshBasicMaterial({ color: 0x4fb3ff }));
    dot.visible = false;
    c.add(line);
    scene.add(c, dot);
    Object.assign(c.userData, { line, dot, hold: null, slider: false, over: null, connected: false });
    c.addEventListener('connected', () => { c.userData.connected = true; });
    c.addEventListener('disconnected', () => { c.userData.connected = false; c.userData.hold = null; c.userData.slider = false; dot.visible = false; });
    c.addEventListener('selectstart', () => press(c, false));
    c.addEventListener('squeezestart', () => press(c, true));
    c.addEventListener('selectend', () => release(c));
    c.addEventListener('squeezeend', () => release(c));
    c.visible = false;
    return c;
  });
  api.controllers = ctrls;

  function point(c) {                        // what the ray of this controller hits
    tmp.o.setFromMatrixPosition(c.matrix);
    tmp.d.set(0, 0, -1).transformDirection(c.matrix);
    caster.set(tmp.o, tmp.d);
    caster.far = 3;
    const p = caster.intersectObject(panel, false)[0];
    if (p) {
      const x = p.uv.x * cv.width, y = (1 - p.uv.y) * cv.height;
      return { panel: true, x, y, region: ui.regions.find((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h), point: p.point, distance: p.distance };
    }
    if (!fx.fragments.length || !v.layerGroups.bones.visible) return null;
    const h = caster.intersectObjects(fx.fragments.map((f) => f.node), true)[0];
    if (!h) return null;
    let n = h.object;
    while (n && !n.userData.frag) n = n.parent;
    return n ? { frag: n.userData.frag, point: h.point, distance: h.distance } : null;
  }

  const modelHolds = () => ctrls.filter((c) => c.userData.hold && c.userData.hold.model);
  function rebase() {                        // remember where things are when a hold starts or ends
    stage.updateMatrixWorld(true);
    const hs = modelHolds();
    if (hs.length === 1) hs[0].userData.hold.offset = M().copy(hs[0].matrix).invert().multiply(stage.matrix);
    if (hs.length === 2) {
      const a = new THREE.Vector3().setFromMatrixPosition(hs[0].matrix), b = new THREE.Vector3().setFromMatrixPosition(hs[1].matrix);
      two = { mid: a.clone().add(b).multiplyScalar(0.5), vec: b.clone().sub(a), m0: stage.matrix.clone(), s0: stage.scale.x };
    }
  }
  let two = null;

  function press(c, grip) {
    if (c.userData.hold || c.userData.slider) return;
    const hit = grip ? null : point(c);
    if (hit && hit.panel) {
      if (hit.region && hit.region.slider) c.userData.slider = true;
      else if (hit.region) hit.region.action();
      return;
    }
    stage.updateMatrixWorld(true);
    if (hit && hit.frag) {
      const n = hit.frag.node;
      c.userData.hold = { frag: hit.frag, offset: M().copy(c.matrix).invert().multiply(n.matrixWorld) };
      hover(hit.frag.label);
    } else {
      c.userData.hold = { model: true };
      rebase();
    }
  }
  function release(c) {
    c.userData.slider = false;
    if (!c.userData.hold) return;
    const wasModel = c.userData.hold.model;
    c.userData.hold = null;
    if (wasModel) rebase();
  }

  api.update = () => {
    for (const c of ctrls) {
      const u = c.userData;
      c.visible = u.connected;
      if (!u.connected) continue;
      c.updateMatrix();
      if (u.hold && u.hold.frag) {                               // carry one fragment
        const n = u.hold.frag.node;
        tmp.m.multiplyMatrices(c.matrix, u.hold.offset);
        n.parent.updateWorldMatrix(true, false);
        tmp.m.premultiply(tmp.inv.copy(n.parent.matrixWorld).invert());
        tmp.m.decompose(n.position, n.quaternion, n.scale);
        u.dot.visible = false; u.line.scale.z = 0.05;
        continue;
      }
      if (u.hold) { u.dot.visible = false; u.line.scale.z = 0.05; continue; }
      const hit = point(c);
      u.dot.visible = !!hit;
      u.line.scale.z = hit ? hit.distance : 0.6;
      if (hit) u.dot.position.copy(hit.point);
      if (u.slider && hit && hit.panel) setExplode(Math.round(THREE.MathUtils.clamp((hit.x - 60) / (cv.width - 120), 0, 1) * MAX_EXPLODE));
      u.over = hit && hit.frag ? hit.frag.label : null;
    }
    const hs = modelHolds();
    if (hs.length === 1) setStage(tmp.m.multiplyMatrices(hs[0].matrix, hs[0].userData.hold.offset));
    if (hs.length === 2 && two) {                                // both hands: move, turn, scale
      const a = new THREE.Vector3().setFromMatrixPosition(hs[0].matrix), b = new THREE.Vector3().setFromMatrixPosition(hs[1].matrix);
      const vec = b.clone().sub(a), mid = a.add(b).multiplyScalar(0.5);
      let s = vec.length() / Math.max(two.vec.length(), 1e-4);
      s = THREE.MathUtils.clamp(two.s0 * s, ...SCALE_LIMITS) / two.s0;
      const q = new THREE.Quaternion().setFromUnitVectors(two.vec.clone().normalize(), vec.normalize());
      const m = M().makeTranslation(mid.x, mid.y, mid.z)
        .multiply(M().makeRotationFromQuaternion(q)).multiply(M().makeScale(s, s, s))
        .multiply(M().makeTranslation(-two.mid.x, -two.mid.y, -two.mid.z)).multiply(two.m0);
      setStage(m);
    }
    if (!ctrls.some((c) => c.userData.hold && c.userData.hold.frag)) {
      const over = ctrls.map((c) => c.userData.over).find(Boolean) || '';
      hover(over);
    }
  };

  // ---------------------------------------------------------------- start and stop
  const floor = new THREE.GridHelper(4, 16, 0x3a4450, 0x2a323b);   // only in plain VR (no pass-through)
  floor.visible = false;
  scene.add(floor);
  let saved = null;

  api.enter = async () => {
    const session = await navigator.xr.requestSession(api.mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] });
    saved = { layers: Object.fromEntries(Object.entries(v.layerGroups).map(([k, gr]) => [k, gr.visible])),
      cam: [v.camera.position.clone(), v.camera.quaternion.clone(), v.camera.fov] };
    for (const [k, gr] of Object.entries(v.layerGroups)) gr.visible = k === 'bones';   // soft tissue comes in Phase 5
    renderer.xr.setReferenceSpaceType('local-floor');
    await renderer.xr.setSession(session);
    api.active = true;
    v.controls.enabled = false;
    setStage(HOME);
    panel.position.set(...PANEL_AT);
    panel.lookAt(0, PANEL_AT[1], 0.2);
    panel.visible = true;
    floor.visible = api.mode !== 'immersive-ar';
    if (fx.index[fx.current]) ui.tab = fx.index[fx.current].segment;
    draw();
    session.addEventListener('end', () => {
      api.active = false;
      panel.visible = false; floor.visible = false;
      for (const c of ctrls) { c.visible = false; c.userData.dot.visible = false; c.userData.hold = null; c.userData.slider = false; }
      setStage(M());
      for (const [k, gr] of Object.entries(v.layerGroups)) gr.visible = saved.layers[k];
      v.camera.position.copy(saved.cam[0]); v.camera.quaternion.copy(saved.cam[1]);
      v.camera.fov = saved.cam[2];              // three.js changes the field of view while in VR
      v.controls.enabled = true;
      v.resize();
    });
  };

  Promise.all(['immersive-ar', 'immersive-vr'].map((m) => navigator.xr.isSessionSupported(m).catch(() => false))).then(([ar, vr]) => {
    api.mode = ar ? 'immersive-ar' : vr ? 'immersive-vr' : null;
    if (!api.mode) { note.textContent = 'No headset found. Open this page in the Meta Quest Browser to use VR.'; return; }
    btn.textContent = ar ? 'Enter VR (pass-through)' : 'Enter VR';
    btn.hidden = false;
    btn.addEventListener('click', () => api.enter().catch((err) => { note.textContent = 'Could not start VR: ' + err.message; }));
    note.textContent = 'In VR: point and pull the trigger (or pinch) on a fragment to hold it; on empty space or with the grip to hold the whole model; use both hands to turn and resize.';
  });
  api.panel = panel;
  api.ui = ui;
  return api;
}
