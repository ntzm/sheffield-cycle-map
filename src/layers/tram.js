import { placeLayer } from "../utils/layer-order.js";

export function addEmbeddedTramTracks(map, urlState) {
  map.addSource("embedded-tram-tracks", {
    type: "geojson",
    data: `data/embedded_tram_tracks.geojson`,
  });

  map.addLayer({
    id: "embedded-tram-tracks-layer",
    type: "line",
    source: "embedded-tram-tracks",
    layout: {
      "line-join": "round",
      "line-cap": "round",
      visibility: urlState.visibleLayers.has("embedded-tram-tracks-layer")
        ? "visible"
        : "none",
    },
    paint: {
      "line-color": "#6b7280",
      "line-width": [
        "interpolate",
        ["linear"],
        ["zoom"],
        10,
        1.4,
        13,
        2.4,
        15,
        3.4,
        17,
        4.4,
      ],
      "line-opacity": 0.85,
      "line-dasharray": [2, 1.2],
    },
  });

  placeLayer(map, "embedded-tram-tracks-layer");
}
