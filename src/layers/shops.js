import { createPopupContainer, buildStandardFooter, buildChips } from "../utils/popup.js";
import { placeLayer } from "../utils/layer-order.js";
import { initialVisible } from "../utils/state.js";
import { renderOpeningHoursTable } from "../utils/opening-hours.js";
import { loadIcon } from "../utils/icons.js";
import { addClickPopup } from "../utils/interactions.js";

function normalizeServices(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {
      /* ignore */
    }
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

// opening hours formatting lives in shared util

function buildShopPopup(feature) {
  const props = feature.properties;
  const { root, heading } = createPopupContainer(props.name);
  if (props.website) {
    const link = document.createElement("a");
    link.href = props.website;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.className = "popup__title-link";
    link.textContent = props.name;
    heading.textContent = "";
    heading.appendChild(link);
  }
  const servicesArr = normalizeServices(props.services);

  const chipTexts = [];
  if (props.sells_bikes) chipTexts.push("Sells bikes");
  if (props.sells_parts) chipTexts.push("Sells parts");
  if (props.repairs) chipTexts.push("Repairs bikes");
  if (props.diy) chipTexts.push("DIY workshop");
  if (props.recycles_tyres) chipTexts.push("Recycles tyres");
  if (props.recycles_inner_tubes) chipTexts.push("Recycles inner tubes");
  if (!chipTexts.length && servicesArr.length) {
    servicesArr.slice(0, 4).forEach((s) => chipTexts.push(s));
  }
  const chips = buildChips(chipTexts.map((text) => ({ text, tone: "info" })));
  if (chips) root.appendChild(chips);

  if (props.address) {
    const meta = document.createElement("div");
    meta.className = "popup__meta";
    meta.textContent = props.address;
    root.appendChild(meta);
  }

  const contacts = [];
  if (props.phone)
    contacts.push({
      href: `tel:${String(props.phone).replace(/\s+/g, "")}`,
      text: props.phone,
    });
  if (props.email)
    contacts.push({ href: `mailto:${props.email}`, text: props.email });
  if (props.facebook) contacts.push({ href: props.facebook, text: "Facebook" });
  if (props.instagram)
    contacts.push({ href: props.instagram, text: "Instagram" });
  if (contacts.length) {
    const contactBox = document.createElement("div");
    contactBox.className = "popup-links";
    contacts.forEach((c, idx) => {
      const link = document.createElement("a");
      link.href = c.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = c.text;
      contactBox.appendChild(link);
      if (idx < contacts.length - 1) {
        const sep = document.createElement("span");
        sep.textContent = " "; // space separator only
        contactBox.appendChild(sep);
      }
    });
    root.appendChild(contactBox);
  }
  const hoursCard = renderOpeningHoursTable(props.opening_hours);
  if (hoursCard) root.appendChild(hoursCard);

  const footerRow = buildStandardFooter(feature);
  root.appendChild(footerRow);
  return root;
}

function attachShopInteractions(map, layerId) {
  addClickPopup(map, layerId, buildShopPopup);
}

export async function addShopsLayer(map, urlState) {
  const iconId = "shop-icon";
  await loadIcon(map, iconId, "icons/shop.svg");

  map.addSource("shops", {
    type: "geojson",
    data: `data/shops.geojson`,
  });

  map.addLayer({
    id: "shops-layer",
    type: "symbol",
    source: "shops",
    layout: {
      "icon-image": iconId,
      "icon-size": 0.04,
      "icon-anchor": "bottom",
      "icon-allow-overlap": true,
      "icon-ignore-placement": false,
      visibility: initialVisible(urlState, "shops-layer", false)
        ? "visible"
        : "none",
    },
  });

  placeLayer(map, "shops-layer");
  attachShopInteractions(map, "shops-layer");
}
