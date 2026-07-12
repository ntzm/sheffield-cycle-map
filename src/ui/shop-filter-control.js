import { fetchGeojson } from "../utils/fetch-geojson.js";

// Floating control (bottom-left) for filtering shops by service attributes.
// Implements the MapLibre IControl interface.
export const SHOP_FILTERS = [
  { key: "sells_bikes", label: "Sells bikes" },
  { key: "repairs", label: "Repairs bikes" },
  { key: "sells_parts", label: "Sells parts" },
  { key: "recycles_inner_tubes", label: "Recycles inner tubes" },
  { key: "recycles_tyres", label: "Recycles tyres" },
];

const ALL_KEY = "__all__";

export class ShopFilterControl {
  constructor(options = {}) {
    this._onChange = options.onChange;
    const initialKey = options.initialKey;
    this._selected = SHOP_FILTERS.some((f) => f.key === initialKey)
      ? initialKey
      : null;
    this._container = null;
    this._countEls = new Map();
    this._countsLoaded = false;
  }

  onAdd() {
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl shop-filter-control";
    container.style.display = "none";

    const title = document.createElement("div");
    title.className = "shop-filter-control__title";
    title.textContent = "Filter shops";
    container.appendChild(title);

    const options = [{ key: ALL_KEY, label: "All shops" }, ...SHOP_FILTERS];
    options.forEach(({ key, label }) => {
      const item = document.createElement("label");
      item.className = "shop-filter-control__item";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "shop-filter";
      radio.value = key;
      radio.checked =
        key === ALL_KEY ? this._selected === null : key === this._selected;
      radio.addEventListener("change", () => {
        if (!radio.checked) return;
        this._selected = key === ALL_KEY ? null : key;
        if (typeof this._onChange === "function") {
          this._onChange(this._selected);
        }
      });

      const text = document.createElement("span");
      text.textContent = label;

      const count = document.createElement("span");
      count.className = "shop-filter-control__count";
      this._countEls.set(key, count);

      item.append(radio, text, count);
      container.appendChild(item);
    });

    this._container = container;
    return container;
  }

  onRemove() {
    if (this._container) {
      this._container.remove();
      this._container = null;
    }
  }

  getSelectedKey() {
    return this._selected;
  }

  // Programmatically select a filter (null = all shops), notifying onChange
  // if it actually changed. Unknown keys are treated as null.
  setSelectedKey(key) {
    const valid = SHOP_FILTERS.some((f) => f.key === key) ? key : null;
    if (valid === this._selected) return;
    this._selected = valid;
    if (this._container) {
      const wantValue = valid === null ? ALL_KEY : valid;
      this._container
        .querySelectorAll('input[type="radio"]')
        .forEach((radio) => {
          radio.checked = radio.value === wantValue;
        });
    }
    if (typeof this._onChange === "function") {
      this._onChange(this._selected);
    }
  }

  // Revert to "All shops", notifying onChange if a filter was active.
  reset() {
    this.setSelectedKey(null);
  }

  setVisible(visible) {
    if (this._container) {
      this._container.style.display = visible ? "" : "none";
    }
    if (visible) this._loadCounts();
  }

  async _loadCounts() {
    if (this._countsLoaded) return;
    this._countsLoaded = true;
    try {
      const data = await fetchGeojson("data/shops.geojson");
      const features = data.features || [];
      this._setCount(ALL_KEY, features.length);
      SHOP_FILTERS.forEach(({ key }) => {
        this._setCount(
          key,
          features.filter((f) => f.properties && f.properties[key] === true)
            .length,
        );
      });
    } catch (err) {
      console.error("Failed to load shop filter counts", err);
      this._countsLoaded = false;
    }
  }

  _setCount(key, count) {
    const el = this._countEls.get(key);
    if (el) el.textContent = String(count);
  }
}
