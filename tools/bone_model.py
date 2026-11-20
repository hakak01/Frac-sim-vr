"""Bone model for the fracture engine: anatomical frames, landmarks and the modelled cortex.

Works in millimetres, in Z-Anatomy axes (x: patient right is negative, y: back is
positive, z: up). Reads model/<region>/bones.npz (written by export_region.py) and
bone_model.json (settings). Nothing here is drawn by hand: every frame and landmark
is measured on the bone mesh.
"""
import hashlib, json, os
import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure
from manifold3d import Manifold, Mesh

UP = np.array([0.0, 0.0, 1.0])
ANTERIOR = np.array([0.0, -1.0, 0.0])


def unit(v):
    return v / np.linalg.norm(v)


def to_manifold(V, F):
    m = Manifold(Mesh(np.asarray(V, "f4"), np.asarray(F, "u4")))
    if m.status().name != "NoError":
        raise SystemExit(f"mesh is not a valid solid: {m.status().name}")
    if m.volume() < 0:
        m = Manifold(Mesh(np.asarray(V, "f4"), np.asarray(F, "u4")[:, ::-1]))
    return m


class Bone:
    def __init__(self, key, V, F, cart, cfg, cache_dir):
        self.key, self.cfg = key, cfg
        self.V, self.F, self.cart = V, F, cart            # mm
        self.tri = trimesh.Trimesh(V, F, process=False)
        self.centroids = V[F].mean(1)
        z = V[:, 2]
        lo, hi = z.min(), z.max()
        band = lambda f: V[np.abs(z - (hi - f * (hi - lo))) < 6].mean(0)
        self.c0 = band(0.25)                              # a point on the long axis
        self.d = unit(band(0.75) - self.c0)               # long axis, pointing distally
        self.e_ant = unit(ANTERIOR - (ANTERIOR @ self.d) * self.d)
        self.e_med = np.cross(self.e_ant, self.d)         # medial for a right limb
        self.facets = facets(self.tri, cart)
        if cfg.get("frame") == "hindfoot":                # talus, calcaneus: lying bones (Phase 7c)
            self._hindfoot_frame()
        t = (V - self.c0) @ self.d
        self.t0, self.t1 = t.min(), t.max()               # proximal end, distal end
        self.length = self.t1 - self.t0
        self.outer = to_manifold(V, F).as_original()
        self._inner(cache_dir)

    def _hindfoot_frame(self):
        """Frame of a talus or calcaneus, measured on the mesh. Long axis ('distal' = towards the toes):
        from the most posterior point (posterior process / tuberosity) to the centre of the most anterior
        joint surface (talar head / cuboid facet). For the calcaneus this is the long calcaneal axis of the
        mapping papers. 'Anterior' of the long bones becomes DORSAL here (azimuth 0 dorsal, 90 medial,
        180 plantar, 270 lateral); proximal = towards the heel."""
        back = self.V[np.argmax(self.V @ -ANTERIOR)]
        front = max(self.facets, key=lambda f: f["centre"] @ ANTERIOR)["centre"]
        self.c0 = back
        self.d = unit(front - back)
        self.e_ant = unit(UP - (UP @ self.d) * self.d)    # dorsal
        self.e_med = np.cross(self.e_ant, self.d)

    # ---- coordinates ---------------------------------------------------
    def t_of(self, P):
        return (np.asarray(P) - self.c0) @ self.d

    def s_of(self, P):
        return (self.t_of(P) - self.t0) / self.length

    def axis_point(self, t):
        return self.c0 + t * self.d

    def direction(self, azimuth_deg):
        """0 = anterior, 90 = medial, 180 = posterior, 270 = lateral."""
        a = np.radians(azimuth_deg)
        return np.cos(a) * self.e_ant + np.sin(a) * self.e_med

    def section(self, t, band=(-6, 6)):
        """Centre and half-widths (medial-lateral, anterior-posterior) of the bone near level t."""
        tt = self.t_of(self.V)
        P = self.V[(tt >= t + band[0]) & (tt <= t + band[1])] - self.axis_point(t)
        m, a = P @ self.e_med, P @ self.e_ant
        return dict(cm=(m.max() + m.min()) / 2, ca=(a.max() + a.min()) / 2,
                    hm=(m.max() - m.min()) / 2, ha=(a.max() - a.min()) / 2)

    # ---- modelled cortex -----------------------------------------------
    def thickness(self, P):
        c = self.cfg["cortex"]
        prof = np.array(c["profile"])
        th = np.interp(self.s_of(P), prof[:, 0], prof[:, 1])
        r = P - self.c0 - np.outer(self.t_of(P), self.d)
        rn = np.maximum(np.linalg.norm(r, axis=1), 1e-6)
        s = self.s_of(P)
        for bo in c.get("boosts", []):                 # thicker towards one side, within a range of s
            cosb = (r @ self.direction(bo["azimuth_deg"])) / rn
            inside = (s >= bo["s_from"]) & (s <= bo["s_to"])
            th = th * (1 + bo["amount"] * np.clip(cosb, 0, 1) * inside)
        if c.get("anterior_boost"):
            r = P - self.c0 - np.outer(self.t_of(P), self.d)
            cosa = (r @ self.e_ant) / np.maximum(np.linalg.norm(r, axis=1), 1e-6)
            th = th * (1 + c["anterior_boost"] * np.clip(cosa, 0, 1))
        return th

    def _inner(self, cache_dir, pitch=0.5):
        """Inner (endosteal) solid = the bone moved inward by the modelled cortex thickness."""
        tag = hashlib.sha1((json.dumps(self.cfg["cortex"], sort_keys=True) + str(self.V.shape)
                            + f"{self.V.sum():.3f}{pitch}").encode()).hexdigest()[:12]
        path = os.path.join(cache_dir, f"{self.key}_inner_{tag}.npz")
        if os.path.exists(path):
            z = np.load(path)
            Vi, Fi = z["V"], z["F"]
        else:
            vg = self.tri.voxelized(pitch).fill()
            occ = np.pad(np.asarray(vg.matrix), 3)
            origin = np.asarray(vg.transform)[:3, 3] - 3 * pitch
            depth = ndimage.distance_transform_edt(occ).astype("f4") * pitch - pitch / 2
            nx, ny, nz = occ.shape
            ax = [origin[i] + np.arange(n) * pitch for i, n in enumerate((nx, ny, nz))]
            g = np.empty(occ.shape, "f4")
            for k in range(nz):                      # slice by slice to keep memory low
                X, Y = np.meshgrid(ax[0], ax[1], indexing="ij")
                P = np.stack([X.ravel(), Y.ravel(), np.full(X.size, ax[2][k])], 1)
                g[:, :, k] = depth[:, :, k] - self.thickness(P).reshape(nx, ny)
            g = ndimage.gaussian_filter(g, 1.2)
            Vi, Fi, _, _ = measure.marching_cubes(g, 0.0, spacing=(pitch,) * 3, step_size=2)
            Vi = Vi + origin
            np.savez_compressed(path, V=Vi.astype("f4"), F=Fi.astype("i4"))
        self.inner = to_manifold(Vi, Fi).as_original()
        self.shell = self.outer - self.inner          # cortex
        self.core = self.inner                         # cancellous bone / medullary canal


