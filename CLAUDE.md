# Fracture VR – project rules and file map

Limb fracture simulator for Meta Quest 3. Browser based (WebXR), pass-through.
Owner: an orthopaedic surgeon, no programming experience. Personal self-study. Public repo.

**Each session: read this file and PROGRESS.md first. Do not read the whole code base.**

## How to work

- Work in phases. Do only the phase the owner names. At the end: stop, update
  PROGRESS.md, give a test link, wait for OK.
- Explain in simple English. Give sources (PMID/DOI) for medical facts.
- No extras or refactors that were not asked for. If unsure, ask one short question.

## Realism rules (never break)

1. Soft tissue (muscle, nerve, vessel, skin) comes from Z-Anatomy
   (github.com/Z-Anatomy/Models-of-human-anatomy, CC BY-SA 4.0, derived from BodyParts3D).
   Bones come from BodyParts3D 3.0, the parent of Z-Anatomy (same person, about 4x the
   triangles; owner's decision, 16 Nov 2026), scaled and moved to match Z-Anatomy.
   Never build anatomy from geometric shapes. If an asset is missing, export fails,
   or a BodyParts3D bone does not match its Z-Anatomy bone: stop and tell the owner.
   Do not substitute.
2. Fracture lines follow the AO/OTA Compendium 2018 (Meinberg et al., J Orthop Trauma
   2018;32 Suppl 1). For joint-end fractures also use published CT fracture-mapping
   studies (e.g. tibial plateau: Yao et al., Bone Joint Res 2020, PMID 32728424).
   Store the source PMID/DOI in each data row. If no mapping paper exists for a
   region, tell the owner. Do not guess.
3. Fracture surfaces are rough and irregular (noise-displaced cutting surfaces).
   Cut faces show a cortex rim and a cancellous interior. No flat knife cuts.
   The cortex is MODELLED with a thickness formula (owner's decision, 16 Nov 2026),
   because the bone meshes are outer surfaces only. Keep the thickness values as data
   with a source, and say on the page that the cortex is modelled, not measured.
4. True scale. Build the right limb; mirror for left.
5. Do not reduce bone detail. Load one limb region at a time instead. Simplify soft
   tissue only if needed for 72 fps, and report how much.

## Token rules

- Heavy work goes in scripts that run once and save files (Python: bpy headless,
  trimesh, manifold3d). Never print mesh data or long logs to chat; short summaries only.
- Fractures are DATA: one engine + `fractures.json`, one row per AO/OTA code.
  Adding a fracture must not need new code.
- Pre-cut fragments offline, save as compressed GLB. No live cutting in the headset.
- Regions are DATA too: one `regions/<id>.json` per limb region, one export script.

## Stack

three.js + WebXR. Session `immersive-ar` (pass-through), fallback `immersive-vr`,
and a plain 3D view for phone or desktop. Controllers and hand tracking.
Static site on GitHub Pages (HTTPS). No build step: three.js is copied into `vendor/`.

## Phases

1. ASSETS (pilot: right knee to ankle) – done, see PROGRESS.md
2. FRACTURE ENGINE (tibia/fibula 41, 42, 43, 44, 4F + CT-mapped plateau and pilon) – done, see PROGRESS.md
3. VR VIEWER – done, see PROGRESS.md
4. REDUCTION – done together with 5, see PROGRESS.md
5. SOFT TISSUE – done together with 4, see PROGRESS.md
6. SCALE UP, one region per session (femur+patella, humerus, radius+ulna,
   clavicle+scapula, hand, foot). Femur split by the owner (18 Nov 2026):
   6a assets – done; 6b fractures 31 + 32 – done; 6c fractures 33 + 34 – done;
   6d muscle pull from attachment areas + femur readouts – done; 6e mixed reality (real table,
   hand occlusion, traction, haptics) – done (see PROGRESS.md). Owner's choices for 6b-6e: PROGRESS.md > Decisions.
7. FOOT AND ANKLE (owner's plan, 18 Nov 2026, answers in PROGRESS.md > Decisions):
   7a assets (`foot_right` + talus as context in `leg_right`) – done (see PROGRESS.md); 7b joints + ligament tethers
   (also for 43/44) – done, with the owner's extras: VR without pass-through as a choice, hide/isolate structures; 7c talus 81 + calcaneus 82 (CT-mapped); 7d 83-89 + dislocations;
   7e tendon pull, readouts, CT slice plane; 7f VR/MR (grips, positions, Sawbones overlay, haptics).

## File map

| Path | What it is |
|---|---|
| `index.html`, `js/viewer.js` | The web page: plain 3D viewer (layers, names, table) with a fracture picker and an explode slider. |
| `js/xr.js` | VR mode (WebXR): pass-through or plain VR (two buttons), menu panel, readout strip, holding fragments, free bones and the whole model, two-hand scale, Select / Hide / Isolate, Joints tab. |
| `js/joints.js` | Phase 7b: joints and ligament tethers (position-based solver), stress tests, torn ligaments, fibre lines. |
| `ligament_model.json` | Phase 7b DATA: teaching values (slack, tear), solver softness, stress tests with sources, ligament groups, joint names, fixed bone pairs, notes on Z-Anatomy. |
| `tools/joint_model.py` | Joints (cartilage contact points) and tethers (fibres between ligament attachments) -> `assets/<region>/joint_model.json` + `JOINTS.md`. Seconds, no Blender. |
| `tools/glb_meshes.mjs` | Decodes a Draco GLB to plain JSON points/triangles for Python tools. |
| `js/reduce.js` | Reduction maths: typical displacement, readout (translation, shortening, angles, step, gap), collision shapes and overlap test. |
| `js/tissue.js` | Soft tissue follows the fragments (skinning, tied on a 5 mm grid) and the ghost slider. |
| `fractures.json` | THE fracture data: one row per AO/OTA 2018 code (cuts, fragments, sources). Edit this to add or change a fracture. |
| `bone_model.json` | Per-region bone settings: modelled cortex thickness (with sources), canal range, joint frames. |
| `tools/fracture_engine.py` | Cuts the bones into fragments from `fractures.json`. Writes `assets/<region>/fractures/`. |
| `tools/bone_model.py` | Used by the engine: bone axes, joint lines, AO square rule, modelled cortex (inner surface). |
| `tools/preview.py` | Quick picture tiles of cut fractures for checking by eye (`--preview <dir>`). |
| `model/<region>/bones.npz` | Raw bones (metres) + cartilage marking, written by `export_region.py`, read by the engine. |
| `assets/<region>/fractures/*.glb` | Pre-cut fragments, one Draco GLB per fracture. `index.json` lists them; `FRACTURES.md` is the table. |
| `assets/<region>/*.glb` | Exported anatomy, one Draco-compressed GLB per layer. `bones.glb` is BodyParts3D, the rest Z-Anatomy. |
| `assets/<region>/manifest.json` | List of structures: name, layer, triangles, sizes, bounding box. The page reads this. |
| `assets/<region>/STRUCTURES.md` | The same list as a readable table. |
| `regions/<region>.json` | Which Z-Anatomy structures belong to a region (data, no code). |
| `assets/regions.json` | List of regions for the page's region picker (`?region=<id>`, default `leg_right`). |
| `regions/foot_right.json` | Foot and ankle region (7a): 26 foot bones + sesamoids, tibia and fibula whole as context. |
| `tools/export_muscles.py` | Blender (bpy) script: muscle attachments + lines of action from Z-Anatomy -> `model/<region>/muscles.json`. |
| `muscle_model.json` | Muscle pull data: PCSA per muscle (with status and source), end shares, teaching sizes, rules. |
| `tools/femur_geometry.py` | Measures a femur (head, neck and shaft axes, neck-shaft angle, version, bow) and compares with published values. Writes `model/<region>/femur_geometry.json`. |
| `tools/fetch_zanatomy.sh` | Downloads the pinned Z-Anatomy Blender file into `_source/` (not committed). |
| `tools/fetch_bodyparts3d.sh` | Downloads the BodyParts3D bone files a region lists into `_source/bodyparts3d/stl`. |
| `tools/export_region.py` | Blender (bpy) script: region JSON -> GLB layers + manifest. Fits BodyParts3D bones onto Z-Anatomy. Run once per region. |
| `tools/draco_compress.mjs` | Node script: Draco compression + material clean-up. Called by the export script. |
| `vendor/three/` | three.js r180 (MIT) and the Draco decoder. Do not edit. |
| `vendor/three-mesh-bvh/` | three-mesh-bvh 0.9.1 (MIT): fast ray hits on big meshes. Do not edit. |
| `LICENSE`, `CREDITS.md` | Code MIT; anatomy assets CC BY-SA 4.0 with attribution. |

## How to rebuild a region

```
pip install bpy            # Blender as a Python module (5.3 used)
(cd tools && npm install)  # once
bash tools/fetch_zanatomy.sh
bash tools/fetch_bodyparts3d.sh regions/leg_right.json
python3 tools/export_region.py _source/blend/Z-Anatomy/Startup.blend regions/leg_right.json assets/leg_right
bash tools/fetch_bodyparts3d.sh regions/foot_right.json      # foot (7a): 29 bone files
python3 tools/export_region.py _source/blend/Z-Anatomy/Startup.blend regions/foot_right.json assets/foot_right
python3 -m http.server 8000   # then open http://localhost:8000
```

## How to rebuild fractures (no Blender needed)

```
pip install trimesh manifold3d rtree scipy scikit-image pillow
python3 tools/fracture_engine.py leg_right                      # all rows, about 6 minutes
python3 tools/fracture_engine.py leg_right 42A1 41B3.1          # only these ids
python3 tools/fracture_engine.py leg_right --preview /tmp/t 42A1  # also save check pictures
python3 tools/femur_geometry.py thigh_right   # once, before the femur engine (axes, head, knee)
python3 tools/export_muscles.py _source/blend/Z-Anatomy/Startup.blend regions/thigh_right.json  # once (bpy)
python3 tools/fracture_engine.py thigh_right  # 80 rows (femur x 2 bone qualities, patella x 1), about 15 minutes
```

## Facts about the Z-Anatomy file (learned in Phase 1)

- Units are metres, true adult scale. Z is up, the body faces -Y, the RIGHT side is at -X.
- GLB export is Y-up: x = patient left (+), y = up, z = patient front (+).
  Meshes keep their Z-Anatomy world position (no re-centring). The page centres the view.
- Name endings: `.r` / `.l` real structures (right / left), `.g` groups (parents),
  `.i .j .s .t` label lines and text (ignore), `.or .er .o1r` muscle attachment areas.
- Top collections `1:` skeleton, `2:` muscle attachment areas, `3:` joints, `4:` muscles,
  `5:` vessels, `7:` nerves, `9:` body regions (= the skin surface, in patches).
- Bones and muscles are meshes. Arteries, veins and nerves are Blender curves (tubes);
  the export turns them into meshes. Skin patches carry a Solidify modifier.
- Bone meshes have two materials: `Bone` and `Cartilage` (cartilage = articular surface).
  Muscles have `Tendon` plus a muscle material. Material names are kept in the GLB.
- Each GLB node keeps its Z-Anatomy name in `extras.za_name` (three.js: `userData.za_name`).
- In the anatomical position the hand hangs beside the thigh: a height window alone picks up
  hand and forearm vessels and nerves (use `x_window_from`). The model is male.
- Z-Anatomy has a `3: joints` collection with capsules and ligaments (`Hip joint.g`,
  `Knee joint.g`...): exported as the `joints` layer.
- Bones are a single outer surface. There is no medullary canal or cortex thickness
  (true for Z-Anatomy and for BodyParts3D).
- Z-Anatomy bones are low-polygon (tibia 1,670 triangles, fibula 1,264), so they are
  used only as the target for fitting and for the cartilage marking.

## Region JSON keys (besides layers)

- `main_bone` – bone named in the page subtitle. `z_window_from` + `min_overlap_mm` – height window.
- `x_window_from` + `x_margin_mm` – side-to-side window; only the part of a structure inside it
  counts (keeps the hanging hand out of the thigh). Layer `exclude` / `include` – by name.
- Bones layer: `context_only` – bones shown intact, never cut in this region (manifest flag);
  `fit_max_mm` – per-bone fit limit, ONLY by the owner's decision (femur 2.5 mm, navicular 2.5 mm, 18 Nov 2026).
- `min_overlap_mm`: 20 for leg and thigh; 3 for the foot (foot vessels and nerves run flat, so their height
  range is small; nothing but ankle and foot lies below the talus).

## Facts about BodyParts3D bones (bone source since 16 Nov 2026)

- Version 3.0, "95 %" polygon set, from the mirror github.com/Kevin-Mattheus-Moerman/BodyParts3D
  (pinned commit in `tools/fetch_bodyparts3d.sh`). Files `FMA<id>.stl`, millimetres,
  same axes as Z-Anatomy. Whole body, 934 parts. The unreduced original is not published.
- Z-Anatomy = BodyParts3D x 1.033, rotated 0.27 degrees and moved. The export script finds
  this per bone (ICP) and stops if the fit is worse than 2 mm. Leg: max 1.0 mm, median 0.01 mm.
- A region lists bones as `"bodyparts3d": { "<Z-Anatomy name>": "<FMA id>" }`.
  Right tibia FMA24477, right fibula FMA24480, right femur FMA24474, right patella FMA24486,
  right hip bone FMA16586. Right foot (7a): talus FMA24482, calcaneus FMA24497, navicular FMA24500, cuboid
  FMA24528, cuneiforms medial/intermediate/lateral FMA24521/24523/24525, metatarsals 1-5 FMA24507/09/11/13/15,
  proximal phalanges 1-5 FMA43253/32634/32636/32638/32640, middle 2-5 FMA32642/32644/32646/230986, distal 1-5
  FMA32650/52/54/56/58, sesamoids (both in one file) FMA45097. Find other ids in the mirror's `FMA.csv` (it lists all of FMA,
  not only the 934 parts that have files: check the `stl/` folder).
- BodyParts3D has no materials. `Cartilage` faces are copied from the nearest Z-Anatomy
  face, so the cartilage edge is jagged at triangle size (about 2 mm).

## Fracture data (Phase 2)

- A row: `id`, `code`, `name` (wording as printed in the Compendium), `qualification`
  (the one that is modelled), `sources` (PMID, DOI, page), `line_basis`, `bones`.
- Per bone: `cuts` and `fragments`. Cut types: `plane` (transverse, oblique, any split
  plane), `spiral`, `prism` (outline on a joint surface pushed in: deep and tapering =
  split, shallow + `impaction_mm` = depression), `plug` (outline on the side of the bone).
- Fragment: `sides` {cut id: "+" or "-"} (+ = proximal side of a plane or spiral, inside
  of a prism or plug), or `rest: true`, optional `shatter` {pieces, style}.
- Positions are anatomical, never raw coordinates: `level` = {ref: knee | ankle |
  prox_end | dist_end, distal_mm} or {ref: diaphysis, frac}; angles: tilt 0 = transverse,
  azimuth 0 anterior, 90 medial, 180 posterior, 270 lateral. Joint outlines use (u, v):
  u -1 lateral edge .. +1 medial edge, v -1 posterior edge .. +1 anterior edge.
- Every cut surface is noise-displaced. Each fragment is cut from the cortex shell and the
  inner bone separately, so cut faces have the materials `FractureCortex`,
  `FractureCancellous`, `FractureMarrow` (plus `Bone`, `Cartilage` outside).
- Fragments are stored in the anatomical (reduced) position. GLB node extras: `fragment`,
  `bone`, `za_name`, `volume_cm3`, `centroid`, `site`, and for depressed fragments
  `impaction_mm` + `impaction_dir`. The bone under a depressed fragment is already removed.
- Ids that are not AO/OTA codes: `41C-PM`, `44-PM-I/II/III` (CT-mapped patterns).
- AO/OTA text source: the owner uploaded the Tibia, Fibula and Malleolar chapters and the
  introduction (pages S49-S69). They are NOT in the repo (journal copyright).
- Cloud environment `frac-sim-vr` belongs to this repo (hosts ota.org, journals.lww.com,
  www.aofoundation.org allowed; setup script installs the Python and Node tools).

## AO/OTA foot chapter (S89-S100, uploaded 18 Nov 2026, NOT in the repo)

- 81 talus, location after the code: .1 body, .2 neck, .3 head. Body: A avulsion (A1 anterior neck,
  A2 lateral process, A3 posterior process), B partial articular (B1 osteochondral, B2 simple,
  B3 fragmentary), C complete articular (C1 simple, C3 multifragmentary; no C2 printed).
  Neck = Hawkins: A nondisplaced (1), B* subtalar subluxation/dislocation (2), C* body dislocation (3),
  D* body and head dislocation (4). Head: A avulsion, B* partial, C* complete articular.
- 82 calcaneus: A extra-articular (A1 avulsion / posterior tuberosity / extra-articular tongue,
  A2 body); B tongue type exiting into the posterior facet (B1 simple, B3 multifragmentary; no B2
  printed); C complete articular joint depression (C1 Sanders 2, C2 Sanders 3, C3 Sanders 4).
- 83 navicular, 84 cuboid: A avulsion, B* partial articular, C* complete articular.
- 85 cuneiform .1 medial, .2 middle, .3 lateral: A avulsion, B partial, C complete articular. NO drawings.
- 87 metatarsal: 87.<1-5>.<1 proximal, 2 diaphyseal, 3 distal>. Ends: A* extra-, B* partial,
  C* complete articular. Shaft: A simple, B wedge, C multifragmentary.
- 88 phalanx: 88.<toe 1-5>.<1 proximal, 2 middle, 3 distal phalanx>.<segment 1-3>, types as 87.
  No fracture drawings.
- 89 crush, multiple fractures of the foot: A hindfoot, B midfoot, C forefoot.
- * = qualification a simple / b multifragmentary. There is no code for the tarsometatarsal (Lisfranc)
  joint or for pure dislocations (no 86): those rows get non-AO ids, like `41C-PM`.

## Foot region and talus follower (Phase 7a)

- Z-Anatomy foot names: toes are "fingers of foot" (`Proximal phalanx of first finger of foot.r`; no middle
  phalanx of the first toe), `Navicular bone.r`, `Cuboid bone.r`, `Medial cuneiform bone.r`, `Sesamoid bones of foot.r`
  (both sesamoids, one mesh). Groups: `Bones of foot.g`, `Muscles of foot.g`, `Ankle joint.g` (lateral collateral:
  ATFL, CFL, PTFL; medial collateral = deltoid: posterior tibiotalar, tibiocalcaneal, tibionavicular only - no
  anterior tibiotalar, no ankle capsule in Z-Anatomy), `Tibiofibular syndesmosis.g` (anterior, posterior, transverse),
  `Joints of foot.g` (Lisfranc ligament = `Cuneometatarsal interosseous ligaments.r`, spring ligament =
  `Plantar calcaneonavicular ligament.r`, bifurcate = `Calcaneonavicular ligament.r` + `Calcaneocuboid ligament.r`).
  Skin: `Regions of foot.g`, `Talocrural region.g`; nails `Nail plate (foot).r` (material Nail, added by name).
- Z-Anatomy's saphenous nerve ends 104 mm above the floor (does not reach the foot). `Common plantar digital
  branches of medial plantar nerve` has no `.r` ending (added by name).
- Page (viewer.js): the start view frames the region's own bones (context bones left out); the subtitle length is
  measured along the main bone's principal axis (`axisLength`), so the calcaneus reads 81 mm (tibia unchanged 358,
  femur 454 -> 456 because it is slightly oblique).
- Followers are data: `bone_model.json` > region > `followers` {mesh: {bone, end}}. `fracture_engine.py`
  `joint_followers` gives each row `followers` {mesh: fragment with the most joint cartilage of that end};
  `follower_pivots` writes index `follow` {mesh: {bone, pivot (GLB m), arc_radius_mm}}. Talus pivot = circle fitted to
  the trochlea cartilage in the sagittal plane (radius 23.9 mm on this talus). The viewer moves a follower with its
  fragment without the tilt about the medial axis (the joint takes it up); femur rows (no `follow`) still use
  `femur.knee_centre`. A follower is out of bone collision; if its bone is not cut (4F, fibula-only 44), the talus
  stays home and IS a collider. Followers need a full re-cut (not `--meta`).

## Femur fractures (Phase 6b)

- `bone_model.json` > `thigh_right`: `landmarks: "femur"` (measured landmarks, see `_landmarks_femur`:
  `hip`, `head_centre`, `neck_junction`, `neck_base`, `gt_tip`, `lt_peak`, `lesser_trochanter`
  (inferior border = start of 32), `innominate_tubercle`, `knee`, `diaphysis_start/end`),
  `profiles` young / elderly with `cortex_profiles` per bone, `default_profile` per segment.
  Cortex `boosts`: thicker towards an azimuth within an s range (linea aspera, calcar).
- Extra cut placement (all data): `through` {`neck`: 0 subcapital .. 1 basicervical, `up_mm`,
  `ant_mm`} | {`head`: {`elev_deg`, `ant_deg`, `frac` of radius}} | {`landmark`, `distal_mm`,
  `medial_mm`, `anterior_mm`}; plane `reference`: `body` (tilt from the standing vertical, azimuth
  0 ant / 90 med; = Pauwels angle), `neck` (tilt from the neck axis; azimuth 0 ant / 90 sup),
  `head` (normal along `elev_deg`/`ant_deg`); plane `from` + `to` landmarks (+ `twist_deg`):
  holds the line and the front-to-back direction, + = proximal side. Plug `on: "head"` with
  `elev_deg`, `ant_deg` (0, 0 = tip of the neck axis; + superior, + anterior), `impaction_mm`.
  Head direction of the fovea on this femur: elev -30.5, ant -36.3.
- A head split plane needs a second limit (`sub`: neck plane at 0, + side) or it also cuts the shaft.
  Neck rows use `lim` (neck plane at 1.45) so a flat Pauwels plane cannot take the greater trochanter.
- Row `tags` (garden, pauwels, pipkin), `checks: ["lateral_wall"]` (result in index `measured`).
- Index entries with two bone qualities have `files` {young, elderly}, `bone_quality` (default)
  and `file` (= the default). Files are `<id>_young.glb` / `<id>_elderly.glb`. A row is cut per
  quality only if one of its bones has `cortex_profiles` (patella rows are cut once).
- Distal femur (6c): landmarks `lat_epicondyle`, `med_epicondyle`, `transcondylar` (30 mm above the
  joint line on this femur); frame `condyles` (u -1 lateral .. +1 medial, v -1 posterior .. +1
  anterior; `depth_mm` = mm above the joint line). Plug `at: <landmark>` aims the cut out from the
  axis through that point (the condyles lie 23 mm behind the shaft axis, so an azimuth misses them).
  Hoffa planes: `tilt_deg` = 90 + sagittal angle, `azimuth_deg` = 182.5 (posterior normal of the
  condylar line) + axial angle (lateral) or - axial angle (medial).
- Wedge template (two planes through one point at `through` azimuth A): the wedge's BASE is on
  the opposite side (A + 180). A medial wedge therefore uses A = 270.
- Patella: `bones.patella` in `thigh_right`; level `{"s": 0..1}` along its own axis (tilted about
  24 degrees backwards), sides lateral 270 / medial 90. Its cartilage marking reaches the tip.

## Muscle pull (Phase 6d)

- `model/<region>/muscles.json` (from `export_muscles.py`): per muscle `ends` [{bone, points (mm, Z-Anatomy
  axes), dir (line of action), method}]. Mapping of shared / missing areas: region JSON `muscle_attachments`.
  Z-Anatomy attachment areas end in `.or/.er` (origin / insertion, also `.o1r` ...); use the PARENT bone for
  the side (some right-side areas are named `.el`).
- `fracture_engine.py` > `muscle_poses`: anchor = fragment with the femoral head (turns about the head
  centre only) or, for the patella, the fragment holding the patellar ligament; `followers` (tibia,
  fibula, intact patella) move with the knee fragment; `carriers` name the fragments for the femur
  readout; `pose` per fragment {unit head/leg/piece, t, axis, deg, pivot, muscles} in GLB axes, metres.
  Sizes and rules in `muscle_model.json`. Changing PCSA values needs a rebuild (poses are computed
  while cutting).
- Viewer: preset `{pose}` in `displacedMatrix`; main fragment = `anchor`; `updateFollowers` each frame
  (knee fragment pose without its tilt about the medial axis, pivot = knee centre); followers are left
  out of bone collision and tied to the knee fragment for the soft tissue; `femurState`/`femurLines`
  give neck-shaft angle, version, head-knee length against `index.femur.intact`.

## Joints and ligaments (Phase 7b)

- Rebuild: `python3 tools/joint_model.py foot_right` and `... leg_right` (needs `model/<region>/bones.npz`, `assets/<region>/joints.glb`,
  `(cd tools && npm install)`). After editing `fractures.json` `torn` only: `python3 tools/fracture_engine.py leg_right --meta`.
- Tether bones: the two bones a ligament mesh touches most (score = sqrt(min attachment points) x distance between
  attachments); multi-part meshes (e.g. "Articular capsules of metatarsophalangeal joints") are split into parts.
  Corrections only where the result contradicts the name: `ligament_model.json` > `tether_bones` (pair, `parts`, `fan_from`).
- `joint_model.json`: `joints` [{name, bones, contacts: [a xyz on bones[0], b xyz on bones[1], normal of bones[1], gap mm]}],
  `tethers` [{name, part, bones, group, fibres: [a xyz, b xyz], rest_mm}], GLB metres. `fixed`: Tibia.r.
- Solver (`js/joints.js`): bodies = bones not cut (`dyn` unless fixed); a cut bone's fragments are kinematic bodies (ends
  go to the nearest fragment within 3 mm via BVH). Per frame 10 rounds: seat (soft, compliance 400) or stress drive (15),
  fibula pin, contacts (hard, gap >= rest gap - 0.5 mm), fibres (hard, length <= rest x 1.04). Compliance is in units of
  inverse mass (bone mass 1), not XPBD seconds. Free bodies are written to `node.matrix` (matrixAutoUpdate off).
  Layer space = bones layer axes; always convert with the CURRENT `layerGroups.bones.matrixWorld` (the VR stage moves it).
- Foot stress tests weld all foot bones (not the fibula) into one body "Foot" (centre = talus). Tilt hinges at the medial
  edge of the dome, external rotation about the dome centre (test `pivot` in the data).
- Leg: talus = free body; `updateFollowers` hands it the follower pose (`joints.setBase(node, F, hard)`): hard (seated) when
  the plafond fragment moves, soft when the plafond is on the main tibia. The whole fibula is free only in stress tests.
- Soft tissue: `tissue.js` ties tissue to fragments AND to `joints.pieces()` (free bones; own bone inverse each).
- Hide / isolate (`viewer.js` `vis`): keys = Z-Anatomy name (structure and all its fragments) or fragment label; sets
  `mesh.visible` / `holder.visible` only (colliders unchanged). VR picking of hidden things is filtered with `vis.shown`.
- Browser tests in this cloud box: a local `http.server` was refused; serve the files through Playwright
  `context.route('http://site.test/**', ...)` reading from the repo instead. IWER from npm (`iwer@2`, `build/iwer.min.js`
  as an init script).

## VR mode (Phase 3)

- Scene: `scene > stage > root > layer groups`. `stage` is the model's place in the room
  (moved, turned, scaled by the user; identity on the plain page). `root` only centres the model.
- A fragment: `fx.group > holder > node`. `holder` carries the explode offset; `node` carries
  the pose the user gave it. `node` at identity = anatomical home position.
- VR start: leg lies supine at table height (model centre 0.95 m), knee to the user's left.
  VR starts with only the bones layer; the other layers are switched on the panel.
- Input: `renderer.xr.getController(i)` ray for controllers and hands. Trigger or pinch on a
  fragment holds it; on empty space, or the grip, holds the whole model; two holds = scale
  (0.25x to 4x). Menu is a canvas-texture panel (no DOM overlay on Quest).
- Test without a headset: Playwright + the `iwer` npm package (Meta's WebXR emulator),
  `new IWER.XRDevice(IWER.metaQuest3).installRuntime({ forceInstall: true })` in an init script.
- three.js overwrites `camera.fov` while in VR; `xr.js` restores it on exit.
- The scene has no background colour: the page CSS (or the room in pass-through) shows through.

## Mixed reality (Phase 6e, all in `js/xr.js`)

- Session (pass-through only): optional `hit-test`, `depth-sensing` (`usagePreference: ['gpu-optimized']`).
  three.js r180 draws the depth-sensing mesh itself (real things hide the model); `mr.occlude` toggles
  its visibility. Buttons appear only when available (`mr.canPlace`, `mr.canOcclude`).
- "Place on table": hit-test sources from each controller's `targetRaySpace`; flat surfaces only;
  `placeOnTable` puts the skin's lowest point 2 mm above the hit, supine, across in front of the user.
- Two hands on one fragment (`twoF`): midpoint moves, the line between the hands turns, no scaling.
  Pointing at a follower (tibia, fibula) grabs its knee fragment.
- `carry`: with `sim.pull` on, the target lags `RESIST` (0.2) toward `displacedM`; haptics through
  `inputSource.gamepad.hapticActuators[0].pulse` (knock on contact, buzz while pulling).
- three.js r180 depth-sensing bugs, worked around in our code (fix 20 Nov 2026, `updateMR` in xr.js + render
  loop in viewer.js): its depth mesh sets no colour (we set `colorWrite = false`); its `ExternalTexture` is bound
  only for 2D samplers, not the `sampler2DArray` the depth shader uses (we set
  `renderer.properties.get(tex).__webglTexture = tex.sourceTexture`); with depth on it skips its clear (we call
  `renderer.clear()`). Keep these when updating three.js unless the new version fixes them.
- To test the depth path in the emulator: IWER 2.8 `dev.installSEM(Cls)` with a small class that has
  `environmentCanvas` (shown behind the app canvas = the "room"), `render()`, `computeHitTestResults()`
  (return []), `computeDepthBuffer(view, proj, w, h)` (return {data: Float32Array metres, width, height,
  rawValueToMeters: 1}), `trackedPlanes`/`trackedMeshes` (empty Sets). Paint the room a vivid colour and count
  its pixels in a screenshot.
- Test hooks: `viewer.xr.mr`, `viewer.xr.placeOnTable`. In the emulator keep the IWER device on
  `window.__dev` to move controllers and press `updateButtonValue('trigger', 1)`; IWER has no depth image unless a fake room is installed (see the depth-path note above).
- In the thigh region the hip lies to the user's LEFT, so "toward the foot" is +x at the start.

## Reduction and soft tissue (Phases 4 + 5)

- Typical displacement presets live in `fractures.json` > `displacements` (with sources and
  `basis`); each fragment row names one with `"displace"`. `fracture_engine.py` copies them,
  plus each bone's axes (`frames`: distal, anterior, medial in GLB axes), into
  `assets/<region>/fractures/index.json`. After editing text or presets only, run
  `python3 tools/fracture_engine.py leg_right --meta` (seconds, no re-cutting).
- Shaft-type preset (has `shortening_mm`): moves the distal part relative to the proximal
  part; twist about the axis, tilt about a hinge on the concave cortex. Piece preset
  (`away_mm`, `proximal_mm`, `use_impaction`): moves the piece itself.
- The largest fragment of each bone is the main one (fixed); the others are measured against it.
- Start positions (`placeAll` in viewer.js): largest moving fragment first, each free of
  everything placed and of the pieces still to come (at home). If the preset overlaps,
  the cheapest smaller version is used (shortening, deformity and separation each cost).
- Collision (`advance` in viewer.js): moves a held fragment toward the hand in up to 3
  steps and stops before it enters a new bone; pairs already touching may stay touching
  but not get deeper (a second, smaller shape). Collision shapes come from `makeCollider`
  in reduce.js: one closed surface, moved inward, points merged; sizes by fragment volume.
- Soft tissue meshes are turned into SkinnedMesh at load (bone 0 = intact skeleton,
  bone i = fragment i). Ties are recomputed when the fracture changes, in the background.
- `window.viewer` exposes the functions used by the browser tests.

## Technical notes

- Engine works in millimetres, Z-Anatomy axes; GLB output is metres, Y up, like Phase 1.
- manifold3d needs fresh C-contiguous arrays (`np.array(..., order="C")`), not views.
- Browser screenshots of heavy fractures are very slow in headless Chromium; use
  `--preview` pictures for checking and the browser only for a few functional tests.

- The pip build of Blender has no Draco library, so compression is done in Node.
- In `export_region.py`, set `bpy.context.window.scene` before exporting. Using
  `temp_override(scene=...)` around the glTF exporter crashes Blender.
- Always open the blend file with `use_scripts=False`.
- Browser test: Playwright Chromium with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`;
  wait for `window.viewer.ready`.
