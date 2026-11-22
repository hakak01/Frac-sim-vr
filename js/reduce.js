// Phase 4: reduction maths. Typical displacement, the live readout, and "bone cannot
// pass through bone". No drawing here; used by viewer.js (page) and xr.js (VR).
//
// All positions are in model space (metres, GLB axes). A fragment at the identity pose
// is in its anatomical home position. The reference for a fragment is the main (largest)
// fragment of the same bone.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const SHRINK = 0.0008;        // colliders are 0.8 mm smaller, so a reduced fragment fits in its bed
const V = (a) => new THREE.Vector3(...a);
const deg = THREE.MathUtils.radToDeg, rad = THREE.MathUtils.degToRad;

export function frameOf(index, bone) {
  const f = index.frames[bone];
  // distal, anterior, medial; T = words for this region (foot: the frame's 'anterior' is dorsal)
  return { D: V(f.distal), A: V(f.anterior), M: V(f.medial), T: f.terms || null };
}

// ---- typical displacement ----------------------------------------------------
// Shaft-type values describe the distal part relative to the proximal part.
// Twist about the long axis through the fracture centre; tilt (varus/valgus, apex anterior/
// posterior) about a hinge on the cortex of the concave side, so the gap opens on the convex
// side and no bone goes into the other fragment, as in a real angulated fracture.
function shaftMatrix(p, fr, site, cortex) {
  const qt = new THREE.Quaternion()
    .multiply(new THREE.Quaternion().setFromAxisAngle(fr.A, rad(p.varus_deg || 0)))
    .multiply(new THREE.Quaternion().setFromAxisAngle(fr.M, rad(p.apex_anterior_deg || 0)));
  const qw = new THREE.Quaternion().setFromAxisAngle(fr.D, rad(p.external_rotation_deg || 0));
  const hinge = site.clone();
  const ax = new THREE.Vector3(qt.x, qt.y, qt.z);
  if (cortex && cortex.length && ax.length() > 1e-5) {
    const c = new THREE.Vector3().crossVectors(fr.D, ax.normalize()).normalize();
    let w = 0;
    for (const q of cortex) w = Math.max(w, -q.clone().sub(site).dot(c));
    hinge.addScaledVector(c, -w);
  }
  const t = new THREE.Vector3()
    .addScaledVector(fr.D, -(p.shortening_mm || 0) / 1000)
    .addScaledVector(fr.M, -(p.lateral_mm || 0) / 1000)
    .addScaledVector(fr.A, -(p.posterior_mm || 0) / 1000);
  const about = (q, o) => new THREE.Matrix4().makeTranslation(o.x, o.y, o.z)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-o.x, -o.y, -o.z));
  return new THREE.Matrix4().makeTranslation(t.x, t.y, t.z).multiply(about(qt, hinge)).multiply(about(qw, site));
}

// Points on the cut cortex of a fragment (used to find the hinge of an angulation).
export function cortexPoints(node, max = 600) {
  const pts = [];
  node.traverse((o) => {
    if (!o.isMesh || o.userData.matName !== 'FractureCortex') return;
    const a = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(a.count / max));
    for (let i = 0; i < a.count; i += step) pts.push(new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i)));
  });
  return pts;
}

// Pose (Matrix4) of a moving fragment for a displacement preset.
// shorten: share of the shortening that is applied; amount: share of everything else.
export function displacedMatrix(f, preset, shorten = 1, amount = 1) {
  const m = new THREE.Matrix4();
  if (!preset) return m;
  if (preset.pose) {                      // Phase 6d: pose worked out from the muscles (index.json)
    const q = preset.pose, pv = V(q.pivot), t = V(q.t).multiplyScalar(shorten);
    const R = new THREE.Matrix4().makeRotationAxis(V(q.axis).normalize(), THREE.MathUtils.degToRad(q.deg * amount));
    return new THREE.Matrix4().makeTranslation(t.x + pv.x, t.y + pv.y, t.z + pv.z).multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(-pv.x, -pv.y, -pv.z));
  }
  const p = { shortening_mm: (preset.shortening_mm || 0) * shorten };
  for (const k of ['lateral_mm', 'posterior_mm', 'varus_deg', 'apex_anterior_deg', 'external_rotation_deg', 'away_mm', 'proximal_mm']) {
    p[k] = (preset[k] || 0) * amount;
  }
  p.use_impaction = preset.use_impaction;
  if (p.shortening_mm || p.lateral_mm || p.posterior_mm || p.varus_deg || p.apex_anterior_deg || p.external_rotation_deg) {
    m.copy(shaftMatrix(p, f.frame, f.site, f.cortex));
    if (!f.isDistal) m.invert();          // moving the proximal part instead gives the same deformity
  }
  const t = new THREE.Vector3();
  if (p.away_mm) t.addScaledVector(f.dir, p.away_mm / 1000);
  if (p.proximal_mm) t.addScaledVector(f.frame.D, -p.proximal_mm / 1000);
  if (p.use_impaction && f.node.userData.impaction_mm) {
    t.addScaledVector(V(f.node.userData.impaction_dir), f.node.userData.impaction_mm / 1000);
  }
  return new THREE.Matrix4().makeTranslation(t.x, t.y, t.z).multiply(m);
}

