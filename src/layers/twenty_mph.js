import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";

export function addTwentyMph(map, urlState) {
  map.addSource("twenty-mph", {
    type: "geojson",
    data: `data/20mph_zones.geojson`,
  });

  const visibility = initialVisible(urlState, "twenty-mph-layer", false)
    ? "visible"
    : "none";

  // Holes in a zone are streets that aren't tagged 20mph in OSM, so the
  // outline is drawn around them too, making them easy to spot and fix.
  map.addLayer({
    id: "twenty-mph-layer",
    type: "fill",
    source: "twenty-mph",
    layout: { visibility },
    paint: {
      "fill-color": "#2a9d8f",
      "fill-opacity": 0.2,
    },
  });

  map.addLayer({
    id: "twenty-mph-outline-layer",
    type: "line",
    source: "twenty-mph",
    layout: { visibility, "line-join": "round" },
    paint: {
      "line-color": "#2a9d8f",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 15, 1.5],
      "line-opacity": 0.8,
    },
  });

  placeLayer(map, "twenty-mph-layer");
  placeLayer(map, "twenty-mph-outline-layer");
}
