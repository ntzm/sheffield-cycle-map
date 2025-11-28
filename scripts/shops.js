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
  const parts = [tags['addr:housename'], tags['addr:housenumber'], tags['addr:street'], tags['addr:city'], tags['addr:postcode']];
  const str = parts.filter(Boolean).join(', ');
  return str || undefined;
}

const isYes = (v) => v === 'yes' || v === 'true';
const isNo = (v) => v === 'no' || v === 'false';

function serviceFlag(tagVal) {
  if (isYes(tagVal)) return true;
  if (isNo(tagVal)) return false;
  return false; // only explicit yes counts
}

async function main() {
  const data = await runOverpass(query);
  const features = (data.elements || [])
    .map(e => {
      const coords = toPoint(e);
      if (!coords) return null;
      const t = e.tags || {};
      const sellsBikes = serviceFlag(t['service:bicycle:retail']);
      const sellsParts = serviceFlag(t['service:bicycle:parts']);
      const repairs = serviceFlag(t['service:bicycle:repair']);
      const diy = serviceFlag(t['service:bicycle:diy']);
      return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coords },
        properties: {
          id: `${e.type}/${e.id}`,
          name: t.name || t.brand || 'Bike shop',
          shop: t.shop,
          services: [
            sellsBikes ? 'Sells bikes' : null,
            sellsParts ? 'Sells parts' : null,
            repairs ? 'Repairs bikes' : null,
            diy ? 'DIY workshop' : null
          ].filter(Boolean),
          sells_bikes: sellsBikes,
          sells_parts: sellsParts,
          repairs,
          diy,
          address: buildAddress(t),
          website: t.website,
          phone: t.phone || t.contact_phone,
          email: t.email || t.contact_email,
          opening_hours: t.opening_hours
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
