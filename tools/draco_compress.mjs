// Compress every .glb in <in_dir> with Draco and write it to <out_dir>.
// Usage: node tools/draco_compress.mjs <in_dir> <out_dir>
// Also cleans materials: keeps the Z-Anatomy material name and base colour only.
import fs from 'node:fs';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const io = new NodeIO()
  .registerExtensions([KHRDracoMeshCompression])
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

for (const f of fs.readdirSync(inDir).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(inDir, f));
  for (const m of doc.getRoot().listMaterials()) {
    m.setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(0.7);
    for (const e of m.listExtensions()) e.dispose();
  }
  for (const e of doc.getRoot().listExtensionsUsed()) {
    if (e.extensionName !== 'KHR_draco_mesh_compression') e.dispose();
  }
  // 14-bit positions: step is about 0.02 mm on a 36 cm bone.
  await doc.transform(draco({ method: 'edgebreaker', quantizePosition: 14, quantizeNormal: 10 }));
  await io.write(path.join(outDir, f), doc);
}
