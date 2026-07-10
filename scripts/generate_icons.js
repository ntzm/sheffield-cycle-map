// Generates the POI badge icons in public/icons/.
// Every icon is a white (or dark, on light badges) glyph on a coloured
// circular badge so the map and sidebar legend share one visual language.
//
// Glyph sources:
// - Maki (https://github.com/mapbox/maki) — CC0
// - Temaki (https://github.com/rapideditor/temaki) — CC0
// - OpenStreetMap Carto guidepost (https://github.com/gravitystorm/openstreetmap-carto) — CC0
// - bike-pump and the counter display bar are drawn here in the same style
//
// Run: node scripts/generate_icons.js

import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const OUT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "icons",
);

const GLYPHS = {
  // maki:bicycle
  bicycle: {
    box: 15,
    d: "M7.5 2c-.676-.01-.676 1.01 0 1H9v1.266L6.197 6.6L5.223 4H5.5c.676.01.676-1.01 0-1h-2c-.676-.01-.676 1.01 0 1h.652l.891 2.375A3.45 3.45 0 0 0 3.5 6C1.573 6 0 7.573 0 9.5S1.573 13 3.5 13S7 11.427 7 9.5c0-.67-.2-1.291-.53-1.824l2.821-2.35l.463 1.16C8.71 7.094 8 8.211 8 9.5c0 1.927 1.573 3.5 3.5 3.5S15 11.427 15 9.5S13.427 6 11.5 6c-.283 0-.554.043-.818.107L10 4.402V2.5a.5.5 0 0 0-.5-.5zm-4 5a2.48 2.48 0 0 1 1.555.553L3.18 9.115c-.511.427.128 1.195.64.77l1.875-1.563c.188.352.305.75.305 1.178C6 10.887 4.887 12 3.5 12S1 10.887 1 9.5S2.113 7 3.5 7m8 0C12.887 7 14 8.113 14 9.5S12.887 12 11.5 12S9 10.887 9 9.5a2.49 2.49 0 0 1 1.125-2.088l.91 2.274c.246.623 1.18.25.93-.372l-.908-2.27C11.2 7.02 11.348 7 11.5 7",
  },
  // temaki:bicycle-parked
  bicycleParked: {
    box: 15,
    d: "M8.5 2.25h1c.28 0 .5.22.5.5v1.79l.73.73C12 5.39 13 6.45 13 7.75c0 1.37-1.13 2.5-2.5 2.5S8 9.12 8 7.75c0-1.02.62-1.9 1.5-2.29l-.4-.41l-2.47 1.41c.23.38.37.82.37 1.29c0 1.37-1.13 2.5-2.5 2.5S2 9.12 2 7.75s1.13-2.5 2.5-2.5c.2 0 .4.03.59.08l-.43-1.08h-.23c-.68.01-.68-1.01 0-1h2.02c.68-.01.68 1.01 0 1h-.71l.51 1.28L9 3.96v-.71h-.5c-.68.01-.68-1.01 0-1m-4 4c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5S6 8.58 6 7.75s-.67-1.5-1.5-1.5m6 0c-.83 0-1.5.67-1.5 1.5s.67 1.5 1.5 1.5s1.5-.67 1.5-1.5s-.67-1.5-1.5-1.5m1 5.5l-.5-1h2l1 2H1l1-2h2l-.5 1z",
  },
  // temaki:bicycle-structure
  bicycleStructure: {
    box: 15,
    d: "M8.5 3.5h1c.28 0 .5.22.5.5v1.79l.73.73C12 6.64 13 7.7 13 9c0 1.37-1.13 2.5-2.5 2.5S8 10.37 8 9c0-1.02.62-1.9 1.5-2.29l-.4-.41l-2.47 1.41c.23.38.37.82.37 1.29c0 1.37-1.13 2.5-2.5 2.5S2 10.37 2 9s1.13-2.5 2.5-2.5c.2 0 .4.03.59.08L4.66 5.5h-.23c-.68.01-.68-1.01 0-1h2.02c.68-.01.68 1.01 0 1h-.71l.51 1.28L9 5.21V4.5h-.5c-.68.01-.68-1.01 0-1m-4 4C3.67 7.5 3 8.17 3 9s.67 1.5 1.5 1.5S6 9.83 6 9s-.67-1.5-1.5-1.5m6 0C9.67 7.5 9 8.17 9 9s.67 1.5 1.5 1.5S12 9.83 12 9s-.67-1.5-1.5-1.5m1 5.5l-.5-1h2l1 2H1l1-2h2l-.5 1zm0-11h-8L4 3H2L1 1h13l-1 2h-2z",
  },
  // temaki:bicycle-locker
  bicycleLocker: {
    box: 15,
    d: "M.5 2h14c.28 0 .5.22.5.5v10c0 .28-.22.5-.5.5H.5c-.28 0-.5-.22-.5-.5v-10c0-.28.22-.5.5-.5M1 3v9h11V3zm12.5 1c-.28 0-.5.22-.5.5v2c0 .28.22.5.5.5s.5-.22.5-.5v-2c0-.28-.22-.5-.5-.5m-6.09-.25h.91c.25 0 .45.2.45.45v1.63l.67.67a2.27 2.27 0 0 1 2.06 2.25c0 1.25-1.02 2.27-2.27 2.27S6.95 10 6.95 8.75c0-.93.57-1.73 1.37-2.08l-.36-.37l-2.25 1.28c.21.34.34.74.34 1.17c0 1.25-1.03 2.27-2.28 2.27S1.5 10 1.5 8.75s1.02-2.27 2.27-2.27c.19 0 .37.03.54.07l-.39-.98h-.21c-.62.01-.62-.92 0-.91h1.84c.61-.01.61.92 0 .91H4.9l.47 1.16l2.49-1.42v-.65h-.45c-.62.01-.62-.92 0-.91M3.77 7.39c-.76 0-1.36.6-1.36 1.36s.6 1.36 1.36 1.36s1.37-.6 1.37-1.36s-.61-1.36-1.37-1.36m5.46 0c-.76 0-1.37.6-1.37 1.36s.61 1.36 1.37 1.36s1.36-.6 1.36-1.36s-.6-1.36-1.36-1.36",
  },
  // maki:caution
  caution: {
    box: 15,
    d: "M1.093 11.892L6.84 1.391a.752.752 0 0 1 1.32 0l5.747 10.501a.75.75 0 0 1-.66 1.11H1.753a.75.75 0 0 1-.66-1.11M8.3 8l.403-2.418A.5.5 0 0 0 8.21 5H6.79a.5.5 0 0 0-.493.582L6.7 8zm.3 1.9a1.1 1.1 0 1 0-2.2 0a1.1 1.1 0 0 0 2.2 0",
  },
  // maki:recycling
  recycling: {
    box: 15,
    d: "M2.456 8.613c-.338.598-.955 1.69.137 2.418c.343.227.728.384 1.131.462c.307.045.323.518-.038.507c-.385-.02-2.26-.193-2.561-1.6c-.156-.82.02-1.557.504-2.355l.697-1.233l-1.306-.743L4.5 4v4l-1.306-.694zM6.7 2.034c1.155-.628 1.823.43 2.191 1.007l.806 1.263l-1.266.808L12 6.986l-.197-4.026l-1.264.807l-.76-1.189c-.522-.746-.904-1.297-1.835-1.545C6.307.72 5.301 2.619 5.311 2.607c-.164.287.216.54.451.21c.258-.32.577-.586.938-.783m6.594 6.187c-.088-.19-.549-.141-.419.267c.131.39.185.8.157 1.21C12.939 11.01 11.684 11 11 11H9.5V9.5l-3.5 2l3.488 2.025L9.493 12H11c.89.015 1.6-.176 2.2-.713c1.2-1.061.094-3.066.094-3.066",
  },
  // maki:drinking-water
  drinkingWater: {
    box: 15,
    d: "M6 1a2 2 0 0 0-2 2v3.5a.5.5 0 0 0 .5.5h2a.5.5 0 0 0 .5-.5v-2a.5.5 0 0 1 .5-.5H14V1Zm1 14H4a.5.5 0 0 1-.48-.38L2 8.62a.5.5 0 0 1 .365-.606A.6.6 0 0 1 2.5 8h6a.5.5 0 0 1 .514.485A.5.5 0 0 1 9 8.62l-1.5 6A.5.5 0 0 1 7 15m-3.35-4h3.71l.5-2H3.14Z",
  },
  // temaki:water-tap
  waterTap: {
    box: 15,
    d: "M8 2v1h1c1.1 0 2 .9 2 2v9H9V5H6v2h.5c.28 0 .5.22.5.5V8H3v-.5c0-.28.22-.5.5-.5H4V5c0-1 1-2 2-2h1V2H5.5c-.28 0-.5-.22-.5-.5s.22-.5.5-.5h4c.28 0 .5.22.5.5s-.22.5-.5.5z",
  },
  // temaki:water-bottle
  waterBottle: {
    box: [20, 48],
    d: "M1 15h18a1 1 0 0 0 1-1a6 6 0 0 0-6-6V4a2 2 0 0 0 0-4H6a2 2 0 0 0 0 4v4a6 6 0 0 0-6 6a1 1 0 0 0 1 1m0 3h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1m0 7h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H1a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1m18 7H1a1 1 0 0 0-1 1v13a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V33a1 1 0 0 0-1-1",
  },
  // temaki:lock
  lock: {
    box: 50,
    d: "M43.16 21H41v-8.63C41 6.69 35.3 1 29.63 1h-9.48C14.48 1 9.01 6.69 9.01 12.37V21H6.62c-.68 0-1.61 1.06-1.61 1.66v25.46c0 .6.93.88 1.61.88h36.55c.68 0 1.84-.28 1.84-.88V22.66c0-.6-1.16-1.66-1.84-1.66zM29.71 45h-9.65l2.03-9.97c-1.22-.87-2.02-2.5-2.02-4.11c0-2.64 2.16-4.89 4.83-4.89s4.83 2.09 4.83 4.73c0 1.61-.8 3.43-2.02 4.3L29.73 45zM34 21H16v-8.63C16 9.79 17.69 8 20.24 8h9.29C32.08 8 34 9.79 34 12.37z",
  },
  // openstreetmap-carto tourism/guidepost.svg
  guidepost: {
    box: 14,
    d: "M 7,0.25 C 6.625,0.25 6.25,0.5 6.25,1 l 0,13 1.5,0 0,-13 C 7.75,0.5 7.375,0.25 7,0.25 z M 2,1 0,2.5 2,4 6,4 6,1 2,1 z M 8,4 8,7 12,7 14,5.5 12,4 8,4 z",
  },
  // Drawn here: bicycle floor pump (T-handle, barrel, base, hose and chuck)
  bikePump: {
    box: 15,
    inner:
      '<rect x="2.5" y="0.9" width="7" height="1.6" rx="0.8" fill="{fg}"/>' +
      '<rect x="5.3" y="2.5" width="1.4" height="2.7" fill="{fg}"/>' +
      '<rect x="4.5" y="5" width="3" height="7.2" rx="0.6" fill="{fg}"/>' +
      '<rect x="1.4" y="12.2" width="9.2" height="1.9" rx="0.95" fill="{fg}"/>' +
      '<path d="M10 13 C12.4 13 12.6 10.5 12.6 8 L12.6 5.9" fill="none" stroke="{fg}" stroke-width="1.3"/>' +
      '<rect x="11.7" y="3.2" width="1.8" height="2.7" rx="0.5" fill="{fg}"/>',
  },
};

