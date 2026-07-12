import {
  openFeatureSheet,
  closeFeatureSheet,
  onFeatureSheetClose,
} from "../ui/feature-sheet.js";

export function addPointerCursor(map, layerId) {
  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });
}

// Layers whose clicks open the feature sheet; used to stop lower layers (e.g.
// scheme plan overlays) from also reacting to clicks aimed at these features.
const featureLayerIds = new Set();
// Layers that open the sheet through their own click handlers (scheme plan
// hit areas). Clicks on these shouldn't dismiss the sheet either.
const selfManagedLayerIds = new Set();

// layerId -> { index: Map(key -> raw GeoJSON feature), featureKey, buildContent }
// The registry is what makes a selection addressable from outside a click
// handler: given a layer id and a stable feature key, the sheet can be opened
// on load from the URL.
const sheetLayers = new Map();

// The selection currently shown in the sheet, and the hook main.js uses to
// mirror it into app state (and from there the URL).
let currentSel = null;
let selectionListener = null;

export function setSelectionListener(fn) {
  selectionListener = fn;
}

export function currentSelection() {
  return currentSel;
}

onFeatureSheetClose(() => {
  currentSel = null;
  if (selectionListener) selectionListener(null);
});

export function hasFeatureInfoAt(map, point) {
  return map
    .queryRenderedFeatures(point)
    .some((f) => featureLayerIds.has(f.layer.id));
}

// Clicking empty map space closes the sheet (parity with popup closeOnClick).
const dismissWired = new WeakSet();
function wireSheetDismissal(map) {
  if (dismissWired.has(map)) return;
  dismissWired.add(map);
  map.on("click", (e) => {
    const onFeature = map
      .queryRenderedFeatures(e.point)
      .some(
        (f) =>
          featureLayerIds.has(f.layer.id) ||
          selfManagedLayerIds.has(f.layer.id),
      );
    if (!onFeature) closeFeatureSheet();
  });
}

export function registerFeatureInfoLayers(map, layerIds) {
  layerIds.forEach((id) => selfManagedLayerIds.add(id));
  wireSheetDismissal(map);
}

const defaultFeatureKey = (props) => `${props.osm_type}/${props.osm_id}`;

// MapLibre stringifies non-scalar property values on rendered features, and
// the content builders were written against that shape. Canonical features
// from the raw GeoJSON get the same treatment before a builder sees them, so
// both the click path and the URL-restore path hand builders identical input.
function normalizeFeature(feature) {
  const props = {};
  for (const [k, v] of Object.entries(feature.properties || {})) {
    props[k] = v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  }
  return { ...feature, properties: props };
}

// Anchor point for the highlight halo and auto-pan when a selection is
// restored without a click. Points are exact; polygons (scheme plan
// footprints) use the vertex average, which is fine for an anchor.
function featureLngLat(feature) {
  const geom = feature.geometry;
  if (geom.type === "Point") return geom.coordinates.slice();
  const ring =
    geom.type === "Polygon"
      ? geom.coordinates[0]
      : geom.type === "LineString"
        ? geom.coordinates
        : (geom.coordinates[0] && geom.coordinates[0][0]) || [];
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return ring.length ? [lng / ring.length, lat / ring.length] : [0, 0];
}

// Register a layer whose features open the info sheet. `features` are the raw
// GeoJSON features backing the layer; `featureKey` maps a feature's
// properties to its stable id. Keys go into the URL hash verbatim, so they
// must stay URL-safe by construction ("/", ":", "." are fine; no "&", "=",
// "%", "#", "," or whitespace). Re-registration (loaders re-run after a
// basemap switch) refreshes the index without re-wiring map events.
export function registerSheetLayer(
  map,
  layerId,
  { features, buildContent, featureKey = defaultFeatureKey, wireClick = true },
) {
  const index = new Map();
  for (const feature of features) {
    const key = featureKey(feature.properties || {});
    if (key !== undefined && key !== null) index.set(String(key), feature);
  }

  const alreadyRegistered = sheetLayers.has(layerId);
  sheetLayers.set(layerId, { index, featureKey, buildContent });
  if (alreadyRegistered || !wireClick) return;

  featureLayerIds.add(layerId);
  wireSheetDismissal(map);
  map.on("click", layerId, (e) => {
    const feature = e.features[0];
    if (!feature) return;
    selectFeature(map, layerId, featureKey(feature.properties));
  });
  addPointerCursor(map, layerId);
}

// Open the sheet for a feature by its stable key — from a click or from the
// URL. Content is always built from the canonical raw feature, never the
// rendered one. Returns false if the layer or key is unknown (stale link).
// Options: `lngLat` anchors the highlight (defaults to the feature itself),
// `animate: false` makes the sheet appear without sliding in.
export function selectFeature(map, layerId, key, { lngLat, animate } = {}) {
  const reg = sheetLayers.get(layerId);
  if (!reg) return false;
  const feature = reg.index.get(String(key));
  if (!feature) return false;

  const normalized = normalizeFeature(feature);
  openFeatureSheet(
    map,
    layerId,
    reg.buildContent(normalized),
    lngLat || featureLngLat(feature),
    { animate },
  );
  currentSel = { layerId, key: String(key) };
  if (selectionListener) selectionListener(currentSel);
  return true;
}
