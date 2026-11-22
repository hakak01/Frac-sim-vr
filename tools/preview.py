"""Quick picture tiles of a cut fracture (no browser, no GPU): used to check the lines by eye.
Called by fracture_engine.py --preview <dir>. Fragments are spread 10 mm apart."""
import numpy as np
from PIL import Image, ImageDraw

RGB = {"Bone": (230, 220, 200), "Cartilage": (160, 200, 225), "FractureCortex": (250, 240, 150),
       "FractureCancellous": (200, 90, 70), "FractureMarrow": (120, 30, 30)}
VIEWS = {  # name: (image right, image up, towards viewer) in Z-Anatomy axes
    "front": ((1, 0, 0), (0, 0, 1), (0, -1, 0)),
    "top": ((1, 0, 0), (0, -1, 0), (0, 0, 1)),
    "below": ((1, 0, 0), (0, -1, 0), (0, 0, -1)),
    "medial": ((0, -1, 0), (0, 0, 1), (1, 0, 0)),
    "back": ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
    "lateral": ((0, -1, 0), (0, 0, 1), (-1, 0, 0)),      # right foot seen from the outside, toes to the right
}


def tiles(path_prefix, label, frags, seg, size=300, spread=10.0):
    if not frags:
        return
    rng = np.random.default_rng(0)
    big = {}
    for f in frags:
        if f["bone"] not in big or f["volume_cm3"] > big[f["bone"]]["volume_cm3"]:
            big[f["bone"]] = f
    P, C, Nn = [], [], []
    for f in frags:
        d = f["centroid"] - f["site"]
        off = np.zeros(3) if f is big[f["bone"]] else d / max(np.linalg.norm(d), 1e-9) * spread
        for name, V, N, T in f["prims"]:
            tri = V[T] + off
            cr = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
            area = np.linalg.norm(cr, axis=1) / 2
            k = np.maximum(1, np.ceil(area / 0.1)).astype(int)
            idx = np.repeat(np.arange(len(T)), k)
            a, b = rng.random(len(idx)), rng.random(len(idx))
            flip = a + b > 1
            a[flip], b[flip] = 1 - a[flip], 1 - b[flip]
            P.append(tri[idx, 0] + a[:, None] * (tri[idx, 1] - tri[idx, 0]) + b[:, None] * (tri[idx, 2] - tri[idx, 0]))
            Nn.append((cr / np.maximum(np.linalg.norm(cr, axis=1, keepdims=True), 1e-12))[idx])
            C.append(np.tile(np.array(RGB[name], "f4"), (len(idx), 1)))
    P, C, Nn = np.vstack(P), np.vstack(C), np.vstack(Nn)
    counts = {}
    for f in frags:
        counts[f["bone"]] = counts.get(f["bone"], 0) + 1
    main = max(counts, key=counts.get)
    site = next(f["site"] for f in frags if f["bone"] == main)
    second = {"41": "top", "43": "below", "44": "below", "31": "back"}.get(seg, "medial")
    small = {"34": 70.0}.get(seg)                          # the patella needs a closer view
    views = (("a", "front", small or 170.0), ("b", second, small or (120.0 if second != "medial" else 170.0)))
    if seg[:2] in ("81", "82"):                                # talus, calcaneus: outside, top and inside, close up
        views = (("a", "lateral", 110.0), ("b", "top", 110.0), ("c", "medial", 110.0), ("d", "back", 110.0))
    for tag, view, win in views:
        r, u, t = (np.array(v, float) for v in VIEWS[view])
        q = P - site
        px = ((q @ r) / win + 0.5) * size
        py = (0.5 - (q @ u) / win) * size
        ok = (px >= 0) & (px < size) & (py >= 0) & (py < size)
        depth = (q @ t)[ok]
        order = np.argsort(depth)                         # far first, near last (near wins)
        shade = 0.3 + 0.7 * np.abs(Nn[ok] @ t)
        img = np.full((size, size, 3), (20, 23, 28), "u1")
        col = (C[ok] * shade[:, None]).astype("u1")
        img[py[ok].astype(int)[order], px[ok].astype(int)[order]] = col[order]
        im = Image.fromarray(img)
        ImageDraw.Draw(im).text((6, 4), f"{label} {view}", fill=(255, 255, 255))
        im.save(f"{path_prefix}_{tag}.png")
