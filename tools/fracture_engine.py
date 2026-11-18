"""Fracture engine: cuts the bones of one region into fragments, offline.

Usage:
  python3 tools/fracture_engine.py leg_right              # build every row of fractures.json
  python3 tools/fracture_engine.py leg_right 42A1 41B3.1  # build only these ids
  python3 tools/fracture_engine.py leg_right --preview /tmp/tiles 42A1   # also save check pictures
  python3 tools/fracture_engine.py leg_right --meta       # only refresh text and displacement data

One engine, data in fractures.json. A row lists, per bone, CUTS (rough cutting
surfaces) and FRAGMENTS (which side of which cut). Adding a fracture needs no new code.

Cut types
  plane   a rough plane: transverse, oblique, or any split plane
  spiral  one turn of a rough helix plus the straight line that joins its ends
  prism   an outline drawn on a joint surface, pushed into the bone:
          deep and tapering = split wedge, shallow = depression (with impaction)
  plug    an outline drawn on the side of the bone, pushed in (avulsion fragments)
Fragment options
  sides    {"cut id": "+" or "-"}   (+ = proximal side of a plane/spiral, inside of a prism)
  rest     true = everything of the bone that no other fragment took
  shatter  break this fragment into several pieces (multifragmentary / fragmentary)

Every cutting surface is displaced by noise (no flat knife cuts). Each fragment is
built from the modelled cortex shell and the inner bone separately, so cut faces carry
three materials: FractureCortex, FractureCancellous, FractureMarrow.
Output: assets/<region>/fractures/<id>.glb (Draco) + index.json + FRACTURES.md.
"""
import json, os, struct, subprocess, sys, tempfile, zlib
import numpy as np
from scipy.spatial import cKDTree
from manifold3d import Manifold, Mesh, CrossSection
from bone_model import Region, unit

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PITCH = 0.7          # mm, size of the triangles on cutting surfaces
COLOURS = {"Bone": [0.90, 0.86, 0.78, 1], "Cartilage": [0.75, 0.84, 0.89, 1],
           "FractureCortex": [0.93, 0.90, 0.80, 1], "FractureCancellous": [0.72, 0.36, 0.30, 1],
           "FractureMarrow": [0.55, 0.20, 0.16, 1]}


def seed_of(*parts):
    return zlib.crc32("|".join(map(str, parts)).encode())


class Noise:
    """Smooth random displacement in mm: large waves plus fine teeth (sum of sine waves)."""
    def __init__(self, seed, rough=1.0, waves=(28, 14, 7, 3.5), per=5):
        rng = np.random.default_rng(seed)
        K, A = [], []
        for lam in waves:
            k = rng.normal(size=(per, 3))
            K.append(k / np.linalg.norm(k, axis=1, keepdims=True) * 2 * np.pi / lam)
            A.append(rng.normal(size=(per, 3)) * rough * 0.5 * (lam / 28) ** 0.9)
        self.K, self.A = np.vstack(K), np.vstack(A)
        self.P = rng.uniform(0, 2 * np.pi, len(self.K))

    def vec(self, X):
        return np.sin(X @ self.K.T + self.P) @ self.A

    def scalar(self, X):
        return self.vec(X)[:, 0]


def solid(V, F):
    V, F = np.array(V, dtype="f4", order="C"), np.array(F, dtype="u4", order="C")
    m = Manifold(Mesh(V, F))
    if m.status().name != "NoError":
        raise RuntimeError("cutting tool is not a valid solid: " + m.status().name)
    if m.volume() < 0:
        m = Manifold(Mesh(V, np.ascontiguousarray(F[:, ::-1])))
    return m.as_original()


