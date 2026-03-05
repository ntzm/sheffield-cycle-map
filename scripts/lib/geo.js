// Clip a LineString feature to a polygon geometry.
export function clipLineToPolygon(feature, polygonGeom) {
  const coords = feature.geometry.coordinates;
  const rings = getRings(polygonGeom);
  if (!rings.length) return [];

  const segments = [];
  let current = null;

  for (let i = 0; i < coords.length - 1; i++) {
    const p0 = coords[i];
    const p1 = coords[i + 1];
    const inside0 = pointInPolygon(p0, polygonGeom);
    const inside1 = pointInPolygon(p1, polygonGeom);
    const hits = segmentPolyIntersections(p0, p1, rings);

    if (inside0 && inside1) {
      if (!current) current = [p0];
      current.push(p1);
    } else if (inside0 && !inside1) {
      if (!current) current = [p0];
      if (hits.length) {
        current.push(hits[0].pt);
        segments.push(current);
        current = null;
      }
    } else if (!inside0 && inside1) {
      if (hits.length) {
        current = [hits[hits.length - 1].pt, p1];
      }
    } else {
      if (hits.length >= 2) {
        const first = hits[0].pt;
        const last = hits[hits.length - 1].pt;
        segments.push([first, last]);
      }
    }
  }
  if (current && current.length > 1) segments.push(current);

  return segments.map((coords) => ({
    type: "Feature",
    properties: feature.properties,
    geometry: { type: "LineString", coordinates: coords },
  }));
}

// Merge LineStrings that share endpoints into continuous chains.
// Groups by a key function, returns one MultiLineString feature per group.
export function mergeLines(features, keyFn = () => "") {
  const byKey = new Map();
  for (const f of features) {
    const key = keyFn(f);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(f.geometry.coordinates);
  }

  const results = [];
  for (const [key, lines] of byKey) {
    const segments = lines.map((coords, i) => ({ id: i, coords }));
    const endIndex = new Map();
    const ck = (c) => `${c[0]},${c[1]}`;

    for (const seg of segments) {
      const sk = ck(seg.coords[0]);
      const ek = ck(seg.coords[seg.coords.length - 1]);
      if (!endIndex.has(sk)) endIndex.set(sk, []);
      endIndex.get(sk).push({ seg, end: "start" });
      if (!endIndex.has(ek)) endIndex.set(ek, []);
      endIndex.get(ek).push({ seg, end: "end" });
    }

    const used = new Set();
    const merged = [];

    for (const seg of segments) {
      if (used.has(seg.id)) continue;
      used.add(seg.id);
      let chain = [...seg.coords];

      let changed = true;
      while (changed) {
        changed = false;
        const key = ck(chain[chain.length - 1]);
        for (const entry of endIndex.get(key) || []) {
          if (used.has(entry.seg.id)) continue;
          used.add(entry.seg.id);
          if (entry.end === "start") {
            chain.push(...entry.seg.coords.slice(1));
          } else {
            chain.push(...entry.seg.coords.slice(0, -1).reverse());
          }
          changed = true;
          break;
        }
      }

      changed = true;
      while (changed) {
        changed = false;
        const key = ck(chain[0]);
        for (const entry of endIndex.get(key) || []) {
          if (used.has(entry.seg.id)) continue;
          used.add(entry.seg.id);
          if (entry.end === "end") {
            chain.unshift(...entry.seg.coords.slice(0, -1));
          } else {
            chain.unshift(...entry.seg.coords.slice(1).reverse());
          }
          changed = true;
          break;
        }
      }

      merged.push(chain);
    }

    results.push({
      type: "Feature",
      properties: keyFn.props ? keyFn.props(key) : {},
      geometry: { type: "MultiLineString", coordinates: merged },
    });
  }
  return results;
}

function getRings(geom) {
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}

export function pointInPolygon(pt, geom) {
  const [x, y] = pt;
  const rings = getRings(geom);
  let inside = false;
  for (const ring of rings) {
    let j = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
      const xi = ring[i][0],
        yi = ring[i][1];
      const xj = ring[j][0],
        yj = ring[j][1];
      const intersect =
        yi > y !== yj > y &&
        x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi;
      if (intersect) inside = !inside;
      j = i;
    }
  }
  return inside;
}

function segmentPolyIntersections(p0, p1, rings) {
  const hits = [];
  rings.forEach((ring) => {
    for (let i = 0; i < ring.length - 1; i++) {
      const q0 = ring[i];
      const q1 = ring[i + 1];
      const res = segmentIntersect(p0, p1, q0, q1);
      if (res) hits.push(res);
    }
  });
  hits.sort((a, b) => a.t - b.t);
  return hits;
}

function segmentIntersect(p0, p1, q0, q1) {
  const x1 = p0[0],
    y1 = p0[1],
    x2 = p1[0],
    y2 = p1[1];
  const x3 = q0[0],
    y3 = q0[1],
    x4 = q1[0],
    y4 = q1[1];
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-12) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  const px = x1 + t * (x2 - x1);
  const py = y1 + t * (y2 - y1);
  return { pt: [px, py], t };
}
