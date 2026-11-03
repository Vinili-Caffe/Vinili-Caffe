const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildVcRichFromClassicFields } = require("../../../../shared/embeds/vcPageEmbedV2") as typeof import("../../../../shared/embeds/vcPageEmbedV2");
const {
  DEFAULT_TICKET_WELCOME_COLOR,
  getDefaultWelcomeDescription,
} = require("./ticketUiDefaults") as typeof import("./ticketUiDefaults");
const { DEFAULT_LANGUAGE } = require("../../../Partner/i18n/tenantPartnershipI18n/languages") as typeof import("../../../Partner/i18n/tenantPartnershipI18n/languages");

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MENTION_TOKENS = new Set(["everyone", "here", "opener"]);

function asBool(value?, fallback?) {
  if (value === true || value === 1 || value === "1" || value === "true") return true;
  if (value === false || value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function asInt(value?, fallback?, min = 0, max = 1_000_000) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function normalizeId(value?) {
  const id = String(value || "").trim();
  return id && /^\d{16,22}$/.test(id) ? id : null;
}

function normalizeEmbedColor(value?, fallback = DEFAULT_TICKET_WELCOME_COLOR) {
  const raw = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function normalizeUrl(value?) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw.slice(0, 512);
}

function normalizeIdList(raw?, max = 25) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const id = normalizeId(item);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

function normalizeMentionOnOpen(raw?) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  const seen = new Set();
  for (const item of src) {
    const token = String(item || "").trim().toLowerCase();
    if (!token) continue;
    let value = null;
    if (MENTION_TOKENS.has(token)) value = token;
    else if (token === "ticket opener" || token === "ticket_opener") value = "opener";
    else value = normalizeId(token);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= 15) break;
  }
  return out;
}

function normalizeAccessRules(raw?) {
  const src = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const row of src) {
    if (!row || typeof row !== "object") continue;
    const roleRaw = String(row.roleId || row.id || "").trim().toLowerCase();
    let roleId = null;
    if (roleRaw === "everyone" || roleRaw === "@everyone") roleId = "everyone";
    else roleId = normalizeId(roleRaw);
    if (!roleId) continue;
    out.push({ roleId, allow: asBool(row.allow, true) });
    if (out.length >= 25) break;
  }
  if (!out.length) out.push({ roleId: "everyone", allow: true });
  return out;
}

function normalizeTicketPermsOverride(raw?) {
  if (raw == null) return null;
  const src = raw && typeof raw === "object" ? raw : {};
  const replace = src.replace === true || src.__replace === true;
  return {
    replace,
    addReactions: asBool(src.addReactions ?? src.ar, false),
    sendTtsMessages: asBool(src.sendTtsMessages ?? src.tts, false),
    embedLinks: asBool(src.embedLinks ?? src.el, false),
    attachFiles: asBool(src.attachFiles ?? src.af, false),
    useExternalEmojis: asBool(src.useExternalEmojis ?? src.uee, false),
    useExternalStickers: asBool(src.useExternalStickers ?? src.ues, false),
    sendVoiceMessages: asBool(src.sendVoiceMessages ?? src.svm, false),
  };
}

function normalizeWelcomeField(raw?) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim().slice(0, 256);
  const value = String(raw.value || "").trim().slice(0, 1024);
  if (!name || !value) return null;
  return { name, value, inline: asBool(raw.inline, false) };
}

