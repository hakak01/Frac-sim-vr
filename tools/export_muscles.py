"""Muscle attachments of a region, for the muscle pull (Phase 6d). Runs once, offline (bpy).

Usage:  python3 tools/export_muscles.py <Startup.blend> regions/thigh_right.json
Writes: model/<region>/muscles.json   (millimetres, Z-Anatomy axes, like bones.npz x 1000)

For every muscle of the region's muscle layer:
  * ends = where the muscle is fixed to a bone. Taken from Z-Anatomy's own attachment areas
    (collection "2:", e.g. "Gluteus medius muscle.er" on Femur.r), matched by name; shared areas
    (e.g. "Iliopsoas muscle.er" for iliacus and psoas) are listed in the region JSON
    ("muscle_attachments" > "areas"). Ends with no area in Z-Anatomy ("contact") are taken where
    the muscle mesh lies within 3 mm of the bone. The side is the parent bone of the area.
  * each end gets a line of action: from the end towards the muscle's own mesh 25-80 mm away
    (nearer to this end than to the muscle's other ends, and on the side of the other ends). So a muscle that wraps round a bone
    (iliopsoas over the pelvic brim) pulls along its real path near the attachment.
Nothing here is drawn by hand; the mapping table in the region JSON is the only manual input.
"""
import bpy, json, os, sys
import numpy as np
import trimesh

blend, region_path = sys.argv[-2], sys.argv[-1]
region = json.load(open(region_path))
rid = region["id"]
cfg = region["muscle_attachments"]
bpy.ops.wm.open_mainfile(filepath=blend, use_scripts=False)
dg = bpy.context.evaluated_depsgraph_get()
sc = bpy.context.scene
top = {}
def walk(col, t):
    for o in col.objects:
        top.setdefault(o.name, t)
    for c in col.children:
        walk(c, t)
for c in sc.collection.children:
    if c.name[:1].isdigit():
        walk(c, c.name)

def world_mm(name):
    o = bpy.data.objects[name]
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    P = np.array([tuple(o.matrix_world @ v.co) for v in me.vertices]) * 1000.0
    ev.to_mesh_clear()
    return P

raw = np.load(os.path.join("model", rid, "bones.npz"))
bones = {}
for k in raw.files:
    if k.endswith("|V"):
        n = k[:-2]
        bones[n] = trimesh.Trimesh(raw[k] * 1000.0, raw[n + "|F"], process=False)

manifest = json.load(open(os.path.join("assets", rid, "manifest.json")))
muscles = [r["name"] for r in manifest["layers"]["muscles"]["structures"] if r["name"] not in cfg.get("skip", [])]
muscles.append("Patellar ligament")            # a tether (no pull), used to hold the distal patella
right_bones = set(bones) | {"Sacrum"}

# attachment areas: base name -> list of (area object name, parent bone)
areas = {}
for o in bpy.data.objects:
    if o.type == "MESH" and top.get(o.name, "").startswith("2") and o.parent and o.parent.name in right_bones:
        areas.setdefault(o.name.rsplit(".", 1)[0], []).append((o.name, o.parent.name))
owner = {}                                      # area base name -> muscles that use it
for base in areas:
    owner[base] = cfg["areas"].get(base, [base + ".r"])

def sample(P, k=40):
    if len(P) <= k:
        return P
    idx = np.linspace(0, len(P) - 1, k).astype(int)
    return P[idx]

out, report = {}, []
for m in muscles:
    ends = []
    for base, users in owner.items():
        if m in users:
            for oname, bone in areas[base]:
                P = world_mm(oname)
                ends.append({"bone": bone, "points": sample(P), "method": f"attachment area '{oname}'"})
    for c in cfg.get("contact", []):
        if c["muscle"] == m:
            M = world_mm(c.get("mesh", m))
            d = bones[c["bone"]].nearest.on_surface(M)[1]
            keep = d < 3.0
            if "near" in c:                     # e.g. obturator externus wraps under the neck: only the fossa counts
                keep &= np.linalg.norm(M - world_mm(c["near"]).mean(0), axis=1) < c["within_mm"]
            P = M[keep]
            if len(P) < 5:
                report.append(f"!! {m}: no contact with {c['bone']} (closest {d.min():.1f} mm)")
                continue
            ends.append({"bone": c["bone"], "points": sample(P), "method": f"muscle-bone contact ({c.get('mesh', m)})"})
    if not ends:
        report.append(f"!! {m}: no attachment found")
        continue
    # line of action at each end, from the muscle's own mesh near that end
    mesh_names = [m] if m != "Patellar ligament" else []
    mesh_names += [c["mesh"] for c in cfg.get("contact", []) if c["muscle"] == m and "mesh" in c]
    M = np.vstack([world_mm(n) for n in mesh_names]) if mesh_names else None
    C = np.array([e["points"].mean(0) for e in ends])
    for i, e in enumerate(ends):
        if M is None:                          # ligament: towards its other end
            j = 1 - i if len(ends) == 2 else i
            v = C[j] - C[i]
        else:
            d = np.linalg.norm(M - C[i], axis=1)
            others = np.min(np.linalg.norm(M[:, None] - np.delete(C, i, 0)[None], axis=2), axis=1) if len(C) > 1 else np.full(len(M), np.inf)
            # only the part of the muscle that runs towards its other end(s): a tendon that carries on
            # past the bone (rectus femoris over the patella) must not reverse the pull
            ahead = ((M - C[i]) @ (np.delete(C, i, 0).mean(0) - C[i]) > 0) if len(C) > 1 else np.ones(len(M), bool)
            sel = np.zeros(len(M), bool)
            for lo, hi in ((25, 80), (8, 40), (0, 120)):
                sel = (d >= lo) & (d <= hi) & (d < others) & ahead
                if sel.sum() >= 5:
                    break
            v = M[sel].mean(0) - C[i] if sel.sum() >= 5 else np.delete(C, i, 0).mean(0) - C[i]
        e["dir"] = (v / np.linalg.norm(v)).round(4).tolist()
        e["points"] = e["points"].round(2).tolist()
        e["centre"] = C[i].round(2).tolist()
    out[m] = {"ends": ends, "kind": "ligament" if m == "Patellar ligament" else "muscle"}
    report.append(f"{m}: " + "; ".join(f"{e['bone']} ({len(e['points'])} pts, {e['method'].split(' ')[0]})" for e in ends))

dst = os.path.join("model", rid, "muscles.json")
json.dump({"region": rid, "units": "mm, Z-Anatomy axes (x patient left +, y back +, z up)",
           "source": "Z-Anatomy (CC BY-SA 4.0): attachment areas (collection 2) and muscle meshes",
           "muscles": out}, open(dst, "w"), indent=1)
print("RESULT wrote", dst, len(out), "muscles")
for r in report:
    print("RESULT", r)
