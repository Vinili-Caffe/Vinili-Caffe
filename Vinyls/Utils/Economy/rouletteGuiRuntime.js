const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { economyConfig, normalizeRouletteChoice, playRoulette } = require("../../Services/Community/galeoniEconomyService");
const PREFIX = "roulette_gui";
const SESSION_TTL_MS = 10 * 60 * 1000;
const RENDER_CACHE_MAX = 64;
const IDLE_CACHE_KEY = "png:idle";
const SIMPLE_CHOICES = new Set(["rosso", "nero", "pari", "dispari"]);
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

function makeSession({ ownerId, guildId, bet, cfg, choice, isNumber }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    bet: clampBet(bet, cfg),
    choice: String(choice || "").trim().toLowerCase(),
    isNumber: Boolean(isNumber),
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

function isRouletteGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseRouletteGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2] };
}

function choiceLabel(session) {
  if (!session?.choice) return "—";
  if (session.isNumber) return `Numero ${session.choice}`;
  const map = { rosso: "Rosso", nero: "Nero", pari: "Pari", dispari: "Dispari" };
  return map[session.choice] || session.choice;
}

function setChoice(session, choiceRaw) {
  const parsed = normalizeRouletteChoice(choiceRaw);
  if (!parsed.ok) return parsed;
  session.choice = parsed.choice;
  session.isNumber = parsed.isNumber;
  session.updatedAt = now();
  return { ok: true };
}

function buildNumberSelect(action, ownerId, from, to, disabled) {
  const options = [];
  for (let n = from; n <= to; n += 1) {
    options.push({ label: String(n), value: String(n) });
  }
  return new StringSelectMenuBuilder()
    .setCustomId(controlId(action, ownerId))
    .setPlaceholder(from === 0 ? "Numero 0–24" : "Numero 25–36")
    .addOptions(options)
    .setDisabled(disabled);
}

function buildRows(session, cfg, disabled = false) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 1));
  const max = Math.max(min, Math.floor(Number(cfg?.maxBet) || min));
  const locked = disabled || Boolean(session.panelAnimating);
  const hasChoice = Boolean(session.choice);
  const choiceStyle = (id) => (session.choice === id && !session.isNumber ? ButtonStyle.Success : ButtonStyle.Secondary);
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
        .setCustomId(controlId("spin", ownerId))
        .setLabel("Gira")
        .setEmoji("🎡")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(locked || !hasChoice),
      new ButtonBuilder()
        .setCustomId(controlId("close", ownerId))
        .setLabel("Chiudi")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("rosso", ownerId)).setLabel("Rosso").setEmoji("🔴").setStyle(choiceStyle("rosso")).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("nero", ownerId)).setLabel("Nero").setEmoji("⚫").setStyle(choiceStyle("nero")).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("pari", ownerId)).setLabel("Pari").setEmoji("2️⃣").setStyle(choiceStyle("pari")).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("dispari", ownerId)).setLabel("Dispari").setEmoji("1️⃣").setStyle(choiceStyle("dispari")).setDisabled(locked),
    ),
    new ActionRowBuilder().addComponents(buildNumberSelect("num_lo", ownerId, 0, 24, locked)),
    new ActionRowBuilder().addComponents(buildNumberSelect("num_hi", ownerId, 25, 36, locked)),
  ];
}

