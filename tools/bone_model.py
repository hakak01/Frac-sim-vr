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
        t = (V - self.c0) @ self.d
        self.t0, self.t1 = t.min(), t.max()               # proximal end, distal end
        self.length = self.t1 - self.t0
        self.outer = to_manifold(V, F).as_original()
        self._inner(cache_dir)

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


class Region:
    def __init__(self, region_id, root="."):
        self.id = region_id
        self.cfg = json.load(open(os.path.join(root, "bone_model.json")))[region_id]
        raw = np.load(os.path.join(root, "model", region_id, "bones.npz"))
        cache = os.path.join(root, "model", region_id)
        self.bones = {}
        for key, c in self.cfg["bones"].items():
            n = c["mesh"]
            self.bones[key] = Bone(key, raw[n + "|V"].astype("f8") * 1000.0, raw[n + "|F"],
                                   raw[n + "|cartilage"], c, cache)
        self._landmarks()

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
        out = {"square_rule_mm": {k: round(v, 1) for k, v in self.square.items()}, "bones": {}}
        for k, b in self.bones.items():
            out["bones"][k] = {
                "length_mm": round(float(b.length), 1),
                "volume_cm3": round(b.outer.volume() / 1000, 1),
                "cortex_cm3": round(b.shell.volume() / 1000, 1),
                "knee_joint_s": round(float(b.s_of(self.points["knee"])), 3),
                "ankle_joint_s": round(float(b.s_of(self.points["ankle"])), 3),
                "diaphysis_s": [round(float(b.s_of(self.points["diaphysis_start"])), 3),
                                round(float(b.s_of(self.points["diaphysis_end"])), 3)],
            }
        return out


if __name__ == "__main__":
    import sys
    r = Region(sys.argv[1] if len(sys.argv) > 1 else "leg_right")
    print(json.dumps(r.summary(), indent=1))
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
