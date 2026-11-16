"""Export one limb region to compressed GLB files.
Soft tissue comes from the Z-Anatomy Blender file. Bones come from BodyParts3D 3.0
(the parent of Z-Anatomy, about 4x more triangles), fitted onto the Z-Anatomy bone.

Runs once, offline. Needs:  pip install bpy   and   (cd tools && npm install)
Usage:
  python3 tools/export_region.py <Startup.blend> regions/leg_right.json assets/leg_right [bodyparts3d_stl_dir]
  (bodyparts3d_stl_dir defaults to _source/bodyparts3d/stl, filled by tools/fetch_bodyparts3d.sh)

What it does
  * Picks the structures listed/described in the region JSON (no hand-made geometry).
  * Applies Z-Anatomy's own modifiers, turns its vessel/nerve curves into meshes.
  * Bones: loads the BodyParts3D STL, finds the one scale + rotation + shift that lays it
    on the Z-Anatomy bone of the same name (no shape change), stops if they differ by
    more than BONE_FIT_MAX_MM, and copies Z-Anatomy's cartilage marking onto it.
  * Keeps true scale (metres) and Z-Anatomy world position. No decimation at all.
  * Writes one Draco-compressed GLB per layer + manifest.json (names, triangles, sizes).
    (Blender's pip build has no Draco, so tools/draco_compress.mjs does the compression.)
"""
import bpy, json, os, subprocess, sys, tempfile
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

SOURCE = {
    "name": "Z-Anatomy",
    "url": "https://github.com/Z-Anatomy/Models-of-human-anatomy",
    "commit": "cf1967839387baf412c50b47fc6a63fff30618a3",
    "license": "CC BY-SA 4.0",
    "derived_from": "BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan",
}
BONE_SOURCE = {
    "name": "BodyParts3D 3.0 (polygon reduction 95% set)",
    "url": "https://dbarchive.biosciencedbc.jp/en/bodyparts3d/download.html",
    "mirror": "https://github.com/Kevin-Mattheus-Moerman/BodyParts3D",
    "mirror_commit": "2c83c698788cff57f6317bddcf712e7acfbea7d8",
    "license": "CC BY-SA 2.1 Japan",
    "attribution": "BodyParts3D, (c) The Database Center for Life Science licensed under CC Attribution-Share Alike 2.1 Japan",
}
BONE_FIT_MAX_MM = 2.0   # stop if the BodyParts3D bone is further than this from the Z-Anatomy bone

args = sys.argv[1:]
blend, region_path, out_dir = args[:3]
bp3d_dir = args[3] if len(args) > 3 else "_source/bodyparts3d/stl"
region = json.load(open(region_path))
suffix = region["side_suffix"]
os.makedirs(out_dir, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=blend, use_scripts=False)  # never run embedded scripts
src_scene = bpy.context.scene
dg = bpy.context.evaluated_depsgraph_get()

# --- index: top-level numbered collection of every object -------------------
top = {}
def walk(col, t):
    for o in col.objects:
        top.setdefault(o.name, t)
    for c in col.children:
        walk(c, t)
for c in src_scene.collection.children:
    if c.name[:1].isdigit():
        walk(c, c.name)

def world_verts(o):
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    n = len(me.vertices)
    co = np.empty(n * 3, "f")
    me.vertices.foreach_get("co", co)
    ev.to_mesh_clear()
    M = np.array(o.matrix_world)
    return co.reshape(-1, 3) @ M[:3, :3].T + M[:3, 3]

def descendants(o):
    for c in o.children:
        yield c
        yield from descendants(c)

def has_mat(o, prefix):
    return any(m and m.name.startswith(prefix) for m in o.data.materials)

zs = np.concatenate([world_verts(bpy.data.objects[n])[:, 2] for n in region["z_window_from"]])
ZLO, ZHI = float(zs.min()), float(zs.max())
MIN_OVERLAP = region["min_overlap_mm"] / 1000.0

def in_window(o):
    z = world_verts(o)[:, 2]
    return len(z) > 0 and min(z.max(), ZHI) - max(z.min(), ZLO) >= MIN_OVERLAP

# --- choose the source objects for every layer ------------------------------
chosen = {}
for lid, L in region["layers"].items():
    names = []
    if "names" in L:
        names += L["names"]
    if "bodyparts3d" in L:
        names += list(L["bodyparts3d"])
    if "descendants_of" in L:
        for g in L["descendants_of"]:
            for o in descendants(bpy.data.objects[g]):
                if (o.type in ("MESH", "CURVE") and o.name.endswith(suffix)
                        and ("material_prefix" not in L or has_mat(o, L["material_prefix"]))):
                    names.append(o.name)
    if "collection" in L:
        for o in bpy.data.objects:
            if (top.get(o.name) == L["collection"] and o.type in ("MESH", "CURVE")
                    and o.name.endswith(suffix) and has_mat(o, L["material_prefix"])
                    and in_window(o)):
                names.append(o.name)
    names += L.get("include", [])
    names = [n for n in dict.fromkeys(names) if n not in L.get("exclude", [])]
    chosen[lid] = sorted(names)

