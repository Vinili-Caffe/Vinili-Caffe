const { assertEconomyGamblingAccess } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { buildBlackjackGuiPayload, clampBet, formatRoundNotice, makeSession, setSession, startHand, warmupBlackjackPanel } = require("../../Utils/Economy/blackjackGuiRuntime") as typeof import("../../Utils/Economy/blackjackGuiRuntime");
const { fetchSpendableBalance } = require("../../Utils/Economy/economyBetModal") as typeof import("../../Utils/Economy/economyBetModal");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers") as typeof import("../../Utils/Economy/economyCommandHelpers");

export = {
  name: "blackjack",
  aliases: ["bj"],
  allowEmptyArgs: true,
  description: "Gioca a blackjack contro il banco con pannello interattivo.",
  usage: "+blackjack [puntata] · +bj [puntata]",
  examples: ["+blackjack", "+bj 10", "+blackjack 25"],
  async execute(message?, args?, client?) {
    await runEconomyPanelCommand(message, client, "BLACKJACK", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
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
      await warmupBlackjackPanel();
      let notice = "Regola la puntata e premi **Distribuisci** per iniziare subito.";
      if (rawBet != null) {
        const dealt = await startHand(c, msg, session);
        if (!dealt.ok) {
          await deny(msg, dealt.message);
          return;
        }
        notice = dealt.instant
          ? formatRoundNotice(dealt.result)
          : "<a:VC_Verified:1482532479637127188> Mano in corso — Carta, Stai o Raddoppia.";
      }
      const payload = await buildBlackjackGuiPayload(session, access.cfg, notice, false, balance);
      await post(msg, { payload, session, setSession, label: "blackjack" });
    });
  },
};