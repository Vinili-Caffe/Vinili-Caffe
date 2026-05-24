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
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

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
  allowEmptyArgs: true,
  description: "Duello magico vs Voldemort o PvP.",
  usage: "+duel · +duel voldemort · +duel @utente",
  examples: ["+duel", "+duel voldemort", "+duel @amico"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "DUEL", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const access = await assertEconomyAccess(msg, c);
      if (!access.ok) {
        await deny(msg, access.message);
        return;
      }
      const guild = msg.guild;
      const ownerName = msg.member?.displayName || msg.author.username;
      const ownerLoaded = await loadDuelFighter(c, guild.id, msg.author.id, ownerName, msg.author.username);
      if (!ownerLoaded.ok) {
        await deny(msg, ownerLoaded.message);
        return;
      }
      const ownerFighter = {
        ...ownerLoaded.fighter,
        userId: msg.author.id,
        username: msg.author.username,
      };
      await warmupDuelPanel();
      const targetUser = await resolveTargetUser(msg, args);
      if (targetUser === undefined && args?.[0] && !isBotDuelToken(args[0])) {
        await deny(msg, "Utente non trovato.");
        return;
      }
      const botMode = targetUser == null && (isBotMode(args) || !args?.length);
      if (!botMode && targetUser) {
        if (targetUser.bot) {
          await deny(msg, "Sfida il bot con `+duel voldemort`.");
          return;
        }
        if (targetUser.id === msg.author.id) {
          await deny(msg, "Non puoi duellare contro te stesso.");
          return;
        }
        if (findActiveDuelPvpMessageId(guild.id, msg.author.id)) {
          await deny(msg, "Hai già un duello PvP in attesa.");
          return;
        }
        if (findActiveDuelPvpMessageId(guild.id, targetUser.id)) {
          await deny(msg, "Quell'utente ha già un duello in corso.");
          return;
        }
        const opponentMember = msg.mentions.members?.first()
          || (await getGuildMemberCached(guild, targetUser.id).catch(() => null));
        const opponentAccess = await assertEconomyAccessForUser(c, guild, opponentMember, targetUser.id);
        if (!opponentAccess.ok) {
          await deny(msg, `${targetUser} non può duellare: ${opponentAccess.message}`);
          return;
        }
        const opponentName = opponentMember?.displayName || targetUser.globalName || targetUser.username;
        const oppLoaded = await loadDuelFighter(c, guild.id, targetUser.id, opponentName, targetUser.username);
        if (!oppLoaded.ok) {
          await deny(msg, `${targetUser}: ${oppLoaded.message}`);
          return;
        }
        const session = makeSession({
          ownerId: msg.author.id,
          guildId: guild.id,
          playerName: ownerName,
          mode: "pvp",
          opponentId: targetUser.id,
          opponentName,
        });
        session.ownerFighter = ownerFighter;
        const notice = `<:VC_Info:1482526956703580372> ${targetUser}, accetta o rifiuta la sfida.`;
        const payload = await buildInvitePayload(c, guild, session, ownerFighter, notice);
        const sent = await post(msg, { payload, session, setSession, label: "duello" });
        if (sent?.id) schedulePvpInviteExpiry(sent, getSession(sent.id) || session);
        return;
      }
      const payload = await runBotDuel(c, msg, ownerFighter, msg.id);
      const sent = await post(msg, { payload, session: null, setSession: null, label: "duello" });
      if (!sent) await safeMessageReply(msg, payload);
    });
  },
};