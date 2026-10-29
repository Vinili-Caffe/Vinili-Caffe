const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { buildImageButtonPayload, canvasStatusLine } = require("./guiPanelPayload") as typeof import("./guiPanelPayload");
const { formatEconomyAmount, formatEconomyAmountShort } = require("./economyDisplayHelpers") as typeof import("./economyDisplayHelpers");
const { buildBetAmountButton, betBounds, clampBetAmount } = require("./economyBetModal") as typeof import("./economyBetModal");
const {
  economyConfig,
  lockTrisPvpStakes,
  payTrisWin,
  playTrisBet,
  refundEconomyStake,
  refundTrisPvpStake,
  settleTrisPvp,
} = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { markSessionStakeCooldown, sessionSpendOptions } = require("./economyCommandHelpers") as typeof import("./economyCommandHelpers");
const {
  BOT,
  PLAYER,
  applyMarkMove,
  applyPlayerMove,
  boardWinner,
  emptyBoard,
  markForChallenger,
  markForOpponent,
  outcomeLabel,
  pickBotMove,
} = require("./trisEngine") as typeof import("./trisEngine");
const { runEconomyRender } = require("../../../shared/render/economyRenderQueue") as typeof import("../../../shared/render/economyRenderQueue");
const { createPersistedGuiSessionApi, SESSION_DB_TTL_MS, listEconomyGuiSessions } = require("../../Services/Community/economyGuiSessionStore") as typeof import("../../Services/Community/economyGuiSessionStore");

const PREFIX = "tris_gui";
const SESSION_TTL_MS = SESSION_DB_TTL_MS;
const PVP_INVITE_TTL_MS = 90 * 1000;
const pvpUserLocks = new Map();
const sessionApi = createPersistedGuiSessionApi("tris", {
  ttlMs: SESSION_TTL_MS,
  onEvict: (session?) => releasePvpUsers(session),
});

function now() {
  return Date.now();
}

function sessionKey(messageId?) {
  return String(messageId || "").trim();
}

function clampBet(value?, cfg?, balance = null) {
  return clampBetAmount(value, cfg, balance);
}

function betStep(cfg?) {
  return Math.max(1, Math.floor(Number(cfg?.minBet) || 5));
}

