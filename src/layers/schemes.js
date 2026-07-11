import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { createPopupContainer } from "../utils/popup.js";
import {
  hasFeatureInfoAt,
  registerFeatureInfoLayers,
} from "../utils/interactions.js";
import { openFeatureSheet } from "../ui/feature-sheet.js";

// Scheme plan sheets georeferenced onto the map as image overlays.
// The manifest lists each sheet's image and its four corner coordinates
// (top-left, top-right, bottom-right, bottom-left).
const SCHEME_IMAGE_LAYER_IDS = [
  "schemes-sharrow-lane-layer",
  "schemes-washington-road-layer",
  "schemes-summerfield-street-layer",
  "schemes-cemetery-road-layer",
  "schemes-st-marys-gate-layer",
  "schemes-ecclesall-road-crossing-layer",
  "schemes-moore-street-young-street-layer",
  "schemes-charter-row-layer",
  "schemes-dacc-victoria-quays-layer",
  "schemes-dacc-attercliffe-road-west-layer",
  "schemes-dacc-attercliffe-centre-layer",
  "schemes-dacc-attercliffe-common-layer",
  "schemes-dacc-darnall-layer",
  "schemes-thl-leopold-street-layer",
  "schemes-thl-townhead-street-layer",
  "schemes-castle-street-detail-layer",
  "schemes-cc-arundel-gate-layer",
  "schemes-cc-pinstone-charles-layer",
];

// Each plan gets an invisible fill layer over its footprint so clicks on the
// image can open a popup (raster layers aren't queryable in MapLibre).
const hitLayerId = (imageLayerId) =>
  imageLayerId.replace(/-layer$/, "-hit-layer");

export const SCHEME_LAYER_IDS = [
  ...SCHEME_IMAGE_LAYER_IDS,
  ...SCHEME_IMAGE_LAYER_IDS.map(hitLayerId),
];

function buildSchemePopup(props) {
  const { root } = createPopupContainer(props.name);

  const schemeRow = document.createElement("div");
  schemeRow.textContent = props.scheme;
  root.appendChild(schemeRow);

  const link = document.createElement("a");
  link.href = props.source;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "View scheme details on the council website";
  root.appendChild(link);

  return root;
}

export async function addSchemesLayers(map, urlState) {
  const res = await fetch("data/schemes.json");
  const manifest = await res.json();

  const visible = initialVisible(urlState, "schemes-layer", false)
    ? "visible"
    : "none";

  const plans = manifest.schemes.flatMap((scheme) =>
    scheme.plans.map((plan) => ({ ...plan, scheme })),
  );
  for (const plan of plans) {
    const sourceId = `schemes-${plan.id}`;
    const layerId = `schemes-${plan.id}-layer`;

    map.addSource(sourceId, {
      type: "image",
      url: plan.url,
      coordinates: plan.coordinates,
    });

    map.addLayer({
      id: layerId,
      type: "raster",
      source: sourceId,
      paint: {
        "raster-opacity": 0.8,
        "raster-fade-duration": 0,
      },
      layout: {
        visibility: visible,
      },
    });
    placeLayer(map, layerId);

    map.addSource(`${sourceId}-hit`, {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {
          name: plan.name,
          scheme: plan.scheme.scheme,
          source: plan.scheme.source,
        },
        geometry: {
          type: "Polygon",
          coordinates: [[...plan.coordinates, plan.coordinates[0]]],
        },
      },
    });

    map.addLayer({
      id: hitLayerId(layerId),
      type: "fill",
      source: `${sourceId}-hit`,
      paint: {
        "fill-opacity": 0,
      },
      layout: {
        visibility: visible,
      },
    });
    placeLayer(map, hitLayerId(layerId));
  }

  const hitLayerIds = SCHEME_IMAGE_LAYER_IDS.map(hitLayerId).filter((id) =>
    map.getLayer(id),
  );

  registerFeatureInfoLayers(map, hitLayerIds);

  map.on("click", (e) => {
    const hits = map.queryRenderedFeatures(e.point, { layers: hitLayerIds });
    if (!hits.length) return;
    // Features with their own info sheets (shops, parking, ...) render above
    // the plan overlays; don't also react to clicks aimed at them.
    if (hasFeatureInfoAt(map, e.point)) return;
    const feature = hits[0];
    openFeatureSheet(
      map,
      feature.layer.id,
      buildSchemePopup(feature.properties),
      e.lngLat,
    );
  });

  // Pointer cursor over any plan. Plans can overlap, so track hover state via
  // mousemove instead of per-layer mouseenter/mouseleave, and only touch the
  // cursor on transitions to avoid clobbering other layers' hover cursors.
  let hovering = false;
  map.on("mousemove", (e) => {
    const over =
      map.queryRenderedFeatures(e.point, { layers: hitLayerIds }).length > 0;
    if (over === hovering) return;
    hovering = over;
    map.getCanvas().style.cursor = over ? "pointer" : "";
  });
}
