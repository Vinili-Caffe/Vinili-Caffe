const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload");
const { runEconomyRender } = require("../../../shared/render/economyRenderQueue");
const { formatEconomyAmount } = require("./economyDisplayHelpers");
const { buildBetAmountButton, betBounds, clampBetAmount } = require("./economyBetModal");
const { economyConfig, playCoinflip } = require("../../Services/Community/activeEconomyService");
const { markSessionStakeCooldown, sessionSpendOptions } = require("./economyCommandHelpers");
const { createPersistedGuiSessionApi, SESSION_DB_TTL_MS } = require("../../Services/Community/economyGuiSessionStore");
const { normalizeCoinChoice, sideLabel } = require("./coinflipEngine");
const PREFIX = "coinflip_gui";
const SESSION_TTL_MS = SESSION_DB_TTL_MS;
const IDLE_CACHE_KEY = "png:idle";
const { setSession, getSession, deleteSession } = createPersistedGuiSessionApi("coinflip", { ttlMs: SESSION_TTL_MS });
const renderCache = new Map();
let defaultIdleCache = null;
let warmupPromise = null;

function now() {
  return Date.now();
}

function clampBet(value, cfg, balance = null) {
  return clampBetAmount(value, cfg, balance);
}

function betStep(cfg) {
  return Math.max(1, Math.floor(Number(cfg?.minBet) || 5));
}

function makeSession({ ownerId, guildId, bet, cfg }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    bet: clampBet(bet, cfg),
    lastResult: null,
    panelAnimating: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

function controlId(action, ownerId) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isCoinflipGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseCoinflipGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2] };
}

function buildRows(session, cfg, disabled = false, balance = null) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const { min, max } = betBounds(cfg, balance);
  const locked = disabled || Boolean(session.panelAnimating);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("minus", ownerId)).setLabel(`-${step}`).setEmoji("➖").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.bet <= min),
      buildBetAmountButton(controlId("bet", ownerId), { disabled: locked }),
      new ButtonBuilder().setCustomId(controlId("plus", ownerId)).setLabel(`+${step}`).setEmoji("➕").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.bet >= max),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("testa", ownerId)).setLabel("Testa").setEmoji("👑").setStyle(ButtonStyle.Primary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("croce", ownerId)).setLabel("Croce").setEmoji("🪙").setStyle(ButtonStyle.Primary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(disabled),
    ),
  ];
}

function renderCacheKey(session, animating) {
  const last = session.lastResult;
  const bet = Math.max(0, Math.floor(Number(session.bet) || 0));
  if (!last) return `idle:${bet}`;
  return `${animating ? "gif" : "png"}:${last.result?.player}:${last.result?.flip}:${last.win}:${bet}`;
}

function attachmentFromCache(hit) {
  if (!hit?.buffer?.length) return { files: [], image: null, isGif: false };
  const files = [new AttachmentBuilder(Buffer.from(hit.buffer), { name: hit.fileName })];
  return { files, image: `attachment://${hit.fileName}`, isGif: /\.gif$/i.test(hit.fileName) };
}

function rememberRenderCache(key, buffer, fileName) {
  renderCache.set(key, { buffer, fileName });
  if (renderCache.size > 48) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
}

async function renderCoinflipAttachment(session, { animating = false } = {}) {
  const last = session.lastResult;
  const key = renderCacheKey(session, Boolean(animating && last));
  const hit = renderCache.get(key);
  if (hit) return attachmentFromCache(hit);
  try {
    const renderCoinflipCanvas = require("../Render/coinflipCanvas");
    const rendered = await runEconomyRender(() =>
      renderCoinflipCanvas({
      bet: session.bet,
      playerChoice: last?.result?.player || "",
      flipResult: last?.result?.flip || "",
      hasResult: Boolean(last),
      win: Boolean(last?.win),
      payout: Math.max(0, Math.floor(Number(last?.payout) || 0)),
      animating: Boolean(animating && last),
    }),
    );
    const fileName = rendered.format === "gif" ? "coinflip-spin.gif" : "coinflip-panel.png";
    rememberRenderCache(key, rendered.buffer, fileName);
    return attachmentFromCache(renderCache.get(key));
  } catch (error) {
    global.logger?.warn?.("[COINFLIP GUI] render:", error?.message || error);
    if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
    return { files: [], image: null, isGif: false };
  }
}

