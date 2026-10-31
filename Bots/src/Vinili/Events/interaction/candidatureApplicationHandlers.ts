const path = require("path") as typeof import("path");
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getOrCreateStaffDoc, deleteThreadForMessage, ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { clearStaffPendingPurgeAt } = require("../../Services/Community/userLeaveBackupService") as typeof import("../../Services/Community/userLeaveBackupService");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { sendPartnerManagerWelcome, sendHelperWelcome } = require("../../Utils/Staff/staffWelcomeMessages") as typeof import("../../Utils/Staff/staffWelcomeMessages");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const BOT_ROOT = path.resolve(__dirname, "..", "..");
const APPLY_HELPER_BUTTON = "apply_helper";
const APPLY_PM_BUTTON = "apply_partnermanager";
const APPLY_START_PREFIX = "apply_start";
const APPLY_BACK_PREFIX = "apply_back";
const APPLY_PAGE_PREFIX = "apply_page";
const MODAL_PREFIX = "apply_form";
const APPLY_PEX_PREFIX = "apply_pex";
const APPLY_PEX_MODAL_PREFIX = "apply_pex_modal";
const APPLY_REJECT_PREFIX = "apply_reject";
const APPLY_PEX_REASON_INPUT_ID = "apply_pex_reason";
const VISIONE_MODULI_AUTO_PEX_REASON = "Candidatura accettata.";
const WEB_ACCEPT_PEX_REASON = "Candidatura accettata.";
const STATE_TTL_MS = 30 * 60 * 1000;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const APPLICATION_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;
const APPLICATION_REACTIONS = ["<:thumbsup:1471292172145004768>", "<:thumbsdown:1471292163957457013>",];
const APPLICATION_PENDING_COLOR = TENANT_EMBED_COLOR;
const APPLICATION_ACCEPTED_COLOR = "#2ECC71";
const APPLICATION_REJECTED_COLOR = "#ED4245";
const NOMODULI_ROLE_ID = IDs.roles.blacklistModuli;
const MEMBER_ROLE_ID = IDs.roles.Member;
const HELPER_ROLE_ID = IDs.roles.Helper;
const PARTNER_MANAGER_ROLE_ID = IDs.roles.PartnerManager;
const BLOGGER_ROLE_ID = String(IDs.roles.Blogger || "1557507157899878533");
/** Tipi di candidatura: Helper e Partner Manager (anche da Discord), Blogger (dal sito). */
const APPLICATION_TYPES = ["helper", "partnermanager", "blogger"];
const APPLICATION_TYPE_LABELS = { helper: "Helper", partnermanager: "Partner Manager", blogger: "Blogger" };
function normalizeApplicationType(type?) {
  const t = String(type || "").trim().toLowerCase();
  return APPLICATION_TYPES.includes(t) ? t : "helper";
}
function applicationTypeLabel(type?) {
  return APPLICATION_TYPE_LABELS[normalizeApplicationType(type)];
}
const HELPER_REAPPLY_BLOCK_ROLE_IDS = [IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.HighStaff, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.Founder].filter(Boolean);
/** Priorità (alto → basso) per messaggio “Sei già un …” quando manca position Discord. */
const HELPER_BLOCK_ROLE_PRIORITY_IDS = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.SeniorModerator,
  IDs.roles.HighStaff,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
].filter(Boolean);
const HELPER_BLOCK_ROLE_FALLBACK_LABEL = {
  [String(IDs.roles.Founder || "")]: "Founder",
  [String(IDs.roles.Manager || "")]: "Manager",
  [String(IDs.roles.Admin || "")]: "Admin",
  [String(IDs.roles.Director || "")]: "Director",
  [String(IDs.roles.SeniorModerator || "")]: "Senior Moderator",
  [String(IDs.roles.HighStaff || "")]: "High Staff",
  [String(IDs.roles.Mod || "")]: "Mod",
  [String(IDs.roles.Helper || "")]: "Helper",
  [String(IDs.roles.Staff || "")]: "Staff",
  [String(IDs.roles.PartnerManager || "")]: "Partner Manager",
  [BLOGGER_ROLE_ID]: "Blogger",
};
const pendingApplications = new Map();
const cooldownByUserAndType = new Map();
let cooldownLoaded = false;
let countersLoaded = false;
let draftsLoaded = false;
/* rebootDurability1: sync pendingApplications → drafts on shutdown */
let candidatureDraftShutdownFlushRegistered = false;
const WEBSITE_AUTH_TIMEOUT_MS = 4500; // rolesPrefetchNoise1: UA + slightly longer; was bare abort@2800
let lastDiscordMeWarnAt = 0;
const {
  readCachedWebsiteMember,
  writeCachedWebsiteMember,
  ensureWebsiteGuild,
  fetchWebsiteGuildMember,
  isUnknownMemberError,
} = require("../../Web/websiteGuildMemberFetch") as typeof import("../../Web/websiteGuildMemberFetch");
const { DISCORD_OAUTH_UA, fetchDiscordOAuthMe } = require("../../Web/discordOauthMe") as typeof import("../../Web/discordOauthMe");

