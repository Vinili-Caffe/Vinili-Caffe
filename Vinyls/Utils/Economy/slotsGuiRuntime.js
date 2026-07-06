const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload");
const { formatCurrency } = require("../../Services/Community/serverWalletService");
const { cashoutSlotsBank, economyConfig, playSlotsBanked } = require("../../Services/Community/activeEconomyService");
const { clearSlotsGuiSession, loadSlotsGuiSessionByMessage, persistSlotsGuiSession } = require("../../Services/Community/slotsGuiSessionStore");
const PREFIX = "slots_gui";
const SESSION_TTL_MS = 15 * 60 * 1000;
const RENDER_CACHE_MAX = 64;
const sessions = new Map();
const renderCache = new Map();
let defaultIdleCache = null;

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

function makeSession({ ownerId, guildId, bet, cfg }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    bet: clampBet(bet, cfg),
    bank: 0,
    spins: 0,
    lastResult: null,
    panelAnimating: false,
    createdAt: now(),
    updatedAt: now(),
    cashedOut: false,
  };
}

function setSession(messageId, session) {
  const live = { ...session, updatedAt: now() };
  sessions.set(sessionKey(messageId), live);
  persistSlotsGuiSession(messageId, live).catch(() => {});
}

async function getSession(messageId, guildId) {
  const key = sessionKey(messageId);
  const cached = sessions.get(key);
  if (cached) {
    if (now() - Number(cached.updatedAt || cached.createdAt || 0) > SESSION_TTL_MS) {
      sessions.delete(key);
    } else {
      return cached;
    }
  }
  const g = String(guildId || "").trim();
  if (!g) return null;
  const restored = await loadSlotsGuiSessionByMessage(g, messageId);
  if (!restored) return null;
  sessions.set(key, restored);
  return restored;
}

function deleteSession(messageId, session) {
  sessions.delete(sessionKey(messageId));
  if (session?.guildId && session?.ownerId) {
    clearSlotsGuiSession(session.guildId, session.ownerId, messageId).catch(() => {});
  }
}

function controlId(action, ownerId) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isSlotsGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseSlotsGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2] };
}

function buildRows(session, cfg, disabled = false) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 1));
  const max = Math.max(min, Math.floor(Number(cfg?.maxBet) || min));
  const canCashout = !disabled && Number(session.bank || 0) > 0;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("minus", ownerId))
        .setLabel(`-${step}`)
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || session.bet <= min),
      new ButtonBuilder()
        .setCustomId(controlId("plus", ownerId))
        .setLabel(`+${step}`)
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || session.bet >= max),
      new ButtonBuilder()
        .setCustomId(controlId("spin", ownerId))
        .setLabel("Gira")
        .setEmoji("🎰")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || Boolean(session.panelAnimating)),
      new ButtonBuilder()
        .setCustomId(controlId("cashout", ownerId))
        .setLabel("Riscuoti")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Success)
        .setDisabled(!canCashout),
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
    const renderSlotsCanvas = require("../Render/slotsCanvas");
    if (typeof renderSlotsCanvas.spinAnimationDurationMs === "function") {
      return renderSlotsCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 4600;
}

function renderCacheKey(session, animating) {
  const last = session.lastResult;
  const reels = last?.result?.reels || ["🍒", "🍋", "🔔"];
  const bet = Math.max(0, Math.floor(Number(session.bet) || 0));
  const payout = Math.max(0, Math.floor(Number(last?.payout) || 0));
  const win = Boolean(last?.win);
  const hasResult = Boolean(last);
  if (animating && last) return `gif:${reels.join("|")}:${bet}:${payout}:${win ? 1 : 0}`;
  return `png:${reels.join("|")}:${bet}:${payout}:${win ? 1 : 0}:${hasResult ? 1 : 0}`;
}

function attachmentFromCache(entry) {
  if (!entry?.buffer?.length) return { files: [], image: null };
  const fileName = entry.fileName || "slots-panel.png";
  return {
    files: [new AttachmentBuilder(Buffer.from(entry.buffer), { name: fileName })],
    image: `attachment://${fileName}`,
  };
}

function rememberRenderCache(key, buffer, fileName) {
  renderCache.set(key, { buffer, fileName, image: `attachment://${fileName}` });
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
}

