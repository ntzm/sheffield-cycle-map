import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { addSvgImage } from "../utils/icons.js";

export async function addAslLayer(map, urlState) {
  const iconId = "asl-icon";
  if (!map.hasImage(iconId)) {
    const svg = await fetch("icons/asl.svg").then((r) => r.text());
    await addSvgImage(map, iconId, svg, { pixelRatio: 2 });
  }

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
