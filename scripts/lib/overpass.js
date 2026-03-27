import fs from "fs";
import path from "path";

export const SHEFFIELD_AREA_ID = 3600106956;
export const SHEFFIELD_REL_ID = SHEFFIELD_AREA_ID - 3600000000;
export const DATA_DIR = path.join(
  import.meta.dirname,
  "..",
  "..",
  "public",
  "data",
);

export function writeGeojson(filename, features) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, filename),
    JSON.stringify({ type: "FeatureCollection", features }),
  );
  console.log(`Wrote ${features.length} → ${filename}`);
}
