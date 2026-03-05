import maplibregl from "maplibre-gl";
import { clearPopup } from "../utils/popup-singleton.js";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const VIEWBOX = "-1.8,53.3,-1.1,53.5";
const MIN_QUERY_LENGTH = 3;
const FETCH_LIMIT = 20;
const DISPLAY_LIMIT = 5;
const FLY_ZOOM = 16;

// category/type → icon, keyed as "category/type" for exact match,
// then "category" as fallback.
const ICONS = {
  "amenity/cafe": "\u2615",
  "amenity/restaurant": "\u{1F37D}\uFE0F",
  "amenity/pub": "\u{1F37A}",
  "amenity/bar": "\u{1F378}",
  "amenity/hospital": "\u{1F3E5}",
  "amenity/clinic": "\u{1F3E5}",
  "amenity/pharmacy": "\u{1F48A}",
  "amenity/school": "\u{1F3EB}",
  "amenity/university": "\u{1F393}",
  "amenity/library": "\u{1F4DA}",
  "amenity/cinema": "\u{1F3AC}",
  "amenity/theatre": "\u{1F3AD}",
  "amenity/music_venue": "\u{1F3B5}",
  "amenity/police": "\u{1F6A8}",
  "amenity/fire_station": "\u{1F692}",
  "amenity/place_of_worship": "\u{1F6D0}",
  "amenity/parking": "\u{1F17F}\uFE0F",
  "amenity/fuel": "\u26FD",
  "amenity/taxi": "\u{1F695}",
  amenity: "\u{1F4CD}",
  "craft/brewery": "\u{1F37A}",
  craft: "\u{1F527}",
  healthcare: "\u{1F3E5}",
  "highway/bus_stop": "\u{1F68F}",
  highway: "\u{1F6E3}\uFE0F",
  historic: "\u{1F3DB}\uFE0F",
  "landuse/industrial": "\u{1F3ED}",
  landuse: "\u{1F33F}",
  "leisure/park": "\u{1F333}",
  "leisure/sports_centre": "\u{1F3CB}\uFE0F",
  "leisure/swimming_pool": "\u{1F3CA}",
  leisure: "\u{1F333}",
  "natural/water": "\u{1F4A7}",
  natural: "\u{26F0}\uFE0F",
  office: "\u{1F4BC}",
  "place/suburb": "\u{1F4CD}",
  "place/neighbourhood": "\u{1F4CD}",
  "place/quarter": "\u{1F4CD}",
  "place/islet": "\u{1F3DD}\uFE0F",
  place: "\u{1F4CD}",
  "railway/station": "\u{1F682}",
  railway: "\u{1F682}",
  "shop/supermarket": "\u{1F6D2}",
  shop: "\u{1F6CD}\uFE0F",
  "tourism/hotel": "\u{1F3E8}",
  "tourism/hostel": "\u{1F3E8}",
  "tourism/museum": "\u{1F3DB}\uFE0F",
  tourism: "\u{2139}\uFE0F",
  "waterway/river": "\u{1F30A}",
  "waterway/weir": "\u{1F30A}",
  waterway: "\u{1F30A}",
  building: "\u{1F3E0}",
};

function iconFor(category, type) {
  return ICONS[category + "/" + type] || ICONS[category] || "";
}

let boundaryRing = null;
const boundaryReady = fetch("data/boundary.geojson")
  .then((r) => r.json())
  .then((fc) => {
    boundaryRing = fc.features[0].geometry.coordinates[0];
  })
  .catch(() => {});

function pointInRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export class SearchBar {
  constructor() {
    this._map = null;
    this._marker = null;
    this._abortController = null;
    this._highlightIndex = -1;
    this._results = [];
  }

  build(map) {
    this._map = map;

    const wrapper = document.createElement("div");
    wrapper.className = "search-bar";

    const inputWrap = document.createElement("div");
    inputWrap.className = "search-bar__input-wrap";

    const input = document.createElement("input");
    input.type = "search";
    input.enterKeyHint = "search";
    input.className = "search-bar__input";
    input.placeholder = "Search places\u2026";
    input.autocomplete = "off";
    input.spellcheck = false;
    this._input = input;

    const searchBtn = document.createElement("button");
    searchBtn.type = "button";
    searchBtn.className = "search-bar__search";
    searchBtn.textContent = "\u{1F50D}";
    searchBtn.setAttribute("aria-label", "Search");

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "search-bar__clear";
    clearBtn.textContent = "\u00d7";
    clearBtn.hidden = true;
    this._clearBtn = clearBtn;

    inputWrap.appendChild(input);
    inputWrap.appendChild(searchBtn);
    inputWrap.appendChild(clearBtn);
    wrapper.appendChild(inputWrap);

    const dropdown = document.createElement("div");
    dropdown.className = "search-bar__dropdown";
    dropdown.hidden = true;
    this._dropdown = dropdown;
    wrapper.appendChild(dropdown);

    const doSearch = () => {
      const q = input.value.trim();
      if (q) this._search(q);
    };

    searchBtn.addEventListener("click", doSearch);

    input.addEventListener("input", () => {
      clearBtn.hidden = !input.value;
      this._hideDropdown();
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (this._results.length && this._highlightIndex >= 0) {
          this._selectResult(this._results[this._highlightIndex]);
        } else {
          this._search(input.value.trim());
        }
      } else if (e.key === "Escape") {
        this._hideDropdown();
        input.blur();
      } else if (this._results.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          this._moveHighlight(1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          this._moveHighlight(-1);
        }
      }
    });

    clearBtn.addEventListener("click", () => {
      input.value = "";
      clearBtn.hidden = true;
      this._hideDropdown();
      this._removeMarker();
    });

    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target)) this._hideDropdown();
    });

    return wrapper;
  }

  async _search(query) {
    if (query.length < MIN_QUERY_LENGTH) return;

    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    await boundaryReady;

    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: String(FETCH_LIMIT),
      viewbox: VIEWBOX,
      bounded: "1",
    });

    try {
      const res = await fetch(`${NOMINATIM_URL}?${params}`, {
        signal: this._abortController.signal,
      });
      let data = await res.json();

      if (boundaryRing) {
        data = data.filter((r) =>
          pointInRing(parseFloat(r.lon), parseFloat(r.lat), boundaryRing),
        );
      }
      data = data.slice(0, DISPLAY_LIMIT);

      if (data.length === 1) {
        this._selectResult(data[0]);
      } else {
        this._showResults(data);
      }
    } catch (err) {
      if (err.name !== "AbortError") console.error("Search failed:", err);
    }
  }

  _showResults(results) {
    this._results = results;
    this._highlightIndex = -1;
    this._dropdown.innerHTML = "";

    if (!results.length) {
      this._dropdown.innerHTML = "";
      const msg = document.createElement("div");
      msg.className = "search-bar__no-results";
      msg.textContent = "No results in Sheffield";
      this._dropdown.appendChild(msg);
      this._dropdown.hidden = false;
      return;
    }

    results.forEach((r, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-bar__result";
      const icon = iconFor(r.category, r.type);
      btn.textContent = (icon ? icon + "  " : "") + r.display_name;
      btn.addEventListener("click", () => this._selectResult(r));
      btn.addEventListener("mouseenter", () => {
        this._highlightIndex = i;
        this._updateHighlight();
      });
      this._dropdown.appendChild(btn);
    });

    this._dropdown.hidden = false;
  }

  _hideDropdown() {
    this._dropdown.hidden = true;
    this._results = [];
    this._highlightIndex = -1;
  }

  _moveHighlight(dir) {
    const len = this._results.length;
    if (!len) return;
    this._highlightIndex = (this._highlightIndex + dir + len) % len;
    this._updateHighlight();
  }

  _updateHighlight() {
    const buttons = this._dropdown.querySelectorAll(".search-bar__result");
    buttons.forEach((btn, i) => {
      btn.classList.toggle("search-bar__result--active", i === this._highlightIndex);
    });
  }

  _selectResult(result) {
    const lng = parseFloat(result.lon);
    const lat = parseFloat(result.lat);

    this._input.value = result.display_name;
    this._clearBtn.hidden = false;
    this._hideDropdown();

    clearPopup();
    this._removeMarker();

    const popup = new maplibregl.Popup({ offset: 25 }).setText(
      result.display_name,
    );

    this._marker = new maplibregl.Marker({ color: "#2563eb" })
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(this._map);

    popup.on("close", () => this._removeMarker());

    this._marker.togglePopup();
    this._map.flyTo({ center: [lng, lat], zoom: FLY_ZOOM });
  }

  _removeMarker() {
    if (this._marker) {
      this._marker.remove();
      this._marker = null;
    }
  }
}
