/**
 * Risposte automatiche configurate dalla dashboard: quando un messaggio contiene certe parole
 * il bot risponde e/o mette una reazione.
 * (Fallback sul layer MultiGuild; il path principale è Vinili Community messageCreate → runAutoResponders.)
 */
const { runAutoResponders } = require("../services/autoResponderRuntime") as typeof import("../services/autoResponderRuntime");

export = {
  name: "messageCreate",
  async execute(message?) {
    await runAutoResponders(message);
  },
};
