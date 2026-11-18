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
   6a assets – done; 6b fractures 31 + 32 – done (see PROGRESS.md); 6c fractures 33 + 34;
   6d muscle pull from attachment areas + femur readouts; 6e mixed reality (real table,
   hand occlusion, traction, haptics). Owner's choices for 6b-6e: PROGRESS.md > Decisions.

## File map

| Path | What it is |
|---|---|
| `index.html`, `js/viewer.js` | The web page: plain 3D viewer (layers, names, table) with a fracture picker and an explode slider. |
| `js/xr.js` | VR mode (WebXR): pass-through or plain VR, menu panel, readout strip, holding fragments and the whole model, two-hand scale. |
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
python3 -m http.server 8000   # then open http://localhost:8000
```

## How to rebuild fractures (no Blender needed)

```
pip install trimesh manifold3d rtree scipy scikit-image pillow
python3 tools/fracture_engine.py leg_right                      # all rows, about 6 minutes
python3 tools/fracture_engine.py leg_right 42A1 41B3.1          # only these ids
python3 tools/fracture_engine.py leg_right --preview /tmp/t 42A1  # also save check pictures
python3 tools/femur_geometry.py thigh_right   # once, before the femur engine (axes, head, knee)
python3 tools/fracture_engine.py thigh_right  # 45 femur rows x 2 bone qualities, about 10 minutes
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
  `fit_max_mm` – per-bone fit limit, ONLY by the owner's decision (femur 2.5 mm, 18 Nov 2026).

## Facts about BodyParts3D bones (bone source since 16 Nov 2026)

- Version 3.0, "95 %" polygon set, from the mirror github.com/Kevin-Mattheus-Moerman/BodyParts3D
  (pinned commit in `tools/fetch_bodyparts3d.sh`). Files `FMA<id>.stl`, millimetres,
  same axes as Z-Anatomy. Whole body, 934 parts. The unreduced original is not published.
- Z-Anatomy = BodyParts3D x 1.033, rotated 0.27 degrees and moved. The export script finds
  this per bone (ICP) and stops if the fit is worse than 2 mm. Leg: max 1.0 mm, median 0.01 mm.
- A region lists bones as `"bodyparts3d": { "<Z-Anatomy name>": "<FMA id>" }`.
  Right tibia FMA24477, right fibula FMA24480, right femur FMA24474, right patella FMA24486,
  right hip bone FMA16586. Find other ids in the mirror's `FMA.csv` (it lists all of FMA,
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
  and `file` (= the default). Files are `<id>_young.glb` / `<id>_elderly.glb`.

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
