import { loadIcon } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import {
  createPopupContainer,
  buildStandardFooter,
  buildChips,
} from "../utils/popup.js";
import { renderOpeningHoursTable } from "../utils/opening-hours.js";
import { addClickPopup } from "../utils/interactions.js";

const KIND_LABELS = {
  drinking_water: "Public drinking water",
  water_tap: "Water tap (drinking status unknown)",
  refill: "Business offering water refills",
};

export async function addDrinkingWaterLayer(map, urlState) {
  await Promise.all([
    loadIcon(map, "drinking-water-icon", "icons/drinking-water.svg"),
    loadIcon(map, "water-tap-icon", "icons/water-tap.svg"),
    loadIcon(map, "water-refill-icon", "icons/water-refill.svg"),
  ]);

  map.addSource("drinking-water", {
    type: "geojson",
    data: `data/drinking_water.geojson`,
  });

  map.addLayer({
    id: "drinking-water-layer",
    type: "symbol",
    source: "drinking-water",
    layout: {
      "icon-image": [
        "match",
        ["get", "kind"],
        "drinking_water", "drinking-water-icon",
        "water_tap", "water-tap-icon",
        "refill", "water-refill-icon",
        "drinking-water-icon",
      ],
      "icon-size": 0.9,
      "icon-anchor": "center",
      "icon-allow-overlap": true,
      visibility: initialVisible(urlState, "drinking-water-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "drinking-water-layer");

  addClickPopup(map, "drinking-water-layer", (feature) => {
    const p = feature.properties;
    const kindLabel = KIND_LABELS[p.kind] || "Water";
    const title = p.name || kindLabel;
    const { root } = createPopupContainer(title);

    if (p.name) {
      const chips = buildChips([{ text: kindLabel, tone: "info" }]);
      if (chips) root.appendChild(chips);
    }

    if (p.opening_hours) {
      const hoursCard = renderOpeningHoursTable(p.opening_hours);
      if (hoursCard) root.appendChild(hoursCard);
    }

    root.appendChild(buildStandardFooter(feature));
    return root;
  });
}
