#!/usr/bin/env python3
"""
Fetch OSM data for Sheffield Cycle Map.

Downloads South Yorkshire PBF from Geofabrik, extracts Sheffield boundary,
filters to Sheffield area, and outputs GeoJSON files for each map layer.

Replaces: boundary.js, parking.js, cycleway.js, pumps.js, counters.js,
embedded_tram_tracks.js, asl.js, wayfinding.js, signs.js, shops.js,
ncn.js, lcn.js
"""

import hashlib
import json
import math
import os
import re
import subprocess
import sys
import time
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

HANGAR_OPERATORS = frozenset(["Falco", "Cyclehoop"])
IMPLICIT_COVERED = frozenset(["shed", "building"])

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

        # LCN
        if tags.get("route") == "bicycle" and tags.get("network") == "lcn":
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


class DataCollector(osmium.SimpleHandler):
    """Pass 2: full read collecting all needed data."""

    def __init__(self, scan):
        super().__init__()
        self.scan = scan

        self.nodes = []
        self.ways = []
        self.way_geoms = {}    # way_id -> [(lon, lat), ...]
        self.way_node_ids = {} # way_id -> [node_id, ...]
        self.asl_node_ids = set()

    def node(self, n):
        tags = dict(n.tags)
        if not tags:
            return
        try:
            lon, lat = n.location.lon, n.location.lat
        except osmium.InvalidLocationError:
            return

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

        # Store geometry for relation member resolution
        if w.id in self.scan.needed_way_ids:
            self.way_geoms[w.id] = geom
            self.way_node_ids[w.id] = node_ids

        matched = False
        if tags.get("amenity") == "bicycle_parking":
            matched = True
        if _is_cycleway(tags):
            matched = True
        if _is_embedded_tram(tags):
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

        if matched:
            self.ways.append({
                "id": w.id, "type": "way",
                "tags": tags, "timestamp": _ts(w),
                "geometry": geom, "node_ids": node_ids,
            })


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
                if seg is not None:
                    props["segregated"] = seg
                elif foot in ("no", "discouraged"):
                    props["segregated"] = "yes"
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


# ── Layer: Pumps ─────────────────────────────────────────────────────────────


def process_pumps(nodes):
    features = []
    for n in nodes:
        if not _is_pump_tags(n["tags"]):
            continue
        props = {}
        for k, v in n["tags"].items():
            if k.startswith("destroyed:") or k.startswith("disused:"):
                props[k] = v
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


def process_traffic_calming(nodes):
    features = []
    for n in nodes:
        kind = _traffic_calming_kind(n["tags"])
        if not kind:
            continue
        features.append(_point_feature(n["lon"], n["lat"], {
            "kind": kind,
            "osm_id": n["id"], "osm_type": n["type"],
            "last_updated": n["timestamp"],
        }))
    write_geojson("traffic_calming.geojson", features)


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


# ── Layer: ASL ───────────────────────────────────────────────────────────────