function spinAnimationDurationMs() {
  try {
    const renderRouletteCanvas = require("../Render/rouletteCanvas");
    if (typeof renderRouletteCanvas.spinAnimationDurationMs === "function") {
      return renderRouletteCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 3600;
}

function renderCacheKey(session, animating, previewSpin = false) {
  const last = session.lastResult;
  const spin = last?.result || {};
  if (!last) return IDLE_CACHE_KEY;
  const choice = session.choice || "";
  if (previewSpin) {
    return "preview:spinning";
  }
  if (animating && last) {
    return `gif:${spin.number}|${spin.color}:${choice}:${last.win ? 1 : 0}`;
  }
  return `png:${spin.number}|${spin.color}:${choice}:${last.win ? 1 : 0}`;
}

function attachmentFromCache(entry) {
  if (!entry?.buffer?.length) return { files: [], image: null, isGif: false };
  const fileName = entry.fileName || "roulette-panel.png";
  const isGif = fileName.endsWith(".gif");
  return {
    files: [new AttachmentBuilder(Buffer.from(entry.buffer), { name: fileName })],
    image: `attachment://${fileName}`,
    isGif,
  };
}

function rememberRenderCache(key, buffer, fileName) {
  renderCache.set(key, { buffer, fileName, image: `attachment://${fileName}`, isGif: fileName.endsWith(".gif") });
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
}

async function renderRouletteAttachment(session, { animating = false, previewSpin = false } = {}) {
  const last = session.lastResult;
  const key = renderCacheKey(session, Boolean(animating && last), previewSpin);
  const hit = renderCache.get(key);
  if (hit) return attachmentFromCache(hit);
  try {
    const renderRouletteCanvas = require("../Render/rouletteCanvas");
    const rendered = await renderRouletteCanvas({
      bet: session.bet,
      playerChoice: session.choice,
      isNumber: session.isNumber,
      spinResult: last?.result || {},
      win: Boolean(last?.win),
      payout: last?.payout || 0,
      hasResult: Boolean(last),
      animating: Boolean(animating && last),
      previewSpin: Boolean(previewSpin && last),
    });
    const fileName = rendered.format === "gif" ? "roulette-spin.gif" : "roulette-panel.png";
    rememberRenderCache(key, rendered.buffer, fileName);
    return attachmentFromCache(renderCache.get(key));
  } catch (error) {
    global.logger?.warn?.("[ROULETTE GUI] render:", error?.message || error);
    if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
    return { files: [], image: null, isGif: false };
  }
}

async function resolvePanelAttachment(session, animating = false, previewSpin = false) {
  if (!session.lastResult && !animating && !previewSpin && defaultIdleCache) {
    return attachmentFromCache(defaultIdleCache);
  }
  const out = await renderRouletteAttachment(session, { animating, previewSpin });
  if (out.files?.length) return out;
  if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
  return out;
}

async function warmupRoulettePanel() {
  if (defaultIdleCache) return;
  if (warmupPromise) return warmupPromise;
  warmupPromise = (async () => {
    try {
      const renderRouletteCanvas = require("../Render/rouletteCanvas");
      if (typeof renderRouletteCanvas.warmup === "function") renderRouletteCanvas.warmup();
      const rendered = await renderRouletteCanvas({
        bet: 0,
        playerChoice: "",
        hasResult: false,
        animating: false,
      });
      const fileName = "roulette-panel.png";
      defaultIdleCache = { buffer: rendered.buffer, fileName, image: `attachment://${fileName}`, isGif: false };
      rememberRenderCache(IDLE_CACHE_KEY, defaultIdleCache.buffer, fileName);
    } catch (_) {}
  })();
  return warmupPromise;
}

setImmediate(() => {
  warmupRoulettePanel().catch(() => {});
});

function scheduleRouletteIdlePanel(message, session, cfg, notice = "", disabled = false, delayMs = null) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  const waitMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : spinAnimationDurationMs();
  setTimeout(() => {
    const live = getSession(messageId);
    if (!live) return;
    live.panelAnimating = false;
    setSession(messageId, live);
    buildRouletteGuiPayload(live, cfg, notice, disabled, false, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, waitMs);
}

async function pushRouletteSpinGif(message, session, cfg, spinNotice, finalNotice, opts = {}) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  const skipPlaceholder = Boolean(opts.skipPlaceholder);
  const gifStarted = Date.now();
  try {
    const gifPromise = opts.gifPromise || buildRouletteGuiPayload(session, cfg, spinNotice, false, true, false);
    if (!skipPlaceholder) {
      const placeholderPayload = await buildRouletteGuiPayload(session, cfg, spinNotice, false, false, true);
      await message.edit(placeholderPayload).catch(() => {});
    }
    const payload = await gifPromise;
    await message.edit(payload).catch(() => {});
    const remaining = Math.max(0, spinAnimationDurationMs() - (Date.now() - gifStarted));
    scheduleRouletteIdlePanel(message, session, cfg, finalNotice, false, remaining);
  } catch (error) {
    global.logger?.warn?.("[ROULETTE GUI] spin gif:", error?.message || error);
    scheduleRouletteIdlePanel(message, session, cfg, finalNotice, false, 0);
  }
}

function formatRouletteSpinNotice(result) {
  if (!result?.ok) return "";
  const spin = result.result || {};
  if (result.win) return `🏆 È uscito **${spin.number} ${spin.color}** — hai vinto **${formatGaleoni(result.payout)}**.`;
  return `<a:VC_Cross:1482532424570376253> È uscito **${spin.number} ${spin.color} (${spin.evenOdd})**.\n<a:VC_pixeltime:1482535344103620771> Puoi rigiocare quando il cooldown lo permette.`;
}

async function buildRouletteGuiPayload(session, cfg, notice = "", disabled = false, animating = false, previewSpin = false) {
  const attachment = await resolvePanelAttachment(session, animating, previewSpin);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, disabled),
  });
}

async function buildRouletteBetPayload(session, cfg, notice = "") {
  const attachment = defaultIdleCache ? attachmentFromCache(defaultIdleCache) : await resolvePanelAttachment(session, false);
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

async function spinRouletteSession(client, messageLike, session) {
  if (!session.choice) return { ok: false, message: "Scegli prima una puntata (rosso, nero, pari, dispari o numero)." };
  const result = await playRoulette(client, messageLike, String(session.bet), session.choice);
  if (!result.ok) return { ok: false, message: result.message };
  session.lastResult = result;
  session.updatedAt = now();
  return { ok: true, result: session.lastResult };
}

function normalizeQuickChoice(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (["red", "rosso"].includes(v)) return "rosso";
  if (["black", "nero"].includes(v)) return "nero";
  if (["even", "pari"].includes(v)) return "pari";
  if (["odd", "dispari"].includes(v)) return "dispari";
  if (/^\d{1,2}$/.test(v) && Number(v) >= 0 && Number(v) <= 36) return String(Number(v));
  return "";
}

module.exports = { SESSION_TTL_MS, SIMPLE_CHOICES, buildRouletteBetPayload, buildRouletteGuiPayload, clampBet, choiceLabel, deleteSession, economyConfig, formatRouletteSpinNotice, getSession, interactionMessageAdapter, isRouletteGuiCustomId, makeSession, normalizeQuickChoice, parseRouletteGuiCustomId, pushRouletteSpinGif, scheduleRouletteIdlePanel, setChoice, setSession, spinAnimationDurationMs, spinRouletteSession, warmupRoulettePanel };