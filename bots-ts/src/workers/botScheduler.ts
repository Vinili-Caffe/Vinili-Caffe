import { logger, loadBotsTsEnv, setLogLevel } from "../shared";

/** Worker Later — bot-scheduler resta JS. */
async function main(): Promise<void> {
  loadBotsTsEnv();
  setLogLevel("info");
  logger.warn(
    "[worker:bot-scheduler] Later — usa Vinyls/Services/Web/botSchedulerWorkerApp.js",
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
