/**
 * When `<KIND>_EXTERNAL=1` on the Discord bot, background loops must no-op there
 * and run only in the process that sets `<KIND>_WORKER=1` (bot-workers / dedicated apps).
 */
function envFlagOn(name?) {
  return String(process.env[name] || "").trim() === "1";
}

/**
 * @param {"BOT_SCHEDULER"|"COMMUNITY_POLL"|"AUTO_BACKUP"|"VOTE_QUEUE"|"PARTNERSHIP_MIGRATION"|"MARKOV"|"MINIGAMES"} kind
 */
function shouldStartExternalWorkerLoop(kind?) {
  const key = String(kind || "").trim().toUpperCase();
  if (!key) return true;
  const dedicated = envFlagOn(`${key}_WORKER`);
  const external = envFlagOn(`${key}_EXTERNAL`);
  if (external && !dedicated) return false;
  return true;
}

export = { envFlagOn, shouldStartExternalWorkerLoop };
