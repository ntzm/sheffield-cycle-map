import {
  runOverpass,
  writeGeojson,
  SHEFFIELD_AREA_ID,
  asPoint,
} from "./lib/overpass.js";
import {
  cachedJsonFetch,
  cachedFetch,
  getCacheEntry,
  setCacheEntry,
} from "./lib/cache.js";
import { spawn } from "child_process";
import path from "path";
import sharp from "sharp";
import { encode as encodeBlurhash } from "blurhash";

const overpassQuery = `
[out:json][timeout:25];
area(id:${SHEFFIELD_AREA_ID})->.searchArea;
nwr["amenity"="bicycle_parking"](area.searchArea);
out center meta;
`;

const parking = await runOverpass(overpassQuery);

function booleanise(v) {
  if (v === "yes") {
    return "Yes";
  }
  if (v === "no") {
    return "No";
  }
  if (v === "partial") {
    return "Partially";
  }
  return v;
}

const accessMap = {
  customers: "Customers only",
  members: "Members only",
  private: "Private",
};

const privateMap = {
  students: "Students only",
  employees: "Employees only",
};

const hangarOperators = ["Falco", "Cyclehoop"];

const bicycleParkingImplicitCovered = ["shed", "building"];

function panoramaxIdsFromTags(tags) {
  return Object.entries(tags)
    .filter(
      ([key, value]) =>
        value && (key === "panoramax" || key.startsWith("panoramax:")),
    )
    .map(([_, value]) => value);
}

const features = await Promise.all(
  parking.elements.map(async (element) => {
    const tags = element.tags;
    const properties = {
      authentication: [],
    };

    const { lat, lon } = element.center ?? element;

    // Store identifiers and coordinates for downstream popups/links
    properties.osm_id = element.id;
    properties.osm_type = element.type;
    properties.lat = lat;
    properties.lon = lon;

    if (element.timestamp) {
      properties.last_updated = element.timestamp;
    }

    if (tags.bicycle_parking === "building" && tags.access !== "private") {
      properties.is_hub = true;
    }

    const is_hangar = hangarOperators.includes(tags.operator);

    if (is_hangar) {
      properties.is_hangar = true;
    }

    if (tags.name) {
      properties.name = tags.name;
    } else if (tags.bicycle_parking === "informal") {
      properties.name = "Informal bike parking";
    } else if (is_hangar) {
      properties.name = "Cycle hangar";
    } else if (tags.location === "underground") {
      properties.name = "Underground bike parking";
    } else {
      properties.name = "Bike parking";
    }

    if (tags.bicycle_parking === "wall_loops") {
      properties.wheel_benders = true;
    }

    if (tags.description) {
      properties.description = tags.description;
    }

    const access = accessMap[tags.access];

    if (access) {
      const privateValue = privateMap[tags.private];

      if (privateValue) {
        properties.access = privateValue;
      } else {
        properties.access = access;
      }
    }

    if (tags.fee === "yes") {
      properties.fee = true;

      if (tags.charge) {
        properties.charge = tags.charge;
      }
    }

    if (
      tags.covered &&
      !bicycleParkingImplicitCovered.includes(tags.bicycle_parking)
    ) {
      properties.covered = booleanise(tags.covered);
    }

    if (tags.capacity) {
      properties.capacity = tags.capacity;
    }

    if (tags.operator) {
      properties.operator = tags.operator;
    }

    if (tags.website) {
      properties.website = tags.website;
    }

    if (tags.opening_hours) {
      properties.opening_hours = tags.opening_hours;
    }

    if (tags.toilets === "yes") {
      properties.toilets = true;
    }

    if (tags["authentication:combination"] === "yes") {
      properties.authentication.push("padlock combination");
    }

    if (tags["authentication:key"] === "yes") {
      properties.authentication.push("key");
    }

    if (tags["authentication:contactless"] === "yes") {
      properties.authentication.push("fob");
    }

    if (tags["authentication:app"] === "yes") {
      properties.authentication.push("app");
    }

    const panoIds = panoramaxIdsFromTags(tags);
    if (panoIds.length > 0) {
      const candidates = await Promise.all(panoIds.map(getPanoramaxData));
      const ranked = candidates.filter(Boolean).sort((a, b) => {
        const scoreA = a.qualityScore ?? Number.POSITIVE_INFINITY;
        const scoreB = b.qualityScore ?? Number.POSITIVE_INFINITY;
        if (scoreA !== scoreB) return scoreA - scoreB; // lower BRISQUE is better
        const areaA = (a.width ?? 0) * (a.height ?? 0);
        const areaB = (b.width ?? 0) * (b.height ?? 0);
        return areaB - areaA;
      });

      const best = ranked[0];
      if (best) {
        properties.imageHref = best.thumbnailHref;
        properties.imageAuthor = best.producer;
        properties.imageLicense = best.license;
        properties.imageWidth = best.width;
        properties.imageHeight = best.height;
        properties.imageBlurhash = best.blurhash;
      }
    }

    return asPoint({ type: "node", lat, lon }, properties);
  }),
);

writeGeojson("parking.geojson", features);

