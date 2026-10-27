import { logger, loadBotsTsEnv, setLogLevel } from "../shared";

/** Worker Later — vote-drain resta JS. */
async function main(): Promise<void> {
  loadBotsTsEnv();
  setLogLevel("info");
  logger.warn(
    "[worker:vote-drain] Later — usa Vinyls/Services/Web/voteQueueDrainWorkerApp.js",
  );
  process.exit(0);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
