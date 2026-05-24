const { assertEconomyGamblingAccess, assertEconomyGamblingAccessForUser, economyConfig } = require("../../Services/Community/galeoniEconomyService");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { buildTrisGuiPayload, clampBet, findActiveTrisPvpMessageId, getSession, makeSession, schedulePvpInviteExpiry, setSession, startGame, warmupTrisPanel } = require("../../Utils/Economy/trisGuiRuntime");
const { postGuiPanel, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

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
  allowEmptyArgs: true,
  description: "Tris vs bot o PvP con pannello interattivo.",
  usage: "+tris [puntata] · +tris @utente [puntata]",
  examples: ["+tris", "+tris 10", "+tris @utente", "+tris @utente 25"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "TRIS", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
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
          playerName: msg.member?.displayName || msg.author.username,
          mode: "pvp",
          opponentId: targetUser.id,
          opponentName: opponentMember?.displayName || targetUser.globalName || targetUser.username,
        });
        await warmupTrisPanel();
        const notice = `<:VC_Info:1482526956703580372> **${session.playerName}** sfida **${session.opponentName}** a tris per **${formatGaleoni(session.bet)}** ciascuno.\n${targetUser}, accetta o rifiuta entro 90 secondi.`;
        const sent = await post(msg, {
          payload: await buildTrisGuiPayload(session, access.cfg, notice, false),
          session,
          setSession,
          label: "tris",
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