import path from "path";
import { runOverpass, writeGeojson } from "./lib/overpass.js";

// Fetch the Sheffield administrative boundary and write it to public/data/boundary.geojson
// as a Polygon or MultiPolygon. We stitch the outer ways returned by Overpass.

function stitchRings(ways) {
  const rings = [];
  const unused = new Map(
    ways.map((w) => [w.id, w.geometry.map((p) => [p.lon, p.lat])]),
  );

  while (unused.size) {
    // start a ring
    const [startId, coords] = unused.entries().next().value;
    unused.delete(startId);
    const ring = [...coords];

    let extended = true;
    while (extended) {
      extended = false;
      for (const [id, c] of unused) {
        const first = c[0];
        const last = c[c.length - 1];
        const ringStart = ring[0];
        const ringEnd = ring[ring.length - 1];

        if (almostEqualCoords(ringEnd, first)) {
          ring.push(...c.slice(1));
          unused.delete(id);
          extended = true;
          break;
        } else if (almostEqualCoords(ringEnd, last)) {
          ring.push(...c.slice(0, -1).reverse());
          unused.delete(id);
          extended = true;
          break;
        } else if (almostEqualCoords(ringStart, last)) {
          ring.unshift(...c.slice(0, -1));
          unused.delete(id);
          extended = true;
          break;
        } else if (almostEqualCoords(ringStart, first)) {
          ring.unshift(...c.slice(1).reverse());
          unused.delete(id);
          extended = true;
          break;
        }
      }
    }

    // ensure closed
    if (!almostEqualCoords(ring[0], ring[ring.length - 1])) {
      ring.push(ring[0]);
    }
    rings.push(ring);
  }
  return rings;
}

function almostEqualCoords(a, b, eps = 1e-6) {
  return Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;
}

async function main() {
  const query = `
  [out:json][timeout:120];
  relation["name"="Sheffield"]["boundary"="administrative"]["admin_level"~"^(6|7|8)$"];
  (._;>;);
  out geom;
  `;

  const data = await runOverpass(query);
  const relations = data.elements.filter((e) => e.type === "relation");
  if (!relations.length)
    throw new Error("Relation not found in Overpass response");
  const relation =
    relations.find((r) => r.tags?.admin_level === "8") || relations[0];

  // collect outer ways
  const ways = data.elements.filter((e) => e.type === "way");
  const outerWays = [];
  for (const member of relation.members || []) {
    if (member.type === "way" && member.role === "outer") {
      const way = ways.find((w) => w.id === member.ref);
      if (way && way.geometry && way.geometry.length > 1) outerWays.push(way);
    }
  }

  if (!outerWays.length) throw new Error("No outer ways found for boundary");

  const rings = stitchRings(outerWays);
  const geom =
    rings.length === 1
      ? { type: "Polygon", coordinates: [rings[0]] }
      : { type: "MultiPolygon", coordinates: rings.map((r) => [r]) };

  writeGeojson("boundary.geojson", [
    { type: "Feature", properties: {}, geometry: geom },
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
