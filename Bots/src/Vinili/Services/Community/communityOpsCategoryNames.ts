/** Community ops: formattazione nomi categoria (apici, pad, skip tickets). */
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const MAIN_GUILD_ID = IDs.guilds.main;
const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", };
const INDEX_PREFIX_RE = /^[⁰¹²³⁴⁵⁶⁷⁸⁹]+/;
const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;

function isCategoryNumberingGuild(guildId?) {
  const mainId = String(MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  return Boolean(mainId) && String(guildId || "").trim() === mainId;
}

function getCategorySettings(client?) {
  const cfg = client?.config?.categoryNumbering || {};
  const channelCategoryIds = Array.isArray(cfg.channelCategoryIds)
    ? cfg.channelCategoryIds.map((id?) => String(id || "").trim()).filter(Boolean)
    : [];
  const fallbackCategoryId = String(IDs.categories?.categoryPublics || "").trim();
  const invisibleSpaceRaw = typeof cfg.invisibleSpace === "string" ? cfg.invisibleSpace : "\u3000";
  const invisibleSpace = invisibleSpaceRaw || "\u3000";
  return {
    enabled: cfg.enabled !== false,
    debounceMs: Math.max(300, Number(cfg.debounceMs || 1200)),
    intervalMs: Math.max(60 * 1000, Number(cfg.intervalMs || 10 * 60 * 1000)),
    minDigits: Math.max(1, Number(cfg.minDigits || 2)),
    separator: typeof cfg.separator === "string" ? cfg.separator : " ",
    /* categoryCenterPad3: pad minimo — evita text-overflow "..." di Discord in sidebar */
    centerWithInvisibleSpaces: cfg.centerWithInvisibleSpaces !== false,
    centerInnerSlots: Math.max(4, Math.min(20, Number(cfg.centerInnerSlots || 9))),
    centerSidePad: Math.max(0, Math.min(4, Number(cfg.centerSidePad ?? 1))),
    invisibleSpace,
    channelCategoryIds: channelCategoryIds.length
      ? channelCategoryIds
      : fallbackCategoryId
        ? [fallbackCategoryId]
        : [],
  };
}

function toSuperscriptNumber(value?, minDigits?) {
  const normalized = Math.max(1, Number(value) || 1).toString().padStart(minDigits, "0");
  return normalized
    .split("")
    .map((digit?) => SUPERSCRIPT_MAP[digit] || digit)
    .join("");
}

function replaceNumberPrefixOnly(name?, nextNumber?, separator?) {
  const value = String(name || "");
  if (INDEX_PREFIX_RE.test(value)) {
    return value.replace(INDEX_PREFIX_RE, nextNumber);
  }
  return `${nextNumber}${separator}${value}`;
}

/* categoryCenterPad3: ideographic pad corto; frame = label più lunga → niente "..." Discord */
const CATEGORY_DOT = "・";
const CATEGORY_INVISIBLE_CHARS_RE = /[\u3000\u3164\u2800\u115F\u1160\u200B\u200C\u200D\uFEFF]/g;

function extractCoreCategoryLabel(name?) {
  let s = String(name || "");
  s = s.replace(INDEX_PREFIX_RE, "");
  s = s.replace(CATEGORY_INVISIBLE_CHARS_RE, " ");
  s = s.replace(/^[・·•‧.\s]+/, "").replace(/[・·•‧.\s]+$/, "");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function buildCenteredCategoryBody(label?, options: Record<string, any> = {}) {
  const core = extractCoreCategoryLabel(label) || String(label || "").trim() || "CATEGORY";
  const padChar = String(options.invisibleSpace || "\u3000").slice(0, 1) || "\u3000";
  const sidePad = Math.max(0, Math.min(4, Number(options.centerSidePad ?? 1)));
  const minFrame = Math.max(4, Math.min(20, Number(options.centerInnerSlots) || 9));
  const coreLen = Array.from(core).length;
  const frameWidth = Math.max(coreLen, Number(options.centerFrameWidth) || minFrame);
  /* pad corto: stesso frame, niente overflow "..." in channel list */
  const extra = Math.max(0, frameWidth - coreLen);
  const left = sidePad + Math.floor(extra / 2);
  const right = sidePad + (extra - Math.floor(extra / 2));
  return `${CATEGORY_DOT}${padChar.repeat(left)}${core}${padChar.repeat(right)}${CATEGORY_DOT}`;
}

function buildNumberedCenteredCategoryName(nextNumber?, currentName?, options: Record<string, any> = {}) {
  const core = extractCoreCategoryLabel(currentName);
  if (!core) {
    return replaceNumberPrefixOnly(currentName, nextNumber, options.separator || " ");
  }
  return `${nextNumber}${buildCenteredCategoryBody(core, options)}`.slice(0, 100);
}

function isTicketsCategoryName(name?) {
  return String(name || "")
    .toLowerCase()
    .includes("tickets");
}

function ticketsCategoryCoreLabel(name?) {
  return String(name || "")
    .replace(INDEX_PREFIX_RE, "")
    .replace(/\s*[•·]\s*\d+\s*$/, "")
    .replace(/[・·]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolveRestoredTicketsCategoryName(name?) {
  const {
    TICKETS_CATEGORY_NAME,
    TICKETS_OVERFLOW_SEPARATOR,
  } = require("../../MultiGuild/tickets/discord/ticketCategoryUtils") as typeof import("../../MultiGuild/tickets/discord/ticketCategoryUtils");
  const raw = String(name || "");
  if (!isTicketsCategoryName(raw)) return null;
  if (ticketsCategoryCoreLabel(raw) !== "tickets") return null;

  if (raw === TICKETS_CATEGORY_NAME) return null;
  if (raw.startsWith(`${TICKETS_CATEGORY_NAME}${TICKETS_OVERFLOW_SEPARATOR}`)) return null;

  const overflowTail = raw.match(/[•·]\s*(\d+)\s*$/);
  const overflowIdx = overflowTail ? Number(overflowTail[1]) : NaN;
  if (Number.isFinite(overflowIdx) && overflowIdx >= 2) {
    return `${TICKETS_CATEGORY_NAME}${TICKETS_OVERFLOW_SEPARATOR}${overflowIdx}`;
  }
  return TICKETS_CATEGORY_NAME;
}

function shouldSkipCategoryNumbering(category?) {
  if (!category) return true;
    if (isTicketsCategoryName(category.name)) return true;
  return false;
}

export = {
  INDEX_PREFIX_RE,
  INDEX_SUFFIX_RE,
  isCategoryNumberingGuild,
  getCategorySettings,
  toSuperscriptNumber,
  replaceNumberPrefixOnly,
  extractCoreCategoryLabel,
  buildNumberedCenteredCategoryName,
  shouldSkipCategoryNumbering,
  resolveRestoredTicketsCategoryName,
};
