// Layers above basemap labels (points / symbols). Earlier = on top.
const ABOVE_LABELS = [
  "dft-collisions-layer",
  "bike-theft-layer",
  "wayfinding-route-layer",
  "wayfinding-guidepost-layer",
  "pumps-x-layer",
  "pumps-layer",
  "drinking-water-layer",
  "shops-layer",
  "shops-highlight-layer",
  "signs-layer",
  "traffic-calming-layer",
  "parking-hub-layer",
  "parking-public-layer",
  "parking-hangar-layer",
  "parking-private-layer",
  "counters-layer",
  "asl-layer",
];

// Layers below basemap labels (lines). Earlier = on top.
const BELOW_LABELS = [
  "ncn-layer",
  "lcn-layer",
  "embedded-tram-tracks-layer",
  "cycleway-lane-wide-layer",
  "cycleway-lane-narrow-layer",
  "cycleway-segregated-layer",
  "cycleway-unsegregated-layer",
  "boundary-layer",
];

// Scheme plan image overlays ("schemes-<id>-layer") render below all custom
// line/point layers. They are matched by prefix rather than listed here so new
// plans only need registering in schemes.json + schemes.js.
export function isSchemeLayer(id) {
  return id.startsWith("schemes-") && id.endsWith("-layer");
}

// Tunnel layers rendered below basemap roads. Earlier = on top.
const BELOW_ROADS = [
  "cycleway-lane-tunnel-layer",
  "cycleway-path-tunnel-layer",
];

// Custom layers that should sit alongside TOP_LABELS at the very top.
const TOP_CUSTOM = ["ncn-shield-layer"];

// Basemap place-name and road-shield layers that should always be on top.
const TOP_LABELS = [
  "highway-shield-non-us",
  "highway-shield-us-interstate",
  "road_shield_us",
  "label_other",
  "label_village",
  "label_town",
  "label_state",
  "label_city",
  "label_city_capital",
  "label_country_3",
  "label_country_2",
  "label_country_1",
];

// Combined order for lookups (top-most first).
export const LAYER_ORDER = [
  ...TOP_CUSTOM,
  ...ABOVE_LABELS,
  ...BELOW_LABELS,
  ...BELOW_ROADS,
];

// Find the first basemap road layer (skip highway_path which renders
// cycleways/footpaths — we want tunnel cycleways above that but below roads).
function firstBasemapRoad(map) {
  for (const layer of map.getStyle().layers) {
    if (
      layer.type === "line" &&
      (layer.id.startsWith("highway_") || layer.id.startsWith("highway-")) &&
      layer.id !== "highway_path" &&
      layer.id !== "highway-path"
    ) {
      return layer.id;
    }
  }
  return undefined;
}

// Find the first basemap label (symbol) layer that isn't a place label.
function firstBasemapLabel(map) {
  for (const layer of map.getStyle().layers) {
    if (
      layer.type === "symbol" &&
      !LAYER_ORDER.includes(layer.id) &&
      !TOP_LABELS.includes(layer.id)
    ) {
      return layer.id;
    }
  }
  return undefined;
}

// Insert/position a layer according to LAYER_ORDER.
export function placeLayer(map, layerId) {
  if (!map.getLayer(layerId)) return;
  if (isSchemeLayer(layerId)) {
    // Below the lowest existing custom line layer, else below basemap labels.
    for (let i = BELOW_LABELS.length - 1; i >= 0; i--) {
      if (map.getLayer(BELOW_LABELS[i])) {
        map.moveLayer(layerId, BELOW_LABELS[i]);
        return;
      }
    }
    const ceiling = firstBasemapLabel(map);
    if (ceiling) map.moveLayer(layerId, ceiling);
    return;
  }
  const idx = LAYER_ORDER.indexOf(layerId);
  if (idx === -1) return;
  for (let i = idx - 1; i >= 0; i--) {
    const aboveId = LAYER_ORDER[i];
    if (map.getLayer(aboveId)) {
      map.moveLayer(layerId, aboveId);
      return;
    }
  }
  // No higher custom layer exists yet; use the appropriate ceiling.
  if (BELOW_ROADS.includes(layerId)) {
    const ceiling = firstBasemapRoad(map);
    if (ceiling) map.moveLayer(layerId, ceiling);
  } else if (BELOW_LABELS.includes(layerId)) {
    const ceiling = firstBasemapLabel(map);
    if (ceiling) map.moveLayer(layerId, ceiling);
  }
}

// Enforce the global order regardless of add sequence.
export function reorderLayers(map) {
  // Place tunnel layers below basemap roads.
  const roadCeiling = firstBasemapRoad(map);
  let anchor = roadCeiling;
  for (const id of BELOW_ROADS) {
    if (!map.getLayer(id)) continue;
    map.moveLayer(id, anchor);
    anchor = id;
  }

  const labelCeiling = firstBasemapLabel(map);

  // Place line layers below basemap labels.
  anchor = labelCeiling;
  for (const id of BELOW_LABELS) {
    if (!map.getLayer(id)) continue;
    map.moveLayer(id, anchor);
    anchor = id;
  }

  // Scheme plan overlays go below all custom line layers. Walk top-down so
  // their relative stacking (add order: later plans on top) is preserved.
  for (const layer of [...map.getStyle().layers].reverse()) {
    if (!isSchemeLayer(layer.id)) continue;
    map.moveLayer(layer.id, anchor);
    anchor = layer.id;
  }

  // Place point/symbol layers above street labels but below place labels.
  const firstPlace = TOP_LABELS.find((id) => map.getLayer(id));
  anchor = firstPlace || null;
  for (const id of ABOVE_LABELS) {
    if (!map.getLayer(id)) continue;
    map.moveLayer(id, anchor === null ? undefined : anchor);
    anchor = id;
  }

  // Lift place-name labels and NCN shields to the very top.
  for (const id of [...TOP_LABELS, ...TOP_CUSTOM]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}
