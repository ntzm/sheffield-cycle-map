import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
// Main entry: wires map, layers, state, and controls.
import {
  parseHashState,
  formatHashState,
  initialVisible,
} from "./utils/state.js";
import { LayerControl } from "./ui/layer-control.js";
import {
  reorderLayers,
  LAYER_ORDER,
  isSchemeLayer,
} from "./utils/layer-order.js";
import { addBoundaryLayer } from "./layers/boundary.js";
import { addPumpsLayer } from "./layers/pumps.js";
import { addDrinkingWaterLayer } from "./layers/drinking_water.js";
import { addParkingLayers } from "./layers/parking.js";
import { addWayfinding } from "./layers/wayfinding.js";
import { addCycleway } from "./layers/cycleway.js";
import { addNcn } from "./layers/ncn.js";
import { addLcn } from "./layers/lcn.js";
import { addEmbeddedTramTracks } from "./layers/tram.js";
import { addCollisions } from "./layers/collisions.js";
import { addCounters } from "./layers/counters.js";
import { addAslLayer } from "./layers/asl.js";
import { addSignsLayer } from "./layers/signs.js";
import { addTrafficCalmingLayer } from "./layers/traffic_calming.js";
import { addShopsLayer, applyShopFilters } from "./layers/shops.js";
import { ShopFilterControl } from "./ui/shop-filter-control.js";
import { addGrittingLayers } from "./layers/gritting.js";
import { addBikeTheftsLayer } from "./layers/bike_thefts.js";
import { addSchemesLayers, SCHEME_LAYER_IDS } from "./layers/schemes.js";

const BASEMAPS = {
  simple: { name: "Simple", style: "./positron.json" },
  bright: {
    name: "Bright",
    style: "https://tiles.openfreemap.org/styles/bright",
  },
  carto: { name: "OSM Carto", style: "./osm-carto.json" },
};

const urlState = parseHashState();
let currentBasemap = BASEMAPS[urlState.basemap] ? urlState.basemap : "simple";

// Compute initial visibility once for every layer.
const iv = (id, fallback) => initialVisible(urlState, id, fallback);

// Lazy-loaded layer groups: [loaderKey, layerIds, loader, visibleAtStart]
const LAZY_GROUPS = [
  [
    "shops-layer",
    ["shops-layer", "shops-highlight-layer"],
    addShopsLayer,
    iv("shops-layer", false),
  ],
  [
    "parking-all-layer",
    [
      "parking-all-layer",
      "parking-public-layer",
      "parking-private-layer",
      "parking-hub-layer",
      "parking-hangar-layer",
    ],
    addParkingLayers,
    iv("parking-public-layer", true),
  ],
  [
    "cycleway-all-layer",
    [
      "cycleway-all-layer",
      "cycleway-segregated-layer",
      "cycleway-unsegregated-layer",
      "cycleway-lane-narrow-layer",
      "cycleway-lane-wide-layer",
    ],
    addCycleway,
    iv("cycleway-segregated-layer", true),
  ],
  [
    "wayfinding-all-layer",
    [
      "wayfinding-all-layer",
      "wayfinding-guidepost-layer",
      "wayfinding-route-layer",
    ],
    addWayfinding,
    iv("wayfinding-guidepost-layer", false),
  ],
  [
    "embedded-tram-tracks-layer",
    ["embedded-tram-tracks-layer"],
    addEmbeddedTramTracks,
    iv("embedded-tram-tracks-layer", false),
  ],
  [
    "dft-collisions-layer",
    ["dft-collisions-layer"],
    addCollisions,
    iv("dft-collisions-layer", false),
  ],
  [
    "bike-theft-layer",
    ["bike-theft-layer"],
    addBikeTheftsLayer,
    iv("bike-theft-layer", false),
  ],
  [
    "pumps-layer",
    ["pumps-layer", "pumps-x-layer"],
    addPumpsLayer,
    iv("pumps-layer", false),
  ],
  [
    "drinking-water-layer",
    ["drinking-water-layer"],
    addDrinkingWaterLayer,
    iv("drinking-water-layer", false),
  ],
  [
    "counters-layer",
    ["counters-layer"],
    addCounters,
    iv("counters-layer", false),
  ],
  ["asl-layer", ["asl-layer"], addAslLayer, iv("asl-layer", false)],
  ["signs-layer", ["signs-layer"], addSignsLayer, iv("signs-layer", false)],
  [
    "traffic-calming-layer",
    ["traffic-calming-layer"],
    addTrafficCalmingLayer,
    iv("traffic-calming-layer", false),
  ],
  [
    "gritting-all-layer",
    [
      "gritting-all-layer",
      "gritting-primary-layer",
      "gritting-secondary-layer",
    ],
    addGrittingLayers,
    iv("gritting-primary-layer", false),
  ],
  [
    "schemes-layer",
    ["schemes-layer", ...SCHEME_LAYER_IDS],
    addSchemesLayers,
    iv("schemes-layer", false),
  ],
  [
    "ncn-layer",
    ["ncn-layer", "ncn-shield-layer"],
    addNcn,
    iv("ncn-layer", false),
  ],
  ["lcn-layer", ["lcn-layer"], addLcn, iv("lcn-layer", false)],
  [
    "boundary-layer",
    ["boundary-layer"],
    addBoundaryLayer,
    iv("boundary-layer", false),
  ],
];

