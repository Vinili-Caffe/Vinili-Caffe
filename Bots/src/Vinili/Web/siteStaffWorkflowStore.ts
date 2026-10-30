const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { getBotState, setBotState } = require("../Utils/BotState/botStateStore") as typeof import("../Utils/BotState/botStateStore");
const { getGuildMemberCached, getUserCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const {
  guildMemberDisplayAvatarUrlDynamic,
  userAvatarUrlDynamic,
  normalizeDiscordCdnAvatarUrl,
  sitePreferredAvatarUrl,
} = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const {
  getPauseStatusLabel,
  getPausePhase,
  getPauseTimingText,
  computePauseScaledDaysThisYear,
  getCurrentYearBoundsUtc,
  getTodayUtc,
  formatPauseRoleLabelForMessage,
  normalizePauseRoleChoice,
} = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
const { resolveSubmissionChannel } = require("../Events/interaction/candidatureApplicationHandlers") as typeof import("../Events/interaction/candidatureApplicationHandlers");
const {
  listCandidatureApplications,
  getCandidatureApplicationDetail,
  parseCandidateTypeFromMessage,
} = require("../Events/interaction/candidatureApplicationHandlers") as typeof import("../Events/interaction/candidatureApplicationHandlers");
const {
  getAppealDetail,
  parseAppealFromMessageOrEmbed,
  deriveAppealStatus,
  appealSanctionStillActive,
  closeAppealAsObsolete,
  autoCloseObsoletePendingAppeals,
} = require("./siteStaffAppealsRuntime") as typeof import("./siteStaffAppealsRuntime");
const { memberHasResocontoButtonAccess } = require("../Utils/Staff/resocontoAccess") as typeof import("../Utils/Staff/resocontoAccess");
const { RESOCONTO_APPLY_PREFIX, RESOCONTO_REJECT_PREFIX } = require("../Events/interaction/resocontoHandlers") as typeof import("../Events/interaction/resocontoHandlers");

const WORKFLOW_DOC = SITE_DOCUMENT_TYPE.STAFF_WORKFLOW;
const BACKFILL_STATE_KEY = "staffWorkflowBackfillAt";
const BACKFILL_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const ENSURE_WEEK_KEYS_MIN_MS = 10 * 60 * 1000;
const INBOX_SYNC_MIN_MS = 120000;
const INBOX_PRUNE_MIN_MS = 60000;
const INBOX_WEEKS_CACHE_MS = 30000;
let backfillInFlight = null;

const RESOCONTO_LIST_ROLE_RANK = new Map(
  [
    IDs.roles.PartnerManager,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
  ]
    .filter(Boolean)
    .map((roleId?, index?) => [String(roleId), index]),
);
const RESOCONTO_LIST_RANK_FALLBACK = 50;

function resocontoListSortRank(doc?) {
  const kind = String(doc?.workflowKind || "").trim().toLowerCase();
  if (kind === "p") return 0;
  const roleId = String(doc?.workflowRoleId || "").trim();
  if (roleId && RESOCONTO_LIST_ROLE_RANK.has(roleId)) return RESOCONTO_LIST_ROLE_RANK.get(roleId);
  return RESOCONTO_LIST_RANK_FALLBACK;
}

function stripDiscordDecorations(text?, opts: Record<string, any> = {}) {
  const keepNewlines = Boolean(opts?.keepNewlines);
  const keepCustomEmoji = Boolean(opts?.keepCustomEmoji);
  let s = String(text || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFD]/g, "")
        .replace(/[\u200B\u200C\uFEFF]/g, "");
  const emojiTokens = [];
  if (keepCustomEmoji) {
    s = s.replace(/<(a?):([\w~-]+):(\d+)>/g, (m?) => {
      const i = emojiTokens.length;
      emojiTokens.push(m);
      return `{{VCEMOJI${i}}}`;
    });
  } else {
    s = s.replace(/<a?:[\w~-]+:\d+>/g, "");
  }
  s = s
    .replace(/<(?:@(?:!|&)?|#)\d+>/g, "")
        .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
    .replace(/```[\s\S]*?```/g, (block?) =>
      block.replace(/^```[^\n]*\n?/, "").replace(/```$/, ""),
    )
    .replace(/\[([^\]]+)\]\(\s*<?https?:\/\/[^)\s>]+>?\s*\)/gi, "$1")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\|\|(.+?)\|\|/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[*_`~|]+/g, "");
  if (emojiTokens.length) {
    for (let i = 0; i < emojiTokens.length; i += 1) {
      s = s.split(`{{VCEMOJI${i}}}`).join(emojiTokens[i]);
    }
  }
  if (keepNewlines) {
    return s
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
  }
  return s.replace(/\s+/g, " ").trim();
}

function weekKeyFromDate(input?) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  try {
    const ymd = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
    const wd = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      weekday: "short",
    }).format(d);
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const offset = map[wd] ?? 0;
    const [y, m, day] = ymd.split("-").map((n?) => Number(n));
    const sunday = new Date(Date.UTC(y, m - 1, day - offset));
    const sy = sunday.getUTCFullYear();
    const sm = String(sunday.getUTCMonth() + 1).padStart(2, "0");
    const sd = String(sunday.getUTCDate()).padStart(2, "0");
    return `${sy}-${sm}-${sd}`;
  } catch {
    return "";
  }
}

function formatWeekLabel(weekKey?) {
  const raw = String(weekKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || "Settimana";
    const [y, m, d] = raw.split("-").map((n?) => Number(n));
  const end = new Date(Date.UTC(y, m - 1, d));
  const start = new Date(Date.UTC(y, m - 1, d - 6));
  const fmt = (dt?) =>
    `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${fmt(start)} – ${fmt(end)}/${String(end.getUTCFullYear()).slice(2)}`;
}

function buildWorkflowDedupeKey(queue?, parts?) {
  const q = String(queue || "").trim().toLowerCase();
  return `${q}:${parts.filter(Boolean).join(":")}`;
}

function normalizeStatus(raw?, fallback = "pending") {
  const s = String(raw || fallback).trim().toLowerCase();
  if (["pending", "accepted", "rejected", "closed", "cancelled"].includes(s)) return s;
  return fallback;
}

function statusLabelFor(status?, pauseLabel?) {
  const st = String(status || "").toLowerCase();
  const stored = String(pauseLabel || "").trim();
    if (stored) {
    if (st === "pending") return stored;
    if (st === "accepted" && /^(programmata|in corso|finita|accettata)$/i.test(stored)) return stored;
    if (st === "cancelled" && !/^richiesta$/i.test(stored)) return stored;
    if (st === "rejected" && /^rifiutata$/i.test(stored)) return stored;
  }
  const map = {
    pending: "In attesa",
    accepted: "Accettata",
    rejected: "Rifiutata",
    closed: "Chiusa",
    cancelled: "Annullata",
  };
  return map[st] || status;
}

function pauseTrackRoleKey(pauseOrFields?) {
  const raw =
    pauseOrFields?.ruoloTrack ??
    pauseOrFields?.ruoloRichiesto ??
    pauseOrFields?.ruolo ??
    (typeof pauseOrFields === "string" ? pauseOrFields : "");
  const normalized = normalizePauseRoleChoice(raw);
  if (normalized) return normalized;
  const label = String(pauseOrFields?.ruoloLabel || raw || "")
    .trim()
    .toLowerCase();
  if (/partner\s*manager|\bpm\b/.test(label)) return "PartnerManager";
  if (/entrambi|\bboth\b/.test(label)) return "Entrambi";
    return "Staff";
}

function cleanPauseSubjectDisplayName(name?, userId?) {
  let n = stripDiscordDecorations(String(name || "")).trim();
  n = n
    .replace(/\s*[|/·\-–—]\s*sono in pausa!?/gi, "")
    .replace(/\s*sono in pausa!?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
    if (!n || /^[\s\u115f\u1160\u200b\u200c\u200d\u2060\u3164\ufeff\uffa0áƒ¦á²¼]+$/iu.test(n)) {
    return "";
  }
  if (isSnowflakeLikeLabel(n, userId)) return "";
  return n;
}

function pauseRoleDisplayLabel(trackOrFields?, member?, guild = null) {
  const track = pauseTrackRoleKey(trackOrFields);
  const g = guild || member?.guild || null;
  const labeled =
    trackOrFields && typeof trackOrFields === "object"
      ? String(trackOrFields.ruoloLabel || "").trim()
      : "";
  /* pauseBothRoles1: Entrambi non deve collassare sul solo grado staff (es. Moderator) */
  if (track === "Entrambi") {
    try {
      if (member) return formatPauseRoleLabelForMessage(g, "Entrambi", member);
    } catch (_) {}
    if (labeled && !/entrambi|\bboth\b|partner\s*manager/i.test(labeled)) {
      const pmRole = g?.roles?.cache?.get(String(IDs.roles?.PartnerManager || ""));
      const pmLabel = pmRole?.name || "Partner Manager";
      return `${labeled} e ${pmLabel}`;
    }
    try {
      return formatPauseRoleLabelForMessage(g, "Entrambi", member);
    } catch (_) {
      return "Entrambi";
    }
  }
  if (labeled && !/^(staff|partnermanager|partner manager|entrambi|both)$/i.test(labeled)) {
    return labeled;
  }
  try {
    return formatPauseRoleLabelForMessage(g, track, member);
  } catch (_) {
    return track === "PartnerManager" ? "Partner Manager" : (track as any) === "Entrambi" ? "Entrambi" : "Staff";
  }
}

const RESOCONTO_ACTION_LABELS = {
  vp: "Valutazione positiva",
  vn: "Valutazione negativa",
  nl: "Nulla",
  px: "Pex",
  dp: "Depex",
  rc: "Richiamo",
  batch: "Azioni multiple",
};

const GENERIC_RESOCONTO_STATUS_LABELS = new Set([
  "accettata",
  "rifiutata",
  "chiusa",
  "in attesa",
  "annullata",
  "annullato (depex)",
]);

function resocontoActionLabelForKey(raw?) {
  const k = String(raw || "").trim().toLowerCase();
  return RESOCONTO_ACTION_LABELS[k] || "";
}

function extractResocontoAzioneText(content?) {
  const raw = String(content || "");
  const m =
    raw.match(/\*\*Azione:\*\*\s*__([\s\S]*?)__/i) ||
    raw.match(/Azione:\s*__([^_\n]+)__/i) ||
    raw.match(/\*\*Azione:\*\*\s*([^\n]+)/i) ||
    raw.match(/Azione:\s*([^\n]+)/i);
  if (!m) return "";
  return stripDiscordDecorations(m[1] || "", { keepCustomEmoji: false }).trim();
}

function formatResocontoProposedLabel(azioneRaw?, actionKey?) {
  const azione = String(azioneRaw || "").trim();
  if (azione) {
    if (/^nulla\b/i.test(azione)) {
            const dash = azione.match(/^nulla\s*[—–-]\s*(.+)$/i);
      if (dash && dash[1]) return `Nulla — ${String(dash[1]).trim()}`.slice(0, 48);
      return "Nulla";
    }
    const hasPos = /valutazione positiva|compito sanzioni/i.test(azione);
    const hasNeg = /valutazione negativa/i.test(azione);
    const gia = /gi[aà]\s*registrat/i.test(azione);
    if (hasPos || hasNeg) {
      let label = "Azioni multiple";
      if (hasPos && hasNeg) label = "Valutazione positiva / negativa";
      else if (hasPos) label = "Valutazione positiva";
      else label = "Valutazione negativa";
      if (gia) label += hasPos && hasNeg ? " (già fatte)" : " (già fatta)";
      return label;
    }
    const fromAzione = normalizeResocontoActionKey(azione);
    if (fromAzione) return resocontoActionLabelForKey(fromAzione) || azione.slice(0, 48);
    return azione.slice(0, 48);
  }
  return resocontoActionLabelForKey(actionKey) || "";
}

function formatVoiceHoursForPreview(sec?) {
  const s = Math.max(0, Number(sec) || 0);
  const h = s / 3600;
  if (h >= 10) return `${h.toFixed(1).replace(/\.0$/, "")}h`;
  return `${h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}h`;
}

function buildResocontoInboxPreview(
  content?,
  {
    kind = "",
    proposedLabel = "",
    weeklyMessages = null,
    weeklyVoiceSeconds = null,
    weeklyPartners = null,
  } = {},
) {
  const plain = stripDiscordDecorations(content || "", { keepNewlines: true, keepCustomEmoji: false })
    .replace(/:[a-zA-Z0-9_~-]+:/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\uFE0F|\u200D/g, "");
  const fields = parseResocontoBodyFields(plain);
  let msgs =
    weeklyMessages != null && Number.isFinite(Number(weeklyMessages))
      ? Math.max(0, Math.floor(Number(weeklyMessages)))
      : null;
  let ore =
    weeklyVoiceSeconds != null && Number.isFinite(Number(weeklyVoiceSeconds))
      ? formatVoiceHoursForPreview(weeklyVoiceSeconds)
      : "";
  let sanzioni = "";
  let partners =
    weeklyPartners != null && Number.isFinite(Number(weeklyPartners))
      ? Math.max(0, Math.floor(Number(weeklyPartners)))
      : null;
  let azione = String(proposedLabel || "").trim();
  for (const f of fields) {
    const key = stripDiscordDecorations(f?.name || "", { keepCustomEmoji: false })
      .trim()
      .toLowerCase();
    const value = stripDiscordDecorations(f?.value || "", { keepCustomEmoji: false }).trim();
    if (/^azione$/.test(key) && !azione) azione = formatResocontoProposedLabel(value, "") || value;
    else if (/messaggi/.test(key) && msgs == null) {
      const n = value.replace(/[^\d]/g, "");
      if (n) msgs = Number(n);
    } else if ((/^ore\b/.test(key) || /ore in una settimana/.test(key)) && !ore) {
      const m = value.match(/(\d+(?:[.,]\d+)?)\s*h\b/i);
      if (m) ore = `${String(m[1]).replace(",", ".")}h`;
      else {
        const only = value.replace(/[^\d.,]/g, "");
        if (only) ore = `${only.replace(",", ".")}h`;
      }
    } else if (/sanzioni/.test(key)) sanzioni = value;
    else if (/^partner$/.test(key) && partners == null) {
      const n = value.replace(/[^\d]/g, "");
      if (n) partners = Number(n);
    }
  }
  const parts = [];
  if (String(kind || "").toLowerCase() === "p") {
    if (partners != null) parts.push(`${partners} partner`);
    if (azione) parts.push(azione);
    return parts.join(" · ").slice(0, 180);
  }
  if (msgs != null) parts.push(`${msgs} msg`);
  if (ore) parts.push(ore);
  if (sanzioni) parts.push(`Sanzioni ${sanzioni}`);
  if (azione) parts.push(azione);
  return parts.join(" · ").slice(0, 180);
}

function deriveResocontoStaffFlags(content?, { azioneText = "", workflowFields = null } = {}) {
  const wf =
    workflowFields && typeof workflowFields === "object" && !Array.isArray(workflowFields)
      ? workflowFields
      : {};
  const plain = stripDiscordDecorations(String(content || ""), {
    keepNewlines: true,
    keepCustomEmoji: false,
  }).toLowerCase();
  const azione = stripDiscordDecorations(String(azioneText || extractResocontoAzioneText(content) || ""), {
    keepCustomEmoji: false,
  }).toLowerCase();
  let isNew =
    wf.isNewStaff === true ||
    wf.graceNewStaff === true ||
    /nuovo in staff|nuovo partner manager|nuovo\s*pm\b/.test(azione) ||
    /nuovo in staff|nuovo partner manager/.test(plain);
  let inPause =
    wf.inPause === true ||
    wf.currentlyInPause === true ||
    /\bin pausa\b|pausa nella settimana/.test(azione) ||
    /\bin pausa\b/.test(plain);
  const pauseEnded =
    wf.pauseEnded === true || /rientrato da pausa/.test(azione) || /rientrato da pausa/.test(plain);
  let pauseNote = "";
  const pauseMatch =
    String(content || "").match(/\*\*In pausa\*\*[^\n]*/i) ||
    String(content || "").match(/In pausa[^\n]*/i);
  if (pauseMatch) {
    pauseNote = stripDiscordDecorations(pauseMatch[0], { keepCustomEmoji: false }).trim();
        if (!pauseEnded) inPause = true;
  }
  return {
    isNewStaff: Boolean(isNew),
    inPause: Boolean(inPause),
    pauseEnded: Boolean(pauseEnded && !inPause),
    pauseNote: pauseNote.slice(0, 120),
  };
}

function parseResocontoOutcomeFromContent(text?) {
  const raw = String(text || "");
  if (/azione negata da/i.test(raw)) {
    return { rejected: true, actionKey: "", label: "Azione negata" };
  }
  const confirmMatch = raw.match(/azione confermata da[\s\S]*?:([\s\S]*?)(?:\n\n|$)/i);
  const outcomeText = confirmMatch ? String(confirmMatch[1] || "").trim() : "";
  const plain = stripDiscordDecorations(outcomeText, { keepNewlines: false }).toLowerCase();
  if (/pex applicato/.test(plain)) return { rejected: false, actionKey: "px", label: "Pex" };
  if (/depex pm applicato|depex applicato/.test(plain)) {
    return { rejected: false, actionKey: "dp", label: "Depex" };
  }
  if (/valutazione positiva/.test(plain)) return { rejected: false, actionKey: "vp", label: "Valutazione positiva" };
  if (/valutazione negativa/.test(plain)) return { rejected: false, actionKey: "vn", label: "Valutazione negativa" };
  if (/richiamo/.test(plain)) return { rejected: false, actionKey: "rc", label: "Richiamo" };
  if (/nessuna azione/.test(plain)) return { rejected: false, actionKey: "nl", label: "Nulla" };
  if (/valutazioni gi[aà] registrate|azioni multiple/.test(plain)) {
    return { rejected: false, actionKey: "batch", label: "Azioni multiple" };
  }
  return { rejected: false, actionKey: "", label: "" };
}

function deriveResocontoStatusLabel(doc?) {
  const status = resolveResocontoDocStatus(doc);
  if (status === "pending") return statusLabelFor("pending");
  if (status === "cancelled") {
    return String(doc?.workflowFields?.statusLabel || doc?.staffReason || "Annullato (depex)").trim();
  }

  const stored = String(doc?.workflowFields?.statusLabel || doc?.staffReason || "").trim();
  if (stored && !GENERIC_RESOCONTO_STATUS_LABELS.has(stored.toLowerCase())) return stored;

  const fromKey = resocontoActionLabelForKey(doc?.workflowActionKey);
  if (fromKey) return fromKey;

  const outcome = parseResocontoOutcomeFromContent(doc?.content || doc?.body || "");
  if (outcome.label) return outcome.label;

  if (status === "rejected" || outcome.rejected) return "Azione negata";
  if (status === "accepted") return "Accettata";
  return statusLabelFor(status);
}

function resolveResocontoDocStatus(doc?) {
  let status = normalizeStatus(doc?.status, "pending");
  if (status !== "pending") return status;
  const raw = String(doc?.content || doc?.body || "");
  if (/azione negata da/i.test(raw)) return "rejected";
  if (/azione confermata da/i.test(raw)) return "accepted";
  return status;
}

function isSnowflakeLikeLabel(value?, userId?) {
  const v = String(value || "").trim();
  if (!v) return true;
  const uid = String(userId || "").trim();
  if (uid && v === uid) return true;
  return /^\d{16,22}$/.test(v);
}

function isGenericWorkflowSubjectLabel(value?, doc?) {
  const v = String(value || "").trim();
  if (!v) return true;
  if (/^richiesta\s+(unban|unmute)\b/i.test(v)) return true;
  if (/^candidatura\b/i.test(v)) return true;
  if (/^appello\b/i.test(v)) return true;
  return isWorkflowRoleSlug(v, doc);
}

function pickSubjectDisplayName(userId?, ...candidates) {
  const uid = String(userId || "").trim();
  for (const raw of candidates) {
    const name = String(raw || "").trim();
    if (!name || isSnowflakeLikeLabel(name, uid) || isGenericWorkflowSubjectLabel(name)) continue;
    return name.slice(0, 120);
  }
  return "";
}

function memberToSubjectFields(member?, userId?) {
  const uid = String(userId || member?.id || member?.user?.id || "").trim();
  const displayName = pickSubjectDisplayName(
    uid,
    member?.displayName,
    member?.user?.globalName,
    member?.user?.username,
  );
  const avatarUrl = liveWorkflowAvatarUrl(member, member?.user || member, 128);
  return {
    ...(displayName ? { displayName } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function hasRealDiscordAvatarUrl(url?) {
  const u = String(url || "").trim();
  if (!u) return false;
  if (/\/embed\/avatars\//i.test(u)) return false;
  // User global + guild member + media CDN (pause usa spesso /avatars/, resoconti spesso /guilds/.../avatars/)
  return /(?:cdn\.discordapp\.com|media\.discordapp\.net)\/(?:avatars\/\d+\/|guilds\/\d+\/users\/\d+\/avatars\/)/i.test(
    u,
  );
}

function preferAnimatedStoredAvatarUrl(url?, size = 128) {
  const raw = String(url || "").trim();
  if (!hasRealDiscordAvatarUrl(raw)) return "";
  try {
    if (typeof normalizeDiscordCdnAvatarUrl === "function") {
      return normalizeDiscordCdnAvatarUrl(raw, { size, preferAnimated: true }) || raw;
    }
  } catch (_) {}
  if (/\/a_[a-f0-9]+\./i.test(raw)) {
    return raw.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
  }
  return raw;
}

/** Mai usare embed/default Discord: se manca il member, non deve coprire l'avatar salvato.
 *  avatarGlobalFirst1: globale prima del guild (CDN /guilds/... spesso 404). */
function liveWorkflowAvatarUrl(member?, user?, size = 128) {
  const fromPreferred =
    sitePreferredAvatarUrl(member, { size, preferAnimated: true, allowDefault: false }) ||
    sitePreferredAvatarUrl(user, { size, preferAnimated: true, allowDefault: false }) ||
    "";
  if (hasRealDiscordAvatarUrl(fromPreferred)) {
    return preferAnimatedStoredAvatarUrl(fromPreferred, size) || fromPreferred;
  }
  const fromMember = member
    ? guildMemberDisplayAvatarUrlDynamic(member, { size, allowDefault: false })
    : "";
  if (hasRealDiscordAvatarUrl(fromMember) && !/\/guilds\/\d+\/users\//i.test(String(fromMember))) {
    return preferAnimatedStoredAvatarUrl(fromMember, size) || fromMember;
  }
  const fromUser = user
    ? userAvatarUrlDynamic(user, { size, allowDefault: false })
    : "";
  if (hasRealDiscordAvatarUrl(fromUser) && !/\/guilds\/\d+\/users\//i.test(String(fromUser))) {
    return preferAnimatedStoredAvatarUrl(fromUser, size) || fromUser;
  }
  if (hasRealDiscordAvatarUrl(fromMember)) return preferAnimatedStoredAvatarUrl(fromMember, size) || fromMember;
  if (hasRealDiscordAvatarUrl(fromUser)) return preferAnimatedStoredAvatarUrl(fromUser, size) || fromUser;
  return "";
}

/* mobileStaffFast1: list enrichment default = cache only (no Discord-fetch).
   inboxAvatarFetch1: detail può allowFetch → getUserCached (appelli/candidature fuori guild). */
async function resolveWorkflowSubject(client?, guild?, userId?, options: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return { displayName: "", avatarUrl: "" };

  const member = guild?.members?.cache?.get?.(uid) || null;
  let user = member?.user || null;
  if (!user && client?.users?.cache?.get) {
    user = client.users.cache.get(uid) || null;
  }
  if (!user && options.allowFetch && client) {
    try {
      user = await Promise.race([
        getUserCached(client, uid),
        new Promise((resolve?) => setTimeout(() => resolve(null), Number(options.fetchTimeoutMs) || 1200)),
      ]);
    } catch (_) {
      user = null;
    }
  }

  const displayName = pickSubjectDisplayName(
    uid,
    member?.displayName,
    user?.globalName,
    user?.username,
  );
  const avatarUrl = liveWorkflowAvatarUrl(member, user, 128);

  return {
    displayName: displayName || "",
    avatarUrl,
  };
}

async function applyWorkflowSubjectToItem(client?, guild?, item?, options: Record<string, any> = {}) {
  if (!item) return item;
  const uid = String(item.userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return item;
  const name = pickSubjectDisplayName(uid, item.displayName);
  const nameMissing = !name;
  const storedUrl = String(item.avatarUrl || "").trim();
  /* avatarGlobalFirst1: URL guild salvati spesso 404 — ricalcola sempre dal member live. */
  const storedIsGuild = /\/guilds\/\d+\/users\//i.test(storedUrl);
  if (hasRealDiscordAvatarUrl(storedUrl) && !nameMissing && !storedIsGuild) return item;

  const sub = await resolveWorkflowSubject(client, guild, uid, options);
  const resolvedName = pickSubjectDisplayName(uid, sub.displayName);
  return {
    ...item,
    displayName: name || resolvedName || "",
    avatarUrl: sub.avatarUrl || (hasRealDiscordAvatarUrl(storedUrl) && !storedIsGuild ? storedUrl : "") || "",
  };
}

async function enrichWorkflowListSubjects(client?, guild?, items?) {
  if (!client || !Array.isArray(items) || !items.length) return items || [];

  const needIds = [
    ...new Set(
      items
        .filter((it?) => {
          const uid = String(it?.userId || "").trim();
          if (!/^\d{16,22}$/.test(uid)) return false;
          const name = String(it?.displayName || "").trim();
          const nameMissing =
            !name ||
            name === uid ||
            /^\d{16,22}$/.test(name) ||
            isGenericWorkflowSubjectLabel(name) ||
            isWorkflowRoleSlug(name, { workflowType: it.type || it.kind || "" });
          return nameMissing || !hasRealDiscordAvatarUrl(it?.avatarUrl);
        })
        .map((it?) => String(it.userId)),
    ),
  ].slice(0, 60);

  const resolved = new Map();
    for (let i = 0; i < needIds.length; i += 5) {
    const chunk = needIds.slice(i, i + 5);
    await Promise.all(
      chunk.map(async (uid?) => {
        const sub = await resolveWorkflowSubject(client, guild, uid);
        if (sub.displayName || sub.avatarUrl) resolved.set(uid, sub);
      }),
    );
  }

  return items.map((it?) => {
    const uid = String(it?.userId || "").trim();
    const sub = resolved.get(uid);
    if (!sub) {
      if (hasRealDiscordAvatarUrl(it.avatarUrl)) return it;
            if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(String(it.avatarUrl || ""))) {
        return { ...it, avatarUrl: "" };
      }
      return it;
    }
    const name = String(it.displayName || "").trim();
    const nameMissing =
      !name ||
      name === uid ||
      /^\d{16,22}$/.test(name) ||
      isGenericWorkflowSubjectLabel(name) ||
      isWorkflowRoleSlug(name, { workflowType: it.type || it.kind || "" });
    const subName = String(sub.displayName || "").trim();
    const subIsId = !subName || subName === uid || /^\d{16,22}$/.test(subName);
    return {
      ...it,
      displayName: nameMissing ? (subIsId ? "Utente" : subName) : it.displayName,
      avatarUrl: sub.avatarUrl || (hasRealDiscordAvatarUrl(it.avatarUrl) ? it.avatarUrl : "") || "",
    };
  });
}

function cleanAppealPreviewText(text?) {
  return stripDiscordDecorations(String(text || ""), { keepNewlines: true })
    .replace(/^Utente\s*:?\s*/im, "")
    .replace(/\(\s*`?\d{16,20}`?\s*\)/g, "")
    .replace(/\b\d{16,20}\b/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isWorkflowRoleSlug(value?, doc?) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return true;
  const type = String(doc?.workflowType || doc?.workflowKind || "").trim().toLowerCase();
  if (type && v === type) return true;
  return /^(helper|partnermanager|partner manager|blogger)$/.test(v);
}

function readStoredSubject(doc?) {
  const uid = String(doc?.userId || "").trim();
  const storedName = pickSubjectDisplayName(uid, stripDiscordDecorations(doc?.workflowSubjectName || ""));
  const storedAvatar = String(doc?.workflowSubjectAvatarUrl || "").trim();
  const title = stripDiscordDecorations(doc?.title || "");
  const queue = String(doc?.workflowQueue || "");
  if (storedName) {
    return { displayName: storedName, avatarUrl: storedAvatar };
  }
  if (queue === "pause" && title && !isGenericWorkflowSubjectLabel(title, doc) && !isSnowflakeLikeLabel(title, uid)) {
    return { displayName: title, avatarUrl: "" };
  }
    if (queue !== "appelli" && queue !== "candidature" && title && !isGenericWorkflowSubjectLabel(title, doc) && !isSnowflakeLikeLabel(title, uid)) {
    return { displayName: title, avatarUrl: "" };
  }
  return { displayName: "", avatarUrl: storedAvatar };
}

function docToListItem(doc?, memberCache?) {
  const queue = String(doc?.workflowQueue || "");
  const status = queue === "resoconti" ? resolveResocontoDocStatus(doc) : normalizeStatus(doc?.status, "pending");
  const userId = String(doc?.userId || "");
  const member = memberCache?.get?.(userId) || null;
  const stored = readStoredSubject(doc);
  const displayName =
    pickSubjectDisplayName(
      userId,
      member?.displayName,
      member?.user?.globalName,
      member?.user?.username,
      stored.displayName,
    ) || stored.displayName || "";
  const decidedBy = String(doc?.workflowDecidedBy || "").trim();
  const decidedMember = decidedBy && !/^system$/i.test(decidedBy) ? memberCache?.get?.(decidedBy) || null : null;
  const storedDecidedName = String(doc?.workflowDecidedByName || "").trim();
  let decidedByName = "";
  if (/^system$/i.test(decidedBy) || /^system$/i.test(storedDecidedName)) {
    decidedByName = "Sistema";
  } else {
    decidedByName =
      pickSubjectDisplayName(
        decidedBy,
        storedDecidedName,
        decidedMember?.displayName,
        decidedMember?.user?.globalName,
        decidedMember?.user?.username,
      ) ||
      (storedDecidedName && !/^\d{16,22}$/.test(storedDecidedName) ? storedDecidedName.slice(0, 120) : "") ||
      "";
  }
  const createdFromMsg = snowflakeToDate(doc?.workflowMessageId);
  const createdAt = createdFromMsg || (doc?.createdAt ? new Date(doc.createdAt) : null);
  const avatarUrl =
    liveWorkflowAvatarUrl(member, member?.user, 128) ||
    preferAnimatedStoredAvatarUrl(stored.avatarUrl, 128) ||
    (hasRealDiscordAvatarUrl(stored.avatarUrl) ? String(stored.avatarUrl).trim() : "") ||
    "";
  const base = {
    recordId: String(doc?._id || ""),
    dedupeKey: String(doc?.dedupeKey || ""),
    userId,
    displayName: stripDiscordDecorations(displayName) || displayName,
    avatarUrl,
    title: stripDiscordDecorations(doc?.title || ""),
    preview: stripDiscordDecorations(doc?.body || ""),
    createdAt: createdAt ? createdAt.toISOString() : null,
    status,
    statusLabel: statusLabelFor(status, doc?.workflowFields?.statusLabel || doc?.staffReason || null),
    canAct: status === "pending",
    decidedBy: decidedBy || null,
    decidedByName: decidedByName || null,
    decidedAt: doc?.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
  };
  if (queue === "pause") {
    const track = pauseTrackRoleKey(doc?.workflowFields || {});
    const roleLabel = pauseRoleDisplayLabel(doc?.workflowFields || {}, member, member?.guild || null);
    const start = String(doc?.workflowFields?.start || doc?.workflowFields?.dataRichiesta || "");
    const end = String(doc?.workflowFields?.end || doc?.workflowFields?.dataRitorno || "");
    const today = getTodayUtc();
    const liveStatusLabel =
      status === "accepted"
        ? getPauseStatusLabel(
            { status: "accepted", dataRichiesta: start, dataRitorno: end },
            today,
          )
        : statusLabelFor(status, doc?.workflowFields?.statusLabel || doc?.staffReason || null);
    const cleanedName =
      cleanPauseSubjectDisplayName(displayName, userId) ||
      cleanPauseSubjectDisplayName(stored.displayName, userId) ||
      displayName;
    return {
      ...base,
      displayName: cleanedName || base.displayName,
      id: String(doc?.workflowPauseId || ""),
      start,
      end,
      motivazione: stripDiscordDecorations(doc?.reason || doc?.body || ""),
      ruolo: roleLabel || track,
      ruoloLabel: roleLabel || track,
      ruoloRichiesto: roleLabel || track,
      ruoloTrack: track,
      phase: getPausePhase(start, end, today),
      statusLabel: liveStatusLabel,
    };
  }
  if (queue === "candidature") {
    return {
      ...base,
      messageId: String(doc?.workflowMessageId || ""),
      channelId: String(doc?.workflowChannelId || ""),
      type: String(doc?.workflowType || ""),
    };
  }
  if (queue === "appelli") {
    return {
      ...base,
      preview: cleanAppealPreviewText(doc?.body || doc?.content || base.preview || ""),
      messageId: String(doc?.workflowMessageId || ""),
      channelId: String(doc?.workflowChannelId || ""),
      kind: String(doc?.workflowKind || ""),
    };
  }
  /* boardsSchedaIdFix1: revisione → id scheda = workflowMessageId (NON _id workflow) */
  if (queue === "revisione") {
    const listingId = String(doc?.workflowMessageId || "").trim();
    const kind = String(doc?.workflowKind || doc?.workflowType || "server").trim().toLowerCase() || "server";
    return {
      ...base,
      id: listingId,
      listingId,
      messageId: listingId,
      channelId: String(doc?.workflowChannelId || ""),
      kind: kind === "bot" || kind === "bots" ? "bot" : "server",
      type: kind === "bot" || kind === "bots" ? "bot" : "server",
    };
  }
  if (queue === "resoconti") {
    const weekKey =
      String(doc?.workflowWeekKey || "").trim() ||
      weekKeyFromDate(createdFromMsg || doc?.createdAt) ||
      "";
    const actionKey = normalizeResocontoActionKey(doc?.workflowActionKey || "");
    const fullContent = String(doc?.content || doc?.body || "");
    const azioneText = extractResocontoAzioneText(fullContent);
    const proposedLabel = formatResocontoProposedLabel(azioneText, actionKey);
    const wf =
      doc?.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
        ? doc.workflowFields
        : {};
    const flags = deriveResocontoStaffFlags(fullContent, {
      azioneText,
      workflowFields: wf,
    });
    return {
      ...base,
      preview:
        buildResocontoInboxPreview(fullContent, {
          kind: String(doc?.workflowKind || ""),
          proposedLabel,
          weeklyMessages: wf.weeklyMessages,
          weeklyVoiceSeconds: wf.weeklyVoiceSeconds,
          weeklyPartners: wf.weeklyPartners,
        }) ||
        stripDiscordDecorations(fullContent, { keepNewlines: false, keepCustomEmoji: false }).slice(0, 180),
      messageId: String(doc?.workflowMessageId || ""),
      channelId: String(doc?.workflowChannelId || ""),
      kind: String(doc?.workflowKind || ""),
      actionKey,
      proposedLabel,
      roleId: doc?.workflowRoleId ? String(doc.workflowRoleId) : null,
      roleLabel: (() => {
        /* pauseRolePrecise1 / resoRolePrecise1: mai lasciare generico "Staff" se abbiamo roleId */
        const kind = String(doc?.workflowKind || "").trim().toLowerCase();
        if (kind === "p") return "Partner Manager";
        const rid = String(doc?.workflowRoleId || "").trim();
        const guild = member?.guild || null;
        const byId = {
          [String(IDs.roles.Helper || "")]: "Helper",
          [String(IDs.roles.Mod || "")]: "Mod",
          [String(IDs.roles.SeniorModerator || "")]: "Senior Moderator",
          [String(IDs.roles.Director || "")]: "Director",
          [String(IDs.roles.HighStaff || "")]: "High Staff",
          [String(IDs.roles.PartnerManager || "")]: "Partner Manager",
          [String(IDs.roles.Staff || "")]: "Staff",
        };
        if (rid) {
          const live = guild?.roles?.cache?.get?.(rid);
          const name = String(live?.name || byId[rid] || "").trim();
          if (name) return name;
        }
        try {
          if (member) {
            const ranked = formatPauseRoleLabelForMessage(guild, "Staff", member);
            if (ranked && !/^(staff)$/i.test(ranked)) return ranked;
          }
        } catch (_) {}
        if (kind === "s") return byId[rid] || "";
        return "";
      })(),
      weekKey,
      weekLabel: formatWeekLabel(weekKey),
      statusLabel: deriveResocontoStatusLabel(doc),
      isNewStaff: flags.isNewStaff,
      inPause: flags.inPause,
      pauseEnded: flags.pauseEnded,
      pauseNote: flags.pauseNote,
      weeklyMessages: wf.weeklyMessages != null ? Number(wf.weeklyMessages) : null,
      weeklyVoiceSeconds: wf.weeklyVoiceSeconds != null ? Number(wf.weeklyVoiceSeconds) : null,
      weeklyPartners: wf.weeklyPartners != null ? Number(wf.weeklyPartners) : null,
      weeklySanctions: wf.weeklySanctions != null ? Number(wf.weeklySanctions) : null,
      activityGrade: wf.activityGrade != null ? String(wf.activityGrade) : "",
      behaviorGrade: wf.behaviorGrade != null ? String(wf.behaviorGrade) : "",
      azioneDisplay: wf.azioneDisplay != null ? String(wf.azioneDisplay) : "",
      activityLimits:
        wf.activityLimits && typeof wf.activityLimits === "object" && !Array.isArray(wf.activityLimits)
          ? {
              messages: Number(wf.activityLimits.messages) || 0,
              hours: Number(wf.activityLimits.hours) || 0,
            }
          : null,
      sanctionLimit:
        wf.sanctionLimit != null && Number.isFinite(Number(wf.sanctionLimit))
          ? Number(wf.sanctionLimit)
          : null,
      costanzaChart: Array.isArray(wf.costanzaChart)
        ? wf.costanzaChart
            .map((p?) => ({
              dayKey: String(p?.dayKey || "").trim(),
              text: Math.max(0, Math.floor(Number(p?.text) || 0)),
              voiceSeconds: Math.max(0, Math.floor(Number(p?.voiceSeconds) || 0)),
            }))
            .filter((p?) => p.dayKey)
            .sort((a?, b?) => String(a.dayKey).localeCompare(String(b.dayKey)))
        : [],
      rolesHistory: Array.isArray(wf.rolesHistory) ? wf.rolesHistory : [],
    };
  }
  return base;
}


function parseNumberedQaBlocks(text?) {
  const raw = stripDiscordDecorations(text || "", { keepNewlines: true });
  if (!raw) return [];
  const normalized = raw
    .replace(/(\d{1,2})\\\./g, "$1.")
    .replace(/\*\*/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) return [];

  const lines = normalized.split("\n");
  const blocks = [];
  let expected = 1;
  let current = null;

  const flush = () => {
    if (!current) return;
    const name = String(current.name || "").trim();
    let value = String(current.value || "").trim();
    if (!name && !value) {
      current = null;
      return;
    }
    const qInline = name.match(/^(\d{1,2}\.\s*[\s\S]{1,280}?\?)\s+([\s\S]+)$/);
    if (qInline && !value) {
      blocks.push({ name: qInline[1].trim(), value: qInline[2].trim() || "—" });
    } else {
      blocks.push({ name: name || `Domanda ${blocks.length + 1}`, value: value || "—" });
    }
    current = null;
  };

  for (const line of lines) {
    const m = String(line || "").match(/^(\d{1,2})\.\s*(.*)$/);
    const num = m ? Number(m[1]) : 0;
    if (m && Number.isFinite(num) && num === expected) {
      flush();
      const rest = String(m[2] || "").trim();
      /* idDiscordLabelFix1: "ID Discord" non deve diventare name=ID value=Discord. */
      const idLine =
        rest.match(/^(ID\s+Discord)(?:\s+(.+))?$/i) || rest.match(/^(ID)(?:\s+(.+))?$/i);
      const ageLine = rest.match(/^(Et[aà])(?:\s+(.+))?$/i);
      if (idLine) {
        current = { name: `${num}. ${idLine[1]}`, value: String(idLine[2] || "").trim() };
      } else if (ageLine) {
        current = { name: `${num}. ${ageLine[1]}`, value: String(ageLine[2] || "").trim() };
      } else {
        current = { name: `${num}. ${rest}`.trim(), value: "" };
      }
      expected += 1;
      continue;
    }
    if (!current) continue;
    current.value = current.value ? `${current.value}\n${line}` : line;
  }
  flush();
  return blocks;
}

function normalizeResocontoActionKey(raw?) {
  const k = String(raw || "").trim().toLowerCase();
  const codes = new Set(["vp", "vn", "nl", "px", "dp", "rc", "batch"]);
  if (codes.has(k)) return k;
  for (const [code, label] of Object.entries(RESOCONTO_ACTION_LABELS)) {
    if (k === String(label || "").trim().toLowerCase()) return code;
  }
  if (/^nulla\b|nessuna azione/.test(k)) return "nl";
  if (/depex/.test(k)) return "dp";
  if (/richiamo/.test(k)) return "rc";
  if (/^pex\b/.test(k)) return "px";
  if (/positiv/.test(k)) return "vp";
  if (/negativ/.test(k)) return "vn";
  if (/multiple|registrate/.test(k)) return "batch";
  return "";
}

function parseResocontoBodyFields(text?) {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!raw) return [];
  if (!/(Staffer|Partner Manager|Ruolo|Messaggi in una settimana|Azione:)/i.test(raw)) return [];

  const lines = raw.split("\n");
  const blocks = [];
  let current = null;
  let inCode = false;
  let codeLines = [];

  const flush = () => {
    if (!current) return;
    if (codeLines.length) {
      current.value = `${current.value ? `${current.value}\n` : ""}${codeLines.join("\n")}`;
      codeLines = [];
    }
    const val = String(current.value || "").trim();
    if (current.name || val) blocks.push({ name: current.name || "Dettaglio", value: val || "—" });
    current = null;
  };

  const parseLabelLine = (line?) => {
    const emojiTokens = [];
    const protectedLine = String(line || "").replace(/<(a?):([\w~-]+):(\d+)>/g, (m?) => {
      const i = emojiTokens.length;
      emojiTokens.push(m);
      return `{{VCEMOJI${i}}}`;
    });
    let cleaned = stripDiscordDecorations(protectedLine, { keepNewlines: false, keepCustomEmoji: true });
    if (emojiTokens.length) {
      for (let i = 0; i < emojiTokens.length; i += 1) {
        cleaned = cleaned.split(`{{VCEMOJI${i}}}`).join(emojiTokens[i]);
      }
    }
    if (!cleaned) return null;
    if (/azione confermata da/i.test(cleaned)) {
      return {
        name: "Esito revisione",
        value: cleaned.replace(/^[\s\S]*?azione confermata da\s*/i, "Confermata da ").trim(),
      };
    }
    if (/azione negata da/i.test(cleaned)) {
      return {
        name: "Esito revisione",
        value: cleaned.replace(/^[\s\S]*?azione negata da\s*/i, "Negata da ").trim(),
      };
    }
        const tokens2 = [];
    const masked = cleaned.replace(/<(a?):([\w~-]+):(\d+)>/g, (m?) => {
      const i = tokens2.length;
      tokens2.push(m);
      return `{{VCEMOJI${i}}}`;
    });
    const colon = masked.match(/^(.*):\s*(.*)$/);
    if (!colon) return null;
    let label = String(colon[1] || "").trim();
    let value = String(colon[2] || "").trim();
    if (!label || label.length > 120) return null;
    if (/^\{\{VCEMOJI\d+\}\}$/.test(label)) return null;
    for (let i = 0; i < tokens2.length; i += 1) {
      label = label.split(`{{VCEMOJI${i}}}`).join(tokens2[i]);
      value = value.split(`{{VCEMOJI${i}}}`).join(tokens2[i]);
    }
    return { name: label, value };
  };

  lines.forEach((line?) => {
    const trimmed = line.trim();
    if (trimmed === "```") {
      inCode = !inCode;
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }
    if (!trimmed) return;
    if (/^messaggi per giorno$/i.test(stripDiscordDecorations(trimmed))) {
      if (current) current.value = `${current.value ? `${current.value}\n` : ""}messaggi per giorno`;
      return;
    }
    const hit = parseLabelLine(line);
    if (hit) {
      flush();
      current = { name: hit.name, value: hit.value };
      return;
    }
    if (/\u2192/.test(trimmed) && /messaggi|ore/i.test(trimmed)) {
      flush();
      current = { name: "Scambio limiti", value: stripDiscordDecorations(trimmed, { keepCustomEmoji: true }) };
      flush();
      return;
    }
    if (current) current.value = `${current.value ? `${current.value}\n` : ""}${trimmed}`;
  });
  flush();
  return blocks.filter((b?) => stripDiscordDecorations(b.name || "") || stripDiscordDecorations(b.value || "", { keepCustomEmoji: true }));
}

