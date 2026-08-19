const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload");
const { formatEconomyAmount, formatEconomyAmountShort } = require("./economyDisplayHelpers");
const { buildBetAmountButton, betBounds, clampBetAmount } = require("./economyBetModal");
const { economyConfig, payBlackjackWin, playBlackjackBet, refundEconomyStake } = require("../../Services/Community/activeEconomyService");
const { markSessionStakeCooldown, sessionSpendOptions } = require("./economyCommandHelpers");
const { createPersistedGuiSessionApi, SESSION_DB_TTL_MS } = require("../../Services/Community/economyGuiSessionStore");
const { compareOutcome, dealerShouldHit, drawCard, freshShoe, handLabel, handValue, isNaturalBlackjack, payoutMultiplier } = require("./blackjackEngine");
const { runEconomyRender } = require("../../../shared/render/economyRenderQueue");
const PREFIX = "blackjack_gui";
const SESSION_TTL_MS = SESSION_DB_TTL_MS;
const { setSession, getSession, deleteSession } = createPersistedGuiSessionApi("blackjack", { ttlMs: SESSION_TTL_MS });

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
    shoe: [],
    playerHand: [],
    dealerHand: [],
    hideDealerHole: false,
    doubled: false,
    totalWager: 0,
    canDouble: false,
    lastResult: null,
    updatedAt: now(),
    createdAt: now(),
  };
}

function controlId(action, ownerId) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isBlackjackGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseBlackjackGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2] };
}

function totalWager(session) {
  return Math.max(0, Math.floor(Number(session.totalWager) || session.bet * (session.doubled ? 2 : 1)));
}

function netProfit(result) {
  const payout = Math.max(0, Math.floor(Number(result?.payout) || 0));
  const wager = Math.max(0, Math.floor(Number(result?.wager) || 0));
  return Math.max(0, payout - wager);
}

function displayBet(session) {
  if (session.phase === "playing" || session.phase === "dealer") return totalWager(session);
  // Fine mano: mostra lo stake reale (incluso raddoppio), non la puntata della prossima.
  if (session.phase === "done") {
    const lastWager = Math.floor(Number(session.lastResult?.wager) || 0);
    if (lastWager > 0) return lastWager;
    return totalWager(session);
  }
  return Math.max(0, Math.floor(Number(session.bet) || 0));
}

function buildRows(session, cfg, panelClosed = false, balance = null) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const { min, max } = betBounds(cfg, balance);
  const canConfigure = session.phase === "idle" || session.phase === "done";
  const playing = session.phase === "playing";
  const locked = Boolean(panelClosed);
  const rowBet = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(controlId("minus", ownerId)).setLabel(`-${step}`).setEmoji("➖").setStyle(ButtonStyle.Secondary).setDisabled(locked || !canConfigure || session.bet <= min),
    buildBetAmountButton(controlId("bet", ownerId), { disabled: locked || !canConfigure }),
    new ButtonBuilder().setCustomId(controlId("plus", ownerId)).setLabel(`+${step}`).setEmoji("➕").setStyle(ButtonStyle.Secondary).setDisabled(locked || !canConfigure || session.bet >= max),
    new ButtonBuilder().setCustomId(controlId("deal", ownerId)).setLabel(session.phase === "done" ? "Nuova mano" : "Distribuisci").setEmoji("🃏").setStyle(ButtonStyle.Success).setDisabled(locked || !canConfigure),
    new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
  );
  if (!playing) return [rowBet];
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("hit", ownerId)).setLabel("Carta").setEmoji("➕").setStyle(ButtonStyle.Primary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("stand", ownerId)).setLabel("Stai").setEmoji("✋").setStyle(ButtonStyle.Secondary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("double", ownerId)).setLabel("Raddoppia").setEmoji("💎").setStyle(ButtonStyle.Success).setDisabled(locked || !session.canDouble),
      new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
    ),
  ];
}