# ---------------------------------------------------------------- cutting tools
def plane_solid(bone, p, n, noise):
    """Everything on the +n side of a rough plane through p (as a closed box around the bone)."""
    n = unit(n)
    a = unit(np.cross(n, [1, 0, 0]) if abs(n[0]) < 0.9 else np.cross(n, [0, 1, 0]))
    b = np.cross(n, a)
    rel = bone.V - p
    ua, ub, h = rel @ a, rel @ b, rel @ n
    A = np.arange(ua.min() - 6, ua.max() + 6 + PITCH, PITCH)
    B = np.arange(ub.min() - 6, ub.max() + 6 + PITCH, PITCH)
    H = max(h.max() + 15, 5.0)
    nx, ny = len(A), len(B)
    G = p + A[:, None, None] * a + B[None, :, None] * b
    G = G.reshape(-1, 3)
    G = G + noise.scalar(G)[:, None] * n
    idx = np.arange(nx * ny).reshape(nx, ny)
    q = idx[:-1, :-1].ravel(); r = idx[1:, :-1].ravel(); s = idx[1:, 1:].ravel(); t = idx[:-1, 1:].ravel()
    F = [np.stack([q, s, r], 1), np.stack([q, t, s], 1)]           # rough face, outward = -n
    loop = np.concatenate([idx[:, 0], idx[-1, 1:], idx[-2::-1, -1], idx[0, -2:0:-1]])
    flat = (p + (A[:, None, None] * a + B[None, :, None] * b)).reshape(-1, 3)[loop] + H * n
    top = nx * ny + np.arange(len(loop))
    centre = nx * ny + len(loop)
    l0, l1, t0, t1 = loop, np.roll(loop, -1), top, np.roll(top, -1)
    F += [np.stack([l0, l1, t1], 1), np.stack([l0, t1, t0], 1),
          np.stack([np.full(len(top), centre), t0, t1], 1)]
    V = np.vstack([G, flat, flat.mean(0)])
    return solid(V, np.vstack(F))


def landmark_point(region, bone, spec):
    """A named landmark (bone_model.py) plus offsets in mm: distal, medial, anterior."""
    return (np.asarray(region.points[spec["landmark"]], float) + spec.get("distal_mm", 0) * bone.d
            + spec.get("medial_mm", 0) * bone.e_med + spec.get("anterior_mm", 0) * bone.e_ant)


def point_spec(region, bone, t, through):
    """A point for a plane to pass through, described in anatomical terms."""
    if through is None:
        return bone.axis_point(t)
    if "landmark" in through:
        return landmark_point(region, bone, through)
    if "neck" in through:                        # on the neck axis: 0 subcapital line .. 1 basicervical line
        h = region.head
        return region.neck_point(through["neck"]) + through.get("up_mm", 0) * h["up"] + through.get("ant_mm", 0) * h["ant"]
    if "head" in through:                        # from the head centre, frac of the radius along a head direction
        q = through["head"]
        return region.head["centre"] + q.get("frac", 0.0) * region.head["r"] * region.head_dir(q["elev_deg"], q["ant_deg"])
    if "frame" in through:
        fb, ft, sec, into = region.frame(through["frame"])
        u, v = through["uv"]
        sign = 1 if into == "distal" else -1
        return (fb.axis_point(ft) + (sec["cm"] + u * sec["hm"]) * fb.e_med
                + (sec["ca"] + v * sec["ha"]) * fb.e_ant + sign * through.get("depth_mm", 0) * fb.d)
    dirv = bone.direction(through["azimuth_deg"])
    tt = bone.t_of(bone.V)
    band = bone.V[np.abs(tt - t) < 5] - bone.axis_point(t)
    return bone.axis_point(t) + through.get("frac", 0.0) * (band @ dirv).max() * dirv


def body_direction(region, azimuth_deg):
    """Horizontal direction of the standing body: 0 anterior, 90 medial, 180 posterior, 270 lateral."""
    a = np.radians(azimuth_deg)
    med = np.array([1.0 if region.cfg.get("side", "right") == "right" else -1.0, 0, 0])
    return np.cos(a) * np.array([0, -1.0, 0]) + np.sin(a) * med


def plane_tool(region, bone, cut, noise):
    """Normal: tilt from the bone axis (default), from the body vertical ('reference': 'body',
    e.g. the Pauwels angle), from the neck axis ('reference': 'neck'; azimuth 0 anterior, 90 superior),
    along a head direction ('reference': 'head'), or the plane through two landmarks ('from', 'to')
    that also holds the front-to-back direction (turned by 'twist_deg' about that line)."""
    t = region.level(bone, cut["level"]) if "level" in cut else None
    tilt = np.radians(cut.get("tilt_deg", 0))
    a = np.radians(cut.get("azimuth_deg", 0))
    ref = cut.get("reference", "bone")
    if "from" in cut:
        p1, p2 = landmark_point(region, bone, cut["from"]), landmark_point(region, bone, cut["to"])
        line = unit(p2 - p1)
        v = unit(bone.e_ant - (bone.e_ant @ line) * line)
        tw = np.radians(cut.get("twist_deg", 0))
        v = np.cos(tw) * v + np.sin(tw) * np.cross(line, v)
        n = unit(np.cross(line, v))
        n = n if n @ -bone.d > 0 else -n          # + side = proximal side
        return plane_solid(bone, (p1 + p2) / 2, n, noise), None
    if ref == "body":
        n = np.cos(tilt) * np.array([0, 0, 1.0]) + np.sin(tilt) * body_direction(region, cut.get("azimuth_deg", 0))
    elif ref == "neck":
        h = region.head
        n = np.cos(tilt) * h["axis"] + np.sin(tilt) * (np.cos(a) * h["ant"] + np.sin(a) * h["up"])
    elif ref == "head":
        n = region.head_dir(cut["elev_deg"], cut["ant_deg"])
    else:
        n = np.cos(tilt) * -bone.d + np.sin(tilt) * bone.direction(cut.get("azimuth_deg", 0))
    return plane_solid(bone, point_spec(region, bone, t, cut.get("through")), n, noise), None