function withTimeout(promise?, timeoutMs?, label?) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_?, reject?) => {
      timer = setTimeout(() => reject(new Error(`${label || "operation"}_timeout`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function fetchDiscordMe(accessToken?) {
  const out = await fetchDiscordOAuthMe(accessToken, { timeoutMs: WEBSITE_AUTH_TIMEOUT_MS });
  if (!out.ok) {
    const err: any = new Error(out.message || out.error || "discord_unreachable");
    err.name = out.error === "discord_timeout" ? "AbortError" : "Error";
    err.oauth = out;
    throw err;
  }
  return {
    ok: true,
    status: 200,
    async json() {
      return out.me;
    },
  };
}

/**
 * @returns {Promise<{ json: object|null, status: number|null, notInGuild: boolean, unreachable: boolean }>}
 */
async function fetchOAuthGuildMemberResult(accessToken?, guildId?, timeoutMs = 2500) {
  const token = String(accessToken || "").trim();
  const gid = String(guildId || "").trim();
  if (!token || !gid) {
    return { json: null, status: null, notInGuild: false, unreachable: true };
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch (_) {}
  }, Math.max(600, Number(timeoutMs) || 2500));
  try {
    const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${gid}/member`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": DISCORD_OAUTH_UA,
      },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (res.status === 404) {
      return { json: null, status: 404, notInGuild: true, unreachable: false };
    }
    if (!res.ok) {
      return { json: null, status: res.status, notInGuild: false, unreachable: res.status >= 500 };
    }
    const json = await res.json().catch(() => null);
    return { json: json || null, status: res.status, notInGuild: false, unreachable: !json };
  } catch (_) {
    return { json: null, status: null, notInGuild: false, unreachable: true };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOAuthGuildMemberJson(accessToken?, guildId?, timeoutMs = 2500) {
  const r = await fetchOAuthGuildMemberResult(accessToken, guildId, timeoutMs);
  return r.json;
}

function synthMemberFromOAuth(guild?, meJson?, oauthMember?) {
  const userId = String(meJson?.id || oauthMember?.user?.id || "").trim();
  if (!userId) return null;
  const roleIds = Array.isArray(oauthMember?.roles)
    ? oauthMember.roles.map(String).filter(Boolean)
    : [];
  const roleSet = new Set(roleIds);
  const username = String(meJson?.username || oauthMember?.user?.username || "user").trim() || "user";
  const displayName =
    String(oauthMember?.nick || meJson?.global_name || meJson?.globalName || username).trim() ||
    username;
  const avatarHash = String(meJson?.avatar || oauthMember?.user?.avatar || "").trim() || null;
  const memberAvatarHash = String(oauthMember?.avatar || "").trim() || null;
  const user = {
    id: userId,
    username,
    globalName: displayName,
    avatar: avatarHash,
    displayAvatarURL: (opts: Record<string, any> = {}) => {
      const size = Number(opts.size) || 128;
      if (avatarHash) {
        const animated = avatarHash.startsWith("a_");
        const ext = opts.extension || (opts.forceStatic ? "png" : animated ? "gif" : "webp");
        return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
      }
      return `https://cdn.discordapp.com/embed/avatars/0.png`;
    },
  };
  return {
    id: userId,
    guild: guild || null,
    avatar: memberAvatarHash,
    displayName,
    user,
    roles: {
      cache: {
        has: (id?) => roleSet.has(String(id || "")),
        keys: function* keys() {
          yield* roleSet.values();
        },
        get size() {
          return roleSet.size;
        },
      },
    },
    _vcFromOAuth: true,
  };
}

function cooldownTypeKey(type?) {
  return normalizeApplicationType(type);
}
function cooldownStorageKey(userId?, type?) {
  return `${String(userId || "")}:${cooldownTypeKey(type)}`;
}
const draftByStateKey = new Map();
const candidatePexLocks = new Set();
const applicationCounters = { helper: 0, partnermanager: 0, blogger: 0, };
const {
  HELPER_QUESTIONS,
  PARTNER_MANAGER_QUESTIONS,
  BLOGGER_QUESTIONS,
  choicePlaceholder,
  findQuestionLabel,
} = require("../../Utils/Community/candidatureApplicationsCatalog") as typeof import("../../Utils/Community/candidatureApplicationsCatalog");

const APPLICATIONS = {
  helper: {
    label: "Helper",
    questions: HELPER_QUESTIONS,
  },
  partnermanager: {
    label: "Partner Manager",
    questions: PARTNER_MANAGER_QUESTIONS,
  },
  blogger: {
    label: "Blogger",
    questions: BLOGGER_QUESTIONS,
  },
};

function splitQuestions(questions?, chunkSize = 4) {
  const list = Array.isArray(questions) ? questions : [];
  const size = Math.max(1, Number(chunkSize) || 4);
  const chunks = [];
  for (let i = 0; i < list.length; i += size) chunks.push(list.slice(i, i + size));
  return chunks.length ? chunks : [[]];
}

async function loadCooldownMap() {
  if (cooldownLoaded) return;
  cooldownLoaded = true;
  try {
    const parsed = await getBotState("applicationCooldowns", null);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [userId, entry] of Object.entries(parsed)) {
      const uid = String(userId || "");
      if (!uid) continue;
      if (typeof entry === "number") {
        const ts = Number(entry || 0);
        if (Number.isFinite(ts) && ts > now) {
          cooldownByUserAndType.set(`${uid}:helper`, ts);
          cooldownByUserAndType.set(`${uid}:partnermanager`, ts);
        }
        continue;
      }
      if (entry && typeof entry === "object") {
        for (const t of APPLICATION_TYPES) {
          const ts = Number(entry[t] || 0);
          if (Number.isFinite(ts) && ts > now) {
            cooldownByUserAndType.set(`${uid}:${t}`, ts);
          }
        }
      }
    }
  } catch (err) {
    global.logger?.warn?.("[candidature] load cooldowns:", err?.message || err);
  }
}

async function persistCooldownMap() {
  const now = Date.now();
  const out: Record<string, any> = {};
  for (const [key, until] of cooldownByUserAndType.entries()) {
    const ts = Number(until || 0);
    if (!(ts > now)) continue;
    const idx = key.lastIndexOf(":");
    if (idx <= 0) continue;
    const uid = key.slice(0, idx);
    const typ = key.slice(idx + 1);
    if (!out[uid]) out[uid] = {};
    out[uid][typ] = ts;
  }
  await setBotState("applicationCooldowns", out);
}

async function loadApplicationCounters() {
  if (countersLoaded) return;
  countersLoaded = true;
  try {
    const parsed = await getBotState("applicationCounters", null);
    if (parsed && typeof parsed === "object") {
      const helper = Number(parsed.helper || 0);
      const pm = Number(parsed.partnermanager || 0);
      applicationCounters.helper = Number.isFinite(helper) && helper > 0 ? Math.floor(helper) : 0;
      applicationCounters.partnermanager = Number.isFinite(pm) && pm > 0 ? Math.floor(pm) : 0;
      const blog = Number(parsed.blogger || 0);
      applicationCounters.blogger = Number.isFinite(blog) && blog > 0 ? Math.floor(blog) : 0;
    }
  } catch (err) {
    global.logger?.warn?.("[candidature] load counters:", err?.message || err);
  }
}

async function persistApplicationCounters() {
  await setBotState("applicationCounters", { ...applicationCounters });
}

async function nextApplicationNumber(type?) {
  await loadApplicationCounters();
  const key = normalizeApplicationType(type);
  const current = Number(applicationCounters[key] || 0);
  const next = Number.isFinite(current) ? Math.floor(current) + 1 : 1;
  applicationCounters[key] = next;
  await persistApplicationCounters();
  return next;
}

async function loadDraftMap() {
  if (draftsLoaded) return;
  draftsLoaded = true;
  try {
    const parsed = await getBotState("applicationDrafts", null);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [stateKey, draft] of Object.entries(parsed)) {
      if (!draft || typeof draft !== "object") continue;
      const updatedAt = Number(draft.updatedAt || 0);
      const nextStep = Number(draft.nextStep || 1);
      if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) continue;
      if (!Number.isFinite(nextStep) || nextStep < 1) continue;
      draftByStateKey.set(stateKey, {
        answers: draft.answers && typeof draft.answers === "object" ? draft.answers : {},
        nextStep: Math.floor(nextStep),
        updatedAt,
      });
    }
  } catch (err) {
    global.logger?.warn?.("[candidature] load drafts:", err?.message || err);
  }
}

async function persistDraftMap() {
  const now = Date.now();
  const out: Record<string, any> = {};
  for (const [stateKey, draft] of draftByStateKey.entries()) {
    const updatedAt = Number(draft?.updatedAt || 0);
    const nextStep = Number(draft?.nextStep || 1);
    if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) continue;
    if (!Number.isFinite(nextStep) || nextStep < 1) continue;
    out[stateKey] = {
      answers: draft.answers && typeof draft.answers === "object" ? draft.answers : {},
      nextStep: Math.floor(nextStep),
      updatedAt,
    };
  }
  await setBotState("applicationDrafts", out);
}

function inferDraftNextStep(stateKey?, answers?) {
  const existing = draftByStateKey.get(stateKey);
  const existingStep = Number(existing?.nextStep || 0);
  if (Number.isFinite(existingStep) && existingStep >= 1) return Math.floor(existingStep);

  const parts = String(stateKey || "").split(":");
  const type = parts[parts.length - 1];
  const cfg = APPLICATIONS[type];
  if (!cfg?.questions?.length) return 1;
  const chunks = splitQuestions(cfg.questions, 4);
  for (let i = 0; i < chunks.length; i += 1) {
    const incomplete = chunks[i].some((q?) => !String(answers?.[q.id] || "").trim());
    if (incomplete) return i + 1;
  }
  return Math.max(1, chunks.length);
}

async function syncPendingApplicationsToDraftsOnShutdown() {
  const now = Date.now();
  let changed = false;
  for (const [stateKey, state] of pendingApplications.entries()) {
    if (!stateKey || !state?.answers || typeof state.answers !== "object") continue;
    const createdAt = Number(state.createdAt || 0);
    if (Number.isFinite(createdAt) && createdAt > 0 && now - createdAt > STATE_TTL_MS) continue;
    draftByStateKey.set(stateKey, {
      answers: state.answers,
      nextStep: inferDraftNextStep(stateKey, state.answers),
      updatedAt: now,
    });
    changed = true;
  }
  if (changed) await persistDraftMap();
}

function ensureCandidatureDraftShutdownFlush() {
  if (candidatureDraftShutdownFlushRegistered) return;
  candidatureDraftShutdownFlushRegistered = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_candidature_pending_drafts", () =>
    syncPendingApplicationsToDraftsOnShutdown(),
  );
}

