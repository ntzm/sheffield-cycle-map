import maplibregl from "maplibre-gl";
import { addSvgImage } from "../utils/icons.js";
import { showPopup } from "../utils/popup-singleton.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";

export async function addPumpsLayer(map, urlState) {
  const PUMP_ICON = "icons/bike-pump.svg";
  const PUMP_X_OVERLAY_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
      <g fill="none" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 5 L21 21" stroke="#ef4444" stroke-width="2.4" />
        <path d="M21 5 L5 21" stroke="#ef4444" stroke-width="2.4" />
      </g>
    </svg>`;

  await Promise.all([
    fetch(PUMP_ICON)
      .then((r) => r.text())
      .then((svg) => addSvgImage(map, "pump-icon", svg, { pixelRatio: 2 })),
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
      "icon-size": 0.03,
      "icon-anchor": "bottom",
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
      "icon-size": 1.15,
      "icon-anchor": "bottom",
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

  map.on("click", "pumps-layer", (e) => {
    const f = e.features[0];
    const props = f.properties;
    const label = "Public bike pump";
    const { root, heading } = createPopupContainer(label);
    heading.textContent = label;
    if (isBroken(props)) {
      const chips = document.createElement("div");
      chips.className = "popup-chips";
      const chip = document.createElement("span");
      chip.className = "popup-chip popup-chip--alert";
      chip.textContent = "Vandalised";
      chips.appendChild(chip);
      root.appendChild(chips);
    }
    const footer = buildStandardFooter(f);
    root.appendChild(footer);
    const popup = new maplibregl.Popup()
      .setLngLat(f.geometry.coordinates)
      .setDOMContent(root);
    showPopup(popup, "pumps-layer").addTo(map);
  });

  map.on("mouseenter", "pumps-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "pumps-layer", () => {
    map.getCanvas().style.cursor = "";
  });
}