def chaikin(P, rounds=2):
    P = np.asarray(P, float)
    for _ in range(rounds):
        Q = np.roll(P, -1, 0)
        P = np.stack([0.75 * P + 0.25 * Q, 0.25 * P + 0.75 * Q], 1).reshape(-1, 2)
    return P


def extruded(poly, start, depth, origin, ex, ey, ez, noise, taper_to=None, amount=0.97, shear=None):
    """A rough-walled solid: outline poly (mm, in ex/ey) pushed along ez from start to depth."""
    if np.sum(poly[:, 0] * np.roll(poly[:, 1], -1) - np.roll(poly[:, 0], -1) * poly[:, 1]) < 0:
        poly = poly[::-1]
    mesh = Manifold.extrude(CrossSection([poly]), depth - start).refine_to_length(PITCH * 1.15).to_mesh()
    L = np.asarray(mesh.vert_properties[:, :3], "f8")
    T = np.asarray(mesh.tri_verts)
    dep = L[:, 2] + start
    f = np.clip(dep / depth, 0, 1)[:, None]
    xy = L[:, :2]
    if taper_to is not None:                          # outline shrinks toward a point with depth
        xy = xy + amount * f * (np.asarray(taper_to) - xy)
    if shear is not None:
        xy = xy + f * np.asarray(shear)
    W = origin + xy[:, :1] * ex + xy[:, 1:] * ey + dep[:, None] * ez
    if np.linalg.det(np.stack([ex, ey, ez])) < 0:
        T = T[:, ::-1]
    return solid(W + noise.vec(W), T)


def prism_tool(region, bone, cut, noise):
    """Outline drawn on a joint surface (frame 'plateau' or 'plafond'), pushed into the bone."""
    fb, ft, sec, into = region.frame(cut["frame"])
    sign = 1 if into == "distal" else -1
    mm = lambda uv: np.array([sec["cm"] + uv[0] * sec["hm"], sec["ca"] + uv[1] * sec["ha"]])
    poly = np.array([mm(p) for p in chaikin(cut["outline"])])
    tool = extruded(poly, cut.get("start_mm", -25.0), cut["depth_mm"], fb.axis_point(ft), fb.e_med, fb.e_ant,
                    sign * fb.d, noise, mm(cut["taper"]["to"]) if "taper" in cut else None,
                    cut.get("taper", {}).get("amount", 0.97),
                    [cut["shear_uv"][0] * sec["hm"], cut["shear_uv"][1] * sec["ha"]] if "shear_uv" in cut else None)
    return tool, (sign * cut["impaction_mm"] * fb.d if cut.get("impaction_mm") else None)


def plug_tool(region, bone, cut, noise):
    """Outline drawn on the side of the bone (seen from azimuth_deg), pushed in by depth_mm.
    outline_mm: x = towards azimuth + 90 degrees, y = towards proximal, 0,0 = on the surface at 'level'.
    'on': 'head' = outline on the femoral head, centred on head direction (elev_deg, ant_deg), pushed
    towards the head centre; x = towards anterior, y = towards superior. 'impaction_mm' = depression."""
    if cut.get("on") == "head":
        h = region.head
        out = region.head_dir(cut["elev_deg"], cut["ant_deg"])
        ey = h["up"] - (h["up"] @ out) * out
        ey = unit(ey if np.linalg.norm(ey) > 0.2 else h["axis"] - (h["axis"] @ out) * out)
        ex = np.cross(ey, out)
        ex = ex if ex @ h["ant"] >= 0 else -ex
        tool = extruded(chaikin(cut["outline_mm"]), cut.get("start_mm", -15.0), cut["depth_mm"],
                        h["centre"] + h["r"] * out, ex, ey, -out, noise,
                        cut["taper"]["to"] if "taper" in cut else None, cut.get("taper", {}).get("amount", 0.9))
        return tool, (-out * cut["impaction_mm"] if cut.get("impaction_mm") else None)
    t = region.level(bone, cut["level"])
    out = bone.direction(cut["azimuth_deg"])
    tt = bone.t_of(bone.V)
    band = bone.V[np.abs(tt - t) < 5] - bone.axis_point(t)
    origin = bone.axis_point(t) + (band @ out).max() * out
    poly = chaikin(cut["outline_mm"])
    tool = extruded(poly, cut.get("start_mm", -15.0), cut["depth_mm"], origin,
                    bone.direction(cut["azimuth_deg"] + 90), -bone.d, -out, noise,
                    cut["taper"]["to"] if "taper" in cut else None, cut.get("taper", {}).get("amount", 0.9))
    return tool, None


