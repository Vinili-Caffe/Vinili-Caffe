const { assertEconomyGamblingAccess, assertEconomyGamblingAccessForUser, economyConfig } = require("../../Services/Community/activeEconomyService");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { buildTrisGuiPayload, clampBet, findActiveTrisPvpMessageId, makeSession, schedulePvpInviteExpiry, setSession, startGame, warmupTrisPanel } = require("../../Utils/Economy/trisGuiRuntime");
const { postGuiPanel, resolveEconomyOpponentArg, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");
const { economyUsername } = require("../../Utils/Economy/economyDisplayHelpers");

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

function isNonUserToken(token, cfg) {
  const t = String(token || "").trim();
  if (!t) return true;
  if (parseBetArg(t, cfg, null) != null && /^\d+$/.test(t)) return true;
  return false;
}

module.exports = {
  name: "tris",
  allowEmptyArgs: true,
  description: "Tris vs bot o PvP con pannello interattivo.",
  usage: "+tris [puntata] · +tris <@utente|username> [puntata]",
  examples: ["+tris", "+tris 10", "+tris @utente", "+tris username 25"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "TRIS", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const cfg = economyConfig(c);
      if (cfg?.tris?.enabled === false) {
        await deny(msg, "Il tris è temporaneamente disattivato.");
        return;
      }
      const targetUser = await resolveEconomyOpponentArg(msg, args, {
        skipToken: (token) => isNonUserToken(token, cfg),
      });
      let rawBet = cfg.minBet;
      if (targetUser) {
        if (args?.[0] && (extractUserId(args[0]) || String(args[0]).trim()) && parseBetArg(args[1], cfg, cfg.minBet) != null) {
          rawBet = parseBetArg(args[1], cfg, cfg.minBet);
        } else if (args?.[0] && !extractUserId(args[0]) && parseBetArg(args[0], cfg, cfg.minBet) != null && isNonUserToken(args[0], cfg)) {
          rawBet = parseBetArg(args[0], cfg, cfg.minBet);
        }
      } else if (args?.[0] != null && parseBetArg(args[0], cfg, cfg.minBet) != null) {
        rawBet = parseBetArg(args[0], cfg, cfg.minBet);
      }
      const access = await assertEconomyGamblingAccess(msg, c, rawBet);
      if (!access.ok) {
        await deny(msg, access.message, { gambling: true });
        return;
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
        const { assertDifferentHouses } = require("../../Services/Community/galeoniEconomyService");
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
        if (findActiveTrisPvpMessageId(msg.guild.id, msg.author.id)) {
          await deny(msg, "Hai già una sfida tris attiva.");
          return;
        }
        if (findActiveTrisPvpMessageId(msg.guild.id, targetUser.id)) {
          await deny(msg, "Quell'utente ha già una sfida tris in corso.");
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
        await warmupTrisPanel();
        const notice = `<:VC_Info:1482526956703580372> **${session.playerName}** sfida **${session.opponentName}** a tris per **${formatGaleoni(session.bet)}** ciascuno.\n${targetUser}, accetta o rifiuta entro 90 secondi.`;
        const sent = await post(msg, {
          payload: await buildTrisGuiPayload(session, access.cfg, notice, false),
          session,
          setSession,
          label: "tris",
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
      await warmupTrisPanel();
      let notice = "Regola la puntata e premi **Inizia** per giocare vs bot.";
      if (args?.[0] != null && parseBetArg(args[0], access.cfg, access.cfg.minBet) != null) {
        const started = await startGame(c, msg, session);
        if (!started.ok) {
          await deny(msg, started.message);
          return;
        }
        notice = "<a:VC_Verified:1482532479637127188> Partita iniziata — scegli una casella.";
      }
      await post(msg, {
        payload: await buildTrisGuiPayload(session, access.cfg, notice, false),
        session,
        setSession,
        label: "tris",
      });
    });
  },
};