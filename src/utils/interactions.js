import maplibregl from "maplibre-gl";
import { showPopup } from "./popup-singleton.js";

export function addPointerCursor(map, layerId) {
  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });
}

// Layers with their own click popups; used to stop lower layers (e.g. scheme
// plan overlays) from also reacting to clicks aimed at these features.
const popupLayerIds = new Set();

export function hasPopupFeatureAt(map, point) {
  return map
    .queryRenderedFeatures(point)
    .some((f) => popupLayerIds.has(f.layer.id));
}

export function addClickPopup(map, layerId, buildPopupContent) {
  popupLayerIds.add(layerId);
  map.on("click", layerId, (e) => {
    const feature = e.features[0];
    if (!feature) return;
    const coords = feature.geometry.coordinates.slice();
    const popup = new maplibregl.Popup()
      .setLngLat(coords)
      .setDOMContent(buildPopupContent(feature));
    showPopup(popup, layerId).addTo(map);
  });
  addPointerCursor(map, layerId);
}
