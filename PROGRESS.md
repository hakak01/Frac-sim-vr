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

### Phase 6a – FEMUR REGION ASSETS (right thigh, hip to knee) – waiting for owner's OK

- New region `thigh_right` (`regions/thigh_right.json`), exported to `assets/thigh_right/`
  and `model/thigh_right/bones.npz`. 122 structures, 427,248 triangles, 1.5 MB. No triangle
  reduction anywhere. Table: `assets/thigh_right/STRUCTURES.md`.

| Layer | Source | Structures | Triangles | File size |
|---|---|---:|---:|---:|
| Bones (femur, patella; hip bone, tibia, fibula as context) | BodyParts3D 3.0 | 5 | 35,512 | 136 KB |
| Muscles and tendons | Z-Anatomy | 34 | 180,492 | 624 KB |
| Joint capsules and ligaments (hip, knee) – NEW layer | Z-Anatomy | 28 | 23,280 | 119 KB |
| Arteries | Z-Anatomy | 16 | 70,848 | 215 KB |
| Veins | Z-Anatomy | 13 | 61,344 | 187 KB |
| Nerves | Z-Anatomy | 17 | 50,112 | 130 KB |
| Skin | Z-Anatomy | 9 | 5,660 | 71 KB |

- Bones (BodyParts3D id, triangles, fit onto Z-Anatomy: median / max):
  femur FMA24474, 12,990, 0.012 / **2.43 mm** (owner accepted, see decisions);
  patella FMA24486, 1,334, 0.008 / 0.32 mm; hip bone FMA16586, 9,716, 0.043 / 1.23 mm;
  tibia FMA24477, 6,850, 0.006 / 0.99 mm; fibula FMA24480, 4,622, 0.007 / 0.73 mm.
  Same scale for all five (x1.032-1.033). Hip bone, tibia and fibula are `context_only`:
  shown intact, never cut in this region.
- The femur misfit is in ONE spot: 5 Z-Anatomy points at the adductor tubercle stand
  1.5-2.4 mm proud of the BodyParts3D surface (bone, not cartilage). 99 % of points are
  within 0.6 mm.
- Muscles: thigh compartments (anterior, medial, posterior), superficial and deep gluteal
  muscles, iliopsoas, plus gastrocnemius (both heads), plantaris and popliteus (they start on
  the femur and act on distal femur fragments).
- Joints layer: hip capsule, zona orbicularis, frenula capsulae (retinacula), iliofemoral,
  pubofemoral and ischiofemoral ligaments, ligament of head of femur, labrum, transverse
  acetabular ligament; knee capsule, cruciates, collaterals, menisci and their ligaments.
- Vessels and nerves: femoral, deep femoral, medial and lateral circumflex femoral (head
  blood supply), perforating, obturator, gluteal, popliteal and genicular vessels; femoral,
  sciatic, obturator, tibial, common fibular and cutaneous nerves; superior gluteal artery,
  veins and nerve added by name.
- Selection: by height (femur) AND side-to-side (femur + hip bone + 20 mm). Without the
  side-to-side window the hanging hand and forearm (palmar arteries, median nerve...) came in.
  Genital and pudendal structures are excluded by name.

Femur shape check (`tools/femur_geometry.py`, results in `model/thigh_right/femur_geometry.json`):

| Measure | This femur | Published adult values |
|---|---:|---|
| Maximum length (along the mechanical axis; the page shows the vertical height, 454 mm) | 456 mm | – |
| Head diameter (sphere fit, rms 0.36 mm) | 47.8 mm | – |
| Narrowest neck (as a circle of equal area) | 34.0 mm | – |
| Neck-shaft angle (3D) | 123.5° | mean 128.8°, range 98-180° (Boese 2016, PMID 26305058, radiographs) |
| Femoral version (to posterior condylar line) | 12.5° anteversion | means 5.1-8.8° on CT, by method (Vanhove 2019, PMID 30737593) |
| Anterior bow radius (side view) | 874 mm | 1,200 ± 360 mm (Egol 2004, PMID 15289685) |

  All inside the normal spread, so the femur was kept (no substitution). Methods differ
  between papers (3D here, radiographs or CT slices there), so these are checks, not matches.
  Neck-shaft angle is 5° below the mean; bow is a little more curved than average.
  The axes (head centre, neck axis, shaft axis, knee centre, condylar line) are saved for Phase 6b.

- Page: region picker (`assets/regions.json`), new Joints layer and colour (tan), subtitle shows
  the region's main bone (`main_bone`). VR panel: Joints button when the region has it; the
  segment tabs now come from the region's fracture list (31-34 will appear in 6b).
- Tested in headless Chromium: thigh page and leg page load, no script errors (the only
  console message is the missing `fractures/index.json` of the thigh, expected until 6b).
  VR in Meta's emulator (Quest 3 profile), both regions: pass-through session starts, thigh lies
  at table height (0.88-1.02 m), 0.96 m long from iliac crest to the end of the tibia; all
  layer buttons work; no errors.

Limits the owner should know (Phase 6a):
1. NOT tested on a Quest 3. The thigh is 427,000 triangles with all layers (the leg was
   188,000). VR starts with bones only (35,500). Frame rate with all soft tissue is unknown.
2. Psoas major is exported whole, so it runs up above the pelvis to the lumbar spine (no
   cutting of anatomy without OK). The spine and sacrum are not in the model.
