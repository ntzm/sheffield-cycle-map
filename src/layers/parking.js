import { decode as decodeBlurhash } from "blurhash";
import { loadIcon, DENSE_ICON_SIZE } from "../utils/icons.js";
import {
  createPopupContainer,
  buildStandardFooter,
  buildChips,
} from "../utils/popup.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { renderOpeningHoursTable } from "../utils/opening-hours.js";
import { formatFee } from "../utils/parking-fee.js";
import { registerSheetLayer } from "../utils/interactions.js";
import { fetchGeojson } from "../utils/fetch-geojson.js";

const operatorUrlMap = {
  Falco: "https://rentals.falco.co.uk/",
  Cyclehoop: "https://cyclehoop.rentals/",
  "Sheffield City Council": "https://www.sheffield.gov.uk/",
  "Russell's Bicycle Shed": "https://www.russellsbicycleshed.co.uk/",
  "East Midlands Railway": "https://www.eastmidlandsrailway.co.uk/",
  "University of Sheffield": "https://sheffield.ac.uk/",
  "Sheffield Hallam University": "https://www.shu.ac.uk/",
  Spokesafe: "https://www.spokesafe.com/",
  "Sheffield Teaching Hospitals NHS Foundation Trust":
    "https://www.sth.nhs.uk/",
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
    });
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

  const chips = buildChips(chipData);
  if (chips) root.appendChild(chips);

  if (props.description) {
    const desc = document.createElement("div");
    desc.className = "parking-popup__description";
    desc.textContent = props.description;
    root.appendChild(desc);
  }

  if (props.opening_hours) {
    const hoursCard = renderOpeningHoursTable(props.opening_hours);
    if (hoursCard) root.appendChild(hoursCard);
  }

  const [lon, lat] = feature.geometry.coordinates;
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
      imgContainer.style.aspectRatio = `${rawWidth} / ${rawHeight}`;
    }

    img.addEventListener("load", () => {
      // Paint the real image first, then clear the blurhash after the fade.
      requestAnimationFrame(() => {
        img.style.opacity = "1";
        setTimeout(() => {
          imgContainer.style.backgroundImage = "";
        }, 180); // matches CSS transition duration
      });
    });
    // On error the blurhash on the wrapper stays as a fallback.

    imgLink.appendChild(img);
    imgContainer.appendChild(imgLink);
    imgWrap.appendChild(imgContainer);

    const enlargeHint = document.createElement("div");
    enlargeHint.className = "parking-popup__enlarge-hint";
    enlargeHint.textContent = "Click to enlarge";
    imgWrap.appendChild(enlargeHint);

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

export async function addParkingLayers(map, urlState) {
  const restrictedAccessValues = [
    "Private",
    "Members only",
    "Employees only",
    "Students only",
  ];

  const notHub = ["!=", ["get", "is_hub"], true];
  const notHangar = ["!=", ["get", "is_hangar"], true];
  const isRestricted = [
    "in",
    ["get", "access"],
    ["literal", restrictedAccessValues],
  ];

  const parkingVariants = [
    {
      id: "parking-public-layer",
      filter: ["all", notHub, notHangar, ["!", isRestricted]],
      icon: "parking-public",
    },
    {
      id: "parking-private-layer",
      filter: ["all", notHub, notHangar, isRestricted],
      icon: "parking-private",
    },
    {
      id: "parking-hangar-layer",
      filter: ["==", ["get", "is_hangar"], true],
      icon: "parking-hangar",
    },
    {
      id: "parking-hub-layer",
      filter: ["==", ["get", "is_hub"], true],
      icon: "parking-hub",
      // Hubs are rare, significant facilities; render them bigger than
      // ordinary stands.
      size: ["interpolate", ["linear"], ["zoom"], 11, 0.5, 14, 0.85, 17, 1.35],
    },
  ];

  const [data] = await Promise.all([
    fetchGeojson("data/parking.geojson"),
    ...parkingVariants.map(({ icon }) =>
      loadIcon(map, `${icon}-icon`, `icons/${icon}.svg`),
    ),
  ]);

  map.addSource("parking", {
    type: "geojson",
    data,
  });

  for (const { id, filter, icon, size } of parkingVariants) {
    map.addLayer({
      id,
      type: "symbol",
      source: "parking",
      filter,
      layout: {
        "icon-image": `${icon}-icon`,
        "icon-size": size || DENSE_ICON_SIZE,
        "icon-allow-overlap": true,
        "icon-ignore-placement": false,
        visibility: initialVisible(urlState, id, true) ? "visible" : "none",
      },
    });
    placeLayer(map, id);
    registerSheetLayer(map, id, {
      features: data.features,
      buildContent: buildParkingPopup,
    });
  }
}
