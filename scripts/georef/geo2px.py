"""Predict where a geo coordinate lands in plan-image pixels via a north-up fit.
Useful for locating additional control points: predict, crop, correct.

usage: python3 geo2px.py <config.json> <lng> <lat>
"""
import json
import math
import sys

import numpy as np

cfg = json.load(open(sys.argv[1]))
R = 6378137.0


def merc(lng, lat):
    return (R * math.radians(lng), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


A, b = [], []
for px, py, lng, lat in cfg["points"]:
    X, Y = merc(lng, lat)
    A.append([px, 1, 0]); b.append(X)
    A.append([-py, 0, 1]); b.append(Y)
(s, tx, ty), *_ = np.linalg.lstsq(np.array(A), np.array(b), rcond=None)

lng, lat = float(sys.argv[2]), float(sys.argv[3])
X, Y = merc(lng, lat)
print(round((X - tx) / s), round((ty - Y) / s))
