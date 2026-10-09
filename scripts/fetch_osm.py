#!/usr/bin/env python3
"""
Fetch OSM data for Sheffield Cycle Map.

Downloads South Yorkshire PBF from Geofabrik, extracts Sheffield boundary,
filters to Sheffield area, and outputs GeoJSON files for each map layer.

Replaces: boundary.js, parking.js, cycleway.js, pumps.js, counters.js,
embedded_tram_tracks.js, asl.js, wayfinding.js, signs.js, shops.js,
ncn.js, lcn.js, scn.js
"""

import hashlib
import heapq
import json
import math
import os
import re
import subprocess
import sys
import time
from array import array
from base64 import b64decode, b64encode
from io import BytesIO
from pathlib import Path
from urllib.request import Request, urlopen

import requests as http_requests

import blurhash as blurhash_encode
import osmium
from PIL import Image
from shapely.geometry import LineString, MultiPolygon, Point, Polygon
from shapely.prepared import prep

# ── Constants ────────────────────────────────────────────────────────────────

# cycle_network=* value on route relations belonging to the Sheffield Cycle
# Network: the council's new set of fully signed, high-quality numbered
# routes. These are tagged network=lcn in OSM but get their own layer,
# separate from the basic Local Cycle Network. The older named LCN relations
# (Cycle Ring Route, Norfolk Park, ...) carry the same cycle_network tag, so
# a numeric ref is what tells the new numbered routes apart.
SCN_CYCLE_NETWORK = "GB:Sheffield Cycle Network"


def _is_scn_route(tags):
    return (tags.get("route") == "bicycle"
            and tags.get("cycle_network") == SCN_CYCLE_NETWORK
            and tags.get("ref", "").strip().isdigit())

GEOFABRIK_URL = (
    "https://download.geofabrik.de/europe/united-kingdom/england/"
    "south-yorkshire-latest.osm.pbf"
)
SHEFFIELD_REL_ID = 106956

SCRIPTS_DIR = Path(__file__).resolve().parent
CACHE_DIR = SCRIPTS_DIR / ".cache"
DATA_DIR = SCRIPTS_DIR.parent / "public" / "data"
PBF_PATH = CACHE_DIR / "south-yorkshire-latest.osm.pbf"
API_CACHE_FILE = CACHE_DIR / "api-cache.json"

PANORAMAX_BASE = "https://panoramax.mapcomplete.org"
PANORAMAX_TOKEN = (
    "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9."
    "eyJpc3MiOiJnZW92aXNpbyIsInN1YiI6IjU5ZjgzOGI0LTM4ZjAtNDdjYi04OWYyLTM3NDQ3MWMxNTUxOCJ9."
    "0rBioZS_48NTjnkIyN9497c3fQdTqtGgH1HDqlz1bWs"
)

MOTORISED_HIGHWAYS = frozenset([
    "motorway", "trunk", "primary", "secondary", "tertiary",
    "unclassified", "residential", "living_street", "service",
])

SIGN_PATTERN = re.compile(
    r"GB:(618\.(2|3)|619|951|953|955|956(\.1)?|957R?|960\.(1|2)|965|966|967|968\.1)"
)

HANGAR_OPERATORS = frozenset(["Falco", "Hooplr"])
IMPLICIT_COVERED = frozenset(["shed", "building", "lockers"])

# ── Cache ────────────────────────────────────────────────────────────────────

_api_cache = None
_api_cache_dirty = False


def _load_cache():
    global _api_cache
    if _api_cache is not None:
        return
    try:
        _api_cache = json.loads(API_CACHE_FILE.read_text())
    except Exception:
        _api_cache = {}


def _save_cache():
    if not _api_cache_dirty:
        return
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    API_CACHE_FILE.write_text(json.dumps(_api_cache, indent=2))


