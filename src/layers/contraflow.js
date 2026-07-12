import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";

export function addContraflow(map, urlState) {
  map.addSource("contraflow", {
    type: "geojson",
    data: `data/contraflow.geojson`,
  });

  // The line is drawn as a chain of ">" chevrons pointing in the contraflow
  // direction (the pipeline orients each geometry that way). Rendered on the
  // road centreline, so it reads the same whether the offset cycle-lane
  // layers are on or off. ">" is plain ASCII so it exists in every basemap's
  // glyph set, unlike Unicode arrows or runtime-added images.
  map.addLayer({
    id: "contraflow-layer",
    type: "symbol",
    source: "contraflow",
    layout: {
      "symbol-placement": "line",
      "symbol-spacing": [
        "interpolate", ["linear"], ["zoom"],
        10, 12,
        13, 16,
        17, 26,
      ],
      "text-field": ">",
      "text-font": ["Noto Sans Bold"],
      "text-size": [
        "interpolate", ["linear"], ["zoom"],
        10, 7,
        13, 10,
        15, 13,
        17, 16,
      ],
      "text-rotation-alignment": "map",
      "text-keep-upright": false,
      "text-allow-overlap": true,
      "text-ignore-placement": true,
      visibility: initialVisible(urlState, "contraflow-layer", true)
        ? "visible"
        : "none",
    },
    paint: {
      "text-color": "#c63b2b",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.5,
    },
  });

  placeLayer(map, "contraflow-layer");
}