const BADGES = [
  // file, glyph, badge colour, glyph colour (default white), glyph scale tweak
  { file: "parking-public.svg", glyph: "bicycleParked", bg: "#0f6bd8" },
  { file: "parking-private.svg", glyph: "bicycleParked", bg: "#6b7280" },
  // The structure/locker glyphs run edge-to-edge in their box, so pull
  // them in a little to match the visual weight of the other badges.
  {
    file: "parking-hub.svg",
    glyph: "bicycleStructure",
    bg: "#ea580c",
    scale: 0.92,
  },
  {
    file: "parking-hangar.svg",
    glyph: "bicycleLocker",
    bg: "#16a34a",
    scale: 0.9,
  },
  { file: "shop.svg", glyph: "bicycle", bg: "#9333ea" },
  { file: "guidepost.svg", glyph: "guidepost", bg: "#92400e" },
  { file: "route-marker.svg", glyph: "routeMarker", bg: "#0047aa" },
  {
    file: "collision-slight.svg",
    glyph: "caution",
    bg: "#facc15",
    fg: "#1f2937",
  },
  {
    file: "collision-serious.svg",
    glyph: "caution",
    bg: "#fb923c",
    fg: "#1f2937",
  },
  { file: "collision-fatal.svg", glyph: "caution", bg: "#b91c1c" },
  { file: "theft.svg", glyph: "lock", bg: "#334155", scale: 0.82 },
  { file: "bike-pump.svg", glyph: "bikePump", bg: "#7c3aed" },
  { file: "drinking-water.svg", glyph: "drinkingWater", bg: "#0ea5e9" },
  { file: "water-tap.svg", glyph: "waterTap", bg: "#94a3b8", fg: "#1f2937" },
  { file: "water-refill.svg", glyph: "waterBottle", bg: "#10b981" },
  { file: "counter.svg", glyph: "counter", bg: "#0d9488" },
  { file: "recycling.svg", glyph: "recycling", bg: "#16a34a" },
];

