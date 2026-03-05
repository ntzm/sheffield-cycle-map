import { loadIcon } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { addClickPopup } from "../utils/interactions.js";

export async function addCounters(map, urlState) {
  await loadIcon(map, "counter-icon", "icons/counter.svg");

  map.addSource("counters", {
    type: "geojson",
    data: `data/counters.geojson`,
  });

  map.addLayer({
    id: "counters-layer",
    type: "symbol",
    source: "counters",
    layout: {
      "icon-image": "counter-icon",
      "icon-size": 0.04,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
      visibility: initialVisible(urlState, "counters-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "counters-layer");

  addClickPopup(map, "counters-layer", (feature) => {
    const p = feature.properties;
    const { root } = createPopupContainer(
      p.ref ? `${p.ref} cycle counter` : "Cycle counter",
    );
    root.appendChild(buildStandardFooter(feature));
    return root;
  });
}
