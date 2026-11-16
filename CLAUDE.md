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
2. FRACTURE ENGINE (tibia/fibula 41, 42, 43, 44, 4F + CT-mapped plateau and pilon)
3. VR VIEWER
4. REDUCTION
5. SOFT TISSUE
6. SCALE UP, one region per session (femur+patella, humerus, radius+ulna,
   clavicle+scapula, hand, foot)

## File map

| Path | What it is |
|---|---|
| `index.html`, `js/viewer.js` | The web page. Phase 1: simple asset viewer (layers, names, table). |
| `assets/<region>/*.glb` | Exported anatomy, one Draco-compressed GLB per layer. `bones.glb` is BodyParts3D, the rest Z-Anatomy. |
| `assets/<region>/manifest.json` | List of structures: name, layer, triangles, sizes, bounding box. The page reads this. |
| `assets/<region>/STRUCTURES.md` | The same list as a readable table. |
| `regions/<region>.json` | Which Z-Anatomy structures belong to a region (data, no code). |
| `tools/fetch_zanatomy.sh` | Downloads the pinned Z-Anatomy Blender file into `_source/` (not committed). |
| `tools/fetch_bodyparts3d.sh` | Downloads the BodyParts3D bone files a region lists into `_source/bodyparts3d/stl`. |
| `tools/export_region.py` | Blender (bpy) script: region JSON -> GLB layers + manifest. Fits BodyParts3D bones onto Z-Anatomy. Run once per region. |
| `tools/draco_compress.mjs` | Node script: Draco compression + material clean-up. Called by the export script. |
| `vendor/three/` | three.js r180 (MIT) and the Draco decoder. Do not edit. |
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
- Bones are a single outer surface. There is no medullary canal or cortex thickness
  (true for Z-Anatomy and for BodyParts3D).
- Z-Anatomy bones are low-polygon (tibia 1,670 triangles, fibula 1,264), so they are
  used only as the target for fitting and for the cartilage marking.

## Facts about BodyParts3D bones (bone source since 16 Nov 2026)

- Version 3.0, "95 %" polygon set, from the mirror github.com/Kevin-Mattheus-Moerman/BodyParts3D
  (pinned commit in `tools/fetch_bodyparts3d.sh`). Files `FMA<id>.stl`, millimetres,
  same axes as Z-Anatomy. Whole body, 934 parts. The unreduced original is not published.
- Z-Anatomy = BodyParts3D x 1.033, rotated 0.27 degrees and moved. The export script finds
  this per bone (ICP) and stops if the fit is worse than 2 mm. Leg: max 1.0 mm, median 0.01 mm.
- A region lists bones as `"bodyparts3d": { "<Z-Anatomy name>": "<FMA id>" }`.
  Right tibia FMA24477, right fibula FMA24480. Find other ids in the mirror's `FMA.csv`.
- BodyParts3D has no materials. `Cartilage` faces are copied from the nearest Z-Anatomy
  face, so the cartilage edge is jagged at triangle size (about 2 mm).

## Technical notes

- The pip build of Blender has no Draco library, so compression is done in Node.
- In `export_region.py`, set `bpy.context.window.scene` before exporting. Using
  `temp_override(scene=...)` around the glTF exporter crashes Blender.
- Always open the blend file with `use_scripts=False`.
- Browser test: Playwright Chromium with
  `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`;
  wait for `window.viewer.ready`.
