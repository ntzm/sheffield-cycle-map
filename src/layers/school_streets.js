import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import {
  createPopupContainer,
  buildStandardFooter,
  buildChips,
} from "../utils/popup.js";
import { registerSheetLayer } from "../utils/interactions.js";
import { fetchGeojson } from "../utils/fetch-geojson.js";
import {
  renderOpeningHoursTable,
  isOpenNow,
} from "../utils/opening-hours.js";

const RESTRICTION_TEXT = {
  no: "Closed to motor traffic",
  private: "Closed to motor traffic except permit holders",
  permit: "Closed to motor traffic except permit holders",
  destination: "Closed to through motor traffic",
};

function buildSchoolStreetPopup(feature) {
  const p = feature.properties;
  const { root } = createPopupContainer(p.name || "School street");

  if (isOpenNow(p.hours)) {
    root.appendChild(
      buildChips([{ text: "Restriction in force now", tone: "positive" }]),
    );
  }

  const meta = document.createElement("div");
  meta.className = "popup__meta";
  meta.textContent = p.hours
    ? `School street. ${RESTRICTION_TEXT[p.restriction] || "Motor traffic restricted"} at these times:`
    : "School street. Motor traffic is restricted around school start and finish times.";
  root.appendChild(meta);

  const hoursCard = renderOpeningHoursTable(p.hours, { hideClosed: true });
  if (hoursCard) root.appendChild(hoursCard);

  root.appendChild(buildStandardFooter(feature));
  return root;
}

export async function addSchoolStreets(map, urlState) {
  const data = await fetchGeojson("data/school_streets.geojson");

  map.addSource("school-streets", { type: "geojson", data });

  map.addLayer({
    id: "school-streets-layer",
    type: "line",
    source: "school-streets",
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: initialVisible(urlState, "school-streets-layer", false)
        ? "visible"
        : "none",
    },
    paint: {
      "line-color": "#e8a33d",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        2,
        13,
        5,
        15,
        9,
        17,
        16,
      ],
      "line-opacity": 0.7,
    },
  });

  placeLayer(map, "school-streets-layer");

  registerSheetLayer(map, "school-streets-layer", {
    features: data.features,
    buildContent: buildSchoolStreetPopup,
  });
}
