/** Log di avvio “rumorosi”: silenziati di default. BOOT_VERBOSE=1 per il dettaglio. */

function bootVerbose() {
  return String(process.env.BOOT_VERBOSE || "").trim() === "1";
}

function bootInfo(...args) {
  if (!bootVerbose()) return;
  try {
    console.log(...args);
  } catch (_) {
    /* ignore */
  }
}

function bootLoggerInfo(...args) {
  if (!bootVerbose()) return;
  try {
    global.logger?.info?.(...args);
  } catch (_) {
    /* ignore */
  }
}

export = { bootVerbose, bootInfo, bootLoggerInfo };
