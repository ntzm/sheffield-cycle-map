// Central app state. A single plain object holds everything the URL encodes
// (view, visible layers, basemap, shop filter, embed, selected feature); all
// mutations go through the store, and the URL hash is derived from state by a
// subscriber in main.js. hashchange applies the URL back onto the app.

export function createStore(initial) {
  let state = initial;
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      subscribers.forEach((fn) => fn(state));
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

export function parseHash(hashString) {
  const hash = (hashString || "").replace(/^#/, "");
  const [pathPart, queryPart] = hash.split("?");
  const result = {
    view: { lng: -1.47, lat: 53.38, zoom: 12, bearing: 0 },
    // null means "no explicit layer list in the URL, use per-layer defaults";
    // an array (possibly empty) is an explicit list.
    visibleLayers: null,
    basemap: "simple",
    embed: false,
    shopFilter: null,
    selection: null, // { layerId, key }
  };

  if (pathPart) {
    const parts = pathPart.split("/").map(Number);
    if (parts.length >= 3) {
      const [zoom, lat, lng, bearing = 0] = parts;
      if ([zoom, lat, lng, bearing].every(Number.isFinite)) {
        result.view = { zoom, lat, lng, bearing };
      }
    }
  }

  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    if (params.has("layers")) {
      result.visibleLayers = params.get("layers").split(",").filter(Boolean);
    }
    const basemapParam = params.get("basemap");
    if (basemapParam) {
      result.basemap = basemapParam;
    }
    if (params.has("embed")) {
      result.embed = true;
    }
    const shopFilterParam = params.get("shopFilter");
    if (shopFilterParam) {
      result.shopFilter = shopFilterParam;
    }
    // URLSearchParams has already percent-decoded the value.
    const selectedParam = params.get("selected");
    if (selectedParam) {
      const sep = selectedParam.indexOf(":");
      if (sep > 0 && sep < selectedParam.length - 1) {
        result.selection = {
          layerId: selectedParam.slice(0, sep),
          key: selectedParam.slice(sep + 1),
        };
      }
    }
  }

  return result;
}

export function formatHash(state) {
  const { view } = state;
  const viewPart = [
    view.zoom.toFixed(2),
    view.lat.toFixed(5),
    view.lng.toFixed(5),
    view.bearing.toFixed(1),
  ].join("/");

  const params = [];
  if (state.visibleLayers !== null) {
    params.push(`layers=${state.visibleLayers.join(",")}`);
  }
  if (state.basemap && state.basemap !== "simple") {
    params.push(`basemap=${state.basemap}`);
  }
  if (state.embed) {
    params.push("embed");
  }
  if (state.shopFilter) {
    params.push(`shopFilter=${state.shopFilter}`);
  }
  if (state.selection) {
    // Feature keys are URL-safe by construction (osm_type/osm_id, DfT
    // accident indices, police persistent ids, plan slugs, sign codes), like
    // the layer ids in `layers=`, so nothing here needs escaping.
    params.push(`selected=${state.selection.layerId}:${state.selection.key}`);
  }
  const queryPart = params.join("&");
  const hashBody = queryPart ? `${viewPart}?${queryPart}` : viewPart;
  return `#${hashBody}`;
}

export function sameSelection(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.layerId === b.layerId && a.key === b.key;
}

export function initialVisible(state, layerId, defaultOn = false) {
  if (state.visibleLayers === null) return defaultOn;
  return state.visibleLayers.includes(layerId);
}
