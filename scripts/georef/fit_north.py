"""North-up least-squares georeferencing fit (scale + translation, NO rotation).

usage: python3 fit_north.py <config.json> [--aniso]
config: {"image": "plan.jpg", "points": [[px, py, lng, lat], ...]}  (2+ points)

--aniso fits separate x/y scales for sheets whose map frame was stretched
non-uniformly (seen on some PDF-derived sheets). Only use it when the
isotropic fit leaves >6 m residuals AND the anisotropic one collapses them;
the resulting corners still form a rectangle, MapLibre stretches to fit.

Prints per-point residuals in metres and the corner coordinates
(TL, TR, BR, BL) ready for schemes.json / a MapLibre image source.
"""
import json
import math
import sys

import numpy as np
from PIL import Image

cfg = json.load(open(sys.argv[1]))
R = 6378137.0


def merc(lng, lat):
    return (R * math.radians(lng), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def unmerc(x, y):
    return (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))


aniso = "--aniso" in sys.argv

if aniso:
    # X = sx*px + tx ; Y = -sy*py + ty
    Ax, bx, Ay, by = [], [], [], []
    for px, py, lng, lat in cfg["points"]:
        X, Y = merc(lng, lat)
        Ax.append([px, 1]); bx.append(X)
        Ay.append([-py, 1]); by.append(Y)
    (sx, tx), *_ = np.linalg.lstsq(np.array(Ax), np.array(bx), rcond=None)
    (sy, ty), *_ = np.linalg.lstsq(np.array(Ay), np.array(by), rcond=None)
else:
    # X = s*px + tx ; Y = -s*py + ty
    A, b = [], []
    for px, py, lng, lat in cfg["points"]:
        X, Y = merc(lng, lat)
        A.append([px, 1, 0]); b.append(X)
        A.append([-py, 0, 1]); b.append(Y)
    (s, tx, ty), *_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)
    sx = sy = s


def px2geo(px, py):
    return unmerc(sx * px + tx, -sy * py + ty)


print(f"scale x {sx:.4f} y {sy:.4f} mercator m/px ({sx * 0.5965:.4f} true m/px)")
worst = 0
for px, py, lng, lat in cfg["points"]:
    glng, glat = px2geo(px, py)
    X0, Y0 = merc(lng, lat)
    X1, Y1 = merc(glng, glat)
    d = math.hypot(X1 - X0, Y1 - Y0) * math.cos(math.radians(lat))
    worst = max(worst, d)
    print(f"  residual ({px},{py}): {d:.1f} m")
if worst > 6:
    print("WARNING: residual > 6 m - re-read the control points before accepting")

W, H = Image.open(cfg["image"]).size
corners = [px2geo(0, 0), px2geo(W, 0), px2geo(W, H), px2geo(0, H)]
print(json.dumps([[round(lng, 6), round(lat, 6)] for lng, lat in corners]))
