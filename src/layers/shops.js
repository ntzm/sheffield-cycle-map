import maplibregl from 'maplibre-gl';
import { createPopupContainer, addRow } from '../utils/popup.js';
import { showPopup } from '../utils/popup-singleton.js';
import { placeLayer } from '../utils/layer-order.js';
import { initialVisible } from '../utils/state.js';
import { SimpleOpeningHours } from 'simple-opening-hours';
import { addSvgImage } from '../utils/icons.js';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_KEYS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];

function normalizeServices(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) { /* ignore */ }
    return raw.split(',').map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function formatOpeningHours(raw) {
  if (!raw) return undefined;
  try {
    const oh = new SimpleOpeningHours(raw);
    const table = oh.getTable();
    const lines = DAY_KEYS.map((key, idx) => {
      const slots = table[key] || [];
      const text = slots.length ? slots.join(', ') : 'Closed';
      return `${DAY_NAMES[idx]}: ${text}`;
    });
    const ph = table.ph || [];
    if (ph.length) {
      lines.push(`Bank holidays: ${ph.join(', ')}`);
    } else {
      lines.push('Bank holidays: Unknown');
    }
    return lines.join('\n');
  } catch (e) {
    console.warn('opening_hours parse failed', raw, e);
    return raw;
  }
}

function addLinkRow(root, label, href, text) {
  if (!href || !text) return;
  const row = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = `${label}:`;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(' '));
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  row.appendChild(link);
  root.appendChild(row);
}

function buildShopPopup(props = {}) {
  const { root } = createPopupContainer(props.name || 'Bike shop');
  const servicesArr = normalizeServices(props.services);
  const services = servicesArr.length ? servicesArr.join(', ') : 'Not specified';
  addRow(root, 'Services', services);
  addRow(root, 'Address', props.address);
  if (props.phone) {
    const telHref = `tel:${String(props.phone).replace(/\s+/g, '')}`;
    addLinkRow(root, 'Phone', telHref, props.phone);
  }
  if (props.email) {
    addLinkRow(root, 'Email', `mailto:${props.email}`, props.email);
  }
  if (props.website) {
    addLinkRow(root, 'Website', props.website, props.website);
  }
  const opening = formatOpeningHours(props.opening_hours);
  if (opening) {
    const row = document.createElement('div');
    const list = document.createElement('div');
    list.style.margin = '4px 0 0';
    list.style.display = 'grid';
    list.style.gridTemplateColumns = 'auto 1fr';
    list.style.columnGap = '8px';
    list.style.rowGap = '2px';
    String(opening).split('\n').forEach(line => {
      const sepIdx = line.indexOf(':');
      let label = '';
      let value = line;
      if (sepIdx > -1) {
        label = line.slice(0, sepIdx).trim();
        value = line.slice(sepIdx + 1).trim();
      }
      const labelEl = document.createElement('div');
      labelEl.style.fontWeight = '700';
      labelEl.textContent = label;
      const valueEl = document.createElement('div');
      valueEl.textContent = value;
      list.appendChild(labelEl);
      list.appendChild(valueEl);
    });
    row.appendChild(list);
    root.appendChild(row);
  }
  return root;
}

function attachShopInteractions(map, layerId) {
  map.on('click', layerId, (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const coords = feature.geometry.coordinates.slice();
    const props = feature.properties || {};
    const popup = new maplibregl.Popup().setLngLat(coords).setDOMContent(buildShopPopup(props));
    showPopup(popup).addTo(map);
  });

  map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
}

export async function addShopsLayer(map, urlState, cacheBust = '') {
  const iconId = 'shop-icon';
  const suffix = cacheBust ? `?v=${cacheBust}` : '';
  const svg = await fetch(`icons/shop.svg${suffix}`).then(r => r.text());
  await addSvgImage(map, iconId, svg, { pixelRatio: 2 });

  map.addSource('shops', {
    type: 'geojson',
    data: `data/shops.geojson${suffix}`
  });

  map.addLayer({
    id: 'shops-layer',
    type: 'symbol',
    source: 'shops',
    layout: {
      'icon-image': iconId,
      'icon-size': 0.04,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': false,
      visibility: initialVisible(urlState, 'shops-layer', false) ? 'visible' : 'none'
    }
  });

  placeLayer(map, 'shops-layer');
  attachShopInteractions(map, 'shops-layer');
}
