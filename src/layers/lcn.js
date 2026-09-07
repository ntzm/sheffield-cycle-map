import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { NETWORK_LINE_WIDTH } from "../utils/network-line-width.js";

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
      visibility: initialVisible(urlState, "lcn-layer", false)
        ? "visible"
        : "none",
    },
    paint: {
      "line-color": "#0000ff",
      "line-width": NETWORK_LINE_WIDTH,
      // Applied once to the whole layer, so overlapping legs (route splits,
      // shared sections) render as a single surface rather than stacking.
      "line-layer-opacity": 0.3,
    },
  });

  placeLayer(map, "lcn-layer");
}
