# Joints and ligament tethers: leg_right

Made by `tools/joint_model.py` from the Z-Anatomy ligaments and the BodyParts3D bones. Teaching model: see `ligament_model.json` for the values and their status.

## Joints (3)

| Joint | Bones | Cartilage faces in contact | Gap at rest (mm, min-max) |
|---|---|---:|---|
| Ankle (talocrural) joint, fibular facet | Talus - Fibula | 175 | 0.1 - 3.4 |
| Distal tibiofibular joint (syndesmosis) | Tibia - Fibula | 314 | -1.5 - 3.3 |
| Ankle (talocrural) joint | Talus - Tibia | 445 | 0.5 - 3.5 |

## Notes on the Z-Anatomy ligaments

- Tibionavicular ligament: the Z-Anatomy mesh ends on the talus (no point within 6 mm of the navicular), so its tether runs tibia - talus. Not changed (no hand-made anatomy).
- Cuneometatarsal interosseous ligaments: three small parts, medial cuneiform - 1st metatarsal, intermediate - 2nd, lateral - 3rd. There is no medial cuneiform - 2nd metatarsal (Lisfranc) ligament in Z-Anatomy.
- Long plantar ligament: one sheet that touches the calcaneus, all five metatarsals and the medial cuneiform (cuboid 1.6 mm away); modelled as a fan of tethers from the calcaneus to every bone it touches.
- Intersesamoid ligament: both sesamoids are one mesh in the sources, so it joins nothing (shown only).

## Tethers (9)

| Ligament (Z-Anatomy) | Part | Group | Bones | Fibres | Rest length (mm) | How the bones were found |
|---|---|---|---|---:|---|---|
| Anterior talofibular ligament | 1/1 | Lateral collateral ligament | Fibula - Talus | 3 | 8-9 | nearest bones |
| Anterior tibiofibular ligament | 1/1 | Anterior syndesmosis | Fibula - Tibia | 6 | 13-16 | nearest bones |
| Interosseous membrane of leg | 2/2 | Interosseous membrane | Fibula - Tibia | 6 | 13-25 | nearest bones |
| Posterior talofibular ligament | 1/1 | Lateral collateral ligament | Fibula - Talus | 3 | 13-15 | nearest bones |
| Posterior tibiofibular ligament | 1/1 | Posterior syndesmosis | Fibula - Tibia | 5 | 5-11 | nearest bones |
| Posterior tibiotalar ligament | 1/1 | Deltoid ligament | Talus - Tibia | 3 | 8-12 | nearest bones |
| Tibionavicular ligament | 1/2 | Deltoid ligament | Talus - Tibia | 2 | 5-13 | nearest bones |
| Tibionavicular ligament | 2/2 | Deltoid ligament | Talus - Tibia | 4 | 17-21 | nearest bones |
| Transverse tibiofibular ligament | 1/1 | Posterior syndesmosis | Fibula - Tibia | 3 | 17-26 | nearest bones (also touches Talus) |

## Shown but not a tether

| Ligament | Part | Why |
|---|---|---|
| Calcaneofibular ligament | 1 | touches fewer than two bones (Fibula.r) |
| Interosseous membrane of leg | 1 | touches fewer than two bones (Fibula.r) |
| Tibiocalcaneal ligament | 1 | Calcaneus.r not in this region |