function makeSession({ ownerId, guildId, bet, cfg, playerName, mode = "bot", opponentId = "", opponentName = "Rivale" }) {
  const isPvp = mode === "pvp";
  return {
    mode: isPvp ? "pvp" : "bot",
    ownerId: String(ownerId || ""),
    opponentId: String(opponentId || ""),
    guildId: String(guildId || ""),
    bet: clampBet(bet, cfg),
    playerName: String(playerName || "Tu").trim() || "Tu",
    opponentName: String(opponentName || "Rivale").trim() || "Rivale",
    phase: isPvp ? "pending" : "idle",
    board: emptyBoard(),
    wager: 0,
    stakesLocked: false,
    currentTurnId: "",
    lastResult: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function userLockKey(guildId?, userId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function bindPvpUsers(session?, messageId?) {
  const gid = String(session?.guildId || "");
  const mid = String(messageId || "");
  if (!gid || !mid || session.mode !== "pvp") return;
  const phase = String(session.phase || "");
    if (phase !== "pending" && phase !== "playing") return;
  pvpUserLocks.set(userLockKey(gid, session.ownerId), mid);
  pvpUserLocks.set(userLockKey(gid, session.opponentId), mid);
}

function releasePvpUsers(session?) {
  if (session?.mode !== "pvp") return;
  const gid = String(session.guildId || "");
  pvpUserLocks.delete(userLockKey(gid, session.ownerId));
  pvpUserLocks.delete(userLockKey(gid, session.opponentId));
}

function releasePvpLocksByMessageId(messageId?) {
  const mid = String(messageId || "").trim();
  if (!mid) return;
  for (const [key, value] of [...pvpUserLocks.entries()]) {
    if (value === mid) pvpUserLocks.delete(key);
  }
}

function findActiveTrisPvpMessageId(guildId?, userId?) {
  const key = userLockKey(guildId, userId);
  const mid = pvpUserLocks.get(key) || "";
  if (!mid) return "";
  const live = sessionApi.sessions?.get?.(mid);
  if (live) {
    const phase = String(live.phase || "");
    if (live.mode === "pvp" && (phase === "pending" || phase === "playing")) return mid;
    releasePvpUsers(live);
    releasePvpLocksByMessageId(mid);
    return "";
  }
    releasePvpLocksByMessageId(mid);
  return "";
}

function isParticipant(session?, userId?) {
  const uid = String(userId || "");
  return uid === String(session?.ownerId || "") || uid === String(session?.opponentId || "");
}

function markForUser(session?, userId?) {
  if (String(userId) === String(session.ownerId)) return markForChallenger();
  if (String(userId) === String(session.opponentId)) return markForOpponent();
  return null;
}

function displayNameForTurn(session?) {
  if (String(session.currentTurnId) === String(session.ownerId)) return session.playerName;
  if (String(session.currentTurnId) === String(session.opponentId)) return session.opponentName;
  return "—";
}

function setSession(messageId?, session?) {
  const live = sessionApi.setSession(messageId, session);
  bindPvpUsers(live, messageId);
  return live;
}

async function getSession(messageId?, guildId = "", ownerIdHint = "") {
  const live = await sessionApi.getSession(messageId, guildId, ownerIdHint);
  if (live) bindPvpUsers(live, live.messageId || messageId);
  return live;
}

function deleteSession(messageId?, session = null) {
  const mid = String(messageId || "").trim();
  if (session) releasePvpUsers(session);
  releasePvpLocksByMessageId(mid);
  return sessionApi.deleteSession(messageId, session);
}

function controlId(action?, ownerId?) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isTrisGuiCustomId(customId?) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseTrisGuiCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  const action = parts[1];
  if (/^c\d$/.test(action)) return { action: "cell", cell: Number(action.slice(1)), ownerId: parts[2] };
  return { action, ownerId: parts[2] };
}

function botRandomPct(cfg?) {
  const raw = Number(cfg?.tris?.botRandomPct);
  if (!Number.isFinite(raw)) return 0.35;
  const pct = raw > 1 ? raw / 100 : raw;
  return Math.max(0, Math.min(1, pct));
}

function cellButton(ownerId?, index?, board?, locked?, mark?) {
  const cellMark = board[index];
  const label = cellMark === PLAYER ? "X" : cellMark === BOT ? "O" : String(index + 1);
  const style = cellMark === PLAYER ? ButtonStyle.Primary : cellMark === BOT ? ButtonStyle.Danger : ButtonStyle.Secondary;
  const btn = new ButtonBuilder()
    .setCustomId(controlId(`c${index}`, ownerId))
    .setLabel(label)
    .setStyle(style)
    .setDisabled(locked || Boolean(cellMark));
  if (cellMark === PLAYER) btn.setEmoji("<:vegax:1443934876440068179>");
  else if (cellMark === BOT) btn.setEmoji("⭕");
  return btn;
}

function buildPvpInviteRows(session?, disabled = false) {
  const ownerId = session.ownerId;
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("accept", ownerId)).setLabel("Accetta sfida").setEmoji("<a:VC_Verified:1482532479637127188>").setStyle(ButtonStyle.Success).setDisabled(disabled),
      new ButtonBuilder().setCustomId(controlId("decline", ownerId)).setLabel("Rifiuta").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(disabled),
      new ButtonBuilder().setCustomId(controlId("cancel", ownerId)).setLabel("Annulla").setEmoji("🚫").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    ),
  ];
}