3. The leg below the knee has bones only in this region (no leg muscles or skin).
4. The small retinacular arteries to the femoral head are not separate structures; the medial
   circumflex femoral artery and the frenula capsulae (retinacula) are.
5. The adductor magnus tendon may sit up to 2.4 mm off the bone at the adductor tubercle
   (the femur misfit spot).
6. Patella in BodyParts3D is only 1,334 triangles (edges about 2-3 mm).

### Phase 6b – FEMUR FRACTURES 31 + 32 – waiting for owner's OK

- 45 rows in `fractures.json` (region `thigh_right`), all built, 0 problems. Each fracture is cut
  twice: young and elderly bone (modelled cortex), 90 GLB files, 12 MB in total; one fracture
  20,000-94,000 triangles, 60-300 KB. Table: `assets/thigh_right/fractures/FRACTURES.md`.
  - 31A trochanteric (8): 31A1.1(n), A1.2, A1.3, A2.2, A2.3, A3.1, A3.2, A3.3.
  - 31B neck (9): B1.1, B1.2, B1.3 (Garden tags), B2.1 p / q / r (Pauwels), B2.2(q), B2.3(r), B3.
  - 31C head (7): C1.1, C1.2 (Pipkin I), C1.3 (Pipkin II), C2.1, C2.2, C2.3, plus
    `31C-Pipkin-III` (head split + neck fracture; not an AO/OTA code).
  - 32 shaft (21): A1, A2, A3, B2, B3 in zones a / b / c (proximal, middle, distal third);
    C2, C3 in i / j / k (proximal diaphyseal-metaphyseal, pure diaphyseal, distal).
- Codes, names and qualifications checked against the uploaded Compendium pages S33-S39.
- Femur landmarks, all measured on the bone (`bone_model.py`, `_landmarks_femur`): head centre
  and neck axis (from `femur_geometry.json`), subcapital line = distal edge of the head cartilage
  (8.8 mm from the head centre along the neck axis), basicervical line = where the neck widens
  to 1.5 x its narrowest cut (38.8 mm), fovea = gap in the head cartilage (posteroinferior),
  greater trochanter tip (19.5 mm below the top), lesser trochanter peak (87.6 mm) and inferior
  border (113 mm = start of segment 32), innominate tubercle (57 mm), distal square 84.6 mm wide.
- Lateral wall (Hsu 2013, PMID 23908432): measured on the model from a point 30 mm below the
  innominate tubercle, 135 degrees upward, to the fracture: 31A1.2 42.2 mm, 31A1.3 38.5 mm
  (intact, > 20.5), 31A2.2 11.8 mm, 31A2.3 9.8 mm (incompetent, <= 20.5). Shown on the page.
- Pauwels (B2 rows): angle to the horizontal of the standing body, seen from the front.
  The Compendium prints 1 <30, 2 30-70, 3 >70 degrees; Bartonicek 2001 (PMID 11433141) gives
  the original as I <=30, II 30-50, III >=50. Modelled 20, 45, 75 (B2.3: 78) to fit both.
- Garden tags (Kazley 2018, PMID 29389800): B1.1 = I, B1.2 = II, B1.3 = III or IV.
- Pipkin (Pipkin 1957, PMID 13475403): I = 31C1.2 (fovea stays on the head), II = 31C1.3
  (fragment carries the fovea), III = extra row.
- Mapping papers used (abstracts only): 31A Li 2020 (PMID 33041321), 31B Wu 2022
  (PMID 36388800: posterior neck comminution in 31B2.2), 31C Wu 2022 (PMID 36129612).
  NOT used: Zhang 2020 (PMID 32596385), retracted.
- Bone quality: two modelled cortex profiles in `bone_model.json` (`cortex_profiles`).
  Young: 8 mm at the isthmus, canal 12 mm; elderly: 1.5-2 mm thinner, isthmus more distal,
  0.8 mm at the neck, canal 16 mm (Tucker 2015, PMID 26686594; Mayhew 2005, PMID 16005335).
  Check: canal isthmus 10.5 +/- 1.5 mm on CT (Su 2015, PMID 26137483). Absolute thickness
  values have no direct source (said on the page and in the data). 31 rows start as elderly,
  32 rows as young; the page ("Bone quality") and the VR panel ("Bone: ...") switch.
- Engine (no change for the leg): planes through a neck point, a head point or a landmark;
  planes measured from the body's horizontal (`reference: body`), from the neck axis or along a
  head direction; planes through two landmarks (`from`, `to`); plugs on the femoral head with
  impaction; `checks: ["lateral_wall"]`; `tags`; one file set per bone quality.
- Tested in headless Chromium: the thigh page lists 45 fractures; 31A2.3, 31B2.1(q), 31C1.3,
  32B3(b), 31C2.1 load (under 3 s each), bone quality switches, info shows tags and the lateral
  wall. VR in Meta's emulator: tabs 31 / 32, Bone button switches the quality; no errors.
  Leg region unchanged (no leg fracture was rebuilt).

Limits the owner should know (Phase 6b):
1. Femur fractures are shown in the anatomical (reduced) position. Typical displacement
   (and with it valgus impaction, Garden III vs IV, shortening and external rotation) is Phase 6d.
   B1.1, B1.2 and B1.3 therefore share the same subcapital line.
2. Lines were placed from the Compendium drawings and the ABSTRACTS of the mapping papers,
   not traced from map figures. No CT mapping study of femoral shaft fractures was found.