function buildDetailFields(doc?, member = null) {
  const queue = String(doc?.workflowQueue || "");
  const keepEmoji = false;
  const body = stripDiscordDecorations(doc?.content || doc?.body || "", {
    keepNewlines: true,
    keepCustomEmoji: keepEmoji,
  });
  if (queue === "resoconti") {
    const resocontoFields = parseResocontoBodyFields(body);
    if (resocontoFields.length) return resocontoFields;
  }
  if (queue === "candidature") {
    const candidatureFields = parseNumberedQaBlocks(doc?.content || doc?.body || "");
    if (candidatureFields.length) return candidatureFields;
  }
  const wf = doc?.workflowFields;
  if (Array.isArray(wf) && wf.length) {
    const status = normalizeStatus(doc?.status, "pending");
    const rows = wf
      .map((field?) => {
        const name = stripDiscordDecorations(field?.name || "", { keepNewlines: true });
        let value = stripDiscordDecorations(field?.value || "", { keepNewlines: true });
        if (queue === "pause") {
          if (/^stato$/i.test(name)) value = statusLabelFor(status, value);
          if (/^ruolo/i.test(name)) {
            value = pauseRoleDisplayLabel(
              { ruoloRichiesto: value, ruoloLabel: String(doc?.workflowFields?.ruoloLabel || "") },
              member,
              member?.guild || null,
            );
          }
        }
        return { name, value };
      })
      .filter((field?) => field.name || field.value);
    if (rows.length) return rows;
  }
  /* boardsRevSheetUi1: meta object con rows QA */
  if (
    queue === "revisione" &&
    wf &&
    typeof wf === "object" &&
    !Array.isArray(wf) &&
    Array.isArray(wf.rows) &&
    wf.rows.length
  ) {
    return wf.rows
      .map((field?) => ({
        name: stripDiscordDecorations(field?.name || "", { keepNewlines: true }),
        value: stripDiscordDecorations(field?.value || "", { keepNewlines: true }),
      }))
      .filter((field?) => field.name || field.value);
  }
  if (wf && typeof wf === "object" && !Array.isArray(wf)) {
    const rows = [];
    const status = normalizeStatus(doc?.status, "pending");
    if (wf.start || wf.end) rows.push({ name: "Periodo", value: `${wf.start || "?"} → ${wf.end || "?"}` });
    if (queue === "pause") {
      const roleLabel = pauseRoleDisplayLabel(wf, member, member?.guild || null);
      if (roleLabel) rows.push({ name: "Ruolo richiesto", value: roleLabel });
    } else if (wf.ruoloRichiesto) {
      rows.push({ name: "Ruolo richiesto", value: String(wf.ruoloRichiesto) });
    }
    const motivazione = stripDiscordDecorations(doc?.content || doc?.reason || doc?.body || "", {
      keepNewlines: true,
    });
    if (motivazione) rows.push({ name: "Motivazione", value: motivazione });
    rows.push({
      name: "Stato",
      value: statusLabelFor(status, wf.statusLabel || doc?.staffReason || null),
    });
    if (rows.length) return rows;
  }
  return parseNumberedQaBlocks(doc?.content || doc?.body || "");
}

