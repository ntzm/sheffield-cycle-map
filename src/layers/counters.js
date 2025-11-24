import maplibregl from "maplibre-gl";
import { addSvgImage } from "../utils/icons.js";
import { showPopup } from "../utils/popup-singleton.js";
import { placeLayer } from "../utils/layer-order.js";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";

export async function addCounters(map, urlState) {
  const COUNTER_ICON = "icons/counter.svg";
  const counterSvg = await fetch(COUNTER_ICON).then((r) => r.text());
  await addSvgImage(map, "counter-icon", counterSvg, { pixelRatio: 2 });

  map.addSource("counters", {
    type: "geojson",
    data: `data/counters.geojson`,
  });

  map.addLayer({
    id: "counters-layer",
    type: "symbol",
    source: "counters",
    layout: {
      "icon-image": "counter-icon",
      "icon-size": 0.04,
      "icon-allow-overlap": true,
      "icon-anchor": "center",
      visibility: urlState.visibleLayers.has("counters-layer")
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "counters-layer");

  map.on("click", "counters-layer", (e) => {
    const f = e.features[0];
    const p = f.properties;
    const { root } = createPopupContainer(
      p.ref ? `${p.ref} cycle counter` : "Cycle counter",
    );
    const footer = buildStandardFooter(f);
    root.appendChild(footer);

    showPopup(
      new maplibregl.Popup()
        .setLngLat(f.geometry.coordinates)
        .setDOMContent(root),
      "counters-layer",
    ).addTo(map);
  });

  map.on("mouseenter", "counters-layer", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "counters-layer", () => {
    map.getCanvas().style.cursor = "";
  });
}