3. (Closed in 6c) The lateral-wall method was confirmed by the Compendium appendix, page S169.
4. 31A1.1 is built for qualification n (greater trochanter) only: the drawing shows n in bold.
5. 31C2.1 (chondral lesion) has no bone cut: cartilage has no thickness in this model.
   Depression depth in 31C2.2/2.3 is 4 mm (no published value found).
6. Pipkin IV is not built: it needs an acetabular fracture and the hip bone is context only.
7. Head-fracture planes follow the drawings; Wu 2022 gives line angles against the primary
   compressive trabeculae, which are not in this model.
8. Not tested on a Quest 3.

### Phase 6c – DISTAL FEMUR 33 + PATELLA 34 – waiting for owner's OK

- 35 new rows (thigh region now 80), all built, 0 problems. Codes and names checked against
  the uploaded Compendium pages S40-S47. Femur rows cut in young and elderly bone (33 starts
  young); patella rows once (no bone-quality profiles for the patella). 23 MB for all 80 thigh
  fractures (one is loaded at a time); one 33/34 fracture 7,000-140,000 triangles, 36-470 KB.
  - 33A (8): A1.1, A1.2 (epicondyles), A2.1-A2.3, A3.1(h), A3.2(h), A3.3.
  - 33B (9): B1.1-B1.3 (lateral condyle), B2.1-B2.3 (medial condyle), B3.1 (anterolateral
    flake), B3.2(f) (lateral Hoffa), B3.3 (bilateral Hoffa).
  - 33C (8): C1.1, C1.3, C2.1(h), C2.2(h), C2.3, C3.1, C3.2(h,s), C3.3.
  - 34 (10): A1(b), B1.1, B1.2, B2.1, B2.2, C1.1, C1.2, C1.3, C2, C3.
  Where a drawing shows a qualification in bold, that one is built: 33A3 and 33C2 h medial,
  33B3.2 f lateral, 33C3.2 h medial + s intact, 34A1 b distal pole.
- Measured on this femur: epicondyles 30 mm above the joint line, 84.6 mm apart (= transcondylar
  axis, the 33C1.1 / 33C1.3 limit); condyles 23 mm behind the shaft axis; posterior condylar
  line 2.5 degrees from the bone's medial axis (added to the Hoffa angles).
- Mapping papers used (abstracts): Li R 2022 (PMID 35530952: lines at the lateral part of the
  notch, so intercondylar splits sit just lateral of centre), Xie 2017 (PMID 29088042: Hoffa
  line 34.4 deg (lateral) / 29.0 deg (medial) to the posterior condylar axis and 23.1 / 19.3 deg to
  the posterior cortex, middle third of the condyle; used directly), Ding 2022 (PMID 36183139:
  coronal fractures in 67 % of 33C3, more anterior and at smaller angles than Hoffa; the abstract
  gives no values, 25 / 15 deg chosen), Chen 2023 (PMID 37397967: metaphyseal comminution mostly
  lateral, anterior, posterior), Zhan 2021 (PMID 34733916, 34C3: mean 7 fragments, lower half
  comminuted, superomedial corner spared; built with 7 fragments, corner intact).
- Lateral wall (6b): the owner uploaded the Compendium appendix (S169). It defines the
  measurement exactly as built (3 cm below the innominate tubercle, 135 degrees upward, < 20.5 mm
  = A2). Added as a source to 31A1.2, A1.3, A2.2, A2.3.
- Engine: plug `at` a landmark (cut aimed out from the axis through that point; epicondyles);
  frame `condyles` (distal femur, u/v like the plateau); patella bone (thin modelled cortex,
  no canal). Leg fractures unchanged (checked: 42B3, 41C3.3, 41A1.2 give the same fragments).
- Tested in headless Chromium: the thigh page lists 80 fractures; 33B3.3, 33C3.2(h,s), 34C3,
  34A1(b), 31A2.3 load (under 3 s each); patella fractures show no bone-quality switch.
  VR in Meta's emulator: tabs 31 / 32 / 33 / 34, all 10 patella buttons, Bone button works.

Limits the owner should know (Phase 6c):
1. Shown in the anatomical (reduced) position; displacement (for example the supracondylar
   extension deformity from gastrocnemius) comes in Phase 6d.
2. Patella cartilage: the marking was copied from the low-detail Z-Anatomy patella (140 points)
   and reaches the tip of the patella, so the 34A1 distal-pole piece carries a small marked
   area although the fracture is extra-articular. Not changed (no change of source data without OK).
3. No CT mapping study was found for 34A, 34B, 34C1 and 34C2; those rows rest on the Compendium.
4. Patella cortex thickness (1.2 mm all round) has no published source.
5. 33C3 coronal-fracture angles (25 / 15 deg) are chosen, not taken from a paper (see above).
6. The medial wedges (33A3, 33C2, 33C3.2) are large (33-39 cm3) because the distal femur is
   wide; check whether you want them smaller.
7. Not tested on a Quest 3.

### Phase 6d – MUSCLE PULL + FEMUR READOUTS – waiting for owner's OK

