import { runOverpass, writeGeojson, SHEFFIELD_AREA_ID } from './lib/overpass.js';

const query = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
(
  nwr[~"^service:bicycle"~"^yes$"]["amenity"!="bicycle_repair_station"]["destroyed:amenity"!="bicycle_repair_station"]["disused:amenity"!="bicycle_repair_station"](area.searchArea);
  nwr["shop"="bicycle"](area.searchArea);
  );
out center;
`;

const TRUTHY = new Set(['yes', 'true', '1']);
const FALSY = new Set(['no', 'false', '0']);

function toPoint(e) {
  if (e.type === 'node' && Number.isFinite(e.lon) && Number.isFinite(e.lat)) {
    return [e.lon, e.lat];
  }
  if (e.center && Number.isFinite(e.center.lon) && Number.isFinite(e.center.lat)) {
    return [e.center.lon, e.center.lat];
  }
  return null;
}

function buildAddress(tags) {
  const parts = [
    tags['addr:housename'],
    tags['addr:housenumber'],
    tags['addr:street'],
    tags['addr:city'],
    tags['addr:postcode']
  ];
  const seen = new Set();
  const cleaned = parts.filter((part) => {
    if (!part) return false;
    const key = String(part).trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const str = cleaned.join(', ');
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
  const sellsBikes = serviceFlag(tags['service:bicycle:retail']);
  const sellsParts = serviceFlag(tags['service:bicycle:parts']);
  const repairs = serviceFlag(tags['service:bicycle:repair']);
  const diy = serviceFlag(tags['service:bicycle:diy']);
  const services = [
    sellsBikes ? 'Sells bikes' : null,
    sellsParts ? 'Sells parts' : null,
    repairs ? 'Repairs bikes' : null,
    diy ? 'DIY workshop' : null
  ].filter(Boolean);
  return { sellsBikes, sellsParts, repairs, diy, services };
}

async function main() {
  const data = await runOverpass(query);
  const features = (data.elements || [])
    .map(e => {
      const coords = toPoint(e);
      if (!coords) return null;
      const t = e.tags || {};
      const {
        sellsBikes,
        sellsParts,
        repairs,
        diy,
        services
      } = summariseServices(t);
      const website = (t.website || '').trim() || undefined;
      const phone = (t.phone || t.contact_phone || '').trim() || undefined;
      const email = (t.email || t.contact_email || '').trim() || undefined;
      const openingHours = (t.opening_hours || '').trim() || undefined;

      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          id: `${e.type}/${e.id}`,
          name: t.name || t.brand || 'Bike shop',
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
          opening_hours: openingHours
        }
      };
    })
    .filter(Boolean);

  writeGeojson('shops.geojson', features);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
