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

## Fracture classification and fracture maps (Phase 2)

- Meinberg EG, Agel J, Roberts CS, Karam MD, Kellam JF. Fracture and Dislocation
  Classification Compendium - 2018. J Orthop Trauma. 2018;32 Suppl 1:S1-S170.
  PMID 29256945, doi:10.1097/BOT.0000000000001063. Codes and names are used as printed.
  Copyright AO Foundation and Orthopaedic Trauma Association; the text and drawings are not in this repo.
- Molenaars RJ et al. J Bone Joint Surg Am. 2015;97:1512-20. PMID 26378267, doi:10.2106/JBJS.N.00866
- Yao X et al. Bone Joint Res. 2020;9:258-67. PMID 32728424, doi:10.1302/2046-3758.96.BJR-2019-0382.R2
- Barei DP et al. J Orthop Trauma. 2008;22:176-82. PMID 18317051, doi:10.1097/BOT.0b013e318169ef08
- Cole PA et al. J Orthop Trauma. 2013;27:e152-6. PMID 23360909, doi:10.1097/BOT.0b013e318288a7e9
- Topliss CJ, Jackson M, Atkins RM. J Bone Joint Surg Br. 2005;87:692-7. PMID 15855374, doi:10.1302/0301-620X.87B5.15982
- Haraguchi N et al. J Bone Joint Surg Am. 2006;88:1085-92. PMID 16651584, doi:10.2106/JBJS.E.00856
- Mangnus L et al. J Orthop Trauma. 2015;29:428-35. PMID 25785358, doi:10.1097/BOT.0000000000000330

## Typical displacement (Phases 4 + 5)

Directions of the starting displacement; the sizes are teaching values.
- Sarmiento A et al. Clin Orthop Relat Res. 1995;(315):8-24. PMID 7634690
- Teitz CC, Carter DR, Frankel VH. J Bone Joint Surg Am. 1980;62:770-6. PMID 7391100
- Lang GJ et al. Clin Orthop Relat Res. 1995;(315):64-74. PMID 7634688
- Freedman EL, Johnson EE. Clin Orthop Relat Res. 1995;(315):25-33. PMID 7634677
- Honkonen SE. Clin Orthop Relat Res. 1994;(302):199-205. PMID 8168301
- Yablon IG, Heller FG, Shouse L. J Bone Joint Surg Am. 1977;59:169-73. PMID 403191

## Modelled cortex (Phase 2)

The cortex thickness is a model, not a measurement. Its shape is supported by:
Capozza RF et al. J Anat 2010 (thickest toward mid-diaphysis); Maeda K et al. J Exp Orthop 2020
(anterior thicker than posterior); Taylor CE et al. Anat Rec 2020 (canal diameter, used as a check).
Details and DOIs are in `bone_model.json`.

## Software

- three.js r180 – MIT licence – https://threejs.org (in `vendor/three/`)
- three-mesh-bvh 0.9.1 – MIT licence – https://github.com/gkjohnson/three-mesh-bvh (in `vendor/three-mesh-bvh/`)
- Draco decoder – Apache-2.0 – https://github.com/google/draco (in `vendor/three/examples/jsm/libs/draco/`)
- Build tools only: Blender (GPL, used as a tool), glTF-Transform (MIT), manifold3d (Apache-2.0), trimesh (MIT), SciPy, scikit-image (BSD)
