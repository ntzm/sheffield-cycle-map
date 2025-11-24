import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asPoint,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
node[~"^(disused:|destroyed:)?amenity$"~"^bicycle_repair_station$"](area.searchArea);
out body meta;
`;

async function main() {
  const data = await runOverpass(query);

  const features = (data.elements || [])
    .map((e) => {
      const props = {};
      const tags = e.tags || {};
      for (const k of Object.keys(tags)) {
        if (k.startsWith("destroyed:") || k.startsWith("disused:"))
          props[k] = tags[k];
      }
      return asPoint(e, props);
    })
    .filter(Boolean);

  writeGeojson("pumps.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