function docToDetail(doc?, member?, memberCache?) {
  const cache =
    memberCache ||
    (member && doc?.userId ? new Map([[String(doc.userId || ""), member]]) : null);
  const item: any = docToListItem(doc, cache);
  const keepEmoji = false;
  const body = stripDiscordDecorations(doc?.content || doc?.body || "", {
    keepNewlines: true,
    keepCustomEmoji: keepEmoji,
  });
  const fields = buildDetailFields(doc, member);
  const wf =
    doc?.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
      ? doc.workflowFields
      : {};
  const costanzaChart = Array.isArray(wf.costanzaChart)
    ? wf.costanzaChart
        .map((p?) => ({
          dayKey: String(p?.dayKey || "").trim(),
          text: Math.max(0, Math.floor(Number(p?.text) || 0)),
          voiceSeconds: Math.max(0, Math.floor(Number(p?.voiceSeconds) || 0)),
        }))
        .filter((p?) => p.dayKey)
        .sort((a?, b?) => String(a.dayKey).localeCompare(String(b.dayKey)))
    : [];
  let weeklyPartners = wf.weeklyPartners != null ? Number(wf.weeklyPartners) : null;
  if ((weeklyPartners == null || !Number.isFinite(weeklyPartners)) && String(item.kind || "").toLowerCase() === "p") {
    const partnerField = (Array.isArray(fields) ? fields : []).find((f?) =>
      /^partner$/i.test(stripDiscordDecorations(String(f?.name || ""), { keepCustomEmoji: false }).trim()),
    );
    const digits = String(partnerField?.value || "").replace(/[^\d]/g, "");
    if (digits) weeklyPartners = Math.max(0, Math.floor(Number(digits)));
  }
  return {
    ...item,
    body,
    content: body,
    fields,
    motivazione: stripDiscordDecorations(
      doc?.content || doc?.reason || doc?.body || item.motivazione || "",
      {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      },
    ),
    timing: wf.timing || null,
    giorniScalati: wf.giorniScalati ?? null,
    costanzaChart,
    activityGrade: wf.activityGrade != null ? String(wf.activityGrade) : "",
    behaviorGrade: wf.behaviorGrade != null ? String(wf.behaviorGrade) : "",
    azioneDisplay: wf.azioneDisplay != null ? String(wf.azioneDisplay) : "",
    weeklyMessages: wf.weeklyMessages != null ? Number(wf.weeklyMessages) : null,
    weeklyVoiceSeconds: wf.weeklyVoiceSeconds != null ? Number(wf.weeklyVoiceSeconds) : null,
    weeklyPartners:
      weeklyPartners != null && Number.isFinite(weeklyPartners) ? weeklyPartners : null,
    activityLimits:
      wf.activityLimits && typeof wf.activityLimits === "object" && !Array.isArray(wf.activityLimits)
        ? {
            messages: Number(wf.activityLimits.messages) || 0,
            hours: Number(wf.activityLimits.hours) || 0,
          }
        : null,
    sanctionLimit:
      wf.sanctionLimit != null && Number.isFinite(Number(wf.sanctionLimit))
        ? Number(wf.sanctionLimit)
        : null,
    weeklySanctions:
      wf.weeklySanctions != null && Number.isFinite(Number(wf.weeklySanctions))
        ? Number(wf.weeklySanctions)
        : null,
    rolesHistory: Array.isArray(wf.rolesHistory) ? wf.rolesHistory : [],
  };
}

async function enrichResocontoDetailChart(detail?, doc?, guild?) {
  if (!detail || String(detail.kind || "").toLowerCase() !== "s") return detail;
  if (Array.isArray(detail.costanzaChart) && detail.costanzaChart.length >= 5) {
    detail.costanzaChart = detail.costanzaChart
      .slice()
      .sort((a?, b?) => String(a.dayKey || "").localeCompare(String(b.dayKey || "")));
  } else {
    const userId = String(detail.userId || doc?.userId || "").trim();
    const guildId = String(guild?.id || doc?.guildId || "").trim();
    if (userId && guildId) {
      try {
        const { getUserOverviewStats } = require("../Services/Community/activityService") as typeof import("../Services/Community/activityService");
        const {
          buildResocontoOverviewOptions,
          collectResocontoVoiceExcludeIds,
          getResocontoWeekRangeFromWeekKey,
          serializeCostanzaChart,
        } = require("../Services/Staff/weeklyStaffResocontoService") as typeof import("../Services/Staff/weeklyStaffResocontoService");
        const weekKey = String(detail.weekKey || doc?.workflowWeekKey || "").trim();
        const range = getResocontoWeekRangeFromWeekKey(weekKey);
        const scope = guild ? buildResocontoOverviewOptions(guild, range?.weekEnd || new Date()) : {};
        const exclude = guild ? collectResocontoVoiceExcludeIds(guild) : null;
        const overview = await getUserOverviewStats(
          guildId,
          userId,
          7,
          exclude?.size ? exclude : null,
          {
            ...scope,
            ...(range ? { rangeStart: range.weekStart, rangeEnd: range.weekEnd } : {}),
          },
        );
        const chart = serializeCostanzaChart(overview);
        if (chart.length) {
          detail.costanzaChart = chart;
          if (detail.weeklyMessages == null) {
            detail.weeklyMessages = Math.max(0, Math.floor(Number(overview?.windows?.d7?.text) || 0));
          }
          if (detail.weeklyVoiceSeconds == null) {
            detail.weeklyVoiceSeconds = Math.max(
              0,
              Math.floor(Number(overview?.windows?.d7?.voiceSeconds) || 0),
            );
          }
          if (doc?._id) {
            const prev =
              doc.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
                ? { ...doc.workflowFields }
                : {};
            void SiteDocument.updateOne(
              { _id: doc._id },
              {
                $set: {
                  workflowFields: {
                    ...prev,
                    costanzaChart: chart,
                    ...(detail.weeklyMessages != null ? { weeklyMessages: detail.weeklyMessages } : {}),
                    ...(detail.weeklyVoiceSeconds != null
                      ? { weeklyVoiceSeconds: detail.weeklyVoiceSeconds }
                      : {}),
                  },
                },
              },
            ).catch(() => null);
          }
        }
      } catch (_) {}
    }
  }
  try {
    detail = await enrichResocontoRolesHistory(detail, doc, guild);
  } catch (_) {}
  return detail;
}

