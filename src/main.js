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
import { reorderLayers } from "./utils/layer-order.js";
import { addBoundaryLayer } from "./layers/boundary.js";
import { addPumpsLayer } from "./layers/pumps.js";
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
import { addShopsLayer } from "./layers/shops.js";
import { addGrittingLayers } from "./layers/gritting.js";
import { addBikeTheftsLayer } from "./layers/bike_thefts.js";

const urlState = parseHashState();

const lazyConfig = new Map();
const loaderKeyByLayer = new Map();
const initialVis = new Map();
const iv = (id, fallback) => {
  const val = initialVisible(urlState, id, fallback);
  initialVis.set(id, val);
  return val;
};

function registerLazyGroup(loaderKey, { layers, loader, initiallyVisible }) {
  lazyConfig.set(loaderKey, { loader, initiallyVisible });
  layers.forEach((id) => loaderKeyByLayer.set(id, loaderKey));
}

registerLazyGroup("shops-layer", {
  layers: ["shops-layer"],
  loader: addShopsLayer,
  initiallyVisible: iv("shops-layer", false),
});

registerLazyGroup("parking-all-layer", {
  layers: [
    "parking-all-layer",
    "parking-public-layer",
    "parking-private-layer",
    "parking-hub-layer",
    "parking-hangar-layer",
  ],
  loader: addParkingLayers,
  initiallyVisible: iv("parking-public-layer", true),
});

const cyclewayInitiallyVisible =
  iv("cycleway-segregated-layer", true) ||
  urlState.visibleLayers.has("cycleway-layer");
registerLazyGroup("cycleway-all-layer", {
  layers: [
    "cycleway-all-layer",
    "cycleway-segregated-layer",
    "cycleway-unsegregated-layer",
    "cycleway-lane-narrow-layer",
    "cycleway-lane-wide-layer",
  ],
  loader: addCycleway,
  initiallyVisible: cyclewayInitiallyVisible,
});

registerLazyGroup("wayfinding-all-layer", {
  layers: [
    "wayfinding-all-layer",
    "wayfinding-guidepost-layer",
    "wayfinding-route-layer",
  ],
  loader: addWayfinding,
  initiallyVisible: iv("wayfinding-guidepost-layer", false),
});

registerLazyGroup("embedded-tram-tracks-layer", {
  layers: ["embedded-tram-tracks-layer"],
  loader: addEmbeddedTramTracks,
  initiallyVisible: iv("embedded-tram-tracks-layer", false),
});

registerLazyGroup("dft-collisions-layer", {
  layers: ["dft-collisions-layer"],
  loader: addCollisions,
  initiallyVisible: iv("dft-collisions-layer", false),
});

registerLazyGroup("bike-theft-layer", {
  layers: ["bike-theft-layer"],
  loader: addBikeTheftsLayer,
  initiallyVisible: iv("bike-theft-layer", false),
});

registerLazyGroup("pumps-layer", {
  layers: ["pumps-layer", "pumps-x-layer"],
  loader: addPumpsLayer,
  initiallyVisible: iv("pumps-layer", false),
});

registerLazyGroup("counters-layer", {
  layers: ["counters-layer"],
  loader: addCounters,
  initiallyVisible: iv("counters-layer", false),
});

registerLazyGroup("asl-layer", {
  layers: ["asl-layer"],
  loader: addAslLayer,
  initiallyVisible: iv("asl-layer", false),
});

registerLazyGroup("signs-layer", {
  layers: ["signs-layer"],
  loader: addSignsLayer,
  initiallyVisible: iv("signs-layer", false),
});

registerLazyGroup("gritting-all-layer", {
  layers: [
    "gritting-all-layer",
    "gritting-primary-layer",
    "gritting-secondary-layer",
  ],
  loader: addGrittingLayers,
  initiallyVisible: iv("gritting-primary-layer", false),
});

registerLazyGroup("ncn-layer", {
  layers: ["ncn-layer"],
  loader: addNcn,
  initiallyVisible: iv("ncn-layer", false),
});

registerLazyGroup("lcn-layer", {
  layers: ["lcn-layer"],
  loader: addLcn,
  initiallyVisible: iv("lcn-layer", false),
});

