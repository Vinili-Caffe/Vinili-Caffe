const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const {
  getVoldemortFighter,
  loadDuelFighter,
  resolveDuelOutcome,
  settleDuelVictoryRewards,
} = require("../../Services/Community/hogwartsDuelService");
const renderDuelCanvas = require("../Render/duelCanvas");
const { getShopItemById } = require("../Web/hogwartsShopCatalog");
const LOANER_WAND_ID = "willow-spark-wand";
const BOT_WAND_ID = "elder-ember-wand";
const PREFIX = "duel_gui";
const SESSION_TTL_MS = 10 * 60 * 1000;
const PVP_INVITE_TTL_MS = 90 * 1000;
const sessions = new Map();
const pvpUserLocks = new Map();

function now() {
  return Date.now();
}

function sessionKey(messageId) {
  return String(messageId || "").trim();
}

function userLockKey(guildId, userId) {
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

function bindPvpUsers(session, messageId) {
  if (session.mode !== "pvp") return;
  const gid = String(session.guildId || "");
  const mid = String(messageId || "");
  if (!gid || !mid) return;
  pvpUserLocks.set(userLockKey(gid, session.ownerId), mid);
  pvpUserLocks.set(userLockKey(gid, session.opponentId), mid);
}

function releasePvpUsers(session) {
  if (session?.mode !== "pvp") return;
  const gid = String(session.guildId || "");
  pvpUserLocks.delete(userLockKey(gid, session.ownerId));
  pvpUserLocks.delete(userLockKey(gid, session.opponentId));
}

function findActiveDuelPvpMessageId(guildId, userId) {
  return pvpUserLocks.get(userLockKey(guildId, userId)) || "";
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
    releasePvpUsers(cached);
    return null;
  }
  return cached;
}

function deleteSession(messageId) {
  const key = sessionKey(messageId);
  const cached = sessions.get(key);
  if (cached) releasePvpUsers(cached);
  sessions.delete(key);
}

function controlId(action, ownerId) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isDuelGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseDuelGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3 || parts[0] !== PREFIX) return null;
  const action = parts[1];
  const ownerId = parts[2];
  if (!ownerId || !/^\d{16,20}$/.test(ownerId)) return null;
  if (!["accept", "decline", "cancel"].includes(action)) return null;
  return { action, ownerId };
}

async function avatarUrlFor(guild, userId) {
  const member = guild?.members?.cache?.get(userId) || (await getGuildMemberCached(guild, userId).catch(() => null));
  return guildMemberDisplayAvatarUrlDynamic(member || { id: userId }, { size: 256 }) || "";
}

function resolveFighterWandRender(fighter, isBot) {
  const wandId = String(fighter?.wand?.id || "").trim() || (isBot ? BOT_WAND_ID : LOANER_WAND_ID);
  const catalog = getShopItemById(wandId);
  const imageFile = String(fighter?.wand?.imageFile || catalog?.imageFile || "").trim();
  return { wandId, imageFile };
}

async function buildDuelRenderParams(client, guild, left, right, outcome, messageSeed) {
  const leftUrl = left.isBot ? "" : await avatarUrlFor(guild, left.userId);
  const rightUrl = right.isBot ? "" : await avatarUrlFor(guild, right.userId);
  const leftWand = resolveFighterWandRender(left, Boolean(left.isBot));
  const rightWand = resolveFighterWandRender(right, Boolean(right.isBot));
  return {
    leftAvatarUrl: leftUrl,
    rightAvatarUrl: rightUrl,
    leftName: trimName(left.username || left.displayName),
    rightName: trimName(right.username || right.displayName),
    leftWandId: leftWand.wandId,
    leftWandFile: leftWand.imageFile,
    rightWandId: rightWand.wandId,
    rightWandFile: rightWand.imageFile,
    leftId: left.userId,
    rightId: right.userId,
    leftAccent: left.wandAccent || left.houseAccent,
    rightAccent: right.wandAccent || right.houseAccent,
    leftPower: left.power,
    rightPower: right.power,
    leftIsBot: Boolean(left.isBot),
    rightIsBot: Boolean(right.isBot),
    spellLine: outcome.spellLine,
    winnerSide: outcome.winnerSide,
    messageSeed,
    voldemortPortraitFile: resolveDuelVoldemortPortraitFile(client),
  };
}

