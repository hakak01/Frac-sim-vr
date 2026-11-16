# Progress

## Done

### Phase 1 – ASSETS (pilot: right leg, knee to ankle) – waiting for owner's OK

- Source: Z-Anatomy, commit `cf19678` (pinned in `tools/fetch_zanatomy.sh`).
- Exported 53 structures, 179,155 triangles, 686 KB in 6 files (`assets/leg_right/`).
  Full table: `assets/leg_right/STRUCTURES.md` (also shown on the page).

| Layer | Structures | Triangles | File size |
|---|---:|---:|---:|
| Bones (tibia, fibula) | 2 | 2,934 | 34 KB |
| Muscles and tendons | 16 | 70,393 | 273 KB |
| Arteries | 7 | 30,528 | 103 KB |
| Veins | 7 | 38,592 | 118 KB |
| Nerves | 11 | 31,392 | 87 KB |
| Skin | 10 | 5,316 | 72 KB |

- No triangle reduction anywhere (bone 0 %, soft tissue 0 %).
- True scale checked: tibia 358 mm long.
- Simple viewer page: layer tick boxes, tap a structure for its name, table.
  Tested in headless Chromium (desktop and phone size), no errors.
- LICENSE (code MIT, assets CC BY-SA 4.0) and CREDITS.md added.

How structures were chosen (`regions/leg_right.json`):
- Bones: Tibia, Fibula.
- Muscles: everything in Z-Anatomy's groups "Anterior / Lateral / Posterior compartment of leg".
- Arteries, veins, nerves: every right-side structure with at least 20 mm of its course
  between the top of the tibia and the tip of the medial malleolus, plus 4 added by name
  (inferior medial and lateral genicular arteries, infrapatellar branch of saphenous nerve,
  intermediate dorsal cutaneous nerve of foot).
- Skin: Z-Anatomy surface patches of the knee, leg and ankle regions.

## Open points for the owner (decide before Phase 2)

1. **Bone detail is low in Z-Anatomy itself**: tibia 1,670 triangles, fibula 1,264.
   Nothing was reduced; this is all the source has. The shape is correct but the
   surface is coarse (few facets on the plateau and plafond). Rough fracture surfaces
   in Phase 2 will be much finer than the bone surface around them.
2. Z-Anatomy bones are one outer surface: no medullary canal and no cortex thickness.
   For rule 3 (cortex rim + cancellous interior) Phase 2 must get cortex thickness
   from somewhere. Needs a decision and a source.
3. Arteries, veins and nerves in Z-Anatomy are drawn tubes (curves), not scanned shapes.
4. Great saphenous vein and saphenous nerve were exported whole, so they run up to
   the groin, above the knee. Not trimmed (no cutting of anatomy without OK).
5. In Z-Anatomy but not exported (not on the Phase 1 list): interosseous membrane,
   knee and ankle ligaments, menisci, crural fascia and septa, retinacula, muscle
   attachment areas, femur, patella, talus, thigh muscles that cross the knee.

## Next

- Phase 2 – FRACTURE ENGINE (only after the owner says OK and answers points 1 and 2).

## Test link

- GitHub Pages: https://hakak01.github.io/Frac-sim-vr/
  (needs Pages switched on once: Settings -> Pages -> Deploy from a branch ->
  branch `ccr-93335185-be990c`, folder `/ (root)`).