ensureCandidatureDraftShutdownFlush();

async function setDraftState(stateKey?, answers?, nextStep?) {
  await loadDraftMap();
  draftByStateKey.set(stateKey, {
    answers: answers && typeof answers === "object" ? answers : {},
    nextStep: Math.max(1, Math.floor(Number(nextStep) || 1)),
    updatedAt: Date.now(),
  });
  await persistDraftMap();
}

async function getDraftState(stateKey?) {
  await loadDraftMap();
  const draft = draftByStateKey.get(stateKey);
  if (!draft) return null;
  const updatedAt = Number(draft.updatedAt || 0);
  if (!Number.isFinite(updatedAt) || Date.now() - updatedAt > DRAFT_TTL_MS) {
    draftByStateKey.delete(stateKey);
    await persistDraftMap();
    return null;
  }
  return draft;
}

async function clearDraftState(stateKey?) {
  await loadDraftMap();
  if (!draftByStateKey.has(stateKey)) return;
  draftByStateKey.delete(stateKey);
  await persistDraftMap();
}

async function pruneOldStates() {
  const now = Date.now();
  for (const [key, state] of pendingApplications.entries()) {
    if (!state?.createdAt || now - state.createdAt > STATE_TTL_MS) {
      pendingApplications.delete(key);
    }
  }
  let draftChanged = false;
  for (const [key, draft] of draftByStateKey.entries()) {
    const updatedAt = Number(draft?.updatedAt || 0);
    if (!Number.isFinite(updatedAt) || now - updatedAt > DRAFT_TTL_MS) {
      draftByStateKey.delete(key);
      draftChanged = true;
    }
  }
  if (draftChanged) await persistDraftMap();
}

if (!global.__vcCandidatureCleanupTimer) {
  global.__vcCandidatureCleanupTimer = setInterval(pruneOldStates, 5 * 60 * 1000);
  if (typeof global.__vcCandidatureCleanupTimer.unref === "function") {
    global.__vcCandidatureCleanupTimer.unref();
  }
}

function memberHasRoleId(member?, roleId?) {
  const id = String(roleId || "").trim();
  if (!id) return false;
  const cache = member?.roles?.cache;
  if (!cache || typeof cache.has !== "function") return false;
  return cache.has(id);
}

function resolveHighestBlockingRoleId(member?, roleIds?) {
  const ids = (Array.isArray(roleIds) ? roleIds : []).map((x?) => String(x || "").trim()).filter(Boolean);
  if (!ids.length || !member) return null;
  const owned = ids.filter((id?) => memberHasRoleId(member, id));
  if (!owned.length) return null;

  const guildRoles = member?.guild?.roles?.cache;
  if (guildRoles && typeof guildRoles.get === "function") {
    const ranked = owned
      .map((id?) => guildRoles.get(id))
      .filter(Boolean)
      .sort((a?, b?) => Number(b.position || 0) - Number(a.position || 0));
    if (ranked[0]?.id) return String(ranked[0].id);
  }

  const cache = member?.roles?.cache;
  if (cache && typeof cache.get === "function") {
    const ranked = owned
      .map((id?) => cache.get(id))
      .filter(Boolean)
      .sort((a?, b?) => Number(b.position || 0) - Number(a.position || 0));
    if (ranked[0]?.id) return String(ranked[0].id);
  }

  for (const id of HELPER_BLOCK_ROLE_PRIORITY_IDS) {
    if (owned.includes(String(id))) return String(id);
  }
  return owned[0] || null;
}

