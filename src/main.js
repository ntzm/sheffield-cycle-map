import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
// Main entry: wires map, layers, state, and controls.
import { parseHashState, formatHashState, initialVisible } from './utils/state.js';
import { LayerControl } from './ui/layer-control.js';
import { reorderLayers } from './utils/layer-order.js';
import { addBoundaryLayer } from './layers/boundary.js';
import { addPumpsLayer } from './layers/pumps.js';
import { addParkingLayers } from './layers/parking.js';
import { addWayfinding } from './layers/wayfinding.js';
import { addCycleway } from './layers/cycleway.js';
import { addNcn } from './layers/ncn.js';
import { addEmbeddedTramTracks } from './layers/tram.js';
import { addCollisions } from './layers/collisions.js';
import { addCounters } from './layers/counters.js';

const CACHE_BUST = Date.now();
const urlState = parseHashState();

const control = new LayerControl(
  [
    { id: 'parking-all-layer', name: 'Cycle parking', initiallyVisible: true, linkedLayers: ['parking-public-layer', 'parking-private-layer', 'parking-hub-layer', 'parking-hangar-layer'], virtual: true },
    { id: 'parking-public-layer', name: 'Public parking', description: 'Public or customer cycle parking. Data from OpenStreetMap.', legendColor: '#0f6bd8', initiallyVisible: initialVisible(urlState, 'parking-public-layer', true), parentId: 'parking-all-layer' },
    { id: 'parking-private-layer', name: 'Private parking', description: 'Cycle parking that is not accessible to the public. Data from OpenStreetMap.', legendColor: '#808080', initiallyVisible: initialVisible(urlState, 'parking-private-layer', true), parentId: 'parking-all-layer' },
    { id: 'parking-hub-layer', name: 'Cycle hubs', description: 'Secure cycle hubs. Data from OpenStreetMap.', legendColor: '#f97316', initiallyVisible: initialVisible(urlState, 'parking-hub-layer', true), parentId: 'parking-all-layer' },
    { id: 'parking-hangar-layer', name: 'Cycle hangars', description: 'Residential cycle hangars. Data from OpenStreetMap.', legendColor: '#22c55e', initiallyVisible: initialVisible(urlState, 'parking-hangar-layer', true), parentId: 'parking-all-layer' },
    { id: 'cycleway-all-layer', name: 'Cycleways', initiallyVisible: true, linkedLayers: ['cycleway-segregated-layer', 'cycleway-unsegregated-layer'], virtual: true },
    { id: 'cycleway-segregated-layer', name: 'Segregated paths', description: 'Cycle paths that have separation between people cycling and people walking. Data from OpenStreetMap.', legendLineColor: '#c63b2b', legendLineWidth: 3, initiallyVisible: initialVisible(urlState, 'cycleway-segregated-layer', true) || urlState.visibleLayers.has('cycleway-layer'), parentId: 'cycleway-all-layer' },
    { id: 'cycleway-unsegregated-layer', name: 'Unsegregated paths', description: 'Cycle paths that have no separation between people cycling and people walking. Data from OpenStreetMap.', legendLineColor: '#c63b2b', legendLineWidth: 3, legendLineDash: true, initiallyVisible: initialVisible(urlState, 'cycleway-unsegregated-layer', true) || urlState.visibleLayers.has('cycleway-layer'), parentId: 'cycleway-all-layer' },
    { id: 'repair-all-layer', name: 'Repair', initiallyVisible: true, linkedLayers: ['pumps-layer', 'pumps-x-layer'], virtual: true },
    { id: 'pumps-layer', name: 'Public pumps', description: 'Public bike pumps, including vandalised pumps marked with a cross. Data from OpenStreetMap.', legendIcon: 'icons/bike-pump.svg', linkedLayers: ['pumps-x-layer'], initiallyVisible: initialVisible(urlState, 'pumps-layer', true), parentId: 'repair-all-layer' },
    { id: 'ncn-layer', name: 'National Cycle Network', description: 'The National Cycle Network. Data from OpenSteetmap.', legendLineColor: '#2563eb', legendLineWidth: 3, initiallyVisible: initialVisible(urlState, 'ncn-layer', false) },
    { id: 'wayfinding-all-layer', name: 'Wayfinding', initiallyVisible: false, linkedLayers: ['wayfinding-guidepost-layer', 'wayfinding-route-layer'], virtual: true },
    { id: 'wayfinding-guidepost-layer', name: 'Guideposts', description: '(Incomplete) Guideposts with destinations for cycling. Data from OpenStreetMap.', legendIcon: 'icons/guidepost.svg', initiallyVisible: initialVisible(urlState, 'wayfinding-guidepost-layer', false), parentId: 'wayfinding-all-layer' },
    { id: 'wayfinding-route-layer', name: 'Route markers', description: '(Incomplete) Guideposts without destinations for cycling. Data from OpenStreetMap.', legendIcon: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 26 26">
        <g fill="none" fill-rule="evenodd">
          <rect x="2.5" y="2.5" width="21" height="21" rx="3" fill="#0047aa" stroke="#0f172a" stroke-width="1.2" />
          <path d="M9 13h8" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" />
          <path d="M14 10l4 3-4 3" fill="none" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </svg>`), initiallyVisible: initialVisible(urlState, 'wayfinding-route-layer', false), parentId: 'wayfinding-all-layer' },
    { id: 'embedded-tram-tracks-layer', name: 'Embedded Tram Tracks', description: 'Tram tracks embedded in the carriageway, dangerous for people on bikes. Data from OpenStreetMap.', legendLineColor: '#6b7280', legendLineWidth: 3, initiallyVisible: initialVisible(urlState, 'embedded-tram-tracks-layer', false) },
    { id: 'dft-collisions-layer', name: 'Collisions 2020-2024', description: 'Cyclist collision data for 2020-2024. Data from the Department for Transport.', legendIcon: 'data:image/svg+xml;utf8,' + encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 40 40">
        <g fill="none" stroke="#111" stroke-width="1.4" stroke-linejoin="round">
          <path d="M20 4 L35 34 H5 Z" fill="#fb923c" />
          <path d="M20 12 v10" stroke="#fff" stroke-width="3" />
          <circle cx="20" cy="27" r="1.8" fill="#fff" stroke="none" />
        </g>
      </svg>`), initiallyVisible: initialVisible(urlState, 'dft-collisions-layer', false) },
    { id: 'counters-layer', name: 'Cycle counters', description: 'Locations of automatic cycle counters. Data from OpenStreetMap.', legendIcon: 'icons/counter.svg', initiallyVisible: initialVisible(urlState, 'counters-layer', false) },
    { id: 'boundary-layer', name: 'Boundary', description: 'The boundary of Sheffield.', legendLineColor: '#6b7280', legendLineWidth: 3, legendLineDash: true, initiallyVisible: initialVisible(urlState, 'boundary-layer', false) },
  ],
  { title: 'Layers', onChange: () => queueMicrotask(updateUrlFromState) }
);

