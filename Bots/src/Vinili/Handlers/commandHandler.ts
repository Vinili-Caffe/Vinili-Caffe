const { REST } = require("@discordjs/rest") as typeof import("@discordjs/rest");
const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const ascii = require("ascii-table");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getProtectedGuildIds, isViniliProtectedGuild } = require("../MultiGuild/core/viniliProtectedGuilds") as typeof import("../MultiGuild/core/viniliProtectedGuilds");
const { isMultiGuildLayerEnabled } = require("../MultiGuild/core/env") as typeof import("../MultiGuild/core/env");
const { isTenantFeatureEnabled } = require("../MultiGuild/core/accessPolicy") as typeof import("../MultiGuild/core/accessPolicy");
const { resolveGuildAccess } = require("../MultiGuild/core/guildRegistry") as typeof import("../MultiGuild/core/guildRegistry");
const { isCommandDeployRequired, markCommandDeployComplete } = require("../../shared/runtime/commandDeployCache") as typeof import("../../shared/runtime/commandDeployCache");
const {
  purgeObsoleteApplicationCommands,
  DEFAULT_OBSOLETE_SLASH_NAMES,
} = require("../../shared/discord/purgeObsoleteApplicationCommands") as typeof import("../../shared/discord/purgeObsoleteApplicationCommands");
const {
  splitApplicationCommandsForDeploy,
  deployGlobalApplicationCommands,
  deployGuildApplicationCommands,
  clearGuildApplicationCommands,
} = require("../../shared/discord/applicationCommandDeployScopes") as typeof import("../../shared/discord/applicationCommandDeployScopes");

const LOG_COMMANDS = String(process.env.LOG_COMMANDS || "0") === "1";
const BOT_DEPLOY_CACHE_KEY = "official";

