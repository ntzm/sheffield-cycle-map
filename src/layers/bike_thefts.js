import { placeLayer } from "../utils/layer-order.js";
import { loadIcon, DENSE_ICON_SIZE } from "../utils/icons.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildChips } from "../utils/popup.js";
import { registerSheetLayer } from "../utils/interactions.js";
import { fetchGeojson } from "../utils/fetch-geojson.js";

const outcomeTone = {
  "Investigation complete; no suspect identified": "alert",
  "Unable to prosecute suspect": "warn",
  "Status update unavailable": "warn",
  "Court result unavailable": "warn",
  "Under investigation": "info",
  "Awaiting court outcome": "info",
  "Local resolution": "positive",
};

function prettyDateMonth(value) {
  if (!value) return null;
  const d = new Date(value);
  if (!Number.isFinite(d.valueOf())) return null;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short" });
}

function buildPopup(feature) {
  const props = feature.properties;
  const { root, heading } = createPopupContainer("Bicycle theft");
  const streetText =
    props.street === "On or near " ? "Unknown street" : props.street;
  heading.textContent = `Bike theft — ${streetText}`;

  if (props.outcome) {
    const tone = outcomeTone[props.outcome] || "warn";
    const chips = buildChips([{ text: props.outcome, tone }]);
    if (chips) root.appendChild(chips);
  }

  const datesRow = document.createElement("div");
  datesRow.className = "popup-footer-row";

  const reportedCell = document.createElement("div");
  reportedCell.className = "popup-footer-row__cell";
  const repLabel = document.createElement("span");
  repLabel.className = "popup-footer-row__label";
  repLabel.textContent = "Reported";
  const repVal = document.createElement("span");
  repVal.className = "popup-footer-row__value";
  repVal.textContent = prettyDateMonth(props.month + "-01") || props.month;
  reportedCell.appendChild(repLabel);
  reportedCell.appendChild(repVal);
  datesRow.appendChild(reportedCell);

  const outcomeCell = document.createElement("div");
  outcomeCell.className = "popup-footer-row__cell";
  const outLabel = document.createElement("span");
  outLabel.className = "popup-footer-row__label";
  outLabel.textContent = "Outcome";
  const outVal = document.createElement("span");
  outVal.className = "popup-footer-row__value";
  outVal.textContent = prettyDateMonth(props.outcome_date) || "—";
  outcomeCell.appendChild(outLabel);
  outcomeCell.appendChild(outVal);
  datesRow.appendChild(outcomeCell);

  root.appendChild(datesRow);

  return root;
}

export async function addBikeTheftsLayer(map, urlState) {
  const [data] = await Promise.all([
    fetchGeojson("data/bike_thefts.geojson"),
    loadIcon(map, "theft-icon", "icons/theft.svg"),
  ]);

  map.addSource("bike-thefts", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "bike-theft-layer",
    type: "symbol",
    source: "bike-thefts",
    layout: {
      "icon-image": "theft-icon",
      "icon-size": DENSE_ICON_SIZE,
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "bike-theft-layer", false)
        ? "visible"
        : "none",
    },
  });

  registerSheetLayer(map, "bike-theft-layer", {
    features: data.features,
    // The police API's numeric id is not stable across data reloads; the
    // persistent_id is, but is occasionally empty.
    featureKey: (props) => props.persistent_id || String(props.id),
    buildContent: buildPopup,
  });

  placeLayer(map, "bike-theft-layer");
}
