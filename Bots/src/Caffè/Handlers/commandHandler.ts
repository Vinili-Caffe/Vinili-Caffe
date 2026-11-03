const { REST } = require("@discordjs/rest") as typeof import("@discordjs/rest");
const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const ascii = require("ascii-table");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { clearCommandDeployCache, isCommandDeployRequired, markCommandDeployComplete } = require("../../shared/runtime/commandDeployCache") as typeof import("../../shared/runtime/commandDeployCache");
const { purgeObsoleteApplicationCommands } = require("../../shared/discord/purgeObsoleteApplicationCommands") as typeof import("../../shared/discord/purgeObsoleteApplicationCommands");
const LOG_COMMANDS = String(process.env.LOG_COMMANDS || "0") === "1";

function toArrayUnique(values = []) {
  return Array.from(new Set(values.filter(Boolean).map((x?) => String(x))));
}

const BOT_DEPLOY_CACHE_KEY = "test";

function shouldForceSlashDeploy() {
  const value = String(process.env.FORCE_SLASH_DEPLOY || process.env.FORCE_COMMAND_DEPLOY || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export = (client?) => {
  client.handleCommands = async (commandFolders = [], basePath?) => {
    const statusMap = new Map();
    client.commandArray = [];
    client.commands.clear();

    const parseCommandMeta =(command?)=>{const commandJson = typeof command ?. data ?. toJSON === "function" ? command.data.toJSON():null;const name = command ?. data ?. name || commandJson ?. name || command ?. name || null;const type = command ?. data ?. type ?? commandJson ?. type ??1;return {name,type,json:commandJson};};for(const folder of commandFolders) {
      const folderPath = folder === "." ? basePath : path.join(basePath, folder);
      if (!fs.existsSync(folderPath)) continue;
      const categoryLabel = folder === "." ? "Staff" : folder;
      const commandFiles = fs.readdirSync(folderPath).filter((f?)=>/\.(cjs|mjs|js|cts|mts|ts)$/i.test(f) && !f.endsWith(".d.ts"));

      for (const file of commandFiles) {
        const fullPath = path.join(folderPath, file);
        const key = `${categoryLabel}/${file}`;
        try {
          delete require.cache[require.resolve(fullPath)];
          const command = require(fullPath);
          const meta = parseCommandMeta(command);
          if (!meta.name) {
            statusMap.set(key, "Invalid");
            continue;
          }

          if (typeof command.category === "undefined") {
            command.category = categoryLabel;
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
        } catch (error) {
          statusMap.set(key, "Error loading");
          global.logger?.error?.(
            `[COMMANDS] Failed to load ${key}:`,
            error,
          );
        }
      }
    }

    if (statusMap.size > 0 && LOG_COMMANDS) {
      const table = new ascii().setHeading("Folder", "File", "Status");
      for (const [key, status] of Array.from(statusMap.entries()).sort((a?, b?) =>
        a[0].localeCompare(b[0]),
      )) {
        if (status === "Skipped") continue;
        const [folder, file] = key.split("/");
        table.addRow(folder, file, status);
      }
      global.logger?.info?.(table.toString());
    }
    if (LOG_COMMANDS) global.logger?.info?.(`[COMMANDS] Loaded ${client.commands.size} slash command(s).`);

    const token = process.env.DISCORD_TOKEN_TEST || client?.config?.token;
    let clientId =
      process.env.DISCORD_CLIENT_ID_TEST ||
      process.env.DISCORD_CLIENT_ID ||
      null;
    if (!token) return;

    const rest = new REST({ version: "10" }).setToken(token);
    if (!clientId) {
      try {
        const app: any = await rest.get(Routes.currentApplication());
        clientId = app?.id || null;
      } catch (error) {
        global.logger?.error?.(
          "[COMMANDS] Unable to resolve application id from token:",
          error,
        );
      }
    }
    if (!clientId) return;

    const allowedGuildIds = toArrayUnique([IDs?.guilds?.main, IDs?.guilds?.test]);

    const forceDeployEmpty = client.commandArray.length === 0;
    if (forceDeployEmpty) {
      clearCommandDeployCache(BOT_DEPLOY_CACHE_KEY);
      if (LOG_COMMANDS) global.logger?.info?.("[COMMANDS] Lista slash vuota: cache deploy azzerata per forzare invio lista vuota a Discord.");
      try {
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        const globalCheck = isCommandDeployRequired(BOT_DEPLOY_CACHE_KEY, { clientId }, []);
        markCommandDeployComplete(BOT_DEPLOY_CACHE_KEY, { clientId }, globalCheck.hash);
        if (LOG_COMMANDS) global.logger?.info?.("[COMMANDS] Comandi globali azzerati.");
      } catch (err) {
        if (Number(err?.code) === 50001 || Number(err?.status) === 403) {
          if (LOG_COMMANDS) global.logger?.warn?.("[COMMANDS] Skip clearing global commands: Missing Access.");
        } else {
          global.logger?.error?.("[COMMANDS] Failed to clear global commands:", err);
        }
      }
    }

    const globalDeployCheck = isCommandDeployRequired(
      BOT_DEPLOY_CACHE_KEY,
      { clientId, guildId: "global" },
      client.commandArray,
    );
    const forceGlobalDeploy = shouldForceSlashDeploy();
    if (globalDeployCheck.required || forceGlobalDeploy) {
      try {
        await rest.put(Routes.applicationCommands(clientId), {
          body: client.commandArray,
        });
        markCommandDeployComplete(
          BOT_DEPLOY_CACHE_KEY,
          { clientId, guildId: "global" },
          globalDeployCheck.hash,
        );
        if (LOG_COMMANDS) global.logger?.info?.(`[COMMANDS] Global slash commands deployed. scope=${globalDeployCheck.scopeKey} hash=${globalDeployCheck.hash}${forceGlobalDeploy ? " force=true" : ""}`);
      } catch (error) {
        if (Number(error?.code) === 50001 || Number(error?.status) === 403) {
          if (LOG_COMMANDS) global.logger?.warn?.("[COMMANDS] Skip deploying global slash commands: Missing Access.");
        } else {
          global.logger?.error?.("[COMMANDS] Failed to deploy global slash commands:", error);
        }
      }
    }

    for (const guildId of allowedGuildIds) {
      try {
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        if (LOG_COMMANDS) global.logger?.info?.(`[COMMANDS] Guild slash commands cleared for ${guildId} (solo globali).`);
      } catch (error) {
        if (Number(error?.code) === 50001 || Number(error?.status) === 403) {
          if (LOG_COMMANDS) global.logger?.warn?.(`[COMMANDS] Skip clearing guild ${guildId} slash commands: Missing Access.`);
          continue;
        }
        global.logger?.error?.(`[COMMANDS] Failed to clear guild slash commands for ${guildId}:`, error);
      }
    }

    try {
      await purgeObsoleteApplicationCommands(rest, clientId, allowedGuildIds);
    } catch (e) {
      global.logger?.warn?.("[COMMANDS] Purge obsolete slash commands:", e?.message || e);
    }
  };
};