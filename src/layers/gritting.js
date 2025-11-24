import { placeLayer } from "../utils/layer-order.js";

export function addGrittingLayers(map, urlState) {
  map.addSource("gritting", {
    type: "geojson",
    data: `data/gritting.geojson`,
  });

  map.addLayer({
    id: "gritting-primary-layer",
    type: "line",
    source: "gritting",
    filter: ["==", ["get", "priority"], "primary"],
    paint: {
      "line-color": "#16a34a",
      "line-width": 3,
      "line-opacity": 0.85,
    },
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: urlState.visibleLayers.has("gritting-primary-layer")
        ? "visible"
        : "none",
    },
  });

  map.addLayer({
    id: "gritting-secondary-layer",
    type: "line",
    source: "gritting",
    filter: ["==", ["get", "priority"], "secondary"],
    paint: {
      "line-color": "#16a34a",
      "line-width": 2.5,
      "line-opacity": 0.8,
      "line-dasharray": [2, 2],
    },
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: urlState.visibleLayers.has("gritting-secondary-layer")
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "gritting-secondary-layer");
  placeLayer(map, "gritting-primary-layer");
}
