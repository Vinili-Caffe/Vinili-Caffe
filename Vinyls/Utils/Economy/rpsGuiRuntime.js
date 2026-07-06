const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload, canvasStatusLine } = require("./guiPanelPayload");
const { formatCurrency } = require("../../Services/Community/serverWalletService");
const { economyConfig, lockRpsPvpStakes, normalizeRps, playRps, refundRpsPvpStake, settleRpsPvp } = require("../../Services/Community/activeEconomyService");

const PREFIX = "rps_gui";
const SESSION_TTL_MS = 10 * 60 * 1000;
const PVP_INVITE_TTL_MS = 90 * 1000;
const PVP_PICK_TTL_MS = 3 * 60 * 1000;
const RENDER_CACHE_MAX = 64;
const IDLE_CACHE_KEY = "png:idle";
const sessions = new Map();
const pvpUserLocks = new Map();
const renderCache = new Map();
let defaultIdleCache = null;
let warmupPromise = null;

function now() {
  return Date.now();
}

function sessionKey(messageId) {
  return String(messageId || "").trim();
}

function clampBet(value, cfg) {
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 1));
  const max = Math.max(min, Math.floor(Number(cfg?.maxBet) || min));
  const n = Math.floor(Number(value) || min);
  return Math.max(min, Math.min(max, n));
}

function betStep(cfg) {
  return Math.max(1, Math.floor(Number(cfg?.minBet) || 5));
}

function makeSession({ ownerId, guildId, bet, cfg, playerName, mode = "bot", opponentId = "", opponentName = "Rivale" }) {
  return {
    mode: mode === "pvp" ? "pvp" : "bot",
    ownerId: String(ownerId || ""),
    opponentId: String(opponentId || ""),
    guildId: String(guildId || ""),
    bet: clampBet(bet, cfg),
    playerName: String(playerName || "Tu").trim() || "Tu",
    opponentName: String(opponentName || "Rivale").trim() || "Rivale",
    phase: mode === "pvp" ? "pending" : "bot",
    stakesLocked: false,
    challengerChoice: "",
    opponentChoice: "",
    lastResult: null,
    panelAnimating: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

function userLockKey(guildId, userId) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function bindPvpUsers(session, messageId) {
  const gid = String(session?.guildId || "");
  const mid = String(messageId || "");
  if (!gid || !mid || session.mode !== "pvp") return;
  pvpUserLocks.set(userLockKey(gid, session.ownerId), mid);
  pvpUserLocks.set(userLockKey(gid, session.opponentId), mid);
}

function releasePvpUsers(session) {
  if (session?.mode !== "pvp") return;
  const gid = String(session.guildId || "");
  pvpUserLocks.delete(userLockKey(gid, session.ownerId));
  pvpUserLocks.delete(userLockKey(gid, session.opponentId));
}

function findActivePvpMessageId(guildId, userId) {
  return pvpUserLocks.get(userLockKey(guildId, userId)) || "";
}

function isParticipant(session, userId) {
  const uid = String(userId || "");
  return uid === String(session?.ownerId || "") || uid === String(session?.opponentId || "");
}

function setSession(messageId, session) {
  sessions.set(sessionKey(messageId), { ...session, updatedAt: now() });
  bindPvpUsers(session, messageId);
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
  const live = sessions.get(sessionKey(messageId));
  if (live) releasePvpUsers(live);
  sessions.delete(sessionKey(messageId));
}

function controlId(action, ownerId) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isRpsGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseRpsGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2] };
}

function buildBotRows(session, cfg, disabled = false) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 1));
  const max = Math.max(min, Math.floor(Number(cfg?.maxBet) || min));
  const locked = disabled || Boolean(session.panelAnimating);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("minus", ownerId))
        .setLabel(`-${step}`)
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked || session.bet <= min),
      new ButtonBuilder()
        .setCustomId(controlId("plus", ownerId))
        .setLabel(`+${step}`)
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked || session.bet >= max),
      new ButtonBuilder()
        .setCustomId(controlId("sasso", ownerId))
        .setLabel("Sasso")
        .setEmoji("✊")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(locked),
      new ButtonBuilder()
        .setCustomId(controlId("carta", ownerId))
        .setLabel("Carta")
        .setEmoji("✋")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(locked),
      new ButtonBuilder()
        .setCustomId(controlId("forbici", ownerId))
        .setLabel("Forbici")
        .setEmoji("✌️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(locked),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("close", ownerId))
        .setLabel("Chiudi")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
  ];
}