function labelForStaffRoleId(roleId?, member?) {
  const id = String(roleId || "").trim();
  if (!id) return "Staff";
  const fromGuild = member?.guild?.roles?.cache?.get?.(id);
  const fromMember = member?.roles?.cache?.get?.(id);
  const raw = String(fromGuild?.name || fromMember?.name || HELPER_BLOCK_ROLE_FALLBACK_LABEL[id] || "Staff").trim();
  return (
    raw
      .replace(/<a?:[\w~]+:\d+>/g, "")
      .replace(/<[@#&!]?\d+>/g, "")
      .replace(/[*_`~|]+/g, "")
      .replace(/\s+/g, " ")
      .trim() ||
    HELPER_BLOCK_ROLE_FALLBACK_LABEL[id] ||
    "Staff"
  );
}

function alreadyRoleMessage(label?) {
  const name = String(label || "").trim() || "Staff";
  return `Sei già un ${name}.`;
}

const { hasCandidatureReviewAccess } = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");

async function getCooldownUntil(userId?, type?) {
  await loadCooldownMap();
  const key = cooldownStorageKey(userId, type);
  const ts = Number(cooldownByUserAndType.get(key) || 0);
  if (!Number.isFinite(ts) || ts <= Date.now()) {
    cooldownByUserAndType.delete(key);
    await persistCooldownMap();
    return 0;
  }
  return ts;
}

async function setCooldown(userId?, untilTs?, type?) {
  await loadCooldownMap();
  cooldownByUserAndType.set(cooldownStorageKey(userId, type), Number(untilTs));
  await persistCooldownMap();
}

async function bumpApplicationCooldownAfterStaffDepex(userId?) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return;
  await loadCooldownMap();
  const floor = Date.now() + APPLICATION_COOLDOWN_MS;
  for (const type of APPLICATION_TYPES) {
    const key = cooldownStorageKey(uid, type);
    const cur = Number(cooldownByUserAndType.get(key) || 0);
    const active = Number.isFinite(cur) && cur > Date.now() ? cur : 0;
    cooldownByUserAndType.set(key, Math.max(floor, active));
  }
  await persistCooldownMap();
}

function buildCandidateActionRow(type?, userId?) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${APPLY_PEX_PREFIX}:${type}:${userId}`)
      .setEmoji("<:success:1461731530333229226>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${APPLY_REJECT_PREFIX}:${type}:${userId}`)
      .setEmoji("<:cancel:1461730653677551691>")
      .setStyle(ButtonStyle.Danger),
  );
}

function recolorEmbeds(embeds?, color?) {
  return (Array.isArray(embeds) ? embeds : [])
    .map((embed?) => EmbedBuilder.from(embed).setColor(color));
}

async function setApplicationMessageStatusColor(message?, color?, decidedBy = "", decidedByName = "") {
  /* notifCandRejectClear1: workflow/clear anche se msg non editable */
  if (message?.editable) {
    const embeds = recolorEmbeds(message.embeds, color);
    await message.edit({ embeds, components: [] }).catch(() => null);
  }
  try {
    const { updateStaffWorkflowFromMessage } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
    const status =
      String(color || "").toLowerCase() === String(APPLICATION_ACCEPTED_COLOR).toLowerCase()
        ? "accepted"
        : "rejected";
    await updateStaffWorkflowFromMessage(message?.guild?.id, "candidature", message?.id, status, {
      decidedBy: String(decidedBy || ""),
      decidedByName: String(decidedByName || ""),
    });
  } catch (_) {}
}

function getTargetRoleIdByType(type?) {
  if (type === "partnermanager") return PARTNER_MANAGER_ROLE_ID;
  if (type === "blogger") return BLOGGER_ROLE_ID;
  if (type === "helper") return HELPER_ROLE_ID;
  return null;
}

function formatApplicationDescription(type?, answers?) {
  const cfg = APPLICATIONS[type];
  const blocks = [];
  for (const q of cfg.questions) {
    const answer = String(answers?.[q.id] || "Nessuna risposta").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim() || "Nessuna risposta";
    const question = String(q.text || "").replace(/^(\d+)\./, "$1\\.").trim();
    blocks.push(`**${question}**\n${answer}`);
  }
  return blocks.join("\n\n").trim();
}

const DISCORD_EMBED_DESC_MAX = 4096;
const DISCORD_MESSAGE_EMBEDS_MAX = 10;

function chunkStringForEmbedDescriptions(text?, maxChunk = DISCORD_EMBED_DESC_MAX) {
  const pieces = [];
  let rest = String(text || "");
  while (rest.length > 0) {
    if (rest.length <= maxChunk) {
      pieces.push(rest);
      break;
    }
    const window = rest.slice(0, maxChunk);
    let take = maxChunk;
    const lastBreak = window.lastIndexOf("\n");
    if (lastBreak > maxChunk * 0.45) take = lastBreak + 1;
    const part = rest.slice(0, take).replace(/\s+$/u, "");
    if (!part.length) {
      pieces.push(rest.slice(0, maxChunk));
      rest = rest.slice(maxChunk);
      continue;
    }
    pieces.push(part);
    rest = rest.slice(take);
  }
  return pieces;
}

function capChunksToMaxEmbeds(chunks?, maxEmbeds = DISCORD_MESSAGE_EMBEDS_MAX, maxChunk = DISCORD_EMBED_DESC_MAX) {
  if (chunks.length <= maxEmbeds) return chunks;
  const head = chunks.slice(0, maxEmbeds - 1);
  const tail = chunks.slice(maxEmbeds - 1).join("\n\n");
  const suffix = "\n\n… *(testo troncato: troppo lungo.)*";
  const room = maxChunk - suffix.length;
  let body = tail;
  if (body.length > room) body = `${body.slice(0, Math.max(0, room - 3))}...`;
  head.push(`${body}${suffix}`);
  return head;
}

async function resolveSubmissionChannel(guild?) {
  if (!guild) return null;
  const targetId = IDs.channels?.visioneModuli;
  if (targetId) {
    return guild.channels.cache.get(targetId) || (await getGuildChannelCached(guild, targetId));
  }
  return guild.channels.cache.find((c?) => String(c?.name || "") === "visioneModuli") || null;
}

async function postCandidatureToVisioneModuli(client?, guild?, user?, type?, answers?, stateKey?) {
  const cfg = APPLICATIONS[type];
  if (!cfg) return { ok: false, code: "send_failed" };

  const {
    isDiscordWorkflowUiEnabled,
    isDiscordWorkflowChannelPostsEnabled,
    buildInboxManageLinkRow,
    newSiteWorkflowMessageId,
  } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
  const discordPosts = isDiscordWorkflowChannelPostsEnabled();
  const discordUi = isDiscordWorkflowUiEnabled();

  const member =
    guild?.members?.cache?.get(user.id) ||
    (await guild.members.fetch(user.id).catch(() => null));
  const authorLike = member || user;
  const applicationNumber = await nextApplicationNumber(type);
  const fullText = formatApplicationDescription(type, answers);
  const descChunks = capChunksToMaxEmbeds(chunkStringForEmbedDescriptions(fullText));
  const bodyText = descChunks.join("\n\n");

  if (!discordPosts) {
    const messageId = newSiteWorkflowMessageId();
    try {
      const { persistCandidatureWorkflowFromPayload } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
      await persistCandidatureWorkflowFromPayload(guild, {
        messageId,
        channelId: "site",
        type,
        userId: user.id,
        status: "pending",
        title: `Candidatura ${cfg.label} (#${applicationNumber})`,
        body: bodyText,
        createdAt: new Date(),
      });
    } catch (_) {
      return { ok: false, code: "send_failed" };
    }
    const nextAllowedAt = Date.now() + APPLICATION_COOLDOWN_MS;
    await setCooldown(user.id, nextAllowedAt, type);
    if (stateKey) await clearDraftState(stateKey);
    try {
      const { notifyInboxStaffNewItem } = require("../../Web/siteStaffWorkflowNotifications") as typeof import("../../Web/siteStaffWorkflowNotifications");
      const subjectName =
        String(user?.globalName || user?.username || user?.tag || "").trim() || String(user.id);
      const typeLabel =
        applicationTypeLabel(type);
      void notifyInboxStaffNewItem({
        guild,
        queue: "candidature",
        subjectUserId: String(user.id),
        subjectName,
        title: "Nuova candidatura",
        body: `${subjectName} ha inviato una candidatura ${typeLabel}.`,
        messageId,
        dedupeKey: `inbox:candidature:new:${messageId}`,
      }).catch(() => 0);
    } catch (_) {}
    return { ok: true, nextAllowedAt, messageId };
  }

  const channel = await resolveSubmissionChannel(guild);
  if (!channel?.isTextBased?.()) {
    return { ok: false, code: "no_channel" };
  }

  const embeds = descChunks.map((chunk?, idx?) => {
    const e = new EmbedBuilder().setColor(APPLICATION_PENDING_COLOR);
    if (idx === 0) {
      e.setAuthor({
        name: accountUsername(authorLike),
        iconURL: guildMemberDisplayAvatarUrlDynamic(authorLike, { size: 128 }) || undefined,
      })
        .setTitle(`<:VC_Poll:1482535102436216832> CANDIDATURA ${cfg.label.toUpperCase()} (#${applicationNumber})`)
        .setDescription(chunk)
        .setFooter({
          text: `User ID: ${user.id}\u2022${new Date().toLocaleString("it-IT")}`,
        })
        .setTimestamp();
    } else {
      e.setTitle(`Candidatura · continua (${idx + 1}/${descChunks.length})`)
        .setDescription(chunk);
    }
    return e;
  });

  const highStaffRoleId = IDs.roles.HighStaff;
  const mention = highStaffRoleId ? `<@&${highStaffRoleId}>` : null;
  const actionComponents = discordUi
    ? [buildCandidateActionRow(type, user.id)]
    : [buildInboxManageLinkRow("candidature")];
  const sent = await channel.send({ content: mention || undefined, embeds, components: actionComponents, }).catch(() => null);
  if (!sent) {
    return { ok: false, code: "send_failed" };
  }

  if (discordUi && typeof sent.startThread === "function") {
    const threadUserLabel = String(user.globalName || user.username || user.id).replace(/[\r\n#:@<>`]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 70) || user.id;
    await sent.startThread({
      name: `Candidatura ${threadUserLabel}`,
      autoArchiveDuration: 1440,
      reason: `Thread candidatura ${cfg.label}per ${user.tag}`,
    })
      .catch(() => null);
  }

  if (discordUi && typeof sent.react === "function") {
    for (const emoji of APPLICATION_REACTIONS) {
      await sent.react(emoji).catch(() => { });
    }
  }

  const nextAllowedAt = Date.now() + APPLICATION_COOLDOWN_MS;
  await setCooldown(user.id, nextAllowedAt, type);
  if (stateKey) await clearDraftState(stateKey);

  try {
    const { persistCandidatureWorkflowFromMessage } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
    await persistCandidatureWorkflowFromMessage(guild, sent, type, user.id, "pending");
  } catch (_) {}
  try {
    const { notifyInboxStaffNewItem } = require("../../Web/siteStaffWorkflowNotifications") as typeof import("../../Web/siteStaffWorkflowNotifications");
    const subjectName = String(user?.globalName || user?.username || user?.tag || "").trim() || String(user.id);
    const typeLabel = applicationTypeLabel(type);
    void notifyInboxStaffNewItem({
      guild,
      queue: "candidature",
      subjectUserId: String(user.id),
      subjectName,
      title: "Nuova candidatura",
      body: `${subjectName} ha inviato una candidatura ${typeLabel}.`,
      messageId: String(sent?.id || ""),
      dedupeKey: `inbox:candidature:new:${sent?.id || user.id}`,
    }).catch(() => 0);
  } catch (_) {}

  return { ok: true, nextAllowedAt, messageId: String(sent?.id || "") };
}

function hasAnyRoleMember(member?, roleIds?) {
  const cache = member?.roles?.cache;
  if (!cache || typeof cache.has !== "function") return false;
  return roleIds.some((id?) => id && cache.has(id));
}

async function checkMemberCandidatureEligibility(member?, type?) {
  if (NOMODULI_ROLE_ID && hasAnyRoleMember(member, [NOMODULI_ROLE_ID])) {
    return { ok: false, code: "no_moduli", message: "Sei blacklistato dalle candidature." };
  }
  if (MEMBER_ROLE_ID && !hasAnyRoleMember(member, [MEMBER_ROLE_ID])) {
    return { ok: false, code: "no_member_role", message: "Le candidature sono disponibili solo agli utenti con ruolo Member." };
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRoleMember(member, [targetRoleId])) {
    const label = labelForStaffRoleId(targetRoleId, member);
    return {
      ok: false,
      code: "already_role",
      roleId: String(targetRoleId),
      roleLabel: label,
      message: alreadyRoleMessage(label),
    };
  }
  if (type === "helper" && hasAnyRoleMember(member, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    const blockingId =
      resolveHighestBlockingRoleId(member, HELPER_REAPPLY_BLOCK_ROLE_IDS) ||
      String(HELPER_ROLE_ID || IDs.roles.Staff || "").trim();
    const label = labelForStaffRoleId(blockingId, member);
    return {
      ok: false,
      code: "helper_blocked",
      roleId: blockingId || null,
      roleLabel: label,
      message: alreadyRoleMessage(label),
    };
  }
  const until = await getCooldownUntil(member.user.id, type);
  if (until) {
    return {
      ok: false,
      code: "cooldown",
      until,
      message: "Hai già inviato una candidatura di questo tipo di recente: attendi il cooldown.",
    };
  }
  return { ok: true };
}

async function resolveWebsiteCandidatureMember(client?, accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };
  }

  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  // Prefer OAuth guild-member (roles) — Discord bot member fetch often times out under load.
  // mobileApisFast2: keep OAuth budget short (phones + CGNAT retries).
  const oauthPromise = fetchOAuthGuildMemberResult(token, guildId, 2800);
  let meJson;
  try {
    const meRes = await fetchDiscordMe(token);
    if (!meRes.ok) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    meJson = await meRes.json();
  } catch (err) {
    const oauth = err && err.oauth && typeof err.oauth === "object" ? err.oauth : null;
    const oauthErr = String(oauth?.error || "").trim().toLowerCase();
    const oauthStatus = Number(oauth?.status) || 0;
    /* invalid/expired session is not a Discord outage — return 401, don't warn as unreachable */
    if (oauthErr === "invalid_token" || oauthErr === "missing_token" || oauthStatus === 401) {
      return {
        ok: false,
        status: 401,
        error: oauthErr || "invalid_token",
        message:
          String(oauth?.message || "").trim() ||
          "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    const now = Date.now();
    if (now - lastDiscordMeWarnAt > 60_000) {
      lastDiscordMeWarnAt = now;
      global.logger?.warn?.(
        "[candidature-site] Discord /users/@me timeout/unreachable:",
        oauthErr || err?.message || err,
      );
    }
    /* 503 not 502: Cloudflare replaces origin 502 with plain text (no JSON). */
    return {
      ok: false,
      status: 503,
      error: oauthErr === "discord_timeout" ? "discord_timeout" : "discord_unreachable",
      message:
        String(oauth?.message || "").trim() || "Impossibile contattare Discord. Riprova tra poco.",
    };
  }

  const userId = String(meJson?.id || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }

  const notInGuildPayload = {
    ok: false,
    status: 403,
    error: "not_in_guild",
    message: "Non sei nel server Discord: entra prima con lo stesso account con cui hai fatto login.",
    userId,
  };

  const guildPromise = ensureWebsiteGuild(client, guildId, 4000);
  let oauth = await oauthPromise;
  const guild = await guildPromise;

  let member = null;
  if (guild) {
    member = guild.members.cache.get(userId) || readCachedWebsiteMember(userId) || null;
  } else {
    member = readCachedWebsiteMember(userId) || null;
  }

  if (!member && oauth.json) {
    member = synthMemberFromOAuth(guild, meJson, oauth.json);
  }

  // mobileStaffFast1: one short bot fetch max — second 6s retry killed phones (appelli/staff/candidature).
  if (!member && guild && !oauth.notInGuild) {
    try {
      member = await fetchWebsiteGuildMember(guild, userId, { timeoutMs: 2200, retry: false, soft: true });
    } catch (err) {
      if (isUnknownMemberError(err)) {
        return notInGuildPayload;
      }
      const msg = String(err?.message || err || "");
      if (!/member_fetch_timeout/i.test(msg)) {
        global.logger?.warn?.("[candidature-site] member fetch failed:", msg || err);
      }
      member = null;
    }
  }

  if (!member && oauth.json) {
    member = synthMemberFromOAuth(guild, meJson, oauth.json);
  }

  if (!member && !oauth.notInGuild && !oauth.unreachable) {
    oauth = await fetchOAuthGuildMemberResult(token, guildId, 1800);
    if (oauth.json) {
      member = synthMemberFromOAuth(guild, meJson, oauth.json);
    }
  }

  if (!member && oauth.notInGuild) {
    return notInGuildPayload;
  }

  if (!member) {
    return {
      ok: false,
      status: 503,
      error: "member_fetch_failed",
      message: "Verifica temporaneamente non disponibile. Riprova tra poco.",
      userId,
    };
  }
  writeCachedWebsiteMember(userId, member);

  return { ok: true, userId, member, guild: guild || member.guild || null };
}

async function getCandidatureEligibilitySummary(client?, accessToken?) {
  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) {
    if (resolved.error === "not_in_guild" && resolved.userId) {
      const msg = resolved.message;
      return {
        ok: true,
        status: 200,
        userId: resolved.userId,
        inGuild: false,
        helper: { eligible: false, code: "not_in_guild", message: msg },
        partnermanager: { eligible: false, code: "not_in_guild", message: msg },
        blogger: { eligible: false, code: "not_in_guild", message: msg },
      };
    }
    return resolved;
  }

  const { member, userId }: any = resolved;
  const helperRes = await checkMemberCandidatureEligibility(member, "helper");
  const pmRes = await checkMemberCandidatureEligibility(member, "partnermanager");
  const bloggerRes = await checkMemberCandidatureEligibility(member, "blogger");
  const pack = (e?) =>
    e.ok
      ? { eligible: true }
      : {
          eligible: false,
          code: e.code,
          message: e.message,
          ...(e.roleId ? { roleId: e.roleId } : {}),
          ...(e.roleLabel ? { roleLabel: e.roleLabel } : {}),
          ...(e.until ? { cooldown_until_ms: e.until } : {}),
        };

  return {
    ok: true,
    status: 200,
    userId,
    inGuild: true,
    noModuliBlocked: Boolean(NOMODULI_ROLE_ID && hasAnyRoleMember(member, [NOMODULI_ROLE_ID])),
    helper: pack(helperRes),
    partnermanager: pack(pmRes),
    blogger: pack(bloggerRes),
  };
}

async function submitCandidatureWebsite(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const typeRaw = String(payload?.type || "").trim().toLowerCase();
  const type = normalizeApplicationType(typeRaw);
  const answersIn = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};

  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, error: resolved.error, message: resolved.message };
  }

  const { member, userId, guild }: any = resolved;

  const eligibility = await checkMemberCandidatureEligibility(member, type);
  if (!eligibility.ok) {
    return {
      ok: false,
      status: 403,
      error: eligibility.code,
      message: eligibility.message,
      ...(eligibility.until ? { cooldown_until_ms: eligibility.until } : {}),
    };
  }

  const cfg = APPLICATIONS[type];
  const mergedAnswers = { ...answersIn, id_discord: userId };
  for (const q of cfg.questions) {
    const v = String(mergedAnswers[q.id] || "").trim();
    if (!v) {
      const label = findQuestionLabel(type, q.id);
      return {
        ok: false,
        status: 400,
        error: "incomplete",
        field: q.id,
        message: `Compila tutti i campi del modulo. Manca: ${label}`,
      };
    }
  }

  const discordUser = await client.users.fetch(userId).catch(() => null);
  if (!discordUser) {
    return { ok: false, status: 500, error: "user_fetch_failed", message: "Impossibile caricare il profilo Discord." };
  }

  const stateKey = `${guild.id}:${userId}:${type}`;
  const post = await postCandidatureToVisioneModuli(client, guild, discordUser, type, mergedAnswers, stateKey);
  if (!post.ok) {
    const message =
      post.code === "no_channel"
        ? "Canale visioneModuli non disponibile: contatta lo staff."
        : "Invio candidatura fallito: riprova più tardi.";
    return { ok: false, status: 500, error: post.code, message };
  }

  return {
    ok: true,
    status: 200,
    message: buildFinalThanksPlainMessage(post.nextAllowedAt, type),
    cooldown_until_ms: post.nextAllowedAt,
  };
}

async function sendCandidatePexWelcome(guild?, member?, targetRoleId?) {
  try {
    if (String(targetRoleId) === String(HELPER_ROLE_ID)) {
      const staffChat =
        guild.channels.cache.get(IDs.channels.staffChat) ||
        (await getGuildChannelCached(guild, IDs.channels.staffChat));
      await sendHelperWelcome(staffChat, member);
      return;
    }
    if (String(targetRoleId) === String(PARTNER_MANAGER_ROLE_ID)) {
      await sendPartnerManagerWelcome(guild.client, member);
    }
  } catch (err) {
    global.logger?.warn?.("[candidature] welcome failed:", err?.message || err);
  }
}

async function sendCandidatePexLog(guild?, member?, targetRoleId?, roleBeforeId?, reason?) {
    const { sendPexDepexLog } = require("./resocontoHandlers") as typeof import("./resocontoHandlers");
  await sendPexDepexLog(
    guild,
    "pex",
    member.user || member,
    roleBeforeId,
    targetRoleId,
    reason,
  ).catch((err?) => {
    global.logger?.warn?.("[candidature] pex log failed:", err?.message || err);
  });
}

async function completeCandidatePexAfterRole(guild?, member?, type?, reason?, sourceMessage?, opts: Record<string, any> = {}) {
  const targetRoleId = getTargetRoleIdByType(normalizeApplicationType(type));
  const roleBeforeId = String(IDs.roles.Member || "");
  const recovery = Boolean(opts.recovery);

  if (!recovery) {
    const profileDoc = await getOrCreateStaffDoc(guild.id, member.id);
    const s = ensureStaff(profileDoc);
    if (!Array.isArray(s.rolesHistory)) s.rolesHistory = [];
    s.rolesHistory.push({
      oldRole: roleBeforeId,
      newRole: String(targetRoleId),
      reason: String(reason || "").trim(),
      date: new Date(),
    });
    profileDoc.markModified("staff");
    await profileDoc.save();
    await clearStaffPendingPurgeAt(guild.id, member.id);
  }

  await sendCandidatePexLog(guild, member, targetRoleId, roleBeforeId, reason);
  try {
    const { notifyStaffPexDepex, memberDisplayName } = require("../../Web/siteStaffEventNotifications") as typeof import("../../Web/siteStaffEventNotifications");
    void notifyStaffPexDepex({
      guild,
      kind: "pex",
      targetUserId: member.id,
      targetName: memberDisplayName(member, member.user, member.id),
      oldRoleId: roleBeforeId,
      newRoleId: String(targetRoleId),
      reason: String(reason || "").trim(),
      actorUserId: String(opts.decidedBy || ""),
      actorName: String(opts.decidedByName || "Staff").trim(),
      sourceHint: `candidature-pex:${member.id}:${String(sourceMessage?.id || "")}`,
    }).catch(() => 0);
  } catch (_) {}
  await sendCandidatePexWelcome(guild, member, targetRoleId);

  if (sourceMessage) {
    await setApplicationMessageStatusColor(
      sourceMessage,
      APPLICATION_ACCEPTED_COLOR,
      String(opts.decidedBy || ""),
      String(opts.decidedByName || ""),
    );
    await deleteThreadForMessage(guild, sourceMessage);
  }

  try {
    const { enqueueSiteInAppNotification } = require("../../Web/siteInAppNotificationsService") as typeof import("../../Web/siteInAppNotificationsService");
    const label = applicationTypeLabel(type);
    const msgId = String(sourceMessage?.id || "");
    const openUrl = msgId
      ? `/candidature/?chat=${encodeURIComponent(`candidature:${msgId}`)}`
      : "/candidature/";
    await enqueueSiteInAppNotification({
      guildId: guild.id,
      userId: member.id,
      title: recovery ? "Candidatura accettata (recupero)" : "Candidatura accettata",
      body:
        normalizeApplicationType(type) === "blogger"
          ? `La tua candidatura è stata accettata: ora sei ${label}.`
          : `La tua candidatura è stata accettata: ora hai accesso come ${label}. Controlla i messaggi di benvenuto inviati nello staff.`,
      kind: "workflow_decision",
      channel: "personal",
      openUrl,
      dedupeKey: `cand-pex-${type}-${member.id}-${msgId}${recovery ? "-recovery" : ""}`,
      dedupeWindowMs: 86_400_000,
      replaceDedupe: true,
    });
  } catch (_) {}
}

async function applyCandidatePex(guild?, actor?, type?, userId?, reason?, sourceMessage?) {
  const targetRoleId = getTargetRoleIdByType(normalizeApplicationType(type));
  if (!targetRoleId) return "Ruolo target non configurato.";

  const member = guild.members.cache.get(String(userId)) || (await getGuildMemberCached(guild, String(userId)));
  if (!member) return "Utente non trovato nel server.";
  if (member.roles.cache.has(String(targetRoleId))) {
  await completeCandidatePexAfterRole(guild, member, type, reason, sourceMessage, {
    recovery: true,
    decidedBy: String(actor?.id || actor || ""),
    decidedByName: String(actor?.displayName || actor?.username || actor?.globalName || ""),
  });
    return `Utente già pexato su quel ruolo: ho reinviato pex e benvenuto.`;
  }

  const roleApplied = await member.roles
    .add(String(targetRoleId))
    .then(() => true)
    .catch(() => false);
  if (!roleApplied) {
    const refreshedMember = await getGuildMemberCached(guild, String(userId), {
      preferFresh: true,
    }).catch(() => null);
    if (!refreshedMember?.roles?.cache?.has(String(targetRoleId))) {
      return "Impossibile assegnare il ruolo target.";
    }
  }
  if (String(targetRoleId) === String(HELPER_ROLE_ID)) {
    const staffRoleApplied = await member.roles
      .add(String(IDs.roles.Staff))
      .then(() => true)
      .catch(() => false);
    if (!staffRoleApplied) {
      const refreshedMember = await getGuildMemberCached(guild, String(userId), {
        preferFresh: true,
      }).catch(() => null);
      if (!refreshedMember?.roles?.cache?.has(String(IDs.roles.Staff))) {
        return "Ruolo Helper assegnato, ma non sono riuscito ad aggiungere il ruolo Staff.";
      }
    }
  }

  await completeCandidatePexAfterRole(guild, member, type, reason, sourceMessage, {
    decidedBy: String(actor?.id || actor || ""),
    decidedByName: String(actor?.displayName || actor?.username || actor?.globalName || ""),
  });
  return `Pex completato per <@${member.id}>.`;
}

function parseCandidatePexCustomId(customId?) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${APPLY_PEX_PREFIX}:`)) return null;
  const [, type, userId] = raw.split(":");
  if (!APPLICATION_TYPES.includes(String(type || ""))) return null;
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  return { type: String(type), userId: String(userId) };
}

function parseCandidatePexModalId(customId?) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${APPLY_PEX_MODAL_PREFIX}:`)) return null;
  const [, type, userId, messageId] = raw.split(":");
  if (!APPLICATION_TYPES.includes(String(type || ""))) return null;
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  if (!/^\d{16,20}$/.test(String(messageId || ""))) return null;
  return { type: String(type), userId: String(userId), messageId: String(messageId) };
}

