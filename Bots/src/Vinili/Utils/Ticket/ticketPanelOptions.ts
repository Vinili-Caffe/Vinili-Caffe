const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildVcRichFromClassicFields } = require("../Embeds/vcPageEmbedV2") as typeof import("../Embeds/vcPageEmbedV2");
const {
  DEFAULT_TICKET_WELCOME_COLOR,
  getDefaultWelcomeDescription,
  isDefaultWelcomeDescription,
  wrapMentionsInSpoiler,
} = require("./ticketUiDefaults") as typeof import("./ticketUiDefaults");
const { DEFAULT_LANGUAGE } = require("../../MultiGuild/utils/Partner/tenantPartnershipI18n/languages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipI18n/languages");

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LABELS = {
  sunday: "Domenica",
  monday: "Lunedì",
  tuesday: "Martedì",
  wednesday: "Mercoledì",
  thursday: "Giovedì",
  friday: "Venerdì",
  saturday: "Sabato",
};

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

function embedBuilderToWelcome(embed?) {
  if (!embed) return null;
  const data =
    typeof embed.toJSON === "function"
      ? embed.toJSON()
      : embed.data && typeof embed.data === "object"
        ? embed.data
        : embed;
  if (!data || typeof data !== "object") return null;
  let color = DEFAULT_TICKET_WELCOME_COLOR;
  if (data.color != null && Number.isFinite(Number(data.color))) {
    color = `#${Number(data.color).toString(16).padStart(6, "0")}`;
  }
  const fields = Array.isArray(data.fields)
    ? data.fields.map((f?) => ({
        name: f?.name,
        value: f?.value,
        inline: Boolean(f?.inline),
      }))
    : [];
  return normalizeWelcome({
    color,
    title: data.title || "",
    titleUrl: data.url || null,
    description: data.description || "",
    authorName: data.author?.name || null,
    authorIconUrl: data.author?.icon_url || data.author?.iconURL || null,
    authorUrl: data.author?.url || null,
    largeImageUrl: data.image?.url || null,
    smallImageUrl: data.thumbnail?.url || null,
    footerText: data.footer?.text || null,
    footerIconUrl: data.footer?.icon_url || data.footer?.iconURL || null,
    footerTimestamp: Boolean(data.timestamp),
    fields,
  });
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

function parseHm(value?) {
  const m = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || h > 23 || min > 59) return null;
  return h * 60 + min;
}

function getZonedParts(date?, timeZone?) {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: timeZone || "Europe/Rome",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = fmt.formatToParts(date);
    const map: Record<string, any> = {};
    for (const p of parts) map[p.type] = p.value;
    const wd = String(map.weekday || "").toLowerCase();
    const dayMap = {
      sun: "sunday",
      mon: "monday",
      tue: "tuesday",
      wed: "wednesday",
      thu: "thursday",
      fri: "friday",
      sat: "saturday",
    };
    return {
      day: dayMap[wd] || "monday",
      minutes: Number(map.hour || 0) * 60 + Number(map.minute || 0),
    };
  } catch (_) {
    const d = date instanceof Date ? date : new Date();
    return { day: DAYS[d.getUTCDay()], minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
  }
}

function isWithinSupportHours(hours?, now = new Date()) {
  if (supportHoursAreUnrestricted(hours)) return { ok: true, unrestricted: true };
  const zoned = getZonedParts(now, hours.timezone);
  const day = hours.days?.[zoned.day];
  if (!day || day.enabled !== true) {
    return { ok: false, reason: "closed_day", day: zoned.day, timezone: hours.timezone };
  }
  if (day.allDay) return { ok: true, day: zoned.day };
  const start = parseHm(day.start);
  const end = parseHm(day.end);
  if (start == null || end == null) return { ok: true, day: zoned.day };
  const mins = zoned.minutes;
  const inRange = start <= end ? mins >= start && mins < end : mins >= start || mins < end;
  return inRange
    ? { ok: true, day: zoned.day }
    : { ok: false, reason: "closed_hours", day: zoned.day, timezone: hours.timezone, start: day.start, end: day.end };
}

function memberPassesAccessRules(member?, rules?) {
  const list = Array.isArray(rules) && rules.length ? rules : [{ roleId: "everyone", allow: true }];
  const roleIds = new Set([...(member?.roles?.cache?.keys?.() || [])].map((id?) => String(id)));
  for (const rule of list) {
    const rid = String(rule.roleId || "");
    const matches = rid === "everyone" || roleIds.has(rid);
    if (!matches) continue;
    return rule.allow !== false;
  }
  return false;
}

