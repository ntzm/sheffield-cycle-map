# Georeferencing fit configs

One config per scheme plan sheet, for `scripts/georef/fit_north.py`.
`<set>_cfg_<sheet>.json` → `{"image": ..., "points": [[px, py, lng, lat], ...]}`.

- `ne_*` — Connecting Sheffield: Nether Edge – City Centre (JPG sheets A–H
  from haveyoursay.sheffield.gov.uk/connectingsheffieldnetheredgecitycentre).
  Sheets D and G need `--aniso`: cemetery_road.jpg is sx 0.0937 /
  sy 0.1008 (anchors: Napier Street junction, the Cemetery Road NE-branch
  foot, plus six carriageway-centreline samples along the SW corridor —
  the centreline was extracted by scanning for the pink cycle-track bands
  on each side and taking the white gap's midpoint) and charter_row.png
  is vertically stretched (sx 0.0769 / sy 0.0670); the two control
  points are the Trafalgar Street cycle crossing and the Moore Street
  roundabout centre, cross-checked against the Atkinsons/Sainsbury's
  service entrances. Sheet B's washington-road fit mixes junction reads
  with two points sampled on the drawn Washington Road centreline (the
  corridor sweep is what pins the x-scale on that narrow sheet).
- `dacc_*` — Darnall–Attercliffe–City Centre. Source PDF `dacc_maps.pdf` from
  haveyoursay.sheffield.gov.uk/darnall-attercliffe-city-centre, rendered with
  `pdftoppm -png -r 200` → page-1..5.png (3308x2339). Pages 3 & 4 need
  `--aniso` (vertically stretched sheets); the committed corners came from the
  aniso fit.
- `thl_*` — Townhead Street and Leopold Street. Images map1..3.jpg
  (3508x2480) from haveyoursay.sheffield.gov.uk/connectingsheffieldtownheadleopold,
  cropped to the map frame with `PIL crop((28, 40, 2794, 2406))` →
  `mapN_c.jpg` (2766x2366) before fitting; pixel coords are crop coords.
  map1's fit is tied to map2 via the shared Church Street cycle-crossing
  drawing plus the faint-basemap Vicar Lane junction; the Orchard Lane
  mini-roundabout node shows ~9 m residual because the sheet draws the
  proposed (roundabout removed) layout.
- `castle_*` — Connecting Sheffield: Castle Street
  (haveyoursay.sheffield.gov.uk/connecting-sheffield-castle-street).
  `castle_cfg_ga.json` fits the Arup GA PDF
  (CRSTS_Castle_Street_Updated_GA.pdf, document 101764 in the page's
  document library, `pdftoppm -png -r 200` → 6623x4678); at 1:250 @ A1
  the scale is exactly 0.03175 true m/px, so the fit was anchored on the
  Castle St/Waingate/Haymarket/Exchange St node and verified against the
  faint OS survey basemap (Snig Hill junction star, Dixon Lane, taxi
  rank). `castle_cfg_detail.json` fits the illustrative
  "250908.CastleStreet.AW V3_1.jpg" sheet, cropped to the map frame with
  `PIL crop((110, 115, 3732, 3198))` (sidebar removed) → 3622x3083;
  its geo points are GA-derived reads of shared proposed features
  (junction cycle-crossing bands, Castle St zebra, Waingate crossing,
  taxi-rank south end). Use the ISO fit (0.0388 true m/px): the aniso
  fit's larger sx is an artefact of exaggerated drawn road widths at the
  junction and pushes the Snig Hill junction onto the sheet, which the
  drawing does not include.
