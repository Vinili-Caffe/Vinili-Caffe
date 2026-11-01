const STATS_CANVAS_CACHE_TTL_MS = Math.max(
  15_000,
  Math.min(180_000, Number(process.env.STATS_CANVAS_CACHE_TTL_MS ?? 60_000)),
);
const STATS_CANVAS_CACHE_MAX = Math.max(
  8,
  Math.min(120, Number(process.env.STATS_CANVAS_CACHE_MAX ?? 40)),
);

const statsCanvasCache = new Map();

function getStatsCanvasCache(key?) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return null;
  const row = statsCanvasCache.get(safeKey);
  if (!row || row.expiresAt <= Date.now()) {
    if (row) statsCanvasCache.delete(safeKey);
    return null;
  }
  return Buffer.isBuffer(row.buffer) ? row.buffer : null;
}

function setStatsCanvasCache(key?, buffer?) {
  const safeKey = String(key || "").trim();
  if (!safeKey || !Buffer.isBuffer(buffer)) return;
  statsCanvasCache.set(safeKey, {
    buffer,
    expiresAt: Date.now() + STATS_CANVAS_CACHE_TTL_MS,
  });
  while (statsCanvasCache.size > STATS_CANVAS_CACHE_MAX) {
    const oldest = statsCanvasCache.keys().next().value;
    if (!oldest) break;
    statsCanvasCache.delete(oldest);
  }
}

async function getOrBuildStatsCanvasBuffer(key?, buildFn?) {
  const cached = getStatsCanvasCache(key);
  if (cached) return cached;
  const buffer = await buildFn();
  if (Buffer.isBuffer(buffer) && buffer.length > 0) {
    setStatsCanvasCache(key, buffer);
  }
  return buffer;
}

export = {
  getOrBuildStatsCanvasBuffer,
};
