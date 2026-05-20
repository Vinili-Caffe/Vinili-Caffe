const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyGamblingAccess, economyConfig } = require("../../Services/Community/galeoniEconomyService");
const { buildRouletteGuiPayload, clampBet, formatRouletteSpinNotice, getSession, makeSession, normalizeQuickChoice, pushRouletteSpinGif, setChoice, setSession, spinRouletteSession, warmupRoulettePanel } = require("../../Utils/Economy/rouletteGuiRuntime");

module.exports = {
  name: "roulette",
  description: "Apri la roulette interattiva con ruota animata.",
  usage: "+roulette [puntata] [rosso|nero|pari|dispari|0-36]",
  examples: ["+roulette", "+roulette 10 rosso", "+roulette 25 7"],
  async execute(message, args, client) {
    const cfg = economyConfig(client);
    const quickFromFirst = normalizeQuickChoice(args?.[0]);
    const quickSecond = normalizeQuickChoice(args?.[1]);
    let rawBet = cfg.minBet;
    if (quickFromFirst && !quickSecond) rawBet = cfg.minBet;
    else if (args?.[0] != null && !quickFromFirst) {
      const n = Math.floor(Number(args[0]));
      if (Number.isFinite(n) && n > 0) rawBet = n;
    }
    const access = await assertEconomyGamblingAccess(message, client, rawBet);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    let quickChoice = quickSecond || (quickFromFirst && !quickSecond ? quickFromFirst : "");
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
      const spinNotice = "🎡 La pallina è in movimento...";
      const gifPromise = buildRouletteGuiPayload(session, access.cfg, spinNotice, false, true, false);
      sent = await safeMessageReply(message, await buildRouletteGuiPayload(session, access.cfg, spinNotice, false, false, true));
      if (sent?.id) {
        setSession(sent.id, session);
        const live = getSession(sent.id) || session;
        void pushRouletteSpinGif(sent, live, access.cfg, spinNotice, notice, { skipPlaceholder: true, gifPromise });
      }
      return;
    }
    const payload = await buildRouletteGuiPayload(session, access.cfg, notice, false, false);
    sent = await safeMessageReply(message, payload);
    if (sent?.id) setSession(sent.id, session);
  },
};