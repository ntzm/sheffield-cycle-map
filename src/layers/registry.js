// Declarative registry of all map layers: which groups exist, how they load,
// and how they appear in the layer control. main.js derives everything else
// (lazy loading, URL state, selection restore) from this.
import { addBoundaryLayer } from "./boundary.js";
import { addPumpsLayer } from "./pumps.js";
import { addDrinkingWaterLayer } from "./drinking_water.js";
import { addParkingLayers } from "./parking.js";
import { addWayfinding } from "./wayfinding.js";
import { addCycleway } from "./cycleway.js";
import { addContraflow } from "./contraflow.js";
import { addNcn } from "./ncn.js";
import { addLcn } from "./lcn.js";
import { addEmbeddedTramTracks } from "./tram.js";
import { addCollisions } from "./collisions.js";
import { addCounters } from "./counters.js";
import { addAslLayer } from "./asl.js";
import { addSignsLayer } from "./signs.js";
import { addTrafficCalmingLayer } from "./traffic_calming.js";
import { addShopsLayer } from "./shops.js";
import { addBikeTheftsLayer } from "./bike_thefts.js";
import { addSchemesLayers, SCHEME_LAYER_IDS } from "./schemes.js";

// Lazy-loaded layer groups. `key` is the loader id; `layerIds` are all the
// map layer ids the loader creates (used to route control toggles and
// selection restores to the right loader).
export const LAYER_GROUPS = [
  {
    key: "shops-layer",
    layerIds: ["shops-layer", "shops-highlight-layer"],
    load: addShopsLayer,
  },
  {
    key: "parking-all-layer",
    layerIds: [
      "parking-all-layer",
      "parking-public-layer",
      "parking-private-layer",
      "parking-hub-layer",
      "parking-hangar-layer",
    ],
    load: addParkingLayers,
  },
  {
    key: "cycleway-all-layer",
    layerIds: [
      "cycleway-all-layer",
      "cycleway-segregated-layer",
      "cycleway-unsegregated-layer",
      "cycleway-lane-narrow-layer",
      "cycleway-lane-wide-layer",
    ],
    load: addCycleway,
  },
  {
    key: "contraflow-layer",
    layerIds: ["contraflow-layer"],
    load: addContraflow,
  },
  {
    key: "wayfinding-all-layer",
    layerIds: [
      "wayfinding-all-layer",
      "wayfinding-guidepost-layer",
      "wayfinding-route-layer",
    ],
    load: addWayfinding,
  },
  {
    key: "embedded-tram-tracks-layer",
    layerIds: ["embedded-tram-tracks-layer"],
    load: addEmbeddedTramTracks,
  },
  {
    key: "dft-collisions-layer",
    layerIds: ["dft-collisions-layer"],
    load: addCollisions,
  },
  {
    key: "bike-theft-layer",
    layerIds: ["bike-theft-layer"],
    load: addBikeTheftsLayer,
  },
  {
    key: "pumps-layer",
    layerIds: ["pumps-layer", "pumps-x-layer"],
    load: addPumpsLayer,
  },
  {
    key: "drinking-water-layer",
    layerIds: ["drinking-water-layer"],
    load: addDrinkingWaterLayer,
  },
  {
    key: "counters-layer",
    layerIds: ["counters-layer"],
    load: addCounters,
  },
  { key: "asl-layer", layerIds: ["asl-layer"], load: addAslLayer },
  { key: "signs-layer", layerIds: ["signs-layer"], load: addSignsLayer },
  {
    key: "traffic-calming-layer",
    layerIds: ["traffic-calming-layer"],
    load: addTrafficCalmingLayer,
  },
  {
    key: "schemes-layer",
    layerIds: ["schemes-layer", ...SCHEME_LAYER_IDS],
    load: addSchemesLayers,
  },
  {
    key: "ncn-layer",
    layerIds: ["ncn-layer", "ncn-shield-layer"],
    load: addNcn,
  },
  { key: "lcn-layer", layerIds: ["lcn-layer"], load: addLcn },
  {
    key: "boundary-layer",
    layerIds: ["boundary-layer"],
    load: addBoundaryLayer,
  },
];

