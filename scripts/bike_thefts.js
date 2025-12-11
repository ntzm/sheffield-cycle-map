import fs from "fs";
import path from "path";
import { DATA_DIR } from "./lib/overpass.js";
import { cachedJsonFetch } from "./lib/cache.js";

const START_MONTH = { year: 2022, month: 10 }; // inclusive, YYYY, M
const BASE_URL = "https://data.police.uk/api";
const BOUNDARY_PATH = path.join(DATA_DIR, "boundary.geojson");

function simplifyRing(ring, maxPoints = 30) {
  if (ring.length <= maxPoints) return ring;
  const out = [];
  const step = Math.ceil((ring.length - 1) / (maxPoints - 1));
  for (let i = 0; i < ring.length; i += step) {
    out.push(ring[i]);
  }
  // Ensure last point is the final coordinate (closed ring input is expected)
  if (
    out[out.length - 1][0] !== ring[ring.length - 1][0] ||
    out[out.length - 1][1] !== ring[ring.length - 1][1]
  ) {
    out.push(ring[ring.length - 1]);
  }
  return out;
}

function readBoundaryPoly() {
  const gj = JSON.parse(fs.readFileSync(BOUNDARY_PATH, "utf8"));
  const geom = gj.features?.[0]?.geometry;
  if (!geom) throw new Error("boundary.geojson missing geometry");
  const rings =
    geom.type === "Polygon"
      ? geom.coordinates
      : geom.type === "MultiPolygon"
        ? geom.coordinates[0]
        : null;
  if (!rings || !rings.length) throw new Error("boundary.geojson has no rings");
  // Use the first outer ring, simplified to keep URL short; API expects lat,lon pairs.
  const ring = simplifyRing(rings[0]);
  return ring.map(([lon, lat]) => `${lat},${lon}`).join(":");
}

function monthList() {
  const list = [];
  const now = new Date();
  // Use previous month to avoid partially published current month
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  end.setUTCMonth(end.getUTCMonth() - 1);
  const start = new Date(Date.UTC(START_MONTH.year, START_MONTH.month - 1, 1));
  for (let d = start; d <= end; d.setUTCMonth(d.getUTCMonth() + 1)) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    list.push(`${y}-${m}`);
  }
  return list;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const poly = readBoundaryPoly();
  const months = monthList();
  const features = [];

  console.log(
    `Fetching bicycle thefts for ${months.length} months (${months[0]} … ${months[months.length - 1]})`,
  );

  for (const [idx, month] of months.entries()) {
    const url = `${BASE_URL}/crimes-street/bicycle-theft?poly=${encodeURIComponent(poly)}&date=${month}`;
    try {
      const rows = await cachedJsonFetch(url);
      for (const r of rows) {
        const lat = Number(r.location?.latitude);
        const lon = Number(r.location?.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        features.push({
          type: "Feature",
          geometry: { type: "Point", coordinates: [lon, lat] },
          properties: {
            id: r.id,
            month,
            street: r.location?.street?.name,
            outcome: r.outcome_status?.category,
            outcome_date: r.outcome_status?.date,
            lat,
            lon,
            context: r.context,
            location_subtype: r.location_subtype,
            location_type: r.location_type,
            persistent_id: r.persistent_id,
          },
        });
      }
      console.log(
        `Month ${month}: ${rows.length} records (total ${features.length})`,
      );
    } catch (err) {
      console.error(`Month ${month} failed: ${err.message}`);
    }
    // Be polite to the API
    if (idx !== months.length - 1) await sleep(400);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, "bike_thefts.geojson"),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  console.log(`Wrote ${features.length} → bike_thefts.geojson`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