# --- bones from BodyParts3D, laid onto the Z-Anatomy bone -------------------
def similarity(A, B):
    """Best scale s, rotation R, shift t so that s*R*a + t is close to b (Umeyama 1991)."""
    ma, mb = A.mean(0), B.mean(0)
    A0, B0 = A - ma, B - mb
    U, D, Vt = np.linalg.svd(B0.T @ A0 / len(A))
    S = np.eye(3)
    if np.linalg.det(U) * np.linalg.det(Vt) < 0:
        S[2, 2] = -1
    R = U @ S @ Vt
    s = np.trace(np.diag(D) @ S) / (A0 ** 2).sum(1).mean()
    return s, R, mb - s * R @ ma

RAW = {}

def bodyparts3d_mesh(src, fma):
    path = os.path.join(bp3d_dir, fma + ".stl")
    if not os.path.exists(path):
        sys.exit(f"STOP: BodyParts3D file missing: {path} (run tools/fetch_bodyparts3d.sh)")
    rec = np.fromfile(path, dtype=np.dtype([("n", "<f4", 3), ("v", "<f4", (3, 3)), ("a", "<u2")]), offset=84)
    V, inv = np.unique(rec["v"].reshape(-1, 3), axis=0, return_inverse=True)   # weld STL corners
    V = V.astype("f8")                       # millimetres, BodyParts3D frame
    F = inv.reshape(-1, 3)
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    Z = world_verts(src).astype("f8") * 1000.0   # Z-Anatomy bone, millimetres
    bp_tree = BVHTree.FromPolygons(V.tolist(), F.tolist())
    # ICP: find s, R, t taking Z-Anatomy points onto the BodyParts3D surface
    s = (V[:, 2].max() - V[:, 2].min()) / (Z[:, 2].max() - Z[:, 2].min())
    R = np.eye(3)
    t = (V.max(0) + V.min(0)) / 2 - s * (Z.max(0) + Z.min(0)) / 2
    for _ in range(200):
        Q = s * Z @ R.T + t
        C = np.array([bp_tree.find_nearest(Vector(q))[0] for q in Q])
        s2, R2, t2 = similarity(Z, C)
        done = abs(s2 - s) < 1e-9 and np.abs(t2 - t).max() < 1e-6
        s, R, t = s2, R2, t2
        if done:
            break
    Q = s * Z @ R.T + t
    dist = np.array([bp_tree.find_nearest(Vector(q))[3] for q in Q]) / s   # mm at Z-Anatomy scale
    fit = {
        "scale": round(float(1 / s), 5),
        "rotation_deg": round(float(np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1)))), 3),
        "median_mm": round(float(np.median(dist)), 3), "max_mm": round(float(dist.max()), 3),
    }
    if fit["max_mm"] > BONE_FIT_MAX_MM:
        sys.exit(f"STOP: {fma} does not match Z-Anatomy '{src.name}' (max {fit['max_mm']} mm). Not substituting.")
    W = ((V - t) @ R / s) / 1000.0            # BodyParts3D vertices in Z-Anatomy world, metres
    me = bpy.data.meshes.new(src.name)
    me.from_pydata(W.tolist(), [], F.tolist())
    me.update()
    me.shade_smooth()
    # copy Z-Anatomy's material marking (Bone / Cartilage) from the nearest Z-Anatomy face
    zme, M = src.data, src.matrix_world
    za_tree = BVHTree.FromPolygons([tuple(M @ v.co) for v in zme.vertices],
                                   [tuple(p.vertices) for p in zme.polygons])
    for m in zme.materials:
        me.materials.append(m)
    cen = W[F].mean(1)
    mat = [zme.polygons[za_tree.find_nearest(Vector(c))[2]].material_index for c in cen]
    me.polygons.foreach_set("material_index", mat)
    # raw copy for the fracture engine (metres, Z-Anatomy axes, no compression)
    names = [m.name for m in zme.materials]
    RAW[src.name + "|V"] = W
    RAW[src.name + "|F"] = F.astype("i4")
    RAW[src.name + "|cartilage"] = np.array([names[i] == "Cartilage" for i in mat])
    return me, fit

