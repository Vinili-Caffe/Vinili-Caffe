const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyGamblingAccess, assertEconomyGamblingAccessForUser, economyConfig } = require("../../Services/Community/galeoniEconomyService");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { buildRpsGuiPayload, clampBet, findActivePvpMessageId, formatRpsRoundNotice, getSession, makeSession, playRpsSession, schedulePvpInviteExpiry, scheduleRpsIdlePanel, setSession, warmupRpsPanel } = require("../../Utils/Economy/rpsGuiRuntime");

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

function normalizeQuickChoice(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (["rock", "sasso"].includes(v)) return "sasso";
  if (["paper", "carta"].includes(v)) return "carta";
  if (["scissors", "forbici", "forbice"].includes(v)) return "forbici";
  return "";
}

function parseBetArg(raw, cfg, fallback) {
  if (raw == null || raw === "") return clampBet(fallback, cfg);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampBet(n, cfg);
}

module.exports = {
  name: "rps",
  aliases: ["morra"],
  description: "Gioca a sasso carta forbici con pannello animato e Galeoni.",
  usage: "+rps [puntata] [sasso|carta|forbici] · +rps @utente [puntata]",
  examples: ["+rps", "+rps 10", "+rps 20 carta", "+rps @utente 25"],
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
    } else {
      const quickFromFirst = normalizeQuickChoice(args?.[0]);
      const quickSecond = normalizeQuickChoice(args?.[1]);
      if (quickFromFirst && !quickSecond) rawBet = cfg.minBet;
      else if (args?.[0] != null && parseBetArg(args[0], cfg, cfg.minBet) != null) {
        rawBet = parseBetArg(args[0], cfg, cfg.minBet);
      }
    }
    const access = await assertEconomyGamblingAccess(message, client, rawBet);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    if (!targetUser) {
      let quickChoice = normalizeQuickChoice(args?.[1]);
      const quickFromFirst = normalizeQuickChoice(args?.[0]);
      if (quickFromFirst && !quickChoice) quickChoice = quickFromFirst;
      if (quickChoice) {
        const session = makeSession({
          ownerId: message.author.id,
          guildId: message.guild.id,
          bet: clampBet(rawBet, access.cfg),
          cfg: access.cfg,
          playerName: message.member?.displayName || message.author.username,
        });
        const spin = await playRpsSession(client, message, session, quickChoice);
        if (!spin.ok) {
          await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${spin.message}`, allowedMentions: { repliedUser: false } });
          return;
        }
        session.panelAnimating = true;
        await warmupRpsPanel();
        const notice = formatRpsRoundNotice(spin.result);
        const sent = await safeMessageReply(message, await buildRpsGuiPayload(session, access.cfg, "🎬 3… 2… 1… via!", false, true));
        if (sent?.id) {
          setSession(sent.id, session);
          scheduleRpsIdlePanel(sent, getSession(sent.id) || session, access.cfg, notice);
        }
        return;
      }
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
      if (findActivePvpMessageId(message.guild.id, message.author.id)) {
        await safeMessageReply(message, { content: "<:vegax:1443934876440068179> Hai già una sfida RPS attiva.", allowedMentions: { repliedUser: false } });
        return;
      }
      if (findActivePvpMessageId(message.guild.id, targetUser.id)) {
        await safeMessageReply(message, { content: "<:vegax:1443934876440068179> Quell'utente ha già una sfida RPS in corso.", allowedMentions: { repliedUser: false } });
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
      await warmupRpsPanel();
      const notice = `<:VC_Info:1482526956703580372> **${session.playerName}** sfida **${session.opponentName}** per **${formatGaleoni(session.bet)}** ciascuno.\n${targetUser}, accetta o rifiuta entro 90 secondi.`;
      const sent = await safeMessageReply(message, await buildRpsGuiPayload(session, access.cfg, notice, false, false));
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
    await warmupRpsPanel();
    const payload = await buildRpsGuiPayload(session, access.cfg, "Scegli sasso, carta o forbici per sfidare il bot.", false, false);
    const sent = await safeMessageReply(message, payload);
    if (sent?.id) setSession(sent.id, session);
  },
};