const { REST } = require("@discordjs/rest") as typeof import("@discordjs/rest");
const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");

const GLOBAL_TENANT_COMMAND_NAMES = new Set([
  "partnership",
  "elimina partnership",
  "aggiungi punti",
  "rimuovi punti",
]);

function isGlobalTenantCommand(name?) {
  return GLOBAL_TENANT_COMMAND_NAMES.has(String(name || "").trim().toLowerCase());
}

function splitApplicationCommandsForDeploy(commands = []) {
  const globalCommands = [];
  const mainGuildCommands = [];
  for (const cmd of Array.isArray(commands) ? commands : []) {
    const name = String(cmd?.name || "").trim().toLowerCase();
    if (!name) continue;
    if (isGlobalTenantCommand(name)) {
      globalCommands.push(cmd);
    } else {
      mainGuildCommands.push(cmd);
    }
  }
  return { globalCommands, mainGuildCommands };
}

async function deployGlobalApplicationCommands(rest?, clientId?, commands?) {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
}

async function deployGuildApplicationCommands(rest?, clientId?, guildId?, commands?) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
}

async function clearGuildApplicationCommands(rest?, clientId?, guildId?) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
}

async function clearTenantGuildApplicationCommands(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid) || !client) return false;
  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    client?.config?.token;
  const clientId =
    process.env.DISCORD_CLIENT_ID ||
    process.env.DISCORD_CLIENT_ID_OFFICIAL ||
    client?.application?.id;
  if (!token || !clientId) return false;
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    await clearGuildApplicationCommands(rest, clientId, gid);
    return true;
  } catch (err) {
    global.logger?.warn?.(
      "[COMMANDS] clear tenant guild commands failed:",
      gid,
      err?.message || err,
    );
    return false;
  }
}

export = {
  GLOBAL_TENANT_COMMAND_NAMES,
  isGlobalTenantCommand,
  splitApplicationCommandsForDeploy,
  deployGlobalApplicationCommands,
  deployGuildApplicationCommands,
  clearGuildApplicationCommands,
  clearTenantGuildApplicationCommands,
};
