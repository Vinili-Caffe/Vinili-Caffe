import type { Client } from "discord.js";
import { createBotClient, prepareVoiceCrypto } from "../shared/createClient";
import { logger } from "../shared";
import { registerMusicModule } from "../vinyls/modules/music";
import { registerUtilityModule } from "../vinyls/modules/utility";
import { attachPrefixRouter } from "../vinyls/prefix/messageCreate";
import { attachInteractionRouter } from "../vinyls/interactions/attach";
import { registerChatReminder } from "./modules/chatReminder";
import { registerMarkovModule } from "./modules/markov";
import { startMarkovKeeperHttp } from "./modules/markov/keeper";
import { registerTtsModule } from "./modules/tts";

export interface CoffeeBotOptions {
  prefix?: string;
}

/** Coffee TS: utility + music + Markov + TTS + chat reminder + keeper HTTP. */
export async function createCoffeeBot(options: CoffeeBotOptions = {}): Promise<Client> {
  const prefix = options.prefix || process.env.BOT_PREFIX || "+";
  await prepareVoiceCrypto();
  const client = createBotClient();

  registerUtilityModule(client);
  await registerMusicModule(client);
  registerMarkovModule(client);
  registerTtsModule(client);
  registerChatReminder(client);
  const { registerMusicSlash } = await import("../vinyls/slash/musicSlash.js");
  registerMusicSlash();
  const { registerStaffSlash } = await import("../vinyls/slash/staffSlash.js");
  registerStaffSlash();
  attachInteractionRouter(client);
  attachPrefixRouter(client, prefix);
  startMarkovKeeperHttp(client);

  client.once("clientReady", () => {
    logger.info(`[coffee-ts] ready as ${client.user?.tag ?? "?"} · prefix=${prefix}`);
    void import("../vinyls/slash/registerGuild.js").then((m) =>
      m.registerSlashCommandsIfConfigured(client),
    );
  });

  return client;
}
