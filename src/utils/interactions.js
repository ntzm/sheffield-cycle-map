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

export function addClickPopup(map, layerId, buildPopupContent) {
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
