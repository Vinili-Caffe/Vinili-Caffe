const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyGamblingAccess, assertEconomyGamblingAccessForUser, economyConfig } = require("../../Services/Community/galeoniEconomyService");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const {
  buildTrisGuiPayload,
  clampBet,
  findActiveTrisPvpMessageId,
  getSession,
  makeSession,
  schedulePvpInviteExpiry,
  setSession,
  startGame,
  warmupTrisPanel,
} = require("../../Utils/Economy/trisGuiRuntime");

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

function parseBetArg(raw, cfg, fallback) {
  if (raw == null || raw === "") return clampBet(fallback, cfg);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampBet(n, cfg);
}

module.exports = {
  name: "tris",
  aliases: ["tictactoe", "ttt"],
  description: "Tris vs bot o PvP con pannello interattivo.",
  usage: "+tris [puntata] · +tris @utente [puntata]",
  examples: ["+tris", "+tris 10", "+tris @utente", "+tris @utente 25"],
  async execute(message, args, client) {
    const cfg = economyConfig(client);
    const targetUser = message.mentions.users.first()
      || (extractUserId(args?.[0]) ? await client.users.fetch(extractUserId(args[0])).catch(() => null) : null)
      || (extractUserId(args?.[1]) ? await client.users.fetch(extractUserId(args[1])).catch(() => null) : null);
    let rawBet = cfg.minBet;
    if (targetUser) {
      if (args?.[0] && extractUserId(args[0]) && parseBetArg(args[1], cfg, cfg.minBet) != null) {
        rawBet = parseBetArg(args[1], cfg, cfg.minBet);
      } else if (args?.[0] && !extractUserId(args[0]) && parseBetArg(args[0], cfg, cfg.minBet) != null) {
        rawBet = parseBetArg(args[0], cfg, cfg.minBet);
      }
    } else if (args?.[0] != null && parseBetArg(args[0], cfg, cfg.minBet) != null) {
      rawBet = parseBetArg(args[0], cfg, cfg.minBet);
    }
    const access = await assertEconomyGamblingAccess(message, client, rawBet);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    if (targetUser) {
      if (targetUser.bot) {
        await safeMessageReply(message, { content: "<:vegax:1443934876440068179> Non puoi sfidare un bot.", allowedMentions: { repliedUser: false } });
        return;
      }
      if (targetUser.id === message.author.id) {
        await safeMessageReply(message, { content: "<:vegax:1443934876440068179> Non puoi sfidare te stesso.", allowedMentions: { repliedUser: false } });
        return;
      }
      const opponentMember = message.mentions.members?.first()
        || await message.guild.members.fetch(targetUser.id).catch(() => null);
      const opponentAccess = await assertEconomyGamblingAccessForUser(client, message.guild, opponentMember, targetUser.id, rawBet);
      if (!opponentAccess.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${opponentAccess.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      if (findActiveTrisPvpMessageId(message.guild.id, message.author.id)) {
        await safeMessageReply(message, { content: "<:vegax:1443934876440068179> Hai già una sfida tris attiva.", allowedMentions: { repliedUser: false } });
        return;
      }
      if (findActiveTrisPvpMessageId(message.guild.id, targetUser.id)) {
        await safeMessageReply(message, { content: "<:vegax:1443934876440068179> Quell'utente ha già una sfida tris in corso.", allowedMentions: { repliedUser: false } });
        return;
      }
      const session = makeSession({
        ownerId: message.author.id,
        guildId: message.guild.id,
        bet: clampBet(rawBet, access.cfg),
        cfg: access.cfg,
        playerName: message.member?.displayName || message.author.username,
        mode: "pvp",
        opponentId: targetUser.id,
        opponentName: opponentMember?.displayName || targetUser.globalName || targetUser.username,
      });
      await warmupTrisPanel();
      const notice = `<:VC_Info:1482526956703580372> **${session.playerName}** sfida **${session.opponentName}** a tris per **${formatGaleoni(session.bet)}** ciascuno.\n${targetUser}, accetta o rifiuta entro 90 secondi.`;
      const sent = await safeMessageReply(message, await buildTrisGuiPayload(session, access.cfg, notice, false));
      if (sent?.id) {
        setSession(sent.id, session);
        schedulePvpInviteExpiry(sent, getSession(sent.id) || session, access.cfg);
      }
      return;
    }
    const session = makeSession({
      ownerId: message.author.id,
      guildId: message.guild.id,
      bet: clampBet(rawBet, access.cfg),
      cfg: access.cfg,
      playerName: message.member?.displayName || message.author.username,
    });
    await warmupTrisPanel();
    let notice = "Regola la puntata e premi **Inizia** per giocare vs bot.";
    if (args?.[0] != null && parseBetArg(args[0], access.cfg, access.cfg.minBet) != null) {
      const started = await startGame(client, message, session);
      if (!started.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${started.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = "<a:VC_Verified:1482532479637127188> Partita iniziata — scegli una casella.";
    }
    const payload = await buildTrisGuiPayload(session, access.cfg, notice, false);
    const sent = await safeMessageReply(message, payload);
    if (sent?.id) setSession(sent.id, session);
  },
};