async function renderPanel(session, cfg) {
  const last = session.lastResult;
  const hideDealerHole = session.hideDealerHole && session.phase !== "done";
  let resultLabel = "";
  if (session.phase === "done" && last) {
    if (last.outcome === "blackjack") resultLabel = `Blackjack! +${formatEconomyAmountShort(netProfit(last))}`;
    else if (last.outcome === "win") resultLabel = `Vittoria +${formatEconomyAmountShort(netProfit(last))}`;
    else if (last.outcome === "push") resultLabel = `Pareggio ${formatEconomyAmountShort(last.payout)}`;
    else resultLabel = "Sconfitta";
  }
  try {
    const renderBlackjackCanvas = require("../Render/blackjackCanvas");
    const rendered = await runEconomyRender(() =>
      renderBlackjackCanvas({
      bet: displayBet(session),
      doubled: Boolean(session.doubled) && session.phase !== "idle",
      phase: session.phase,
      playerHand: session.playerHand,
      dealerHand: session.dealerHand,
      hideDealerHole,
      resultLabel,
      win: last?.outcome === "win" || last?.outcome === "blackjack",
      draw: last?.outcome === "push",
    }),
    );
    const fileName = "blackjack-panel.png";
    const image = `attachment://${fileName}`;
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image };
  } catch (error) {
    global.logger?.warn?.("[BLACKJACK GUI] render:", error?.message || error);
    return { files: [], image: null };
  }
}

async function buildBlackjackGuiPayload(session, cfg, notice = "", panelClosed = false, balance = null) {
  const attachment = await renderPanel(session, cfg);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, panelClosed, balance),
  });
}

async function warmupBlackjackPanel() {
  try {
    const renderBlackjackCanvas = require("../Render/blackjackCanvas");
    if (typeof renderBlackjackCanvas.warmup === "function") renderBlackjackCanvas.warmup();
    const rendered = await renderBlackjackCanvas({ phase: "idle", bet: 10 });
  } catch (_) {}
}

setImmediate(() => {
  warmupBlackjackPanel().catch(() => {});
});

function interactionMessageAdapter(interaction) {
  return { guild: interaction.guild, member: interaction.member, author: interaction.user };
}

async function settleHand(client, messageLike, session, cfg) {
  const cmp = compareOutcome(session.playerHand, session.dealerHand);
  const wager = totalWager(session);
  const mult = payoutMultiplier(cmp.outcome, cfg);
  const payoutAmount = Math.floor(wager * mult);
  let paid = null;
  if (payoutAmount > 0) {
    paid = await payBlackjackWin(client, messageLike, payoutAmount, `blackjack: ${cmp.outcome}`);
  }
  const result = {
    ok: true,
    outcome: cmp.outcome,
    payout: payoutAmount,
    wager,
    profit: Math.max(0, payoutAmount - wager),
    win: mult > 1,
    draw: cmp.outcome === "push",
    paid,
    playerTotal: handValue(session.playerHand).total,
    dealerTotal: handValue(session.dealerHand).total,
  };
  session.lastResult = result;
  session.phase = "done";
  session.hideDealerHole = false;
  session.canDouble = false;
  session.updatedAt = now();
  return result;
}

async function runDealerTurn(session) {
  session.hideDealerHole = false;
  while (dealerShouldHit(session.dealerHand)) {
    const drawn = drawCard(session.shoe);
    session.shoe = drawn.shoe;
    session.dealerHand.push(drawn.card);
  }
  session.phase = "dealer";
}

async function finishAfterStand(client, messageLike, session, cfg) {
  await runDealerTurn(session);
  return settleHand(client, messageLike, session, cfg);
}

async function checkInstantBlackjack(client, messageLike, session, cfg) {
  if (!isNaturalBlackjack(session.playerHand)) return null;
  session.hideDealerHole = false;
  return settleHand(client, messageLike, session, cfg);
}

async function startHand(client, messageLike, session) {
  if (session.phase === "done") resetSessionForNewRound(session);
  if (session.phase !== "idle") return { ok: false, message: "La mano è già in corso." };
  const spent = await playBlackjackBet(client, messageLike, session.bet, null, sessionSpendOptions(session));
  if (!spent.ok) return spent;
  markSessionStakeCooldown(session);
  let shoe = freshShoe();
  const draw = () => {
    const out = drawCard(shoe);
    shoe = out.shoe;
    return out.card;
  };
  session.shoe = shoe;
  session.playerHand = [draw(), draw()];
  session.dealerHand = [draw(), draw()];
  session.shoe = shoe;
  session.totalWager = spent.amount;
  session.doubled = false;
  session.hideDealerHole = true;
  session.canDouble = true;
  session.lastResult = null;
  session.phase = "playing";
  session.updatedAt = now();
  const instant = await checkInstantBlackjack(client, messageLike, session, spent.cfg);
  if (instant) {
    return { ok: true, instant: true, result: instant };
  }
  if (isNaturalBlackjack(session.dealerHand)) {
    session.hideDealerHole = false;
    const ended = await settleHand(client, messageLike, session, spent.cfg);
    return { ok: true, instant: true, result: ended };
  }
  return { ok: true, instant: false };
}