# --- make clean copies (modifiers applied, world coordinates) ---------------
exp_scene = bpy.data.scenes.new("export")
layers, copies = {}, {}
for lid, names in chosen.items():
    layers[lid] = []
    bp3d = region["layers"][lid].get("bodyparts3d", {})
    for name in names:
        src = bpy.data.objects[name]
        fit = None
        if name in bp3d:
            me, fit = bodyparts3d_mesh(src, bp3d[name])
        else:
            ev = src.evaluated_get(dg)
            me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
            M = src.matrix_world.copy()
            me.transform(M)
            if M.determinant() < 0:
                me.flip_normals()
        me.calc_loop_triangles()
        tris = len(me.loop_triangles)
        if tris == 0:
            bpy.data.meshes.remove(me)
            continue
        group = src.parent.name if src.parent else ""
        src.name = "__src__" + name
        ob = bpy.data.objects.new(name, me)
        ob["za_name"] = name
        ob["layer"] = lid
        exp_scene.collection.objects.link(ob)
        co = np.empty(len(me.vertices) * 3, "f")
        me.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        layers[lid].append({
            "name": name, "group": group, "triangles": tris, "vertices": len(me.vertices),
            "source_type": src.type.lower(),
            "source": f"BodyParts3D 3.0 {bp3d[name]}" if fit else "Z-Anatomy",
            **({"fit_to_z_anatomy": fit} if fit else {}),
            "materials": [m.name for m in me.materials if m],
            # bounding box in metres, Z-Anatomy axes (x: right is negative, y: back is positive, z: up)
            "bbox_min": [round(float(v), 4) for v in co.min(0)],
            "bbox_max": [round(float(v), 4) for v in co.max(0)],
        })
        copies[name] = ob

def export(objs, path):
    for o in exp_scene.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_yup=True,
        export_apply=False, export_extras=True, export_materials="EXPORT",
        export_image_format="NONE", export_texcoords=False, export_vertex_color="NONE",
        export_animations=False, export_cameras=False, export_lights=False)

manifest = {
    "id": region["id"], "title": region["title"], "units": "metres (true scale)", "compression": "Draco, 14-bit positions (about 0.02 mm steps)",
    "axes_glb": "x: patient left is +, y: up, z: patient front is +",
    "z_window_m": [round(ZLO, 4), round(ZHI, 4)],
    "source": SOURCE, "bone_source": BONE_SOURCE, "layers": {},
}
bpy.context.window.scene = exp_scene   # export from a clean scene holding only the copies
here = os.path.dirname(os.path.abspath(__file__))
with tempfile.TemporaryDirectory() as tmp:
    raw_l, raw_s, out_s = (os.path.join(tmp, d) for d in ("layers", "single", "single_out"))
    for d in (raw_l, raw_s):
        os.makedirs(d)
    for lid, rows in layers.items():
        for i, r in enumerate(rows):   # each structure alone, only to measure its size
            export([copies[r["name"]]], os.path.join(raw_s, f"{lid}_{i}.glb"))
        export([copies[r["name"]] for r in rows], os.path.join(raw_l, lid + ".glb"))
    for a, b in ((raw_l, out_dir), (raw_s, out_s)):
        subprocess.run(["node", os.path.join(here, "draco_compress.mjs"), a, b], check=True)
    for lid, rows in layers.items():
        for i, r in enumerate(rows):
            r["bytes_alone"] = os.path.getsize(os.path.join(out_s, f"{lid}_{i}.glb"))
        manifest["layers"][lid] = {
            "label": region["layers"][lid]["label"], "file": lid + ".glb",
            "bytes": os.path.getsize(os.path.join(out_dir, lid + ".glb")),
            "triangles": sum(r["triangles"] for r in rows), "structures": rows,
        }
json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
if RAW:   # input of tools/fracture_engine.py
    os.makedirs(os.path.join("model", region["id"]), exist_ok=True)
    np.savez_compressed(os.path.join("model", region["id"], "bones.npz"), **RAW)
with open(os.path.join(out_dir, "STRUCTURES.md"), "w") as f:   # same table, readable on GitHub
    f.write(f"# {region['title']} - exported structures\n\n"
            "Soft tissue: Z-Anatomy (CC BY-SA 4.0). Bones: BodyParts3D 3.0 (CC BY-SA 2.1 Japan), "
            "scaled and moved to match Z-Anatomy. No triangle reduction.\n"
            "Size = Draco-compressed size. For one structure it is the size if stored alone; "
            "the bold layer row is the real file.\n\n"
            "| Structure (Z-Anatomy name) | Source | Triangles | Size (KB) |\n|---|---|---:|---:|\n")
    for lid, L in manifest["layers"].items():
        f.write(f"| **{L['label']} ({len(L['structures'])}) - {L['file']}** | | **{L['triangles']:,}** | **{L['bytes']/1024:.0f}** |\n")
        for r in L["structures"]:
            f.write(f"| {r['name']} | {r['source']} | {r['triangles']:,} | {r['bytes_alone']/1024:.0f} |\n")
    tot = manifest["layers"].values()
    f.write(f"| **Total ({sum(len(L['structures']) for L in tot)})** | | **{sum(L['triangles'] for L in tot):,}** "
            f"| **{sum(L['bytes'] for L in tot)/1024:.0f}** |\n")
for lid, L in manifest["layers"].items():
    print(f"{lid:9s} {len(L['structures']):3d} structures {L['triangles']:7d} tris {L['bytes']/1024:7.0f} KB")
    for r in L["structures"]:
        if "fit_to_z_anatomy" in r:
            print(f"   {r['name']}: {r['source']}, {r['triangles']} tris, fit {r['fit_to_z_anatomy']}")
