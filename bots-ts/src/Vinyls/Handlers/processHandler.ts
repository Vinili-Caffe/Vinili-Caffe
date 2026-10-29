const logs = require("../Utils/Moderation/logs") as typeof import("../Utils/Moderation/logs");
const { flushAllRecoverySnapshots } = require("../../shared/recovery/shutdownCheckpoint") as typeof import("../../shared/recovery/shutdownCheckpoint");
const { isVoiceTransportError } = require("../../shared/discord/voiceTransportErrors") as typeof import("../../shared/discord/voiceTransportErrors");

let shutdownRunning = false;

function error(message?) {
  logs.error(`[ERROR] ${message}`);
}

async function exitAfterFlush(signal?) {
  if (shutdownRunning) return;
  shutdownRunning = true;
  error(`${signal}: Flushing recovery snapshots and exiting...`);
  try {
    require("../Services/Community/activityService").suspendAllLiveVoiceExp();
  } catch {
  }
  try {
    require("../Services/Staff/staffAutoValutazioniService").suspendStaffAutoValutazioni();
  } catch {
  }
  await flushAllRecoverySnapshots(signal).catch((err?) => {
    error(`Recovery flush failed: ${err?.stack || err}`);
  });
  try {
    const { closeMongoGraceful } = require("../Utils/Database/mongoConnect") as typeof import("../Utils/Database/mongoConnect");
    await closeMongoGraceful(signal);
  } catch (err) {
    error(`Mongo close failed: ${err?.stack || err}`);
  }
  setTimeout(() => process.exit(0), 150).unref?.();
}

export = () => {
  if (process.__viniliProcessHandlersInstalled) return;
  process.__viniliProcessHandlersInstalled = true;

  process.on("SIGINT", () => {
    void exitAfterFlush("SIGINT");
  });

  process.on("uncaughtException", (err?) => {
    error(`UNCAUGHT EXCEPTION: ${err?.stack || err}`);
  });

  process.on("SIGTERM", () => {
    void exitAfterFlush("SIGTERM");
  });

  process.on("unhandledRejection", (err?: any) => {
    if (isVoiceTransportError(err)) {
      logs.warn(`[PROCESS] Voice transport (recovered): ${err?.message || err}`);
      return;
    }
    error(`UNHANDLED REJECTION: ${err?.stack || err}`);
  });

  process.on("warning", (w?) => {
    const msg = w?.message || String(w);
    const stack = w?.stack ? `\n${w.stack}` : "";
    logs.warn(`[PROCESS WARNING] ${msg}${stack}`);
  });

  logs.success("[PROCESS] Process handlers loaded.");
};
