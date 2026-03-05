import {
  runOverpass,
  writeGeojson,
  asLineString,
} from "./overpass.js";
import { clipLineToPolygon, mergeLines } from "./geo.js";
import { loadBoundary } from "./boundary.js";

/**
 * Shared pipeline for NCN / LCN scripts.
 * Fetches ways from Overpass, deduplicates, clips to Sheffield boundary,
 * and merges adjacent lines.
 *
 * When extractRefs is true, route refs are read from relation members
 * and used to group merged lines.
 */
export async function buildCycleNetwork(query, outputFile, { extractRefs = false } = {}) {
  const data = await runOverpass(query);
  const boundary = loadBoundary();

  // Optionally build way → ref mapping from relation members.
  let wayRefs;
  if (extractRefs) {
    wayRefs = new Map();
    for (const e of data.elements || []) {
      if (e.type !== "relation" || !e.tags?.ref || !e.members) continue;
      for (const m of e.members) {
        if (m.type !== "way") continue;
        const existing = wayRefs.get(m.ref);
        if (existing) existing.add(e.tags.ref);
        else wayRefs.set(m.ref, new Set([e.tags.ref]));
      }
    }
  }

  // Deduplicate ways, convert to GeoJSON, clip, merge.
  const seen = new Set();
  const features = (data.elements || [])
    .filter((e) => {
      if (e.type !== "way" || seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .map((e) => {
      if (wayRefs) {
        const refs = wayRefs.get(e.id);
        const ref = refs ? [...refs].sort().join(", ") : undefined;
        return asLineString(e, ref ? { ref } : {});
      }
      return asLineString(e);
    })
    .filter(Boolean)
    .flatMap((f) => clipLineToPolygon(f, boundary))
    .filter((f) => f.geometry.coordinates.length > 1);

  if (wayRefs) {
    const keyFn = (f) => f.properties.ref ?? "";
    keyFn.props = (key) => (key ? { ref: key } : {});
    writeGeojson(outputFile, mergeLines(features, keyFn));
  } else {
    writeGeojson(outputFile, mergeLines(features));
  }
}