// ---- readout -------------------------------------------------------------------
// Points on the joint surface along the fracture line (cartilage vertices that touch a cut face).
export function articularEdge(node, max = 32) {
  const cell = 0.0003, key = (x, y, z) => `${Math.round(x / cell)},${Math.round(y / cell)},${Math.round(z / cell)}`;
  const cut = new Set(), pts = [];
  node.traverse((o) => {
    if (!o.isMesh || !/^Fracture/.test(o.userData.matName)) return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        cut.add(key(a.getX(i) + dx * cell, a.getY(i) + dy * cell, a.getZ(i) + dz * cell));
      }
    }
  });
  node.traverse((o) => {
    if (!o.isMesh || o.userData.matName !== 'Cartilage') return;
    const a = o.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) if (cut.has(key(a.getX(i), a.getY(i), a.getZ(i)))) pts.push(new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i)));
  });
  const step = Math.max(1, Math.floor(pts.length / max));
  return pts.filter((_, i) => i % step === 0);
}

// Pose of a fragment in model space (includes the explode offset: what you see is measured).
export function modelMatrix(f) {
  return new THREE.Matrix4().multiplyMatrices(f.holder.matrix, f.node.matrix);
}

// Displacement of fragment f against its reference fragment ref, in clinical terms.
// A "piece" (split, depressed fragment, wedge, malleolus, avulsion) is described by its own
// movement. A shaft-type fragment is described as the distal part relative to the proximal
// part, as in clinical practice, whichever of the two was moved.
export const isPiece = (preset) => (preset && preset.pose ? preset.pose.unit === 'piece' : !(preset && preset.shortening_mm));

export function measure(f, ref) {
  f.holder.updateMatrix(); f.node.updateMatrix(); ref.holder.updateMatrix(); ref.node.updateMatrix();
  const rel = modelMatrix(ref).invert().multiply(modelMatrix(f));        // f as seen from ref
  const piece = isPiece(f.preset);
  const X = piece || f.isDistal ? rel.clone() : rel.clone().invert();     // piece itself / distal part vs proximal part
  const { D, A, M } = f.frame;
  const R = new THREE.Matrix4().extractRotation(X);
  const D2 = D.clone().applyMatrix4(R);
  const swing = new THREE.Quaternion().setFromUnitVectors(D, D2.clone().normalize());
  const A2 = A.clone().applyMatrix4(R).applyQuaternion(swing.invert());
  const o = piece ? new THREE.Vector3(...f.node.userData.centroid) : f.site;   // point that is followed
  const t = o.clone().applyMatrix4(X).sub(o);
  const out = {
    piece,
    // shaft: change of bone length between points 15 cm above and below the fracture
    // (+ = shortened, - = lengthened), so that the gap opened by angulation is not counted
    shortening: (0.3 - f.site.clone().addScaledVector(D, 0.15).applyMatrix4(X).distanceTo(f.site.clone().addScaledVector(D, -0.15))) * 1000,
    along: t.dot(D) * 1000,                             // piece: + = moved distally, - = proximally
    lateral: -t.dot(M) * 1000, posterior: -t.dot(A) * 1000,
    varus: deg(Math.atan2(D2.dot(M), D2.dot(D))),        // + varus, - valgus
    apexAnterior: deg(Math.atan2(-D2.dot(A), D2.dot(D))), // + apex anterior, - apex posterior
    external: deg(Math.atan2(-A2.dot(M), A2.dot(A))),    // + external, - internal rotation
    step: null, gap: null, T: f.frame.T,
  };
  out.translation = Math.hypot(out.lateral, out.posterior);
  if (f.edge.length) {                                   // joint surface: step along the bone axis, gap across it
    let step = 0, gap = 0;
    const p = new THREE.Vector3();
    for (const q of f.edge) {
      p.copy(q).applyMatrix4(rel).sub(q);
      const s = p.dot(D);
      step = Math.max(step, Math.abs(s));
      gap = Math.max(gap, p.addScaledVector(D, -s).length());
    }
    out.step = step * 1000; out.gap = gap * 1000;
  }
  return out;
}

const side = (v, pos, neg, unit) => (Math.abs(v) < 0.05 ? '' : unit === 'mm'
  ? `${Math.abs(v).toFixed(1)} mm ${v > 0 ? pos : neg}` : `${Math.abs(v).toFixed(0)}° ${v > 0 ? pos : neg}`);