async function enrichResocontoRolesHistory(detail?, doc?, guild?) {
  if (!detail) return detail;
  const userId = String(detail.userId || doc?.userId || "").trim();
  const guildId = String(guild?.id || doc?.guildId || "").trim();
  if (!userId || !guildId) return detail;
  if (guild?.roles?.fetch) {
    await guild.roles.fetch().catch(() => null);
  }

  function normalizeRoleToken(value?) {
    const raw = String(value == null ? "" : value).trim();
    if (/^\d{17,20}$/.test(raw)) {
      const role = guild?.roles?.cache?.get?.(raw);
      if (role?.name) return normalizeRoleToken(role.name);
    }
    const s = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!s) return "";
    const aliases = {
      mod: "moderator",
      mods: "moderator",
      moderator: "moderator",
      "senior moderator": "senior moderator",
      "sr moderator": "senior moderator",
      srmod: "senior moderator",
      "senior mod": "senior moderator",
      helper: "helper",
      "trial helper": "helper",
      "partner manager": "partner manager",
      pm: "partner manager",
      director: "director",
      admin: "admin",
      manager: "manager",
      founder: "founder",
      member: "member",
    };
    if (aliases[s]) return aliases[s];
    if (s.charAt(s.length - 1) === "s" && aliases[s.slice(0, -1)]) return aliases[s.slice(0, -1)];
    return s;
  }

  function dayKey(iso?) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));
    } catch (_) {
      return String(iso).slice(0, 10);
    }
  }

  function preferRow(a?, b?) {
    const labelLen = (r?) =>
      String(r?.to || r?.newRole || "").length + String(r?.from || r?.oldRole || "").length;
    return labelLen(b) > labelLen(a) ? b : a;
  }

  function dedupeRoleRows(rows?) {
    if (!Array.isArray(rows) || !rows.length) return [];
    const out = [];
    const seen = Object.create(null);
    for (const row of rows) {
      if (!row) continue;
      const fromRaw = String(row.from || row.oldRole || "").trim();
      const toRaw = String(row.to || row.newRole || "").trim();
      const from = normalizeRoleToken(fromRaw);
      const to = normalizeRoleToken(toRaw);
      const day = dayKey(row.dateIso || row.date || "");
      const reason = String(row.reason || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      const tripKey = from && to ? `${day}|${from}|${to}` : "";
      const key = `${day}|${from}|${to}|${reason}`;
      const softKey = to ? `${day}|*|${to}|${reason}` : "";
      if (from || to) {
                if (tripKey && Object.prototype.hasOwnProperty.call(seen, tripKey)) {
          out[seen[tripKey]] = preferRow(out[seen[tripKey]], row);
          continue;
        }
        if (Object.prototype.hasOwnProperty.call(seen, key)) {
          out[seen[key]] = preferRow(out[seen[key]], row);
          continue;
        }
        if (softKey && Object.prototype.hasOwnProperty.call(seen, softKey)) {
          out[seen[softKey]] = preferRow(out[seen[softKey]], row);
          continue;
        }
        const idx = out.length;
        if (tripKey) seen[tripKey] = idx;
        seen[key] = idx;
        if (softKey) seen[softKey] = idx;
      }
      out.push(row);
    }
    return out;
  }

  function humanizeRoleKey(key?) {
    return String(key || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .trim();
  }

  function roleKeyFromConfiguredId(roleId?) {
    const raw = String(roleId || "").trim();
    if (!raw) return null;
    const roles = IDs.roles || {};
    for (const [key, val] of Object.entries(roles)) {
      if (String(val) === raw) return key;
    }
    return null;
  }

  function displayRoleLabel(value?) {
    const raw = String(value == null ? "" : value).trim();
    if (!raw) return "";
    if (/^\d{16,22}$/.test(raw)) {
      let id = raw;
      try {
        const { remapKnownRoleSnowflake } = require("../Utils/Config/emergencyRoleIdRemap") as typeof import("../Utils/Config/emergencyRoleIdRemap");
        const mapped = remapKnownRoleSnowflake(raw);
        if (mapped) id = mapped;
      } catch (_) {}
      const role =
        guild?.roles?.cache?.get?.(id) ||
        guild?.roles?.cache?.get?.(raw) ||
        null;
      const live = String(role?.name || "").trim();
      if (live) return live;
      // careerMemberHelper1: same fallback as profilo — map known staff IDs (Member/Helper/…)
      // so Member→Helper does not disappear when Discord cache misses the role.
      const key = roleKeyFromConfiguredId(id) || roleKeyFromConfiguredId(raw);
      if (key) return humanizeRoleKey(key) || key;
      return "";
    }
    return raw;
  }

  function hydrateRoleRowLabels(rows?) {
    return (Array.isArray(rows) ? rows : [])
      .map((row?) => {
        if (!row) return null;
        const from = displayRoleLabel(row.from || row.oldRole);
        const to = displayRoleLabel(row.to || row.newRole);
        if (!from && !to) return null;
        return {
          ...row,
          from: from || null,
          to: to || null,
          oldRole: from || null,
          newRole: to || null,
        };
      })
      .filter(Boolean);
  }

  // Snapshot on the workflow doc can be incomplete (e.g. only last pex).
  // Always prefer staff.rolesHistory from the profile — same source as profilo carriera.
  const snapshot = Array.isArray(detail.rolesHistory) && detail.rolesHistory.length
    ? hydrateRoleRowLabels(dedupeRoleRows(detail.rolesHistory))
    : [];

  try {
    const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
    const profile = await ActivityUserProfile.findOne({ guildId, userId })
      .select("staff.rolesHistory")
      .lean()
      .catch(() => null);
    const histRaw = Array.isArray(profile?.staff?.rolesHistory) ? profile.staff.rolesHistory : [];
    let hist = histRaw;
    try {
      const { isHiddenManualStaffCareerReason } = require("../Utils/Staff/staffTrackHistory") as typeof import("../Utils/Staff/staffTrackHistory");
      hist = histRaw.filter((row?) => !isHiddenManualStaffCareerReason(row?.reason));
    } catch (_) {}
    if (!hist.length) {
      detail.rolesHistory = snapshot;
      return detail;
    }
    const rows = hydrateRoleRowLabels(
      dedupeRoleRows(
        hist
          .map((row?) => {
            const d = row?.date ? new Date(row.date) : null;
            const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
            const from = displayRoleLabel(row?.oldRole);
            const to = displayRoleLabel(row?.newRole);
            if (!to && !from) return null;
            let dateLabel = "";
            try {
              if (iso) {
                dateLabel = new Date(iso).toLocaleDateString("it-IT", {
                  day: "2-digit",
                  month: "short",
                  year: "2-digit",
                });
              }
            } catch (_) {}
            return {
              from: from || null,
              to: to || null,
              oldRole: from || null,
              newRole: to || null,
              reason: String(row?.reason || "").trim() || null,
              dateIso: iso,
              dateLabel: dateLabel || null,
              _sort: iso ? new Date(iso).getTime() : 0,
            };
          })
          .filter(Boolean)
          .sort((a?, b?) => b._sort - a._sort)
          .map(({ _sort, ...rest }) => rest),
      ),
    );
    // Merge snapshot under profile so any extra labels still help, then prefer profile length.
    detail.rolesHistory = rows.length
      ? hydrateRoleRowLabels(dedupeRoleRows([...rows, ...snapshot]))
      : snapshot;
    if (doc?._id && detail.rolesHistory.length) {
      const prev =
        doc.workflowFields && typeof doc.workflowFields === "object" && !Array.isArray(doc.workflowFields)
          ? { ...doc.workflowFields }
          : {};
      void SiteDocument.updateOne(
        { _id: doc._id },
        { $set: { workflowFields: { ...prev, rolesHistory: detail.rolesHistory } } },
      ).catch(() => null);
    }
  } catch (_) {
    detail.rolesHistory = snapshot.length
      ? snapshot
      : Array.isArray(detail.rolesHistory)
        ? hydrateRoleRowLabels(detail.rolesHistory)
        : [];
  }
  return detail;
}

async function upsertStaffWorkflowItem(payload?) {
  const guildId = String(payload?.guildId || IDs.guilds.main || "").trim();
  const queue = String(payload?.queue || payload?.workflowQueue || "").trim().toLowerCase();
  const userId = String(payload?.userId || "").trim();
  const dedupeKey = String(payload?.dedupeKey || "").trim();
  if (!guildId || !queue || !dedupeKey) return null;

  const statusIncoming = normalizeStatus(payload?.status, "pending");
  const existing = await SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId, dedupeKey })
    .select(
      "workflowDecidedBy workflowDecidedByName decidedAt status workflowSubjectName workflowSubjectAvatarUrl createdAt workflowWeekKey workflowActionKey staffReason workflowFields content body reason",
    )
    .lean()
    .catch(() => null);
  const existingStatus = normalizeStatus(existing?.status, "");
    let status = statusIncoming;
  const preserveDecided =
    queue === "resoconti" &&
    statusIncoming === "pending" &&
    (existingStatus === "cancelled" ||
      existingStatus === "closed" ||
      existingStatus === "accepted" ||
      existingStatus === "rejected");
  if (preserveDecided) {
    status = existingStatus;
  }
  const decidedBy = String(payload?.decidedBy || payload?.workflowDecidedBy || "").trim();
  const subjectDisplayName = pickSubjectDisplayName(
    userId,
    payload?.displayName,
    payload?.subjectDisplayName,
    payload?.workflowSubjectName,
    existing?.workflowSubjectName,
  );
  const subjectAvatarUrl = String(payload?.avatarUrl || payload?.subjectAvatarUrl || payload?.workflowSubjectAvatarUrl || "").trim();
  const incomingWorkflowFields = payload?.workflowFields ?? payload?.fields ?? null;
  const keepEmoji = queue === "resoconti";
  const createdFromPayload = payload?.createdAt ? new Date(payload.createdAt) : null;
  const createdFromSnow = snowflakeToDate(payload?.messageId || payload?.workflowMessageId);
  const createdAt =
    createdFromPayload && !Number.isNaN(createdFromPayload.getTime())
      ? createdFromPayload
      : createdFromSnow;
  const weekKey =
    queue === "resoconti"
      ? String(payload?.weekKey || payload?.workflowWeekKey || "").trim() ||
        weekKeyFromDate(createdAt || existing?.createdAt) ||
        ""
      : "";
  const incomingActionKey = normalizeResocontoActionKey(payload?.actionKey || payload?.workflowActionKey || "");
  const appliedActionKey =
    preserveDecided && existing?.workflowActionKey
      ? normalizeResocontoActionKey(existing.workflowActionKey)
      : incomingActionKey;
  const incomingStaffReason = String(payload?.staffReason || payload?.statusLabel || "").trim();
  const staffReason = (
    preserveDecided && existing?.staffReason
      ? String(existing.staffReason)
      : incomingStaffReason
  ).slice(0, 200);
  const preservedStatusLabel = String(existing?.workflowFields?.statusLabel || existing?.staffReason || "").trim();
  const incomingStatusLabel = String(payload?.statusLabel || payload?.staffReason || "").trim();
  const workflowStatusLabel =
    preserveDecided && preservedStatusLabel
      ? preservedStatusLabel.slice(0, 200)
      : incomingStatusLabel.slice(0, 200);
  const update: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId,
    userId,
    dedupeKey,
    workflowQueue: queue,
    workflowKind: String(payload?.kind || payload?.workflowKind || ""),
    workflowType: String(payload?.type || payload?.workflowType || ""),
    workflowMessageId: String(payload?.messageId || payload?.workflowMessageId || ""),
    workflowChannelId: String(payload?.channelId || payload?.workflowChannelId || ""),
    workflowPauseId: String(payload?.pauseId || payload?.workflowPauseId || ""),
    workflowRoleId: payload?.roleId != null ? String(payload.roleId) : "",
    workflowActionKey: appliedActionKey,
    workflowWeekKey: weekKey,
    title: stripDiscordDecorations(payload?.title || "", { keepCustomEmoji: keepEmoji }).slice(0, 120),
    body: stripDiscordDecorations(payload?.preview || payload?.body || "", {
      keepCustomEmoji: keepEmoji,
    }).slice(0, 500),
    /* inboxSheetFullText1: non sovrascrivere content pieno con body/preview corti */
    content: (() => {
      const incoming = stripDiscordDecorations(
        payload?.content || payload?.bodyFull || payload?.body || "",
        { keepNewlines: true, keepCustomEmoji: keepEmoji },
      ).slice(0, 50000);
      const prev = stripDiscordDecorations(existing?.content || "", {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      }).slice(0, 50000);
      if (!incoming) return prev;
      if (!prev) return incoming;
      return incoming.length >= prev.length ? incoming : prev;
    })(),
    reason: (() => {
      const incoming = stripDiscordDecorations(payload?.reason || payload?.motivazione || "", {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      }).slice(0, 4000);
      const prev = stripDiscordDecorations(existing?.reason || "", {
        keepNewlines: true,
        keepCustomEmoji: keepEmoji,
      }).slice(0, 4000);
      if (!incoming) return prev;
      if (!prev) return incoming;
      return incoming.length >= prev.length ? incoming : prev;
    })(),
    status,
    workflowSubjectName:
      subjectDisplayName ||
      pickSubjectDisplayName(userId, existing?.workflowSubjectName) ||
      "",
    workflowSubjectAvatarUrl: subjectAvatarUrl.slice(0, 512) || String(existing?.workflowSubjectAvatarUrl || ""),
    staffReason,
    workflowDecidedBy: decidedBy || String(existing?.workflowDecidedBy || ""),
    decidedAt:
      payload?.decidedAt ||
      (status !== "pending" ? existing?.decidedAt || new Date() : null),
  };
  if (
    Array.isArray(incomingWorkflowFields) &&
    incomingWorkflowFields.length
  ) {
    update.workflowFields = incomingWorkflowFields
      .map((field?) => ({
        name: stripDiscordDecorations(field?.name || "", { keepNewlines: true }).slice(0, 240),
        value: stripDiscordDecorations(field?.value || "", { keepNewlines: true }).slice(0, 8000),
      }))
      .filter((field?) => field.name || field.value)
      .slice(0, 40);
  } else if (
    incomingWorkflowFields &&
    typeof incomingWorkflowFields === "object" &&
    !Array.isArray(incomingWorkflowFields)
  ) {
    const prevFields =
      existing?.workflowFields &&
      typeof existing.workflowFields === "object" &&
      !Array.isArray(existing.workflowFields)
        ? { ...existing.workflowFields }
        : {};
    update.workflowFields = { ...prevFields, ...incomingWorkflowFields };
  }
  if (queue === "resoconti" && workflowStatusLabel) {
    const mergedFields =
      update.workflowFields && typeof update.workflowFields === "object" && !Array.isArray(update.workflowFields)
        ? { ...update.workflowFields }
        : existing?.workflowFields && typeof existing.workflowFields === "object" && !Array.isArray(existing.workflowFields)
          ? { ...existing.workflowFields }
          : {};
    mergedFields.statusLabel = workflowStatusLabel;
    update.workflowFields = mergedFields;
  }

  const updateOps: Record<string, any> = { $set: update };
  if (createdAt) {
    updateOps.$set.createdAt = createdAt;
  } else {
    updateOps.$setOnInsert = { createdAt: new Date() };
  }

  const doc = await SiteDocument.findOneAndUpdate(
    { docType: WORKFLOW_DOC, guildId, dedupeKey },
    updateOps,
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[staff-workflow] upsert failed:", dedupeKey, err?.message || err);
    return null;
  });
  /* siteLiveAll1 + inboxBadgeLive1: bust summary + WS subito */
  if (doc) {
    try {
      const { invalidateWorkflowSummaryCache } = require("./siteStaffWorkflowApi") as typeof import("./siteStaffWorkflowApi");
      invalidateWorkflowSummaryCache();
    } catch (_) {}
    try {
      const { broadcastSiteStaffWorkflowChangedDebounced } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
      broadcastSiteStaffWorkflowChangedDebounced(queue);
    } catch (_) {}
  }
  return doc;
}

async function updateStaffWorkflowStatusByDedupe(guildId?, dedupeKey?, status?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const key = String(dedupeKey || "").trim();
  const next = normalizeStatus(status, "closed");
  if (!gid || !key) return null;
  const resolvedStatusLabel =
    String(extras.statusLabel || extras.staffReason || "").trim() || statusLabelFor(next);
  const set: Record<string, any> = {
    status: next,
    decidedAt: extras.decidedAt || new Date(),
    staffReason: resolvedStatusLabel.slice(0, 200),
    workflowDecidedBy: String(extras.decidedBy || "").slice(0, 32),
  };
  const decidedByName = String(extras.decidedByName || extras.decidedByDisplayName || "").trim();
  if (decidedByName) set.workflowDecidedByName = decidedByName.slice(0, 120);
  {
    const existingFieldsDoc = await SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key })
      .select("workflowFields")
      .lean()
      .catch(() => null);
    const mergedFields =
      existingFieldsDoc?.workflowFields &&
      typeof existingFieldsDoc.workflowFields === "object" &&
      !Array.isArray(existingFieldsDoc.workflowFields)
        ? { ...existingFieldsDoc.workflowFields }
        : {};
    mergedFields.statusLabel = resolvedStatusLabel.slice(0, 200);
    set.workflowFields = mergedFields;
  }
  const appliedActionKey = normalizeResocontoActionKey(extras.workflowActionKey || extras.actionKey || "");
  if (appliedActionKey) set.workflowActionKey = appliedActionKey;
  const messageContent = String(extras.messageContent || extras.content || "").trim();
  if (messageContent) {
    set.content = messageContent.slice(0, 50000);
    set.body = stripDiscordDecorations(messageContent, {
      keepNewlines: true,
      keepCustomEmoji: false,
    }).slice(0, 500);
  }
  let doc = await SiteDocument.findOneAndUpdate(
    { docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key },
    { $set: set },
    { new: true },
  ).catch(() => null);
  if (!doc && key.startsWith("resoconti:")) {
    const messageId = key.slice("resoconti:".length);
    if (/^\d{16,22}$/.test(messageId)) {
      doc = await SiteDocument.findOneAndUpdate(
        { docType: WORKFLOW_DOC, guildId: gid, workflowQueue: "resoconti", workflowMessageId: messageId },
    { $set: set },
    { new: true },
  ).catch(() => null);
    }
    if (!doc) {
      const uid = String(extras.userId || "").trim();
      if (/^\d{16,22}$/.test(messageId) && /^\d{16,22}$/.test(uid)) {
        doc = await upsertStaffWorkflowItem({
          guildId: gid,
          queue: "resoconti",
          dedupeKey: key,
          userId: uid,
          messageId,
          channelId: String(extras.channelId || ""),
          kind: String(extras.kind || ""),
          roleId: extras.roleId != null ? String(extras.roleId) : "",
          actionKey: appliedActionKey,
          status: next,
          statusLabel: resolvedStatusLabel || set.staffReason,
          staffReason: resolvedStatusLabel || set.staffReason,
          content: messageContent,
          preview: messageContent.slice(0, 400),
          ...(extras.decidedBy ? { decidedBy: extras.decidedBy } : {}),
          ...(extras.decidedByName ? { decidedByName: extras.decidedByName } : {}),
        });
      }
    }
  }
    if (doc && next !== "pending") {
    try {
      const { broadcastSiteStaffWorkflowChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
      broadcastSiteStaffWorkflowChanged(String(doc.workflowQueue || ""));
    } catch (_) {}
    /* resoPendBadge1 + staffProfLiveAll1: invalida + WS profili aperti */
    try {
      const uid = String(doc.userId || extras.userId || "").trim();
      if (uid) {
        const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
        clearStaffProfileCacheForUser(uid, {
          action: String(doc.workflowQueue || "workflow"),
        });
      }
    } catch (_) {}
    /* smartNotifLifecycle1: decide/close → purge inbox+chat push residue */
    if (["accepted", "rejected", "cancelled", "closed"].includes(String(next || "").toLowerCase())) {
      try {
        const { clearWorkflowLifecycleNotifs } = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
        void clearWorkflowLifecycleNotifs(doc).catch(() => null);
      } catch (_) {}
    }
  }
  return doc;
}

