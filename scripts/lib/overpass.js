import fs from "fs";
import path from "path";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
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
  { retries = 3, backoffMs = 1500 } = {},
) {
  let attempt = 0;
  let lastErr;
  const body = "data=" + encodeURIComponent(query.trim());
  while (attempt <= retries) {
    try {
      const res = await fetch(OVERPASS_URL, { method: "POST", body });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(
          `Overpass error ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
        );
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt === retries) break;
      const delay = backoffMs * Math.pow(2, attempt);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
  throw lastErr;
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
