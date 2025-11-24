import maplibregl from 'maplibre-gl';
import { createPopupContainer, addRow } from '../utils/popup.js';
import { showPopup } from '../utils/popup-singleton.js';
import { placeLayer } from '../utils/layer-order.js';

function buildParkingPopup(props) {
  const name = props.name || 'Cycle parking';
  const { root } = createPopupContainer(name);

  addRow(root, 'Access', props.access);
  addRow(root, 'Capacity', props.capacity);
  addRow(root, 'Covered', props.covered);
  addRow(root, 'Operated by', props.operator);
  if (props.fee) addRow(root, 'Fee', props.charge ? `Yes (${props.charge})` : 'Yes');
  if (props.website) {
    const row = document.createElement('div');
    const link = document.createElement('a');
    link.href = props.website;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Website';
    row.appendChild(link);
    root.appendChild(row);
  }
  if (props.wheel_benders === true || props.wheel_benders === 'true') {
    const warn = document.createElement('div');
    warn.className = 'parking-popup__warning';
    warn.textContent = 'Warning: wheelbenders – may only hold the front wheel.';
    root.appendChild(warn);
  }
  if (props.description) {
    const row = document.createElement('div');
    row.textContent = props.description;
    root.appendChild(row);
  }

  if (props.imageHref) {
    const imgWrap = document.createElement('div');
    imgWrap.className = 'parking-popup__media';
    const img = document.createElement('img');
    img.src = props.imageHref;
    img.alt = name;
    img.className = 'parking-popup__image';
    imgWrap.appendChild(img);

    const parts = [];
    if (props.imageAuthor) parts.push(`Photo: ${props.imageAuthor}`);
    if (props.imageLicense) parts.push(`License: ${props.imageLicense}`);
    if (parts.length) {
      const attr = document.createElement('div');
      attr.className = 'parking-popup__attribution';
      attr.textContent = parts.join(' • ');
      imgWrap.appendChild(attr);
    }
    root.appendChild(imgWrap);
  }

  return root;
}

export function attachParkingInteractions(map, layerId) {
  map.on('click', layerId, (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;

    const coords = feature.geometry.coordinates.slice();
    const props = feature.properties || {};

    const popup = new maplibregl.Popup().setLngLat(coords).setDOMContent(buildParkingPopup(props));
    showPopup(popup).addTo(map);
  });

  map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
  map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
}

export function addParkingLayers(map, urlState, cacheBust) {
  map.addSource('parking', {
    type: 'geojson',
    data: `data/parking.geojson`
  });

  const restrictedAccessValues = ['Private', 'Members only', 'Employees only', 'Students only'];

  map.addLayer({
    id: 'parking-public-layer',
    type: 'circle',
    source: 'parking',
    filter: ['all',
      ['!=', ['get', 'is_hub'], true],
      ['!=', ['get', 'is_hangar'], true],
      ['!', ['in', ['get', 'access'], ['literal', restrictedAccessValues]]]
    ],
    paint: {
      'circle-radius': 4,
      'circle-color': '#0f6bd8',
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 1.25
    },
    layout: { visibility: urlState.visibleLayers.has('parking-public-layer') || urlState.visibleLayers.size === 0 ? 'visible' : 'none' }
  });

  map.addLayer({
    id: 'parking-private-layer',
    type: 'circle',
    source: 'parking',
    filter: ['all',
      ['!=', ['get', 'is_hub'], true],
      ['!=', ['get', 'is_hangar'], true],
      ['in', ['get', 'access'], ['literal', restrictedAccessValues]]
    ],
    paint: {
      'circle-radius': 4,
      'circle-color': '#808080',
      'circle-stroke-color': '#FFFFFF',
      'circle-stroke-width': 1.25
    },
    layout: { visibility: urlState.visibleLayers.has('parking-private-layer') || urlState.visibleLayers.size === 0 ? 'visible' : 'none' }
  });

  map.addLayer({
    id: 'parking-hangar-layer',
    type: 'circle',
    source: 'parking',
    filter: ['==', ['get', 'is_hangar'], true],
    paint: {
      'circle-radius': 4,
      'circle-color': '#22c55e',
      'circle-stroke-color': '#0f172a',
      'circle-stroke-width': 1.25,
      'circle-opacity': 0.95
    },
    layout: { visibility: urlState.visibleLayers.has('parking-hangar-layer') || urlState.visibleLayers.size === 0 ? 'visible' : 'none' }
  });

  map.addLayer({
    id: 'parking-hub-layer',
    type: 'circle',
    source: 'parking',
    filter: ['==', ['get', 'is_hub'], true],
    paint: {
      'circle-radius': 4,
      'circle-color': '#f97316',
      'circle-stroke-color': '#111',
      'circle-stroke-width': 1.25
    },
    layout: { visibility: urlState.visibleLayers.has('parking-hub-layer') || urlState.visibleLayers.size === 0 ? 'visible' : 'none' }
  });

  ['parking-hub-layer', 'parking-public-layer', 'parking-hangar-layer', 'parking-private-layer'].forEach(placeLayer.bind(null, map));

  ['parking-public-layer', 'parking-private-layer', 'parking-hangar-layer', 'parking-hub-layer'].forEach(id => attachParkingInteractions(map, id));
}