function isVisioneModuliChannelOrThread(interaction?) {
  const vid = String(IDs.channels?.visioneModuli || "").trim();
  if (!vid) return false;
  const cid = String(interaction.channelId || "");
  if (cid === vid) return true;
  const parentId = interaction.channel?.parentId != null ? String(interaction.channel.parentId) : "";
  return parentId === vid;
}

async function executeCandidatePexInteraction(interaction?, parsed?, reason?) {
  const pexLockKey = `${String(interaction.guildId || "dm")}:${String(parsed.messageId)}`;
  if (candidatePexLocks.has(pexLockKey)) {
    await interaction.reply({
      content:
        "<a:VC_Cross:1482532424570376253> Questa candidatura è già in elaborazione.",
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  candidatePexLocks.add(pexLockKey);
  try {
    const sendPexModalReply = async (payload?) => {
      const base = { ...(payload || {}) };
      if (base.flags == null) base.flags = 1 << 6;
      if (interaction.deferred || interaction.replied) {
        const editPayload = { ...base };
        delete editPayload.flags;
        await interaction.editReply(editPayload).catch(async () => {
          await interaction.followUp(base).catch(() => null);
        });
        return;
      }
      await interaction.reply(base).catch(() => null);
    };
    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      await sendPexModalReply({
        content: "<a:VC_Cross:1482532424570376253> Devi inserire un motivo valido.",
      });
      return true;
    }
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 1 << 6 }).catch(() => null);
    }
    const srcMessage = await interaction.channel?.messages?.fetch(parsed.messageId).catch(() => null);
    const status = await applyCandidatePex(
      interaction.guild,
      interaction.user,
      parsed.type,
      parsed.userId,
      trimmedReason,
      srcMessage,
    );
    await sendPexModalReply({
      content: status,
    });
    return true;
  } finally {
    candidatePexLocks.delete(pexLockKey);
  }
}

