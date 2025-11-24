import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";

export function addCycleway(map, urlState) {
  map.addSource("cycleway", {
    type: "geojson",
    data: `data/cycleway.geojson`,
  });

  const onewayFactor = [
    "case",
    ["==", ["get", "effectiveOneway"], "yes"],
    0.5,
    1,
  ];
  const trackSideSign = [
    "match",
    ["get", "trackSide"],
    "left",
    -1,
    "right",
    1,
    0,
  ];
  const laneSideSign = [
    "match",
    ["get", "laneSide"],
    "left",
    -1,
    "right",
    1,
    0,
  ];

  const pathPaint = {
    "line-opacity": 0.9,
    "line-blur": 0.12,
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      ["*", 1.4, onewayFactor],
      13,
      ["*", 2.2, onewayFactor],
      15,
      ["*", 3.6, onewayFactor],
      17,
      ["*", 4.8, onewayFactor],
    ],
    "line-offset": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      ["*", trackSideSign, 1.2],
      13,
      ["*", trackSideSign, 2.1],
      16,
      ["*", trackSideSign, 3.6],
      18,
      ["*", trackSideSign, 5.2],
    ],
  };

  map.addLayer({
    id: "cycleway-segregated-layer",
    type: "line",
    source: "cycleway",
    filter: [
      "all",
      ["==", ["get", "kind"], "path"],
      ["==", ["coalesce", ["get", "segregated"], ""], "yes"],
    ],
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility:
        initialVisible(urlState, "cycleway-segregated-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer")
          ? "visible"
          : "none",
    },
    paint: {
      ...pathPaint,
      "line-color": "#c63b2b",
    },
  });

  map.addLayer({
    id: "cycleway-unsegregated-layer",
    type: "line",
    source: "cycleway",
    filter: [
      "all",
      ["==", ["get", "kind"], "path"],
      ["!=", ["coalesce", ["get", "segregated"], ""], "yes"],
    ],
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility:
        initialVisible(urlState, "cycleway-unsegregated-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer")
          ? "visible"
          : "none",
    },
    paint: {
      ...pathPaint,
      "line-color": "#e58f85",
    },
  });

  const laneBasePaint = {
    "line-opacity": 0.95,
    "line-blur": 0.08,
    "line-width": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      ["*", 1.4, onewayFactor],
      13,
      ["*", 2.2, onewayFactor],
      15,
      ["*", 3.6, onewayFactor],
      17,
      ["*", 4.8, onewayFactor],
    ],
    "line-offset": [
      "interpolate",
      ["linear"],
      ["zoom"],
      10,
      ["*", laneSideSign, 1.2],
      13,
      ["*", laneSideSign, 2.1],
      16,
      ["*", laneSideSign, 3.6],
      18,
      ["*", laneSideSign, 5.2],
    ],
  };

  map.addLayer({
    id: "cycleway-lane-wide-layer",
    type: "line",
    source: "cycleway",
    filter: [
      "all",
      ["==", ["get", "kind"], "lane"],
      [">=", ["coalesce", ["get", "laneWidth"], 0], 1.5],
    ],
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility:
        initialVisible(urlState, "cycleway-lane-wide-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer")
          ? "visible"
          : "none",
    },
    paint: {
      ...laneBasePaint,
      "line-color": "#c63b2b",
      "line-dasharray": ["literal", [2.4, 1.6]],
    },
  });

  map.addLayer({
    id: "cycleway-lane-narrow-layer",
    type: "line",
    source: "cycleway",
    filter: [
      "all",
      ["==", ["get", "kind"], "lane"],
      ["<", ["coalesce", ["get", "laneWidth"], 0], 1.5],
    ],
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility:
        initialVisible(urlState, "cycleway-lane-narrow-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer")
          ? "visible"
          : "none",
    },
    paint: {
      ...laneBasePaint,
      "line-color": "#e58f85",
      "line-dasharray": ["literal", [2.4, 1.6]],
    },
  });

  placeLayer(map, "cycleway-lane-narrow-layer");
  placeLayer(map, "cycleway-lane-wide-layer");
  placeLayer(map, "cycleway-unsegregated-layer");
  placeLayer(map, "cycleway-segregated-layer");
}
