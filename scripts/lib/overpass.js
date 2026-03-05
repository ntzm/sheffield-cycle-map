import fs from "fs";
import path from "path";
import { withRetry } from "./retry.js";

const OVERPASS_SERVERS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
];
export const SHEFFIELD_AREA_ID = 3600106956;
export const SHEFFIELD_REL_ID = SHEFFIELD_AREA_ID - 3600000000;
export const DATA_DIR = path.join(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "data",
);

export async function runOverpass(
  query,
  { retries = 3, backoffMs = 5000 } = {},
) {
  const body = "data=" + encodeURIComponent(query.trim());
  return withRetry(async (attempt) => {
    const url = OVERPASS_SERVERS[attempt % OVERPASS_SERVERS.length];
    const t0 = Date.now();
    console.log(`  attempt ${attempt + 1}/${retries + 1} → ${url}`);
    try {
      const res = await fetch(url, {
        method: "POST",
        body,
        headers: { "User-Agent": "sheffield-cycle-map (https://github.com/ntzm/sheffield-cycle-map)" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Overpass error ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
        );
      }
      const json = await res.json();
      const elements = json.elements?.length ?? 0;
      console.log(`  ✓ ${elements} elements in ${Date.now() - t0}ms`);
      return json;
    } catch (err) {
      console.log(`  ✗ ${err.message} (${Date.now() - t0}ms)`);
      throw err;
    }
  }, { retries, backoffMs });
}

export function writeGeojson(filename, features) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, filename),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  console.log(`Wrote ${features.length} → ${filename}`);
}

export function asLineString(e, props = {}) {
  if (e.type !== "way" || !Array.isArray(e.geometry) || e.geometry.length < 2)
    return null;
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: e.geometry.map((p) => [p.lon, p.lat]),
    },
    properties: props,
  };
}

export function asPoint(e, props = {}) {
  if (e.type !== "node" || !Number.isFinite(e.lat) || !Number.isFinite(e.lon))
    return null;
  const baseProps = {
    osm_id: e.id,
    osm_type: e.type,
    last_updated: e.timestamp,
  };
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [e.lon, e.lat] },
    properties: { ...baseProps, ...props },
  };
}
