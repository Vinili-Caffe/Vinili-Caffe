const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload");
const { formatEconomyAmount } = require("./economyDisplayHelpers");
const { buildBetAmountButton, betBounds, clampBetAmount } = require("./economyBetModal");
const { economyConfig, payScratchWin, playScratchBet, refundEconomyStake } = require("../../Services/Community/activeEconomyService");
const { markSessionStakeCooldown, sessionSpendOptions } = require("./economyCommandHelpers");
const { createPersistedGuiSessionApi, SESSION_DB_TTL_MS } = require("../../Services/Community/economyGuiSessionStore");
const { allRevealed, emptyRevealed, evaluateCard, generateCard, symbolLabel } = require("./scratchEngine");
const { runEconomyRender } = require("../../../shared/render/economyRenderQueue");
const PREFIX = "scratch_gui";
const SESSION_TTL_MS = SESSION_DB_TTL_MS;
const { setSession, getSession, deleteSession } = createPersistedGuiSessionApi("scratch", { ttlMs: SESSION_TTL_MS });

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
    phase: "idle",
    symbols: [],
    revealed: emptyRevealed(),
    lastResult: null,
    panelAnimating: false,
    createdAt: now(),
    updatedAt: now(),
  };
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

function buildRows(session, cfg, panelClosed = false, balance = null) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const { min, max } = betBounds(cfg, balance);
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
      buildBetAmountButton(controlId("bet", ownerId), { disabled: !canAdjustBet }),
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
    const rendered = await runEconomyRender(() =>
      renderScratchCanvas({
      phase: session.phase,
      bet: session.bet,
      symbols: session.symbols,
      revealed: session.revealed,
      eval: last?.eval || null,
      payout: last?.payout || 0,
      animating: Boolean(session.panelAnimating),
    }),
    );
    const fileName = rendered.format === "gif" ? "scratch-card.gif" : "scratch-card.png";
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image: `attachment://${fileName}`, isGif: rendered.format === "gif" };
  } catch (error) {
    global.logger?.warn?.("[SCRATCH GUI] render:", error?.message || error);
    return { files: [], image: null, isGif: false };
  }
}

async function buildScratchGuiPayload(session, cfg, notice = "", panelClosed = false, animating = false, balance = null) {
  const live = { ...session, panelAnimating: Boolean(animating || session.panelAnimating) };
  const attachment = await renderPanel(live);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, panelClosed, balance),
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
    void getSession(messageId, session?.guildId, session?.ownerId).then((live) => {
      if (!live) return;
      live.panelAnimating = false;
      setSession(messageId, live);
      buildScratchGuiPayload(live, cfg, notice, false, false)
        .then((payload) => message.edit(payload).catch(() => {}))
        .catch(() => {});
    });
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

async function refundOpenTicket(client, session, actorId) {
  if (session.phase !== "ready") return { ok: true, amount: 0 };
  const amount = Math.max(0, Math.floor(Number(session.bet) || 0));
  if (!amount) {
    resetForNewTicket(session);
    return { ok: true, amount: 0, abortedRound: true };
  }
  const paid = await refundEconomyStake(
    client,
    session.guildId,
    session.ownerId,
    amount,
    actorId || session.ownerId,
    null,
    "scratch: rimborso chiusura",
    "economy_scratch_refund",
  );
  if (!paid?.ok) return { ok: false, message: paid?.message || "Rimborso non riuscito.", amount: 0, abortedRound: true };
  resetForNewTicket(session);
  return { ok: true, amount, abortedRound: true };
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
  const spent = await playScratchBet(client, messageLike, session.bet, null, sessionSpendOptions(session));
  if (!spent.ok) return spent;
  markSessionStakeCooldown(session);
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
  if (result.win) return `🏆 Hai vinto **${formatEconomyAmount(result.payout)}** (${result.eval.max}× ${symbolLabel(result.eval.best)}).`;
  return "<a:VC_Cross:1482532424570376253> Nessun premio: servono **3 simboli uguali**.\n<a:VC_pixeltime:1482535344103620771> Puoi comprare un altro biglietto quando il cooldown lo permette.";
}

module.exports = { buildScratchGuiPayload, buyTicket, clampBet, deleteSession, economyConfig, formatScratchNotice, getSession, interactionMessageAdapter, isScratchGuiCustomId, makeSession, parseScratchGuiCustomId, refundOpenTicket, resetForNewTicket, revealAll, revealCell, scheduleScratchRevealPanel, setSession, warmupScratchPanel };