- Muscle attachments from Z-Anatomy (`tools/export_muscles.py` -> `model/thigh_right/muscles.json`):
  32 muscles + the patellar ligament. Ends come from Z-Anatomy's own attachment areas (shared ones
  mapped in `regions/thigh_right.json` > `muscle_attachments`, e.g. "Iliopsoas muscle.er" for iliacus
  and psoas, "Trochanteric insertion.er" = conjoint tendon of obturator internus and gemelli); ends
  missing in Z-Anatomy (gluteus minimus and obturator externus on the femur, adductor brevis, the
  iliotibial tract on the tibia) are taken where the muscle mesh touches the bone. Each end pulls
  along the muscle's own path 25-80 mm from it (so iliopsoas pulls over the pelvic brim). Checked by
  eye: e.g. gluteus medius pulls up-medial, iliopsoas up-medial-anterior, gastrocnemius down-back.
- Strength = PCSA (all muscles equally active), data in `muscle_model.json` with a status per value:
  3 read in the source, 3 quoted, 2 derived, 2 estimated, 17 UNVERIFIED (author's recall of Ward 2009
  Table 1: the full text was not reachable), 3 with no source (TFL, plantaris, popliteus).
  Sources: Ward 2009 (PMID 18972175), Parvaresh 2019 (PMID 31862009).
- Gluteus maximus: 25 % on the gluteal tuberosity, 75 % through the iliotibial tract to the tibia
  (most of it inserts into the tract, Gray's Anatomy; the split itself is the author's).
- Rules (data in `muscle_model.json`):
  - the fragment with the femoral head stays in the acetabulum and may only turn (15 deg) about the
    head centre; if it also carries the knee it stays still;
  - the leg (tibia, fibula, intact patella) follows the femur fragment that carries the knee, except
    the forwards/backwards tilt, which the knee joint takes up; soft tissue of the leg follows too;
  - that leg-carrying fragment: shift 20 mm along the net muscle force; turn about its long axis
    15 deg, sideways 5 deg, forwards/backwards 10 deg only within 120 mm of the knee (the bed);
  - loose pieces with muscles: 8 mm along the force, 15 deg about the turning axis; loose pieces with
    no muscle: the old "wedge" preset (5 mm away); patella: the piece holding the patellar
    ligament stays, the quadriceps pulls the other;
  - directions come from the muscles; ALL sizes are teaching values (no published source).
  - start position: if the pose would put bone into bone, the fragment first tries sliding sideways
    (up to 16 mm), then a smaller pose (for example the neck stump rides up beside the head).
- New readout (page and VR strip): neck-shaft angle, femoral version (anteversion / retroversion)
  and length head centre to knee centre, each against the normal side (= this femur intact:
  123.5 deg, 12.5 deg anteversion, 429 mm).
- Engine: index entries get `anchor`, `followers`, `carriers` and a `pose` per fragment; the index
  gets `femur` landmarks. All 80 thigh fractures rebuilt, 0 problems, lateral walls unchanged.
  The lesser trochanter piece of 31A1.3 / 31A2.3 / 31A3.3 is now the whole cut-out (it carries the
  iliopsoas insertion).

Model against the textbook picture (typical displacement, young bone):

| Fracture | Model | Textbook |
|---|---|---|
| Femoral neck 31B2.1(q) | leg 16 mm short, 15 deg external rotation, 5 deg valgus, neck stump beside the head | shortened, externally rotated: matches |
| Subtrochanteric 32A3(a) | proximal fragment flexed 14 deg, externally rotated 4 deg; distal shortened, externally rotated, 5 deg abducted | proximal flexed, abducted, externally rotated; distal adducted: flexion and rotation match, abduction / adduction do NOT |
| Pertrochanteric 31A1.2 | 17 mm short, externally rotated, neck-shaft angle 138 deg (valgus) | shortened, externally rotated, VARUS: varus does not match (it comes from medial crushing, not modelled) |
| Mid-shaft 32A3(b) | 19 mm short, 14 deg external rotation | shortening: matches |
| Lesser trochanter piece | pulled up, medial, forward (iliopsoas) | matches |
| Greater trochanter piece | pulled up and medial (gluteus medius, minimus) | matches |
| Transverse patella 34C1.1 | proximal piece 7-8 mm up (quadriceps), distal piece held | matches |
| Supracondylar 33A2.3 | 18 mm short, 2 mm posterior, distal piece tilted 10 deg | shortening and posterior shift match; tilt direction to be checked by the owner |

- Tested in headless Chromium: thigh fractures load and start in the muscle pose with no errors;
  the tibia, fibula and patella move with the knee fragment; readouts as above; "Reduced" gives
  123.5 deg / 12.5 deg / 429 mm. VR in Meta's emulator: the femur summary shows on the strip.
  Leg region: start positions identical to before (checked 42A1, 41C3.3, 44-PM-I).

Limits the owner should know (Phase 6d):
1. (Closed in 6e) Muscle strengths checked against the uploaded papers; 3 still have no source.
2. All displacement SIZES are teaching values; only directions come from the anatomy.
3. Not modelled: gravity (the foot falling outwards), ligaments and capsule (except the patellar
   ligament), bone crushing (varus collapse), muscle activity differing between muscles.
4. The two mismatches above (subtrochanteric abduction, pertrochanteric varus).
5. Soft tissue at the knee follows the knee fragment fully, including the tilt the tibia does not follow.
6. Not tested on a Quest 3.
7. Seen while testing (older, tibia region): the 44-PM-I posterior malleolar piece starts unmoved
   (no free start position found); unchanged by this phase.

### Phase 6e – MIXED REALITY – waiting for owner's OK

