import { loadIcon } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { addClickPopup } from "../utils/interactions.js";

const KIND_LABELS = {
  table: "Speed table",
  hump: "Speed hump",
  bump: "Speed bump",
  choker: "Choker",
  choked_table: "Choked speed table",
  cushion: "Speed cushion",
  chicane: "Chicane",
  island: "Traffic island",
};

export async function addTrafficCalmingLayer(map, urlState) {
  await loadIcon(map, "traffic-calming-icon", "icons/traffic-calming.svg");

  map.addSource("traffic-calming", {
    type: "geojson",
    data: `data/traffic_calming.geojson`,
  });

  map.addLayer({
    id: "traffic-calming-layer",
    type: "symbol",
    source: "traffic-calming",
    layout: {
      "icon-image": "traffic-calming-icon",
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
      "icon-anchor": "center",
      "icon-allow-overlap": true,
      // Rotate with the road bearing so the hump profile reads across the road.
      "icon-rotate": ["%", ["coalesce", ["get", "bearing"], 0], 360],
      "icon-rotation-alignment": "map",
      visibility: initialVisible(urlState, "traffic-calming-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "traffic-calming-layer");

  addClickPopup(map, "traffic-calming-layer", (feature) => {
    const p = feature.properties;
    // "hump;choker" style multi-values become "Speed hump + Choker".
    // Unknown values (e.g. "yes") fall back to plain "Traffic calming".
    const title = (p.kind || "")
      .split(";")
      .map((k) => KIND_LABELS[k] || "Traffic calming")
      .join(" + ");
    const { root } = createPopupContainer(title || "Traffic calming");
    root.appendChild(buildStandardFooter(feature));
    return root;
  });
}
