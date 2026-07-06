const { assertEconomyGamblingAccess, assertEconomyGamblingAccessForUser, economyConfig } = require("../../Services/Community/activeEconomyService");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { buildRpsGuiPayload, clampBet, findActivePvpMessageId, formatRpsRoundNotice, getSession, makeSession, playRpsSession, schedulePvpInviteExpiry, scheduleRpsIdlePanel, setSession, warmupRpsPanel } = require("../../Utils/Economy/rpsGuiRuntime");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

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
  allowEmptyArgs: true,
  description: "Gioca a sasso carta forbici con pannello animato (puntata in Vinili o Caffè).",
  usage: "+rps [puntata] [sasso|carta|forbici] · +rps @utente [puntata]",
  examples: ["+rps", "+rps 10", "+rps 20 carta", "+rps @utente 25"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "RPS", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const cfg = economyConfig(c);
      const targetUser = msg.mentions.users.first()
        || (extractUserId(args?.[0]) ? await c.users.fetch(extractUserId(args[0])).catch(() => null) : null)
        || (extractUserId(args?.[1]) ? await c.users.fetch(extractUserId(args[1])).catch(() => null) : null);
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
      const access = await assertEconomyGamblingAccess(msg, c, rawBet);
      if (!access.ok) {
        await deny(msg, access.message, { gambling: true });
        return;
      }
      if (!targetUser) {
        let quickChoice = normalizeQuickChoice(args?.[1]);
        const quickFromFirst = normalizeQuickChoice(args?.[0]);
        if (quickFromFirst && !quickChoice) quickChoice = quickFromFirst;
        if (quickChoice) {
          const session = makeSession({
            ownerId: msg.author.id,
            guildId: msg.guild.id,
            bet: clampBet(rawBet, access.cfg),
            cfg: access.cfg,
            playerName: msg.member?.displayName || msg.author.username,
          });
          const spin = await playRpsSession(c, msg, session, quickChoice);
          if (!spin.ok) {
            await deny(msg, spin.message);
            return;
          }
          session.panelAnimating = true;
          await warmupRpsPanel();
          const notice = formatRpsRoundNotice(spin.result);
          const sent = await post(msg, {
            payload: await buildRpsGuiPayload(session, access.cfg, "🎬 3… 2… 1… via!", false, true),
            session,
            setSession,
            label: "morra",
          });
          if (sent?.id) scheduleRpsIdlePanel(sent, getSession(sent.id) || session, access.cfg, notice);
          return;
        }
      }
      if (targetUser) {
        if (targetUser.bot) {
          await deny(msg, "Non puoi sfidare un bot.");
          return;
        }
        if (targetUser.id === msg.author.id) {
          await deny(msg, "Non puoi sfidare te stesso.");
          return;
        }
        const opponentMember = msg.mentions.members?.first()
          || (await msg.guild.members.fetch(targetUser.id).catch(() => null));
        const opponentAccess = await assertEconomyGamblingAccessForUser(c, msg.guild, opponentMember, targetUser.id, rawBet);
        if (!opponentAccess.ok) {
          await deny(msg, opponentAccess.message);
          return;
        }
        if (findActivePvpMessageId(msg.guild.id, msg.author.id)) {
          await deny(msg, "Hai già una sfida RPS attiva.");
          return;
        }
        if (findActivePvpMessageId(msg.guild.id, targetUser.id)) {
          await deny(msg, "Quell'utente ha già una sfida RPS in corso.");
          return;
        }
        const session = makeSession({
          ownerId: msg.author.id,
          guildId: msg.guild.id,
          bet: clampBet(rawBet, access.cfg),
          cfg: access.cfg,
          playerName: msg.member?.displayName || msg.author.username,
          mode: "pvp",
          opponentId: targetUser.id,
          opponentName: opponentMember?.displayName || targetUser.globalName || targetUser.username,
        });
        await warmupRpsPanel();
        const notice = `<:VC_Info:1482526956703580372> **${session.playerName}** sfida **${session.opponentName}** per **${formatGaleoni(session.bet)}** ciascuno.\n${targetUser}, accetta o rifiuta entro 90 secondi.`;
        const sent = await post(msg, {
          payload: await buildRpsGuiPayload(session, access.cfg, notice, false, false),
          session,
          setSession,
          label: "morra",
        });
        if (sent?.id) schedulePvpInviteExpiry(sent, getSession(sent.id) || session, access.cfg);
        return;
      }
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet, access.cfg),
        cfg: access.cfg,
        playerName: msg.member?.displayName || msg.author.username,
      });
      await warmupRpsPanel();
      await post(msg, {
        payload: await buildRpsGuiPayload(session, access.cfg, "Scegli sasso, carta o forbici per sfidare il bot.", false, false),
        session,
        setSession,
        label: "morra",
      });
    });
  },
};