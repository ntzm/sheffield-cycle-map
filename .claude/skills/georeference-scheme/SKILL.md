---
name: georeference-scheme
description: Georeference a Connecting Sheffield (or similar) scheme plan sheet set and add it to the map's "Upcoming schemes" overlay layer. Use when the user asks to add scheme plans, consultation maps, or upcoming infrastructure drawings to the map.
---

# Georeferencing scheme plan sheets

Turn council scheme plan images (Have Your Say / Connecting Sheffield sheets)
into MapLibre image overlays in `public/data/schemes.json`, rendered by
`src/layers/schemes.js` under the "Upcoming schemes" toggle.

Helper scripts live in `scripts/georef/`. They need `pyosmium`, `numpy`,
`Pillow`, and the cached PBF at `scripts/.cache/south-yorkshire-latest.osm.pbf`
(run `npm run fetch:osm` if missing).

## 1. Get the plan images

- Scheme pages live at `haveyoursay.sheffield.gov.uk/<slug>`. Plan JPG/PNGs are
  on S3/imgix; `curl` the page and grep for
  `(imgix|amazonaws)[^"]*\.(jpg|jpeg|png|pdf)` — the document-library widget
  URLs (`/<id>/widgets/<id>/documents/<id>`) redirect to the file. WebFetch
  summaries omit URLs; use curl + grep on the raw HTML.
- Prefer the newest version of each sheet (S3 URLs embed a unix timestamp).
- PDFs: `pdftoppm -png -r 200 file.pdf page` then treat each page as a sheet.
- Skip sheets that are pure artist impressions/visualisations — only plan-view
  drawings with street labels can be georeferenced.
- Sheets with a title-block/key sidebar outside the map frame (the Townhead
  template): crop the sidebar off first (PIL crop to the map frame) and
  georeference the cropped image — all pixel reads are then in crop coords.

## 2. Identify the area and pick control points

View a downscaled copy of each sheet, note the labelled streets, then extract
exact junction coordinates:

```
python3 scripts/georef/junctions.py <lng_min> <lat_min> <lng_max> <lat_max> \
  "Street A" "Street B" ... [--pois]
```

Rules of thumb:

- **Junction nodes of two named streets are the best control points.** Teal
  callout dots on the sheets usually mark a junction exactly ("From this
  junction…", "Where X meets Y…") — use the dot centre.
- `--pois` also prints bus stops / crossings / signals: the orange dashed
  "BUS STOP" cages on sheets match bus stop nodes (node sits mid-cage on the
  kerb) — good fallback when junctions are scarce.
- Pick 2–4 points spread across the sheet, ideally near opposite corners.
  Avoid points hidden under callout boxes, points on schematic insets, and
  ambiguous multi-node junctions (dual carriageways have 2+ nodes per name
  pair — check which one you can actually see).
- When a name pair returns 2+ nodes or reads keep disagreeing pairwise, dump
  the full way geometry from the PBF (pyosmium, print every node of the named
  ways). Staggered crossroads (Shirland/Ribston at Staniforth; Shirland at
  Wilfrid) and looped streets (Pinfold Street) are invisible in a node list
  but obvious in the way chains.
- Sanity-check reads pairwise BEFORE fitting: implied scale sx = ΔmercX/Δpx
  and sy = ΔmercY/Δpy must agree across pairs. One bad identification shows
  up as one inconsistent row, not as a uniformly bad fit.
- Redesign sheets (city-centre plazas): the crisp drawing is the PROPOSED
  layout and can legitimately sit metres from today's OSM node (e.g. a
  removed mini-roundabout). Prefer junctions of the FAINT survey basemap
  under the drawing — that is current-day OS data — and treat proposed
  geometry anchors with suspicion if their residual stands out.
- Sheets of one set overlap: tie an anchor-poor sheet to a verified
  neighbour by reading the same drawn feature (e.g. a cycle-crossing band)
  on both and mapping it through the neighbour's fit.

## 3. Read pixel positions

Guess each point's pixel position from the downscaled view, then crop at full
resolution to read it precisely (repeat until the feature is centred):

```
python3 scripts/georef/crop.py sheet.jpg name:<px>:<py> ...
```

The crop has a magenta 100px grid with absolute labels and a red cross at your
guess. Read the junction of the street **centrelines** (dashed lines), not the
kerbs. Aim for ±25 px.