- Muscle strengths (6d open point) checked against the PDFs the owner uploaded (not in the repo,
  copyright): all 17 values from Ward 2009 match the PCSA column exactly; Parvaresh 2019 Table 1
  corrected 4 estimates (pectineus 2.9 -> 2.27, piriformis 2.9 -> 2.17, quadratus femoris
  4.5 -> 3.75, obturator internus / inferior gemellus 3.8 / 1.0 -> 3.76 / 1.02). Status now: 27 read
  in the source, 3 with no source (TFL, plantaris, popliteus: in neither paper). All 80 thigh
  fractures rebuilt (0 problems); the deformities barely change (subtrochanteric proximal fragment
  now 1 deg abducted instead of 0).
- VR panel, bottom row (pass-through only, shown only if the headset offers it):
  - "Place on table": a ring follows the pointer on real flat surfaces (WebXR hit-test, surfaces
    tilted less than about 37 degrees); trigger lays the limb there, supine, skin on the surface,
    across in front of the user (hip to the left in the thigh, knee to the left in the leg).
  - "Hands in front: on/off": real hands and objects hide the model (WebXR depth sensing, drawn by
    three.js itself); shown only when the headset gives a depth image.
- Two hands on one fragment, or on the leg (the tibia and fibula grab the knee fragment): the
  midpoint of the hands moves it, the line between them turns it, no scaling. One hand off: the
  other carries on alone.
- Traction against the muscles: with "Muscle pull" on, a carried fragment lags 20 % of the way
  back toward its displaced pose (teaching value). The strip shows "Muscles pull back: x mm".
  The user has to over-pull, as in real traction; on release the fragment springs back.
- Vibration (controllers only, hands have no motors): a knock when bone meets bone (the fragment
  stops short of the hand or touches a new bone), a soft buzz that grows with the muscle pull
  being held (up to 60 % strength).
- Tested in Meta's emulator (Quest 3 profile): the panel shows "Place on table"; placing on a
  synthetic surface at 0.750 m puts the lowest skin point at 0.752 m (bones 58 mm higher); both
  hands grabbed the distal fragment through the tibia; pulling the hands 30 mm toward the foot
  moved the fragment 24 mm (6 mm held back) and took the femur from 410 mm (displaced) to 434 mm
  (normal 429, so over-pulled); no errors. "Hands in front" is hidden in the emulator (no depth).

Limits the owner should know (Phase 6e):
1. NOT tested on a Quest 3: the real-surface ring (needs the room set up in the headset), the
   depth occlusion (quality of hand edges) and the vibration can only be judged on the headset.
2. The 20 % hold-back is a teaching value, not a force model; there is no force number (kg).
3. The limb is placed across in front of the user; turn it with the grip (two hands) if needed.
   It is not anchored to the room: if the headset's tracking shifts, the limb shifts with it.
4. In plain VR (no pass-through) the new buttons are hidden.

### Fix (20 Nov 2026) – PASS-THROUGH ON THE QUEST 3 – waiting for the owner's headset test

- Owner's report: pass-through not working on the Meta Quest.
- Cause (in three.js r180, found by reading its code): when the headset gives a depth image
  ("Hands in front", on by default), three.js draws a full-screen depth mesh first and skips its own
  clear. (1) The headset's depth image is a texture ARRAY, but r180 only hooks outside textures to
  plain 2D samplers, so the mesh read an empty texture: depth 0 everywhere = "a real object at the
  eyes", which hides every virtual thing (bones, panel, rays). (2) The mesh's shader sets no colour,
  so on the headset it may paint the view black and cover the room.
- Fix, in our files only (`js/xr.js`, `js/viewer.js`; `vendor/` untouched): the depth mesh writes depth
  only, three.js is pointed at the headset's depth texture, and the frame is cleared to transparent
  when three.js skips its clear.
- The VR panel's bottom line now shows what the headset gave, e.g.
  "pass-through: alpha-blend, depth sensing: allowed". "opaque" there would mean no pass-through.
- Tested in Meta's emulator with a fake room and a fake depth image (first test that reaches the
  depth path): room visible around the model; a "hand" 20 cm away hides the model, and over half the
  view hides exactly that half; "Hands in front: off" brings the model back; no depth image (thigh)
  works as before; no errors. Before the fix the near "hand" hid nothing (depth was never read).
- NOT yet tested on a Quest 3. If pass-through still fails, tell me what the bottom line of the panel says.

### Phase 7a – FOOT AND ANKLE ASSETS + TALUS IN THE LEG – waiting for owner's OK

New region `foot_right` (`?region=foot_right`): talus to toes; tibia and fibula whole, intact, as context.

| Layer | Structures | Triangles | Size |
|---|---:|---:|---:|
| Bones (BodyParts3D 3.0) | 29 | 68,476 | 302 KB |
| Muscles, tendons and retinacula | 50 | 100,897 | 409 KB |
| Joint capsules and ligaments | 47 | 18,886 | 122 KB |
| Arteries | 19 | 79,776 | 234 KB |
| Veins | 13 | 93,024 | 255 KB |
| Nerves | 15 | 52,416 | 133 KB |
| Skin | 19 | 9,397 | 100 KB |
| **Total** | **192** | **422,872** | **1,555 KB** |