def spiral_tool(region, bone, cut, noise):
    tc = region.level(bone, cut["level"])
    Hh = cut["height_mm"]
    tt = bone.t_of(bone.V)
    rad = np.linalg.norm(bone.V - bone.c0 - np.outer(tt, bone.d), axis=1)
    R = rad[tt < tc + Hh / 2 + 5].max() + 6
    ztop = (tc - tt.min()) + 15                       # local z = towards proximal, 0 at tc
    nth = int(np.ceil(2 * np.pi * R / (PITCH * 1.6)))
    nr = int(np.ceil(R / PITCH))
    th = np.linspace(0, 2 * np.pi, nth + 1)
    rr = np.linspace(0, R, nr + 1)
    zs = -Hh / 2 + Hh * th / (2 * np.pi)
    V, F = [], []
    S = np.arange((nr + 1) * (nth + 1)).reshape(nr + 1, nth + 1)       # helix sheet
    V.append(np.stack([np.outer(rr, np.cos(th)), np.outer(rr, np.sin(th)),
                       np.tile(zs, (nr + 1, 1))], -1).reshape(-1, 3))
    q, r, s, t = S[:-1, :-1].ravel(), S[1:, :-1].ravel(), S[1:, 1:].ravel(), S[:-1, 1:].ravel()
    F += [np.stack([q, s, r], 1), np.stack([q, t, s], 1)]
    base = S.size                                                       # straight joining wall
    W = np.empty((nr + 1, nth + 1), int)
    W[0, :], W[:, 0], W[:, nth] = S[0, :], S[:, 0], S[:, nth]
    W[1:, 1:nth] = base + np.arange(nr * (nth - 1)).reshape(nr, nth - 1)
    V.append(np.stack([np.repeat(rr[1:], nth - 1), np.zeros(nr * (nth - 1)),
                       np.tile(zs[1:nth], nr)], 1))
    q, r, s, t = W[:-1, :-1].ravel(), W[1:, :-1].ravel(), W[1:, 1:].ravel(), W[:-1, 1:].ravel()
    F += [np.stack([q, r, s], 1), np.stack([q, s, t], 1)]
    base += nr * (nth - 1)                                              # outer wall and lid
    Tr = base + np.arange(nth)
    V.append(np.stack([(R + 4) * np.cos(th[:-1]), (R + 4) * np.sin(th[:-1]), np.full(nth, ztop)], 1))
    Tn = np.append(Tr, Tr[0])
    o = S[nr, :]
    F += [np.stack([o[:-1], o[1:], Tn[1:]], 1), np.stack([o[:-1], Tn[1:], Tn[:-1]], 1)]
    wcol = W[nr, :]
    F.append(np.stack([wcol[1:], wcol[:-1], np.full(nth, Tr[0])], 1))
    C = base + nth
    V.append(np.array([[0, 0, ztop]]))
    F.append(np.stack([np.full(nth, C), Tn[:-1], Tn[1:]], 1))
    L = np.vstack(V)
    F = np.vstack(F)
    e1 = bone.direction(cut.get("seam_azimuth_deg", 180))
    e2 = np.cross(-bone.d, e1)
    if cut.get("handed", "right") == "left":
        e2 = -e2
        F = F[:, ::-1]
    Wd = bone.axis_point(tc) + L[:, :1] * e1 + L[:, 1:2] * e2 + L[:, 2:] * -bone.d
    return solid(Wd + noise.vec(Wd), F), None


TOOLS = {"plane": plane_tool, "prism": prism_tool, "plug": plug_tool, "spiral": spiral_tool}


