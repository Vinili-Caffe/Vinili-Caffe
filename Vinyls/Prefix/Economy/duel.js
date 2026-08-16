const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { resolveEconomyMode } = require("../../Services/Community/activeEconomyService");
const { assertEconomyAccess, assertEconomyAccessForUser } = require("../../Services/Community/galeoniEconomyService");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { duelCooldownDenyMessage, isBotDuelToken, peekDuelCooldown, reserveDuelCooldown, clearDuelCooldown } = require("../../Services/Community/hogwartsDuelService");
const { buildDuelPayload, buildInvitePayload, findActiveDuelPvpMessageId, loadDuelFighter, makeSession, pushDuelFightSequence, runBotDuel, schedulePvpInviteExpiry, setSession, warmupDuelPanel } = require("../../Utils/Economy/duelGuiRuntime");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");
const { economyUsername } = require("../../Utils/Economy/economyDisplayHelpers");
const DISABLED_MESSAGE = "Il comando `+duel` è riservato all'evento Hogwarts e non fa parte dell'economia Vinili & Caffè.";

async function resolveTargetUser(message, args) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned;
  const token = Array.isArray(args) ? args[0] : "";
  if (isBotDuelToken(token)) return null;
  const { resolveEconomyUserArg } = require("../../Utils/Economy/economyCommandHelpers");
  const resolved = await resolveEconomyUserArg(message, token);
  if (resolved) return resolved;
  if (String(token || "").trim()) return undefined;
  return null;
}

function isBotMode(args) {
  const token = String(args?.[0] || "").trim().toLowerCase();
  if (!token) return true;
  return isBotDuelToken(token);
}

module.exports = {
  name: "duel",
  allowEmptyArgs: true,
  description: "Duello magico vs Voldemort o PvP (evento Hogwarts).",
  usage: "+duel · +duel voldemort · +duel @utente|username",
  examples: ["+duel", "+duel voldemort", "+duel @amico", "+duel username"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "DUEL", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      if (resolveEconomyMode(c) !== "galeoni") {
        await deny(msg, DISABLED_MESSAGE);
        return;
      }
      const access = await assertEconomyAccess(msg, c);
      if (!access.ok) {
        await deny(msg, access.message);
        return;
      }
      const guild = msg.guild;
      const cooldown = await peekDuelCooldown(c, guild.id, msg.author.id);
      if (!cooldown.ok) {
        await deny(msg, cooldown.message);
        return;
      }
      const ownerName = economyUsername(msg.author);
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
        const { assertDifferentHouses } = require("../../Services/Community/galeoniEconomyService");
        const houseGate = await assertDifferentHouses(c, guild.id, msg.author.id, targetUser.id, {
          actionLabel: "i duelli",
        });
        if (!houseGate.ok) {
          await deny(msg, houseGate.message);
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
        const opponentName = economyUsername(targetUser);
        const oppLoaded = await loadDuelFighter(c, guild.id, targetUser.id, opponentName, targetUser.username);
        if (!oppLoaded.ok) {
          await deny(msg, `${targetUser}: ${oppLoaded.message}`);
          return;
        }
        const reserved = await reserveDuelCooldown(c, guild.id, msg.author.id);
        if (!reserved.ok) {
          await deny(msg, reserved.message);
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
        session.ownerCooldownReserved = true;
        const notice = `<:VC_Info:1482526956703580372> ${targetUser}, accetta o rifiuta la sfida.`;
        const payload = await buildInvitePayload(c, guild, session, ownerFighter, notice);
        const sent = await post(msg, { payload, session, setSession, label: "duello" });
        if (sent?.id) schedulePvpInviteExpiry(sent, session);
        else await clearDuelCooldown(c, guild.id, msg.author.id).catch(() => {});
        return;
      }
      const reserved = await reserveDuelCooldown(c, guild.id, msg.author.id);
      if (!reserved.ok) {
        await deny(msg, reserved.message);
        return;
      }
      const duel = await runBotDuel(c, msg, ownerFighter, msg.id);
      const startOutcome = { spellLine: "Il duello sta per iniziare…", winnerSide: "pending" };
      const payload = await buildDuelPayload(
        c,
        guild,
        duel.session,
        duel.left,
        duel.right,
        startOutcome,
        "",
        true,
        false,
      );
      const sent = await post(msg, { payload, session: null, setSession: null, label: "duello" });
      if (sent?.edit) {
        await pushDuelFightSequence(
          sent,
          c,
          guild,
          duel.session,
          duel.left,
          duel.right,
          duel.outcome,
          duel.notice,
          { skipPlaceholder: true },
        );
      } else {
        const finalPayload = await buildDuelPayload(
          c,
          guild,
          duel.session,
          duel.left,
          duel.right,
          duel.outcome,
          duel.notice,
          true,
          false,
        );
        await safeMessageReply(msg, finalPayload);
      }
    });
  },
};
