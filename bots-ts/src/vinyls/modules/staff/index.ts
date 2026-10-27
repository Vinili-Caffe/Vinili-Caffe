import { logger } from "../../../shared";
import { registerPrefixCommand } from "../../prefix/registry";
import type { Client } from "discord.js";
import {
  badgesCommand,
  historyCommand,
  leaderboardCommand,
  pointsCommand,
  randomCommand,
} from "./commands";
import { registerStaffLoops } from "./loops";
import { flushStaffPoints, hydrateStaffPoints } from "./points";
import { profileCommand } from "./profile";

export async function registerStaffModule(client?: Client): Promise<void> {
  await hydrateStaffPoints();
  registerPrefixCommand(pointsCommand);
  registerPrefixCommand(leaderboardCommand);
  registerPrefixCommand(historyCommand);
  registerPrefixCommand(badgesCommand);
  registerPrefixCommand(randomCommand);
  registerPrefixCommand(profileCommand);
  if (client) registerStaffLoops(client);
  const timer = setInterval(() => void flushStaffPoints(), 30_000);
  timer.unref?.();
  logger.info("[staff] points/leaderboard/history/badges/random/profile + loops");
}
