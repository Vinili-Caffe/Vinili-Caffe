import type { Client } from "discord.js";
import { createBotClient, prepareVoiceCrypto } from "../shared/createClient";
import { logger } from "../shared";
import { startVoteWebhookServer } from "../shared/webhooks";
import { registerTtsModule } from "../coffee/modules/tts";
import { registerAuditEvents } from "./events/audit";
import { attachInteractionRouter } from "./interactions/attach";
import { registerActivityModule } from "./modules/activity";
import { registerAdminModule } from "./modules/admin";
import { registerAutomodModule } from "./modules/automod";
import { registerCommunityModule } from "./modules/community";
import { registerEconomyModule } from "./modules/economy";
import { registerMinigamesModule } from "./modules/minigames";
import { registerModerationModule } from "./modules/moderation";
import { hydrateModCasesFromMongo } from "./modules/moderation/modCaseStore";
import { registerMultiGuildModule } from "./modules/multiguild";
import { registerMusicModule } from "./modules/music";
import { registerPartnerModule } from "./modules/partner";
import { registerSecurityModule } from "./modules/security";
import { registerStaffModule } from "./modules/staff";
import { registerStatsModule } from "./modules/stats";
import { registerTicketsModule } from "./modules/tickets";
import { registerUtilityModule } from "./modules/utility";
import { registerVoiceCaptureHooks } from "./modules/utility/voiceCapture";
import { attachPrefixRouter } from "./prefix/messageCreate";
import { loadEnabledPlugins } from "./plugins/registry";
import { registerSlashCommandsIfConfigured } from "./slash/registerGuild";

export interface VinylsBotOptions {
  prefix?: string;
}

export async function createVinylsBot(options: VinylsBotOptions = {}): Promise<Client> {
  const prefix = options.prefix || process.env.BOT_PREFIX || "+";
  await prepareVoiceCrypto();
  const client = createBotClient();

  registerUtilityModule(client, { vinylsExtras: true });
  registerVoiceCaptureHooks(client);
  registerModerationModule(client);
  await hydrateModCasesFromMongo();
  await registerMusicModule(client);
  registerTtsModule(client);
  await registerActivityModule(client);
  registerStatsModule();
  registerAutomodModule(client);
  registerSecurityModule(client);
  await registerEconomyModule();
  await registerStaffModule(client);
  await registerTicketsModule();
  registerMultiGuildModule();
  registerMinigamesModule(client);
  registerPartnerModule();
  registerAdminModule();
  registerCommunityModule(client);
  registerAuditEvents(client);
  const { registerMusicSlash } = await import("./slash/musicSlash.js");
  registerMusicSlash();
  const { registerStaffSlash } = await import("./slash/staffSlash.js");
  registerStaffSlash();
  attachInteractionRouter(client);
  attachPrefixRouter(client, prefix);
  startVoteWebhookServer();

  const plugins = await loadEnabledPlugins(client);
  if (plugins.length) {
    logger.info(`[vinyls-ts] plugins enabled: ${plugins.join(", ")}`);
  } else {
    logger.info("[vinyls-ts] plugins: nessuno (VC_PLUGINS vuoto)");
  }

  client.once("clientReady", () => {
    logger.info(`[vinyls-ts] ready as ${client.user?.tag ?? "?"} · prefix=${prefix}`);
    void registerSlashCommandsIfConfigured(client);
  });

  return client;
}
