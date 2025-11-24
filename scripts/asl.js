import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asPoint,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:60];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
  node["cycleway"="asl"](area.searchArea);
)->.aslnodes;
way(bn.aslnodes)(area.searchArea)->.roads;
(.aslnodes; .roads;);
out geom;
`;

function vectorBearing(dx, dy) {
  const rad = Math.atan2(dx, dy); // bearing clockwise from north
  const deg = (rad * 180) / Math.PI;
  return (deg + 360) % 360;
}

const MOTORISED_HIGHWAYS = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "living_street",
  "service",
]);

function nodeBearing(node, roadsByNode) {
  const roads = roadsByNode.get(node.id);
  if (!roads || roads.length === 0) return null;

  const dirTag = (node.tags?.direction || "").toLowerCase();
  const hasDir = dirTag === "forward" || dirTag === "backward";

  let best = null;

  for (const road of roads) {
    if (!Array.isArray(road.nodes) || !Array.isArray(road.geometry)) continue;
    const idx = road.nodes.indexOf(node.id);
    if (idx === -1 || !road.geometry[idx]) continue;

    const geom = road.geometry;
    const here = geom[idx];

    // Prefer inbound (approach) segment if available, else fallback to longest.
    let candidates = [];
    const latRad = (here.lat * Math.PI) / 180;
    const cosLat = Math.cos(latRad) || 1;

    if (idx > 0 && geom[idx - 1]) {
      const dxPrev = (here.lon - geom[idx - 1].lon) * cosLat;
      const dyPrev = here.lat - geom[idx - 1].lat;
      candidates.push({
        dx: dxPrev,
        dy: dyPrev,
        len2: dxPrev * dxPrev + dyPrev * dyPrev,
        type: "in",
      });
    }
    if (idx < geom.length - 1 && geom[idx + 1]) {
      const dxNext = (geom[idx + 1].lon - here.lon) * cosLat;
      const dyNext = geom[idx + 1].lat - here.lat;
      candidates.push({
        dx: dxNext,
        dy: dyNext,
        len2: dxNext * dxNext + dyNext * dyNext,
        type: "out",
      });
    }
    if (!candidates.length) continue;

    // Pick inbound if present, otherwise longest.
    let chosen =
      candidates.find((c) => c.type === "in") ||
      candidates.reduce((a, b) => (b.len2 > a.len2 ? b : a));
    if (chosen.len2 <= 0) continue;

    const priority = MOTORISED_HIGHWAYS.has(road.tags?.highway) ? 2 : 1;

    if (
      !best ||
      priority > best.priority ||
      (priority === best.priority && chosen.len2 > best.len2)
    ) {
      best = { dx: chosen.dx, dy: chosen.dy, len2: chosen.len2, priority };
    }
  }

  if (!best) return null;
  let bearing = vectorBearing(best.dx, best.dy);

  if (hasDir && dirTag === "backward") {
    bearing = (bearing + 180) % 360;
  }

  return bearing;
}

async function main() {
  const data = await runOverpass(query);
  const elements = data.elements || [];
  const nodes = elements.filter((e) => e.type === "node");
  const roads = elements.filter((e) => e.type === "way");

  const roadsByNode = new Map();
  for (const w of roads) {
    if (!Array.isArray(w.nodes)) continue;
    for (const nid of w.nodes) {
      if (!roadsByNode.has(nid)) roadsByNode.set(nid, []);
      roadsByNode.get(nid).push(w);
    }
  }

  const features = nodes
    .map((n) => {
      const bearing = nodeBearing(n, roadsByNode);
      const props = {};
      if (bearing !== null) props.bearing = bearing;
      return asPoint(n, props);
    })
    .filter(Boolean);

  writeGeojson("asl.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