# ---------------------------------------------------------------- fragments
def region_solid(box, tools, sides):
    r = box
    for c, sg in sides.items():
        r = r ^ tools[c] if sg == "+" else r - tools[c]
    return r


def shatter(bone, name, R, spec, seed):
    """Break region R into pieces with rough planes through the largest piece each time."""
    rng = np.random.default_rng(seed)
    pieces = [R]
    style = spec.get("style", "shards")
    tries = 0
    while len(pieces) < spec["pieces"] and tries < 60:
        tries += 1
        vol = [(bone.outer ^ p).volume() for p in pieces]
        k = int(np.argmax(vol))
        P = np.asarray((bone.outer ^ pieces[k]).to_mesh().vert_properties[:, :3], "f8")
        c = P.mean(0) + rng.normal(size=3) * 1.5
        tilt = np.radians(rng.uniform(55, 90) if style == "shards" else rng.uniform(15, 90))
        n = np.cos(tilt) * -bone.d + np.sin(tilt) * bone.direction(rng.uniform(0, 360))
        tool = plane_solid(bone, c, n, Noise(seed + 7 * tries, spec.get("rough", 0.8)))
        a, b = pieces[k] ^ tool, pieces[k] - tool
        va, vb = (bone.outer ^ a).volume(), (bone.outer ^ b).volume()
        if min(va, vb) < 0.15 * vol[k]:
            continue
        pieces[k:k + 1] = [a, b]
    return [(f"{name} {i + 1}", p) for i, p in enumerate(pieces)]


def vertex_normals(V, F):
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    N = np.zeros_like(V)
    for i in range(3):
        np.add.at(N, F[:, i], fn)
    return N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)


