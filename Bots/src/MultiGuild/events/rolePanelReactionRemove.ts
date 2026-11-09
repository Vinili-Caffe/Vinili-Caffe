/** Pannelli ruoli con reazioni: reazione tolta → ruolo tolto. */
const { onReactionRemove } = require("../services/rolePanelReactions") as typeof import("../services/rolePanelReactions");

export = {
  name: "messageReactionRemove",
  async execute(reaction?, user?) {
    await onReactionRemove(reaction, user);
  },
};
