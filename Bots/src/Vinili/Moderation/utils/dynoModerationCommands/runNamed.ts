const { reply } = require("./helpers") as typeof import("./helpers");
const { runBan, runKick, runMute, runUnmute, runUnban } = require("./banKickMute") as typeof import("./banKickMute");
const { runWarn, runWarnings, runDelwarn, runClearwarn } = require("./warnCommands") as typeof import("./warnCommands");
const { runCaseFamily } = require("./caseCommands") as typeof import("./caseCommands");
const { runModlogsOrModerations } = require("./logsCommands") as typeof import("./logsCommands");
const { runLockOrUnlock } = require("./lockCommands") as typeof import("./lockCommands");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
async function runNamed(name?, message?, args?, client?) {
  const cmd = String(name || "").toLowerCase();

  if (cmd === "ban") return runBan(message, args, client);
  if (cmd === "kick") return runKick(message, args, client);
  if (cmd === "mute") return runMute(message, args, client);
  if (cmd === "unmute") return runUnmute(message, args, client);
  if (cmd === "unban") return runUnban(message, args, client);
  if (cmd === "warn") return runWarn(message, args, client);
  if (cmd === "warnings") return runWarnings(message, args, client, cmd);
  if (cmd === "delwarn") return runDelwarn(message, args, client);
  if (cmd === "clearwarn") return runClearwarn(message, args, client);
  if (cmd === "case" || cmd === "reason" || cmd === "duration") {
    return runCaseFamily(cmd, message, args, client);
  }
  if (cmd === "modlogs" || cmd === "moderations") {
    return runModlogsOrModerations(cmd, message, args);
  }
  if (cmd === "lock" || cmd === "unlock") {
    return runLockOrUnlock(cmd, message, args, client);
  }

  return reply(message, client, "Moderazione", `${E.VC_Lock} Comando non supportato: ${cmd}`, "Red");
}

export = { runNamed };
