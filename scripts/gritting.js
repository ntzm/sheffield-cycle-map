import { writeGeojson } from "./lib/overpass.js";
import { cachedJsonFetch } from "./lib/cache.js";

// Sheffield winter maintenance network (Primary + Secondary routes).
// Data source: Sheffield City Council "Priority gritting routes" (OGL),
// served via ArcGIS REST MapServer layers 25 (primary) and 24 (secondary).
// We query the REST endpoints first; if they fail, we fall back to Hub/OGC.

const PRIMARY_URLS = [
  "https://sheffieldcitycouncil.cloud.esriuk.com/server/rest/services/AGOL/OpenData/MapServer/25/query?where=1%3D1&outFields=*&f=geojson",
  "https://hub.arcgis.com/api/v3/datasets/fea855e6ecde4051835c4cf059bcbd23_25/downloads/data?format=geojson&spatialRefId=4326&where=1=1",
  "https://opendata.arcgis.com/datasets/fea855e6ecde4051835c4cf059bcbd23_25.geojson",
];

const SECONDARY_URLS = [
  "https://sheffieldcitycouncil.cloud.esriuk.com/server/rest/services/AGOL/OpenData/MapServer/24/query?where=1%3D1&outFields=*&f=geojson",
  "https://hub.arcgis.com/api/v3/datasets/cc9bfe40946a458cbaa4622b6af5ac08_24/downloads/data?format=geojson&spatialRefId=4326&where=1=1",
  "https://opendata.arcgis.com/datasets/cc9bfe40946a458cbaa4622b6af5ac08_24.geojson",
];

async function fetchFirst(urls, label) {
  let lastErr;
  for (const url of urls) {
    try {
      const json = await cachedJsonFetch(url);
      if (json?.type !== "FeatureCollection") {
        throw new Error("Unexpected payload (expected FeatureCollection)");
      }
      console.log(`Fetched ${label} from ${url}`);
      return json;
    } catch (err) {
      lastErr = err;
      console.warn(`Failed ${label} from ${url}: ${err.message}`);
    }
  }
  throw lastErr;
}

function tagFeatures(fc, priority) {
  return (fc.features || [])
    .filter((f) => f && f.geometry)
    .map((f) => ({
      type: "Feature",
      geometry: f.geometry,
      properties: { ...(f.properties || {}), priority },
    }));
}

async function main() {
  const [primaryFc, secondaryFc] = await Promise.all([
    fetchFirst(PRIMARY_URLS, "primary"),
    fetchFirst(SECONDARY_URLS, "secondary"),
  ]);

  const features = [
    ...tagFeatures(primaryFc, "primary"),
    ...tagFeatures(secondaryFc, "secondary"),
  ];

  writeGeojson("gritting.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
