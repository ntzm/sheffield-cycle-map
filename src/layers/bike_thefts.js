import maplibregl from "maplibre-gl";
import { placeLayer } from "../utils/layer-order.js";
import { showPopup } from "../utils/popup-singleton.js";
import { createPopupContainer } from "../utils/popup.js";

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

function buildPopup(props) {
  const { root, heading } = createPopupContainer("Bicycle theft");
  const streetText =
    props.street === "On or near " ? "Unknown street" : props.street;
  heading.textContent = `Bike theft — ${streetText}`;

  if (props.outcome) {
    const chipWrap = document.createElement("div");
    chipWrap.className = "popup-chips";
    const chip = document.createElement("span");
    const tone = outcomeTone[props.outcome] || "warn";
    chip.className = `popup-chip popup-chip--${tone}`;
    chip.textContent = props.outcome;
    chipWrap.appendChild(chip);
    root.appendChild(chipWrap);
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
      visibility: urlState.visibleLayers.has("bike-theft-layer")
        ? "visible"
        : "none",
    },
  });

  map.on("click", "bike-theft-layer", (e) => {
    const f = e.features[0];
    const coords = f.geometry.coordinates.slice();
    const popup = new maplibregl.Popup()
      .setLngLat(coords)
      .setDOMContent(buildPopup(f.properties));
    showPopup(popup, "bike-theft-layer").addTo(map);
  });
  map.on("mouseenter", "bike-theft-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "bike-theft-layer", () => {
    map.getCanvas().style.cursor = "";
  });

  placeLayer(map, "bike-theft-layer");
}