- Bones: all 26 foot bones + the sesamoids (one file, both bones) exist in BodyParts3D and were fitted onto
  Z-Anatomy. 28 of 29 within 2 mm (median 0.001-0.24 mm). Largest: lateral cuneiform 1.87 mm (Z-Anatomy draws it
  1.5 % smaller than BodyParts3D, other bones 3.3 %), talus 1.71 mm (5 points on the posterior cartilage).
  **Navicular 2.30 mm: STOPPED and asked; owner accepted with a 2.5 mm limit for the navicular only** (Decisions).
  Smallest bone: middle phalanx of the 5th toe, 294 triangles (BodyParts3D as published, not reduced).
- Soft tissue (Z-Anatomy): all intrinsic foot muscles; leg muscles whose tendons cross the ankle (whole, from the
  knee down: no cutting of anatomy); Achilles tendon; plantar aponeurosis; extensor, flexor and fibular retinacula;
  6 tendon sheaths; 5 bursae; 47 ligaments and capsules (ankle, syndesmosis, all foot joints incl. the Lisfranc
  ligament, spring ligament, bifurcate ligament); dorsalis pedis, plantar arch and branches; tibial, plantar,
  deep and superficial fibular and sural nerves; skin of the ankle and foot with toenails.
- What Z-Anatomy does NOT have (told, not added): ankle joint capsule; anterior tibiotalar part of the deltoid
  (deltoid = posterior tibiotalar, tibiocalcaneal, tibionavicular); saphenous nerve below 104 mm (it stops above
  the ankle); anterior tibial veins below 119 mm.
- Height window: 3 mm overlap instead of 20 mm for this region (foot vessels and nerves run flat).
- Leg region: the talus (FMA24482, fit 1.71 mm) is added as an intact bone. It moves with the tibial fragment
  that carries the plafond (the ankle is intact): 81 of 96 rows. Pivot = centre of the trochlea arc (circle fit
  to the talar dome cartilage in the sagittal plane, radius 23.9 mm on this talus); the ankle takes up the
  forwards/backwards tilt, as the knee does for the femur. Checked: the pivot stays on its fragment (0.00 mm) in
  43A1.1, 42A2, 43C3.3. In the 15 rows where the tibia is not cut (4F, fibula-only 44) the talus stays home and
  blocks bone. All 96 fractures re-cut: every fragment file is byte-identical, 0 problems.
- Start positions, all 96 leg rows before and after: 95 identical; 44A1.2 (tip of the lateral malleolus) now
  starts 2 mm instead of 4 mm out, because the talus is in the way.
- Page: the start view frames the region's own bones (context bones left out; the thigh view now centres the
  femur and patella). The subtitle length is measured along the bone's own long axis: calcaneus 81 mm (the old
  height measure gave 51 mm), tibia 358 mm unchanged, femur 454 -> 456 mm (slightly oblique bone).

Limits the owner should know (7a):
1. The talus does not shift in 44 fractures yet (needs the ligaments: 7b). It only follows the plafond.
2. The foot shows the whole leg muscles and long vessels (Z-Anatomy structures are whole; not cut without OK).
3. Skin is Z-Anatomy surface patches: coarse (9,397 triangles for ankle and foot).
4. 423,000 triangles with every layer on (VR starts with bones only, 68,000). Not tested on a Quest 3.
5. No foot fractures yet (7c, 7d).

### Phase 7b – JOINTS + LIGAMENT TETHERS (+ VR choice, hide/isolate) – waiting for owner's OK

Owner's extra requests (20 Nov 2026), done in this phase:
- **VR without pass-through as a choice.** The page now has two buttons when the headset offers both:
  "Enter pass-through (see your room)" and "Enter VR (virtual room, no pass-through)". Plain VR has a dim grey room,
  a floor grid, simple hands (balls on the hand joints) and a small handle for each controller.
- **Hide or isolate single structures.** Page: every row of the Structures table has "hide" and "isolate"; isolate
  several rows to keep a group (e.g. talus + calcaneus + the interosseous ligament); "Show all" undoes. Hiding a cut
  bone hides all its fragments. VR: panel row "Select: on" -> point at any structure (bone, fragment, muscle,
  ligament, vessel, nerve, skin) and pull the trigger -> "Hide", "Isolate", "Show all". Hiding is for the view only:
  a hidden bone still blocks bone.

Joints and ligaments (data from the anatomy, nothing drawn by hand):
- `tools/joint_model.py <region>` (seconds, no Blender) finds, for each Z-Anatomy ligament mesh, the two bones it
  touches and makes 2-8 straight fibres between the two attachment areas (sleeves such as capsules get 8 around).
  It finds joints where the cartilage of one bone faces another bone within 3.5 mm (14 contact points each).
  Output `assets/<region>/joint_model.json` + readable `JOINTS.md`.
  - Foot: **41 joints, 135 ligament tethers (456 fibres)**. Leg: 3 joints (ankle, fibular facet, distal tibiofibular),
    9 tethers (35 fibres).
  - The leg region now has a Joints layer: ankle ligaments, syndesmosis and the interosseous membrane (10 structures,
    13,682 triangles, 68 KB). Re-export checked: every other leg file is byte-identical.
  - Where the automatic pair disagreed with the ligament's own name it is fixed as data in `ligament_model.json`
    (tibiocalcaneal; long plantar = fan from the calcaneus; deep transverse and dorsal metatarsal = adjacent
    metatarsals; plantar tarsometatarsal part 3 = lateral cuneiform - 3rd metatarsal).
