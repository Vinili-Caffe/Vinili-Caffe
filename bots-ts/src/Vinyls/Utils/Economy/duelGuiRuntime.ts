const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { buildImageButtonPayload, canvasStatusLine } = require("./guiPanelPayload") as typeof import("./guiPanelPayload");
const { sanitizeCanvasDisplayName } = require("../Render/canvasUtils") as typeof import("../Render/canvasUtils");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { formatDuelRewardLine, getVoldemortFighter, loadDuelFighter, computeVsBotWinChance, clearDuelCooldown, reserveDuelCooldown, resolveBotDuelOutcome, resolveDuelOutcome, resolveDuelRewards, settleDuelVictoryRewards } = require("../../Services/Community/hogwartsDuelService") as typeof import("../../Services/Community/hogwartsDuelService");
const renderDuelCanvas = require("../Render/duelCanvas") as typeof import("../Render/duelCanvas");
const { runEconomyRender } = require("../../../shared/render/economyRenderQueue") as typeof import("../../../shared/render/economyRenderQueue");
const spinAnimationDurationMs = () => (
  typeof renderDuelCanvas.spinAnimationDurationMs === "function"
    ? renderDuelCanvas.spinAnimationDurationMs()
    : 5500
);
const { getShopItemById } = require("../Web/hogwartsShopCatalog") as typeof import("../Web/hogwartsShopCatalog");
const { createPersistedGuiSessionApi, SESSION_DB_TTL_MS } = require("../../Services/Community/economyGuiSessionStore") as typeof import("../../Services/Community/economyGuiSessionStore");
const LOANER_WAND_ID = "willow-spark-wand";
const BOT_WAND_ID = "elder-ember-wand";
const PREFIX = "duel_gui";
const SESSION_TTL_MS = SESSION_DB_TTL_MS;
const PVP_INVITE_TTL_MS = 90 * 1000;
const pvpUserLocks = new Map();
const sessionApi = createPersistedGuiSessionApi("duel", {
  ttlMs: SESSION_TTL_MS,
  onEvict: (session?) => releasePvpUsers(session),
});
const DUEL_RENDER_CACHE_MAX = 24;
const duelRenderCache = new Map();

function now() {
  return Date.now();
}

function sessionKey(messageId?) {
  return String(messageId || "").trim();
}

function userLockKey(guildId?, userId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function makeSession({ ownerId, guildId, playerName, mode = "bot", opponentId = "", opponentName = "Rivale" }) {
  return {
    mode: mode === "pvp" ? "pvp" : "bot",
    ownerId: String(ownerId || ""),
    opponentId: String(opponentId || ""),
    guildId: String(guildId || ""),
    playerName: String(playerName || "Tu").trim() || "Tu",
    opponentName: String(opponentName || "Rivale").trim() || "Rivale",
    phase: mode === "pvp" ? "pending" : "ready",
    ownerFighter: null,
    opponentFighter: null,
    lastOutcome: null,
    createdAt: now(),
    updatedAt: now(),
  };
}

function bindPvpUsers(session?, messageId?) {
  if (session.mode !== "pvp") return;
  const gid = String(session.guildId || "");
  const mid = String(messageId || "");
  if (!gid || !mid) return;
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

function findActiveDuelPvpMessageId(guildId?, userId?) {
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

function isDuelGuiCustomId(customId?) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseDuelGuiCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3 || parts[0] !== PREFIX) return null;
  const action = parts[1];
  const ownerId = parts[2];
  if (!ownerId || !/^\d{16,20}$/.test(ownerId)) return null;
  if (!["accept", "decline", "cancel"].includes(action)) return null;
  return { action, ownerId };
}

async function avatarUrlFor(guild?, userId?) {
  const member = guild?.members?.cache?.get(userId) || (await getGuildMemberCached(guild, userId).catch(() => null));
  return guildMemberDisplayAvatarUrlDynamic(member || { id: userId }, { size: 256 }) || "";
}

function resolveFighterWandRender(fighter?, isBot?) {
  const wandId = String(fighter?.wand?.id || "").trim() || (isBot ? BOT_WAND_ID : LOANER_WAND_ID);
  const catalog = getShopItemById(wandId);
  const imageFile = String(fighter?.wand?.imageFile || catalog?.imageFile || "").trim();
  return { wandId, imageFile };
}

function clampDuelPowerPct(value?) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(100, Math.floor(Number(value))));
}

