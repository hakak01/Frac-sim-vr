"""Measure the femur of a region and compare it with published adult values.
Runs once, offline, from model/<region>/bones.npz (written by export_region.py). No Blender needed.

Usage:  python3 tools/femur_geometry.py thigh_right
Writes: model/<region>/femur_geometry.json  (landmarks and axes, millimetres, Z-Anatomy axes:
        x = patient left (+), y = back (+), z = up). The fracture engine can use these.

Methods (3D, on the outer bone surface; every step is a plain geometric rule):
  head centre / diameter  least-squares sphere through the cartilage-marked head points
  shaft axis              line through the centres of 21 cross-sections, 25-75 % of the length
  neck axis               line through the head centre and the centres of 10 neck cuts
                          (2-20 mm beyond the head sphere, cut at right angles to the axis; repeated
                          until the axis moves less than 0.01 degree)
  knee centre             midpoint of the most distal points of the two condyles
  mechanical axis         head centre -> knee centre
  neck-shaft angle        3D angle between neck axis (towards the head) and shaft axis (towards the knee)
  femoral version         angle between neck axis and posterior condylar line, both projected on the
                          plane at right angles to the mechanical axis; + = anteversion
  anterior bow            radius of the circle through the shaft-section centres (15-85 %),
                          seen from the side
  maximum length          extent of the bone along the mechanical axis
References: neck-shaft angle Boese 2016 (PMID 26305058); femoral torsion Vanhove 2019
(PMID 30737593); anterior bow Egol 2004 (PMID 15289685).
"""
import json, os, sys
import numpy as np
import trimesh

region = sys.argv[1] if len(sys.argv) > 1 else "thigh_right"
name = sys.argv[2] if len(sys.argv) > 2 else "Femur.r"
raw = np.load(os.path.join("model", region, "bones.npz"))
V = raw[name + "|V"] * 1000.0          # mm, Z-Anatomy axes
F = raw[name + "|F"]
cart = raw[name + "|cartilage"]
mesh = trimesh.Trimesh(V, F, process=False)
right = V[:, 0].mean() < 0             # right side is -x
MED = np.array([1.0 if right else -1.0, 0, 0])   # medial direction (towards the midline)

def unit(v):
    return v / np.linalg.norm(v)

def sections(origin, normal):
    """closed loops of the plane cut: list of (area mm2, centroid 3D)"""
    p = mesh.section(plane_origin=origin, plane_normal=normal)
    if p is None:
        return []
    n = unit(normal)
    a = unit(np.cross(n, [1, 0, 0] if abs(n[0]) < 0.9 else [0, 1, 0]))
    b = np.cross(n, a)
    out = []
    for loop in p.discrete:
        if len(loop) < 4:
            continue
        q = loop - origin
        x, y = q @ a, q @ b
        cr = x * np.roll(y, -1) - np.roll(x, -1) * y
        A = cr.sum() / 2
        if abs(A) < 1e-6:
            continue
        cx = ((x + np.roll(x, -1)) * cr).sum() / (6 * A)
        cy = ((y + np.roll(y, -1)) * cr).sum() / (6 * A)
        # does the loop surround the plane origin? (even-odd rule)
        x1, y1 = np.roll(x, -1), np.roll(y, -1)
        cross = ((y > 0) != (y1 > 0)) & (0 < x + (0 - y) * (x1 - x) / np.where(y1 - y == 0, 1e-12, y1 - y))
        out.append((abs(A), origin + cx * a + cy * b, bool(cross.sum() % 2)))
    return out

def fit_line(P):
    c = P.mean(0)
    d = np.linalg.svd(P - c)[2][0]
    return c, d

# --- rough long axis and length -------------------------------------------------
c0, ax0 = fit_line(V)
if ax0[2] < 0:
    ax0 = -ax0                                  # points up
t = (V - c0) @ ax0
top, bot = t.max(), t.min()
L0 = top - bot

