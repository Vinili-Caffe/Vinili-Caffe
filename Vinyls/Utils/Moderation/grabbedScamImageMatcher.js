const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REFS_DIR = path.resolve(__dirname, "../Config/grabbedScamRefs");
const HASHES_PATH = path.resolve(__dirname, "../Config/grabbedScamImageHashes.json");

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHMENTS = 3;
const FETCH_TIMEOUT_MS = 12_000;

/** Hamming distance thresholds (64-bit hashes). Keep strict to avoid false positives. */
const EXACT_SHA_MATCH = true;
const DHASH_MAX_DIST = 8;
const AHASH_MAX_DIST = 6;
/** Both hashes must be under threshold for a "similar" hit. */
const REQUIRE_BOTH_HASHES = true;

let canvasApi = null;
let refsLoaded = false;
/** @type {{ id: string, sha256: string, dHash: string, aHash: string }[]} */
let refFingerprints = [];

function tryLoadCanvas() {
  if (canvasApi) return canvasApi;
  const candidates = [
    "canvas",
    path.resolve(__dirname, "../../node_modules/canvas"),
  ];
  for (const id of candidates) {
    try {
      canvasApi = require(id);
      return canvasApi;
    } catch {
      /* try next */
    }
  }
  canvasApi = null;
  return null;
}

function popcount64(n) {
  let x = typeof n === "bigint" ? n : BigInt(n);
  let c = 0;
  while (x > 0n) {
    c += Number(x & 1n);
    x >>= 1n;
  }
  return c;
}

function hammingHex64(a, b) {
  try {
    const x = BigInt(`0x${String(a || "0")}`) ^ BigInt(`0x${String(b || "0")}`);
    return popcount64(x);
  } catch {
    return 64;
  }
}

function rgbaToGray(data, i) {
  return data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
}

async function computeHashesFromBuffer(buf) {
  const canvas = tryLoadCanvas();
  if (!canvas || !buf?.length) return null;
  const { createCanvas, loadImage } = canvas;
  let img;
  try {
    img = await loadImage(buf);
  } catch {
    return null;
  }

  // dHash: 9x8, compare adjacent horizontally → 64 bits
  const dw = 9;
  const dh = 8;
  const dCanvas = createCanvas(dw, dh);
  const dCtx = dCanvas.getContext("2d");
  dCtx.drawImage(img, 0, 0, dw, dh);
  const dData = dCtx.getImageData(0, 0, dw, dh).data;
  let dHash = 0n;
  let bit = 0n;
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw - 1; x++) {
      const g1 = rgbaToGray(dData, (y * dw + x) * 4);
      const g2 = rgbaToGray(dData, (y * dw + x + 1) * 4);
      if (g1 > g2) dHash |= 1n << bit;
      bit += 1n;
    }
  }

  // aHash: 8x8 vs mean → 64 bits
  const aw = 8;
  const ah = 8;
  const aCanvas = createCanvas(aw, ah);
  const aCtx = aCanvas.getContext("2d");
  aCtx.drawImage(img, 0, 0, aw, ah);
  const aData = aCtx.getImageData(0, 0, aw, ah).data;
  const grays = new Float64Array(aw * ah);
  let sum = 0;
  for (let i = 0; i < aw * ah; i++) {
    const g = rgbaToGray(aData, i * 4);
    grays[i] = g;
    sum += g;
  }
  const mean = sum / (aw * ah);
  let aHash = 0n;
  for (let i = 0; i < aw * ah; i++) {
    if (grays[i] >= mean) aHash |= 1n << BigInt(i);
  }

  return {
    sha256: crypto.createHash("sha256").update(buf).digest("hex"),
    dHash: dHash.toString(16).padStart(16, "0"),
    aHash: aHash.toString(16).padStart(16, "0"),
  };
}

function loadFingerprintsFromDisk() {
  if (refsLoaded) return refFingerprints;
  refsLoaded = true;
  refFingerprints = [];
  try {
    if (fs.existsSync(HASHES_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(HASHES_PATH, "utf8"));
      const list = Array.isArray(parsed?.refs) ? parsed.refs : [];
      for (const row of list) {
        const id = String(row?.id || "").trim();
        const sha256 = String(row?.sha256 || "").trim().toLowerCase();
        const dHash = String(row?.dHash || "").trim().toLowerCase();
        const aHash = String(row?.aHash || "").trim().toLowerCase();
        if (!id || !sha256 || !dHash || !aHash) continue;
        refFingerprints.push({ id, sha256, dHash, aHash });
      }
    }
  } catch (err) {
    global.logger?.warn?.("[automod] grabbed scam hashes load failed:", err?.message || err);
  }
  return refFingerprints;
}

