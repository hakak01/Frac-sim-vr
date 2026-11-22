// Read a (Draco) GLB and write its meshes as plain JSON: Z-Anatomy name, points (GLB metres, node
// transforms applied) and triangles. Used by tools/joint_model.py (Python cannot decode Draco).
// Usage: node tools/glb_meshes.mjs <in.glb> <out.json>
import fs from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const [inPath, outPath] = process.argv.slice(2);
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule() });
const doc = await io.read(inPath);
const out = [];
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  let name = null;
  for (let n = node; n && !name; n = n.getParentNode()) name = (n.getExtras() || {}).za_name || null;
  const M = node.getWorldMatrix();
  const pts = [], tris = [];
  for (const prim of mesh.listPrimitives()) {
    const pos = prim.getAttribute('POSITION'), idx = prim.getIndices();
    const base = pts.length / 3, v = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, v);
      pts.push(M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13],
        M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]);
    }
    const n = idx ? idx.getCount() : pos.getCount();
    for (let i = 0; i < n; i++) tris.push(base + (idx ? idx.getScalar(i) : i));
  }
  out.push({ name: name || node.getName(), points: pts, triangles: tris });
}
fs.writeFileSync(outPath, JSON.stringify(out));