const SIZE = 24; // viewBox size; rendered at 2x for pixelRatio 2
const RADIUS = 11.25;
const GLYPH_BOX = 15.5; // default glyph bounding box inside the badge

function glyphGroup(name, fg, bg, scaleTweak = 1) {
  if (name === "counter") {
    // maki bicycle over a totem-style count display
    const g = GLYPHS.bicycle;
    const s = (GLYPH_BOX / g.box) * 0.72 * scaleTweak;
    const tx = (SIZE - g.box * s) / 2;
    return (
      `<g transform="translate(${round(tx)} 4) scale(${round(s)})"><path d="${g.d}" fill="${fg}"/></g>` +
      `<rect x="7" y="15.75" width="10" height="3.75" rx="0.9" fill="${fg}"/>` +
      `<g fill="${bg}"><rect x="8.4" y="16.9" width="1.5" height="1.5" rx="0.3"/><rect x="10.75" y="16.9" width="1.5" height="1.5" rx="0.3"/><rect x="13.1" y="16.9" width="1.5" height="1.5" rx="0.3"/></g>`
    );
  }
  if (name === "routeMarker") {
    // maki bicycle under a direction arrow, like the real signs: a bike
    // and an arrow pointing the way of the cycle network
    const g = GLYPHS.bicycle;
    const s = (GLYPH_BOX / g.box) * 0.68 * scaleTweak;
    const tx = (SIZE - g.box * s) / 2;
    return (
      `<path d="M6 5.4 h7 V3.4 L17.9 6.5 L13 9.6 V7.6 H6 z" fill="${fg}"/>` +
      `<g transform="translate(${round(tx)} 10.2) scale(${round(s)})"><path d="${g.d}" fill="${fg}"/></g>`
    );
  }
  const g = GLYPHS[name];
  const [bw, bh] = Array.isArray(g.box) ? g.box : [g.box, g.box];
  const s = (GLYPH_BOX / Math.max(bw, bh)) * scaleTweak;
  const tx = (SIZE - bw * s) / 2;
  const ty = (SIZE - bh * s) / 2;
  const content = g.inner
    ? g.inner.replaceAll("{fg}", fg)
    : `<path d="${g.d}" fill="${fg}"/>`;
  return `<g transform="translate(${round(tx)} ${round(ty)}) scale(${round(s)})">${content}</g>`;
}

function round(n) {
  return Math.round(n * 1000) / 1000;
}

for (const { file, glyph, bg, fg = "#ffffff", scale = 1 } of BADGES) {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * 2}" height="${SIZE * 2}" viewBox="0 0 ${SIZE} ${SIZE}">\n` +
    `  <circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${RADIUS}" fill="${bg}" stroke="#1e293b" stroke-width="0.75"/>\n` +
    `  ${glyphGroup(glyph, fg, bg, scale)}\n` +
    `</svg>\n`;
  writeFileSync(join(OUT_DIR, file), svg);
  console.log("wrote", file);
}