function buildRows(session?, cfg?, panelClosed = false, balance = null) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const { min, max } = betBounds(cfg, balance);
  const locked = Boolean(panelClosed);
  if (session.mode === "pvp") {
    if (session.phase === "pending") return buildPvpInviteRows(session, locked);
    if (session.phase === "playing") {
      const board = session.board || emptyBoard();
      const uid = String(session.currentTurnId || "");
      const boardLocked = locked;
      return [
        new ActionRowBuilder().addComponents(
          cellButton(ownerId, 0, board, boardLocked, null),
          cellButton(ownerId, 1, board, boardLocked, null),
          cellButton(ownerId, 2, board, boardLocked, null),
        ),
        new ActionRowBuilder().addComponents(
          cellButton(ownerId, 3, board, boardLocked, null),
          cellButton(ownerId, 4, board, boardLocked, null),
          cellButton(ownerId, 5, board, boardLocked, null),
        ),
        new ActionRowBuilder().addComponents(
          cellButton(ownerId, 6, board, boardLocked, null),
          cellButton(ownerId, 7, board, boardLocked, null),
          cellButton(ownerId, 8, board, boardLocked, null),
          new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
        ),
      ];
    }
    return [];
  }
  const playing = session.phase === "playing";
  const canConfigure = session.phase === "idle" || session.phase === "done";
  if (!playing) {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(controlId("minus", ownerId)).setLabel(`-${step}`).setEmoji("➖").setStyle(ButtonStyle.Secondary).setDisabled(locked || !canConfigure || session.bet <= min),
        buildBetAmountButton(controlId("bet", ownerId), { disabled: locked || !canConfigure }),
        new ButtonBuilder().setCustomId(controlId("plus", ownerId)).setLabel(`+${step}`).setEmoji("➕").setStyle(ButtonStyle.Secondary).setDisabled(locked || !canConfigure || session.bet >= max),
        new ButtonBuilder().setCustomId(controlId("start", ownerId)).setLabel(session.phase === "done" ? "Nuova partita" : "Inizia").setEmoji("🎮").setStyle(ButtonStyle.Success).setDisabled(locked || !canConfigure),
        new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
      ),
    ];
  }
  const board = session.board || emptyBoard();
  return [
    new ActionRowBuilder().addComponents(
      cellButton(ownerId, 0, board, locked, null),
      cellButton(ownerId, 1, board, locked, null),
      cellButton(ownerId, 2, board, locked, null),
    ),
    new ActionRowBuilder().addComponents(
      cellButton(ownerId, 3, board, locked, null),
      cellButton(ownerId, 4, board, locked, null),
      cellButton(ownerId, 5, board, locked, null),
    ),
    new ActionRowBuilder().addComponents(
      cellButton(ownerId, 6, board, locked, null),
      cellButton(ownerId, 7, board, locked, null),
      cellButton(ownerId, 8, board, locked, null),
      new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
    ),
  ];
}

async function renderPanel(session?, notice = "") {
  const last = session.lastResult;
  let resultLabel = "";
  if (session.phase === "done" && last) {
    if (last.game === "tris_pvp") {
      if (last.draw) resultLabel = `Pareggio ${formatEconomyAmountShort(last.payout)}`;
      else resultLabel = `Vittoria ${formatEconomyAmountShort(last.payout)}`;
    } else if (last.outcome === "win") resultLabel = `Vittoria +${formatEconomyAmountShort(last.payout)}`;
    else if (last.outcome === "draw") resultLabel = `Pareggio ${formatEconomyAmountShort(last.payout)}`;
    else resultLabel = "Sconfitta";
  }
    const canvasNotice =
    session.mode === "pvp" && session.phase === "pending" ? "" : notice;
  try {
    const renderTrisCanvas = require("../Render/trisCanvas") as typeof import("../Render/trisCanvas");
    const rendered = await runEconomyRender(() =>
      renderTrisCanvas({
                  bet: session.phase === "playing" ? (session.wager || session.bet) : session.bet,
      board: session.board,
      phase: session.phase,
      resultLabel,
      win: last?.outcome === "win" || (last?.game === "tris_pvp" && last?.winnerId && !last?.draw),
      draw: last?.outcome === "draw" || Boolean(last?.draw),
      isPvp: session.mode === "pvp",
      playerName: session.playerName,
      opponentName: session.opponentName,
      turnName: session.phase === "playing" ? displayNameForTurn(session) : "",
      statusLine: canvasStatusLine(canvasNotice),
    }),
    );
    const fileName = "tris-panel.png";
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image: `attachment://${fileName}` };
  } catch (error) {
    global.logger?.warn?.("[TRIS GUI] render:", error?.message || error);
    return { files: [], image: null };
  }
}

