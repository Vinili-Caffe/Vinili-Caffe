const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const https = require("https") as typeof import("https");
const http = require("http") as typeof import("http");
const crypto = require("crypto") as typeof import("crypto");
const CACHE_DIR = path.join(__dirname, "..", "..", "UI", "RoleIcons");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function generateIconHash(url?) {
  return crypto.createHash("md5").update(url).digest("hex");
}

function downloadImage(url?) {
  return new Promise((resolve?, reject?) => {
    const client = url.startsWith("https") ? https : http;

    client
      .get(url, (response?) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${response.statusCode}`));
          return;
        }

        const chunks = [];
        response.on("data", (chunk?) => chunks.push(chunk));
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      })
      .on("error", reject);
  });
}

async function cacheRoleIcon(iconUrl?) {
  if (!iconUrl) return null;

  try {
    const hash = generateIconHash(iconUrl);
    const ext = path.extname(new URL(iconUrl).pathname) || ".png";
    const filename = `${hash}${ext}`;
    const filepath = path.join(CACHE_DIR, filename);

    try {
      await fs.promises.access(filepath);
      return filepath;
    } catch (_) {}

    const imageBuffer = await downloadImage(iconUrl);
    /* perfP2: write async — non blocca l'event loop su I/O disco */
    await fs.promises.writeFile(filepath, imageBuffer);

    return filepath;
  } catch (error) {
    global.logger?.error?.("[ROLE_ICON_CACHE] Failed to cache icon:", error);
    return iconUrl;
  }
}

async function cleanOldIcons(maxAgeMs = 30 * 24 * 60 * 60 * 1000) {
  try {
    const files = await fs.promises.readdir(CACHE_DIR);
    const now = Date.now();

    for (const file of files) {
      const filepath = path.join(CACHE_DIR, file);
      try {
        const stats = await fs.promises.stat(filepath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.promises.unlink(filepath);
        }
      } catch (_) {}
    }
  } catch (error) {
    global.logger?.error?.(
      "[ROLE_ICON_CACHE] Failed to clean old icons:",
      error,
    );
  }
}

if (!global.__vcRoleIconCacheCleanupInterval) {
  global.__vcRoleIconCacheCleanupInterval = setInterval(
    () => {
      void cleanOldIcons();
    },
    24 * 60 * 60 * 1000,
  );
  if (typeof global.__vcRoleIconCacheCleanupInterval.unref === "function") {
    global.__vcRoleIconCacheCleanupInterval.unref();
  }
}

export = { cacheRoleIcon, cleanOldIcons };