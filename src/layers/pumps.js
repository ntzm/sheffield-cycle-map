import { addSvgImage, loadIcon, POI_ICON_SIZE } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import {
  createPopupContainer,
  buildStandardFooter,
  buildChips,
} from "../utils/popup.js";
import { renderOpeningHoursTable } from "../utils/opening-hours.js";
import { registerSheetLayer } from "../utils/interactions.js";
import { fetchGeojson } from "../utils/fetch-geojson.js";

const SERVICE_LABELS = {
  pump: "Pump",
  tools: "Tools",
  chain_tool: "Chain tool",
  stand: "Work stand",
};

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

  const [data] = await Promise.all([
    fetchGeojson("data/pumps.geojson"),
    loadIcon(map, "pump-icon", PUMP_ICON),
    addSvgImage(map, "pump-icon-x", PUMP_X_OVERLAY_SVG, { pixelRatio: 2 }),
  ]);

  map.addSource("pumps", {
    type: "geojson",
    data,
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

  const serviceValue = (props, service) =>
    props[`service:bicycle:${service}`] ??
    props[`destroyed:service:bicycle:${service}`] ??
    props[`disused:service:bicycle:${service}`];

  const buildPumpPopup = (feature) => {
    const props = feature.properties;
    const { root } = createPopupContainer("Public repair station");

    if (props.operator) {
      const op = document.createElement("div");
      op.className = "popup__meta";
      op.textContent = `Operated by ${props.operator}`;
      root.appendChild(op);
    }

    const chipData = [];
    if (isBroken(props)) chipData.push({ text: "Vandalised", tone: "alert" });
    for (const [service, label] of Object.entries(SERVICE_LABELS)) {
      if (serviceValue(props, service) === "yes")
        chipData.push({ text: label, tone: "info" });
    }
    if (props.access && props.access !== "yes")
      chipData.push({ text: props.access, tone: "warn" });
    const chips = buildChips(chipData);
    if (chips) root.appendChild(chips);

    if (props.opening_hours) {
      const hoursCard = renderOpeningHoursTable(props.opening_hours);
      if (hoursCard) root.appendChild(hoursCard);
    }

    root.appendChild(buildStandardFooter(feature));
    return root;
  };
  registerSheetLayer(map, "pumps-layer", {
    features: data.features,
    buildContent: buildPumpPopup,
  });
}