def _vector_bearing(dx, dy):
    rad = math.atan2(dx, dy)
    deg = math.degrees(rad)
    return (deg + 360) % 360


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
        if not road_list:
            features.append(_point_feature(n["lon"], n["lat"], {
                "osm_id": n["id"], "osm_type": n["type"],
                "last_updated": n["timestamp"],
            }))
            continue

        dir_tag = (n["tags"].get("direction") or "").lower()

        best = None
        for road in road_list:
            nids = road["node_ids"]
            geom = road["geometry"]
            if len(geom) != len(nids):
                continue
            try:
                idx = nids.index(n["id"])
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

            if (best is None
                    or priority > best["priority"]
                    or (priority == best["priority"] and chosen["len2"] > best["len2"])):
                best = {"dx": chosen["dx"], "dy": chosen["dy"],
                        "len2": chosen["len2"], "priority": priority}

        props = {"osm_id": n["id"], "osm_type": n["type"], "last_updated": n["timestamp"]}
        if best:
            bearing = _vector_bearing(best["dx"], best["dy"])
            if dir_tag == "backward":
                bearing = (bearing + 180) % 360
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
        name = _ncn_label(tags) if is_ncn else _format_relation_name(tags)
        if not name:
            continue

        for mtype, mref, _ in rel["members"]:
            if mtype != "n":
                continue
            entry = by_node.setdefault(mref, {"routes": [], "ncn": []})
            bucket = entry["ncn"] if is_ncn else entry["routes"]
            if name not in bucket:
                bucket.append(name)

    for entry in by_node.values():
        entry["routes"].sort(key=lambda s: s.lower())
        entry["ncn"].sort(key=lambda s: s.lower())

    features = []
    for n in nodes:
        t = n["tags"]
        if t.get("information") not in ("guidepost", "route_marker"):
            continue
        if t.get("bicycle") != "yes":
            continue

        entry = by_node.get(n["id"], {"routes": [], "ncn": []})
        route_str = ";".join(entry["routes"]) or None
        ncn_str = ";".join(entry["ncn"]) or None

        props = {
            "information": t.get("information"),
            "destination": t.get("destination"),
            "destination_symbol": t.get("destination:symbol"),
            "osm_id": n["id"], "osm_type": n["type"],
            "lat": n["lat"], "lon": n["lon"],
            "last_updated": n["timestamp"],
            "route_relations": route_str,
            "route_relations_ncn": ncn_str,
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
    """Merge LineStrings sharing endpoints. Groups by key_fn."""
    by_key = {}
    for f in features:
        key = key_fn(f) if key_fn else ""
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

        props = {"ref": key} if key else {}
        results.append({
            "type": "Feature",
            "properties": props,
            "geometry": {"type": "MultiLineString", "coordinates": merged},
        })

    return results


# ── Layer: NCN / LCN ────────────────────────────────────────────────────────


def _build_cycle_network(rels, way_geoms, boundary_polygon, extract_refs=False):
    """Shared pipeline for NCN and LCN."""
    # Build way → ref mapping
    way_refs = {}
    if extract_refs:
        for rel in rels:
            ref = rel["tags"].get("ref")
            if not ref or not rel["members"]:
                continue
            for mtype, mref, _ in rel["members"]:
                if mtype == "w":
                    way_refs.setdefault(mref, set()).add(ref)

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

    # Merge
    if extract_refs:
        key_fn = lambda f: f["properties"].get("ref", "")
        return _merge_lines(clipped, key_fn)
    else:
        return _merge_lines(clipped)


def process_ncn(ncn_rels, way_geoms, boundary_polygon):
    features = _build_cycle_network(ncn_rels, way_geoms, boundary_polygon, extract_refs=True)
    write_geojson("ncn.geojson", features)


def process_lcn(lcn_rels, way_geoms, lcn_standalone_ways, boundary_polygon):
    # Add standalone lcn=yes ways to way_geoms
    for w in lcn_standalone_ways:
        if w["id"] not in way_geoms:
            way_geoms[w["id"]] = w["geometry"]

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

    features = _build_cycle_network(lcn_rels, way_geoms, boundary_polygon, extract_refs=False)
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
    process_pumps(nodes)
    process_drinking_water(nodes, ways)
    process_traffic_calming(nodes)
    process_counters(nodes)
    process_embedded_tram_tracks(ways)
    process_asl(nodes, collector.asl_node_ids, ways,
                collector.way_geoms, collector.way_node_ids, boundary_polygon)
    process_wayfinding(nodes, scanner.wayfinding_rels)
    process_signs(nodes)
    process_shops(nodes, ways, scanner.shops_rels, collector.way_geoms)
    process_ncn(scanner.ncn_rels, collector.way_geoms, boundary_polygon)

    lcn_standalone = [w for w in ways if w["tags"].get("lcn") == "yes"]
    process_lcn(scanner.lcn_rels, collector.way_geoms, lcn_standalone, boundary_polygon)

    # Save cache
    _save_cache()

    print("=== Done ===")


if __name__ == "__main__":
    main()
