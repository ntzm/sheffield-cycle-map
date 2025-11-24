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
  node["information"="guidepost"]["bicycle"="yes"](area.searchArea);
  node["information"="route_marker"]["bicycle"="yes"](area.searchArea);
)->.guideposts;

(
  .guideposts;
  rel(bn.guideposts)["type"="route"];
);
out body meta;
`;

async function main() {
  const data = await runOverpass(query);

  const routeNameIndex = buildRouteNameIndex(data.elements || []);

  const features = (data.elements || [])
    .map((e) =>
      asPoint(e, {
        information: e.tags?.information,
        destination: e.tags?.destination,
        destination_symbol: e.tags?.["destination:symbol"],
        osm_id: e.id,
        osm_type: e.type,
        lat: e.lat,
        lon: e.lon,
        last_updated: e.timestamp,
        route_relations: formatRouteList(routeNameIndex.get(e.id)?.routes),
        route_relations_ncn: formatRouteList(routeNameIndex.get(e.id)?.ncn),
      }),
    )
    .filter(Boolean);

  writeGeojson("wayfinding.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

function buildRouteNameIndex(elements) {
  const byNode = new Map();

  for (const el of elements) {
    if (el.type !== "relation") continue;
    if (el.tags?.type !== "route" && !el.tags?.route) continue;

    const tags = el.tags || {};
    const isNcn = tags.network === "ncn";
    const name = isNcn ? ncnLabel(tags) : formatRelationName(tags);
    if (!name) continue;

    for (const member of el.members || []) {
      if (member.type !== "node") continue;
      const entry = byNode.get(member.ref) || { routes: [], ncn: [] };
      const bucket = isNcn ? entry.ncn : entry.routes;
      if (!bucket.includes(name)) bucket.push(name);
      byNode.set(member.ref, entry);
    }
  }

  for (const [ref, entry] of byNode.entries()) {
    entry.routes.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    entry.ncn.sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
    byNode.set(ref, entry);
  }

  return byNode;
}

function formatRelationName(tags) {
  if (!tags) return null;
  if (tags.name) return tags.name;
  if (tags.ref && tags.network) return `${tags.network} ${tags.ref}`;
  if (tags.ref) return tags.ref;
  return null;
}

function ncnLabel(tags) {
  if (!tags) return null;
  if (tags.ref) return tags.ref;
  if (tags.name) return tags.name;
  return null;
}

function formatRouteList(names) {
  if (!names || !names.length) return undefined;
  return names.join(";");
}
