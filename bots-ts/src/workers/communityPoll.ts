import { logger, loadBotsTsEnv, setLogLevel } from "../shared";

/**
 * Worker Later — community-poll resta JS live a lungo.
 * Stub TS: documenta entry e esce (no dual-run accidentale).
 */
async function main(): Promise<void> {
  loadBotsTsEnv();
  setLogLevel("info");
  logger.warn(
    "[worker:community-poll] Later — usa Vinyls/Services/Web/communityPollWorkerApp.js finché non c’è cutover worker.",
  );
  if (process.env.VC_TS_WORKER_FORCE !== "1") {
    process.exit(0);
  }
  logger.info("[worker:community-poll] FORCE=1 · idle loop (no jobs yet)");
  setInterval(() => undefined, 60_000).unref?.();
}

main().catch((err) => {
  logger.error("[worker:community-poll]", err);
  process.exit(1);
});
