import fs from "fs";
import path from "path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const BOUNDARY_PATH = path.join(ROOT, "public", "data", "boundary.geojson");

export function loadBoundary() {
  return JSON.parse(fs.readFileSync(BOUNDARY_PATH, "utf8")).features[0]
    .geometry;
}
