# Progress

## Done

### Phase 1 – ASSETS (pilot: right leg, knee to ankle) – waiting for owner's OK

- Soft tissue: Z-Anatomy, commit `cf19678` (pinned in `tools/fetch_zanatomy.sh`).
- Bones: BodyParts3D 3.0 (owner's decision, 16 Nov 2026; pinned in
  `tools/fetch_bodyparts3d.sh`). Rule 1 in CLAUDE.md was reworded to allow this.
- Exported 53 structures, 187,693 triangles, 710 KB in 6 files (`assets/leg_right/`).
  Full table: `assets/leg_right/STRUCTURES.md` (also shown on the page).

| Layer | Source | Structures | Triangles | File size |
|---|---|---:|---:|---:|
| Bones (tibia, fibula) | BodyParts3D 3.0 | 2 | 11,472 | 57 KB |
| Muscles and tendons | Z-Anatomy | 16 | 70,393 | 273 KB |
| Arteries | Z-Anatomy | 7 | 30,528 | 103 KB |
| Veins | Z-Anatomy | 7 | 38,592 | 118 KB |
| Nerves | Z-Anatomy | 11 | 31,392 | 87 KB |
| Skin | Z-Anatomy | 10 | 5,316 | 72 KB |

- Bones: tibia 6,850 triangles (was 1,670), fibula 4,622 (was 1,264).
  Fitted onto the Z-Anatomy bones with one scale (x1.033), a 0.27 degree turn and a shift.
  Fit: tibia median 0.006 mm, max 0.99 mm; fibula median 0.007 mm, max 0.73 mm.
- Cartilage marking copied from Z-Anatomy onto the new bones (edge is jagged, about 2 mm).
- No triangle reduction anywhere (bone 0 %, soft tissue 0 %).
- Tibia is 358 mm long at Z-Anatomy scale (347 mm in the BodyParts3D file).
- Simple viewer page: layer tick boxes, tap a structure for its name, table.
  Tested in headless Chromium (desktop and phone size), no errors. Not tested on a Quest.
- LICENSE (code MIT, assets CC BY-SA 4.0) and CREDITS.md added.

How structures were chosen (`regions/leg_right.json`):
- Bones: Tibia (FMA24477), Fibula (FMA24480).
- Muscles: everything in Z-Anatomy's groups "Anterior / Lateral / Posterior compartment of leg".
- Arteries, veins, nerves: every right-side structure with at least 20 mm of its course
  between the top of the tibia and the tip of the medial malleolus, plus 4 added by name
  (inferior medial and lateral genicular arteries, infrapatellar branch of saphenous nerve,
  intermediate dorsal cutaneous nerve of foot).
- Skin: Z-Anatomy surface patches of the knee, leg and ankle regions.

### Phase 2 – FRACTURE ENGINE – waiting for owner's OK

- Engine `tools/fracture_engine.py` + data `fractures.json`. Adding a fracture = adding a row.
- 96 rows built, 0 errors: 41 (25 subgroups), 42 (7 groups), 43 (27), 44 (27), 4F (6),
  plus 4 CT-mapped patterns (`41C-PM`, `44-PM-I`, `44-PM-II`, `44-PM-III`).
  95 have fragments; 44A1.1 is a ligament injury only. Table: `assets/leg_right/fractures/FRACTURES.md`.
- Total 3.5 million triangles, 13.3 MB. One fracture: 7,000 to 134,000 triangles, 32 to 492 KB.
  Only the chosen fracture is loaded.
- All ten cutting types work: transverse, oblique, spiral, wedge, multifragmentary,
  segmental, partial articular split, depression, split-depression, complete articular.
- Cut surfaces are noise-displaced (about 1 mm rough, waves 3.5 to 28 mm). Cut faces show
  cortex rim, cancellous bone, and marrow in the shaft.
- Codes and names were checked against the printed Compendium pages S49-S69, which the
  owner uploaded (not in the repo). Where a drawing shows one qualification in bold, that
  one is modelled and named in the row.
- Modelled cortex: tibia 5.0 mm mid-shaft to 1.2 mm at the ends, 35 % thicker anteriorly;
  fibula 2.6 to 0.9 mm (`bone_model.json`). Check: the modelled tibial canal is 12-35 mm wide
  between 20 and 80 % of the length; Taylor 2020 measured 13-32 mm (doi 10.1002/ar.24479).
- AO square rule measured on this leg: proximal end segment 88 mm, distal 64 mm.
- Footprints matched to published sizes: posterolateral posterior malleolus fragment covers
  11.6 % of the plafond (Haraguchi 2006: 11.7 %), medial-extension type about 30 % (29.8 %),
  posteromedial plateau fragment about 58 % of the medial plateau (Barei 2008: 58 %).
- Test page: fracture picker, spread slider, tap a fragment for its name. Tested in headless
  Chromium, no errors. Not tested on a Quest.

