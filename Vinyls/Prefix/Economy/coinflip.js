const { assertEconomyGamblingAccess, economyConfig } = require("../../Services/Community/galeoniEconomyService");
const { buildCoinflipGuiPayload, clampBet, formatCoinflipNotice, getSession, makeSession, normalizeQuickChoice, playCoinflipSession, scheduleCoinflipIdlePanel, setSession, warmupCoinflipPanel } = require("../../Utils/Economy/coinflipGuiRuntime");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

function parseBetArg(raw, cfg, fallback) {
  if (raw == null || raw === "") return clampBet(fallback, cfg);
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return null;
  return clampBet(n, cfg);
}

module.exports = {
  name: "coinflip",
  aliases: ["cf"],
  allowEmptyArgs: true,
  description: "Lancia la moneta: testa o croce con pannello interattivo.",
  usage: "+coinflip [puntata] [testa|croce] · +cf",
  examples: ["+coinflip", "+cf 10 testa", "+cf 20 croce"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "COINFLIP", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const cfg = economyConfig(c);
      const quickFromFirst = normalizeQuickChoice(args?.[0]);
      const quickSecond = normalizeQuickChoice(args?.[1]);
      let rawBet = cfg.minBet;
      if (quickFromFirst && !quickSecond) rawBet = cfg.minBet;
      else if (args?.[0] != null && parseBetArg(args[0], cfg, cfg.minBet) != null) {
        rawBet = parseBetArg(args[0], cfg, cfg.minBet);
      }
      const access = await assertEconomyGamblingAccess(msg, c, rawBet);
      if (!access.ok) {
        await deny(msg, access.message, { gambling: true });
        return;
      }
      const quickChoice = quickSecond || (quickFromFirst && !quickSecond ? quickFromFirst : "");
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet, access.cfg),
        cfg: access.cfg,
      });
      await warmupCoinflipPanel();
      let notice = "Scegli **Testa** o **Croce**.";
      if (quickChoice) {
        const flipped = await playCoinflipSession(c, msg, session, quickChoice);
        if (!flipped.ok) {
          await deny(msg, flipped.message);
          return;
        }
        notice = formatCoinflipNotice(flipped.result);
      }
      const didFlip = Boolean(session.lastResult);
      if (didFlip) session.panelAnimating = true;
      if (didFlip) {
        const sent = await post(msg, {
          payload: await buildCoinflipGuiPayload(session, access.cfg, "🪙 La moneta è in aria…", false, true),
          session,
          setSession,
          label: "coinflip",
        });
        if (sent?.id) scheduleCoinflipIdlePanel(sent, getSession(sent.id) || session, access.cfg, notice);
        return;
      }
      await post(msg, {
        payload: await buildCoinflipGuiPayload(session, access.cfg, notice, false, false),
        session,
        setSession,
        label: "coinflip",
      });
    });
  },
};