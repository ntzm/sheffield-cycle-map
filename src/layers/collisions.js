import { loadIcon, DENSE_ICON_SIZE } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildChips } from "../utils/popup.js";
import { addClickPopup } from "../utils/interactions.js";

const SEVERITY_LABELS = { 1: "Fatal", 2: "Serious", 3: "Slight" };
const WEATHER_LABELS = {
  1: "Fine, no high winds",
  2: "Raining, no high winds",
  3: "Snowing, no high winds",
  4: "Fine, high winds",
  5: "Raining, high winds",
  6: "Snowing, high winds",
  7: "Fog or mist",
  8: "Other",
  9: "Unknown",
};
const LIGHT_LABELS = {
  1: "Daylight",
  4: "Dark, street lights lit",
  5: "Dark, street lights unlit",
  6: "Dark, no street lights",
  7: "Dark, street lights unknown",
};
const ROAD_LABELS = {
  1: "Roundabout",
  2: "One way street",
  3: "Dual carriageway",
  6: "Single carriageway",
  7: "Slip road",
  9: "Unknown",
  12: "One way street/Slip road",
};

export async function addCollisions(map, urlState) {
  await Promise.all([
    loadIcon(map, "collision-triangle-fatal", "icons/collision-fatal.svg"),
    loadIcon(map, "collision-triangle-serious", "icons/collision-serious.svg"),
    loadIcon(map, "collision-triangle-slight", "icons/collision-slight.svg"),
  ]);

  map.addSource("dft-collisions", {
    type: "geojson",
    data: `data/dft_collisions.geojson`,
  });

  map.addLayer({
    id: "dft-collisions-layer",
    type: "symbol",
    source: "dft-collisions",
    layout: {
      "icon-image": [
        "case",
        ["==", ["get", "severity"], "1"],
        "collision-triangle-fatal",
        ["==", ["get", "severity"], "2"],
        "collision-triangle-serious",
        "collision-triangle-slight",
      ],
      "icon-size": DENSE_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "dft-collisions-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "dft-collisions-layer");
  addClickPopup(map, "dft-collisions-layer", buildCollisionPopup);
}

function buildCollisionPopup(feature) {
  const p = feature.properties;

  const { root } = createPopupContainer(`Collision on ${p.date} at ${p.time}`);

  const areaText =
    p.urban_or_rural === "1"
      ? "Urban"
      : p.urban_or_rural === "2"
        ? "Rural"
        : "Unknown area";
  const chips = buildChips([
    { text: severityLabel(p.severity), tone: severityTone(p.severity) },
    { text: areaText, tone: "info" },
  ]);
  if (chips) root.appendChild(chips);

  const grid = document.createElement("div");
  grid.className = "popup-spec-grid";
  addSpec(grid, "Cyclist injuries", formatCyclist(p));
  addSpec(grid, "Total casualties", p.casualties);
  addSpec(grid, "Vehicles involved", p.vehicles);
  addSpec(grid, "Other vehicles", formatOtherVehicles(p.other_vehicle_types));
  addSpec(grid, "Light", lightLabel(p.light_conditions));
  addSpec(grid, "Weather", weatherLabel(p.weather));
  addSpec(grid, "Road type", roadLabel(p.road_type));
  root.appendChild(grid);

  return root;
}

function formatDateTime(date, time) {
  return [date, time].filter(Boolean).join(" · ");
}

function severityLabel(val) {
  return SEVERITY_LABELS[String(val)] || "Unknown";
}

function severityTone(val) {
  const key = String(val);
  if (key === "1") return "alert";
  if (key === "2") return "warn";
  return "info";
}

function weatherLabel(val) {
  return WEATHER_LABELS[String(val)] || "Not recorded";
}

function lightLabel(val) {
  return LIGHT_LABELS[String(val)] || "Not recorded";
}

function roadLabel(val) {
  return ROAD_LABELS[String(val)] || "Not recorded";
}

function formatCyclist(p) {
  if (p.cyclist_casualties === undefined) return "Not recorded";
  const base = `${p.cyclist_casualties}`;
  return p.cyclist_casualties_inferred ? `${base} (inferred)` : base;
}

function addSpec(grid, label, value) {
  if (value === undefined || value === null || value === "") return;
  const wrap = document.createElement("div");
  wrap.className = "popup-spec";
  const lbl = document.createElement("div");
  lbl.className = "popup-spec__label";
  lbl.textContent = label;
  const val = document.createElement("div");
  val.className = "popup-spec__value";
  val.textContent = value;
  wrap.appendChild(lbl);
  wrap.appendChild(val);
  grid.appendChild(wrap);
}

function formatOtherVehicles(raw) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(";")
      : [];
  const cleaned = list
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter(Boolean);
  if (!cleaned.length) return undefined;
  return cleaned.join(", ");
}
