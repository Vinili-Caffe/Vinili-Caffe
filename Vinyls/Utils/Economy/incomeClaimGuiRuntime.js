const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { claimFixed, claimWork, formatDuration, peekFixedClaim, peekWorkClaim } = require("../../Services/Community/galeoniEconomyService");

const PREFIX = "income_gui";
const SESSION_TTL_MS = 8 * 60 * 1000;
const sessions = new Map();

const TYPE_LABELS = {
  daily: { title: "Ricompensa giornaliera", cmd: "+daily", emoji: "☀️", claimLabel: "Riscuoti" },
  weekly: { title: "Ricompensa settimanale", cmd: "+weekly", emoji: "📅", claimLabel: "Riscuoti" },
  monthly: { title: "Ricompensa mensile", cmd: "+monthly", emoji: "🌙", claimLabel: "Riscuoti" },
  work: { title: "Turno di lavoro", cmd: "+work", emoji: "⚗️", claimLabel: "Lavora" },
};

function now() {
  return Date.now();
}

function sessionKey(messageId) {
  return String(messageId || "").trim();
}

function validIncomeType(type) {
  return ["daily", "weekly", "monthly", "work"].includes(String(type || "").trim().toLowerCase());
}

function makeSession({ ownerId, guildId, incomeType, peek }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    incomeType: String(incomeType || "daily").toLowerCase(),
    phase: "idle",
    peek: peek || null,
    lastClaim: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function setSession(messageId, session) {
  sessions.set(sessionKey(messageId), { ...session, updatedAt: now() });
}

function getSession(messageId) {
  const key = sessionKey(messageId);
  const cached = sessions.get(key);
  if (!cached) return null;
  if (now() - Number(cached.updatedAt || cached.createdAt || 0) > SESSION_TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return cached;
}

function deleteSession(messageId) {
  sessions.delete(sessionKey(messageId));
}

function controlId(incomeType, action, ownerId) {
  return `${PREFIX}:${incomeType}:${action}:${ownerId}`;
}

function isIncomeGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseIncomeGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 4) return null;
  return { incomeType: parts[1], action: parts[2], ownerId: parts[3] };
}

function buildRows(session, panelClosed = false) {
  const ownerId = session.ownerId;
  const type = session.incomeType;
  const canClaim = session.phase === "idle" && Boolean(session.peek?.canClaim);
  const busy = session.phase === "claiming";
  const claimed = session.phase === "done";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId(type, "claim", ownerId))
        .setLabel(claimed ? "Completato" : (TYPE_LABELS[type]?.claimLabel || "Riscuoti"))
        .setEmoji("<a:VC_Verified:1482532479637127188>")
        .setStyle(ButtonStyle.Success)
        .setDisabled(Boolean(panelClosed) || claimed || busy || !canClaim),
      new ButtonBuilder()
        .setCustomId(controlId(type, "close", ownerId))
        .setLabel("Chiudi")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(panelClosed),
    ),
  ];
}

async function renderPanel(session) {
  const peek = session.peek || {};
  const claim = session.lastClaim || {};
  const claimed = session.phase === "done" && claim.ok;
  try {
    const renderIncomeRewardCanvas = require("../Render/incomeRewardCanvas");
    const rendered = await renderIncomeRewardCanvas({
      incomeType: session.incomeType,
      canClaim: Boolean(peek.canClaim) && !claimed,
      claimed,
      remainingMs: peek.remainingMs || 0,
      baseReward: claimed ? claim.baseAmount : peek.baseReward,
      bonusAmount: claimed ? claim.bonusAmount : peek.bonusAmount,
      totalPreview: peek.totalPreview,
      rewardMin: peek.minReward,
      rewardMax: peek.maxReward,
      totalPreviewMin: peek.totalPreviewMin,
      totalPreviewMax: peek.totalPreviewMax,
      claimedAmount: claim.amount,
      streakCount: claimed ? claim.streak?.count : peek.streak?.nextCount || peek.streak?.count || 1,
    });
    const fileName = `${session.incomeType}-reward.png`;
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image: `attachment://${fileName}` };
  } catch (error) {
    global.logger?.warn?.("[INCOME GUI] render:", error?.message || error);
    return { files: [], image: null };
  }
}

