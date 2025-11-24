import fs from "fs";
import path from "path";
import crypto from "crypto";

const CACHE_DIR = path.join(import.meta.dirname, "..", ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "api-cache.json");

let cache = null;

function loadCache() {
  if (cache !== null) return;
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf8");
    cache = JSON.parse(raw);
  } catch (err) {
    cache = {};
  }
}

function persistCache() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
}

export function getCacheEntry(key) {
  loadCache();
  return decodeEntry(cache[key]);
}

export function setCacheEntry(key, value) {
  loadCache();
  cache[key] = value;
  persistCache();
}

function makeKey(url, options = {}) {
  const { method = "GET", body = null, headers = {} } = options;
  const headersLower = Object.fromEntries(
    Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  const payload = {
    url,
    method: method.toUpperCase(),
    body,
    headers: headersLower,
  };
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

function decodeEntry(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
  if (!entry.__cacheType) return entry;
  switch (entry.__cacheType) {
    case "buffer":
      return Buffer.from(entry.data, "base64");
    case "text":
    case "json":
      return entry.data;
    default:
      return entry.data;
  }
}

function encodeEntry(data, cacheType) {
  if (cacheType === "buffer") {
    return {
      __cacheType: "buffer",
      data: Buffer.from(data).toString("base64"),
    };
  }
  return { __cacheType: cacheType, data };
}

export async function cachedJsonFetch(url, options = {}) {
  return cachedFetch(url, options);
}

export async function cachedFetch(url, options = {}) {
  loadCache();
  const key = makeKey(url, options);
  const cached = cache[key];
  if (cached !== undefined) {
    console.log(`[cache] hit ${url}`);
    return decodeEntry(cached);
  }

  console.log(`[cache] miss ${url}`);

  const { responseType = "json", ...fetchOpts } = options;
  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
    );
  }

  let data;
  if (responseType === "text") {
    data = await res.text();
  } else if (responseType === "arrayBuffer") {
    const buf = Buffer.from(await res.arrayBuffer());
    data = buf;
  } else {
    data = await res.json();
  }

  const stored = encodeEntry(
    data,
    responseType === "arrayBuffer"
      ? "buffer"
      : responseType === "text"
        ? "text"
        : "json",
  );
  cache[key] = stored;
  persistCache();
  console.log(`[cache] store ${url}`);
  return data;
}

export function cachePath() {
  return CACHE_DIR;
}
