import maplibregl from 'maplibre-gl';
import { placeLayer } from '../utils/layer-order.js';
import { showPopup } from '../utils/popup-singleton.js';
import { createPopupContainer, addRow } from '../utils/popup.js';

function buildPopup(props) {
  const { root } = createPopupContainer('Bicycle theft');
  addRow(root, 'Month', props.month);
  addRow(root, 'Street', props.street);
  addRow(root, 'Outcome', props.outcome);
  if (props.outcome_date) addRow(root, 'Outcome date', props.outcome_date);
  return root;
}

export function addBikeTheftsLayer(map, urlState, cacheBust) {
  map.addSource('bike-thefts', {
    type: 'geojson',
    data: `data/bike_thefts.geojson?cache=${cacheBust}`
  });

  map.addLayer({
    id: 'bike-theft-layer',
    type: 'circle',
    source: 'bike-thefts',
    paint: {
      'circle-radius': 4,
      'circle-color': '#fb923c',
      'circle-stroke-color': '#111827',
      'circle-stroke-width': 1,
      'circle-opacity': 0.85
    },
    layout: { visibility: urlState.visibleLayers.has('bike-theft-layer') ? 'visible' : 'none' }
  });

  map.on('click', 'bike-theft-layer', (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const coords = f.geometry.coordinates.slice();
    const popup = new maplibregl.Popup().setLngLat(coords).setDOMContent(buildPopup(f.properties || {}));
    showPopup(popup).addTo(map);
  });
  map.on('mouseenter', 'bike-theft-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', 'bike-theft-layer', () => { map.getCanvas().style.cursor = ''; });

  placeLayer(map, 'bike-theft-layer');
}
