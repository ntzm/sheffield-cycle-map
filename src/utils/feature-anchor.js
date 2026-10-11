// Anchor point for the highlight halo, auto-pan and map links. Points are
// exact; lines use the point halfway along, so the anchor sits on the line;
// polygons (scheme plan footprints) use the vertex average, which is fine for
// an anchor.
export function featureLngLat(feature) {
  const geom = feature.geometry;
  if (geom.type === "Point") return geom.coordinates.slice();
  if (geom.type === "LineString") return lineMidpoint(geom.coordinates);
  const ring =
    geom.type === "Polygon"
      ? geom.coordinates[0]
      : (geom.coordinates[0] && geom.coordinates[0][0]) || [];
  let lng = 0;
  let lat = 0;
  for (const [x, y] of ring) {
    lng += x;
    lat += y;
  }
  return ring.length ? [lng / ring.length, lat / ring.length] : [0, 0];
}

// Planar lengths are fine at city scale once longitude is scaled by latitude.
function lineMidpoint(coords) {
  if (coords.length < 2) return (coords[0] || [0, 0]).slice();
  const k = Math.cos((coords[0][1] * Math.PI) / 180);
  const segLen = (a, b) => Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += segLen(coords[i - 1], coords[i]);
  }
  let remaining = total / 2;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1];
    const b = coords[i];
    const len = segLen(a, b);
    if (len >= remaining && len > 0) {
      const t = remaining / len;
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    remaining -= len;
  }
  return coords[coords.length - 1].slice();
}
