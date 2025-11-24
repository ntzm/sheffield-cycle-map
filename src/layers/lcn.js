import { placeLayer } from "../utils/layer-order.js";

export function addLcn(map, urlState) {
  map.addSource("lcn", {
    type: "geojson",
    data: `data/lcn.geojson`,
  });

  map.addLayer({
    id: "lcn-layer",
    type: "line",
    source: "lcn",
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: urlState.visibleLayers.has("lcn-layer") ? "visible" : "none",
    },
    paint: {
      "line-color": "#2563eb",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        1.4,
        13,
        2.6,
        15,
        3.6,
        17,
        4.8,
      ],
      "line-opacity": 0.65,
    },
  });

  placeLayer(map, "lcn-layer");
}
