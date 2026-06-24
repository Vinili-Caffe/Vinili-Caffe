const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload");
const { formatCurrency } = require("../../Services/Community/serverWalletService");
const { economyConfig, payScratchWin, playScratchBet } = require("../../Services/Community/serverEconomyService");
const { allRevealed, emptyRevealed, evaluateCard, generateCard, symbolLabel } = require("./scratchEngine");
const PREFIX = "scratch_gui";
const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();

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
    phase: "idle",
    symbols: [],
    revealed: emptyRevealed(),
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

function isScratchGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseScratchGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  const action = parts[1];
  if (/^c\d$/.test(action)) return { action: "cell", cell: Number(action.slice(1)), ownerId: parts[2] };
  return { action, ownerId: parts[2] };
}

function buildRows(session, cfg, panelClosed = false) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 1));
  const max = Math.max(min, Math.floor(Number(cfg?.maxBet) || min));
  const locked = Boolean(panelClosed) || Boolean(session.panelAnimating);
  const idle = session.phase === "idle";
  const scratching = session.phase === "ready" && !session.panelAnimating;
  const done = session.phase === "done";
  const canAdjustBet = (idle || done) && !locked;
  const rows = [];
  if (scratching) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(controlId("c0", ownerId)).setLabel("1").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[0]),
        new ButtonBuilder().setCustomId(controlId("c1", ownerId)).setLabel("2").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[1]),
        new ButtonBuilder().setCustomId(controlId("c2", ownerId)).setLabel("3").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[2]),
        new ButtonBuilder().setCustomId(controlId("c3", ownerId)).setLabel("4").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[3]),
        new ButtonBuilder().setCustomId(controlId("c4", ownerId)).setLabel("5").setStyle(ButtonStyle.Primary).setDisabled(locked || session.revealed[4]),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(controlId("c5", ownerId)).setLabel("6").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[5]),
        new ButtonBuilder().setCustomId(controlId("c6", ownerId)).setLabel("7").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[6]),
        new ButtonBuilder().setCustomId(controlId("c7", ownerId)).setLabel("8").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[7]),
        new ButtonBuilder().setCustomId(controlId("c8", ownerId)).setLabel("9").setStyle(ButtonStyle.Secondary).setDisabled(locked || session.revealed[8]),
        new ButtonBuilder().setCustomId(controlId("reveal", ownerId)).setLabel("Gratta tutto").setEmoji("✨").setStyle(ButtonStyle.Success).setDisabled(locked),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("minus", ownerId)).setLabel(`-${step}`).setStyle(canAdjustBet && session.bet > min ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!canAdjustBet || session.bet <= min),
      new ButtonBuilder().setCustomId(controlId("plus", ownerId)).setLabel(`+${step}`).setStyle(canAdjustBet && session.bet < max ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(!canAdjustBet || session.bet >= max),
      new ButtonBuilder().setCustomId(controlId("buy", ownerId)).setLabel(done ? "Nuovo biglietto" : "Compra").setEmoji("🎫").setStyle(ButtonStyle.Success).setDisabled(locked || (!idle && !done)),
      new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(panelClosed),
    ),
  );
  return rows;
}

async function renderPanel(session) {
  const last = session.lastResult;
  try {
    const renderScratchCanvas = require("../Render/scratchCanvas");
    const rendered = await renderScratchCanvas({
      phase: session.phase,
      bet: session.bet,
      symbols: session.symbols,
      revealed: session.revealed,
      eval: last?.eval || null,
      payout: last?.payout || 0,
      animating: Boolean(session.panelAnimating),
    });
    const fileName = rendered.format === "gif" ? "scratch-card.gif" : "scratch-card.png";
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image: `attachment://${fileName}`, isGif: rendered.format === "gif" };
  } catch (error) {
    global.logger?.warn?.("[SCRATCH GUI] render:", error?.message || error);
    return { files: [], image: null, isGif: false };
  }
}

async function buildScratchGuiPayload(session, cfg, notice = "", panelClosed = false, animating = false) {
  const live = { ...session, panelAnimating: Boolean(animating || session.panelAnimating) };
  const attachment = await renderPanel(live);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, panelClosed),
  });
}