function memberHasCandidatureReviewAccess(member?, guild?) {
  const userId = String(member?.id || "").trim();
  const ownerId = String(guild?.ownerId || "").trim();
  if (userId && ownerId && userId === ownerId) return true;
  if (!member?.roles?.cache) return false;
  const allowed = [IDs.roles?.Admin, IDs.roles?.Manager, IDs.roles?.Founder, IDs.roles?.Director]
    .filter(Boolean)
    .map((id?) => String(id));
  return allowed.some((roleId?) => member.roles.cache.has(roleId));
}

function parseCandidateTypeFromMessage(message?) {
  const rows = message?.components || [];
  for (const row of rows) {
    for (const comp of row?.components || []) {
      const id = String(comp?.customId || "");
      if (id.startsWith(`${APPLY_PEX_PREFIX}:`)) {
        const [, type, userId] = id.split(":");
        if (APPLICATION_TYPES.includes(String(type || "")) && /^\d{16,20}$/.test(String(userId || ""))) {
          return { type: String(type), userId: String(userId) };
        }
      }
    }
  }
  const title = String(message?.embeds?.[0]?.title || "");
  if (/partner\s*manager/i.test(title)) return { type: "partnermanager", userId: parseUserIdFromEmbedFooter(message) };
  if (/blogger/i.test(title)) return { type: "blogger", userId: parseUserIdFromEmbedFooter(message) };
  if (/helper/i.test(title)) return { type: "helper", userId: parseUserIdFromEmbedFooter(message) };
  return null;
}