def _make_cache_key(url, method="GET", body=None, headers=None):
    h = {}
    if headers:
        for k, v in headers.items():
            h[k.lower()] = v
    payload = json.dumps(
        {"url": url, "method": method.upper(), "body": body, "headers": h},
        separators=(",", ":"),
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _decode_entry(entry):
    if entry is None or not isinstance(entry, dict) or isinstance(entry, list):
        return entry
    ct = entry.get("__cacheType")
    if not ct:
        return entry
    if ct == "buffer":
        return b64decode(entry["data"])
    return entry.get("data")


def _encode_entry(data, cache_type):
    if cache_type == "buffer":
        return {"__cacheType": "buffer", "data": b64encode(data).decode("ascii")}
    return {"__cacheType": cache_type, "data": data}


def cached_fetch(url, headers=None, response_type="json"):
    """Fetch with cache, compatible with the JS api-cache.json format."""
    global _api_cache_dirty
    _load_cache()
    key = _make_cache_key(url, headers=headers)
    if key in _api_cache:
        print(f"[cache] hit {url}")
        return _decode_entry(_api_cache[key])

    print(f"[cache] miss {url}")

    for attempt in range(4):
        try:
            resp = http_requests.get(url, headers=headers or {}, timeout=30)
            resp.raise_for_status()
            raw = resp.content
            break
        except Exception as e:
            if attempt == 3:
                raise
            print(f"  retry {attempt + 1}: {e}")
            time.sleep(1.5 * (2 ** attempt))

    if response_type == "json":
        data = json.loads(raw)
        _api_cache[key] = _encode_entry(data, "json")
    elif response_type == "buffer":
        data = raw
        _api_cache[key] = _encode_entry(raw, "buffer")
    else:
        data = raw.decode()
        _api_cache[key] = _encode_entry(data, "text")

    _api_cache_dirty = True
    print(f"[cache] store {url}")
    return data


def get_cache_entry(key):
    _load_cache()
    entry = _api_cache.get(key)
    return _decode_entry(entry)


def set_cache_entry(key, value):
    global _api_cache_dirty
    _load_cache()
    _api_cache[key] = value
    _api_cache_dirty = True


# ── PBF Download ─────────────────────────────────────────────────────────────


def download_pbf():
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    ts_file = PBF_PATH.with_suffix(".pbf.ts")

    headers = {}
    if PBF_PATH.exists() and ts_file.exists():
        headers["If-Modified-Since"] = ts_file.read_text().strip()

    print(f"Downloading {GEOFABRIK_URL}")
    resp = http_requests.get(GEOFABRIK_URL, headers=headers, stream=True, timeout=120)

    if resp.status_code == 304:
        print("PBF is up to date (304)")
        return

    if resp.status_code != 200:
        if PBF_PATH.exists():
            print(f"Download failed (HTTP {resp.status_code}), using cached PBF")
            return
        raise RuntimeError(f"Download failed: HTTP {resp.status_code}")

    with open(PBF_PATH, "wb") as f:
        for chunk in resp.iter_content(chunk_size=65536):
            f.write(chunk)

    last_mod = resp.headers.get("Last-Modified", "")
    if last_mod:
        ts_file.write_text(last_mod)
    print(f"  saved {PBF_PATH.stat().st_size} bytes")


# ── PBF Processing ───────────────────────────────────────────────────────────


def _ts(obj):
    """Format an osmium timestamp as ISO string."""
    try:
        return obj.timestamp.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


class RelationScanner(osmium.SimpleHandler):
    """Pass 1: scan relations to collect member IDs before the full read."""

    def __init__(self):
        super().__init__()
        self.needed_way_ids = set()

        self.boundary_rels = []
        self.ncn_rels = []
        self.lcn_rels = []
        self.scn_rels = []
        self.wayfinding_rels = []
        self.parking_rels = []
        self.shops_rels = []

    def relation(self, r):
        tags = dict(r.tags)
        members = [(m.type, m.ref, m.role) for m in r.members]
        ts = _ts(r)
        rd = {"id": r.id, "type": "relation", "tags": tags,
              "members": members, "timestamp": ts}
        way_ids = {ref for typ, ref, _ in members if typ == "w"}

        # Boundary
        if (tags.get("name") == "Sheffield"
                and tags.get("boundary") == "administrative"
                and tags.get("admin_level", "") in ("6", "7", "8")):
            self.boundary_rels.append(rd)
            self.needed_way_ids |= way_ids

        # NCN
        if tags.get("route") == "bicycle" and tags.get("network") == "ncn":
            self.ncn_rels.append(rd)
            self.needed_way_ids |= way_ids

        # Sheffield Cycle Network (takes precedence over LCN)
        if _is_scn_route(tags):
            self.scn_rels.append(rd)
            self.needed_way_ids |= way_ids

        # LCN
        elif tags.get("route") == "bicycle" and tags.get("network") == "lcn":
            self.lcn_rels.append(rd)
            self.needed_way_ids |= way_ids

        # Wayfinding route relations
        if tags.get("type") == "route" or tags.get("route"):
            self.wayfinding_rels.append(rd)

        # Parking relations
        if tags.get("amenity") == "bicycle_parking":
            self.parking_rels.append(rd)
            self.needed_way_ids |= way_ids

        # Shop relations
        is_shop = tags.get("shop") == "bicycle"
        has_svc = any(k.startswith("service:bicycle") and v == "yes"
                      for k, v in tags.items())
        is_repair = (tags.get("amenity") == "bicycle_repair_station"
                     or tags.get("destroyed:amenity") == "bicycle_repair_station"
                     or tags.get("disused:amenity") == "bicycle_repair_station")
        if (is_shop or has_svc) and not is_repair:
            self.shops_rels.append(rd)
            self.needed_way_ids |= way_ids


def _is_cycleway(tags):
    if tags.get("bicycle") == "no":
        return False
    if (tags.get("access") == "no"
            and tags.get("bicycle") not in ("yes", "designated", "permissive")):
        return False
    hw = tags.get("highway")
    mtb_ex = (tags.get("mtb") == "yes"
              or bool(re.match(r"^[1-9]", tags.get("mtb:scale", ""))))

    if hw == "cycleway" and not mtb_ex:
        return True
    if hw == "path" and tags.get("bicycle") == "designated" and not mtb_ex:
        return True
    if (hw == "pedestrian"
            and tags.get("bicycle") in ("yes", "designated")
            and tags.get("area") != "yes"
            and not mtb_ex):
        return True
    if hw:
        for k in ("cycleway", "cycleway:left", "cycleway:right", "cycleway:both"):
            v = tags.get(k, "")
            if v == "track" or v == "lane":
                return True
    return False


_CONTRAFLOW_NON_ROADS = ("cycleway", "path", "footway", "bridleway", "steps",
                         "pedestrian", "construction")


def _is_contraflow(tags):
    """Oneway street where cycling is permitted against the flow."""
    hw = tags.get("highway")
    if not hw or hw in _CONTRAFLOW_NON_ROADS:
        return False
    if tags.get("oneway") not in ("yes", "-1", "1", "true"):
        return False
    if tags.get("oneway:bicycle") == "no":
        return True
    return any(tags.get(k, "").startswith("opposite")
               for k in ("cycleway", "cycleway:left", "cycleway:right", "cycleway:both"))


_ONEWAY_YES = ("yes", "-1", "1", "true")


def _is_oneway_for_bicycles(tags):
    """Way can only be cycled in one direction (either direction counts)."""
    ob = tags.get("oneway:bicycle")
    if _is_no(ob):
        return False
    if ob in _ONEWAY_YES:
        return True
    if _is_contraflow(tags):
        return False
    return tags.get("oneway") in _ONEWAY_YES


def _contraflow_has_lane(tags):
    # Exact values only: shared_lane (sharrows) is not dedicated infrastructure.
    return any(tags.get(k) in ("lane", "track", "opposite_lane", "opposite_track")
               for k in ("cycleway", "cycleway:left", "cycleway:right", "cycleway:both"))


def _is_embedded_tram(tags):
    for k, v in tags.items():
        if re.match(r"^embedded_rails(:lanes|:forward|:backward)?$", k) and "tram" in v:
            return True
    return False


def _is_shop_tags(tags):
    if tags.get("shop") == "bicycle":
        return True
    if any(k.startswith("service:bicycle") and v == "yes" for k, v in tags.items()):
        if (tags.get("amenity") != "bicycle_repair_station"
                and tags.get("destroyed:amenity") != "bicycle_repair_station"
                and tags.get("disused:amenity") != "bicycle_repair_station"):
            return True
    return False


def _is_pump_tags(tags):
    return any(tags.get(k) == "bicycle_repair_station"
               for k in ("amenity", "disused:amenity", "destroyed:amenity"))


def _water_kind(tags):
    """Return 'drinking_water', 'water_tap', 'refill', or None."""
    if tags.get("amenity") == "drinking_water":
        return "drinking_water"
    if tags.get("man_made") == "water_tap":
        if tags.get("drinking_water") == "yes":
            return "drinking_water"
        return "water_tap"
    if tags.get("drinking_water:refill") == "yes":
        return "refill"
    return None


def _is_water_tags(tags):
    return _water_kind(tags) is not None


def _traffic_calming_kind(tags):
    """Return the raw traffic_calming value or None."""
    return tags.get("traffic_calming") or None


# Roads motor traffic can use; a crossing is where a cycleable path meets one.
DRIVEABLE_HIGHWAYS = MOTORISED_HIGHWAYS | frozenset([
    "motorway_link", "trunk_link", "primary_link", "secondary_link",
    "tertiary_link", "road", "busway",
])
_PATH_HIGHWAYS = frozenset(["cycleway", "path", "footway", "bridleway",
                            "pedestrian", "track"])
_BICYCLE_OK = ("yes", "designated", "permissive")
_MOTOR_OK = ("yes", "designated", "permissive", "destination", "private",
             "delivery", "customers", "agricultural", "permit")
_CROSSING_REFS_FOR_BIKES = ("toucan", "parallel", "tiger")
# Max distance along the path from a bicycle traffic signal to the crossing it
# controls (signals stand at the stop line a few metres back from the kerb).
BICYCLE_SIGNAL_MAX_DIST_M = 30
# Max distance from a give way line on the road to the crossing it serves.
GIVE_WAY_MAX_DIST_M = 15


def _is_20mph(tags):
    """Public road with a 20mph limit. Service roads are skipped: a 20mph
    sign in a car park or private estate isn't a legal speed limit."""
    hw = tags.get("highway")
    return (hw in DRIVEABLE_HIGHWAYS and hw != "service"
            and tags.get("maxspeed") == "20 mph")


def _is_driveable(tags):
    if tags.get("highway") not in DRIVEABLE_HIGHWAYS or tags.get("area") == "yes":
        return False
    # Bus gates and the like: closed to general traffic but still a road.
    if any(tags.get(k) in _MOTOR_OK for k in ("motor_vehicle", "motorcar", "bus", "psv")):
        return True
    return not any(tags.get(k) == "no" for k in ("access", "vehicle", "motor_vehicle"))


def _is_crossing_node_tags(tags):
    """Node carries crossing-related tags worth keeping for the crossings layer."""
    return (tags.get("highway") in ("crossing", "traffic_signals")
            or "crossing" in tags or "crossing_ref" in tags
            or "crossing:continuous" in tags)


def _node_allows_bicycles(tags):
    """Crossing node that is itself made for cycling (a toucan on a footway=crossing)."""
    return (tags.get("crossing_ref") in _CROSSING_REFS_FOR_BIKES
            or tags.get("crossing") == "toucan"
            or tags.get("bicycle") == "designated")


def _is_bicycle_signal(tags):
    return (tags.get("highway") == "traffic_signals"
            and tags.get("bicycle") in ("yes", "designated"))


def _is_cycleable_path(tags):
    """Non-road cycle infrastructure: a cycleway, or a path designated for
    cycling. Paths where cycling is merely allowed (a park path with
    bicycle=yes, a bridleway) don't count, and nor do roads: a road meeting a
    road is a junction, not a crossing."""
    hw = tags.get("highway")
    if hw not in _PATH_HIGHWAYS:
        return False
    bicycle = tags.get("bicycle")
    if bicycle in ("no", "dismount"):
        return False
    if tags.get("access") == "no" and bicycle not in _BICYCLE_OK:
        return False
    if hw == "cycleway":
        return True
    return bicycle == "designated" or tags.get("crossing_ref") in _CROSSING_REFS_FOR_BIKES


class DataCollector(osmium.SimpleHandler):
    """Pass 2: full read collecting all needed data."""

    def __init__(self, scan):
        super().__init__()
        self.scan = scan

        self.nodes = []
        self.ways = []
        self.way_geoms = {}    # way_id -> [(lon, lat), ...]
        self.way_node_ids = {} # way_id -> [node_id, ...]
        self.way_tags = {}     # way_id -> tags (relation member ways only)
        self.asl_node_ids = set()
        self.asl_ways = []     # ways containing ASL nodes (for bearing derivation)
        self.tc_node_ids = set()
        self.tc_ways = []      # ways containing traffic calming nodes (for bearing derivation)
        # Crossings layer. Driveable roads are kept as flat node id arrays
        # (far too many to keep as dicts) and joined to the cycleable paths
        # afterwards, since ways arrive in id order rather than paths first.
        self.crossing_nodes = {}  # node_id -> tags, for crossing/signal nodes
        self.bike_ok_node_ids = set()
        self.give_way_nodes = {}  # node_id -> ((lon, lat), direction)
        self.bike_ok_node_locs = {}  # node_id -> loc, for those on a non-cycleable path
        self.cycle_paths = []     # cycleable path way dicts
        self.road_node_ids = array("q")
        self.road_way_idx = array("q")
        self.road_count = 0

    def node(self, n):
        tags = dict(n.tags)
        if not tags:
            return
        try:
            lon, lat = n.location.lon, n.location.lat
        except osmium.InvalidLocationError:
            return

        if tags.get("highway") == "give_way":
            direction = tags.get("direction") or tags.get("give_way:direction")
            self.give_way_nodes[n.id] = ((lon, lat), direction)
        if _is_crossing_node_tags(tags):
            self.crossing_nodes[n.id] = {"tags": tags, "timestamp": _ts(n)}
            if _node_allows_bicycles(tags):
                self.bike_ok_node_ids.add(n.id)

        matched = False
        if tags.get("amenity") == "bicycle_parking":
            matched = True
        if _is_pump_tags(tags):
            matched = True
        if _is_water_tags(tags):
            matched = True
        if (tags.get("man_made") == "monitoring_station"
                and tags.get("monitoring:bicycle") == "yes"):
            matched = True
        if _traffic_calming_kind(tags):
            self.tc_node_ids.add(n.id)
            matched = True
        if tags.get("cycleway") == "asl":
            self.asl_node_ids.add(n.id)
            matched = True
        if (tags.get("information") in ("guidepost", "route_marker")
                and tags.get("bicycle") == "yes"):
            matched = True
        ts_val = tags.get("traffic_sign", "")
        if ts_val and SIGN_PATTERN.search(ts_val):
            matched = True
        if _is_shop_tags(tags):
            matched = True

        if matched:
            self.nodes.append({
                "id": n.id, "type": "node",
                "lat": lat, "lon": lon,
                "tags": tags, "timestamp": _ts(n),
            })

    def way(self, w):
        tags = dict(w.tags)
        node_ids = [nd.ref for nd in w.nodes]
        geom = []
        for nd in w.nodes:
            try:
                if nd.location.valid():
                    geom.append((nd.location.lon, nd.location.lat))
            except osmium.InvalidLocationError:
                pass
        if len(geom) < 2:
            return

        if _is_driveable(tags):
            self.road_node_ids.extend(node_ids)
            self.road_way_idx.extend([self.road_count] * len(node_ids))
            self.road_count += 1
        elif _is_cycleable_path(tags):
            self.cycle_paths.append({
                "id": w.id, "tags": tags,
                "geometry": geom, "node_ids": node_ids,
            })
        elif (tags.get("highway") in _PATH_HIGHWAYS
                and tags.get("bicycle") not in ("no", "dismount")
                and len(geom) == len(node_ids)):
            # A footway is cycleable only at a crossing node that itself
            # permits cycling (a toucan), never along the rest of the way.
            for nid, loc in zip(node_ids, geom):
                if nid in self.bike_ok_node_ids:
                    self.bike_ok_node_locs[nid] = loc

        # Store geometry for relation member resolution
        if w.id in self.scan.needed_way_ids:
            self.way_geoms[w.id] = geom
            self.way_node_ids[w.id] = node_ids
            self.way_tags[w.id] = tags

        matched = False
        if tags.get("amenity") == "bicycle_parking":
            matched = True
        if _is_cycleway(tags):
            matched = True
        if _is_contraflow(tags):
            matched = True
        if _is_embedded_tram(tags):
            matched = True
        if _is_20mph(tags):
            matched = True
        if _is_shop_tags(tags):
            matched = True
        if _is_water_tags(tags):
            matched = True
        if tags.get("lcn") == "yes":
            matched = True
            if w.id not in self.way_geoms:
                self.way_geoms[w.id] = geom
                self.way_node_ids[w.id] = node_ids
                self.way_tags[w.id] = tags

        # Ways containing ASL or traffic calming nodes are needed for bearing
        # derivation, with their real tags so road priority and oneway handling
        # work. Nodes precede ways in the PBF, so the node id sets are complete
        # by now.
        contains_asl = any(nid in self.asl_node_ids for nid in node_ids)
        contains_tc = any(nid in self.tc_node_ids for nid in node_ids)

        if matched or contains_asl or contains_tc:
            way_dict = {
                "id": w.id, "type": "way",
                "tags": tags, "timestamp": _ts(w),
                "geometry": geom, "node_ids": node_ids,
            }
            if matched:
                self.ways.append(way_dict)
            if contains_asl:
                self.asl_ways.append(way_dict)
            if contains_tc:
                self.tc_ways.append(way_dict)


# ── Boundary Polygon ─────────────────────────────────────────────────────────


def _almost_equal(a, b, eps=1e-6):
    return abs(a[0] - b[0]) < eps and abs(a[1] - b[1]) < eps


def _stitch_rings(way_coords_list):
    """Stitch way coordinate lists into closed rings. Matches boundary.js logic."""
    unused = {i: list(coords) for i, coords in enumerate(way_coords_list)}
    rings = []

    while unused:
        start_id = next(iter(unused))
        ring = list(unused.pop(start_id))

        extended = True
        while extended:
            extended = False
            for wid, c in list(unused.items()):
                first, last = c[0], c[-1]
                ring_start, ring_end = ring[0], ring[-1]

                if _almost_equal(ring_end, first):
                    ring.extend(c[1:])
                elif _almost_equal(ring_end, last):
                    ring.extend(c[:-1][::-1])
                elif _almost_equal(ring_start, last):
                    ring = c[:-1] + ring
                elif _almost_equal(ring_start, first):
                    ring = c[1:][::-1] + ring
                else:
                    continue
                del unused[wid]
                extended = True
                break

        if not _almost_equal(ring[0], ring[-1]):
            ring.append(ring[0])
        rings.append(ring)

    return rings


def build_boundary_polygon(boundary_rels, way_geoms):
    """Build Sheffield boundary as shapely geometry. Returns (polygon, geojson_feature)."""
    rel = None
    for r in boundary_rels:
        if r["tags"].get("admin_level") == "8":
            rel = r
            break
    if not rel:
        rel = boundary_rels[0] if boundary_rels else None
    if not rel:
        raise RuntimeError("Sheffield boundary relation not found")

    outer_ways = []
    for mtype, mref, mrole in rel["members"]:
        if mtype == "w" and mrole == "outer" and mref in way_geoms:
            geom = way_geoms[mref]
            if len(geom) > 1:
                outer_ways.append(geom)

    if not outer_ways:
        raise RuntimeError("No outer ways found for boundary")

    rings = _stitch_rings(outer_ways)

    if len(rings) == 1:
        geojson_geom = {"type": "Polygon", "coordinates": [rings[0]]}
        polygon = Polygon(rings[0])
    else:
        geojson_geom = {"type": "MultiPolygon", "coordinates": [[r] for r in rings]}
        polygon = MultiPolygon([Polygon(r) for r in rings])

    feature = {"type": "Feature", "properties": {}, "geometry": geojson_geom}
    return polygon, feature


# ── Geographic Filtering ─────────────────────────────────────────────────────


def filter_to_sheffield(nodes, ways, polygon):
    prepared = prep(polygon)

    ok_nodes = [n for n in nodes if prepared.contains(Point(n["lon"], n["lat"]))]

    ok_ways = []
    for w in ways:
        if any(prepared.contains(Point(lon, lat)) for lon, lat in w["geometry"]):
            ok_ways.append(w)

    return ok_nodes, ok_ways


# ── Way / Relation Centers ───────────────────────────────────────────────────


def _bbox_center(coords):
    """Compute bbox midpoint, matching Overpass `out center`."""
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return (min(lats) + max(lats)) / 2, (min(lons) + max(lons)) / 2


def _way_center(way):
    return _bbox_center(way["geometry"])


def _relation_center(rel, way_geoms):
    all_coords = []
    for mtype, mref, _ in rel["members"]:
        if mtype == "w" and mref in way_geoms:
            all_coords.extend(way_geoms[mref])
    if not all_coords:
        return None
    return _bbox_center(all_coords)


# ── GeoJSON Utilities ────────────────────────────────────────────────────────


def _point_feature(lon, lat, props):
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


def _line_feature(coords, props):
    if len(coords) < 2:
        return None
    return {
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": list(coords)},
        "properties": props,
    }


def write_geojson(filename, features):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / filename
    data = {"type": "FeatureCollection", "features": features}
    path.write_text(json.dumps(data))
    print(f"Wrote {len(features)} → {filename}")


# ── Layer: Boundary ──────────────────────────────────────────────────────────


def process_boundary(boundary_feature):
    write_geojson("boundary.geojson", [boundary_feature])


# ── Layer: Parking ───────────────────────────────────────────────────────────


def _booleanise(v):
    if v == "yes": return "Yes"
    if v == "no": return "No"
    if v == "partial": return "Partially"
    return v


ACCESS_MAP = {"customers": "Customers only", "members": "Members only", "private": "Private"}
PRIVATE_MAP = {"students": "Students only", "employees": "Employees only"}


def _parking_name(tags, is_hangar):
    if tags.get("name"):
        return tags["name"]
    if is_hangar:
        return "Cycle hangar"

    parts = []
    bp = tags.get("bicycle_parking", "")
    loc = tags.get("location", "")
    cov = tags.get("covered", "")

    if loc == "underground":
        parts.append("Underground")
    elif cov == "yes" and bp not in IMPLICIT_COVERED:
        parts.append("Covered")
    elif cov == "partial":
        parts.append("Partially-covered")
    elif cov == "no":
        parts.append("Uncovered")

    if bp in ("stands", "wave"):
        parts.append("Bike stands")
    elif bp == "crossbar":
        parts.append("Crossbar")
    elif bp == "wall_loops":
        parts.append("Wheelbenders")
    elif bp == "two-tier":
        parts.append("Two-tier bike parking")
    elif bp == "informal":
        parts.append("Informal bike parking")
    elif bp == "shed":
        parts.append("Bike shed")
    elif bp == "lockers":
        parts.append("Bike lockers")
    else:
        parts.append("Bike parking")

    return " ".join(
        (p[0].lower() + p[1:] if i > 0 else p) for i, p in enumerate(parts)
    )


def _panoramax_ids(tags):
    ids = []
    for k, v in tags.items():
        if v and (k == "panoramax" or k.startswith("panoramax:")):
            ids.append(v)
    return ids


def _get_panoramax_data(pano_id):
    url = f"{PANORAMAX_BASE}/api/search?limit=1&ids={pano_id}"
    try:
        resp = cached_fetch(url, headers={
            "Accept": "application/geo+json",
            "Authorization": PANORAMAX_TOKEN,
        })
    except Exception as e:
        print(f"  Panoramax API error for {pano_id}: {e}", file=sys.stderr)
        return None

    features = resp.get("features", [])
    if not features:
        print(f"  No features for panoramax {pano_id}", file=sys.stderr)
        return None

    feat = features[0]
    try:
        thumb_href = f"{PANORAMAX_BASE}{feat['assets']['thumb']['href']}"
        license_val = feat["properties"].get("license")
        producer = feat["providers"][-1]["name"]
    except (KeyError, IndexError) as e:
        print(f"  Bad panoramax response for {pano_id}: {e}", file=sys.stderr)
        return None

    try:
        buf = cached_fetch(thumb_href, response_type="buffer")
    except Exception as e:
        print(f"  Thumbnail fetch failed for {thumb_href}: {e}", file=sys.stderr)
        return None

    try:
        img = Image.open(BytesIO(buf))
        width, height = img.size
    except Exception:
        width, height = None, None

    quality_score = _get_brisque_score(thumb_href, buf)
    bh = _get_blurhash(buf)

    return {
        "thumbnailHref": thumb_href,
        "license": license_val,
        "producer": producer,
        "width": width,
        "height": height,
        "qualityScore": quality_score,
        "blurhash": bh,
    }


def _get_brisque_score(thumb_href, buf):
    cache_key = f"brisque:{thumb_href}"
    cached = get_cache_entry(cache_key)
    if isinstance(cached, (int, float)):
        return cached

    b64 = b64encode(buf).decode("ascii")
    script = SCRIPTS_DIR / "brisque_score.py"
    try:
        result = subprocess.run(
            ["python3", str(script)],
            input=b64, capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            print(f"  BRISQUE failed: {result.stderr.strip()}", file=sys.stderr)
            return None
        parsed = json.loads(result.stdout)
        score = parsed.get("score")
        if isinstance(score, (int, float)) and math.isfinite(score):
            set_cache_entry(cache_key, score)
            return score
    except Exception as e:
        print(f"  BRISQUE error: {e}", file=sys.stderr)
    return None


def _get_blurhash(buf):
    try:
        img = Image.open(BytesIO(buf)).convert("RGBA")
        img.thumbnail((64, 64))
        w, h = img.size
        return blurhash_encode.encode(img, 4, 3)
    except Exception as e:
        print(f"  Blurhash failed: {e}", file=sys.stderr)
        return None


def process_parking(nodes, ways, parking_rels, way_geoms):
    elements = []

    for n in nodes:
        if n["tags"].get("amenity") == "bicycle_parking":
            elements.append(("node", n["lat"], n["lon"], n["id"], n["type"],
                             n["tags"], n["timestamp"]))

    for w in ways:
        if w["tags"].get("amenity") == "bicycle_parking":
            lat, lon = _way_center(w)
            elements.append(("way", lat, lon, w["id"], w["type"],
                             w["tags"], w["timestamp"]))

    for r in parking_rels:
        center = _relation_center(r, way_geoms)
        if center:
            lat, lon = center
            elements.append(("relation", lat, lon, r["id"], r["type"],
                             r["tags"], r["timestamp"]))

    features = []
    for _, lat, lon, osm_id, osm_type, tags, timestamp in elements:
        props = {"authentication": []}
        props["osm_id"] = osm_id
        props["osm_type"] = osm_type
        if timestamp:
            props["last_updated"] = timestamp

        bp = tags.get("bicycle_parking", "")
        if bp == "building" and tags.get("access") != "private":
            props["is_hub"] = True

        is_hangar = tags.get("operator") in HANGAR_OPERATORS
        if is_hangar:
            props["is_hangar"] = True

        props["name"] = _parking_name(tags, is_hangar)

        if bp == "wall_loops":
            props["wheel_benders"] = True

        if tags.get("description"):
            props["description"] = tags["description"]

        access_val = ACCESS_MAP.get(tags.get("access"))
        if access_val:
            priv = PRIVATE_MAP.get(tags.get("private"))
            props["access"] = priv if priv else access_val

        if tags.get("fee") == "yes":
            props["fee"] = True
            if tags.get("charge"):
                props["charge"] = tags["charge"]

        if tags.get("covered") and bp not in IMPLICIT_COVERED:
            props["covered"] = _booleanise(tags["covered"])

        for simple in ("capacity", "operator", "website"):
            if tags.get(simple):
                props[simple] = tags[simple]

        if tags.get("bicycle_parking:stands"):
            props["stand_type"] = tags["bicycle_parking:stands"]

        if tags.get("opening_hours"):
            props["opening_hours"] = tags["opening_hours"]

        if tags.get("toilets") == "yes":
            props["toilets"] = True

        if tags.get("authentication:combination") == "yes":
            props["authentication"].append("padlock combination")
        if tags.get("authentication:key") == "yes":
            props["authentication"].append("key")
        if tags.get("authentication:contactless") == "yes":
            props["authentication"].append("fob")
        if tags.get("authentication:app") == "yes":
            props["authentication"].append("app")

        pano_ids = _panoramax_ids(tags)
        if pano_ids:
            candidates = [_get_panoramax_data(pid) for pid in pano_ids]
            candidates = [c for c in candidates if c]
            candidates.sort(key=lambda c: (
                c["qualityScore"] if c["qualityScore"] is not None else float("inf"),
                -((c["width"] or 0) * (c["height"] or 0)),
            ))
            if candidates:
                best = candidates[0]
                props["imageHref"] = best["thumbnailHref"]
                props["imageAuthor"] = best["producer"]
                props["imageLicense"] = best["license"]
                props["imageWidth"] = best["width"]
                props["imageHeight"] = best["height"]
                props["imageBlurhash"] = best["blurhash"]

        features.append(_point_feature(lon, lat, props))

    write_geojson("parking.geojson", features)


# ── Layer: Cycleway ──────────────────────────────────────────────────────────


def _parse_width(value):
    if value is None:
        return None
    try:
        return float(str(value).replace(",", "."))
    except (ValueError, TypeError):
        return None


def _is_lane_value(value):
    return isinstance(value, str) and "lane" in value


def _is_no(value):
    return isinstance(value, str) and value.lower() in ("no", "0", "false")


def _match_side_or_default(tags):
    if _is_lane_value(tags.get("cycleway:left")): return "left"
    if _is_lane_value(tags.get("cycleway:right")): return "right"
    if _is_lane_value(tags.get("cycleway:both")): return "both"
    return "left"


def _is_generic_lane(tags):
    return (_is_lane_value(tags.get("cycleway"))
            and not _is_lane_value(tags.get("cycleway:left"))
            and not _is_lane_value(tags.get("cycleway:right"))
            and not _is_lane_value(tags.get("cycleway:both")))


def _has_single_sided_lane(tags):
    if _is_lane_value(tags.get("cycleway:both")):
        return False
    left = _is_lane_value(tags.get("cycleway:left"))
    right = _is_lane_value(tags.get("cycleway:right"))
    return left != right


def _compute_effective_oneway(tags, has_track, highway_oneway):
    lane_oneways = [tags.get(k) for k in (
        "cycleway:oneway", "cycleway:both:oneway",
        "cycleway:left:oneway", "cycleway:right:oneway",
    ) if tags.get(k) is not None]

    if any(_is_no(v) for v in lane_oneways):
        return "no"
    if lane_oneways:
        return "yes"
    if _is_generic_lane(tags):
        return "yes"
    if _is_lane_value(tags.get("cycleway:both")):
        return "yes"
    if _has_single_sided_lane(tags):
        return "yes"
    if has_track:
        return "yes"
    return highway_oneway or "no"


DEFAULT_LANE_WIDTH = 1.2


def process_cycleway(ways):
    features = []

    for w in ways:
        tags = w["tags"]
        if not _is_cycleway(tags):
            continue
        if tags.get("highway") == "construction" or tags.get("construction") is not None:
            continue

        coords = w["geometry"]
        base = {}
        if tags.get("tunnel") and tags["tunnel"] != "no":
            base["tunnel"] = "yes"
        if tags.get("oneway:bicycle"):
            base["oneway"] = tags["oneway:bicycle"]
        elif tags.get("oneway"):
            base["oneway"] = tags["oneway"]

        is_cycle_hw = tags.get("highway") == "cycleway"
        is_designated = (tags.get("highway") in ("path", "pedestrian")
                         and tags.get("bicycle") in ("designated", "yes"))
        has_track = any(tags.get(k) == "track" for k in
                        ("cycleway", "cycleway:left", "cycleway:right", "cycleway:both"))
        is_lane_way = not (is_cycle_hw or is_designated or has_track)

        eff_ow = _compute_effective_oneway(tags, has_track, base.get("oneway"))
        if "oneway" not in base:
            base["oneway"] = eff_ow

        # Paths / tracks
        if is_cycle_hw or is_designated or has_track:
            seg = (tags.get("segregated")
                   or tags.get("cycleway:segregated")
                   or tags.get("cycleway:left:segregated")
                   or tags.get("cycleway:right:segregated"))
            foot = tags.get("foot")

            def add_path(side):
                props = {**base, "kind": "path", "effectiveOneway": eff_ow}
                if side:
                    props["trackSide"] = side
                if foot in ("no", "discouraged"):
                    props["segregated"] = "yes"
                elif seg is not None:
                    props["segregated"] = seg
                f = _line_feature(coords, props)
                if f:
                    features.append(f)

            track_sides = []
            if tags.get("cycleway:both") == "track":
                track_sides.extend(["left", "right"])
            if tags.get("cycleway:left") == "track":
                track_sides.append("left")
            if tags.get("cycleway:right") == "track":
                track_sides.append("right")

            if track_sides:
                for s in track_sides:
                    add_path(s)
            else:
                add_path(None)

        # Lanes
        def add_lane(side, width):
            if side == "both":
                add_lane("left", width)
                add_lane("right", width)
                return
            lw = width if width is not None else DEFAULT_LANE_WIDTH
            props = {**base, "kind": "lane", "laneSide": side,
                     "laneWidth": lw, "effectiveOneway": eff_ow}
            f = _line_feature(coords, props)
            if f:
                features.append(f)

        if is_lane_way:
            left_w = _parse_width(tags.get("cycleway:left:width"))
            right_w = _parse_width(tags.get("cycleway:right:width"))
            both_w = _parse_width(tags.get("cycleway:both:width"))
            generic_w = _parse_width(tags.get("cycleway:width"))
            side_pref = _match_side_or_default(tags)
            plain_both = _is_generic_lane(tags)
            any_added = False

            if both_w is not None:
                add_lane("left", both_w)
                add_lane("right", both_w)
                any_added = True
            if left_w is not None:
                add_lane("left", left_w)
                any_added = True
            if right_w is not None:
                add_lane("right", right_w)
                any_added = True

            if generic_w is not None:
                both_lane = _is_lane_value(tags.get("cycleway:both")) or plain_both
                left_lane = _is_lane_value(tags.get("cycleway:left"))
                right_lane = _is_lane_value(tags.get("cycleway:right"))
                if both_lane or (left_lane and right_lane):
                    add_lane("left", generic_w)
                    add_lane("right", generic_w)
                else:
                    add_lane(side_pref, generic_w)
                any_added = True
            elif not any_added:
                both_lane = _is_lane_value(tags.get("cycleway:both")) or plain_both
                left_lane = _is_lane_value(tags.get("cycleway:left"))
                right_lane = _is_lane_value(tags.get("cycleway:right"))
                if both_lane or (left_lane and right_lane):
                    add_lane("left", None)
                    add_lane("right", None)
                elif left_lane:
                    add_lane("left", None)
                elif right_lane:
                    add_lane("right", None)
                elif _is_lane_value(tags.get("cycleway")):
                    add_lane(side_pref, None)

    write_geojson("cycleway.geojson", features)


# ── Layer: Contraflow ────────────────────────────────────────────────────────


def process_contraflow(ways):
    features = []
    for w in ways:
        tags = w["tags"]
        if not _is_contraflow(tags):
            continue
        if tags.get("construction") is not None:
            continue
        # Orient the geometry in the contraflow direction (against motor
        # traffic) so the frontend can draw direction arrows along the line.
        coords = w["geometry"]
        if tags.get("oneway") != "-1":
            coords = list(reversed(coords))
        props = {"lane": "yes" if _contraflow_has_lane(tags) else "no"}
        if tags.get("name"):
            props["name"] = tags["name"]
        f = _line_feature(coords, props)
        if f:
            features.append(f)
    write_geojson("contraflow.geojson", features)


# ── Layer: Pumps ─────────────────────────────────────────────────────────────


def process_pumps(nodes):
    features = []
    for n in nodes:
        if not _is_pump_tags(n["tags"]):
            continue
        props = {}
        for k, v in n["tags"].items():
            if (k.startswith("destroyed:") or k.startswith("disused:")
                    or k.startswith("service:bicycle:")):
                props[k] = v
        for k in ("operator", "opening_hours", "access"):
            if n["tags"].get(k):
                props[k] = n["tags"][k]
        features.append(_point_feature(n["lon"], n["lat"], {
            "osm_id": n["id"], "osm_type": n["type"],
            "last_updated": n["timestamp"], **props,
        }))
    write_geojson("pumps.geojson", features)


# ── Layer: Drinking Water ────────────────────────────────────────────────────


def process_drinking_water(nodes, ways):
    features = []

    elements = []
    for n in nodes:
        kind = _water_kind(n["tags"])
        if kind:
            elements.append((n["lon"], n["lat"], n["id"], n["type"],
                             n["tags"], n["timestamp"], kind))
    for w in ways:
        kind = _water_kind(w["tags"])
        if kind:
            lat, lon = _way_center(w)
            elements.append((lon, lat, w["id"], w["type"],
                             w["tags"], w["timestamp"], kind))

    for lon, lat, osm_id, osm_type, t, timestamp, kind in elements:
        if t.get("access") in ("private", "no"):
            continue
        if kind == "drinking_water" and t.get("drinking_water") == "no":
            continue
        props = {
            "kind": kind,
            "osm_id": osm_id,
            "osm_type": osm_type,
            "last_updated": timestamp,
        }
        for k in ("name", "operator", "bottle", "fee", "indoor",
                  "drinking_water:legal", "seasonal", "opening_hours",
                  "description"):
            if t.get(k):
                props[k] = t[k]
        if kind == "refill" and t.get("amenity"):
            props["amenity"] = t["amenity"]
        if kind == "refill" and t.get("shop"):
            props["shop"] = t["shop"]
        features.append(_point_feature(lon, lat, props))

    write_geojson("drinking_water.geojson", features)


# ── Layer: Traffic Calming ───────────────────────────────────────────────────


def process_traffic_calming(nodes, tc_ways):
    # Node → containing roads index, for deriving the road bearing at each node
    roads_by_node = {}
    for road in tc_ways:
        for nid in road["node_ids"]:
            roads_by_node.setdefault(nid, []).append(road)

    features = []
    for n in nodes:
        kind = _traffic_calming_kind(n["tags"])
        if not kind:
            continue
        props = {
            "kind": kind,
            "osm_id": n["id"], "osm_type": n["type"],
            "last_updated": n["timestamp"],
        }
        bearing = _node_bearing_from_roads(n["id"], roads_by_node.get(n["id"], []))
        if bearing is not None:
            props["bearing"] = bearing
        features.append(_point_feature(n["lon"], n["lat"], props))
    write_geojson("traffic_calming.geojson", features)


# ── Layer: Crossings ─────────────────────────────────────────────────────────


def _dist_m(a, b):
    """Equirectangular distance in metres between two (lon, lat) points."""
    cos_lat = math.cos(math.radians((a[1] + b[1]) / 2))
    return math.hypot((b[0] - a[0]) * cos_lat * 111320, (b[1] - a[1]) * 110540)


def _nearest_along(start, adjacency, targets, max_dist):
    """Nearest node in `targets` reachable from `start` within max_dist metres
    along the path network, or None."""
    best = {start: 0.0}
    heap = [(0.0, start)]
    while heap:
        d, nid = heapq.heappop(heap)
        if nid in targets:
            return nid
        if d > best[nid]:
            continue
        for nb, w in adjacency.get(nid, ()):
            nd = d + w
            if nd <= max_dist and nd < best.get(nb, math.inf):
                best[nb] = nd
                heapq.heappush(heap, (nd, nb))
    return None


def _is_crossing_way(tags):
    return ("crossing" in (tags.get("footway"), tags.get("cycleway"), tags.get("path"))
            or "crossing" in tags or "crossing_ref" in tags)


def _is_zebra(tags):
    return "zebra" in (tags.get("crossing"), tags.get("crossing_ref"),
                       tags.get("crossing:markings"))


def _has_cycle_markings(tags):
    """Markings specific to a cycle crossing: pictograms, or a coloured surface."""
    markings = (tags.get("crossing:markings") or "").split(";")
    return ("pictograms" in markings
            or ("surface" in markings and bool(tags.get("surface:colour"))))


def _give_way_faces(nid, loc, road_pos, give_ways_on, give_way_nodes):
    """A directed give way on a road through `nid`, within GIVE_WAY_MAX_DIST_M
    and before the crossing in the direction it applies to. Undirected give
    ways are ignored: they usually belong to the nearby junction instead."""
    for idx, pos in road_pos.get(nid, ()):
        for gpos, gid in give_ways_on.get(idx, ()):
            gloc, direction = give_way_nodes[gid]
            if _dist_m(gloc, loc) > GIVE_WAY_MAX_DIST_M:
                continue
            if ((direction == "forward" and gpos < pos)
                    or (direction == "backward" and gpos > pos)):
                return True
    return False


def _crossing_kind(tags, has_bicycle_signal, has_give_way):
    ref = tags.get("crossing_ref")
    crossing = tags.get("crossing")
    if ref == "toucan" or crossing == "toucan":
        return "toucan"
    if has_bicycle_signal:
        return "bicycle_signal"
    if (crossing == "traffic_signals" or tags.get("crossing:signals") == "yes"
            or ref in ("pelican", "puffin", "pegasus")):
        return "pedestrian"
    if ref in ("parallel", "tiger"):
        return "parallel"
    if tags.get("crossing:continuous") == "yes":
        return "continuous"
    # Unsignalled crossing where traffic gives way to the cycle route. Zebras
    # have give way lines too, but give cyclists no priority.
    priority = tags.get("cycleway:crossing:priority")
    if priority == "yes":
        return "cycle_priority"
    if priority != "no" and not _is_zebra(tags) and (
            has_give_way or _has_cycle_markings(tags)):
        return "cycle_priority"
    return "other"


def process_crossings(collector, sheffield_polygon):
    """Crossings where a cycleable path meets a driveable road at a shared node.

    Crossing tags come from the node, falling back to the path's crossing way
    (footway=crossing etc.) when the node itself is untagged. Bicycle traffic
    signals stand on the path a few metres before the kerb, so each is linked
    to the nearest crossing along the path and makes that crossing a
    "bicycle_signal" one rather than being drawn separately.
    """
    prepared = prep(sheffield_polygon)
    paths = collector.cycle_paths

    path_node_ids = set(collector.bike_ok_node_locs)
    for p in paths:
        path_node_ids.update(p["node_ids"])

    road_nodes = set()  # path nodes that lie on a road
    road_pos = {}      # node -> [(road idx, position in road)]
    give_ways_on = {}  # road idx -> [(position, give way node id)]
    prev_idx, pos = -1, 0
    for nid, idx in zip(collector.road_node_ids, collector.road_way_idx):
        pos = pos + 1 if idx == prev_idx else 0
        prev_idx = idx
        if nid in path_node_ids:
            road_nodes.add(nid)
            road_pos.setdefault(nid, []).append((idx, pos))
        if nid in collector.give_way_nodes:
            give_ways_on.setdefault(idx, []).append((pos, nid))

    paths_at = {}
    node_loc = dict(collector.bike_ok_node_locs)
    adjacency = {}
    # Path ends meeting at a road node (a way passing through counts twice).
    # Fewer than two means the path just stops at, or merges into, the road.
    path_ends = {}
    for p in paths:
        nids, geom = p["node_ids"], p["geometry"]
        aligned = len(nids) == len(geom)
        oneway = p["tags"].get("oneway:bicycle") or p["tags"].get("oneway")
        for i, nid in enumerate(nids):
            if nid in road_nodes:
                paths_at.setdefault(nid, []).append(p)
                path_ends[nid] = (path_ends.get(nid, 0)
                                  + (1 if i in (0, len(nids) - 1) else 2))
            if not aligned:
                continue
            node_loc[nid] = geom[i]
            if i:
                # Directed along oneway paths: a signal controls what's ahead.
                d = _dist_m(geom[i - 1], geom[i])
                if oneway != "-1":
                    adjacency.setdefault(nids[i - 1], []).append((nid, d))
                if oneway not in _ONEWAY_YES or oneway == "-1":
                    adjacency.setdefault(nid, []).append((nids[i - 1], d))

    # The end of a crossing way counts only when the way crosses no road
    # along its middle (it crosses at that end). Otherwise its ends just join
    # roads beside the one it crosses, like a dual carriageway's frontage roads.
    crossing_way_ends = set()
    for p in paths:
        nids = p["node_ids"]
        if (_is_crossing_way(p["tags"])
                and not any(nid in road_nodes for nid in nids[1:-1])):
            crossing_way_ends.update((nids[0], nids[-1]))

    # Only where the cycle route carries on across the road is it a cycle
    # crossing: the path continues past the node, a cycleable crossing way
    # ends there, or the crossing itself permits cycling (a toucan). A cycle
    # path that ends at a road, rejoining the carriageway or meeting a plain
    # footway's pedestrian crossing, isn't one.
    through = {nid for nid in road_nodes
               if path_ends.get(nid, 0) >= 2
               or nid in collector.bike_ok_node_ids
               or nid in crossing_way_ends}
    signals_at = {}
    for nid, info in collector.crossing_nodes.items():
        tags = info["tags"]
        # Signals standing on a cycle path, off the road, are for bikes even
        # without bicycle=yes, unless tagged as pedestrian crossing signals.
        implied = (tags.get("highway") == "traffic_signals"
                   and nid in adjacency and nid not in road_nodes
                   and tags.get("crossing", "no") == "no"
                   and tags.get("traffic_signals") != "pedestrian_crossing"
                   and tags.get("bicycle") != "no")
        if not (_is_bicycle_signal(tags) or implied):
            continue
        target = _nearest_along(nid, adjacency, through,
                                BICYCLE_SIGNAL_MAX_DIST_M)
        if target is not None:
            signals_at.setdefault(target, []).append(info["tags"])

    features = []
    for nid in road_nodes:
        if nid not in through:
            continue
        loc = node_loc.get(nid)
        if loc is None or not prepared.contains(Point(loc)):
            continue
        node = collector.crossing_nodes.get(nid)
        crossing_way = next((p for p in paths_at.get(nid, [])
                             if _is_crossing_way(p["tags"])), None)
        tags = {k: v for k, v in (crossing_way["tags"] if crossing_way else {}).items()
                if k.startswith("crossing")
                or k in ("cycleway:crossing:priority", "surface:colour")}
        if node:
            tags.update(node["tags"])
        signals = signals_at.get(nid, [])

        if tags.get("crossing") == "no":
            continue
        # A path that merely joins a road isn't a crossing: require crossing
        # tags, a crossing way, or bicycle signals controlling it.
        if not (signals or crossing_way or tags.get("highway") == "crossing"
                or "crossing" in tags or "crossing_ref" in tags
                or tags.get("crossing:continuous") == "yes"):
            continue

        props = {
            "kind": _crossing_kind(
                tags, bool(signals),
                _give_way_faces(nid, loc, road_pos, give_ways_on,
                                collector.give_way_nodes)),
            "osm_id": nid, "osm_type": "node",
            "last_updated": node["timestamp"] if node else None,
        }
        for k in ("crossing", "crossing_ref", "crossing:markings"):
            if tags.get(k):
                props[k] = tags[k]
        if tags.get("crossing:island") == "yes" or tags.get("crossing") == "island":
            props["island"] = True
        features.append(_point_feature(loc[0], loc[1], props))

    write_geojson("crossings.geojson", features)


# ── Layer: Counters ──────────────────────────────────────────────────────────


def process_counters(nodes):
    features = []
    for n in nodes:
        t = n["tags"]
        if t.get("man_made") != "monitoring_station" or t.get("monitoring:bicycle") != "yes":
            continue
        props = {"osm_id": n["id"], "osm_type": n["type"], "last_updated": n["timestamp"]}
        if t.get("ref"):
            props["ref"] = t["ref"]
        features.append(_point_feature(n["lon"], n["lat"], props))
    write_geojson("counters.geojson", features)


# ── Layer: Embedded Tram Tracks ──────────────────────────────────────────────


def process_embedded_tram_tracks(ways):
    features = []
    for w in ways:
        if not _is_embedded_tram(w["tags"]):
            continue
        f = _line_feature(w["geometry"], {})
        if f:
            features.append(f)
    write_geojson("embedded_tram_tracks.geojson", features)


# ── Layer: 20mph ─────────────────────────────────────────────────────────────


def process_20mph(ways):
    features = []
    for w in ways:
        if not _is_20mph(w["tags"]):
            continue
        f = _line_feature(w["geometry"], {})
        if f:
            features.append(f)
    write_geojson("20mph.geojson", features)


# ── Layer: ASL ───────────────────────────────────────────────────────────────


def _vector_bearing(dx, dy):
    rad = math.atan2(dx, dy)
    deg = math.degrees(rad)
    return (deg + 360) % 360


def _node_bearing_from_roads(node_id, road_list, dir_tag=""):
    """Derive the travel bearing at a node from the ways passing through it.

    Prefers the incoming segment, motorised roads over paths, and respects
    reversed oneways and direction=backward. Returns None if underivable.
    """
    best = None
    for road in road_list:
        nids = road["node_ids"]
        geom = road["geometry"]
        if len(geom) != len(nids):
            continue
        try:
            idx = nids.index(node_id)
        except ValueError:
            continue
        if idx >= len(geom):
            continue

        here = geom[idx]
        lat_rad = math.radians(here[1])
        cos_lat = math.cos(lat_rad) or 1

        candidates = []
        if idx > 0 and idx - 1 < len(geom):
            prev = geom[idx - 1]
            dx = (here[0] - prev[0]) * cos_lat
            dy = here[1] - prev[1]
            candidates.append({"dx": dx, "dy": dy, "len2": dx*dx + dy*dy, "type": "in"})
        if idx < len(geom) - 1:
            nxt = geom[idx + 1]
            dx = (nxt[0] - here[0]) * cos_lat
            dy = nxt[1] - here[1]
            candidates.append({"dx": dx, "dy": dy, "len2": dx*dx + dy*dy, "type": "out"})

        if not candidates:
            continue

        chosen = next((c for c in candidates if c["type"] == "in"), None)
        if chosen is None:
            chosen = max(candidates, key=lambda c: c["len2"])
        if chosen["len2"] <= 0:
            continue

        hw = road["tags"].get("highway", "")
        priority = 2 if hw in MOTORISED_HIGHWAYS else 1

        dx, dy = chosen["dx"], chosen["dy"]
        if road["tags"].get("oneway") in ("-1", "reverse"):
            # Way drawn against travel direction
            dx, dy = -dx, -dy

        if (best is None
                or priority > best["priority"]
                or (priority == best["priority"] and chosen["len2"] > best["len2"])):
            best = {"dx": dx, "dy": dy,
                    "len2": chosen["len2"], "priority": priority}

    if best is None:
        return None
    bearing = _vector_bearing(best["dx"], best["dy"])
    if dir_tag == "backward":
        bearing = (bearing + 180) % 360
    return bearing


def process_asl(nodes, asl_node_ids, ways, way_geoms, way_node_ids, sheffield_polygon):
    """Process Advanced Stop Lines. Needs ASL nodes + all ways containing them."""
    prepared = prep(sheffield_polygon)

    # Collect ASL nodes
    asl_nodes = [n for n in nodes if n["tags"].get("cycleway") == "asl"]

    # Find all ways containing ASL nodes — from collected ways AND relation member ways
    roads = []
    seen_way_ids = set()

    # From tag-matched ways
    for w in ways:
        nids = w["node_ids"]
        if any(nid in asl_node_ids for nid in nids):
            if w["id"] not in seen_way_ids:
                roads.append(w)
                seen_way_ids.add(w["id"])

    # From relation member ways (which might not be tag-matched)
    for wid, geom in way_geoms.items():
        if wid in seen_way_ids:
            continue
        nids = way_node_ids.get(wid, [])
        if any(nid in asl_node_ids for nid in nids):
            roads.append({
                "id": wid, "type": "way", "tags": {},
                "geometry": geom, "node_ids": nids, "timestamp": None,
            })
            seen_way_ids.add(wid)

    # Build node → roads index
    roads_by_node = {}
    for road in roads:
        for nid in road["node_ids"]:
            roads_by_node.setdefault(nid, []).append(road)

    # Build node location index from ways for geometry lookups
    node_locs = {}
    for road in roads:
        for i, nid in enumerate(road["node_ids"]):
            if i < len(road["geometry"]):
                node_locs[nid] = road["geometry"][i]

    features = []
    for n in asl_nodes:
        road_list = roads_by_node.get(n["id"], [])
        dir_tag = (n["tags"].get("direction") or "").lower()

        props = {"osm_id": n["id"], "osm_type": n["type"], "last_updated": n["timestamp"]}
        bearing = _node_bearing_from_roads(n["id"], road_list, dir_tag)
        if bearing is not None:
            props["bearing"] = bearing

        features.append(_point_feature(n["lon"], n["lat"], props))

    write_geojson("asl.geojson", features)


# ── Layer: Wayfinding ────────────────────────────────────────────────────────


def _format_relation_name(tags):
    if tags.get("name"):
        return tags["name"]
    if tags.get("ref") and tags.get("network"):
        return f"{tags['network']} {tags['ref']}"
    if tags.get("ref"):
        return tags["ref"]
    return None


def _ncn_label(tags):
    return tags.get("ref") or tags.get("name")


def process_wayfinding(nodes, wayfinding_rels):
    # Build route name index
    by_node = {}
    for rel in wayfinding_rels:
        tags = rel["tags"]
        if tags.get("type") != "route" and not tags.get("route"):
            continue
        is_ncn = tags.get("network") == "ncn"
        is_scn = _is_scn_route(tags)
        if is_ncn or is_scn:
            name = _ncn_label(tags)
            bucket_key = "ncn" if is_ncn else "scn"
        else:
            name = _format_relation_name(tags)
            bucket_key = "routes"
        if not name:
            continue

        for mtype, mref, _ in rel["members"]:
            if mtype != "n":
                continue
            entry = by_node.setdefault(
                mref, {"routes": [], "ncn": [], "scn": []})
            bucket = entry[bucket_key]
            if name not in bucket:
                bucket.append(name)

    for entry in by_node.values():
        for bucket in entry.values():
            bucket.sort(key=lambda s: s.lower())

    features = []
    for n in nodes:
        t = n["tags"]
        if t.get("information") not in ("guidepost", "route_marker"):
            continue
        if t.get("bicycle") != "yes":
            continue

        entry = by_node.get(n["id"], {"routes": [], "ncn": [], "scn": []})
        route_str = ";".join(entry["routes"]) or None
        ncn_str = ";".join(entry["ncn"]) or None
        scn_str = ";".join(entry["scn"]) or None

        props = {
            "information": t.get("information"),
            "destination": t.get("destination"),
            "destination_symbol": t.get("destination:symbol"),
            "osm_id": n["id"], "osm_type": n["type"],
            "lat": n["lat"], "lon": n["lon"],
            "last_updated": n["timestamp"],
            "route_relations": route_str,
            "route_relations_ncn": ncn_str,
            "route_relations_scn": scn_str,
        }
        features.append(_point_feature(n["lon"], n["lat"], props))

    write_geojson("wayfinding.geojson", features)


# ── Layer: Signs ─────────────────────────────────────────────────────────────


def process_signs(nodes):
    features = []
    for n in nodes:
        ts = n["tags"].get("traffic_sign", "")
        if not SIGN_PATTERN.search(ts):
            continue
        features.append(_point_feature(n["lon"], n["lat"], {
            "osm_id": n["id"], "osm_type": n["type"],
            "last_updated": n["timestamp"],
            "traffic_sign": ts,
        }))
    write_geojson("signs.geojson", features)


# ── Layer: Shops ─────────────────────────────────────────────────────────────

TRUTHY = frozenset(["yes", "true", "1"])
FALSY = frozenset(["no", "false", "0"])


def _service_flag(val):
    if val is None:
        return False
    v = str(val).strip().lower()
    return v in TRUTHY


def _build_address(tags):
    parts = []
    if tags.get("addr:unit"):
        parts.append(f"Unit {tags['addr:unit']}")
    if tags.get("addr:housename"):
        parts.append(tags["addr:housename"])
    num_street = " ".join(filter(None, [tags.get("addr:housenumber"), tags.get("addr:street")]))
    if num_street:
        parts.append(num_street)
    for k in ("addr:suburb", "addr:village", "addr:town", "addr:city", "addr:postcode"):
        if tags.get(k):
            parts.append(tags[k])

    seen = set()
    cleaned = []
    for p in parts:
        if not p:
            continue
        key = str(p).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        cleaned.append(p)
    return ", ".join(cleaned) or None


def _first_contact(tags, keys):
    for k in keys:
        v = tags.get(k)
        if v is not None:
            v = str(v).strip()
            if v:
                return v
    return None


def _social_url(tags, provider, keys):
    raw = _first_contact(tags, keys)
    if not raw:
        return None
    if re.match(r"^https?://", raw, re.I):
        return raw
    cleaned = raw.lstrip("@").strip()
    if not cleaned:
        return None
    if provider == "facebook":
        return f"https://www.facebook.com/{cleaned}"
    if provider == "instagram":
        return f"https://www.instagram.com/{cleaned}"
    return None


def process_shops(nodes, ways, shops_rels, way_geoms):
    elements = []
    for n in nodes:
        if _is_shop_tags(n["tags"]):
            elements.append((n["lon"], n["lat"], n["id"], n["type"],
                             n["tags"], n["timestamp"]))
    for w in ways:
        if _is_shop_tags(w["tags"]):
            lat, lon = _way_center(w)
            elements.append((lon, lat, w["id"], w["type"],
                             w["tags"], w["timestamp"]))
    for r in shops_rels:
        center = _relation_center(r, way_geoms)
        if center:
            lat, lon = center
            elements.append((lon, lat, r["id"], r["type"],
                             r["tags"], r["timestamp"]))

    features = []
    for lon, lat, osm_id, osm_type, t, timestamp in elements:
        sells_bikes = _service_flag(t.get("service:bicycle:retail"))
        sells_parts = _service_flag(t.get("service:bicycle:parts"))
        repairs = _service_flag(t.get("service:bicycle:repair"))
        diy = _service_flag(t.get("service:bicycle:diy"))
        rents = _service_flag(t.get("service:bicycle:rental"))
        recycles_tyres = _service_flag(t.get("recycling:bicycle_tyres"))
        recycles_inner_tubes = _service_flag(t.get("recycling:bicycle_inner_tubes"))

        services = []
        if sells_bikes: services.append("Sells bikes")
        if sells_parts: services.append("Sells parts")
        if repairs: services.append("Repairs bikes")
        if rents: services.append("Rents bikes")
        if diy: services.append("DIY workshop")
        if t.get("tours") == "bike": services.append("Operates bike tours")
        if recycles_tyres: services.append("Recycles tyres")
        if recycles_inner_tubes: services.append("Recycles inner tubes")

        website = _first_contact(t, ["website", "contact:website"])
        phone = _first_contact(t, ["phone", "contact:phone"])
        email = _first_contact(t, ["email", "contact:email"])
        facebook = _social_url(t, "facebook", ["facebook", "contact:facebook"])
        instagram = _social_url(t, "instagram", ["instagram", "contact:instagram"])

        raw_hours = (t.get("opening_hours") or "").strip() or None
        opening_hours = raw_hours  # raw passthrough

        props = {
            "osm_id": osm_id, "osm_type": osm_type,
            "lat": lat, "lon": lon, "last_updated": timestamp,
            "name": t.get("name") or t.get("brand") or "Bike shop",
            "shop": t.get("shop"),
            "services": services,
            "sells_bikes": sells_bikes, "sells_parts": sells_parts,
            "repairs": repairs, "diy": diy,
            "recycles_tyres": recycles_tyres,
            "recycles_inner_tubes": recycles_inner_tubes,
            "address": _build_address(t),
            "website": website, "phone": phone, "email": email,
            "facebook": facebook, "instagram": instagram,
            "opening_hours": opening_hours,
        }
        features.append(_point_feature(lon, lat, props))

    write_geojson("shops.geojson", features)


# ── Line Clipping & Merging (NCN/LCN) ───────────────────────────────────────


def _clip_line(coords, polygon):
    """Clip a coordinate list to a polygon using shapely."""
    if len(coords) < 2:
        return []
    line = LineString(coords)
    clipped = line.intersection(polygon)
    if clipped.is_empty:
        return []
    results = []
    if clipped.geom_type == "LineString":
        c = list(clipped.coords)
        if len(c) > 1:
            results.append(c)
    elif clipped.geom_type == "MultiLineString":
        for g in clipped.geoms:
            c = list(g.coords)
            if len(c) > 1:
                results.append(c)
    elif clipped.geom_type == "GeometryCollection":
        for g in clipped.geoms:
            if g.geom_type == "LineString":
                c = list(g.coords)
                if len(c) > 1:
                    results.append(c)
    return results


def _merge_lines(features, key_fn=None):
    """Merge LineStrings sharing endpoints. Groups by key_fn, which returns a
    tuple of (name, value) pairs that become the merged feature's properties."""
    by_key = {}
    for f in features:
        key = key_fn(f) if key_fn else ()
        by_key.setdefault(key, []).append(f["geometry"]["coordinates"])

    results = []
    for key, lines in by_key.items():
        segments = [{"id": i, "coords": cs} for i, cs in enumerate(lines)]
        end_index = {}

        def ck(c):
            return f"{c[0]},{c[1]}"

        for seg in segments:
            sk = ck(seg["coords"][0])
            ek = ck(seg["coords"][-1])
            end_index.setdefault(sk, []).append({"seg": seg, "end": "start"})
            end_index.setdefault(ek, []).append({"seg": seg, "end": "end"})

        used = set()
        merged = []

        for seg in segments:
            if seg["id"] in used:
                continue
            used.add(seg["id"])
            chain = list(seg["coords"])

            changed = True
            while changed:
                changed = False
                k = ck(chain[-1])
                for entry in end_index.get(k, []):
                    if entry["seg"]["id"] in used:
                        continue
                    used.add(entry["seg"]["id"])
                    if entry["end"] == "start":
                        chain.extend(entry["seg"]["coords"][1:])
                    else:
                        chain.extend(entry["seg"]["coords"][-2::-1])
                    changed = True
                    break

            changed = True
            while changed:
                changed = False
                k = ck(chain[0])
                for entry in end_index.get(k, []):
                    if entry["seg"]["id"] in used:
                        continue
                    used.add(entry["seg"]["id"])
                    if entry["end"] == "end":
                        chain = entry["seg"]["coords"][:-1] + chain
                    else:
                        chain = entry["seg"]["coords"][1:][::-1] + chain
                    changed = True
                    break

            merged.append(chain)

        props = dict(key)
        results.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "MultiLineString", "coordinates": merged},
        })

    return results


