// Download and filter DfT STATS19 collisions (2020–2024) to Sheffield bbox, keeping any collision
// involving a pedal cycle. Cyclist casualties are counted via casualty↔vehicle linkage; if a pedal
// cycle is involved and the collision is fatal but no linked cyclist casualty, we infer one.
// Output: data/dft_collisions.geojson

import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { cachedJsonFetch } from "./lib/cache.js";
import proj4 from "proj4";
const years = ["2024", "2023", "2022", "2021", "2020"];
const ROOT = path.resolve(import.meta.dirname, "..");
const DATA_DIR = path.join(ROOT, "public", "data");
const outGeojson = path.join(DATA_DIR, "dft_collisions.geojson");

// Sheffield boundary polygon
const boundary = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, "boundary.geojson"), "utf8"),
);

// OSGB36 to WGS84
proj4.defs(
  "EPSG:27700",
  "+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy " +
    "+towgs84=446.448,125.157,542.06,0.1502,0.2470,0.8421,-20.4894 +units=m +no_defs",
);
const osgb = proj4("EPSG:27700");
const wgs84 = proj4("EPSG:4326");

function log(msg) {
  console.log(`[dft] ${msg}`);
}

function pointInPolygon(pt, poly) {
  // pt: [lon, lat], poly: GeoJSON Polygon or MultiPolygon
  const x = pt[0],
    y = pt[1];

  const inRing = (coords) => {
    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const xi = coords[i][0],
        yi = coords[i][1];
      const xj = coords[j][0],
        yj = coords[j][1];
      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  };

  if (poly.type === "Polygon") {
    const [outer, ...holes] = poly.coordinates;
    if (!inRing(outer)) return false;
    for (const hole of holes) {
      if (inRing(hole)) return false;
    }
    return true;
  }
  if (poly.type === "MultiPolygon") {
    return poly.coordinates.some((rings) => {
      const [outer, ...holes] = rings;
      if (!inRing(outer)) return false;
      for (const hole of holes) if (inRing(hole)) return false;
      return true;
    });
  }
  return false;
}

async function fetchCsv(url) {
  const text = await cachedJsonFetch(url, { responseType: "text" });
  return parse(text, { columns: true });
}

