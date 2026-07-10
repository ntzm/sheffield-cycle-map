"""List junction nodes of named streets from the cached South Yorkshire PBF.

usage: python3 junctions.py <lng_min> <lat_min> <lng_max> <lat_max> "Street A" "Street B" ...

Prints every node shared by 2+ of the named streets (and bus stops/crossings
in the bbox when --pois is passed) for use as georeferencing control points.
"""
import sys
from collections import defaultdict

import osmium

PBF = __file__.rsplit("/", 2)[0] + "/.cache/south-yorkshire-latest.osm.pbf"

args = [a for a in sys.argv[1:] if a != "--pois"]
want_pois = "--pois" in sys.argv
bbox = tuple(float(v) for v in args[:4])  # lng_min, lat_min, lng_max, lat_max
names = set(args[4:])

node_streets = defaultdict(set)
node_loc = {}


class Handler(osmium.SimpleHandler):
    def way(self, w):
        name = w.tags.get("name")
        if names and name not in names:
            return
        if not name:
            return
        for n in w.nodes:
            try:
                lon, lat = n.location.lon, n.location.lat
            except Exception:
                continue
            if bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]:
                node_streets[n.ref].add(name)
                node_loc[n.ref] = (lon, lat)

    def node(self, n):
        if not want_pois:
            return
        t = n.tags
        if t.get("highway") in ("bus_stop", "crossing", "traffic_signals"):
            lon, lat = n.location.lon, n.location.lat
            if bbox[0] <= lon <= bbox[2] and bbox[1] <= lat <= bbox[3]:
                print(f"POI {t.get('highway')} | {t.get('name', '')} | {lat:.6f}, {lon:.6f}")


Handler().apply_file(PBF, locations=True)

out = defaultdict(list)
for nid, streets in node_streets.items():
    if len(streets) >= 2:
        out[tuple(sorted(streets))].append(node_loc[nid])

for streets, locs in sorted(out.items()):
    for lon, lat in locs:
        print(f"{' / '.join(streets)} -> {lat:.6f}, {lon:.6f}")
