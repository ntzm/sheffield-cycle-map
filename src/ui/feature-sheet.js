import maplibregl from "maplibre-gl";

// Feature info panel: slides out from the right edge, full height, on all
// screen sizes. Replaces MapLibre popups. One shared instance for all layers.

let els = null; // { sheet, content }
let marker = null;
let openLayerId = null;

function ensureEls(map) {
  if (els) return els;

  const sheet = document.createElement("div");
  sheet.className = "feature-sheet feature-sheet--hidden";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", "Feature details");

  const close = document.createElement("button");
  close.className = "feature-sheet__close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  close.addEventListener("click", closeFeatureSheet);
  sheet.appendChild(close);

  const content = document.createElement("div");
  content.className = "feature-sheet__content";
  sheet.appendChild(content);

  // Mount inside the map container so the sheet stays visible in fullscreen.
  map.getContainer().appendChild(sheet);

  // Swipe right to dismiss. Only kicks in for clearly horizontal gestures so
  // scrolling the content vertically keeps working.
  let startX = null;
  let startY = null;
  let dragDelta = 0;
  let dragging = false;

  sheet.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragDelta = 0;
      dragging = false;
    },
    { passive: true },
  );

  sheet.addEventListener(
    "touchmove",
    (e) => {
      if (startX === null) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (Math.abs(dy) > Math.abs(dx)) {
          // Vertical gesture: leave it to the content scroll.
          startX = null;
          return;
        }
        if (dx > 8) {
          dragging = true;
          sheet.classList.add("feature-sheet--dragging");
        }
      }
      if (dragging) {
        dragDelta = dx;
        sheet.style.setProperty("--tx", `${Math.max(0, dx)}px`);
        e.preventDefault();
      }
    },
    { passive: false },
  );

  const endDrag = () => {
    if (startX === null) return;
    sheet.classList.remove("feature-sheet--dragging");
    sheet.style.removeProperty("--tx");
    const shouldClose = dragging && dragDelta > 80;
    startX = null;
    dragging = false;
    dragDelta = 0;
    if (shouldClose) closeFeatureSheet();
  };
  sheet.addEventListener("touchend", endDrag);
  sheet.addEventListener("touchcancel", endDrag);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeFeatureSheet();
  });

  els = { sheet, content };
  return els;
}

function setHighlight(map, lngLat) {
  removeHighlight();
  const el = document.createElement("div");
  el.className = "feature-halo";
  marker = new maplibregl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
}

function removeHighlight() {
  if (marker) {
    marker.remove();
    marker = null;
  }
}

// Pan the map just enough that the selected feature isn't hidden under the
// panel (popups used to auto-pan; the panel needs to do the same).
function ensureFeatureVisible(map, lngLat) {
  requestAnimationFrame(() => {
    if (!els || els.sheet.classList.contains("feature-sheet--hidden")) return;
    const px = map.project(lngLat);
    const rect = els.sheet.getBoundingClientRect();
    const margin = 24;
    const covered =
      px.x >= rect.left - margin &&
      px.x <= rect.right + margin &&
      px.y >= rect.top - margin &&
      px.y <= rect.bottom + margin;
    if (!covered) return;
    map.panBy([px.x - (rect.left - margin), 0], { duration: 250 });
  });
}

export function openFeatureSheet(map, layerId, contentNode, lngLat) {
  const { sheet, content } = ensureEls(map);
  openLayerId = layerId;
  content.replaceChildren(contentNode);
  content.scrollTop = 0;
  sheet.classList.remove("feature-sheet--hidden");
  document.body.classList.add("feature-sheet-open");
  setHighlight(map, lngLat);
  ensureFeatureVisible(map, lngLat);
}

export function closeFeatureSheet() {
  openLayerId = null;
  removeHighlight();
  document.body.classList.remove("feature-sheet-open");
  if (!els) return;
  els.sheet.classList.add("feature-sheet--hidden");
  els.sheet.style.removeProperty("--tx");
}

export function closeFeatureSheetForLayer(layerId) {
  if (layerId && layerId === openLayerId) closeFeatureSheet();
}