function buildPvpInviteRows(session, disabled = false) {
  const ownerId = session.ownerId;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("accept", ownerId))
        .setLabel("Accetta sfida")
        .setEmoji("<a:VC_Verified:1482532479637127188>")
        .setStyle(ButtonStyle.Success)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(controlId("decline", ownerId))
        .setLabel("Rifiuta")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(controlId("cancel", ownerId))
        .setLabel("Annulla")
        .setEmoji("🚫")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

function buildPvpPickRows(session, disabled = false) {
  const ownerId = session.ownerId;
  const locked = disabled || Boolean(session.panelAnimating);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("sasso", ownerId)).setLabel("Sasso").setEmoji("✊").setStyle(ButtonStyle.Primary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("carta", ownerId)).setLabel("Carta").setEmoji("✋").setStyle(ButtonStyle.Primary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("forbici", ownerId)).setLabel("Forbici").setEmoji("✌️").setStyle(ButtonStyle.Primary).setDisabled(locked),
    ),
  ];
}

function buildRows(session, cfg, disabled = false) {
  if (session.mode === "pvp") {
    if (session.phase === "pending") return buildPvpInviteRows(session, disabled);
    if (session.phase === "pick") return buildPvpPickRows(session, disabled);
    return [];
  }
  return buildBotRows(session, cfg, disabled);
}

function spinAnimationDurationMs() {
  try {
    const renderRpsCanvas = require("../Render/rpsCanvas");
    if (typeof renderRpsCanvas.spinAnimationDurationMs === "function") {
      return renderRpsCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 3200;
}

function renderCacheKey(session, animating) {
  const last = session.lastResult;
  const player = last?.result?.player || "";
  const bot = last?.result?.bot || "";
  if (!last) return IDLE_CACHE_KEY;
  if (animating && last) return `gif:${player}|${bot}:${last.win ? 1 : 0}:${last.draw ? 1 : 0}`;
  return `png:${player}|${bot}:${last.win ? 1 : 0}:${last.draw ? 1 : 0}`;
}

function attachmentFromCache(entry) {
  if (!entry?.buffer?.length) return { files: [], image: null, isGif: false };
  const fileName = entry.fileName || "rps-panel.png";
  const isGif = fileName.endsWith(".gif");
  return {
    files: [new AttachmentBuilder(Buffer.from(entry.buffer), { name: fileName })],
    image: `attachment://${fileName}`,
    isGif,
  };
}

function rememberRenderCache(key, buffer, fileName) {
  const isGif = fileName.endsWith(".gif");
  renderCache.set(key, { buffer, fileName, image: `attachment://${fileName}`, isGif });
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
}

async function renderRpsAttachment(session, { animating = false, notice = "" } = {}) {
  const last = session.lastResult;
  const key = renderCacheKey(session, Boolean(animating && last));
  const hit = renderCache.get(key);
  if (hit) return attachmentFromCache(hit);
  try {
    const renderRpsCanvas = require("../Render/rpsCanvas");
    const rendered = await renderRpsCanvas({
      bet: session.bet,
      phase: session.phase,
      playerName: session.playerName,
      opponentName: session.opponentName,
      playerChoice: last?.result?.player || "",
      botChoice: last?.result?.bot || "",
      win: Boolean(last?.win),
      draw: Boolean(last?.draw),
      hasResult: Boolean(last),
      animating: Boolean(animating && last),
      isPvp: session.mode === "pvp",
      winnerName: last?.winnerId === session.ownerId ? session.playerName : last?.winnerId === session.opponentId ? session.opponentName : "",
      statusLine: canvasStatusLine(notice),
    });
    const fileName = rendered.format === "gif" ? "rps-match.gif" : "rps-panel.png";
    rememberRenderCache(key, rendered.buffer, fileName);
    return attachmentFromCache(renderCache.get(key));
  } catch (error) {
    global.logger?.warn?.("[RPS GUI] render:", error?.message || error);
    if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
    return { files: [], image: null, isGif: false };
  }
}

async function resolvePanelAttachment(session, animating = false, notice = "") {
  if (!session.lastResult && !animating && !notice && session.phase !== "pending" && defaultIdleCache) {
    return attachmentFromCache(defaultIdleCache);
  }
  const out = await renderRpsAttachment(session, { animating, notice });
  if (out.files?.length) return out;
  if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
  return out;
}

async function warmupRpsPanel() {
  if (defaultIdleCache) return;
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try {
      const renderRpsCanvas = require("../Render/rpsCanvas");
      if (typeof renderRpsCanvas.warmup === "function") renderRpsCanvas.warmup();
      const rendered = await renderRpsCanvas({
        bet: 0,
        playerName: "Tu",
        opponentName: "Rivale",
        hasResult: false,
        animating: false,
      });
      const fileName = "rps-panel.png";
      defaultIdleCache = { buffer: rendered.buffer, fileName, image: `attachment://${fileName}`, isGif: false };
      rememberRenderCache(IDLE_CACHE_KEY, defaultIdleCache.buffer, fileName);
    } catch (_) {}
  })();
  return warmupPromise;
}