async function buildTrisGuiPayload(session?, cfg?, notice = "", panelClosed = false, balance = null) {
  const attachment = await renderPanel(session, notice);
  const payload = buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, panelClosed, balance),
  });
  if (session.mode === "pvp" && session.phase === "pending" && notice) {
    payload.content = String(notice).slice(0, 1800);
    payload.allowedMentions = { repliedUser: false, users: [String(session.opponentId || "")].filter(Boolean) };
  }
  return payload;
}

async function warmupTrisPanel() {
  try {
    const renderTrisCanvas = require("../Render/trisCanvas") as typeof import("../Render/trisCanvas");
    if (typeof renderTrisCanvas.warmup === "function") renderTrisCanvas.warmup();
    await renderTrisCanvas({ phase: "idle", bet: 10 });
  } catch (_) {}
}

setImmediate(() => {
  warmupTrisPanel().catch(() => {});
});

function interactionMessageAdapter(interaction?) {
  return { guild: interaction.guild, member: interaction.member, author: interaction.user };
}

function resetSessionForNewRound(session?) {
  session.phase = session.mode === "pvp" ? "done" : "idle";
  session.board = emptyBoard();
  session.wager = session.mode === "pvp" && session.stakesLocked ? session.wager : 0;
  session.currentTurnId = "";
  session.lastResult = null;
  session.updatedAt = now();
}

async function settleBotRound(client?, messageLike?, session?, cfg?) {
  const winner = boardWinner(session.board);
  let outcome = "loss";
  let payoutAmount = 0;
  if (winner === PLAYER) outcome = "win";
  else if (winner === "draw") outcome = "draw";
  const mult = outcome === "win" ? cfg.tris.winPayout : outcome === "draw" ? 1 : 0;
  payoutAmount = Math.floor(session.wager * mult);
  let paid = null;
  if (payoutAmount > 0) {
    paid = await payTrisWin(client, messageLike, payoutAmount, `tris: ${outcome}`);
  }
  const result = {
    ok: true,
    outcome,
    payout: payoutAmount,
    wager: session.wager,
    win: outcome === "win",
    draw: outcome === "draw",
    paid,
    winner: winner === PLAYER ? "player" : winner === BOT ? "bot" : "draw",
  };
  session.lastResult = result;
  session.phase = "done";
  session.updatedAt = now();
  return result;
}

async function settlePvpRound(client?, guild?, session?, winnerMark?, actorId?) {
  let winnerId = null;
  let draw = false;
  if (winnerMark === "draw") draw = true;
  else if (winnerMark === PLAYER) winnerId = session.ownerId;
  else if (winnerMark === BOT) winnerId = session.opponentId;
  const settled = await settleTrisPvp(client, guild, session.ownerId, session.opponentId, winnerId, draw, session.wager, actorId);
  if (!settled.ok) return { ok: false, message: settled.message };
  settled.challengerId = session.ownerId;
  settled.opponentId = session.opponentId;
  settled.challengerName = session.playerName;
  settled.opponentName = session.opponentName;
  session.stakesLocked = false;
  session.lastResult = settled;
  session.phase = "done";
  session.currentTurnId = "";
  session.updatedAt = now();
  return { ok: true, result: settled };
}

