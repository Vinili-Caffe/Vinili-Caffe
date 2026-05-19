const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyAccess } = require("../../Services/Community/galeoniEconomyService");
const { buildRouletteGuiPayload, clampBet, formatRouletteSpinNotice, getSession, makeSession, normalizeQuickChoice, pushRouletteSpinGif, setChoice, setSession, spinRouletteSession, warmupRoulettePanel } = require("../../Utils/Economy/rouletteGuiRuntime");

module.exports = {
  name: "roulette",
  description: "Apri la roulette interattiva con ruota animata.",
  usage: "+roulette [puntata] [rosso|nero|pari|dispari|0-36]",
  examples: ["+roulette", "+roulette 10 rosso", "+roulette 25 7"],
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
    });
    if (quickChoice) {
      const picked = setChoice(session, quickChoice);
      if (!picked.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${picked.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
    }
    let notice = quickChoice
      ? "Premi **Gira** per lanciare, oppure cambia puntata."
      : "Scegli rosso, nero, pari, dispari o un numero, poi premi **Gira**.";
    await warmupRoulettePanel();
    if (quickChoice) {
      const spin = await spinRouletteSession(client, message, session);
      if (!spin.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${spin.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = formatRouletteSpinNotice(spin.result);
    }
    const didSpin = Boolean(session.lastResult);
    if (didSpin) session.panelAnimating = true;
    let sent;
    if (didSpin) {
      const quickPayload = await buildRouletteGuiPayload(session, access.cfg, "🎡 La pallina è in movimento...", false, false, true);
      sent = await safeMessageReply(message, quickPayload);
      if (sent?.id) {
        setSession(sent.id, session);
        const live = getSession(sent.id) || session;
        void pushRouletteSpinGif(sent, live, access.cfg, "🎡 La pallina è in movimento...", notice);
      }
      return;
    }
    const payload = await buildRouletteGuiPayload(session, access.cfg, notice, false, false);
    sent = await safeMessageReply(message, payload);
    if (sent?.id) setSession(sent.id, session);
  },
};