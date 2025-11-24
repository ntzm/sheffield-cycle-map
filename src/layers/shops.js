import maplibregl from 'maplibre-gl';
import { createPopupContainer, buildStandardFooter } from '../utils/popup.js';
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
    } else if (/\bph\s*off\b/i.test(raw)) {
      lines.push('Bank holidays: Closed');
    }
    return lines.join('\n');
  } catch (e) {
    console.warn('opening_hours parse failed', raw, e);
    return raw;
  }
}

function buildShopPopup(feature) {
  const props = feature.properties;
  const { root, heading } = createPopupContainer(props.name);
  if (props.website) {
    const link = document.createElement('a');
    link.href = props.website;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'popup__title-link';
    link.textContent = props.name;
    heading.textContent = '';
    heading.appendChild(link);
  }
  const servicesArr = normalizeServices(props.services);

  const chips = [];
  if (props.sells_bikes) chips.push('Sells bikes');
  if (props.sells_parts) chips.push('Sells parts');
  if (props.repairs) chips.push('Repairs bikes');
  if (props.diy) chips.push('DIY workshop');
  if (!chips.length && servicesArr.length) {
    servicesArr.slice(0, 4).forEach(s => chips.push(s));
  }
  if (chips.length) {
    const wrap = document.createElement('div');
    wrap.className = 'popup-chips';
    chips.forEach(text => {
      const chip = document.createElement('span');
      chip.className = 'popup-chip popup-chip--info';
      chip.textContent = text;
      wrap.appendChild(chip);
    });
    root.appendChild(wrap);
  }

  if (props.address) {
    const meta = document.createElement('div');
    meta.className = 'popup__meta';
    meta.textContent = props.address;
    root.appendChild(meta);
  }

  const contacts = [];
  if (props.phone) contacts.push({ href: `tel:${String(props.phone).replace(/\s+/g, '')}`, text: props.phone });
  if (props.email) contacts.push({ href: `mailto:${props.email}`, text: props.email });
  if (props.facebook) contacts.push({ href: props.facebook, text: 'Facebook' });
  if (props.instagram) contacts.push({ href: props.instagram, text: 'Instagram' });
  if (contacts.length) {
    const contactBox = document.createElement('div');
    contactBox.className = 'popup-links';
    contacts.forEach((c, idx) => {
      const link = document.createElement('a');
      link.href = c.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = c.text;
      contactBox.appendChild(link);
      if (idx < contacts.length - 1) {
        const sep = document.createElement('span');
        sep.textContent = ' '; // space separator only
        contactBox.appendChild(sep);
      }
    });
    root.appendChild(contactBox);
  }
  const opening = formatOpeningHours(props.opening_hours);
  if (opening) {
    const row = document.createElement('div');
    const list = document.createElement('div');
    list.className = 'shop-hours';
    String(opening).split('\n').forEach(line => {
      const sepIdx = line.indexOf(':');
      let label = '';
      let value = line;
      if (sepIdx > -1) {
        label = line.slice(0, sepIdx).trim();
        value = line.slice(sepIdx + 1).trim();
      }
      const labelEl = document.createElement('div');
      labelEl.className = 'shop-hours__label';
      labelEl.textContent = label;
      const valueEl = document.createElement('div');
      valueEl.className = 'shop-hours__value';
      valueEl.textContent = value;
      list.appendChild(labelEl);
      list.appendChild(valueEl);
    });
    row.className = 'popup__card';
    row.appendChild(list);
    root.appendChild(row);
  }

  const footerRow = buildStandardFooter(feature);
  root.appendChild(footerRow);
  return root;
}

function attachShopInteractions(map, layerId) {
  map.on('click', layerId, (e) => {
    const feature = e.features[0];
    const coords = feature.geometry.coordinates.slice();
    const popup = new maplibregl.Popup().setLngLat(coords).setDOMContent(buildShopPopup(feature));
    showPopup(popup, layerId).addTo(map);
  });

  map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
}

export async function addShopsLayer(map, urlState) {
  const iconId = 'shop-icon';
  const svg = await fetch('icons/shop.svg').then(r => r.text());
  await addSvgImage(map, iconId, svg, { pixelRatio: 2 });

  map.addSource('shops', {
    type: 'geojson',
    data: `data/shops.geojson`
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
