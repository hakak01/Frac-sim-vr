"""Joints and ligament tethers of one region (Phase 7b). Runs once, offline, in seconds.

  python3 tools/joint_model.py foot_right
  python3 tools/joint_model.py leg_right

Reads
  model/<region>/bones.npz          bones (BodyParts3D, metres, Z-Anatomy axes) + cartilage marking
  assets/<region>/joints.glb        Z-Anatomy ligaments and capsules (decoded by tools/glb_meshes.mjs)
  ligament_model.json               names, groups, fixed corrections, teaching values (data, with sources)
Writes
  assets/<region>/joint_model.json  joints (contact points on the cartilage) and tethers (ligament fibres)
  assets/<region>/JOINTS.md         the same as a readable table

Nothing is drawn by hand: a tether runs between the two places where a Z-Anatomy ligament touches
two bones; a joint is a pair of bones whose cartilage faces each other within a few millimetres.
"""
import json, os, subprocess, sys, tempfile
import numpy as np
import trimesh

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOUCH_MM = 2.5          # a ligament point this close to a bone is on its attachment
JOINT_MM = 3.5          # cartilage this close to the other bone faces it (joint)
CONTACT_POINTS = 6      # contact points per joint where the surfaces bear
SPREAD_POINTS = 8       # and spread over the whole joint surface
MIN_JOINT_FACES = 4


def glb_axes(V):        # Z-Anatomy (x, y back, z up) -> GLB (x, y up, z front)
    return np.stack([V[:, 0], V[:, 2], -V[:, 1]], 1)


def farthest(P, k):     # k well spread points (indices)
    if len(P) <= k:
        return list(range(len(P)))
    idx = [int(np.argmin(((P - P.mean(0)) ** 2).sum(1)))]
    d = ((P - P[idx[0]]) ** 2).sum(1)
    while len(idx) < k:
        i = int(np.argmax(d))
        idx.append(i)
        d = np.minimum(d, ((P - P[i]) ** 2).sum(1))
    return idx


