import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asPoint,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
  node["traffic_calming"](area.searchArea);
);
out body;
`;

async function main() {
  const data = await runOverpass(query);

  const features = (data.elements || [])
    .map((e) => asPoint(e, { traffic_calming: e.tags?.traffic_calming }))
    .filter(Boolean);

  writeGeojson("traffic_calming.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
