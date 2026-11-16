# Credits

## Anatomy models (everything in `assets/`)

- **Z-Anatomy – The libre 3D atlas of anatomy – CC BY-SA 4.0**
  by Gauthier Kervyn and Marcin Zielinski.
  https://github.com/Z-Anatomy/Models-of-human-anatomy (commit `cf19678`)
- **BodyParts3D – © The Database Center for Life Science – CC BY-SA 2.1 Japan**
  Z-Anatomy is derived from BodyParts3D.
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html

Changes made here: structures of one limb region were selected, Z-Anatomy's own
modifiers were applied, vessel and nerve curves were converted to meshes, and the
result was saved as Draco-compressed GLB files. No shape was edited and no
triangles were removed. Later phases add fracture cuts to the bones.

Because of the share-alike terms, the files in `assets/` (and any models derived
from them) are licensed **CC BY-SA 4.0**:
https://creativecommons.org/licenses/by-sa/4.0/

## Fracture classification (from Phase 2)

- Meinberg EG, Agel J, Roberts CS, Karam MD, Kellam JF. Fracture and Dislocation
  Classification Compendium – 2018. J Orthop Trauma. 2018;32 Suppl 1:S1–S170.
  doi:10.1097/BOT.0000000000001063

## Software

- three.js r180 – MIT licence – https://threejs.org (in `vendor/three/`)
- Draco decoder – Apache-2.0 – https://github.com/google/draco (in `vendor/three/examples/jsm/libs/draco/`)
- Build tools only: Blender (GPL, used as a tool), glTF-Transform (MIT)
