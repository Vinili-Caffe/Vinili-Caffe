const { formatGaleoni } = require("../../Services/Community/gringottService");
const { assertEconomyGamblingAccess, flushSlotsGuiPendingBank } = require("../../Services/Community/activeEconomyService");
const { buildSlotsGuiPayload, clampBet, formatSlotsSpinNotice, getSession, makeSession, scheduleSlotsIdlePanel, setSession, spinSession, warmupSlotsPanel } = require("../../Utils/Economy/slotsGuiRuntime");
const { fetchSpendableBalance } = require("../../Utils/Economy/economyBetModal");
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
      const balance = await fetchSpendableBalance(c, { guildId: msg.guild.id, ownerId: msg.author.id });
      const rawBet = args?.[0] == null ? access.cfg.minBet : args[0];
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet, access.cfg, balance),
        cfg: access.cfg,
      });
      let notice = noticePrefix;
      if (args?.[0] != null) {
        const spin = await spinSession(c, msg, session);
        if (!spin.ok) {
          await deny(msg, spin.message, { gambling: true });
          return;
        }
        notice = formatSlotsSpinNotice(spin.result);
      }
      await warmupSlotsPanel();
      const didSpin = Boolean(session.lastResult);
      if (didSpin) session.panelAnimating = true;
      if (didSpin) {
        const gifPayload = await buildSlotsGuiPayload(session, access.cfg, "🎰 I rulli stanno girando...", false, true, balance);
        const sent = await post(msg, { payload: gifPayload, session, setSession, label: "slot" });
        if (sent?.id) {
          const live = (await getSession(sent.id, msg.guild.id)) || session;
          scheduleSlotsIdlePanel(sent, live, access.cfg, notice);
        }
        return;
      }
      const payload = await buildSlotsGuiPayload(session, access.cfg, notice || noticePrefix, false, false, balance);
      await post(msg, { payload, session, setSession, label: "slot" });
    });
  },
};