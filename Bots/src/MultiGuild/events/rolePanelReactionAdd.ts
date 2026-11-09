/** Pannelli ruoli con reazioni: reazione messa → ruolo dato. */
const { onReactionAdd } = require("../services/rolePanelReactions") as typeof import("../services/rolePanelReactions");

export = {
  name: "messageReactionAdd",
  async execute(reaction?, user?) {
    await onReactionAdd(reaction, user);
  },
};
