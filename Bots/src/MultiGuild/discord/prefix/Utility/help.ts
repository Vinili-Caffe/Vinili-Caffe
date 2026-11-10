const { executeTenantHelp } = require("../../../utils/tenantHelp") as typeof import("../../../utils/tenantHelp");

/** +help: guida ai comandi, uguale su tutti i server (main compreso). */
export = {
  name: "help",
  allowEmptyArgs: true,
  description: "Apre la guida ai comandi disponibili su questo server.",
  usage: "+help [comando]",
  examples: ["+help", "+help setup", "+help points"],
  async execute(message?, args?) {
    if (!message?.guild || !message?.member) return;
    return executeTenantHelp(message, args);
  },
};