function resolveDuelVoldemortPortraitFile(client) {
  const raw = client?.config?.hogwartsEvent?.duel?.voldemortPortraitFile;
  const env = String(process.env.VC_DUEL_VOLDEMORT_PORTRAIT || "").trim();
  return String(raw || env || "voldemort.png").trim();
}

function trimName(name) {
  const v = String(name || "").trim();
  return v.length > 18 ? `${v.slice(0, 18)}…` : v;
}

async function renderDuelAttachment(client, guild, left, right, outcome, messageSeed) {
  const params = await buildDuelRenderParams(client, guild, left, right, outcome, messageSeed);
  const rendered = await renderDuelCanvas(params);
  const fileName = rendered.format === "gif" ? "duel.gif" : "duel.png";
  return {
    files: [new AttachmentBuilder(rendered.buffer, { name: fileName })],
    image: `attachment://${fileName}`,
  };
}

function fighterLabel(fighter) {
  return trimName(fighter.username || fighter.displayName);
}

function isGuildUserId(userId) {
  return /^\d{16,20}$/.test(String(userId || "").trim());
}

function fighterMention(fighter, fallback = "Rivale") {
  const id = String(fighter?.userId || "").trim();
  if (isGuildUserId(id)) return `<@${id}>`;
  return String(fighter?.username || fighter?.displayName || fallback).trim() || fallback;
}

function plainNoticeLine(text) {
  return String(text || "").replace(/\*\*/g, "").trim();
}

function duelParticipantUserIds(left, right) {
  const ids = [];
  for (const id of [left?.userId, right?.userId]) {
    const v = String(id || "").trim();
    if (isGuildUserId(v) && !ids.includes(v)) ids.push(v);
  }
  return ids;
}

function buildDuelResultContent(left, right, outcome, notice = "") {
  const lines = [`${fighterMention(left)} vs ${fighterMention(right, "Voldemort")}`];
  const extra = plainNoticeLine(notice);
  if (extra) lines.push(extra);
  const reward = plainNoticeLine(outcome?.rewards?.message);
  if (reward) lines.push(reward);
  return lines.join("\n");
}

async function attachDuelVictoryRewards(client, guild, outcome, vsBot, dedupeKey) {
  if (!outcome || outcome.draw || !outcome.winnerId) return outcome;
  const rewards = await settleDuelVictoryRewards(client, {
    guildId: guild?.id,
    winnerId: outcome.winnerId,
    vsBot: Boolean(vsBot),
    dedupeKey: String(dedupeKey || ""),
  });
  return { ...outcome, rewards: rewards || null };
}

async function buildDuelPayload(client, guild, session, left, right, outcome, notice = "", disabled = false) {
  const attachment = await renderDuelAttachment(client, guild, left, right, outcome, `${session.ownerId}:${session.opponentId}:${Date.now()}`);
  const content = buildDuelResultContent(left, right, outcome, notice);
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
  return {
    content,
    files: attachment.files,
    components: rows,
    allowedMentions: { repliedUser: false, users: duelParticipantUserIds(left, right) },
  };
}

async function buildInvitePayload(client, guild, session, ownerFighter, notice) {
  const lines = [`${fighterMention(ownerFighter)} vs ${fighterMention({ userId: session.opponentId, username: session.opponentName })}`];
  const extra = plainNoticeLine(notice);
  if (extra) lines.push(extra);
  const rows = session.mode === "pvp"
    ? [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(controlId("accept", session.ownerId)).setLabel("Accetta duello").setEmoji("⚔️").setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(controlId("decline", session.ownerId)).setLabel("Rifiuta").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId(controlId("cancel", session.ownerId)).setLabel("Annulla").setStyle(ButtonStyle.Secondary),
        ),
      ]
    : [];
  const users = duelParticipantUserIds(ownerFighter, { userId: session.opponentId });
  return {
    content: lines.join("\n"),
    components: rows,
    files: [],
    allowedMentions: { repliedUser: false, users },
  };
}

async function runBotDuel(client, message, ownerFighter, messageSeed) {
  const voldemort = getVoldemortFighter();
  let outcome = resolveDuelOutcome(ownerFighter, voldemort, messageSeed);
  const youWon = !outcome.draw && outcome.winnerId === String(ownerFighter.userId);
  if (youWon) {
    outcome = await attachDuelVictoryRewards(client, message.guild, outcome, true, message.id);
  }
  const session = makeSession({
    ownerId: message.author.id,
    guildId: message.guild.id,
    playerName: ownerFighter.displayName,
    mode: "bot",
  });
  session.ownerFighter = ownerFighter;
  session.opponentFighter = voldemort;
  session.lastOutcome = outcome;
  session.phase = "done";
  const notice = outcome.draw
    ? "🤝 Hai combattuto alla pari con **Voldemort**."
    : youWon
      ? "<a:VC_Verified:1482532479637127188> Hai sconfitto **Voldemort**!"
      : "<a:VC_Cross:1482532424570376253> **Voldemort** ti ha sopraffatto…";
  return buildDuelPayload(client, message.guild, session, ownerFighter, voldemort, outcome, notice, true);
}

