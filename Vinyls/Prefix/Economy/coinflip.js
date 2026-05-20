const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyGamblingAccess, economyConfig } = require("../../Services/Community/galeoniEconomyService");
const { buildCoinflipGuiPayload, clampBet, formatCoinflipNotice, getSession, makeSession, normalizeQuickChoice, playCoinflipSession, scheduleCoinflipIdlePanel, setSession, warmupCoinflipPanel } = require("../../Utils/Economy/coinflipGuiRuntime");

function parseBetArg(raw, cfg, fallback) {
  if (raw == null || raw === "") return clampBet(fallback, cfg);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampBet(n, cfg);
}

module.exports = {
  name: "coinflip",
  aliases: ["cf"],
  description: "Lancia la moneta: testa o croce con pannello interattivo.",
  usage: "+coinflip [puntata] [testa|croce] · +cf",
  examples: ["+coinflip", "+cf 10 testa", "+cf 20 croce"],
  async execute(message, args, client) {
    const cfg = economyConfig(client);
    const quickFromFirst = normalizeQuickChoice(args?.[0]);
    const quickSecond = normalizeQuickChoice(args?.[1]);
    let rawBet = cfg.minBet;
    if (quickFromFirst && !quickSecond) rawBet = cfg.minBet;
    else if (args?.[0] != null && parseBetArg(args[0], cfg, cfg.minBet) != null) {
      rawBet = parseBetArg(args[0], cfg, cfg.minBet);
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
    await warmupCoinflipPanel();
    let notice = "Scegli **Testa** o **Croce**.";
    if (quickChoice) {
      const flipped = await playCoinflipSession(client, message, session, quickChoice);
      if (!flipped.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${flipped.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = formatCoinflipNotice(flipped.result);
    }
    const didFlip = Boolean(session.lastResult);
    if (didFlip) session.panelAnimating = true;
    let sent;
    if (didFlip) {
      sent = await safeMessageReply(message, await buildCoinflipGuiPayload(session, access.cfg, "🪙 La moneta è in aria…", false, true));
      if (sent?.id) {
        setSession(sent.id, session);
        scheduleCoinflipIdlePanel(sent, getSession(sent.id) || session, access.cfg, notice);
      }
      return;
    }
    sent = await safeMessageReply(message, await buildCoinflipGuiPayload(session, access.cfg, notice, false, false));
    if (sent?.id) setSession(sent.id, session);
  },
};