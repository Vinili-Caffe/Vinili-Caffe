const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyGamblingAccess } = require("../../Services/Community/galeoniEconomyService");
const { buildScratchGuiPayload, buyTicket, clampBet, formatScratchNotice, getSession, makeSession, revealAll, scheduleScratchRevealPanel, setSession, warmupScratchPanel } = require("../../Utils/Economy/scratchGuiRuntime");

module.exports = {
  name: "scratch",
  description: "Gratta e vinci interattivo con biglietto realistico.",
  usage: "+scratch [puntata]",
  examples: ["+scratch", "+scratch 10"],
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
    await warmupScratchPanel();
    let notice = "Premi **Compra** per il biglietto, poi gratta le 9 zone.";
    if (rawBet != null) {
      const bought = await buyTicket(client, message, session);
      if (!bought.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${bought.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      const all = await revealAll(client, message, session, access.cfg);
      if (!all.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${all.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = formatScratchNotice(all.result);
      const sent = await safeMessageReply(message, await buildScratchGuiPayload(session, access.cfg, "✨ Grattata in corso…", false, true));
      if (sent?.id) {
        setSession(sent.id, session);
        scheduleScratchRevealPanel(sent, getSession(sent.id) || session, access.cfg, notice);
      }
      return;
    }
    const sent = await safeMessageReply(message, await buildScratchGuiPayload(session, access.cfg, notice, false, false));
    if (sent?.id) setSession(sent.id, session);
  },
};