- Model (teaching, no newtons; `js/joints.js`): a fibre is slack up to 4 % stretch, then it holds; joint surfaces do not
  pass through each other; a soft "seat" brings a free bone back; your hand or the examiner's push moves a bone and
  the others follow. Fibres are drawn green (slack) -> yellow -> red (near tearing). Torn ligaments are red.
  "Ligaments can tear" (off by default): a fibre stretched 15 % tears its ligament part.
- Foot region: every foot bone can be held in VR (trigger on the bone); the ligaments pull its neighbours along, and
  it springs back when let go. The tibia is fixed; the top of the fibula is held (proximal tibiofibular joint is not
  in the data).
- Stress tests (page buttons and VR "Joints" tab): anterior drawer, talar tilt (inversion, hinged at the medial edge
  of the dome), external rotation (about the centre of the dome). Readouts: talus translation and angles, medial
  gutter gap, lateral dome gap, tibiofibular gap, which ligaments are taut, the abnormal limits with sources.
- Torn ligaments per row, from the printed AO/OTA name (`torn` in `fractures.json`, copied to the index by `--meta`):
  44A1.1/A2.1/A3.1 lateral collateral ligament; 44B1.2, B2.2 anterior syndesmosis; 44B2.1 deltoid + anterior
  syndesmosis; 44B3.1 deltoid; 44C ('syndesmosis unstable'): anterior + posterior syndesmosis + interosseous membrane
  (posterior syndesmosis kept where there is a posterior malleolus fragment: it moves with that fragment), plus the
  deltoid where the name says so (C1.1, C2.1). The tear and repair buttons change these freely.
- Leg (43/44): the talus is placed by its ligaments. Where the plafond is on the main tibia (malleolar fractures,
  rows with no bone cut) the talus follows the ligaments: **talar shift appears by itself** when the medial side is
  torn. Where the plafond is on a moving fragment (42, 43) the talus stays seated in it as before.

Results in the browser (emulated, 4 s per test; numbers are model values, not validated):

| Test | Intact foot | Torn | Torn values |
|---|---|---|---|
| Anterior drawer | 4.0 mm | lateral collateral ligament | 8.4 mm |
| Talar tilt | 4.0° (lateral dome gap 2.3 -> 3.4 mm) | lateral collateral ligament | 11.5° (6.8 mm) |
| External rotation | 4.1°, medial gutter 2.4 mm (rest 1.8) | deltoid | 8.4°, medial gutter 5.0 mm |
| 44A1.1 (leg, LCL torn) | | | drawer 11.0 mm, tilt 14.5° |
| 44B2.1 (leg, deltoid + anterior syndesmosis) at rest | | | medial gutter 6.5 mm, talus 9.5° in valgus: talar shift |

Limits (scale shown for abnormal: drawer >= 10 mm or >= 3 mm more than the other side, tilt >= 10° or >= 6° more,
Guerra-Pinto 2021 PMID 34134919; medial clear space >= 5 mm, Ashraf 2017 PMID 28431410; tibiofibular clear space
< about 6 mm normal, Harper & Keller 1989 PMID 2613128).

Things Z-Anatomy draws differently (told, not changed): the tibionavicular ligament ends on the talus (never reaches
the navicular); the "cuneometatarsal interosseous ligaments" are medial cuneiform - 1st, intermediate - 2nd and
lateral - 3rd metatarsal: **there is no medial cuneiform - 2nd metatarsal (Lisfranc) ligament** (matters for 7d);
the long plantar ligament also touches the 1st metatarsal and the medial cuneiform; the intersesamoid ligament joins
nothing (both sesamoids are one mesh). In the leg region the calcaneofibular and tibiocalcaneal ligaments are shown
but are not tethers (no calcaneus there).

Limits the owner should know (7b):
1. NOT tested on a Quest 3. Solver 0.6-0.7 ms per frame in the browser; the foot ties all soft tissue to 28 bones in
   the background after loading (several seconds).
2. Teaching values with no source used: 4 % slack, 15 % tear, every ligament equally strong (the published strength
   order is shown only). No forces in newtons. The stress-test numbers depend on these values: read the differences
   (intact vs torn), not the millimetres.
3. Stress tests start from the rest position (no 16° plantar flexion for the drawer, as advised by Chang 2021, PMID 33347006).
4. Fragments move only by hand: ligaments on them pull the talus but do not hold the fragment back. In the leg
   region the whole fibula moves only during a stress test; with a cut fibula the distal fragment does not move in a
   stress test (hold it and pull: the talus follows if the medial side is torn).
5. Each ligament is straight fibres: no wrapping around bone, no twisting.
6. Bones with no cartilage contact (calcaneus - fibula tip, etc.) can pass through each other while held.
7. Hands in plain VR are simple balls; no proper controller models.

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

- 18 Nov 2026: Phases 4 + 5 accepted without a headset test ("we will test it later");
  Phase 6 started with the femur.
- 18 Nov 2026: Phase 6 (femur) plan, owner's answers:
  region = femur + patella with the intact hip bone and tibia/fibula as context (floating knee
  possible later); shaft rows (32) in all three zones (subtrochanteric, middle, distal);
  two bone-quality profiles (young and elderly cortex, Tucker 2015, PMID 26686594);
  muscle pull from real Z-Anatomy muscle attachment areas; extra tags: Garden + Pauwels on
  neck fractures, Pipkin rows for the head; VR/MR: limb on the real table + real hands hide
  the model (Quest 3 depth sensing), two-hand traction + controller buzz at bone contact.
  Later, own phases: virtual C-arm, implants. Not chosen now: atypical femoral fracture,
  floating knee.
