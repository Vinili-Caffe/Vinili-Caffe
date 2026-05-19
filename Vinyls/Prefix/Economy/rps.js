const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyAccess } = require("../../Services/Community/galeoniEconomyService");
const { buildRpsGuiPayload, clampBet, formatRpsRoundNotice, getSession, makeSession, playRpsSession, scheduleRpsIdlePanel, setSession } = require("../../Utils/Economy/rpsGuiRuntime");

function normalizeQuickChoice(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (["rock", "sasso"].includes(v)) return "sasso";
  if (["paper", "carta"].includes(v)) return "carta";
  if (["scissors", "forbici", "forbice"].includes(v)) return "forbici";
  return "";
}

module.exports = {
  name: "rps",
  aliases: ["morra"],
  description: "Gioca a sasso carta forbici con pannello animato e Galeoni.",
  usage: "+rps [puntata] [sasso|carta|forbici]",
  examples: ["+rps", "+rps 10", "+rps 20 carta"],
  async execute(message, args, client) {
    const access = await assertEconomyAccess(message, client);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    let quickChoice = normalizeQuickChoice(args?.[1]);
    let rawBet = args?.[0] == null ? access.cfg.minBet : args[0];
    const quickFromFirst = normalizeQuickChoice(args?.[0]);
    if (quickFromFirst && !quickChoice) {
      quickChoice = quickFromFirst;
      rawBet = access.cfg.minBet;
    }
    const session = makeSession({
      ownerId: message.author.id,
      guildId: message.guild.id,
      bet: clampBet(rawBet, access.cfg),
      cfg: access.cfg,
      playerName: message.member?.displayName || message.author.username,
    });
    let notice = "Scegli sasso, carta o forbici per sfidare il rivale.";
    if (quickChoice) {
      const round = await playRpsSession(client, message, session, quickChoice);
      if (!round.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${round.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = formatRpsRoundNotice(round.result);
    }
    const didPlay = Boolean(session.lastResult);
    if (didPlay) session.panelAnimating = true;
    let sent;
    if (didPlay) {
      const gifPayload = await buildRpsGuiPayload(session, access.cfg, "✊ 3… 2… 1… via!", false, true);
      sent = await safeMessageReply(message, gifPayload);
      if (sent?.id) {
        setSession(sent.id, session);
        const live = getSession(sent.id) || session;
        scheduleRpsIdlePanel(sent, live, access.cfg, notice);
      }
      return;
    }
    const payload = await buildRpsGuiPayload(session, access.cfg, notice, false, false);
    sent = await safeMessageReply(message, payload);
    if (sent?.id) setSession(sent.id, session);
  },
};