const lazyConfig = new Map();
const loaderKeyByLayer = new Map();
for (const [key, layers, loader, vis] of LAZY_GROUPS) {
  lazyConfig.set(key, { loader, initiallyVisible: vis });
  layers.forEach((id) => loaderKeyByLayer.set(id, key));
}

const control = new LayerControl(
  [
    {
      id: "parking-all-layer",
      name: "Cycle parking",
      initiallyVisible: true,
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
      initiallyVisible: iv("parking-public-layer", true),
      parentId: "parking-all-layer",
    },
    {
      id: "parking-private-layer",
      name: "Private parking",
      description:
        "Cycle parking that is not accessible to the public. Data from OpenStreetMap.",
      legendIcon: "icons/parking-private.svg",
      initiallyVisible: iv("parking-private-layer", true),
      parentId: "parking-all-layer",
    },
    {
      id: "parking-hub-layer",
      name: "Cycle hubs",
      description: "Secure cycle hubs. Data from OpenStreetMap.",
      legendIcon: "icons/parking-hub.svg",
      initiallyVisible: iv("parking-hub-layer", true),
      parentId: "parking-all-layer",
    },
    {
      id: "parking-hangar-layer",
      name: "Cycle hangars",
      description: "Residential cycle hangars. Data from OpenStreetMap.",
      legendIcon: "icons/parking-hangar.svg",
      initiallyVisible: iv("parking-hangar-layer", true),
      parentId: "parking-all-layer",
    },
    {
      id: "cycleway-all-layer",
      name: "Cycleways",
      initiallyVisible: true,
      linkedLayers: [
        "cycleway-segregated-layer",
        "cycleway-unsegregated-layer",
        "cycleway-lane-narrow-layer",
        "cycleway-lane-wide-layer",
        "cycleway-path-tunnel-layer",
        "cycleway-lane-tunnel-layer",
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
      initiallyVisible: iv("cycleway-segregated-layer", true),
      parentId: "cycleway-all-layer",
    },
    {
      id: "cycleway-unsegregated-layer",
      name: "Unsegregated paths",
      description:
        "Cycle paths that have no separation between people cycling and people walking. Data from OpenStreetMap.",
      legendLineColor: "#e58f85",
      legendLineWidth: 3,
      linkedLayers: ["cycleway-path-tunnel-layer"],
      initiallyVisible: iv("cycleway-unsegregated-layer", true),
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
      initiallyVisible: iv("cycleway-lane-narrow-layer", true),
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
      initiallyVisible: iv("cycleway-lane-wide-layer", true),
      parentId: "cycleway-all-layer",
    },
    {
      id: "schemes-layer",
      name: "In progress and upcoming schemes",
      description:
        "Georeferenced plans for Connecting Sheffield schemes. Plans from Sheffield City Council, © Crown copyright OS 100018816.",
      initiallyVisible: iv("schemes-layer", false),
      linkedLayers: SCHEME_LAYER_IDS,
    },
    {
      id: "shops-layer",
      name: "Shops",
      description: "Bike-related shops and services. Data from OpenStreetMap.",
      legendIcon: "icons/shop.svg",
      initiallyVisible: iv("shops-layer", false),
      linkedLayers: ["shops-highlight-layer"],
    },
    {
      id: "wayfinding-all-layer",
      name: "Wayfinding",
      initiallyVisible: false,
      linkedLayers: ["wayfinding-guidepost-layer", "wayfinding-route-layer"],
      virtual: true,
    },
    {
      id: "wayfinding-guidepost-layer",
      name: "Guideposts",
      description:
        "(Incomplete) Guideposts with destinations for cycling. Data from OpenStreetMap.",
      legendIcon: "icons/guidepost.svg",
      initiallyVisible: iv("wayfinding-guidepost-layer", false),
      parentId: "wayfinding-all-layer",
    },
    {
      id: "wayfinding-route-layer",
      name: "Route markers",
      description:
        "(Incomplete) Guideposts without destinations for cycling. Data from OpenStreetMap.",
      legendIcon: "icons/route-marker.svg",
      initiallyVisible: iv("wayfinding-route-layer", false),
      parentId: "wayfinding-all-layer",
    },
    {
      id: "dangers-layer",
      name: "Dangers",
      initiallyVisible: false,
      linkedLayers: [
        "embedded-tram-tracks-layer",
        "dft-collisions-layer",
        "bike-theft-layer",
      ],
      virtual: true,
    },
    {
      id: "embedded-tram-tracks-layer",
      name: "Embedded Tram Tracks",
      description:
        "Tram tracks embedded in the carriageway, dangerous for people on bikes. Data from OpenStreetMap.",
      legendLineColor: "#6b7280",
      legendLineWidth: 3,
      initiallyVisible: iv("embedded-tram-tracks-layer", false),
      parentId: "dangers-layer",
    },
    {
      id: "dft-collisions-layer",
      name: "Collisions 2020-2024",
      description:
        "Cyclist collision data for 2020-2024. Data from the Department for Transport.",
      legendIcon: "icons/collision-serious.svg",
      initiallyVisible: iv("dft-collisions-layer", false),
      parentId: "dangers-layer",
    },
    {
      id: "bike-theft-layer",
      name: "Bike thefts",
      description:
        "Street-level bicycle theft reports from Police.uk (past 3 years).",
      legendIcon: "icons/theft.svg",
      initiallyVisible: iv("bike-theft-layer", false),
      parentId: "dangers-layer",
    },
    {
      id: "pumps-layer",
      name: "Public pumps",
      description:
        "Public bike pumps, including vandalised pumps marked with a cross. Data from OpenStreetMap.",
      legendIcon: "icons/bike-pump.svg",
      linkedLayers: ["pumps-x-layer"],
      initiallyVisible: iv("pumps-layer", false),
    },
    {
      id: "drinking-water-layer",
      name: "Water",
      description:
        "Public drinking water, water taps with unknown drinking status, and businesses offering water refills. Data from OpenStreetMap.",
      legendIcon: "icons/drinking-water.svg",
      initiallyVisible: iv("drinking-water-layer", false),
    },
    {
      id: "counters-layer",
      name: "Cycle counters",
      description:
        "Locations of automatic cycle counters. Data from OpenStreetMap.",
      legendIcon: "icons/counter.svg",
      initiallyVisible: iv("counters-layer", false),
    },
    {
      id: "ncn-layer",
      name: "National Cycle Network",
      description: "The National Cycle Network. Data from OpenStreetMap.",
      legendLineColor: "#aa00ff",
      legendLineWidth: 3,
      linkedLayers: ["ncn-shield-layer"],
      initiallyVisible: iv("ncn-layer", false),
    },
    {
      id: "lcn-layer",
      name: "Local Cycle Network",
      description: "Signposted local cycle network. Data from OpenStreetMap.",
      legendLineColor: "#0000ff",
      legendLineWidth: 3,
      initiallyVisible: iv("lcn-layer", false),
    },
    {
      id: "asl-layer",
      name: "Advanced stop lines",
      description:
        "Stop lines for cycles ahead of motor traffic. Data from OpenStreetMap.",
      legendIcon: "icons/asl.svg",
      initiallyVisible: iv("asl-layer", false),
    },
    {
      id: "signs-layer",
      name: "Signs",
      description:
        "(Incomplete) Cycling-related signs. Data from OpenStreetMap.",
      legendIcon: "icons/signs/957.svg",
      initiallyVisible: iv("signs-layer", false),
    },
    {
      id: "traffic-calming-layer",
      name: "Traffic calming",
      description:
        "Speed tables, humps, bumps, cushions, chokers, chicanes, and other traffic calming. Data from OpenStreetMap.",
      legendIcon: "icons/traffic-calming.svg",
      initiallyVisible: iv("traffic-calming-layer", false),
    },
    {
      id: "gritting-all-layer",
      name: "Winter gritting",
      initiallyVisible: false,
      linkedLayers: ["gritting-primary-layer", "gritting-secondary-layer"],
      virtual: true,
    },
    {
      id: "gritting-primary-layer",
      name: "Primary gritting routes",
      description:
        "Priority winter maintenance network. Data from Sheffield City Council open data.",
      legendLineColor: "#16a34a",
      legendLineWidth: 3,
      initiallyVisible: iv("gritting-primary-layer", false),
      parentId: "gritting-all-layer",
    },
    {
      id: "gritting-secondary-layer",
      name: "Secondary gritting routes",
      description:
        "Secondary gritting network. Data from Sheffield City Council open data.",
      legendLineColor: "#16a34a",
      legendLineWidth: 3,
      legendLineDash: true,
      initiallyVisible: iv("gritting-secondary-layer", false),
      parentId: "gritting-all-layer",
    },
    {
      id: "boundary-layer",
      name: "Boundary",
      description: "The boundary of Sheffield.",
      legendLineColor: "#6b7280",
      legendLineWidth: 3,
      legendLineDash: true,
      initiallyVisible: iv("boundary-layer", false),
    },
  ],
  {
    title: "Layers",
    onChange: () =>
      queueMicrotask(() => {
        updateUrlFromState();
        syncShopFilterControl();
      }),
    onFirstEnable: async (layerId) => {
      const loaderKey = loaderKeyByLayer.get(layerId);
      if (!loaderKey) return;
      await loadLayerGroup(loaderKey);
    },
  },
);

const initialView = urlState.view;

const map = (window._map = new maplibregl.Map({
  container: "map",
  style: BASEMAPS[currentBasemap].style,
  center: [initialView.lng, initialView.lat],
  zoom: initialView.zoom,
  bearing: initialView.bearing,
  maxPitch: 0,
  maxZoom: 18,
  // Loosen tap precision slightly to make small POIs easier to hit on touch screens.
  clickTolerance: 10,
}));

// Prevent accidental zooms from quick double taps on touch devices.
map.doubleClickZoom.disable();

map.addControl(
  new maplibregl.NavigationControl({
    visualizePitch: false,
    visualizeRoll: true,
    showZoom: true,
    showCompass: true,
  }),
);

map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
  }),
);