def facets(tri, cart, min_area=40.0):
    """Joint surfaces of a bone: connected patches of cartilage faces (area mm2, centre, mean normal, faces)."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    idx = np.where(cart)[0]
    if not len(idx):
        return []
    adj = tri.face_adjacency
    both = cart[adj[:, 0]] & cart[adj[:, 1]]
    pos = -np.ones(len(cart), int)
    pos[idx] = np.arange(len(idx))
    a, b = pos[adj[both, 0]], pos[adj[both, 1]]
    _, lab = connected_components(coo_matrix((np.ones(len(a)), (a, b)), shape=(len(idx),) * 2), directed=False)
    out = []
    w, c, n = tri.area_faces, tri.triangles_center, tri.face_normals
    for L in np.unique(lab):
        f = idx[lab == L]
        if w[f].sum() < min_area:
            continue
        out.append({"area": float(w[f].sum()), "centre": (c[f] * w[f, None]).sum(0) / w[f].sum(),
                    "normal": unit((n[f] * w[f, None]).sum(0)), "faces": f})
    return out


def section_area(tri, origin, normal):
    """Area (mm2) of the closed loop of a plane cut that goes round 'origin' (None if no such loop)."""
    p = tri.section(plane_origin=origin, plane_normal=normal)
    if p is None:
        return None
    n = unit(normal)
    a = unit(np.cross(n, [1, 0, 0] if abs(n[0]) < 0.9 else [0, 1, 0]))
    b = np.cross(n, a)
    for loop in p.discrete:
        q = loop - origin
        x, y = q @ a, q @ b
        x1, y1 = np.roll(x, -1), np.roll(y, -1)
        dy = np.where(y1 - y == 0, 1e-12, y1 - y)
        if (((y > 0) != (y1 > 0)) & (x - y * (x1 - x) / dy > 0)).sum() % 2:
            return abs((x * y1 - x1 * y).sum() / 2)
    return None


class Region:
    def __init__(self, region_id, root=".", profile=None):
        self.id = region_id
        self.cfg = json.load(open(os.path.join(root, "bone_model.json")))[region_id]
        # bone quality: a region may hold several cortex profiles (e.g. young / elderly femur)
        self.profiles = self.cfg.get("profiles", [None])
        self.profile = profile or self.profiles[0]
        raw = np.load(os.path.join(root, "model", region_id, "bones.npz"))
        cache = os.path.join(root, "model", region_id)
        self.bones = {}
        for key, c in self.cfg["bones"].items():
            if "cortex_profiles" in c:
                c = dict(c, cortex=c["cortex_profiles"][self.profile])
            n = c["mesh"]
            self.bones[key] = Bone(key, raw[n + "|V"].astype("f8") * 1000.0, raw[n + "|F"],
                                   raw[n + "|cartilage"], c, cache)
        self.normals = {}                                    # outward normal at some landmarks (joint surfaces)
        if self.cfg.get("landmarks") == "femur":
            self._landmarks_femur(root)
        elif self.cfg.get("landmarks") == "hindfoot":
            self._landmarks_hindfoot()
        else:
            self._landmarks()

    def _landmarks_hindfoot(self):
        """Talus and calcaneus landmarks (Phase 7c), all measured on the mesh: joint surfaces = cartilage patches,
        processes = extreme points in the bone's own frame. Names start with talus_ / calc_."""
        P, Nn = {}, {}
        up = UP
        def pick(b, mask, score):
            c = b.centroids[mask]
            return c[np.argmax(score(c))]
        def surface(b, p):
            return b.tri.nearest.on_surface(np.asarray([p]))[0][0]
        if "talus" in self.bones:
            b = self.bones["talus"]
            fs = b.facets
            dome = max(fs, key=lambda f: f["normal"] @ up)
            head = max(fs, key=lambda f: f["centre"] @ ANTERIOR)
            post = min((f for f in fs if f is not head), key=lambda f: f["normal"] @ up)
            n, t = b.tri.face_normals, b.t_of(b.centroids)
            top = np.zeros(len(n), bool); top[dome["faces"]] = True
            top &= n @ up > 0.6
            hd = np.zeros(len(n), bool); hd[head["faces"]] = True
            pf = np.zeros(len(n), bool); pf[post["faces"]] = True
            P["talus_dome"], Nn["talus_dome"] = dome["centre"], dome["normal"]
            P["talus_head"], Nn["talus_head"] = head["centre"], head["normal"]
            P["talus_post_facet"], Nn["talus_post_facet"] = post["centre"], post["normal"]
            P["talus_dome_al"] = pick(b, top, lambda c: -(c @ b.e_med) + (c @ b.d))     # anterolateral dome corner
            P["talus_dome_pm"] = pick(b, top, lambda c: (c @ b.e_med) - (c @ b.d))      # posteromedial dome corner
            Nn["talus_dome_al"] = Nn["talus_dome_pm"] = up
            P["talus_lat_process"] = b.V[np.argmin(b.V @ b.e_med)]                     # tip of the lateral process
            P["talus_post_process"] = b.c0.copy()                                       # most posterior point
            # neck: halfway between the front edge of the dome and the back edge of the navicular surface
            ta = t[top].max()
            tb = t[hd & (n @ b.d > 0.3)].min()
            tn = (ta + tb) / 2
            tv = b.t_of(b.V)
            band = np.abs(tv - tn) < 2
            P["talus_neck_dorsal"] = b.V[band][np.argmax(b.V[band] @ b.e_ant)]
            P["talus_neck_medial"] = b.V[band][np.argmax(b.V[band] @ b.e_med)]
            # sinus tarsi / sulcus tali: under the neck, between the posterior facet and the middle facet
            pa = b.centroids[pf][np.argmax(t[pf])]
            low = hd & (n @ up < -0.3)
            pb = b.centroids[low][np.argmin(t[low])]
            P["talus_sinus"] = surface(b, (pa + pb) / 2)
            self.talus_neck_t = float(tn)
        if "calcaneus" in self.bones:
            b = self.bones["calcaneus"]
            fs = b.facets
            cub = max(fs, key=lambda f: f["centre"] @ ANTERIOR)
            ups = sorted((f for f in fs if f is not cub), key=lambda f: -f["area"])
            post, mid = ups[0], (ups[1] if len(ups) > 1 else None)
            n, t = b.tri.face_normals, b.t_of(b.centroids)
            pf = np.zeros(len(n), bool); pf[post["faces"]] = True
            P["calc_post_facet"], Nn["calc_post_facet"] = post["centre"], post["normal"]
            P["calc_cuboid"], Nn["calc_cuboid"] = cub["centre"], cub["normal"]
            if mid is not None:
                P["calc_mid_facet"], Nn["calc_mid_facet"] = mid["centre"], mid["normal"]
            lat = pf & (b.centroids @ b.e_med < post["centre"] @ b.e_med)
            P["calc_gissane"] = b.centroids[lat][np.argmax(t[lat])]        # anterolateral edge of the posterior facet
            P["calc_post_facet_back"] = b.centroids[pf][np.argmin(t[pf])]
            P["calc_post_facet_front"] = b.centroids[pf][np.argmax(t[pf])]
            P["calc_tuber"] = b.c0.copy()
            tv = b.t_of(b.V)
            tback = b.t_of(P["calc_post_facet_back"])
            behind = tv < tback - 5
            P["calc_tuber_top"] = b.V[behind][np.argmax(b.V[behind] @ up)]           # Boehler: top of the tuberosity
            front = tv > b.t_of(P["calc_gissane"]) + 5
            P["calc_ant_process_top"] = b.V[front][np.argmax(b.V[front] @ up)]       # Boehler: top of the anterior process
            if mid is not None:
                near = (np.abs(tv - b.t_of(mid["centre"])) < 8) & (b.V @ up > mid["centre"] @ up - 12)
                P["calc_sustentaculum"] = b.V[near][np.argmax(b.V[near] @ b.e_med)]
            lowp = behind & (b.V @ up < np.median(b.V[behind] @ up))
            P["calc_medial_process"] = b.V[lowp][np.argmax(b.V[lowp] @ b.e_med)]
            P["calc_lateral_process"] = b.V[lowp][np.argmin(b.V[lowp] @ b.e_med)]
            atf = np.abs(tv - b.t_of(post["centre"])) < 4
            P["calc_lateral_wall"] = b.V[atf][np.argmin(b.V[atf] @ b.e_med)]
            P["calc_medial_wall"] = b.V[atf][np.argmax(b.V[atf] @ b.e_med)]
            P["calc_plantar"] = b.V[np.argmin(b.V @ up)]
            # Sanders lines on the posterior facet (Sanders 1993, PMID 8472475, Fig 1): A and B divide the facet into
            # three equal columns (lateral, central, medial); C is its medial edge, next to the sustentaculum.
            band = pf & (np.abs(t - b.t_of(post["centre"])) < 5)
            m = b.centroids[band] @ b.e_med
            lo, hi = m.min(), m.max()
            for k, f in (("A", 1 / 3), ("B", 2 / 3), ("C", 1.0)):
                target = lo + f * (hi - lo) - (1.0 if k == "C" else 0.0)
                P["calc_sanders_" + k] = b.centroids[band][np.argmin(np.abs(m - target))]
            self.sanders_facet_width_mm = float(hi - lo)
        self.points, self.normals = P, Nn
        self.square = {}

    def _landmarks_femur(self, root):
        """Femur landmarks, all measured on the mesh. Head centre, neck axis and knee centre come
        from tools/femur_geometry.py (model/<region>/femur_geometry.json)."""
        b = self.bones[self.cfg["landmark_bone"]]
        g = json.load(open(os.path.join(root, "model", self.id, self.cfg["geometry"])))
        hc = np.array(g["head_centre"])
        r = g["head_diameter_mm"] / 2
        nk = unit(np.array(g["neck_axis_to_head"]))
        up = unit(-b.d - (-b.d @ nk) * nk)                  # neck frame: superior
        an = np.cross(nk, up)
        an = an if an @ b.e_ant > 0 else -an                 # neck frame: anterior
        # subcapital line: distal extent of the head cartilage along the neck axis
        cen = b.centroids
        hd = np.linalg.norm(cen - hc, axis=1)
        junction = float(-((cen[b.cart & (hd < r + 3)] - hc) @ nk).min())
        # basicervical line: first cut beyond the narrowest neck section with 1.5 x its area
        prof = [(s, section_area(b.tri, hc - nk * s, nk)) for s in np.arange(junction, junction + 60, 1.0)]
        prof = [(s, a) for s, a in prof if a]
        k = int(np.argmin([a for _, a in prof]))
        amin = prof[k][1]
        base = next(s for s, a in prof[k:] if a > 1.5 * amin)
        # fovea: densest cluster (12 degrees) of non-cartilage faces on the head sphere
        cand = (~b.cart) & (np.abs(hd - r) < 3) & ((cen - hc) @ nk > 0.2 * r)
        D = cen[cand] - hc
        D /= np.linalg.norm(D, axis=1, keepdims=True)
        near = (D @ D.T) > np.cos(np.radians(12))
        fov = unit(D[near[np.argmax(near.sum(1))]].mean(0))
        # trochanters, from extent profiles around the shaft axis
        tt = b.t_of(b.V)
        rel = b.V - b.c0 - np.outer(tt, b.d)
        def extent(t, dirv):
            m = np.abs(tt - t) < 2.5
            return float((rel[m] @ dirv).max()) if m.any() else 0.0
        lat = -b.e_med
        side = rel @ lat
        gt = b.V[side > 10][np.argmin(tt[side > 10])]
        pm = b.direction(150)                                # posteromedial: lesser trochanter
        levels = np.arange(b.t0 + 40, b.t0 + 171, 1.0)
        e_pm = np.array([extent(t, pm) for t in levels])
        win = (levels > b.t0 + 50) & (levels < b.t0 + 140)
        ipk = int(np.argmax(np.where(win, e_pm, -1)))
        baseline = float(np.median(e_pm[levels > b.t0 + 130]))
        # inferior border: where the trochanter's bump has fallen to 25 % of its height above the shaft
        ilt = next(i for i in range(ipk, len(levels)) if e_pm[i] <= baseline + 0.25 * (e_pm[ipk] - baseline))
        lt_peak_t, lt_inf_t = levels[ipk], levels[ilt]
        mlt = np.abs(tt - lt_peak_t) < 2.5
        lt_point = b.V[mlt][np.argmax(rel[mlt] @ pm)]
        # innominate tubercle (vastus ridge): lowest level still within 3 mm of the greatest lateral extent
        e_lat = np.array([extent(t, lat) for t in levels])
        top_lat = e_lat[levels < b.t0 + 100].max()
        it_t = levels[levels < b.t0 + 100][e_lat[levels < b.t0 + 100] >= top_lat - 3].max()
        # distal end segment: square as wide as the condyles (Compendium 2018 introduction)
        knee = np.array(g["knee_centre"])
        dist = rel[tt > b.t1 - 70]
        sq = float(np.ptp(dist @ b.e_med))
        # epicondyles: the most lateral and most medial points of the distal 70 mm;
        # the transcondylar (epicondylar) axis joins them (33C1.1 / 33C1.3 limit)
        D = b.V[tt > b.t1 - 70]
        lat_epi, med_epi = D[np.argmin(D @ b.e_med)], D[np.argmax(D @ b.e_med)]
        self.head = {"centre": hc, "r": r, "axis": nk, "up": up, "ant": an, "fovea": fov}
        self.neck = {"junction_mm": junction, "base_mm": float(base), "min_area_mm2": amin}
        self.square = {"proximal_mm": None, "distal_mm": sq}
        it_point = b.axis_point(it_t) + extent(it_t, lat) * lat
        self.points = {
            "hip": hc, "head_centre": hc, "knee": knee, "gt_tip": gt, "lt_peak": lt_point,
            "neck_junction": hc - nk * junction, "neck_base": hc - nk * base,
            "lesser_trochanter": b.axis_point(lt_inf_t),           # its inferior border (AO 31 / 32 limit)
            "innominate_tubercle": it_point,
            "lat_epicondyle": lat_epi, "med_epicondyle": med_epi,
            "transcondylar": b.axis_point((b.t_of(lat_epi) + b.t_of(med_epi)) / 2),
            "diaphysis_start": b.axis_point(lt_inf_t),
            "diaphysis_end": b.axis_point(b.t_of(knee) - sq),
        }

    def neck_point(self, f):
        """Point on the neck axis: f = 0 subcapital line (cartilage edge), 1 = basicervical line."""
        n = self.neck
        return self.head["centre"] - self.head["axis"] * (n["junction_mm"] + f * (n["base_mm"] - n["junction_mm"]))

    def head_dir(self, elev_deg, ant_deg):
        """Direction from the head centre: 0, 0 = along the neck axis (towards the head);
        elevation + = superior, anterior + = anterior."""
        h = self.head
        e, a = np.radians(elev_deg), np.radians(ant_deg)
        return unit(np.cos(e) * (np.cos(a) * h["axis"] + np.sin(a) * h["ant"]) + np.sin(e) * h["up"])

    def _landmarks(self):
        b = self.bones[self.cfg["landmark_bone"]]
        n = b.tri.face_normals
        s = b.s_of(b.centroids)
        knee = b.cart & (s < 0.2) & (n @ -b.d > 0.5)       # plateau cartilage, facing up
        ankle = b.cart & (s > 0.8) & (n @ b.d > 0.7)       # plafond cartilage, facing down
        if not knee.any() or not ankle.any():
            raise SystemExit("STOP: joint surfaces not found from the cartilage marking")
        w = b.tri.area_faces
        self.points = {
            "knee": (b.centroids[knee] * w[knee, None]).sum(0) / w[knee].sum(),
            "ankle": (b.centroids[ankle] * w[ankle, None]).sum(0) / w[ankle].sum(),
        }
        # AO/OTA end segments: a square as wide as the widest part of the epiphysis,
        # tibia and fibula taken together (Compendium 2018, introduction, Fig 2).
        allV = np.vstack([x.V for x in self.bones.values()])
        t = b.t_of(allV)
        m = (allV - b.c0) @ b.e_med
        prox = m[t < b.t0 + 60]
        dist = m[t > b.t1 - 50]
        self.square = {"proximal_mm": float(prox.max() - prox.min()),
                       "distal_mm": float(dist.max() - dist.min())}
        self.points["diaphysis_start"] = b.axis_point(b.t0 + self.square["proximal_mm"])
        self.points["diaphysis_end"] = b.axis_point(b.t1 - self.square["distal_mm"])

    def level(self, bone, spec):
        """Turn a level description from fractures.json into a position (mm) on the bone's axis."""
        if "s" in spec:
            return bone.t0 + spec["s"] * bone.length
        ref = spec["ref"]
        if ref == "diaphysis":
            a, e = bone.t_of(self.points["diaphysis_start"]), bone.t_of(self.points["diaphysis_end"])
            return a + spec["frac"] * (e - a)
        base = {"prox_end": bone.t0, "dist_end": bone.t1}.get(ref)
        if base is None:
            base = bone.t_of(self.points[ref])
        return base + spec.get("distal_mm", 0.0)

    def frame(self, name_or_spec):
        f = self.cfg["frames"][name_or_spec] if isinstance(name_or_spec, str) else name_or_spec
        bone = self.bones[f["bone"]]
        t = self.level(bone, f["level"])
        sec = bone.section(t, f.get("band_mm", [-6, 6]))
        return bone, t, sec, f.get("into", "distal")

    def summary(self):
        out = {"profile": self.profile,
               "square_rule_mm": {k: (round(v, 1) if v else v) for k, v in self.square.items()}, "bones": {}}
        for k, b in self.bones.items():
            out["bones"][k] = {
                "length_mm": round(float(b.length), 1),
                "volume_cm3": round(b.outer.volume() / 1000, 1),
                "cortex_cm3": round(b.shell.volume() / 1000, 1),
                **{f"{p}_s": round(float(b.s_of(self.points[p])), 3) for p in self.points
                   if p not in ("hip", "head_centre")},
            }
        if hasattr(self, "neck"):
            b = self.bones[self.cfg["landmark_bone"]]
            fv = self.head["fovea"]
            out["femur"] = {
                "neck_mm_from_head_centre": {"subcapital": round(self.neck["junction_mm"], 1),
                                             "basicervical": round(self.neck["base_mm"], 1)},
                "fovea_deg": {"elevation": round(float(np.degrees(np.arcsin(fv @ self.head["up"]))), 1),
                              "anterior": round(float(np.degrees(np.arctan2(fv @ self.head["ant"], fv @ self.head["axis"]))), 1)},
                "mm_below_proximal_end": {p: round(float(b.t_of(self.points[p]) - b.t0), 1)
                                          for p in ("gt_tip", "lt_peak", "lesser_trochanter", "innominate_tubercle",
                                                    "diaphysis_end", "lat_epicondyle", "med_epicondyle",
                                                    "transcondylar", "knee")},
            }
        return out


