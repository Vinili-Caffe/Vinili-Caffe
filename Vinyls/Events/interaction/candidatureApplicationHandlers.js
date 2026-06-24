const path = require("path");
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { getOrCreateStaffDoc, deleteThreadForMessage, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { scheduleStaffListRefresh } = require("../../Utils/Community/staffListUtils");
const { getStaffRoleEmojiByRoleId } = require("../../Utils/Community/staffRoleEmoji");
const { clearStaffPendingPurgeAt } = require("../../Services/Community/userLeaveBackupService");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { sendPartnerManagerWelcome, sendHelperWelcome } = require("../../Utils/Staff/staffWelcomeMessages");
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
const VISIONE_MODULI_AUTO_PEX_REASON = "Candidatura accettata";
const STATE_TTL_MS = 30 * 60 * 1000;
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const APPLICATION_COOLDOWN_MS = 15 * 24 * 60 * 60 * 1000;
const APPLICATION_REACTIONS = ["<:thumbsup:1471292172145004768>", "<:thumbsdown:1471292163957457013>",];
const APPLICATION_PENDING_COLOR = "#6f4e37";
const APPLICATION_ACCEPTED_COLOR = "#2ECC71";
const APPLICATION_REJECTED_COLOR = "#ED4245";
const NOMODULI_ROLE_ID = IDs.roles.blacklistModuli;
const MEMBER_ROLE_ID = IDs.roles.Member;
const HELPER_ROLE_ID = IDs.roles.Helper;
const PARTNER_MANAGER_ROLE_ID = IDs.roles.PartnerManager;
const HELPER_REAPPLY_BLOCK_ROLE_IDS = [IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.HighStaff, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Founder].filter(Boolean);
const pendingApplications = new Map();
const cooldownByUserAndType = new Map();
let cooldownLoaded = false;
let countersLoaded = false;
let draftsLoaded = false;
const WEBSITE_AUTH_TIMEOUT_MS = 7000;

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label || "operation"}_timeout`)), timeoutMs);
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function fetchDiscordMe(accessToken) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WEBSITE_AUTH_TIMEOUT_MS);
  try {
    return await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function cooldownTypeKey(type) {
  return type === "partnermanager" ? "partnermanager" : "helper";
}
function cooldownStorageKey(userId, type) {
  return `${String(userId || "")}:${cooldownTypeKey(type)}`;
}
const draftByStateKey = new Map();
const candidatePexLocks = new Set();
const applicationCounters = { helper: 0, partnermanager: 0, };
const {
  HELPER_QUESTIONS,
  PARTNER_MANAGER_QUESTIONS,
  choicePlaceholder,
  findQuestionLabel,
} = require("../../Utils/Community/candidatureApplicationsCatalog");

function catalogToDiscordQuestion(q) {
  const kind = String(q.kind || "paragraph").toLowerCase();
  const base = {
    id: q.id,
    text: q.text,
    modalLabel: q.modalLabel || q.text,
    placeholder: q.placeholder || "",
  };
  if (kind === "short") {
    return { ...base, style: TextInputStyle.Short };
  }
  if (kind === "choice" || kind === "multi_choice") {
    return {
      ...base,
      style: kind === "choice" ? TextInputStyle.Short : TextInputStyle.Paragraph,
      placeholder: choicePlaceholder(q),
    };
  }
  return { ...base, style: TextInputStyle.Paragraph };
}

const APPLICATIONS = {
  helper: {
    label: "Helper",
    questions: HELPER_QUESTIONS.map(catalogToDiscordQuestion),
  },
  partnermanager: {
    label: "Partner Manager",
    questions: PARTNER_MANAGER_QUESTIONS.map(catalogToDiscordQuestion),
  },
};

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
        for (const t of ["helper", "partnermanager"]) {
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
  const out = {};
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
    }
  } catch (err) {
    global.logger?.warn?.("[candidature] load counters:", err?.message || err);
  }
}

async function persistApplicationCounters() {
  await setBotState("applicationCounters", { ...applicationCounters });
}

async function nextApplicationNumber(type) {
  await loadApplicationCounters();
  const key = type === "partnermanager" ? "partnermanager" : "helper";
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
  const out = {};
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

async function setDraftState(stateKey, answers, nextStep) {
  await loadDraftMap();
  draftByStateKey.set(stateKey, {
    answers: answers && typeof answers === "object" ? answers : {},
    nextStep: Math.max(1, Math.floor(Number(nextStep) || 1)),
    updatedAt: Date.now(),
  });
  await persistDraftMap();
}

async function getDraftState(stateKey) {
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

async function clearDraftState(stateKey) {
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

function splitQuestions(questions, chunkSize = 4) {
  const chunks = [];
  for (let i = 0; i < questions.length; i += chunkSize) {
    chunks.push(questions.slice(i, i + chunkSize));
  }
  return chunks;
}

function getStateKey(interaction, type) {
  return `${interaction.guildId || "dm"}:${interaction.user?.id || "unknown"}:${type}`;
}

function getRoleCache(interaction) {
  const cache = interaction?.member?.roles?.cache;
  return cache && typeof cache.has === "function" ? cache : null;
}

function hasAnyRole(interaction, roleIds) {
  const cache = getRoleCache(interaction);
  if (!cache) return false;
  return roleIds.some((id) => cache.has(id));
}

function getHighestRoleId(interaction, roleIds) {
  const cache = getRoleCache(interaction);
  if (!cache || !Array.isArray(roleIds) || roleIds.length === 0) return null;
  const roles = roleIds.map((id) => cache.get(id)).filter(Boolean).sort((a, b) => Number(b.position || 0) - Number(a.position || 0));
  return roles[0]?.id || null;
}

function hasMemberRole(interaction) {
  if (!MEMBER_ROLE_ID) return true;
  return hasAnyRole(interaction, [MEMBER_ROLE_ID]);
}

function hasNoModuliRole(interaction) {
  if (!NOMODULI_ROLE_ID) return false;
  return hasAnyRole(interaction, [NOMODULI_ROLE_ID]);
}

function hasHighStaffRole(interaction) {
  const highStaffRoleId = IDs?.roles?.HighStaff ? String(IDs.roles.HighStaff) : null;
  if (!highStaffRoleId) return false;
  return Boolean(interaction?.member?.roles?.cache?.has(highStaffRoleId));
}

async function getCooldownUntil(userId, type) {
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

async function setCooldown(userId, untilTs, type) {
  await loadCooldownMap();
  cooldownByUserAndType.set(cooldownStorageKey(userId, type), Number(untilTs));
  await persistCooldownMap();
}

async function bumpApplicationCooldownAfterStaffDepex(userId) {
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(uid)) return;
  await loadCooldownMap();
  const floor = Date.now() + APPLICATION_COOLDOWN_MS;
  for (const type of ["helper", "partnermanager"]) {
    const key = cooldownStorageKey(uid, type);
    const cur = Number(cooldownByUserAndType.get(key) || 0);
    const active = Number.isFinite(cur) && cur > Date.now() ? cur : 0;
    cooldownByUserAndType.set(key, Math.max(floor, active));
  }
  await persistCooldownMap();
}

function buildRoleDeniedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
    .setDescription(
      "<a:VC_Alert:1482706673176150077> Le candidature sono disponibili solo agli utenti con ruolo Member.",
    );
}

function buildAlreadyRoleEmbed(roleId) {
  const roleText = roleId ? `<@&${roleId}>` : "questo ruolo";
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
    .setDescription(
      `<:VC_InactiveStatus:1482526984234860574> Sei già ${roleText}, perché dovresti ricandidarti?`,
    );
}

function buildNoModuliDeniedEmbed() {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
    .setDescription(
      "<a:VC_Alert:1482706673176150077> Sei blacklistato dalle candidature.",
      "",
      "<:VC_Ticket:1482535175283019888> Se pensi sia un errore apri un ticket.",
    );
}

function buildCooldownDeniedEmbed(untilTs, type) {
  const unix = Math.floor(Number(untilTs) / 1000);
  const label =
    type === "partnermanager"
      ? "**Partner Manager**"
      : "**Helper**";
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<:VC_Lock:1482526739044368476> Candidatura non disponibile")
    .setDescription(
      [
        `<:VC_Clock:1473359204189474886> Hai già inviato una candidatura ${label} di recente.`,
        "",
        `<:VC_update:1478721333096349817> Potrai reinviare **solo quella** (${label}) dopo: <t:${unix}:F> (<t:${unix}:R>).`,
        "",
        "<:VC_InactiveStatus:1482526984234860574> Le candidature **Helper** e **Partner Manager** hanno cooldown **separati**: puoi comunque candidarti all’altra se non è in cooldown.",
        "<a:VC_Timer:1482527426557775954> Tra una candidatura e la successiva **dello stesso tipo** passano 15 giorni.",
      ].join("\n"),
    );
}

function buildIntroEmbed(type) {
  if (type === "partnermanager") {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_PartnerManager:1494286911286808576> Candidatura Partner Manager")
      .setDescription(
        [
          "<:VC_Poll:1482535102436216832> Compilando questo modulo potrai candidarti come Partner Manager del server.",
          "<:VC_Ticket:1482535175283019888> Se hai dei dubbi apri un ticket `HIGH STAFF`.",
          "",
          "<a:VC_Alert:1482706673176150077> **__LEGGI BENE ALL'INTERNO DEI RIQUADRI LA DOMANDA E POI RISPONDI__**",
        ].join("\n"),
      );
  }
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Helper:1502328751638450426> Candidatura Helper")
    .setDescription(
      [
        "<:VC_Poll:1482535102436216832> Compilando questo modulo potrai candidarti come Helper del server.",
        "<a:VC_Timer:1482527426557775954> Il **double staff** su altri server è assolutamente vietato: se, dopo essere stato accettato, un membro dello staff risulta ancora staff su altri server, verrà immediatamente depexato.",
        "<:VC_Ticket:1482535175283019888> Se hai dei dubbi apri un ticket `HIGH STAFF`.",
        "",
        "<a:VC_Alert:1482706673176150077> **__LEGGI BENE ALL'INTERNO DEI RIQUADRI LA DOMANDA E POI RISPONDI__**",
      ].join("\n"),
    );
}

function buildFinalThanksEmbed(untilTs, type) {
  const unix = Math.floor(Number(untilTs) / 1000);
  const label =
    type === "partnermanager" ? "Partner Manager" : "Helper";
  return new EmbedBuilder()
    .setColor("#2ECC71")
    .setTitle("<:vegacheckmark:1443666279058772028> Candidatura inviata")
    .setDescription(
      [
        "<a:VC_ThankYou:1330186319673950401> Grazie per esserti candidato.",
        "",
        `<:VC_update:1478721333096349817> Per **un'altra candidatura ${label}** dovrai attendere fino a: <t:${unix}:F> (<t:${unix}:R>).`,
        "<:VC_InactiveStatus:1482526984234860574> Puoi comunque candidarti all’**altro** ruolo se non l’hai già fatto.",
        "",
        "<a:VC_Alert:1482706673176150077> Non chiedere l'esito o di guardare la candidatura in qualsiasi modo, altrimenti essa verrà automaticamente scartata.",
      ].join("\n"),
    );
}