Limits the owner should know (Phase 2):
1. Fracture lines were placed by reading the Compendium drawings and the ABSTRACTS of the
   mapping papers. Nothing was traced from a map figure, and the full texts were not read.
   Every row says so in `line_basis`. The owner should review the lines.
2. One qualification per code. Shaft rows are the middle third only.
3. Subgroups that differ only by a ligament injury share the same bone cut (for example
   44B1.1 and 44B1.2). The ligament part is text only (`soft_tissue`).
4. Subgroups defined by displacement (43C2.1 asymmetric impaction, 44C3.2 shortening) are
   cut in the reduced position; the displacement belongs to Phase 4.
5. No mapping paper was looked for yet for the medial malleolus, the lateral malleolus and
   the proximal fibula. Those rows rest on the Compendium only.
6. 41C3 group name is kept as printed ("fragmentary or multifragmentary metaphyseal fracture").
7. Fibula cortex values have no published source.

### Phase 3 – VR VIEWER – waiting for owner's OK

- "Enter VR" button on the page. Pass-through (`immersive-ar`) when the headset offers it,
  else plain VR with a floor grid. On a phone or desktop the page stays a plain 3D view.
- The leg starts lying supine at table height (centre 0.95 m above the floor, 45 cm in
  front), knee to the left, front of the leg up, true scale.
- Controllers and hand tracking:
  - trigger (or pinch) while pointing at a fragment: hold and move that fragment;
  - trigger (or pinch) on empty space, or the grip button: hold and move the whole model;
  - both hands on the whole model: turn it and scale it (0.25x to 4x).
- Floating menu panel (left of the model): Intact, segment tabs 41 / 42 / 43 / 44 / 4F,
  one button per AO/OTA code, explode slider (0-30 mm), Reset, Exit VR. It also shows the
  code, the printed name and the fragment being pointed at.
- Reset puts every fragment home, explode to 0, and the model back at table height, scale 1.
- Tested with Meta's WebXR emulator (IWER, Quest 3 profile) in headless Chromium: session
  start in pass-through mode, menu, fragment hold (moved exactly as the hand moved), whole
  model hold, two-hand scale (2.0 for doubled hand distance), explode, pinch with an
  emulated hand, reset, exit, and the page returning to normal. No errors.

Limits the owner should know (Phase 3):
1. NOT tested on a real Quest 3. Frame rate (72 fps target) and how pass-through looks are
   unknown until the owner tries it. Heaviest fracture: 134,000 triangles.
2. In VR only bones are shown. Soft tissue layers come in Phase 5.
3. No hand or controller models are drawn, only a thin pointing line and a dot. In
   pass-through the real hands are visible; in plain VR they are not.
4. Fragments can pass through each other (collision is Phase 4).
5. The menu panel stays where it was placed at the start. There is no left-leg mirror button yet.

### Phases 4 + 5 – REDUCTION and SOFT TISSUE (done together, owner's request) – waiting for owner's OK

Reduction (Phase 4)
- Every fragment's home position is its anatomical position (stored that way in the GLB).
  "Reduced" puts every fragment home; "Reset view" in VR only resets where the model stands.
- Each fracture starts in a TYPICAL DISPLACEMENT. The presets are data in `fractures.json`
  (`displacements`, 14 presets; every moving fragment of every row has one). Each preset
  says where its direction comes from (PMID) and that the size is a teaching value:
  - shaft middle third: 8 mm shortening, 5 mm lateral, 3 mm posterior, 6° varus,
    5° apex anterior, 10° external (Sarmiento 1995, PMID 7634690; Teitz 1980, PMID 7391100);
  - shaft proximal third: valgus 8° and apex anterior 7° (Lang 1995, PMID 7634688;
    Freedman 1995, PMID 7634677);
  - plateau split / condyle: 5 mm widening and 3 mm step, the limits Honkonen 1994
    (PMID 8168301) found tolerable;
  - lateral malleolus: shortening and external rotation (Yablon 1977, PMID 403191);
  - depressed fragments use the impaction depth cut in Phase 2 (4-6 mm);
  - wedges, pilon splits, medial and posterior malleolus, avulsions: NO published source
    found; marked as such on the page.
- Bone cannot start inside bone: fragments are placed largest first; if the full preset
  would overlap, the cheapest smaller version is used. All 96 fractures start free of
  overlap. 7 start with under 75 % of the preset deformity (41C1.2, 42A1, 43A1.1, 43A1.2,
  43A2.1, 43C1.2, 4F1B). Angulation hinges on the cortex of the concave side, so the gap
  opens on the convex side; in the six 41A fractures this shows as about 8 mm lengthening.
- Live readout (page panel and a strip under the VR menu), for every moving fragment:
  - shaft-type fragment: distal part relative to proximal part: translation (mm, with
    direction), shortening (bone length between points 15 cm each side), angulation
    (varus/valgus, apex anterior/posterior, degrees), rotation (internal/external);
  - loose piece (split, depressed, wedge, malleolus): its own movement: translation,
    along the bone (proximal/distal), tilt, rotation;
  - joint fractures (41B/C, 43B/C, 44): articular step and gap (mm), from the points
    where the joint surface meets the fracture.