function spinAnimationDurationMs() {
  try {
    const renderScratchCanvas = require("../Render/scratchCanvas");
    if (typeof renderScratchCanvas.spinAnimationDurationMs === "function") {
      return renderScratchCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 2800;
}

function scheduleScratchRevealPanel(message, session, cfg, notice = "") {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  setTimeout(() => {
    const live = getSession(messageId);
    if (!live) return;
    live.panelAnimating = false;
    setSession(messageId, live);
    buildScratchGuiPayload(live, cfg, notice, false, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, spinAnimationDurationMs());
}

async function warmupScratchPanel() {
  try {
    const renderScratchCanvas = require("../Render/scratchCanvas");
    if (typeof renderScratchCanvas.warmup === "function") renderScratchCanvas.warmup();
    await renderScratchCanvas({ phase: "idle", bet: 10 });
  } catch (_) {}
}

setImmediate(() => {
  warmupScratchPanel().catch(() => {});
});

function interactionMessageAdapter(interaction) {
  return { guild: interaction.guild, member: interaction.member, author: interaction.user };
}

function resetForNewTicket(session) {
  session.phase = "idle";
  session.symbols = [];
  session.revealed = emptyRevealed();
  session.lastResult = null;
  session.panelAnimating = false;
  session.updatedAt = now();
}

async function settleTicket(client, messageLike, session, cfg) {
  const evalResult = evaluateCard(session.symbols, cfg);
  const payoutAmount = Math.floor(session.bet * evalResult.multiplier);
  let paid = null;
  if (payoutAmount > 0) {
    paid = await payScratchWin(client, messageLike, payoutAmount, evalResult.jackpot ? "scratch: jackpot" : "scratch: vincita");
  }
  const result = {
    ok: true,
    eval: evalResult,
    payout: payoutAmount,
    win: evalResult.win,
    paid,
  };
  session.lastResult = result;
  session.phase = "done";
  session.updatedAt = now();
  return result;
}

async function buyTicket(client, messageLike, session) {
  if (session.phase === "done") resetForNewTicket(session);
  if (session.phase !== "idle") return { ok: false, message: "Hai già un biglietto attivo." };
  const spent = await playScratchBet(client, messageLike, session.bet);
  if (!spent.ok) return spent;
  session.symbols = generateCard();
  session.revealed = emptyRevealed();
  session.lastResult = null;
  session.phase = "ready";
  session.updatedAt = now();
  return { ok: true, cfg: spent.cfg };
}

async function revealCell(client, messageLike, session, cellIndex, cfg) {
  if (session.phase !== "ready") return { ok: false, message: "Compra prima un biglietto." };
  const idx = Math.floor(Number(cellIndex));
  if (!Number.isFinite(idx) || idx < 0 || idx > 8) return { ok: false, message: "Zona non valida." };
  if (session.revealed[idx]) return { ok: false, message: "Zona già grattata." };
  session.revealed[idx] = true;
  session.updatedAt = now();
  if (allRevealed(session.revealed)) {
    const result = await settleTicket(client, messageLike, session, cfg);
    return { ok: true, finished: true, result };
  }
  return { ok: true, finished: false };
}

async function revealAll(client, messageLike, session, cfg) {
  if (session.phase !== "ready") return { ok: false, message: "Compra prima un biglietto." };
  for (let i = 0; i < 9; i += 1) session.revealed[i] = true;
  session.panelAnimating = true;
  session.updatedAt = now();
  const result = await settleTicket(client, messageLike, session, cfg);
  return { ok: true, animating: true, result };
}

function formatScratchNotice(result) {
  if (!result?.ok) return "";
  if (result.win) return `🏆 Hai vinto **${formatCurrency("caffe",result.payout)}** (${result.eval.max}× ${symbolLabel(result.eval.best)}).`;
  return "<a:VC_Cross:1482532424570376253> Biglietto senza premio.\n<a:VC_pixeltime:1482535344103620771> Puoi comprare un altro biglietto quando il cooldown lo permette.";
}

module.exports = { buildScratchGuiPayload, buyTicket, clampBet, deleteSession, economyConfig, formatScratchNotice, getSession, interactionMessageAdapter, isScratchGuiCustomId, makeSession, parseScratchGuiCustomId, resetForNewTicket, revealAll, revealCell, scheduleScratchRevealPanel, setSession, warmupScratchPanel };