// Readout as short lines of text: [label, value]
export function readoutLines(m) {
  if (m.T) {                                     // e.g. the foot: anterior / posterior read dorsal / plantar
    const w = (t) => Object.entries(m.T).filter(([k]) => !k.startsWith('_')).reduce((s, [k, x]) => s.split(k).join(x), t);
    return readoutLines({ ...m, T: null }).map(([k, v]) => [k, w(v)]);
  }
  const tr = [side(m.lateral, 'lateral', 'medial', 'mm'), side(m.posterior, 'posterior', 'anterior', 'mm')].filter(Boolean).join(', ');
  const rows = [['Translation', `${m.translation.toFixed(1)} mm` + (tr ? ` (${tr})` : '')]];
  if (m.piece) {
    const tilt = [Math.abs(m.varus) >= 0.5 ? `${Math.abs(m.varus).toFixed(0)}° in the frontal plane` : '',
      Math.abs(m.apexAnterior) >= 0.5 ? `${Math.abs(m.apexAnterior).toFixed(0)}° in the sagittal plane` : ''].filter(Boolean).join(', ');
    rows.push(['Along the bone', Math.abs(m.along) < 0.05 ? '0.0 mm' : `${Math.abs(m.along).toFixed(1)} mm ${m.along > 0 ? 'distal' : 'proximal'}`],
      ['Tilt', tilt || '0°'],
      ['Rotation', Math.abs(m.external) >= 0.5 ? `${Math.abs(m.external).toFixed(0)}° about the long axis` : '0°']);
  } else {
    const ang = [side(m.varus, 'varus', 'valgus'), side(m.apexAnterior, 'apex anterior', 'apex posterior')].filter(Boolean).join(', ');
    rows.push(['Shortening', m.shortening > -0.05 ? `${Math.max(0, m.shortening).toFixed(1)} mm` : `${(-m.shortening).toFixed(1)} mm distraction`],
      ['Angulation', ang || '0°'],
      ['Rotation', side(m.external, 'external', 'internal') || '0°']);
  }
  rows.push(['Articular step', m.step === null ? '–' : `${m.step.toFixed(1)} mm`],
    ['Articular gap', m.gap === null ? '–' : `${m.gap.toFixed(1)} mm`]);
  return rows;
}

// ---- bone cannot pass through bone -------------------------------------------------
// Merge points that are closer than about `cell` and drop the triangles that collapse.
// Two shifted grids are used, so that two copies of the same point are always joined.
// Colliders only: the picture on screen is never simplified.
function weld(geom, cell) {
  const pos = geom.attributes.position, idx = geom.index, n = pos.count;
  const parent = new Uint32Array(n).map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
  for (const off of [0, 0.5]) {
    const first = new Map();
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos.getX(i) / cell + off)},${Math.round(pos.getY(i) / cell + off)},${Math.round(pos.getZ(i) / cell + off)}`;
      const j = first.get(k);
      if (j === undefined) first.set(k, i); else parent[find(i)] = find(j);
    }
  }
  const slot = new Map(), sum = [], cnt = [], remap = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let j = slot.get(r);
    if (j === undefined) { j = cnt.length; slot.set(r, j); sum.push(0, 0, 0); cnt.push(0); }
    sum[j * 3] += pos.getX(i); sum[j * 3 + 1] += pos.getY(i); sum[j * 3 + 2] += pos.getZ(i); cnt[j]++;
    remap[i] = j;
  }
  const out = new Float32Array(sum.length);                 // each merged point sits at the average
  for (let j = 0; j < cnt.length; j++) for (let c = 0; c < 3; c++) out[j * 3 + c] = sum[j * 3 + c] / cnt[j];
  const tri = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = remap[idx.getX(t)], b = remap[idx.getX(t + 1)], c = remap[idx.getX(t + 2)];
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(out, 3));
  g.setIndex(tri);
  return g;
}

// One collider for all meshes under obj (they share obj's transform). A little smaller than
// the bone (shrink, metres), with points merged on a grid (cell) so that the headset can keep up.
export function makeCollider(obj, shrink = SHRINK, cell = 0.0016) {
  const parts = [];
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.attributes.position.clone());
    g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    parts.push(g);
  });
  // 1. join the pieces into one closed surface (outer surface and cut faces share their edge)
  const closed = weld(parts.length === 1 ? parts[0] : mergeGeometries(parts), 0.0001);
  // 2. move every point inward along the surface normal
  closed.computeVertexNormals();
  const pos = closed.attributes.position, nor = closed.attributes.normal;
  for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) - nor.getX(i) * shrink, pos.getY(i) - nor.getY(i) * shrink, pos.getZ(i) - nor.getZ(i) * shrink);
  // 3. fewer points
  let geom = cell ? weld(closed, cell) : closed;
  if (!geom.index.count) geom = closed;                     // a very small fragment: keep every point
  geom.boundsTree = new MeshBVH(geom);
  geom.computeBoundingBox();
  return { obj, geom, box: geom.boundingBox, triangles: geom.index.count / 3, shrink };
}

const mBA = new THREE.Matrix4(), box = new THREE.Box3();
// Do colliders a and b overlap? wa / wb: world matrices to use (defaults: where they are now).
export function overlap(a, b, wa = a.obj.matrixWorld, wb = b.obj.matrixWorld) {
  mBA.copy(wa).invert().multiply(wb);                     // b seen from a
  if (!box.copy(b.box).applyMatrix4(mBA).intersectsBox(a.box)) return false;
  return a.geom.boundsTree.intersectsGeometry(b.geom, mBA);
}
