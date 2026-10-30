const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const crypto = require("node:crypto") as typeof import("node:crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { ChannelType, Collection, ApplicationCommandType, ApplicationCommandOptionType, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const {
  WEB_TICKET_CATEGORIES,
  WEB_TICKET_STATUS,
  SiteWebTicket,
  SiteWebTicketMessage,
  nextWebTicketNumber,
} = require("../Schemas/Web/siteWebTicketSchemas") as typeof import("../Schemas/Web/siteWebTicketSchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { fetchWebsiteGuildMember } = require("../Utils/Web/websiteGuildMemberFetch") as typeof import("../Utils/Web/websiteGuildMemberFetch");
const { normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const {
  guildMemberDisplayAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlStatic,
  sitePreferredAvatarUrl,
} = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { resolveSiteAvatarUrl } = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");
const { sanitizeDiscordChannelName } = require("../Utils/Discord/discordDisplayName") as typeof import("../Utils/Discord/discordDisplayName");
const {
  enqueueSiteInAppNotification,
  removeInboxItemByDedupeKey,
  removeSiteInAppNotificationsForTicket,
} = require("./siteInAppNotificationsService") as typeof import("./siteInAppNotificationsService");
const {
  setWebTicketPagePresence,
  clearWebTicketPagePresence,
  shouldSkipWebTicketInAppNotif,
} = require("../Utils/Web/webTicketPagePresence") as typeof import("../Utils/Web/webTicketPagePresence");
const { setTyping: setChatTyping, clearTyping: clearChatTyping } = require("./siteChatTyping") as typeof import("./siteChatTyping");
const { memberHasStaffRole } = require("../Utils/Community/staffListUtils") as typeof import("../Utils/Community/staffListUtils");
const { broadcastSiteWebTicketsEvent } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
const { sendJsonWithEtag, weakEtagFromParts } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");
/* siteApiW3/W8: open web-ticket counts + short list cache + ETag */
const OPEN_WEB_TICKETS_TTL_MS = 20_000;
/* ticketSwitchFast1: list TTL 20s — switch Personali/Staff spesso entro la finestra */
const WEB_TICKETS_LIST_TTL_MS = 20_000;
let openWebTicketsCache = null;
let openWebTicketsInflight = null;
const webTicketsListCache = new Map();
const webTicketsListInflight = new Map();

/* ticketListDedupeSrv1: stessi criteri del client (preview/event/subject ±60s) */
function ticketPreviewCoreSrv(doc?) {
  let prev = String(doc?.lastMessagePreview || "")
    .toLowerCase()
    .replace(/\[embed[^\]]*\]/gi, " ")
    .replace(/\b(?:titolo|title|descrizione|description|footer|fields?)\s*:/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[*_#`•·:]+/g, " ")
    .replace(/@\S+/g, "@")
    .replace(/nessun contenuto[^\s]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return prev.slice(0, 28);
}

function ticketEventCoreSrv(doc?) {
  const p = String(doc?.lastMessagePreview || "").toLowerCase();
  if (/__chiusura__|chiusura/.test(p) && /confermato|verr[aà] chiuso|verra chiuso/.test(p)) {
    return "ev:close_confirm";
  }
  if (/ticket claimato|__ticket claimato__/.test(p)) return "ev:claim";
  return "";
}

function ticketSubjectCoreSrv(doc?) {
  return String(doc?.subject || doc?.channelName || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

function ticketActivityMsSrv(doc?) {
  const raw = doc?.lastMessageAt || doc?.updatedAt || doc?.createdAt;
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function ticketDedupeScoreSrv(doc?) {
  const msgs = Math.max(0, Number(doc?.messageCount) || 0);
  const prev = ticketPreviewCoreSrv(doc);
  const prevScore = prev && !/nessun contenuto/i.test(prev) ? 1 : 0;
  const num = Math.max(0, Number(doc?.ticketNumber) || 0);
  return msgs * 1e12 + prevScore * 1e10 + num * 1e6 + ticketActivityMsSrv(doc);
}

function ticketsAreImportDupSrv(a?, b?) {
  if (!a || !b) return false;
  if (String(a.userId || "") !== String(b.userId || "")) return false;
  if (String(a.category || "").toLowerCase() !== String(b.category || "").toLowerCase()) return false;
  if (Math.abs(ticketActivityMsSrv(a) - ticketActivityMsSrv(b)) > 60_000) return false;
  const ea = ticketEventCoreSrv(a);
  const eb = ticketEventCoreSrv(b);
  if (ea && eb && ea === eb) return true;
  const pa = ticketPreviewCoreSrv(a);
  const pb = ticketPreviewCoreSrv(b);
  if (pa && pb && pa === pb) return true;
  const sa = ticketSubjectCoreSrv(a);
  const sb = ticketSubjectCoreSrv(b);
  return Boolean(sa && sb && sa === sb);
}

function dedupeTicketDocsSrv(rows?) {
  /* ticketListDedupeShape1: sempre {kept,hidden} — early-return array rompeva .length */
  if (!Array.isArray(rows) || rows.length < 2) {
    return { kept: Array.isArray(rows) ? rows.slice() : [], hidden: [] };
  }
  const kept = [];
  const hidden = [];
  for (const t of rows) {
    if (!t) continue;
    let hit = -1;
    for (let j = 0; j < kept.length; j += 1) {
      if (!ticketsAreImportDupSrv(kept[j], t)) continue;
      hit = j;
      break;
    }
    if (hit < 0) {
      kept.push(t);
      continue;
    }
    if (ticketDedupeScoreSrv(t) > ticketDedupeScoreSrv(kept[hit])) {
      hidden.push(kept[hit]);
      kept[hit] = t;
    } else {
      hidden.push(t);
    }
  }
  return { kept, hidden };
}

/* ticketListCacheBust1 + ticketListTotalFix1: await mark prima della cache lista */
async function markTicketDocsListHidden(hidden?, winnerByPair?) {
  if (!Array.isArray(hidden) || !hidden.length) return 0;
  try {
    webTicketsListCache.clear();
  } catch (eClear0) {}
  let marked = 0;
  try {
    for (const doc of hidden) {
      const id = doc?._id;
      if (!id) continue;
      let winnerId = null;
      if (winnerByPair && typeof winnerByPair.get === "function") {
        winnerId = winnerByPair.get(String(id)) || null;
      }
      const r = await SiteWebTicket.updateOne(
        { _id: id, listHidden: { $ne: true } },
        {
          $set: {
            listHidden: true,
            ...(winnerId ? { duplicateOf: winnerId } : {}),
          },
        },
      ).catch(() => null);
      if (r && (r.modifiedCount || r.matchedCount)) marked += 1;
    }
    if (marked) {
      try {
        webTicketsListCache.clear();
        openWebTicketsCache = null;
      } catch (eClear1) {}
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] listHidden mark failed:", err?.message || err);
  }
  return marked;
}

function webTicketsListEtag(listKey?, payload?, at?) {
  const tickets = Array.isArray(payload?.tickets) ? payload.tickets : [];
  const sig = tickets
    .map((t?) => `${t.id || t._id || ""}:${t.lastMessageAt || ""}:${t.status || ""}:${t.claimedBy || ""}`)
    .join(",")
    .slice(0, 220);
  return weakEtagFromParts(["wtl", listKey, at || 0, payload?.total || 0, tickets.length, sig]);
}

function webTicketsDetailEtag(ticket?, messages?) {
  const msgs = Array.isArray(messages) ? messages : [];
  const receiptSig = msgs
    .map((m?) => `${m?._id || ""}:${Array.isArray(m?.readBy) ? m.readBy.length : 0}`)
    .join(",")
    .slice(0, 180);
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  return weakEtagFromParts([
    "wtd",
    String(ticket?._id || ""),
    ticket?.status || "",
    ticket?.claimedBy || "",
    ticket?.lastMessageAt || "",
    msgs.length,
    String(last?._id || ""),
    last?.editedAt || last?.createdAt || "",
    receiptSig,
  ]);
}
const { hasStaffTicketRole } = require("../Utils/Ticket/ticketStaffPanelBuild") as typeof import("../Utils/Ticket/ticketStaffPanelBuild");
const { memberIsResocontoPmReviewer } = require("../Utils/Ticket/ticketPartnershipStaffRoles") as typeof import("../Utils/Ticket/ticketPartnershipStaffRoles");
const { canClaimTicket } = require("../Prefix/Staff/ticket") as typeof import("../Prefix/Staff/ticket");
const { handleOfficialPrefixMessage } = require("../Utils/Prefix/officialPrefixDispatcher") as typeof import("../Utils/Prefix/officialPrefixDispatcher");
const { getTicketPanelConfig } = require("../Utils/Ticket/ticketPanelConfig") as typeof import("../Utils/Ticket/ticketPanelConfig");
const { buildTicketChannelName, sanitizeTicketChannelTail } = require("../Utils/Ticket/ticketNamingRuntime") as typeof import("../Utils/Ticket/ticketNamingRuntime");
const { getPartnerManagerRoleId, memberHasPartnerManagerRole } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
const { memberIsHighStaffEligible } = require("../Utils/Staff/staffRoleHierarchy") as typeof import("../Utils/Staff/staffRoleHierarchy");
const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { getOrCreateStaffDoc } = require("../Utils/Staff/staffDocUtils") as typeof import("../Utils/Staff/staffDocUtils");
const {
  consumeWebTicketMessageRateLimit,
  checkWebTicketUserMessageAutomod,
} = require("../Utils/Web/webTicketMessageGuard") as typeof import("../Utils/Web/webTicketMessageGuard");
const { sendWebTicketDiscordLog, sendWebTicketMessageActivityLog } = require("../Utils/Web/webTicketDiscordLog") as typeof import("../Utils/Web/webTicketDiscordLog");

const MAX_SUBJECT = 120;
const MAX_CONTENT = 2000;
const MAX_CLOSE_REASON = 500;
const MAX_OPEN_PER_USER = 1;
const MAX_MESSAGES_FETCH = 120;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ADDED_USERS = 15;
const MAX_CLOSE_REQUEST_REASON = 1800;
const MAX_REACTION_KINDS = 20;
const MAX_REACTION_USERS = 80;
const EMOJI_CACHE_TTL_MS = 5 * 60 * 1000;
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const ALLOWED_MEDIA_MIME = new Set([...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]);
const UPLOAD_ROOT = path.resolve(__dirname, "../../Data/uploads/web-tickets");

let guildEmojiCache = { guildId: "", at: 0, emojis: [] };
let cachedBotUserId = "";
let channelMentionCache = { guildId: "", at: 0, channels: [] };
const CHANNEL_MENTION_CACHE_TTL_MS = 20_000;

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
    const { getGuildPanels } = require("../MultiGuild/core/tenantTicketPanels") as typeof import("../MultiGuild/core/tenantTicketPanels");
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

const WEB_TICKET_STAFF_ROLE_PRIORITY = [
  IDs.roles?.Founder,
  IDs.roles?.Manager,
  IDs.roles?.Admin,
  IDs.roles?.Director,
  IDs.roles?.HighStaff,
  IDs.roles?.SeniorModerator,
  IDs.roles?.Mod,
  IDs.roles?.Helper,
  IDs.roles?.PartnerManager,
  IDs.roles?.CommunityManager,
  IDs.roles?.Staff,
]
  .map((id?) => String(id || "").trim())
  .filter(Boolean);

const WEB_TICKET_COMMUNITY_ROLE_PRIORITY = [
  { id: IDs.roles?.VIPplus, name: "VIP+", key: "vip-plus" },
  { id: IDs.roles?.VIP, name: "VIP", key: "vip" },
  { id: IDs.roles?.DoubleBooster, name: "Double Booster", key: "double-booster" },
  { id: IDs.roles?.ServerBooster, name: "Booster", key: "booster" },
  { id: IDs.roles?.Donator, name: "Donator", key: "donator" },
  { id: IDs.roles?.Member, name: "Member", key: "member" },
]
  .map((row?) => ({
    id: String(row.id || "").trim(),
    name: row.name,
    key: row.key,
  }))
  .filter((row?) => row.id);

const WEB_TICKET_STAFF_ROLE_LABELS = {
  [String(IDs.roles?.Founder || "")]: { name: "Founder", key: "founder" },
  [String(IDs.roles?.Manager || "")]: { name: "Manager", key: "manager" },
  [String(IDs.roles?.Admin || "")]: { name: "Admin", key: "admin" },
  [String(IDs.roles?.Director || "")]: { name: "Director", key: "director" },
  [String(IDs.roles?.HighStaff || "")]: { name: "High Staff", key: "high-staff" },
  [String(IDs.roles?.SeniorModerator || "")]: { name: "Senior Mod", key: "senior-mod" },
  [String(IDs.roles?.Mod || "")]: { name: "Mod", key: "mod" },
  [String(IDs.roles?.Helper || "")]: { name: "Helper", key: "helper" },
  [String(IDs.roles?.PartnerManager || "")]: { name: "Partner Manager", key: "partner-manager" },
  [String(IDs.roles?.CommunityManager || "")]: { name: "Community Manager", key: "community-manager" },
  [String(IDs.roles?.Staff || "")]: { name: "Staff", key: "staff" },
};

function cleanStaffRoleDisplayName(raw?) {
  let name = String(raw || "")
    .replace(/<a?:[^:]+:\d+>/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/^[^\p{L}\p{N}]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name) return "Staff";
  return name.slice(0, 48);
}

function staffRolePriorityIds(guildId?) {
  const ids = [...WEB_TICKET_STAFF_ROLE_PRIORITY];
  const pmId = String(getPartnerManagerRoleId(guildId) || IDs.roles?.PartnerManager || "").trim();
  if (pmId && !ids.includes(pmId)) {
    const staffIdx = ids.indexOf(String(IDs.roles?.Staff || "").trim());
    if (staffIdx >= 0) ids.splice(staffIdx, 0, pmId);
    else ids.push(pmId);
  }
  return ids.filter(Boolean);
}

function labelForStaffRoleId(roleId?, roleName?, guildId?) {
  const id = String(roleId || "").trim();
  const pmId = String(getPartnerManagerRoleId(guildId) || IDs.roles?.PartnerManager || "").trim();
  if (id && pmId && id === pmId) {
    return { name: "Partner Manager", key: "partner-manager" };
  }
  const fixed = WEB_TICKET_STAFF_ROLE_LABELS[id];
  if (fixed?.name) return { name: fixed.name, key: fixed.key || "staff" };
  const cleaned = cleanStaffRoleDisplayName(roleName || "");
  return { name: cleaned || "Staff", key: "staff" };
}

function resolveStaffRoleForMember(member?, guildId = null) {
  if (!member?.roles?.cache) return null;
  const gid = String(guildId || member?.guild?.id || "").trim();
  for (const roleId of staffRolePriorityIds(gid)) {
    if (!member.roles.cache.has(roleId)) continue;
    const role = member.roles.cache.get(roleId);
    const labeled = labelForStaffRoleId(roleId, role?.name || "", gid);
    return { id: roleId, name: labeled.name, key: labeled.key };
  }
  return null;
}

function resolveCommunityRoleForMember(member?) {
  if (!member?.roles?.cache) return null;
  for (const row of WEB_TICKET_COMMUNITY_ROLE_PRIORITY) {
    if (!member.roles.cache.has(row.id)) continue;
    return { id: row.id, name: row.name, key: row.key };
  }
  return null;
}

function resolveAuthorRoleForMember(member?, authorKind?, guildId = null) {
  const kind = String(authorKind || "user");
  if (kind === "staff") {
    return resolveStaffRoleForMember(member, guildId);
  }
  if (kind === "user") {
    return resolveCommunityRoleForMember(member);
  }
  return null;
}

function normalizeLookupName(value?) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}

function memberMatchesLookupName(member?, needle?) {
  const n = normalizeLookupName(needle);
  if (!n || !member) return false;
  const candidates = [
    member.user?.username,
    member.user?.globalName,
    member.displayName,
    member.nickname,
  ];
  for (const c of candidates) {
    const nc = normalizeLookupName(c);
    if (!nc) continue;
    if (nc === n) return true;
    if (n.length >= 3 && nc.length >= 3 && (nc.includes(n) || n.includes(nc))) return true;
  }
  return false;
}

function lookupNameVariants(rawName?) {
  const needle = String(rawName || "").trim();
  if (!needle) return [];
  const out = [];
  const push = (v?) => {
    const s = String(v || "").trim();
    if (!s) return;
    if (!out.includes(s)) out.push(s);
  };
  push(needle);
  push(needle.replace(/\.+$/g, ""));
  push(needle.replace(/^_+|_+$/g, ""));
  push(normalizeLookupName(needle));
  push(normalizeLookupName(needle).replace(/[^a-z0-9]+/g, ""));
    const letters = needle.replace(/[^a-zA-Z]+/g, "");
  if (letters.length >= 3 && letters.toLowerCase() !== normalizeLookupName(needle)) push(letters);
  const alphaNum = needle.replace(/[^a-zA-Z0-9]+/g, "");
  if (alphaNum.length >= 3) push(alphaNum);
  return out;
}

async function findGuildMemberByName(guild?, rawName?) {
  const variants = lookupNameVariants(rawName);
  if (!guild || !variants.length) return null;

    for (const v of variants) {
    const q = String(v)
      .replace(/[^\p{L}\p{N}_.-]+/gu, "")
      .slice(0, 32);
    if (q.length < 2) continue;
    try {
      const fetched = await guild.members.search({ query: q, limit: 15 }).catch(() => null);
      if (!fetched) continue;
      const hit =
        typeof fetched.find === "function"
          ? fetched.find((m?) => variants.some((vv?) => memberMatchesLookupName(m, vv)))
          : null;
      if (hit) return hit;
      if (typeof fetched.find === "function") {
        const soft = fetched.find((m?) => {
          const hay = normalizeLookupName(
            `${m.user?.username || ""} ${m.displayName || ""} ${m.user?.globalName || ""}`,
          );
          return variants.some((vv?) => {
            const nv = normalizeLookupName(vv);
            return nv.length >= 3 && (hay === nv || hay.includes(nv) || nv.includes(hay));
          });
        });
        if (soft) return soft;
      }
      if (fetched.size === 1 && typeof fetched.first === "function") return fetched.first();
    } catch {
          }
  }

  for (const v of variants) {
    const cached = guild.members.cache.find((m?) => memberMatchesLookupName(m, v));
    if (cached) return cached;
  }

  if (guild.members.cache?.size) {
    for (const v of variants) {
      const nv = normalizeLookupName(v);
      if (nv.length < 3) continue;
      const soft = [...guild.members.cache.values()].find((m?) => {
        const candidates = [
          m.user?.username,
          m.user?.globalName,
          m.displayName,
          m.nickname,
        ].map(normalizeLookupName);
        return candidates.some((c?) => c && (c === nv || c.startsWith(nv) || nv.startsWith(c) || c.includes(nv)));
      });
      if (soft) return soft;
    }
  }

  return null;
}

async function enrichSlugAuthorsFromStaffRoster(client?, guild?, slugs?, nameHints?, out?) {
  if (!client || !guild || !slugs.length) return;
  try {
    const { getCachedStaffRoster, ensureGuildMembersLoaded } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
    const roster = await getCachedStaffRoster(client);
    if (!roster?.ok) return;
    const people = [];
    if (roster.membersById && typeof roster.membersById.values === "function") {
      people.push(...roster.membersById.values());
    } else if (Array.isArray(roster.sections)) {
      for (const sec of roster.sections) {
        if (Array.isArray(sec?.members)) people.push(...sec.members);
      }
    }
    const gid = String(guild.id || "");
    for (const uid of slugs) {
      if (out[uid]) continue;
      const hint = String(nameHints[uid] || uid.slice(8) || "").trim();
      const variants = lookupNameVariants(hint);
      const row = people.find((p?) => {
        if (!p) return false;
        return variants.some(
          (v?) =>
            normalizeLookupName(p.username) === normalizeLookupName(v) ||
            normalizeLookupName(p.displayName) === normalizeLookupName(v) ||
            memberMatchesLookupName({ user: { username: p.username, globalName: p.displayName }, displayName: p.displayName }, v),
        );
      });
      if (!row?.userId) continue;
      const member =
        guild.members.cache.get(String(row.userId)) ||
        (await guild.members.fetch(String(row.userId)).catch(() => null));
      if (!member) {
                const staffLabel = String(row.displayRoleLabel || "").trim();
        const staffKey = String(row.profileKind || row.displayRoleId || "staff")
          .toLowerCase()
          .replace(/\s+/g, "-");
        out[uid] = {
          staff: staffLabel
            ? {
                id: String(row.displayRoleId || ""),
                name: cleanStaffRoleDisplayName(staffLabel),
                key: staffKey.includes("partner") ? "partner-manager" : staffKey.slice(0, 40),
              }
            : { id: "", name: "Staff", key: "staff" },
          community: null,
          avatarUrl: String(row.avatarUrl || "").trim(),
          resolvedId: String(row.userId),
        };
                if (row.isPm && out[uid].staff) {
          out[uid].staff.key = "partner-manager";
          if (!/partner/i.test(out[uid].staff.name)) out[uid].staff.name = "Partner Manager";
        }
        continue;
      }
      const staff = resolveStaffRoleForMember(member, gid);
      const community = resolveCommunityRoleForMember(member);
      out[uid] = {
        staff: staff || null,
        community: community || null,
        avatarUrl: avatarForMember(member) || String(row.avatarUrl || "").trim(),
        resolvedId: String(member.id || row.userId),
      };
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] enrichSlugAuthorsFromStaffRoster:", err?.message || err);
  }
}

async function buildStaffRoleMapForUserIds(client?, guildId?, userIds?, { nameHints = {} } = {}) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  const out: Record<string, any> = {};
  if (!gid || !ids.length) return out;
  const guild =
    client?.guilds?.cache?.get?.(gid) ||
    (await client?.guilds?.fetch?.(gid).catch?.(() => null)) ||
    null;
  if (!guild) return out;
  const snowflakes = ids.filter((id?) => /^\d{5,32}$/.test(id));
  const slugs = ids.filter((id?) => id.startsWith("discord:"));
  try {
    const { ensureGuildMembersLoaded } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
    /* ticketDetailFast1: preferisci gli id del ticket (no full guild fetch se basta) */
    await ensureGuildMembersLoaded(guild, snowflakes.slice(0, 24));
  } catch {
      }
  const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");

  await Promise.all(
    snowflakes.slice(0, 24).map(async (uid?) => {
      try {
        const member =
          guild.members.cache.get(uid) ||
          (await getGuildMemberCached(guild, uid).catch(() => null)) ||
          null;
        if (!member) return;
        const staff = resolveStaffRoleForMember(member, gid);
        const community = resolveCommunityRoleForMember(member);
        out[uid] = {
          staff: staff || null,
          community: community || null,
          avatarUrl: avatarForMember(member) || "",
        };
      } catch {
              }
    }),
  );

  /* ticketDetailFast1: slug name-search max 6 (prima 40 → lento su telefono) */
  await Promise.all(
    slugs.slice(0, 6).map(async (uid?) => {
      try {
        const hint = String(nameHints[uid] || uid.slice(8) || "").trim();
                const member = await findGuildMemberByName(guild, hint);
        if (!member) return;
        const staff = resolveStaffRoleForMember(member, gid);
        const community = resolveCommunityRoleForMember(member);
        out[uid] = {
          staff: staff || null,
          community: community || null,
          avatarUrl: avatarForMember(member) || "",
          resolvedId: String(member.id || ""),
        };
                const rid = String(member.id || "").trim();
        if (rid && !out[rid]) {
          out[rid] = {
            staff: staff || null,
            community: community || null,
            avatarUrl: avatarForMember(member) || "",
          };
        }
      } catch {
              }
    }),
  );

  const unresolved = slugs.filter((id?) => !out[id]).slice(0, 6);
  if (unresolved.length) {
    await enrichSlugAuthorsFromStaffRoster(client, guild, unresolved, nameHints, out);
  }
  return out;
}

function collectMentionUserIdsFromMessages(messages?) {
  const ids = new Set();
  const re = /<@!?(\d{5,32})>/g;
  for (const msg of Array.isArray(messages) ? messages : []) {
    const text = String(msg?.content || "");
    let m;
    while ((m = re.exec(text))) {
      if (m[1]) ids.add(String(m[1]));
    }
  }
  return [...ids];
}

function memberIsStaff(member?) {
  if (!member || member.user?.bot) return false;
  if (memberHasStaffRole(member)) return true;
  const staffRoleId = String(IDs.roles?.Staff || "").trim();
  return Boolean(staffRoleId && member.roles?.cache?.has?.(staffRoleId));
}

function memberIsHighStaff(member?) {
  const highStaffRoleId = String(IDs.roles?.HighStaff || "").trim();
  return Boolean(highStaffRoleId && member?.roles?.cache?.has?.(highStaffRoleId));
}

function memberHasWebsiteStaffAccess(member?) {
  if (!member || member.user?.bot) return false;
  if (memberHasStaffRole(member)) return true;
  const staffRoleId = String(IDs.roles?.Staff || "").trim();
  return Boolean(staffRoleId && member.roles?.cache?.has?.(staffRoleId));
}

function listAccessibleTicketCategories(member?) {
  if (!member || member.user?.bot) return [];
  const cats = WEB_TICKET_CATEGORIES.filter((cat?) => hasStaffTicketRole(member, cat));
  if (cats.length) return cats;
      if (memberHasWebsiteStaffAccess(member)) return ["supporto"];
  return [];
}

function memberIsWebTicketStaff(member?) {
  return listAccessibleTicketCategories(member).length > 0;
}

function memberCanAccessTicketCategory(member?, category?) {
  const cat = normalizeCategory(category);
  if (!cat) return false;
  return hasStaffTicketRole(member, cat);
}

function memberCanBypassClaimedTicketWrite(member?, ticket?) {
  if (memberIsHighStaffEligible(member) || memberIsHighStaff(member)) return true;
  const category = normalizeCategory(ticket?.category);
  if (category !== "partnership") return false;
  return memberIsResocontoPmReviewer(member);
}

function memberCanBypassClaimedTicketManage(member?, ticket?) {
  if (memberIsHighStaffEligible(member) || memberIsHighStaff(member)) return true;
  const category = normalizeCategory(ticket?.category);
  if (category !== "partnership") return false;
  return memberIsResocontoPmReviewer(member);
}

function parseMentionTargets(content?) {
  const userIds = new Set();
  const roleIds = new Set();
  const re = /<@!?(\d{5,32})>|<@&(\d{5,32})>/g;
  let m;
  const s = String(content || "");
  while ((m = re.exec(s))) {
    if (m[1]) userIds.add(String(m[1]));
    if (m[2]) roleIds.add(String(m[2]));
  }
  return { userIds: [...userIds], roleIds: [...roleIds] };
}

function sanitizeWebTicketUserMentions(content?) {
  return sanitizeWebTicketMentionsToScope(content, {
    allowedUserIds: null,
    allowedRoleIds: null,
    allowRoleMentions: false,
  });
}

function collectTicketParticipantUserIds(ticket?, { messageAuthorIds = [] } = {}) {
  const ids = new Set();
  const owner = String(ticket?.userId || "").trim();
  if (owner) ids.add(owner);
  const claimer = String(ticket?.claimedBy || "").trim();
  if (claimer) ids.add(claimer);
  for (const u of listAddedUsers(ticket)) {
    if (u?.id) ids.add(String(u.id));
  }
  for (const raw of messageAuthorIds) {
    const id = String(raw || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function listTicketMessageAuthorIds(ticketId?) {
  const tid = ticketId && mongoose.isValidObjectId(ticketId) ? ticketId : null;
  if (!tid) return [];
  const rows = await SiteWebTicketMessage.find({ ticketId: tid, authorKind: { $ne: "system" } })
    .select("authorId")
    .lean()
    .catch(() => []);
  return [...new Set(rows.map((r?) => String(r?.authorId || "").trim()).filter(Boolean))];
}

async function collectTicketParticipantRoleIds(guild?, userIds?) {
  const roleIds = new Set();
  if (!guild || !userIds?.size) return roleIds;
  const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
  for (const uid of userIds) {
    const member = await getGuildMemberCached(guild, uid).catch(() => null);
    if (!member?.roles?.cache) continue;
    for (const role of member.roles.cache.values()) {
      const rid = String(role?.id || "").trim();
      if (!rid || rid === String(guild.id)) continue;
      roleIds.add(rid);
    }
  }
  return roleIds;
}

async function resolveTicketMentionScope(client?, ticket?, { extraUserIds = [] } = {}) {
  const guildId = String(ticket?.guildId || resolveGuildId(client) || "").trim();
  const guild = guildId ? await resolveClientGuild(client, guildId) : null;
  const messageAuthorIds = ticket?._id ? await listTicketMessageAuthorIds(ticket._id) : [];
  const allowedUserIds = collectTicketParticipantUserIds(ticket, { messageAuthorIds });
  for (const raw of extraUserIds) {
    const id = String(raw || "").trim();
    if (id) allowedUserIds.add(id);
  }
  const allowedRoleIds = await collectTicketParticipantRoleIds(guild, allowedUserIds);
  return { guild, allowedUserIds, allowedRoleIds };
}

function sanitizeWebTicketMentionsToScope(
  content?,
  { allowedUserIds = null, allowedRoleIds = null, allowRoleMentions = false } = {},
) {
  const users = allowedUserIds instanceof Set ? allowedUserIds : allowedUserIds ? new Set(allowedUserIds) : null;
  const roles = allowedRoleIds instanceof Set ? allowedRoleIds : allowedRoleIds ? new Set(allowedRoleIds) : null;
  return String(content || "")
    .replace(/<@!?(\d{5,32})>/g, (full?, id?) => {
      if (!users) return full;
      return users.has(String(id)) ? full : "";
    })
    .replace(/<@&(\d{5,32})>/g, (full?, id?) => {
      if (!allowRoleMentions) return "";
      if (!roles) return "";
      return roles.has(String(id)) ? full : "";
    })
    .replace(/@(everyone|here)\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n{3,}/g, "\n\n")
    .trim();
}

function memberCanViewChannelId(member?, guild?, channelId?) {
  const cid = String(channelId || "").trim();
  if (!member || !guild || !cid) return false;
  try {
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
  } catch {
      }
  const ch = guild.channels?.cache?.get?.(cid) || null;
  if (!ch) return false;
  try {
    return Boolean(ch.permissionsFor?.(member)?.has?.(PermissionFlagsBits.ViewChannel));
  } catch {
    return false;
  }
}

function sanitizeWebTicketChannelMentions(content?, member?, guild?) {
  return String(content || "")
    .replace(/<#(\d{5,32})>/g, (full?, id?) => (memberCanViewChannelId(member, guild, id) ? full : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n{3,}/g, "\n\n")
    .trim();
}

async function resolveClientGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds) return null;
  return (
    client.guilds.cache?.get?.(gid) ||
    (await client.guilds.fetch?.(gid).catch?.(() => null)) ||
    null
  );
}

function listAddedUsers(ticket?) {
  return (Array.isArray(ticket?.addedUsers) ? ticket.addedUsers : [])
    .map((u?) => ({
      id: String(u?.id || "").trim(),
      name: String(u?.name || "Utente").trim() || "Utente",
      avatarUrl: String(u?.avatarUrl || "").trim(),
    }))
    .filter((u?) => u.id);
}

function ticketHasAddedUser(ticket?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  return listAddedUsers(ticket).some((u?) => u.id === id);
}

function webCategoryFromPanelToken(value?) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "highstaff") return "high";
  return normalizeCategory(raw);
}

function buildTicketPermissions(member?, ticket?, viewerId?, { isOwner = false, isAdded = false } = {}) {
  const category = normalizeCategory(ticket?.category) || String(ticket?.category || "supporto");
  const isStaff = memberIsWebTicketStaff(member);
  const hasCategory = memberCanAccessTicketCategory(member, category);
  const closed = String(ticket?.status || "") === WEB_TICKET_STATUS.CLOSED;
  const claimer = String(ticket?.claimedBy || "").trim();
  const viewer = String(viewerId || "");
  const isHighStaff = memberIsHighStaff(member);
  const closeRequested = Boolean(ticket?.closeRequestedAt);
  const alreadyRated = Boolean(ticket?.ratingAt) || ticket?.ratingStafferScore != null;
      const actingAsStaff = Boolean(isStaff && hasCategory && !isOwner && !isAdded);
  const canClaim =
    !closed && actingAsStaff && canClaimTicket(member, category, String(ticket?.guildId || ""));
  const canUnclaim = !closed && actingAsStaff && claimer && claimer === viewer;
  const bypassWrite = memberCanBypassClaimedTicketWrite(member, ticket);
  const bypassManage = memberCanBypassClaimedTicketManage(member, ticket);
  const canStaffWrite = actingAsStaff && ((claimer && claimer === viewer) || bypassWrite);
  const canCloseStaff =
    !closed && actingAsStaff && (bypassManage || !claimer || claimer === viewer);
    const staffPanel = !closed && actingAsStaff;
  return {
    canClaim: Boolean(canClaim && !claimer),
    canUnclaim: Boolean(canUnclaim),
    canClose: Boolean(canCloseStaff),
    canReply: Boolean(!closed && (isOwner || isAdded || canStaffWrite)),
    canUseCommands: Boolean(canStaffWrite && category === "partnership"),
    canBypassClaimWrite: Boolean(actingAsStaff && bypassWrite),
    canAddUsers: Boolean(staffPanel),
    canRemoveUsers: Boolean(staffPanel),
    canSwitchCategory: Boolean(staffPanel && isHighStaff),
    canRename: Boolean(staffPanel && isHighStaff),
    canCloseRequest: Boolean(staffPanel && (bypassManage || (claimer && claimer === viewer))),
    canTransfer: Boolean(staffPanel && claimer && (bypassManage || claimer === viewer)),
    canRespondCloseRequest: Boolean(!closed && isOwner && closeRequested),
    canRate: Boolean(closed && isOwner && !alreadyRated),
    isStaffViewer: actingAsStaff,
    isAddedViewer: Boolean(isAdded),
    isHighStaff: Boolean(isHighStaff),
    staffCategories: listAccessibleTicketCategories(member),
  };
}

function extForMime(mime?) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  if (m === "video/mp4") return "mp4";
  if (m === "video/webm") return "webm";
  if (m === "video/quicktime") return "mov";
  return "jpg";
}

function parseDataUrlMedia(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:((?:image\/(?:png|jpeg|jpg|webp|gif)|video\/(?:mp4|webm|quicktime)));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!ALLOWED_MEDIA_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer: buf };
}

function ensureUploadDir(ticketId?) {
  const dir = path.join(UPLOAD_ROOT, String(ticketId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const TICKET_FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

function ticketFileAccessSecret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function createTicketFileAccessToken(ticketId?, fileName?) {
  const tid = String(ticketId || "").trim();
  const name = String(fileName || "").trim();
  if (!tid || !name) return "";
  const exp = Date.now() + TICKET_FILE_TOKEN_TTL_MS;
  const payload = `${tid}:${name}:${exp}`;
  const sig = crypto.createHmac("sha256", ticketFileAccessSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyTicketFileAccessToken(st?, ticketId?, fileName?) {
  try {
    const tid = String(ticketId || "").trim();
    const name = String(fileName || "").trim();
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 4) return false;
    const [tokenTid, tokenName, expStr, sig] = parts;
    if (tokenTid !== tid || tokenName !== name) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const payload = `${tokenTid}:${tokenName}:${expStr}`;
    const expect = crypto.createHmac("sha256", ticketFileAccessSecret()).update(payload).digest("base64url");
    return sig === expect;
  } catch (_) {
    return false;
  }
}

function withTicketFileAccessToken(ticketId?, rawUrl?) {
  const url = String(rawUrl || "").trim();
  if (!url || !url.includes("/webhooks/site-web-tickets/files/")) return url;
  const m = /\/files\/[^/]+\/([^/?#]+)/.exec(url);
  if (!m) return url;
  let fileName = "";
  try {
    fileName = decodeURIComponent(m[1]);
  } catch (_) {
    fileName = m[1];
  }
  const st = createTicketFileAccessToken(ticketId, fileName);
  if (!st) return url;
  const base = url.split("?")[0];
  return `${base}?st=${encodeURIComponent(st)}`;
}

function saveTicketImages(ticketId?, imagesInput?) {
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const urls = [];
  const dir = ensureUploadDir(ticketId);
  let idx = 0;
  for (const item of list.slice(0, MAX_IMAGES)) {
    const parsed = parseDataUrlMedia(item);
    if (!parsed) continue;
    idx += 1;
    const name = `${String(idx).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
    fs.writeFileSync(path.join(dir, name), parsed.buffer);
    urls.push(
      `/webhooks/site-web-tickets/files/${encodeURIComponent(String(ticketId))}/${encodeURIComponent(name)}`,
    );
  }
  return urls;
}

function customEmojiCdnUrl(emojiId?, animated?, size = 32) {
  const id = String(emojiId || "").trim();
  if (!id) return "";
  const sz = Number(size) > 0 ? Number(size) : 32;
    if (animated) {
    return `https://cdn.discordapp.com/emojis/${id}.webp?size=${sz}&animated=true`;
  }
  return `https://cdn.discordapp.com/emojis/${id}.webp?size=${sz}`;
}

function parseReactionInput(raw?, body?) {
  const fromBody = body && typeof body === "object" ? body : {};
  let s = String(raw != null ? raw : fromBody.emoji || fromBody.markup || "").trim().slice(0, 80);
  if (!s && fromBody.emojiId) {
    const id = String(fromBody.emojiId || "").trim();
    const name = String(fromBody.name || "emoji")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 64) || "emoji";
    const animated = fromBody.animated === true;
    if (!/^\d{5,32}$/.test(id)) return null;
    s = `<${animated ? "a" : ""}:${name}:${id}>`;
  }
  const custom = /^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/.exec(s);
  if (custom) {
    return {
      key: `c:${custom[3]}`,
      emoji: s,
      emojiId: custom[3],
      name: custom[2],
      animated: custom[1] === "a",
    };
  }
  if (!s || s.length > 16 || /[<>\n\r]/.test(s)) return null;
  return {
    key: `u:${s}`,
    emoji: s,
    emojiId: null,
    name: "",
    animated: false,
  };
}

function normalizeReactionUsers(r?, nameMap?) {
  const fromUsers = Array.isArray(r?.users)
    ? r.users
        .map((u?) => ({
          id: String(u?.id || u?.userId || "").trim(),
          name: String(u?.name || "").trim(),
        }))
        .filter((u?) => u.id)
    : [];
  const byId = new Map();
  for (const u of fromUsers) {
    const mapped = nameMap?.get?.(u.id);
    byId.set(u.id, {
      id: u.id,
      name: u.name || mapped || "Utente",
    });
  }
  const ids = Array.isArray(r?.userIds)
    ? r.userIds.map((id?) => String(id || "").trim()).filter(Boolean)
    : [];
  for (const id of ids) {
    if (byId.has(id)) continue;
    byId.set(id, {
      id,
      name: nameMap?.get?.(id) || "Utente",
    });
  }
  return Array.from(byId.values());
}

function serializeReactions(list?, nameMap?) {
  const rows = Array.isArray(list) ? list : [];
  return rows
    .map((r?) => {
      const users = normalizeReactionUsers(r, nameMap);
      if (!users.length) return null;
      const emojiId = r?.emojiId ? String(r.emojiId).trim() : "";
      const animated = Boolean(r?.animated);
      return {
        key: String(r?.key || "").trim(),
        emoji: String(r?.emoji || "").trim(),
        emojiId: emojiId || null,
        name: String(r?.name || "").trim() || null,
        animated,
        count: users.length,
        userIds: users.map((u?) => u.id),
        users,
        url: emojiId ? customEmojiCdnUrl(emojiId, animated, 32) : null,
      };
    })
    .filter((r?) => r && r.key && r.emoji);
}

function buildReactionNameMap(ticket?, messageDocs?) {
  const map = new Map();
  const put = (id?, name?) => {
    const uid = String(id || "").trim();
    const label = String(name || "").trim();
    if (!uid || !label) return;
    if (!map.has(uid) || map.get(uid) === "Utente") map.set(uid, label);
  };
  if (ticket) {
    put(ticket.userId, ticket.authorName);
    put(ticket.claimedBy, ticket.claimedByName);
    put(ticket.closedBy, ticket.closedByName);
  }
  for (const doc of Array.isArray(messageDocs) ? messageDocs : []) {
    put(doc?.authorId, doc?.authorName);
    const reactions = Array.isArray(doc?.reactions) ? doc.reactions : [];
    for (const r of reactions) {
      for (const u of normalizeReactionUsers(r)) {
        put(u.id, u.name);
      }
    }
  }
  return map;
}

function rememberBotUserId(client?) {
  const id = String(client?.user?.id || "").trim();
  if (id) cachedBotUserId = id;
  return cachedBotUserId;
}

function authorHasStaffSignals(doc?, staffRoles = null) {
  if (String(doc?.authorKind || "") === "staff") return true;
  const authorId = String(doc?.authorId || "").trim();
  if (!authorId || !staffRoles) return false;
  const bucket = staffRoles[authorId];
  return Boolean(bucket?.staff);
}

function resolveMessageAuthorKind(doc?, ticket = null, staffRoles = null) {
  const kind = String(doc?.authorKind || "user");
  if (kind === "bot" || kind === "system") return kind;
  const authorId = String(doc?.authorId || "");
  if (authorId === "bot") return "bot";
  if (cachedBotUserId && authorId === cachedBotUserId) return "bot";
    if (ticket && isTicketCustomerAuthor(doc, ticket)) return "user";
  if (authorHasStaffSignals(doc, staffRoles)) return "staff";
    if (authorId.startsWith("discord:")) {
    const bucket = staffRoles && staffRoles[authorId] ? staffRoles[authorId] : null;
    if (bucket?.staff) return "staff";
    return "user";
  }
  return kind;
}

function normalizePersonName(value?) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}

function foldLeetPersonName(value?) {
  return normalizePersonName(value)
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function personNamesLooselyEqual(a?, b?) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = foldLeetPersonName(na);
  const fb = foldLeetPersonName(nb);
  if (fa && fb && fa === fb) return true;
  if (fa.length >= 4 && fb.length >= 4 && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}

function isTicketCustomerAuthor(doc?, ticket?) {
  if (!doc || !ticket) return false;
  const kind = String(doc.authorKind || "");
  if (kind === "system" || kind === "bot") return false;
  const authorId = String(doc.authorId || "").trim();
  const openerId = String(ticket.userId || "").trim();
  if (openerId && authorId && openerId === authorId) return true;
  if (ticketHasAddedUser(ticket, authorId)) return true;
  const authorName = String(doc.authorName || "").trim();
  if (personNamesLooselyEqual(ticket.authorName, authorName)) return true;
  const added = listAddedUsers(ticket);
  if (added.some((u?) => u.id === authorId || personNamesLooselyEqual(u.name, authorName))) return true;
  if (authorId.startsWith("discord:")) {
    const slug = authorId.slice(8);
    if (personNamesLooselyEqual(ticket.authorName, slug)) return true;
    if (added.some((u?) => personNamesLooselyEqual(u.name, slug))) return true;
  }
  return false;
}

function webTicketMessageKindForActor(actor?, loaded: Record<string, any> = {}) {
  if (loaded.isOwner || loaded.isAdded) return "user";
  if (actor && actor.isStaff) return "staff";
  return "user";
}

function serializeReplyTo(targetDoc?, fallbackId?) {
  const id = String((targetDoc && (targetDoc._id || targetDoc.id)) || fallbackId || "").trim();
  if (!targetDoc) {
    return {
      id,
      deleted: true,
      authorId: "",
      authorName: "",
      content: "",
      hasMedia: false,
    };
  }
  const content = String(targetDoc.content || "").replace(/\s+/g, " ").trim();
  const images = Array.isArray(targetDoc.imageUrls)
    ? targetDoc.imageUrls.map((u?) => String(u || "").trim()).filter(Boolean)
    : [];
  return {
    id: String(targetDoc._id || id),
    deleted: false,
    authorId: String(targetDoc.authorId || ""),
    authorName: String(targetDoc.authorName || "").trim() || "Utente",
    content: content.slice(0, 140),
    hasMedia: images.length > 0,
  };
}

function serializeMessage(doc?, nameMap?, staffRatings?, staffRoles?, ticket = null, replyTarget = undefined) {
  if (!doc) return null;
  const authorId = String(doc.authorId || "");
  const authorKind = resolveMessageAuthorKind(doc, ticket, staffRoles);
  const out: Record<string, any> = {
    id: String(doc._id),
    ticketId: String(doc.ticketId),
    authorId,
    authorName: String(doc.authorName || "").trim() || "Utente",
    authorAvatarUrl: scrubStoredTicketAvatarUrl(doc.authorAvatarUrl),
    authorKind,
    content: String(doc.content || ""),
    imageUrls: Array.isArray(doc.imageUrls)
      ? doc.imageUrls.map((u?) => withTicketFileAccessToken(String(doc.ticketId || ticket?._id || ""), u)).filter(Boolean)
      : [],
    reactions: serializeReactions(doc.reactions, nameMap),
    editedAt: doc.editedAt ? new Date(doc.editedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
  const replyToId = doc.replyToId ? String(doc.replyToId) : "";
  if (replyToId) {
    if (replyTarget === null) out.replyTo = serializeReplyTo(null, replyToId);
    else if (replyTarget && typeof replyTarget === "object") out.replyTo = serializeReplyTo(replyTarget, replyToId);
    else out.replyTo = { id: replyToId, deleted: false };
  }
  if (authorKind === "staff" || authorKind === "user") {
    const bucket = staffRoles && staffRoles[authorId] ? staffRoles[authorId] : null;
    /* ticketStaffOpenTag1: staff che apre il ticket (customer/opener) tiene la tag ruolo —
       prima solo community; staffish veniva strippato se non claimer/staff-kind. */
    const live =
      authorKind === "staff"
        ? bucket?.staff || (bucket?.id ? bucket : null)
        : bucket?.community || bucket?.staff || (bucket?.id ? bucket : null);
            let roleId = String(live?.id || "").trim() || null;
    let roleKey = String(live?.key || "").trim() || null;
    let roleName = String(live?.name || "").trim();
    if (authorKind === "staff") {
      if (!roleId) roleId = String(doc.authorRoleId || "").trim() || null;
      if (!roleKey) roleKey = String(doc.authorRoleKey || "").trim() || null;
      if (!roleName) roleName = String(doc.authorRoleName || "").trim();
      roleName = roleName ? cleanStaffRoleDisplayName(roleName) : "";
      if (/^staff$/i.test(roleName) && !live?.key) roleName = "";
    } else {
      if (!roleName) roleName = String(doc.authorRoleName || "").trim();
      if (!roleKey) roleKey = String(doc.authorRoleKey || "").trim();
      if (!roleId) roleId = String(doc.authorRoleId || "").trim() || null;
      const storedKey = String(roleKey || "").toLowerCase();
      const staffish =
        /^(founder|manager|admin|director|high-staff|highstaff|senior-mod|mod|trial|pm|helper|partner-manager|community-manager|staff)$/i.test(
          storedKey,
        ) ||
        /^(founder|director|manager|admin|high.?staff|senior.?mod|moderator|^mod$|helper|partner.?manager)$/i.test(
          roleName,
        );
      if (staffish && !live) {
        /* niente bucket live → non inventare tag staff fantasma */
        roleId = null;
        roleKey = "";
        roleName = "";
      } else if (live?.name) {
        roleName = cleanStaffRoleDisplayName(String(live.name).trim()).slice(0, 48);
        if (!roleKey) roleKey = String(live.key || "").trim() || roleKey;
        if (!roleId) roleId = String(live.id || "").trim() || roleId;
        if (/^staff$/i.test(roleName) && !live?.key) roleName = "";
      } else if (/^staff$/i.test(roleName)) {
        roleName = "";
      } else {
        roleName = roleName.slice(0, 48);
      }
    }
    if (roleId) out.authorRoleId = roleId;
    if (roleName) out.authorRoleName = roleName;
    if (roleKey && roleName) out.authorRoleKey = roleKey;
  }
  if (authorKind === "staff" && staffRatings && typeof staffRatings === "object") {
    const avg = staffRatings[authorId];
    if (avg != null && Number.isFinite(Number(avg))) {
      out.authorAvgRating = Math.round(Number(avg) * 10) / 10;
    }
  }
  const receipt = messageReceiptStatus(doc);
  if (receipt) {
    out.receiptStatus = receipt;
    out.read = receipt === "read";
  }
  return out;
}

function messageReceiptStatus(doc?) {
  const kind = String(doc?.authorKind || "").toLowerCase();
  if (kind === "system" || kind === "bot") return null;
  const authorId = String(doc?.authorId || "").trim();
  if (!authorId) return null;
  const readBy = Array.isArray(doc?.readBy) ? doc.readBy : [];
  const read = readBy.some((r?) => {
    const uid = String(r?.userId || "").trim();
    return uid && uid !== authorId;
  });
  return read ? "read" : "sent";
}

async function markTicketMessagesRead(ticketId?, readerId?, messageDocs?) {
  const reader = String(readerId || "").trim();
  const tid = ticketId;
  if (!reader || !tid) return { messageIds: [], at: null };
  const at = new Date();
  const candidates = (Array.isArray(messageDocs) ? messageDocs : []).filter((m?) => {
    if (!m || !m._id) return false;
    const kind = String(m.authorKind || "").toLowerCase();
    if (kind === "system" || kind === "bot") return false;
    if (String(m.authorId || "") === reader) return false;
    const already = (Array.isArray(m.readBy) ? m.readBy : []).some(
      (r?) => String(r?.userId || "") === reader,
    );
    return !already;
  });
  const ids = candidates.map((m?) => m._id);
  if (!ids.length) return { messageIds: [], at: null };
  await SiteWebTicketMessage.updateMany(
    {
      _id: { $in: ids },
      readBy: { $not: { $elemMatch: { userId: reader } } },
    },
    { $push: { readBy: { userId: reader, at } } },
  ).catch(() => null);
  const idSet = new Set(ids.map((id?) => String(id)));
  for (const m of messageDocs || []) {
    if (!idSet.has(String(m?._id || ""))) continue;
    if (!Array.isArray(m.readBy)) m.readBy = [];
    m.readBy.push({ userId: reader, at });
  }
  try {
    const { cancelChatDmFallback } = require("./siteChatDmFallback") as typeof import("./siteChatDmFallback");
    cancelChatDmFallback("ticket", String(tid), reader);
  } catch (_) {}
  return { messageIds: [...idSet], at: at.toISOString() };
}

function avgFromStaffRatingFields(staff?) {
  const count = Math.max(0, Math.floor(Number(staff?.webTicketRatingCount) || 0));
  const sum = Number(staff?.webTicketRatingSum) || 0;
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

async function staffAvgRatingMap(guildId?, userIds?) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  if (!gid || !ids.length) return {};
  const docs = await ActivityUserProfile.find({ guildId: gid, userId: { $in: ids } })
    .select({ userId: 1, "staff.webTicketRatingSum": 1, "staff.webTicketRatingCount": 1 })
    .lean()
    .catch(() => []);
  const map: Record<string, any> = {};
  for (const d of docs || []) {
    const avg = avgFromStaffRatingFields(d?.staff);
    if (avg != null) map[String(d.userId)] = avg;
  }
  return map;
}

async function resolveReplyTargetForTicket(ticketId?, rawId?) {
  const id = String(rawId || "").trim();
  if (!id || !mongoose.isValidObjectId(id) || !ticketId) return null;
  const target = await SiteWebTicketMessage.findOne({ _id: id, ticketId })
    .select({ authorId: 1, authorName: 1, authorKind: 1, content: 1, imageUrls: 1 })
    .lean()
    .catch(() => null);
  if (!target) return null;
  if (String(target.authorKind || "") === "system") return null;
  return target;
}

function serializeMessagesWithReplies(messages?, nameMap?, staffRatings?, staffRoles?, ticket?) {
  const list = Array.isArray(messages) ? messages : [];
  const byId = new Map(list.map((m?) => [String(m && m._id), m]));
  return list.map((m?) => {
    const rid = m && m.replyToId ? String(m.replyToId) : "";
    const target = rid ? byId.get(rid) || null : undefined;
    return serializeMessage(m, nameMap, staffRatings, staffRoles, ticket, rid ? target : undefined);
  });
}

async function serializeMessageWithStaffRating(doc?, nameMap?, guildId?, client = null, ticket = null, replyTarget = undefined) {
  const authorId = String(doc?.authorId || "").trim();
  const nameHints =
    authorId.startsWith("discord:")
      ? { [authorId]: String(doc?.authorName || authorId.slice(8) || "").trim() }
      : {};
  const roles = client
    ? await buildStaffRoleMapForUserIds(client, guildId, authorId ? [authorId] : [], { nameHints })
    : {};
  let target = replyTarget;
  if (target === undefined && doc?.replyToId) {
    const found = await SiteWebTicketMessage.findById(doc.replyToId)
      .select({ authorId: 1, authorName: 1, authorKind: 1, content: 1, imageUrls: 1 })
      .lean()
      .catch(() => null);
    target = found || null;
  }
  const kind = resolveMessageAuthorKind(doc, ticket, roles);
  if (kind !== "staff" && kind !== "user") return serializeMessage(doc, nameMap, null, null, ticket, target);
  const ratings = kind === "staff" ? await staffAvgRatingMap(guildId, [authorId]) : {};
  return serializeMessage(doc, nameMap, ratings, roles, ticket, target);
}

async function resolveRateableStaffer(ticket?) {
  if (!ticket) return null;
  const ownerId = String(ticket.userId || "").trim();
  const claimedId = String(ticket.claimedBy || "").trim();
  if (claimedId && claimedId !== ownerId) {
    return {
      id: claimedId,
      name: String(ticket.claimedByName || "").trim() || "Staff",
    };
  }
  const last = await SiteWebTicketMessage.findOne({
    ticketId: ticket._id,
    authorKind: "staff",
  })
    .sort({ createdAt: -1 })
    .select({ authorId: 1, authorName: 1 })
    .lean()
    .catch(() => null);
  const sid = String(last?.authorId || "").trim();
  if (sid && sid !== ownerId) {
    return {
      id: sid,
      name: String(last?.authorName || "").trim() || "Staff",
    };
  }
    const closedBy = String(ticket.closedBy || "").trim();
  if (closedBy && closedBy !== ownerId) {
    return {
      id: closedBy,
      name: String(ticket.closedByName || "").trim() || "Staff",
    };
  }
  return null;
}

function clampStarRating(raw?) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

async function refreshTicketLastMessageFields(ticket?) {
  if (!ticket) return ticket;
  const last: any = await SiteWebTicketMessage.findOne({ ticketId: ticket._id })
    .sort({ createdAt: -1 })
    .lean();
  if (!last) {
    ticket.lastMessageAt = ticket.createdAt || new Date();
    ticket.lastMessagePreview = "";
    ticket.lastAuthorKind = "system";
    ticket.messageCount = 0;
  } else {
    ticket.lastMessageAt = last.createdAt || new Date();
    ticket.lastMessagePreview = previewFromContent(last.content, Array.isArray(last.imageUrls) ? last.imageUrls.length : 0);
    ticket.lastAuthorKind = String(last.authorKind || "user");
    ticket.messageCount = await SiteWebTicketMessage.countDocuments({ ticketId: ticket._id });
  }
  await ticket.save();
  return ticket;
}

async function listGuildEmojisCached(client?, guildId?, { force = false } = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return [];
  const now = Date.now();
  if (
    !force &&
    guildEmojiCache.guildId === gid &&
    now - guildEmojiCache.at < EMOJI_CACHE_TTL_MS &&
    Array.isArray(guildEmojiCache.emojis)
  ) {
    return guildEmojiCache.emojis;
  }
  try {
    const { listGuildPickerData } = require("./siteDashboardPartnershipApi") as typeof import("./siteDashboardPartnershipApi");
    const pickers = await listGuildPickerData(client, gid, { force: force === true });
    const emojis = Array.isArray(pickers?.emojis) ? pickers.emojis : [];
    guildEmojiCache = { guildId: gid, at: now, emojis };
    return emojis;
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] listGuildEmojisCached:", err?.message || err);
    return guildEmojiCache.guildId === gid ? guildEmojiCache.emojis : [];
  }
}

function serializeTicket(doc?, { includeStaffFields = false, permissions = null, rateableStaffer = null } = {}) {
  if (!doc) return null;
  const status = String(doc.status || WEB_TICKET_STATUS.OPEN);
  const ratingTicketScore =
    doc.ratingTicketScore != null && Number.isFinite(Number(doc.ratingTicketScore))
      ? Math.max(1, Math.min(5, Math.round(Number(doc.ratingTicketScore))))
      : null;
  const ratingStafferScore =
    doc.ratingStafferScore != null && Number.isFinite(Number(doc.ratingStafferScore))
      ? Math.max(1, Math.min(5, Math.round(Number(doc.ratingStafferScore))))
      : null;
  const ratedStafferId = String(doc.ratedStafferId || "").trim() || null;
  const ratedStafferName = String(doc.ratedStafferName || "").trim() || null;
  const alreadyRated = Boolean(doc.ratingAt) || ratingStafferScore != null;
  let rateable = null;
  if (alreadyRated && ratedStafferId) {
    rateable = { id: ratedStafferId, name: ratedStafferName || "Staff" };
  } else if (rateableStaffer && rateableStaffer.id) {
    rateable = {
      id: String(rateableStaffer.id),
      name: String(rateableStaffer.name || "").trim() || "Staff",
    };
  } else if (doc.claimedBy) {
    rateable = {
      id: String(doc.claimedBy),
      name: String(doc.claimedByName || "").trim() || "Staff",
    };
  }
  const out: Record<string, any> = {
    id: String(doc._id),
    ticketNumber: Number(doc.ticketNumber) || null,
    userId: String(doc.userId || ""),
    authorName: String(doc.authorName || "").trim() || "Utente",
    authorAvatarUrl: scrubStoredTicketAvatarUrl(doc.authorAvatarUrl),
    category: String(doc.category || "supporto"),
    categoryLabel: CATEGORY_LABELS[doc.category] || "Supporto",
    subject: buildWebTicketChannelName(doc),
    channelName: buildWebTicketChannelName(doc),
    displayName: formatWebTicketDisplayName(doc),
    renameTail: webTicketNameTail(doc),
    status,
    claimedBy: doc.claimedBy ? String(doc.claimedBy) : null,
    claimedByName: String(doc.claimedByName || "").trim() || null,
    claimedAt: doc.claimedAt ? new Date(doc.claimedAt).toISOString() : null,
    closedAt: doc.closedAt ? new Date(doc.closedAt).toISOString() : null,
    closedBy: doc.closedBy ? String(doc.closedBy) : null,
    closedByName: String(doc.closedByName || "").trim() || null,
    closeReason: String(doc.closeReason || "").trim() || null,
    lastMessageAt: doc.lastMessageAt ? new Date(doc.lastMessageAt).toISOString() : null,
    lastMessagePreview: String(doc.lastMessagePreview || "").trim(),
    lastAuthorKind: String(doc.lastAuthorKind || "user"),
    messageCount: Math.max(0, Number(doc.messageCount) || 0),
    addedUsers: listAddedUsers(doc),
    closeRequestedBy: doc.closeRequestedBy ? String(doc.closeRequestedBy) : null,
    closeRequestedByName: String(doc.closeRequestedByName || "").trim() || null,
    closeRequestedAt: doc.closeRequestedAt ? new Date(doc.closeRequestedAt).toISOString() : null,
    closeRequestReason: String(doc.closeRequestReason || "").trim() || null,
    ratingTicketScore,
    ratingStafferScore,
    ratingBy: doc.ratingBy ? String(doc.ratingBy) : null,
    ratingAt: doc.ratingAt ? new Date(doc.ratingAt).toISOString() : null,
    ratedStafferId,
    ratedStafferName,
    rateableStafferId: rateable?.id || null,
    rateableStafferName: rateable?.name || null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
  const pmTier = Math.floor(Number(doc.partnerManagerShopRedeemTier) || 0);
  if (pmTier === 150 || pmTier === 200 || pmTier === 250) {
    out.partnerManagerShopRedeemTier = pmTier;
    out.partnerManagerShopRedeemAckResult = String(doc.partnerManagerShopRedeemAckResult || "").trim() || null;
    out.isPartnerManagerShopRedeem = true;
  }
  if (permissions && typeof permissions === "object") {
    const nextPerms = { ...permissions };
    nextPerms.canRate = Boolean(
      nextPerms.canRate && status === WEB_TICKET_STATUS.CLOSED && !alreadyRated && rateable?.id,
    );
    out.permissions = nextPerms;
  }
  return out;
}

function previewFromContent(content?, imageCount?) {
  let text = sanitizeText(content, 400);
  if (/nessun contenuto/i.test(text) || /^…altre \d+ messaggi/i.test(text)) {
    text = "";
  }
    if (text) {
    text = text
      .replace(/\\n/gi, " ")
      .replace(/\[Embed\s+\d+\]/gi, " ")
      .replace(/\[Embed\s+(?:image|thumb)\]\s*\S+/gi, " ")
      .replace(/\[Attachment\]\s*\S+/gi, " ")
      .replace(/\[Sticker\][^\n]*/gi, " ")
      .replace(/\b(?:Title|Titolo|Description|Descrizione|Author|Autore|Footer|Fields?|Campo)\s*:\s*/gi, " ")
      .replace(/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>/g, " ")
      .replace(/<@!?&?#?\d{5,32}>/g, " ")
      .replace(/<\s*(\d{15,22})\s*>/g, " ")
      .replace(/\*?Nessun contenuto[^*\n]*/gi, " ")
      .replace(/:\w+:/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
            .replace(/\s*@utente\b/gi, " ")
      .replace(/\s*@(?:ruolo|canale)\b/gi, " ")
      .replace(/\s*#canale\b/gi, " ")
      .replace(/\s*[·•|]\s*/g, " · ")
      .replace(/(?:\s*·\s*)+/g, " · ")
      .replace(/^\s*·\s*|\s*·\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }
  if (/nessun contenuto/i.test(text)) text = "";
  if (text) return text;
  if (imageCount > 0) return imageCount === 1 ? "📷 Immagine" : `📷 ${imageCount} immagini`;
  return "";
}

function emitTicketEvent(payload?) {
  try {
    const next = payload && typeof payload === "object" ? { ...payload } : payload;
    if (next && next.ticket && typeof next.ticket === "object" && next.ticket.permissions) {
      next.ticket = { ...next.ticket };
      delete next.ticket.permissions;
    }
    broadcastSiteWebTicketsEvent(next);
  } catch {
      }
}

function unclaimedWebTicketFilter(guildId?, category?) {
  return {
    guildId: String(guildId),
    category: String(category),
    status: { $ne: WEB_TICKET_STATUS.CLOSED },
    $or: [{ claimedBy: null }, { claimedBy: "" }, { claimedBy: { $exists: false } }],
  };
}

async function listStaffRecipientsForCategory(client?, guildId?, category?, excludeUserIds = []) {
  const excluded = new Set(
    (Array.isArray(excludeUserIds) ? excludeUserIds : [excludeUserIds])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;
  const recipients = new Set();
  try {
    if (guild) {
      for (const m of guild.members.cache.values()) {
        if (!m || m.user?.bot) continue;
        if (!memberCanAccessTicketCategory(m, category)) continue;
        recipients.add(String(m.id));
      }
      if (!recipients.size && guild.members.cache.size < guild.memberCount) {
        await guild.members.fetch({ limit: 200 }).catch(() => null);
        for (const m of guild.members.cache.values()) {
          if (!m || m.user?.bot) continue;
          if (!memberCanAccessTicketCategory(m, category)) continue;
          recipients.add(String(m.id));
        }
      }
    }
  } catch {
      }
  return [...recipients].filter((id?) => id && !excluded.has((id as any))).slice(0, 60);
}

function isTicketChatParticipant(ticket?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  if (uid === String(ticket?.userId || "").trim()) return true;
  if (uid === String(ticket?.claimedBy || "").trim()) return true;
  return ticketHasAddedUser(ticket, uid);
}

async function refreshStaffTicketQueueNotif(
  client?,
  guildId?,
  category?,
  { push = true, excludeUserIds = [], clearOnlyUserIds = null, previewHint = "" } = {},
) {
  const gid = String(guildId || "").trim();
  const cat = normalizeCategory(category) || "supporto";
  if (!gid) return;
  const filter = unclaimedWebTicketFilter(gid, cat);
  const count = await SiteWebTicket.countDocuments(filter).catch(() => 0);
  const latest =
    count > 0
      ? await SiteWebTicket.findOne(filter)
          .sort({ lastMessageAt: -1, createdAt: -1 })
          .select("_id subject authorName ticketNumber")
          .lean()
          .catch(() => null)
      : null;
  const recipients = await listStaffRecipientsForCategory(client, gid, cat, excludeUserIds);
  const label = CATEGORY_LABELS[cat] || cat;
  const sid = String(latest?._id || "");
  const author = String(latest?.authorName || "Un utente").trim() || "Un utente";
  const subject = String(latest?.subject || "").trim() || label;
  const title = count === 1 ? author : `${count} ticket da claimare`;
  const hint = String(previewHint || "").trim().slice(0, 100);
  /* ticketMsgQueuePush1: preview messaggio → body cambia → push anche sullo stesso ticket */
  const body =
    count === 1
      ? hint
        ? `${label} · ${subject} — ${hint}`
        : `${label} · ${subject}`
      : hint
        ? `Ultimo: ${author} · ${subject} — ${hint}`
        : `Ultimo: ${author} · ${subject}`;
  /* notifPerStaffRead1 + ticketQueueFresh1: clearOnly = solo claimer perde la coda;
     agli altri resta; se il latest ticket cambia, enqueue forza unread+push. */
  const clearOnly = Array.isArray(clearOnlyUserIds)
    ? new Set(clearOnlyUserIds.map((id?) => String(id || "").trim()).filter(Boolean))
    : null;
  await Promise.all(
    recipients.map(async (userId?) => {
      const dedupeKey = `web_ticket:queue:${cat}:${userId}`;
      if (count <= 0) {
        if (clearOnly && !clearOnly.has(String(userId))) return;
        await removeInboxItemByDedupeKey(userId, dedupeKey).catch(() => null);
        return;
      }
      await enqueueSiteInAppNotification({
        guildId: gid,
        userId,
        title,
        body,
        kind: "web_ticket",
        channel: "inbox",
        openUrl: `/tickets/?view=staff&ticketId=${sid}#${sid}`,
        ticketId: sid,
        dedupeKey,
        replaceDedupe: true,
        push,
        forceUnread: Boolean(hint),
      }).catch(() => null);
    }),
  ).catch(() => null);
}

async function notifyStaffNewTicket(client?, guildId?, ticket?) {
  if (!guildId || !ticket) return;
  const category = normalizeCategory(ticket.category) || "supporto";
  await refreshStaffTicketQueueNotif(client, guildId, category, {
    push: true,
    excludeUserIds: [ticket.userId],
  });
}

async function notifyMentionedUsers(
  client?,
  guildId?,
  ticket?,
  authorId?,
  authorName?,
  content?,
  { allowRoleMentions = false } = {},
) {
  /* notifUseful1: notify participants too (staff Inbox Mentions / opener Personali) */
  const gid = String(guildId || "").trim();
  if (!gid || !content) return [];
  const { userIds, roleIds } = parseMentionTargets(content);
  const effectiveRoleIds = allowRoleMentions ? roleIds : [];
  if (!userIds.length && !effectiveRoleIds.length) return [];

  const guild =
    client?.guilds?.cache?.get?.(gid) ||
    (await client?.guilds?.fetch?.(gid).catch?.(() => null)) ||
    null;
  const recipients = new Set(userIds.filter((id?) => id && id !== String(authorId || "")));

  if (guild && effectiveRoleIds.length) {
    for (const roleId of effectiveRoleIds) {
      const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
      if (!role) continue;
      for (const m of role.members.values()) {
        if (!m || m.user?.bot) continue;
        if (String(m.id) === String(authorId || "")) continue;
        recipients.add(String(m.id));
      }
    }
  }

  const sid = String(ticket?._id || ticket?.id || "");
  const preview = previewFromContent(content, 0) || "Ti hanno menzionato";
  const safeAuthor = String(authorName || "Qualcuno").trim() || "Qualcuno";
  const mentioned = [...recipients].slice(0, 40);
  await Promise.all(
    mentioned.map((userId?) => {
      if (shouldSkipWebTicketInAppNotif(userId, sid, "mention")) return Promise.resolve(false);
      const openUrl = ticketChatOpenUrl(ticket, userId);
      const staffView = openUrl.includes("view=staff");
      return enqueueSiteInAppNotification({
        guildId: gid,
        userId,
        title: staffView ? `${safeAuthor} ti ha menzionato` : `${safeAuthor} ti ha menzionato`,
        body: preview,
        kind: "web_ticket_mention",
        channel: staffView ? "inbox" : "personal",
        openUrl,
        ticketId: sid,
        dedupeKey: `web_ticket:mention:${sid}:${userId}`,
        replaceDedupe: true,
      });
    }),
  ).catch(() => null);
  return mentioned;
}

async function notifyUserTicketEvent(guildId?, ticket?, title?, body?, targetUserId = null, { mode = "event", openUrl }: any = {}) {
  const userId = String(targetUserId || ticket?.userId || "").trim();
  if (!guildId || !userId) return;
  const sid = String(ticket._id || ticket.id || "");
  if (shouldSkipWebTicketInAppNotif(userId, sid, mode)) return;
  const key = mode === "claimed" ? `web_ticket:claimed:${sid}` : `web_ticket:${mode}:${sid}:${userId}`;
  const isStaffTarget = Boolean(openUrl && String(openUrl).includes("view=staff"));
  await enqueueSiteInAppNotification({
    guildId,
    userId,
    title,
    body,
    kind: "web_ticket",
    channel: isStaffTarget ? "inbox" : "personal",
    openUrl: openUrl || `/tickets/?ticketId=${sid}#${sid}`,
    ticketId: sid,
    dedupeKey: key,
    dedupeWindowMs: 86_400_000,
    replaceDedupe: mode === "claimed" || mode === "closed" || mode === "close-request" || mode === "close-rejected",
  }).catch(() => null);
  if (mode === "closed" && !isStaffTarget) {
    await removeInboxItemByDedupeKey(userId, `web_ticket:needs_reply:${sid}`).catch(() => null);
    await removeInboxItemByDedupeKey(userId, `web_ticket:staff_reply:${sid}`).catch(() => null);
  }
}

function ticketChatOpenUrl(ticket?, userId?) {
  const sid = String(ticket?._id || ticket?.id || "");
  const owner = String(ticket?.userId || "").trim();
  const added = ticketHasAddedUser(ticket, userId);
  if (String(userId) === owner || added) return `/tickets/?ticketId=${sid}#${sid}`;
  return `/tickets/?view=staff&ticketId=${sid}#${sid}`;
}

async function clearTicketNeedsReplyNotif(ticket?, userId?) {
  const sid = String(ticket?._id || ticket?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!sid || !uid) return;
  await removeInboxItemByDedupeKey(uid, `web_ticket:needs_reply:${sid}`).catch(() => null);
  await removeInboxItemByDedupeKey(uid, `web_ticket:staff_reply:${sid}`).catch(() => null);
}

/** Destinatari tipici delle notif di un ticket (owner/claimer/added/autori + opz. staff categoria). */
async function listTicketNotifRecipientIds(client?, ticket?, { includeCategoryStaff = false } = {}) {
  const ids = new Set();
  const owner = String(ticket?.userId || "").trim();
  const claimer = String(ticket?.claimedBy || "").trim();
  if (owner) ids.add(owner);
  if (claimer) ids.add(claimer);
  for (const u of listAddedUsers(ticket)) {
    if (u?.id) ids.add(String(u.id));
  }
  try {
    const authors = await listTicketMessageAuthorIds(ticket?._id || ticket?.id);
    for (const id of authors || []) {
      const s = String(id || "").trim();
      if (s) ids.add(s);
    }
  } catch (_) {}
  if (includeCategoryStaff && client) {
    try {
      const staff = await listStaffRecipientsForCategory(
        client,
        String(ticket?.guildId || "").trim(),
        ticket?.category || "supporto",
        owner ? [owner] : [],
      );
      for (const id of staff || []) ids.add(String(id));
    } catch (_) {}
  }
  return [...ids].filter(Boolean);
}

/**
 * ticketSmartNotif1: purge inbox+OS per un ticket su più utenti.
 * Non tocca web_ticket:queue:* (refresh coda a parte).
 */
async function purgeTicketNotifications(
  client?,
  ticket?,
  { includeCategoryStaff = false, excludeUserIds = [], forceDismiss = true } = {},
) {
  const sid = String(ticket?._id || ticket?.id || "").trim();
  if (!sid) return 0;
  const excluded = new Set(
    (Array.isArray(excludeUserIds) ? excludeUserIds : [excludeUserIds])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
  const recipients = (await listTicketNotifRecipientIds(client, ticket, { includeCategoryStaff })).filter(
    (id?) => !excluded.has((id as any)),
  );
  let n = 0;
  await Promise.all(
    recipients.map(async (userId?) => {
      const removed = await removeSiteInAppNotificationsForTicket(userId, sid, { forceDismiss }).catch(() => 0);
      n += Number(removed) || 0;
    }),
  ).catch(() => null);
  return n;
}

async function notifyTicketChatMessage(
  ticket?,
  {
    authorId,
    authorName,
    preview,
    kind,
    messageId,
    skipUserIds = [],
    client = null,
    deferStaffToQueue = false,
  }: any = {},
) {
  /* notifUseful1: opener Personali (staff reply / needs reply) + staff Inbox new-msg for participants */
  if (!ticket) return;
  const guildId = String(ticket.guildId || "").trim();
  const sid = String(ticket._id || ticket.id || "");
  const author = String(authorId || "").trim();
  if (!guildId || !sid || !author) return;
  const skip = new Set(
    (Array.isArray(skipUserIds) ? skipUserIds : [skipUserIds]).map((id?) => String(id || "").trim()).filter(Boolean),
  );
  skip.add(author);

  try {
    const { cancelChatDmFallback } = require("./siteChatDmFallback") as typeof import("./siteChatDmFallback");
    cancelChatDmFallback("ticket", sid, author);
  } catch (_) {}

  const recipients = new Set();
  const claimer = String(ticket.claimedBy || "").trim();
  const owner = String(ticket.userId || "").trim();
  if (claimer) recipients.add(claimer);
  if (owner) recipients.add(owner);
  for (const u of listAddedUsers(ticket)) {
    if (u.id) recipients.add(u.id);
  }
  /* ticketSmartNotif1: se claimato → solo claimer/owner/added (niente autori storici staff) */
  if (!claimer) {
    try {
      const authors = await listTicketMessageAuthorIds(ticket._id || ticket.id);
      for (const id of authors || []) recipients.add(String(id));
    } catch (_) {}
  }

  for (const id of skip) recipients.delete(id);
  /* pushDismissDedup1: ticket libero → staff avvisati solo via coda (niente chat+queue doppie) */
  if (deferStaffToQueue && client && !claimer) {
    try {
      const staffIds = await listStaffRecipientsForCategory(client, guildId, ticket.category || "supporto", []);
      for (const id of staffIds || []) recipients.delete(String(id));
    } catch (_) {}
  }
  if (!recipients.size) return;

  const subject = String(ticket.subject || ticket.channelName || "").trim() || "Ticket";
  const safeAuthor = String(authorName || "Qualcuno").trim() || "Qualcuno";
  const previewText = String(preview || "Nuovo messaggio").trim() || "Nuovo messaggio";
  const authorIsStaff = String(kind || "").trim().toLowerCase() === "staff";
  const dmTargets = [];

  if (authorIsStaff && owner && !skip.has(owner)) {
    const ownerOpen = `/tickets/?ticketId=${sid}#${sid}`;
    const ownerBody = previewText.startsWith(safeAuthor) ? previewText : `${safeAuthor}: ${previewText}`;
    /* Una sola notifica personale: risposta staff + CTA a rispondere (niente doppio staff_reply/needs_reply) */
    await enqueueSiteInAppNotification({
      guildId,
      userId: owner,
      title: "Staff ha risposto",
      body: ownerBody,
      kind: "web_ticket",
      channel: "personal",
      openUrl: ownerOpen,
      ticketId: sid,
      dedupeKey: `web_ticket:staff_reply:${sid}`,
      replaceDedupe: true,
      fromName: safeAuthor,
      ticketLabel: subject,
      preview: previewText,
      messageId,
      collapseChat: true,
    }).catch(() => null);
    /* Pulisci eventuale needs_reply legacy ancora in inbox */
    await removeInboxItemByDedupeKey(owner, `web_ticket:needs_reply:${sid}`).catch(() => null);
    dmTargets.push({
      userId: owner,
      openPath: ownerOpen,
      title: "Staff ha risposto",
      body: ownerBody,
    });
    recipients.delete(owner);
  }

  if (!authorIsStaff && owner && author === owner) {
    await clearTicketNeedsReplyNotif(ticket, owner);
    await removeInboxItemByDedupeKey(owner, `web_ticket:sla:${sid}`).catch(() => null);
  }

  await Promise.all(
    [...recipients].map((userId?) => {
      const openUrl = ticketChatOpenUrl(ticket, userId);
      const staffView = openUrl.includes("view=staff");
      const title = staffView ? "Nuovo messaggio" : safeAuthor;
      dmTargets.push({ userId, openPath: openUrl, title, body: previewText });
      return enqueueSiteInAppNotification({
        guildId,
        userId,
        title,
        body: previewText,
        kind: "web_ticket",
        channel: staffView ? "inbox" : "personal",
        openUrl,
        ticketId: sid,
        dedupeKey: `web_ticket:chat:${sid}:${userId}`,
        replaceDedupe: true,
        collapseChat: true,
        fromName: safeAuthor,
        ticketLabel: subject,
        preview: previewText,
        messageId,
      });
    }),
  ).catch(() => null);

  if (!authorIsStaff && claimer) {
    await removeInboxItemByDedupeKey(claimer, `web_ticket:sla:${sid}`).catch(() => null);
  }

  if (client && dmTargets.length) {
    try {
      const { scheduleChatDmFallback } = require("./siteChatDmFallback") as typeof import("./siteChatDmFallback");
      for (const t of dmTargets) {
        void scheduleChatDmFallback(client, {
          scope: "ticket",
          threadId: sid,
          userId: t.userId,
          guildId,
          messageId,
          openPath: t.openPath,
          title: t.title,
          body: t.body,
          label: subject,
          kind: "web_ticket",
        });
      }
    } catch (_) {}
  }
}

async function createSystemMessage(ticket?, content?) {
  /* ticketClaimHard1: updateOne evita VersionError dopo findOneAndUpdate (claim atomico) */
  const msg = await SiteWebTicketMessage.create({
    guildId: String(ticket.guildId),
    ticketId: ticket._id,
    authorId: "system",
    authorName: "Sistema",
    authorAvatarUrl: "",
    authorKind: "system",
    content: sanitizeText(content, MAX_CONTENT),
    imageUrls: [],
  });
  const now = new Date();
  const preview = previewFromContent(content, 0);
  await SiteWebTicket.updateOne(
    { _id: ticket._id },
    {
      $set: {
        lastMessageAt: now,
        lastMessagePreview: preview,
        lastAuthorKind: "system",
      },
      $inc: { messageCount: 1 },
    },
  ).catch(() => null);
  try {
    ticket.lastMessageAt = now;
    ticket.lastMessagePreview = preview;
    ticket.lastAuthorKind = "system";
    ticket.messageCount = Math.max(0, Number(ticket.messageCount) || 0) + 1;
  } catch {
    /* in-memory sync best-effort */
  }
  return msg;
}

function serializeTicketForActor(actor?, ticket?, { isOwner = false, isAdded = false, includeStaffFields = null } = {}) {
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner, isAdded });
  return serializeTicket(ticket, {
    includeStaffFields: includeStaffFields ?? Boolean(actor.isStaff || isOwner || isAdded),
    permissions: perms,
  });
}

function ticketBroadcastPayload(serializedOrDoc?, { includeStaffFields = true } = {}) {
  const base =
    serializedOrDoc && typeof serializedOrDoc === "object" && serializedOrDoc.id && serializedOrDoc.permissions !== undefined
      ? { ...serializedOrDoc }
      : serializeTicket(serializedOrDoc, { includeStaffFields });
  if (base && typeof base === "object") {
    delete base.permissions;
  }
  return base;
}

function isWebTicketPrefixInput(raw?) {
  return /^[+!/]/.test(String(raw || "").trim());
}

function normalizeWebTicketPrefixInput(raw?, defaultPrefix?) {
  let input = sanitizeText(raw, 500);
  if (!input || !isWebTicketPrefixInput(input)) return null;
  const prefix = String(defaultPrefix || "+").trim() || "+";
  if (input.startsWith("!") || input.startsWith("/")) {
    input = prefix + input.slice(1);
  }
  return input;
}

function embedPayloadToPlain(emb?) {
  if (!emb) return "";
  let data = emb;
  if (typeof emb.toJSON === "function") {
    try {
      data = emb.toJSON();
    } catch {
      data = emb.data || emb;
    }
  } else if (emb.data && typeof emb.data === "object") {
    data = emb.data;
  }
  const parts = [];
  if (data.author?.name) parts.push(String(data.author.name).trim());
  if (data.title) parts.push(String(data.title).trim());
  if (data.description) parts.push(String(data.description).trim());
  if (Array.isArray(data.fields)) {
    for (const field of data.fields) {
      if (!field) continue;
      const line = `${field.name || ""}: ${field.value || ""}`.trim();
      if (line && line !== ":") parts.push(line);
    }
  }
  if (data.footer?.text) parts.push(String(data.footer.text).trim());
  return parts.filter(Boolean).join("\n").trim();
}

function extractComponentsHint(components?) {
  if (!Array.isArray(components) || !components.length) return "";
  const links = [];
  const labels = [];
  const walk = (node?) => {
    if (!node) return;
    let data = node;
    if (typeof node.toJSON === "function") {
      try {
        data = node.toJSON();
      } catch {
        data = node.data || node;
      }
    } else if (node.data && typeof node.data === "object") {
      data = node.data;
    }
    const label = data.label ? String(data.label).trim() : "";
    const url = data.url ? String(data.url).trim() : "";
        if (url && /^https?:\/\//i.test(url)) {
      links.push(label ? `[${label}](${url})` : url);
    } else if (label) {
      labels.push(label);
    }
    const kids = data.components || node.components;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  components.forEach(walk);
  const parts = [];
  if (links.length) parts.push(links.slice(0, 8).join(" · "));
  if (labels.length) {
    parts.push(`Pulsanti (solo su Discord): ${labels.slice(0, 8).join(", ")}`);
  } else if (!links.length) {
    return "Questo comando ha inviato pulsanti Discord che non sono disponibili sul sito.";
  }
  return parts.join("\n");
}

function extractCommandOutput(payload?) {
  if (payload == null) return "";
  if (typeof payload === "string") return payload.trim();
  if (typeof payload !== "object") return String(payload);
  if (typeof payload.toJSON === "function" && (payload.data || payload.title || payload.description)) {
    const asEmbed = embedPayloadToPlain(payload);
    if (asEmbed) return asEmbed;
  }
  const parts = [];
  if (payload.content) parts.push(String(payload.content).trim());
  const embeds = Array.isArray(payload.embeds)
    ? payload.embeds
    : payload.embed
      ? [payload.embed]
      : [];
  for (const emb of embeds) {
    const text = embedPayloadToPlain(emb);
    if (text) parts.push(text);
  }
  const hint = extractComponentsHint(payload.components);
  if (hint) parts.push(hint);
  if (Array.isArray(payload.files) && payload.files.length && !parts.length) {
    parts.push("Il comando ha inviato un file che non può essere mostrato qui.");
  }
  return parts.filter(Boolean).join("\n").trim();
}

function makeSnowflakeCollection(items = []) {
  const col = new Collection();
  for (const item of items) {
    if (item?.id) col.set(String(item.id), item);
  }
  return col;
}

function captureUserSend(user?, outputs?) {
  if (!user) return user;
  const originalSend = typeof user.send === "function" ? user.send.bind(user) : null;
  return new Proxy(user, {
    get(target?, prop?) {
      if (prop === "send") {
        return async (payload?) => {
          const text = extractCommandOutput(payload);
          outputs.push(text ? `Inviato in DM: ${text}` : "Messaggio inviato in DM.");
          if (originalSend) {
            try {
              return await originalSend(payload);
            } catch {
              return { id: `web-dm-${Date.now()}`, delete: async () => {} };
            }
          }
          return { id: `web-dm-${Date.now()}`, delete: async () => {} };
        };
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function resolvePrefixCommandFromInput(client?, input?, defaultPrefix?) {
  const rest = String(input || "")
    .slice(String(defaultPrefix || "+").length)
    .trim();
  const token = rest.split(/\s+/)[0];
  if (!token) return null;
  const name = token.toLowerCase();
  return (
    client?.pcommands?.get?.(name) ||
    client?.pcommands?.get?.(client?.aliases?.get?.(name)) ||
    null
  );
}

async function buildWebTicketMentions(guild?, content?) {
  const users = makeSnowflakeCollection();
  const members = makeSnowflakeCollection();
  const roles = makeSnowflakeCollection();
  const channels = makeSnowflakeCollection();
  const text = String(content || "");
  const userIds = [...text.matchAll(/<@!?(\d{15,22})>/g)].map((m?) => m[1]);
  const roleIds = [...text.matchAll(/<@&(\d{15,22})>/g)].map((m?) => m[1]);
  const channelIds = [...text.matchAll(/<#(\d{15,22})>/g)].map((m?) => m[1]);
  for (const id of userIds) {
    const member =
      guild?.members?.cache?.get(id) ||
      (await guild?.members?.fetch?.(id).catch?.(() => null)) ||
      null;
    const user = member?.user || (await guild?.client?.users?.fetch?.(id).catch?.(() => null));
    if (user) users.set(id, user);
    if (member) members.set(id, member);
  }
  for (const id of roleIds) {
    const role = guild?.roles?.cache?.get(id);
    if (role) roles.set(id, role);
  }
  for (const id of channelIds) {
    const ch = guild?.channels?.cache?.get(id);
    if (ch) channels.set(id, ch);
  }
  return {
    users,
    members,
    roles,
    channels,
    everyone: false,
    has: (type?) => {
      if (type === "everyone") return false;
      return Boolean(users.size || members.size || roles.size || channels.size);
    },
  };
}

function wrapCapturedMessage(idPrefix?, outputs?) {
  return {
    id: `${idPrefix}-${Date.now()}`,
    deletable: false,
    editable: false,
    delete: async () => {},
    edit: async (payload?) => {
      const text = extractCommandOutput(payload);
      if (text) outputs.push(text);
      return wrapCapturedMessage(idPrefix, outputs);
    },
    react: async () => {},
    createMessageComponentCollector() {
      return { on() {}, once() {}, stop() {} };
    },
  };
}

function findChatInputCommand(client?, name?) {
  const key = String(name || "").trim().toLowerCase();
  if (!key) return null;
  const collection = client?.commands;
  if (collection) {
    const typed = collection.get?.(`${key}:${ApplicationCommandType.ChatInput}`) || collection.get?.(`${key}:1`);
    if (typed) return typed;
    if (typeof collection.values === "function") {
      for (const cmd of collection.values()) {
        const json = slashCommandJson(cmd);
        const type = Number(json?.type ?? cmd?.data?.type ?? ApplicationCommandType.ChatInput);
        const cmdName = String(json?.name || cmd?.data?.name || "").trim().toLowerCase();
        if (type === ApplicationCommandType.ChatInput && cmdName === key) return cmd;
      }
    }
  }
  for (const cmd of loadSlashCommandsFromDisk()) {
    const json = slashCommandJson(cmd);
    const type = Number(json?.type ?? cmd?.data?.type ?? ApplicationCommandType.ChatInput);
    const cmdName = String(json?.name || cmd?.data?.name || "").trim().toLowerCase();
    if (type === ApplicationCommandType.ChatInput && cmdName === key) return cmd;
  }
  return null;
}

function buildWebTicketSlashOptions(tokens?, guild = null) {
  const sub = tokens[0] || null;
  const group = null;
  const restJoined = tokens.slice(1).join(" ").trim();
  const resolveUserId = () => {
    for (const tok of tokens) {
      const m = String(tok || "").match(/^<@!?(\d{15,22})>$/);
      if (m) return m[1];
      if (/^\d{15,22}$/.test(String(tok || ""))) return String(tok);
    }
    return null;
  };
  return {
    getSubcommand: (required?) => {
      if (sub) return sub;
      if (required) throw new Error("missing_subcommand");
      return null;
    },
    getSubcommandGroup: (required?) => {
      if (required) throw new Error("missing_group");
      return group;
    },
    getUser: () => {
      const id = resolveUserId();
      if (!id) return null;
      const member = guild?.members?.cache?.get?.(id);
      return member?.user || { id, username: id, bot: false, system: false };
    },
    getMember: () => {
      const id = resolveUserId();
      if (!id || !guild) return null;
      return guild.members?.cache?.get?.(id) || null;
    },
    getString: () => restJoined || null,
    getInteger: () => {
      const n = Number(tokens[1]);
      return Number.isFinite(n) ? n : null;
    },
    getBoolean: () => null,
    getChannel: () => null,
    getRole: () => null,
    getAttachment: () => null,
    getMentionable: () => null,
    getNumber: () => null,
    data: [],
  };
}

function parseWebPartnershipCommandInput(rawInput?) {
  const trimmed = String(rawInput || "").trim();
  const body = trimmed.replace(/^\/+/, "").replace(/^partnership\b/i, "").trim();
  let managerId = null;
  let description = body;
  const mention = body.match(/^<@!?(\d{15,22})>([\s\S]*)$/);
  if (mention) {
    managerId = mention[1];
    description = String(mention[2] || "").trim();
    return { managerId, description };
  }
  const bare = body.match(/^(\d{15,22})(?:\s+([\s\S]*))?$/);
  if (bare) {
    managerId = bare[1];
    description = String(bare[2] || "").trim();
  }
  return { managerId, description };
}

async function resolveFreshActorMemberForPartnership(actor?, guild?) {
  let member = actor?.member || null;
  const uid = String(actor?.userId || member?.id || "").trim();
  if (!guild || !uid) return member;
  try {
    if (typeof guild.roles?.fetch === "function" && (guild.roles.cache?.size || 0) < 2) {
      await guild.roles.fetch().catch(() => null);
    }
  } catch {
  }
  try {
    if (typeof guild.members?.fetch === "function") {
      const fresh = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
      if (fresh) member = fresh;
    }
  } catch {
  }
  return member;
}

function memberCanRunPartnershipLikeDiscord(member?, guild?) {
  const { memberHasPartnerManagerRole } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
  if (!member || !guild) return false;
  if (memberHasPartnerManagerRole(member, guild.id)) return true;
  if (String(guild.ownerId || "") === String(member.id || "")) return true;
  try {
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  } catch {
  }
  return false;
}

async function executeWebTicketPartnershipSlash(client, actor, ticket, rawInput, { guild, fakeChannel, outputs }) {
  const {
    isPartnershipOperational,
    resolvePartnershipConfigSync,
    isPartnershipSkipManagerAllowed,
    buildSkipDeniedEmbed,
  } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");
  const { partnersChatPartnerCommandDeniedReplyContent } = require("../Utils/Partner/partnersChatChannelUtils") as typeof import("../Utils/Partner/partnersChatChannelUtils");
  const { executeTenantPartnership } = require("../Services/Partner/tenantPartnershipExecuteService") as typeof import("../Services/Partner/tenantPartnershipExecuteService");
  const { SETUP_REQUIRED_REPLY } = require("../Utils/Partner/partnershipConfigResolver") as typeof import("../Utils/Partner/partnershipConfigResolver");

  if (!isPartnershipOperational(guild?.id)) {
    return String(SETUP_REQUIRED_REPLY || "Partnership non configurata su questo server.");
  }

  const { managerId: parsedManagerId, description } = parseWebPartnershipCommandInput(rawInput);
  if (!String(description || "").trim()) {
    return "WEB_PARTNERSHIP_NEED_FORM";
  }

  const partnershipCfg = resolvePartnershipConfigSync(guild.id);
  const isMainServer = Boolean(partnershipCfg?.legacy);
  const skipAllowed = isPartnershipSkipManagerAllowed(guild.id);
  let managerId = parsedManagerId || null;
  const skipped = Boolean(!isMainServer && skipAllowed && !managerId);

  if (!skipped && !managerId) {
    return "WEB_PARTNERSHIP_NEED_FORM";
  }

  const actorMember = await resolveFreshActorMemberForPartnership(actor, guild);
  if (actorMember) actor.member = actorMember;
  if (!memberCanRunPartnershipLikeDiscord(actorMember, guild)) {
    return "Non hai i permessi per fare partnership (serve il ruolo Partner Manager).";
  }

  let replied = false;
  const capture = async (payload?) => {
    const text = extractCommandOutput(payload);
    if (text) outputs.push(text);
    replied = true;
    return wrapCapturedMessage("web-partnership", outputs);
  };

  const fakeInteraction = {
    commandName: "partnership",
    commandType: ApplicationCommandType.ChatInput,
    user: actor.member?.user,
    member: actor.member,
    guild,
    guildId: guild.id,
    channel: fakeChannel,
    channelId: fakeChannel.id,
    client,
    createdTimestamp: Date.now(),
    createdAt: new Date(),
    deferred: false,
    replied: false,
    ephemeral: false,
    options: buildWebTicketSlashOptions(
      managerId ? [`<@${managerId}>`] : [],
      guild,
    ),
    inGuild: () => true,
    isChatInputCommand: () => true,
    isRepliable: () => true,
    reply: async (payload?) => {
      fakeInteraction.replied = true;
      return capture(payload);
    },
    deferReply: async () => {
      fakeInteraction.deferred = true;
    },
    editReply: capture,
    followUp: capture,
    deleteReply: async () => {},
    showModal: async () => {},
  };

    fakeChannel.__webTicketPartnership = true;
  const denied = await partnersChatPartnerCommandDeniedReplyContent(fakeChannel, {
    allowPartnership: true,
  });
  if (denied) {
    return String(denied).replace(/<[^>]+>/g, "").trim() || denied;
  }

  if (!skipped && !managerId) {
    if (isMainServer) {
      return "Devi indicare un **manager** valido.";
    }
    const embedText = extractCommandOutput({ embeds: [buildSkipDeniedEmbed()] });
    return embedText || "Manager obbligatorio per questa partnership.";
  }

  fakeInteraction.deferred = true;
  try {
    await executeTenantPartnership(fakeInteraction, {
      description,
      managerId,
      skipped,
    });
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] partnership:", err?.message || err);
    if (!outputs.length) {
      return `Errore partnership: ${String(err?.message || "esecuzione fallita").slice(0, 180)}`;
    }
  }

  if (!outputs.length && !replied) {
    return "Partnership inviata, ma non c’è stato un messaggio di conferma qui. Controlla il canale partnership su Discord.";
  }
  return outputs.filter(Boolean).join("\n\n").trim();
}

async function executeListedSlashCommand(client, actor, ticket, rawInput, { guild, fakeChannel, outputs }) {
  const trimmed = String(rawInput || "").trim();
  const rest = trimmed.replace(/^\//, "").trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  const name = String(tokens[0] || "").toLowerCase();
  if (!name) {
    return "Inserisci un comando slash. Digita `/` per vedere quelli disponibili.";
  }
  const cmd = findChatInputCommand(client, name);
  const ticketCategory = normalizeCategory(ticket.category) || String(ticket.category || "").toLowerCase();
  const { isSlashCommandAllowedInWebTicket } = require("../Utils/Moderation/commandPermissions") as typeof import("../Utils/Moderation/commandPermissions");
  if (
    !cmd ||
    !isSlashCommandAllowedInWebTicket({
      member: actor.member,
      userId: actor.userId,
      commandName: name,
      ticketCategory,
      client,
      guildId: guild.id,
    })
  ) {
    return `Comando slash sconosciuto: \`/${name}\`. Digita \`/\` per vedere gli slash command disponibili.`;
  }

  if (name === "partnership") {
    return executeWebTicketPartnershipSlash(client, actor, ticket, trimmed, {
      guild,
      fakeChannel,
      outputs,
    });
  }

  if (cmd.expectsModal) {
    return `\`/${name}\` apre un modulo su Discord e non è eseguibile da qui. Usalo nel server.`;
  }

  const optionTokens = tokens.slice(1);
  let replied = false;
  const capture = async (payload?) => {
    const text = extractCommandOutput(payload);
    if (text) outputs.push(text);
    replied = true;
    return wrapCapturedMessage("web-slash", outputs);
  };
  const fakeInteraction = {
    commandName: name,
    commandType: ApplicationCommandType.ChatInput,
    user: actor.member?.user,
    member: actor.member,
    guild,
    guildId: guild.id,
    channel: fakeChannel,
    channelId: fakeChannel.id,
    client,
    createdTimestamp: Date.now(),
    createdAt: new Date(),
    deferred: false,
    replied: false,
    ephemeral: false,
    options: buildWebTicketSlashOptions(optionTokens, guild),
    inGuild: () => true,
    isChatInputCommand: () => true,
    isRepliable: () => true,
    reply: async (payload?) => {
      fakeInteraction.replied = true;
      return capture(payload);
    },
    deferReply: async () => {
      fakeInteraction.deferred = true;
    },
    editReply: capture,
    followUp: capture,
    deleteReply: async () => {},
    showModal: async () => {
      outputs.push(`\`/${name}\` apre un modulo su Discord e non è eseguibile da qui.`);
    },
  };

  try {
    await cmd.execute(fakeInteraction);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] slash:", err?.message || err);
    if (!outputs.length) {
      return `\`/${rest}\` non è eseguibile da questo ticket web. Usalo su Discord.`;
    }
  }
  if (!outputs.length && !replied) {
    return `\`/${rest}\` non ha prodotto una risposta qui. Se serve un modulo o opzioni, usalo su Discord.`;
  }
  return outputs.filter(Boolean).join("\n\n").trim();
}

async function executeWebTicketPrefixCommand(client?, actor?, ticket?, rawInput?) {
  const outputs = [];
  const deletedMessageIds = [];
  const guildId = resolveGuildId(client);
  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;
  if (!guild) {
    throw new Error("guild_unavailable");
  }

  const captureSend = async (payload?) => {
    outputs.push(extractCommandOutput(payload));
    return wrapCapturedMessage("web-cmd", outputs);
  };

  const fakeMessages = {
    fetch: async (options: Record<string, any> = {}) => {
      const limit = Math.min(100, Math.max(1, Number(options.limit) || 50));
      const query: Record<string, any> = { ticketId: ticket._id };
      const before = String(options.before || "").trim();
      if (before && mongoose.isValidObjectId(before)) {
        query._id = { $lt: before };
      }
      const docs = await SiteWebTicketMessage.find(query).sort({ _id: -1 }).limit(limit).lean();
      const items = docs.map((doc?) => {
        const id = String(doc._id);
        return {
          id,
          createdTimestamp: new Date(doc.createdAt || Date.now()).getTime(),
          deletable: true,
          bulkDeletable: true,
          pinned: false,
          author: { id: String(doc.authorId || "") },
          delete: async () => {
            const gone = await SiteWebTicketMessage.findOneAndDelete({ _id: doc._id, ticketId: ticket._id });
            if (gone) deletedMessageIds.push(id);
          },
        };
      });
      return makeSnowflakeCollection(items);
    },
  };

  const fakeChannel = {
    id: `web-ticket-${String(ticket._id)}`,
    name: String(buildWebTicketChannelName(ticket) || "ticket-web").slice(0, 80) || "ticket-web",
    type: ChannelType.GuildText,
    guild,
    guildId: guild.id,
    client,
    nsfw: false,
    parentId: null,
    parent: null,
    topic: null,
    messages: fakeMessages,
    send: captureSend,
    sendTyping: async () => {},
    bulkDelete: async (messages?) => {
      const list = Array.isArray(messages)
        ? messages
        : messages && typeof messages.values === "function"
          ? [...messages.values()]
          : [];
      const deleted = [];
      for (const msg of list) {
        if (typeof msg?.delete === "function") await msg.delete();
        if (msg?.id) deleted.push(msg);
      }
      return makeSnowflakeCollection(deleted);
    },
    isTextBased: () => true,
    isDMBased: () => false,
    isThread: () => false,
    isVoiceBased: () => false,
    isText: () => true,
    toString: () => `#${String(buildWebTicketChannelName(ticket) || "ticket-web").slice(0, 40)}`,
    permissionsFor: (memberOrRole?) => memberOrRole?.permissions || { has: () => true },
    awaitMessages: async () => makeSnowflakeCollection(),
    createMessageCollector() {
      return { on() {}, once() {}, stop() {} };
    },
    createMessageComponentCollector() {
      return { on() {}, once() {}, stop() {} };
    },
  };

  const defaultPrefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
  if (String(rawInput || "").trim().startsWith("/")) {
    const text = await executeListedSlashCommand(client, actor, ticket, rawInput, {
      guild,
      fakeChannel,
      outputs,
    });
    return { text, input: String(rawInput || "").trim(), deletedMessageIds };
  }
  const input = normalizeWebTicketPrefixInput(rawInput, defaultPrefix);
  if (!input) {
    return { text: "Inserisci un comando che inizia con +.", input: String(rawInput || "").trim(), deletedMessageIds };
  }

  const mentions = await buildWebTicketMentions(guild, input);
  const fakeAuthor = captureUserSend(actor.member?.user, outputs);
  const fakeMessage = {
    id: `web-cmd-msg-${Date.now()}`,
    channel: fakeChannel,
    channelId: fakeChannel.id,
    guild,
    guildId: guild.id,
    member: actor.member,
    author: fakeAuthor,
    client,
    content: input,
    cleanContent: input,
    createdTimestamp: Date.now(),
    createdAt: new Date(),
    mentions,
    attachments: makeSnowflakeCollection(),
    stickers: makeSnowflakeCollection(),
    embeds: [],
    components: [],
    reactions: { cache: makeSnowflakeCollection(), resolve: () => null },
    reference: null,
    mentionsEveryone: false,
    inGuild: () => true,
    deletable: false,
    editable: false,
    pinned: false,
    tts: false,
    system: false,
    webhookId: null,
    type: 0,
    url: "",
    __webTicketSync: true,
    __webTicketCategory: normalizeCategory(ticket.category) || String(ticket.category || "").toLowerCase(),
    delete: async () => {},
    react: async () => {},
    fetch: async () => fakeMessage,
    startThread: async () => fakeChannel,
    reply: captureSend,
  };

  const resolved = resolvePrefixCommandFromInput(client, input, defaultPrefix);
  if (!resolved) {
    const token = input.slice(defaultPrefix.length).trim().split(/\s+/)[0] || "";
    return {
      text: `Comando sconosciuto: \`${defaultPrefix}${token}\`. Digita \`+\` per vedere i comandi disponibili.`,
      input,
      deletedMessageIds,
    };
  }

  const cmdName = String(resolved.name || "").toLowerCase();
  const ticketCategory = normalizeCategory(ticket.category) || String(ticket.category || "").toLowerCase();
  const { isPrefixCommandAllowedInWebTicket } = require("../Utils/Moderation/commandPermissions") as typeof import("../Utils/Moderation/commandPermissions");
  if (
    !isPrefixCommandAllowedInWebTicket({
      member: actor.member,
      userId: actor.userId,
      commandName: cmdName,
      ticketCategory,
      client,
      guildId: guild.id,
    })
  ) {
    if (cmdName === "ticket") {
      return {
        text: "Su questo ticket web usa i pulsanti in alto (prendi in carico / chiudi). Il pannello Discord `+ticket` non è disponibile qui.",
        input,
        deletedMessageIds,
      };
    }
    if (cmdName === "description" && ticketCategory !== "partnership") {
      return {
        text: "Il comando `+description` (`+desc`) si usa **solo nei ticket partnership**.",
        input,
        deletedMessageIds,
      };
    }
    return {
      text: `Il comando \`${defaultPrefix}${cmdName}\` non è disponibile in questo ticket (permessi, canale o categoria).`,
      input,
      deletedMessageIds,
    };
  }

  try {
            const subs = Array.isArray(resolved.subcommands)
      ? [
          ...new Set(
            resolved.subcommands
              .map((s?) =>
                String(s || "")
                  .trim()
                  .toLowerCase(),
              )
              .filter(Boolean),
          ),
        ]
      : [];
    if (subs.length === 1 && !Boolean(resolved.allowEmptyArgs)) {
      const rest = String(input || "")
        .slice(String(defaultPrefix || "+").length)
        .trim();
      const parts = rest.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        const filled = `${defaultPrefix}${parts[0]} ${subs[0]}`;
        fakeMessage.content = filled;
        fakeMessage.cleanContent = filled;
      }
    }

    await handleOfficialPrefixMessage({
      message: fakeMessage,
      resolvedClient: client,
      defaultPrefix,
    });
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] command execute:", err?.message || err);
    const fallback = outputs.filter(Boolean).join("\n\n").trim();
    return {
      text:
        fallback ||
        `Errore durante \`${input}\`: ${String(err?.message || "esecuzione fallita").slice(0, 180)}`,
      input,
      deletedMessageIds,
    };
  }

  if (deletedMessageIds.length) {
    await refreshTicketLastMessageFields(ticket);
    const serializedTicket = serializeTicket(ticket, { includeStaffFields: true });
    const uniqueIds = [...new Set(deletedMessageIds)];
    for (const messageId of uniqueIds.slice(0, 80)) {
      emitTicketEvent({
        type: "web_ticket_message_deleted",
        ticketId: String(ticket._id),
        messageId,
        ticket: serializedTicket,
      });
    }
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }

  let text = outputs.filter(Boolean).join("\n\n").trim().slice(0, MAX_CONTENT);
  if (!text) {
    text = deletedMessageIds.length
      ? `Eliminati ${[...new Set(deletedMessageIds)].length} messaggi da questo ticket.`
      : `Nessuna risposta da \`${input}\`. Questo comando potrebbe non essere disponibile nei ticket web, oppure non ha prodotto un messaggio.`;
  }
  return { text, input, deletedMessageIds: [...new Set(deletedMessageIds)] };
}

async function createBotCommandMessage(ticket?, content?, client?) {
  rememberBotUserId(client);
  const bot = client?.user;
  const safeContent = sanitizeText(content, MAX_CONTENT);
  const msg = await SiteWebTicketMessage.create({
    guildId: String(ticket.guildId),
    ticketId: ticket._id,
    authorId: String(bot?.id || "bot"),
    authorName: String(
      knownBotDisplayName(bot?.id) || bot?.displayName || bot?.username || "Bot",
    ).slice(0, 80),
    authorAvatarUrl: typeof bot?.displayAvatarURL === "function" ? bot.displayAvatarURL({ size: 128 }) : "",
    authorKind: "bot",
    content: safeContent,
    imageUrls: [],
  });
  ticket.lastMessageAt = msg.createdAt || new Date();
  ticket.lastMessagePreview = previewFromContent(safeContent, 0);
  ticket.lastAuthorKind = "bot";
  ticket.messageCount = Math.max(0, Number(ticket.messageCount) || 0) + 1;
  await ticket.save();
  return msg;
}

async function runWebTicketPrefixCommandFlow(client?, actor?, ticket?, rawInput?, { isOwner = false, isAdded = false } = {}) {
  const { text, input, deletedMessageIds = [] } = await executeWebTicketPrefixCommand(client, actor, ticket, rawInput);
  if (String(text || "") === "WEB_PARTNERSHIP_NEED_FORM") {
    return {
      ok: false,
      error: "partnership_need_form",
      needPartnershipForm: true,
      message: "Scegli il manager e inserisci la descrizione del server (con invite Discord).",
      command: input || rawInput,
      deletedMessageIds,
    };
  }
  const serialized = serializeTicketForActor(actor, ticket, { isOwner, isAdded, includeStaffFields: true });
  const replyText =
    String(text || "").trim() ||
    `Nessuna risposta da \`${input || rawInput}\`. Questo comando potrebbe non essere disponibile nei ticket web.`;
  const reply = await createBotCommandMessage(ticket, replyText, client);
  emitTicketEvent({
    type: "web_ticket_message",
    ticketId: serialized.id,
    message: serializeMessage(reply),
    ticket: serialized,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  return {
    ok: true,
    output: replyText,
    command: input,
    ticket: serialized,
    message: serializeMessage(reply),
    deletedMessageIds,
  };
}

async function resolveMemberOrStaff(client?, req?, opts: Record<string, any> = {}) {
  const needStaff = opts.needStaff === true;
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const user = await resolveWebsiteGuildMember(client, accessToken);
  if (!user.ok) {
    return { ok: false, status: user.status, error: user.error, message: user.message };
  }
  let member = user.member;
  // ticketsListHang1 + mobileApisFast2: skip soft refresh when roles.cache already usable.
  // Extra Discord fetch stacked on resolveWebsiteGuildMember and hung phones.
  // ticketNotifStaffOpen1: scope=staff su telefono → se ruoli assenti/non-staff, hard refresh
  // (altrimenti lista “staff” diventava personali e open ticket → 403 toast).
  // ticketPhoneFirst1: anche scope personali — se roles.cache vuota, hard refresh (soft 1.8s
  // su telefono falliva → staffAccess false + UI senza tab Staff al primo paint).
  try {
    const hasRoles =
      member &&
      member.roles &&
      member.roles.cache &&
      typeof member.roles.cache.has === "function" &&
      Number(member.roles.cache.size || 0) > 0;
    const looksStaff = hasRoles && memberIsWebTicketStaff(member);
    const needHardRoles = !hasRoles || (needStaff && !looksStaff);
    // ticketCloseTimeout1: mai retry 18s su hard roles — claim/close andavano oltre
    // AbortController desktop (18s) mentre Discord bot API timeouttava (6.5+18s).
    if (needHardRoles) {
      const guild = member?.guild || user.guild;
      const uid = String(member?.id || user.userId || "").trim();
      if (guild && uid) {
        const fresh = await fetchWebsiteGuildMember(guild, uid, {
          force: needHardRoles,
          timeoutMs: needStaff ? 3200 : 1600,
          retry: false,
          soft: true,
        }).catch(() => null);
        if (fresh && fresh.roles && fresh.roles.cache && typeof fresh.roles.cache.has === "function") {
          member = fresh;
        }
      }
    }
  } catch {
    /* keep cached member */
  }
  if (!member || !member.id) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
      message: "Sessione Discord non valida. Ricarica o accedi di nuovo.",
    };
  }
  return {
    ok: true,
    isStaff: memberIsWebTicketStaff(member),
    member,
    userId: String(member.id),
    accessToken,
  };
}

async function loadTicketForActor(ticketId?, actor?) {
  if (!mongoose.isValidObjectId(ticketId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "Ticket non valido." };
  }
  const ticket = await SiteWebTicket.findById(ticketId);
  if (!ticket) {
    return { ok: false, status: 404, error: "not_found", message: "Ticket non trovato." };
  }
  const isOwner = String(ticket.userId) === String(actor.userId);
  const isAdded = ticketHasAddedUser(ticket, actor.userId);
  const category = normalizeCategory(ticket.category) || String(ticket.category || "supporto");
  if (!isOwner && !isAdded) {
    if (!actor.isStaff) {
      return { ok: false, status: 403, error: "forbidden", message: "Non puoi accedere a questo ticket." };
    }
    if (!memberCanAccessTicketCategory(actor.member, category)) {
      return { ok: false, status: 403, error: "forbidden", message: "Non hai accesso a questa categoria di ticket." };
    }
  }
  return { ok: true, ticket, isOwner, isAdded, category };
}

async function handleSiteWebTicketsPresencePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const clear = req.body?.clear === true || req.body?.active === false;
  if (clear) {
    clearWebTicketPagePresence(actor.userId);
    return res.status(200).json({ ok: true, cleared: true });
  }
  const ticketId = String(req.body?.ticketId || req.body?.selectedId || "").trim();
  const inbox =
    req.body?.inbox === true ||
    req.body?.staffInbox === true ||
    String(req.body?.view || "").trim().toLowerCase() === "staff";
  setWebTicketPagePresence(actor.userId, { ticketId, inbox });
  if (ticketId && mongoose.isValidObjectId(ticketId)) {
    const access = await loadTicketForActor(ticketId, actor).catch(() => null);
    if (access?.ok) {
      const recent = await SiteWebTicketMessage.find({ ticketId: access.ticket._id })
        .sort({ createdAt: -1 })
        .limit(80)
        .lean()
        .catch(() => []);
      const marked = await markTicketMessagesRead(access.ticket._id, actor.userId, recent || []);
      if (marked.messageIds.length) {
        emitTicketEvent({
          type: "web_ticket_receipts",
          ticketId: String(access.ticket._id),
          readerId: String(actor.userId),
          messageIds: marked.messageIds,
          at: marked.at,
        });
      }
    }
  }
  return res.status(200).json({ ok: true, ticketId: ticketId || null, inbox: Boolean(inbox) });
}

async function handleSiteWebTicketsReadPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const ticketId = String(req.params?.ticketId || req.body?.ticketId || "").trim();
  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ ok: false, error: "bad_id", message: "Ticket non valido." });
  }
  const loaded = await loadTicketForActor(ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const rawIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds : [];
  const wantIds = [
    ...new Set(rawIds.map((id?) => String(id || "").trim()).filter((id?) => mongoose.isValidObjectId(id))),
  ].slice(0, 120);
  const q: Record<string, any> = { ticketId: loaded.ticket._id };
  if (wantIds.length) q._id = { $in: wantIds };
  const docs = await SiteWebTicketMessage.find(q)
    .sort({ createdAt: -1 })
    .limit(wantIds.length ? wantIds.length : 120)
    .lean()
    .catch(() => []);
  const marked = await markTicketMessagesRead(loaded.ticket._id, actor.userId, docs || []);
  if (marked.messageIds.length) {
    emitTicketEvent({
      type: "web_ticket_receipts",
      ticketId: String(loaded.ticket._id),
      readerId: String(actor.userId),
      messageIds: marked.messageIds,
      at: marked.at,
    });
  }
  return res.status(200).json({
    ok: true,
    ticketId: String(loaded.ticket._id),
    messageIds: marked.messageIds,
    at: marked.at,
  });
}

async function handleSiteWebTicketsTypingPost(client?, req?, res?) {
  const actor: any = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const ticketId = String(req.params?.ticketId || req.body?.ticketId || "").trim();
  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ ok: false, error: "bad_id", message: "Ticket non valido." });
  }
  const access = await loadTicketForActor(ticketId, actor);
  if (!access.ok) {
    return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
  }
  const stop = req.body?.stop === true || req.body?.clear === true;
  if (stop) {
    clearChatTyping({
      kind: "ticket",
      id: ticketId,
      userId: actor.userId,
      eventType: "web_ticket_typing",
      extra: { ticketId },
    });
    return res.status(200).json({ ok: true, stopped: true });
  }
  const userName =
    String(
      actor.member?.displayName ||
        actor.member?.user?.globalName ||
        actor.member?.user?.username ||
        actor.displayName ||
        "Utente",
    ).trim() || "Utente";
  setChatTyping({
    kind: "ticket",
    id: ticketId,
    userId: actor.userId,
    userName,
    eventType: "web_ticket_typing",
    extra: { ticketId },
  });
  return res.status(200).json({ ok: true });
}

async function handleSiteWebTicketsMetaGet(client?, req?, res?) {
  const guildId = resolveGuildId(client);
  const categories = await resolveWebTicketCategories(guildId);
  return res.status(200).json({
    ok: true,
    guildId: guildId || null,
    categories,
    limits: {
      maxOpenPerUser: MAX_OPEN_PER_USER,
      maxSubject: MAX_SUBJECT,
      maxContent: MAX_CONTENT,
      maxImages: MAX_IMAGES,
      maxReactionKinds: MAX_REACTION_KINDS,
    },
  });
}

async function handleSiteWebTicketsEmojisGet(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }
  const force = String(req.query?.fresh || "") === "1" || String(req.query?.force || "") === "1";
  const emojis = await listGuildEmojisCached(client, guildId, { force });
  res.setHeader("Cache-Control", "private, max-age=60");
  return res.status(200).json({
    ok: true,
    guildId,
    count: emojis.length,
    emojis,
  });
}

function memberMentionRow(member?) {
  if (!member || member.user?.bot) return null;
  const id = String(member.id || member.user?.id || "").trim();
  if (!id) return null;
  const role =
    resolveStaffRoleForMember(member, member?.guild?.id) || resolveCommunityRoleForMember(member);
  return {
    type: "user",
    id,
    name: displayNameForMember(member),
    username: String(member.user?.username || "").trim() || null,
    avatarUrl: avatarForMember(member) || "",
    markup: `<@${id}>`,
    roleId: role?.id || null,
    roleName: role?.name || null,
    roleKey: role?.key || null,
  };
}

function channelTypeMeta(type?) {
  const t = Number(type);
  if (t === ChannelType.GuildVoice || t === 2) return { rank: 4, label: "Vocale", icon: "voice" };
  if (t === ChannelType.GuildStageVoice || t === 13) return { rank: 5, label: "Palco", icon: "stage" };
  if (t === ChannelType.GuildForum || t === 15) return { rank: 2, label: "Forum", icon: "forum" };
  if (t === ChannelType.GuildMedia || t === 16) return { rank: 3, label: "Media", icon: "media" };
  if (t === ChannelType.AnnouncementThread || t === 10) return { rank: 6, label: "Thread", icon: "thread" };
  if (t === ChannelType.PublicThread || t === 11) return { rank: 6, label: "Thread", icon: "thread" };
  if (t === ChannelType.PrivateThread || t === 12) return { rank: 7, label: "Thread privato", icon: "thread" };
  if (t === ChannelType.GuildAnnouncement || t === 5) return { rank: 1, label: "Annunci", icon: "news" };
  return { rank: 0, label: "Testo", icon: "text" };
}

function isThreadChannelType(type?) {
  const t = Number(type);
  return t === 10 || t === 11 || t === 12;
}

async function listGuildMentionChannels(client?, guildId?) {
  const gid = String(guildId || "").trim();
  const now = Date.now();
  if (
    channelMentionCache.guildId === gid &&
    now - channelMentionCache.at < CHANNEL_MENTION_CACHE_TTL_MS &&
    Array.isArray(channelMentionCache.channels) &&
    channelMentionCache.channels.length
  ) {
    return channelMentionCache.channels;
  }

  const guild =
    client?.guilds?.cache?.get?.(gid) ||
    (await client?.guilds?.fetch?.(gid).catch?.(() => null)) ||
    null;
  if (!guild?.channels) return [];

  try {
    if (typeof guild.channels.fetch === "function") {
      await guild.channels.fetch();
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] channels fetch:", err?.message || err);
  }

  const byId = new Map();
  const put = (ch?) => {
    if (!ch?.id) return;
    const type = Number(ch.type);
    if (type === ChannelType.GuildCategory || type === 4) return;
    if (type === ChannelType.DM || type === 1 || type === ChannelType.GroupDM || type === 3) return;
    byId.set(String(ch.id), ch);
  };

  if (guild.channels.cache) {
    for (const ch of guild.channels.cache.values()) {
      put(ch);
      const nested = ch.threads?.cache;
      if (nested && typeof nested.values === "function") {
        for (const th of nested.values()) put(th);
      }
    }
  }

  try {
    if (typeof guild.channels.fetchActiveThreads === "function") {
      const active = await guild.channels.fetchActiveThreads();
      const threads = active?.threads;
      if (threads && typeof threads.values === "function") {
        for (const th of threads.values()) put(th);
      }
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] active threads:", err?.message || err);
  }

  const rows = [];
  for (const ch of byId.values()) {
    const type = Number(ch.type);
    const meta = channelTypeMeta(type);
    const directParentId = ch.parentId ? String(ch.parentId) : "";
    const directParent = directParentId ? guild.channels.cache.get(directParentId) : null;
    const thread = isThreadChannelType(type);
    const category =
      directParent && Number(directParent.type) === 4
        ? directParent
        : directParent?.parentId
          ? guild.channels.cache.get(String(directParent.parentId))
          : null;
    const parentLabel = thread
      ? String(directParent?.name || "").trim()
      : String(category?.name || "").trim();
    const catPos = Number(
      category?.rawPosition ?? category?.position ?? (thread ? directParent?.rawPosition : -1),
    );
    const pos = Number(ch.rawPosition ?? ch.position);
    rows.push({
      type: "channel",
      id: String(ch.id),
      name: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
      markup: `<#${ch.id}>`,
      channelType: type,
      channelKind: meta.label,
      channelIcon: meta.icon,
      parentName: parentLabel || null,
      _cat: Number.isFinite(catPos) ? catPos : thread ? 0 : -1,
      _parent: directParentId,
      _kind: meta.rank,
      _pos: Number.isFinite(pos) ? pos : 0,
    });
  }

  channelMentionCache = { guildId: gid, at: now, channels: rows };
  return rows;
}

async function handleSiteWebTicketsMentionsGet(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const q = String(req.query?.q || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .slice(0, 40);
  const ticketId = String(req.query?.ticketId || "").trim();
  const claimEligible = String(req.query?.claimEligible || "") === "1";
  /* ticketAddUserSearch1: Aggiungi utente → cerca in guild (non solo chi è già nel ticket) */
  const guildSearch = String(req.query?.guildSearch || "") === "1";
  const byUserId = new Map();

  const putUser = (row?) => {
    if (!row?.id || byUserId.has(row.id)) return;
    byUserId.set(row.id, row);
  };

  let ticket = null;
  let canAccessTicket = false;
  let isOwner = false;
  let isAdded = false;
  let actingAsStaff = false;
  let mentionScope = null;

  if (mongoose.isValidObjectId(ticketId)) {
    ticket = await SiteWebTicket.findById(ticketId).lean().catch(() => null);
    if (ticket) {
      isOwner = String(ticket.userId) === String(actor.userId);
      isAdded = ticketHasAddedUser(ticket, actor.userId);
      canAccessTicket = Boolean(actor.isStaff || isOwner || isAdded);
      actingAsStaff = Boolean(actor.isStaff && canAccessTicket && !isOwner && !isAdded);
      if (canAccessTicket) {
        mentionScope = await resolveTicketMentionScope(client, ticket);
      }
    }
  }

    if (ticket && canAccessTicket && !claimEligible) {
    const authors = await SiteWebTicketMessage.find({ ticketId: ticket._id, authorKind: { $ne: "system" } })
      .select("authorId authorName authorAvatarUrl")
      .lean()
      .catch(() => []);
    const seed = [
      {
        id: String(ticket.userId || ""),
        name: String(ticket.authorName || "Utente").trim() || "Utente",
        avatarUrl: scrubStoredTicketAvatarUrl(ticket.authorAvatarUrl),
      },
      ticket.claimedBy
        ? {
            id: String(ticket.claimedBy),
            name: String(ticket.claimedByName || "Staff").trim() || "Staff",
            avatarUrl: scrubStoredTicketAvatarUrl(ticket.claimedByAvatarUrl),
          }
        : null,
      ...listAddedUsers(ticket),
      ...authors.map((a?) => ({
        id: String(a.authorId || ""),
        name: String(a.authorName || "Utente").trim() || "Utente",
        avatarUrl: scrubStoredTicketAvatarUrl(a.authorAvatarUrl),
      })),
    ];
    for (const s of seed) {
      if (!s?.id || !mentionScope?.allowedUserIds?.has?.(String(s.id))) continue;
      putUser({
        type: "user",
        id: s.id,
        name: s.name,
        username: null,
        avatarUrl: s.avatarUrl || "",
        markup: `<@${s.id}>`,
      });
    }
  }

    if ((claimEligible || (guildSearch && actor.isStaff)) && ticket && canAccessTicket) {
    if (claimEligible && actor.isStaff) {
      try {
        const { getCachedStaffRoster } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
        const roster = await getCachedStaffRoster(client);
        const people = Array.isArray(roster?.sections)
          ? roster.sections.flatMap((s?) => (Array.isArray(s?.members) ? s.members : []))
          : Array.isArray(roster?.people)
            ? roster.people
            : Array.isArray(roster?.staff)
              ? roster.staff
              : [];
        for (const p of people) {
          const id = String(p?.userId || p?.id || "").trim();
          if (!id) continue;
          const roleName = cleanStaffRoleDisplayName(p?.roleName || p?.roleLabel || p?.section || "");
          putUser({
            type: "user",
            id,
            name: String(p?.displayName || p?.username || p?.name || "Staff").trim() || "Staff",
            username: String(p?.username || "").trim() || null,
            avatarUrl: String(p?.avatarUrl || p?.avatar || ""),
            markup: `<@${id}>`,
            roleId: p?.roleId ? String(p.roleId) : null,
            roleName: roleName && roleName !== "Staff" ? roleName : null,
          });
        }
      } catch {
              }
    }

    try {
      const guild =
        client?.guilds?.cache?.get?.(guildId) ||
        (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
        null;
      if (guild) {
        /* ticketAddUserSearch1: snowflake ID → fetch diretto (members.search non trova gli ID) */
        if (/^\d{16,22}$/.test(q)) {
          try {
            const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
            const byId =
              (await getGuildMemberCached(guild, q).catch(() => null)) ||
              guild.members?.cache?.get?.(q) ||
              (await guild.members?.fetch?.(q).catch?.(() => null)) ||
              null;
            const rowById = memberMentionRow(byId);
            if (rowById) putUser(rowById);
          } catch {
                      }
        }
        if (q && typeof guild.members?.search === "function") {
          const found = await guild.members.search({ query: q, limit: 12 }).catch(() => null);
          const list = found && typeof found.values === "function" ? [...found.values()] : [];
          for (const m of list) {
            const row = memberMentionRow(m);
            if (row) putUser(row);
          }
        }
        if (guild.members?.cache?.size) {
          for (const m of guild.members.cache.values()) {
            const row = memberMentionRow(m);
            if (!row) continue;
            if (!q) {
              if (byUserId.size < 24) putUser(row);
              continue;
            }
            const hay = `${row.name} ${row.username || ""}`.toLowerCase();
            if (hay.includes(q) || row.id.includes(q)) putUser(row);
          }
        }
      }
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] mentions members:", err?.message || err);
    }
  }

    let roles = [];
  if (actingAsStaff && mentionScope?.allowedRoleIds?.size) {
    try {
      const { listGuildPickerData } = require("./siteDashboardPartnershipApi") as typeof import("./siteDashboardPartnershipApi");
      const pickers = await listGuildPickerData(client, guildId, { force: false });
      roles = (Array.isArray(pickers?.roles) ? pickers.roles : [])
        .filter((r?) => r && String(r.id) !== String(guildId))
        .filter((r?) => mentionScope.allowedRoleIds.has(String(r.id)))
        .filter((r?) => {
          if (!q) return true;
          const name = String(r.name || "").toLowerCase();
          return name.includes(q) || String(r.id).includes(q);
        })
        .slice(0, 20)
        .map((r?) => ({
          type: "role",
          id: String(r.id),
          name: String(r.name || "ruolo"),
          color: r.color || null,
          markup: `<@&${r.id}>`,
        }));
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] mentions roles:", err?.message || err);
      roles = [];
    }
  }

  let users = Array.from(byUserId.values());
  if (q) {
    users = users.filter((u?) => {
      const hay = `${u.name} ${u.username || ""}`.toLowerCase();
      return hay.includes(q) || String(u.id).includes(q);
    });
  }

  if (claimEligible && ticket && canAccessTicket) {
    const cat = normalizeCategory(ticket?.category) || String(ticket?.category || "supporto");
    const openerId = String(ticket?.userId || "");
    const claimerId = String(ticket?.claimedBy || "");
    const guild =
      client?.guilds?.cache?.get?.(guildId) ||
      (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
      null;
    if (guild) {
      const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
      const filtered = [];
      for (const row of users) {
        if (filtered.length >= 20) break;
        const id = String(row.id || "");
        if (!id || id === openerId || id === claimerId) continue;
        const member = await getGuildMemberCached(guild, id).catch(() => null);
        if (!member || member.user?.bot) continue;
        if (!canClaimTicket(member, cat, guildId)) continue;
        filtered.push(row);
      }
      users = filtered;
    } else {
      users = [];
    }
  } else {
    users = users.slice(0, 20);
  }

  let channels = [];
  const kind = String(req.query?.kind || "all").trim().toLowerCase();
  const wantChannels = kind === "all" || kind === "channels";
  if (wantChannels) {
    try {
      const guild =
        client?.guilds?.cache?.get?.(guildId) ||
        (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
        null;
      const all = await listGuildMentionChannels(client, guildId);
      const visible = all.filter((row?) => memberCanViewChannelId(actor.member, guild, row.id));
      const searchRank = (row?) => {
        if (!q) return 0;
        const name = String(row.name || "").toLowerCase();
        const parent = String(row.parentName || "").toLowerCase();
        const kindLabel = String(row.channelKind || "").toLowerCase();
        if (name === q || String(row.id) === q) return 0;
        if (name.startsWith(q)) return 1;
        if (parent.startsWith(q) || kindLabel.startsWith(q)) return 2;
        if (name.includes(q) || parent.includes(q) || kindLabel.includes(q) || String(row.id).includes(q)) return 3;
        return 9;
      };
      const rows = visible
        .map((row?) => ({ ...row, _rank: searchRank(row) }))
        .filter((row?) => !q || row._rank < 9);
      rows.sort((a?, b?) => {
        if (a._rank !== b._rank) return a._rank - b._rank;
        if (a._cat !== b._cat) return a._cat - b._cat;
        if (a._parent !== b._parent) return String(a._parent || "").localeCompare(String(b._parent || ""));
        if (a._kind !== b._kind) return a._kind - b._kind;
        if (a._pos !== b._pos) return a._pos - b._pos;
        return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
      });
      const limit = q ? 50 : 80;
      channels = rows.slice(0, limit).map((row?) => ({
        type: row.type,
        id: row.id,
        name: row.name,
        markup: row.markup,
        channelType: row.channelType,
        channelKind: row.channelKind,
        channelIcon: row.channelIcon,
        parentName: row.parentName,
      }));
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] mentions channels:", err?.message || err);
      channels = [];
    }
  }

  res.setHeader("Cache-Control", "private, max-age=15");
  const filter = String(req.query?.filter || "all").trim().toLowerCase();
  let outUsers = kind === "channels" ? [] : users;
  let outRoles = kind === "channels" ? [] : roles;
  if (filter === "roles") outUsers = [];
  if (filter === "users") outRoles = [];
  return res.status(200).json({
    ok: true,
    q,
    filter,
    users: outUsers,
    roles: outRoles,
    channels,
  });
}

const WEB_TICKET_COMMAND_PRIORITY = [
  "description",
];

function listPrefixCommandsForStaff(client?, member?, userId?, ticketCategory?) {
  const prefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
  const { isPrefixCommandAllowedInWebTicket } = require("../Utils/Moderation/commandPermissions") as typeof import("../Utils/Moderation/commandPermissions");
  const guildId = resolveGuildId(client);
  const seen = new Set();
  const commands = [];
  const collection = client?.pcommands;
  if (!collection || typeof collection.values !== "function") {
    return { prefix, commands };
  }
  for (const cmd of collection.values()) {
    const name = String(cmd?.name || "")
      .trim()
      .toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (
      !isPrefixCommandAllowedInWebTicket({
        member,
        userId,
        commandName: name,
        ticketCategory,
        client,
        guildId,
      })
    ) {
      continue;
    }
    const aliases = Array.isArray(cmd.aliases)
      ? cmd.aliases
          .map((a?) =>
            String(a || "")
              .trim()
              .toLowerCase(),
          )
          .filter((a?) => a && a !== name)
      : [];
    const subs = Array.isArray(cmd.subcommands)
      ? [
          ...new Set(
            cmd.subcommands
              .map((s?) =>
                String(s || "")
                  .trim()
                  .toLowerCase(),
              )
              .filter(Boolean),
          ),
        ]
      : [];
    const requireSubs = subs.length > 0 && !Boolean(cmd.allowEmptyArgs);
    const description = String(cmd.description || cmd.helpDescription || "").trim().slice(0, 160);
    const category = String(cmd.folder || cmd.category || "").trim();
    if (requireSubs) {
      for (const sub of subs) {
        const invoke = `${name} ${sub}`;
        if (seen.has(invoke)) continue;
        seen.add(invoke);
        let subDesc = description;
        if (typeof cmd.getSubcommandDescription === "function") {
          subDesc = String(cmd.getSubcommandDescription(sub) || "").trim().slice(0, 160) || description;
        } else if (cmd.subcommandDescriptions && typeof cmd.subcommandDescriptions === "object") {
          subDesc = String(cmd.subcommandDescriptions[(sub as any)] || "").trim().slice(0, 160) || description;
        }
        commands.push({
          name,
          invoke,
          aliases: [],
          description: subDesc,
          usage: String(cmd.usage || `${prefix}${invoke}`).trim().slice(0, 80),
          category,
        });
      }
      continue;
    }
    commands.push({
      name,
      invoke: name,
      aliases,
      description,
      usage: String(cmd.usage || `${prefix}${name}`).trim().slice(0, 80),
      category,
    });
  }
  commands.sort((a?, b?) => {
    const pa = WEB_TICKET_COMMAND_PRIORITY.indexOf(a.name);
    const pb = WEB_TICKET_COMMAND_PRIORITY.indexOf(b.name);
    const ia = pa === -1 ? 999 : pa;
    const ib = pb === -1 ? 999 : pb;
    if (ia !== ib) return ia - ib;
    return a.name.localeCompare(b.name);
  });
  return { prefix, commands };
}

function slashCommandJson(cmd?) {
  if (cmd?._helpDataJson && typeof cmd._helpDataJson === "object") return cmd._helpDataJson;
  if (typeof cmd?.data?.toJSON === "function") {
    try {
      return cmd.data.toJSON();
    } catch {
      return null;
    }
  }
  return null;
}

function loadSlashCommandsFromDisk() {
  if ((loadSlashCommandsFromDisk as any).cache) return (loadSlashCommandsFromDisk as any).cache;
  const items = [];
  const root = path.join(__dirname, "../../Commands");
  if (!fs.existsSync(root)) return items;
  let folders = [];
  try {
    folders = fs.readdirSync(root, { withFileTypes: true }).filter((d?) => d.isDirectory());
  } catch {
    return items;
  }
  for (const folder of folders) {
    const dir = path.join(root, folder.name);
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f?) => f.endsWith(".js"));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const command = require(path.join(dir, file));
        const json = slashCommandJson(command);
        if (!json) continue;
        command._helpDataJson = json;
        command.category = command.category || folder.name;
        items.push(command);
      } catch {
        continue;
      }
    }
  }
  (loadSlashCommandsFromDisk as any).cache = items;
  return items;
}

function listSlashCommandsForStaff(client?, member?, userId?, ticketCategory?) {
  const { isSlashCommandAllowedInWebTicket } = require("../Utils/Moderation/commandPermissions") as typeof import("../Utils/Moderation/commandPermissions");
  const guildId = resolveGuildId(client);
  const seen = new Set();
  const commands = [];
  let source = [];
  const collection = client?.commands;
  if (collection && typeof collection.values === "function" && collection.size) {
    source = Array.from(collection.values());
  } else {
    source = loadSlashCommandsFromDisk();
  }
  for (const cmd of source) {
    const json = slashCommandJson(cmd);
    const type = Number(json?.type ?? cmd?.data?.type ?? ApplicationCommandType.ChatInput);
    if (type !== ApplicationCommandType.ChatInput) continue;
    const name = String(json?.name || cmd?.data?.name || "")
      .trim()
      .toLowerCase();
            if (cmd?.expectsModal === true && name !== "partnership") continue;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (
      !isSlashCommandAllowedInWebTicket({
        member,
        userId,
        commandName: name,
        ticketCategory,
        client,
        guildId,
      })
    ) {
      continue;
    }
    const description = String(json?.description || cmd.helpDescription || cmd.description || "").trim().slice(0, 160);
    const options = Array.isArray(json?.options) ? json.options : [];
    const subs = options.filter((o?) => Number(o?.type) === ApplicationCommandOptionType.Subcommand);
    const groups = options.filter((o?) => Number(o?.type) === ApplicationCommandOptionType.SubcommandGroup);
    if (!subs.length && !groups.length) {
      commands.push({
        name,
        invoke: name,
        description,
        usage: `/${name}`,
        category: String(cmd.category || cmd.folder || "").trim(),
        kind: "slash",
      });
      continue;
    }
    for (const sub of subs) {
      const subName = String(sub?.name || "").trim().toLowerCase();
      if (!subName) continue;
      commands.push({
        name,
        invoke: `${name} ${subName}`,
        description: String(sub?.description || description).trim().slice(0, 160),
        usage: `/${name} ${subName}`,
        category: String(cmd.category || cmd.folder || "").trim(),
        kind: "slash",
      });
    }
    for (const group of groups) {
      const groupName = String(group?.name || "").trim().toLowerCase();
      const nested = Array.isArray(group?.options) ? group.options : [];
      for (const sub of nested) {
        if (Number(sub?.type) !== ApplicationCommandOptionType.Subcommand) continue;
        const subName = String(sub?.name || "").trim().toLowerCase();
        if (!groupName || !subName) continue;
        commands.push({
          name,
          invoke: `${name} ${groupName} ${subName}`,
          description: String(sub?.description || description).trim().slice(0, 160),
          usage: `/${name} ${groupName} ${subName}`,
          category: String(cmd.category || cmd.folder || "").trim(),
          kind: "slash",
        });
      }
    }
  }
  commands.sort((a?, b?) => a.invoke.localeCompare(b.invoke));
  return commands;
}

async function handleSiteWebTicketsCommandsGet(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  if (!memberIsWebTicketStaff(actor.member)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Solo lo staff può usare i comandi." });
  }
  const ticketId = String(req.query?.ticketId || "").trim();
  if (!ticketId) {
    const prefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, prefix, commands: [], slashCommands: [] });
  }
  const loaded = await loadTicketForActor(ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (!perms.canUseCommands) {
    /* ticketCommandsSoft1: niente 403 in console su ticket non-partnership / chiusi */
    const prefix = String(client?.config?.prefix || IDs.prefix || "+").trim() || "+";
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      prefix,
      category: loaded.category || String(loaded.ticket.category || ""),
      commands: [],
      slashCommands: [],
      canUseCommands: false,
    });
  }
  const listed = listPrefixCommandsForStaff(
    client,
    actor.member,
    actor.userId,
    loaded.category || loaded.ticket.category,
  );
  const slashCommands = listSlashCommandsForStaff(
    client,
    actor.member,
    actor.userId,
    loaded.category || loaded.ticket.category,
  );
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(200).json({
    ok: true,
    prefix: listed.prefix,
    category: loaded.category || String(loaded.ticket.category || ""),
    commands: listed.commands,
    slashCommands,
  });
}

async function handleSiteWebTicketsListGet(client?, req?, res?) {
  const scope = String(req.query?.scope || "").trim().toLowerCase();
  const wantStaffScope = scope === "staff" || scope === "inbox";
  const actor = await resolveMemberOrStaff(client, req, { needStaff: wantStaffScope });
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const statusFilter = String(req.query?.status || "").trim().toLowerCase();
  const categoryFilter = normalizeCategory(req.query?.category);
  const filter: Record<string, any> = { guildId, listHidden: { $ne: true } };
  const staffCategories = listAccessibleTicketCategories(actor.member);

  const pageRaw = Math.max(1, Math.floor(Number(req.query?.page) || 1));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(req.query?.limit) || 20)));

  if (actor.isStaff && wantStaffScope) {
    if (!staffCategories.length) {
      return res.status(200).json({
        ok: true,
        isStaff: false,
        staffAccess: false,
        viewerId: actor.userId,
        viewerName: displayNameForMember(actor.member),
        viewerAvatarUrl: avatarForMember(actor.member),
        count: 0,
        total: 0,
        page: 1,
        pageSize,
        totalPages: 1,
        tickets: [],
        categories: await resolveWebTicketCategories(guildId),
        staffCategories: [],
        error: "staff_roles_unavailable",
        message: "Ruoli staff non ancora disponibili. Riprova.",
      });
    }
    if (categoryFilter) {
      if (!staffCategories.includes(categoryFilter)) {
        return res.status(403).json({
          ok: false,
          error: "forbidden_category",
          message: "Non hai accesso a questa categoria.",
        });
      }
      filter.category = categoryFilter;
    } else {
      filter.category = { $in: staffCategories };
    }
    if (statusFilter === "closed") filter.status = WEB_TICKET_STATUS.CLOSED;
    else if (statusFilter === "claimed") filter.status = WEB_TICKET_STATUS.CLAIMED;
    else if (statusFilter === "open") {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
    } else if (statusFilter === "mine") {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
      filter.claimedBy = actor.userId;
    } else if (statusFilter === "unclaimed") {
      filter.status = WEB_TICKET_STATUS.OPEN;
      filter.claimedBy = null;
    } else if (statusFilter === "all" || !statusFilter) {
          } else {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
    }
  } else {
    /* ticketNotifStaffOpen1: NON restituire ticket personali quando chiedono scope=staff
       (ruoli Discord non pronti su telefono → lista vuota/sbagliata + toast 403 su open). */
    if (wantStaffScope) {
      return res.status(200).json({
        ok: true,
        isStaff: false,
        staffAccess: false,
        viewerId: actor.userId,
        viewerName: displayNameForMember(actor.member),
        viewerAvatarUrl: avatarForMember(actor.member),
        count: 0,
        total: 0,
        page: 1,
        pageSize,
        totalPages: 1,
        tickets: [],
        categories: await resolveWebTicketCategories(guildId),
        staffCategories: [],
        error: "staff_roles_unavailable",
        message: "Accesso staff non pronto. Riprovo…",
      });
    }
    filter.$or = [{ userId: actor.userId }, { "addedUsers.id": actor.userId }];
    if (statusFilter === "closed") filter.status = WEB_TICKET_STATUS.CLOSED;
    else if (statusFilter === "open") {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
    }
  }

  /* ticketSwitchFast1: cache prima del countDocuments (hit senza Mongo count) */
  const listKey = [
    guildId,
    actor.userId,
    actor.isStaff ? "s" : "u",
    scope || "-",
    statusFilter || "-",
    categoryFilter || "-",
    String(pageRaw),
    String(pageSize),
    staffCategories.slice().sort().join(","),
  ].join("|");
  const nowList = Date.now();
  const listHit = webTicketsListCache.get(listKey);
  if (listHit && nowList - listHit.at < WEB_TICKETS_LIST_TTL_MS) {
    const hitPayload = { ...listHit.payload, cached: true };
    return sendJsonWithEtag(req, res, hitPayload, {
      cacheControl: "private, no-cache",
      etag: listHit.etag || webTicketsListEtag(listKey, hitPayload, listHit.at),
      extraHeaders: { "X-VC-Tickets-Cache": "hit" },
    });
  }

  const total = await SiteWebTicket.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(pageRaw, totalPages);
  let listInflight = webTicketsListInflight.get(listKey);
  if (!listInflight) {
    listInflight = (async () => {
      /* fetch un po' in più: dedupe import può ridurre i risultati pagina */
      const fetchLimit = Math.min(80, pageSize * 2);
      const rowsRaw = await SiteWebTicket.find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1, ticketNumber: -1 })
        .skip((page - 1) * pageSize)
        .limit(fetchLimit)
        .lean();
      const deduped = dedupeTicketDocsSrv(rowsRaw);
      const rowsKept = Array.isArray(deduped?.kept) ? deduped.kept : [];
      const rowsHidden = Array.isArray(deduped?.hidden) ? deduped.hidden : [];
      if (rowsHidden.length) {
        const winnerMap = new Map();
        for (const h of rowsHidden) {
          const win = rowsKept.find((k?) => ticketsAreImportDupSrv(k, h));
          if (win?._id) winnerMap.set(String(h._id), win._id);
        }
        await markTicketDocsListHidden(rowsHidden, winnerMap);
      }
      const rows = rowsKept.slice(0, pageSize);
      /* ticketListTotalFix1: countDocuments includeva i mirror appena nascosti su questa pagina */
      const adjTotal = Math.max(rows.length, Math.max(0, Number(total) - rowsHidden.length));
      const adjTotalPages = Math.max(1, Math.ceil(adjTotal / pageSize) || 1);
      const adjPage = Math.min(page, adjTotalPages);

      const tickets = rows.map((doc?) => {
        const perms = buildTicketPermissions(actor.member, doc, actor.userId, {
          isOwner: String(doc.userId) === String(actor.userId),
          isAdded: ticketHasAddedUser(doc, actor.userId),
        });
        return serializeTicket(doc, {
          includeStaffFields: actor.isStaff || perms.isStaffViewer,
          permissions: perms,
        });
      });
      const categories = await resolveWebTicketCategories(guildId);
      const payload = {
        ok: true,
        isStaff: actor.isStaff,
        staffAccess: Boolean(actor.isStaff && staffCategories.length),
        staffCategories,
        viewerId: actor.userId,
        viewerName: displayNameForMember(actor.member),
        viewerAvatarUrl: avatarForMember(actor.member),
        guildId,
        count: tickets.length,
        total: adjTotal,
        page: adjPage,
        pageSize,
        totalPages: adjTotalPages,
        tickets,
        categories,
      };
      const at = Date.now();
      webTicketsListCache.set(listKey, {
        at,
        payload,
        etag: webTicketsListEtag(listKey, payload, at),
      });
      if (webTicketsListCache.size > 120) {
        const cutoff = Date.now() - WEB_TICKETS_LIST_TTL_MS;
        for (const [k, v] of webTicketsListCache) {
          if (!v || v.at < cutoff) webTicketsListCache.delete(k);
        }
      }
      return payload;
    })().finally(() => {
      webTicketsListInflight.delete(listKey);
    });
    webTicketsListInflight.set(listKey, listInflight);
  }
  const payload = await listInflight;
  const cachedRow = webTicketsListCache.get(listKey);
  return sendJsonWithEtag(req, res, payload, {
    cacheControl: "private, no-cache",
    etag: cachedRow?.etag || webTicketsListEtag(listKey, payload, Date.now()),
    extraHeaders: { "X-VC-Tickets-Cache": "miss" },
  });
}

async function handleSiteWebTicketsCreatePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const category = normalizeCategory(req.body?.category);
  const openerIsStaff = Boolean(actor.isStaff);
  /* ticketPushApi1 / apiWarmSwr1: utenti devono avere push attiva (staff skip) */
  if (!openerIsStaff) {
    try {
      const { userHasActiveWebPush, isPushEnabled } = require("./siteWebPushService") as typeof import("./siteWebPushService");
      if (isPushEnabled()) {
        const hasPush = await userHasActiveWebPush(actor.userId).catch(() => false);
        if (!hasPush) {
          return res.status(403).json({
            ok: false,
            error: "push_required",
            message: "Attiva le notifiche push sul sito prima di aprire un ticket.",
          });
        }
      }
    } catch (err) {
      global.logger?.warn?.("[WEBHOOK] site-web-tickets create push check:", err?.message || err);
    }
  }
  let content = sanitizeText(req.body?.content, MAX_CONTENT);
  {
    const pseudoTicket = { guildId, userId: actor.userId, addedUsers: [] };
    const scope = await resolveTicketMentionScope(client, pseudoTicket, { extraUserIds: [actor.userId] });
    content = sanitizeWebTicketMentionsToScope(content, {
      allowedUserIds: scope.allowedUserIds,
      allowedRoleIds: scope.allowedRoleIds,
      allowRoleMentions: false,
    });
    const guild = scope.guild || (await resolveClientGuild(client, guildId));
    content = sanitizeWebTicketChannelMentions(content, actor.member, guild);
  }
  if (!category) {
    return res.status(400).json({ ok: false, error: "invalid_category", message: "Categoria non valida." });
  }
  const hasImages = Array.isArray(req.body?.images) && req.body.images.length > 0;
  if (!content && !hasImages) {
      }

  const openCount = await SiteWebTicket.countDocuments({
    guildId,
    userId: actor.userId,
    listHidden: { $ne: true },
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
  });
  if (openCount >= MAX_OPEN_PER_USER) {
    return res.status(429).json({
      ok: false,
      error: "too_many_open",
      message: `Puoi avere al massimo ${MAX_OPEN_PER_USER} ticket aperti.`,
    });
  }

  if (content) {
    const rate = consumeWebTicketMessageRateLimit({
      guildId,
      userId: actor.userId,
      kind: openerIsStaff ? "staff" : "user",
    });
    if (!rate.ok) {
      return res.status(429).json({
        ok: false,
        error: rate.error || "rate_limited",
        message: rate.message,
        retryAfterMs: rate.retryAfterMs,
      });
    }
    if (!openerIsStaff) {
      const auto = checkWebTicketUserMessageAutomod({
        content,
        guildId,
        userId: actor.userId,
        ticketId: "new",
      });
      if (!auto.ok) {
        return res.status(400).json({
          ok: false,
          error: auto.error || "automod",
          message: auto.message,
        });
      }
    }
  }

  const ticketNumber = await nextWebTicketNumber(guildId);
  const authorName = displayNameForMember(actor.member);
  const authorAvatarUrl = avatarForMember(actor.member);
  const subject = buildWebTicketChannelName({ category, authorName });
  const ticket = await SiteWebTicket.create({
    guildId,
    ticketNumber,
    userId: actor.userId,
    authorName,
    authorAvatarUrl,
    category,
    subject,
    status: WEB_TICKET_STATUS.OPEN,
    lastMessageAt: new Date(),
    lastMessagePreview: previewFromContent(content, 0),
    lastAuthorKind: "user",
    messageCount: 0,
  });

  const imageUrls = saveTicketImages(String(ticket._id), req.body?.images);
  const messagesOut = [];
  if (content || imageUrls.length) {
    const userRole = resolveCommunityRoleForMember(actor.member);
    const msg = await SiteWebTicketMessage.create({
      guildId,
      ticketId: ticket._id,
      authorId: actor.userId,
      authorName,
      authorAvatarUrl,
      authorKind: "user",
      authorRoleId: userRole?.id || null,
      authorRoleName: userRole?.name || "",
      authorRoleKey: userRole?.key || "",
      content,
      imageUrls,
    });
    ticket.messageCount = 1;
    ticket.lastMessagePreview = previewFromContent(content, imageUrls.length);
    ticket.lastMessageAt = msg.createdAt || new Date();
    const roles = await buildStaffRoleMapForUserIds(client, guildId, [actor.userId]);
    messagesOut.push(serializeMessage(msg, null, null, roles, ticket));
  } else {
    ticket.lastMessagePreview = `Ticket #${ticketNumber} · ${CATEGORY_LABELS[category] || category}`;
    ticket.lastAuthorKind = "system";
  }

  const welcome = await createSystemMessage(
    ticket,
    `Ticket #${ticketNumber} aperto · ${CATEGORY_LABELS[category] || category}. Lo staff risponderà da qui.`,
  );
  if (!content && !imageUrls.length) {
    ticket.messageCount = Math.max(1, Number(ticket.messageCount) || 0);
  }
  await ticket.save();

  void notifyStaffNewTicket(client, guildId, ticket);
  void sendWebTicketDiscordLog(client, "opened", ticket, {
    guildId,
    actorId: actor.userId,
    actorName: authorName,
  });

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: true });
  const serialized = serializeTicket(ticket, { permissions: perms });
  messagesOut.push(serializeMessage(welcome));
  const firstUserMsg = messagesOut[0] || null;
  emitTicketEvent({ type: "web_ticket_created", ticket: serialized, message: firstUserMsg || messagesOut[0] });
  emitTicketEvent({
    type: "web_ticket_message",
    ticketId: serialized.id,
    message: serializeMessage(welcome),
    ticket: serialized,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  return res.status(201).json({ ok: true, ticket: serialized, messages: messagesOut });
}

async function handleSiteWebTicketsDetailGet(client?, req?, res?) {
  let actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  rememberBotUserId(client);
  let loaded = await loadTicketForActor(req.params?.ticketId, actor);
  /* ticketNotifStaffOpen1: 403 da ruoli non pronti → hard refresh staff e ritenta */
  if (!loaded.ok && Number(loaded.status) === 403 && !actor.isStaff) {
    const actor2 = await resolveMemberOrStaff(client, req, { needStaff: true });
    if (actor2.ok && actor2.isStaff) {
      actor = actor2;
      loaded = await loadTicketForActor(req.params?.ticketId, actor);
    }
  }
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const messages = await SiteWebTicketMessage.find({ ticketId: loaded.ticket._id })
    .sort({ createdAt: 1 })
    .limit(MAX_MESSAGES_FETCH)
    .lean();
  const marked = await markTicketMessagesRead(loaded.ticket._id, actor.userId, messages);
  if (marked.messageIds.length) {
    emitTicketEvent({
      type: "web_ticket_receipts",
      ticketId: String(loaded.ticket._id),
      readerId: String(actor.userId),
      messageIds: marked.messageIds,
      at: marked.at,
    });
  }
  const nameMap = buildReactionNameMap(loaded.ticket, messages);
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  const staffIds = messages
    .filter((m?) => resolveMessageAuthorKind(m, loaded.ticket) === "staff")
    .map((m?) => String(m.authorId || "").trim())
    .filter((id?) => /^\d{5,32}$/.test(id));
  const authorIds = messages
    .map((m?) => String(m.authorId || "").trim())
    .filter((id?) => id && id !== "bot" && id !== "system");
  const mentionedIds = collectMentionUserIdsFromMessages(messages);
  const roleLookupIds = [
    ...new Set([...authorIds, ...mentionedIds, String(loaded.ticket.userId || "").trim()].filter(Boolean)),
  ].slice(0, 16);
  const nameHints: Record<string, any> = {};
  for (const m of messages) {
    const id = String(m?.authorId || "").trim();
    if (!id.startsWith("discord:")) continue;
    const nm = String(m?.authorName || "").trim();
    if (nm) nameHints[id] = nm;
    else nameHints[id] = id.slice(8);
  }
  /* ticketDetailFast1: ruoli Discord con timeout — non bloccare open ticket su telefono */
  const staffRolesPromise = Promise.race([
    buildStaffRoleMapForUserIds(client, loaded.ticket.guildId, roleLookupIds, { nameHints }),
    new Promise((resolve?) => setTimeout(() => resolve({}), 2200)),
  ]);
  const [staffRatings, staffRoles, rateableStaffer] = await Promise.all([
    staffAvgRatingMap(loaded.ticket.guildId, staffIds),
    staffRolesPromise,
    String(loaded.ticket.status) === WEB_TICKET_STATUS.CLOSED
      ? resolveRateableStaffer(loaded.ticket)
      : Promise.resolve(null),
  ]);
  const staffRolesOut: Record<string, any> = {};
  for (const [uid, bucket] of Object.entries(staffRoles || {})) {
    if (!bucket) continue;
    const role = bucket.staff || bucket.community || null;
    if (!role) continue;
    staffRolesOut[uid] = { id: role.id, name: role.name, key: role.key || null };
  }
  const guild =
    client?.guilds?.cache?.get?.(String(loaded.ticket.guildId || "")) ||
    actor.member?.guild ||
    null;
  const ticketOut = serializeTicket(loaded.ticket, {
    includeStaffFields: actor.isStaff || loaded.isOwner || loaded.isAdded,
    permissions: perms,
    rateableStaffer,
  });
  ticketOut.authorAvatarUrl = liveTicketAvatarUrl(
    guild,
    ticketOut.userId || loaded.ticket.userId,
    loaded.ticket.authorAvatarUrl,
  );
  const messagesOut = serializeMessagesWithReplies(
    messages,
    nameMap,
    staffRatings,
    staffRoles,
    loaded.ticket,
  ).map((m?) => {
    if (!m) return m;
    m.authorAvatarUrl = liveTicketAvatarUrl(guild, m.authorId, m.authorAvatarUrl || "");
    return m;
  });
  const payload = {
    ok: true,
    isStaff: actor.isStaff,
    staffCategories: listAccessibleTicketCategories(actor.member),
    viewerId: actor.userId,
    guildId: String(loaded.ticket.guildId || resolveGuildId(client) || ""),
    ticket: ticketOut,
    messages: messagesOut,
    staffRoles: staffRolesOut,
  };
  /* siteApiW8: ETag/304 on ticket detail poll */
  return sendJsonWithEtag(req, res, payload, {
    cacheControl: "private, no-cache",
    etag: webTicketsDetailEtag(loaded.ticket, messages),
  });
}

async function handleSiteWebTicketsMessagePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Questo ticket è chiuso." });
  }

  let content = sanitizeText(req.body?.content, MAX_CONTENT);
  const imageUrls = saveTicketImages(String(ticket._id), req.body?.images);
  if (!content && !imageUrls.length) {
    return res.status(400).json({ ok: false, error: "empty", message: "Messaggio vuoto." });
  }

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (content && isWebTicketPrefixInput(content) && perms.canUseCommands && !imageUrls.length) {
    try {
      const result = await runWebTicketPrefixCommandFlow(client, actor, ticket, content, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
      });
      if (result && result.ok === false && result.needPartnershipForm) {
        return res.status(400).json(result);
      }
      return res.status(200).json(result);
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] command via message:", err?.message || err);
      return res.status(500).json({ ok: false, error: "command_failed", message: "Esecuzione comando fallita." });
    }
  }

    if (!loaded.isOwner && !perms.canReply) {
    const claimer = String(ticket.claimedBy || "").trim();
    if (claimer && String(claimer) !== String(actor.userId)) {
      return res.status(403).json({
        ok: false,
        error: "claimed",
        message: `Ticket in carico a ${ticket.claimedByName || "uno staff"}. Non puoi scrivere.`,
      });
    }
    if (!claimer) {
      return res.status(403).json({
        ok: false,
        error: "unclaimed",
        message: "Devi claimare il ticket prima di scrivere.",
      });
    }
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi rispondere a questo ticket." });
  }
  const kind = webTicketMessageKindForActor(actor, loaded);
  {
    const scope = await resolveTicketMentionScope(client, ticket);
    content = sanitizeWebTicketMentionsToScope(content, {
      allowedUserIds: scope.allowedUserIds,
      allowedRoleIds: scope.allowedRoleIds,
      allowRoleMentions: kind === "staff",
    });
    content = sanitizeWebTicketChannelMentions(content, actor.member, scope.guild);
  }
  if (!content && !imageUrls.length) {
    return res.status(400).json({
      ok: false,
      error: "empty",
      message:
        kind !== "staff"
          ? "Messaggio vuoto (menzioni di ruolo o canali non visibili non sono consentite)."
          : "Messaggio vuoto (canali non visibili rimossi).",
    });
  }

  const rate = consumeWebTicketMessageRateLimit({
    guildId: String(ticket.guildId),
    userId: actor.userId,
    kind,
  });
  if (!rate.ok) {
    return res.status(429).json({
      ok: false,
      error: rate.error || "rate_limited",
      message: rate.message,
      retryAfterMs: rate.retryAfterMs,
    });
  }
  if (kind !== "staff" && content && !(actor.isStaff && !loaded.isAdded)) {
    const auto = checkWebTicketUserMessageAutomod({
      content,
      guildId: String(ticket.guildId),
      userId: actor.userId,
      ticketId: String(ticket._id),
    });
    if (!auto.ok) {
      return res.status(400).json({
        ok: false,
        error: auto.error || "automod",
        message: auto.message,
      });
    }
  }

  const staffRole =
    kind === "staff"
      ? resolveStaffRoleForMember(actor.member, ticket.guildId)
      : resolveCommunityRoleForMember(actor.member);

  const replyTarget = await resolveReplyTargetForTicket(ticket._id, req.body?.replyToId || req.body?.replyTo);

  const msg = await SiteWebTicketMessage.create({
    guildId: String(ticket.guildId),
    ticketId: ticket._id,
    authorId: actor.userId,
    authorName: displayNameForMember(actor.member),
    authorAvatarUrl: avatarForMember(actor.member),
    authorKind: kind,
    authorRoleId: staffRole?.id || null,
    authorRoleName: staffRole?.name || "",
    authorRoleKey: staffRole?.key || "",
    content,
    imageUrls,
    replyToId: replyTarget ? replyTarget._id : null,
  });

  ticket.lastMessageAt = msg.createdAt || new Date();
  ticket.lastMessagePreview = previewFromContent(content, imageUrls.length);
  ticket.lastAuthorKind = kind;
  ticket.messageCount = Math.max(0, Number(ticket.messageCount) || 0) + 1;
  await ticket.save();

  const serializedTicket = serializeTicketForActor(actor, ticket, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
    includeStaffFields: true,
  });
  const broadcastTicket = ticketBroadcastPayload(serializedTicket);
  const serializedMsg = await serializeMessageWithStaffRating(msg, null, ticket.guildId, client, ticket, replyTarget || undefined);
  emitTicketEvent({
    type: "web_ticket_message",
    ticketId: serializedTicket.id,
    message: serializedMsg,
    ticket: broadcastTicket,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void notifyMentionedUsers(
    client,
    String(ticket.guildId),
    ticket,
    actor.userId,
    displayNameForMember(actor.member),
    content,
    { allowRoleMentions: kind === "staff" },
  ).then((mentioned?) => {
    const unclaimedUserMsg = kind !== "staff" && !String(ticket.claimedBy || "").trim();
    void notifyTicketChatMessage(ticket, {
      authorId: actor.userId,
      authorName: displayNameForMember(actor.member),
      preview: previewFromContent(content, imageUrls.length),
      kind,
      messageId: String(msg._id || ""),
      skipUserIds: mentioned || [],
      client,
      /* pushDismissDedup1: staff su ticket libero → solo queue push, non anche chat */
      deferStaffToQueue: unclaimedUserMsg,
    });
    /* ticketMsgQueuePush1: utente scrive su ticket libero → push coda staff (anche stesso ticket) */
    if (unclaimedUserMsg) {
      void refreshStaffTicketQueueNotif(client, String(ticket.guildId), ticket.category, {
        push: true,
        excludeUserIds: [actor.userId],
        previewHint: previewFromContent(content, imageUrls.length),
      });
    }
  });

  return res.status(200).json({
    ok: true,
    ticket: serializedTicket,
    message: serializedMsg,
  });
}

async function handleSiteWebTicketsReactionPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso: non puoi reagire." });
  }

  const messageId = String(req.params?.messageId || "").trim();
  if (!mongoose.isValidObjectId(messageId)) {
    return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
  }

  const parsed = parseReactionInput(req.body?.emoji ?? req.body?.markup, req.body);
  if (!parsed) {
    return res.status(400).json({ ok: false, error: "invalid_emoji", message: "Emoji non valida." });
  }

  const msg = await SiteWebTicketMessage.findOne({
    _id: messageId,
    ticketId: ticket._id,
  });
  if (!msg) {
    return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
  }
  if (String(msg.authorKind || "") === "system") {
    return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi reagire ai messaggi di sistema." });
  }

  const reactions = Array.isArray(msg.reactions)
    ? msg.reactions.map((r?) => {
        const users = normalizeReactionUsers(r);
        return {
          key: String(r?.key || "").trim(),
          emoji: String(r?.emoji || "").trim(),
          emojiId: r?.emojiId ? String(r.emojiId).trim() : null,
          name: String(r?.name || "").trim(),
          animated: Boolean(r?.animated),
          userIds: users.map((u?) => u.id),
          users,
        };
      })
    : [];
  let row = reactions.find((r?) => String(r.key) === parsed.key);
  let added = false;
  const uid = String(actor.userId);
  const uname = displayNameForMember(actor.member);

  if (row) {
    const users = Array.isArray(row.users) ? row.users.slice() : [];
    const idx = users.findIndex((u?) => String(u.id) === uid);
    if (idx >= 0) {
      users.splice(idx, 1);
      row.users = users;
      row.userIds = users.map((u?) => u.id);
      if (!users.length) {
        const ri = reactions.findIndex((r?) => String(r.key) === parsed.key);
        if (ri >= 0) reactions.splice(ri, 1);
      }
      added = false;
    } else {
      if (users.length >= MAX_REACTION_USERS) {
        return res.status(429).json({ ok: false, error: "reaction_full", message: "Troppe reazioni su questa emoji." });
      }
      users.push({ id: uid, name: uname });
      row.users = users;
      row.userIds = users.map((u?) => u.id);
      added = true;
    }
  } else {
    if (reactions.length >= MAX_REACTION_KINDS) {
      return res.status(429).json({
        ok: false,
        error: "too_many_reactions",
        message: `Massimo ${MAX_REACTION_KINDS} emoji diverse per messaggio.`,
      });
    }
    reactions.push({
      key: parsed.key,
      emoji: parsed.emoji,
      emojiId: parsed.emojiId,
      name: parsed.name || "",
      animated: Boolean(parsed.animated),
      userIds: [uid],
      users: [{ id: uid, name: uname }],
    });
    added = true;
  }

  (msg as any).reactions = reactions;
  msg.markModified("reactions");
  await msg.save();

  const nameMap = buildReactionNameMap(ticket, [msg]);
  const serializedMsg = serializeMessage(msg, nameMap, null, null, ticket);
  const serializedTicket = serializeTicketForActor(actor, ticket, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  emitTicketEvent({
    type: "web_ticket_reaction",
    ticketId: serializedTicket.id,
    message: serializedMsg,
    ticket: serializedTicket,
    added,
    actorId: uid,
  });

  return res.status(200).json({
    ok: true,
    added,
    ticket: serializedTicket,
    message: serializedMsg,
  });
}

