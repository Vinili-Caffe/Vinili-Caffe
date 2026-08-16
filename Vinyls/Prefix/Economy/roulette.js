const { assertEconomyGamblingAccess, economyConfig } = require("../../Services/Community/activeEconomyService");
const { buildRouletteGuiPayload, clampBet, formatRouletteSpinNotice, makeSession, normalizeQuickChoice, pushRouletteSpinGif, setChoice, setSession, spinRouletteSession, warmupRoulettePanel } = require("../../Utils/Economy/rouletteGuiRuntime");
const { fetchSpendableBalance } = require("../../Utils/Economy/economyBetModal");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "roulette",
  allowEmptyArgs: true,
  description: "Apri la roulette interattiva con ruota animata.",
  usage: "+roulette [puntata] [rosso|nero|pari|dispari|0-36]",
  examples: ["+roulette", "+roulette 10 rosso", "+roulette 25 7"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "ROULETTE", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const cfg = economyConfig(c);
      const quickFromFirst = normalizeQuickChoice(args?.[0]);
      const quickSecond = normalizeQuickChoice(args?.[1]);
      let rawBet = cfg.minBet;
      if (quickFromFirst && !quickSecond) rawBet = cfg.minBet;
      else if (args?.[0] != null && !quickFromFirst) {
        const n = Math.floor(Number(args[0]));
        if (Number.isFinite(n) && n > 0) rawBet = n;
      }
      const access = await assertEconomyGamblingAccess(msg, c, rawBet);
      if (!access.ok) {
        await deny(msg, access.message, { gambling: true });
        return;
      }
      const balance = await fetchSpendableBalance(c, { guildId: msg.guild.id, ownerId: msg.author.id });
      const quickChoice = quickSecond || (quickFromFirst && !quickSecond ? quickFromFirst : "");
      const session = makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        bet: clampBet(rawBet, access.cfg, balance),
        cfg: access.cfg,
      });
      if (quickChoice) {
        const picked = setChoice(session, quickChoice);
        if (!picked.ok) {
          await deny(msg, picked.message);
          return;
        }
      }
      let notice = quickChoice
        ? "Premi **Gira** per lanciare, oppure cambia puntata."
        : "Scegli rosso, nero, pari, dispari o un numero, poi premi **Gira**.";
      await warmupRoulettePanel();
      if (quickChoice) {
        const spin = await spinRouletteSession(c, msg, session);
        if (!spin.ok) {
          await deny(msg, spin.message);
          return;
        }
        notice = formatRouletteSpinNotice(spin.result);
      }
      const didSpin = Boolean(session.lastResult);
      if (didSpin) session.panelAnimating = true;
      if (didSpin) {
        const spinNotice = "🎡 La pallina è in movimento...";
        const gifPromise = buildRouletteGuiPayload(session, access.cfg, spinNotice, false, true, false, balance);
        const sent = await post(msg, {
          payload: await buildRouletteGuiPayload(session, access.cfg, spinNotice, false, false, true, balance),
          session,
          setSession,
          label: "roulette",
        });
        if (sent?.id) {
          const live = session;
          void pushRouletteSpinGif(sent, live, access.cfg, spinNotice, notice, { skipPlaceholder: true, gifPromise });
        }
        return;
      }
      const payload = await buildRouletteGuiPayload(session, access.cfg, notice, false, false, false, balance);
      await post(msg, { payload, session, setSession, label: "roulette" });
    });
  },
};