setImmediate(() => {
  warmupRpsPanel().catch(() => {});
});

function scheduleRpsIdlePanel(message, session, cfg, notice = "", disabled = false) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  const delayMs = spinAnimationDurationMs();
  setTimeout(() => {
    const live = getSession(messageId);
    if (!live) return;
    live.panelAnimating = false;
    const pvpDone = live.mode === "pvp";
    if (pvpDone) live.phase = "done";
    setSession(messageId, live);
    buildRpsGuiPayload(live, cfg, notice, disabled || pvpDone, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .then(() => { if (pvpDone) deleteSession(messageId); })
      .catch(() => {});
  }, delayMs);
}

function formatRpsRoundNotice(result) {
  if (!result?.ok) return "";
  if (result.game === "rps_pvp") return formatRpsPvpNotice(result);
  if (result.draw) return `🤝 Pareggio: ti tornano **${formatCurrency("caffe",result.payout)}**.`;
  if (result.win) return `🏆 Hai vinto **${formatCurrency("caffe",result.payout)}**.`;
  return `<a:VC_Cross:1482532424570376253> Hai perso.\n<a:VC_pixeltime:1482535344103620771> Puoi rigiocare quando il cooldown lo permette.`;
}

function formatRpsPvpNotice(result) {
  if (result.draw) return `🤝 **Pareggio!** Le puntate tornano a entrambi i giocatori.`;
  const winnerName = result.winnerId === result.challengerId ? result.challengerName : result.opponentName;
  return `🏆 **${winnerName}** vince il montepremi: **${formatCurrency("caffe",result.payout)}**.`;
}

async function buildRpsGuiPayload(session, cfg, notice = "", disabled = false, animating = false) {
  const attachment = await resolvePanelAttachment(session, animating, notice);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, disabled),
  });
}

async function buildRpsBetPayload(session, cfg, notice = "") {
  const attachment = defaultIdleCache ? attachmentFromCache(defaultIdleCache) : await resolvePanelAttachment(session, false, notice);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, false),
  });
}

function interactionMessageAdapter(interaction) {
  return {
    guild: interaction.guild,
    member: interaction.member,
    author: interaction.user,
  };
}

async function playRpsSession(client, messageLike, session, choice) {
  const result = await playRps(client, messageLike, String(session.bet), choice);
  if (!result.ok) return { ok: false, message: result.message };
  session.lastResult = result;
  session.updatedAt = now();
  return { ok: true, result };
}

function choiceSide(session, userId) {
  if (String(userId) === String(session.ownerId)) return "challenger";
  if (String(userId) === String(session.opponentId)) return "opponent";
  return "";
}

function setPvpChoice(session, userId, choiceRaw) {
  const choice = normalizeRps(choiceRaw);
  if (!choice) return { ok: false, message: "Mossa non valida." };
  const side = choiceSide(session, userId);
  if (!side) return { ok: false, message: "Non fai parte di questa sfida." };
  if (session.phase !== "pick") return { ok: false, message: "Non puoi scegliere ora." };
  if (side === "challenger" && session.challengerChoice) return { ok: false, message: "Hai già scelto la tua mossa." };
  if (side === "opponent" && session.opponentChoice) return { ok: false, message: "Hai già scelto la tua mossa." };
  if (side === "challenger") session.challengerChoice = choice;
  else session.opponentChoice = choice;
  session.updatedAt = now();
  return { ok: true, choice, side, ready: Boolean(session.challengerChoice && session.opponentChoice) };
}

