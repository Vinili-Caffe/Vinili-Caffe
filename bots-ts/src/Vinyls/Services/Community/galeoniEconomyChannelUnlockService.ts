const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { economyConfig, isGaleoniEconomyUnlocked } = require("./galeoniEconomyService") as typeof import("./galeoniEconomyService");

const startedClients = new WeakSet();
const Flags = PermissionsBitField.Flags;

function resolveEconomyChannelId(client?) {
  const fromCfg = String(client?.config?.galeoniEconomy?.channelId || "").trim();
  if (/^\d{17,22}$/.test(fromCfg)) return fromCfg;
  return String(IDs.channels?.economy || "").trim();
}

function resolveWriterRoleId(client?) {
  const fromCfg = String(client?.config?.galeoniEconomy?.writerRoleId || "").trim();
  if (/^\d{17,22}$/.test(fromCfg)) return fromCfg;
  return String(IDs.roles?.HogwartsEventParticipant || "1507000390493798511").trim();
}

function channelAlreadyUnlocked(channel?, everyoneId?, writerRoleId?) {
  const everyone = channel.permissionOverwrites?.cache?.get?.(String(everyoneId));
  const writer = channel.permissionOverwrites?.cache?.get?.(String(writerRoleId));
  if (!everyone || !writer) return false;
    if (!everyone.deny?.has?.(Flags.SendMessages)) return false;
  if (everyone.deny?.has?.(Flags.ViewChannel)) return false;
    if (!writer.allow?.has?.(Flags.ViewChannel)) return false;
  if (!writer.allow?.has?.(Flags.SendMessages)) return false;
  return true;
}

async function unlockGaleoniEconomyChannel(client?, { force = false } = {}) {
  const guildId = String(IDs.guilds?.main || "").trim();
  const channelId = resolveEconomyChannelId(client);
  const writerRoleId = resolveWriterRoleId(client);
  if (!guildId || !channelId || !writerRoleId) {
    return { ok: false, reason: "missing_ids" };
  }

  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_missing" };

  const channel =
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId).catch(() => null)) ||
    (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.permissionOverwrites?.edit) {
    return { ok: false, reason: "channel_missing" };
  }
  if (!channel.manageable) {
    return { ok: false, reason: "not_manageable" };
  }

  const everyoneId = guild.id;
  if (!force && channelAlreadyUnlocked(channel, everyoneId, writerRoleId)) {
    return { ok: true, channelId, writerRoleId, already: true };
  }

  await channel.permissionOverwrites
    .edit(
      everyoneId,
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        AddReactions: false,
      },
      { reason: "Galeoni economy unlock: everyone view-only" },
    )
    .catch((err?) => {
      throw new Error(`everyone overwrite: ${err?.message || err}`);
    });

  await channel.permissionOverwrites
    .edit(
      writerRoleId,
      {
        ViewChannel: true,
        ReadMessageHistory: true,
        SendMessages: true,
        AddReactions: true,
        EmbedLinks: true,
        AttachFiles: true,
        UseExternalEmojis: true,
        UseExternalStickers: true,
      },
      { reason: "Galeoni economy unlock: event role can write" },
    )
    .catch((err?) => {
      throw new Error(`writer overwrite: ${err?.message || err}`);
    });

  global.logger?.warn?.(
    `[GALEONI ECONOMY] Canale <#${channelId}> aperto: everyone view-only, <@&${writerRoleId}> write.`,
  );
  return { ok: true, channelId, writerRoleId, already: false };
}

function startGaleoniEconomyChannelUnlockLoop(client?) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch") as typeof import("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || startedClients.has(client)) return;
  const cfg = economyConfig(client);
  if (cfg?.enabled !== true) return;
  startedClients.add(client);

  const schedule = (ms?) => {
    const timer = setTimeout(run, Math.max(1000, ms));
    timer.unref?.();
    client._galeoniEconomyChannelUnlockTimer = timer;
  };

  const run = async () => {
    try {
      if (!isGaleoniEconomyUnlocked(client)) {
        const cfg = economyConfig(client);
        const startMs = Number(cfg.startMs || 0);
        const delay = Number.isFinite(startMs) && startMs > Date.now()
          ? Math.min(60_000, Math.max(1000, startMs - Date.now()))
          : 30_000;
        schedule(delay);
        return;
      }
      if (client._galeoniEconomyChannelUnlocked === true) return;
      const result = await unlockGaleoniEconomyChannel(client);
      if (result?.ok) {
        client._galeoniEconomyChannelUnlocked = true;
        return;
      }
      global.logger?.warn?.("[GALEONI ECONOMY] unlock canale non riuscito:", result?.reason || "unknown");
      schedule(30_000);
    } catch (err) {
      global.logger?.warn?.("[GALEONI ECONOMY] unlock canale:", err?.message || err);
      schedule(30_000);
    }
  };

  const boot = () => schedule(8_000);
  if (client.isReady?.()) boot();
  else client.once("ready", boot);
}

export = {
  startGaleoniEconomyChannelUnlockLoop,
  unlockGaleoniEconomyChannel,
};
