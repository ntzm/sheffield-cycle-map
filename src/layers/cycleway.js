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
  const sideSign = (prop) => ["match", ["get", prop], "left", -1, "right", 1, 0];
  const trackSideSign = sideSign("trackSide");
  const laneSideSign = sideSign("laneSide");

  const seg = ["coalesce", ["get", "segregated"], ""];
  const notTunnel = ["!=", ["coalesce", ["get", "tunnel"], ""], "yes"];
  const isTunnel = ["==", ["coalesce", ["get", "tunnel"], ""], "yes"];

  const lineWidth = [
    "interpolate", ["linear"], ["zoom"],
    10, ["*", 1.4, onewayFactor],
    13, ["*", 2.2, onewayFactor],
    15, ["*", 3.6, onewayFactor],
    17, ["*", 4.8, onewayFactor],
  ];

  const lineOffset = (sign) => [
    "interpolate", ["linear"], ["zoom"],
    10, ["*", sign, 1.2],
    13, ["*", sign, 2.1],
    16, ["*", sign, 3.6],
    18, ["*", sign, 5.2],
  ];

  const vis = (id) => initialVisible(urlState, id, true) ? "visible" : "none";

  const layers = [
    // Surface paths
    {
      id: "cycleway-segregated-layer",
      filter: ["all", ["==", ["get", "kind"], "path"], ["==", seg, "yes"], notTunnel],
      color: "#c63b2b", opacity: 0.9, blur: 0.12,
      offset: trackSideSign, vis: vis("cycleway-segregated-layer"),
    },
    {
      id: "cycleway-unsegregated-layer",
      filter: ["all", ["==", ["get", "kind"], "path"], ["!=", seg, "yes"], notTunnel],
      color: "#e58f85", opacity: 0.9, blur: 0.12,
      offset: trackSideSign, vis: vis("cycleway-unsegregated-layer"),
    },
    // Tunnel paths
    {
      id: "cycleway-path-tunnel-layer",
      filter: ["all", ["==", ["get", "kind"], "path"], isTunnel],
      color: "#b08080", opacity: 0.4, blur: 0.12,
      offset: trackSideSign, vis: vis("cycleway-segregated-layer"),
    },
    // Surface lanes
    {
      id: "cycleway-lane-wide-layer",
      filter: ["all", ["==", ["get", "kind"], "lane"],
        [">=", ["coalesce", ["get", "laneWidth"], 0], 1.5], notTunnel],
      color: "#c63b2b", opacity: 0.95, blur: 0.08,
      offset: laneSideSign, vis: vis("cycleway-lane-wide-layer"), dashed: true,
    },
    {
      id: "cycleway-lane-narrow-layer",
      filter: ["all", ["==", ["get", "kind"], "lane"],
        ["<", ["coalesce", ["get", "laneWidth"], 0], 1.5], notTunnel],
      color: "#e58f85", opacity: 0.95, blur: 0.08,
      offset: laneSideSign, vis: vis("cycleway-lane-narrow-layer"), dashed: true,
    },
    // Tunnel lanes
    {
      id: "cycleway-lane-tunnel-layer",
      filter: ["all", ["==", ["get", "kind"], "lane"], isTunnel],
      color: "#b08080", opacity: 0.4, blur: 0.08,
      offset: laneSideSign, vis: vis("cycleway-lane-wide-layer"), dashed: true,
    },
  ];

  for (const { id, filter, color, opacity, blur, offset, vis, dashed } of layers) {
    map.addLayer({
      id,
      type: "line",
      source: "cycleway",
      filter,
      layout: {
        "line-join": "round",
        "line-cap": "round",
        visibility: vis,
      },
      paint: {
        "line-color": color,
        "line-opacity": opacity,
        "line-blur": blur,
        "line-width": lineWidth,
        "line-offset": lineOffset(offset),
        ...(dashed && { "line-dasharray": [2.4, 1.6] }),
      },
    });
    placeLayer(map, id);
  }
}
