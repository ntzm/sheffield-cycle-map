import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";
// Main entry: wires map, layers, state, and controls. App state lives in a
// single store; the URL hash is derived from it, and hashchange (back/forward
// or a pasted link) is applied back onto the map and UI.
import {
  createStore,
  parseHash,
  formatHash,
  sameSelection,
  initialVisible,
} from "./utils/state.js";
import { LayerControl } from "./ui/layer-control.js";
import {
  reorderLayers,
  LAYER_ORDER,
  isSchemeLayer,
} from "./utils/layer-order.js";
import {
  LAYER_GROUPS,
  CONTROL_ITEMS,
  DEFAULT_VISIBLE_LAYER_IDS,
  LOADER_KEY_BY_LAYER,
  CONTROL_ID_BY_LAYER,
} from "./layers/registry.js";
import {
  setSelectionListener,
  currentSelection,
  selectFeature,
} from "./utils/interactions.js";
import { closeFeatureSheet } from "./ui/feature-sheet.js";
import { applyShopFilters } from "./layers/shops.js";
import { ShopFilterControl } from "./ui/shop-filter-control.js";

const BASEMAPS = {
  simple: { name: "Simple", style: "./positron.json" },
  bright: {
    name: "Bright",
    style: "https://tiles.openfreemap.org/styles/bright",
  },
  carto: { name: "OSM Carto", style: "./osm-carto.json" },
};

const store = createStore(parseHash(window.location.hash));
if (!BASEMAPS[store.get().basemap]) store.set({ basemap: "simple" });

const isEmbed = store.get().embed;

// Which control ids should be on right now: the URL's explicit list if there
// is one, otherwise the registry defaults.
function effectiveVisibleLayers(state) {
  return state.visibleLayers !== null
    ? state.visibleLayers
    : DEFAULT_VISIBLE_LAYER_IDS;
}

const control = new LayerControl(
  CONTROL_ITEMS.map((item) =>
    item.heading
      ? item
      : {
          ...item,
          initiallyVisible: initialVisible(
            store.get(),
            item.id,
            item.defaultOn,
          ),
        },
  ),
  {
    title: "Layers",
    onChange: () =>
      queueMicrotask(() => {
        store.set({ visibleLayers: control.getVisibleLayerIds() });
        syncShopFilterControl();
      }),
    onFirstEnable: async (layerId) => {
      const loaderKey = LOADER_KEY_BY_LAYER.get(layerId);
      if (!loaderKey) return;
      await loadLayerGroup(loaderKey);
    },
  },
);

const initialView = store.get().view;

const map = (window._map = new maplibregl.Map({
  container: "map",
  style: BASEMAPS[store.get().basemap].style,
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
  initialKey: store.get().shopFilter,
  onChange: (activeKey) => {
    applyShopFilters(map, activeKey);
    store.set({ shopFilter: activeKey });
  },
});
map.addControl(shopFilterControl, "bottom-left");

function syncShopFilterControl() {
  const shopsVisible = control.getVisibleLayerIds().includes("shops-layer");
  shopFilterControl.setVisible(shopsVisible);
  if (!shopsVisible) shopFilterControl.reset();
}

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

// Basemap switcher. `currentBasemap` tracks the style actually applied to the
// map; the store tracks the desired one (they diverge briefly during apply).
let currentBasemap = store.get().basemap;
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
  layerPanelHandle.textContent = "Menu";
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
  if (key === currentBasemap || !BASEMAPS[key]) return;
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
  store.set({ basemap: key });
}

// --- URL <-> state syncing -------------------------------------------------

// Derive the hash from state. Opening a feature pushes a history entry (so
// the back button closes the sheet, matching modal conventions); everything
// else replaces in place.
let lastSelection = store.get().selection;
store.subscribe((state) => {
  const selectionChanged = !sameSelection(state.selection, lastSelection);
  lastSelection = state.selection;
  const newHash = formatHash(state);
  if (window.location.hash === newHash) return;
  if (selectionChanged && state.selection) {
    history.pushState(null, "", newHash);
  } else {
    history.replaceState(null, "", newHash);
  }
});

map.on("moveend", () => {
  const center = map.getCenter();
  store.set({
    view: {
      lng: center.lng,
      lat: center.lat,
      zoom: map.getZoom(),
      bearing: map.getBearing(),
    },
  });
});

// The feature sheet reports selection changes (clicks, closes) here.
setSelectionListener((selection) => {
  store.set({ selection });
});

// Open (or close) the sheet to match a selection from the URL: make sure the
// owning layer group is loaded and its checkbox is on, then look the feature
// up by its stable key.
async function applySelection(selection, { animate = true } = {}) {
  const current = currentSelection();
  if (!selection) {
    if (current) closeFeatureSheet();
    return;
  }
  if (sameSelection(selection, current)) return;
  const loaderKey = LOADER_KEY_BY_LAYER.get(selection.layerId);
  if (loaderKey) await loadLayerGroup(loaderKey);
  const controlId = CONTROL_ID_BY_LAYER.get(selection.layerId);
  if (controlId) control.setLayerVisible(controlId, true);
  if (!selectFeature(map, selection.layerId, selection.key, { animate })) {
    // Stale or malformed link (feature no longer in the data): drop the
    // selection so the URL stays honest.
    store.set({ selection: null });
  }
}

// Back/forward navigation and pasted hashes: apply the URL onto the app.
// (pushState/replaceState don't fire hashchange, so this only runs for real
// navigations.)
async function applyHashState() {
  const parsed = parseHash(window.location.hash);
  if (!BASEMAPS[parsed.basemap]) parsed.basemap = "simple";
  // One batched set keeps the URL subscriber from seeing half-applied state.
  store.set(parsed);
  const { view } = parsed;
  map.jumpTo({
    center: [view.lng, view.lat],
    zoom: view.zoom,
    bearing: view.bearing,
  });
  control.applyVisibleLayers(effectiveVisibleLayers(parsed));
  switchBasemap(parsed.basemap);
  shopFilterControl.setSelectedKey(parsed.shopFilter);
  await applySelection(parsed.selection);
}

window.addEventListener("hashchange", () => {
  applyHashState();
});

// --- Lazy layer loading ----------------------------------------------------

const layerLoaders = new Map(
  LAYER_GROUPS.map((group) => [
    group.key,
    {
      status: "not-loaded",
      promise: null,
      load: async () => {
        await group.load(map, store.get());
        reorderLayers(map);
        if (group.key === "shops-layer") {
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

  // Pre-load every group with at least one initially-visible layer.
  const visible = new Set(effectiveVisibleLayers(store.get()));
  await Promise.all(
    LAYER_GROUPS.filter((group) =>
      group.layerIds.some((id) => visible.has(id)),
    ).map((group) => loadLayerGroup(group.key)),
  );

  // Restore a shared feature link now that its layer can be loaded. The
  // sheet appears in place at page open rather than sliding in.
  await applySelection(store.get().selection, { animate: false });
});
