# Credits

## Anatomy models (everything in `assets/`)

- **Z-Anatomy – The libre 3D atlas of anatomy – CC BY-SA 4.0**
  by Gauthier Kervyn and Marcin Zielinski. Used for muscles, tendons, arteries,
  veins, nerves and skin.
  https://github.com/Z-Anatomy/Models-of-human-anatomy (commit `cf19678`)
- **BodyParts3D, © The Database Center for Life Science licensed under
  CC Attribution-Share Alike 2.1 Japan.** Used for the bones (release 3.0, "95 %"
  polygon set). Z-Anatomy is also derived from BodyParts3D.
  https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html
  Files taken from the mirror https://github.com/Kevin-Mattheus-Moerman/BodyParts3D (commit `2c83c69`).
  Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D
  structure database for anatomical concepts. Nucleic Acids Res. 2009;37:D782–5. PMID 18835852.

Changes made here: structures of one limb region were selected, Z-Anatomy's own
modifiers were applied, vessel and nerve curves were converted to meshes, and the
result was saved as Draco-compressed GLB files. The BodyParts3D bones were scaled
(x1.033), turned 0.27 degrees and moved so that they sit on the Z-Anatomy bones, and
Z-Anatomy's cartilage marking was copied onto them. No shape was edited and no
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
