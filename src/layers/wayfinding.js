import { addSvgImage } from '../utils/icons.js';
import { placeLayer } from '../utils/layer-order.js';

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
}