function resolveWelcomeClassicFieldsFromPanel(welcome?, fallbackEmbed?, lang = DEFAULT_LANGUAGE, guildId = null) {
  const defaultDesc = getDefaultWelcomeDescription(lang);
  const w = welcome && typeof welcome === "object" ? welcome : null;
  const hasCustom =
    w &&
    (w.title ||
      w.description ||
      w.authorName ||
      w.largeImageUrl ||
      w.smallImageUrl ||
      w.footerText ||
      (Array.isArray(w.fields) && w.fields.length));
  if (!hasCustom) {
    const fromFallback = fallbackEmbed ? embedBuilderToWelcome(fallbackEmbed) : null;
    if (fromFallback) {
      return {
        accentColor: fromFallback.color || DEFAULT_TICKET_WELCOME_COLOR,
        title: fromFallback.title || "",
        titleUrl: fromFallback.titleUrl || "",
        description: fromFallback.description || defaultDesc,
        authorName: fromFallback.authorName || "",
        authorIconUrl: fromFallback.authorIconUrl || "",
        thumbnailUrl: fromFallback.smallImageUrl || "",
        imageUrl: fromFallback.largeImageUrl || "",
        footerText: fromFallback.footerText || "",
        footerTimestamp: fromFallback.footerTimestamp,
        fields: fromFallback.fields || [],
        guildId,
      };
    }
    return {
      accentColor: DEFAULT_TICKET_WELCOME_COLOR,
      description: defaultDesc,
      guildId,
    };
  }
  const description = isDefaultWelcomeDescription(w.description)
    ? defaultDesc
    : String(w.description || "").trim();
  return {
    accentColor: normalizeEmbedColor(w.color, DEFAULT_TICKET_WELCOME_COLOR),
    title: w.title || "",
    titleUrl: w.titleUrl || "",
    description: description || defaultDesc,
    authorName: w.authorName || "",
    authorIconUrl: w.authorIconUrl || "",
    thumbnailUrl: w.smallImageUrl || "",
    imageUrl: w.largeImageUrl || "",
    footerText: w.footerText || "",
    footerTimestamp: w.footerTimestamp,
    fields: Array.isArray(w.fields) ? w.fields.slice(0, 25) : [],
    guildId,
  };
}

function buildWelcomePayloadFromPanel(welcome?, fallbackEmbed?, lang = DEFAULT_LANGUAGE, opts: Record<string, any> = {}) {
  const guildId = opts.guildId || null;
  const fields = resolveWelcomeClassicFieldsFromPanel(welcome, fallbackEmbed, lang, guildId);
  const rows = opts.rows || [];
  return buildVcRichFromClassicFields({ ...fields, rows });
}

function buildWelcomeEmbedFromPanel(welcome?, fallbackEmbed?, lang = DEFAULT_LANGUAGE) {
  const defaultDesc = getDefaultWelcomeDescription(lang);
  const w = welcome && typeof welcome === "object" ? welcome : null;
  const hasCustom =
    w &&
    (w.title ||
      w.description ||
      w.authorName ||
      w.largeImageUrl ||
      w.smallImageUrl ||
      w.footerText ||
      (Array.isArray(w.fields) && w.fields.length));
  if (!hasCustom) {
    return new EmbedBuilder().setColor(DEFAULT_TICKET_WELCOME_COLOR).setDescription(defaultDesc);
  }
  const embed = new EmbedBuilder().setColor(
    normalizeEmbedColor(w.color, DEFAULT_TICKET_WELCOME_COLOR),
  );
  if (w.title) {
    if (w.titleUrl) embed.setTitle(w.title).setURL(w.titleUrl);
    else embed.setTitle(w.title);
  }
  const description = isDefaultWelcomeDescription(w.description)
    ? defaultDesc
    : String(w.description || "").trim();
  embed.setDescription(description || defaultDesc);
  if (w.authorName) {
    embed.setAuthor({
      name: w.authorName,
      iconURL: w.authorIconUrl || undefined,
      url: w.authorUrl || undefined,
    });
  }
  if (w.largeImageUrl) embed.setImage(w.largeImageUrl);
  if (w.smallImageUrl) embed.setThumbnail(w.smallImageUrl);
  if (w.footerText || w.footerIconUrl) {
    embed.setFooter({
      text: w.footerText || "\u200b",
      iconURL: w.footerIconUrl || undefined,
    });
  }
  if (w.footerTimestamp) embed.setTimestamp(new Date());
  if (Array.isArray(w.fields) && w.fields.length) {
    embed.addFields(
      w.fields.slice(0, 25).map((f?) => ({
        name: f.name,
        value: f.value,
        inline: Boolean(f.inline),
      })),
    );
  }
  return embed;
}

