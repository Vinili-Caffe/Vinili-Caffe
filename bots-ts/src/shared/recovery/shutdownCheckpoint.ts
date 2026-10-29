"use strict";
const flushers = new Set();
let armed = false;
let running = false;
function registerShutdownFlush(name?, fn?) {
  if (!name || typeof fn !== "function") return;
  flushers.add({ name: String(name), fn });
}
async function flushAll(reason = "manual") {
  if (running) return;
  running = true;
  try {
    for (const row of flushers) {
      try {
        await Promise.resolve((row as any).fn(reason));
      } catch (err) {
        global.logger?.warn?.(`[shutdownCheckpoint] flush failed ${(row as any).name}:`, err?.message || err);
      }
    }
  } finally {
    running = false;
  }
}
function armShutdownCheckpoint() {
  if (armed) return;
  armed = true;
  const handler = (signal?) => {
    flushAll(String(signal || "signal"))
      .catch(() => null)
      .finally(() => setTimeout(() => process.exit(0), 200).unref?.());
  };
  process.on("SIGINT", handler);
  process.on("SIGTERM", handler);
  process.on("beforeExit", () => flushAll("beforeExit").catch(() => null));
}
export = {
  registerShutdownFlush,
  armShutdownCheckpoint,
  flushAllRecoverySnapshots: flushAll,
};