function resolveCanvasPowers(client?, left?, right?, outcome?) {
  const botDuel = Boolean(left?.isBot || right?.isBot);
  if (botDuel) {
    let playerPct = clampDuelPowerPct(outcome?.vsBotWinChance);
    if (playerPct == null) {
      const human = left?.isBot ? right : left;
      playerPct = clampDuelPowerPct(computeVsBotWinChance(human?.winChance, resolveDuelRewards(client).vsBot));
    }
    if (playerPct == null) playerPct = 35;
    const botPct = Math.max(1, Math.min(99, 100 - playerPct));
    if (left?.isBot) return { leftPower: botPct, rightPower: playerPct };
    return { leftPower: playerPct, rightPower: botPct };
  }
  return {
    leftPower: clampDuelPowerPct(outcome?.leftPower ?? left?.power ?? left?.winChance),
    rightPower: clampDuelPowerPct(outcome?.rightPower ?? right?.power ?? right?.winChance),
  };
}

async function buildDuelRenderParams(client?, guild?, left?, right?, outcome?, messageSeed?) {
  const leftUrl = left.isBot ? "" : await avatarUrlFor(guild, left.userId);
  const rightUrl = right.isBot ? "" : await avatarUrlFor(guild, right.userId);
  const leftWand = resolveFighterWandRender(left, Boolean(left.isBot));
  const rightWand = resolveFighterWandRender(right, Boolean(right.isBot));
  const winnerSide = outcome.winnerSide || "draw";
  const spellLine = String(outcome.spellLine || "").trim();
  const powers = resolveCanvasPowers(client, left, right, outcome);
  return {
    leftAvatarUrl: leftUrl,
    rightAvatarUrl: rightUrl,
    leftName: trimName(left.username || "Giocatore"),
    rightName: trimName(right.username || "Rivale"),
    leftWandId: leftWand.wandId,
    leftWandFile: leftWand.imageFile,
    rightWandId: rightWand.wandId,
    rightWandFile: rightWand.imageFile,
    leftId: left.userId,
    rightId: right.userId,
    leftAccent: left.wandAccent || left.houseAccent,
    rightAccent: right.wandAccent || right.houseAccent,
    leftPower: powers.leftPower,
    rightPower: powers.rightPower,
    leftIsBot: Boolean(left.isBot),
    rightIsBot: Boolean(right.isBot),
    spellLine,
    winnerSide,
    messageSeed,
    voldemortPortraitFile: resolveDuelVoldemortPortraitFile(client),
  };
}

function resolveDuelVoldemortPortraitFile(client?) {
  const raw = client?.config?.hogwartsEvent?.duel?.voldemortPortraitFile;
  const env = String(process.env.VC_DUEL_VOLDEMORT_PORTRAIT || "").trim();
  return String(raw || env || "voldemort.png").trim();
}

function trimName(name?) {
  return sanitizeCanvasDisplayName(name, 18, "Giocatore");
}

function duelRenderCacheKey(params?, animating?) {
  return [
    animating ? "gif" : "png",
    params.leftId,
    params.rightId,
    params.leftWandId,
    params.rightWandId,
    params.winnerSide,
    params.leftPower,
    params.rightPower,
    params.messageSeed,
    params.spellLine,
  ].join(":");
}

function rememberDuelRenderCache(key?, buffer?, fileName?) {
  duelRenderCache.set(key, { buffer, fileName });
  if (duelRenderCache.size > DUEL_RENDER_CACHE_MAX) {
    const oldest = duelRenderCache.keys().next().value;
    if (oldest) duelRenderCache.delete(oldest);
  }
}

async function renderDuelAttachment(client?, guild?, left?, right?, outcome?, messageSeed?, animating = false) {
  const params = await buildDuelRenderParams(client, guild, left, right, outcome, messageSeed);
  const cacheKey = duelRenderCacheKey(params, Boolean(animating));
  const hit = duelRenderCache.get(cacheKey);
  if (hit?.buffer?.length) {
    return {
      files: [new AttachmentBuilder(Buffer.from(hit.buffer), { name: hit.fileName })],
      image: `attachment://${hit.fileName}`,
    };
  }
  const rendered = await runEconomyRender(() =>
    renderDuelCanvas(params, { animating: Boolean(animating) }),
  );
  const fileName = rendered.format === "gif" ? "duel.gif" : "duel.png";
  rememberDuelRenderCache(cacheKey, rendered.buffer, fileName);
  return {
    files: [new AttachmentBuilder(rendered.buffer, { name: fileName })],
    image: `attachment://${fileName}`,
  };
}

