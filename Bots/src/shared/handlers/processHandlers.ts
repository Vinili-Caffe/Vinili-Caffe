const { flushAllRecoverySnapshots } = require("../recovery/shutdownCheckpoint") as typeof import("../recovery/shutdownCheckpoint");
const { isVoiceTransportError } = require("../discord/voiceTransportErrors") as typeof import("../discord/voiceTransportErrors");

function installProcessHandlers(options: Record<string, any> = {}) {
  const flag = String(options.flag || "__vcProcessHandlersInstalled");
  if ((process as any)[flag]) return;
  (process as any)[flag] = true;

  const logError = options.logError || ((msg?) => global.logger?.error?.(String(msg)));
  const logWarn = options.logWarn || ((msg?) => global.logger?.warn?.(String(msg)));
  const logInfo = options.logInfo || ((msg?) => global.logger?.info?.(String(msg)));
  const onBeforeFlush = typeof options.onBeforeFlush === "function" ? options.onBeforeFlush : null;
  const onAfterFlush = typeof options.onAfterFlush === "function" ? options.onAfterFlush : null;
  const exitDelayMs = Number(options.exitDelayMs) > 0 ? Number(options.exitDelayMs) : 150;

  let shutdownRunning = false;
  async function exitAfterFlush(signal?) {
    if (shutdownRunning) return;
    shutdownRunning = true;
    logError(`${signal}: Flushing recovery snapshots and exiting...`);
    try {
      if (onBeforeFlush) await onBeforeFlush(signal);
    } catch (err) {
      logError(`onBeforeFlush failed: ${err?.stack || err}`);
    }
    await flushAllRecoverySnapshots(signal).catch((err?) => {
      logError(`Recovery flush failed: ${err?.stack || err}`);
    });
    try {
      if (onAfterFlush) await onAfterFlush(signal);
    } catch (err) {
      logError(`onAfterFlush failed: ${err?.stack || err}`);
    }
    setTimeout(() => process.exit(0), exitDelayMs).unref?.();
  }

  process.on("SIGINT", () => {
    void exitAfterFlush("SIGINT");
  });
  process.on("SIGTERM", () => {
    void exitAfterFlush("SIGTERM");
  });
  process.on("uncaughtException", (err?) => {
    logError(`UNCAUGHT EXCEPTION: ${err?.stack || err}`);
  });
  process.on("unhandledRejection", (err?: any) => {
    if (isVoiceTransportError(err)) {
      logWarn(`Voice transport (recovered): ${err?.message || err}`);
      return;
    }
    logError(`UNHANDLED REJECTION: ${err?.stack || err}`);
  });
  process.on("warning", (w?) => {
    if (options.ignoreWarnings) return;
    const msg = w?.message || String(w);
    const stack = w?.stack ? `\n${w.stack}` : "";
    logWarn(`[PROCESS WARNING] ${msg}${stack}`);
  });

  logInfo("[PROCESS] Process handlers loaded.");
}

export = { installProcessHandlers };