function buildFinalThanksPlainMessage(untilTs, type) {
  const label = type === "partnermanager" ? "Partner Manager" : "Helper";
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

function buildCandidateActionRow(type, userId) {
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

function recolorEmbeds(embeds, color) {
  return (Array.isArray(embeds) ? embeds : [])
    .map((embed) => EmbedBuilder.from(embed).setColor(color));
}

async function setApplicationMessageStatusColor(message, color) {
  if (!message?.editable) return;
  const embeds = recolorEmbeds(message.embeds, color);
  await message.edit({ embeds, components: [] }).catch(() => null);
}

function getTargetRoleIdByType(type) {
  if (type === "partnermanager") return PARTNER_MANAGER_ROLE_ID;
  if (type === "helper") return HELPER_ROLE_ID;
  return null;
}

async function enforceEligibility(interaction, type) {
  if (hasNoModuliRole(interaction)) {
    await interaction.reply({
      embeds: [buildNoModuliDeniedEmbed()],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  if (!hasMemberRole(interaction)) {
    await interaction.reply({
      embeds: [buildRoleDeniedEmbed()],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRole(interaction, [targetRoleId])) {
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(targetRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  if (type === "helper" && hasAnyRole(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    const highestRoleId = getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) || HELPER_ROLE_ID;
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(highestRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  const until = await getCooldownUntil(interaction.user?.id, type);
  if (until) {
    await interaction.reply({
      embeds: [buildCooldownDeniedEmbed(until, type)],
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  return true;
}

function buildModal(type, step, prefillAnswers = {}) {
  const cfg = APPLICATIONS[type];
  if (!cfg) return null;
  const chunks = splitQuestions(cfg.questions, 4);
  const selected = chunks[step - 1];
  if (!selected) return null;

  const modal = new ModalBuilder().setCustomId(`${MODAL_PREFIX}:${type}:${step}`)
    .setTitle(String(`${cfg.label}- Modulo ${step}/${chunks.length}`).slice(0, 45));

  const rows = selected.map((q) => {
    const maxLen = q.style === TextInputStyle.Short ? 120 : 1000; const input = new TextInputBuilder().setCustomId(q.id).setLabel(String(q.modalLabel || q.text || "Domanda").replace(/\s+/g, " ").trim().slice(0, 45)).setStyle(q.style || TextInputStyle.Paragraph).setRequired(true).setPlaceholder(`${String(q.text || q.modalLabel || "Domanda").replace(/\s+/g, " ").trim()} — ${String(q.placeholder || "Rispondi qui").replace(/\s+/g, " ").trim()}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100),
    )
      .setMaxLength(maxLen);
    const saved = String(prefillAnswers?.[q.id] || "").trim();
    if (saved) input.setValue(saved.slice(0, maxLen));
    return new ActionRowBuilder().addComponents(input);
  });
  modal.addComponents(...rows);
  return modal;
}

function buildPagePickerRow(type, userId, totalSteps, currentStep) {
  const safeTotal = Math.max(1, Math.min(5, Number(totalSteps) || 1));
  const safeCurrent = Math.max(1, Number(currentStep) || 1);
  const buttons = [];
  for (let page = 1; page <= safeTotal; page += 1) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${APPLY_PAGE_PREFIX}:${type}:${userId}:${page}`)
        .setLabel(String(`Pagina ${page}`).slice(0, 80))
        .setStyle(page === safeCurrent ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setDisabled(page === safeCurrent),
    );
  }
  return new ActionRowBuilder().addComponents(...buttons);
}

function formatApplicationDescription(type, answers) {
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

function chunkStringForEmbedDescriptions(text, maxChunk = DISCORD_EMBED_DESC_MAX) {
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

function capChunksToMaxEmbeds(chunks, maxEmbeds = DISCORD_MESSAGE_EMBEDS_MAX, maxChunk = DISCORD_EMBED_DESC_MAX) {
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

async function resolveSubmissionChannel(guild) {
  if (!guild) return null;
  const targetId = IDs.channels?.visioneModuli;
  if (targetId) {
    return guild.channels.cache.get(targetId) || (await getGuildChannelCached(guild, targetId));
  }
  return guild.channels.cache.find((c) => String(c?.name || "") === "visioneModuli") || null;
}

async function sendIntro(interaction, type) {
  const userId = String(interaction.user?.id || "");
  const embed = buildIntroEmbed(type);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${APPLY_START_PREFIX}:${type}:${userId}`)
    .setLabel("Inizia")
    .setStyle(ButtonStyle.Primary)
    .setEmoji("<:success:1461731530333229226>")
  );
  await interaction.reply({
    embeds: [embed],
    components: [row],
    flags: 1 << 6,
  }).catch(() => null);
}

async function handleStartButton(interaction, type, step = 1, forceStep = false) {
  const stateKey = getStateKey(interaction, type);
  const normalizedStep = Number(step) || 1;
  if (normalizedStep <= 1 && !forceStep) {
    const draft = await getDraftState(stateKey);
    if (draft?.nextStep > 1) {
      const totalSteps = splitQuestions(APPLICATIONS[type]?.questions || [], 4).length || 1;
      const row1 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`${APPLY_START_PREFIX}:${type}:${interaction.user.id}:${draft.nextStep}`)
        .setLabel(String(`Riprendi dalla pagina ${draft.nextStep}`).slice(0, 80))
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_Refresh:1473359252276904203>"),
      );
      const row2 = buildPagePickerRow(type, interaction.user.id, totalSteps, draft.nextStep);
      await interaction.reply({
        content:
          "<:VC_update:1478721333096349817> Hai una candidatura in bozza. Puoi riprendere dall'ultima pagina o aprire una pagina specifica per correggere.",
        components: [row1, row2],
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    await clearDraftState(stateKey);
    pendingApplications.set(stateKey, { createdAt: Date.now(), answers: {} });
  } else {
    const state = pendingApplications.get(stateKey);
    if (!state) {
      const draft = await getDraftState(stateKey);
      if (!draft?.answers) {
        await interaction.reply({
          content:
            "<a:VC_Alert:1482706673176150077> Sessione candidatura scaduta. Clicca di nuovo il bottone candidatura.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      pendingApplications.set(stateKey, {
        createdAt: Date.now(),
        answers: draft.answers,
      });
    } else {
      state.createdAt = Date.now();
      pendingApplications.set(stateKey, state);
    }
  }
  const currentState = pendingApplications.get(stateKey);
  const modal = buildModal(type, normalizedStep, currentState?.answers || {});
  if (!modal) return false;
  await interaction.showModal(modal);
  return true;
}

/**
 * Invia in #visioneModuli come il flusso Discord (embed, bottoni HS, thread, reazioni, cooldown).
 * @returns {{ ok: true, nextAllowedAt: number } | { ok: false, code: "no_channel" | "send_failed" }}
 */
async function postCandidatureToVisioneModuli(client, guild, user, type, answers, stateKey) {
  const cfg = APPLICATIONS[type];
  if (!cfg) return { ok: false, code: "send_failed" };
  const channel = await resolveSubmissionChannel(guild);
  if (!channel?.isTextBased?.()) {
    return { ok: false, code: "no_channel" };
  }

  const member =
    guild?.members?.cache?.get(user.id) ||
    (await guild.members.fetch(user.id).catch(() => null));
  const authorLike = member || user;

  const applicationNumber = await nextApplicationNumber(type);
  const fullText = formatApplicationDescription(type, answers);
  const descChunks = capChunksToMaxEmbeds(chunkStringForEmbedDescriptions(fullText));
  const embeds = descChunks.map((chunk, idx) => {
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
  const sent = await channel.send({ content: mention || undefined, embeds, components: [buildCandidateActionRow(type, user.id)], }).catch(() => null);
  if (!sent) {
    return { ok: false, code: "send_failed" };
  }

  if (typeof sent.startThread === "function") {
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

  for (const emoji of APPLICATION_REACTIONS) {
    await sent.react(emoji).catch(() => { });
  }

  const nextAllowedAt = Date.now() + APPLICATION_COOLDOWN_MS;
  await setCooldown(user.id, nextAllowedAt, type);
  if (stateKey) await clearDraftState(stateKey);

  return { ok: true, nextAllowedAt };
}

async function finalizeApplication(interaction, type, state, stateKey = null) {
  const sk = stateKey || getStateKey(interaction, type);
  const result = await postCandidatureToVisioneModuli(interaction.client, interaction.guild, interaction.user, type, state.answers, sk);
  if (!result.ok) {
    const content =
      result.code === "no_channel"
        ?  "<a:VC_Cross:1482532424570376253> Non sono riuscito a inviare la candidatura. Riprova più tardi."
        : null ;
    await interaction.reply({
      content,
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  await interaction.reply({
    embeds: [buildFinalThanksEmbed(result.nextAllowedAt, type)],
    flags: 1 << 6,
  }).catch(() => null);
  return true;
}

function hasAnyRoleMember(member, roleIds) {
  const cache = member?.roles?.cache;
  if (!cache || typeof cache.has !== "function") return false;
  return roleIds.some((id) => id && cache.has(id));
}

async function checkMemberCandidatureEligibility(member, type) {
  if (NOMODULI_ROLE_ID && hasAnyRoleMember(member, [NOMODULI_ROLE_ID])) {
    return { ok: false, code: "no_moduli", message: "Sei blacklistato dalle candidature." };
  }
  if (MEMBER_ROLE_ID && !hasAnyRoleMember(member, [MEMBER_ROLE_ID])) {
    return { ok: false, code: "no_member_role", message: "Le candidature sono disponibili solo agli utenti con ruolo Member." };
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRoleMember(member, [targetRoleId])) {
    return { ok: false, code: "already_role", message: "Sei già in questo ruolo: non puoi ricandidarti." };
  }
  if (type === "helper" && hasAnyRoleMember(member, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    return { ok: false, code: "helper_blocked", message: "Con i tuoi ruoli attuali non puoi inviare una nuova candidatura Helper." };
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

/**
 * @param {import("discord.js").Client} client
 * @param {string} accessToken
 * @returns {Promise<
 *   | { ok: true, userId: string, member: import("discord.js").GuildMember, guild: import("discord.js").Guild }
 *   | { ok: false, status: number, error: string, message: string, userId?: string }
 * >}
 */
async function resolveWebsiteCandidatureMember(client, accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };
  }

  let meJson;
  try {
    const meRes = await fetchDiscordMe(token);
    if (!meRes.ok) {
      return { ok: false, status: 401, error: "invalid_token", message: "Sessione Discord non valida o scaduta: effettua di nuovo il login." };
    }
    meJson = await meRes.json();
  } catch (err) {
    global.logger?.warn?.("[candidature-site] Discord /users/@me timeout/unreachable:", err?.message || err);
    return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord." };
  }

  const userId = String(meJson?.id || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }

  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }

  const guild = client.guilds.cache.get(guildId) || (await withTimeout(client.guilds.fetch(guildId), WEBSITE_AUTH_TIMEOUT_MS, "guild_fetch").catch(() => null));
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord temporaneamente non disponibile." };
  }

  let member = guild.members.cache.get(userId) || null;
  if (!member) {
    member = await withTimeout(guild.members.fetch(userId), WEBSITE_AUTH_TIMEOUT_MS, "member_fetch").catch(() => null);
  }
  if (!member) {
    return {
      ok: false,
      status: 403,
      error: "not_in_guild",
      message: "Non sei nel server Discord: entra prima con lo stesso account con cui hai fatto login.",
      userId,
    };
  }

  return { ok: true, userId, member, guild };
}

/**
 * Preflight per il sito (GET + Bearer): stessi controlli di invio, per tipo Helper e Partner Manager.
 * @param {import("discord.js").Client} client
 * @param {string} accessToken
 */
async function getCandidatureEligibilitySummary(client, accessToken) {
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
      };
    }
    return resolved;
  }

  const { member, userId } = resolved;
  const helperRes = await checkMemberCandidatureEligibility(member, "helper");
  const pmRes = await checkMemberCandidatureEligibility(member, "partnermanager");
  const pack = (e) =>
    e.ok
      ? { eligible: true }
      : {
          eligible: false,
          code: e.code,
          message: e.message,
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
  };
}

/**
 * Stesso effetto del completamento moduli su Discord, con token OAuth utente (scope identify).
 * @param {import("discord.js").Client} client
 * @param {{ accessToken: string, type: string, answers: Record<string, string> }} payload
 */
async function submitCandidatureWebsite(client, payload) {
  const accessToken = String(payload?.accessToken || "").trim();
  const typeRaw = String(payload?.type || "").trim().toLowerCase();
  const type = typeRaw === "partnermanager" ? "partnermanager" : "helper";
  const answersIn = payload?.answers && typeof payload.answers === "object" ? payload.answers : {};

  const resolved = await resolveWebsiteCandidatureMember(client, accessToken);
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, error: resolved.error, message: resolved.message };
  }

  const { member, userId, guild } = resolved;

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

async function applyCandidatePex(guild, actor, type, userId, reason, sourceMessage) {
  const targetRoleId = type === "partnermanager" ? PARTNER_MANAGER_ROLE_ID : HELPER_ROLE_ID;
  if (!targetRoleId) return "Ruolo target non configurato.";

  const member = guild.members.cache.get(String(userId)) || (await getGuildMemberCached(guild, String(userId)));
  if (!member) return "Utente non trovato nel server.";
  if (member.roles.cache.has(String(targetRoleId))) return "Utente già pexato su quel ruolo.";

  const roleBeforeId = String(IDs.roles.Member || "");
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
    const staffChat = guild.channels.cache.get(IDs.channels.staffChat) || (await getGuildChannelCached(guild, IDs.channels.staffChat));
    await sendHelperWelcome(staffChat, member);
  }
  if (String(targetRoleId) === String(PARTNER_MANAGER_ROLE_ID)) {
    await sendPartnerManagerWelcome(guild.client, member);
  }

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
  if (guild.client && guild.id === IDs.guilds?.main) {
    scheduleStaffListRefresh(guild.client, guild.id, 800);
    const t = setTimeout(() => scheduleStaffListRefresh(guild.client, guild.id, 500), 2500);
    if (t?.unref) t.unref();
  }

  const pexDepexChannel = guild.channels.cache.get(IDs.channels.pexDepex) || (await getGuildChannelCached(guild, IDs.channels.pexDepex));
  if (pexDepexChannel?.isTextBased?.()) {
    const oldRole = guild.roles.cache.get(roleBeforeId);
    const newRole = guild.roles.cache.get(String(targetRoleId));
    const actionEmoji = getStaffRoleEmojiByRoleId(targetRoleId);
    await pexDepexChannel.send({
      content: `**<a:VC_Verified:1482532479637127188> PEX** <@${member.id}>
${actionEmoji} \`${oldRole?.name || roleBeforeId || "N/A"}\` <a:VC_Arrow:1482706699365257397> \`${newRole?.name || targetRoleId}\`
<:VC_reason:1478517122929004544> __${reason}__`,
    }).catch(() => null);
  }

  if (sourceMessage) {
    await setApplicationMessageStatusColor(sourceMessage, APPLICATION_ACCEPTED_COLOR);
    await deleteThreadForMessage(guild, sourceMessage);
  }

  try {
    const { enqueueSiteInAppNotification } = require("../../Utils/Web/siteInAppNotificationsService");
    const label = type === "partnermanager" ? "Partner Manager" : "Helper";
    await enqueueSiteInAppNotification({
      guildId: guild.id,
      userId: member.id,
      title: "Candidatura accettata",
      body: `La tua candidatura è stata accettata: ora hai accesso come ${label}. Controlla i messaggi di benvenuto inviati nello staff.`,
      kind: "mod",
      openUrl: "/candidature",
      dedupeKey: `cand-pex-${type}-${member.id}-${String(sourceMessage?.id || "")}`,
      dedupeWindowMs: 86_400_000,
    });
  } catch (_) {}

  return `Pex completato per <@${member.id}>.`;
}

function parseCandidatePexCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${APPLY_PEX_PREFIX}:`)) return null;
  const [, type, userId] = raw.split(":");
  if (!["helper", "partnermanager"].includes(String(type || ""))) return null;
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  return { type: String(type), userId: String(userId) };
}

function parseCandidatePexModalId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(`${APPLY_PEX_MODAL_PREFIX}:`)) return null;
  const [, type, userId, messageId] = raw.split(":");
  if (!["helper", "partnermanager"].includes(String(type || ""))) return null;
  if (!/^\d{16,20}$/.test(String(userId || ""))) return null;
  if (!/^\d{16,20}$/.test(String(messageId || ""))) return null;
  return { type: String(type), userId: String(userId), messageId: String(messageId) };
}

function isVisioneModuliChannelOrThread(interaction) {
  const vid = String(IDs.channels?.visioneModuli || "").trim();
  if (!vid) return false;
  const cid = String(interaction.channelId || "");
  if (cid === vid) return true;
  const parentId = interaction.channel?.parentId != null ? String(interaction.channel.parentId) : "";
  return parentId === vid;
}

async function executeCandidatePexInteraction(interaction, parsed, reason) {
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
    const sendPexModalReply = async (payload) => {
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

async function handleModalSubmit(interaction, type, stepRaw) {
  const stateKey = getStateKey(interaction, type);
  if (hasNoModuliRole(interaction)) {
    pendingApplications.delete(stateKey);
    await clearDraftState(stateKey);
    await interaction.reply({
      embeds: [buildNoModuliDeniedEmbed()],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  if (!hasMemberRole(interaction)) {
    pendingApplications.delete(stateKey);
    await clearDraftState(stateKey);
    await interaction.reply({
      embeds: [buildRoleDeniedEmbed()],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRole(interaction, [targetRoleId])) {
    pendingApplications.delete(stateKey);
    await clearDraftState(stateKey);
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(targetRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }
  if (type === "helper" && hasAnyRole(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    pendingApplications.delete(stateKey);
    await clearDraftState(stateKey);
    const highestRoleId = getHighestRoleId(interaction, HELPER_REAPPLY_BLOCK_ROLE_IDS) || HELPER_ROLE_ID;
    await interaction.reply({
      embeds: [buildAlreadyRoleEmbed(highestRoleId)],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }

  const cfg = APPLICATIONS[type];
  if (!cfg) return false;
  const step = Number(stepRaw);
  if (!Number.isFinite(step) || step < 1) return false;

  const chunks = splitQuestions(cfg.questions, 4);
  const selected = chunks[step - 1];
  if (!selected) return false;

  const state = pendingApplications.get(stateKey);
  if (!state) {
    const draft = await getDraftState(stateKey);
    if (!draft?.answers) {
      await interaction.reply({
        content:
          "<:VC_Refresh:1473359252276904203> Sessione candidatura non valida. Clicca di nuovo il bottone candidatura.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    pendingApplications.set(stateKey, {
      createdAt: Date.now(),
      answers: draft.answers,
    });
  }
  const activeState = pendingApplications.get(stateKey);

  for (const q of selected) {
    const value = interaction.fields.getTextInputValue(q.id);
    activeState.answers[q.id] = String(value || "").trim();
  }

  const nextStep = step + 1;
  if (nextStep <= chunks.length) {
    pendingApplications.set(stateKey, activeState);
    await setDraftState(stateKey, activeState.answers, nextStep);
    const controls = [new ButtonBuilder().setCustomId(`${APPLY_START_PREFIX}:${type}:${interaction.user.id}:${nextStep}`)
      .setLabel(String(`Continua (${nextStep}/${chunks.length})`).slice(0, 80))
      .setStyle(ButtonStyle.Primary)
      .setEmoji("<:VC_Refresh:1473359252276904203>")
    ];
    if (step >= 1) {
      controls.push(
        new ButtonBuilder()
          .setCustomId(`${APPLY_BACK_PREFIX}:${type}:${interaction.user.id}:${step}`)
          .setLabel(String(`Indietro (${step}/${chunks.length})`).slice(0, 80))
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("<a:vegaleftarrow:1462914743416131816>")
      );
    }
    const row = new ActionRowBuilder().addComponents(...controls);
    const pageRow = buildPagePickerRow(type, interaction.user.id, chunks.length, nextStep);
    await interaction.reply({
      content: "<:VC_PinkQuestionMark:1471892611026391306> Puoi continuare oppure tornare indietro per correggere le risposte.",
      components: [row, pageRow],
      flags: 1 << 6,
    }).catch(() => null);
    return true;
  }

  pendingApplications.delete(stateKey);
  return finalizeApplication(interaction, type, activeState, stateKey);
}

async function handleCandidatureApplicationInteraction(interaction) {
  const guild = interaction.guild;
  const withFooter = (p) => (p && typeof p === "object" && Array.isArray(p.embeds) && p.embeds.length ? applyDefaultFooterToEmbeds(p, guild) : p);
  const origReply = interaction.reply.bind(interaction);
  interaction.reply = (p) => origReply(withFooter(p));
  const origEditReply = interaction.editReply?.bind(interaction);
  if (origEditReply) interaction.editReply = (p) => origEditReply(withFooter(p));

  if (interaction.isButton?.()) {
    if (String(interaction.customId || "").startsWith(`${APPLY_PEX_PREFIX}:`)) {
      const parsed = parseCandidatePexCustomId(interaction.customId);
      if (!parsed) return false;
      if (!hasHighStaffRole(interaction)) {
        await interaction.reply({
          content: "<a:VC_Cross:1482532424570376253> Questo bottone è riservato all'High Staff.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      if (!interaction.message?.id) {
        await interaction.reply({
          content: "<a:VC_Cross:1482532424570376253> Messaggio candidatura non disponibile.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      if (isVisioneModuliChannelOrThread(interaction)) {
        return executeCandidatePexInteraction(interaction, {
          type: parsed.type,
          userId: parsed.userId,
          messageId: String(interaction.message.id),
        }, VISIONE_MODULI_AUTO_PEX_REASON);
      }
      const modal = new ModalBuilder().setCustomId(`${APPLY_PEX_MODAL_PREFIX}:${parsed.type}:${parsed.userId}:${interaction.message.id}`).setTitle("Motivo Pex Candidatura");
      const reasonInput = new TextInputBuilder().setCustomId(APPLY_PEX_REASON_INPUT_ID).setLabel("Motivo").setStyle(TextInputStyle.Paragraph).setRequired(true).setMinLength(3).setMaxLength(500);
      modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
      await interaction.showModal(modal).catch(() => null);
      return true;
    }
    if (String(interaction.customId || "").startsWith(`${APPLY_REJECT_PREFIX}:`)) {
      if (!hasHighStaffRole(interaction)) {
        await interaction.reply({
          content: "<a:VC_Cross:1482532424570376253> Questo bottone è riservato all'High Staff.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const rejParts = String(interaction.customId || "").split(":");
      const rejType = String(rejParts[1] || "");
      const rejUid = String(rejParts[2] || "").trim();
      const rejMessageId = String(interaction.message?.id || "").trim();
      if (interaction.message) {
        await setApplicationMessageStatusColor(interaction.message, APPLICATION_REJECTED_COLOR);
        await deleteThreadForMessage(interaction.guild, interaction.message);
      }
      if (rejUid && ["helper", "partnermanager"].includes(rejType)) {
        try {
          const { enqueueSiteInAppNotification } = require("../../Utils/Web/siteInAppNotificationsService");
          const label = rejType === "partnermanager" ? "Partner Manager" : "Helper";
          await enqueueSiteInAppNotification({
            guildId: interaction.guild.id,
            userId: rejUid,
            title: "Candidatura rifiutata",
            body: `La tua candidatura per ${label} non è stata accettata. Puoi inviare una nuova richiesta dopo il cooldown indicato sul sito.`,
            kind: "mod",
            openUrl: "/candidature",
            dedupeKey: `cand-rej-${rejType}-${rejUid}-${rejMessageId}`,
            dedupeWindowMs: 86_400_000,
          });
        } catch (_) {}
      }
      await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Candidatura rifiutata.", flags: 1 << 6 }).catch(() => null);
      return true;
    }

    if (interaction.customId === APPLY_HELPER_BUTTON) {
      const ok = await enforceEligibility(interaction, "helper");
      if (!ok) return true;
      await sendIntro(interaction, "helper");
      return true;
    }

    if (interaction.customId === APPLY_PM_BUTTON) {
      const ok = await enforceEligibility(interaction, "partnermanager");
      if (!ok) return true;
      await sendIntro(interaction, "partnermanager");
      return true;
    }

    if (String(interaction.customId || "").startsWith(`${APPLY_START_PREFIX}:`)) {
      const [, type, ownerId, rawStep] = String(interaction.customId).split(":");
      if (!type || !ownerId) return false;
      if (String(ownerId) !== String(interaction.user?.id || "")) {
        await interaction.reply({
          content:
            "<a:VC_Cross:1482532424570376253> Questo modulo non è associato al tuo click iniziale.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const ok = await enforceEligibility(interaction, type);
      if (!ok) return true;
      const step = Number(rawStep || 1);
      return handleStartButton(interaction, type, step, false);
    }

    if (String(interaction.customId || "").startsWith(`${APPLY_BACK_PREFIX}:`)) {
      const [, type, ownerId, rawStep] = String(interaction.customId).split(":");
      if (!type || !ownerId) return false;
      if (String(ownerId) !== String(interaction.user?.id || "")) {
        await interaction.reply({
          content:
            "<a:VC_Cross:1482532424570376253> Questo modulo non è associato al tuo click iniziale.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const ok = await enforceEligibility(interaction, type);
      if (!ok) return true;
      const step = Math.max(1, Number(rawStep || 1));
      return handleStartButton(interaction, type, step, true);
    }

    if (String(interaction.customId || "").startsWith(`${APPLY_PAGE_PREFIX}:`)) {
      const [, type, ownerId, rawStep] = String(interaction.customId).split(":");
      if (!type || !ownerId) return false;
      if (String(ownerId) !== String(interaction.user?.id || "")) {
        await interaction.reply({
          content:
            "<a:VC_Cross:1482532424570376253> Questo modulo non è associato al tuo click iniziale.",
          flags: 1 << 6,
        }).catch(() => null);
        return true;
      }
      const ok = await enforceEligibility(interaction, type);
      if (!ok) return true;
      const step = Math.max(1, Number(rawStep || 1));
      return handleStartButton(interaction, type, step, true);
    }
    return false;
  }

  if (!interaction.isModalSubmit?.()) return false;
  if (String(interaction.customId || "").startsWith(`${APPLY_PEX_MODAL_PREFIX}:`)) {
    const parsed = parseCandidatePexModalId(interaction.customId);
    if (!parsed) return false;
    if (!hasHighStaffRole(interaction)) {
      await interaction.reply({
        content: "<a:VC_Cross:1482532424570376253> Questo modulo è riservato all'High Staff.",
        flags: 1 << 6,
      }).catch(() => null);
      return true;
    }
    const reason = String(interaction.fields.getTextInputValue(APPLY_PEX_REASON_INPUT_ID) || "").trim();
    return executeCandidatePexInteraction(interaction, parsed, reason);
  }

  const raw = String(interaction.customId || "");
  if (!raw.startsWith(`${MODAL_PREFIX}:`)) return false;
  const modalParts = raw.split(":");
  if (modalParts.length < 3) return false;
  const [, type, step] = modalParts;
  return handleModalSubmit(interaction, type, step);
}

module.exports = {
  handleCandidatureApplicationInteraction,
  submitCandidatureWebsite,
  getCandidatureEligibilitySummary,
  resolveWebsiteCandidatureMember,
  resolveSubmissionChannel,
  bumpApplicationCooldownAfterStaffDepex,
};