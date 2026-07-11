import { openFeatureSheet, closeFeatureSheet } from "../ui/feature-sheet.js";

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

export function addFeatureClick(map, layerId, buildContent) {
  featureLayerIds.add(layerId);
  wireSheetDismissal(map);
  map.on("click", layerId, (e) => {
    const feature = e.features[0];
    if (!feature) return;
    const coords = feature.geometry.coordinates.slice();
    openFeatureSheet(map, layerId, buildContent(feature), coords);
  });
  addPointerCursor(map, layerId);
}