async function updateStaffWorkflowFromMessage(guildId?, queue?, messageId?, status?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const mid = String(messageId || "").trim();
  if (!gid || !mid) return null;
  const dedupeKey = buildWorkflowDedupeKey(queue, [mid]);
  return updateStaffWorkflowStatusByDedupe(gid, dedupeKey, status, extras);
}

async function updateStaffWorkflowFromPause(guildId?, userId?, pauseId?, status?, extras: Record<string, any> = {}) {
  const dedupeKey = buildWorkflowDedupeKey("pause", [userId, pauseId]);
  const st = String(status || "").trim().toLowerCase();
  const updated = await updateStaffWorkflowStatusByDedupe(guildId, dedupeKey, status, extras);
  if (["accepted", "rejected", "cancelled"].includes(st)) {
    try {
      const { notifyPauseRequesterDecision } = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
      const decidedBy = String(extras.decidedBy || "").trim();
      const uid = String(userId || "").trim();
            if (!(st === "cancelled" && decidedBy && decidedBy === uid)) {
        const fields = updated?.workflowFields || extras.workflowFields || {};
        const start = String(fields.start || extras.start || "").trim();
        const end = String(fields.end || extras.end || "").trim();
        const periodText = start && end ? `${start} → ${end}` : "";
        void notifyPauseRequesterDecision({
          guildId,
          userId: uid,
          pauseId,
          status: st,
          decidedByName: String(extras.decidedByName || "").trim(),
          periodText,
        }).catch(() => false);
      }
    } catch (_) {}
  }
    return updated;
}

async function cancelPendingResocontiWorkflowForUser(guildId?, userId?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return 0;
  const kind = String(extras.kind || "").trim().toLowerCase();
  const filter: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: "resoconti",
    status: "pending",
  };
  if (kind === "s" || kind === "p") filter.workflowKind = kind;
  const result = await SiteDocument.updateMany(
    filter,
    {
      $set: {
        status: "cancelled",
        decidedAt: extras.decidedAt || new Date(),
        staffReason: String(extras.statusLabel || extras.staffReason || "Annullato (depex)").slice(0, 200),
        workflowDecidedBy: String(extras.decidedBy || "system").slice(0, 32),
        ...(String(extras.decidedByName || "").trim()
          ? { workflowDecidedByName: String(extras.decidedByName).trim().slice(0, 120) }
          : {}),
      },
    },
  ).catch(() => null);
    const modified = Number(result?.modifiedCount || 0);
  if (modified > 0) {
    try {
      const { broadcastSiteStaffWorkflowChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
      broadcastSiteStaffWorkflowChanged("resoconti");
    } catch (_) {}
    try {
      const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
      clearStaffProfileCacheForUser(uid, { action: "resoconti" });
    } catch (_) {}
  }
  return modified;
}

function memberStillRelevantForStaffResoconto(member?, roleId?) {
  const { memberHasAnyStaffPresenceForDepexSync } = require("../Utils/Staff/staffPmUtils") as typeof import("../Utils/Staff/staffPmUtils");
  if (!member) return false;
  const rid = String(roleId || "").trim();
  if (rid && !member.roles?.cache?.has?.(rid)) return false;
  return memberHasAnyStaffPresenceForDepexSync(member);
}

function memberStillRelevantForResoconto(member?, kind?, roleId?) {
  const { memberHasPartnerManagerRole } = require("../Utils/Staff/staffPmUtils") as typeof import("../Utils/Staff/staffPmUtils");
  const k = String(kind || "").trim().toLowerCase();
  if (!member) return false;
  if (k === "p") return memberHasPartnerManagerRole(member);
  if (k === "s") return memberStillRelevantForStaffResoconto(member, roleId);
  return false;
}

function resocontoAutoCancelLabel(member?, kind?) {
  if (!member) return "Annullato (uscita)";
  const k = String(kind || "").trim().toLowerCase();
  if (k === "p") return "Annullato (depex PM)";
  return "Annullato (depex)";
}

async function pruneDepexedPendingResoconti(guild?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !guild) return 0;
  const pendingDocs = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "resoconti",
    status: "pending",
  })
    .select("userId workflowKind workflowRoleId dedupeKey")
    .lean()
    .catch(() => []);
  if (!pendingDocs?.length) return 0;

  const memberByUser = new Map();
  let updated = 0;
  for (const doc of pendingDocs) {
    const uid = String(doc?.userId || "").trim();
    const dedupeKey = String(doc?.dedupeKey || "").trim();
    const kind = String(doc?.workflowKind || "").trim().toLowerCase();
    if (!uid || !dedupeKey || (kind !== "s" && kind !== "p")) continue;

    if (!memberByUser.has(uid)) {
      const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
      memberByUser.set(uid, member || null);
    }
    const member = memberByUser.get(uid);
    if (memberStillRelevantForResoconto(member, kind, doc?.workflowRoleId)) continue;

    const statusLabel = resocontoAutoCancelLabel(member, kind);
    await updateStaffWorkflowStatusByDedupe(gid, dedupeKey, "cancelled", {
      statusLabel,
      decidedBy: "system",
    });
    updated += 1;
  }
  return updated;
}

function memberEligibleForPauseRole(member?, ruoloRichiesto?) {
  const {
    memberHasAnyStaffPresenceForDepexSync,
    memberHasPartnerManagerRole,
  } = require("../Utils/Staff/staffPmUtils") as typeof import("../Utils/Staff/staffPmUtils");
  if (!member) return false;
  const role = String(ruoloRichiesto || "Staff")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
  if (role === "partnermanager" || role === "pm") {
    return memberHasPartnerManagerRole(member);
  }
  if (role === "entrambi" || role === "both") {
    return memberHasAnyStaffPresenceForDepexSync(member) || memberHasPartnerManagerRole(member);
  }
  return memberHasAnyStaffPresenceForDepexSync(member);
}

function pauseAutoCancelLabel(member?) {
  return member ? "Annullato (depex)" : "Annullato (uscita)";
}

async function cancelPendingPauseWorkflowForUser(guildId?, userId?, extras: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return 0;
  const pauseId = String(extras.pauseId || extras.workflowPauseId || "").trim();
  const filter: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: "pause",
    status: "pending",
  };
  if (pauseId) filter.workflowPauseId = pauseId;
  const statusLabel = String(extras.statusLabel || extras.staffReason || "Annullato (depex)").slice(0, 200);
  const result = await SiteDocument.updateMany(filter, {
    $set: {
      status: "cancelled",
      decidedAt: extras.decidedAt || new Date(),
      staffReason: statusLabel,
      "workflowFields.statusLabel": statusLabel,
      workflowDecidedBy: String(extras.decidedBy || "system").slice(0, 32),
      ...(String(extras.decidedByName || "").trim()
        ? { workflowDecidedByName: String(extras.decidedByName).trim().slice(0, 120) }
        : {}),
    },
  }).catch(() => null);
    return Number(result?.modifiedCount || 0);
}

async function autoCancelPendingPausesIfNotEligible(guild?, userId?, options: Record<string, any> = {}) {
  const gid = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return 0;
  const { getStaffPauseRecord, updatePauseInDb } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
  const { resolveGuildMemberPresence } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
  const presence = await resolveGuildMemberPresence(guild, uid, { preferFresh: true }).catch(() => ({
    member: null,
    left: false,
    uncertain: true,
  }));
    if (presence.uncertain && !presence.member) return 0;
  const member = presence.member || null;
  const leftServer = Boolean(presence.left) || !member;
  const record = await getStaffPauseRecord(gid, uid);
  const pauses = Array.isArray(record?.staff?.pauses) ? record.staff.pauses : [];
  let count = 0;

  for (const pause of pauses) {
    if (String(pause?.status || "") !== "pending") continue;
    const pauseId = String(pause?._id || "").trim();
    if (!pauseId) continue;
    const ruolo = pause.ruoloRichiesto || pause.ruolo || "Staff";
    if (!leftServer && memberEligibleForPauseRole(member, ruolo)) continue;
    const statusLabel = String(
      options.statusLabel || (leftServer ? "Annullato (uscita)" : pauseAutoCancelLabel(member)),
    ).slice(0, 200);
    await updatePauseInDb(gid, uid, pauseId, { status: "cancelled", cancelledAt: new Date() }).catch(() => null);
    await updateStaffWorkflowFromPause(gid, uid, pauseId, "cancelled", {
      statusLabel,
      staffReason: statusLabel,
      decidedBy: String(options.decidedBy || "system"),
    }).catch(() => null);
    count += 1;
  }
  return count;
}

async function reconcilePendingPauseWorkflows(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  const guild =
    client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  if (!guild) return 0;
  const { getStaffPauseRecord } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
  const { resolveGuildMemberPresence } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
  const pendingDocs = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "pause",
    status: "pending",
  })
    .select("userId workflowPauseId dedupeKey workflowFields")
    .lean()
    .catch(() => []);
  let updated = 0;
  for (const doc of pendingDocs || []) {
    const uid = String(doc?.userId || "").trim();
    const pauseId = String(doc?.workflowPauseId || "").trim();
    const dedupeKey = String(doc?.dedupeKey || "").trim();
    if (!uid || !pauseId || !dedupeKey) continue;
    const presence = await resolveGuildMemberPresence(guild, uid, { preferFresh: true }).catch(() => ({
      member: null,
      left: false,
      uncertain: true,
    }));
        if (presence.uncertain && !presence.member) continue;
    const member = presence.member || null;
    const leftServer = Boolean(presence.left) || !member;
    const ruolo = doc?.workflowFields?.ruoloRichiesto || "Staff";
    if (leftServer || !memberEligibleForPauseRole(member, ruolo)) {
      const statusLabel = leftServer ? "Annullato (uscita)" : pauseAutoCancelLabel(member);
      await updateStaffWorkflowFromPause(gid, uid, pauseId, "cancelled", {
        statusLabel,
        decidedBy: "system",
      }).catch(() => null);
      const { updatePauseInDb } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
      await updatePauseInDb(gid, uid, pauseId, {
        status: "cancelled",
        cancelledAt: new Date(),
      }).catch(() => null);
      updated += 1;
      continue;
    }
    const record = await getStaffPauseRecord(gid, uid);
    const pause = (Array.isArray(record?.staff?.pauses) ? record.staff.pauses : []).find(
      (p?) => String(p?._id || "") === pauseId,
    );
    if (!pause) {
      await SiteDocument.deleteOne({
        docType: WORKFLOW_DOC,
        guildId: gid,
        dedupeKey,
      }).catch(() => null);
      updated += 1;
      continue;
    }
    if (String(pause.status || "") !== "pending") {
      await updateStaffWorkflowFromPause(gid, uid, pauseId, normalizeStatus(pause.status), {
        statusLabel: getPauseStatusLabel(pause, getTodayUtc()),
        decidedBy: "system",
      });
      updated += 1;
    }
  }
      updated += await pruneOrphanClosedPauseWorkflows(gid).catch(() => 0);
  return updated;
}

async function pruneOrphanClosedPauseWorkflows(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  const { getStaffPauseRecord } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
  const closed = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "pause",
    status: { $in: ["rejected", "cancelled"] },
  })
    .select("userId workflowPauseId dedupeKey")
    .limit(200)
    .lean()
    .catch(() => []);
  let removed = 0;
  const pauseIdsByUser = new Map();
  for (const doc of closed || []) {
    const uid = String(doc?.userId || "").trim();
    const pauseId = String(doc?.workflowPauseId || "").trim();
    const dedupeKey = String(doc?.dedupeKey || "").trim();
    if (!uid || !pauseId || !dedupeKey) continue;
    let idSet = pauseIdsByUser.get(uid);
    if (!idSet) {
      const record = await getStaffPauseRecord(gid, uid);
      const pauses = Array.isArray(record?.staff?.pauses) ? record.staff.pauses : [];
      idSet = new Set(pauses.map((p?) => String(p?._id || "")).filter(Boolean));
      pauseIdsByUser.set(uid, idSet);
    }
    if (idSet.has(pauseId)) continue;
    const del = await SiteDocument.deleteOne({
      docType: WORKFLOW_DOC,
      guildId: gid,
      dedupeKey,
    }).catch(() => null);
    if (del?.deletedCount) removed += 1;
  }
  return removed;
}

function filterPauseInboxItemsCachedOnly(guild?, items?, knownStaffIds = null) {
  if (!guild || !Array.isArray(items) || !items.length) return items || [];
  const known =
    knownStaffIds instanceof Set
      ? knownStaffIds
      : Array.isArray(knownStaffIds)
        ? new Set(knownStaffIds.map((id?) => String(id || "").trim()).filter(Boolean))
        : null;
  const out = [];
  for (const item of items) {
    const status = String(item?.status || "").trim().toLowerCase() || "pending";
    const uid = String(item?.userId || "").trim();
    if (!uid) continue;
    /* pauseReviewFix1: usa track (Staff/Entrambi/PM), non label display tipo "Moderator" */
    const ruolo =
      item?.ruoloTrack ||
      item?.workflowFields?.ruoloTrack ||
      item?.ruoloRichiesto ||
      item?.ruolo ||
      item?.workflowFields?.ruoloRichiesto ||
      item?.fields?.ruoloRichiesto ||
      "Staff";
    const member = guild.members?.cache?.get(uid) || null;
    if (member) {
      if (!memberEligibleForPauseRole(member, ruolo)) continue;
      out.push(item);
      continue;
    }
        if (known && known.has(uid)) {
      out.push(item);
      continue;
    }
        if (status === "pending") out.push(item);
  }
  return out;
}

async function prunePendingPauseInboxUsers(guild?, client?, guildId?, items?) {
  const pendingUsers = [];
  const seen = new Set();
  for (const item of items || []) {
    if (String(item?.status || "") !== "pending") continue;
    const uid = String(item?.userId || "").trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    pendingUsers.push(uid);
  }
  for (const uid of pendingUsers) {
    await autoCancelPendingPausesIfNotEligible(guild, uid, { decidedBy: "system" }).catch(() => 0);
  }
  if (client && guildId) {
    await reconcilePendingPauseWorkflows(client, guildId).catch(() => 0);
  }
}

async function filterPauseInboxItemsToEligibleStaff(guild?, items?) {
  return filterPauseInboxItemsCachedOnly(guild, items);
}

function snowflakeToDate(id?) {
  const raw = String(id || "").trim();
  if (!/^\d{16,20}$/.test(raw)) return null;
  try {
    const ms = Number((BigInt(raw) >> 22n) + 1420070400000n);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return new Date(ms);
  } catch {
    return null;
  }
}

function workflowSortTimestamp(doc?) {
  const fromMsg = snowflakeToDate(doc?.workflowMessageId);
  if (fromMsg) return fromMsg.getTime();
  const created = doc?.createdAt ? new Date(doc.createdAt).getTime() : NaN;
  return Number.isFinite(created) ? created : 0;
}

async function loadMembersForIds(guild?, ids?, limit = 40) {
  const cache = new Map();
  if (!guild) return cache;
  const unique = [...new Set((Array.isArray(ids) ? ids : []).map((id?) => String(id || "")).filter(Boolean))].slice(
    0,
    Math.max(1, Math.min(60, Number(limit) || 40)),
  );
  await Promise.all(
    unique.map(async (uid?) => {
      try {
        const member = await Promise.race([
          getGuildMemberCached(guild, uid),
          new Promise((resolve?) => setTimeout(() => resolve(null), 2500)),
        ]);
      if (member) cache.set(uid, member);
      } catch {
              }
    }),
  );
  return cache;
}

async function loadMembersForDocs(guild?, docs?) {
  const ids = docs.flatMap((d?) => [String(d?.userId || ""), String(d?.workflowDecidedBy || "")]).filter(Boolean);
  return loadMembersForIds(guild, ids);
}

async function ensureResocontiWeekKeys(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  if (!(ensureResocontiWeekKeys as any).__at) (ensureResocontiWeekKeys as any).__at = new Map();
  const last = Number((ensureResocontiWeekKeys as any).__at.get(gid) || 0);
  if (Date.now() - last < ENSURE_WEEK_KEYS_MIN_MS) return 0;
  (ensureResocontiWeekKeys as any).__at.set(gid, Date.now());
  const missing = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "resoconti",
    $or: [{ workflowWeekKey: { $exists: false } }, { workflowWeekKey: null }, { workflowWeekKey: "" }],
  })
    .select("_id createdAt workflowMessageId")
    .lean()
    .catch(() => []);
  let updated = 0;
  for (const doc of missing || []) {
    const key =
      weekKeyFromDate(snowflakeToDate(doc?.workflowMessageId)) ||
      weekKeyFromDate(doc?.createdAt) ||
      "";
    if (!key) continue;
    const ok = await SiteDocument.updateOne(
      { _id: doc._id },
      { $set: { workflowWeekKey: key } },
    ).catch(() => null);
    if (ok?.modifiedCount) updated += 1;
  }
  return updated;
}

async function listResocontiWeeks(guildId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!gid) return [];
  const cacheKey = `${gid}:${String(opts.scope || "all").toLowerCase()}:${String(opts.filter || "").toLowerCase()}`;
  if (!(listResocontiWeeks as any).__cache) (listResocontiWeeks as any).__cache = new Map();
  const hit = (listResocontiWeeks as any).__cache.get(cacheKey);
  if (hit && Date.now() - hit.at < INBOX_WEEKS_CACHE_MS) return hit.weeks;
  void ensureResocontiWeekKeys(gid).catch(() => 0);
  const match: Record<string, any> = { docType: WORKFLOW_DOC, guildId: gid, workflowQueue: "resoconti" };
  if (String(opts.scope || "").toLowerCase() === "pending") match.status = "pending";
  const roleFilter = String(opts.filter || "").trim().toLowerCase();
  if (roleFilter === "staff" || roleFilter === "s") match.workflowKind = "s";
  else if (roleFilter === "pm" || roleFilter === "p" || roleFilter === "partnermanager") {
    match.workflowKind = "p";
  }
  const uid = String(opts.userId || "").trim();
  if (/^\d{16,22}$/.test(uid)) match.userId = uid;
  const rows = await SiteDocument.aggregate([
    { $match: match },
    { $group: { _id: "$workflowWeekKey", count: { $sum: 1 } } },
    { $match: { _id: { $regex: /^\d{4}-\d{2}-\d{2}$/ } } },
    { $sort: { _id: -1 } },
  ]).catch(() => []);
  const weeks = (rows || []).map((row?) => ({
    weekKey: String(row._id),
    label: formatWeekLabel(row._id),
    count: Number(row.count) || 0,
  }));
  (listResocontiWeeks as any).__cache.set(cacheKey, { at: Date.now(), weeks });
  return weeks;
}

async function listUserWorkflowsForMember(guildId?, userId?, opts: Record<string, any> = {}) {
  const scope = String(opts.scope || "pending").toLowerCase();
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
    const filter: Record<string, any> = { docType: WORKFLOW_DOC, guildId: gid, userId: uid, workflowQueue: "pause" };
  if (scope === "pending") filter.status = "pending";
  const docs = await SiteDocument.find(filter).sort({ createdAt: -1 }).limit(40).lean().catch(() => []);
  return (docs || []).map((doc?) => docToListItem(doc, null));
}

