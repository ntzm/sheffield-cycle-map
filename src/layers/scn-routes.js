// Sheffield Cycle Network routes: the council's new set of fully signed,
// high-quality cycle routes (cycle_network=GB:Sheffield Cycle Network in
// OSM). One entry per route; the layer control, map layers and layer order
// are all derived from this list, so adding a route is a one-line change
// here (the pipeline already emits every SCN relation to data/scn.geojson).
//
// Kept free of imports so both layer-order.js and the layers can use it
// without a cycle.
export const SCN_ROUTES = [
  { ref: "1", color: "#facc15", textColor: "#111827" },
];

export function scnLineLayerId(ref) {
  return `scn-${ref}-layer`;
}

export function scnShieldLayerId(ref) {
  return `scn-${ref}-shield-layer`;
}

// Line layer ids, top-most route first (matches list order).
export const SCN_LINE_LAYER_IDS = SCN_ROUTES.map((r) => scnLineLayerId(r.ref));
export const SCN_SHIELD_LAYER_IDS = SCN_ROUTES.map((r) =>
  scnShieldLayerId(r.ref),
);
export const SCN_LAYER_IDS = [...SCN_LINE_LAYER_IDS, ...SCN_SHIELD_LAYER_IDS];