async function renderSlotsAttachment(session, { animating = false } = {}) {
  const last = session.lastResult;
  const key = renderCacheKey(session, Boolean(animating && last));
  const hit = renderCache.get(key);
  if (hit) return attachmentFromCache(hit);
  try {
    const renderSlotsCanvas = require("../Render/slotsCanvas");
    const rendered = await renderSlotsCanvas({
      reels: last?.result?.reels || ["🍒", "🍋", "🔔"],
      bet: session.bet,
      payout: last?.payout || 0,
      win: Boolean(last?.win),
      hasResult: Boolean(last),
      animating: Boolean(animating && last),
    });
    const fileName = rendered.format === "gif" ? "slots-panel.gif" : "slots-panel.png";
    rememberRenderCache(key, rendered.buffer, fileName);
    return attachmentFromCache(renderCache.get(key));
  } catch (error) {
    global.logger?.warn?.("[SLOTS GUI] render:", error?.message || error);
    if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
    return { files: [], image: null };
  }
}

async function resolvePanelAttachment(session, animating = false) {
  const out = await renderSlotsAttachment(session, { animating });
  if (out.files?.length) return out;
  if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
  return out;
}

async function warmupSlotsPanel() {
  try {
    const renderSlotsCanvas = require("../Render/slotsCanvas");
    if (typeof renderSlotsCanvas.warmup === "function") renderSlotsCanvas.warmup();
    if (defaultIdleCache) return;
    const rendered = await renderSlotsCanvas({
      reels: ["🍒", "🍋", "🔔"],
      bet: 5,
      payout: 0,
      win: false,
      hasResult: false,
      animating: false,
    });
    const fileName = "slots-panel.png";
    defaultIdleCache = { buffer: rendered.buffer, fileName, image: `attachment://${fileName}` };
    rememberRenderCache("png:🍒|🍋|🔔:5:0:0:0", defaultIdleCache.buffer, fileName);
  } catch (_) {}
}

setImmediate(() => {
  warmupSlotsPanel().catch(() => {});
});

function scheduleSlotsIdlePanel(message, session, cfg, notice = "", disabled = false) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  const delayMs = spinAnimationDurationMs();
  setTimeout(() => {
    getSession(messageId, session.guildId).then((live) => {
    if (!live) return;
    live.panelAnimating = false;
    setSession(messageId, live);
    buildSlotsGuiPayload(live, cfg, notice, disabled, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
    }).catch(() => {});
  }, delayMs);
}

function formatSlotsSpinNotice(spinResult, session) {
  const bank = Math.max(0, Math.floor(Number(session?.bank) || 0));
  if (spinResult?.win) {
    return `💸 Vincita aggiunta al banco: **${formatCurrency("caffe",spinResult.payout)}**.\n💰 Clicca su **Riscuoti** per incassare.`;
  }
  if (bank > 0) {
    return `<a:VC_Cross:1482532424570376253> Ultimo giro perso.\n<a:VC_pixeltime:1482535344103620771> Puoi rigirare quando il cooldown lo permette.`;
  }
  return "<a:VC_Cross:1482532424570376253> Giro perso.\n<a:VC_pixeltime:1482535344103620771> Puoi rigirare quando il cooldown lo permette.";
}

async function buildSlotsGuiPayload(session, cfg, notice = "", disabled = false, animating = false) {
  const attachment = await resolvePanelAttachment(session, animating);
  if (!attachment.files?.length) global.logger?.warn?.("[SLOTS GUI] pannello senza immagine (canvas/cache vuoti)");
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, disabled),
  });
}

function interactionMessageAdapter(interaction) {
  return {
    guild: interaction.guild,
    member: interaction.member,
    author: interaction.user,
  };
}

async function spinSession(client, messageLike, session) {
  const result = await playSlotsBanked(client, messageLike, String(session.bet));
  if (!result.ok) return { ok: false, message: result.message };
  session.lastResult = result;
  session.spins += 1;
  session.bank += Math.max(0, Math.floor(Number(result.payout) || 0));
  session.updatedAt = now();
  return { ok: true, result };
}

async function cashoutSession(client, interaction, session, messageId) {
  const amount = Math.max(0, Math.floor(Number(session.bank) || 0));
  const out = await cashoutSlotsBank(client, interactionMessageAdapter(interaction), amount);
  if (!out.ok) return out;
  session.bank = 0;
  session.cashedOut = true;
  if (messageId) setSession(messageId, session);
  return out;
}

module.exports = { SESSION_TTL_MS, buildSlotsGuiPayload, cashoutSession, clampBet, deleteSession, economyConfig, formatSlotsSpinNotice, getSession, interactionMessageAdapter, isSlotsGuiCustomId, makeSession, parseSlotsGuiCustomId, scheduleSlotsIdlePanel, setSession, spinSession, spinAnimationDurationMs, warmupSlotsPanel };