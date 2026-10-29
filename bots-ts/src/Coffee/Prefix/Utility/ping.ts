const mongoose = require("mongoose") as typeof import("mongoose");
const { executePingCommand } = require("../../../shared/discord/pingRuntime") as typeof import("../../../shared/discord/pingRuntime");

async function pingDbLatencyMs() {
  const db = mongoose.connection?.db;
  if (!db || mongoose.connection?.readyState !== 1) return null;
  const startedAt = Date.now();
  await db.admin().ping();
  return Math.max(0, Date.now() - startedAt);
}

export = {
  name: "ping",
  allowEmptyArgs: true,
  description: "Mostra latenza bot, database e uptime.",
  async execute(message?) {
    await executePingCommand(message, { pingDbLatencyMs });
  },
};
