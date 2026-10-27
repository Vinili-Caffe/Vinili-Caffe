/**
 * utilità prune Map in-memory (snipes, hub, panel cache).
 */
function pruneMapByAge(map, { maxAgeMs, now = Date.now(), getTs, onDelete } = {}) {
  if (!(map instanceof Map) || !maxAgeMs || maxAgeMs <= 0) return 0;
  let removed = 0;
  for (const [key, value] of map.entries()) {
    const ts = typeof getTs === "function" ? Number(getTs(key, value) || 0) : Number(value?.at || value?.ts || 0);
    if (ts > 0 && now - ts > maxAgeMs) {
      map.delete(key);
      removed += 1;
      if (typeof onDelete === "function") onDelete(key, value);
    }
  }
  return removed;
}

function pruneMapByMaxSize(map, maxSize) {
  if (!(map instanceof Map) || !maxSize || maxSize <= 0 || map.size <= maxSize) return 0;
  const overflow = map.size - maxSize;
  let removed = 0;
  for (const key of map.keys()) {
    if (removed >= overflow) break;
    map.delete(key);
    removed += 1;
  }
  return removed;
}

function ensureMapPruneInterval(globalKey, tick, intervalMs = 5 * 60 * 1000) {
  if (global[globalKey]) return global[globalKey];
  const timer = setInterval(() => {
    try {
      tick();
    } catch (_) {}
  }, Math.max(30_000, Number(intervalMs) || 300_000));
  timer.unref?.();
  global[globalKey] = timer;
  return timer;
}

module.exports = {
  pruneMapByAge,
  pruneMapByMaxSize,
  ensureMapPruneInterval,
};
