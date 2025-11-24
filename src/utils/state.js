export function parseHashState() {
  const hash = window.location.hash.replace(/^#/, "");
  const [pathPart, queryPart] = hash.split("?");
  const viewDefaults = { lng: -1.47, lat: 53.38, zoom: 12, bearing: 0 };
  const result = {
    view: { ...viewDefaults },
    visibleLayers: new Set(),
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
    const layersParam = params.get("layers");
    if (layersParam) {
      layersParam
        .split(",")
        .filter(Boolean)
        .forEach((id) => result.visibleLayers.add(id));
    }
  }

  return result;
}

export function formatHashState(map, visibleLayerIds) {
  const center = map.getCenter();
  const zoom = map.getZoom();
  const bearing = map.getBearing();

  const viewPart = [
    zoom.toFixed(2),
    center.lat.toFixed(5),
    center.lng.toFixed(5),
    bearing.toFixed(1),
  ].join("/");

  const layersPart = visibleLayerIds.length
    ? `layers=${visibleLayerIds.join(",")}`
    : "";
  const hash = layersPart ? `${viewPart}?${layersPart}` : viewPart;
  return `#${hash}`;
}

export function initialVisible(urlState, layerId, defaultOn = false) {
  if (urlState.visibleLayers.size === 0) return defaultOn;
  return urlState.visibleLayers.has(layerId);
}
