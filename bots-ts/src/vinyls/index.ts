import {
  assertTokenForLiveLogin,
  canLoginWithResolvedToken,
  loadBotsTsEnv,
  logger,
  readBotEnv,
  setLogLevel,
  startHealthServer,
  connectMongoIfConfigured,
  isMongoConnected,
  type LogLevel,
} from "../shared";
import { getLavalinkStatus } from "./modules/music/lavalink";
import { createVinylsBot } from "./createVinylsBot";
import { listPrefixCommands } from "./prefix/registry";

async function main(): Promise<void> {
  loadBotsTsEnv();
  if (!process.env.BOT_LABEL) process.env.BOT_LABEL = "vinyls-ts";
  const env = readBotEnv();
  setLogLevel((env.logLevel as LogLevel) || "info");

  logger.info(`[vinyls-ts] boot label=${env.botLabel}`);
  await connectMongoIfConfigured(env.mongoUri);

  const client = await createVinylsBot();
  let ready = false;
  client.once("clientReady", () => {
    ready = true;
  });

  startHealthServer(() => ({
    label: env.botLabel,
    ready: ready || !env.discordToken,
    uptimeSec: Math.floor(process.uptime()),
    mongo: isMongoConnected(),
    commands: listPrefixCommands().length,
    extra: { lavalink: getLavalinkStatus() },
  }));

  if (!env.discordToken) {
    logger.warn("[vinyls-ts] Nessun token — moduli caricati, no login.");
    logger.info(`[vinyls-ts] comandi: ${listPrefixCommands().map((c) => c.name).join(", ")}`);
    return;
  }

  const gate = canLoginWithResolvedToken("vinyls-ts");
  if (!gate.ok) {
    logger.warn(gate.reason || "login blocked");
    logger.info(`[vinyls-ts] comandi: ${listPrefixCommands().map((c) => c.name).join(", ")}`);
    return;
  }

  assertTokenForLiveLogin(env.discordToken, "vinyls-ts");
  await client.login(env.discordToken);
}

main().catch((err: unknown) => {
  logger.error("[vinyls-ts] fatal", err);
  process.exit(1);
});