def origin_ids(mesh):
    ids = np.empty(len(mesh.tri_verts), np.int64)
    ri, ro = np.asarray(mesh.run_index), np.asarray(mesh.run_original_id)
    for k in range(len(ro)):
        ids[ri[k] // 3: ri[k + 1] // 3] = ro[k]
    return ids


def fragment_primitives(bone, shell, core, tree):
    """Triangles of one fragment, grouped by material. Interface faces between cortex
    and inner bone are left out (they are never visible)."""
    prims = []
    c = bone.cfg["cortex"]["canal_from_to"]
    oid, iid = bone.outer.original_id(), bone.inner.original_id()
    for part, is_shell in ((shell, True), (core, False)):
        if part.is_empty():
            continue
        mesh = part.to_mesh()
        V = np.asarray(mesh.vert_properties[:, :3], "f8")
        T = np.asarray(mesh.tri_verts)
        ids = origin_ids(mesh)
        cen = V[T].mean(1)
        groups = []
        if is_shell:
            peri = ids == oid
            cart = bone.cart[tree.query(cen)[1]]
            groups.append((peri, [("Cartilage", peri & cart), ("Bone", peri & ~cart)]))
            cutf = ~peri & (ids != iid)
            groups.append((cutf, [("FractureCortex", cutf)]))
        else:
            cutf = ids != iid
            s = bone.s_of(cen)
            canal = (s > c[0]) & (s < c[1])
            groups.append((cutf, [("FractureMarrow", cutf & canal), ("FractureCancellous", cutf & ~canal)]))
        for mask, mats in groups:
            if not mask.any():
                continue
            N = vertex_normals(V, T[mask])
            for name, mm in mats:
                if mm.any():
                    used, inv = np.unique(T[mm], return_inverse=True)
                    prims.append((name, V[used], N[used], inv.reshape(-1, 3)))
    return prims


def build_fracture(region, row):
    frags, notes = [], []
    for bkey, spec in row.get("bones", {}).items():
        bone = region.bones[bkey]
        lo, hi = bone.V.min(0) - 40, bone.V.max(0) + 40
        box = Manifold.cube(tuple(hi - lo)).translate(tuple(lo))
        tree = cKDTree(bone.centroids)
        tools, voids = {}, {}
        for cut in spec["cuts"]:
            noise = Noise(seed_of(row["id"], bkey, cut["id"]), cut.get("rough", 1.0))
            tools[cut["id"]], shift = TOOLS[cut["type"]](region, bone, cut, noise)
            if shift is not None:
                voids[cut["id"]] = (tools[cut["id"]].translate(tuple(shift)).as_original(),
                                    cut["impaction_mm"], shift)
        named, rest_name = [], None
        for fr in spec["fragments"]:
            if fr.get("rest"):
                rest_name = fr["name"]
                continue
            R = region_solid(box, tools, fr["sides"])
            subs = (shatter(bone, fr["name"], R, fr["shatter"], seed_of(row["id"], bkey, fr["name"]))
                    if "shatter" in fr else [(fr["name"], R)])
            named += [(n, r, fr["sides"]) for n, r in subs]
        parts = [[n, bone.shell ^ r, bone.core ^ r, sides] for n, r, sides in named]
        if rest_name:
            sh, co = bone.shell, bone.core
            for _, r, _ in named:
                sh, co = sh - r, co - r
            parts.append([rest_name, sh, co, {}])
        for c, (v, _, _) in voids.items():            # crushed bone under a depressed fragment
            for p in parts:
                if p[3].get(c) != "+":
                    p[1], p[2] = p[1] - v, p[2] - v
        total = 0.0
        for n, sh, co, sides in parts:
            vol = sh.volume() + co.volume()
            if vol < 1.0:
                notes.append(f"{bkey}: fragment '{n}' is empty and was left out")
                continue
            total += vol
            prims = fragment_primitives(bone, sh, co, tree)
            f = {"bone": bkey, "mesh": bone.cfg["mesh"], "name": n, "volume_cm3": round(vol / 1000, 2),
                 "triangles": int(sum(len(p[3]) for p in prims)), "prims": prims}
            cutv = [p[1] for p in prims if p[0].startswith("Fracture")]
            f["centroid"] = np.vstack([p[1] for p in prims]).mean(0)
            f["cutv"] = np.vstack(cutv) if cutv else np.zeros((0, 3))
            imp = [c for c in voids if sides.get(c) == "+"]
            if imp:
                f["impaction_mm"] = voids[imp[0]][1]
                d = unit(voids[imp[0]][2])                     # stored in GLB axes (x, z, -y)
                f["impaction_dir"] = [round(float(d[0]), 4), round(float(d[2]), 4), round(float(-d[1]), 4)]
            frags.append(f)
        mine = [f for f in frags if f["bone"] == bkey]
        allcut = np.vstack([f.pop("cutv") for f in mine]) if mine else np.zeros((0, 3))
        for f in mine:                                 # where the fracture is, for the "spread" view
            f["site"] = allcut.mean(0) if len(allcut) else f["centroid"]
        if "lateral_wall" in row.get("checks", []) and "innominate_tubercle" in region.points:
            row.setdefault("_measured", {})["lateral_wall_mm"] = lateral_wall_mm(region, bone, parts)
        crushed = sum((bone.outer ^ v).volume() for v, _, _ in voids.values())
        if total < 0.97 * bone.outer.volume() - crushed or total > 1.001 * bone.outer.volume():
            notes.append(f"{bkey}: fragments do not add up to the whole bone "
                         f"({total / 1000:.1f} of {bone.outer.volume() / 1000:.1f} cm3)")
    return frags, notes


def lateral_wall_mm(region, bone, parts):
    """Lateral wall thickness as Hsu 2013 (PMID 23908432) measured it on radiographs: from a point on the
    lateral cortex 30 mm below the innominate tubercle, at 135 degrees to the shaft (upward and medial),
    to the fracture. Here: walk along that line and stop where the bone stops being the shaft fragment."""
    import trimesh
    lat = -bone.e_med
    t_ref = bone.t_of(region.points["innominate_tubercle"]) + 30.0
    tt = bone.t_of(bone.V)
    band = bone.V[np.abs(tt - t_ref) < 1.5] - bone.axis_point(t_ref)
    R = bone.axis_point(t_ref) + (band @ lat).max() * lat
    w = unit(np.cos(np.radians(45)) * -bone.d + np.sin(np.radians(45)) * bone.e_med)
    meshes = []
    for n, sh, co, _ in parts:
        m = (sh + co).to_mesh()
        meshes.append(trimesh.Trimesh(np.asarray(m.vert_properties[:, :3], "f8"), np.asarray(m.tri_verts), process=False))
    steps = np.arange(0.25, 90, 0.25)
    pts = R + steps[:, None] * w
    which = np.full(len(pts), -1)
    for i, m in enumerate(meshes):
        which[m.contains(pts)] = i
    inside = np.where(which >= 0)[0]
    if not len(inside):
        return None
    first = which[inside[0]]
    after = np.where((np.arange(len(pts)) > inside[0]) & (which != first))[0]
    return round(float(steps[after[0]]), 1) if len(after) else None


# ---------------------------------------------------------------- GLB output
def write_glb(path, row, frags):
    """Minimal GLB writer. Metres, Y up (x, z, -y), same axes as the Phase 1 files."""
    conv = lambda A: np.stack([A[:, 0], A[:, 2], -A[:, 1]], 1)
    mats = list(COLOURS)
    gl = {"asset": {"version": "2.0", "generator": "fracture_engine.py"}, "scene": 0,
          "scenes": [{"nodes": list(range(len(frags)))}], "nodes": [], "meshes": [],
          "materials": [{"name": m, "doubleSided": True,
                         "pbrMetallicRoughness": {"baseColorFactor": COLOURS[m], "metallicFactor": 0,
                                                  "roughnessFactor": 0.7}} for m in mats],
          "accessors": [], "bufferViews": [], "buffers": [{}]}
    blob = bytearray()

    def add(arr, target, ctype, typ, minmax=False):
        data = arr.tobytes()
        gl["bufferViews"].append({"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target})
        blob.extend(data + b"\0" * (-len(data) % 4))
        acc = {"bufferView": len(gl["bufferViews"]) - 1, "componentType": ctype, "count": len(arr), "type": typ}
        if minmax:
            acc["min"], acc["max"] = arr.min(0).tolist(), arr.max(0).tolist()
        gl["accessors"].append(acc)
        return len(gl["accessors"]) - 1

    for i, f in enumerate(frags):
        prims = []
        for name, V, N, T in f["prims"]:
            prims.append({"attributes": {"POSITION": add((conv(V) / 1000).astype("f4"), 34962, 5126, "VEC3", True),
                                         "NORMAL": add(conv(N).astype("f4"), 34962, 5126, "VEC3")},
                          "indices": add(T.astype("u4").ravel(), 34963, 5125, "SCALAR"),
                          "material": mats.index(name)})
        gl["meshes"].append({"name": f["name"], "primitives": prims})
        gl["nodes"].append({"name": f"{f['bone']}: {f['name']}", "mesh": i,
                            "extras": {"fracture": row["id"], "bone": f["bone"], "za_name": f["mesh"],
                                       "fragment": f["name"], "volume_cm3": f["volume_cm3"],
                                       "centroid": (conv(f["centroid"][None])[0] / 1000).round(5).tolist(),
                                       "site": (conv(f["site"][None])[0] / 1000).round(5).tolist(),
                                       **{k: f[k] for k in ("impaction_mm", "impaction_dir") if k in f}}})
    gl["buffers"][0]["byteLength"] = len(blob)
    js = json.dumps(gl, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(path, "wb") as fh:
        fh.write(struct.pack("<III", 0x46546C67, 2, 28 + len(js) + len(blob)))
        fh.write(struct.pack("<II", len(js), 0x4E4F534A) + js)
        fh.write(struct.pack("<II", len(blob), 0x004E4942) + bytes(blob))


def main():
    args = sys.argv[1:]
    prev_dir = None
    if "--preview" in args:                      # also write picture tiles for checking by eye
        i = args.index("--preview")
        prev_dir = args[i + 1]
        del args[i:i + 2]
        os.makedirs(prev_dir, exist_ok=True)
        import preview
    meta_only = "--meta" in args                 # refresh names, sources, displacement; cut nothing
    if meta_only:
        args.remove("--meta")
    region_id = args[0]
    only = {"(none)"} if meta_only else set(args[1:])
    data = json.load(open(os.path.join(ROOT, "fractures.json")))
    rows = [r for r in data["fractures"] if r["region"] == region_id]
    region = Region(region_id, ROOT)
    # bone quality: one set of files per cortex profile (young / elderly femur); one set if no profiles
    profiles = region.profiles
    regions = {profiles[0]: region}
    for pr in profiles[1:]:
        regions[pr] = Region(region_id, ROOT, pr)
    default_of = lambda r: r.get("bone_quality") or region.cfg.get("default_profile", {}).get(r["segment"]) or profiles[0]
    out_dir = os.path.join(ROOT, "assets", region_id, "fractures")
    os.makedirs(out_dir, exist_ok=True)
    index_path = os.path.join(out_dir, "index.json")
    old = {e["id"]: e for e in json.load(open(index_path))["fractures"]} if os.path.exists(index_path) else {}
    entries, problems = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for row in rows:
            base = row["id"].replace("(", "_").replace(")", "").replace(".", "_")
            fname = base + ".glb"
            if only and row["id"] not in only:
                if row["id"] in old:
                    entries.append(old[row["id"]])
                continue
            e = {k: row[k] for k in ("id", "code", "name", "segment", "qualification", "tags", "sources",
                                     "line_basis", "soft_tissue", "note") if row.get(k)}
            dq = default_of(row)
            failed, files = False, {}
            for pr in [dq] + [x for x in profiles if x != dq]:        # default profile first
                fn = base + (f"_{pr}" if pr else "") + ".glb"
                try:
                    fr, notes = build_fracture(regions[pr], row)
                except Exception as ex:                               # report, keep going
                    problems.append(f"{row['id']}: FAILED ({pr}) {type(ex).__name__}: {str(ex)[:160]}")
                    failed = True
                    break
                if pr == dq:
                    frags = fr
                    problems += [f"{row['id']}: {n}" for n in notes]
                    if frags and prev_dir:
                        preview.tiles(os.path.join(prev_dir, base), row["id"], frags, row["segment"])
                if fr:
                    write_glb(os.path.join(tmp, fn), row, fr)
                    files[pr] = fn
            if failed:
                continue
            if row.get("_measured"):
                e["measured"] = row.pop("_measured")
            if frags:
                e["file"] = files[dq]
                if len(profiles) > 1:
                    e["files"], e["bone_quality"] = files, dq
            e["bones"] = sorted({f["mesh"] for f in frags})
            e["triangles"] = sum(f["triangles"] for f in frags)
            e["fragments"] = [{k: v for k, v in f.items() if k not in ("prims", "centroid", "site", "cutv")} for f in frags]
            entries.append(e)
        if os.listdir(tmp):
            subprocess.run(["node", os.path.join(HERE, "draco_compress.mjs"), tmp, out_dir], check=True)
    by_id = {r["id"]: r for r in rows}
    for e in entries:
        if e.get("file"):
            e["bytes"] = os.path.getsize(os.path.join(out_dir, e["file"]))
        row = by_id[e["id"]]                      # text fields and displacement always follow fractures.json
        for k in ("code", "name", "segment", "qualification", "tags", "sources", "line_basis", "soft_tissue", "note"):
            if row.get(k):
                e[k] = row[k]
        for f in e["fragments"]:
            base = f["name"].rsplit(" ", 1)[0] if f["name"].rsplit(" ", 1)[-1].isdigit() else f["name"]
            spec = next((x for x in row["bones"][f["bone"]]["fragments"] if x["name"] == base), {})
            f.pop("displace", None)
            if spec.get("displace"):
                f["displace"] = spec["displace"]
    gl = lambda v: [round(float(v[0]), 5), round(float(v[2]), 5), round(float(-v[1]), 5)]   # to GLB axes
    frames = {k: {"mesh": b.cfg["mesh"], "distal": gl(b.d), "anterior": gl(b.e_ant), "medial": gl(b.e_med)}
              for k, b in region.bones.items()}
    json.dump({"region": region_id, "cortex": "modelled, not measured", "frames": frames,
               **({"bone_quality": profiles} if len(profiles) > 1 else {}),
               "displacements": data.get("displacements", {}), "fractures": entries},
              open(index_path, "w"), indent=1)
    with open(os.path.join(out_dir, "FRACTURES.md"), "w") as f:
        f.write(f"# Fractures built for {region_id}\n\nCortex is modelled, not measured. "
                "Sizes are Draco-compressed.\n\n| Id | Name | Qualification modelled | Fragments | Triangles | Size (KB) |\n"
                "|---|---|---|---:|---:|---:|\n")
        for e in entries:
            f.write(f"| {e['id']} | {e['name']} | {e.get('qualification', '')} | {len(e['fragments'])} | "
                    f"{e['triangles']:,} | {e.get('bytes', 0) / 1024:.0f} |\n")
    built = [e for e in entries if not only or e["id"] in only]
    print(f"index has {len(entries)} fractures; "
          f"built {len(built)} fractures, {sum(e['triangles'] for e in built):,} triangles, "
          f"{sum(e.get('bytes', 0) for e in built) / 1024:.0f} KB")
    for e in built[:12] if only else []:
        print("  ", e["id"], [(f["name"], f["volume_cm3"]) for f in e["fragments"]])
    for e in built:
        if e.get("measured"):
            print("   measured", e["id"], e["measured"])
    print(f"{len(problems)} problems")
    for p in problems:
        print("  !", p)


if __name__ == "__main__":
    main()
