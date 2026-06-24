const { assertEconomyGamblingAccess } = require("../../Services/Community/serverEconomyService");
const { buildScratchGuiPayload, buyTicket, clampBet, formatScratchNotice, getSession, makeSession, revealAll, scheduleScratchRevealPanel, setSession, warmupScratchPanel } = require("../../Utils/Economy/scratchGuiRuntime");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "scratch",
  allowEmptyArgs: true,
  description: "Gratta e vinci interattivo con biglietto realistico.",
  usage: "+scratch [puntata]",
  examples: ["+scratch", "+scratch 10"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "SCRATCH", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const rawBet = args?.[0];
      const access = await assertEconomyGamblingAccess(msg, c, rawBet);
      if (!access.ok) {
        await deny(msg, access.message, { gambling: true });
        return;
      }
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet == null ? access.cfg.minBet : rawBet, access.cfg),
        cfg: access.cfg,
      });
      await warmupScratchPanel();
      let notice = "Premi **Compra** per il biglietto, poi gratta le 9 zone.";
      if (rawBet != null) {
        const bought = await buyTicket(c, msg, session);
        if (!bought.ok) {
          await deny(msg, bought.message);
          return;
        }
        const all = await revealAll(c, msg, session, access.cfg);
        if (!all.ok) {
          await deny(msg, all.message);
          return;
        }
        notice = formatScratchNotice(all.result);
        const sent = await post(msg, {
          payload: await buildScratchGuiPayload(session, access.cfg, "✨ Grattata in corso…", false, true),
          session,
          setSession,
          label: "gratta e vinci",
        });
        if (sent?.id) scheduleScratchRevealPanel(sent, getSession(sent.id) || session, access.cfg, notice);
        return;
      }
      await post(msg, {
        payload: await buildScratchGuiPayload(session, access.cfg, notice, false, false),
        session,
        setSession,
        label: "gratta e vinci",
      });
    });
  },
};