async function refundLockedPvpStakes(client?, session?, actorId?, reason?) {
  if (!session.stakesLocked) return { ok: true, amount: 0 };
  const amount = Math.max(0, Math.floor(Number(session.wager || session.bet) || 0));
  await refundTrisPvpStake(client, session.guildId, session.ownerId, amount || session.bet, actorId, reason);
  await refundTrisPvpStake(client, session.guildId, session.opponentId, amount || session.bet, actorId, reason);
  session.stakesLocked = false;
  return { ok: true, amount: amount || Math.max(0, Math.floor(Number(session.bet) || 0)) };
}

async function refundOnClose(client?, session?, actorId?) {
  if (session.mode === "pvp" && session.stakesLocked) {
    const out = await refundLockedPvpStakes(client, session, actorId, "tris: rimborso chiusura");
    resetSessionForNewRound(session);
    return out;
  }
  if (session.mode !== "pvp" && session.phase === "playing") {
    const amount = Math.max(0, Math.floor(Number(session.wager || session.bet) || 0));
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
      "tris: rimborso chiusura",
      "economy_tris_refund",
    );
    if (!paid?.ok) return { ok: false, message: paid?.message || "Rimborso non riuscito.", amount: 0, abortedRound: true };
    resetSessionForNewRound(session);
    return { ok: true, amount, abortedRound: true };
  }
  resetSessionForNewRound(session);
  return { ok: true, amount: 0 };
}

async function forceKillTrisSession(client?, session?, actorId = "") {
  if (!session) return { ok: true, amount: 0 };
    session.stakesLocked = false;
  session.wager = 0;
  session.phase = session.mode === "pvp" ? "done" : "idle";
  session.currentTurnId = "";
  session.lastResult = null;
  session.updatedAt = now();
  releasePvpUsers(session);
  const mid = String(session.messageId || "").trim();
  if (mid) await deleteSession(mid, session);
  else if (session.guildId && session.ownerId) {
    const { clearEconomyGuiSession } = require("../../Services/Community/economyGuiSessionStore") as typeof import("../../Services/Community/economyGuiSessionStore");
    await clearEconomyGuiSession("tris", session.guildId, session.ownerId, "").catch(() => null);
  }
  return { ok: true, amount: 0, refunded: false };
}

async function tryDisableTrisPanelMessage(client?, session?, notice?) {
  const mid = String(session?.messageId || "").trim();
  const gid = String(session?.guildId || "").trim();
  if (!mid || !gid || !client?.guilds?.fetch) return;
  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;
  const cfg = economyConfig(client);
  const payload = await buildTrisGuiPayload(session, cfg, notice, true, false).catch(() => null);
  if (!payload) return;
  let channel = null;
  const chId = String(session.channelId || "").trim();
  if (chId) {
    channel = await guild.channels.fetch(chId).catch(() => null);
  }
  if (!channel?.messages?.fetch) return;
  const msg = await channel.messages.fetch(mid).catch(() => null);
  if (msg?.editable) await msg.edit(payload).catch(() => {});
}

async function purgeDisabledTrisSessions(client?) {
  const cfg = economyConfig(client);
  if (cfg?.tris?.enabled !== false) return { ok: true, purged: 0, skipped: true };
  const notice =
    "<a:VC_Cross:1482532424570376253> Tris disattivato: sessione chiusa. Le puntate non vengono rimborsate.";
  const byMessage = new Map();
  for (const live of sessionApi.listMemorySessions?.() || []) {
    const mid = String(live?.messageId || "").trim();
    if (mid) byMessage.set(mid, live);
  }
  const persisted = await listEconomyGuiSessions("tris", { limit: 1000 }).catch(() => []);
  for (const row of persisted) {
    const mid = String(row?.messageId || "").trim();
    if (mid && !byMessage.has(mid)) byMessage.set(mid, row);
  }
  let purged = 0;
  for (const session of byMessage.values()) {
    await forceKillTrisSession(client, session, session.ownerId).catch(() => null);
    await tryDisableTrisPanelMessage(client, session, notice).catch(() => null);
    purged += 1;
  }
  if (purged > 0) {
    global.logger?.info?.(`[TRIS] purged ${purged} disabled session(s)`);
  }
  return { ok: true, purged };
}

