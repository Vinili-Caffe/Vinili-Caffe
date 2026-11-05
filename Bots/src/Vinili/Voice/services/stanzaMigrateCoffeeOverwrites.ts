/** One-shot: copy Caffè bot permission overwrites on stanza channels to Vinili bot. */
const { OverwriteType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { isManagedStanzaRoomChannel } = require("./stanzaVoiceRoomsService") as typeof import("./stanzaVoiceRoomsService");
const { readStanzaSnapshotRoomsRaw } = require("./stanzaPanel") as typeof import("./stanzaPanel");
const { stanzaChannelMeta } = require("./stanzaPlacement") as typeof import("./stanzaPlacement");

function resolveCoffeeBotUserId() {
  const fromEnv = String(process.env.COFFEE_BOT_USER_ID || "").trim();
  if (/^\d{5,30}$/.test(fromEnv)) return fromEnv;
  const fromTestClient = String(process.env.DISCORD_CLIENT_ID_TEST || "").trim();
  if (/^\d{5,30}$/.test(fromTestClient)) return fromTestClient;
  try {
    const coffeeConfig: any = require("../../../Caffè/config.json");
    const bots = coffeeConfig?.bots;
    if (bots && typeof bots === "object") {
      for (const row of Object.values(bots)) {
        const id = String((row as any)?.userId || (row as any)?.id || "").trim();
        if (/^\d{5,30}$/.test(id)) return id;
      }
    }
  } catch (_) {}
  return "";
}

function overwritePayloadFromCache(ow?) {
  if (!ow) return null;
  return {
    allow: ow.allow?.bitfield ?? ow.allow ?? 0n,
    deny: ow.deny?.bitfield ?? ow.deny ?? 0n,
    type: ow.type ?? OverwriteType.Member,
  };
}

async function migrateChannelOverwrites(channel?, coffeeId?, viniliId?, stats?) {
  if (!channel?.permissionOverwrites?.cache || !coffeeId || !viniliId) return;
  const coffeeOw = channel.permissionOverwrites.cache.get(coffeeId);
  if (!coffeeOw) return;
  const payload = overwritePayloadFromCache(coffeeOw);
  if (!payload) return;

  stats.found += 1;
  try {
    if (channel.permissionOverwrites.cache.has(viniliId)) {
      await channel.permissionOverwrites.edit(viniliId, {
        allow: payload.allow,
        deny: payload.deny,
        type: payload.type,
      });
    } else {
      await channel.permissionOverwrites.create(viniliId, {
        allow: payload.allow,
        deny: payload.deny,
        type: payload.type,
      });
    }
    stats.copied += 1;
    if (process.env.STANZA_MIGRATE_COFFEE_OVERWRITES_REMOVE === "1") {
      await channel.permissionOverwrites.delete(coffeeId, "Stanza: migrate bot overwrite to Vinili").catch(() => {});
      stats.removed += 1;
    }
  } catch (err) {
    stats.failed += 1;
    global.logger?.warn?.(
      "[stanza] migrate overwrite failed:",
      channel.id,
      err?.message || err,
    );
  }
}

function collectManagedVoiceChannelIds(guild?) {
  const ids = new Set();
  for (const cid of stanzaChannelMeta.keys()) ids.add(String(cid));
  const rows = readStanzaSnapshotRoomsRaw();
  if (Array.isArray(rows)) {
    for (const row of rows) {
      const vid = String(row?.voiceChannelId || row?.channelId || "").trim();
      if (vid) ids.add(vid);
    }
  }
  if (guild?.channels?.cache) {
    const parentId = String(IDs.categories?.categoryPublics || "").trim();
    for (const ch of guild.channels.cache.values()) {
      if (isManagedStanzaRoomChannel(ch, parentId)) ids.add(String(ch.id));
    }
  }
  return ids;
}

async function migrateStanzaCoffeeBotOverwrites(client?) {
  const stats = { found: 0, copied: 0, removed: 0, failed: 0, channels: 0 };
  const coffeeId = resolveCoffeeBotUserId();
  const viniliId = String(client?.user?.id || "").trim();
  if (!coffeeId) {
    global.logger?.warn?.("[stanza] migrate overwrites skipped: COFFEE_BOT_USER_ID unresolved");
    return stats;
  }
  if (!viniliId) {
    global.logger?.warn?.("[stanza] migrate overwrites skipped: Vinili bot user id missing");
    return stats;
  }
  if (coffeeId === viniliId) {
    global.logger?.info?.("[stanza] migrate overwrites skipped: coffee and vinili bot ids match");
    return stats;
  }

  const guildId = String(IDs.guilds?.main || client?.config?.mainGuildId || "").trim();
  const guild =
    client?.guilds?.cache?.get(guildId) ||
    (guildId ? await client?.guilds?.fetch?.(guildId).catch(() => null) : null);
  if (!guild) {
    global.logger?.warn?.("[stanza] migrate overwrites skipped: main guild not found");
    return stats;
  }

  await guild.channels.fetch().catch(() => null);
  const voiceIds = collectManagedVoiceChannelIds(guild);
  for (const vid of voiceIds) {
    const voiceCh = guild.channels.cache.get(vid);
    if (!voiceCh) continue;
    stats.channels += 1;
    await migrateChannelOverwrites(voiceCh, coffeeId, viniliId, stats);
    const meta = stanzaChannelMeta.get(vid);
    const textId = String(meta?.textChannelId || "").trim();
    if (textId) {
      const textCh = guild.channels.cache.get(textId);
      if (textCh) await migrateChannelOverwrites(textCh, coffeeId, viniliId, stats);
    }
  }

  global.logger?.info?.(
    "[stanza] migrate coffee→vinili overwrites:",
    `channels=${stats.channels} found=${stats.found} copied=${stats.copied} removed=${stats.removed} failed=${stats.failed}`,
  );
  return stats;
}

async function maybeMigrateStanzaCoffeeBotOverwritesOnReady(client?) {
  if (process.env.STANZA_MIGRATE_COFFEE_OVERWRITES !== "1") return null;
  try {
    return await migrateStanzaCoffeeBotOverwrites(client);
  } catch (err) {
    global.logger?.warn?.("[stanza] migrate overwrites failed:", err?.message || err);
    return null;
  }
}

export = { migrateStanzaCoffeeBotOverwrites, maybeMigrateStanzaCoffeeBotOverwritesOnReady };
