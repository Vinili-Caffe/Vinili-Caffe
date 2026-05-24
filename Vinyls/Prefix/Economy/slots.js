const { formatGaleoni } = require("../../Services/Community/gringottService");
const { assertEconomyGamblingAccess, flushSlotsGuiPendingBank } = require("../../Services/Community/galeoniEconomyService");
const { buildSlotsGuiPayload, clampBet, formatSlotsSpinNotice, getSession, makeSession, scheduleSlotsIdlePanel, setSession, spinSession, warmupSlotsPanel } = require("../../Utils/Economy/slotsGuiRuntime");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "slots",
  aliases: ["slot"],
  allowEmptyArgs: true,
  description: "Apri la slot interattiva con puntata, giri e riscossione.",
  usage: "+slots [puntata]",
  examples: ["+slots", "+slots 10", "+slots 50"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "SLOTS", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const access = await assertEconomyGamblingAccess(msg, c, args?.[0]);
      if (!access.ok) {
        await deny(msg, access.message, { gambling: true });
        return;
      }
      const flushed = await flushSlotsGuiPendingBank(c, msg);
      let noticePrefix = "";
      if (flushed?.ok && flushed.amount > 0) {
        noticePrefix = `🪙 Accreditati **${formatGaleoni(flushed.amount)}** da una sessione precedente.\n\n`;
      }
      const rawBet = args?.[0] == null ? access.cfg.minBet : args[0];
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet, access.cfg),
        cfg: access.cfg,
      });
      let notice = noticePrefix;
      if (args?.[0] != null) {
        const spin = await spinSession(c, msg, session);
        if (!spin.ok) {
          await deny(msg, spin.message, { gambling: true });
          return;
        }
        notice = formatSlotsSpinNotice(spin.result, session);
      }
      await warmupSlotsPanel();
      const didSpin = Boolean(session.lastResult);
      if (didSpin) session.panelAnimating = true;
      if (didSpin) {
        const gifPayload = await buildSlotsGuiPayload(session, access.cfg, "🎰 I rulli stanno girando...", false, true);
        const sent = await post(msg, { payload: gifPayload, session, setSession, label: "slot" });
        if (sent?.id) {
          const live = (await getSession(sent.id, msg.guild.id)) || session;
          scheduleSlotsIdlePanel(sent, live, access.cfg, notice);
        }
        return;
      }
      const payload = await buildSlotsGuiPayload(session, access.cfg, notice || noticePrefix, false, false);
      await post(msg, { payload, session, setSession, label: "slot" });
    });
  },
};