async function handleSiteWebTicketsMessagePatch(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso: non puoi modificare messaggi." });
  }

  const messageId = String(req.params?.messageId || "").trim();
  if (!mongoose.isValidObjectId(messageId)) {
    return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
  }

  const msg = await SiteWebTicketMessage.findOne({ _id: messageId, ticketId: ticket._id });
  if (!msg) {
    return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
  }
  if (String(msg.authorKind || "") === "system") {
    return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi modificare i messaggi di sistema." });
  }
  if (String(msg.authorId) !== String(actor.userId)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi modificare solo i tuoi messaggi." });
  }

  let content = sanitizeText(req.body?.content, MAX_CONTENT);
  {
    const scope = await resolveTicketMentionScope(client, ticket);
    const allowRoles = String(msg.authorKind || "") === "staff";
    content = sanitizeWebTicketMentionsToScope(content, {
      allowedUserIds: scope.allowedUserIds,
      allowedRoleIds: scope.allowedRoleIds,
      allowRoleMentions: allowRoles,
    });
    content = sanitizeWebTicketChannelMentions(content, actor.member, scope.guild);
  }
  const imageCount = Array.isArray(msg.imageUrls) ? msg.imageUrls.length : 0;
    if (!content && !imageCount) {
    const deletedSnapshot = {
      _id: msg._id,
      authorId: msg.authorId,
      authorKind: msg.authorKind,
      authorName: msg.authorName,
      content: msg.content,
      imageUrls: Array.isArray(msg.imageUrls) ? msg.imageUrls.slice() : [],
    };
    await SiteWebTicketMessage.deleteOne({ _id: msg._id });
    ticket.messageCount = Math.max(0, (Number(ticket.messageCount) || 1) - 1);
    await refreshTicketLastMessageFields(ticket);
    const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    emitTicketEvent({
      type: "web_ticket_message_deleted",
      ticketId: serializedTicket.id,
      messageId: String(msg._id),
      ticket: serializedTicket,
    });
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
    void sendWebTicketMessageActivityLog(client, "deleted", ticket, deletedSnapshot, {
      actorId: actor.userId,
      guildId: ticket.guildId,
    });
    return res.status(200).json({
      ok: true,
      deleted: true,
      ticket: serializedTicket,
      messageId: String(msg._id),
    });
  }

  if (String(msg.authorKind || "") !== "staff" && content && !(actor.isStaff && !loaded.isAdded)) {
    const auto = checkWebTicketUserMessageAutomod({
      content,
      guildId: String(ticket.guildId),
      userId: actor.userId,
      ticketId: String(ticket._id),
    });
    if (!auto.ok) {
      return res.status(400).json({
        ok: false,
        error: auto.error || "automod",
        message: auto.message,
      });
    }
  }

  const beforeContent = String(msg.content || "");
  const beforeImageUrls = Array.isArray(msg.imageUrls) ? msg.imageUrls.slice() : [];
  msg.content = content;
  msg.editedAt = new Date();
  await msg.save();

    const last: any = await SiteWebTicketMessage.findOne({ ticketId: ticket._id }).sort({ createdAt: -1 }).select("_id").lean();
  if (last && String(last._id) === String(msg._id)) {
    ticket.lastMessagePreview = previewFromContent(content, imageCount);
    ticket.lastMessageAt = msg.editedAt;
    await ticket.save();
  }

  const serializedMsg = serializeMessage(msg, null, null, null, ticket);
  const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  emitTicketEvent({
    type: "web_ticket_message_updated",
    ticketId: serializedTicket.id,
    messageId: serializedMsg.id,
    message: serializedMsg,
    ticket: serializedTicket,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void sendWebTicketMessageActivityLog(client, "edited", ticket, msg, {
    actorId: actor.userId,
    guildId: ticket.guildId,
    beforeContent,
    beforeImageUrls,
  });

  return res.status(200).json({ ok: true, ticket: serializedTicket, message: serializedMsg });
}

async function handleSiteWebTicketsMessageDelete(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso: non puoi eliminare messaggi." });
  }

  const messageId = String(req.params?.messageId || "").trim();
  if (!mongoose.isValidObjectId(messageId)) {
    return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
  }

  const msg = await SiteWebTicketMessage.findOne({ _id: messageId, ticketId: ticket._id });
  if (!msg) {
        const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    emitTicketEvent({
      type: "web_ticket_message_deleted",
      ticketId: serializedTicket.id,
      messageId,
      ticket: serializedTicket,
    });
    return res.status(200).json({ ok: true, ticket: serializedTicket, messageId, alreadyDeleted: true });
  }
  if (String(msg.authorKind || "") === "system") {
    return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi eliminare i messaggi di sistema." });
  }
  const isOwner = String(msg.authorId) === String(actor.userId);
  // proprio messaggio → chiunque; altrui → solo High Staff (come UI React)
  if (!isOwner && !memberIsHighStaff(actor.member) && !memberIsHighStaffEligible(actor.member)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi eliminare questo messaggio." });
  }

  const deletedSnapshot = {
    _id: msg._id,
    authorId: msg.authorId,
    authorKind: msg.authorKind,
    authorName: msg.authorName,
    content: msg.content,
    imageUrls: Array.isArray(msg.imageUrls) ? msg.imageUrls.slice() : [],
  };
  await SiteWebTicketMessage.deleteOne({ _id: msg._id });
  ticket.messageCount = Math.max(0, (Number(ticket.messageCount) || 1) - 1);
  await refreshTicketLastMessageFields(ticket);

  const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  emitTicketEvent({
    type: "web_ticket_message_deleted",
    ticketId: serializedTicket.id,
    messageId: String(msg._id),
    ticket: serializedTicket,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void sendWebTicketMessageActivityLog(client, "deleted", ticket, deletedSnapshot, {
    actorId: actor.userId,
    guildId: ticket.guildId,
  });

  return res.status(200).json({ ok: true, ticket: serializedTicket, messageId: String(msg._id) });
}

async function handleSiteWebTicketsClaimPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  const guildId = resolveGuildId(client);
  if (loaded.isOwner) {
    return res.status(403).json({
      ok: false,
      error: "own_ticket",
      message: "Non puoi claimare il ticket che hai aperto tu.",
    });
  }
  if (!canClaimTicket(actor.member, loaded.category || ticket.category, guildId)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi claimare ticket di questa categoria." });
  }
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso." });
  }
  if (ticket.claimedBy && String(ticket.claimedBy) !== String(actor.userId)) {
    return res.status(409).json({
      ok: false,
      error: "already_claimed",
      message: `Già claimato da ${ticket.claimedByName || "uno staff"}.`,
    });
  }

  const claimerName = displayNameForMember(actor.member);
  const claimerId = String(actor.userId);
  const claimedAt = new Date();
  // ticketClaimAtomic1: claim solo se ancora libero (o già nostro) — anti double-claim
  const claimed = await SiteWebTicket.findOneAndUpdate(
    {
      _id: ticket._id,
      status: { $ne: WEB_TICKET_STATUS.CLOSED },
      $or: [
        { claimedBy: null },
        { claimedBy: "" },
        { claimedBy: { $exists: false } },
        { claimedBy: claimerId },
      ],
    },
    {
      $set: {
        status: WEB_TICKET_STATUS.CLAIMED,
        claimedBy: claimerId,
        claimedByName: claimerName,
        claimedAt,
        addedUsers: listAddedUsers(ticket).filter((u?) => u.id !== claimerId),
      },
    },
    { new: true },
  ).catch(() => null);

  if (!claimed) {
    const latest = await SiteWebTicket.findById(ticket._id).lean().catch(() => null);
    const other = String(latest?.claimedBy || "").trim();
    if (other && other !== claimerId) {
      return res.status(409).json({
        ok: false,
        error: "already_claimed",
        message: `Già claimato da ${latest?.claimedByName || "uno staff"}.`,
      });
    }
    if (latest?.status === WEB_TICKET_STATUS.CLOSED) {
      return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso." });
    }
    return res.status(409).json({ ok: false, error: "claim_race", message: "Claim non riuscito, riprova." });
  }

  const wasUnclaimed = !String(ticket.claimedBy || "").trim();
  /* ticketClaimHard1: usa il doc fresh da findOneAndUpdate (version corretta) */
  const live = claimed;
  let sys = null;
  try {
    sys = await createSystemMessage(live, `${live.claimedByName} ha preso in carico il ticket.`);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] claim system message:", err?.message || err);
  }
  const perms = buildTicketPermissions(actor.member, live, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: ticketHasAddedUser(live, actor.userId),
  });
  const serialized = serializeTicket(live, { includeStaffFields: true, permissions: perms });
  const broadcastTicket = ticketBroadcastPayload(serialized);
  emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
  if (sys) {
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId: serialized.id,
      message: serializeMessage(sys),
      ticket: broadcastTicket,
    });
  }
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  void sendWebTicketDiscordLog(client, "claimed", live, {
    actorId: actor.userId,
    actorName: live.claimedByName,
  });
  if (wasUnclaimed) {
    void notifyUserTicketEvent(
      String(live.guildId),
      live,
      "Ticket preso in carico",
      `${live.claimedByName} ha preso in carico il tuo ticket.`,
      live.userId,
      { mode: "claimed" },
    );
    /* ticketSmartNotif1: coda aggiornata per TUTTI gli staff (non solo claimer);
       agli altri staff spariscono chat/mention/SLA di quel ticket (+ dismiss push). */
    void (async () => {
      try {
        await refreshStaffTicketQueueNotif(client, String(live.guildId), live.category, {
          push: false,
          excludeUserIds: [live.userId],
        });
        await clearTicketSlaNotifsForTicket(client, live).catch(() => null);
        const staffIds = await listStaffRecipientsForCategory(
          client,
          String(live.guildId),
          live.category,
          [live.userId, claimerId],
        );
        await Promise.all(
          (staffIds || []).map((userId?) =>
            removeSiteInAppNotificationsForTicket(userId, live._id || live.id, {
              forceDismiss: true,
            }).catch(() => 0),
          ),
        );
      } catch (err) {
        global.logger?.warn?.("[WEB TICKETS] claim smart notif:", err?.message || err);
      }
    })();
  }
  return res.status(200).json({
    ok: true,
    ticket: serialized,
    message: sys ? serializeMessage(sys) : null,
  });
}

async function handleSiteWebTicketsUnclaimPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso." });
  }
  if (!ticket.claimedBy) {
    const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    return res.status(200).json({ ok: true, ticket: serializeTicket(ticket, { includeStaffFields: true, permissions: perms }) });
  }
  if (String(ticket.claimedBy) !== String(actor.userId)) {
    return res.status(403).json({ ok: false, error: "not_claimer", message: "Puoi rilasciare solo i ticket che hai claimato." });
  }
  const name = ticket.claimedByName || displayNameForMember(actor.member);
  ticket.status = WEB_TICKET_STATUS.OPEN;
  ticket.claimedBy = null;
  ticket.claimedByName = "";
  ticket.claimedAt = null;
  await ticket.save();
  let sys = null;
  try {
    sys = await createSystemMessage(ticket, `${name} ha rilasciato il ticket.`);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] unclaim system message:", err?.message || err);
  }
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  const serialized = serializeTicket(ticket, { includeStaffFields: true, permissions: perms });
  const broadcastTicket = ticketBroadcastPayload(serialized);
  emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
  if (sys) {
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId: serialized.id,
      message: serializeMessage(sys),
      ticket: broadcastTicket,
    });
  }
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  void sendWebTicketDiscordLog(client, "unclaimed", ticket, {
    actorId: actor.userId,
    actorName: name,
  });
  void refreshStaffTicketQueueNotif(client, String(ticket.guildId), ticket.category, {
    push: true,
    excludeUserIds: [ticket.userId, actor.userId],
  });
  return res.status(200).json({
    ok: true,
    ticket: serialized,
    message: sys ? serializeMessage(sys) : null,
  });
}