async function runPvpDuel(client, guild, session, messageSeed) {
  const left = session.ownerFighter;
  const right = session.opponentFighter;
  if (!left || !right) return { ok: false, message: "Profili duello non caricati." };
  const outcome = resolveDuelOutcome(left, right, messageSeed);
  session.lastOutcome = outcome;
  session.phase = "done";
  return { ok: true, outcome, left, right };
}

function schedulePvpInviteExpiry(message, session) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  setTimeout(() => {
    const live = getSession(messageId);
    if (!live || live.mode !== "pvp" || live.phase !== "pending") return;
    deleteSession(messageId);
    message.edit({
      content: "<a:VC_pixeltime:1482535344103620771> Sfida duello scaduta: nessuna risposta.",
      components: [],
      files: [],
    }).catch(() => {});
  }, PVP_INVITE_TTL_MS);
}

async function acceptPvpChallenge(client, interaction, session) {
  const opponentId = String(interaction.user?.id || "");
  if (opponentId !== session.opponentId) return { ok: false, message: "Solo l'avversario sfidato può accettare." };
  if (session.phase !== "pending") return { ok: false, message: "Questa sfida non è più in attesa." };
  const { assertEconomyAccess } = require("../../Services/Community/galeoniEconomyService");
  const economyAccess = await assertEconomyAccess(interaction, client);
  if (!economyAccess.ok) return { ok: false, message: economyAccess.message };
  const oppUser = await client.users.fetch(session.opponentId).catch(() => null);
  const oppLoaded = await loadDuelFighter(
    client,
    session.guildId,
    session.opponentId,
    session.opponentName,
    oppUser?.username || session.opponentName,
  );
  if (!oppLoaded.ok) return { ok: false, message: oppLoaded.message };
  session.opponentFighter = oppLoaded.fighter;
  const ran = await runPvpDuel(client, interaction.guild, session, interaction.message.id);
  if (!ran.ok) return ran;
  let outcome = ran.outcome;
  if (!outcome.draw && outcome.winnerId) {
    outcome = await attachDuelVictoryRewards(client, interaction.guild, outcome, false, interaction.message.id);
  }
  deleteSession(interaction.message.id);
  const payload = await buildDuelPayload(
    client,
    interaction.guild,
    session,
    ran.left,
    ran.right,
    outcome,
    "",
    true,
  );
  return { ok: true, payload };
}

async function declinePvpChallenge(interaction, session) {
  if (String(interaction.user?.id || "") !== session.opponentId) return { ok: false, message: "Solo l'avversario può rifiutare." };
  if (session.phase !== "pending") return { ok: false, message: "Sfida non più valida." };
  deleteSession(interaction.message.id);
  return {
    ok: true,
    payload: {
      content: `<a:VC_Cross:1482532424570376253> **${session.opponentName}** ha rifiutato il duello.`,
      components: [],
      files: [],
    },
  };
}

async function cancelPvpChallenge(interaction, session) {
  if (String(interaction.user?.id || "") !== session.ownerId) return { ok: false, message: "Solo chi ha lanciato la sfida può annullarla." };
  if (session.phase !== "pending") return { ok: false, message: "Non puoi annullare ora." };
  deleteSession(interaction.message.id);
  return {
    ok: true,
    payload: {
      content: "🚫 Sfida duello annullata.",
      components: [],
      files: [],
    },
  };
}

function warmupDuelPanel() {
  if (typeof renderDuelCanvas.warmup === "function") renderDuelCanvas.warmup();
}

setImmediate(() => {
  warmupDuelPanel();
});

module.exports = { PVP_INVITE_TTL_MS, acceptPvpChallenge, buildInvitePayload, cancelPvpChallenge, declinePvpChallenge, deleteSession, findActiveDuelPvpMessageId, getSession, isDuelGuiCustomId, loadDuelFighter, makeSession, parseDuelGuiCustomId, runBotDuel, schedulePvpInviteExpiry, setSession, warmupDuelPanel };