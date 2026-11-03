
const BG_PRESETS = Object.freeze({
  black: { bg: "#070707", fg: "#ffffff", muted: "rgba(255,255,255,0.7)" },
  charcoal: { bg: "#1a1a1a", fg: "#f5f5f5", muted: "rgba(245,245,245,0.72)" },
  navy: { bg: "#0b1220", fg: "#e8eef8", muted: "rgba(232,238,248,0.72)" },
  wine: { bg: "#1a0a0e", fg: "#f7e8ec", muted: "rgba(247,232,236,0.72)" },
  forest: { bg: "#0a1410", fg: "#e6f2ea", muted: "rgba(230,242,234,0.72)" },
  white: { bg: "#f4f4f4", fg: "#111111", muted: "rgba(17,17,17,0.62)" },
  cream: { bg: "#f7ecdf", fg: "#1a120e", muted: "rgba(26,18,14,0.62)" },
});

const FONT_CATALOG = Object.freeze({
    mplus: { label: "M PLUS Rounded 1c (mplus)", family: '"M PLUS Rounded 1c", "Noto Sans", sans-serif', preview: '"M PLUS Rounded 1c", "Noto Sans", sans-serif' },
  dela: { label: "Dela Gothic One (dela)", family: '"Dela Gothic One", "Noto Sans", sans-serif', preview: '"Dela Gothic One", Impact, sans-serif' },
  dot: { label: "DotGothic16 (dot)", family: '"DotGothic16", "Noto Sans", sans-serif', preview: '"DotGothic16", monospace' },
  pop: { label: "Hachi Maru Pop (pop)", family: '"Hachi Maru Pop", "Comic Sans MS", cursive', preview: '"Hachi Maru Pop", "Comic Sans MS", cursive' },
  rampart: { label: "Rampart One (rampart)", family: '"Rampart One", Impact, sans-serif', preview: '"Rampart One", Impact, sans-serif' },
  reggae: { label: "Reggae One (reggae)", family: '"Reggae One", Impact, sans-serif', preview: '"Reggae One", Impact, sans-serif' },
  rocknroll: { label: "RocknRoll One (rocknroll)", family: '"RocknRoll One", Impact, sans-serif', preview: '"RocknRoll One", Impact, sans-serif' },
  yuji: { label: "Yuji Syuku (yuji)", family: '"Yuji Syuku", Georgia, serif', preview: '"Yuji Syuku", Georgia, serif' },
  yusei: { label: "Yusei Magic (yusei)", family: '"Yusei Magic", "Comic Sans MS", sans-serif', preview: '"Yusei Magic", "Comic Sans MS", sans-serif' },
  jiyu: { label: "Jiyu no Tsubasa (jiyu)", family: '"JiyunoTsubasa", Impact, sans-serif', preview: '"JiyunoTsubasa", Impact, sans-serif' },
  shippori: { label: "Shippori Mincho (serif)", family: '"Shippori Mincho", Georgia, serif', preview: '"Shippori Mincho", Georgia, serif' },
  bruno: { label: "Bruno Ace SC (bruno)", family: '"Bruno Ace SC", Impact, sans-serif', preview: '"Bruno Ace SC", Impact, sans-serif' },
  castoro: { label: "Castoro Titling (castoro)", family: '"Castoro Titling", Georgia, serif', preview: '"Castoro Titling", Georgia, serif' },
  poltawski: { label: "Poltawski Nowy (poltawski)", family: '"Poltawski Nowy", Georgia, serif', preview: '"Poltawski Nowy", Georgia, serif' },
  vina: { label: "Vina Sans (vina)", family: '"Vina Sans", Impact, sans-serif', preview: '"Vina Sans", Impact, sans-serif' },
  exo2: { label: "Exo 2 (exo2)", family: '"Exo 2", Arial, sans-serif', preview: '"Exo 2", Arial, sans-serif' },
  inconsolata: { label: "Inconsolata (inconsolata)", family: 'Inconsolata, Consolas, monospace', preview: 'Inconsolata, Consolas, monospace' },
  script: { label: "Dancing Script (script)", family: '"Dancing Script", "Segoe Script", cursive', preview: '"Dancing Script", cursive' },
    sans: { label: "Sans", family: null, preview: '"Noto Sans", "Segoe UI", sans-serif' },
  serif: { label: "Serif", family: 'Georgia, "Times New Roman", "Noto Serif Tibetan", serif', preview: "Georgia, 'Times New Roman', serif" },
  mono: { label: "Mono", family: '"DejaVu Sans Mono", Consolas, "Courier New", monospace', preview: 'Consolas, "Courier New", monospace' },
  display: { label: "Display (Fraktur)", family: '"UnifrakturMaguntia", Georgia, serif', preview: '"UnifrakturMaguntia", Georgia, serif' },
  arial: { label: "Arial", family: 'Arial, Helvetica, "DejaVu Sans", sans-serif', preview: "Arial, Helvetica, sans-serif" },
  verdana: { label: "Verdana", family: 'Verdana, Geneva, "DejaVu Sans", sans-serif', preview: "Verdana, Geneva, sans-serif" },
  trebuchet: { label: "Trebuchet", family: '"Trebuchet MS", "Segoe UI", "DejaVu Sans", sans-serif', preview: '"Trebuchet MS", "Segoe UI", sans-serif' },
  tahoma: { label: "Tahoma", family: 'Tahoma, "Segoe UI", "DejaVu Sans", sans-serif', preview: 'Tahoma, "Segoe UI", sans-serif' },
  helvetica: { label: "Helvetica", family: 'Helvetica, Arial, "Liberation Sans", sans-serif', preview: "Helvetica, Arial, sans-serif" },
  roboto: { label: "Roboto", family: '"Roboto", Arial, "DejaVu Sans", sans-serif', preview: '"Roboto", Arial, sans-serif' },
  opensans: { label: "Open Sans", family: '"Open Sans", Arial, "DejaVu Sans", sans-serif', preview: '"Open Sans", Arial, sans-serif' },
  lato: { label: "Lato", family: '"Lato", Arial, "DejaVu Sans", sans-serif', preview: '"Lato", Arial, sans-serif' },
  montserrat: { label: "Montserrat", family: '"Montserrat", Arial, "DejaVu Sans", sans-serif', preview: '"Montserrat", Arial, sans-serif' },
  poppins: { label: "Poppins", family: '"Poppins", Arial, "DejaVu Sans", sans-serif', preview: '"Poppins", Arial, sans-serif' },
  nunito: { label: "Nunito", family: '"Nunito", Arial, "DejaVu Sans", sans-serif', preview: '"Nunito", Arial, sans-serif' },
  rubik: { label: "Rubik", family: '"Rubik", Arial, "DejaVu Sans", sans-serif', preview: '"Rubik", Arial, sans-serif' },
  ubuntu: { label: "Ubuntu", family: '"Ubuntu", "DejaVu Sans", Arial, sans-serif', preview: '"Ubuntu", Arial, sans-serif' },
  inter: { label: "Inter", family: '"Inter", Arial, "DejaVu Sans", sans-serif', preview: '"Inter", Arial, sans-serif' },
  georgia: { label: "Georgia", family: 'Georgia, "Times New Roman", serif', preview: "Georgia, serif" },
  times: { label: "Times", family: '"Times New Roman", Times, "Liberation Serif", serif', preview: '"Times New Roman", Times, serif' },
  playfair: { label: "Playfair", family: '"Playfair Display", Georgia, "Times New Roman", serif', preview: '"Playfair Display", Georgia, serif' },
  merriweather: { label: "Merriweather", family: '"Merriweather", Georgia, "Liberation Serif", serif', preview: '"Merriweather", Georgia, serif' },
  crimson: { label: "Crimson Text", family: '"Crimson Text", Georgia, serif', preview: '"Crimson Text", Georgia, serif' },
  libre: { label: "Libre Baskerville", family: '"Libre Baskerville", Georgia, serif', preview: '"Libre Baskerville", Georgia, serif' },
  courier: { label: "Courier", family: '"Courier New", Courier, "DejaVu Sans Mono", monospace', preview: '"Courier New", Courier, monospace' },
  sourcecode: { label: "Source Code", family: '"Source Code Pro", Consolas, "DejaVu Sans Mono", monospace', preview: '"Source Code Pro", Consolas, monospace' },
  impact: { label: "Impact", family: 'Impact, Haettenschweiler, "Arial Black", sans-serif', preview: 'Impact, Haettenschweiler, sans-serif' },
  oswald: { label: "Oswald", family: '"Oswald", Impact, "Arial Narrow", sans-serif', preview: '"Oswald", Impact, sans-serif' },
  bebas: { label: "Bebas Neue", family: '"Bebas Neue", Impact, "Arial Narrow", sans-serif', preview: '"Bebas Neue", Impact, sans-serif' },
  anton: { label: "Anton", family: '"Anton", Impact, "Arial Black", sans-serif', preview: '"Anton", Impact, sans-serif' },
  comic: { label: "Comic", family: '"Comic Sans MS", "Comic Sans", cursive', preview: '"Comic Sans MS", "Comic Sans", cursive' },
  pacifico: { label: "Pacifico", family: '"Pacifico", "Comic Sans MS", cursive', preview: '"Pacifico", cursive' },
  dancing: { label: "Dancing Script", family: '"Dancing Script", "Segoe Script", cursive', preview: '"Dancing Script", cursive' },
  greatvibes: { label: "Great Vibes", family: '"Great Vibes", "Segoe Script", cursive', preview: '"Great Vibes", cursive' },
});

