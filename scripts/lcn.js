import fs from "fs";
import path from "path";
import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asLineString,
  DATA_DIR,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:60];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
relation["route"="bicycle"]["network"="lcn"](area.searchArea);
way["lcn"="yes"](area.searchArea);
);
(._;>;);
out geom;
`;

async function main() {
  const data = await runOverpass(query);

  const boundary = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, "boundary.geojson"), "utf8"),
  ).features[0].geometry;

  const features = (data.elements || [])
    .map((e) => asLineString(e))
    .filter(Boolean)
    .flatMap((f) => clipLineToPolygon(f, boundary))
    .filter((f) => f.geometry.coordinates.length > 1);

  writeGeojson("lcn.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

function clipLineToPolygon(feature, polygonGeom) {
  const coords = feature.geometry.coordinates;
  const rings = getRings(polygonGeom);
  if (!rings.length) return [];

  const segments = [];
  let current = null;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const inside0 = pointInPolygon(p0, polygonGeom);
    const inside1 = pointInPolygon(p1, polygonGeom);
    const hits = segmentPolyIntersections(p0, p1, rings);

    if (inside0 && inside1) {
      if (!current) current = [p0];
      current.push(p1);
    } else if (inside0 && !inside1) {
      if (!current) current = [p0];
      if (hits.length) {
        current.push(hits[0].pt);
        segments.push(current);
        current = null;
      }
    } else if (!inside0 && inside1) {
      if (hits.length) {
        current = [hits[hits.length - 1].pt, p1];
      }
    } else {
      if (hits.length >= 2) {
        const first = hits[0].pt;
        const last = hits[hits.length - 1].pt;
        segments.push([first, last]);
      }
    }
  }
  if (current && current.length > 1) segments.push(current);

  return segments.map((coords) => ({
    type: "Feature",
    properties: feature.properties,
    geometry: { type: "LineString", coordinates: coords },
  }));
}

function getRings(geom) {
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}

function pointInPolygon(pt, geom) {
  const [x, y] = pt;
  const rings = getRings(geom);
  let inside = false;
  for (const ring of rings) {
    let j = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
      const xi = ring[i][0],
        yi = ring[i][1];
      const xj = ring[j][0],
        yj = ring[j][1];
      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
      if (intersect) inside = !inside;
      j = i;
    }
  }
  return inside;
}

function segmentPolyIntersections(p0, p1, rings) {
  const hits = [];
  rings.forEach((ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const q0 = ring[i];
      const q1 = ring[i + 1];
      const res = segmentIntersect(p0, p1, q0, q1);
      if (res) hits.push(res);
    }
  });
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

function segmentIntersect(p0, p1, q0, q1) {
  const x1 = p0[0],
    y1 = p0[1],
    x2 = p1[0],
    y2 = p1[1];
  const x3 = q0[0],
    y3 = q0[1],
    x4 = q1[0],
    y4 = q1[1];
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  const px = x1 + t * (x2 - x1);
  const py = y1 + t * (y2 - y1);
  return { pt: [px, py], t };
}
