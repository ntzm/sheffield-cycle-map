import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asPoint,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
node["traffic_sign"~"GB:(618\\.(2|3)|619|951|953|955|956(\\.1)??|957R?|960\\.(1|2)|965|966|967|968\\.1)"](area.searchArea);
out body meta;
`;
// TODO:
// pedestrian zone 618.2 618.3 Q
// 619 no motors

async function main() {
  const data = await runOverpass(query);

  const features = (data.elements || [])
    .map((e) => {
      const props = {
        traffic_sign: e.tags.traffic_sign,
      };
      return asPoint(e, props);
    })
    .filter(Boolean);

  writeGeojson("signs.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
