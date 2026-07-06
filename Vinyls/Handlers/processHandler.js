const logs = require("../Utils/Moderation/logs");
const { flushAllRecoverySnapshots } = require("../../shared/recovery/shutdownCheckpoint");
const { isVoiceTransportError } = require("../../shared/discord/voiceTransportErrors");

let shutdownRunning = false;

function error(message) {
  logs.error(`[ERROR] ${message}`);
}

async function exitAfterFlush(signal) {
  if (shutdownRunning) return;
  shutdownRunning = true;
  error(`${signal}: Flushing recovery snapshots and exiting...`);
  await flushAllRecoverySnapshots(signal).catch((err) => {
    error(`Recovery flush failed: ${err?.stack || err}`);
  });
  setTimeout(() => process.exit(0), 200).unref?.();
}

module.exports = () => {
  if (process.__viniliProcessHandlersInstalled) return;
  process.__viniliProcessHandlersInstalled = true;

  process.on("SIGINT", () => {
    void exitAfterFlush("SIGINT");
  });

  process.on("uncaughtException", (err) => {
    error(`UNCAUGHT EXCEPTION: ${err?.stack || err}`);
  });

  process.on("SIGTERM", () => {
    void exitAfterFlush("SIGTERM");
  });

  process.on("unhandledRejection", (err) => {
    if (isVoiceTransportError(err)) {
      logs.warn(`[PROCESS] Voice transport (recovered): ${err?.message || err}`);
      return;
    }
    error(`UNHANDLED REJECTION: ${err?.stack || err}`);
  });

  process.on("warning", (w) => {
    const msg = w?.message || String(w);
    const stack = w?.stack ? `\n${w.stack}` : "";
    logs.warn(`[PROCESS WARNING] ${msg}${stack}`);
  });

  logs.success("[PROCESS] Process handlers loaded.");
};