function shouldForceSlashDeploy() {
  const value = String(process.env.FORCE_SLASH_DEPLOY || process.env.FORCE_COMMAND_DEPLOY || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function findGiveawayDeployCommand(commands = []) {
  return (Array.isArray(commands) ? commands : []).find(
    (cmd?) => String(cmd?.name || "").trim().toLowerCase() === "giveaway",
  ) || null;
}

export = (client?) => {
  client.handleCommands = async (commandFolders?, basePath?) => {
    const statusMap = new Map();
    client.commandArray = [];
    client.commands.clear();

    const parseCommandMeta=(command?) => {const commandJson=typeof command?.data?.toJSON==="function"?command.data.toJSON():null;const name=command?.data?.name||commandJson?.name||command?.name||null;const type=command?.data?.type??commandJson?.type??1;return{name,type,json:commandJson};};for(const folder of commandFolders){const folderPath = path.join(basePath, folder);
      if (!fs.existsSync(folderPath)) continue;
      const commandFiles = fs.readdirSync(folderPath).filter((f?) => /\.(cjs|mjs|js|cts|mts|ts)$/i.test(f) && !f.endsWith(".d.ts"));

      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const key = `${folder}/${file}`;
        try {
          delete require.cache[require.resolve(filePath)];
          const command = require(filePath);
          const meta = parseCommandMeta(command);
          if (!meta.name) {
            global.logger.error(`[COMMANDS] Invalid command file ${file}`);
            statusMap.set(key, "Invalid");
            continue;
          }

          const obsoleteName = String(meta.name || "")
            .trim()
            .toLowerCase();
          if (
            (Array.isArray(DEFAULT_OBSOLETE_SLASH_NAMES) ? DEFAULT_OBSOLETE_SLASH_NAMES : []).some(
              (n?) => String(n || "").trim().toLowerCase() === obsoleteName,
            )
          ) {
            statusMap.set(key, "Skipped");
            continue;
          }

          if (typeof command.category === "undefined") {
            command.category = folder;
          }
          if (!String(command.helpDescription || "").trim()) {
            command.helpDescription = String(command.description || "").trim();
          }

          client.commands.set(`${meta.name}:${meta.type}`, command);

          if (command.skipDeploy) {
            statusMap.set(key, "Skipped");
            continue;
          }

          const deployJson = meta.json || command.data.toJSON();
          command._helpDataJson = deployJson;
          client.commandArray.push(deployJson);
          statusMap.set(key, "Loaded");
        } catch (err) {
          global.logger.error(`[COMMANDS] Failed to load ${file}:`, err);
          statusMap.set(key, "Error loading");
        }
      }
    }

    if (LOG_COMMANDS) {
      const table = new ascii().setHeading("Folder", "File", "Status");
      for (const [key, status] of Array.from(statusMap.entries()).sort((a?, b?) =>
        a[0].localeCompare(b[0]),
      )) {
        if (status === "Skipped") continue;
        const [folder, file] = key.split("/");
        table.addRow(folder, file, status);
      }
      global.logger.info(table.toString());
      global.logger.info(`[COMMANDS] Loaded ${client.commands.size} SlashCommands.`);
    }

    if (String(process.env.SITE_API_PROCESS || "").trim() === "1") {
      return;
    }

    const token=process.env.DISCORD_TOKEN||process.env.DISCORD_TOKEN_OFFICIAL||client?.config?.token;
    const clientId=process.env.DISCORD_CLIENT_ID||process.env.DISCORD_CLIENT_ID_OFFICIAL||IDs.bots.ViniliCaffeBot;
    const isPrimary = !client.shard || client.shard.ids?.[0] === 0;
    if (!isPrimary) {
      if (LOG_COMMANDS) global.logger.info(`[COMMANDS] Deploy slash eseguito solo sul primary shard, skip su questo processo.`);
      return;
    }
    const { globalCommands, mainGuildCommands } = splitApplicationCommandsForDeploy(client.commandArray);
    const protectedGuildIds = getProtectedGuildIds();

    const deployCheck = isCommandDeployRequired(BOT_DEPLOY_CACHE_KEY, { clientId }, globalCommands);
    const mainGuildDeployChecks = protectedGuildIds.map((guildId?) => ({
      guildId,
      ...isCommandDeployRequired(BOT_DEPLOY_CACHE_KEY, { clientId, guildId }, mainGuildCommands),
    }));
    const forceDeploy = shouldForceSlashDeploy();
    const mainGuildDeployRequired =
      forceDeploy || mainGuildDeployChecks.some((row?) => row.required);
    const rest = new REST({ version: "10" }).setToken(token);

    if (deployCheck.required || forceDeploy) {
      if (LOG_COMMANDS) {
        global.logger.info(
          `[COMMANDS] Deploy globali richiesto. scope=${deployCheck.scopeKey} prev=${deployCheck.previousHash || "none"} next=${deployCheck.hash}${forceDeploy ? " force=true" : ""} count=${globalCommands.length}`,
        );
      }
      try {
        const me: any = await rest.get(Routes.currentApplication());
        const tokenAppId = me?.id || null;
        if (tokenAppId && String(tokenAppId) !== String(clientId) && LOG_COMMANDS) {
          global.logger.warn(`[COMMANDS] Token appartiene all'app ${tokenAppId}, ma in codice usi clientId ${clientId}. Imposta DISCORD_CLIENT_ID uguale all'Application ID dell'app del token.`);
        }
      } catch (e) {
        if (LOG_COMMANDS) global.logger.warn("[COMMANDS] Impossibile verificare app del token:", e?.message || e);
      }

      try {
        if (LOG_COMMANDS) client.logs.info("[FUNCTION] Refreshing global application (/) commands...");
        await deployGlobalApplicationCommands(rest, clientId, globalCommands);
        markCommandDeployComplete(BOT_DEPLOY_CACHE_KEY, { clientId }, deployCheck.hash);
        if (LOG_COMMANDS) {
          client.logs.success(
            `[FUNCTION] Global commands deployed (${globalCommands.map((c?) => c.name).join(", ") || "none"}).`,
          );
        }
      } catch (error) {
        global.logger.error("[COMMANDS] Failed to deploy global commands:", error);
        if (error?.code === 20012 || error?.status === 403) {
          global.logger.error(
            '[COMMANDS] 20012/403: Se token e ID sono giusti, controlla su Developer Portal che l\'app NON sia in un Team, oppure che il tuo account abbia permesso "Admin" sul Team. Le app in Team possono registrare comandi solo da chi ha i permessi sul Team.',
          );
        }
        client.logs.error("[FUNCTION] Error loading slash commands.");
      }
    } else if (LOG_COMMANDS) {
      global.logger.info(`[COMMANDS] Nessuna modifica ai comandi globali, deploy REST saltato. scope=${deployCheck.scopeKey} hash=${deployCheck.hash}`);
    }

    if (mainGuildDeployRequired) {
      for (const row of mainGuildDeployChecks) {
        if (!forceDeploy && !row.required) continue;
        try {
          if (LOG_COMMANDS) {
            global.logger.info(
              `[COMMANDS] Deploy guild ${row.guildId}: ${mainGuildCommands.length} comandi (main/protected).`,
            );
          }
          await deployGuildApplicationCommands(rest, clientId, row.guildId, mainGuildCommands);
          markCommandDeployComplete(BOT_DEPLOY_CACHE_KEY, { clientId, guildId: row.guildId }, row.hash);
        } catch (error) {
          global.logger.error(
            `[COMMANDS] Failed to deploy guild commands for ${row.guildId}:`,
            error?.message || error,
          );
        }
      }
    } else if (LOG_COMMANDS) {
      global.logger.info("[COMMANDS] Nessuna modifica ai comandi guild main/protected, deploy saltato.");
    }

    try {
      await purgeObsoleteApplicationCommands(rest, clientId, protectedGuildIds);
    } catch (e) {
      global.logger?.warn?.("[COMMANDS] Purge comandi slash obsoleti:", e?.message || e);
    }

    if (isMultiGuildLayerEnabled()) {
      const giveawayCmd = findGiveawayDeployCommand(mainGuildCommands);
      for (const guild of client.guilds.cache.values()) {
        if (isViniliProtectedGuild(guild.id)) continue;
        try {
          if (giveawayCmd && isTenantFeatureEnabled(guild.id, "giveaway")) {
            const tenantGiveawayBody = [giveawayCmd];
            const deployRow = isCommandDeployRequired(
              BOT_DEPLOY_CACHE_KEY,
              { clientId, guildId: guild.id, scope: "tenant-giveaway" },
              tenantGiveawayBody,
            );
            if (forceDeploy || deployRow.required) {
              await deployGuildApplicationCommands(rest, clientId, guild.id, tenantGiveawayBody);
              markCommandDeployComplete(
                BOT_DEPLOY_CACHE_KEY,
                { clientId, guildId: guild.id, scope: "tenant-giveaway" },
                deployRow.hash,
              );
              if (LOG_COMMANDS) {
                global.logger.info(
                  `[COMMANDS] Deploy /giveaway su tenant ${guild.id} (${resolveGuildAccess(guild.id)?.entry?.label || guild.name || "?"}).`,
                );
              }
            }
          } else {
            await clearGuildApplicationCommands(rest, clientId, guild.id).catch(() => null);
          }
        } catch (error) {
          global.logger?.warn?.(
            `[COMMANDS] Tenant slash sync failed for ${guild.id}:`,
            error?.message || error,
          );
        }
      }
    }
  };
};