async function resolvePanelAttachment(session, animating = false) {
    const out = await renderCoinflipAttachment(session, { animating });
  if (out.files?.length) return out;
  if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
  return out;
}

function spinAnimationDurationMs() {
  try {
    const renderCoinflipCanvas = require("../Render/coinflipCanvas");
    if (typeof renderCoinflipCanvas.spinAnimationDurationMs === "function") {
      return renderCoinflipCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 2600;
}

async function warmupCoinflipPanel() {
  if (defaultIdleCache) return;
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try {
      const renderCoinflipCanvas = require("../Render/coinflipCanvas");
      if (typeof renderCoinflipCanvas.warmup === "function") renderCoinflipCanvas.warmup();
      const rendered = await renderCoinflipCanvas({ bet: 0, hasResult: false });
      const fileName = "coinflip-panel.png";
      defaultIdleCache = { buffer: rendered.buffer, fileName, image: `attachment://${fileName}`, isGif: false };
      rememberRenderCache(IDLE_CACHE_KEY, defaultIdleCache.buffer, fileName);
    } catch (_) {}
  })();
  return warmupPromise;
}

setImmediate(() => {
  warmupCoinflipPanel().catch(() => {});
});

function scheduleCoinflipIdlePanel(message, session, cfg, notice = "", disabled = false) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  setTimeout(() => {
    void getSession(messageId, session?.guildId, session?.ownerId).then((live) => {
      if (!live) return;
      live.panelAnimating = false;
      setSession(messageId, live);
      buildCoinflipGuiPayload(live, cfg, notice, disabled, false)
        .then((payload) => message.edit(payload).catch(() => {}))
        .catch(() => {});
    });
  }, spinAnimationDurationMs());
}

function formatCoinflipNotice(result) {
  if (!result?.ok) return "";
  if (result.win) return `🏆 **${sideLabel(result.result.player)}** — esce **${sideLabel(result.result.flip)}**. Hai vinto **${formatEconomyAmount(result.payout)}**.`;
  return `<a:VC_Cross:1482532424570376253> **${sideLabel(result.result.player)}** — esce **${sideLabel(result.result.flip)}**. Hai perso.\n<a:VC_pixeltime:1482535344103620771> Puoi rigiocare quando il cooldown lo permette.`;
}

async function buildCoinflipGuiPayload(session, cfg, notice = "", disabled = false, animating = false, balance = null) {
  const attachment = await resolvePanelAttachment(session, animating);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, disabled, balance),
  });
}

function interactionMessageAdapter(interaction) {
  return {
    guild: interaction.guild,
    member: interaction.member,
    author: interaction.user,
  };
}

async function playCoinflipSession(client, messageLike, session, choice) {
  const result = await playCoinflip(client, messageLike, String(session.bet), choice, null, sessionSpendOptions(session));
  if (!result.ok) return { ok: false, message: result.message };
  markSessionStakeCooldown(session);
  session.lastResult = result;
  session.updatedAt = now();
  return { ok: true, result };
}

function normalizeQuickChoice(raw) {
  return normalizeCoinChoice(raw);
}

module.exports = { buildCoinflipGuiPayload, clampBet, deleteSession, economyConfig, formatCoinflipNotice, getSession, interactionMessageAdapter, isCoinflipGuiCustomId, makeSession, normalizeQuickChoice, parseCoinflipGuiCustomId, playCoinflipSession, scheduleCoinflipIdlePanel, setSession, warmupCoinflipPanel };