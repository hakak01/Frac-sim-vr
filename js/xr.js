// VR mode (WebXR). Pass-through ('immersive-ar') when the headset has it, else plain VR
// ('immersive-vr'). Works with controllers and with hand tracking.
//
//   Trigger or pinch while pointing at a fragment  -> hold and move that fragment
//   Trigger or pinch on empty space, or Grip       -> hold and move the whole model
//   Two hands on the whole model                   -> turn it and make it bigger or smaller
//   Point at the panel + trigger or pinch          -> menu: fracture, explode, ghost, layers,
//                                                     displaced / reduced, collision, muscle pull
// The strip under the panel is the live readout of the fragment last held or pointed at.
import * as THREE from 'three';

const TABLE_HEIGHT = 0.95;                 // metres from the floor to the middle of the model
const MODEL_AT = [0, TABLE_HEIGHT, -0.45]; // in front of where the user stood when VR started
const PANEL_AT = [-0.55, 1.25, -0.55];
const PX_PER_M = 2000;
const PW = 1240, PH = 880, SH = 240;       // panel and readout strip, canvas pixels
const LAYERS = [['bones', 'Bones'], ['muscles', 'Muscles'], ['joints', 'Joints'], ['arteries', 'Arteries'], ['veins', 'Veins'], ['nerves', 'Nerves'], ['skin', 'Skin']];
const MAX_EXPLODE = 30;                    // mm
const SCALE_LIMITS = [0.25, 4];

