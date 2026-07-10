"""Crop regions of a plan image with a labelled coordinate grid, to read the
exact pixel position of a control feature (junction, bus stop cage, dot).

usage: python3 crop.py <image> <name>:<cx>:<cy> [...]   (cx,cy = guess in px)
Writes crop_<name>.png next to the image.
"""
import os
import sys

from PIL import Image, ImageDraw

im = Image.open(sys.argv[1])
outdir = os.path.dirname(os.path.abspath(sys.argv[1]))
S = 800
for spec in sys.argv[2:]:
    name, cx, cy = spec.split(":")
    cx, cy = int(cx), int(cy)
    x0 = max(0, min(im.width - S, cx - S // 2))
    y0 = max(0, min(im.height - S, cy - S // 2))
    c = im.crop((x0, y0, x0 + S, y0 + S)).convert("RGB")
    d = ImageDraw.Draw(c)
    for g in range(0, S + 1, 100):
        d.line([(g, 0), (g, S)], fill=(255, 0, 255), width=1)
        d.line([(0, g), (S, g)], fill=(255, 0, 255), width=1)
        d.text((g + 3, 2), str(x0 + g), fill=(255, 0, 255))
        d.text((2, g + 3), str(y0 + g), fill=(255, 0, 255))
    px, py = cx - x0, cy - y0
    d.line([(px - 25, py), (px + 25, py)], fill=(255, 0, 0), width=3)
    d.line([(px, py - 25), (px, py + 25)], fill=(255, 0, 0), width=3)
    path = os.path.join(outdir, f"crop_{name}.png")
    c.save(path)
    print(f"{path} origin ({x0},{y0}) cross at guess ({cx},{cy})")
