/** Alias condivisi e utilità per le sorgenti minigiochi. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");

function randomBetween(min?, max?) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

function normalizePlayerGuess(raw?) {
  return normalizeCountryName(raw);
}

function buildCompactAlias(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return null;
  const compact = tokens.filter((t?) => t.length > 1).join(" ").trim();
  if (!compact || compact === normalized) return null;
  return compact;
}

function buildAliases(values = []) {
  const out = new Set();
  for (const value of values) {
    const normalized = normalizeCountryName(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
  }
  return Array.from(out.values());
}

export = { randomBetween, normalizePlayerGuess, buildCompactAlias, buildAliases };
