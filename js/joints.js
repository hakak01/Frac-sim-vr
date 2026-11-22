// Phase 7b: joints and ligament tethers.
//
// Data: assets/<region>/joint_model.json (tools/joint_model.py: joint contact points from the cartilage,
// ligament fibres from the Z-Anatomy ligament meshes) and ligament_model.json (teaching values, stress
// tests with their sources). Torn ligaments of a fracture come from its row in fractures.json ("torn").
//
// How it works (a teaching model, no forces in newtons): every bone that is not fixed is a free "body".
//   * a ligament fibre is slack up to the toe strain, then it holds (hard limit);
//   * joint surfaces do not pass through each other (hard limit at the cartilage contact points);
//   * a soft "seat" (soft tissue, muscle tone) brings a free bone back to its place;
//   * the user's hand, or the examiner's push in a stress test, moves a bone; the rest follows.
// Solved by a few rounds of position corrections each frame (position-based dynamics, Mueller et al.).
// Fragments of a cut bone are moved only by the user; ligaments tied to them pull the free bones.
import * as THREE from 'three';

const AX = { anterior: new THREE.Vector3(0, 0, 1), up: new THREE.Vector3(0, 1, 0), medial: new THREE.Vector3(1, 0, 0) };  // right limb, GLB axes

export async function initJoints(v) {
  let data, cfg;
  try {
    const r = await fetch(v.region + 'joint_model.json');
    if (!r.ok) return null;
    data = await r.json();
    cfg = await (await fetch('./ligament_model.json')).json();
  } catch (e) { return null; }
  const S = v.structures, layer = v.layerGroups.bones, fx = v.fx;
  const TOE = cfg.fibres.toe_strain.value, TEAR = cfg.fibres.tear_strain.value, SOL = cfg.solver;
  const ALLOW = SOL.contact_allowance_mm / 1000;
  // layer space = the bones layer's own axes (GLB metres); the stage (moved, turned, scaled in VR) is outside it
  const invLayer = new THREE.Matrix4();
  const rel = (o) => {
    layer.updateWorldMatrix(true, false);
    o.updateWorldMatrix(true, false);
    return new THREE.Matrix4().multiplyMatrices(invLayer.copy(layer.matrixWorld).invert(), o.matrixWorld);
  };
  const homeRel = new Map();                          // node -> its matrix in layer space at home
  const parentRel = new Map();
  for (const s of Object.values(S)) if (s.layer === 'bones' && s.node) { homeRel.set(s.node, rel(s.node)); parentRel.set(s.node, rel(s.node.parent)); }

  const api = { region: data.region.startsWith('foot') ? 'foot' : 'leg', pieceNodes: [], data, cfg, torn: new Set(), canTear: false, showFibres: true, stress: null, held: null, note: '',
    bodies: [], fibres: [], contacts: [], tethers: data.tethers, groupsTorn: new Set(), rest: {}, out: {}, tick: 0 };
  // ---- bodies ----------------------------------------------------------------------------------------
  const T = { m: new THREE.Matrix4(), v: new THREE.Vector3(), w: new THREE.Vector3(), q: new THREE.Quaternion(), r: new THREE.Vector3(), n: new THREE.Vector3() };
  function centre(nodes) {
    const box = new THREE.Box3();
    for (const n of nodes) n.traverse((o) => { if (o.isMesh) { o.geometry.computeBoundingBox(); box.union(o.geometry.boundingBox.clone().applyMatrix4(rel(o))); } });
    return box;
  }
  function makeBody(name, nodes, dyn, extra = {}) {
    const box = centre(nodes), c0 = box.getCenter(new THREE.Vector3()), r = Math.max(0.006, 0.3 * box.getSize(new THREE.Vector3()).length());
    return { name, nodes, dyn, c0, x: c0.clone(), q: new THREE.Quaternion(), invM: dyn ? 1 : 0, invI: dyn ? 1 / (r * r) : 0,
      P: new THREE.Matrix4(), base: null, top: box.max.y, ...extra };
  }
  const isCut = (name) => fx.fragments.some((f) => f.za === name);
  let bodyOf = {}, fragBody = new Map(), mode = 'free';
  // which body carries a home point of bone `name` (a fragment if that bone is cut)
  const hitT = {};
  function endFor(name, p) {
    if (!isCut(name)) return bodyOf[name] ? { body: bodyOf[name], p } : null;
    let best = null, bd = 0.003;
    for (const f of fx.fragments) {
      if (f.za !== name) continue;
      f.node.updateWorldMatrix(true, true);
      const inv = new THREE.Matrix4().copy(f.node.matrixWorld).invert();
      f.node.traverse((o) => {
        if (!o.isMesh || !o.geometry.boundsTree) return;
        const Mn = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);           // mesh inside the fragment (home = layer space)
        const loc = p.clone().applyMatrix4(Mn.clone().invert());
        const h = o.geometry.boundsTree.closestPointToPoint(loc, hitT);
        if (h && h.distance < bd) { bd = h.distance; best = f; }
      });
    }
    if (!best) return null;
    if (!fragBody.has(best)) fragBody.set(best, { name: best.label, frag: best, nodes: [best.node], dyn: false, invM: 0, invI: 0, P: new THREE.Matrix4(), x: new THREE.Vector3(), q: new THREE.Quaternion(), c0: new THREE.Vector3() });
    return { body: fragBody.get(best), p };
  }
  const vec = (a, i) => new THREE.Vector3(a[i], a[i + 1], a[i + 2]);
  function build() {
    restoreNodes();
    bodyOf = {}; fragBody = new Map();
    const names = new Set([...data.tethers.flatMap((t) => t.bones), ...data.joints.flatMap((j) => j.bones)]);
    const bodies = [];
    for (const name of names) {
      const s = S[name];
      if (!s || !s.node || isCut(name)) continue;
      // leg region: the whole fibula moves only in a stress test (else the start positions of the fractures would change)
      const dyn = !data.fixed.includes(name) && !(api.region === 'leg' && name === 'Fibula.r' && mode !== 'stress');
      const b = makeBody(name, [s.node], dyn);
      bodies.push(b); bodyOf[name] = b;
    }
    if (mode === 'stress' && api.region === 'foot') {        // the examiner holds the foot: all foot bones move as one
      const members = bodies.filter((b) => b.dyn && b.name !== 'Fibula.r');
      const talus = bodyOf['Talus.r'];
      const foot = makeBody('Foot', members.flatMap((b) => b.nodes), true);
      if (talus) { foot.c0.copy(talus.c0); foot.x.copy(talus.c0); }
      for (const b of members) { bodyOf[b.name] = foot; bodies.splice(bodies.indexOf(b), 1); }
      bodies.push(foot);
    }
    const tal = bodyOf['Talus.r'];
    api.driven = tal || null;
    api.bodies = bodies;
    // fibres and contacts with their bodies (a fibre or contact inside one body does nothing)
    api.fibres = [];
    data.tethers.forEach((t, ti) => {
      for (const f of t.fibres) {
        const a = endFor(t.bones[0], vec(f, 0)), b = endFor(t.bones[1], vec(f, 3));
        if (!a || !b || a.body === b.body) continue;
        api.fibres.push({ t: ti, a, b, L: a.p.distanceTo(b.p), s: 0 });
      }
    });
    api.contacts = [];
    data.joints.forEach((j, ji) => {
      for (const c of j.contacts) {
        const a = endFor(j.bones[0], vec(c, 0)), b = endFor(j.bones[1], vec(c, 3));
        if (!a || !b || a.body === b.body) continue;
        api.contacts.push({ j: ji, a, b, n: vec(c, 6), g0: c[9] / 1000 });
      }
    });
    for (const b of bodies) {                                  // the top of the fibula is held (proximal tibiofibular joint)
      const pin = SOL.pins[b.name];
      b.pin = pin && b.dyn ? new THREE.Vector3(b.c0.x, b.top, b.c0.z) : null;
    }
    for (const b of fragBody.values()) bodies.push(b);
    if (mode === 'free') api.pieceNodes = bodies.filter((b) => b.dyn).flatMap((b) => b.nodes);
    api.tick++;
    tint(); rest(); drawFibres(true);
  }
  function restoreNodes() {
    for (const b of api.bodies) {
      if (!b.dyn) continue;
      for (const n of b.nodes) { const h = homeRel.get(n); if (h) { n.matrix.copy(parentRel.get(n)).invert().multiply(h); n.matrix.decompose(n.position, n.quaternion, n.scale); n.matrixAutoUpdate = true; n.updateMatrixWorld(true); } }
    }
  }

  // ---- poses -----------------------------------------------------------------------------------------
  function poseOf(b) {        // layer-space matrix: point at home -> point now
    if (b.frag) {
      const f = b.frag;
      f.holder.updateMatrix(); f.node.updateMatrix();
      return b.P.multiplyMatrices(f.holder.matrix, f.node.matrix);
    }
    if (!b.dyn && !b.held) {
      const n = b.nodes[0]; n.updateWorldMatrix(true, false);
      return b.P.multiplyMatrices(rel(n), T.m.copy(homeRel.get(n)).invert());
    }
    return b.P.makeRotationFromQuaternion(b.q).setPosition(b.x).multiply(T.m.makeTranslation(-b.c0.x, -b.c0.y, -b.c0.z));
  }
  function setFromMatrix(b, M) {         // put a free body at pose M (layer space)
    const c = b.c0.clone().applyMatrix4(M);
    b.x.copy(c);
    b.q.setFromRotationMatrix(T.m.extractRotation(M));
  }
  const now = (e) => e.p.clone().applyMatrix4(e.body.P);
  // position correction of two bodies along n (rigid, position based)
  const rn = new THREE.Vector3();
  function weight(b, r, n) { if (!b.dyn || b.held) return 0; rn.crossVectors(r, n); return b.invM + b.invI * rn.lengthSq(); }
  function push(b, r, n, dl) {
    if (!b.dyn || b.held || !dl) return;
    b.x.addScaledVector(n, dl * b.invM);
    rn.crossVectors(r, n).multiplyScalar(dl * b.invI);
    const dq = new THREE.Quaternion(rn.x, rn.y, rn.z, 0).multiply(b.q);
    b.q.set(b.q.x + 0.5 * dq.x, b.q.y + 0.5 * dq.y, b.q.z + 0.5 * dq.z, b.q.w + 0.5 * dq.w).normalize();
    poseOf(b);
  }
  function solve(ea, pa, eb, pb, n, C, alpha) {      // C along n; moves a by +n*dl, b by -n*dl
    const ra = pa.clone().sub(ea.body.x), rb = pb.clone().sub(eb.body.x);
    const w = weight(ea.body, ra, n) + weight(eb.body, rb, n);
    if (w === 0) return;
    const dl = -C / (w + alpha);
    push(ea.body, ra, n, dl); push(eb.body, rb, n.clone().negate(), dl);
  }
  function toward(b, p, target, alpha) {             // soft: point p of body b toward a target point (world fixed)
    const d = p.clone().sub(target), L = d.length();
    if (L < 1e-7) return;
    const n = d.divideScalar(L), r = p.clone().sub(b.x), w = weight(b, r, n);
    if (!w) return;
    push(b, r, n, -L / (w + alpha));
  }
  const SEAT = [[0, 0, 0], [0.02, 0, 0], [0, 0.02, 0], [0, 0, 0.02]];
  function step() {
    for (const b of api.bodies) poseOf(b);
    const st = api.stress, drive = st ? stressTarget(st) : null;
    for (let it = 0; it < SOL.iterations; it++) {
      for (const b of api.bodies) {
        if (!b.dyn || b.held) continue;
        const isDriven = drive && b === st.body;
        const B = isDriven ? drive : (b.base || null);
        const alpha = isDriven ? SOL.drive_compliance : SOL.seat_compliance;
        for (const o of SEAT) {
          const h = b.c0.clone().add(T.v.set(...o));
          toward(b, h.clone().applyMatrix4(b.P), B ? h.clone().applyMatrix4(B) : h, alpha);
        }
        if (b.pin) toward(b, b.pin.clone().applyMatrix4(b.P), b.pin, SOL.pin_compliance);
      }
      for (const c of api.contacts) {                    // joint surfaces do not pass through each other
        const pa = now(c.a), pb = now(c.b);
        const n = c.n.clone().transformDirection(c.b.body.P);
        const C = pa.clone().sub(pb).dot(n) - (c.g0 - ALLOW);
        if (C < 0) solve(c.a, pa, c.b, pb, n, C, 0);
      }
      for (const f of api.fibres) {                      // a taut fibre holds
        if (api.torn.has(f.t)) continue;
        const pa = now(f.a), pb = now(f.b), d = pa.clone().sub(pb), L = d.length(), max = f.L * (1 + TOE);
        if (L > max) solve(f.a, pa, f.b, pb, d.divideScalar(L), L - max, 0);
      }
    }
    // write the free bodies back to their meshes
    for (const b of api.bodies) {
      if (!b.dyn) continue;
      if (b.held) setFromMatrix(b, b.held);
      poseOf(b);
      for (const n of b.nodes) {
        n.matrixAutoUpdate = false;
        n.matrix.copy(parentRel.get(n)).invert().multiply(b.P).multiply(homeRel.get(n));
        n.matrixWorldNeedsUpdate = true;
      }
    }
    // strain of every fibre; tearing
    let tore = null;
    for (const f of api.fibres) {
      f.s = now(f.a).distanceTo(now(f.b)) / f.L - 1;
      if (api.canTear && !api.torn.has(f.t) && f.s > TEAR) { api.torn.add(f.t); tore = f.t; }
    }
    if (tore !== null) { api.note = `Torn: ${label(data.tethers[tore])}`; tint(); if (v.onTear) v.onTear(); }
    drawFibres(false);
    measure();
  }

  // ---- stress tests ----------------------------------------------------------------------------------
  function stressTarget(st) {
    const k = Math.min(1, (performance.now() - st.t0) / 1000 / st.test.ramp_s);
    st.k = k;
    const c = st.test.pivot === 'dome' && domeC ? domeC : st.test.pivot === 'dome_medial' && domeM ? domeM : st.body.c0;
    const a = st.test.amount * k;
    const M = new THREE.Matrix4();
    if (st.test.move === 'translate') M.makeTranslation(...AX[st.test.axis].clone().multiplyScalar(a / 1000).toArray());
    else {
      const axis = st.test.axis === 'up_external' ? AX.up.clone().negate() : AX[st.test.axis];   // right foot: external = toes turn lateral
      M.makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationAxis(axis, THREE.MathUtils.degToRad(a)))
        .multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    }
    return st.body.base ? M.multiply(st.body.base) : M;
  }
  api.startStress = (id) => {
    const test = cfg.stress_tests.find((t) => t.id === id);
    if (!test) return;
    api.stopStress(false);
    mode = 'stress'; build();
    if (!api.driven) { api.note = 'No talus in this view.'; return; }
    api.stress = { test, body: api.driven, t0: performance.now(), k: 0 };
    api.note = `${test.name}: ${test.limits}`;
  };
  api.stopStress = (rebuild = true) => {
    api.stress = null;
    if (mode !== 'free') { mode = 'free'; if (rebuild) build(); }
  };

  // ---- measurements ----------------------------------------------------------------------------------
  function gaps(sel) {
    const g = [];
    for (const c of api.contacts) {
      if (!sel(c)) continue;
      const n = c.n.clone().transformDirection(c.b.body.P);
      g.push(now(c.a).sub(now(c.b)).dot(n));
    }
    return g.length ? 1000 * g.reduce((x, y) => x + y, 0) / g.length : null;
  }
  const jn = (c) => data.joints[c.j].name;
  const dome = data.joints.find((j) => j.name.startsWith('Ankle (talocrural) joint') && j.bones.includes('Tibia.r'));
  const domeX = dome ? dome.contacts.reduce((s, c) => s + c[3], 0) / dome.contacts.length : 0;
  // centre of the talar dome (the tibia side of the dome contacts): the hinge of talar tilt and rotation
  const domeTop = dome ? dome.contacts.filter((c) => c[7] < -0.6) : [];
  // medial edge of the dome at the same height and depth: the hinge of talar tilt
  const domeM = domeTop.length ? new THREE.Vector3(Math.max(...domeTop.map((c) => c[3])), domeTop.reduce((s, c) => s + c[4], 0) / domeTop.length,
    domeTop.reduce((s, c) => s + c[5], 0) / domeTop.length) : null;
  const domeC = dome ? dome.contacts.filter((c) => c[7] < -0.6).reduce((s, c, i, all) => s.add(new THREE.Vector3(c[3], c[4], c[5]).divideScalar(all.length)), new THREE.Vector3()) : null;
  const SEL = {
    medial_gap: (c) => jn(c).startsWith('Ankle (talocrural) joint') && data.joints[c.j].bones.includes('Tibia.r') && Math.abs(c.n.x) > 0.6,
    lateral_gap: (c) => jn(c).startsWith('Ankle (talocrural) joint') && data.joints[c.j].bones.includes('Tibia.r') && c.n.y < -0.6 && c.b.p.x < domeX,
    tibiofibular_gap: (c) => jn(c).startsWith('Distal tibiofibular'),
  };
  function talusMotion() {
    const b = api.driven;
    if (!b) return null;
    poseOf(b);
    const D = b.P.clone();
    if (b.base) D.multiply(b.base.clone().invert());
    const c = b.c0.clone().applyMatrix4(b.base || new THREE.Matrix4());
    const t = c.clone().applyMatrix4(D).sub(c).multiplyScalar(1000);
    const q = new THREE.Quaternion().setFromRotationMatrix(T.m.extractRotation(D));
    const ang = 2 * Math.acos(Math.min(1, Math.abs(q.w))) * (q.w < 0 ? -1 : 1), s = Math.sqrt(1 - q.w * q.w) || 1;
    const rv = new THREE.Vector3(q.x / s, q.y / s, q.z / s).multiplyScalar(THREE.MathUtils.radToDeg(ang));
    return { anterior_translation: t.dot(AX.anterior), talar_tilt: rv.dot(AX.anterior), external_rotation: -rv.dot(AX.up) };
  }
  function rest() {
    api.rest = {};
    for (const b of api.bodies) poseOf(b);
    for (const [k, sel] of Object.entries(SEL)) {           // at home (every body at rest, fragments at home)
      const g = [];
      for (const c of api.contacts) if (sel(c)) g.push(c.g0 * 1000);
      api.rest[k] = g.length ? g.reduce((x, y) => x + y, 0) / g.length : null;
    }
  }
  function measure() {
    const m = talusMotion() || {};
    for (const [k, sel] of Object.entries(SEL)) m[k] = gaps(sel);
    api.out = m;
  }
  api.lines = () => {          // readout lines [label, value]
    const st = api.stress, m = api.out, R = cfg.readouts;
    const keys = st ? st.test.readouts : ['anterior_translation', 'talar_tilt', 'external_rotation', 'medial_gap', 'tibiofibular_gap'];
    const out = [];
    for (const k of keys) {
      if (m[k] == null) continue;
      const deg = !k.endsWith('gap') && k !== 'anterior_translation';
      const val = `${m[k].toFixed(1)} ${deg ? '°' : 'mm'}` + (api.rest[k] != null ? ` (at rest ${api.rest[k].toFixed(1)})` : '');
      out.push([R[k].replace(/ \((mm|degrees)\)$/, ''), val]);
    }
    const taut = api.fibres.filter((f) => !api.torn.has(f.t) && f.s > TOE * 0.9);
    const names = [...new Set(taut.map((f) => label(data.tethers[f.t])))];
    if (names.length) out.push(['Taut ligaments', names.slice(0, 4).join(', ') + (names.length > 4 ? ` +${names.length - 4}` : '')]);
    return out;
  };

  // ---- torn ligaments ------------------------------------------------------------------------------
  const label = (t) => t.name.replace(/\.r$/, '') + (t.parts > 1 ? ` (part ${t.part})` : '');
  api.label = label;
  const tornMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0x551010, roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  function tint() {             // a torn ligament (any part) is shown red
    const tornNames = new Set([...api.torn].map((i) => data.tethers[i].name));
    for (const t of data.tethers) {
      const s = S[t.name];
      if (!s) continue;
      for (const m of s.meshes) m.material = tornNames.has(t.name) ? tornMat : m.userData.baseMat;
    }
  }
  api.setTorn = (pred, on) => {
    data.tethers.forEach((t, i) => { if (pred(t)) { if (on) api.torn.add(i); else api.torn.delete(i); } });
    tint();
  };
  api.tornGroups = () => Object.keys(cfg.groups).filter((g) => data.tethers.some((t, i) => t.group === g && api.torn.has(i)));
  api.toggleGroup = (g) => { const on = !api.tornGroups().includes(g); api.setTorn((t) => t.group === g, on); };
  api.toggleLigament = (name) => {
    const ids = data.tethers.map((t, i) => (t.name === name ? i : -1)).filter((i) => i >= 0);
    if (!ids.length) return false;
    const on = !ids.some((i) => api.torn.has(i));
    api.setTorn((t) => t.name === name, on);
    return true;
  };
  api.repairAll = () => { api.torn.clear(); api.note = ''; tint(); };
  api.isLigament = (name) => data.tethers.some((t) => t.name === name);

  // ---- drawing: one line per fibre, coloured by strain ----------------------------------------------
  const lineGeo = new THREE.BufferGeometry();
  const lines = new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 }));
  lines.renderOrder = 10;
  lines.frustumCulled = false;
  layer.parent.add(lines);       // root space = layer space (layers sit at the root's origin)
  const cS = new THREE.Color(0x58c06a), cT = new THREE.Color(0xffd23f), cR = new THREE.Color(0xff3b30), cX = new THREE.Color();
  function drawFibres(resize) {
    const n = api.fibres.length;
    if (resize || !lineGeo.attributes.position || lineGeo.attributes.position.count !== 2 * n) {
      lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * n), 3));
      lineGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(6 * n), 3));
    }
    const P = lineGeo.attributes.position.array, C = lineGeo.attributes.color.array;
    api.fibres.forEach((f, i) => {
      const a = now(f.a), b = now(f.b), torn = api.torn.has(f.t);
      if (torn) { a.lerp(b, 0.5); b.copy(a); }
      a.toArray(P, 6 * i); b.toArray(P, 6 * i + 3);
      const k = THREE.MathUtils.clamp((f.s - TOE) / (TEAR - TOE), 0, 1);
      if (f.s <= TOE) cX.copy(cS); else cX.copy(cT).lerp(cR, k);
      cX.toArray(C, 6 * i); cX.toArray(C, 6 * i + 3);
    });
    lineGeo.attributes.position.needsUpdate = true; lineGeo.attributes.color.needsUpdate = true;
    lines.visible = api.showFibres && layer.visible;
  }

  // ---- hooks for the page and VR ---------------------------------------------------------------------
  api.step = () => {
    if (!api.bodies.length) return;
    const t0 = performance.now();
    step();
    api.ms = (api.ms || 0) * 0.9 + (performance.now() - t0) * 0.1;
  };
  api.onFracture = (e) => {              // a new fracture (or intact bones): new bodies, torn ligaments of the row
    api.stopStress(false); mode = 'free';
    api.torn.clear(); api.note = '';
    build();
    const groups = (e && e.torn) || [];
    api.setTorn((t) => groups.includes(t.group), true);
  };
  api.takes = (node) => api.bodies.some((b) => b.dyn && b.nodes.includes(node));
  // The talus in the leg: its place = where the plafond fragment carries it. If that fragment is a moving one
  // (shaft and distal tibia fractures) the talus stays seated in it (hard): the ligaments only show their strain.
  // If the plafond is on the main tibia (malleolar fractures) the seat is soft and the ligaments place the talus.
  api.setBase = (node, F, hard) => {
    const b = api.bodies.find((x) => x.dyn && x.nodes.includes(node));
    if (!b) return;
    if (!b.base) setFromMatrix(b, F);
    b.base = F.clone();
    b.held = hard && !(api.stress && api.stress.body === b) ? b.base : null;
    b.seated = !!hard;
  };
  api.bodyOfNode = (node) => api.bodies.find((b) => b.dyn && b.nodes.includes(node)) || null;
  api.pieces = () => api.pieceNodes;                    // for the soft tissue (stable list)
  api.holdNode = (b, node, Mnode) => { b.held = new THREE.Matrix4().multiplyMatrices(Mnode, T.m.copy(homeRel.get(node)).invert()); };
  api.hold = (b, M) => { b.held = M; };
  api.release = (b) => { b.held = null; };
  api.homeOf = (node) => homeRel.get(node);
  api.reset = () => {
    api.stopStress(false); mode = 'free';
    for (const b of api.bodies) if (b.dyn) { b.x.copy(b.c0); b.q.identity(); b.held = null; }
    build();
  };
  build();
  return api;
}