# --- head: sphere through cartilage points in the top 20 % -----------------------
fc = V[F].mean(1)
tf = (fc - c0) @ ax0
head_faces = cart & (tf > top - 0.2 * L0)
H = V[np.unique(F[head_faces])]
A = np.c_[2 * H, np.ones(len(H))]
sol = np.linalg.lstsq(A, (H ** 2).sum(1), rcond=None)[0]
head_c = sol[:3]
head_r = float(np.sqrt(sol[3] + head_c @ head_c))
head_rms = float(np.sqrt(((np.linalg.norm(H - head_c, axis=1) - head_r) ** 2).mean()))

# --- shaft axis: centres of cross-sections 25-75 % ------------------------------
def shaft_centres(f0, f1, n):
    C = []
    for f in np.linspace(f0, f1, n):
        o = c0 + ax0 * (top - f * L0)
        s = sections(o, ax0)
        if s:
            C.append(max(s, key=lambda z: z[0])[1])
    return np.array(C)
S = shaft_centres(0.25, 0.75, 21)
sc, sd = fit_line(S)
if sd[2] > 0:
    sd = -sd                                    # shaft axis points towards the knee

# --- condyles and knee centre ---------------------------------------------------
tt = (V - sc) @ sd                              # distance towards the knee
dist = V[tt > tt.max() - 0.12 * L0]
mid = sc + sd * ((dist - sc) @ sd).mean()
side = (dist - mid) @ MED                       # > 0 medial condyle
low_m = dist[side > 0][np.argmax(((dist[side > 0] - sc) @ sd))]
low_l = dist[side < 0][np.argmax(((dist[side < 0] - sc) @ sd))]
knee_c = (low_m + low_l) / 2
mech = unit(knee_c - head_c)                    # towards the knee

# --- neck axis: cut the neck at right angles to the axis, line through the cut centres -----
foot = sc + sd * ((head_c - sc) @ sd)           # shaft-axis point level with the head centre
neck = unit(head_c - (foot + sd * head_r))      # first guess: from the shaft, up to the head
STEPS = np.arange(2, 21, 2)                     # mm beyond the head sphere
for it in range(30):
    cuts = []
    for s in STEPS:
        o = head_c - neck * (head_r + s)
        inside = [z for z in sections(o, neck) if z[2]]
        if len(inside) == 1:
            cuts.append(inside[0])
    if len(cuts) < 4:
        sys.exit("STOP: neck cross-sections not found; check the femur mesh")
    P = np.array([head_c] + [c[1] for c in cuts])
    _, d = fit_line(P)
    d = d if d @ neck > 0 else -d
    moved = np.degrees(np.arccos(np.clip(d @ neck, -1, 1)))
    neck = d
    if moved < 0.01:
        break
neck_area = min(c[0] for c in cuts)
neck_s = int(STEPS[[c[0] for c in cuts].index(neck_area)]) if len(cuts) == len(STEPS) else -1
neck_cen = np.array([c[1] for c in cuts]).mean(0)
neck_diam = 2 * np.sqrt(neck_area / np.pi)

# --- angles ---------------------------------------------------------------------
def ang(a, b):
    return float(np.degrees(np.arccos(np.clip(unit(a) @ unit(b), -1, 1))))
nsa = ang(neck, sd)

def proj(v, n):
    return v - (v @ n) * n
# posterior condylar line: two points touching a common tangent at the back (iterate)
back = np.array([0.0, 1.0, 0.0])
for _ in range(20):
    b = unit(proj(back, mech))
    pm = dist[side > 0][np.argmax(dist[side > 0] @ b)]
    pl = dist[side < 0][np.argmax(dist[side < 0] @ b)]
    line = unit(proj(pm - pl, mech))            # lateral -> medial
    nb = np.cross(mech, line)
    nb = nb if nb @ b > 0 else -nb
    if np.allclose(nb, b, atol=1e-9):
        break
    back = nb