function schedulePvpInviteExpiry(message?, session?, cfg?) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  setTimeout(() => {
    void getSession(messageId, session?.guildId, session?.ownerId).then((live?) => {
      if (!live || live.mode !== "pvp" || live.phase !== "pending") return;
      deleteSession(messageId, live);
      buildTrisGuiPayload(live, cfg, "<a:VC_pixeltime:1482535344103620771> Sfida scaduta: nessuna risposta.", true, false)
        .then((payload?) => message.edit(payload).catch(() => {}))
        .catch(() => {});
    });
  }, PVP_INVITE_TTL_MS);
}

async function acceptPvpChallenge(client?, interaction?, session?, cfg?) {
  const opponentId = String(interaction.user?.id || "");
  if (opponentId !== session.opponentId) return { ok: false, message: "Solo l'avversario sfidato può accettare." };
  if (session.phase !== "pending") return { ok: false, message: "Questa sfida non è più in attesa." };
  const { assertDifferentHouses } = require("../../Services/Community/galeoniEconomyService") as typeof import("../../Services/Community/galeoniEconomyService");
  const houseGate = await assertDifferentHouses(client, session.guildId || interaction.guild?.id, session.ownerId, session.opponentId, {
    actionLabel: "le sfide PvP",
  });
  if (!houseGate.ok) return { ok: false, message: houseGate.message };
  const locked = await lockTrisPvpStakes(client, interaction.guild, session.ownerId, session.opponentId, session.bet, opponentId);
  if (!locked.ok) return locked;
  session.stakesLocked = true;
  session.wager = locked.amount;
  session.board = emptyBoard();
  session.currentTurnId = session.ownerId;
  session.phase = "playing";
  session.lastResult = null;
  session.updatedAt = now();
  setSession(interaction.message.id, session);
  return { ok: true, notice: `<a:VC_Verified:1482532479637127188> Sfida accettata! **${session.playerName}** (X) inizia — tocca una casella.` };
}

async function declinePvpChallenge(interaction?, session?) {
  if (String(interaction.user?.id || "") !== session.opponentId) return { ok: false, message: "Solo l'avversario può rifiutare la sfida." };
  if (session.phase !== "pending") return { ok: false, message: "Questa sfida non è più in attesa." };
  deleteSession(interaction.message.id, session);
  return { ok: true, notice: `<a:VC_Cross:1482532424570376253> **${session.opponentName}** ha rifiutato la sfida.`, disabled: true };
}

async function cancelPvpChallenge(interaction?, session?) {
  if (String(interaction.user?.id || "") !== session.ownerId) return { ok: false, message: "Solo chi ha lanciato la sfida può annullarla." };
  if (session.phase !== "pending") return { ok: false, message: "Non puoi annullare ora." };
  deleteSession(interaction.message.id, session);
  return { ok: true, notice: "🚫 Sfida annullata.", disabled: true };
}

async function startGame(client?, messageLike?, session?) {
  if (session.mode === "pvp") return { ok: false, message: "In PvP la partita parte quando l'avversario accetta." };
  if (session.phase === "done") {
    session.phase = "idle";
    session.board = emptyBoard();
    session.wager = 0;
    session.lastResult = null;
  }
  if (session.phase !== "idle") return { ok: false, message: "La partita è già in corso." };
  const spent = await playTrisBet(client, messageLike, session.bet, null, sessionSpendOptions(session));
  if (!spent.ok) return spent;
  markSessionStakeCooldown(session);
  session.board = emptyBoard();
  session.wager = spent.amount;
  session.lastResult = null;
  session.phase = "playing";
  session.updatedAt = now();
  return { ok: true, cfg: spent.cfg };
}

