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

// kind -> label and icon. Order is draw order: later kinds sit on top where
// crossings overlap (e.g. both halves of a dual carriageway).
const KINDS = {
  other: { label: "Crossing", icon: "crossing-other" },
  cycle_priority: {
    label: "Cycle priority crossing",
    icon: "crossing-cycle-priority",
  },
  continuous: { label: "Continuous crossing", icon: "crossing-continuous" },
  parallel: { label: "Parallel crossing", icon: "crossing-parallel" },
  pedestrian: {
    label: "Pedestrian signal crossing",
    icon: "crossing-pedestrian",
  },
  bicycle_signal: {
    label: "Crossing with bicycle signals",
    icon: "crossing-bicycle-signal",
  },
  toucan: { label: "Toucan crossing", icon: "crossing-toucan" },
};
const KIND_KEYS = Object.keys(KINDS);

// More specific titles for the catch-all "other" kind.
function otherTitle(p) {
  const values = [p.crossing, p.crossing_ref, p["crossing:markings"]];
  if (values.includes("zebra")) return "Zebra crossing";
  if (p.crossing === "unmarked" || p["crossing:markings"] === "no") {
    return "Unmarked crossing";
  }
  if (p.crossing === "informal") return "Informal crossing";
  if (p.crossing === "marked" || p.crossing === "uncontrolled") {
    return "Marked crossing";
  }
  return KINDS.other.label;
}

export async function addCrossingsLayer(map, urlState) {
  const [data] = await Promise.all([
    fetchGeojson("data/crossings.geojson"),
    ...KIND_KEYS.map((k) =>
      loadIcon(map, `${KINDS[k].icon}-icon`, `icons/${KINDS[k].icon}.svg`),
    ),
  ]);

  map.addSource("crossings", {
    type: "geojson",
    data,
  });

  map.addLayer({
    id: "crossings-layer",
    type: "symbol",
    source: "crossings",
    layout: {
      "icon-image": [
        "match",
        ["get", "kind"],
        ...KIND_KEYS.flatMap((k) => [k, `${KINDS[k].icon}-icon`]),
        "crossing-other-icon",
      ],
      "icon-size": DENSE_ICON_SIZE,
      "icon-anchor": "center",
      "icon-allow-overlap": true,
      "symbol-sort-key": [
        "match",
        ["get", "kind"],
        ...KIND_KEYS.flatMap((k, i) => [k, i]),
        0,
      ],
      visibility: initialVisible(urlState, "crossings-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "crossings-layer");

  const buildCrossingPopup = (feature) => {
    const p = feature.properties;
    const title =
      p.kind === "other" ? otherTitle(p) : (KINDS[p.kind] || KINDS.other).label;
    const { root } = createPopupContainer(title);

    if (p.island) {
      root.appendChild(
        buildChips([{ text: "Traffic island", tone: "neutral" }]),
      );
    }
    root.appendChild(buildStandardFooter(feature));
    return root;
  };
  registerSheetLayer(map, "crossings-layer", {
    features: data.features,
    buildContent: buildCrossingPopup,
  });
}