map.addControl(new maplibregl.FullscreenControl());

// Floating shop attribute filter (bottom left), shown while shops are visible.
const shopFilterControl = new ShopFilterControl({
  initialKey: urlState.shopFilter,
  onChange: (activeKey) => {
    applyShopFilters(map, activeKey);
    updateUrlFromState();
  },
});
map.addControl(shopFilterControl, "bottom-left");

function syncShopFilterControl() {
  const shopsVisible = control.getVisibleLayerIds().includes("shops-layer");
  shopFilterControl.setVisible(shopsVisible);
  if (!shopsVisible) shopFilterControl.reset();
}

const isEmbed = urlState.embed;

// Build a left-side layer panel that overlays the map (visible by default).
const layerControlEl = control.build(map);
syncShopFilterControl();
layerControlEl.id = "layer-panel";
layerControlEl.classList.remove("maplibregl-ctrl", "maplibregl-ctrl-group");
layerControlEl.classList.add("layer-panel", "layer-panel--closed");

const infoBox = document.createElement("div");
infoBox.className = "layer-panel__info";
infoBox.innerHTML = `
  <h1><a class="layer-panel__title-link" href="" target="_blank" rel="noopener">Sheffield Cycle Map</a></h1>
`;
layerControlEl.insertBefore(infoBox, layerControlEl.firstChild);

