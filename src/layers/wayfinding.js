import maplibregl from 'maplibre-gl';
import { addSvgImage } from '../utils/icons.js';
import { placeLayer } from '../utils/layer-order.js';
import { createPopupContainer } from '../utils/popup.js';
import { showPopup } from '../utils/popup-singleton.js';

function parseDestinations(destinationString) {
  if (!destinationString || typeof destinationString !== 'string') return [];
  return destinationString
    .split('|')
    .map(part => part.split(';').map(d => d.trim()).filter(Boolean))
    .filter(group => group.length);
}

function buildGuidepostPopup(props = {}) {
  const { root } = createPopupContainer('Guidepost');
  const fingers = parseDestinations(props.destination);

  if (!fingers.length) {
    const row = document.createElement('div');
    row.textContent = 'No destinations tagged yet.';
    root.appendChild(row);
    return root;
  }

  const list = document.createElement('ul');
  list.className = 'guidepost-popup__destinations';
  fingers.forEach((destinations) => {
    const li = document.createElement('li');
    li.textContent = destinations.join(', ');
    list.appendChild(li);
  });

  root.appendChild(list);
  return root;
}

export async function addWayfinding(map, urlState, cacheBust) {
  const GUIDEPOST_SVG = await fetch('icons/guidepost.svg').then(r => r.text());
  const ROUTE_MARKER_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
      <g fill="none" fill-rule="evenodd">
        <rect x="2.5" y="2.5" width="21" height="21" rx="3" fill="#0047aa" stroke="#0f172a" stroke-width="1.2" />
        <path d="M9 13h8" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" />
        <path d="M14 10l4 3-4 3" fill="none" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    </svg>`;

  await Promise.all([
    addSvgImage(map, 'guidepost-icon', GUIDEPOST_SVG, { pixelRatio: 2 }),
    addSvgImage(map, 'route-marker-icon', ROUTE_MARKER_SVG, { pixelRatio: 2 })
  ]);

  map.addSource('wayfinding', {
    type: 'geojson',
    data: `data/wayfinding.geojson`
  });

  map.addLayer({
    id: 'wayfinding-guidepost-layer',
    type: 'symbol',
    source: 'wayfinding',
    filter: ['!=', ['get', 'information'], 'route_marker'],
    layout: {
      'icon-image': 'guidepost-icon',
      'icon-anchor': 'bottom',
      'icon-size': 0.1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': false,
      visibility: urlState.visibleLayers.size === 0 ? 'none' : (urlState.visibleLayers.has('wayfinding-guidepost-layer') ? 'visible' : 'none')
    }
  });

  map.addLayer({
    id: 'wayfinding-route-layer',
    type: 'symbol',
    source: 'wayfinding',
    filter: ['==', ['get', 'information'], 'route_marker'],
    layout: {
      'icon-image': 'route-marker-icon',
      'icon-size': 1.1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': false,
      visibility: urlState.visibleLayers.size === 0 ? 'none' : (urlState.visibleLayers.has('wayfinding-route-layer') ? 'visible' : 'none')
    }
  });

  placeLayer(map, 'wayfinding-route-layer');
  placeLayer(map, 'wayfinding-guidepost-layer');

  map.on('click', 'wayfinding-guidepost-layer', (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const popup = new maplibregl.Popup()
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(buildGuidepostPopup(feature.properties));
    showPopup(popup).addTo(map);
  });

  map.on('mouseenter', 'wayfinding-guidepost-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'wayfinding-guidepost-layer', () => { map.getCanvas().style.cursor = ''; });
}
