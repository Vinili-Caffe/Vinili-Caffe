/**
 * Ensures the configured streamer Stage ("palco") channel always exists.
 * Recreates + rebinds config if Discord returns 404 / missing channel.
 * Also exposes helpers so other services never delete this channel.
 */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { ChannelType, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getClientGuildCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");

const CONFIG_PATH = path.join(__dirname, "..", "..", "config.json");
const CHECK_MS = 5 * 60_000;
const started = new WeakSet();

function snowflakeOk(id?) {
  return /^\d{16,22}$/.test(String(id || "").trim());
}

function readConfiguredStreamVoiceIds(client?) {
  const ids = new Set();
  const cfg = client?.config || {};
  for (const key of ["twitchLiveAlerts"]) {
    const top = String(cfg?.[key]?.streamVoiceChannelId || "").trim();
    if (snowflakeOk(top)) ids.add(top);
    const list = Array.isArray(cfg?.[key]?.streamers) ? cfg[key].streamers : [];
    for (const row of list) {
      const id = String(row?.streamVoiceChannelId || "").trim();
      if (snowflakeOk(id)) ids.add(id);
    }
  }
  const fromIds = String(IDs.channels?.streamerStage || IDs.channels?.streamVoice || "").trim();
  if (snowflakeOk(fromIds)) ids.add(fromIds);
  return ids;
}

function isProtectedStreamerStageChannelId(channelId?, client = null) {
  const id = String(channelId || "").trim();
  if (!snowflakeOk(id)) return false;
  if (client) return readConfiguredStreamVoiceIds(client).has(id);
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    const ids = new Set();
    for (const key of ["twitchLiveAlerts"]) {
      const top = String(raw?.[key]?.streamVoiceChannelId || "").trim();
      if (snowflakeOk(top)) ids.add(top);
    }
    const fromIds = String(IDs.channels?.streamerStage || "").trim();
    if (snowflakeOk(fromIds)) ids.add(fromIds);
    return ids.has(id);
  } catch {
    return false;
  }
}

function offlineNameFromConfig(client?) {
  const cfg = client?.config || {};
  return (
    String(cfg?.twitchLiveAlerts?.streamers?.[0]?.voiceNameOff || "").trim() ||
    "༄🔴︲Streaming diunk17"
  );
}

function persistStreamVoiceChannelId(newId?) {
  const id = String(newId || "").trim();
  if (!snowflakeOk(id)) return false;
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  for (const key of ["twitchLiveAlerts"]) {
    if (!raw[key] || typeof raw[key] !== "object") raw[key] = {};
    raw[key].streamVoiceChannelId = id;
    if (Array.isArray(raw[key].streamers)) {
      for (const row of raw[key].streamers) {
        if (row && typeof row === "object") row.streamVoiceChannelId = id;
      }
    }
  }
  fs.writeFileSync(CONFIG_PATH, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return true;
}

function rebindClientConfig(client?, newId?) {
  const id = String(newId || "").trim();
  if (!client?.config || !snowflakeOk(id)) return;
  for (const key of ["twitchLiveAlerts"]) {
    if (!client.config[key] || typeof client.config[key] !== "object") client.config[key] = {};
    client.config[key].streamVoiceChannelId = id;
    if (Array.isArray(client.config[key].streamers)) {
      for (const row of client.config[key].streamers) {
        if (row && typeof row === "object") row.streamVoiceChannelId = id;
      }
    }
  }
  try {
    if (IDs.channels) IDs.channels.streamerStage = id;
  } catch {
    /* ignore */
  }
}

async function findExistingStageByName(guild?, name?) {
  const want = String(name || "").trim().toLowerCase();
  if (!want || !guild?.channels?.cache) return null;
  return (
    guild.channels.cache.find((ch?) => {
      if (Number(ch?.type) !== ChannelType.GuildStageVoice && Number(ch?.type) !== 13) return false;
      const n = String(ch.name || "").toLowerCase();
      return n === want || n.includes("streaming diunk") || n.includes("streaming d1uk");
    }) || null
  );
}

async function recreateStreamerStage(client?) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "guild_unavailable" };

  const name = offlineNameFromConfig(client).slice(0, 100);
  const existingByName = await findExistingStageByName(guild, name);
  if (existingByName?.id) {
    persistStreamVoiceChannelId(existingByName.id);
    rebindClientConfig(client, existingByName.id);
    global.logger?.warn?.(
      "[streamerStageGuard] rebound existing stage by name:",
      existingByName.id,
      existingByName.name,
    );
    return { ok: true, channelId: String(existingByName.id), rebound: true };
  }

  const chatId = String(IDs.channels?.streamerChat || "").trim();
  let parentId = null;
  let position = undefined;
  if (snowflakeOk(chatId)) {
    const chat =
      guild.channels.cache.get(chatId) || (await guild.channels.fetch(chatId).catch(() => null));
    if (chat) {
      parentId = chat.parentId || null;
      if (typeof chat.position === "number") position = chat.position + 1;
    }
  }

  const everyoneId = guild.roles?.everyone?.id || guild.id;
  const created = await guild.channels.create({
    name,
    type: ChannelType.GuildStageVoice,
    parent: parentId || undefined,
    position,
    reason: "streamerStageGuard: recreate missing palco/stage",
    permissionOverwrites: [
      {
        id: everyoneId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
      },
    ],
  });

  persistStreamVoiceChannelId(created.id);
  rebindClientConfig(client, created.id);
  global.logger?.warn?.("[streamerStageGuard] recreated stage channel:", created.id, created.name);
  return { ok: true, channelId: String(created.id), created: true };
}

async function ensureStreamerStageChannel(client?) {
  const ids = [...readConfiguredStreamVoiceIds(client)];
  if (!ids.length) return { ok: false, reason: "not_configured" };

  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "guild_unavailable" };

  for (const id of ids) {
    const ch =
      guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
    if (ch && (Number(ch.type) === ChannelType.GuildStageVoice || Number(ch.type) === 13 || ch.isVoiceBased?.())) {
      if (String(client?.config?.twitchLiveAlerts?.streamVoiceChannelId || "") !== id) {
        rebindClientConfig(client, id);
      }
      return { ok: true, channelId: id, existed: true };
    }
  }

  return recreateStreamerStage(client);
}

function startStreamerStageGuardLoop(client?) {
  if (!shouldStartExternalWorkerLoop("COMMUNITY_POLL")) return null;
  if (!client || started.has(client)) return;
  started.add(client);
  const tick = () =>
    ensureStreamerStageChannel(client).catch((err?) => {
      global.logger?.warn?.("[streamerStageGuard] ensure failed:", err?.message || err);
    });
  tick();
  const timer = setInterval(tick, CHECK_MS);
  timer.unref?.();
  client._streamerStageGuardInterval = timer;
}

export = {
  startStreamerStageGuardLoop,
  ensureStreamerStageChannel,
  isProtectedStreamerStageChannelId,
};
