const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { economyConfig, playRps } = require("../../Services/Community/galeoniEconomyService");

const PREFIX = "rps_gui";
const SESSION_TTL_MS = 10 * 60 * 1000;
const RENDER_CACHE_MAX = 64;
const IDLE_CACHE_KEY = "png:idle";
const sessions = new Map();
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

function makeSession({ ownerId, guildId, bet, cfg, playerName }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    bet: clampBet(bet, cfg),
    playerName: String(playerName || "Tu").trim() || "Tu",
    opponentName: "Rivale",
    lastResult: null,
    panelAnimating: false,
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

function buildRows(session, cfg, disabled = false) {
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

async function renderRpsAttachment(session, { animating = false } = {}) {
  const last = session.lastResult;
  const key = renderCacheKey(session, Boolean(animating && last));
  const hit = renderCache.get(key);
  if (hit) return attachmentFromCache(hit);
  try {
    const renderRpsCanvas = require("../Render/rpsCanvas");
    const rendered = await renderRpsCanvas({
      bet: session.bet,
      playerName: session.playerName,
      opponentName: session.opponentName,
      playerChoice: last?.result?.player || "",
      botChoice: last?.result?.bot || "",
      win: Boolean(last?.win),
      draw: Boolean(last?.draw),
      hasResult: Boolean(last),
      animating: Boolean(animating && last),
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

async function resolvePanelAttachment(session, animating = false) {
  if (!session.lastResult && !animating && defaultIdleCache) {
    return attachmentFromCache(defaultIdleCache);
  }
  const out = await renderRpsAttachment(session, { animating });
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
    setSession(messageId, live);
    buildRpsGuiPayload(live, cfg, notice, disabled, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, delayMs);
}

function formatRpsRoundNotice(result) {
  if (!result?.ok) return "";
  if (result.draw) return `🤝 Pareggio: ti tornano **${formatGaleoni(result.payout)}**.`;
  if (result.win) return `🏆 Hai vinto **${formatGaleoni(result.payout)}**.`;
  return `<a:VC_Cross:1482532424570376253> Hai perso.\n<a:VC_pixeltime:1482535344103620771> Puoi rigiocare quando il cooldown lo permette.`;
}

function buildEmbed(session, notice, animating) {
  const last = session.lastResult;
  const color = last?.draw ? "#d4af37" : last?.win ? "#2ecc71" : last ? "#ed4245" : "#38bdf8";
  const lines = [
    `🪙 Puntata: **${formatGaleoni(session.bet)}**`,
    `👤 Tu vs Bot`,
  ];
  if (animating) lines.push("🎬 **Animazione in corso…**");
  if (notice) lines.push(notice);
  return new EmbedBuilder().setColor(color).setDescription(lines.filter(Boolean).join("\n"));
}

async function buildRpsGuiPayload(session, cfg, notice = "", disabled = false, animating = false) {
  const attachment = await resolvePanelAttachment(session, animating);
  const embed = buildEmbed(session, notice, animating);
  const files = attachment.files?.length ? attachment.files : undefined;
  if (attachment.image && files?.length && !attachment.isGif) {
    embed.setImage(attachment.image);
  }
  return { embeds: [embed], components: buildRows(session, cfg, disabled), files, allowedMentions: { repliedUser: false } };
}

async function buildRpsBetPayload(session, cfg, notice = "") {
  const attachment = defaultIdleCache ? attachmentFromCache(defaultIdleCache) : await resolvePanelAttachment(session, false);
  const embed = buildEmbed(session, notice, false);
  if (attachment.image && attachment.files?.length && !attachment.isGif) {
    embed.setImage(attachment.image);
  }
  return { embeds: [embed], components: buildRows(session, cfg, false), files: attachment.files, allowedMentions: { repliedUser: false } };
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

module.exports = {
  SESSION_TTL_MS,
  buildRpsBetPayload,
  buildRpsGuiPayload,
  clampBet,
  deleteSession,
  economyConfig,
  formatRpsRoundNotice,
  getSession,
  interactionMessageAdapter,
  isRpsGuiCustomId,
  makeSession,
  parseRpsGuiCustomId,
  playRpsSession,
  scheduleRpsIdlePanel,
  setSession,
  spinAnimationDurationMs,
  warmupRpsPanel,
};