async function processYear(year) {
  const collisionsUrl = `https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-collision-${year}.csv`;
  const casualtiesUrl = `https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-casualty-${year}.csv`;
  const vehiclesUrl = `https://data.dft.gov.uk/road-accidents-safety-data/dft-road-casualty-statistics-vehicle-${year}.csv`;

  log(`Fetching collisions ${year}`);
  const accidentsPromise = fetchCsv(collisionsUrl);
  log(`Fetching casualties ${year}`);
  const casualtiesPromise = fetchCsv(casualtiesUrl);
  log(`Fetching vehicles ${year}`);
  const vehiclesPromise = fetchCsv(vehiclesUrl);

  const [accidents, casualties, vehicles] = await Promise.all([
    accidentsPromise,
    casualtiesPromise,
    vehiclesPromise,
  ]);

  if (!accidents || !casualties || !vehicles) {
    log(`Skipping ${year} (missing data)`);
    return [];
  }

  const casualtyCounts = casualties.reduce((acc, c) => {
    acc[c.collision_index] = (acc[c.collision_index] || 0) + 1;
    return acc;
  }, {});

  const pedalCycleCollisionIds = new Set(
    vehicles
      .filter((v) => String(v.vehicle_type) === "1") // 1 = pedal cycle
      .map((v) => v.collision_index),
  );

  const otherVehiclesByCollision = vehicles.reduce((acc, v) => {
    const type = String(v.vehicle_type);
    if (type === "1") return acc; // skip pedal cycles (we already know they exist)
    const set = acc[v.collision_index] || (acc[v.collision_index] = new Set());
    set.add(type);
    return acc;
  }, {});

  // Map collision -> set of pedal-cycle vehicle references
  const pedalCycleRefsByCollision = vehicles.reduce((acc, v) => {
    if (String(v.vehicle_type) !== "1") return acc;
    const set = acc[v.collision_index] || (acc[v.collision_index] = new Set());
    set.add(v.vehicle_reference);
    return acc;
  }, {});

  // Recompute cyclist casualties: casualties whose vehicle_reference belongs to a pedal-cycle vehicle in that collision
  const cyclistCounts = casualties.reduce((acc, c) => {
    const refs = pedalCycleRefsByCollision[c.collision_index];
    if (refs && refs.has(c.vehicle_reference)) {
      acc[c.collision_index] = (acc[c.collision_index] || 0) + 1;
    }
    return acc;
  }, {});

  const fatalCollisionIds = new Set(
    accidents
      .filter(
        (a) =>
          String(a.collision_severity) === "1" ||
          String(a.enhanced_severity_collision) === "1",
      )
      .map((a) => a.collision_index),
  );

  const features = [];
  for (const a of accidents) {
    if (!pedalCycleCollisionIds.has(a.collision_index)) continue; // require a pedal cycle vehicle involved
    let lat = parseFloat(a.latitude);
    let lon = parseFloat(a.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      const e = parseFloat(a.location_easting_osgr);
      const n = parseFloat(a.location_northing_osgr);
      if (Number.isFinite(e) && Number.isFinite(n)) {
        const [lonConv, latConv] = proj4(osgb, wgs84, [e, n]);
        lon = lonConv;
        lat = latConv;
      }
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!pointInPolygon([lon, lat], boundary.features[0].geometry)) continue;

    let cyclistCasualties = cyclistCounts[a.collision_index] || 0;
    let inferredCyclist = false;
    if (
      cyclistCasualties === 0 &&
      pedalCycleCollisionIds.has(a.collision_index) &&
      fatalCollisionIds.has(a.collision_index)
    ) {
      // fallback inference only if no linked cyclist casualty but pedal cycle + fatal
      cyclistCasualties = 1;
      inferredCyclist = true;
    }

    const props = {
      year,
      accident_index: a.collision_index,
      date: a.date,
      time: a.time,
      severity: a.collision_severity,
      casualties:
        casualtyCounts[a.collision_index] ||
        Number(a.number_of_casualties) ||
        0,
      cyclist_casualties: cyclistCasualties,
      cyclist_casualties_inferred: inferredCyclist,
      vehicles: Number(a.number_of_vehicles),
      road_type: a.road_type,
      light_conditions: a.light_conditions,
      weather: a.weather_conditions,
      urban_or_rural: a.urban_or_rural_area,
      other_vehicle_types: formatOtherVehicles(
        otherVehiclesByCollision[a.collision_index],
      ),
    };

    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: [lon, lat] },
      properties: props,
    });
  }
  log(`Year ${year}: kept ${features.length}`);
  return features;
}

function vehicleTypeLabel(code) {
  const map = {
    2: "Motorcycle ≤50cc",
    3: "Motorcycle ≤125cc",
    4: "Motorcycle ≤500cc",
    5: "Motorcycle >500cc",
    8: "Taxi/Private hire",
    9: "Car",
    10: "Minibus",
    11: "Bus/Coach",
    16: "Horse",
    17: "Agricultural",
    18: "Tram",
    19: "Van ≤3.5t",
    20: "Goods 3.5–7.5t",
    21: "Goods >7.5t",
    22: "Mobility scooter",
    23: "E-motorcycle/scooter",
    90: "Other motor vehicle",
    97: "Motor unknown",
    98: "Goods unknown weight",
    99: "Unknown vehicle",
  };
  return map[String(code)] || null;
}

function formatOtherVehicles(set) {
  if (!set) return undefined;
  const labels = Array.from(set).map(vehicleTypeLabel).filter(Boolean);
  labels.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  if (!labels.length) return undefined;
  return labels.join("; ");
}

async function main() {
  const allFeatures = [];
  for (const y of years) {
    try {
      const feats = await processYear(y);
      allFeatures.push(...feats);
    } catch (e) {
      console.error(`[dft] ${y} failed:`, e.message);
      if (e.cause) console.error("cause:", e.cause);
    }
  }

  const geojson = { type: "FeatureCollection", features: allFeatures };
  fs.writeFileSync(outGeojson, JSON.stringify(geojson));
  log(`Wrote ${allFeatures.length} features -> ${outGeojson}`);
}

main();
