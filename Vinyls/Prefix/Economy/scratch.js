const { assertEconomyGamblingAccess } = require("../../Services/Community/activeEconomyService");
const { buildScratchGuiPayload, buyTicket, clampBet, formatScratchNotice, makeSession, revealAll, scheduleScratchRevealPanel, setSession, warmupScratchPanel } = require("../../Utils/Economy/scratchGuiRuntime");
const { fetchSpendableBalance } = require("../../Utils/Economy/economyBetModal");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "scratch",
  allowEmptyArgs: true,
  description: "Gratta e vinci: trova 3 simboli uguali.",
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
      const balance = await fetchSpendableBalance(c, { guildId: msg.guild.id, ownerId: msg.author.id });
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet == null ? access.cfg.minBet : rawBet, access.cfg, balance),
        cfg: access.cfg,
      });
      await warmupScratchPanel();
      let notice = "Regola: **trova 3 simboli uguali**. Premi **Compra**, poi gratta.";
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
          payload: await buildScratchGuiPayload(session, access.cfg, "✨ Grattata in corso…", false, true, balance),
          session,
          setSession,
          label: "gratta e vinci",
        });
        if (sent?.id) scheduleScratchRevealPanel(sent, session, access.cfg, notice);
        return;
      }
      await post(msg, {
        payload: await buildScratchGuiPayload(session, access.cfg, notice, false, false, balance),
        session,
        setSession,
        label: "gratta e vinci",
      });
    });
  },
};