function formatDuelOutcomeNotice(outcome?) {
  const rewards = outcome?.rewards;
  return String(rewards?.message || formatDuelRewardLine(rewards) || "").trim();
}

function fighterLabel(fighter?) {
  return trimName(fighter.username || "Giocatore");
}

function isGuildUserId(userId?) {
  return /^\d{16,20}$/.test(String(userId || "").trim());
}

function fighterMention(fighter?, fallback = "Rivale") {
  const id = String(fighter?.userId || "").trim();
  if (isGuildUserId(id)) return `<@${id}>`;
  return String(fighter?.username || fallback).trim() || fallback;
}

function plainNoticeLine(text?) {
  return String(text || "").replace(/\*\*/g, "").trim();
}

function duelParticipantUserIds(left?, right?) {
  const ids = [];
  for (const id of [left?.userId, right?.userId]) {
    const v = String(id || "").trim();
    if (isGuildUserId(v) && !ids.includes(v)) ids.push(v);
  }
  return ids;
}

async function attachDuelVictoryRewards(client?, guild?, outcome?, vsBot?, dedupeKey?) {
  if (!outcome || outcome.draw || !outcome.winnerId) return outcome;
  const rewards = await settleDuelVictoryRewards(client, {
    guildId: guild?.id,
    winnerId: outcome.winnerId,
    vsBot: Boolean(vsBot),
    dedupeKey: String(dedupeKey || ""),
  });
  return { ...outcome, rewards: rewards || null };
}

async function buildDuelPayload(client?, guild?, session?, left?, right?, outcome?, notice = "", disabled = false, animating = false) {
  const attachment = await renderDuelAttachment(
    client,
    guild,
    left,
    right,
    outcome,
    `${session.ownerId}:${session.opponentId}:${Date.now()}`,
    animating,
  );
  const ownerId = session.ownerId;
  const rows = session.mode === "pvp" && session.phase === "pending"
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(controlId("accept", ownerId)).setLabel("Accetta duello").setEmoji("⚔️").setStyle(ButtonStyle.Success).setDisabled(disabled),
          new ButtonBuilder().setCustomId(controlId("decline", ownerId)).setLabel("Rifiuta").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(disabled),
          new ButtonBuilder().setCustomId(controlId("cancel", ownerId)).setLabel("Annulla").setStyle(ButtonStyle.Secondary).setDisabled(disabled),
        ),
      ]
    : [];
  const payload = buildImageButtonPayload({
    files: attachment.files || [],
    components: rows,
  });
    payload.content = notice ? String(notice).slice(0, 1800) : "";
  payload.allowedMentions = {
    repliedUser: false,
    users: notice ? duelParticipantUserIds(left, right) : [],
  };
  return payload;
}

