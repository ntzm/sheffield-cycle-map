# Sheffield Cycle Map

Interactive map of cycling infrastructure in Sheffield, UK.

## Architecture

- **Frontend**: Vanilla JS + MapLibre GL, bundled with esbuild → `public/bundle.js`
- **Data pipeline**: Python + Node scripts that fetch data and output GeoJSON to `public/data/`
- **Deploy**: GitHub Pages via GitHub Actions (Sun & Wed at midnight UTC)

### Frontend state & layers

- App state (view, visible layers, basemap, shop filter, selected feature) lives in a single store (`src/utils/state.js`); the URL hash is derived from it by a subscriber in `main.js`, and `hashchange` (back/forward, pasted links) is applied back onto the map/UI. Opening a feature sheet pushes a history entry, so the back button closes it.
- `src/layers/registry.js` declares all layer groups (loader + layer ids) and the layer-control entries incl. per-layer defaults; `main.js` derives lazy loading, URL state, and selection restore from it.
- Interactive layers fetch their own GeoJSON via `src/utils/fetch-geojson.js` (in-memory cache) and call `registerSheetLayer` (`src/utils/interactions.js`) with a stable per-feature key (default `osm_type/osm_id`). Sheet content is always built from the canonical raw feature — properties normalized to MapLibre's rendered shape (nested values JSON-stringified) — so click and URL-restore paths are identical.

## Data Pipeline

`npm run fetch:all` runs:
1. `python3 scripts/fetch_osm.py` — downloads South Yorkshire PBF from Geofabrik, extracts Sheffield boundary, filters to Sheffield using shapely, outputs 15 GeoJSON files (boundary, parking, cycleway, contraflow, pumps, drinking_water, traffic_calming, counters, embedded_tram_tracks, asl, wayfinding, signs, shops, ncn, lcn)
2. `node scripts/dft_collisions.js` — DfT STATS19 collision data
3. `node scripts/bike_thefts.js` — UK Police API bike theft data

### PBF Processing (fetch_osm.py)
- Two-pass pyosmium read: pass 1 scans relations for membership, pass 2 collects all data with node locations
- Sheffield boundary from relation 106956, geographic filtering via shapely
- Panoramax images: fetched via API, scored with BRISQUE, blurhash placeholders generated
- HTTP cache in `scripts/.cache/api-cache.json` — compatible with the JS cache format (SHA256 keys)
- Opening hours: raw strings passed through; parsed client-side by the `opening_hours` npm library

## Commands

- `npm run fetch:all` — fetch all data
- `npm run fetch:osm` — fetch just the OSM data
- `npm run build` — bundle frontend
- `npm run serve` — build + serve locally on port 4174
- `npm run georef` — interactive tool on port 4175 to move/warp/scale/rotate georeferenced scheme plans; saves to `public/data/schemes.json`
- `node scripts/generate_icons.js` — regenerate the POI badge icons in `public/icons/` (glyphs from Maki/Temaki/OSM Carto, CC0; edit the script to change colours or glyphs, then rerun)

## PWA / Offline

The app is an installable PWA. `npm run build` regenerates `public/sw.js` (gitignored, like the bundle) with Workbox from `workbox-config.cjs` — that config is the only thing to edit. App shell, data and icons are precached with content hashes; basemap tiles and scheme plan images are cached at runtime. New files matching the config's glob patterns are picked up automatically on the next build.

## Key Paths

- `scripts/fetch_osm.py` — main OSM data pipeline
- `scripts/.cache/` — API cache + PBF download
- `public/data/` — generated GeoJSON files
- `src/` — frontend source
- `src/utils/opening-hours.js` — client-side opening hours parsing
