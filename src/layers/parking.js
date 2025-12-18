import maplibregl from "maplibre-gl";
import { decode as decodeBlurhash } from "blurhash";
import { createPopupContainer, buildStandardFooter } from "../utils/popup.js";
import { showPopup } from "../utils/popup-singleton.js";
import { placeLayer } from "../utils/layer-order.js";
import { formatOpeningHours } from "../utils/opening-hours.js";
import { formatFee } from "../utils/parking-fee.js";

const operatorUrlMap = {
  Falco: "https://rentals.falco.co.uk/",
  Cyclehoop: "https://cyclehoop.rentals/",
  "Sheffield City Council": "https://www.sheffield.gov.uk/",
  "Russell's Bicycle Shed": "https://www.russellsbicycleshed.co.uk/",
  "East Midlands Railway": "https://www.eastmidlandsrailway.co.uk/",
  "University of Sheffield": "https://sheffield.ac.uk/",
  "Sheffield Hallam University": "https://www.shu.ac.uk/",
  Spokesafe: "https://www.spokesafe.com/",
  "Sheffield Teaching Hospitals NHS Foundation Trust": "https://www.sth.nhs.uk/",
};

function blurhashToDataUrl(hash, width = 32, height = 24) {
  try {
    const pixels = decodeBlurhash(hash, width, height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(pixels);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  } catch (err) {
    console.warn("Failed to decode blurhash", err);
    return null;
  }
}

function formatLastUpdated(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.valueOf())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function buildParkingPopup(feature) {
  const props = feature.properties;
  const { root, heading } = createPopupContainer(props.name);

  const header = document.createElement("div");
  header.className = "parking-popup__header";
  heading.className = "parking-popup__title";
  if (props.website) {
    const titleLink = document.createElement("a");
    titleLink.href = props.website;
    titleLink.target = "_blank";
    titleLink.rel = "noopener noreferrer";
    titleLink.className = "popup__title-link";
    titleLink.textContent = heading.textContent;
    heading.textContent = "";
    heading.appendChild(titleLink);
  }
  header.appendChild(heading);

  const chips = document.createElement("div");
  chips.className = "parking-popup__chips";

  const chipData = [];
  if (props.is_hangar) chipData.push({ text: "Hangar", tone: "info" });
  if (props.is_hub) chipData.push({ text: "Hub", tone: "info" });
  if (props.toilets) chipData.push({ text: "Has toilets", tone: "info" });
  const feeText = formatFee(props.charge, props.fee);
  if (feeText) chipData.push({ text: feeText, tone: "warn" });
  if (props.access) {
    const accessTone =
      /(private|customer|customers|member|students?|employees?)/i.test(
        props.access,
      )
        ? "warn"
        : "neutral";
    chipData.push({ text: props.access, tone: accessTone });
  }
  if (props.wheel_benders === true || props.wheel_benders === "true")
    chipData.push({ text: "Wheelbenders", tone: "alert" });
  if (props.capacity) {
    const isSingular = String(props.capacity) === "1";
    const capText = `${props.capacity} ${isSingular ? "space" : "spaces"}`;
    chipData.push({ text: capText, tone: "neutral" });
  }
  if (props.authentication) {
    JSON.parse(props.authentication).forEach((auth) => {
      chipData.push({ text: `Unlock with ${auth}`, tone: "neutral" });
    })
  }

  if (
    props.covered === "yes" ||
    props.covered === "true" ||
    props.covered === "Yes"
  ) {
    chipData.push({ text: "Covered", tone: "positive" });
  } else if (props.covered === "partial" || props.covered === "Partially") {
    chipData.push({ text: "Partially covered", tone: "warn" });
  } else if (
    props.covered === "no" ||
    props.covered === "false" ||
    props.covered === "No"
  ) {
    chipData.push({ text: "Uncovered", tone: "alert" });
  }

  root.appendChild(header);

  if (props.operator) {
    const op = document.createElement("div");
    op.className = "popup__meta";
    const label = document.createElement("span");
    label.textContent = "Operated by ";
    op.appendChild(label);

    const operatorName = document.createElement("span");
    const mappedUrl = operatorUrlMap[props.operator];
    if (mappedUrl) {
      const link = document.createElement("a");
      link.href = mappedUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "parking-popup__operator-link";
      link.textContent = props.operator;
      operatorName.appendChild(link);
    } else {
      operatorName.textContent = props.operator;
    }
    op.appendChild(operatorName);
    root.appendChild(op);
  }

  if (chipData.length) {
    chipData.forEach(({ text, tone }) => {
      const c = document.createElement("span");
      c.className = `parking-chip parking-chip--${tone}`;
      c.textContent = text;
      chips.appendChild(c);
    });
    root.appendChild(chips);
  }

  if (props.description) {
    const desc = document.createElement("div");
    desc.className = "parking-popup__description";
    desc.textContent = props.description;
    root.appendChild(desc);
  }

  if (props.opening_hours) {
    const formatted = formatOpeningHours(props.opening_hours);
    if (formatted) {
      const row = document.createElement("div");
      const list = document.createElement("div");
      list.className = "shop-hours";
      const lines = Array.isArray(formatted)
        ? formatted
        : String(formatted).split("\n").map((line) => {
            const sepIdx = line.indexOf(":");
            return {
              label: sepIdx > -1 ? line.slice(0, sepIdx).trim() : "",
              value: sepIdx > -1 ? line.slice(sepIdx + 1).trim() : line,
              isToday: false,
            };
          });
      lines.forEach((line) => {
        const labelEl = document.createElement("div");
        labelEl.className = "shop-hours__label";
        labelEl.textContent = line.label;
        const valueEl = document.createElement("div");
        valueEl.className = "shop-hours__value";
        valueEl.textContent = line.value;
        if (line.isToday) {
          labelEl.classList.add("shop-hours__today");
          valueEl.classList.add("shop-hours__today");
        }
        list.appendChild(labelEl);
        list.appendChild(valueEl);
      });
      row.className = "popup__card";
      row.appendChild(list);
      root.appendChild(row);
    }
  }

  const lat = Number(props.lat);
  const lon = Number(props.lon);
  const osmId = props.osm_id;
  const osmType = props.osm_type;
  const osmTypeChar =
    osmType === "way" ? "way" : osmType === "relation" ? "relation" : "node";
  if (props.imageHref) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "parking-popup__media";
    const imgContainer = document.createElement("div");
    imgContainer.className = "parking-popup__image-wrapper";

    const imgLink = document.createElement("a");
    imgLink.href = props.imageHref.replace("/thumb.", "/sd.");
    imgLink.target = "_blank";
    imgLink.rel = "noopener noreferrer";

    const img = document.createElement("img");
    img.src = props.imageHref;
    img.alt = "";
    img.loading = "lazy";
    img.className = "parking-popup__image";
    img.style.opacity = "0";

    if (props.imageBlurhash) {
      const placeholder = blurhashToDataUrl(props.imageBlurhash, 32, 24);
      if (placeholder) {
        imgContainer.style.backgroundImage = `url(${placeholder})`;
      }
    }

    const rawWidth = Number(props.imageWidth);
    const rawHeight = Number(props.imageHeight);

    if (rawWidth > 0 && rawHeight > 0) {
      img.style.aspectRatio = `${rawWidth} / ${rawHeight}`;
      const displayWidth = Math.min(220, rawWidth);
      const expectedHeight = Math.round(displayWidth * (rawHeight / rawWidth));
      img.style.minHeight = `${expectedHeight}px`;
      imgContainer.style.minHeight = `${expectedHeight}px`;
    }

    img.addEventListener("load", () => {
      // Paint the real image first, then clear the blurhash after the fade.
      requestAnimationFrame(() => {
        img.style.opacity = "1";
        setTimeout(() => {
          imgContainer.style.backgroundImage = "";
          img.style.minHeight = "";
          imgContainer.style.minHeight = "";
        }, 180); // matches CSS transition duration
      });
    });
    img.addEventListener("error", () => {
      img.style.minHeight = "";
      imgContainer.style.minHeight = "";
      // keep blurhash on wrapper as fallback on error
    });

    imgLink.appendChild(img);
    imgContainer.appendChild(imgLink);
    imgWrap.appendChild(imgContainer);

    const parts = [];
    if (props.imageAuthor) parts.push(`Photo: ${props.imageAuthor}`);
    if (props.imageLicense) parts.push(`License: ${props.imageLicense}`);
    if (parts.length) {
      const attr = document.createElement("div");
      attr.className = "parking-popup__attribution";
      attr.textContent = parts.join(" • ");
      imgWrap.appendChild(attr);
    }
    root.appendChild(imgWrap);
  }

  const footerRow = buildStandardFooter(feature);

  root.appendChild(footerRow);

  return root;
}