/** Live chat FAB: appelli/candidature where subject was invited into workflow chat. */
async function listUserInvitedSubjectChats(guildId?, userId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return [];
  const rawQ = String(opts.queue || opts.queues || "")
    .trim()
    .toLowerCase();
  let queues = ["appelli", "candidature"];
  if (rawQ === "appelli" || rawQ === "candidature") queues = [rawQ];
  else if (rawQ && rawQ !== "all" && rawQ !== "subject") {
    queues = rawQ
      .split(",")
      .map((x?) => String(x || "").trim().toLowerCase())
      .filter((x?) => x === "appelli" || x === "candidature");
    if (!queues.length) queues = ["appelli", "candidature"];
  }
  const includeClosed = Boolean(opts.includeClosed);
  const filter: Record<string, any> = {
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: { $in: queues },
  };
  if (!includeClosed) filter.status = "pending";
  const docs = await SiteDocument.find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(30)
    .lean()
    .catch(() => []);
  const out = [];
  for (const doc of docs || []) {
    const fields =
      doc?.workflowFields && typeof doc.workflowFields === "object" ? doc.workflowFields : {};
    const sc = fields.subjectChat && typeof fields.subjectChat === "object" ? fields.subjectChat : {};
    const windows = Array.isArray(sc.windows) ? sc.windows : [];
    if (!windows.length) continue;
    const active = windows.some((w?) => w && !w.leftAt);
    const item = docToListItem(doc, null);
    out.push({
      ...item,
      queue: String(doc?.workflowQueue || "").trim().toLowerCase(),
      chatInvited: true,
      chatActive: active,
      openPath:
        String(doc?.workflowQueue || "").toLowerCase() === "candidature"
          ? `/candidature/?chat=${encodeURIComponent(String(doc?.dedupeKey || ""))}`
          : `/appelli/?chat=${encodeURIComponent(String(doc?.dedupeKey || ""))}`,
    });
  }
  return out;
}

async function getUserWorkflowDetailFromDb(guildId?, userId?, dedupeKey?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const key = String(dedupeKey || "").trim();
  if (!gid || !uid || !key) return null;
  if (!key.toLowerCase().startsWith("pause:")) return null;
  const doc = await SiteDocument.findOne({
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    dedupeKey: key,
    workflowQueue: "pause",
  })
    .lean()
    .catch(() => null);
  if (!doc) return null;
  return docToDetail(doc, null, null);
}

async function getPendingPauseWorkflowForMember(guildId?, userId?, client = null) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return null;
  let doc = await SiteDocument.findOne({
    docType: WORKFLOW_DOC,
    guildId: gid,
    userId: uid,
    workflowQueue: "pause",
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .lean()
    .catch(() => null);
  if (!doc) {
        try {
      const { getStaffPauseRecord } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
      const record = await getStaffPauseRecord(gid, uid);
      const pause = (Array.isArray(record?.staff?.pauses) ? record.staff.pauses : [])
        .filter((p?) => String(p?.status || "") === "pending")
        .sort((a?, b?) => (new Date(b?.createdAt || 0) as any) - (new Date(a?.createdAt || 0) as any))[0];
      if (pause?._id) {
        const bot = client || global.client || null;
        const guild =
          bot?.guilds?.cache?.get(gid) || (await bot?.guilds?.fetch(gid).catch(() => null));
        await upsertPauseWorkflowFromPause(bot, guild, uid, pause).catch(() => null);
        doc = await SiteDocument.findOne({
          docType: WORKFLOW_DOC,
          guildId: gid,
          userId: uid,
          workflowQueue: "pause",
          status: "pending",
          workflowPauseId: String(pause._id),
        })
          .lean()
          .catch(() => null);
      }
    } catch (_) {}
  }
  if (!doc) return null;
  return docToDetail(doc, null, null);
}

async function listStaffWorkflowFromDb(client?, guildId?, queue?, opts: Record<string, any> = {}) {
  const scope = String(opts.scope || "all").toLowerCase();
  const page = Math.max(1, Number(opts.page) || 1);
  const pageSize = Math.min(50, Math.max(5, Number(opts.pageSize) || 20));
  const gid = String(guildId || "").trim();
  const q = String(queue || "").trim().toLowerCase();
  const filter: Record<string, any> = { docType: WORKFLOW_DOC, guildId: gid, workflowQueue: q };
  const scopedUserId = String(opts.userId || "").trim();
  /* resoProfile1: cronologia profilo — un solo staffer */
  if (/^\d{16,22}$/.test(scopedUserId)) {
    filter.userId = scopedUserId;
  }
  if (scope === "pending") {
    filter.status = "pending";
  } else if (q === "pause" && !filter.userId) {
        try {
      const { loadRosterSnapshot } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
      const snap = await loadRosterSnapshot(gid).catch(() => null);
      const ids = (Array.isArray(snap?.userIds) ? snap.userIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{16,22}$/.test(id));
      if (ids.length) filter.userId = { $in: ids };
    } catch (_) {}
  }

  const roleFilter = String(opts.filter || "").trim().toLowerCase();
  if (roleFilter && roleFilter !== "all") {
    if (q === "candidature") {
      if (roleFilter === "helper" || roleFilter === "partnermanager" || roleFilter === "pm" || roleFilter === "blogger") {
        filter.workflowType = roleFilter === "pm" ? "partnermanager" : roleFilter;
      }
    } else if (q === "appelli") {
      if (roleFilter === "unban" || roleFilter === "unmute") filter.workflowKind = roleFilter;
    } else if (q === "revisione") {
      if (roleFilter === "server" || roleFilter === "bot") filter.workflowKind = roleFilter;
    } else if (q === "pause") {
      if (roleFilter === "staff") {
                filter.$and = [
          ...(Array.isArray(filter.$and) ? filter.$and : []),
          {
            $or: [
              { "workflowFields.ruoloTrack": "Staff" },
              {
                "workflowFields.ruoloTrack": { $nin: ["Staff", "PartnerManager", "Entrambi"] },
                "workflowFields.ruoloRichiesto": {
                  $nin: ["PartnerManager", "Entrambi", "Partner Manager"],
                },
              },
            ],
          },
        ];
      } else if (roleFilter === "pm" || roleFilter === "partnermanager") {
        filter.$or = [
          { "workflowFields.ruoloTrack": "PartnerManager" },
          { "workflowFields.ruoloRichiesto": "PartnerManager" },
          { "workflowFields.ruoloRichiesto": "Partner Manager" },
        ];
      } else if (roleFilter === "both" || roleFilter === "entrambi") {
        filter.$or = [
          { "workflowFields.ruoloTrack": "Entrambi" },
          { "workflowFields.ruoloRichiesto": "Entrambi" },
        ];
      }
    } else if (q === "resoconti") {
      if (roleFilter === "staff" || roleFilter === "s") filter.workflowKind = "s";
      else if (roleFilter === "pm" || roleFilter === "p" || roleFilter === "partnermanager") {
        filter.workflowKind = "p";
      }
    }
  }

  let weeks = [];
  let week = String(opts.week || opts.weekKey || "").trim();
  if (q === "resoconti") {
    if (!week) {
      try {
        const { getResocontoCycleWeekKey } = require("../Services/Staff/weeklyStaffResocontoService") as typeof import("../Services/Staff/weeklyStaffResocontoService");
        week = String(getResocontoCycleWeekKey() || "").trim();
      } catch {
        week = "";
      }
    }
    weeks = await listResocontiWeeks(gid, {
      scope,
      filter: roleFilter,
      userId: scopedUserId || undefined,
    });
    if (!week && weeks.length) week = String(weeks[0].weekKey || "");
    if (week) filter.workflowWeekKey = week;
  }

  const skip = (page - 1) * pageSize;

  /* inboxLoadFast1: lista slim — niente content/body pesanti in list */
  const listProject = {
    content: 0,
    "workflowFields.description": 0,
    "workflowFields.body": 0,
    "workflowFields.markdown": 0,
    "workflowFields.answers": 0,
    "workflowMeta.raw": 0,
  };

  const resocontoRoleBranches = [...RESOCONTO_LIST_ROLE_RANK.entries()].map(([roleId, rank]) => ({
    case: { $eq: ["$workflowRoleId", roleId] },
    then: rank,
  }));
  const sortTsExpr = {
    $cond: {
      if: {
        $regexMatch: {
          input: { $toString: { $ifNull: ["$workflowMessageId", ""] } },
          regex: "^\\d{16,20}$",
        },
      },
      then: {
        $add: [
          {
            $toLong: {
              $floor: {
                $divide: [
                  { $convert: { input: "$workflowMessageId", to: "long", onError: 0, onNull: 0 } },
                  4194304,
                ],
              },
            },
          },
          1420070400000,
        ],
      },
      else: { $convert: { input: "$createdAt", to: "long", onError: 0, onNull: 0 } },
    },
  };
  const sortStages: any[] =
    q === "resoconti"
      ? [
          {
            $addFields: {
              _sortRole: {
                $switch: {
                  branches: [
                    { case: { $eq: ["$workflowKind", "p"] }, then: 0 },
                    ...resocontoRoleBranches,
                  ],
                  default: RESOCONTO_LIST_RANK_FALLBACK,
                },
              },
              _sortTs: sortTsExpr,
              _sortCreated: {
                $convert: { input: "$createdAt", to: "long", onError: 0, onNull: 0 },
              },
            },
          },
          { $sort: { _sortRole: 1, _sortTs: 1, _sortCreated: 1, _id: 1 } },
          { $skip: skip },
          { $limit: pageSize },
          { $project: { _sortRole: 0, _sortTs: 0, _sortCreated: 0, ...listProject } },
        ]
      : [
          {
            $addFields: {
              _sortTs: sortTsExpr,
              _sortCreated: {
                $convert: { input: "$createdAt", to: "long", onError: 0, onNull: 0 },
              },
            },
          },
          { $sort: { _sortTs: -1, _sortCreated: -1, _id: -1 } },
          { $skip: skip },
          { $limit: pageSize },
          { $project: { _sortTs: 0, _sortCreated: 0, ...listProject } },
        ];

  /* inboxLoadFast1 + inboxApiBoot1: page 1 → skip countDocuments (approx total);
     page≥2 o exact → count ∥ aggregate. */
  const skipExactCount = opts.skipExactCount === true && page === 1 && !opts.exactTotal;
  let total = 0;
  let aggDocs = null;
  if (skipExactCount) {
    aggDocs = await (SiteDocument.aggregate([{ $match: filter }, ...sortStages]) as any)
      .option({ maxTimeMS: 4000 })
      .catch(() => null);
  } else {
    const pair = await Promise.all([
      SiteDocument.countDocuments(filter).maxTimeMS(4000).catch(() => 0),
      (SiteDocument.aggregate([{ $match: filter }, ...sortStages]) as any)
        .option({ maxTimeMS: 4000 })
        .catch(() => null),
    ]);
    total = pair[0];
    aggDocs = pair[1];
  }
  let docs = aggDocs;
  if (!Array.isArray(docs)) {
    const pageDocs = await SiteDocument.find(filter)
      .select("-content -workflowFields.description -workflowFields.body -workflowFields.markdown -workflowFields.answers -workflowMeta.raw")
      .sort({ createdAt: q === "resoconti" ? 1 : -1 })
      .skip(skip)
      .limit(pageSize)
      .maxTimeMS(4000)
      .lean()
      .catch(() => []);
    docs = Array.isArray(pageDocs) ? pageDocs : [];
  }

      let items = (docs || []).map((doc?) => docToListItem(doc, null));
  if (skipExactCount) {
    /* hasMore se pagina piena — total minimo per FE badge/empty */
    total = items.length < pageSize ? items.length : page * pageSize + 1;
  }

    if (q === "pause" && client && items.length) {
    try {
      const { resolveWebUserIdentitiesBatch, safeDisplayLabel } = require("./siteWebUserIdentity") as typeof import("./siteWebUserIdentity");
    const guild =
        client.guilds?.cache?.get(gid) || (await client.guilds?.fetch?.(gid).catch(() => null));
      const needIds = items.map((it?) => String(it.userId || "").trim()).filter(Boolean);
      /* inboxLoadFast1: pause list = cache-only (max ~120ms), niente storm Discord */
      const identityMap = await resolveWebUserIdentitiesBatch(client, guild, needIds, {
        cacheOnly: true,
        fillFallback: false,
        cap: 40,
        budgetMs: 120,
      });
      items = items.map((item?) => {
        const hit = identityMap?.get?.(String(item.userId || ""));
        if (!hit) return item;
        const cleaned =
          cleanPauseSubjectDisplayName(hit.displayName, item.userId) ||
          cleanPauseSubjectDisplayName(hit.username, item.userId) ||
          cleanPauseSubjectDisplayName(safeDisplayLabel(hit.displayName, item.userId, ""), item.userId);
        return {
          ...item,
          displayName: cleaned || item.displayName,
          avatarUrl: hit.avatarUrl || item.avatarUrl,
        };
      });
    } catch (_) {}
  }

  // Candidature/appelli: hydrate names/avatars (user fetch only — no guild member storms).
  // Cache first, then a real user-only budget so list titles stop falling back to "Candidatura Helper #N".
  if ((q === "candidature" || q === "appelli") && client && items.length) {
    try {
      const { resolveWebUserIdentitiesBatch, safeDisplayLabel, FALLBACK_LABEL } = require("./siteWebUserIdentity") as typeof import("./siteWebUserIdentity");
      const guild = client.guilds?.cache?.get(gid) || null;
      const needIds = items
        .map((it?) => String(it.userId || "").trim())
        .filter((id?) => /^\d{16,22}$/.test(id));
      const identityMap = await resolveWebUserIdentitiesBatch(client, guild, needIds, {
        cacheOnly: true,
        fillFallback: false,
        cap: 40,
        budgetMs: 50,
      });
      const stillNeed = needIds.filter((uid?) => {
        const hit = identityMap.get(uid);
        const item = items.find((it?) => String(it.userId || "").trim() === uid);
        const avatarOk =
          hasRealDiscordAvatarUrl(hit?.avatarUrl) || hasRealDiscordAvatarUrl(item?.avatarUrl);
        const name = String(hit?.displayName || "").trim();
        const nameBad = !name || name === FALLBACK_LABEL || name === uid;
        /* inboxAvatarFetch1: fetch anche se manca solo l'avatar (prima solo il nome) */
        return nameBad || !avatarOk;
      });
      if (stillNeed.length && !(opts.hydrateCacheOnly === true || opts.fast === true)) {
        /* inboxLoadFast1: budget corto — lista prima, hydrate pesante sul detail */
        /* inboxApiBoot1: boot/fast = solo cache (niente +280ms Discord sul primo paint) */
        const fetched = await resolveWebUserIdentitiesBatch(client, guild, stillNeed, {
          cap: 16,
          batchSize: 8,
          budgetMs: 280,
          skipGuildMember: true,
          fillFallback: false,
        });
        if (fetched && typeof fetched.forEach === "function") {
          fetched.forEach((val?, key?) => {
            if (val) identityMap.set(key, val);
          });
        }
      }
      const persistOps = [];
      items = items.map((item?, idx?) => {
        const uid = String(item.userId || "").trim();
        const hit = identityMap.get(uid);
        if (!hit) return item;
        const current = String(item.displayName || "").trim();
        const currentMissing =
          !current ||
          current === uid ||
          /^\d{16,22}$/.test(current) ||
          isGenericWorkflowSubjectLabel(current) ||
          isWorkflowRoleSlug(current, { workflowType: item.type || item.kind || "" });
        const resolvedName = pickSubjectDisplayName(
          uid,
          hit.displayName && hit.displayName !== FALLBACK_LABEL ? hit.displayName : "",
          hit.username,
          safeDisplayLabel(
            hit.displayName && hit.displayName !== FALLBACK_LABEL ? hit.displayName : hit.username,
            uid,
            "",
          ),
        );
        const nextName = currentMissing ? resolvedName || item.displayName || "" : item.displayName;
        const nextAvatar =
          preferAnimatedStoredAvatarUrl(hit.avatarUrl, 128) ||
          preferAnimatedStoredAvatarUrl(item.avatarUrl, 128) ||
          (hasRealDiscordAvatarUrl(hit.avatarUrl) ? String(hit.avatarUrl).trim() : "") ||
          (hasRealDiscordAvatarUrl(item.avatarUrl) ? String(item.avatarUrl).trim() : "") ||
          "";
        const doc = docs[idx];
        if (
          doc?._id &&
          ((nextName && nextName !== String(doc.workflowSubjectName || "").trim()) ||
            (hasRealDiscordAvatarUrl(nextAvatar) &&
              nextAvatar !== String(doc.workflowSubjectAvatarUrl || "").trim()))
        ) {
          persistOps.push({
            updateOne: {
              filter: { _id: doc._id },
              update: {
                $set: {
                  ...(nextName ? { workflowSubjectName: String(nextName).slice(0, 120) } : {}),
                  ...(hasRealDiscordAvatarUrl(nextAvatar)
                    ? { workflowSubjectAvatarUrl: String(nextAvatar).slice(0, 512) }
                    : {}),
                },
              },
            },
          });
        }
        return {
          ...item,
          displayName: nextName,
          avatarUrl: nextAvatar,
        };
      });
      if (persistOps.length) {
        void SiteDocument.bulkWrite(persistOps, { ordered: false }).catch(() => null);
      }
    } catch (_) {}
  }

  return {
    items,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize) || 1),
    },
    week: q === "resoconti" ? week || null : null,
    weeks: q === "resoconti" ? weeks : undefined,
  };
}

