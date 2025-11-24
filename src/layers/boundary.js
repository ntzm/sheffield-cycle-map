export function addBoundaryLayer(map, urlState) {
  map.addSource("boundary", {
    type: "geojson",
    data: `data/boundary.geojson`,
  });

  map.addLayer({
    id: "boundary-layer",
    type: "line",
    source: "boundary",
    paint: {
      "line-color": "#6b7280",
      "line-width": 2,
      "line-opacity": 0.9,
      "line-dasharray": [2, 2],
    },
    layout: {
      visibility: urlState.visibleLayers.has("boundary-layer")
        ? "visible"
        : "none",
    },
  });

  // boundary stays at the bottom; no placement needed
}
