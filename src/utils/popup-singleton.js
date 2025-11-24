let openPopup = null;
let openPopupLayerId = null;

export function showPopup(popup, layerId = null) {
  clearPopup();
  openPopup = popup;
  openPopupLayerId = layerId;
  // If the popup is closed by the user, clear our reference so future checks stay accurate.
  popup.on("close", () => {
    if (openPopup === popup) {
      openPopup = null;
      openPopupLayerId = null;
    }
  });
  return popup;
}

export function clearPopup() {
  if (openPopup) {
    openPopup.remove();
    openPopup = null;
    openPopupLayerId = null;
  }
}

export function clearPopupForLayer(layerId) {
  if (!layerId) return;
  if (openPopup && openPopupLayerId === layerId) {
    clearPopup();
  }
}
