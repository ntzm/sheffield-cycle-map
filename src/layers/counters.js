import { loadIcon, POI_ICON_SIZE } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { registerSheetLayer } from "../utils/interactions.js";
import { fetchGeojson } from "../utils/fetch-geojson.js";

export async function addCounters(map, urlState) {
  const [data] = await Promise.all([
    fetchGeojson("data/counters.geojson"),
    loadIcon(map, "counter-icon", "icons/counter.svg"),
  ]);

  map.addSource("counters", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "counters-layer",
    type: "symbol",
    source: "counters",
    layout: {
      "icon-image": "counter-icon",
      "icon-size": POI_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
      visibility: initialVisible(urlState, "counters-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "counters-layer");

  const buildCounterPopup = (feature) => {
    const p = feature.properties;
    const { root } = createPopupContainer(
      p.ref ? `${p.ref} cycle counter` : "Cycle counter",
    );
    root.appendChild(buildStandardFooter(feature));
    return root;
  };
  registerSheetLayer(map, "counters-layer", {
    features: data.features,
    buildContent: buildCounterPopup,
  });
}