function normalizeWelcome(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const fieldsSrc = Array.isArray(src.fields) ? src.fields : Array.isArray(base.fields) ? base.fields : [];
  const fields = fieldsSrc.map(normalizeWelcomeField).filter(Boolean).slice(0, 25);
  return {
    color: normalizeEmbedColor(src.color ?? base.color, DEFAULT_TICKET_WELCOME_COLOR),
    title: String(src.title ?? base.title ?? "").trim().slice(0, 256),
    titleUrl: normalizeUrl(src.titleUrl ?? base.titleUrl),
    description: String(src.description ?? base.description ?? "").trim().slice(0, 4096),
    authorName: String(src.authorName ?? base.authorName ?? "").trim().slice(0, 256) || null,
    authorIconUrl: normalizeUrl(src.authorIconUrl ?? base.authorIconUrl),
    authorUrl: normalizeUrl(src.authorUrl ?? base.authorUrl),
    largeImageUrl: normalizeUrl(src.largeImageUrl ?? base.largeImageUrl),
    smallImageUrl: normalizeUrl(src.smallImageUrl ?? base.smallImageUrl),
    footerText: String(src.footerText ?? base.footerText ?? "").trim().slice(0, 2048) || null,
    footerIconUrl: normalizeUrl(src.footerIconUrl ?? base.footerIconUrl),
    footerTimestamp: asBool(src.footerTimestamp ?? base.footerTimestamp, false),
    fields,
  };
}

function isWelcomeEmpty(welcome?) {
  if (!welcome || typeof welcome !== "object") return true;
  return !(
    welcome.title ||
    welcome.description ||
    welcome.authorName ||
    welcome.largeImageUrl ||
    welcome.smallImageUrl ||
    welcome.footerText ||
    (Array.isArray(welcome.fields) && welcome.fields.length)
  );
}

function defaultWelcomeForTicketType(ticketType?, lang = DEFAULT_LANGUAGE) {
  const description = getDefaultWelcomeDescription(lang);
  try {
    const { getTicketWelcomeContent } = require("./ticketPanelConfig") as typeof import("./ticketPanelConfig");
    const content = getTicketWelcomeContent(ticketType, lang);
    if (content) {
      return normalizeWelcome({
        color: content.color || DEFAULT_TICKET_WELCOME_COLOR,
        title: content.title || "",
        description: content.description || description,
      });
    }
  } catch (_) {}
  return normalizeWelcome({
    color: DEFAULT_TICKET_WELCOME_COLOR,
    description,
  });
}

function normalizeDayHours(raw?) {
  if (!raw || typeof raw !== "object") {
    return { enabled: false, allDay: true, start: "09:00", end: "17:00" };
  }
  return {
    enabled: asBool(raw.enabled, false),
    allDay: asBool(raw.allDay, true),
    start: String(raw.start || "09:00").trim().slice(0, 5) || "09:00",
    end: String(raw.end || "17:00").trim().slice(0, 5) || "17:00",
  };
}

function normalizeSupportHours(raw?, fallback: Record<string, any> = {}) {
  const src = raw && typeof raw === "object" ? raw : {};
  const base = fallback && typeof fallback === "object" ? fallback : {};
  const daysSrc = src.days && typeof src.days === "object" ? src.days : base.days || {};
  const days: Record<string, any> = {};
  for (const day of DAYS) {
    days[day] = normalizeDayHours(daysSrc[day]);
  }
  return {
    timezone: String(src.timezone ?? base.timezone ?? "Europe/Rome").trim().slice(0, 64) || "Europe/Rome",
    days,
  };
}

function supportHoursAreUnrestricted(hours?) {
  if (!hours || typeof hours !== "object") return true;
  const days = hours.days || {};
  return !DAYS.some((d?) => days[d]?.enabled === true);
}

function supportHoursLabel(hours?) {
  if (supportHoursAreUnrestricted(hours)) return "24/7";
  const enabled = DAYS.filter((d?) => hours?.days?.[d]?.enabled);
  if (!enabled.length) return "24/7";
  if (enabled.length === 7 && enabled.every((d?) => hours.days[d].allDay)) return "24/7";
  return `${enabled.length}g`;
}

function panelOpenCustomId(panelId?) {
  const id = String(panelId || "").trim();
  return id ? `tkp:${id}` : null;
}

export = {
  normalizeMentionOnOpen,
  normalizeIdList,
  normalizeAccessRules,
  normalizeTicketPermsOverride,
  normalizeWelcome,
  isWelcomeEmpty,
  defaultWelcomeForTicketType,
  normalizeSupportHours,
  supportHoursLabel,
  panelOpenCustomId,
  asBool,
  asInt,
  normalizeId,
};
