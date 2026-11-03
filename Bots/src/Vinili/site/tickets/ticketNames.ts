/** Ticket dal sito: nomi, etichette, categorie, avatar e nome del canale. */
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { WEB_TICKET_CATEGORIES } = require("../../../MultiGuild/tickets/data/siteWebTicketSchemas") as typeof import("../../../MultiGuild/tickets/data/siteWebTicketSchemas");
const { guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic, sitePreferredAvatarUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { resolveSiteAvatarUrl } = require("../http/siteLiveAvatars") as typeof import("../http/siteLiveAvatars");
const { getTicketPanelConfig } = require("../../../MultiGuild/tickets/discord/ticketPanelConfig") as typeof import("../../../MultiGuild/tickets/discord/ticketPanelConfig");
const { buildTicketChannelName, sanitizeTicketChannelTail } = require("../../../MultiGuild/tickets/discord/ticketNamingRuntime") as typeof import("../../../MultiGuild/tickets/discord/ticketNamingRuntime");

const CATEGORY_LABELS = Object.freeze({
  supporto: "Supporto",
  partnership: "Partnership",
  high: "High Staff",
  perks: "Perks",
    segnalazione: "Supporto",
  tecnico: "Supporto",
  altro: "Supporto",
});

const CATEGORY_DESCRIPTIONS = Object.freeze({
  supporto:
    "Segnalazioni, problemi/bug, informazioni o qualunque richiesta che non rientra nelle altre categorie.",
  partnership: "Usalo per fare partnership con noi.",
  high: "Donazioni, sponsor a pagamento o per parlare con un amministratore.",
  perks: "Verifica selfie o riscatto ruoli Supporter / Follower.",
});

const LEGACY_CATEGORY_ALIASES = Object.freeze({
  segnalazione: "supporto",
  tecnico: "supporto",
  altro: "supporto",
  highstaff: "high",
  "high-staff": "high",
  "high_staff": "high",
});

function knownBotDisplayName(userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return "";
  if (uid === String(IDs.bots?.ViniliCaffeBot || "").trim()) return "Vinili";
  if (uid === String(IDs.bots?.ViniliCaffeBotTest || "").trim()) return "Vinili (test)";
  return "";
}

function displayNameForMember(member?) {
  const uid = String(member?.id || member?.user?.id || "").trim();
  const known = knownBotDisplayName(uid);
  if (known) return known;
  return (
    String(member?.displayName || member?.user?.globalName || member?.user?.username || "").trim() ||
    "Utente"
  );
}

function panelConfigForWebCategory(category?) {
  const id = normalizeCategory(category) || "supporto";
  const key = id === "high" ? "highstaff" : id;
  return getTicketPanelConfig(key) || getTicketPanelConfig("supporto");
}

function looksLikeDiscordTicketName(name?) {
  const s = String(name || "");
  return s.includes("᲼") || s.includes("︲") || s.startsWith("༄");
}

function extractTicketNameTail(name?, fallback = "utente") {
  const current = String(name || "");
  const sep = current.lastIndexOf("᲼");
  if (sep !== -1) {
    const tail = current.slice(sep + 1).trim();
    return tail || fallback;
  }
  const hyphen = current.lastIndexOf("-");
  if (hyphen !== -1) {
    const tail = current.slice(hyphen + 1).trim();
    return tail || fallback;
  }
  return String(fallback || "utente");
}

function isGenericTicketSubject(name?, category?) {
  const s = String(name || "").trim().toLowerCase();
  if (!s) return true;
  if (s === "ticket" || s === String(category || "").toLowerCase()) return true;
    if (/^discord(\s|[.#-])/i.test(s)) return true;
  if (/importat[oa]\s+da\b/i.test(s)) return true;
  const label = String(CATEGORY_LABELS[normalizeCategory(category) || category] || "").toLowerCase();
  if (s === label) return true;
  const panel = panelConfigForWebCategory(category);
  const panelName = String(panel?.name || "").toLowerCase();
  const panelLabel = String(panel?.label || "").toLowerCase();
  return s === panelName || s === panelLabel;
}

function isWeakAuthorName(name?) {
  const s = String(name || "").trim();
  if (!s) return true;
  if (/^Utente\s+\d+$/i.test(s)) return true;
  if (/^utente\s*discord$/i.test(s)) return true;
  if (/^[᲼｜︲༄\s\-_.]+$/u.test(s)) return true;
  return false;
}

function looksLikeMessageContent(text?) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (s.length > 44) return true;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 5) return true;
  if (/[.!?…]/.test(s) && words.length >= 3) return true;
  if (/^(c'?è|e\s|ho\s|mi\s|il\s|la\s|lo\s|un\s|una\s|dei\s|della\s|per\s|con\s|sono\s|abbiamo\s)/i.test(s)) return true;
  return false;
}

function cleanWebTicketDisplayLabel(raw?) {
  let s = String(raw || "").trim().replace(/#\d+$/, "");
  if (!s) return "";
  const sep = s.lastIndexOf("᲼");
  if (sep !== -1) s = s.slice(sep + 1).trim();
  s = s.replace(/^[\s\S]*?[︲༄—–\-]+/u, "").trim();
  s = s.replace(/^(supporto|partnership|highstaff|high|perks)[\s—–\-]+/i, "").trim();
  s = s.replace(/[\s—–\-]+/g, " ").replace(/\s+/g, " ").trim();
  if (looksLikeMessageContent(s) || isGenericTicketSubject(s, "")) return "";
  return s.slice(0, 80);
}

function formatWebTicketDisplayName(doc?) {
  const author = cleanWebTicketDisplayLabel(String(doc?.authorName || "").trim());
  if (author && !isWeakAuthorName(author)) return author;
  const tail = cleanWebTicketDisplayLabel(webTicketNameTail(doc));
  if (tail && tail !== "utente") return tail;
  const stored = cleanWebTicketDisplayLabel(String(doc?.subject || "").trim());
  if (stored && stored !== "utente") return stored;
  const n = Number(doc?.ticketNumber) || 0;
  return n > 0 ? `Ticket ${n}` : "Utente";
}

function webTicketNameTail(doc?) {
  const rawAuthor = String(doc?.authorName || "").trim();
  const fallback = sanitizeTicketChannelTail(
    isWeakAuthorName(rawAuthor) ? "" : rawAuthor,
    "utente",
  );
  const stored = String(doc?.subject || "").trim();
  if (looksLikeMessageContent(stored)) return fallback;
  if (looksLikeDiscordTicketName(stored)) {
    const tail = extractTicketNameTail(stored, fallback);
        const sanitizedTail = sanitizeTicketChannelTail(tail, "");
    if (/^discord(-\d+)?(-|$)/i.test(sanitizedTail)) return fallback;
    if (/^utente-\d+$/i.test(sanitizedTail)) return fallback;
    if (!sanitizedTail) return fallback;
    return sanitizedTail;
  }
  if (isGenericTicketSubject(stored, doc?.category) || isWeakAuthorName(rawAuthor)) return fallback;
  const sanitized = sanitizeTicketChannelTail(stored, fallback);
  if (/^discord(-\d+)?(-|$)/i.test(sanitized)) return fallback;
  if (/^utente-\d+$/i.test(sanitized)) return fallback;
  return sanitized;
}

function buildWebTicketChannelName(doc?, tailOverride?) {
  const panel = panelConfigForWebCategory(doc?.category);
  const fallback = String(doc?.authorName || "utente");
  const rawTail =
    tailOverride != null && String(tailOverride).trim()
      ? String(tailOverride)
      : webTicketNameTail(doc);
  return buildTicketChannelName(panel, rawTail, fallback);
}

function syncWebTicketChannelName(ticket?, tailOverride?) {
  ticket.subject = buildWebTicketChannelName(ticket, tailOverride);
  return ticket.subject;
}

function avatarForMember(member?) {
  try {
    // ticketAvatarGlobal1: niente guild CDN (hash stale → 404 in console). Preferisci globale.
    return (
      sitePreferredAvatarUrl(member, { size: 128, preferAnimated: true, allowDefault: false }) ||
      guildMemberDisplayAvatarUrlStatic(member) ||
      guildMemberDisplayAvatarUrlDynamic(member) ||
      ""
    );
  } catch {
    return "";
  }
}

/** Guild avatar URL in Mongo spesso 404: non spedirli al client così. */
function scrubStoredTicketAvatarUrl(url?) {
  const u = String(url || "").trim();
  if (!u) return "";
  if (/\/guilds\/\d+\/users\//i.test(u)) return "";
  if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(u)) return "";
  return u;
}

function liveTicketAvatarUrl(guild?, userId?, storedUrl?) {
  const scrubbed = scrubStoredTicketAvatarUrl(storedUrl);
  if (!guild || !userId) return scrubbed;
  try {
    return (
      resolveSiteAvatarUrl(guild, userId, storedUrl, {
        size: 128,
        preferAnimated: false,
        allowDefault: false,
      }) || scrubbed
    );
  } catch {
    return scrubbed;
  }
}

function sanitizeText(value?, maxLen?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function normalizeCategory(value?) {
  let k = String(value || "")
    .trim()
    .toLowerCase();
  if (LEGACY_CATEGORY_ALIASES[k]) k = LEGACY_CATEGORY_ALIASES[k];
  return WEB_TICKET_CATEGORIES.includes(k) ? k : "";
}

function defaultCategoryCatalog() {
  return WEB_TICKET_CATEGORIES.map((id?) => ({
    id,
    label: CATEGORY_LABELS[id] || id,
    description: CATEGORY_DESCRIPTIONS[id] || "",
  }));
}

async function resolveWebTicketCategories(guildId?) {
  const defaults = defaultCategoryCatalog();
  const gid = String(guildId || "").trim();
  if (!gid) return defaults;
  try {
    const { getGuildPanels } = require("../../../MultiGuild/tickets/tenant/tenantTicketPanels") as typeof import("../../../MultiGuild/tickets/tenant/tenantTicketPanels");
    const bucket = await getGuildPanels(gid);
    const byType = new Map();
    const put = (type?, title?, content?) => {
      const id = normalizeCategory(type);
      if (!id || byType.has(id)) return;
      byType.set(id, {
        id,
        label: String(title || CATEGORY_LABELS[id] || id).trim() || CATEGORY_LABELS[id],
        description: String(content || CATEGORY_DESCRIPTIONS[id] || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 280),
      });
    };
    for (const p of Array.isArray(bucket?.singles) ? bucket.singles : []) {
      put(p?.ticketType, p?.title || p?.buttonText, p?.content);
    }
    for (const multi of Array.isArray(bucket?.multis) ? bucket.multis : []) {
      for (const opt of Array.isArray(multi?.options) ? multi.options : []) {
        put(opt?.ticketType, opt?.label || opt?.title || opt?.buttonText, opt?.description || opt?.content);
      }
    }
    if (!byType.size) return defaults;
    return WEB_TICKET_CATEGORIES.map((id?) => byType.get(id) || defaults.find((d?) => d.id === id)).filter(Boolean);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] resolveWebTicketCategories:", err?.message || err);
    return defaults;
  }
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function webCategoryFromPanelToken(value?) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "highstaff") return "high";
  return normalizeCategory(raw);
}

export = { CATEGORY_LABELS, knownBotDisplayName, displayNameForMember, looksLikeDiscordTicketName, extractTicketNameTail, formatWebTicketDisplayName, webTicketNameTail, buildWebTicketChannelName, syncWebTicketChannelName, avatarForMember, scrubStoredTicketAvatarUrl, liveTicketAvatarUrl, sanitizeText, normalizeCategory, resolveWebTicketCategories, resolveGuildId, webCategoryFromPanelToken };
