import { placeLayer } from "../utils/layer-order.js";

export function addNcn(map, urlState) {
  map.addSource("ncn", {
    type: "geojson",
    data: `data/ncn.geojson`,
  });

  map.addLayer({
    id: "ncn-layer",
    type: "line",
    source: "ncn",
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: urlState.visibleLayers.has("ncn-layer") ? "visible" : "none",
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

  placeLayer(map, "ncn-layer");
}
