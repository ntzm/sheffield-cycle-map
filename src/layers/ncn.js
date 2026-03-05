import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";

export function addNcn(map, urlState) {
  map.addSource("ncn", {
    type: "geojson",
    data: `data/ncn.geojson`,
  });

  const vis = initialVisible(urlState, "ncn-layer", false) ? "visible" : "none";

  map.addLayer({
    id: "ncn-layer",
    type: "line",
    source: "ncn",
    layout: {
      "line-join": "round",
      "line-cap": "butt",
      visibility: vis,
    },
    paint: {
      "line-color": "#aa00ff",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10, 6,
        13, 10,
        15, 14,
        17, 18,
      ],
      "line-opacity": 0.3,
    },
  });

  map.addLayer({
    id: "ncn-shield-layer",
    type: "symbol",
    source: "ncn",
    filter: ["has", "ref"],
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": 200,
      "text-field": ["get", "ref"],
      "text-font": ["Noto Sans Bold"],
      "text-rotation-alignment": "viewport",
      "text-size": 10,
      "text-padding": 2,
      visibility: vis,
    },
    paint: {
      "text-color": "#fff",
      "text-halo-color": "#aa00ff",
      "text-halo-width": 5,
    },
  });

  placeLayer(map, "ncn-layer");
  placeLayer(map, "ncn-shield-layer");
}
