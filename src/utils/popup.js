import { featureLngLat } from "./feature-anchor.js";

export function createPopupContainer(titleText) {
  const root = document.createElement("div");
  root.className = "popup";

  const heading = document.createElement("div");
  heading.className = "popup__heading";
  heading.textContent = titleText;
  root.appendChild(heading);
  return { root, heading };
}

function formatDateYMD(value) {
  if (!value) return "–";
  const d = new Date(value);
  if (!Number.isFinite(d.valueOf())) return "–";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function buildStandardFooter(feature) {
  const props = feature.properties;
  const [lon, lat] = featureLngLat(feature);

  const osmLink = `https://www.openstreetmap.org/${props.osm_type}/${props.osm_id}`;
  const gmapsLink = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

  return buildFooterRow({
    updated: formatDateYMD(props.last_updated),
    osmLink,
    gmapsLink,
  });
}

// Shares the current URL, which includes the open feature in its hash. Uses
// the native share sheet where available, otherwise copies to the clipboard.
function buildShareButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "popup-footer-row__share";
  btn.textContent = "Link";
  btn.addEventListener("click", async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ url });
      } catch {
        // Share sheet dismissed.
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = "Copied!";
    } catch {
      btn.textContent = "Failed";
    }
    setTimeout(() => {
      btn.textContent = "Link";
    }, 1500);
  });
  return btn;
}

export function buildFooterRow({ updated, osmLink, gmapsLink }) {
  const row = document.createElement("div");
  row.className = "popup-footer-row popup-footer-row--meta";

  const addCell = (label, content) => {
    const cell = document.createElement("div");
    cell.className = "popup-footer-row__cell";
    const labelEl = document.createElement("span");
    labelEl.className = "popup-footer-row__label";
    labelEl.textContent = label;
    cell.appendChild(labelEl);
    cell.appendChild(content);
    row.appendChild(cell);
  };

  const updatedVal = document.createElement("span");
  updatedVal.className = "popup-footer-row__value";
  updatedVal.textContent = updated;
  addCell("Updated", updatedVal);

  const osmVal = document.createElement("a");
  osmVal.href = osmLink;
  osmVal.target = "_blank";
  osmVal.rel = "noopener noreferrer";
  osmVal.textContent = "Open";
  addCell("OSM", osmVal);

  const gmapsVal = document.createElement("a");
  gmapsVal.href = gmapsLink;
  gmapsVal.target = "_blank";
  gmapsVal.rel = "noopener noreferrer";
  gmapsVal.textContent = "Open";
  addCell("Google", gmapsVal);

  addCell("Share", buildShareButton());

  return row;
}

export function buildChips(items, extraClass) {
  if (!items.length) return null;
  const wrap = document.createElement("div");
  wrap.className = extraClass ? `popup-chips ${extraClass}` : "popup-chips";
  items.forEach(({ text, tone }) => {
    const chip = document.createElement("span");
    chip.className = tone ? `popup-chip popup-chip--${tone}` : "popup-chip";
    chip.textContent = text;
    wrap.appendChild(chip);
  });
  return wrap;
}

export function addRow(root, label, value) {
  if (value === undefined || value === null || value === "") return;
  const row = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = `${label}:`;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(" "));
  row.appendChild(document.createTextNode(String(value)));
  root.appendChild(row);
}