# ── Layer: NCN / LCN / SCN ──────────────────────────────────────────────────


def _build_cycle_network(rels, way_geoms, boundary_polygon, extract_refs=False,
                         way_tags=None):
    """Shared pipeline for NCN, LCN and SCN.

    Output features carry `oneway: true` where the route can only be cycled
    in one direction: the member has a forward/backward role in every
    relation that uses it (the route splits into two one-directional legs),
    or the way itself is oneway for bicycles.
    """
    way_tags = way_tags or {}

    # Build way → ref mapping and way → member roles
    way_refs = {}
    way_roles = {}
    for rel in rels:
        ref = rel["tags"].get("ref")
        for mtype, mref, mrole in rel["members"]:
            if mtype != "w":
                continue
            way_roles.setdefault(mref, []).append(mrole or "")
            if extract_refs and ref:
                way_refs.setdefault(mref, set()).add(ref)

    def is_oneway(mref):
        roles = way_roles.get(mref, [])
        if roles and all(r in ("forward", "backward") for r in roles):
            return True
        return _is_oneway_for_bicycles(way_tags.get(mref, {}))

    # Collect and deduplicate member ways
    seen = set()
    line_features = []

    # All member ways from relations
    for rel in rels:
        for mtype, mref, _ in rel["members"]:
            if mtype != "w" or mref in seen:
                continue
            seen.add(mref)
            geom = way_geoms.get(mref)
            if not geom or len(geom) < 2:
                continue
            props = {}
            if extract_refs and mref in way_refs:
                props["ref"] = ", ".join(sorted(way_refs[mref]))
            if is_oneway(mref):
                props["oneway"] = True
            line_features.append(_line_feature(geom, props))

    line_features = [f for f in line_features if f]

    # Clip to boundary
    clipped = []
    for f in line_features:
        segments = _clip_line(f["geometry"]["coordinates"], boundary_polygon)
        for seg_coords in segments:
            if len(seg_coords) > 1:
                clipped.append({
                    "type": "Feature",
                    "properties": dict(f["properties"]),
                    "geometry": {"type": "LineString", "coordinates": seg_coords},
                })

    if not clipped:
        return []

    # Merge, keeping oneway and two-way sections as separate features
    def key_fn(f):
        p = f["properties"]
        key = []
        if extract_refs and p.get("ref"):
            key.append(("ref", p["ref"]))
        if p.get("oneway"):
            key.append(("oneway", True))
        return tuple(key)

    return _merge_lines(clipped, key_fn)