function matchFingerprints(fp) {
  if (!fp) return null;
  const refs = loadFingerprintsFromDisk();
  if (!refs.length) return null;

  if (EXACT_SHA_MATCH) {
    const exact = refs.find((r) => r.sha256 === fp.sha256);
    if (exact) {
      return { id: exact.id, kind: "exact", dDist: 0, aDist: 0 };
    }
  }

  let best = null;
  for (const r of refs) {
    const dDist = hammingHex64(fp.dHash, r.dHash);
    const aDist = hammingHex64(fp.aHash, r.aHash);
    if (REQUIRE_BOTH_HASHES) {
      if (dDist > DHASH_MAX_DIST || aDist > AHASH_MAX_DIST) continue;
    } else if (dDist > DHASH_MAX_DIST) {
      continue;
    }
    if (!best || dDist + aDist < best.dDist + best.aDist) {
      best = { id: r.id, kind: "similar", dDist, aDist };
    }
  }
  return best;
}

function isStaticImageAttachment(att) {
  if (!att) return false;
  const contentType = String(att.contentType || "").toLowerCase();
  const name = String(att.name || att.filename || "").toLowerCase();
  if (contentType.includes("gif") || name.endsWith(".gif")) return false;
  if (contentType.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|bmp|tiff?|avif|heic|heif)$/.test(name);
}

async function fetchAttachmentBuffer(att, maxBytes = MAX_BYTES) {
  const urls = [att?.proxyURL, att?.url].filter(Boolean).map((u) => String(u).trim());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  timer.unref?.();
  try {
    for (const url of urls) {
      if (!url) continue;
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) continue;
        const cl = Number(res.headers.get("content-length") || 0);
        if (Number.isFinite(cl) && cl > maxBytes) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        if (!buf.length || buf.length > maxBytes) continue;
        return buf;
      } catch {
        /* try next url */
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return null;
}

/**
 * Scan message attachments for known grabbed-account scam bait images.
 * Static images only (no GIF). Returns match info or null.
 */
async function detectGrabbedScamImage(message) {
  if (!tryLoadCanvas()) return null;
  const refs = loadFingerprintsFromDisk();
  if (!refs.length) return null;

  const attachmentList = [...(message?.attachments?.values?.() || [])];
  const staticImages = attachmentList.filter(isStaticImageAttachment).slice(0, MAX_ATTACHMENTS);
  if (!staticImages.length) return null;

  for (const att of staticImages) {
    const declared = Number(att.size || 0);
    if (declared > MAX_BYTES) continue;
    const buf = await fetchAttachmentBuffer(att, MAX_BYTES);
    if (!buf) continue;
    const fp = await computeHashesFromBuffer(buf);
    const hit = matchFingerprints(fp);
    if (hit) {
      return {
        ...hit,
        attachmentName: String(att.name || att.filename || "image"),
      };
    }
  }
  return null;
}

async function rebuildHashesFromRefsDir() {
  const canvas = tryLoadCanvas();
  if (!canvas) throw new Error("canvas module unavailable");
  if (!fs.existsSync(REFS_DIR)) {
    throw new Error(`refs dir missing: ${REFS_DIR}`);
  }
  const files = fs
    .readdirSync(REFS_DIR)
    .filter((n) => /\.(png|jpe?g|webp|bmp)$/i.test(n))
    .sort();
  const refs = [];
  for (const name of files) {
    const buf = fs.readFileSync(path.join(REFS_DIR, name));
    const fp = await computeHashesFromBuffer(buf);
    if (!fp) continue;
    refs.push({
      id: name.replace(/\.[^.]+$/, ""),
      file: name,
      sha256: fp.sha256,
      dHash: fp.dHash,
      aHash: fp.aHash,
    });
  }
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    dHashMaxDist: DHASH_MAX_DIST,
    aHashMaxDist: AHASH_MAX_DIST,
    refs,
  };
  fs.mkdirSync(path.dirname(HASHES_PATH), { recursive: true });
  fs.writeFileSync(HASHES_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  refsLoaded = false;
  refFingerprints = [];
  loadFingerprintsFromDisk();
  return payload;
}

module.exports = {
  detectGrabbedScamImage,
  computeHashesFromBuffer,
  matchFingerprints,
  isStaticImageAttachment,
  rebuildHashesFromRefsDir,
  loadFingerprintsFromDisk,
  REFS_DIR,
  HASHES_PATH,
  DHASH_MAX_DIST,
  AHASH_MAX_DIST,
};