export function initXR(v) {
  const { renderer, scene, stage, fx, sim } = v;
  const btn = document.getElementById('xrbtn');
  const note = document.getElementById('xrnote');
  const api = { active: false, mode: null, update() {}, enter: null, panel: null, controllers: [] };
  if (!navigator.xr) {
    note.textContent = 'VR is not available in this browser. Open this page in the Meta Quest Browser.';
    return api;
  }

  // ---------------------------------------------------------------- panel and readout strip
  function board(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w / PX_PER_M, h / PX_PER_M), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    return { cv, g: cv.getContext('2d'), tex, mesh };
  }
  const P = board(PW, PH), S = board(PW, SH);
  const g = P.g, panel = P.mesh;
  panel.visible = false;
  scene.add(panel);
  panel.add(S.mesh);
  S.mesh.position.y = -(PH + SH) / 2 / PX_PER_M - 0.006;
  // segment tabs come from the region's fracture list (41-44, 4F for the leg; 31-34 for the thigh)
  const tabs = () => ['', ...new Set(Object.values(fx.index).map((x) => x.segment))];
  const ui = { tab: tabs()[1] || '', sel: null, regions: [] };

  function wrap(ctx, text, maxw, lines) {
    const out = []; let cur = '';
    for (const w of text.split(' ')) {
      const t = cur ? cur + ' ' + w : w;
      if (ctx.measureText(t).width > maxw && cur) { out.push(cur); cur = w; } else cur = t;
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
  function row(y, h, items, font) {                      // equal buttons across the panel
    const w = (PW - 48 - (items.length - 1) * 8) / items.length;
    items.forEach(([text, action, on], i) => button(24 + i * (w + 8), y, w, h, text, action, on, font));
  }
  function slider(x, w, y, text, frac, name) {
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = '#e8ebef'; g.font = '26px system-ui, sans-serif';
    g.fillText(text, x, y);
    g.fillStyle = '#3a444f'; g.beginPath(); g.roundRect(x + 30, y + 26, w - 60, 12, 6); g.fill();
    g.fillStyle = '#4fb3ff'; g.beginPath(); g.arc(x + 30 + (w - 60) * frac, y + 32, 20, 0, 6.3); g.fill();
    ui.regions.push({ x, y: y + 2, w, h: 62, slider: name, x0: x + 30, x1: x + w - 30 });
  }
  function draw() {
    ui.regions = [];
    g.fillStyle = '#1d2229'; g.fillRect(0, 0, PW, PH);
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const e = fx.index[fx.current];
    g.fillStyle = '#e8ebef'; g.font = '700 36px system-ui, sans-serif';
    g.fillText(e ? e.id : 'Intact bones', 24, 50);
    g.fillStyle = '#9aa5b1'; g.font = '24px system-ui, sans-serif';
    if (e) wrap(g, e.name + (e.qualification ? ' (' + e.qualification + ')' : ''), PW - 48, 2).forEach((l, i) => g.fillText(l, 24, 84 + i * 28));
    else g.fillText('Choose a segment, then an AO/OTA code.', 24, 84);
    row(150, 56, tabs().map((t) => [t || 'Intact', t === '' ? () => choose('') : () => { ui.tab = t; draw(); }, t === '' ? !fx.current : ui.tab === t]));
    const list = Object.values(fx.index).filter((x) => x.segment === ui.tab && x.file).slice(0, 30);
    const cw = (PW - 48 - 5 * 8) / 6;
    list.forEach((x, i) => button(24 + (i % 6) * (cw + 8), 216 + Math.floor(i / 6) * 62, cw, 54, x.id, () => choose(x.id), x.id === fx.current, x.id.length > 7 ? 22 : 26));
    slider(24, PW / 2 - 36, 556, `Explode: ${fx.spread} mm`, fx.spread / MAX_EXPLODE, 'explode');
    const gh = Math.round(v.tissue().ghost * 100);
    slider(PW / 2 + 12, PW / 2 - 36, 556, `Soft tissue ghost: ${gh} %`, gh / 100, 'ghost');
    row(634, 56, LAYERS.filter(([id]) => v.layerGroups[id]).map(([id, name]) => [name, () => { v.setLayer(id, !v.layerGroups[id].visible); draw(); }, v.layerGroups[id].visible]));
    row(700, 60, [
      ['Displaced', () => { v.setPosition('displaced'); draw(); }, fx.position === 'displaced'],
      ['Reduced', () => { v.setPosition('reduced'); draw(); }, fx.position === 'reduced'],
      [`Bone blocks bone: ${sim.collide ? 'on' : 'off'}`, () => { sim.collide = !sim.collide; sim.note = ''; sim.slow = 0; v.syncToggles(); draw(); }, sim.collide],
      [`Muscle pull: ${sim.pull ? 'on' : 'off'}`, () => { sim.pull = !sim.pull; v.syncToggles(); draw(); }, sim.pull],
    ], 24);
    const bq = fx.index[fx.current] && fx.index[fx.current].files ? [[`Bone: ${fx.shownQuality === 'elderly' ? 'elderly' : 'young'}`,
      async () => { await v.setQuality(fx.shownQuality === 'elderly' ? 'young' : 'elderly'); draw(); }, false]] : [];
    row(772, 84, [['Reset view', resetView, false], ...bq, ['Exit VR', () => renderer.xr.getSession().end(), false]], 32);
    P.tex.needsUpdate = true;
  }
  let stripText = '';
  function drawStrip() {                                  // live readout
    const f = ui.sel && fx.fragments.includes(ui.sel) ? ui.sel : null;
    const lines = f && !f.fixed ? v.readoutLines(v.measure(f, f.ref)) : (v.femurLines ? v.femurLines() : []);   // femur summary otherwise
    const head = f ? `${f.label}${f.fixed ? '  (main fragment: the others are measured against it)' : ''}` : 'Point at a fragment to see its displacement.';
    const foot = `${Math.round(sim.fps)} fps` + (v.tissue().busy ? ' · tying soft tissue to the fragments…' : '') + (sim.note ? ' · ' + sim.note : '');
    const text = head + lines.map((l) => l.join(' ')).join('|') + foot;
    if (text === stripText) return;
    stripText = text;
    const c = S.g;
    c.fillStyle = '#141a20'; c.fillRect(0, 0, PW, SH);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#4fb3ff'; c.font = '600 28px system-ui, sans-serif';
    c.fillText(head, 24, 40);
    lines.forEach(([k, val], i) => {
      const x = 24 + (i % 2) * (PW / 2), y = 84 + Math.floor(i / 2) * 44;
      c.fillStyle = '#9aa5b1'; c.font = '26px system-ui, sans-serif';
      c.fillText(k, x, y);
      c.fillStyle = '#e8ebef';
      let size = 28;                                   // shrink long values to fit the column
      do { c.font = `600 ${size}px system-ui, sans-serif`; size -= 2; } while (size > 16 && c.measureText(val).width > PW / 2 - 250);
      c.fillText(val, x + 205, y);
    });
    c.fillStyle = '#9aa5b1'; c.font = '22px system-ui, sans-serif';
    c.fillText(foot, 24, SH - 14);
    S.tex.needsUpdate = true;
  }
  async function choose(id) {
    ui.sel = null;
    const p = v.showFracture(id);
    draw();
    await p;
    draw();
  }

  // ---------------------------------------------------------------- placement
  // Supine leg: knee to the user's left, ankle to the right, front of the leg up.
  const HOME = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0)).setPosition(...MODEL_AT);
  function setStage(m) { m.decompose(stage.position, stage.quaternion, stage.scale); stage.updateMatrixWorld(true); }
  function resetView() {
    setStage(HOME);
    for (const c of ctrls) if (c.userData.hold && c.userData.hold.model) c.userData.hold = null;
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
    Object.assign(c.userData, { line, dot, hold: null, slider: null, over: null, connected: false });
    c.addEventListener('connected', () => { c.userData.connected = true; });
    c.addEventListener('disconnected', () => { c.userData.connected = false; drop(c); c.userData.slider = null; dot.visible = false; });
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
      const x = p.uv.x * PW, y = (1 - p.uv.y) * PH;
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
  let two = null;
  function rebase() {                        // remember where things are when a hold starts or ends
    stage.updateMatrixWorld(true);
    const hs = modelHolds();
    if (hs.length === 1) hs[0].userData.hold.offset = M().copy(hs[0].matrix).invert().multiply(stage.matrix);
    if (hs.length === 2) {
      const a = new THREE.Vector3().setFromMatrixPosition(hs[0].matrix), b = new THREE.Vector3().setFromMatrixPosition(hs[1].matrix);
      two = { mid: a.clone().add(b).multiplyScalar(0.5), vec: b.clone().sub(a), m0: stage.matrix.clone(), s0: stage.scale.x };
    }
  }

  function press(c, grip) {
    if (c.userData.hold || c.userData.slider) return;
    const hit = grip ? null : point(c);
    if (hit && hit.panel) {
      if (hit.region && hit.region.slider) c.userData.slider = hit.region;
      else if (hit.region) hit.region.action();
      return;
    }
    stage.updateMatrixWorld(true);
    if (hit && hit.frag && !hit.frag.held) {
      const f = hit.frag;
      f.held = true;
      f.touch = null;
      c.userData.hold = { frag: f, offset: M().copy(c.matrix).invert().multiply(f.node.matrixWorld) };
      ui.sel = f;
    } else {
      c.userData.hold = { model: true };
      rebase();
    }
  }
  function drop(c) {
    const h = c.userData.hold;
    c.userData.hold = null;
    if (h && h.frag) { h.frag.held = false; v.updateReadout(); }
    if (h && h.model) rebase();
  }
  function release(c) {
    c.userData.slider = null;
    drop(c);
  }

  let stripAt = 0;
  api.update = () => {
    for (const c of ctrls) {
      const u = c.userData;
      c.visible = u.connected;
      if (!u.connected) continue;
      c.updateMatrix();
      if (u.hold && u.hold.frag) {                               // carry one fragment (bone stops at bone)
        const n = u.hold.frag.node;
        tmp.m.multiplyMatrices(c.matrix, u.hold.offset);
        n.parent.updateWorldMatrix(true, false);
        tmp.m.premultiply(tmp.inv.copy(n.parent.matrixWorld).invert());
        v.advance(u.hold.frag, tmp.m);
        u.dot.visible = false; u.line.scale.z = 0.05;
        continue;
      }
      if (u.hold) { u.dot.visible = false; u.line.scale.z = 0.05; continue; }
      const hit = point(c);
      u.dot.visible = !!hit;
      u.line.scale.z = hit ? hit.distance : 0.6;
      if (hit) u.dot.position.copy(hit.point);
      if (u.slider && hit && hit.panel) {
        const fr = THREE.MathUtils.clamp((hit.x - u.slider.x0) / (u.slider.x1 - u.slider.x0), 0, 1);
        if (u.slider.slider === 'explode') { const mm = Math.round(fr * MAX_EXPLODE); if (mm !== fx.spread) { v.setSpread(mm); draw(); } }
        else { const pc = Math.round(fr * 20) * 5; if (pc !== Math.round(v.tissue().ghost * 100)) { v.setGhost(pc); draw(); } }
      }
      if (hit && hit.frag && !ctrls.some((k) => k.userData.hold && k.userData.hold.frag)) ui.sel = hit.frag;
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
    const now = performance.now();
    if (now - stripAt > 120) { stripAt = now; drawStrip(); }      // readout about 8 times a second
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
    for (const k of Object.keys(v.layerGroups)) v.setLayer(k, k === 'bones');   // start with bones; layers are on the panel
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
    else if (!ui.tab) ui.tab = tabs()[1] || '';
    draw(); stripText = ''; drawStrip();
    session.addEventListener('end', () => {
      api.active = false;
      panel.visible = false; floor.visible = false;
      for (const c of ctrls) { c.visible = false; c.userData.dot.visible = false; drop(c); c.userData.slider = null; }
      setStage(M());
      for (const k of Object.keys(v.layerGroups)) v.setLayer(k, saved.layers[k]);
      v.camera.position.copy(saved.cam[0]); v.camera.quaternion.copy(saved.cam[1]);
      v.camera.fov = saved.cam[2];              // three.js changes the field of view while in VR
      v.controls.enabled = true;
      v.resize();
      v.updateReadout();
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
  api.draw = draw;
  return api;
}
