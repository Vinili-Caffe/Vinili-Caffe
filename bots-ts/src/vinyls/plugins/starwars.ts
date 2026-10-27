import type { Client } from "discord.js";
import { logger } from "../../shared";
import { registerStarWarsEventCommands } from "./eventCommands";
import { definePlugin } from "./registry";

definePlugin({
  id: "starwars",
  register(_client: Client) {
    registerStarWarsEventCommands();
    logger.info("[plugin:starwars] +punta/+ordine66/+conquista/+swspawn on (shell logic)");
  },
});