const FONT_KEYS = new Set(Object.keys(FONT_CATALOG));
const ORIENTATIONS = new Set(["horizontal", "vertical"]);
const AVATAR_MODES = new Set(["static", "dynamic"]);
const DEFAULT_FOOTER = "discord.gg/viniliecaffe";
const DEFAULT_FADE_DEPTH = 22;
const DEFAULT_FADE_OPACITY = 100;

function clampPct(raw?, fallback?) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clampAngle(raw?, fallback?) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return ((Math.round(n) % 360) + 360) % 360;
}

function normalizeGradTo(raw?) {
  if (raw === null || raw === undefined || raw === "" || raw === false || raw === "none") return null;
  return normalizeHexColor(raw);
}

function defaultQuoteStyle() {
  return {
    bg: "black",
    bgColor: null,
    fgColor: null,
    bgGradTo: null,
    bgGradAngle: 135,
    fgGradTo: null,
    fgGradAngle: 90,
    font: "sans",
    bold: true,
    flip: false,
    orientation: "horizontal",
    avatarMode: "dynamic",
    footer: DEFAULT_FOOTER,
    fadeDepth: DEFAULT_FADE_DEPTH,
    fadeOpacity: DEFAULT_FADE_OPACITY,
  };
}

function normalizeHexColor(raw?) {
  const s = String(raw || "").trim();
  const m = s.match(/^#?([0-9a-f]{6})$/i);
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
}

function hexToRgb(hex?) {
  const h = normalizeHexColor(hex);
  if (!h) return null;
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

function relativeLuminance(hex?) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const lin = [rgb.r, rgb.g, rgb.b].map((c?) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

function colorsFromCustomHex(hex?) {
  const bg = normalizeHexColor(hex) || "#070707";
  const light = relativeLuminance(bg) > 0.55;
  return {
    bg,
    fg: light ? "#111111" : "#ffffff",
    muted: light ? "rgba(17,17,17,0.62)" : "rgba(255,255,255,0.7)",
    key: "custom",
    light,
  };
}

function mutedFromFgHex(hex?) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "rgba(255,255,255,0.7)";
  return `rgba(${rgb.r},${rgb.g},${rgb.b},0.68)`;
}

function applyFgOverride(base?, fgColor?) {
  const fg = normalizeHexColor(fgColor);
  if (!fg) return base;
  return {
    ...base,
    fg,
    muted: mutedFromFgHex(fg),
  };
}

function normalizeFooterText(raw?, { allowEmpty = true } = {}) {
  if (raw === null || raw === undefined) return DEFAULT_FOOTER;
  const text = String(raw).trim().slice(0, 64);
  if (!text) return allowEmpty ? "" : DEFAULT_FOOTER;
  return text;
}

function normalizeQuoteStyle(raw?) {
  const base = defaultQuoteStyle();
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const bgRaw = String(src.bg || src.background || "").trim().toLowerCase();
  const font = String(src.font || src.f || "").trim().toLowerCase();
  const orientation = String(src.orientation || src.o || "")
    .trim()
    .toLowerCase();
  const orient =
    orientation === "v" || orientation === "vertical"
      ? "vertical"
      : orientation === "h" || orientation === "horizontal"
        ? "horizontal"
        : base.orientation;

  let bold = base.bold;
  if (Object.prototype.hasOwnProperty.call(src, "bold")) {
    bold = src.bold !== false && src.bold !== 0 && src.bold !== "0" && src.bold !== "false";
  } else if (Object.prototype.hasOwnProperty.call(src, "b")) {
    bold = src.b !== false && src.b !== 0 && src.b !== "0" && src.b !== "false";
  }

  let flip = base.flip;
  if (Object.prototype.hasOwnProperty.call(src, "flip")) {
    flip = src.flip === true || src.flip === 1 || src.flip === "1" || src.flip === "true";
  } else if (Object.prototype.hasOwnProperty.call(src, "fl")) {
    flip = src.fl === true || src.fl === 1 || src.fl === "1" || src.fl === "true";
  }

  const avatarPresent =
    Object.prototype.hasOwnProperty.call(src, "avatarMode") ||
    Object.prototype.hasOwnProperty.call(src, "av");
  let avatarMode = base.avatarMode;
  if (avatarPresent) {
    const avatarRaw = String(src.avatarMode ?? src.av ?? "")
      .trim()
      .toLowerCase();
    if (
      avatarRaw === "s" ||
      avatarRaw === "static" ||
      avatarRaw === "png" ||
      avatarRaw === "0" ||
      avatarRaw === "false"
    ) {
      avatarMode = "static";
    } else if (
      avatarRaw === "d" ||
      avatarRaw === "dynamic" ||
      avatarRaw === "gif" ||
      avatarRaw === "animated" ||
      avatarRaw === "1" ||
      avatarRaw === "true" ||
      avatarRaw === ""
    ) {
            avatarMode = "dynamic";
    } else {
      avatarMode = "dynamic";
    }
  }

  const customHex = normalizeHexColor(src.bgColor || src.c || src.color);
  let bg = base.bg;
  let bgColor = null;
  if (bgRaw === "custom" || (customHex && bgRaw === "custom")) {
    bg = "custom";
    bgColor = customHex || "#070707";
  } else if (Object.prototype.hasOwnProperty.call(BG_PRESETS, bgRaw)) {
    bg = bgRaw;
  } else if (customHex && !bgRaw) {
    bg = "custom";
    bgColor = customHex;
  }

  const footerPresent =
    Object.prototype.hasOwnProperty.call(src, "footer") ||
    Object.prototype.hasOwnProperty.call(src, "ft");
  const footer = footerPresent
    ? normalizeFooterText(src.footer ?? src.ft, { allowEmpty: true })
    : base.footer;

  const fadeDepthPresent =
    Object.prototype.hasOwnProperty.call(src, "fadeDepth") ||
    Object.prototype.hasOwnProperty.call(src, "fd");
  const fadeOpacityPresent =
    Object.prototype.hasOwnProperty.call(src, "fadeOpacity") ||
    Object.prototype.hasOwnProperty.call(src, "fo");
  const fadeDepth = fadeDepthPresent
    ? clampPct(src.fadeDepth ?? src.fd, base.fadeDepth)
    : base.fadeDepth;
  const fadeOpacity = fadeOpacityPresent
    ? clampPct(src.fadeOpacity ?? src.fo, base.fadeOpacity)
    : base.fadeOpacity;

  const fgPresent =
    Object.prototype.hasOwnProperty.call(src, "fgColor") ||
    Object.prototype.hasOwnProperty.call(src, "tc") ||
    Object.prototype.hasOwnProperty.call(src, "fg") ||
    Object.prototype.hasOwnProperty.call(src, "textColor");
  let fgColor = null;
  if (fgPresent) {
    const rawFg = src.fgColor ?? src.tc ?? src.fg ?? src.textColor;
    if (rawFg === null || rawFg === "" || rawFg === "auto" || rawFg === false) {
      fgColor = null;
    } else {
      fgColor = normalizeHexColor(rawFg);
    }
  }

  const bgGradPresent =
    Object.prototype.hasOwnProperty.call(src, "bgGradTo") ||
    Object.prototype.hasOwnProperty.call(src, "bg2");
  const fgGradPresent =
    Object.prototype.hasOwnProperty.call(src, "fgGradTo") ||
    Object.prototype.hasOwnProperty.call(src, "fg2");
  const bgGradTo = bgGradPresent
    ? normalizeGradTo(src.bgGradTo ?? src.bg2)
    : base.bgGradTo;
  const fgGradTo = fgGradPresent
    ? normalizeGradTo(src.fgGradTo ?? src.fg2)
    : base.fgGradTo;
  const bgGradAngle = Object.prototype.hasOwnProperty.call(src, "bgGradAngle") ||
    Object.prototype.hasOwnProperty.call(src, "bga")
    ? clampAngle(src.bgGradAngle ?? src.bga, base.bgGradAngle)
    : base.bgGradAngle;
  const fgGradAngle = Object.prototype.hasOwnProperty.call(src, "fgGradAngle") ||
    Object.prototype.hasOwnProperty.call(src, "fga")
    ? clampAngle(src.fgGradAngle ?? src.fga, base.fgGradAngle)
    : base.fgGradAngle;

  return {
    bg,
    bgColor: bg === "custom" ? bgColor || "#070707" : null,
    fgColor,
    bgGradTo,
    bgGradAngle,
    fgGradTo,
    fgGradAngle,
    font: FONT_KEYS.has(font) ? font : base.font,
    bold,
    flip,
    orientation: ORIENTATIONS.has(orient) ? orient : base.orientation,
    avatarMode: AVATAR_MODES.has(avatarMode) ? avatarMode : base.avatarMode,
    footer,
    fadeDepth,
    fadeOpacity,
  };
}

function encodeQuoteStyleCompact(style?) {
  const s = normalizeQuoteStyle(style);
  const out: Record<string, any> = {};
  if (s.bg === "custom" && s.bgColor) {
    out.bg = "custom";
    out.c = s.bgColor;
  } else if (s.bg !== "black") {
    out.bg = s.bg;
  }
  if (s.font !== "sans") out.f = s.font;
  if (s.bold !== true) out.b = false;
  if (s.flip) out.fl = true;
  if (s.orientation !== "horizontal") out.o = "v";
  if (s.avatarMode === "static") out.av = "s";
  if (s.footer !== DEFAULT_FOOTER) out.ft = s.footer;
  if (s.fadeDepth !== DEFAULT_FADE_DEPTH) out.fd = s.fadeDepth;
  if (s.fadeOpacity !== DEFAULT_FADE_OPACITY) out.fo = s.fadeOpacity;
  if (s.fgColor) out.tc = s.fgColor;
  if (s.bgGradTo) {
    out.bg2 = s.bgGradTo;
    if (s.bgGradAngle !== 135) out.bga = s.bgGradAngle;
  }
  if (s.fgGradTo) {
    out.fg2 = s.fgGradTo;
    if (s.fgGradAngle !== 90) out.fga = s.fgGradAngle;
  }
  return out;
}

function decodeQuoteStyleCompact(raw?) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultQuoteStyle();
  return normalizeQuoteStyle({
    bg: raw.bg,
    bgColor: raw.c ?? raw.bgColor,
    fgColor: Object.prototype.hasOwnProperty.call(raw, "tc")
      ? raw.tc
      : Object.prototype.hasOwnProperty.call(raw, "fgColor")
        ? raw.fgColor
        : undefined,
    bgGradTo: Object.prototype.hasOwnProperty.call(raw, "bg2") ? raw.bg2 : raw.bgGradTo,
    bgGradAngle: Object.prototype.hasOwnProperty.call(raw, "bga") ? raw.bga : raw.bgGradAngle,
    fgGradTo: Object.prototype.hasOwnProperty.call(raw, "fg2") ? raw.fg2 : raw.fgGradTo,
    fgGradAngle: Object.prototype.hasOwnProperty.call(raw, "fga") ? raw.fga : raw.fgGradAngle,
    font: raw.f ?? raw.font,
    bold: Object.prototype.hasOwnProperty.call(raw, "b") ? raw.b : raw.bold,
    flip: Object.prototype.hasOwnProperty.call(raw, "fl") ? raw.fl : raw.flip,
    orientation: raw.o === "v" ? "vertical" : raw.o === "h" ? "horizontal" : raw.orientation,
    avatarMode: raw.av === "s" ? "static" : raw.av === "d" ? "dynamic" : raw.avatarMode,
    footer: Object.prototype.hasOwnProperty.call(raw, "ft") ? raw.ft : raw.footer,
    fadeDepth: Object.prototype.hasOwnProperty.call(raw, "fd") ? raw.fd : raw.fadeDepth,
    fadeOpacity: Object.prototype.hasOwnProperty.call(raw, "fo") ? raw.fo : raw.fadeOpacity,
  });
}

function resolveQuoteStyleColors(style?) {
  const s = normalizeQuoteStyle(style);
  const base =
    s.bg === "custom"
      ? colorsFromCustomHex(s.bgColor)
      : { ...BG_PRESETS[s.bg], key: s.bg, light: s.bg === "white" || s.bg === "cream" };
  const withFg = applyFgOverride(base, s.fgColor);
  return {
    ...withFg,
    bgGradTo: s.bgGradTo,
    bgGradAngle: s.bgGradAngle,
    fgGradTo: s.fgGradTo,
    fgGradAngle: s.fgGradAngle,
  };
}

function createQuoteLinearGradient(ctx?, x?, y?, w?, h?, angleDeg?, from?, to?) {
  const fromHex = normalizeHexColor(from) || "#070707";
  const toHex = normalizeHexColor(to);
  if (!toHex || toHex === fromHex) return fromHex;
  const angle = ((Number(angleDeg) || 0) % 360 + 360) % 360;
    const radians = ((angle - 90) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
    const length = Math.abs(w * cos) + Math.abs(h * sin);
  const half = Math.max(1, length / 2);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const g = ctx.createLinearGradient(
    cx - cos * half,
    cy - sin * half,
    cx + cos * half,
    cy + sin * half,
  );
  g.addColorStop(0, fromHex);
  g.addColorStop(1, toHex);
  return g;
}

function resolveQuoteStyleFontFamily(style?) {
  const s = normalizeQuoteStyle(style);
  const entry = FONT_CATALOG[s.font];
  return entry?.family || null;
}

function resolveQuoteFontCss(style?, size?, weight?) {
  const family = resolveQuoteStyleFontFamily(style);
  if (!family) return null;
  const prefix = weight ? `${weight} ` : "";
  return `${prefix}${size}px ${family}`;
}

function resolveQuoteCanvasSize(style?) {
  const s = normalizeQuoteStyle(style);
  if (s.orientation === "vertical") {
    return { width: 768, height: 1280, coverSize: 768, vertical: true };
  }
  return { width: 1024, height: 512, coverSize: 512, vertical: false };
}

function resolveQuoteFooterText(style?) {
  return normalizeQuoteStyle(style).footer;
}

function resolveQuoteFadeParams(style?, coverSize?) {
  const s = normalizeQuoteStyle(style);
  const size = Math.max(1, Number(coverSize) || 512);
  const intoCover = Math.round((size * s.fadeDepth) / 100);
    const intoText = 0;
  const opacity = s.fadeOpacity / 100;
  return {
    fadeDepth: s.fadeDepth,
    fadeOpacity: s.fadeOpacity,
    intoCover,
    intoText,
    opacity,
    shadeAlpha: 0.22 * opacity,
  };
}

function colorWithAlpha(hex?, alpha?) {
  const a = Math.max(0, Math.min(1, Number(alpha) || 0));
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0,0,0,${a})`;
  if (a >= 0.999) return normalizeHexColor(hex) || "#070707";
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

function lerpHexColor(a?, b?, t?) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  if (!A || !B) return normalizeHexColor(a) || normalizeHexColor(b) || "#070707";
  const u = Math.max(0, Math.min(1, Number(t) || 0));
  const mix = (x?, y?) => Math.round(x + (y - x) * u);
  const to = (n?) => n.toString(16).padStart(2, "0");
  return `#${to(mix(A.r, B.r))}${to(mix(A.g, B.g))}${to(mix(A.b, B.b))}`;
}

function sampleQuoteBgColorAt(colors?, width?, height?, x?, y?) {
  const bg = normalizeHexColor(colors?.bg) || "#070707";
  const to = normalizeHexColor(colors?.bgGradTo);
  if (!to || to === bg) return bg;
  const w = Math.max(1, Number(width) || 1);
  const h = Math.max(1, Number(height) || 1);
  const angle = ((Number(colors?.bgGradAngle) || 0) % 360 + 360) % 360;
  const radians = ((angle - 90) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const length = Math.abs(w * cos) + Math.abs(h * sin);
  const half = Math.max(1, length / 2);
  const cx = w / 2;
  const cy = h / 2;
    const proj = ((Number(x) - cx) * cos + (Number(y) - cy) * sin) / (2 * half) + 0.5;
  return lerpHexColor(bg, to, Math.max(0, Math.min(1, proj)));
}

function resolveQuoteFadeEdgeColor(colors?, layout?) {
  const cover = layout?.coverRect;
  const w = Math.max(1, Number(layout?.width) || 1);
  const h = Math.max(1, Number(layout?.height) || 1);
  if (!cover) {
    return sampleQuoteBgColorAt(colors, w, h, w * 0.5, h * 0.5);
  }
  const vertical = layout?.vertical === true;
  const flip = layout?.flip === true;
  let sx;
  let sy;
  if (vertical) {
    sx = cover.x + cover.w / 2;
    sy = flip ? cover.y : cover.y + cover.h;
  } else {
    sx = flip ? cover.x : cover.x + cover.w;
    sy = cover.y + cover.h / 2;
  }
  return sampleQuoteBgColorAt(colors, w, h, sx, sy);
}

export = {
  defaultQuoteStyle,
  normalizeQuoteStyle,
  normalizeHexColor,
  encodeQuoteStyleCompact,
  decodeQuoteStyleCompact,
  resolveQuoteStyleColors,
  resolveQuoteFontCss,
  resolveQuoteCanvasSize,
  resolveQuoteFooterText,
  resolveQuoteFadeParams,
  colorWithAlpha,
  hexToRgb,
  lerpHexColor,
  resolveQuoteFadeEdgeColor,
  createQuoteLinearGradient,
};
