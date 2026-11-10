/** Bump di Disboard/Discadia sui server tenant (il server principale ha il suo sistema). */
const { handleTenantBumpMessage } = require("../services/bumpVotesRuntime") as typeof import("../services/bumpVotesRuntime");

export = {
  name: "messageCreate",
  async execute(message?) {
    if (!message?.author?.bot) return;
    await handleTenantBumpMessage(message).catch((err?) => global.logger?.warn?.("[BUMP VOTES] bump:", err?.message || err));
  },
};