def main():
    region_id = sys.argv[1]
    cfg = json.load(open(os.path.join(ROOT, "ligament_model.json")))
    region = json.load(open(os.path.join(ROOT, "regions", region_id + ".json")))
    raw = np.load(os.path.join(ROOT, "model", region_id, "bones.npz"))
    bones = {}
    for k in raw.files:
        if k.endswith("|V"):
            n = k[:-2]
            m = trimesh.Trimesh(glb_axes(raw[k].astype("f8")), raw[n + "|F"], process=False)
            bones[n] = {"mesh": m, "cart": raw[n + "|cartilage"].astype(bool), "pq": trimesh.proximity.ProximityQuery(m)}
    with tempfile.TemporaryDirectory() as tmp:
        js = os.path.join(tmp, "j.json")
        subprocess.run(["node", os.path.join(ROOT, "tools", "glb_meshes.mjs"),
                        os.path.join(ROOT, "assets", region_id, "joints.glb"), js], check=True)
        ligs = json.load(open(js))

    def near(P, names=None):              # distance from points P to each bone (mm), closest points
        out = {}
        for n, b in bones.items():
            if names and n not in names:
                continue
            lo, hi = b["mesh"].bounds
            gap = np.maximum(0, np.maximum(lo - P, P - hi)).max(1)
            if gap.min() * 1000 > 10:
                continue
            cp, d, tri = b["pq"].on_surface(P)
            out[n] = (d * 1000, cp, tri)
        return out

    def tether(name, ci, nparts, P, nb, pair, cand, how):
        a, b = pair
        da, db = nb[a][0], nb[b][0]
        # each ligament point belongs to the nearer of the two bones; the attachment is the part that touches it
        thr_a, thr_b = max(TOUCH_MM, da.min() + 1.0), max(TOUCH_MM, db.min() + 1.0)
        ia = np.where((da < thr_a) & (da <= db))[0]
        ib = np.where((db < thr_b) & (db < da))[0]
        if len(ia) < 1 or len(ib) < 1:
            return f"no clear attachment on {(a if len(ia) < 1 else b).replace('.r', '')}"
        A, B = nb[a][1][ia], nb[b][1][ib]                 # attachment points on the bone surfaces
        u = B.mean(0) - A.mean(0)
        u /= np.linalg.norm(u)
        Q = np.vstack([A, B])
        Q2 = Q - np.outer((Q - Q.mean(0)) @ u, u)            # across the ligament
        w, ev = np.linalg.eigh(np.cov((Q2 - Q2.mean(0)).T))
        e1, e2 = ev[:, 2], ev[:, 1]
        ring = w[1] > 0.3 * w[2]                             # a sleeve (capsule) rather than a band
        def coord(X):
            Y = X - Q2.mean(0)
            return np.arctan2(Y @ e2, Y @ e1) if ring else Y @ e1
        ca, cb = coord(A), coord(B)
        width = np.ptp(np.concatenate([ca, cb]))
        k = 8 if ring else int(np.clip(round(width * 1000 / 5) + 1, 2, 6))
        edges = np.linspace(-np.pi, np.pi, k + 1) if ring else np.quantile(np.concatenate([ca, cb]), np.linspace(0, 1, k + 1))
        fibres = []
        for i in range(k):
            lo, hi = edges[i], edges[i + 1] + (1e-9 if i == k - 1 else 0)
            sa, sb = (ca >= lo) & (ca < hi), (cb >= lo) & (cb < hi)
            if not sa.any() or not sb.any():
                continue
            pa = bones[a]["pq"].on_surface(A[sa].mean(0)[None])[0][0]
            pb = bones[b]["pq"].on_surface(B[sb].mean(0)[None])[0][0]
            fibres.append([round(float(x), 5) for x in (*pa, *pb)])
        if not fibres:                                        # one central fibre
            pa = bones[a]["pq"].on_surface(A.mean(0)[None])[0][0]
            pb = bones[b]["pq"].on_surface(B.mean(0)[None])[0][0]
            fibres.append([round(float(x), 5) for x in (*pa, *pb)])
        lens = [float(np.linalg.norm(np.array(f[:3]) - np.array(f[3:]))) * 1000 for f in fibres]
        others = sorted(n for n in cand if n not in pair)
        return {
            "name": name, "part": ci + 1, "parts": nparts, "bones": [a, b],
            "group": next((g for g, ms in cfg["groups"].items() if name in ms), ""),
            "fibres": fibres, "rest_mm": [round(x, 2) for x in lens],
            "attach_points": [int(len(ia)), int(len(ib))], "method": how,
            **({"also_touches": others} if others else {}),
        }

    over = cfg["tether_bones"]
    tethers, dropped = [], []
    for L in ligs:
        name = L["name"]
        V = np.array(L["points"], "f8").reshape(-1, 3)
        F = np.array(L["triangles"], "i8").reshape(-1, 3)
        mesh = trimesh.Trimesh(V, F, process=True)
        comps = [c for c in mesh.split(only_watertight=False) if len(c.faces) >= 4] or [mesh]
        comps.sort(key=lambda c: tuple(np.round(c.centroid, 3)))
        for ci, c in enumerate(comps):
            P = np.asarray(c.vertices)
            nb = near(P)
            att = {n: (d < TOUCH_MM) for n, (d, _, _) in nb.items()}
            cand = {n: a for n, a in att.items() if a.sum() >= 2}
            fixed = over.get(name)
            if isinstance(fixed, dict) and "parts" in fixed:
                fixed = fixed["parts"][ci] if ci < len(fixed["parts"]) else None
            if isinstance(fixed, dict) and "fan_from" in fixed:     # one tether to every other bone it touches
                a0 = fixed["fan_from"]
                pairs = [[a0, b] for b in sorted(cand, key=lambda n: -cand[n].sum()) if b != a0] if a0 in cand else []
                how = "fan from " + a0.replace(".r", "") + " (ligament_model.json)"
            elif fixed:
                pairs = [[b for b in fixed if b in bones]]
                how = "fixed pair (ligament_model.json)"
                if len(pairs[0]) < 2:
                    dropped.append({"name": name, "part": ci + 1, "why": f"{', '.join(b for b in fixed if b not in bones)} not in this region"})
                    continue
            else:
                best, pair = -1, None
                ks = list(cand)
                for i in range(len(ks)):
                    for j in range(i + 1, len(ks)):
                        a, b = ks[i], ks[j]
                        ca, cb = P[cand[a]].mean(0), P[cand[b]].mean(0)
                        sc = np.sqrt(min(cand[a].sum(), cand[b].sum())) * np.linalg.norm(ca - cb)
                        if sc > best:
                            best, pair = sc, [a, b]
                pairs = [pair] if pair else []
                how = "nearest bones"
            if not pairs:
                dropped.append({"name": name, "part": ci + 1, "why": "touches fewer than two bones ("
                                + (", ".join(cand) or "none") + ")"})
                continue
            for pair in pairs:
                t = tether(name, ci, len(comps), P, nb, pair, cand, how)
                if isinstance(t, str):
                    dropped.append({"name": name, "part": ci + 1, "why": t})
                else:
                    tethers.append(t)

    # joints: cartilage of one bone facing another bone
    names = sorted(bones)
    joints = []
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            a, b = names[i], names[j]
            A, B = bones[a], bones[b]
            lo = np.maximum(A["mesh"].bounds[0], B["mesh"].bounds[0])
            hi = np.minimum(A["mesh"].bounds[1], B["mesh"].bounds[1])
            if ((lo - hi) * 1000 > JOINT_MM).any():
                continue
            best = None
            for x, y in ((a, b), (b, a)):                         # points on x's cartilage, against y's surface
                X = bones[x]
                cen = X["mesh"].triangles_center[X["cart"]]
                if not len(cen):
                    continue
                cp, d, tri = bones[y]["pq"].on_surface(cen)
                ok = d * 1000 < JOINT_MM
                if ok.sum() >= MIN_JOINT_FACES and (best is None or ok.sum() > best[0]):
                    best = (int(ok.sum()), x, y, cen[ok], cp[ok], tri[ok])
            if not best:
                continue
            n, x, y, P, C, T = best
            dd = np.linalg.norm(P - C, axis=1)
            bear = np.where(dd <= max(dd.min() + 0.0015, np.sort(dd)[min(len(dd), CONTACT_POINTS) - 1]))[0]
            pick = [int(bear[k]) for k in farthest(P[bear], CONTACT_POINTS)]          # where it bears
            pick += [k for k in farthest(P, SPREAD_POINTS) if k not in pick]           # and over the whole surface
            pts = []
            for k in pick:
                nrm = bones[y]["mesh"].face_normals[T[k]]
                gap = float((P[k] - C[k]) @ nrm)
                pts.append([round(float(v), 5) for v in (*P[k], *C[k], *nrm)] + [round(gap * 1000, 2)])
            key = " | ".join(sorted([a, b]))
            joints.append({"name": cfg["joint_names"].get(key, key.replace(".r", "").replace(" | ", " - ")),
                           "bones": [x, y], "faces": n, "contacts": pts})

    fixed = [b for b in region["layers"]["bones"].get("context_only", []) if b in cfg["fixed_bones"]] + \
            [b for b in cfg["fixed_bones"] if b in bones and b not in region["layers"]["bones"].get("context_only", [])]
    out = {
        "region": region_id, "units": "metres, GLB axes (x patient left +, y up, z front +)",
        "about": cfg["_about"],
        "fixed": sorted(set(b for b in cfg["fixed_bones"] if b in bones)),
        "contact_format": "[a xyz on bones[0] cartilage, b xyz on bones[1], normal of bones[1] at b, gap mm]",
        "fibre_format": "[xyz on bones[0], xyz on bones[1]]",
        "joints": joints, "tethers": tethers, "not_tethers": dropped,
    }
    path = os.path.join(ROOT, "assets", region_id, "joint_model.json")
    json.dump(out, open(path, "w"), indent=1)
    with open(os.path.join(ROOT, "assets", region_id, "JOINTS.md"), "w") as f:
        f.write(f"# Joints and ligament tethers: {region_id}\n\nMade by `tools/joint_model.py` from the Z-Anatomy ligaments "
                "and the BodyParts3D bones. Teaching model: see `ligament_model.json` for the values and their status.\n\n"
                f"## Joints ({len(joints)})\n\n| Joint | Bones | Cartilage faces in contact | Gap at rest (mm, min-max) |\n|---|---|---:|---|\n")
        for jn in joints:
            g = [c[-1] for c in jn["contacts"]]
            f.write(f"| {jn['name']} | {' - '.join(b.replace('.r', '') for b in jn['bones'])} | {jn['faces']} | {min(g):.1f} - {max(g):.1f} |\n")
        f.write("\n".join(["", "## Notes on the Z-Anatomy ligaments", ""] + ["- " + x for x in cfg.get("z_anatomy_notes", [])]) + "\n")
        f.write(f"\n## Tethers ({len(tethers)})\n\n| Ligament (Z-Anatomy) | Part | Group | Bones | Fibres | Rest length (mm) | How the bones were found |\n|---|---|---|---|---:|---|---|\n")
        for t in tethers:
            f.write(f"| {t['name'].replace('.r', '')} | {t['part']}/{t['parts']} | {t['group']} | {' - '.join(b.replace('.r', '') for b in t['bones'])} | "
                    f"{len(t['fibres'])} | {min(t['rest_mm']):.0f}-{max(t['rest_mm']):.0f} | {t['method']}"
                    f"{' (also touches ' + ', '.join(x.replace('.r', '') for x in t['also_touches']) + ')' if t.get('also_touches') else ''} |\n")
        if dropped:
            f.write("\n## Shown but not a tether\n\n| Ligament | Part | Why |\n|---|---|---|\n")
            for d in dropped:
                f.write(f"| {d['name'].replace('.r', '')} | {d['part']} | {d['why']} |\n")
    print(f"{region_id}: {len(joints)} joints, {len(tethers)} tethers ({sum(len(t['fibres']) for t in tethers)} fibres), "
          f"{len(dropped)} not tethers")


if __name__ == "__main__":
    main()
