import { loadIcon } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { registerSheetLayer } from "../utils/interactions.js";
import { fetchGeojson } from "../utils/fetch-geojson.js";

export async function addBarriersLayer(map, urlState) {
  const [data] = await Promise.all([
    fetchGeojson("data/barriers.geojson"),
    loadIcon(map, "barrier-icon", "icons/barrier.svg"),
  ]);

  map.addSource("barriers", {
    type: "geojson",
    data,
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

  const buildBarrierPopup = (feature) => {
    const { root } = createPopupContainer("Barrier");
    root.appendChild(buildStandardFooter(feature));
    return root;
  };
  registerSheetLayer(map, "barriers-layer", {
    features: data.features,
    buildContent: buildBarrierPopup,
  });
}