registerLazyGroup("boundary-layer", {
  layers: ["boundary-layer"],
  loader: addBoundaryLayer,
  initiallyVisible: iv("boundary-layer", false),
});

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
      legendColor: "#0f6bd8",
      initiallyVisible: initialVisible(urlState, "parking-public-layer", true),
      parentId: "parking-all-layer",
    },
    {
      id: "parking-private-layer",
      name: "Private parking",
      description:
        "Cycle parking that is not accessible to the public. Data from OpenStreetMap.",
      legendColor: "#808080",
      initiallyVisible: initialVisible(urlState, "parking-private-layer", true),
      parentId: "parking-all-layer",
    },
    {
      id: "parking-hub-layer",
      name: "Cycle hubs",
      description: "Secure cycle hubs. Data from OpenStreetMap.",
      legendColor: "#f97316",
      initiallyVisible: initialVisible(urlState, "parking-hub-layer", true),
      parentId: "parking-all-layer",
    },
    {
      id: "parking-hangar-layer",
      name: "Cycle hangars",
      description: "Residential cycle hangars. Data from OpenStreetMap.",
      legendColor: "#22c55e",
      initiallyVisible: initialVisible(urlState, "parking-hangar-layer", true),
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
      initiallyVisible:
        initialVisible(urlState, "cycleway-segregated-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer"),
      parentId: "cycleway-all-layer",
    },
    {
      id: "cycleway-unsegregated-layer",
      name: "Unsegregated paths",
      description:
        "Cycle paths that have no separation between people cycling and people walking. Data from OpenStreetMap.",
      legendLineColor: "#e58f85",
      legendLineWidth: 3,
      initiallyVisible:
        initialVisible(urlState, "cycleway-unsegregated-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer"),
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
      initiallyVisible:
        initialVisible(urlState, "cycleway-lane-narrow-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer"),
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
      initiallyVisible:
        initialVisible(urlState, "cycleway-lane-wide-layer", true) ||
        urlState.visibleLayers.has("cycleway-layer"),
      parentId: "cycleway-all-layer",
    },
    {
      id: "shops-layer",
      name: "Shops",
      description: "Bike-related shops and services. Data from OpenStreetMap.",
      legendIcon: "icons/shop.svg",
      initiallyVisible: lazyConfig.get("shops-layer").initiallyVisible,
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
      initiallyVisible: initialVisible(
        urlState,
        "wayfinding-guidepost-layer",
        false,
      ),
      parentId: "wayfinding-all-layer",
    },
    {
      id: "wayfinding-route-layer",
      name: "Route markers",
      description:
        "(Incomplete) Guideposts without destinations for cycling. Data from OpenStreetMap.",
      legendIcon:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 26 26">
        <g fill="none" fill-rule="evenodd">
          <rect x="2.5" y="2.5" width="21" height="21" rx="3" fill="#0047aa" stroke="#0f172a" stroke-width="1.2" />
          <path d="M9 13h8" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" />
          <path d="M14 10l4 3-4 3" fill="none" stroke="#f8fafc" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </g>
      </svg>`),
      initiallyVisible: initialVisible(
        urlState,
        "wayfinding-route-layer",
        false,
      ),
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
      initiallyVisible: initialVisible(
        urlState,
        "embedded-tram-tracks-layer",
        false,
      ),
      parentId: "dangers-layer",
    },
    {
      id: "dft-collisions-layer",
      name: "Collisions 2020-2024",
      description:
        "Cyclist collision data for 2020-2024. Data from the Department for Transport.",
      legendIcon:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 40 40">
        <g fill="none" stroke="#111" stroke-width="1.4" stroke-linejoin="round">
          <path d="M20 4 L35 34 H5 Z" fill="#fb923c" />
          <path d="M20 12 v10" stroke="#fff" stroke-width="3" />
          <circle cx="20" cy="27" r="1.8" fill="#fff" stroke="none" />
        </g>
      </svg>`),
      initiallyVisible: initialVisible(urlState, "dft-collisions-layer", false),
      parentId: "dangers-layer",
    },
    {
      id: "bike-theft-layer",
      name: "Bike thefts since Jun 2022",
      description:
        "Street-level bicycle theft reports from Police.uk (Jun 2022 to latest month available).",
      legendIcon:
        "data:image/svg+xml;utf8," +
        encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="7" fill="#fb923c" stroke="#111827" stroke-width="1.2" />
      </svg>`),
      initiallyVisible: initialVisible(urlState, "bike-theft-layer", false),
      parentId: "dangers-layer",
    },
    {
      id: "pumps-layer",
      name: "Public pumps",
      description:
        "Public bike pumps, including vandalised pumps marked with a cross. Data from OpenStreetMap.",
      legendIcon: "icons/bike-pump.svg",
      linkedLayers: ["pumps-x-layer"],
      initiallyVisible: initialVisible(urlState, "pumps-layer", false),
    },
    {
      id: "counters-layer",
      name: "Cycle counters",
      description:
        "Locations of automatic cycle counters. Data from OpenStreetMap.",
      legendIcon: "icons/counter.svg",
      initiallyVisible: initialVisible(urlState, "counters-layer", false),
    },
    {
      id: "ncn-layer",
      name: "National Cycle Network",
      description: "The National Cycle Network. Data from OpenSteetmap.",
      legendLineColor: "#2563eb",
      legendLineWidth: 3,
      initiallyVisible: initialVisible(urlState, "ncn-layer", false),
    },
    {
      id: "lcn-layer",
      name: "Local Cycle Network",
      description: "Signposted local cycle network. Data from OpenSteetmap.",
      legendLineColor: "#2563eb",
      legendLineWidth: 3,
      initiallyVisible: initialVisible(urlState, "lcn-layer", false),
    },
    {
      id: "asl-layer",
      name: "Advanced stop lines",
      description:
        "Stop lines for cycles ahead of motor traffic. Data from OpenStreetMap.",
      legendIcon: "icons/asl.svg",
      initiallyVisible: initialVisible(urlState, "asl-layer", false),
    },
    {
      id: "signs-layer",
      name: "Signs",
      description:
        "(Incomplete) Cycling-related signs. Data from OpenStreetMap.",
      legendIcon: "icons/signs/957.svg",
      initiallyVisible: initialVisible(urlState, "signs-layer", false),
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
      initiallyVisible: initialVisible(
        urlState,
        "gritting-primary-layer",
        false,
      ),
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
      initiallyVisible: initialVisible(
        urlState,
        "gritting-secondary-layer",
        false,
      ),
      parentId: "gritting-all-layer",
    },
    {
      id: "boundary-layer",
      name: "Boundary",
      description: "The boundary of Sheffield.",
      legendLineColor: "#6b7280",
      legendLineWidth: 3,
      legendLineDash: true,
      initiallyVisible: initialVisible(urlState, "boundary-layer", false),
    },
  ],
  {
    title: "Layers",
    onChange: () =>
      queueMicrotask(() => {
        updateUrlFromState();
      }),
  },
);

const initialView = urlState.view;

const map = new maplibregl.Map({
  container: "map",
  style: "./positron.json",
  center: [initialView.lng, initialView.lat],
  zoom: initialView.zoom,
  bearing: initialView.bearing,
  maxPitch: 0,
  maxZoom: 18,
  // Loosen tap precision slightly to make small POIs easier to hit on touch screens.
  clickTolerance: 10,
});

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

// Build a left-side layer panel that overlays the map (visible by default).
const layerControlEl = control.build(map);
layerControlEl.id = "layer-panel";
layerControlEl.classList.remove("maplibregl-ctrl", "maplibregl-ctrl-group");
layerControlEl.classList.add("layer-panel", "layer-panel--open");

const infoBox = document.createElement("div");
infoBox.className = "layer-panel__info";
infoBox.innerHTML = `
  <h2>Sheffield Cycle Map</h2>
`;
layerControlEl.insertBefore(infoBox, layerControlEl.firstChild);

document.body.appendChild(layerControlEl);

// Handle to hide/show the panel without nesting another box.
const layerPanelHandle = document.createElement("div");
layerPanelHandle.id = "layer-panel-handle";
layerPanelHandle.textContent = "Info";
document.body.appendChild(layerPanelHandle);

let panelOpen = true;
layerPanelHandle.addEventListener("click", () => {
  panelOpen = !panelOpen;
  layerControlEl.classList.toggle("layer-panel--open", panelOpen);
  layerControlEl.classList.toggle("layer-panel--closed", !panelOpen);
  layerPanelHandle.classList.toggle("layer-panel-handle--open", panelOpen);
});

function updateUrlFromState() {
  const visibleLayerIds = control
    .getVisibleLayerIds()
    .filter((id) => map.getLayer(id));
  const newHash = formatHashState(map, visibleLayerIds);
  if (window.location.hash !== newHash) {
    history.replaceState(null, "", newHash);
  }
}

map.on("moveend", updateUrlFromState);

map.on("load", async () => {
  // Lazy loader registry for all layers.
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
        },
      },
    ]),
  );

  async function loadLayerGroup(layerId) {
    const entry = layerLoaders.get(layerId);
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

  // Eagerly load nothing else; layers load on demand.

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

  // Wire lazy loading into the layer control.
  control._onFirstEnable = async (layerId) => {
    const loaderKey = loaderKeyByLayer.get(layerId);
    if (!loaderKey) return;
    await loadLayerGroup(loaderKey);
  };
});
