// Centralized layer z-order. Earlier = on top.
export const LAYER_ORDER = [
  "dft-collisions-layer",
  "bike-theft-layer",
  "wayfinding-route-layer",
  "wayfinding-guidepost-layer",
  "pumps-x-layer",
  "pumps-layer",
  "shops-layer",
  "signs-layer",
  "parking-hub-layer",
  "parking-public-layer",
  "parking-hangar-layer",
  "parking-private-layer",
  "counters-layer",
  "ncn-layer",
  "lcn-layer",
  "embedded-tram-tracks-layer",
  "asl-layer",
  "cycleway-lane-wide-layer",
  "cycleway-lane-narrow-layer",
  "cycleway-segregated-layer",
  "cycleway-unsegregated-layer",
  "gritting-primary-layer",
  "gritting-secondary-layer",
  "boundary-layer",
];

// Insert/position a layer according to LAYER_ORDER.
export function placeLayer(map, layerId) {
  if (!map.getLayer(layerId)) return;
  const idx = LAYER_ORDER.indexOf(layerId);
  if (idx === -1) return;
  for (let i = idx - 1; i >= 0; i--) {
    const aboveId = LAYER_ORDER[i];
    if (map.getLayer(aboveId)) {
      map.moveLayer(layerId, aboveId);
      return;
    }
  }
}

// Enforce the global order regardless of add sequence.
export function reorderLayers(map) {
  let anchor = null; // top-most anchor
  for (const id of LAYER_ORDER) {
    if (!map.getLayer(id)) continue;
    map.moveLayer(id, anchor === null ? undefined : anchor);
    anchor = id;
  }
}
