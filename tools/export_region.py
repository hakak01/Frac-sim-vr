"""Export one limb region from the Z-Anatomy Blender file to compressed GLB files.

Runs once, offline. Needs:  pip install bpy   and   (cd tools && npm install)
Usage:
  python3 tools/export_region.py <Startup.blend> regions/leg_right.json assets/leg_right

What it does
  * Picks the structures listed/described in the region JSON (no hand-made geometry).
  * Applies Z-Anatomy's own modifiers, turns its vessel/nerve curves into meshes.
  * Keeps true scale (metres) and Z-Anatomy world position. No decimation at all.
  * Writes one Draco-compressed GLB per layer + manifest.json (names, triangles, sizes).
    (Blender's pip build has no Draco, so tools/draco_compress.mjs does the compression.)
"""
import bpy, json, os, subprocess, sys, tempfile
import numpy as np

SOURCE = {
    "name": "Z-Anatomy",
    "url": "https://github.com/Z-Anatomy/Models-of-human-anatomy",
    "commit": "cf1967839387baf412c50b47fc6a63fff30618a3",
    "license": "CC BY-SA 4.0",
    "derived_from": "BodyParts3D, (c) The Database Center for Life Science, CC BY-SA 2.1 Japan",
}

blend, region_path, out_dir = sys.argv[-3:]
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

# --- make clean copies (modifiers applied, world coordinates) ---------------
exp_scene = bpy.data.scenes.new("export")
layers, copies = {}, {}
for lid, names in chosen.items():
    layers[lid] = []
    for name in names:
        src = bpy.data.objects[name]
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
    "source": SOURCE, "layers": {},
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
with open(os.path.join(out_dir, "STRUCTURES.md"), "w") as f:   # same table, readable on GitHub
    f.write(f"# {region['title']} - exported structures\n\n"
            "Source: Z-Anatomy (CC BY-SA 4.0), derived from BodyParts3D. No triangle reduction.\n"
            "Size = Draco-compressed size. For one structure it is the size if stored alone; "
            "the bold layer row is the real file.\n\n"
            "| Structure (Z-Anatomy name) | Triangles | Size (KB) |\n|---|---:|---:|\n")
    for lid, L in manifest["layers"].items():
        f.write(f"| **{L['label']} ({len(L['structures'])}) - {L['file']}** | **{L['triangles']:,}** | **{L['bytes']/1024:.0f}** |\n")
        for r in L["structures"]:
            f.write(f"| {r['name']} | {r['triangles']:,} | {r['bytes_alone']/1024:.0f} |\n")
    tot = manifest["layers"].values()
    f.write(f"| **Total ({sum(len(L['structures']) for L in tot)})** | **{sum(L['triangles'] for L in tot):,}** "
            f"| **{sum(L['bytes'] for L in tot)/1024:.0f}** |\n")
for lid, L in manifest["layers"].items():
    print(f"{lid:9s} {len(L['structures']):3d} structures {L['triangles']:7d} tris {L['bytes']/1024:7.0f} KB")
