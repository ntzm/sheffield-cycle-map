import { placeLayer } from '../utils/layer-order.js';
import { initialVisible } from '../utils/state.js';

export function addCycleway(map, urlState, cacheBust) {
  map.addSource('cycleway', {
    type: 'geojson',
    data: `data/cycleway.geojson`
  });

  const basePaint = {
    'line-opacity': 0.9,
    'line-blur': 0.12,
    'line-width': [
      'interpolate', ['linear'], ['zoom'],
      10, ['*', 1.4, ['case', ['in', ['get', 'oneway'], ['literal', ['yes', 'true', '1', '-1']]], 0.5, 1]],
      13, ['*', 2.2, ['case', ['in', ['get', 'oneway'], ['literal', ['yes', 'true', '1', '-1']]], 0.5, 1]],
      15, ['*', 3.6, ['case', ['in', ['get', 'oneway'], ['literal', ['yes', 'true', '1', '-1']]], 0.5, 1]],
      17, ['*', 4.8, ['case', ['in', ['get', 'oneway'], ['literal', ['yes', 'true', '1', '-1']]], 0.5, 1]]
    ]
  };

  map.addLayer({
    id: 'cycleway-segregated-layer',
    type: 'line',
    source: 'cycleway',
    filter: ['==', ['coalesce', ['get', 'segregated'], ''], 'yes'],
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
      visibility: initialVisible(urlState, 'cycleway-segregated-layer', true) || urlState.visibleLayers.has('cycleway-layer') ? 'visible' : 'none'
    },
    paint: {
      ...basePaint,
      'line-color': '#c63b2b'
    }
  });

  map.addLayer({
    id: 'cycleway-unsegregated-layer',
    type: 'line',
    source: 'cycleway',
    filter: ['!=', ['coalesce', ['get', 'segregated'], ''], 'yes'],
    layout: {
      'line-join': 'round',
      'line-cap': 'round',
      visibility: initialVisible(urlState, 'cycleway-unsegregated-layer', true) || urlState.visibleLayers.has('cycleway-layer') ? 'visible' : 'none'
    },
    paint: {
      ...basePaint,
      'line-color': '#c63b2b',
      'line-dasharray': ['literal', [2.4, 1.8]]
    }
  });

  placeLayer(map, 'cycleway-unsegregated-layer');
  placeLayer(map, 'cycleway-segregated-layer');
}