// Layer control entries, in display order. `defaultOn` is the visibility used
// when the URL doesn't pin an explicit layer list.
export const CONTROL_ITEMS = [
  {
    id: "parking-all-layer",
    name: "Cycle parking",
    defaultOn: true,
    linkedLayers: [
      "parking-public-layer",
      "parking-private-layer",
      "parking-hub-layer",
      "parking-hangar-layer",
    ],
    virtual: true,
  },
  {
    id: "parking-public-layer",
    name: "Public parking",
    description: "Public or customer cycle parking. Data from OpenStreetMap.",
    legendIcon: "icons/parking-public.svg",
    defaultOn: true,
    parentId: "parking-all-layer",
  },
  {
    id: "parking-private-layer",
    name: "Private parking",
    description:
      "Cycle parking that is not accessible to the public. Data from OpenStreetMap.",
    legendIcon: "icons/parking-private.svg",
    defaultOn: true,
    parentId: "parking-all-layer",
  },
  {
    id: "parking-hub-layer",
    name: "Cycle hubs",
    description: "Secure cycle hubs. Data from OpenStreetMap.",
    legendIcon: "icons/parking-hub.svg",
    defaultOn: true,
    parentId: "parking-all-layer",
  },
  {
    id: "parking-hangar-layer",
    name: "Cycle hangars",
    description: "Residential cycle hangars. Data from OpenStreetMap.",
    legendIcon: "icons/parking-hangar.svg",
    defaultOn: true,
    parentId: "parking-all-layer",
  },
  {
    id: "cycleway-all-layer",
    name: "Cycleways",
    defaultOn: true,
    linkedLayers: [
      "cycleway-segregated-layer",
      "cycleway-unsegregated-layer",
      "cycleway-lane-narrow-layer",
      "cycleway-lane-wide-layer",
      "cycleway-path-tunnel-layer",
      "cycleway-lane-tunnel-layer",
      "contraflow-layer",
    ],
    virtual: true,
  },
  {
    id: "cycleway-segregated-layer",
    name: "Segregated paths",
    description:
      "Cycle paths that have separation between people cycling and people walking. Data from OpenStreetMap.",
    legendLineColor: "#c63b2b",
    legendLineWidth: 3,
    linkedLayers: ["cycleway-path-tunnel-layer"],
    defaultOn: true,
    parentId: "cycleway-all-layer",
  },
  {
    id: "cycleway-unsegregated-layer",
    name: "Shared paths",
    description:
      "Cycle paths that have no separation between people cycling and people walking. Data from OpenStreetMap.",
    legendLineColor: "#e58f85",
    legendLineWidth: 3,
    linkedLayers: ["cycleway-path-tunnel-layer"],
    defaultOn: true,
    parentId: "cycleway-all-layer",
  },
  {
    id: "cycleway-lane-narrow-layer",
    name: "Narrow cycle lanes",
    description:
      "On-carriageway cycle lanes narrower than 1.5m. Data from OpenStreetMap.",
    legendLineColor: "#e58f85",
    legendLineWidth: 3,
    legendLineDash: true,
    linkedLayers: ["cycleway-lane-tunnel-layer"],
    defaultOn: true,
    parentId: "cycleway-all-layer",
  },
  {
    id: "cycleway-lane-wide-layer",
    name: "Wide cycle lanes",
    description:
      "On-carriageway cycle lanes 1.5m wide or wider. Data from OpenStreetMap.",
    legendLineColor: "#c63b2b",
    legendLineWidth: 3,
    legendLineDash: true,
    linkedLayers: ["cycleway-lane-tunnel-layer"],
    defaultOn: true,
    parentId: "cycleway-all-layer",
  },
  {
    id: "contraflow-layer",
    name: "Contraflow cycling",
    description:
      "One-way streets where cycling is allowed in both directions, with or without a marked contraflow lane. Data from OpenStreetMap.",
    legendText: "›››",
    legendTextColor: "#c63b2b",
    defaultOn: true,
    parentId: "cycleway-all-layer",
  },
  {
    id: "schemes-layer",
    name: "In progress and upcoming schemes",
    description:
      "Georeferenced plans for Connecting Sheffield schemes. Plans from Sheffield City Council, © Crown copyright OS 100018816.",
    defaultOn: false,
    linkedLayers: SCHEME_LAYER_IDS,
  },
  {
    id: "shops-layer",
    name: "Shops",
    description: "Bike-related shops and services. Data from OpenStreetMap.",
    legendIcon: "icons/shop.svg",
    defaultOn: false,
    linkedLayers: ["shops-highlight-layer"],
  },
  {
    id: "wayfinding-all-layer",
    name: "Wayfinding",
    defaultOn: false,
    linkedLayers: ["wayfinding-guidepost-layer", "wayfinding-route-layer"],
    virtual: true,
  },
  {
    id: "wayfinding-guidepost-layer",
    name: "Guideposts",
    description:
      "(Incomplete) Guideposts with destinations for cycling. Data from OpenStreetMap.",
    legendIcon: "icons/guidepost.svg",
    defaultOn: false,
    parentId: "wayfinding-all-layer",
  },
  {
    id: "wayfinding-route-layer",
    name: "Route markers",
    description:
      "(Incomplete) Guideposts without destinations for cycling. Data from OpenStreetMap.",
    legendIcon: "icons/route-marker.svg",
    defaultOn: false,
    parentId: "wayfinding-all-layer",
  },
  {
    id: "dangers-layer",
    name: "Dangers",
    defaultOn: false,
    linkedLayers: [
      "embedded-tram-tracks-layer",
      "dft-collisions-layer",
      "bike-theft-layer",
    ],
    virtual: true,
  },
  {
    id: "embedded-tram-tracks-layer",
    name: "Embedded tram tracks",
    description:
      "Tram tracks embedded in the carriageway, dangerous for people on bikes. Data from OpenStreetMap.",
    legendLineColor: "#6b7280",
    legendLineWidth: 3,
    defaultOn: false,
    parentId: "dangers-layer",
  },
  {
    id: "dft-collisions-layer",
    name: "Collisions 2020-2024",
    description:
      "Cyclist collision data for 2020-2024. Data from the Department for Transport.",
    legendIcon: "icons/collision-serious.svg",
    defaultOn: false,
    parentId: "dangers-layer",
  },
  {
    id: "bike-theft-layer",
    name: "Bike thefts",
    description:
      "Street-level bicycle theft reports from Police.uk (past 3 years).",
    legendIcon: "icons/theft.svg",
    defaultOn: false,
    parentId: "dangers-layer",
  },
  {
    id: "pumps-layer",
    name: "Public pumps",
    description:
      "Public bike pumps, including vandalised pumps marked with a cross. Data from OpenStreetMap.",
    legendIcon: "icons/bike-pump.svg",
    linkedLayers: ["pumps-x-layer"],
    defaultOn: false,
  },
  {
    id: "drinking-water-layer",
    name: "Water",
    description:
      "Public drinking water, water taps with unknown drinking status, and businesses offering water refills. Data from OpenStreetMap.",
    legendIcon: "icons/drinking-water.svg",
    defaultOn: false,
  },
  {
    id: "counters-layer",
    name: "Cycle counters",
    description:
      "Locations of automatic cycle counters. Data from OpenStreetMap.",
    legendIcon: "icons/counter.svg",
    defaultOn: false,
  },
  {
    id: "ncn-layer",
    name: "National Cycle Network",
    description: "The National Cycle Network. Data from OpenStreetMap.",
    legendLineColor: "#aa00ff",
    legendLineWidth: 3,
    linkedLayers: ["ncn-shield-layer"],
    defaultOn: false,
  },
  {
    id: "asl-layer",
    name: "Advanced stop lines",
    description:
      "Stop lines for cycles ahead of motor traffic. Data from OpenStreetMap.",
    legendIcon: "icons/asl.svg",
    defaultOn: false,
  },
  {
    id: "traffic-calming-layer",
    name: "Traffic calming",
    description:
      "Speed tables, humps, bumps, cushions, chokers, chicanes, and other traffic calming. Data from OpenStreetMap.",
    legendIcon: "icons/traffic-calming.svg",
    defaultOn: false,
  },
  {
    id: "boundary-layer",
    name: "Boundary",
    description: "The boundary of Sheffield.",
    legendLineColor: "#6b7280",
    legendLineWidth: 3,
    legendLineDash: true,
    defaultOn: false,
  },
  { heading: "Experimental layers" },
  {
    id: "lcn-layer",
    name: "Local Cycle Network",
    description: "Signposted local cycle network. Data from OpenStreetMap.",
    legendLineColor: "#0000ff",
    legendLineWidth: 3,
    defaultOn: false,
  },
  {
    id: "signs-layer",
    name: "Signs",
    description: "(Incomplete) Cycling-related signs. Data from OpenStreetMap.",
    legendIcon: "icons/signs/957.svg",
    defaultOn: false,
  },
];

// Control ids that are visible when the URL doesn't pin a layer list.
export const DEFAULT_VISIBLE_LAYER_IDS = CONTROL_ITEMS.filter(
  (item) => item.id && !item.virtual && item.defaultOn,
).map((item) => item.id);

// Map layer id -> loader group key (any layer in a group triggers its loader).
export const LOADER_KEY_BY_LAYER = new Map();
for (const group of LAYER_GROUPS) {
  group.layerIds.forEach((id) => LOADER_KEY_BY_LAYER.set(id, group.key));
}

// Map layer id -> the control checkbox that governs it. Virtual parents are
// skipped: their children are the real checkboxes.
export const CONTROL_ID_BY_LAYER = new Map();
for (const item of CONTROL_ITEMS) {
  if (!item.id || item.virtual) continue;
  CONTROL_ID_BY_LAYER.set(item.id, item.id);
  (item.linkedLayers || []).forEach((layerId) => {
    if (!CONTROL_ID_BY_LAYER.has(layerId)) {
      CONTROL_ID_BY_LAYER.set(layerId, item.id);
    }
  });
}
