import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildChips } from "../utils/popup.js";
import { addClickPopup } from "../utils/interactions.js";

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

export function addBikeTheftsLayer(map, urlState) {
  map.addSource("bike-thefts", {
    type: "geojson",
    data: `data/bike_thefts.geojson`,
  });

  map.addLayer({
    id: "bike-theft-layer",
    type: "circle",
    source: "bike-thefts",
    paint: {
      "circle-radius": 4,
      "circle-color": "#fb923c",
      "circle-stroke-color": "#111827",
      "circle-stroke-width": 1,
      "circle-opacity": 0.85,
    },
    layout: {
      visibility: initialVisible(urlState, "bike-theft-layer", false)
        ? "visible"
        : "none",
    },
  });

  addClickPopup(map, "bike-theft-layer", buildPopup);

  placeLayer(map, "bike-theft-layer");
}
