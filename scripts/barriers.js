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
  node["barrier"~"^(motor)?cycle_barrier$"](area.searchArea);
);
out body;
`;

async function main() {
  const data = await runOverpass(query);

  const features = (data.elements || []).map((e) => asPoint(e)).filter(Boolean);

  writeGeojson("barriers.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