async function finalizePvpMatch(client, guild, session, actorId) {
  const settled = await settleRpsPvp(
    client,
    guild,
    session.ownerId,
    session.opponentId,
    session.challengerChoice,
    session.opponentChoice,
    session.bet,
    actorId,
  );
  if (!settled.ok) return { ok: false, message: settled.message };
  settled.challengerId = session.ownerId;
  settled.opponentId = session.opponentId;
  settled.challengerName = session.playerName;
  settled.opponentName = session.opponentName;
  session.lastResult = settled;
  session.phase = "done";
  session.panelAnimating = true;
  session.updatedAt = now();
  return { ok: true, result: settled };
}

async function refundLockedPvpStakes(client, session, actorId, reason) {
  if (!session.stakesLocked) return;
  await refundRpsPvpStake(client, session.guildId, session.ownerId, session.bet, actorId, reason);
  await refundRpsPvpStake(client, session.guildId, session.opponentId, session.bet, actorId, reason);
  session.stakesLocked = false;
}

function schedulePvpInviteExpiry(message, session, cfg) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  setTimeout(() => {
    const live = getSession(messageId);
    if (!live || live.mode !== "pvp" || live.phase !== "pending") return;
    deleteSession(messageId);
    buildRpsGuiPayload(live, cfg, "<a:VC_pixeltime:1482535344103620771> Sfida scaduta: nessuna risposta.", true, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, PVP_INVITE_TTL_MS);
}

function schedulePvpPickExpiry(message, session, cfg, client) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  setTimeout(async () => {
    const live = getSession(messageId);
    if (!live || live.mode !== "pvp" || live.phase !== "pick") return;
    if (live.challengerChoice && live.opponentChoice) return;
    await refundLockedPvpStakes(client, live, live.ownerId, "rps: timeout scelta pvp");
    deleteSession(messageId);
    buildRpsGuiPayload(live, cfg, "<a:VC_pixeltime:1482535344103620771> Tempo scaduto: puntate rimborsate.", true, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, PVP_PICK_TTL_MS);
}

async function acceptPvpChallenge(client, interaction, session, cfg) {
  const guild = interaction.guild;
  const opponentId = String(interaction.user?.id || "");
  if (opponentId !== session.opponentId) return { ok: false, message: "Solo l'avversario sfidato può accettare." };
  const locked = await lockRpsPvpStakes(client, guild, session.ownerId, session.opponentId, session.bet, opponentId);
  if (!locked.ok) return locked;
  session.stakesLocked = true;
  session.phase = "pick";
  session.updatedAt = now();
  setSession(interaction.message.id, session);
  schedulePvpPickExpiry(interaction.message, session, cfg, client);
  return { ok: true, notice: "<a:VC_Verified:1482532479637127188> Sfida accettata! Scegli sasso, carta o forbici." };
}

async function declinePvpChallenge(interaction, session) {
  const uid = String(interaction.user?.id || "");
  if (uid !== session.opponentId) return { ok: false, message: "Solo l'avversario può rifiutare la sfida." };
  if (session.phase !== "pending") return { ok: false, message: "Questa sfida non è più in attesa." };
  deleteSession(interaction.message.id);
  return { ok: true, notice: `<a:VC_Cross:1482532424570376253> **${session.opponentName}** ha rifiutato la sfida.`, disabled: true };
}

async function cancelPvpChallenge(interaction, session) {
  if (String(interaction.user?.id || "") !== session.ownerId) return { ok: false, message: "Solo chi ha lanciato la sfida può annullarla." };
  if (session.phase !== "pending") return { ok: false, message: "Non puoi annullare ora." };
  deleteSession(interaction.message.id);
  return { ok: true, notice: "🚫 Sfida annullata.", disabled: true };
}

module.exports = {
  SESSION_TTL_MS,
  PVP_INVITE_TTL_MS,
  PVP_PICK_TTL_MS,
  acceptPvpChallenge,
  buildRpsBetPayload,
  buildRpsGuiPayload,
  cancelPvpChallenge,
  clampBet,
  choiceSide,
  declinePvpChallenge,
  deleteSession,
  economyConfig,
  finalizePvpMatch,
  findActivePvpMessageId,
  formatRpsPvpNotice,
  formatRpsRoundNotice,
  getSession,
  interactionMessageAdapter,
  isParticipant,
  isRpsGuiCustomId,
  makeSession,
  parseRpsGuiCustomId,
  playRpsSession,
  schedulePvpInviteExpiry,
  scheduleRpsIdlePanel,
  setPvpChoice,
  setSession,
  spinAnimationDurationMs,
  warmupRpsPanel,
};