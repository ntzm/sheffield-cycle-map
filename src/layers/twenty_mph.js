import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";

export function addTwentyMph(map, urlState) {
  map.addSource("twenty-mph", {
    type: "geojson",
    data: `data/20mph.geojson`,
  });

  // A wide translucent band under the cycle infrastructure, so 20mph streets
  // read as an area highlight rather than competing with the cycleway lines.
  map.addLayer({
    id: "twenty-mph-layer",
    type: "line",
    source: "twenty-mph",
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: initialVisible(urlState, "twenty-mph-layer", false)
        ? "visible"
        : "none",
    },
    paint: {
      "line-color": "#2a9d8f",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        2,
        13,
        4,
        15,
        8,
        17,
        14,
      ],
      "line-opacity": 0.4,
    },
  });

  placeLayer(map, "twenty-mph-layer");
}
