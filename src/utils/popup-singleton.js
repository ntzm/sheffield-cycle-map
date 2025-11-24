let openPopup = null;

export function showPopup(popup) {
  if (openPopup) {
    openPopup.remove();
  }
  openPopup = popup;
  return popup;
}

export function clearPopup() {
  if (openPopup) {
    openPopup.remove();
    openPopup = null;
  }
}
