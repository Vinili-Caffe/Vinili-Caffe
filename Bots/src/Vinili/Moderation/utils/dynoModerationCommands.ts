const { sendModCommandUsageToModLogs } = require("./modAuditLogUtils") as typeof import("./modAuditLogUtils");
const { updateCaseFromEditedModerationCommand } = require("./dynoModerationCommands/caseUpdate") as typeof import("./dynoModerationCommands/caseUpdate");
const { runNamed } = require("./dynoModerationCommands/runNamed") as typeof import("./dynoModerationCommands/runNamed");

async function executeDynoModerationCommand(commandName?, message?, args?, client?) {
  if (message?.__fromMessageUpdatePrefix) {
    const updated = await updateCaseFromEditedModerationCommand(commandName, message, args).catch((err?) => {
      global.logger?.error?.("[dynoModerationCommands] edited command case update failed:", err);
      return false;
    });
    if (updated) return null;
  }
  if (message?.guild) {
    sendModCommandUsageToModLogs(message.guild, message, commandName).catch(() => null);
  }
  await message.channel.sendTyping().catch(() => { });
  return runNamed(commandName, message, Array.isArray(args) ? args : [], client);
}

export = { executeDynoModerationCommand };
