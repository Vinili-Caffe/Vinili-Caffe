const { flushAllRecoverySnapshots } = require("../../shared/recovery/shutdownCheckpoint") as typeof import("../../shared/recovery/shutdownCheckpoint");
const { isVoiceTransportError } = require("../../shared/discord/voiceTransportErrors") as typeof import("../../shared/discord/voiceTransportErrors");

let shutdownRunning = false;

async function exitAfterFlush(signal?) {
  if (shutdownRunning) return;
  shutdownRunning = true;
  global.logger?.error?.(`[PROCESS] ${signal}: Flushing recovery snapshots and exiting...`);
  await flushAllRecoverySnapshots(signal).catch((err?) => {
    global.logger?.error?.("[PROCESS] Recovery flush failed: " + (err?.stack || err));
  });
  setTimeout(() => process.exit(0), 200).unref?.();
}

export = function installProcessHandlers() {
  if (process.__viniliTestProcessHandlersInstalled) return;
  process.__viniliTestProcessHandlersInstalled = true;

  process.on("SIGINT", () => {
    void exitAfterFlush("SIGINT");
  });

  process.on("uncaughtException", (err?) => {
    global.logger?.error?.("[PROCESS] UNCAUGHT EXCEPTION: " + (err?.stack || err));
  });

  process.on("SIGTERM", () => {
    void exitAfterFlush("SIGTERM");
  });

  process.on("unhandledRejection", (err?) => {
    if (isVoiceTransportError(err)) {
      global.logger?.warn?.("[PROCESS] Voice transport (recovered): " + (err?.message || err));
      return;
    }
    global.logger?.error?.("[PROCESS] UNHANDLED REJECTION: " + (err?.stack || err));
  });

  process.on("warning", () => {});

  global.logger?.info?.("[PROCESS] Process handlers loaded.");
};