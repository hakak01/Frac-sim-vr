// Phase 5: soft tissue follows the bone fragments, and the ghost (see-through) slider.
//
// How tissue follows: every soft tissue point is tied to the bone pieces nearest to it
// (skinning). A point close to one fragment moves with that fragment; a point between
// two fragments is shared between them. Intact bones hold their tissue still.
// The shapes themselves are not edited: at the anatomical position nothing moves.
//
// To keep the headset fast, the ties are worked out on a 5 mm grid around the bones and
// blended for each point, a few milliseconds per frame, and only for layers that are shown.
import * as THREE from 'three';

export const SOFT = ['muscles', 'joints', 'arteries', 'veins', 'nerves', 'skin'];
const POWER = 4;            // weight = 1 / distance^POWER: the nearest bone piece dominates
const EPS = 0.0005;         // metres
const CELL = 0.005;         // grid step, metres
const CHUNK = 300;          // points tied per step

// Turn the meshes of a soft tissue layer into skinnable meshes (done once, at load).
export function makeSkinnable(group) {
  const list = [];
  group.traverse((o) => { if (o.isMesh) list.push(o); });
  group.updateWorldMatrix(true, false);
  const still = new THREE.Skeleton([group], [new THREE.Matrix4().copy(group.matrixWorld).invert()]);
  for (const m of list) {
    const g = m.geometry, n = g.attributes.position.count;
    const w = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) w[i * 4] = 1;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(w, 4));
    const sm = new THREE.SkinnedMesh(g, m.material);
    sm.name = m.name;
    sm.userData = m.userData;
    sm.frustumCulled = false;
    sm.position.copy(m.position); sm.quaternion.copy(m.quaternion); sm.scale.copy(m.scale);
    for (const c of [...m.children]) sm.add(c);
    m.parent.add(sm);
    m.parent.remove(m);
    sm.updateWorldMatrix(true, false);
    sm.bind(still, sm.matrixWorld.clone());
  }
}

