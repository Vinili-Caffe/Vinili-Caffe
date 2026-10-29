const { assertEconomyGamblingAccess, assertEconomyGamblingAccessForUser, economyConfig } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { formatGaleoni } = require("../../Services/Community/gringottService") as typeof import("../../Services/Community/gringottService");
const { buildRpsGuiPayload, clampBet, findActivePvpMessageId, formatRpsRoundNotice, makeSession, playRpsSession, schedulePvpInviteExpiry, scheduleRpsIdlePanel, setSession, warmupRpsPanel } = require("../../Utils/Economy/rpsGuiRuntime") as typeof import("../../Utils/Economy/rpsGuiRuntime");
const { postGuiPanel, replyDeny, resolveEconomyOpponentArg, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers") as typeof import("../../Utils/Economy/economyCommandHelpers");
const { economyUsername } = require("../../Utils/Economy/economyDisplayHelpers") as typeof import("../../Utils/Economy/economyDisplayHelpers");

function extractUserId(value?) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

function normalizeQuickChoice(raw?) {
  const v = String(raw || "").trim().toLowerCase();
  if (["rock", "sasso"].includes(v)) return "sasso";
  if (["paper", "carta"].includes(v)) return "carta";
  if (["scissors", "forbici", "forbice"].includes(v)) return "forbici";
  return "";
}

function parseBetArg(raw?, cfg?, fallback?) {
  if (raw == null || raw === "") return clampBet(fallback, cfg);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampBet(n, cfg);
}

function isNonUserToken(token?, cfg?) {
  const t = String(token || "").trim();
  if (!t) return true;
  if (normalizeQuickChoice(t)) return true;
  if (parseBetArg(t, cfg, null) != null && /^\d+$/.test(t)) return true;
  return false;
}

export = {
  name: "rps",
  allowEmptyArgs: true,
  description: "Gioca a sasso carta forbici con pannello animato (puntata in Vinili o Caffè).",
  usage: "+rps [puntata] [sasso|carta|forbici] · +rps <@utente|username> [puntata]",
  examples: ["+rps", "+rps 10", "+rps 20 carta", "+rps @utente 25", "+rps username 25"],
  async execute(message?, args?, client?) {
    await runEconomyPanelCommand(message, client, "RPS", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const cfg = economyConfig(c);
      const targetUser = await resolveEconomyOpponentArg(msg, args, {
        skipToken: (token?) => isNonUserToken(token, cfg),
      });
      let rawBet = cfg.minBet;
      if (targetUser) {
        if (args?.[0] && (extractUserId(args[0]) || String(args[0]).trim()) && parseBetArg(args[1], cfg, cfg.minBet) != null) {
          rawBet = parseBetArg(args[1], cfg, cfg.minBet);
        } else if (args?.[0] && !extractUserId(args[0]) && parseBetArg(args[0], cfg, cfg.minBet) != null && isNonUserToken(args[0], cfg)) {
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
            playerName: economyUsername(msg.author),
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
          if (sent?.id) scheduleRpsIdlePanel(sent, session, access.cfg, notice);
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
        const { assertDifferentHouses } = require("../../Services/Community/galeoniEconomyService") as typeof import("../../Services/Community/galeoniEconomyService");
        const houseGate = await assertDifferentHouses(c, msg.guild.id, msg.author.id, targetUser.id, {
          actionLabel: "le sfide PvP",
        });
        if (!houseGate.ok) {
          await deny(msg, houseGate.message);
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
          playerName: economyUsername(msg.author),
          mode: "pvp",
          opponentId: targetUser.id,
          opponentName: economyUsername(targetUser),
        });
        await warmupRpsPanel();
        const notice = `<:VC_Info:1482526956703580372> **${session.playerName}** sfida **${session.opponentName}** per **${formatGaleoni(session.bet)}** ciascuno.\n${targetUser}, accetta o rifiuta entro 90 secondi.`;
        const sent = await post(msg, {
          payload: await buildRpsGuiPayload(session, access.cfg, notice, false, false),
          session,
          setSession,
          label: "morra",
        });
        if (sent?.id) schedulePvpInviteExpiry(sent, session, access.cfg);
        return;
      }
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet, access.cfg),
        cfg: access.cfg,
        playerName: economyUsername(msg.author),
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