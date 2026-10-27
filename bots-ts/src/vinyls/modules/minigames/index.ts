import type { Client } from "discord.js";
import { logger } from "../../../shared";
import { registerMinigameScheduler } from "./scheduler";

/**
 * Minigames Keep core (scheduler). Event SW/ship via VC_PLUGINS.
 * `coinflip` resta in economy module (nome live Economy).
 */
export function registerMinigamesModule(client?: Client): void {
  if (client) registerMinigameScheduler(client);
  else logger.info("[minigames] core idle (passa client per scheduler)");
}