- 18 Nov 2026: 6a accepted; owner started 6b.
- 18 Nov 2026: 6b accepted; owner uploaded the Compendium appendix (S167-S169) and started 6c.
- 18 Nov 2026: 6c accepted; owner started 6d.
- 18 Nov 2026: 6d accepted; owner uploaded Ward 2009 and Parvaresh 2019 (PDFs, not in the repo) and started 6e.
- 18 Nov 2026: **femur fit exception.** BodyParts3D femur accepted with max 2.43 mm (limit
  2 mm) because the misfit is one small spot at the adductor tubercle; limit for the femur
  set to 2.5 mm in `regions/thigh_right.json` (`fit_max_mm`). The 2 mm limit stays for every
  other bone.
- 18 Nov 2026: AO/OTA Compendium pages S29-S48 (radius/ulna end, femur, patella) uploaded
  by the owner for Phase 6. NOT in the repo (journal copyright).
- 18 Nov 2026: **Foot and ankle = Phase 7, owner's answers to the plan:** new region `foot_right`
  (talus to toes, distal tibia and fibula intact as context) AND the talus added to `leg_right` as an
  intact context bone (talar shift for 43/44); ligaments as working tethers (hold, pull, torn per row,
  stress tests); pure dislocations included as non-AO ids (subtalar, Chopart, Lisfranc, talar
  extrusion); bones with no CT mapping paper are cut from the Compendium only and marked
  "no mapping source"; two bone-quality profiles (young, elderly); CT slice plane now, simulated
  X-ray views with the later C-arm phase; reduction stays free-hand (no guided manoeuvres);
  MR overlay on the owner's Sawbones foot model; positions supine, lateral decubitus, prone.
  AO/OTA foot chapter (S89-S100) uploaded by the owner, NOT in the repo (copyright).
- 18 Nov 2026: Phase 7 follow-up answers: cuneiforms (85) and phalanges (88) have no drawings in the
  chapter, so they are cut from the written type definitions with the same line rules as other bones,
  `line_basis` "text definition only"; phalanx rows = all 18 of the great toe + proximal phalanx of
  toes 2-5 (54 rows); Lisfranc rows = Myerson types A, B1, B2, C1, C2 + one purely ligamentous
  ("subtle") Lisfranc (PMID to be checked in 7d); the Sawbones model is bare bone (no foam or skin):
  overlay lines up on bony landmarks (side and product still to ask, needed in 7f only).
- 18 Nov 2026: **navicular fit exception.** BodyParts3D navicular accepted with max 2.30 mm (limit 2 mm):
  4 Z-Anatomy points on the plantar-medial side, 7-13 mm from the tip of the tuberosity, stand 1.6-2.3 mm proud of
  the BodyParts3D surface (none on cartilage; 98 % of points within 1 mm). Limit for the navicular set to 2.5 mm in
  `regions/foot_right.json` (`fit_max_mm`). The 2 mm limit stays for every other bone.

## Open points for the owner

2. Bone surface is better but still not CT grade (tibia 6,850 triangles, edges about 2 mm).
3. Arteries, veins and nerves in Z-Anatomy are drawn tubes (curves), not scanned shapes.
4. Great saphenous vein and saphenous nerve were exported whole, so they run up to
   the groin, above the knee. Not trimmed (no cutting of anatomy without OK).
5. In Z-Anatomy but not exported (not on the Phase 1 list): interosseous membrane,
   knee and ankle ligaments, menisci, crural fascia and septa, retinacula, muscle
   attachment areas, femur, patella, talus, thigh muscles that cross the knee.
   (Since then: femur, patella and thigh muscles in 6a; talus, ankle and foot ligaments in 7a.)

## Other bone sources checked and not used

- **Fischer 2023 CT bones** (Sci Data 10:763, doi 10.1038/s41597-023-02669-z;
  github.com/MCM-Fischer/VSDFullBodyBoneModels). 30 cadavers, pelvis to foot only.
  Tibia about 32,000 triangles, fibula about 23,000. CC BY-NC-SA 4.0. Other people,
  so Z-Anatomy soft tissue would not fit. Outer shell only.

## Next

- Femur region (6a-6e) complete, waiting for the owner's OK and a Quest 3 test.
- Phase 7a (foot assets + talus in the leg) done, waiting for the owner's OK.
- Phase 7b (joints + ligament tethers, VR choice, hide/isolate) done, waiting for the owner's OK. Next: 7c (talus 81 + calcaneus 82, CT-mapped).
- Phase 6 continues later with humerus, radius+ulna, clavicle+scapula, hand.

## Test link

- GitHub Pages: https://hakak01.github.io/Frac-sim-vr/
  (needs Pages switched on once: Settings -> Pages -> Deploy from a branch ->
  branch `ccr-61835a8e-mycvig` (holds Phases 1-6e, 7a, the pass-through fix and 7b;
  `ccr-a2380af0-9o7p1q` = up to the pass-through fix; `ccr-463f3713-467s1a` = 7a without the fix; `ccr-3f8cf2c4-bgay9k` stops at 6e),
  folder `/ (root)`).
- Thigh: https://hakak01.github.io/Frac-sim-vr/?region=thigh_right (or use the region picker).
- Foot: https://hakak01.github.io/Frac-sim-vr/?region=foot_right