export function initTissue(v) {
  const meshes = [];
  for (const id of SOFT) {
    if (v.layerGroups[id]) v.layerGroups[id].traverse((o) => { if (o.isSkinnedMesh) meshes.push({ mesh: o, layer: id, token: -1 }); });
  }
  const api = { meshes, busy: false, ghost: 1, nodes: 0 };
  const home = v.layerGroups.bones;           // bone 0: tissue that stays with the intact skeleton
  let skeleton = null, job = null, token = 0, ctx = null;

  function fill(mesh) {                        // everything tied to the intact skeleton
    const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    si.array.fill(0); sw.array.fill(0);
    for (let i = 0; i < sw.count; i++) sw.array[i * 4] = 1;
    si.needsUpdate = true; sw.needsUpdate = true;
  }

  // Call when the fracture changes: new set of bone pieces; ties are worked out later, bit by bit.
  api.rebind = () => {
    token++;
    const frs = v.fx.fragments, extra = v.pieces ? v.pieces() : [];   // Phase 7b: free bones of the joint model
    home.updateWorldMatrix(true, true);
    const bones = [home, ...frs.map((f) => f.node), ...extra];
    const inv = new THREE.Matrix4().copy(home.matrixWorld).invert();   // every piece is "home" at identity
    if (skeleton) skeleton.dispose();
    skeleton = new THREE.Skeleton(bones, bones.map((b, i) => (i <= frs.length || !v.pieceHome(b) ? inv.clone()
      : new THREE.Matrix4().multiplyMatrices(home.matrixWorld, v.pieceHome(b)).invert())));
    const pieces = frs.length + extra.length;
    for (const m of meshes) {
      m.mesh.bind(skeleton, m.mesh.matrixWorld.clone());
      fill(m.mesh);
      m.token = pieces ? -1 : token;           // nothing to work out for intact bones
    }
    job = null; api.busy = false; api.nodes = 0;
    ctx = pieces ? { inv, nb: bones.length, cols: null, cache: new Map() } : null;
  };

  const hit = {};
  function nodeWeights(i, j, k) {              // ties at one grid point (cached)
    const key = ((i + 2048) * 4096 + (j + 2048)) * 4096 + (k + 2048);
    let w = ctx.cache.get(key);
    if (w) return w;
    w = new Float32Array(ctx.nb);
    const p = new THREE.Vector3(i * CELL, j * CELL, k * CELL);
    const cand = ctx.cols.map((c) => ({ c, lb: c.c.box.distanceToPoint(p) })).sort((a, b) => a.lb - b.lb);
    let best = Infinity, sum = 0;
    for (const { c, lb } of cand) {
      if (lb > best * 3 + EPS) break;                      // too far to matter
      const r = c.c.geom.boundsTree.closestPointToPoint(p, hit);
      if (!r) continue;
      const d = r.distance;
      best = Math.min(best, d);
      w[c.bone] = Math.max(w[c.bone], 1 / (d + EPS) ** POWER);
    }
    for (let b = 0; b < ctx.nb; b++) sum += w[b];
    if (!sum) { w[0] = 1; sum = 1; }
    for (let b = 0; b < ctx.nb; b++) w[b] /= sum;
    ctx.cache.set(key, w);
    api.nodes++;
    return w;
  }

  const p = new THREE.Vector3();
  function tieChunk() {
    const m = job.list[job.mi], mesh = m.mesh;
    const pos = mesh.geometry.attributes.position, si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
    if (job.vi === 0) job.toHome = new THREE.Matrix4().multiplyMatrices(ctx.inv, mesh.matrixWorld);
    const end = Math.min(pos.count, job.vi + CHUNK), acc = job.acc, nb = ctx.nb;
    for (let i = job.vi; i < end; i++) {
      p.fromBufferAttribute(pos, i).applyMatrix4(job.toHome);
      const gx = p.x / CELL, gy = p.y / CELL, gz = p.z / CELL;
      const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz), fx = gx - ix, fy = gy - iy, fz = gz - iz;
      acc.fill(0);
      for (let c = 0; c < 8; c++) {                         // blend the 8 grid points around the point
        const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
        const t = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        if (t < 1e-4) continue;
        const w = nodeWeights(ix + dx, iy + dy, iz + dz);
        for (let b = 0; b < nb; b++) acc[b] += t * w[b];
      }
      let sum = 0;
      for (let s = 0; s < 4; s++) {                         // keep the 4 strongest ties
        let bi = 0, bw = -1;
        for (let b = 0; b < nb; b++) if (acc[b] > bw) { bw = acc[b]; bi = b; }
        si.array[i * 4 + s] = bw > 0 ? bi : 0;
        sw.array[i * 4 + s] = Math.max(bw, 0);
        sum += Math.max(bw, 0);
        acc[bi] = -1;
      }
      for (let s = 0; s < 4; s++) sw.array[i * 4 + s] /= sum;
    }
    job.vi = end;
    if (end === pos.count) {
      si.needsUpdate = true; sw.needsUpdate = true;
      m.token = token;
      job.vi = 0;
      if (++job.mi === job.list.length) { job = null; api.busy = false; }
    }
  }
  function nextJob() {                           // layers that are shown and not tied yet
    if (!ctx) return;
    const list = meshes.filter((m) => m.token !== token && v.layerGroups[m.layer].visible);
    if (!list.length) return;
    if (!ctx.cols) {
      ctx.cols = [...v.fx.fragments.map((f, i) => ({ c: v.collider(f), bone: i + 1 })),
        ...v.boneColliders(true).map((c) => ({ c, bone: v.followerBone ? v.followerBone(c) : 0 }))];   // the leg follows the knee fragment
    }
    job = { list, mi: 0, vi: 0, acc: new Float32Array(ctx.nb) };
    api.busy = true;
  }
  // Call every frame: spends at most `budget` milliseconds on tying tissue to fragments.
  api.update = (budget = 4) => {
    if (!job) nextJob();
    if (!job) return;
    const t0 = performance.now();
    while (job && performance.now() - t0 < budget) tieChunk();
  };
  api.finish = () => { nextJob(); while (job) tieChunk(); };      // for tests

  // Ghost: 1 = solid, 0 = invisible. Soft tissue only.
  api.setGhost = (a) => {
    api.ghost = a;
    for (const m of v.softMaterials()) {
      m.transparent = a < 1;
      m.opacity = a;
      m.depthWrite = a >= 1;
      m.needsUpdate = true;
    }
  };
  return api;
}
