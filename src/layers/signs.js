import maplibregl from "maplibre-gl";
import { addSvgImage } from "../utils/icons.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { showPopup } from "../utils/popup-singleton.js";

const SIGN_ICON_FILES = [
  "951",
  "953",
  "955",
  "956",
  "956.1",
  "957",
  "957R",
  "960.1",
  "960.2",
  "965",
  "966",
  "967",
  "968.1",
];
const warnedSigns = new Set();

const SIGN_INFO = {
  951: {
    name: "Cycling prohibited",
    description: "No cycling allowed, but pushing your bike is fine.",
  },
  953: {
    name: "Buses, cycles and taxis only",
    description: "",
  },
  955: {
    name: "Cycles only",
    description: "Reserved solely for pedal cycles.",
  },
  956: {
    name: "Unsegregated shared path",
    description:
      "Shared path without separation between people walking and people cycling.",
  },
  956.1: {
    name: "Unsegregated shared path with horses",
    description:
      "Shared path without separation between people walking, people cycling and people riding horses.",
  },
  957: {
    name: "Segregated shared path",
    description:
      "Shared path with separate sides for people walking and people cycling.",
  },
  "957R": {
    name: "Segregated shared path",
    description:
      "Shared path with separate sides for people walking and people cycling.",
  },
  960.1: {
    name: "Contraflow with lane",
    description:
      "Motor traffic one way, bicycle traffic both ways with a contraflow lane.",
  },
  960.2: {
    name: "Contraflow without lane",
    description: "Motor traffic one way, bicycle traffic both ways.",
  },
  965: {
    name: "End of cycle route or lane",
    description:
      "Indicates the end of a cycle lane, track or signed cycle route.",
  },
  967: {
    name: "Cycle route on carriageway",
    description: "Route recommended for pedal cycles on the main carriageway.",
  },
  968.1: {
    name: "Cycle parking",
    description: "Indicates a parking place provided for pedal cycles.",
  },
};

async function loadSignIcons(map) {
  await Promise.all(
    SIGN_ICON_FILES.map(async (file) => {
      const svg = await fetch(`icons/signs/${file}.svg`).then((r) => r.text());
      await addSvgImage(map, `sign-${file}`, svg, { pixelRatio: 2 });
    }),
  );
}

function pickIconNames(trafficSign) {
  if (!trafficSign) return [];
  const parts = trafficSign.split(";");
  const icons = [];
  for (const partRaw of parts) {
    const part = partRaw.trim();
    const match = part.match(/^[A-Z]{2}:(\d+(?:\.\d+)?)/);
    if (!match) continue;
    const codeRaw = match[1];
    if (SIGN_ICON_FILES.includes(codeRaw)) {
      icons.push({ iconName: `sign-${codeRaw}`, code: codeRaw });
      continue;
    }
    const codeBase = codeRaw.split(".")[0];
    if (SIGN_ICON_FILES.includes(codeBase))
      icons.push({ iconName: `sign-${codeBase}`, code: codeBase });
  }
  return icons;
}

export async function addSignsLayer(map, urlState) {
  await loadSignIcons(map);

  const signsGeojson = await fetch("data/signs.geojson").then((r) => r.json());
  const explodedFeatures = [];

  for (const feature of signsGeojson.features) {
    const icons = pickIconNames(feature.properties.traffic_sign);

    if (icons.length === 0 && feature.properties.traffic_sign) {
      const raw = feature.properties.traffic_sign;
      if (!warnedSigns.has(raw)) {
        console.warn("Unsupported traffic_sign value, skipping icon:", raw);
        warnedSigns.add(raw);
      }
      continue;
    }

    const offsetStep = 100;
    const startOffset = -((icons.length - 1) / 2) * offsetStep;

    icons.forEach(({ iconName, code }, idx) => {
      explodedFeatures.push({
        ...feature,
        properties: {
          ...feature.properties,
          signIcon: iconName,
          signCode: code,
          iconOffset: [startOffset + idx * offsetStep, 0],
        },
      });
    });
  }

  map.addSource("signs", {
    type: "geojson",
    data: { type: "FeatureCollection", features: explodedFeatures },
  });

  map.addLayer({
    id: "signs-layer",
    type: "symbol",
    source: "signs",
    layout: {
      "icon-image": ["get", "signIcon"],
      "icon-size": 0.2,
      "icon-offset": ["get", "iconOffset"],
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "signs-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "signs-layer");

  map.on("click", "signs-layer", (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const info = SIGN_INFO[f.properties.signCode] || null;
    const { root, heading } = createPopupContainer(info?.name || "Sign");
    heading.textContent = info?.name || "Sign";

    if (info?.description) {
      const desc = document.createElement("p");
      desc.textContent = info.description;
      root.appendChild(desc);
    }

    const report = document.createElement("a");
    report.href =
      "https://forms.sheffield.gov.uk/site/form/auto/road_street_sign_bollard";
    report.target = "_blank";
    report.rel = "noopener noreferrer";
    report.textContent = "Report a problem with this sign";
    report.className = "popup-link";
    root.appendChild(report);

    const footer = buildStandardFooter(f);
    root.appendChild(footer);

    const popup = new maplibregl.Popup()
      .setLngLat(f.geometry.coordinates)
      .setDOMContent(root);

    showPopup(popup, "signs-layer").addTo(map);
  });

  map.on("mouseenter", "signs-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "signs-layer", () => {
    map.getCanvas().style.cursor = "";
  });
}
