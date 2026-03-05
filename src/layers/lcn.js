import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";

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
      "line-cap": "butt",
      visibility: initialVisible(urlState, "lcn-layer", false) ? "visible" : "none",
    },
    paint: {
      "line-color": "#0000ff",
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

  placeLayer(map, "lcn-layer");
}
