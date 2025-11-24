import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asPoint,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
node["man_made"="monitoring_station"]["monitoring:bicycle"="yes"](area.searchArea);
out body meta;
`;

async function main() {
  const data = await runOverpass(query);
  const features = (data.elements || [])
    .map((e) => asPoint(e, e.tags?.ref ? { ref: e.tags.ref } : {}))
    .filter(Boolean);

  writeGeojson("counters.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
