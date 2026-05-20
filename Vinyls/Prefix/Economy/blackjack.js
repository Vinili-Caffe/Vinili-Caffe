const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyGamblingAccess } = require("../../Services/Community/galeoniEconomyService");
const { buildBlackjackGuiPayload, clampBet, formatRoundNotice, makeSession, setSession, startHand, warmupBlackjackPanel } = require("../../Utils/Economy/blackjackGuiRuntime");

module.exports = {
  name: "blackjack",
  aliases: ["bj"],
  description: "Gioca a blackjack contro il banco con pannello interattivo.",
  usage: "+blackjack [puntata] · +bj [puntata]",
  examples: ["+blackjack", "+bj 10", "+blackjack 25"],
  async execute(message, args, client) {
    const rawBet = args?.[0];
    const access = await assertEconomyGamblingAccess(message, client, rawBet);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const session = makeSession({
      ownerId: message.author.id,
      guildId: message.guild.id,
      bet: clampBet(rawBet == null ? access.cfg.minBet : rawBet, access.cfg),
      cfg: access.cfg,
    });
    await warmupBlackjackPanel();
    let notice = "Regola la puntata e premi **Distribuisci** per iniziare subito.";
    if (rawBet != null) {
      const dealt = await startHand(client, message, session);
      if (!dealt.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${dealt.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = dealt.instant ? formatRoundNotice(dealt.result) : "<a:VC_Verified:1482532479637127188> Mano in corso — Carta, Stai o Raddoppia.";
    }
    const payload = await buildBlackjackGuiPayload(session, access.cfg, notice, false);
    const sent = await safeMessageReply(message, payload);
    if (sent?.id) setSession(sent.id, session);
  },
};