export function attachParkingInteractions(map, layerId) {
  map.on("click", layerId, (e) => {
    const feature = e.features[0];
    const coords = feature.geometry.coordinates.slice();

    const popup = new maplibregl.Popup()
      .setLngLat(coords)
      .setDOMContent(buildParkingPopup(feature));
    showPopup(popup, layerId).addTo(map);
  });

  map.on("mouseenter", layerId, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", layerId, () => {
    map.getCanvas().style.cursor = "";
  });
}

export function addParkingLayers(map, urlState) {
  map.addSource("parking", {
    type: "geojson",
    data: `data/parking.geojson`,
  });

  const restrictedAccessValues = [
    "Private",
    "Members only",
    "Employees only",
    "Students only",
  ];

  map.addLayer({
    id: "parking-public-layer",
    type: "circle",
    source: "parking",
    filter: [
      "all",
      ["!=", ["get", "is_hub"], true],
      ["!=", ["get", "is_hangar"], true],
      ["!", ["in", ["get", "access"], ["literal", restrictedAccessValues]]],
    ],
    paint: {
      "circle-radius": 4,
      "circle-color": "#0f6bd8",
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 1.25,
    },
    layout: {
      visibility:
        urlState.visibleLayers.has("parking-public-layer") ||
        urlState.visibleLayers.size === 0
          ? "visible"
          : "none",
    },
  });

  map.addLayer({
    id: "parking-private-layer",
    type: "circle",
    source: "parking",
    filter: [
      "all",
      ["!=", ["get", "is_hub"], true],
      ["!=", ["get", "is_hangar"], true],
      ["in", ["get", "access"], ["literal", restrictedAccessValues]],
    ],
    paint: {
      "circle-radius": 4,
      "circle-color": "#808080",
      "circle-stroke-color": "#FFFFFF",
      "circle-stroke-width": 1.25,
    },
    layout: {
      visibility:
        urlState.visibleLayers.has("parking-private-layer") ||
        urlState.visibleLayers.size === 0
          ? "visible"
          : "none",
    },
  });

  map.addLayer({
    id: "parking-hangar-layer",
    type: "circle",
    source: "parking",
    filter: ["==", ["get", "is_hangar"], true],
    paint: {
      "circle-radius": 4,
      "circle-color": "#22c55e",
      "circle-stroke-color": "#0f172a",
      "circle-stroke-width": 1.25,
      "circle-opacity": 0.95,
    },
    layout: {
      visibility:
        urlState.visibleLayers.has("parking-hangar-layer") ||
        urlState.visibleLayers.size === 0
          ? "visible"
          : "none",
    },
  });

  map.addLayer({
    id: "parking-hub-layer",
    type: "circle",
    source: "parking",
    filter: ["==", ["get", "is_hub"], true],
    paint: {
      "circle-radius": 4,
      "circle-color": "#f97316",
      "circle-stroke-color": "#111",
      "circle-stroke-width": 1.25,
    },
    layout: {
      visibility:
        urlState.visibleLayers.has("parking-hub-layer") ||
        urlState.visibleLayers.size === 0
          ? "visible"
          : "none",
    },
  });

  [
    "parking-hub-layer",
    "parking-public-layer",
    "parking-hangar-layer",
    "parking-private-layer",
  ].forEach(placeLayer.bind(null, map));

  [
    "parking-public-layer",
    "parking-private-layer",
    "parking-hangar-layer",
    "parking-hub-layer",
  ].forEach((id) => attachParkingInteractions(map, id));
}