function parseUserIdFromEmbedFooter(message?) {
  const footer = String(message?.embeds?.[0]?.footer?.text || "");
  const m = footer.match(/User ID:\s*(\d{16,20})/i);
  return m ? String(m[1]) : "";
}

function messageHasPendingCandidatureButtons(message?) {
  const rows = message?.components || [];
  for (const row of rows) {
    for (const comp of row?.components || []) {
      const id = String(comp?.customId || "");
      if (id.startsWith(`${APPLY_PEX_PREFIX}:`)) return true;
    }
  }
  return false;
}

function deriveCandidatureStatus(message?) {
  if (messageHasPendingCandidatureButtons(message)) return "pending";
  const color = Number(message?.embeds?.[0]?.color ?? 0);
  if (color === 0x2ecc71) return "accepted";
  if (color === 0xed4245) return "rejected";
  return "closed";
}

function embedFieldsToPlain(embed?) {
  const fields = Array.isArray(embed?.fields) ? embed.fields : [];
  return fields
    .map((field?) => ({
      name: String(field?.name || "").trim(),
      value: stripDiscordDecorations(field?.value || ""),
    }))
    .filter((field?) => field.name || field.value);
}

async function listCandidatureApplications(guild?, opts: Record<string, any> = {}) {
  const scope = String(opts.scope || "all").toLowerCase();
  const limit = Math.min(100, Math.max(1, Number(opts.limit) || 60));
  const channel = await resolveSubmissionChannel(guild);
  if (!channel?.messages?.fetch) return [];
  const fetchLimit = scope === "all" ? 100 : 50;
  const fetched = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
  if (!fetched) return [];
  const items = [];
  for (const msg of fetched.values()) {
    const parsed = parseCandidateTypeFromMessage(msg);
    if (!parsed?.userId) continue;
    const status = deriveCandidatureStatus(msg);
    if (scope === "pending" && status !== "pending") continue;
    const embed = msg.embeds?.[0];
    items.push({
      messageId: String(msg.id),
      channelId: String(msg.channelId || channel.id),
      type: parsed.type,
      userId: parsed.userId,
      title: String(embed?.title || "Candidatura").trim(),
      preview: stripDiscordDecorations(String(embed?.description || "")).slice(0, 400),
      createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
      status,
      canAct: status === "pending",
    });
  }
  return items.sort((a?, b?) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))).slice(0, limit);
}

async function listPendingCandidatureApplications(guild?) {
  return listCandidatureApplications(guild, { scope: "pending" });
}

function embedDescriptionsJoined(message?) {
  const embeds = Array.isArray(message?.embeds) ? message.embeds : [];
  return embeds
    .map((embed?) => String(embed?.description || "").trim())
    .filter(Boolean)
    .join("\n\n");
}

