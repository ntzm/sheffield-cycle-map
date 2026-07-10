// PWA / offline config. `npm run build` regenerates public/sw.js from this.
//
// Anything matching globPatterns is downloaded up front and kept up to date
// automatically (Workbox fingerprints each file, so deploys invalidate
// exactly what changed). New files that match a pattern are picked up on the
// next build with no further work; add a pattern here if you add a new kind
// of asset.
module.exports = {
  globDirectory: "public",
  globPatterns: [
    "index.html",
    "bundle.{js,css}",
    "manifest.webmanifest",
    "positron.json",
    "osm-carto.json",
    "data/*.{geojson,json}",
    "icons/**/*.{svg,png}",
  ],
  swDest: "public/sw.js",
  maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,

  // Everything else is cached as it's used (first matching rule wins):
  runtimeCaching: [
    {
      // The TileJSON (/planet) and style JSONs are mutable pointers to
      // dated tile snapshots that rotate weekly and eventually get deleted
      // upstream. Always prefer the network for these so returning users
      // don't keep requesting a dead snapshot; fall back to cache offline.
      urlPattern: /^https:\/\/tiles\.openfreemap\.org\/(planet$|styles\/)/,
      handler: "NetworkFirst",
      options: {
        cacheName: "basemap-meta",
        networkTimeoutSeconds: 5,
      },
    },
    {
      // Vector tiles, natural earth raster, glyphs and sprites: snapshot
      // URLs are immutable, so cache-first is safe and previously viewed
      // areas work offline. Capped so heavy panning can't fill the disk;
      // stale-snapshot entries age out via LRU.
      urlPattern: /^https:\/\/tiles\.openfreemap\.org\//,
      handler: "CacheFirst",
      options: {
        cacheName: "basemap",
        expiration: { maxEntries: 4000, purgeOnQuotaError: true },
      },
    },
    {
      // OSM Carto raster basemap. These URLs are mutable (tiles re-render
      // continuously), so expire after 30 days to pick up changes.
      urlPattern: /^https:\/\/tile\.openstreetmap\.org\//,
      handler: "CacheFirst",
      options: {
        cacheName: "basemap-osm",
        expiration: {
          maxEntries: 1000,
          maxAgeSeconds: 30 * 24 * 60 * 60,
          purgeOnQuotaError: true,
        },
      },
    },
    {
      // Georeferenced scheme plan images (~8 MB total, so not precached).
      urlPattern: /\/data\/schemes\/.*\.(jpg|png)$/,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "schemes" },
    },
  ],

  // Serve the app shell for any offline navigation, activate new versions
  // immediately, and drop caches from old Workbox versions.
  navigateFallback: "index.html",
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  inlineWorkboxRuntime: true,
  sourcemap: false,
};