function scheduleDuelResultPanel(message?, ctx?, delayMs = null) {
  const waitMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : spinAnimationDurationMs();
  if (!message?.edit) return;
  setTimeout(() => {
    const { client, guild, session, left, right, outcome, notice } = ctx || {};
    buildDuelPayload(client, guild, session, left, right, outcome, notice || "", true, false)
      .then((payload?) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, waitMs);
}

async function pushDuelFightSequence(message?, client?, guild?, session?, left?, right?, outcome?, notice?, opts: Record<string, any> = {}) {
  if (!message?.edit) return;
  const resultCtx = { client, guild, session, left, right, outcome, notice };
  try {
    if (!opts.skipPlaceholder) {
      const startOutcome = { spellLine: "Il duello sta per iniziare…", winnerSide: "pending" };
      const placeholder = await buildDuelPayload(client, guild, session, left, right, startOutcome, "", true, false);
      await message.edit(placeholder).catch(() => {});
    }
        const gifPayload = await buildDuelPayload(client, guild, session, left, right, outcome, "", true, true);
    await message.edit(gifPayload).catch(() => {});
    scheduleDuelResultPanel(message, resultCtx, spinAnimationDurationMs());
  } catch (error) {
    global.logger?.warn?.("[DUEL GUI] fight sequence:", error?.message || error);
    scheduleDuelResultPanel(message, resultCtx, 0);
  }
}

async function buildDuelClosedPayload(client?, guild?, session?, spellLine?) {
  const left = session.ownerFighter || {
    userId: session.ownerId,
    username: session.playerName,
    displayName: session.playerName,
  };
  const right = {
    userId: session.opponentId,
    username: session.opponentName,
    displayName: session.opponentName,
  };
  const line = canvasStatusLine(spellLine) || String(spellLine || "").trim();
  const outcome = { spellLine: line || "Sfida conclusa", winnerSide: "closed" };
  const attachment = await renderDuelAttachment(client, guild, left, right, outcome, `closed:${session.ownerId}:${Date.now()}`);
  return buildImageButtonPayload({ files: attachment.files || [], components: [] });
}

async function buildInvitePayload(client?, guild?, session?, ownerFighter?, notice?) {
  const opponentStub = {
    userId: session.opponentId,
    username: session.opponentName,
    displayName: session.opponentName,
  };
    const inviteLine = `${trimName(ownerFighter.username)} vs ${trimName(session.opponentName)} — accetta o rifiuta`;
  const outcome = { spellLine: inviteLine, winnerSide: "pending" };
  const attachment = await renderDuelAttachment(client, guild, ownerFighter, opponentStub, outcome, `invite:${session.ownerId}:${session.opponentId}`);
  const rows = session.mode === "pvp"
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(controlId("accept", session.ownerId)).setLabel("Accetta duello").setEmoji("⚔️").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(controlId("decline", session.ownerId)).setLabel("Rifiuta").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(controlId("cancel", session.ownerId)).setLabel("Annulla").setStyle(ButtonStyle.Secondary),
        ),
      ]
    : [];
  const payload = buildImageButtonPayload({
    files: attachment.files || [],
    components: rows,
  });
  if (notice) {
    payload.content = String(notice).slice(0, 1800);
    payload.allowedMentions = {
      repliedUser: false,
      users: [String(session.opponentId || "")].filter(Boolean),
    };
  }
  return payload;
}

async function runBotDuel(client?, message?, ownerFighter?, messageSeed?) {
  const voldemort = getVoldemortFighter();
  const duelCfg = resolveDuelRewards(client);
  let outcome = resolveBotDuelOutcome(ownerFighter, voldemort, messageSeed, duelCfg.vsBot);
  const youWon = !outcome.draw && outcome.winnerId === String(ownerFighter.userId);
  if (youWon) {
    outcome = await attachDuelVictoryRewards(client, message.guild, outcome, true, message.id);
  }
  const session = makeSession({
    ownerId: message.author.id,
    guildId: message.guild.id,
    playerName: ownerFighter.username,
    mode: "bot",
  });
  session.ownerFighter = ownerFighter;
  session.opponentFighter = voldemort;
  session.lastOutcome = outcome;
  session.phase = "done";
  const notice = formatDuelOutcomeNotice(outcome);
  return { session, left: ownerFighter, right: voldemort, outcome, notice };
}

async function runPvpDuel(client?, guild?, session?, messageSeed?) {
  const left = session.ownerFighter;
  const right = session.opponentFighter;
  if (!left || !right) return { ok: false, message: "Profili duello non caricati." };
  const outcome = resolveDuelOutcome(left, right, messageSeed);
  session.lastOutcome = outcome;
  session.phase = "done";
  return { ok: true, outcome, left, right };
}

function schedulePvpInviteExpiry(message?, session?) {
  const messageId = String(message?.id || "");
  const client = message?.client;
  const guild = message?.guild;
  if (!message?.edit || !messageId || !client || !guild) return;
  setTimeout(() => {
    void getSession(messageId, session?.guildId, session?.ownerId).then(async (live?) => {
      if (!live || live.mode !== "pvp" || live.phase !== "pending") return;
      if (live.ownerCooldownReserved) {
        await clearDuelCooldown(client, live.guildId, live.ownerId).catch(() => {});
      }
      deleteSession(messageId, live);
      buildDuelClosedPayload(client, guild, live, "Sfida scaduta: nessuna risposta")
        .then((payload?) => message.edit(payload).catch(() => {}))
        .catch(() => {});
    });
  }, PVP_INVITE_TTL_MS);
}

