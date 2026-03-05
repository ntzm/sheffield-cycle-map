import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";

const LAYERS = [
  {
    id: "gritting-primary-layer",
    priority: "primary",
    width: 3,
    opacity: 0.85,
  },
  {
    id: "gritting-secondary-layer",
    priority: "secondary",
    width: 2.5,
    opacity: 0.8,
    dasharray: [2, 2],
  },
];

export function addGrittingLayers(map, urlState) {
  map.addSource("gritting", {
    type: "geojson",
    data: `data/gritting.geojson`,
  });

  for (const { id, priority, width, opacity, dasharray } of LAYERS) {
    map.addLayer({
      id,
      type: "line",
      source: "gritting",
      filter: ["==", ["get", "priority"], priority],
      paint: {
        "line-color": "#16a34a",
        "line-width": width,
        "line-opacity": opacity,
        ...(dasharray && { "line-dasharray": dasharray }),
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
        visibility: initialVisible(urlState, id, false) ? "visible" : "none",
      },
    });
    placeLayer(map, id);
  }
}
