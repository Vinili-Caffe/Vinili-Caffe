import type { Client } from "discord.js";
import { registerBirthdayLoop } from "./birthday";
import { registerBoostAnnounce } from "./boost";
import { registerBumpAnnounceLoop } from "./bump";
import { registerCustomPerksBackend } from "./customPerks";
import { registerGiveawayModule } from "./giveaway";
import { registerCommunityOps } from "./ops";
import { registerWeeklyWinnersLoop } from "./weeklyWinners";

export function registerCommunityModule(client: Client): void {
  registerBoostAnnounce(client);
  registerBirthdayLoop(client);
  registerWeeklyWinnersLoop(client);
  registerCommunityOps(client);
  registerGiveawayModule(client);
  registerCustomPerksBackend(client);
  registerBumpAnnounceLoop(client);
}
