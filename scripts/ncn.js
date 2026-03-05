import { SHEFFIELD_AREA_ID } from "./lib/overpass.js";
import { buildCycleNetwork } from "./lib/cycle-network.js";

const query = `
[out:json][timeout:60];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
relation["route"="bicycle"]["network"="ncn"](area.searchArea);
(._;>;);
out geom;
`;

buildCycleNetwork(query, "ncn.geojson", { extractRefs: true }).catch((err) => {
  console.error(err);
  process.exit(1);
});