function collectDiscordMentionIds(text?) {
  const roles = [];
  const users = [];
  const raw = String(text || "");
  for (const m of raw.matchAll(/<@&(\d{16,22})>/g)) roles.push(m[1]);
  for (const m of raw.matchAll(/<@!?(\d{16,22})>/g)) {
        if (raw.includes(`<@&${m[1]}>`)) continue;
    users.push(m[1]);
  }
  return {
    roles: [...new Set(roles)],
    users: [...new Set(users)],
  };
}

function rewriteRoleNamesToMentions(text?, guild?, roleIds = []) {
  let out = String(text || "");
  const mentioned = new Set(collectDiscordMentionIds(out).roles);
  if (!out || !guild?.roles?.cache) {
    return { text: out, roleIds: [...mentioned] };
  }
  const preferred = [...new Set((roleIds || []).map(String).filter((id?) => /^\d{16,22}$/.test(id)))];
  const roles = preferred
    .map((id?) => guild.roles.cache.get(id))
    .filter(Boolean)
    .sort((a?, b?) => String(b.name || "").length - String(a.name || "").length);
  for (const role of roles) {
    const id = String(role.id);
    const mention = `<@&${id}>`;
    if (out.includes(mention)) {
      mentioned.add(id);
      continue;
    }
    const name = String(role.name || "").trim();
    if (!name) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:\\*{1,2}|_{1,2})*${escaped}(?:\\*{1,2}|_{1,2})*`, "gi");
    const next = out.replace(re, mention);
    if (next !== out) {
      out = next;
      mentioned.add(id);
    }
  }
  return { text: out, roleIds: [...mentioned] };
}

function roleIdsFromMentionOnOpen(mentionOnOpen?) {
  const list = Array.isArray(mentionOnOpen) ? mentionOnOpen : [];
  return list.map(String).filter((token?) => /^\d{16,22}$/.test(token));
}

function buildOpenMentions({ mentionOnOpen, supportRoleIds, userId, fallbackStaffRoleId }) {
  const mentions = [];
  const allowedUsers = [];
  const allowedRoles = [];
  const parse = [];
  const list = Array.isArray(mentionOnOpen) ? mentionOnOpen : [];
  for (const token of list) {
    if (token === "opener" && userId) {
      mentions.push(`<@${userId}>`);
      allowedUsers.push(String(userId));
    } else if (token === "everyone") {
      mentions.push("@everyone");
      parse.push("everyone");
    } else if (token === "here") {
      mentions.push("@here");
      parse.push("everyone");
    } else if (/^\d{16,22}$/.test(String(token))) {
      mentions.push(`<@&${token}>`);
      allowedRoles.push(String(token));
    }
  }
  for (const roleId of supportRoleIds || []) {
    const id = String(roleId || "");
    if (!/^\d{16,22}$/.test(id)) continue;
    if (!mentions.includes(`<@&${id}>`)) mentions.push(`<@&${id}>`);
    if (!allowedRoles.includes(id)) allowedRoles.push(id);
  }
  if (!mentions.length && fallbackStaffRoleId) {
    mentions.push(`<@${userId}>`, `<@&${fallbackStaffRoleId}>`);
    allowedUsers.push(String(userId));
    allowedRoles.push(String(fallbackStaffRoleId));
  }
  const joined = mentions.join(" ").trim();
  return {
    content: wrapMentionsInSpoiler(joined),
    allowedMentions: {
      parse: [...new Set(parse)],
      users: [...new Set(allowedUsers)],
      roles: [...new Set(allowedRoles)],
    },
  };
}

function panelOpenCustomId(panelId?) {
  const id = String(panelId || "").trim();
  return id ? `tkp:${id}` : null;
}

function parsePanelOpenCustomId(customId?) {
  const raw = String(customId || "").trim();
  if (!raw.startsWith("tkp:")) return null;
  const id = raw.slice(4).trim();
  return id || null;
}

function isPanelOpenCustomId(customId?) {
  return Boolean(parsePanelOpenCustomId(customId));
}

export = {
  DAYS,
  DAY_LABELS,
  normalizeMentionOnOpen,
  normalizeIdList,
  normalizeAccessRules,
  normalizeTicketPermsOverride,
  normalizeWelcome,
  isWelcomeEmpty,
  embedBuilderToWelcome,
  defaultWelcomeForTicketType,
  normalizeSupportHours,
  supportHoursAreUnrestricted,
  supportHoursLabel,
  isWithinSupportHours,
  memberPassesAccessRules,
  buildWelcomeEmbedFromPanel,
  resolveWelcomeClassicFieldsFromPanel,
  buildWelcomePayloadFromPanel,
  buildOpenMentions,
  collectDiscordMentionIds,
  rewriteRoleNamesToMentions,
  roleIdsFromMentionOnOpen,
  panelOpenCustomId,
  parsePanelOpenCustomId,
  isPanelOpenCustomId,
  asBool,
  asInt,
  normalizeId,
};
