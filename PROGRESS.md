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

## Decisions by the owner

- 16 Nov 2026: bones from BodyParts3D 3.0 (not Z-Anatomy).
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

- Phase 2 – FRACTURE ENGINE (only after the owner says OK to start it).

## Test link

- GitHub Pages: https://hakak01.github.io/Frac-sim-vr/
  (needs Pages switched on once: Settings -> Pages -> Deploy from a branch ->
  branch `ccr-93335185-be990c`, folder `/ (root)`).