// Basemap switcher
const basemapSwitcher = document.createElement("div");
basemapSwitcher.className = "basemap-switcher";
for (const [key, cfg] of Object.entries(BASEMAPS)) {
  const label = document.createElement("label");
  label.className = "basemap-switcher__option";
  const radio = document.createElement("input");
  radio.type = "radio";
  radio.name = "basemap";
  radio.value = key;
  radio.checked = key === currentBasemap;
  radio.addEventListener("change", () => switchBasemap(key));
  label.append(radio, ` ${cfg.name}`);
  basemapSwitcher.appendChild(label);
}
infoBox.appendChild(basemapSwitcher);

if (!isEmbed) {
  const layerPanelWrap = document.createElement("div");
  layerPanelWrap.id = "layer-panel-wrap";
  layerPanelWrap.classList.add("layer-panel-wrap--closed");

  const layerPanelHandle = document.createElement("button");
  layerPanelHandle.id = "layer-panel-handle";
  layerPanelHandle.textContent = "Info";
  layerPanelHandle.setAttribute("aria-expanded", "false");

  layerPanelWrap.appendChild(layerControlEl);
  layerPanelWrap.appendChild(layerPanelHandle);
  document.body.appendChild(layerPanelWrap);

  let panelOpen = false;
  layerPanelHandle.addEventListener("click", () => {
    panelOpen = !panelOpen;
    layerControlEl.classList.toggle("layer-panel--open", panelOpen);
    layerControlEl.classList.toggle("layer-panel--closed", !panelOpen);
    layerPanelWrap.classList.toggle("layer-panel-wrap--open", panelOpen);
    layerPanelWrap.classList.toggle("layer-panel-wrap--closed", !panelOpen);
    layerPanelHandle.setAttribute("aria-expanded", String(panelOpen));
  });
}

