import type { Client } from "discord.js";
import { logger } from "../../../shared";
import { registerPrefixCommand } from "../../prefix/registry";
import { banCommand } from "./ban";
import { caseCommand, casesCommand } from "./case";
import { delwarnCommand } from "./delwarn";
import { durationCommand } from "./duration";
import { infoCommand } from "./info";
import { kickCommand } from "./kick";
import { startModCaseLifecycle } from "./lifecycle";
import { lockCommand, unlockCommand } from "./lock";
import { attachModlogClient, isModlogConfigured } from "./modlog";
import { moderationsCommand } from "./moderations";
import { muteCommand, unmuteCommand } from "./mute";
import { purgeCommand } from "./purge";
import { reasonCommand } from "./reason";
import { unbanCommand } from "./unban";
import { verifyCommand } from "./verify";
import { clearwarnCommand, warnCommand, warningsCommand } from "./warn";

export function registerModerationModule(client?: Client): void {
  registerPrefixCommand(kickCommand);
  registerPrefixCommand(banCommand);
  registerPrefixCommand(unbanCommand);
  registerPrefixCommand(muteCommand);
  registerPrefixCommand(unmuteCommand);
  registerPrefixCommand(warnCommand);
  registerPrefixCommand(warningsCommand);
  registerPrefixCommand(clearwarnCommand);
  registerPrefixCommand(delwarnCommand);
  registerPrefixCommand(caseCommand);
  registerPrefixCommand(casesCommand);
  registerPrefixCommand(reasonCommand);
  registerPrefixCommand(durationCommand);
  registerPrefixCommand(moderationsCommand);
  registerPrefixCommand(infoCommand);
  registerPrefixCommand(verifyCommand);
  registerPrefixCommand(lockCommand);
  registerPrefixCommand(unlockCommand);
  registerPrefixCommand(purgeCommand);

  if (client) {
    attachModlogClient(client);
    startModCaseLifecycle(client);
  }
  logger.info(`[moderation] on · modlog=${isModlogConfigured() ? "channel" : "off"}`);
}