async function getStaffWorkflowDetailFromDb(client?, guildId?, queue?, itemId?, userId?) {
  const gid = String(guildId || "").trim();
  const q = String(queue || "").trim().toLowerCase();
  const id = String(itemId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !q || !id) return null;

  let doc = null;
  if (/^[a-f0-9]{24}$/i.test(id)) {
    doc = await SiteDocument.findOne({ _id: id, docType: WORKFLOW_DOC, guildId: gid, workflowQueue: q }).lean().catch(() => null);
  }
  if (!doc && q === "pause" && uid) {
    doc = await SiteDocument.findOne({
      docType: WORKFLOW_DOC,
      guildId: gid,
      workflowQueue: "pause",
      workflowPauseId: id,
      userId: uid,
    })
      .lean()
      .catch(() => null);
  }
  if (!doc) {
    doc = await SiteDocument.findOne({
      docType: WORKFLOW_DOC,
      guildId: gid,
      workflowQueue: q,
      workflowMessageId: id,
    })
      .lean()
      .catch(() => null);
  }
  if (!doc) return null;

    let fast = docToDetail(doc, null, null);
  if (q === "resoconti") {
    try {
      const guildFast =
        client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
            fast = await enrichResocontoRolesHistory(fast, doc, guildFast);
      const hasChart = Array.isArray(fast.costanzaChart) && fast.costanzaChart.length >= 5;
      const hasStats = fast.weeklyMessages != null && fast.weeklyVoiceSeconds != null;
      if (!hasChart || !hasStats) {
                        const enrichP = enrichResocontoDetailChart(fast, doc, guildFast).catch(() => null);
        const raced = await Promise.race([
          enrichP,
          new Promise((resolve?) => setTimeout(() => resolve(null), 420)),
        ]);
        if (raced) {
          fast = raced;
        } else {
          void enrichP;
        }
      }
    } catch (_) {}
  }
  const needsSubject =
    !hasRealDiscordAvatarUrl(fast.avatarUrl) ||
    !pickSubjectDisplayName(fast.userId, fast.displayName);

  if (!needsSubject || !client) return fast;

  const enrich = (async () => {
  const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  const memberCache = await loadMembersForIds(guild, [String(doc.userId || ""), String(doc.workflowDecidedBy || "")]);
  const member = memberCache.get(String(doc.userId || "")) || null;
  let detail = docToDetail(doc, member, memberCache);
  if (q === "resoconti") {
    detail = await enrichResocontoDetailChart(detail, doc, guild);
  }
    const enriched = await applyWorkflowSubjectToItem(client, guild, detail, {
      allowFetch: true,
      fetchTimeoutMs: 1400,
    });
        const resolvedName = pickSubjectDisplayName(enriched?.userId, enriched?.displayName);
    const resolvedAvatar = hasRealDiscordAvatarUrl(enriched?.avatarUrl) ? String(enriched.avatarUrl) : "";
    const storedName = pickSubjectDisplayName(doc.userId, doc.workflowSubjectName);
    const storedAvatar = hasRealDiscordAvatarUrl(doc.workflowSubjectAvatarUrl)
      ? String(doc.workflowSubjectAvatarUrl)
      : "";
    if (
      doc?._id &&
      ((resolvedName && resolvedName !== storedName) || (resolvedAvatar && resolvedAvatar !== storedAvatar))
    ) {
      void SiteDocument.updateOne(
        { _id: doc._id },
        {
          $set: {
            ...(resolvedName ? { workflowSubjectName: resolvedName.slice(0, 120) } : {}),
            ...(resolvedAvatar ? { workflowSubjectAvatarUrl: resolvedAvatar.slice(0, 512) } : {}),
          },
        },
      ).catch(() => null);
    }
    return enriched;
  })().catch(() => null);

  const enriched = await Promise.race([
    enrich,
    new Promise((resolve?) => setTimeout(() => resolve(null), 900)),
  ]);
  return enriched || fast;
}

function parseResocontoPayloadFromCustomId(customId?) {
  const raw = String(customId || "");
  const isApply = raw.startsWith(`${RESOCONTO_APPLY_PREFIX}:`);
  const isReject = raw.startsWith(`${RESOCONTO_REJECT_PREFIX}:`);
  const isOverride = raw.startsWith("resoconto_override:");
  const isReason = raw.startsWith("resoconto_reason:");
  if (!isApply && !isReject && !isOverride && !isReason) return null;
  const parts = raw.split(":");
  const kind = String(parts[1] || "");
  const userId = String(parts[2] || "");
  if (!/^\d{16,20}$/.test(userId)) return null;
  if (kind === "s") {
    const roleId = String(parts[3] || "");
    const actionKey = String(parts[4] || parts[3] || "");
    if (roleId && !/^\d{16,20}$/.test(roleId)) return null;
    return { kind, userId, roleId: roleId || null, actionKey, pending: isApply };
  }
  if (kind === "p") {
    return { kind, userId, roleId: null, actionKey: String(parts[3] || ""), pending: isApply };
  }
  return null;
}

function parseResocontoFromMessage(msg?) {
  for (const row of msg?.components || []) {
    for (const comp of row?.components || []) {
      const parsed = parseResocontoPayloadFromCustomId(comp?.customId);
      if (parsed) return parsed;
    }
  }
  const content = String(msg?.content || "");
  if (!/\*\*Staffer:\*\*|\*\*Partner Manager:\*\*|Staffer:|Partner Manager:/i.test(content)) return null;
  const userId = content.match(/<@!?(\d{16,20})>/)?.[1];
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  const actionMatch =
    content.match(/\*\*Azione:\*\*\s*__([^_]+)__/) ||
    content.match(/\*\*Azione:\*\*\s*([^\n*]+)/i) ||
    content.match(/Azione:\s*([^\n]+)/i);
  const displayAction = String(actionMatch?.[1] || "nl").trim();
  const actionKey = normalizeResocontoActionKey(displayAction) || "";
  if (/\*\*Partner Manager:\*\*|Partner Manager:/i.test(content)) {
    return { kind: "p", userId, roleId: null, actionKey, pending: false };
  }
  const roleId = content.match(/<@&(\d{16,20})>/)?.[1] || null;
  return { kind: "s", userId, roleId, actionKey, pending: false };
}

async function syncAppealsToWorkflowStore(guild?, opts: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return 0;
  const channel = await resolveSubmissionChannel(guild);
  if (!channel?.messages?.fetch) return 0;
  const scope = String(opts.scope || "all").toLowerCase();
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 5));
  const skipSanctionCheck = Boolean(opts.skipSanctionCheck || opts.fastInbox);
  let count = 0;
  let before;
  for (let page = 0; page < maxPages; page += 1) {
    const fetched = await channel.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!fetched?.size) break;
    const msgs = [...fetched.values()];
    before = msgs[msgs.length - 1]?.id;
    for (const msg of msgs) {
      const parsed = parseAppealFromMessageOrEmbed(msg);
      if (!parsed) continue;
      let status = deriveAppealStatus(msg);
      if (
        status === "pending" &&
        !skipSanctionCheck &&
        !(await appealSanctionStillActive(guild, parsed.kind, parsed.userId))
      ) {
        await closeAppealAsObsolete(guild, msg, parsed, { messageId: msg.id }).catch(() => null);
        status = "cancelled";
      }
      if (scope === "pending" && status !== "pending") continue;
      await persistAppealWorkflowFromMessage(guild, msg, parsed, status);
      count += 1;
    }
    if (fetched.size < 100) break;
  }
  return count;
}

async function syncResocontiToWorkflowStore(guild?, opts: Record<string, any> = {}) {
  const { isDiscordStaffChannelPostsEnabled } = require("../Utils/Web/discordWorkflowUiGate") as typeof import("../Utils/Web/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return 0;
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return 0;
  const channelId = String(IDs.channels?.resocontiStaff || IDs.channels?.valutazioniStaff || "").trim();
  if (!channelId) return 0;
  const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.messages?.fetch) return 0;

  let count = 0;
  let before;
  const maxPages = Math.max(1, Math.min(20, Number(opts.maxPages) || 3));
  for (let page = 0; page < maxPages; page += 1) {
    const fetched = await channel.messages
      .fetch({ limit: 100, ...(before ? { before } : {}) })
      .catch(() => null);
    if (!fetched?.size) break;
    const msgs = [...fetched.values()];
    before = msgs[msgs.length - 1]?.id;
    for (const msg of msgs) {
      const payload = parseResocontoFromMessage(msg);
      if (!payload) continue;
      const hasActionButtons = (msg.components || []).some((row?) =>
        (row.components || []).some((c?) => {
          const id = String(c?.customId || "");
          return id.startsWith(`${RESOCONTO_APPLY_PREFIX}:`) || id.startsWith(`${RESOCONTO_REJECT_PREFIX}:`);
        }),
      );
      const rawBody = String(msg.content || "");
      const decidedMarker = /azione confermata da|azione negata da/i.test(rawBody);
      const outcome = decidedMarker ? parseResocontoOutcomeFromContent(rawBody) : null;
      const member = await getGuildMemberCached(guild, payload.userId).catch(() => null);
      let stillRelevant = memberStillRelevantForResoconto(member, payload.kind, payload.roleId);
      let status = "pending";
      if (decidedMarker) {
        status = outcome?.rejected ? "rejected" : "accepted";
      } else if (hasActionButtons) {
        status = "pending";
      } else if (!stillRelevant) {
        status = "cancelled";
      }
      const appliedActionKey =
        normalizeResocontoActionKey(outcome?.actionKey || "") || normalizeResocontoActionKey(payload.actionKey);
      const title =
        payload.kind === "p"
          ? `Resoconto PM · ${payload.actionKey || ""}`.trim()
          : `Resoconto staff · ${payload.actionKey || ""}`.trim();
      const subject = await resolveWorkflowSubject(guild?.client, guild, payload.userId);
      const fromMember = memberToSubjectFields(member, payload.userId);
      await upsertStaffWorkflowItem({
        guildId,
        queue: "resoconti",
        dedupeKey: buildWorkflowDedupeKey("resoconti", [msg.id]),
        userId: payload.userId,
        messageId: msg.id,
        channelId: String(msg.channelId || channel.id),
        kind: payload.kind,
        roleId: payload.roleId,
        actionKey: appliedActionKey || payload.actionKey,
        status,
        ...(status === "cancelled"
          ? {
              statusLabel: resocontoAutoCancelLabel(member, payload.kind),
              decidedBy: "system",
            }
          : outcome?.label
            ? { statusLabel: outcome.label, staffReason: outcome.label }
            : {}),
        title,
        preview: rawBody.slice(0, 400),
        content: rawBody,
        createdAt: msg.createdAt,
        weekKey: weekKeyFromDate(msg.createdAt),
        displayName: fromMember.displayName || subject.displayName || "",
        avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
      });
      count += 1;
    }
    if (fetched.size < 100) break;
  }
  return count;
}

async function upsertPauseWorkflowFromPause(client?, guild?, userId?, pause?) {
  const gid = String(guild?.id || IDs.guilds.main || "").trim();
  const uid = String(userId || "").trim();
  const pauseId = String(pause?._id || pause?.id || "").trim();
  if (!gid || !uid || !pauseId) return null;
  const today = getTodayUtc();
  const yearBounds = (getCurrentYearBoundsUtc as any)(today);
  const status = normalizeStatus(pause?.status, "pending");
      const statusLabel = getPauseStatusLabel(pause, today);
  const member = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
  const subject = await resolveWorkflowSubject(guild?.client || client, guild, uid);
  const fromMember = memberToSubjectFields(member, uid);
  const roleTrack = pauseTrackRoleKey(pause);
  const roleLabel = pauseRoleDisplayLabel(
    { ruoloRichiesto: roleTrack, ruoloLabel: String(pause?.ruoloLabel || pause?.ruolo || "").trim() },
    member,
    guild,
  );
  return upsertStaffWorkflowItem({
        guildId: gid,
        queue: "pause",
    dedupeKey: buildWorkflowDedupeKey("pause", [uid, pauseId]),
    userId: uid,
        pauseId,
        status,
        statusLabel,
    title: fromMember.displayName || subject.displayName || uid,
    displayName: fromMember.displayName || subject.displayName || uid,
        avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
        preview: String(pause.motivazione || "").slice(0, 500),
        motivazione: String(pause.motivazione || ""),
        content: String(pause.motivazione || ""),
        createdAt: pause.createdAt,
        fields: [
          { name: "Periodo", value: `${pause.dataRichiesta || "?"} → ${pause.dataRitorno || "?"}` },
      { name: "Ruolo richiesto", value: roleLabel },
          { name: "Motivazione", value: String(pause.motivazione || "—") },
          { name: "Stato", value: statusLabel },
        ],
        workflowFields: {
          start: String(pause.dataRichiesta || ""),
          end: String(pause.dataRitorno || ""),
      dataRichiesta: String(pause.dataRichiesta || ""),
      dataRitorno: String(pause.dataRitorno || ""),
      ruoloTrack: roleTrack,
      ruoloRichiesto: roleTrack,
      ruoloLabel: roleLabel,
          phase: getPausePhase(pause.dataRichiesta, pause.dataRitorno, today),
          timing: (getPauseTimingText as any)(pause.dataRichiesta, pause.dataRitorno, today),
          statusLabel,
          giorniScalati: computePauseScaledDaysThisYear(pause, today, yearBounds.yearStart, yearBounds.yearEnd),
        },
      });
}

async function ensurePauseWorkflowDoc(client?, guildId?, dedupeKey?) {
  const gid = String(guildId || "").trim();
  const key = String(dedupeKey || "").trim();
  if (!gid || !key.toLowerCase().startsWith("pause:")) return null;
  const existing = await SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key })
    .select("status workflowQueue userId dedupeKey")
    .lean()
    .catch(() => null);
  if (existing) return existing;

  const parts = key.split(":");
    const uid = String(parts[1] || "").trim();
  const pauseId = String(parts.slice(2).join(":") || "").trim();
  if (!uid || !pauseId) return null;

  const { getStaffPauseRecord } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
  const record = await getStaffPauseRecord(gid, uid);
  const pause = (Array.isArray(record?.staff?.pauses) ? record.staff.pauses : []).find(
    (p?) => String(p?._id || "") === pauseId,
  );
  if (!pause || String(pause.status || "") !== "pending") return null;

  const guild =
    client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  await upsertPauseWorkflowFromPause(client, guild, uid, pause).catch(() => null);
  return SiteDocument.findOne({ docType: WORKFLOW_DOC, guildId: gid, dedupeKey: key })
    .select("status workflowQueue userId dedupeKey")
    .lean()
    .catch(() => null);
}

async function syncPauseWorkflowFieldsFromProfiles(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  const docs = await ActivityUserProfile.find(
    { guildId: gid, "staff.pauses.0": { $exists: true } },
    { userId: 1, "staff.pauses": 1 },
  )
    .lean()
    .catch(() => []);
  let count = 0;
  for (const doc of docs || []) {
    const userId = String(doc?.userId || "").trim();
    if (!userId) continue;
    for (const pause of Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : []) {
      if (!pause?._id) continue;
      await upsertPauseWorkflowFromPause(null, null, userId, pause).catch(() => null);
      count += 1;
    }
  }
    const legacy = await SiteDocument.find({
    docType: WORKFLOW_DOC,
    guildId: gid,
    workflowQueue: "pause",
    $or: [
      { "workflowFields.ruoloTrack": { $exists: false } },
      { "workflowFields.ruoloTrack": null },
      { "workflowFields.ruoloTrack": "" },
    ],
  })
    .select("_id workflowFields")
    .limit(300)
    .lean()
    .catch(() => []);
  for (const w of legacy || []) {
    const track = pauseTrackRoleKey(w.workflowFields || {});
    await SiteDocument.updateOne(
      { _id: w._id },
      {
        $set: {
          "workflowFields.ruoloTrack": track,
          "workflowFields.ruoloRichiesto": track,
        },
      },
    ).catch(() => null);
  }
  return count;
}

async function syncPausesToWorkflowStore(client?, guildId?) {
  const gid = String(guildId || "").trim();
  await syncPauseWorkflowFieldsFromProfiles(gid).catch(() => 0);
  const docs = await ActivityUserProfile.find({ guildId: gid, "staff.pauses.0": { $exists: true } }, { userId: 1, staff: 1 })
    .lean()
    .catch(() => []);
  const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch(gid).catch(() => null));
  let count = 0;
  const seenUsers = new Set();
  for (const doc of docs) {
    const userId = String(doc?.userId || "").trim();
    const pauses = Array.isArray(doc?.staff?.pauses) ? doc.staff.pauses : [];
    const member = guild ? await getGuildMemberCached(guild, userId).catch(() => null) : null;
    if (guild && userId && !seenUsers.has(userId)) {
      seenUsers.add(userId);
      await autoCancelPendingPausesIfNotEligible(guild, userId, { decidedBy: "system" }).catch(() => 0);
    }
    for (const pause of pauses) {
      if (!pause?._id) continue;
      const pauseId = String(pause._id);
      let status = normalizeStatus(pause.status, "pending");
      const ruolo = pause.ruoloRichiesto || pause.ruolo || "Staff";
            if (status === "pending" && member && !memberEligibleForPauseRole(member, ruolo)) {
        const { updatePauseInDb } = require("../Utils/Pause/pauseHandlersUtils") as typeof import("../Utils/Pause/pauseHandlersUtils");
        const statusLabel = pauseAutoCancelLabel(member);
        await updatePauseInDb(gid, userId, pauseId, { status: "cancelled", cancelledAt: new Date() }).catch(
          () => null,
        );
        status = "cancelled";
        pause.status = "cancelled";
        pause.cancelledAt = new Date();
      }
      await upsertPauseWorkflowFromPause(client, guild, userId, { ...pause, status, _id: pauseId });
      count += 1;
    }
  }
  await reconcilePendingPauseWorkflows(client, gid).catch(() => 0);
  return count;
}

async function backfillStaffWorkflowFromDiscord(client?, guild?, viewerMember?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return { ok: false, counts: {} };
  const counts = { pause: 0, candidature: 0, appelli: 0, resoconti: 0 };

  counts.pause = await syncPausesToWorkflowStore(client, guildId);

  const cands = await listCandidatureApplications(guild, { scope: "all", limit: 100 });
  for (const item of cands) {
    const detail = await getCandidatureApplicationDetail(guild, item.messageId).catch(() => null);
    const member = guild ? await getGuildMemberCached(guild, item.userId).catch(() => null) : null;
    const subject = await resolveWorkflowSubject(guild?.client || client, guild, item.userId);
    const fromMember = memberToSubjectFields(member, item.userId);
    await upsertStaffWorkflowItem({
      guildId,
      queue: "candidature",
      dedupeKey: buildWorkflowDedupeKey("candidature", [item.messageId]),
      userId: item.userId,
      messageId: item.messageId,
      channelId: item.channelId,
      type: item.type,
      status: item.status,
      title: item.title,
      preview: item.preview,
      content: detail?.body || item.preview,
      fields: detail?.fields || [],
      createdAt: item.createdAt,
      displayName: fromMember.displayName || subject.displayName || "",
      avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
    });
    counts.candidature += 1;
  }

  counts.appelli = await syncAppealsToWorkflowStore(guild, { scope: "all", maxPages: 10 });

  const channelId = String(IDs.channels?.resocontiStaff || IDs.channels?.valutazioniStaff || "").trim();
  if (channelId) {
    counts.resoconti = await syncResocontiToWorkflowStore(guild, { maxPages: 10 });
  }

  await setBotState(BACKFILL_STATE_KEY, Date.now()).catch(() => null);
  return { ok: true, counts };
}