def process_ncn(ncn_rels, way_geoms, way_tags, boundary_polygon):
    features = _build_cycle_network(
        ncn_rels, way_geoms, boundary_polygon, extract_refs=True,
        way_tags=way_tags)
    write_geojson("ncn.geojson", features)


def process_scn(scn_rels, way_geoms, way_tags, boundary_polygon):
    """Sheffield Cycle Network: one merged line set per route relation.

    Each relation is built separately so every feature carries exactly one
    `ref` (a way shared by two routes is emitted once per route). The
    frontend has a layer per route filtered on that ref.
    """
    features = []
    for rel in scn_rels:
        ref = rel["tags"]["ref"].strip()
        feats = _build_cycle_network(
            [rel], way_geoms, boundary_polygon, extract_refs=True,
            way_tags=way_tags)
        for f in feats:
            f["properties"]["ref"] = ref
            f["properties"]["osm_id"] = rel["id"]
            f["properties"]["osm_type"] = "relation"
            if rel["tags"].get("name"):
                f["properties"]["name"] = rel["tags"]["name"]
            if rel["tags"].get("colour"):
                f["properties"]["colour"] = rel["tags"]["colour"]
        features.extend(feats)
    write_geojson("scn.geojson", features)


def process_lcn(lcn_rels, way_geoms, way_tags, lcn_standalone_ways,
                boundary_polygon):
    # Add standalone lcn=yes ways to way_geoms
    for w in lcn_standalone_ways:
        if w["id"] not in way_geoms:
            way_geoms[w["id"]] = w["geometry"]
            way_tags[w["id"]] = w["tags"]

    # Create synthetic relation members for standalone ways
    standalone_ids = {w["id"] for w in lcn_standalone_ways}
    existing_member_ids = set()
    for rel in lcn_rels:
        for mtype, mref, _ in rel["members"]:
            if mtype == "w":
                existing_member_ids.add(mref)

    # Add standalone ways as members of a dummy relation
    extra_members = [("w", wid, "") for wid in standalone_ids - existing_member_ids]
    if extra_members:
        lcn_rels = list(lcn_rels) + [{
            "id": -1, "type": "relation", "tags": {},
            "members": extra_members, "timestamp": None,
        }]

    features = _build_cycle_network(
        lcn_rels, way_geoms, boundary_polygon, extract_refs=False,
        way_tags=way_tags)
    write_geojson("lcn.geojson", features)


