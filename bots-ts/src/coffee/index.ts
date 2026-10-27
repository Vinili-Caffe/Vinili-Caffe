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
import { listPrefixCommands } from "../vinyls/prefix/registry";
import { createCoffeeBot } from "./createCoffeeBot";

async function main(): Promise<void> {
  loadBotsTsEnv();
  if (!process.env.BOT_LABEL) process.env.BOT_LABEL = "coffee-ts";
  const env = readBotEnv();
  setLogLevel((env.logLevel as LogLevel) || "info");

  logger.info(`[coffee-ts] boot label=${env.botLabel}`);
  await connectMongoIfConfigured(env.mongoUri);

  const client = await createCoffeeBot();
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
  }));

  if (!env.discordToken) {
    logger.warn("[coffee-ts] Nessun token — moduli caricati, no login.");
    logger.info(`[coffee-ts] comandi: ${listPrefixCommands().map((c) => c.name).join(", ")}`);
    return;
  }

  const gate = canLoginWithResolvedToken("coffee-ts");
  if (!gate.ok) {
    logger.warn(gate.reason || "login blocked");
    logger.info(`[coffee-ts] comandi: ${listPrefixCommands().map((c) => c.name).join(", ")}`);
    return;
  }

  assertTokenForLiveLogin(env.discordToken, "coffee-ts");
  await client.login(env.discordToken);
}

main().catch((err: unknown) => {
  logger.error("[coffee-ts] fatal", err);
  process.exit(1);
});
