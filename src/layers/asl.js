import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { loadIcon } from "../utils/icons.js";

export async function addAslLayer(map, urlState) {
  const iconId = "asl-icon";
  await loadIcon(map, iconId, "icons/asl.svg");

  map.addSource("asl", {
    type: "geojson",
    data: `data/asl.geojson`,
  });

  map.addLayer({
    id: "asl-layer",
    type: "symbol",
    source: "asl",
    layout: {
      visibility: initialVisible(urlState, "asl-layer", false)
        ? "visible"
        : "none",
      "icon-image": iconId,
      "icon-size": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        0.25,
        13,
        0.45,
        16,
        0.75,
        18,
        0.95,
      ],
      "icon-allow-overlap": true,
      // Rotate with the approach bearing so the bike faces travel direction.
      "icon-rotate": ["%", ["coalesce", ["get", "bearing"], 0], 360],
      "icon-rotation-alignment": "map",
    },
    paint: {},
  });

  placeLayer(map, "asl-layer");
}