const initialView = urlState.view;

const map = new maplibregl.Map({
  container: 'map',
  style: './positron.json',
  center: [initialView.lng, initialView.lat],
  zoom: initialView.zoom,
  bearing: initialView.bearing,
  maxPitch: 0,
  // Loosen tap precision slightly to make small POIs easier to hit on touch screens.
  clickTolerance: 10
});

map.addControl(new maplibregl.NavigationControl({
  visualizePitch: false,
  visualizeRoll: true,
  showZoom: true,
  showCompass: true,
}));

map.addControl(new maplibregl.GeolocateControl({
  positionOptions: { enableHighAccuracy: true },
  trackUserLocation: true,
}));

function updateUrlFromState() {
  const visibleLayerIds = control.getVisibleLayerIds().filter(id => map.getLayer(id));
  const newHash = formatHashState(map, visibleLayerIds);
  if (window.location.hash !== newHash) {
    history.replaceState(null, '', newHash);
  }
}

map.on('moveend', updateUrlFromState);

map.on('load', async () => {
  await addWayfinding(map, urlState, CACHE_BUST);
  addParkingLayers(map, urlState, CACHE_BUST);
  addCycleway(map, urlState, CACHE_BUST);
  addNcn(map, urlState, CACHE_BUST);
  addEmbeddedTramTracks(map, urlState, CACHE_BUST);
  await addPumpsLayer(map, urlState, CACHE_BUST);
  await addCollisions(map, urlState, CACHE_BUST);
  await addCounters(map, urlState, CACHE_BUST);
  addBoundaryLayer(map, urlState, CACHE_BUST);
  reorderLayers(map);
  map.addControl(control, 'top-right');
});
