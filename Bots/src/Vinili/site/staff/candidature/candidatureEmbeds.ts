const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getGuildChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { TENANT_EMBED_COLOR } = require("../../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../../MultiGuild/utils/tenantEmbedBranding");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { getBotState, setBotState } = require("../../../../shared/botState/botStateStore") as typeof import("../../../../shared/botState/botStateStore");
const { normalizeApplicationType, cooldownByUserAndType, cooldownStorageKey, loadCooldownMap, persistCooldownMap } = require("./candidatureEligibility") as typeof import("./candidatureEligibility");
const { HELPER_QUESTIONS, PARTNER_MANAGER_QUESTIONS, BLOGGER_QUESTIONS } = require("../../../Community/utils/candidatureApplicationsCatalog") as typeof import("../../../Community/utils/candidatureApplicationsCatalog");
const APPLY_PEX_PREFIX = "apply_pex";
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const APPLICATION_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;
const APPLICATION_PENDING_COLOR = TENANT_EMBED_COLOR;
const APPLICATION_ACCEPTED_COLOR = "#2ECC71";
const APPLICATION_TYPE_LABELS = { helper: "Helper", partnermanager: "Partner Manager", blogger: "Blogger" };

function applicationTypeLabel(type?) {
  return APPLICATION_TYPE_LABELS[normalizeApplicationType(type)];
}

let countersLoaded = false;
let draftsLoaded = false;
const draftByStateKey = new Map();
const applicationCounters = { helper: 0, partnermanager: 0, blogger: 0, };

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

async function clearDraftState(stateKey?) {
  await loadDraftMap();
  if (!draftByStateKey.has(stateKey)) return;
  draftByStateKey.delete(stateKey);
  await persistDraftMap();
}

async function setCooldown(userId?, untilTs?, type?) {
  await loadCooldownMap();
  cooldownByUserAndType.set(cooldownStorageKey(userId, type), Number(untilTs));
  await persistCooldownMap();
}

/* tolta per sbaglio nel commit del 31/10 ma ancora usata dall'invio della candidatura dal sito */
function buildFinalThanksPlainMessage(untilTs?, type?) {
  const label = applicationTypeLabel(type);
  const ms = Number(untilTs);
  const hasDate = Number.isFinite(ms) && ms > 0;
  const untilText = hasDate
    ? new Date(ms).toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : null;
  return [
    "Grazie per esserti candidato.",
    untilText
      ? `Per un'altra candidatura ${label} dovrai attendere fino al ${untilText}.`
      : `Per un'altra candidatura ${label} dovrai attendere il tempo di cooldown previsto.`,
    "Puoi comunque candidarti all'altro ruolo se non l'hai già fatto.",
    "Non chiedere l'esito o di guardare la candidatura in qualsiasi modo, altrimenti essa verrà automaticamente scartata.",
  ].join(" ");
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
    const { updateStaffWorkflowFromMessage } = require("../../workflow/siteStaffWorkflowStore") as typeof import("../../workflow/siteStaffWorkflowStore");
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

  const { newSiteWorkflowMessageId } = require("../../http/discordWorkflowUiGate") as typeof import("../../http/discordWorkflowUiGate");
  const applicationNumber = await nextApplicationNumber(type);
  const fullText = formatApplicationDescription(type, answers);
  const descChunks = capChunksToMaxEmbeds(chunkStringForEmbedDescriptions(fullText));
  const bodyText = descChunks.join("\n\n");

  /* Solo sito: niente post Discord / redirect. */
  const messageId = newSiteWorkflowMessageId();
  try {
    const { persistCandidatureWorkflowFromPayload } = require("../../workflow/siteStaffWorkflowStore") as typeof import("../../workflow/siteStaffWorkflowStore");
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
    const { notifyInboxStaffNewItem } = require("../../workflow/siteStaffWorkflowNotifications") as typeof import("../../workflow/siteStaffWorkflowNotifications");
    const subjectName =
      String(user?.globalName || user?.username || user?.tag || "").trim() || String(user.id);
    const typeLabel = applicationTypeLabel(type);
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

export = { APPLY_PEX_PREFIX, DRAFT_TTL_MS, APPLICATION_COOLDOWN_MS, APPLICATION_ACCEPTED_COLOR, applicationTypeLabel, draftByStateKey, APPLICATIONS, persistDraftMap, buildFinalThanksPlainMessage, setApplicationMessageStatusColor, resolveSubmissionChannel, postCandidatureToVisioneModuli };