async function closeOpenWebTicketsForGuildUser(client?, guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { closed: 0 };

  const closeReason =
    sanitizeText(options.closeReason, MAX_CLOSE_REASON) || "Utente uscito dal server";
  const closedBy = String(options.closedBy || client?.user?.id || "system").trim() || "system";
  const closedByName =
    sanitizeText(options.closedByName, 80) ||
    String(client?.user?.username || "").trim() ||
    "Sistema";

  const openTickets = await SiteWebTicket.find({
    guildId: gid,
    userId: uid,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
  })
    .limit(50)
    .catch(() => []);
  if (!Array.isArray(openTickets) || !openTickets.length) return { closed: 0 };

  let closed = 0;
  for (const ticket of openTickets) {
    try {
      if (String(ticket.status) === WEB_TICKET_STATUS.CLOSED) continue;
      ticket.status = WEB_TICKET_STATUS.CLOSED;
      ticket.closedBy = closedBy;
      ticket.closedByName = closedByName;
      ticket.closedAt = new Date();
      ticket.closeReason = closeReason;
      ticket.closeRequestedBy = null;
      ticket.closeRequestedByName = "";
      ticket.closeRequestedAt = null;
      ticket.closeRequestReason = "";
      await ticket.save();

      const sys = await createSystemMessage(
        ticket,
        `Ticket chiuso automaticamente · ${closeReason}`,
      );
      const serialized = serializeTicket(ticket, { includeStaffFields: true });
      const broadcastTicket = ticketBroadcastPayload(serialized);
      emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(sys),
        ticket: broadcastTicket,
      });

      const claimerId = String(ticket.claimedBy || "").trim();
      /* ticketSmartNotif1: auto-close → purge notif + dismiss push, poi avvisa claimer */
      void (async () => {
        try {
          await purgeTicketNotifications(client, ticket, {
            includeCategoryStaff: !claimerId,
          });
          await clearTicketSlaNotifsForTicket(client, ticket).catch(() => null);
          if (claimerId && claimerId !== uid) {
            await notifyUserTicketEvent(
              gid,
              ticket,
              "Ticket chiuso",
              `Il ticket #${ticket.ticketNumber} è stato chiuso automaticamente: ${closeReason}.`,
              claimerId,
              {
                mode: "closed",
                openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}`,
              },
            );
          }
          if (!claimerId) {
            await refreshStaffTicketQueueNotif(client, gid, ticket.category, {
              push: false,
              excludeUserIds: [uid],
            });
          }
        } catch (err) {
          global.logger?.warn?.("[webTickets] auto-close smart notif:", err?.message || err);
        }
      })();

      void sendWebTicketDiscordLog(client, "closed", ticket, {
        actorId: closedBy,
        actorName: closedByName,
        reason: closeReason,
      });
      closed += 1;
    } catch (err) {
      global.logger?.warn?.(
        "[webTickets] auto-close on leave failed:",
        String(ticket?._id || ""),
        err?.message || err,
      );
    }
  }

  if (closed) {
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }
  return { closed };
}

async function autoUnclaimOpenWebTicketsClaimedByUser(client?, guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { unclaimed: 0 };

  const reasonSuffix =
    String(options.reason || "").trim() || "perché è uscito dal server";
  const claimerNameHint = sanitizeText(options.claimerName, 80);

  const claimed = await SiteWebTicket.find({
    guildId: gid,
    claimedBy: uid,
    status: WEB_TICKET_STATUS.CLAIMED,
    userId: { $ne: uid },
  })
    .limit(50)
    .catch(() => []);
  if (!Array.isArray(claimed) || !claimed.length) return { unclaimed: 0 };

  let unclaimed = 0;
  for (const ticket of claimed) {
    try {
      const name = String(ticket.claimedByName || claimerNameHint || "Staff").trim() || "Staff";
      ticket.status = WEB_TICKET_STATUS.OPEN;
      ticket.claimedBy = null;
      ticket.claimedByName = "";
      ticket.claimedAt = null;
      await ticket.save();
      const sys = await createSystemMessage(
        ticket,
        `${name} ha rilasciato il ticket automaticamente ${reasonSuffix}.`,
      );
      const serialized = serializeTicket(ticket, { includeStaffFields: true });
      const broadcastTicket = ticketBroadcastPayload(serialized);
      emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(sys),
        ticket: broadcastTicket,
      });
      void sendWebTicketDiscordLog(client, "unclaimed", ticket, {
        actorId: uid,
        actorName: name,
      });
      void refreshStaffTicketQueueNotif(client, gid, ticket.category, {
        push: true,
        excludeUserIds: [ticket.userId, uid],
      });
      unclaimed += 1;
    } catch (err) {
      global.logger?.warn?.(
        "[webTickets] auto-unclaim on leave failed:",
        String(ticket?._id || ""),
        err?.message || err,
      );
    }
  }

  if (unclaimed) {
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }
  return { unclaimed };
}

async function removeLeftUserFromOpenWebTickets(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { removed: 0 };

  const tickets = await SiteWebTicket.find({
    guildId: gid,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
    "addedUsers.id": uid,
    userId: { $ne: uid },
  })
    .limit(50)
    .catch(() => []);
  if (!Array.isArray(tickets) || !tickets.length) return { removed: 0 };

  let removed = 0;
  for (const ticket of tickets) {
    try {
      const before = Array.isArray(ticket.addedUsers) ? ticket.addedUsers.length : 0;
      ticket.addedUsers = (ticket.addedUsers || []).filter((u?) => String(u?.id || "").trim() !== uid);
      if (ticket.addedUsers.length === before) continue;
      await ticket.save();
      const sys = await createSystemMessage(
        ticket,
        `Un membro aggiunto è stato rimosso automaticamente (uscita dal server).`,
      );
      const serialized = serializeTicket(ticket, { includeStaffFields: true });
      const broadcastTicket = ticketBroadcastPayload(serialized);
      emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(sys),
        ticket: broadcastTicket,
      });
      void sendWebTicketDiscordLog(client, "member_removed", ticket, {
        actorId: "system",
        actorName: "Sistema",
        targetUserId: uid,
      });
      removed += 1;
    } catch (err) {
      global.logger?.warn?.(
        "[webTickets] remove added member on leave failed:",
        String(ticket?._id || ""),
        err?.message || err,
      );
    }
  }

  if (removed) {
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }
  return { removed };
}

async function handleSiteWebTicketsClosePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    return res.status(200).json({ ok: true, ticket: serializeTicket(ticket, { includeStaffFields: true, permissions: perms }) });
  }

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (!perms.canClose) {
    if (actor.isStaff && !loaded.isOwner) {
      const claimer = String(ticket.claimedBy || "").trim();
      if (!claimer) {
        return res.status(403).json({ ok: false, error: "not_claimed", message: "Questo ticket non è claimato." });
      }
      if (claimer !== String(actor.userId) && !memberCanBypassClaimedTicketManage(actor.member, ticket)) {
        return res.status(403).json({
          ok: false,
          error: "not_claimer",
          message: "Solo chi ha claimato il ticket può chiuderlo.",
        });
      }
    }
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi chiudere questo ticket." });
  }

  const reason = sanitizeText(req.body?.reason, MAX_CLOSE_REASON);
  ticket.status = WEB_TICKET_STATUS.CLOSED;
  ticket.closedBy = actor.userId;
  ticket.closedByName = displayNameForMember(actor.member);
  ticket.closedAt = new Date();
  ticket.closeReason = reason;
    ticket.ratingTicketScore = clampStarRating(ticket.ratingTicketScore);
  ticket.ratingStafferScore = clampStarRating(ticket.ratingStafferScore);
  await ticket.save();

  const who = actor.isStaff && !loaded.isOwner ? "Lo staff" : "L'utente";
  const sysText = reason
    ? `${who} ha chiuso il ticket · ${reason}`
    : `${who} ha chiuso il ticket.`;
  const sys = await createSystemMessage(ticket, sysText);
  const closePerms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  const rateableStaffer = await resolveRateableStaffer(ticket);
  const serialized = serializeTicket(ticket, {
    includeStaffFields: true,
    permissions: closePerms,
    rateableStaffer,
  });
  emitTicketEvent({ type: "web_ticket_updated", ticket: serialized });
  emitTicketEvent({ type: "web_ticket_message", ticketId: serialized.id, message: serializeMessage(sys), ticket: serialized });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  const closerId = String(actor.userId || "").trim();
  const ownerId = String(ticket.userId || "").trim();
  const claimerId = String(ticket.claimedBy || "").trim();
  const staffClosed = Boolean(actor.isStaff && !loaded.isOwner);
  const notifyClaimer =
    Boolean(claimerId) && claimerId !== closerId && claimerId !== ownerId;

  /* ticketSmartNotif1: prima purge chat/mention/SLA (+ dismiss push), poi event "chiuso" + coda */
  void (async () => {
    try {
      await purgeTicketNotifications(client, ticket, {
        includeCategoryStaff: !claimerId,
        excludeUserIds: [],
      });
      await clearTicketSlaNotifsForTicket(client, ticket).catch(() => null);
      if (staffClosed) {
        await notifyUserTicketEvent(
          String(ticket.guildId),
          ticket,
          "Ticket chiuso",
          reason || "Il tuo ticket è stato chiuso dallo staff.",
          null,
          { mode: "closed" },
        );
      }
      if (notifyClaimer) {
        await notifyUserTicketEvent(
          String(ticket.guildId),
          ticket,
          "Ticket chiuso",
          `${ticket.closedByName || "Qualcuno"} ha chiuso il ticket #${ticket.ticketNumber} che avevi in carico.`,
          claimerId,
          {
            mode: "closed",
            openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}`,
          },
        );
      }
      if (!claimerId) {
        await refreshStaffTicketQueueNotif(client, String(ticket.guildId), ticket.category, {
          push: false,
          excludeUserIds: [ticket.userId],
        });
      }
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] close smart notif:", err?.message || err);
    }
  })();

  void sendWebTicketDiscordLog(client, "closed", ticket, {
    actorId: actor.userId,
    actorName: ticket.closedByName,
    reason,
  });

  return res.status(200).json({ ok: true, ticket: serialized, message: serializeMessage(sys) });
}

function requireOpenStaffPanel(loaded?, actor?, extraPermKey?) {
  if (loaded.ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return { ok: false, status: 409, error: "closed", message: "Ticket chiuso." };
  }
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  if (extraPermKey && !perms[extraPermKey]) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per questa azione." };
  }
  return { ok: true, perms };
}

async function resolveGuildMemberById(client?, userId?) {
  const id = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(id)) return null;
  const guildId = resolveGuildId(client);
  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;
  if (!guild) return null;
  const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
  return getGuildMemberCached(guild, id).catch(() => null);
}

function parseUserIdFromBody(body?) {
  const raw = String(body?.userId || body?.id || "").trim();
  const mention = raw.match(/^<@!?(\d{16,22})>$/);
  if (mention) return mention[1];
  if (/^\d{16,22}$/.test(raw)) return raw;
  return "";
}

async function jsonTicketMutation(res?, actor?, loaded?, ticket?, sys?) {
  /* ticketMutationPersist1: createSystemMessage fa solo updateOne su lastMessage;
     senza save qui le mutazioni (close-request, rename, transfer, members…) restano
     solo in memoria → UI flash 1s poi spariscono al refresh/poll. */
  if (ticket && typeof ticket.save === "function") {
    const dirty =
      typeof ticket.isModified === "function" ? ticket.isModified() : true;
    if (dirty) {
      try {
        await ticket.save();
      } catch (err) {
        global.logger?.error?.("[WEB TICKETS] mutation save:", err?.message || err);
        return res.status(500).json({
          ok: false,
          error: "internal",
          message: "Errore nel salvataggio del ticket.",
        });
      }
    }
  }
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded || ticketHasAddedUser(ticket, actor.userId),
  });
  const rateableStaffer =
    String(ticket?.status) === WEB_TICKET_STATUS.CLOSED ? await resolveRateableStaffer(ticket) : null;
  const serialized = serializeTicket(ticket, {
    includeStaffFields: true,
    permissions: perms,
    rateableStaffer,
  });
  emitTicketEvent({ type: "web_ticket_updated", ticket: serialized });
  if (sys) {
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId: serialized.id,
      message: serializeMessage(sys),
      ticket: serialized,
    });
  }
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  return res.status(200).json({
    ok: true,
    ticket: serialized,
    message: sys ? serializeMessage(sys) : null,
  });
}

async function handleSiteWebTicketsMembersPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canAddUsers");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const userId = parseUserIdFromBody(req.body);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Seleziona un utente valido." });
  }
  if (userId === String(ticket.userId)) {
    return res.status(400).json({ ok: false, error: "opener", message: "L’autore del ticket è già presente." });
  }
  if (String(ticket.claimedBy || "") === userId) {
    return res.status(400).json({
      ok: false,
      error: "claimer",
      message: "Chi ha il claim è già nel ticket: non va aggiunto come utente.",
    });
  }
  if (ticketHasAddedUser(ticket, userId)) {
    return res.status(409).json({ ok: false, error: "already_added", message: "Questo utente è già nel ticket." });
  }
  const current = listAddedUsers(ticket);
  if (current.length >= MAX_ADDED_USERS) {
    return res.status(400).json({
      ok: false,
      error: "limit",
      message: `Puoi aggiungere al massimo ${MAX_ADDED_USERS} utenti.`,
    });
  }
  const member = await resolveGuildMemberById(client, userId);
  if (!member || member.user?.bot) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Utente non valido o bot." });
  }
  current.push({
    id: userId,
    name: displayNameForMember(member),
    avatarUrl: avatarForMember(member) || "",
  });
  ticket.addedUsers = current;
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha aggiunto ${displayNameForMember(member)} al ticket.`,
  );
  void notifyUserTicketEvent(
    String(ticket.guildId),
    ticket,
    "Sei stato aggiunto a un ticket",
    `${displayNameForMember(actor.member)} ti ha aggiunto al ticket #${ticket.ticketNumber}.`,
    userId,
    { mode: "invite" },
  );
  void sendWebTicketDiscordLog(client, "member_added", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    targetUserId: userId,
    targetName: displayNameForMember(member),
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsMembersRemovePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canRemoveUsers");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const userId = parseUserIdFromBody(req.body);
  if (!userId || userId === String(ticket.userId)) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Seleziona un utente da rimuovere." });
  }
  const before = listAddedUsers(ticket);
  const removed = before.find((u?) => u.id === userId);
  if (!removed) {
    return res.status(404).json({ ok: false, error: "not_found", message: "Questo utente non è tra gli invitati." });
  }
  ticket.addedUsers = before.filter((u?) => u.id !== userId);
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha rimosso ${removed.name || "un utente"} dal ticket.`,
  );
  void sendWebTicketDiscordLog(client, "member_removed", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    targetUserId: userId,
    targetName: removed.name || "",
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsTransferPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canTransfer");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const oldClaimer = String(ticket.claimedBy || "").trim();
  const userId = parseUserIdFromBody(req.body);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Seleziona lo staffer a cui trasferire il claim." });
  }
  if (userId === String(ticket.userId) || userId === oldClaimer) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Scelta non valida per il transfer." });
  }
  const member = await resolveGuildMemberById(client, userId);
  if (!member || member.user?.bot) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Utente non nel server o bot." });
  }
  const category = loaded.category || normalizeCategory(ticket.category);
  if (!canClaimTicket(member, category, resolveGuildId(client))) {
    return res.status(403).json({
      ok: false,
      error: "role",
      message: "L’utente non ha il ruolo richiesto per gestire questo tipo di ticket.",
    });
  }
  const oldName = ticket.claimedByName || "staff";
  ticket.status = WEB_TICKET_STATUS.CLAIMED;
  ticket.claimedBy = userId;
  ticket.claimedByName = displayNameForMember(member);
  ticket.claimedAt = new Date();
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha trasferito il claim da ${oldName} a ${ticket.claimedByName}.`,
  );
  void notifyUserTicketEvent(
    String(ticket.guildId),
    ticket,
    "Ticket assegnato a te",
    `Ti è stato trasferito il ticket #${ticket.ticketNumber}.`,
    userId,
    { mode: "transfer", openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}` },
  );
  void sendWebTicketDiscordLog(client, "transferred", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    fromUserId: oldClaimer,
    fromName: oldName,
    toUserId: userId,
    toName: ticket.claimedByName,
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsCategoryPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canSwitchCategory");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const next = webCategoryFromPanelToken(req.body?.category);
  if (!next) {
    return res.status(400).json({
      ok: false,
      error: "invalid_category",
      message: "Categoria non valida. Usa: supporto, partnership, high, perks.",
    });
  }
  const prev = normalizeCategory(ticket.category) || String(ticket.category || "supporto");
  if (next === prev) {
    return res.status(200).json({
      ok: true,
      ticket: serializeTicketForActor(actor, ticket, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
        includeStaffFields: true,
      }),
      message: null,
    });
  }
  let claimRemoved = false;
  const previousClaimedBy = String(ticket.claimedBy || "").trim();
  if (previousClaimedBy) {
    const claimerMember = await resolveGuildMemberById(client, previousClaimedBy);
    const keepsClaim = Boolean(claimerMember && canClaimTicket(claimerMember, next, resolveGuildId(client)));
    if (!keepsClaim) {
      ticket.claimedBy = null;
      ticket.claimedByName = "";
      ticket.claimedAt = null;
      ticket.status = WEB_TICKET_STATUS.OPEN;
      claimRemoved = true;
    }
  }
  ticket.category = next;
  syncWebTicketChannelName(ticket);
  const label = CATEGORY_LABELS[next] || next;
  const sys = await createSystemMessage(
    ticket,
    claimRemoved
      ? `${displayNameForMember(actor.member)} ha cambiato la categoria in ${label}. Il claim è stato rimosso.`
      : `${displayNameForMember(actor.member)} ha cambiato la categoria in ${label}.`,
  );
  void sendWebTicketDiscordLog(client, "category_changed", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    beforeCategory: prev,
    claimRemoved,
  });
  if (prev !== next) {
    void refreshStaffTicketQueueNotif(client, String(ticket.guildId), prev, {
      push: false,
      excludeUserIds: [ticket.userId],
    });
    if (!String(ticket.claimedBy || "").trim()) {
      void refreshStaffTicketQueueNotif(client, String(ticket.guildId), next, {
        push: true,
        excludeUserIds: [ticket.userId, actor.userId],
      });
    }
  }
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsRenamePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canRename");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const requested = sanitizeText(req.body?.subject || req.body?.name, MAX_SUBJECT);
  if (!requested) {
    return res.status(400).json({ ok: false, error: "invalid_name", message: "Inserisci un nome valido." });
  }
  const incomingTail = looksLikeDiscordTicketName(requested)
    ? extractTicketNameTail(requested, webTicketNameTail(ticket))
    : requested;
  const prev = buildWebTicketChannelName(ticket);
  const nextName = buildWebTicketChannelName(ticket, incomingTail);
  if (nextName === prev) {
    return res.status(200).json({
      ok: true,
      ticket: serializeTicketForActor(actor, ticket, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
        includeStaffFields: true,
      }),
      message: null,
    });
  }
  ticket.subject = nextName;
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha rinominato il ticket da “${prev}” a “${nextName}”.`,
  );
  void sendWebTicketDiscordLog(client, "renamed", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    beforeSubject: prev,
    afterSubject: nextName,
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsCloseRequestPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canCloseRequest");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const reason = sanitizeText(req.body?.reason, MAX_CLOSE_REQUEST_REASON);
  ticket.closeRequestedBy = actor.userId;
  ticket.closeRequestedByName = displayNameForMember(actor.member);
  ticket.closeRequestedAt = new Date();
  ticket.closeRequestReason = reason;
  const reasonLine = reason ? ` Motivo: ${reason}` : "";
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha richiesto di chiudere il ticket.${reasonLine}`,
  );
  void notifyUserTicketEvent(
    String(ticket.guildId),
    ticket,
    "Richiesta di chiusura ticket",
    reason || `${displayNameForMember(actor.member)} ha chiesto di chiudere il ticket #${ticket.ticketNumber}.`,
    null,
    { mode: "close-request" },
  );
  void sendWebTicketDiscordLog(client, "close_requested", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    reason,
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

function clearCloseRequestFields(ticket?) {
  ticket.closeRequestedBy = null;
  ticket.closeRequestedByName = "";
  ticket.closeRequestedAt = null;
  ticket.closeRequestReason = "";
}

async function handleSiteWebTicketsCloseRequestAcceptPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  if (!perms.canRespondCloseRequest) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Solo l’autore può accettare la chiusura." });
  }
  const reason = String(ticket.closeRequestReason || "").trim();
  clearCloseRequestFields(ticket);
  ticket.status = WEB_TICKET_STATUS.CLOSED;
  ticket.closedBy = actor.userId;
  ticket.closedByName = displayNameForMember(actor.member);
  ticket.closedAt = new Date();
  ticket.closeReason = reason;
  const sys = await createSystemMessage(
    ticket,
    reason ? `L'utente ha accettato la chiusura · ${reason}` : "L'utente ha accettato la chiusura del ticket.",
  );
  void sendWebTicketDiscordLog(client, "closed", ticket, {
    actorId: actor.userId,
    actorName: ticket.closedByName,
    reason,
  });
  const claimerId = String(ticket.claimedBy || "").trim();
  if (claimerId && claimerId !== String(actor.userId)) {
    void notifyUserTicketEvent(
      String(ticket.guildId),
      ticket,
      "Ticket chiuso",
      `L'utente ha accettato la chiusura del ticket #${ticket.ticketNumber}.`,
      claimerId,
      { mode: "closed", openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}` },
    );
  }
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsCloseRequestRejectPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  if (!perms.canRespondCloseRequest) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Solo l’autore può rifiutare la chiusura." });
  }
  const requestedBy = String(ticket.closeRequestedBy || "").trim();
  clearCloseRequestFields(ticket);
  const sys = await createSystemMessage(
    ticket,
    "L'utente ha rifiutato la richiesta di chiusura. Il ticket resta aperto.",
  );
  void sendWebTicketDiscordLog(client, "close_request_rejected", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
  });
  if (requestedBy && requestedBy !== String(actor.userId)) {
    void notifyUserTicketEvent(
      String(ticket.guildId),
      ticket,
      "Chiusura rifiutata",
      `L'utente ha rifiutato la chiusura del ticket #${ticket.ticketNumber}. Il ticket resta aperto.`,
      requestedBy,
      { mode: "close-rejected", openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}` },
    );
  }
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

function parseDiscordContentUrl(raw?) {
  const s = String(raw || "").trim();
  const m = s.match(/discord(?:app)?\.com\/channels\/(\d{5,32})\/(\d{5,32})(?:\/(\d{5,32}))?/i);
  if (!m) return null;
  return {
    guildId: String(m[1]),
    channelId: String(m[2]),
    messageId: m[3] ? String(m[3]) : null,
  };
}

function isPublicImageUrl(raw?) {
  let s = String(raw || "").trim();
  if (/^\/\//.test(s)) s = `https:${s}`;
  if (!/^https?:\/\//i.test(s)) return false;
  if (/\.(gif|png|jpe?g|webp)(\?|$)/i.test(s)) return true;
  if (/cdn\.discordapp\.com\/attachments|media\.discordapp\.net\/attachments|media\.tenor\.com|tenor\.com\/.*\.gif|giphy\.com\/media/i.test(s)) {
    return true;
  }
  return false;
}

async function handleSiteWebTicketsResolvePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const channelIds = [
    ...new Set(
      (Array.isArray(req.body?.channelIds) ? req.body.channelIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{5,32}$/.test(id)),
    ),
  ].slice(0, 48);
  const userIds = [
    ...new Set(
      (Array.isArray(req.body?.userIds) ? req.body.userIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{5,32}$/.test(id)),
    ),
  ].slice(0, 48);
  const roleIds = [
    ...new Set(
      (Array.isArray(req.body?.roleIds) ? req.body.roleIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{5,32}$/.test(id)),
    ),
  ].slice(0, 48);
  const urls = [
    ...new Set(
      (Array.isArray(req.body?.urls) ? req.body.urls : [])
        .map((u?) => {
          let s = String(u || "").trim();
          if (/^\/\//.test(s)) s = `https:${s}`;
          return s;
        })
        .filter((u?) => /^https?:\/\//i.test(u)),
    ),
  ].slice(0, 24);

  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;

  const channels: Record<string, any> = {};
  for (const cid of channelIds) {
    if (channels[(cid as any)]) continue;
    try {
      const ch =
        guild?.channels?.cache?.get?.(cid) ||
        (await guild?.channels?.fetch?.(cid).catch?.(() => null)) ||
        null;
      if (!ch) continue;
      if (!memberCanViewChannelId(actor.member, guild, cid)) continue;
      channels[(cid as any)] = {
        id: cid,
        name: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
        type: Number(ch.type) || 0,
      };
    } catch {
          }
  }

  const users: Record<string, any> = {};
  for (const uid of userIds) {
    if (users[(uid as any)]) continue;
    try {
      const member =
        guild?.members?.cache?.get?.(uid) ||
        (await guild?.members?.fetch?.(uid).catch?.(() => null)) ||
        null;
      if (member) {
        users[(uid as any)] = {
          id: uid,
          name: displayNameForMember(member),
          avatarUrl: avatarForMember(member) || "",
        };
        continue;
      }
      const user = await client?.users?.fetch?.(uid).catch?.(() => null);
      if (!user) continue;
      let avatarUrl = "";
      try {
        avatarUrl =
          typeof user.displayAvatarURL === "function"
            ? user.displayAvatarURL({ size: 128, extension: "png" })
            : "";
      } catch {
        avatarUrl = "";
      }
      users[(uid as any)] = {
        id: uid,
        name:
          knownBotDisplayName(uid) ||
          String(user.globalName || user.displayName || user.username || "").trim() ||
          "utente",
        avatarUrl: avatarUrl || "",
      };
    } catch {
          }
  }

  const roles: Record<string, any> = {};
  for (const rid of roleIds) {
    if (roles[(rid as any)]) continue;
    try {
      const role =
        guild?.roles?.cache?.get?.(rid) ||
        (await guild?.roles?.fetch?.(rid).catch?.(() => null)) ||
        null;
      if (!role) continue;
      const name = String(role.name || "").trim();
      if (!name) continue;
      roles[(rid as any)] = {
        id: rid,
        name: name.slice(0, 80),
        color: Number(role.color) || 0,
      };
    } catch {
          }
  }

  const links: Record<string, any> = {};
  for (const rawUrl of urls) {
    if (links[(rawUrl as any)]) continue;
    if (isPublicImageUrl(rawUrl)) {
      links[(rawUrl as any)] = { kind: "image", url: rawUrl };
      continue;
    }
    const parsed = parseDiscordContentUrl(rawUrl);
    if (!parsed) continue;
    if (parsed.guildId !== guildId) {
      links[(rawUrl as any)] = {
        kind: "external",
        url: rawUrl,
        label: "Apri su Discord",
      };
      continue;
    }
    try {
      const ch =
        guild?.channels?.cache?.get?.(parsed.channelId) ||
        (await guild?.channels?.fetch?.(parsed.channelId).catch?.(() => null)) ||
        null;
      if (!ch) continue;
      if (!memberCanViewChannelId(actor.member, guild, parsed.channelId)) continue;
      if (parsed.messageId && ch.messages?.fetch) {
        const msg = await ch.messages.fetch(parsed.messageId).catch(() => null);
        if (msg) {
          const attachment = msg.attachments?.first?.() || null;
          const attUrl = attachment?.url ? String(attachment.url) : "";
          links[(rawUrl as any)] = {
            kind: "message",
            url: rawUrl,
            channelId: parsed.channelId,
            channelName: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
            messageId: parsed.messageId,
            authorName: String(msg.member?.displayName || msg.author?.globalName || msg.author?.username || "Utente"),
            content: String(msg.content || "").trim().slice(0, 800),
            imageUrl: attUrl && isPublicImageUrl(attUrl) ? attUrl : "",
          };
          continue;
        }
      }
      links[(rawUrl as any)] = {
        kind: "channel",
        url: rawUrl,
        channelId: parsed.channelId,
        channelName: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
      };
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] resolve link:", err?.message || err);
    }
  }

  res.setHeader("Cache-Control", "private, max-age=30");
  return res.status(200).json({ ok: true, channels, users, roles, links });
}

async function handleSiteWebTicketsCommandPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (!perms.canUseCommands) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Comandi non disponibili su questo ticket." });
  }

  const rawInput = sanitizeText(req.body?.input || req.body?.command, MAX_CONTENT);
  if (!rawInput || !isWebTicketPrefixInput(rawInput)) {
    return res.status(400).json({ ok: false, error: "invalid_command", message: "Inserisci un comando che inizia con +, ! o /." });
  }

  try {
    const result = await runWebTicketPrefixCommandFlow(client, actor, loaded.ticket, rawInput, {
      isOwner: loaded.isOwner,
      isAdded: loaded.isAdded,
    });
    if (result && result.ok === false && result.needPartnershipForm) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] command:", err?.message || err);
    try {
      const failText = "Esecuzione comando fallita. Riprova tra poco.";
      const reply = await createBotCommandMessage(loaded.ticket, failText, client);
      const serialized = serializeTicketForActor(actor, loaded.ticket, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
        includeStaffFields: true,
      });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(reply),
        ticket: serialized,
      });
      return res.status(200).json({
        ok: true,
        output: failText,
        command: rawInput,
        ticket: serialized,
        message: serializeMessage(reply),
        deletedMessageIds: [],
      });
    } catch {
      return res.status(500).json({ ok: false, error: "command_failed", message: "Esecuzione comando fallita." });
    }
  }
}

async function handleSiteWebTicketsFileGet(client?, req?, res?) {
  const ticketId = String(req.params?.ticketId || "").trim();
  const fileName = String(req.params?.fileName || "").trim();
  if (!mongoose.isValidObjectId(ticketId) || !/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return res.status(400).json({ ok: false, error: "invalid_file" });
  }
  const st = String(req.query?.st || "").trim();
  let allowed = verifyTicketFileAccessToken(st, ticketId, fileName);
  if (!allowed) {
    const actor = await resolveMemberOrStaff(client, req);
    if (!actor.ok) {
      return res.status(Number(actor.status) || 401).json({
        ok: false,
        error: actor.error || "unauthorized",
        message: actor.message || "Accesso negato.",
      });
    }
    const loaded = await loadTicketForActor(ticketId, actor);
    if (!loaded.ok) {
      return res.status(Number(loaded.status) || 403).json({
        ok: false,
        error: loaded.error || "forbidden",
        message: loaded.message || "Accesso negato.",
      });
    }
    allowed = true;
  }
  if (!allowed) {
    return res.status(401).json({ ok: false, error: "unauthorized", message: "Accesso negato." });
  }
  const filePath = path.join(UPLOAD_ROOT, ticketId, fileName);
  if (!filePath.startsWith(UPLOAD_ROOT) || !fs.existsSync(filePath)) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  const ext = path.extname(fileName).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".mp4"
            ? "video/mp4"
            : ext === ".webm"
              ? "video/webm"
              : ext === ".mov"
                ? "video/quicktime"
                : "image/jpeg";
  res.setHeader("Cache-Control", "private, no-store");
  res.type(type);
  return fs.createReadStream(filePath).pipe(res);
}

async function countOpenWebTickets(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { openTickets: 0, unclaimedTickets: 0 };
  const now = Date.now();
  if (openWebTicketsCache && openWebTicketsCache.guildId === gid && openWebTicketsCache.exp > now) {
    return openWebTicketsCache.stats;
  }
  if (openWebTicketsInflight && openWebTicketsInflight.guildId === gid) {
    return openWebTicketsInflight.promise;
  }
  const promise = (async () => {
    const [openTickets, unclaimedTickets] = await Promise.all([
      SiteWebTicket.countDocuments({
        guildId: gid,
        listHidden: { $ne: true },
        status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
      }),
      SiteWebTicket.countDocuments({
        guildId: gid,
        listHidden: { $ne: true },
        status: WEB_TICKET_STATUS.OPEN,
        claimedBy: null,
      }),
    ]);
    const stats = { openTickets, unclaimedTickets };
    openWebTicketsCache = { guildId: gid, stats, exp: Date.now() + OPEN_WEB_TICKETS_TTL_MS };
    return stats;
  })().finally(() => {
    openWebTicketsInflight = null;
  });
  openWebTicketsInflight = { guildId: gid, promise };
  return promise;
}

function invalidateOpenWebTicketsCache() {
  openWebTicketsCache = null;
  webTicketsListCache.clear();
}

/* ticketSlaOff1: SLA ticket disattivate (né “non preso” né “in attesa staff”).
   Lo sweep resta solo per purgare residue in inbox. */
const WEB_TICKET_SLA_SWEEP_MS = 5 * 60 * 1000;
let webTicketSlaLoopHandle = null;

async function clearTicketSlaNotifsForTicket(client?, ticket?, { onlyUserIds = null } = {}) {
  const sid = String(ticket?._id || ticket?.id || "").trim();
  if (!sid) return;
  const guildId = String(ticket.guildId || "").trim();
  const category = normalizeCategory(ticket.category) || "supporto";
  let recipients;
  if (Array.isArray(onlyUserIds)) {
    /* notifPerStaffRead1: al claim cancella SLA solo a chi ha claimato — gli altri la tengono unread */
    recipients = onlyUserIds.map((id?) => String(id || "").trim()).filter(Boolean);
  } else {
    recipients = await listStaffRecipientsForCategory(client, guildId, category, [ticket.userId]);
    const claimer = String(ticket.claimedBy || "").trim();
    if (claimer) recipients.push(claimer);
  }
  await Promise.all(
    [...new Set(recipients)].map((userId?) =>
      removeInboxItemByDedupeKey(userId, `web_ticket:sla:${sid}`).catch(() => null),
    ),
  ).catch(() => null);
  /* ticketSlaPushOnce2: reset lock OS così un nuovo ciclo (claim/risposta/nuovo msg) può ripingere una volta */
  if (!Array.isArray(onlyUserIds)) {
    await SiteWebTicket.updateOne({ _id: sid }, { $unset: { slaOsPushEpochMs: 1 } }).catch(() => null);
  }
}

async function sweepWebTicketSlaNotifications(client?) {
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !client) return { checked: 0, notified: 0, purged: 0 };
  const open = await SiteWebTicket.find({
    guildId,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
  })
    .select("_id guildId category userId claimedBy")
    .limit(120)
    .lean()
    .catch(() => []);
  if (!Array.isArray(open) || !open.length) return { checked: 0, notified: 0, purged: 0 };

  let purged = 0;
  for (const ticket of open) {
    try {
      await clearTicketSlaNotifsForTicket(client, ticket);
      purged += 1;
    } catch (_) {}
  }
  return { checked: open.length, notified: 0, purged };
}

function startWebTicketSlaNotifLoop(client?) {
  if (webTicketSlaLoopHandle) return webTicketSlaLoopHandle;
  const tick = () => {
    void sweepWebTicketSlaNotifications(client).catch((err?) =>
      global.logger?.warn?.("[WEB TICKET SLA]", err?.message || err),
    );
  };
  tick();
  webTicketSlaLoopHandle = setInterval(tick, WEB_TICKET_SLA_SWEEP_MS);
  webTicketSlaLoopHandle.unref?.();
  return webTicketSlaLoopHandle;
}

async function handleSiteWebTicketsRatePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  if (!loaded.isOwner) {
    return res.status(403).json({
      ok: false,
      error: "forbidden",
      message: "Solo il proprietario del ticket può lasciare una valutazione.",
    });
  }
  const ticket = loaded.ticket;
  if (String(ticket.status) !== WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({
      ok: false,
      error: "not_closed",
      message: "Puoi valutare solo un ticket chiuso.",
    });
  }
  if (ticket.ratingAt || ticket.ratingStafferScore != null) {
    return res.status(409).json({
      ok: false,
      error: "already_rated",
      message: "Hai già valutato questo ticket.",
    });
  }

  const ticketScore = clampStarRating(req.body?.ticketRating ?? req.body?.ratingTicketScore);
  const stafferScore = clampStarRating(req.body?.stafferRating ?? req.body?.ratingStafferScore);
  if (!ticketScore || !stafferScore) {
    return res.status(400).json({
      ok: false,
      error: "invalid_rating",
      message: "Indica un voto da 1 a 5 stelle per il ticket e per lo staffer.",
    });
  }

  const staffer = await resolveRateableStaffer(ticket);
  if (!staffer?.id) {
    return res.status(409).json({
      ok: false,
      error: "no_staffer",
      message: "Nessuno staffer da valutare su questo ticket.",
    });
  }

  ticket.ratingTicketScore = ticketScore;
  ticket.ratingStafferScore = stafferScore;
  ticket.ratingBy = actor.userId;
  ticket.ratingAt = new Date();
  ticket.ratedStafferId = staffer.id;
  ticket.ratedStafferName = staffer.name;
  await ticket.save();

  try {
    await getOrCreateStaffDoc(String(ticket.guildId), staffer.id);
    await ActivityUserProfile.updateOne(
      { guildId: String(ticket.guildId), userId: staffer.id },
      {
        $inc: {
          "staff.webTicketRatingSum": stafferScore,
          "staff.webTicketRatingCount": 1,
        },
      },
    );
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] rate staff aggregate:", err?.message || err);
  }

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: true,
    isAdded: loaded.isAdded,
  });
  const serialized = serializeTicket(ticket, {
    includeStaffFields: true,
    permissions: perms,
    rateableStaffer: staffer,
  });
  const staffAvgMap = await staffAvgRatingMap(ticket.guildId, [staffer.id]);
  emitTicketEvent({ type: "web_ticket_updated", ticket: serialized });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void sendWebTicketDiscordLog(client, "rated", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    stafferId: staffer.id,
    stafferName: staffer.name,
    ticketScore,
    stafferScore,
  });

  return res.status(200).json({
    ok: true,
    ticket: serialized,
    staffer: {
      id: staffer.id,
      name: staffer.name,
      avgRating: staffAvgMap[staffer.id] != null ? staffAvgMap[staffer.id] : stafferScore,
    },
  });
}

export = {
  handleSiteWebTicketsMetaGet,
  handleSiteWebTicketsPresencePost,
  handleSiteWebTicketsReadPost,
  handleSiteWebTicketsTypingPost,
  handleSiteWebTicketsEmojisGet,
  handleSiteWebTicketsMentionsGet,
  handleSiteWebTicketsResolvePost,
  handleSiteWebTicketsCommandsGet,
  handleSiteWebTicketsListGet,
  handleSiteWebTicketsCreatePost,
  handleSiteWebTicketsDetailGet,
  handleSiteWebTicketsMessagePost,
  handleSiteWebTicketsMessagePatch,
  handleSiteWebTicketsMessageDelete,
  handleSiteWebTicketsReactionPost,
  handleSiteWebTicketsClaimPost,
  handleSiteWebTicketsUnclaimPost,
  handleSiteWebTicketsClosePost,
  closeOpenWebTicketsForGuildUser,
  autoUnclaimOpenWebTicketsClaimedByUser,
  removeLeftUserFromOpenWebTickets,
  handleSiteWebTicketsMembersPost,
  handleSiteWebTicketsMembersRemovePost,
  handleSiteWebTicketsTransferPost,
  handleSiteWebTicketsCategoryPost,
  handleSiteWebTicketsRenamePost,
  handleSiteWebTicketsCloseRequestPost,
  handleSiteWebTicketsCloseRequestAcceptPost,
  handleSiteWebTicketsCloseRequestRejectPost,
  handleSiteWebTicketsCommandPost,
  handleSiteWebTicketsRatePost,
  handleSiteWebTicketsFileGet,
  countOpenWebTickets,
  invalidateOpenWebTicketsCache,
  CATEGORY_LABELS,
  WEB_TICKET_CATEGORIES,
  emitTicketEvent,
  serializeTicket,
  serializeMessage,
  ticketBroadcastPayload,
  notifyStaffNewTicket,
  startWebTicketSlaNotifLoop,
  sweepWebTicketSlaNotifications,
  listGuildMentionChannels,
  sanitizeWebTicketMentionsToScope,
  sanitizeWebTicketChannelMentions,
  memberCanViewChannelId,
};
