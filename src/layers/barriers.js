import { loadIcon } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { addFeatureClick } from "../utils/interactions.js";

export async function addBarriersLayer(map, urlState) {
  await loadIcon(map, "barrier-icon", "icons/barrier.svg");

  map.addSource("barriers", {
    type: "geojson",
    data: `data/barriers.geojson`,
  });

  map.addLayer({
    id: "barriers-layer",
    type: "symbol",
    source: "barriers",
    layout: {
      "icon-image": "barrier-icon",
      "icon-size": 0.9,
      "icon-anchor": "center",
      "icon-allow-overlap": true,
      visibility: initialVisible(urlState, "barriers-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "barriers-layer");

  addFeatureClick(map, "barriers-layer", (feature) => {
    const { root } = createPopupContainer("Barrier");
    root.appendChild(buildStandardFooter(feature));
    return root;
  });
}
