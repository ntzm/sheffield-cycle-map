import maplibregl from "maplibre-gl";
import { addSvgImage } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { showPopup } from "../utils/popup-singleton.js";

function parseFingerGroups(raw) {
  if (!raw || typeof raw !== "string") return [];
  return raw.split("|").map((part) =>
    part
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean),
  );
}

function buildGuidepostPopup(feature) {
  const props = feature.properties;
  const { root } = createPopupContainer("Guidepost");
  renderRoutes(root, props);

  const destinations = parseFingerGroups(props.destination);
  const symbols = parseFingerGroups(props.destination_symbol);
  if (!destinations.length && !symbols.length) {
    const row = document.createElement("div");
    row.textContent = "No destinations tagged yet.";
    root.appendChild(row);
  }

  const list = document.createElement("div");
  list.className = "guidepost-fingers";
  const total = Math.max(destinations.length, symbols.length);
  for (let idx = 0; idx < total; idx++) {
    const dests = destinations[idx] || [];
    const symbolGroup = symbols[idx] || [];
    if (!dests.length && !symbolGroup.length) continue;
    const finger = document.createElement("div");
    finger.className = "guidepost-finger";

    dests.forEach((dest) => {
      const line = document.createElement("div");
      line.className = "guidepost-finger__dest";
      line.textContent = dest;
      finger.appendChild(line);
    });

    if (symbolGroup && symbolGroup.length) {
      const symLine = document.createElement("div");
      symLine.className = "guidepost-finger__symbol";
      symLine.textContent = symbolGroup.map(formatSymbolLabel).join(" · ");
      finger.appendChild(symLine);
    }

    list.appendChild(finger);
  }

  root.appendChild(list);

  const report = document.createElement("a");
  report.href =
    "https://forms.sheffield.gov.uk/site/form/auto/road_street_sign_bollard";
  report.target = "_blank";
  report.rel = "noopener noreferrer";
  report.textContent = "Report a problem with this guidepost";
  report.className = "popup-link";
  root.appendChild(report);

  const footer = buildStandardFooter(feature);
  root.appendChild(footer);
  return root;
}

function buildRouteMarkerPopup(feature) {
  const props = feature.properties;
  const { root } = createPopupContainer("Route Marker");
  renderRoutes(root, props);

  const report = document.createElement("a");
  report.href =
    "https://forms.sheffield.gov.uk/site/form/auto/road_street_sign_bollard";
  report.target = "_blank";
  report.rel = "noopener noreferrer";
  report.textContent = "Report a problem with this route marker";
  report.className = "popup-link";
  root.appendChild(report);

  const footer = buildStandardFooter(feature);
  root.appendChild(footer);
  return root;
}

function renderRoutes(root, props) {
  const routeNames = normaliseRouteNames(props.route_relations);
  const ncnRefs = normaliseRouteNames(props.route_relations_ncn);

  if (!routeNames.length && !ncnRefs.length) return;

  const routesBlock = document.createElement("div");
  routesBlock.className = "guidepost-routes";
  const chips = document.createElement("div");
  chips.className = "popup-chips guidepost-routes__chips";
  ncnRefs.forEach((ref) => {
    const chip = document.createElement("span");
    chip.className = "popup-chip popup-chip--ncn";
    chip.textContent = ref;
    chips.appendChild(chip);
  });
  routeNames.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "popup-chip";
    chip.textContent = name;
    chips.appendChild(chip);
  });

  routesBlock.appendChild(chips);
  root.appendChild(routesBlock);
}

function formatSymbolLabel(sym) {
  if (!sym) return "";
  const key = sym.toLowerCase();
  if (key === "train_station") return "Station";
  if (key === "national_park") return "Peak District";
  return sym;
}

function normaliseRouteNames(value) {
  if (!value) return [];
  const list = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(";")
      : [];

  const cleaned = list
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);

  return Array.from(new Set(cleaned));
}

export async function addWayfinding(map, urlState) {
  const GUIDEPOST_SVG = await fetch("icons/guidepost.svg").then((r) =>
    r.text(),
  );
  const ROUTE_MARKER_SVG = `
    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26">
      <g fill="none" fill-rule="evenodd">
        <rect x="2.5" y="2.5" width="21" height="21" rx="3" fill="#0047aa" stroke="#0f172a" stroke-width="1.2" />
        <path d="M9 13h8" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" />
        <path d="M14 10l4 3-4 3" fill="none" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
      </g>
    </svg>`;

  await Promise.all([
    addSvgImage(map, "guidepost-icon", GUIDEPOST_SVG, { pixelRatio: 2 }),
    addSvgImage(map, "route-marker-icon", ROUTE_MARKER_SVG, { pixelRatio: 2 }),
  ]);

  map.addSource("wayfinding", {
    type: "geojson",
    data: `data/wayfinding.geojson`,
  });

  map.addLayer({
    id: "wayfinding-guidepost-layer",
    type: "symbol",
    source: "wayfinding",
    filter: ["!=", ["get", "information"], "route_marker"],
    layout: {
      "icon-image": "guidepost-icon",
      "icon-anchor": "bottom",
      "icon-size": 0.1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility:
        urlState.visibleLayers.size === 0
          ? "none"
          : urlState.visibleLayers.has("wayfinding-guidepost-layer")
            ? "visible"
            : "none",
    },
  });

  map.addLayer({
    id: "wayfinding-route-layer",
    type: "symbol",
    source: "wayfinding",
    filter: ["==", ["get", "information"], "route_marker"],
    layout: {
      "icon-image": "route-marker-icon",
      "icon-size": 1.1,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility:
        urlState.visibleLayers.size === 0
          ? "none"
          : urlState.visibleLayers.has("wayfinding-route-layer")
            ? "visible"
            : "none",
    },
  });

  placeLayer(map, "wayfinding-route-layer");
  placeLayer(map, "wayfinding-guidepost-layer");

  map.on("click", "wayfinding-guidepost-layer", (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const popup = new maplibregl.Popup()
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(buildGuidepostPopup(feature));
    showPopup(popup, "wayfinding-guidepost-layer").addTo(map);
  });

  map.on("click", "wayfinding-route-layer", (e) => {
    const feature = e.features && e.features[0];
    if (!feature) return;
    const popup = new maplibregl.Popup()
      .setLngLat(feature.geometry.coordinates)
      .setDOMContent(buildRouteMarkerPopup(feature));
    showPopup(popup, "wayfinding-route-layer").addTo(map);
  });

  map.on("mouseenter", "wayfinding-guidepost-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "wayfinding-guidepost-layer", () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("mouseenter", "wayfinding-route-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "wayfinding-route-layer", () => {
    map.getCanvas().style.cursor = "";
  });
}
