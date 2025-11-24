import maplibregl from 'maplibre-gl';
import { addSvgImage } from '../utils/icons.js';
import { showPopup } from '../utils/popup-singleton.js';
import { placeLayer } from '../utils/layer-order.js';

export async function addCollisions(map, urlState, cacheBust) {
  const fatalSvg = await fetch('icons/collision-fatal.svg').then(r => r.text());
  const seriousSvg = await fetch('icons/collision-serious.svg').then(r => r.text());
  const slightSvg = await fetch('icons/collision-slight.svg').then(r => r.text());

  await Promise.all([
    addSvgImage(map, 'collision-triangle-fatal', fatalSvg, { pixelRatio: 2 }),
    addSvgImage(map, 'collision-triangle-serious', seriousSvg, { pixelRatio: 2 }),
    addSvgImage(map, 'collision-triangle-slight', slightSvg, { pixelRatio: 2 })
  ]);

  map.addSource('dft-collisions', {
    type: 'geojson',
    data: `data/dft_collisions.geojson`
  });

  map.addLayer({
    id: 'dft-collisions-layer',
    type: 'symbol',
    source: 'dft-collisions',
    layout: {
      'icon-image': [
        'case',
        ['==', ['get', 'severity'], '1'], 'collision-triangle-fatal',
        ['==', ['get', 'severity'], '2'], 'collision-triangle-serious',
        'collision-triangle-slight'
      ],
      'icon-size': 0.7,
      'icon-allow-overlap': true,
      'icon-ignore-placement': false,
      visibility: urlState.visibleLayers.size === 0 ? 'none' : (urlState.visibleLayers.has('dft-collisions-layer') ? 'visible' : 'none')
    }
  });

  placeLayer(map, 'dft-collisions-layer');

  map.on('click', 'dft-collisions-layer', (e) => {
    const f = e.features && e.features[0];
    if (!f) return;
    const p = f.properties || {};

    const severityMap = { '1': 'Fatal', '2': 'Serious', '3': 'Slight' };
    const weatherMap = {
      '1': 'Fine, no high winds', '2': 'Raining, no high winds', '3': 'Snowing, no high winds',
      '4': 'Fine, high winds', '5': 'Raining, high winds', '6': 'Snowing, high winds',
      '7': 'Fog or mist', '8': 'Other', '9': 'Unknown'
    };

    const root = document.createElement('div');
    root.style.maxWidth = '260px';
    root.style.fontSize = '13px';
    root.style.lineHeight = '1.4';

    const heading = document.createElement('div');
    heading.style.fontWeight = '700';
    heading.textContent = p.date && p.time ? `${p.date} ${p.time}` : (p.date || 'Collision');
    root.appendChild(heading);

    const addRow = (label, value) => {
      if (!value && value !== 0) return;
      const row = document.createElement('div');
      const strong = document.createElement('strong');
      strong.textContent = `${label}:`;
      row.appendChild(strong);
      row.appendChild(document.createTextNode(' '));
      row.appendChild(document.createTextNode(String(value)));
      root.appendChild(row);
    };

    addRow('Severity', severityMap[String(p.severity)] || p.severity);
    addRow('Total casualties', p.casualties);
    if (p.cyclist_casualties !== undefined) {
      const text = p.cyclist_casualties + (p.cyclist_casualties_inferred ? ' (inferred from fatal pedal-cycle collision)' : '');
      addRow('Cyclist casualties', text);
    }
    addRow('Vehicles', p.vehicles);
    addRow('Weather', weatherMap[String(p.weather)] || p.weather);

    const popup = new maplibregl.Popup().setLngLat(f.geometry.coordinates).setDOMContent(root);
    showPopup(popup).addTo(map);
  });

  map.on('mouseenter', 'dft-collisions-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'dft-collisions-layer', () => { map.getCanvas().style.cursor = ''; });
}