async function acceptPvpChallenge(client?, interaction?, session?) {
  const opponentId = String(interaction.user?.id || "");
  if (opponentId !== session.opponentId) return { ok: false, message: "Solo l'avversario sfidato può accettare." };
  if (session.phase !== "pending") return { ok: false, message: "Questa sfida non è più in attesa." };
  const { assertEconomyAccess, assertDifferentHouses } = require("../../Services/Community/galeoniEconomyService") as typeof import("../../Services/Community/galeoniEconomyService");
  const economyAccess = await assertEconomyAccess(interaction, client);
  if (!economyAccess.ok) return { ok: false, message: economyAccess.message };
  const houseGate = await assertDifferentHouses(client, session.guildId, session.ownerId, session.opponentId, {
    preview: economyAccess.preview,
    actionLabel: "i duelli",
  });
  if (!houseGate.ok) return { ok: false, message: houseGate.message };
  const oppUser = await client.users.fetch(session.opponentId).catch(() => null);
  const oppLoaded = await loadDuelFighter(
    client,
    session.guildId,
    session.opponentId,
    session.opponentName,
    oppUser?.username || session.opponentName,
  );
  if (!oppLoaded.ok) return { ok: false, message: oppLoaded.message };

    if (!session.ownerCooldownReserved) {
    const ownerReserve = await reserveDuelCooldown(client, session.guildId, session.ownerId);
    if (!ownerReserve.ok) return { ok: false, message: ownerReserve.message };
    session.ownerCooldownReserved = true;
  }

  session.opponentFighter = oppLoaded.fighter;
  const ran = await runPvpDuel(client, interaction.guild, session, interaction.message.id);
  if (!ran.ok) return ran;
  let outcome = ran.outcome;
  if (!outcome.draw && outcome.winnerId) {
    outcome = await attachDuelVictoryRewards(client, interaction.guild, outcome, false, interaction.message.id);
  }
  deleteSession(interaction.message.id);
  const notice = formatDuelOutcomeNotice(outcome);
  session.phase = "done";
  await pushDuelFightSequence(
    interaction.message,
    client,
    interaction.guild,
    session,
    ran.left,
    ran.right,
    outcome,
    notice,
    { skipPlaceholder: true },
  );
  return { ok: true };
}

async function declinePvpChallenge(client?, interaction?, session?) {
  if (String(interaction.user?.id || "") !== session.opponentId) return { ok: false, message: "Solo l'avversario può rifiutare." };
  if (session.phase !== "pending") return { ok: false, message: "Sfida non più valida." };
  if (session.ownerCooldownReserved) {
    await clearDuelCooldown(client, session.guildId, session.ownerId).catch(() => {});
  }
  deleteSession(interaction.message.id);
  const payload = await buildDuelClosedPayload(client, interaction.guild, session, `${session.opponentName} ha rifiutato il duello`);
  return { ok: true, payload };
}

async function cancelPvpChallenge(client?, interaction?, session?) {
  if (String(interaction.user?.id || "") !== session.ownerId) return { ok: false, message: "Solo chi ha lanciato la sfida può annullarla." };
  if (session.phase !== "pending") return { ok: false, message: "Non puoi annullare ora." };
  if (session.ownerCooldownReserved) {
    await clearDuelCooldown(client, session.guildId, session.ownerId).catch(() => {});
  }
  deleteSession(interaction.message.id);
  const payload = await buildDuelClosedPayload(client, interaction.guild, session, "Sfida duello annullata");
  return { ok: true, payload };
}

function warmupDuelPanel() {
  if (typeof renderDuelCanvas.warmup === "function") renderDuelCanvas.warmup();
}

export = {
  PVP_INVITE_TTL_MS,
  acceptPvpChallenge,
  buildDuelPayload,
  buildInvitePayload,
  cancelPvpChallenge,
  declinePvpChallenge,
  deleteSession,
  findActiveDuelPvpMessageId,
  formatDuelOutcomeNotice,
  getSession,
  isDuelGuiCustomId,
  loadDuelFighter,
  makeSession,
  parseDuelGuiCustomId,
  pushDuelFightSequence,
  runBotDuel,
  schedulePvpInviteExpiry,
  setSession,
  spinAnimationDurationMs,
  warmupDuelPanel,
};