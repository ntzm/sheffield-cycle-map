import { SHEFFIELD_AREA_ID } from "./lib/overpass.js";
import { buildCycleNetwork } from "./lib/cycle-network.js";

const query = `
[out:json][timeout:60];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
relation["route"="bicycle"]["network"="lcn"](area.searchArea);
way["lcn"="yes"](area.searchArea);
);
(._;>;);
out geom;
`;

buildCycleNetwork(query, "lcn.geojson").catch((err) => {
  console.error(err);
  process.exit(1);
});
