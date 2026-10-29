const { CURRENCY_CAFFE, CURRENCY_VINILI } = require("../../Services/Community/serverWalletService") as typeof import("../../Services/Community/serverWalletService");
const { parseCurrencyArg, defaultBetCurrency, isServerEconomyEnabled } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { openShopPanel, setSession } = require("../../Utils/Economy/shopGuiRuntime") as typeof import("../../Utils/Economy/shopGuiRuntime");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers") as typeof import("../../Utils/Economy/economyCommandHelpers");

export = {
  name: "shop",
  aliases: ["negozio", "store"],
  allowEmptyArgs: true,
  description: "Apri lo shop Vinili o Caffè con oggetti utili per l'economia server.",
  usage: "+shop [vinili|caffe]",
  examples: ["+shop", "+shop caffe", "+shop vinili"],
  async execute(message?, args?, client?) {
    await runEconomyPanelCommand(message, client, "SHOP", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      if (!isServerEconomyEnabled(c)) {
        await deny(msg, "Lo shop Vinili & Caffè non è disponibile durante l'evento Hogwarts.");
        return;
      }
      const raw = String(args?.[0] || "").trim();
      const parsed = raw ? parseCurrencyArg(raw) : { ok: true, currency: defaultBetCurrency() };
      if (!parsed.ok) {
        await deny(msg, parsed.message || "Valuta non valida: usa `vinili` o `caffe`.");
        return;
      }
      const opened = await openShopPanel(c, msg, parsed.currency || CURRENCY_CAFFE);
      if (!opened.ok) {
        await deny(msg, opened.message);
        return;
      }
      await post(msg, { payload: opened.payload, session: opened.session, setSession, label: "shop" });
    });
  },
};