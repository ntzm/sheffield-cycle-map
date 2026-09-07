import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { NETWORK_LINE_WIDTH } from "../utils/network-line-width.js";
import { SCN_ROUTES, scnLineLayerId, scnShieldLayerId } from "./scn-routes.js";

// Sheffield Cycle Network. One line + shield layer pair per route so each
// route is individually toggleable in the layer control.
export function addScn(map, urlState) {
  map.addSource("scn", {
    type: "geojson",
    data: `data/scn.geojson`,
  });

  for (const route of SCN_ROUTES) {
    const lineId = scnLineLayerId(route.ref);
    const shieldId = scnShieldLayerId(route.ref);
    const vis = initialVisible(urlState, lineId, false) ? "visible" : "none";
    const filter = ["==", ["get", "ref"], route.ref];

    map.addLayer({
      id: lineId,
      type: "line",
      source: "scn",
      filter,
      layout: {
        "line-join": "round",
        "line-cap": "butt",
        visibility: vis,
      },
      paint: {
        "line-color": route.color,
        "line-width": NETWORK_LINE_WIDTH,
        // Yellow needs more opacity than the NCN purple to read on the
        // light basemap.
        // Layer-level so overlapping legs do not stack (see lcn.js).
        "line-layer-opacity": 0.55,
      },
    });

    map.addLayer({
      id: shieldId,
      type: "symbol",
      source: "scn",
      filter,
      layout: {
        "symbol-placement": "line",
        "symbol-spacing": 200,
        "text-field": ["get", "ref"],
        "text-font": ["Noto Sans Bold"],
        "text-rotation-alignment": "viewport",
        "text-size": 10,
        "text-padding": 2,
        visibility: vis,
      },
      paint: {
        "text-color": route.textColor,
        "text-halo-color": route.color,
        "text-halo-width": 5,
      },
    });

    placeLayer(map, lineId);
    placeLayer(map, shieldId);
  }
}