async function buildIncomeClaimPayload(session, notice = "", panelClosed = false) {
  const attachment = await renderPanel(session);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, panelClosed),
  });
}

async function warmupIncomePanel(incomeType = "daily") {
  try {
    const renderIncomeRewardCanvas = require("../Render/incomeRewardCanvas");
    if (typeof renderIncomeRewardCanvas.warmup === "function") renderIncomeRewardCanvas.warmup();
    await renderIncomeRewardCanvas({ incomeType, canClaim: true, baseReward: 50, totalPreview: 55, streakCount: 1 });
  } catch (_) {}
}

setImmediate(() => {
  warmupIncomePanel("daily").catch(() => {});
  warmupIncomePanel("work").catch(() => {});
});

async function interactionMessageAdapter(interaction) {
  let member = interaction.member;
  if (!member && interaction.guild && interaction.user?.id) {
    member = interaction.guild.members.cache.get(interaction.user.id)
      ?? await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  }
  return { guild: interaction.guild, member, author: interaction.user };
}

async function syncSessionPeek(client, messageLike, session) {
  const peek =
    session.incomeType === "work"
      ? await peekWorkClaim(client, messageLike)
      : await peekFixedClaim(client, messageLike, session.incomeType);
  if (peek.ok) session.peek = peek;
  return peek;
}

async function openIncomePanel(client, message, incomeType) {
  if (!validIncomeType(incomeType)) return { ok: false, message: "Tipo ricompensa non valido." };
  const peek =
    incomeType === "work"
      ? await peekWorkClaim(client, message)
      : await peekFixedClaim(client, message, incomeType);
  if (!peek.ok) return peek;
  const session = makeSession({
    ownerId: message.author.id,
    guildId: message.guild.id,
    incomeType,
    peek,
  });
  await warmupIncomePanel(incomeType);
  const meta = TYPE_LABELS[incomeType] || TYPE_LABELS.daily;
  let notice = "";
  if (incomeType !== "work") {
    notice = peek.canClaim
      ? `La ricompensa è pronta — premi **${meta.claimLabel || "Riscuoti"}**.`
      : `<a:VC_pixeltime:1482535344103620771> In cooldown — attendi **${formatDuration(peek.remainingMs)}**.`;
  }
  return { ok: true, session, payload: await buildIncomeClaimPayload(session, notice, false) };
}

async function claimFromPanel(client, messageLike, session) {
  if (session.phase === "done") {
    return {
      ok: false,
      message: session.incomeType === "work" ? "Hai già completato il turno di lavoro." : "Hai già riscosso questa ricompensa.",
    };
  }
  const result =
    session.incomeType === "work"
      ? await claimWork(client, messageLike)
      : await claimFixed(client, messageLike, session.incomeType);
  if (!result.ok) return result;
  session.lastClaim = result;
  session.phase = "done";
  session.peek = {
    ...session.peek,
    canClaim: false,
    remainingMs: 0,
  };
  session.updatedAt = now();
  return { ok: true, result };
}

function formatClaimNotice(result, incomeType) {
  if (!result?.ok) return "";
  const meta = TYPE_LABELS[incomeType] || TYPE_LABELS.daily;
  const bonus = result.bonusAmount > 0
    ? ` (base ${formatGaleoni(result.baseAmount)} + bonus ${formatGaleoni(result.bonusAmount)})`
    : "";
  if (incomeType === "work") {
    return `<a:VC_Verified:1482532479637127188> Turno completato: **${formatGaleoni(result.amount)}**${bonus} — streak **x${result.streak?.count || 1}**.`;
  }
  return `<a:VC_Verified:1482532479637127188> **${meta.title}** riscossa: **${formatGaleoni(result.amount)}**${bonus} — streak **x${result.streak?.count || 1}**.`;
}

module.exports = {
  buildIncomeClaimPayload,
  claimFromPanel,
  deleteSession,
  formatClaimNotice,
  getSession,
  interactionMessageAdapter,
  syncSessionPeek,
  isIncomeGuiCustomId,
  openIncomePanel,
  parseIncomeGuiCustomId,
  setSession,
  validIncomeType,
  warmupIncomePanel,
};