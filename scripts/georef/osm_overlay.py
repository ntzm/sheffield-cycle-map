#!/usr/bin/env python3
"""Render every OSM highway onto a scheme sheet at candidate corners.

Usage:
  python3 scripts/georef/osm_overlay.py sheet.png out.png \
    '[[lngW,latN],[lngE,latN],[lngE,latS],[lngW,latS]]'

Draws roads red and paths/service ways blue on a copy of the sheet
(also writes small_<out> at 900px wide). If the corners are right,
every line locks onto its drawn/faint counterpart; the direction and
growth of any drift distinguishes translation, scale and bad-point
errors far better than fit residuals do.
"""
import json
import math
import sys

import osmium
from PIL import Image, ImageDraw

PBF = "scripts/.cache/south-yorkshire-latest.osm.pbf"
R = 6378137.0
ROADS = {
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "motorway_link", "trunk_link",
    "primary_link", "secondary_link", "tertiary_link",
}


def mx(lng):
    return math.radians(lng) * R


def my(lat):
    return R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2))


def main():
    img_path, out, corners_json = sys.argv[1], sys.argv[2], sys.argv[3]
    c = json.loads(corners_json)  # TL TR BR BL
    img = Image.open(img_path).convert("RGB")
    w, h = img.size
    sx = (mx(c[1][0]) - mx(c[0][0])) / w
    sy = (my(c[0][1]) - my(c[3][1])) / h
    x0, y0 = mx(c[0][0]), my(c[0][1])

    margin = 0.0008
    bbox = (c[0][0] - margin, c[3][1] - margin, c[1][0] + margin, c[0][1] + margin)
    ways = []

    class Handler(osmium.SimpleHandler):
        def way(self, way):
            if "highway" not in way.tags:
                return
            pts = []
            for nd in way.nodes:
                try:
                    pts.append((nd.lon, nd.lat))
                except Exception:
                    pass
            if len(pts) < 2:
                return
            if not any(bbox[0] <= p[0] <= bbox[2] and bbox[1] <= p[1] <= bbox[3] for p in pts):
                return
            ways.append((way.tags.get("highway"), pts))

    Handler().apply_file(PBF, locations=True)

    draw = ImageDraw.Draw(img)
    width = max(4, w // 450)
    for hw, pts in ways:
        col = (255, 0, 0) if hw in ROADS else (0, 120, 255)
        draw.line(
            [((mx(lng) - x0) / sx, (y0 - my(lat)) / sy) for lng, lat in pts],
            fill=col, width=width,
        )
    import os
    img.save(out)
    small = os.path.join(os.path.dirname(out), "small_" + os.path.basename(out))
    img.resize((900, int(900 * h / w))).save(small)
    print(f"{out}: {len(ways)} ways, scale x {sx:.4f} y {sy:.4f} mercator m/px")


if __name__ == "__main__":
    main()
