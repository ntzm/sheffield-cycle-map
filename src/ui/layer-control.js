import { clearPopupForLayer } from "../utils/popup-singleton.js";

export class LayerControl {
  constructor(layers, options = {}) {
    this._map = null;
    this._container = null;
    this._layers = layers;
    this._title = options.title || "Layers";
    this._collapsed = !!options.startCollapsed;
    this._checkboxes = new Map();
    this._items = new Map();
    this._configs = new Map();
    this._childrenByParent = new Map();
    this._collapsedParents = new Set();
    this._onChange = options.onChange;
  }

  build(map) {
    this._map = map;

    const container = document.createElement("div");
    container.className = "maplibre-layer-control";

    const headerEl = document.createElement("div");
    headerEl.className = "maplibre-layer-control__header";

    const titleEl = document.createElement("div");
    titleEl.className = "maplibre-layer-control__title";
    titleEl.textContent = this._title;
    headerEl.appendChild(titleEl);
    container.appendChild(headerEl);

    const listEl = document.createElement("div");
    listEl.className = "maplibre-layer-control__list";
    container.appendChild(listEl);

    this._layers.forEach((layerConfig) => {
      const {
        id,
        name,
        description,
        legendColor,
        legendLineColor,
        legendLineWidth,
        legendLineDash,
        legendIcon,
        initiallyVisible,
        linkedLayers = [],
        parentId,
        virtual = false,
      } = layerConfig;

      this._configs.set(id, layerConfig);

      if (parentId) {
        const arr = this._childrenByParent.get(parentId) || [];
        arr.push(id);
        this._childrenByParent.set(parentId, arr);
      }

      const item = document.createElement("label");
      item.className =
        "maplibre-layer-control__item" +
        (parentId ? " maplibre-layer-control__item--child" : "");

      const row = document.createElement("div");
      row.className = "maplibre-layer-control__row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "maplibre-layer-control__checkbox";
      checkbox.dataset.layerId = id;

      let checked = !!initiallyVisible;
      const layerExists = !!map.getLayer(id);
      if (layerExists) {
        const currentVis = map.getLayoutProperty(id, "visibility");
        checked = currentVis !== "none";
      }
      checkbox.checked = checked;

      const labelText = document.createElement("span");
      labelText.className = "maplibre-layer-control__label layer-legend-label";

      if (legendIcon) {
        const iconSwatch = document.createElement("span");
        iconSwatch.className = "layer-legend-icon";
        iconSwatch.style.backgroundImage = `url(${legendIcon})`;
        labelText.appendChild(iconSwatch);
      } else if (legendColor) {
        const dot = document.createElement("span");
        dot.className = "layer-legend-dot";
        dot.style.backgroundColor = legendColor;
        labelText.appendChild(dot);
      } else if (legendLineColor) {
        const lineSwatch = document.createElement("span");
        lineSwatch.className = "layer-legend-line";
        if (legendLineDash) {
          const widthPx = legendLineWidth || 3;
          lineSwatch.style.height = "0";
          lineSwatch.style.width = "18px";
          lineSwatch.style.borderTop = `${widthPx}px dashed ${legendLineColor}`;
          lineSwatch.style.transform = "translateY(1px)";
        } else {
          lineSwatch.style.backgroundColor = legendLineColor;
          if (legendLineWidth) lineSwatch.style.height = `${legendLineWidth}px`;
        }
        labelText.appendChild(lineSwatch);
      }

      const labelCopy = document.createElement("span");
      labelCopy.textContent = name || id;
      labelText.appendChild(labelCopy);

      const infoBtn = document.createElement("button");
      infoBtn.type = "button";
      infoBtn.className = "maplibre-layer-control__info";
      infoBtn.textContent = "i";
      if (!description) infoBtn.style.display = "none";

      const descBox = document.createElement("div");
      descBox.className = "maplibre-layer-control__desc";
      descBox.textContent = description || "";
      descBox.hidden = true;

      infoBtn.addEventListener("click", (e) => {
        e.preventDefault();
        descBox.hidden = !descBox.hidden;
      });

      row.appendChild(checkbox);
      row.appendChild(labelText);
      row.appendChild(infoBtn);
      item.appendChild(row);
      item.appendChild(descBox);
      listEl.appendChild(item);

      checkbox.addEventListener("change", () => {
        const layerId = checkbox.dataset.layerId;
        if (!layerId) return;

        const visibility = checkbox.checked ? "visible" : "none";
        const targets = [layerId, ...linkedLayers];

        if (visibility === "none") {
          targets.forEach(clearPopupForLayer);
        }

        targets.forEach((targetLayerId) => {
          if (this._map.getLayer(targetLayerId)) {
            this._map.setLayoutProperty(
              targetLayerId,
              "visibility",
              visibility,
            );
          }
          const childCheckbox = this._checkboxes.get(targetLayerId);
          if (childCheckbox) {
            childCheckbox.indeterminate = false;
            childCheckbox.checked = checkbox.checked;
          }
        });

        if (parentId) {
          this._updateParentState(parentId);
        }

        if (typeof this._onChange === "function") {
          this._onChange(this.getVisibleLayerIds());
        }
      });

      this._checkboxes.set(id, checkbox);
      this._items.set(id, { item, row, descBox });
    });

    this._childrenByParent.forEach((_, parentId) => {
      this._updateParentState(parentId);
    });

    // Add collapse toggles to parents that have children.
    this._childrenByParent.forEach((childIds, parentId) => {
      const parentEntry = this._items.get(parentId);
      if (!parentEntry) return;
      const { row } = parentEntry;

      const collapseBtn = document.createElement("button");
      collapseBtn.type = "button";
      collapseBtn.className = "maplibre-layer-control__collapse";
      collapseBtn.textContent = "▾";

      let collapsed = false;
      const updateState = () => {
        collapseBtn.textContent = collapsed ? "▸" : "▾";
        this._setChildrenVisibility(parentId, !collapsed);
        if (collapsed) this._collapsedParents.add(parentId);
        else this._collapsedParents.delete(parentId);
      };

      collapseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        collapsed = !collapsed;
        updateState();
      });

      row.appendChild(collapseBtn);
      updateState();
    });

    this._container = container;
    return container;
  }

  getVisibleLayerIds() {
    const ids = [];
    this._checkboxes.forEach((cb, id) => {
      if (cb.checked) ids.push(id);
    });
    return ids;
  }

  _updateParentState(parentId) {
    const parentCheckbox = this._checkboxes.get(parentId);
    const childIds = this._childrenByParent.get(parentId) || [];
    if (!parentCheckbox || childIds.length === 0) return;

    const cfg = this._configs.get(parentId);
    if (cfg && cfg.independentChildren) return;

    let visibleCount = 0;
    let hiddenCount = 0;

    childIds.forEach((cid) => {
      const cb = this._checkboxes.get(cid);
      if (!cb) return;
      if (cb.checked) visibleCount += 1;
      else hiddenCount += 1;
    });

    if (visibleCount === childIds.length) {
      parentCheckbox.indeterminate = false;
      parentCheckbox.checked = true;
    } else if (hiddenCount === childIds.length) {
      parentCheckbox.indeterminate = false;
      parentCheckbox.checked = false;
    } else {
      parentCheckbox.indeterminate = true;
      parentCheckbox.checked = false;
    }
  }

  _setCollapsed(collapsed) {
    this._collapsed = collapsed;
    if (!this._container) return;
    this._container.classList.toggle(
      "maplibre-layer-control--collapsed",
      collapsed,
    );
  }

  _setChildrenVisibility(parentId, visible) {
    const childIds = this._childrenByParent.get(parentId) || [];
    childIds.forEach((cid) => {
      const entry = this._items.get(cid);
      if (!entry) return;
      entry.item.style.display = visible ? "" : "none";
    });
  }
}