## 4. Fit — ALWAYS north-up

These sheets are always drawn north-up. **Never fit rotation** — a 2-point
similarity fit will happily invent a large bogus rotation from small read
errors and can even "verify" if your anchors lie along one road (offsets slide
invisibly along the corridor). This exact failure produced a -34° fit that
looked locally correct. Rotation ≠ 0 in a fit means your control points are
wrong, not that the sheet is rotated.

```
cat > cfg_sheet.json <<'EOF'
{"image": "sheet.jpg", "points": [[px, py, lng, lat], ...]}
EOF
python3 scripts/georef/fit_north.py cfg_sheet.json
```

- Residuals ≤5 m: good. >6 m: re-read the offending point before accepting.
- **Render the whole OSM network onto the sheet to verify a fit** (the
  single most effective check):
  `python3 scripts/georef/osm_overlay.py sheet.png out.png '<corners json>'`
  draws every `highway` way in the sheet's bbox onto a copy of the sheet
  (use a contrast-enhanced copy so the faint base shows) — red for roads,
  blue for paths/service ways. One glance shows whether every street, junction and even
  car-park entrance locks onto the drawing, and the direction/growth of any
  drift tells you what is wrong (translation vs scale vs one bad point).
  Low residuals on 2-3 clustered or near-collinear points mean nothing —
  sheets B, F and G all "fitted" with ≤5 m residuals while being 10-40 m
  off across the sheet.
- Narrow corridor sheets (one road + side streets) starve the cross-axis
  scale. Sample the drawn main-road centreline at 2-3 spots where it curves
  and pair each with the road polyline position at that latitude — the
  corridor sweep pins the x-scale better than any junction cluster.
- Aniso is real but rare: fit iso first, and only accept `--aniso` when the
  full-network overlay shows angles disagreeing everywhere (charter_row.png
  needed sx 0.0769 / sy 0.0670; the other seven NE sheets are iso).
- Sheet scales vary per sheet (~0.04–0.11 true m/px); never assume one sheet's
  scale for another.
- To find more control points once you have a rough fit:
  `python3 scripts/georef/geo2px.py cfg_sheet.json <lng> <lat>` then crop there.

## 5. Verify in a browser (mandatory)

Serve the images + `scripts/georef/verify.html` (`python3 -m http.server`),
open it via chrome-devtools, then with `evaluate_script`:

- `showOverlay("sheet.jpg", corners)` — corners from fit_north output.
- `addMarkers([[lng, lat, "#f00"], ...])` — truth nodes from OSM. Each marker
  must sit on the drawn feature it corresponds to.
- `await capture()` — returns a JPEG data URL (save via `filePath`, base64
  -decode, then view). Use this instead of `take_screenshot`, which times out
  on WebGL pages.

Check, at sheet-wide zoom AND ≥z17 detail zoom:

1. every labelled street on the sheet lies on its basemap counterpart;
2. markers sit on the drawn junctions;
3. roads flow continuously into adjacent sheets of the set (sheets usually
   tile edge-to-edge) and agree inside any overlap (`showOverlay` both).

Expect residual imperfection: sheets exaggerate road widths and may distort
~10 m at the far edges of large junctions. Anchor accuracy matters most.

## 6. Add to the app

1. Optimise into `public/data/schemes/<id>.jpg`: RGB, `thumbnail((2400, 2400))`,
   JPEG quality 70–78 progressive (~300–800 KB per sheet).
2. Append to `public/data/schemes.json`: top level is `{"schemes": [{scheme,
   source, plans: [...]}]}` — add the plan to its scheme's `plans` array (new
   scheme object if needed). Each plan: `id`, `name`, `url`, `coordinates`
   (TL, TR, BR, BL from the fit). Within a scheme, plans render in array
   order with LATER entries on top — list wide context sheets first so
   detailed sheets draw over them.
3. Add `schemes-<id>-layer` to `SCHEME_LAYER_IDS` in `src/layers/schemes.js`.
   Layer ordering is automatic (`schemes-*-layer` prefix match in
   `src/utils/layer-order.js`).
4. `npm run build`, then load the app with
   `#15/<lat>/<lng>/0.0?layers=schemes-layer` and re-verify in situ.

Commit the fit config for each sheet to `scripts/georef/fits/<set>_cfg_*.json`
so fits can be reproduced or refined later.