pn = unit(proj(neck, mech))
pc = unit(proj(pm - pl, mech))                  # lateral -> medial condyle
version = ang(pn, pc)
if pn @ b > 0:                                  # neck pointing backwards = retroversion
    version = -version

# --- anterior bow: circle through shaft centres seen from the side -----------------
SB = shaft_centres(0.15, 0.85, 29)
ml = unit(proj(line, mech))                     # medio-lateral direction, side view along it
u = mech
w = np.cross(ml, u)                             # anterior-posterior in the side view
P2 = np.c_[(SB - SB.mean(0)) @ u, (SB - SB.mean(0)) @ w]
A2 = np.c_[2 * P2, np.ones(len(P2))]
s2 = np.linalg.lstsq(A2, (P2 ** 2).sum(1), rcond=None)[0]
bow_r = float(np.sqrt(s2[2] + s2[:2] @ s2[:2]))
# bow is anterior if the circle centre lies behind the shaft
centre_side = s2[1] * (1 if (w @ b) > 0 else -1)
bow_dir = "anterior" if centre_side > 0 else "posterior"
sag = float(np.ptp(P2[:, 1] - np.polyval(np.polyfit(P2[:, 0], P2[:, 1], 1), P2[:, 0])))

lm = (V - head_c) @ mech
res = {
    "bone": name, "region": region, "units": "mm, Z-Anatomy axes (x patient left +, y back +, z up)",
    "max_length_mm": round(float(lm.max() - lm.min()), 1),
    "head_centre": head_c.round(2).tolist(), "head_diameter_mm": round(2 * head_r, 1),
    "head_sphere_rms_mm": round(head_rms, 2), "head_points": int(len(H)),
    "neck_axis_to_head": neck.round(5).tolist(), "neck_min_section_centre": neck_cen.round(2).tolist(),
    "neck_min_diameter_mm": round(float(neck_diam), 1),
    "neck_min_section_beyond_head_surface_mm": int(neck_s),
    "shaft_axis_point": sc.round(2).tolist(), "shaft_axis_to_knee": sd.round(5).tolist(),
    "knee_centre": knee_c.round(2).tolist(), "mechanical_axis_to_knee": mech.round(5).tolist(),
    "posterior_condyle_medial": pm.round(2).tolist(), "posterior_condyle_lateral": pl.round(2).tolist(),
    "neck_shaft_angle_deg": round(nsa, 1),
    "version_deg": round(version, 1),
    "anterior_bow": {"radius_mm": round(bow_r, 0), "direction": bow_dir, "sagitta_mm_15_85pct": round(sag, 1)},
    "mechanical_to_shaft_axis_deg": round(ang(mech, sd), 1),
    "reference": {
        "neck_shaft_angle": "mean 128.8 deg (range 98-180), 5,089 healthy adult hips, radiographs; Boese 2016, PMID 26305058",
        "femoral_torsion": "mean 5.1-8.8 deg (CT, Hernandez and Weiner methods), 55 adults; Vanhove 2019, PMID 30737593",
        "anterior_bow": "radius 1,200 +/- 360 mm, 948 femora; Egol 2004, PMID 15289685",
    },
}
out = os.path.join("model", region, "femur_geometry.json")
json.dump(res, open(out, "w"), indent=1)
print(f"length {res['max_length_mm']} mm | head diameter {res['head_diameter_mm']} mm (sphere rms {head_rms:.2f} mm, {len(H)} pts)"
      f" | neck min diameter {res['neck_min_diameter_mm']} mm")
print(f"neck-shaft angle {nsa:.1f} deg | version {version:+.1f} deg | bow radius {bow_r:.0f} mm ({bow_dir}), "
      f"sagitta {sag:.1f} mm | mech-shaft {res['mechanical_to_shaft_axis_deg']} deg")
print("saved", out)
