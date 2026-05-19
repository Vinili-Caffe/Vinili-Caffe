const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { assertEconomyAccess, flushSlotsGuiPendingBank } = require("../../Services/Community/galeoniEconomyService");
const { buildSlotsGuiPayload, clampBet, formatSlotsSpinNotice, getSession, makeSession, scheduleSlotsIdlePanel, setSession, spinSession, warmupSlotsPanel } = require("../../Utils/Economy/slotsGuiRuntime");

module.exports = {
  name: "slots",
  aliases: ["slot"],
  description: "Apri la slot interattiva con puntata, giri e riscossione.",
  usage: "+slots [puntata]",
  examples: ["+slots", "+slots 10", "+slots 50"],
  async execute(message, args, client) {
    const access = await assertEconomyAccess(message, client);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const flushed = await flushSlotsGuiPendingBank(client, message);
    let noticePrefix = "";
    if (flushed?.ok && flushed.amount > 0) {
      noticePrefix = `🪙 Accreditati **${formatGaleoni(flushed.amount)}** da una sessione precedente.\n\n`;
    }
    const rawBet = args?.[0] == null ? access.cfg.minBet : args[0];
    const session = makeSession({
      ownerId: message.author.id,
      guildId: message.guild.id,
      bet: clampBet(rawBet, access.cfg),
      cfg: access.cfg,
    });
    let notice = noticePrefix;
    if (args?.[0] != null) {
      const spin = await spinSession(client, message, session);
      if (!spin.ok) {
        await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${spin.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = formatSlotsSpinNotice(spin.result, session);
    }
    await warmupSlotsPanel();
    const didSpin = Boolean(session.lastResult);
    if (didSpin) session.panelAnimating = true;
    let sent;
    if (didSpin) {
      const gifPayload = await buildSlotsGuiPayload(session, access.cfg, "🎰 I rulli stanno girando...", false, true);
      sent = await safeMessageReply(message, gifPayload);
      if (sent?.id) {
        setSession(sent.id, session);
        const live = (await getSession(sent.id, message.guild.id)) || session;
        scheduleSlotsIdlePanel(sent, live, access.cfg, notice);
      }
      return;
    }
    const payload = await buildSlotsGuiPayload(session, access.cfg, notice || noticePrefix, false, false);
    sent = await safeMessageReply(message, payload);
    if (sent?.id) setSession(sent.id, session);
  },
};