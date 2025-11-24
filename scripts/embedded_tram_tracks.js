import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asLineString,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:40];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
way[~"^embedded_rails(:lanes|:forward|:backward)?$"~"tram"](area.searchArea);
out geom;
`;

async function main() {
  const data = await runOverpass(query);

  const features = (data.elements || [])
    .map((e) => asLineString(e))
    .filter(Boolean);

  writeGeojson("embedded_tram_tracks.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