if __name__ == "__main__":
    import sys
    r = Region(sys.argv[1] if len(sys.argv) > 1 else "leg_right")
    print(json.dumps(r.summary(), indent=1))
    if r.cfg.get("landmarks") == "hindfoot":            # landmarks in each bone's own frame (mm)
        for k, p in r.points.items():
            b = r.bones["talus" if k.startswith("talus") else "calcaneus"]
            q = p - b.c0
            print(f"  {k:24s} along {q @ b.d:6.1f}  medial {q @ b.e_med:6.1f}  dorsal {q @ b.e_ant:6.1f}")
        for k, b in r.bones.items():
            print(k, "length", round(b.length, 1), "axis (Z-Anatomy)", b.d.round(3))
    if "tibia" not in r.bones:
        raise SystemExit
    b = r.bones["tibia"]
    # check of the modelled canal against Taylor 2020 (13-32 mm between 20 and 80 % of length)
    for f in (0.2, 0.35, 0.5, 0.65, 0.8):
        t = b.t_of(r.points["knee"]) + f * (b.t_of(r.points["ankle"]) - b.t_of(r.points["knee"]))
        P = b.inner.to_mesh().vert_properties[:, :3]
        tt = b.t_of(P)
        ring = P[np.abs(tt - t) < 1.0] - b.axis_point(t)
        if len(ring):
            dm = np.ptp(ring @ b.e_med); da = np.ptp(ring @ b.e_ant)
            print(f"canal at {int(f*100)}% of joint-to-joint length: {dm:.1f} x {da:.1f} mm (ML x AP)")
