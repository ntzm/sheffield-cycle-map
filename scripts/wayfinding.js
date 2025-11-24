import { runOverpass, writeGeojson, SHEFFIELD_AREA_ID, asPoint } from './lib/overpass.js';

const query = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
  node["information"="guidepost"]["bicycle"="yes"](area.searchArea);
  node["information"="route_marker"]["bicycle"="yes"](area.searchArea);
);
out body;
`;

async function main() {
  const data = await runOverpass(query);

  const features = (data.elements || [])
    .map(e => asPoint(e, { information: e.tags?.information }))
    .filter(Boolean);

  writeGeojson('wayfinding.geojson', features);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
