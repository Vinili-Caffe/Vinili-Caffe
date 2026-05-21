const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyAccess, assertEconomyAccessForUser } = require("../../Services/Community/galeoniEconomyService");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { isBotDuelToken } = require("../../Services/Community/hogwartsDuelService");
const {
  buildInvitePayload,
  findActiveDuelPvpMessageId,
  getSession,
  loadDuelFighter,
  makeSession,
  runBotDuel,
  schedulePvpInviteExpiry,
  setSession,
  warmupDuelPanel,
} = require("../../Utils/Economy/duelGuiRuntime");

function extractId(raw) {
  if (!raw) return null;
  const clean = String(raw).replace(/[<@!>]/g, "");
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

async function resolveTargetUser(message, args) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;
  const token = Array.isArray(args) ? args[0] : "";
  if (isBotDuelToken(token)) return null;
  const id = extractId(token);
  if (!id) return undefined;
  return message.client.users.fetch(id).catch(() => null);
}

function isBotMode(args) {
  const token = String(args?.[0] || "").trim().toLowerCase();
  if (!token) return true;
  return isBotDuelToken(token);
}

module.exports = {
  name: "duel",
  description: "Duello magico vs Voldemort o PvP.",
  usage: "+duel · +duel voldemort · +duel @utente",
  examples: ["+duel", "+duel voldemort", "+duel @amico"],
  async execute(message, args, client) {
    const access = await assertEconomyAccess(message, client);
    if (!access.ok) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> ${access.message}`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await message.channel.sendTyping();
    const guild = message.guild;
    if (!guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Questo comando va usato in un server.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const ownerName = message.member?.displayName || message.author.username;
    const ownerLoaded = await loadDuelFighter(client, guild.id, message.author.id, ownerName, message.author.username);
    if (!ownerLoaded.ok) {
      const warn = new EmbedBuilder()
        .setColor("Red")
        .setDescription(`<:vegax:1443934876440068179> ${ownerLoaded.message}`);
      await safeMessageReply(message, { embeds: [warn], allowedMentions: { repliedUser: false } });
      return;
    }
    const ownerFighter = {
      ...ownerLoaded.fighter,
      userId: message.author.id,
      username: message.author.username,
    };
    await warmupDuelPanel();
    const targetUser = await resolveTargetUser(message, args);
    if (targetUser === undefined && args?.[0] && !isBotDuelToken(args[0])) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Utente non trovato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const botMode = targetUser == null && (isBotMode(args) || !args?.length);
    if (!botMode && targetUser) {
      if (targetUser.bot) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Sfida il bot con `+duel voldemort`.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (targetUser.id === message.author.id) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Non puoi duellare contro te stesso.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (findActiveDuelPvpMessageId(guild.id, message.author.id)) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Hai già un duello PvP in attesa.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (findActiveDuelPvpMessageId(guild.id, targetUser.id)) {
        await safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Quell'utente ha già un duello in corso.",
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const opponentMember = message.mentions.members?.first()
        || (await getGuildMemberCached(guild, targetUser.id).catch(() => null));
      const opponentAccess = await assertEconomyAccessForUser(client, guild, opponentMember, targetUser.id);
      if (!opponentAccess.ok) {
        await safeMessageReply(message, {
          content: `<:vegax:1443934876440068179> ${targetUser} non può duellare: ${opponentAccess.message}`,
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const opponentName = opponentMember?.displayName || targetUser.globalName || targetUser.username;
      const oppLoaded = await loadDuelFighter(client, guild.id, targetUser.id, opponentName, targetUser.username);
      if (!oppLoaded.ok) {
        await safeMessageReply(message, {
          content: `<:vegax:1443934876440068179> ${targetUser}: ${oppLoaded.message}`,
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const session = makeSession({
        ownerId: message.author.id,
        guildId: guild.id,
        playerName: ownerName,
        mode: "pvp",
        opponentId: targetUser.id,
        opponentName,
      });
      session.ownerFighter = ownerFighter;
      const notice = `<:VC_Info:1482526956703580372> ${targetUser}, accetta o rifiuta la sfida.`;
      const payload = await buildInvitePayload(client, guild, session, ownerFighter, notice);
      const sent = await safeMessageReply(message, payload);
      if (sent?.id) {
        setSession(sent.id, session);
        schedulePvpInviteExpiry(sent, getSession(sent.id) || session);
      }
      return;
    }
    const payload = await runBotDuel(client, message, ownerFighter, message.id);
    await safeMessageReply(message, payload);
  },
};