import { addSvgImage, loadIcon, POI_ICON_SIZE } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import {
  createPopupContainer,
  buildStandardFooter,
  buildChips,
} from "../utils/popup.js";
import { addClickPopup } from "../utils/interactions.js";

export async function addPumpsLayer(map, urlState) {
  const PUMP_ICON = "icons/bike-pump.svg";
  const PUMP_X_OVERLAY_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 26 26">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 5 L21 21" stroke="#ffffff" stroke-width="4.4" />
        <path d="M21 5 L5 21" stroke="#ffffff" stroke-width="4.4" />
        <path d="M5 5 L21 21" stroke="#dc2626" stroke-width="2.4" />
        <path d="M21 5 L5 21" stroke="#dc2626" stroke-width="2.4" />
      </g>
    </svg>`;

  await Promise.all([
    loadIcon(map, "pump-icon", PUMP_ICON),
    addSvgImage(map, "pump-icon-x", PUMP_X_OVERLAY_SVG, { pixelRatio: 2 }),
  ]);

  map.addSource("pumps", {
    type: "geojson",
    data: `data/pumps.geojson`,
  });

  const pumpStatusX = [
    "any",
    ["has", "destroyed:amenity"],
    ["has", "destroyed:service:bicycle:pump"],
    ["has", "disused:amenity"],
    ["has", "disused:service:bicycle:pump"],
  ];

  map.addLayer({
    id: "pumps-layer",
    type: "symbol",
    source: "pumps",
    layout: {
      "icon-image": "pump-icon",
      "icon-size": POI_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "pumps-layer", false)
        ? "visible"
        : "none",
    },
  });

  map.addLayer({
    id: "pumps-x-layer",
    type: "symbol",
    source: "pumps",
    filter: pumpStatusX,
    layout: {
      "icon-image": "pump-icon-x",
      "icon-size": POI_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "pumps-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "pumps-x-layer");
  placeLayer(map, "pumps-layer");

  const isBroken = (props) =>
    "destroyed:amenity" in props ||
    "destroyed:service:bicycle:pump" in props ||
    "disused:amenity" in props ||
    "disused:service:bicycle:pump" in props;

  addClickPopup(map, "pumps-layer", (feature) => {
    const props = feature.properties;
    const label = "Public bike pump";
    const { root } = createPopupContainer(label);
    if (isBroken(props)) {
      const chips = buildChips([{ text: "Vandalised", tone: "alert" }]);
      if (chips) root.appendChild(chips);
    }
    root.appendChild(buildStandardFooter(feature));
    return root;
  });
}