async function hitHand(client, messageLike, session, cfg) {
  if (session.phase !== "playing") return { ok: false, message: "Non puoi pescare ora." };
  session.canDouble = false;
  const drawn = drawCard(session.shoe);
  session.shoe = drawn.shoe;
  session.playerHand.push(drawn.card);
  const total = handValue(session.playerHand).total;
  if (total > 21) {
    session.hideDealerHole = false;
    session.phase = "dealer";
    const result = await settleHand(client, messageLike, session, cfg);
    return { ok: true, bust: true, result };
  }
  if (total === 21) {
    const result = await finishAfterStand(client, messageLike, session, cfg);
    return { ok: true, autoStand: true, result };
  }
  return { ok: true };
}

async function standHand(client, messageLike, session, cfg) {
  if (session.phase !== "playing") return { ok: false, message: "Non puoi stare ora." };
  session.canDouble = false;
  const result = await finishAfterStand(client, messageLike, session, cfg);
  return { ok: true, result };
}

async function doubleHand(client, messageLike, session, cfg) {
  if (session.phase !== "playing" || !session.canDouble) return { ok: false, message: "Non puoi raddoppiare ora." };
  if (session.playerHand.length !== 2) return { ok: false, message: "Il raddoppio è solo sulla mano iniziale." };
  const extra = await playBlackjackBet(client, messageLike, session.bet, null, sessionSpendOptions(session));
  if (!extra.ok) return extra;
  markSessionStakeCooldown(session);
  session.totalWager = Math.max(0, Number(session.totalWager) || 0) + extra.amount;
  session.doubled = true;
  session.canDouble = false;
  const drawn = drawCard(session.shoe);
  session.shoe = drawn.shoe;
  session.playerHand.push(drawn.card);
  const total = handValue(session.playerHand).total;
  session.hideDealerHole = false;
  if (total > 21) {
    session.phase = "dealer";
    const result = await settleHand(client, messageLike, session, cfg);
    return { ok: true, bust: true, result };
  }
  const result = await finishAfterStand(client, messageLike, session, cfg);
  return { ok: true, result };
}

function formatRoundNotice(result) {
  if (!result?.ok) return "";
  if (result.outcome === "blackjack") return `🃏 **Blackjack!** Hai vinto **${formatEconomyAmount(netProfit(result))}**.`;
  if (result.outcome === "win") return `🏆 Hai vinto **${formatEconomyAmount(netProfit(result))}**.`;
  if (result.outcome === "push") return `🤝 Pareggio: ti tornano **${formatEconomyAmount(result.payout)}**.`;
  return `<a:VC_Cross:1482532424570376253> Hai perso **${formatEconomyAmount(result.wager)}**.\n<a:VC_pixeltime:1482535344103620771> Puoi rigiocare quando il cooldown lo permette.`;
}

function resetSessionForNewRound(session) {
  session.phase = "idle";
  session.shoe = [];
  session.playerHand = [];
  session.dealerHand = [];
  session.hideDealerHole = false;
  session.doubled = false;
  session.totalWager = 0;
  session.canDouble = false;
  session.lastResult = null;
  session.updatedAt = now();
}

async function refundOpenHand(client, session, actorId) {
  if (session.phase !== "playing" && session.phase !== "dealer") return { ok: true, amount: 0 };
  const amount = totalWager(session);
  if (!amount) {
    resetSessionForNewRound(session);
    return { ok: true, amount: 0, abortedRound: true };
  }
  const paid = await refundEconomyStake(
    client,
    session.guildId,
    session.ownerId,
    amount,
    actorId || session.ownerId,
    null,
    "blackjack: rimborso chiusura",
    "economy_blackjack_refund",
  );
  if (!paid?.ok) return { ok: false, message: paid?.message || "Rimborso non riuscito.", amount: 0, abortedRound: true };
  resetSessionForNewRound(session);
  return { ok: true, amount, abortedRound: true };
}

module.exports = { SESSION_TTL_MS, buildBlackjackGuiPayload, clampBet, deleteSession, doubleHand, economyConfig, formatRoundNotice, getSession, hitHand, interactionMessageAdapter, isBlackjackGuiCustomId, makeSession, parseBlackjackGuiCustomId, refundOpenHand, resetSessionForNewRound, setSession, standHand, startHand, warmupBlackjackPanel };