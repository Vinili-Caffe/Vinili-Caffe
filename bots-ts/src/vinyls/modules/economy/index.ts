import { logger } from "../../../shared";
import { isMongoConnected } from "../../../shared/mongo";
import { registerPrefixCommand } from "../../prefix/registry";
import { coinflipCommand } from "../minigames/coinflip";
import {
  balCommand,
  dailyCommand,
  monthlyCommand,
  shopCommand,
  weeklyCommand,
  workCommand,
} from "./commands";
import {
  blackjackCommand,
  robCommand,
  rouletteCommand,
  rpsCommand,
  scratchCommand,
  slotsCommand,
  trisCommand,
} from "./games";
import { registerSimpleGuiInteractions } from "./simpleGuis";
import { registerSlotsGuiInteractions } from "./slotsGui";
import { flushWalletsToMongo, hydrateWalletsFromMongo } from "./wallet";

export async function registerEconomyModule(): Promise<void> {
  await hydrateWalletsFromMongo();
  registerSlotsGuiInteractions();
  registerSimpleGuiInteractions();
  registerPrefixCommand(balCommand);
  registerPrefixCommand(dailyCommand);
  registerPrefixCommand(weeklyCommand);
  registerPrefixCommand(monthlyCommand);
  registerPrefixCommand(workCommand);
  registerPrefixCommand(shopCommand);
  registerPrefixCommand(coinflipCommand);
  registerPrefixCommand(robCommand);
  registerPrefixCommand(slotsCommand);
  registerPrefixCommand(rouletteCommand);
  registerPrefixCommand(rpsCommand);
  registerPrefixCommand(blackjackCommand);
  registerPrefixCommand(scratchCommand);
  registerPrefixCommand(trisCommand);

  const flushMs = Math.max(5_000, Number(process.env.VC_TS_ECONOMY_FLUSH_MS) || 30_000);
  const timer = setInterval(() => {
    void flushWalletsToMongo();
  }, flushMs);
  timer.unref?.();

  logger.info(
    `[economy] on (${isMongoConnected() ? "mongo" : "memory"} + slots GUI panel + games)`,
  );
}