async function scheduleStaffWorkflowBackfill(client?, guild?, viewerMember?, opts: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !client) return false;
  const force = Boolean(opts.force);
  const existing = await SiteDocument.countDocuments({ docType: WORKFLOW_DOC, guildId }).catch(() => 0);
  const last = Number((await getBotState(BACKFILL_STATE_KEY, 0)) || 0);
  const due = Date.now() - last > BACKFILL_MIN_INTERVAL_MS;
  if (!force && existing > 0 && !due) return false;
  if (backfillInFlight) return true;
  backfillInFlight = backfillStaffWorkflowFromDiscord(client, guild, viewerMember)
    .catch((err?) => {
      global.logger?.warn?.("[staff-workflow] backfill failed:", err?.message || err);
      return { ok: false };
    })
    .finally(() => {
      backfillInFlight = null;
    });
  if (opts.awaitCompletion) {
    await backfillInFlight.catch(() => null);
  }
  return true;
}

async function maybeBackfillStaffWorkflowStore(client?, guild?, viewerMember?) {
  return scheduleStaffWorkflowBackfill(client, guild, viewerMember);
}

async function listStaffWorkflowForInbox(client?, guild?, viewerMember?, queue?, opts: Record<string, any> = {}) {
  const q = String(queue || "").trim().toLowerCase();
  const guildId = String(guild?.id || "").trim();

  if (q === "appelli" && guild) {
    const appealSyncKey = `appeals:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__syncAt) (listStaffWorkflowForInbox as any).__syncAt = new Map();
    const lastAppeal = Number((listStaffWorkflowForInbox as any).__syncAt.get(appealSyncKey) || 0);
    const listScope = String(opts.scope || "pending").toLowerCase();
    if (opts.forceSync || Date.now() - lastAppeal > INBOX_SYNC_MIN_MS) {
      (listStaffWorkflowForInbox as any).__syncAt.set(appealSyncKey, Date.now());
      /* inboxLoadFast1: sync Discord sempre in background — lista DB subito */
      void syncAppealsToWorkflowStore(guild, {
        scope: listScope === "pending" ? "pending" : "all",
        maxPages: opts.forceSync ? 4 : 2,
        skipSanctionCheck: Boolean(opts.forceSync),
      }).catch(() => 0);
    }
  }

  if (q === "pause" && client && guildId) {
    const pauseSyncKey = `pause:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__syncAt) (listStaffWorkflowForInbox as any).__syncAt = new Map();
    const last = Number((listStaffWorkflowForInbox as any).__syncAt.get(pauseSyncKey) || 0);
        if (opts.forceSync || Date.now() - last > INBOX_SYNC_MIN_MS) {
      (listStaffWorkflowForInbox as any).__syncAt.set(pauseSyncKey, Date.now());
      void syncPauseWorkflowFieldsFromProfiles(guildId).catch(() => 0);
    void syncPausesToWorkflowStore(client, guildId).catch(() => 0);
    }
  }

        if (q === "resoconti" && guild) {
    const resoSyncKey = `resoconti:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__syncAt) (listStaffWorkflowForInbox as any).__syncAt = new Map();
    const lastReso = Number((listStaffWorkflowForInbox as any).__syncAt.get(resoSyncKey) || 0);
    if (opts.forceSync || Date.now() - lastReso > INBOX_SYNC_MIN_MS) {
      (listStaffWorkflowForInbox as any).__syncAt.set(resoSyncKey, Date.now());
      void syncResocontiToWorkflowStore(guild, { maxPages: opts.forceSync ? 2 : 2 }).catch(() => 0);
    }
    if (!(listStaffWorkflowForInbox as any).__pruneAt) (listStaffWorkflowForInbox as any).__pruneAt = new Map();
    const lastPrune = Number((listStaffWorkflowForInbox as any).__pruneAt.get(resoSyncKey) || 0);
    if (opts.forceSync || Date.now() - lastPrune > INBOX_PRUNE_MIN_MS) {
      (listStaffWorkflowForInbox as any).__pruneAt.set(resoSyncKey, Date.now());
      void pruneDepexedPendingResoconti(guild, guildId).catch(() => 0);
    }
  }

  let result = await listStaffWorkflowFromDb(client, guildId, queue, opts);
  let items = result.items;

  /* inboxLoadFast1: empty pending → kick sync in background, niente secondo await Discord */
  if (
    q === "appelli" &&
    guild &&
    opts.forceSync &&
    String(opts.scope || "pending").toLowerCase() === "pending" &&
    !items.length
  ) {
    void syncAppealsToWorkflowStore(guild, {
      scope: "pending",
      maxPages: 6,
      skipSanctionCheck: true,
    }).catch(() => 0);
  }

  if (q === "appelli" && guild) {
    const appealSyncKey = `appeals:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__pruneAt) (listStaffWorkflowForInbox as any).__pruneAt = new Map();
    const lastAppealPrune = Number((listStaffWorkflowForInbox as any).__pruneAt.get(appealSyncKey) || 0);
    if (opts.forceSync || Date.now() - lastAppealPrune > INBOX_PRUNE_MIN_MS) {
      (listStaffWorkflowForInbox as any).__pruneAt.set(appealSyncKey, Date.now());
      void autoCloseObsoletePendingAppeals(guild, { limit: 30 }).catch(() => 0);
    }
  }

  if (q === "pause" && guild) {
    let knownStaffIds = null;
    try {
      const { loadRosterSnapshot } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
      const snap = await loadRosterSnapshot(guildId).catch(() => null);
      if (Array.isArray(snap?.userIds) && snap.userIds.length) {
        knownStaffIds = new Set(snap.userIds.map((id?) => String(id || "").trim()).filter(Boolean));
      }
    } catch (_) {}
        items = filterPauseInboxItemsCachedOnly(guild, items, knownStaffIds);
    const pausePruneKey = `pausePrune:${guildId}`;
    if (!(listStaffWorkflowForInbox as any).__pruneAt) (listStaffWorkflowForInbox as any).__pruneAt = new Map();
    const lastPausePrune = Number((listStaffWorkflowForInbox as any).__pruneAt.get(pausePruneKey) || 0);
    if (opts.forceSync || Date.now() - lastPausePrune > INBOX_PRUNE_MIN_MS) {
      (listStaffWorkflowForInbox as any).__pruneAt.set(pausePruneKey, Date.now());
      const pendingSnapshot = items.filter((item?) => String(item?.status || "") === "pending");
      void prunePendingPauseInboxUsers(guild, client, guildId, pendingSnapshot).catch((err?) => {
        global.logger?.warn?.("[staffWorkflow] prune depexed pauses:", err?.message || err);
      });
    }
  }
  if (q === "resoconti" && viewerMember?.id) {
    items = items.map((item?) => ({
      ...item,
      canAct:
        item.status === "pending" &&
        memberHasResocontoButtonAccess(viewerMember, {
          kind: item.kind,
          userId: item.userId,
          roleId: item.roleId,
        }),
    }));
  }
  return {
    items,
    pagination: result.pagination,
    week: result.week ?? null,
    weeks: result.weeks,
  };
}

async function persistCandidatureWorkflowFromMessage(guild?, message?, type?, userId?, status = "pending") {
  if (!guild || !message) return null;
  const embed = message.embeds?.[0];
  const fullBody = (Array.isArray(message.embeds) ? message.embeds : [])
    .map((e?) => String(e?.description || "").trim())
    .filter(Boolean)
    .join("\n\n");
  const body = stripDiscordDecorations(fullBody || String(embed?.description || ""), { keepNewlines: true });
  const fieldsFromEmbed = (Array.isArray(embed?.fields) ? embed.fields : [])
    .map((field?) => ({
      name: String(field?.name || "").trim(),
      value: stripDiscordDecorations(field?.value || ""),
    }))
    .filter((field?) => field.name || field.value);
  const fieldsFromBody = parseNumberedQaBlocks(body);
  const fields = fieldsFromBody.length ? fieldsFromBody : fieldsFromEmbed;
  return persistCandidatureWorkflowFromPayload(guild, {
    messageId: message.id,
    channelId: message.channelId,
    type,
    userId,
    status,
    title: stripDiscordDecorations(embed?.title || "Candidatura") || "Candidatura",
    body,
    fields,
    createdAt: message.createdAt,
  });
}

async function persistCandidatureWorkflowFromPayload(guild?, payload: Record<string, any> = {}) {
  if (!guild) return null;
  const messageId = String(payload.messageId || "").trim();
  const userId = String(payload.userId || "").trim();
  if (!messageId || !userId) return null;
  const body = stripDiscordDecorations(String(payload.body || ""), { keepNewlines: true });
  const fieldsFromBody = parseNumberedQaBlocks(body);
  const fields =
    Array.isArray(payload.fields) && payload.fields.length
      ? payload.fields
      : fieldsFromBody;
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const subject = await resolveWorkflowSubject(guild?.client, guild, userId);
  const fromMember = memberToSubjectFields(member, userId);
  return upsertStaffWorkflowItem({
    guildId: guild.id,
    queue: "candidature",
    dedupeKey: buildWorkflowDedupeKey("candidature", [messageId]),
    userId,
    type: payload.type,
    messageId,
    channelId: String(payload.channelId || "site"),
    status: payload.status || "pending",
    title: stripDiscordDecorations(payload.title || "Candidatura") || "Candidatura",
    preview: body.slice(0, 400),
    content: body,
    fields,
    workflowFields: fields.length ? fields : null,
    createdAt: payload.createdAt || new Date(),
    displayName: fromMember.displayName || subject.displayName || "",
    avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
  });
}

async function persistAppealWorkflowFromMessage(guild?, message?, parsed?, status = "pending") {
  if (!guild || !message || !parsed) return null;
  const embed = message.embeds?.[0];
  const body = stripDiscordDecorations(String(embed?.description || ""), { keepNewlines: true });
  const fallbackTitle = parsed.kind === "unban" ? "Richiesta Unban" : "Richiesta Unmute";
  return persistAppealWorkflowFromPayload(guild, {
    messageId: message.id,
    channelId: message.channelId,
    userId: parsed.userId,
    kind: parsed.kind,
    status,
    title: stripDiscordDecorations(embed?.title || fallbackTitle) || fallbackTitle,
    body,
    createdAt: message.createdAt,
  });
}

async function persistAppealWorkflowFromPayload(guild?, payload: Record<string, any> = {}) {
  if (!guild) return null;
  const messageId = String(payload.messageId || "").trim();
  const userId = String(payload.userId || "").trim();
  const kind = String(payload.kind || "").trim().toLowerCase();
  if (!messageId || !userId || (kind !== "unban" && kind !== "unmute")) return null;
  const body = stripDiscordDecorations(String(payload.body || ""), { keepNewlines: true });
  const fallbackTitle = kind === "unban" ? "Richiesta Unban" : "Richiesta Unmute";
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const subject = await resolveWorkflowSubject(guild?.client, guild, userId);
  const fromMember = memberToSubjectFields(member, userId);
  const displayName = pickSubjectDisplayName(
    userId,
    payload.displayName,
    payload.subjectDisplayName,
    payload.workflowSubjectName,
    fromMember.displayName,
    subject.displayName,
  );
  const avatarUrl =
    String(payload.avatarUrl || payload.subjectAvatarUrl || "").trim() ||
    fromMember.avatarUrl ||
    subject.avatarUrl ||
    "";
  return upsertStaffWorkflowItem({
    guildId: guild.id,
    queue: "appelli",
    dedupeKey: buildWorkflowDedupeKey("appelli", [messageId]),
    userId,
    kind,
    messageId,
    channelId: String(payload.channelId || "site"),
    status: payload.status || "pending",
    title: stripDiscordDecorations(payload.title || fallbackTitle) || fallbackTitle,
    preview: cleanAppealPreviewText(body).slice(0, 500),
    content: body,
    createdAt: payload.createdAt || new Date(),
    displayName,
    avatarUrl,
  });
}

async function persistResocontoWorkflowFromMessage(guild?, message?, payload?, status = "pending") {
  if (!guild || !message || !payload) return null;
  const rawBody = String(message.content || "");
  return persistResocontoWorkflowFromPayload(guild, {
    messageId: message.id,
    channelId: message.channelId,
    userId: payload.userId,
    kind: payload.kind,
    roleId: payload.roleId,
    actionKey: payload.actionKey,
    content: rawBody,
    createdAt: message.createdAt,
    status,
    weekKey: payload.weekKey,
    workflowFields: payload.workflowFields || null,
  });
}

async function persistResocontoWorkflowFromPayload(guild?, payload: Record<string, any> = {}) {
  if (!guild) return null;
  const messageId = String(payload.messageId || "").trim();
  const userId = String(payload.userId || "").trim();
  if (!messageId || !userId) return null;
  const rawBody = String(payload.content || payload.body || "");
  const kind = String(payload.kind || "").trim();
  const title =
    kind === "p"
      ? `Resoconto PM · ${payload.actionKey || ""}`.trim()
      : `Resoconto staff · ${payload.actionKey || ""}`.trim();
  const createdAt = payload.createdAt || new Date();
  const member = await getGuildMemberCached(guild, userId).catch(() => null);
  const subject = await resolveWorkflowSubject(guild?.client, guild, userId);
  const fromMember = memberToSubjectFields(member, userId);
  const extraFields =
    payload.workflowFields && typeof payload.workflowFields === "object" && !Array.isArray(payload.workflowFields)
      ? payload.workflowFields
      : null;
  return upsertStaffWorkflowItem({
    guildId: guild.id,
    queue: "resoconti",
    dedupeKey: buildWorkflowDedupeKey("resoconti", [messageId]),
    userId,
    kind,
    roleId: payload.roleId,
    actionKey: payload.actionKey,
    messageId,
    channelId: String(payload.channelId || "site"),
    status: payload.status || "pending",
    title,
    preview: rawBody.slice(0, 400),
    content: rawBody,
    createdAt,
    weekKey: String(payload.weekKey || weekKeyFromDate(createdAt) || "").trim(),
    displayName: fromMember.displayName || subject.displayName || "",
    avatarUrl: fromMember.avatarUrl || subject.avatarUrl || "",
    ...(extraFields ? { workflowFields: extraFields } : {}),
  });
}

function workflowActorExtras(actorMember?) {
  const id = String(actorMember?.id || actorMember?.user?.id || "").trim();
  const name = String(
    actorMember?.displayName || actorMember?.user?.globalName || actorMember?.user?.username || "",
  ).trim();
  return {
    ...(id ? { decidedBy: id } : {}),
    ...(name ? { decidedByName: name } : {}),
  };
}

function resocontoWorkflowItemFromDoc(doc?) {
  if (!doc) return null;
  const status = resolveResocontoDocStatus(doc);
  const actionKey = normalizeResocontoActionKey(doc?.workflowActionKey || "");
  const body = String(doc?.content || doc?.body || "");
  const proposedLabel = formatResocontoProposedLabel(extractResocontoAzioneText(body), actionKey);
  return {
    messageId: String(doc?.workflowMessageId || ""),
    channelId: String(doc?.workflowChannelId || ""),
    dedupeKey: String(doc?.dedupeKey || ""),
    userId: String(doc?.userId || ""),
    kind: String(doc?.workflowKind || ""),
    roleId: doc?.workflowRoleId ? String(doc.workflowRoleId) : null,
    actionKey,
    proposedLabel,
    status,
    statusLabel: deriveResocontoStatusLabel(doc),
    canAct: status === "pending",
    body,
    content: body,
    preview: buildResocontoInboxPreview(body, {
      kind: String(doc?.workflowKind || ""),
      proposedLabel,
    }) ||
      stripDiscordDecorations(doc?.body || doc?.content || "", {
        keepNewlines: false,
        keepCustomEmoji: false,
      }).slice(0, 180),
  };
}

function resocontoWorkflowItemFromSnapshot(fields: Record<string, any> = {}) {
  const messageId = String(fields.messageId || "").trim();
  const status = normalizeStatus(fields.status, "accepted");
  const actionKey = normalizeResocontoActionKey(fields.actionKey || "");
  const body = String(fields.body || fields.content || "");
  const statusLabel =
    String(fields.statusLabel || "").trim() ||
    resocontoActionLabelForKey(actionKey) ||
    (status === "rejected" ? "Azione negata" : statusLabelFor(status));
  return {
    messageId,
    channelId: String(fields.channelId || ""),
    dedupeKey: String(fields.dedupeKey || buildWorkflowDedupeKey("resoconti", [messageId])),
    userId: String(fields.userId || ""),
    kind: String(fields.kind || ""),
    roleId: fields.roleId ? String(fields.roleId) : null,
    actionKey,
    status,
    statusLabel,
    canAct: status === "pending",
    body,
    content: body,
    preview: buildResocontoInboxPreview(body, {
      kind: String(fields.kind || ""),
      proposedLabel: resocontoActionLabelForKey(actionKey),
    }) ||
      stripDiscordDecorations(body, {
        keepNewlines: false,
        keepCustomEmoji: false,
      }).slice(0, 180),
  };
}

export = {
  WORKFLOW_DOC,
  buildWorkflowDedupeKey,
  upsertStaffWorkflowItem,
  updateStaffWorkflowStatusByDedupe,
  updateStaffWorkflowFromMessage,
  updateStaffWorkflowFromPause,
  cancelPendingResocontiWorkflowForUser,
  cancelPendingPauseWorkflowForUser,
  autoCancelPendingPausesIfNotEligible,
  reconcilePendingPauseWorkflows,
  pruneDepexedPendingResoconti,
  memberStillRelevantForResoconto,
  memberEligibleForPauseRole,
  listStaffWorkflowFromDb,
  listStaffWorkflowForInbox,
  listUserWorkflowsForMember,
  listUserInvitedSubjectChats,
  getUserWorkflowDetailFromDb,
  getPendingPauseWorkflowForMember,
  getStaffWorkflowDetailFromDb,
  backfillStaffWorkflowFromDiscord,
  scheduleStaffWorkflowBackfill,
  maybeBackfillStaffWorkflowStore,
  syncPausesToWorkflowStore,
  syncPauseWorkflowFieldsFromProfiles,
  upsertPauseWorkflowFromPause,
  ensurePauseWorkflowDoc,
  persistCandidatureWorkflowFromMessage,
  persistCandidatureWorkflowFromPayload,
  persistAppealWorkflowFromMessage,
  persistAppealWorkflowFromPayload,
  persistResocontoWorkflowFromMessage,
  persistResocontoWorkflowFromPayload,
  parseAppealFromMessageOrEmbed,
  deriveAppealStatus,
  parseCandidateTypeFromMessage,
  parseResocontoFromMessage,
  syncResocontiToWorkflowStore,
  workflowActorExtras,
  memberToSubjectFields,
  resocontoActionLabelForKey,
  resocontoWorkflowItemFromDoc,
  resocontoWorkflowItemFromSnapshot,
  parseResocontoOutcomeFromContent,
  resolveResocontoDocStatus,
  deriveResocontoStatusLabel,
  buildResocontoInboxPreview,
  deriveResocontoStaffFlags,
};
