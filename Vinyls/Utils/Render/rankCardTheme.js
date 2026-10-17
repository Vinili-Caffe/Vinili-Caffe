function svgWallpaper(stops, extras) {
  const stopMarkup = Array.isArray(stops)
    ? stops
        .map((stop) => `<stop offset="${stop.offset}" stop-color="${stop.color}" />`)
        .join("")
    : "";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">` +
    `<defs>` +
    `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">${stopMarkup}</linearGradient>` +
    `<filter id="blur"><feGaussianBlur stdDeviation="46" /></filter>` +
    `</defs>` +
    `<rect width="1600" height="900" fill="url(#bg)" />` +
    String(extras || "") +
    `</svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const RANK_CARD_WALLPAPERS = Object.freeze({
  default: {
    key: "default",
    label: "Default Gradient",
    previewUrl: "",
    wallpaperUrl: "",
  },
  aurora: {
    key: "aurora",
    label: "Aurora Dream",
    previewUrl: svgWallpaper(
      [
        { offset: "0%", color: "#140f2e" },
        { offset: "38%", color: "#543ba8" },
        { offset: "68%", color: "#a75ce7" },
        { offset: "100%", color: "#6ed3ff" },
      ],
      [
        `<ellipse cx="1180" cy="250" rx="320" ry="170" fill="rgba(255,255,255,0.30)" filter="url(#blur)" />`,
        `<ellipse cx="650" cy="360" rx="460" ry="180" fill="rgba(255,170,255,0.28)" filter="url(#blur)" />`,
        `<ellipse cx="1000" cy="680" rx="520" ry="160" fill="rgba(120,220,255,0.22)" filter="url(#blur)" />`,
      ].join(""),
    ),
  },
  neon: {
    key: "neon",
    label: "Neon District",
    previewUrl: svgWallpaper(
      [
        { offset: "0%", color: "#0a1326" },
        { offset: "52%", color: "#142f58" },
        { offset: "100%", color: "#090d19" },
      ],
      [
        `<rect x="0" y="640" width="1600" height="260" fill="rgba(14,16,30,0.95)" />`,
        `<rect x="190" y="230" width="160" height="410" fill="rgba(26,35,66,0.94)" />`,
        `<rect x="380" y="160" width="210" height="480" fill="rgba(18,28,54,0.96)" />`,
        `<rect x="650" y="260" width="200" height="380" fill="rgba(21,31,61,0.94)" />`,
        `<rect x="980" y="180" width="180" height="460" fill="rgba(16,27,53,0.96)" />`,
        `<rect x="1240" y="250" width="130" height="390" fill="rgba(24,34,66,0.96)" />`,
        `<rect x="210" y="290" width="120" height="20" fill="#40f6ff" filter="url(#blur)" />`,
        `<rect x="400" y="220" width="160" height="18" fill="#ff46b8" filter="url(#blur)" />`,
        `<rect x="690" y="320" width="120" height="16" fill="#45f0ff" filter="url(#blur)" />`,
        `<rect x="1005" y="255" width="110" height="18" fill="#ff63d4" filter="url(#blur)" />`,
        `<rect x="1260" y="310" width="90" height="14" fill="#61f8ff" filter="url(#blur)" />`,
        `<rect x="0" y="655" width="1600" height="18" fill="rgba(71,219,255,0.40)" filter="url(#blur)" />`,
      ].join(""),
    ),
  },
  meadow: {
    key: "meadow",
    label: "Sunny Meadow",
    previewUrl: svgWallpaper(
      [
        { offset: "0%", color: "#69b9ff" },
        { offset: "44%", color: "#b6ecff" },
        { offset: "45%", color: "#f5ebad" },
        { offset: "100%", color: "#57a546" },
      ],
      [
        `<circle cx="1260" cy="180" r="96" fill="rgba(255,245,166,0.72)" filter="url(#blur)" />`,
        `<ellipse cx="740" cy="635" rx="620" ry="160" fill="rgba(118,202,84,0.82)" />`,
        `<ellipse cx="360" cy="700" rx="340" ry="120" fill="rgba(76,151,74,0.85)" />`,
        `<ellipse cx="1260" cy="710" rx="390" ry="120" fill="rgba(63,138,61,0.88)" />`,
        `<circle cx="220" cy="310" r="115" fill="rgba(72,143,78,0.90)" />`,
        `<circle cx="320" cy="250" r="120" fill="rgba(89,164,88,0.90)" />`,
        `<circle cx="1370" cy="285" r="140" fill="rgba(93,172,92,0.88)" />`,
        `<circle cx="1220" cy="230" r="105" fill="rgba(76,149,74,0.90)" />`,
      ].join(""),
    ),
  },
});

/* rankFont1: fontKey → family canvas (quote fonts + stack di sistema) */
const RANK_FONT_CATALOG = Object.freeze({
  arial: { label: "Arial", family: "Arial" },
  sans: { label: "Noto Sans", family: "Noto Sans" },
  serif: { label: "Georgia", family: "Georgia" },
  mono: { label: "Mono", family: "DejaVu Sans Mono" },
  display: { label: "Fraktur", family: "UnifrakturMaguntia" },
  mplus: { label: "M PLUS Rounded", family: "M PLUS Rounded 1c" },
  dela: { label: "Dela Gothic One", family: "Dela Gothic One" },
  dot: { label: "DotGothic16", family: "DotGothic16" },
  pop: { label: "Hachi Maru Pop", family: "Hachi Maru Pop" },
  rampart: { label: "Rampart One", family: "Rampart One" },
  reggae: { label: "Reggae One", family: "Reggae One" },
  rocknroll: { label: "RocknRoll One", family: "RocknRoll One" },
  yuji: { label: "Yuji Syuku", family: "Yuji Syuku" },
  yusei: { label: "Yusei Magic", family: "Yusei Magic" },
  jiyu: { label: "Jiyu no Tsubasa", family: "JiyunoTsubasa" },
  shippori: { label: "Shippori Mincho", family: "Shippori Mincho" },
  bruno: { label: "Bruno Ace SC", family: "Bruno Ace SC" },
  castoro: { label: "Castoro Titling", family: "Castoro Titling" },
  poltawski: { label: "Poltawski Nowy", family: "Poltawski Nowy" },
  vina: { label: "Vina Sans", family: "Vina Sans" },
  exo2: { label: "Exo 2", family: "Exo 2" },
  inconsolata: { label: "Inconsolata", family: "Inconsolata" },
  script: { label: "Dancing Script", family: "Dancing Script" },
  verdana: { label: "Verdana", family: "Verdana" },
  tahoma: { label: "Tahoma", family: "Tahoma" },
  helvetica: { label: "Helvetica", family: "Helvetica" },
  times: { label: "Times", family: "Times New Roman" },
  impact: { label: "Impact", family: "Impact" },
  comic: { label: "Comic", family: "Comic Sans MS" },
});

const DEFAULT_RANK_CARD_THEME = Object.freeze({
  overlayOpacity: 0.8,
  wallpaperKey: "default",
  wallpaperUrl: "",
  fontKey: "arial",
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

const MAX_CUSTOM_WALLPAPER_DATAURL_LENGTH = 8_000_000;

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
  let raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("data:")) {
    raw = raw.replace(/\s+/g, "");
  }
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw)) {
    if (raw.length > MAX_CUSTOM_WALLPAPER_DATAURL_LENGTH) return "";
    return raw;
  }
  if (raw.length > 1000) return "";
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

function sanitizeWallpaperKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return DEFAULT_RANK_CARD_THEME.wallpaperKey;
  return RANK_CARD_WALLPAPERS[raw] ? raw : DEFAULT_RANK_CARD_THEME.wallpaperKey;
}

function sanitizeFontKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return DEFAULT_RANK_CARD_THEME.fontKey;
  return RANK_FONT_CATALOG[raw] ? raw : DEFAULT_RANK_CARD_THEME.fontKey;
}

function resolveRankFontFamily(fontKey) {
  const key = sanitizeFontKey(fontKey);
  return RANK_FONT_CATALOG[key]?.family || RANK_FONT_CATALOG.arial.family;
}

function listRankCardFonts() {
  return Object.keys(RANK_FONT_CATALOG).map((key) => ({
    key,
    label: RANK_FONT_CATALOG[key].label,
    family: RANK_FONT_CATALOG[key].family,
  }));
}

function resolveRankCardWallpaper(theme) {
  const src = theme && typeof theme === "object" ? theme : {};
  const custom = sanitizeWallpaperUrl(src.wallpaperUrl);
  if (custom) return custom;
  const key = sanitizeWallpaperKey(src.wallpaperKey);
  return String(RANK_CARD_WALLPAPERS[key]?.wallpaperUrl || RANK_CARD_WALLPAPERS[key]?.previewUrl || "");
}

function listRankCardWallpapers() {
  return Object.values(RANK_CARD_WALLPAPERS).map((item) => ({
    key: item.key,
    label: item.label,
    previewUrl: item.previewUrl,
  }));
}

function mergeRankCardTheme(input) {
  const src = input && typeof input === "object" ? input : {};
  const panelColor = normalizeHex(src.panelColor, DEFAULT_RANK_CARD_THEME.panelColor);
  const primaryTextColor = normalizeHex(src.primaryTextColor, DEFAULT_RANK_CARD_THEME.primaryTextColor);
  const multiplierColor = normalizeHex(src.multiplierColor, DEFAULT_RANK_CARD_THEME.multiplierColor);
  const valueColor = normalizeHex(src.valueColor, DEFAULT_RANK_CARD_THEME.valueColor);
  const labelColor = normalizeHex(src.labelColor, DEFAULT_RANK_CARD_THEME.labelColor);

  return {
    overlayOpacity: clamp(src.overlayOpacity == null ? DEFAULT_RANK_CARD_THEME.overlayOpacity : src.overlayOpacity, 0, 1),
    wallpaperKey: sanitizeWallpaperKey(src.wallpaperKey),
    wallpaperUrl: sanitizeWallpaperUrl(src.wallpaperUrl),
    fontKey: sanitizeFontKey(src.fontKey),
    panelColor,
    primaryTextColor,
    secondaryTextColor: normalizeHex(src.secondaryTextColor, labelColor),
    multiplierColor,
    valueColor,
    labelColor,
    progressStartColor: normalizeHex(src.progressStartColor, primaryTextColor),
    progressEndColor: normalizeHex(src.progressEndColor, primaryTextColor),
    ringColor: normalizeHex(src.ringColor, primaryTextColor),
    rankBoxBorderColor: normalizeHex(src.rankBoxBorderColor, valueColor),
  };
}

function getRankCardThemeFromDoc(doc) {
  return mergeRankCardTheme(doc?.profile?.rankCard || {});
}

module.exports = {
  DEFAULT_RANK_CARD_THEME,
  RANK_CARD_WALLPAPERS,
  RANK_FONT_CATALOG,
  clamp,
  mergeRankCardTheme,
  getRankCardThemeFromDoc,
  listRankCardWallpapers,
  listRankCardFonts,
  normalizeHex,
  resolveRankCardWallpaper,
  resolveRankFontFamily,
  sanitizeFontKey,
  sanitizeWallpaperKey,
  sanitizeWallpaperUrl,
};