async function playCell(client?, messageLike?, session?, cellIndex?, cfg?, actorUserId?) {
  if (session.phase !== "playing") return { ok: false, message: "La partita non è in corso." };
  if (session.mode === "pvp") {
    const uid = String(actorUserId || "");
    if (!isParticipant(session, uid)) return { ok: false, message: "Non fai parte di questa sfida." };
    if (uid !== String(session.currentTurnId || "")) return { ok: false, message: `Non è il tuo turno. Tocca a **${displayNameForTurn(session)}**.` };
    const mark = markForUser(session, uid);
    if (!mark) return { ok: false, message: "Mossa non valida." };
    const moved = applyMarkMove(session.board, cellIndex, mark);
    if (!moved.ok) return moved;
    session.board = moved.board;
    const winner = boardWinner(session.board);
    if (winner) {
      const result = await settlePvpRound(client, messageLike.guild, session, winner, uid);
      if (!result.ok) return result;
      return { ok: true, finished: true, result: result.result };
    }
    session.currentTurnId = uid === session.ownerId ? session.opponentId : session.ownerId;
    session.updatedAt = now();
    return { ok: true, finished: false };
  }
  if (String(messageLike?.author?.id || "") !== session.ownerId) {
    return { ok: false, message: "Questo pannello non è tuo." };
  }
  const moved = applyPlayerMove(session.board, cellIndex);
  if (!moved.ok) return moved;
  session.board = moved.board;
  let winner = boardWinner(session.board);
  if (!winner) {
    const botIdx = pickBotMove(session.board, botRandomPct(cfg));
    if (botIdx >= 0) session.board[botIdx] = BOT;
    winner = boardWinner(session.board);
  }
  if (winner) {
    const result = await settleBotRound(client, messageLike, session, cfg);
    return { ok: true, finished: true, result };
  }
  session.updatedAt = now();
  return { ok: true, finished: false };
}

function formatTrisPvpNotice(result?, session?, viewerId?) {
  if (!result?.ok) return result?.message || "";
  const youWon = String(result.winnerId) === String(viewerId);
  if (result.draw) return `🤝 **Pareggio** — ti tornano **${formatEconomyAmount(result.payout)}**.`;
  if (youWon) return `🏆 **Vittoria!** Hai vinto **${formatEconomyAmount(result.payout)}**.`;
  const winnerName = String(result.winnerId) === String(session.ownerId) ? session.playerName : session.opponentName;
  return `<a:VC_Cross:1482532424570376253> **Sconfitta.** Vince **${winnerName}** (**${formatEconomyAmount(result.payout)}**).`;
}

function formatRoundNotice(result?, session?, viewerId?) {
  if (!result?.ok) return "";
  if (result.game === "tris_pvp") return formatTrisPvpNotice(result, session, viewerId);
  const label = outcomeLabel(result.outcome);
  if (result.outcome === "win") return `🏆 **${label}!** Hai vinto **${formatEconomyAmount(result.payout)}**.`;
  if (result.outcome === "draw") return `🤝 **${label}** — ti tornano **${formatEconomyAmount(result.payout)}**.`;
  return `<a:VC_Cross:1482532424570376253> **${label}**. Hai perso **${formatEconomyAmount(result.wager)}**.\n<a:VC_pixeltime:1482535344103620771> Puoi rigiocare quando il cooldown lo permette.`;
}

export = {
  PVP_INVITE_TTL_MS,
  acceptPvpChallenge,
  buildTrisGuiPayload,
  cancelPvpChallenge,
  clampBet,
  declinePvpChallenge,
  deleteSession,
  economyConfig,
  findActiveTrisPvpMessageId,
  forceKillTrisSession,
  formatRoundNotice,
  getSession,
  interactionMessageAdapter,
  isParticipant,
  isTrisGuiCustomId,
  makeSession,
  parseTrisGuiCustomId,
  playCell,
  purgeDisabledTrisSessions,
  refundLockedPvpStakes,
  refundOnClose,
  resetSessionForNewRound,
  schedulePvpInviteExpiry,
  setSession,
  startGame,
  warmupTrisPanel,
};