async function getPanoramaxData(id) {
  const response = await cachedJsonFetch(
    `https://panoramax.mapcomplete.org/api/search?limit=1&ids=${id}`,
    {
      headers: {
        Accept: "application/geo+json",
        Authorization:
          "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnZW92aXNpbyIsInN1YiI6IjU5ZjgzOGI0LTM4ZjAtNDdjYi04OWYyLTM3NDQ3MWMxNTUxOCJ9.0rBioZS_48NTjnkIyN9497c3fQdTqtGgH1HDqlz1bWs",
      },
    },
  );

  const features = response.features;

  if (features.length < 1) {
    console.warn(`No features for panoramax ${id}`);
    return null;
  }

  const feature = features[0];

  const thumbnailHref = `https://panoramax.mapcomplete.org${feature.assets.thumb.href}`;
  const license = feature.properties.license;
  const producer = feature.providers[feature.providers.length - 1].name;

  const buf = await cachedFetch(thumbnailHref, { responseType: "arrayBuffer" });
  const size = getImageSize(buf);
  const width = size?.width;
  const height = size?.height;
  const [qualityScore, blurhash] = await Promise.all([
    getQualityScore(thumbnailHref, buf),
    getBlurhash(buf),
  ]);

  return {
    thumbnailHref,
    license,
    producer,
    width,
    height,
    qualityScore,
    blurhash,
  };
}

async function getBlurhash(imageBuffer) {
  try {
    const image = sharp(imageBuffer)
      .resize({ width: 64, height: 64, fit: "inside" })
      .ensureAlpha();
    const { data, info } = await image
      .raw()
      .toBuffer({ resolveWithObject: true });
    return encodeBlurhash(
      new Uint8ClampedArray(data),
      info.width,
      info.height,
      4,
      3,
    );
  } catch (err) {
    console.warn("Failed to compute blurhash", err?.message ?? err);
    return undefined;
  }
}

async function getQualityScore(thumbnailHref, imageBuffer) {
  const cacheKey = `brisque:${thumbnailHref}`;
  const cached = getCacheEntry(cacheKey);
  if (typeof cached === "number") {
    return cached;
  }

  const base64 = Buffer.from(imageBuffer).toString("base64");
  try {
    const score = await runBrisque(base64);
    if (typeof score === "number" && Number.isFinite(score)) {
      setCacheEntry(cacheKey, score);
    }
    return score;
  } catch (err) {
    console.warn(
      `Failed to score image ${thumbnailHref}:`,
      err?.message ?? err,
    );
    return undefined;
  }
}

async function runBrisque(base64) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(import.meta.dirname, "brisque_score.py");
    const proc = spawn("python3", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));

    proc.on("error", (err) => {
      reject(err);
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(
          new Error(`BRISQUE script failed (${code}): ${stderr.trim()}`),
        );
      }
      try {
        const parsed = JSON.parse(stdout || "{}");
        if (typeof parsed.score === "number") {
          return resolve(parsed.score);
        }
        return reject(new Error(`Unexpected BRISQUE output: ${stdout.trim()}`));
      } catch (err) {
        return reject(err);
      }
    });

    proc.stdin.write(base64);
    proc.stdin.end();
  });
}

function getImageSize(buffer) {
  if (!buffer || buffer.length < 24) return null;
  // PNG
  if (buffer.slice(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    };
  }
  // JPEG (also extract orientation if present)
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      // SOF0, SOF2 etc markers that contain size
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        const height = buffer.readUInt16BE(offset + 5);
        const width = buffer.readUInt16BE(offset + 7);
        return { width, height };
      }
      offset += 2 + length;
    }
  }
  // WEBP (VP8X / VP8 / VP8L)
  if (
    buffer.slice(0, 4).toString("ascii") === "RIFF" &&
    buffer.slice(8, 12).toString("ascii") === "WEBP"
  ) {
    const chunkHeader = buffer.slice(12, 16).toString("ascii");
    if (chunkHeader === "VP8 " && buffer.length >= 30) {
      const width = buffer.readUInt16LE(26) & 0x3fff;
      const height = buffer.readUInt16LE(28) & 0x3fff;
      return { width, height };
    }
    if (chunkHeader === "VP8L" && buffer.length >= 25) {
      const tmp = buffer.readUInt32LE(21);
      const width = (tmp & 0x3fff) + 1;
      const height = ((tmp >> 14) & 0x3fff) + 1;
      return { width, height };
    }
    if (chunkHeader === "VP8X" && buffer.length >= 30) {
      const width = 1 + readUInt24LE(buffer, 24);
      const height = 1 + readUInt24LE(buffer, 27);
      return { width, height };
    }
  }
  return null;
}

function parseExifOrientation(buf) {
  // buf is TIFF data starting at byte 0 (after 'Exif\0\0')
  if (buf.length < 12) return undefined;
  const isLE = buf.slice(0, 2).toString("ascii") === "II";
  const readU16 = (o) => (isLE ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const readU32 = (o) => (isLE ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifdOffset = readU32(4);
  const dirStart = ifdOffset;
  if (dirStart + 2 > buf.length) return undefined;
  const entries = readU16(dirStart);
  for (let i = 0; i < entries; i++) {
    const entryOffset = dirStart + 2 + i * 12;
    if (entryOffset + 12 > buf.length) break;
    const tag = readU16(entryOffset);
    if (tag === 0x0112) {
      // orientation
      const valueOffset = entryOffset + 8;
      return readU16(valueOffset);
    }
  }
  return undefined;
}

function readUInt24LE(buf, offset) {
  return (
    buf.readUInt8(offset) |
    (buf.readUInt8(offset + 1) << 8) |
    (buf.readUInt8(offset + 2) << 16)
  );
}