- Bone blocks bone: a held fragment stops at contact with other fragments and intact
  bones. Collision shapes are 0.3-0.8 mm smaller than the bone and lighter (points merged
  on a 0.6-1.6 mm grid; the bone you see is not simplified). A fragment can always be pulled
  back out of contact, and the home position is always free. Tests on 9 fractures:
  fragments seat fully (0 mm left over); pushed 15 mm into bone they stop within 1-3 mm.
- Speed of the collision test on the build machine: 0.9-6.8 ms on average per move, spikes
  up to 36 ms. If it averages over 8 ms for about 1.5 seconds, collision switches itself off
  and the page/VR panel says so. NOT measured on a Quest 3 (see limits).

Soft tissue (Phase 5)
- Layer toggles for skin, muscles, arteries, veins, nerves on the page and in VR.
- Soft tissue ghost slider (0-100 %) on the page and in VR.
- Tissue follows the fragments (skinning): every tissue point is tied to the nearest bone
  pieces, worked out on a 5 mm grid in the background (under 1 s per fracture on the build
  machine), only for layers that are shown. In the anatomical position nothing moves.
- Optional "muscle pull": loose fragments are pulled back toward the typical deformity,
  stopping at bone contact. It is a spring, not a model of muscle forces.
- Soft tissue was NOT simplified (0 % reduction).

Tested: all 96 fractures load with no errors; VR run in Meta's emulator (menu, holding a
fragment against bone, layers, ghost, reduced/displaced, muscle pull, exit), no errors.

Limits the owner should know (Phases 4 + 5):
1. Not tested on a real Quest 3. 72 fps with collision on is not proven. The comminuted
   fractures (41C3.3, 43C3.3) are the most likely to switch collision off on the headset.
2. Typical displacement sizes are teaching values. For wedges, pilon splits, the medial and
   posterior malleolus and avulsions, the direction has no published source either.
3. Tissue near the bone shears over a few mm at the fracture (it follows the nearest
   fragment); it does not stretch like real tissue, and it never tears.
4. Loading a fracture takes up to 2 s on the build machine (start positions and collision
   shapes are worked out then).
5. Ligaments (syndesmosis, deltoid, collaterals) are not in the model, so they do not hold
   or pull fragments.

## Decisions by the owner

- 16 Nov 2026: bones from BodyParts3D 3.0 (not Z-Anatomy).
- 16 Nov 2026: Phase 1 accepted (owner started Phase 2).
- 16 Nov 2026: Phase 2 accepted (owner started Phase 3).
- 16 Nov 2026: Phase 3 accepted; owner asked for Phases 4 and 5 together.
- 16 Nov 2026: **cortex is MODELLED, not measured.** Both bone sources are one outer
  surface, so Phase 2 builds the cortex rim and medullary canal with a thickness formula,
  the same way as the owner's earlier "Tibia Fracture Lab" artifact
  (claude.ai/artifact/Drn4rNfCEJtJpKHT7f5EJ7). Values used there, with no source cited:
  tibia 5.0 mm at mid-shaft falling to 1.2 mm at the ends, thicker anteriorly;
  fibula 2.6 mm falling to 0.9 mm. In Phase 2: keep thickness values as DATA (per bone),
  check them against a published source and store its PMID/DOI, and say on the page
  that the cortex is modelled. Not chosen: measured cortex from Keast 2023 (PeerJ, PMID 36811007).

## Open points for the owner

2. Bone surface is better but still not CT grade (tibia 6,850 triangles, edges about 2 mm).
3. Arteries, veins and nerves in Z-Anatomy are drawn tubes (curves), not scanned shapes.
4. Great saphenous vein and saphenous nerve were exported whole, so they run up to
   the groin, above the knee. Not trimmed (no cutting of anatomy without OK).
5. In Z-Anatomy but not exported (not on the Phase 1 list): interosseous membrane,
   knee and ankle ligaments, menisci, crural fascia and septa, retinacula, muscle
   attachment areas, femur, patella, talus, thigh muscles that cross the knee.

## Other bone sources checked and not used

- **Fischer 2023 CT bones** (Sci Data 10:763, doi 10.1038/s41597-023-02669-z;
  github.com/MCM-Fischer/VSDFullBodyBoneModels). 30 cadavers, pelvis to foot only.
  Tibia about 32,000 triangles, fibula about 23,000. CC BY-NC-SA 4.0. Other people,
  so Z-Anatomy soft tissue would not fit. Outer shell only.

## Next

- Phase 6 – SCALE UP, one region per session (only after the owner says OK to Phases 4 + 5).

## Test link

- GitHub Pages: https://hakak01.github.io/Frac-sim-vr/
  (needs Pages switched on once: Settings -> Pages -> Deploy from a branch ->
  branch `ccr-93335185-be990c`, folder `/ (root)`).
