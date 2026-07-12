import { loadIcon, DENSE_ICON_SIZE } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import {
  createPopupContainer,
  buildStandardFooter,
  buildChips,
} from "../utils/popup.js";
import { registerSheetLayer } from "../utils/interactions.js";
import { fetchGeojson } from "../utils/fetch-geojson.js";

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
      symbolGroup.forEach((sym, i) => {
        if (i > 0) symLine.appendChild(document.createTextNode(" · "));
        const el = renderSymbol(sym);
        if (el) symLine.appendChild(el);
      });
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
  const chipItems = [
    ...ncnRefs.map((ref) => ({ text: ref, tone: "ncn" })),
    ...routeNames.map((name) => ({ text: name })),
  ];
  const chips = buildChips(chipItems, "guidepost-routes__chips");
  if (chips) routesBlock.appendChild(chips);
  root.appendChild(routesBlock);
}

const SYMBOL_ICONS = {
  train_station: "icons/symbol-train-station.svg",
  national_park: "icons/symbol-national-park.svg",
};

function renderSymbol(sym) {
  if (!sym) return null;
  const key = sym.toLowerCase();
  const iconPath = SYMBOL_ICONS[key];
  if (iconPath) {
    const img = document.createElement("img");
    img.src = iconPath;
    img.alt = sym.replace(/_/g, " ");
    img.className = "guidepost-finger__symbol-icon";
    return img;
  }
  const span = document.createElement("span");
  span.textContent = sym;
  return span;
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
  const [data] = await Promise.all([
    fetchGeojson("data/wayfinding.geojson"),
    loadIcon(map, "guidepost-icon", "icons/guidepost.svg"),
    loadIcon(map, "route-marker-icon", "icons/route-marker.svg"),
  ]);

  map.addSource("wayfinding", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "wayfinding-guidepost-layer",
    type: "symbol",
    source: "wayfinding",
    filter: ["!=", ["get", "information"], "route_marker"],
    layout: {
      "icon-image": "guidepost-icon",
      "icon-size": DENSE_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "wayfinding-guidepost-layer", false)
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
      "icon-size": DENSE_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "wayfinding-route-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "wayfinding-route-layer");
  placeLayer(map, "wayfinding-guidepost-layer");

  const isRouteMarker = (f) => f.properties.information === "route_marker";
  registerSheetLayer(map, "wayfinding-guidepost-layer", {
    features: data.features.filter((f) => !isRouteMarker(f)),
    buildContent: buildGuidepostPopup,
  });
  registerSheetLayer(map, "wayfinding-route-layer", {
    features: data.features.filter(isRouteMarker),
    buildContent: buildRouteMarkerPopup,
  });
}
