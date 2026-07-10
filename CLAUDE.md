# Sheffield Cycle Map

Interactive map of cycling infrastructure in Sheffield, UK.

## Architecture

- **Frontend**: Vanilla JS + MapLibre GL, bundled with esbuild → `public/bundle.js`
- **Data pipeline**: Python + Node scripts that fetch data and output GeoJSON to `public/data/`
- **Deploy**: GitHub Pages via GitHub Actions (Sun & Wed at midnight UTC)

## Data Pipeline

`npm run fetch:all` runs:
1. `python3 scripts/fetch_osm.py` — downloads South Yorkshire PBF from Geofabrik, extracts Sheffield boundary, filters to Sheffield using shapely, outputs 12 GeoJSON files (boundary, parking, cycleway, pumps, counters, embedded_tram_tracks, asl, wayfinding, signs, shops, ncn, lcn)
2. `node scripts/dft_collisions.js` — DfT STATS19 collision data
3. `node scripts/gritting.js` — Sheffield Council gritting routes
4. `node scripts/bike_thefts.js` — UK Police API bike theft data

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

## Key Paths

- `scripts/fetch_osm.py` — main OSM data pipeline
- `scripts/.cache/` — API cache + PBF download
- `public/data/` — generated GeoJSON files
- `src/` — frontend source
- `src/utils/opening-hours.js` — client-side opening hours parsing
