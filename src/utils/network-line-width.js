// Line width for the NCN / LCN / SCN route layers. Oneway sections (the
// pipeline sets `oneway: true` where a route splits into two one-directional
// legs, or follows a way that is oneway for bicycles) are drawn at half width
// so a pair of legs reads as one route rather than two.
const ONEWAY_FACTOR = ["case", ["to-boolean", ["get", "oneway"]], 0.5, 1];

export const NETWORK_LINE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  10,
  ["*", 6, ONEWAY_FACTOR],
  13,
  ["*", 10, ONEWAY_FACTOR],
  15,
  ["*", 14, ONEWAY_FACTOR],
  17,
  ["*", 18, ONEWAY_FACTOR],
];
