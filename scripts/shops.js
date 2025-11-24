import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
} from "./lib/overpass.js";

const query = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
  nwr[~"^service:bicycle"~"^yes$"]["amenity"!="bicycle_repair_station"]["destroyed:amenity"!="bicycle_repair_station"]["disused:amenity"!="bicycle_repair_station"](area.searchArea);
  nwr["shop"="bicycle"](area.searchArea);
  );
out center meta;
`;

const TRUTHY = new Set(["yes", "true", "1"]);
const FALSY = new Set(["no", "false", "0"]);

function toPoint(e) {
  if (e.type === "node") return [e.lon, e.lat];
  return [e.center.lon, e.center.lat];
}

function buildAddress(tags) {
  const parts = [];

  if (tags["addr:unit"]) parts.push(`Unit ${tags["addr:unit"]}`);
  if (tags["addr:housename"]) parts.push(tags["addr:housename"]);

  const numberStreet = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  if (numberStreet) parts.push(numberStreet);

  if (tags["addr:suburb"]) parts.push(tags["addr:suburb"]);
  if (tags["addr:village"]) parts.push(tags["addr:village"]);
  if (tags["addr:town"]) parts.push(tags["addr:town"]);
  if (tags["addr:city"]) parts.push(tags["addr:city"]);
  if (tags["addr:postcode"]) parts.push(tags["addr:postcode"]);
  const seen = new Set();
  const cleaned = parts.filter((part) => {
    if (!part) return false;
    const key = String(part).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const str = cleaned.join(", ");
  return str || undefined;
}

function serviceFlag(tagVal) {
  if (tagVal === undefined || tagVal === null) return false;
  const val = String(tagVal).trim().toLowerCase();
  if (TRUTHY.has(val)) return true;
  if (FALSY.has(val)) return false;
  return false; // only explicit yes counts
}

function summariseServices(tags) {
  const sellsBikes = serviceFlag(tags["service:bicycle:retail"]);
  const sellsParts = serviceFlag(tags["service:bicycle:parts"]);
  const repairs = serviceFlag(tags["service:bicycle:repair"]);
  const diy = serviceFlag(tags["service:bicycle:diy"]);
  const rents = serviceFlag(tags["service:bicycle:rental"]);
  const services = [
    sellsBikes ? "Sells bikes" : null,
    sellsParts ? "Sells parts" : null,
    repairs ? "Repairs bikes" : null,
    rents ? "Rents bikes" : null,
    diy ? "DIY workshop" : null,
    tags["tours"] === "bike" ? "Operates bike tours" : null,
  ].filter(Boolean);
  return { sellsBikes, sellsParts, repairs, diy, services };
}

function firstContact(tags, keys) {
  for (const key of keys) {
    const raw = tags[key];
    if (raw === undefined || raw === null) continue;
    const val = String(raw).trim();
    if (val) return val;
  }
  return undefined;
}

function socialUrl(tags, provider, keys) {
  const raw = firstContact(tags, keys);
  if (!raw) return undefined;
  if (/^https?:\/\//i.test(raw)) return raw;
  const cleaned = raw.replace(/^@/, "").trim();
  if (!cleaned) return undefined;
  if (provider === "facebook") return `https://www.facebook.com/${cleaned}`;
  if (provider === "instagram") return `https://www.instagram.com/${cleaned}`;
  return undefined;
}

async function main() {
  const data = await runOverpass(query);
  const features = (data.elements || [])
    .map((e) => {
      const coords = toPoint(e);
      if (!coords) return null;
      const t = e.tags || {};
      const { sellsBikes, sellsParts, repairs, diy, services } =
        summariseServices(t);
      const website = firstContact(t, ["website", "contact:website"]);
      const phone = firstContact(t, ["phone", "contact:phone"]);
      const email = firstContact(t, ["email", "contact:email"]);
      const facebook = socialUrl(t, "facebook", [
        "facebook",
        "contact:facebook",
      ]);
      const instagram = socialUrl(t, "instagram", [
        "instagram",
        "contact:instagram",
      ]);
      const openingHours = (t.opening_hours || "").trim() || undefined;

      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: coords },
        properties: {
          osm_id: e.id,
          osm_type: e.type,
          lat: coords[1],
          lon: coords[0],
          last_updated: e.timestamp,
          name: t.name || t.brand || "Bike shop",
          shop: t.shop,
          services,
          sells_bikes: sellsBikes,
          sells_parts: sellsParts,
          repairs,
          diy,
          address: buildAddress(t),
          website,
          phone,
          email,
          facebook,
          instagram,
          opening_hours: openingHours,
        },
      };
    })
    .filter(Boolean);

  writeGeojson("shops.geojson", features);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