function stripDiscordDecorationsKeepNewlines(text?) {
  return String(text || "")
    .replace(/[\u0000-\u001F\u007F\uFFFD]/g, (ch?) => (ch === "\n" || ch === "\t" ? ch : ""))
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    .replace(/<a?:[\w~-]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>])/g, "$1")
    .replace(/\*\*\*(.+?)\*\*\*/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\|\|(.+?)\|\|/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/[*_`~|]+/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function getCandidatureApplicationDetail(guild?, messageId?) {
  const channel = await resolveSubmissionChannel(guild);
  const msg = channel ? await channel.messages.fetch(String(messageId)).catch(() => null) : null;
  if (!msg) return null;
  const parsed = parseCandidateTypeFromMessage(msg);
  if (!parsed?.userId) return null;
  const embed = msg.embeds?.[0];
  const status = deriveCandidatureStatus(msg);
  const fullBody = embedDescriptionsJoined(msg) || String(embed?.description || "");
  const body = stripDiscordDecorationsKeepNewlines(fullBody);
  return {
    messageId: String(msg.id),
    channelId: String(msg.channelId || channel.id),
    type: parsed.type,
    userId: parsed.userId,
    title: String(embed?.title || "Candidatura").trim(),
    body,
    preview: stripDiscordDecorations(body).slice(0, 400),
    fields: embedFieldsToPlain(embed),
    createdAt: msg.createdAt ? msg.createdAt.toISOString() : null,
    status,
    canAct: status === "pending",
  };
}

async function resolveCandidatureBoundFromStore(guildId?, messageId?, type?, userId?) {
  let boundType = String(type || "")
    .trim()
    .toLowerCase();
  let boundUserId = String(userId || "").trim();
  if (boundUserId && APPLICATION_TYPES.includes(boundType)) {
    return { boundType, boundUserId };
  }
  try {
    const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
    const mid = String(messageId || "").trim();
    if (!mid || !guildId) return { boundType, boundUserId };
    const bare = mid.includes(":") ? mid.split(":").slice(1).join(":") : mid;
    const dedupeKey = mid.startsWith("candidature:") ? mid : `candidature:${bare}`;
    const doc = await SiteDocument.findOne({
      docType: SITE_DOCUMENT_TYPE.STAFF_WORKFLOW,
      guildId: String(guildId),
      workflowQueue: "candidature",
      $or: [{ dedupeKey }, { workflowMessageId: bare }, { workflowMessageId: mid }],
    })
      .select({ workflowType: 1, userId: 1 })
      .lean()
      .catch(() => null);
    if (doc) {
      if (!boundType) boundType = String(doc.workflowType || "").trim().toLowerCase();
      if (!boundUserId) boundUserId = String(doc.userId || "").trim();
    }
  } catch (_) {}
  return { boundType, boundUserId };
}

async function webRejectCandidateApplication(guild?, actorMember?, messageId?, type?, userId?) {
  if (!memberHasCandidatureReviewAccess(actorMember, guild)) {
    return { ok: false, status: 403, message: "Non hai i permessi per rifiutare candidature." };
  }
  const decidedBy = String(actorMember?.id || "");
  const decidedByName = String(
    actorMember?.displayName || actorMember?.user?.globalName || actorMember?.user?.username || "",
  );
  /* candidatureSiteAccept1: candidature dal sito hanno messageId non-snowflake (channelId=site). */
  const mid = String(messageId || "").trim();
  const isDiscordMsgId = /^\d{16,22}$/.test(mid);
  const channel = isDiscordMsgId ? await resolveSubmissionChannel(guild) : null;
  const msg = channel ? await channel.messages.fetch(mid).catch(() => null) : null;
  const bound = msg ? parseCandidateTypeFromMessage(msg) : null;
  let boundType = String(bound?.type || type || "")
    .trim()
    .toLowerCase();
  let boundUserId = String(bound?.userId || userId || "").trim();
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    const fromStore = await resolveCandidatureBoundFromStore(guild.id, mid, boundType, boundUserId);
    boundType = fromStore.boundType;
    boundUserId = fromStore.boundUserId;
  }
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    return { ok: false, status: 400, message: "Candidatura non trovata o dati incompleti (type/userId)." };
  }
  if (msg) {
    await setApplicationMessageStatusColor(msg, APPLICATION_REJECTED_COLOR, decidedBy, decidedByName);
    await deleteThreadForMessage(guild, msg);
  }
  /* notifCandRejectClear1: sempre workflow + purge inbox staff (come accept) */
  try {
    const { updateStaffWorkflowFromMessage } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
    await updateStaffWorkflowFromMessage(guild.id, "candidature", String(messageId), "rejected", {
      decidedBy,
      decidedByName,
    });
  } catch (_) {}
  try {
    const {
      clearWorkflowLifecycleNotifs,
      inboxOpenUrl,
    } = require("../../Web/siteStaffWorkflowNotifications") as typeof import("../../Web/siteStaffWorkflowNotifications");
    const { removeSiteInAppNotificationsMatching } = require("../../Web/siteInAppNotificationsService") as typeof import("../../Web/siteInAppNotificationsService");
    const mid = String(messageId || "").trim();
    const openUrls = mid ? [inboxOpenUrl("candidature", mid)] : [];
    await clearWorkflowLifecycleNotifs({
      workflowQueue: "candidature",
      dedupeKey: mid,
      userId: boundUserId,
    }).catch(() => null);
    if (mid) {
      await removeSiteInAppNotificationsMatching({
        exactKeys: [`inbox:candidature:new:${mid}`],
        openUrls,
        forceDismiss: true,
      }).catch(() => null);
    }
  } catch (_) {}
  const rejType = boundType;
  const rejUid = boundUserId;
  if (rejUid && APPLICATION_TYPES.includes(rejType)) {
    try {
      const { enqueueSiteInAppNotification } = require("../../Web/siteInAppNotificationsService") as typeof import("../../Web/siteInAppNotificationsService");
      const label = applicationTypeLabel(rejType);
      const mid = String(messageId || "");
      const openUrl = mid
        ? `/candidature/?chat=${encodeURIComponent(`candidature:${mid}`)}`
        : "/candidature/";
      await enqueueSiteInAppNotification({
        guildId: guild.id,
        userId: rejUid,
        title: "Candidatura rifiutata",
        body: `La tua candidatura per ${label} non è stata accettata. Puoi inviare una nuova richiesta dopo il cooldown indicato sul sito.`,
        kind: "workflow_decision",
        channel: "personal",
        openUrl,
        dedupeKey: `cand-rej-${rejType}-${rejUid}-${messageId}`,
        dedupeWindowMs: 86_400_000,
        replaceDedupe: true,
      });
    } catch (_) {}
  }
  return { ok: true, status: 200, message: "Candidatura rifiutata." };
}

async function webAcceptCandidateApplication(guild?, actorMember?, messageId?, type?, userId?, reason?) {
  if (!memberHasCandidatureReviewAccess(actorMember, guild)) {
    return { ok: false, status: 403, message: "Non hai i permessi per accettare candidature." };
  }
  const trimmedReason = String(reason || "").trim() || WEB_ACCEPT_PEX_REASON;
  const decidedBy = String(actorMember?.id || "");
  const decidedByName = String(
    actorMember?.displayName || actorMember?.user?.globalName || actorMember?.user?.username || "",
  );
  /* candidatureSiteAccept1: candidature dal sito → niente messaggio Discord; usa type/userId body (+ store). */
  const mid = String(messageId || "").trim();
  const isDiscordMsgId = /^\d{16,22}$/.test(mid);
  const channel = isDiscordMsgId ? await resolveSubmissionChannel(guild) : null;
  const msg = channel ? await channel.messages.fetch(mid).catch(() => null) : null;
  const bound = msg ? parseCandidateTypeFromMessage(msg) : null;
  let boundType = String(bound?.type || type || "")
    .trim()
    .toLowerCase();
  let boundUserId = String(bound?.userId || userId || "").trim();
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    const fromStore = await resolveCandidatureBoundFromStore(guild.id, mid, boundType, boundUserId);
    boundType = fromStore.boundType;
    boundUserId = fromStore.boundUserId;
  }
  if (!boundUserId || !APPLICATION_TYPES.includes(boundType)) {
    return { ok: false, status: 400, message: "Candidatura non trovata o dati incompleti (type/userId)." };
  }
  /* Se c’è messaggio Discord, preferisci i dati parsati; altrimenti body/store (sito). */
  const status = await applyCandidatePex(guild, actorMember, boundType, boundUserId, trimmedReason, msg);
  const ok = !String(status || "").toLowerCase().includes("impossibile") && !String(status || "").toLowerCase().includes("non trovato");
  if (ok) {
    try {
      const { updateStaffWorkflowFromMessage } = require("../../Web/siteStaffWorkflowStore") as typeof import("../../Web/siteStaffWorkflowStore");
      await updateStaffWorkflowFromMessage(guild.id, "candidature", String(messageId), "accepted", {
        decidedBy,
        decidedByName,
      });
    } catch (_) {}
  }
  return {
    ok,
    status: ok ? 200 : 400,
    message: stripDiscordDecorations(status) || (ok ? "Candidatura accettata." : "Operazione non riuscita."),
  };
}

function stripDiscordDecorations(text?) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export = {
  submitCandidatureWebsite,
  getCandidatureEligibilitySummary,
  resolveWebsiteCandidatureMember,
  resolveSubmissionChannel,
  bumpApplicationCooldownAfterStaffDepex,
  memberHasCandidatureReviewAccess,
  parseCandidateTypeFromMessage,
  listCandidatureApplications,
  listPendingCandidatureApplications,
  getCandidatureApplicationDetail,
  webRejectCandidateApplication,
  webAcceptCandidateApplication,
};
