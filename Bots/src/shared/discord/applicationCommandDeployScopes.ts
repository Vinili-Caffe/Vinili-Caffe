const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");

const GLOBAL_TENANT_COMMAND_NAMES = new Set([
  "partnership",
  "partner messaggio",
  "delete",
  /* Vetrina: riporta in cima la scheda del server */
  "bump",
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

/* Comando di avvio dell'Attività di Discord (tipo 4, «launch»): lo crea Discord quando si attivano le Attività
   e sta tra i comandi globali. Una sostituzione in blocco senza di lui lo cancella, e sparisce il pulsante «Avvia». */
const ENTRY_POINT_TYPE = 4;

async function currentEntryPoint(rest?, clientId?) {
  try {
    const list: any = await rest.get(Routes.applicationCommands(clientId));
    return (Array.isArray(list) ? list : []).find((c?) => Number(c?.type) === ENTRY_POINT_TYPE) || null;
  } catch {
    return null;
  }
}

async function deployGlobalApplicationCommands(rest?, clientId?, commands?) {
  const body = Array.isArray(commands) ? [...commands] : [];
  const entry = await currentEntryPoint(rest, clientId);
  if (entry && !body.some((c?) => Number(c?.type) === ENTRY_POINT_TYPE)) {
    body.push({
      id: entry.id,
      name: entry.name,
      type: ENTRY_POINT_TYPE,
      handler: entry.handler,
      description: entry.description || "",
      ...(entry.integration_types ? { integration_types: entry.integration_types } : {}),
      ...(entry.contexts ? { contexts: entry.contexts } : {}),
    });
  }
  await rest.put(Routes.applicationCommands(clientId), { body });
}

/** Se l'app ha le Attività attive ma il comando di avvio manca (cancellato da un deploy vecchio), lo ricrea. */
async function ensureActivityEntryPoint(rest?, clientId?) {
  if (await currentEntryPoint(rest, clientId)) return "presente";
  try {
    await rest.post(Routes.applicationCommands(clientId), {
      body: {
        name: "launch",
        description: "Gioca al Music Quiz di Vinili & Caffè",
        type: ENTRY_POINT_TYPE,
        /* 2 = DISCORD_LAUNCH_ACTIVITY: lo avvia Discord */
        handler: 2,
        integration_types: [0, 1],
        contexts: [0, 1, 2],
      },
    });
    return "creato";
  } catch (err: any) {
    /* app senza Attività attive: niente da fare */
    return `non creato (${err?.status || ""} ${err?.message || err})`.trim();
  }
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
  const { createTunedREST } = require("./discordRestTuning") as typeof import("./discordRestTuning");
  const rest = createTunedREST(token);
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
  ensureActivityEntryPoint,
  GLOBAL_TENANT_COMMAND_NAMES,
  splitApplicationCommandsForDeploy,
  deployGlobalApplicationCommands,
  deployGuildApplicationCommands,
  clearGuildApplicationCommands,
  clearTenantGuildApplicationCommands,
};
