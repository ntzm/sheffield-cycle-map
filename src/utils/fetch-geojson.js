// The app owns its layer data: GeoJSON is fetched and parsed here, handed to
// MapLibre as inline objects, and kept around so features can be looked up by
// stable id (URL-restored selections) without querying rendered tiles. The
// service worker caches the bytes; this caches the parsed objects.
const cache = new Map();

export function fetchGeojson(url) {
  if (!cache.has(url)) {
    const promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return res.json();
      })
      .catch((err) => {
        cache.delete(url);
        throw err;
      });
    cache.set(url, promise);
  }
  return cache.get(url);
}