function getCustomSourcesAndLayers() {
  const customLayerIds = new Set(LAYER_ORDER);
  const currentStyle = map.getStyle();
  const customLayers = currentStyle.layers.filter(
    (l) => customLayerIds.has(l.id) || isSchemeLayer(l.id),
  );
  const usedSources = new Set(
    customLayers.map((l) => l.source).filter(Boolean),
  );
  const customSources = {};
  for (const id of usedSources) {
    if (currentStyle.sources[id]) customSources[id] = currentStyle.sources[id];
  }
  return { customSources, customLayers };
}

function switchBasemap(key) {
  if (key === currentBasemap) return;
  currentBasemap = key;
  // Update radio buttons
  basemapSwitcher.querySelectorAll("input").forEach((r) => {
    r.checked = r.value === key;
  });
  map.once("styledata", () => {
    // Reset lazy loaders so toggling layers re-runs their loader
    for (const entry of layerLoaders.values()) {
      if (entry.status === "loaded") {
        entry.status = "not-loaded";
        entry.promise = null;
      }
    }
    reorderLayers(map);
  });
  map.setStyle(BASEMAPS[key].style, {
    transformStyle: (_prev, next) => {
      const { customSources, customLayers } = getCustomSourcesAndLayers();
      return {
        ...next,
        sources: { ...next.sources, ...customSources },
        layers: [...next.layers, ...customLayers],
      };
    },
  });
  updateUrlFromState();
}

function updateUrlFromState() {
  const visibleLayerIds = control.getVisibleLayerIds();
  const newHash = formatHashState(
    map,
    visibleLayerIds,
    currentBasemap,
    isEmbed,
    shopFilterControl.getSelectedKey(),
  );
  if (window.location.hash !== newHash) {
    history.replaceState(null, "", newHash);
  }
}

map.on("moveend", updateUrlFromState);

// Lazy loader registry for all layers (hoisted so switchBasemap can reset it).
const layerLoaders = new Map(
  Array.from(lazyConfig.entries()).map(([key, cfg]) => [
    key,
    {
      ids: Array.isArray(cfg.ids) ? cfg.ids : null,
      status: "not-loaded",
      promise: null,
      load: async () => {
        await cfg.loader(map, urlState);
        reorderLayers(map);
        if (key === "shops-layer") {
          applyShopFilters(map, shopFilterControl.getSelectedKey());
        }
      },
    },
  ]),
);

async function loadLayerGroup(loaderKey) {
  const entry = layerLoaders.get(loaderKey);
  if (!entry) return;
  if (entry.status === "loaded") return;
  if (entry.status === "loading" && entry.promise) return entry.promise;
  entry.status = "loading";
  entry.promise = entry
    .load()
    .then(() => {
      entry.status = "loaded";
    })
    .catch((err) => {
      entry.status = "not-loaded";
      entry.promise = null;
      throw err;
    });
  return entry.promise;
}

map.on("load", async () => {
  map.resize();

  // Pre-load any lazy layers that should start visible.
  const initialLazyLoads = [];
  loaderKeyByLayer.forEach((loaderKey, layerId) => {
    const cfg = lazyConfig.get(loaderKey);
    if (!cfg) return;
    if (cfg.initiallyVisible) {
      initialLazyLoads.push(loadLayerGroup(loaderKey));
    }
  });
  await Promise.all(initialLazyLoads);
});
