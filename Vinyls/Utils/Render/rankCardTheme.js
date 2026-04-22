const DEFAULT_RANK_CARD_THEME = Object.freeze({
  overlayOpacity: 0.82,
  wallpaperUrl: "",
  panelColor: "#202225",
  primaryTextColor: "#ffcb05",
  secondaryTextColor: "#d7d7d7",
  multiplierColor: "#ffb400",
  valueColor: "#f2f2f2",
  labelColor: "#a8acb8",
  progressStartColor: "#ffd400",
  progressEndColor: "#fff26b",
  ringColor: "#ffe76a",
  rankBoxBorderColor: "#ffcb05",
});

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function normalizeHex(value, fallback) {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const body = raw.charAt(0) === "#" ? raw.slice(1) : raw;
  if (/^[0-9a-fA-F]{6}$/.test(body)) return "#" + body.toUpperCase();
  return fallback;
}

function sanitizeWallpaperUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length > 1000) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function mergeRankCardTheme(input) {
  const src = input && typeof input === "object" ? input : {};
  return {
    overlayOpacity: clamp(src.overlayOpacity, 0.08, 1),
    wallpaperUrl: sanitizeWallpaperUrl(src.wallpaperUrl),
    panelColor: normalizeHex(src.panelColor, DEFAULT_RANK_CARD_THEME.panelColor),
    primaryTextColor: normalizeHex(src.primaryTextColor, DEFAULT_RANK_CARD_THEME.primaryTextColor),
    secondaryTextColor: normalizeHex(src.secondaryTextColor, DEFAULT_RANK_CARD_THEME.secondaryTextColor),
    multiplierColor: normalizeHex(src.multiplierColor, DEFAULT_RANK_CARD_THEME.multiplierColor),
    valueColor: normalizeHex(src.valueColor, DEFAULT_RANK_CARD_THEME.valueColor),
    labelColor: normalizeHex(src.labelColor, DEFAULT_RANK_CARD_THEME.labelColor),
    progressStartColor: normalizeHex(src.progressStartColor, DEFAULT_RANK_CARD_THEME.progressStartColor),
    progressEndColor: normalizeHex(src.progressEndColor, DEFAULT_RANK_CARD_THEME.progressEndColor),
    ringColor: normalizeHex(src.ringColor, DEFAULT_RANK_CARD_THEME.ringColor),
    rankBoxBorderColor: normalizeHex(src.rankBoxBorderColor, DEFAULT_RANK_CARD_THEME.rankBoxBorderColor),
  };
}

function getRankCardThemeFromDoc(doc) {
  return mergeRankCardTheme(doc?.profile?.rankCard || {});
}

module.exports = {
  DEFAULT_RANK_CARD_THEME,
  clamp,
  mergeRankCardTheme,
  getRankCardThemeFromDoc,
  normalizeHex,
  sanitizeWallpaperUrl,
};