# ── Main ─────────────────────────────────────────────────────────────────────


def main():
    print("=== fetch_osm.py ===")

    # Download PBF
    download_pbf()
    pbf = str(PBF_PATH)

    # Pass 1: scan relations
    print("Pass 1: scanning relations...")
    scanner = RelationScanner()
    scanner.apply_file(pbf)
    print(f"  boundary rels: {len(scanner.boundary_rels)}")
    print(f"  NCN rels: {len(scanner.ncn_rels)}")
    print(f"  LCN rels: {len(scanner.lcn_rels)}")
    print(f"  SCN rels: {len(scanner.scn_rels)}")
    print(f"  wayfinding rels: {len(scanner.wayfinding_rels)}")
    print(f"  needed way IDs: {len(scanner.needed_way_ids)}")

    # Pass 2: full read
    print("Pass 2: collecting data...")
    collector = DataCollector(scanner)
    collector.apply_file(pbf, locations=True)
    print(f"  nodes: {len(collector.nodes)}")
    print(f"  ways: {len(collector.ways)}")
    print(f"  way geoms: {len(collector.way_geoms)}")
    print(f"  ASL nodes: {len(collector.asl_node_ids)}")

    # Build boundary polygon
    print("Building boundary polygon...")
    boundary_polygon, boundary_feature = build_boundary_polygon(
        scanner.boundary_rels, collector.way_geoms
    )

    # Filter to Sheffield
    print("Filtering to Sheffield...")
    nodes, ways = filter_to_sheffield(
        collector.nodes, collector.ways, boundary_polygon
    )
    print(f"  Sheffield nodes: {len(nodes)}")
    print(f"  Sheffield ways: {len(ways)}")

    # Process layers
    print("Processing layers...")
    process_boundary(boundary_feature)
    process_parking(nodes, ways, scanner.parking_rels, collector.way_geoms)
    process_cycleway(ways)
    process_contraflow(ways)
    process_pumps(nodes)
    process_drinking_water(nodes, ways)
    process_traffic_calming(nodes, collector.tc_ways)
    process_crossings(collector, boundary_polygon)
    process_counters(nodes)
    process_embedded_tram_tracks(ways)
    process_20mph(ways)
    process_asl(nodes, collector.asl_node_ids, ways + collector.asl_ways,
                collector.way_geoms, collector.way_node_ids, boundary_polygon)
    process_wayfinding(nodes, scanner.wayfinding_rels)
    process_signs(nodes)
    process_shops(nodes, ways, scanner.shops_rels, collector.way_geoms)
    process_ncn(scanner.ncn_rels, collector.way_geoms, collector.way_tags,
                boundary_polygon)
    process_scn(scanner.scn_rels, collector.way_geoms, collector.way_tags,
                boundary_polygon)

    lcn_standalone = [w for w in ways if w["tags"].get("lcn") == "yes"]
    process_lcn(scanner.lcn_rels, collector.way_geoms, collector.way_tags,
                lcn_standalone, boundary_polygon)

    # Save cache
    _save_cache()

    print("=== Done ===")


if __name__ == "__main__":
    main()
