/** Serata film: permessi dello stage e stato di chiusura. */
const { OverwriteType } = require("discord.js") as typeof import("discord.js");
const { MOVIE_NIGHT_EVENT_CHANNEL_ID } = require("./movieNightEvents") as typeof import("./movieNightEvents");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

async function openMovieNightStagePermissions(guild?) {
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID) || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID));
  if (!channel?.permissionOverwrites?.edit) return false;

  const permissionPatch = {
    ViewChannel: true,
    Connect: true,
  };
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, permissionPatch, { reason: "Apertura Serata Film", type: OverwriteType.Role }).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] everyone permission open failed:", err?.message || err);
  });
  const memberRoleId = String(IDs.roles?.Member || "");
  if (memberRoleId) {
    await channel.permissionOverwrites.edit(memberRoleId, permissionPatch, { reason: "Apertura Serata Film", type: OverwriteType.Role }).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] member permission open failed:", err?.message || err);
    });
  }
  return true;
}

async function closeMovieNightStagePermissions(guild?) {
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID) || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID));
  if (!channel?.permissionOverwrites?.edit) return false;

  const permissionPatch = {
    Connect: false,
  };
  await channel.permissionOverwrites.edit(guild.roles.everyone.id, permissionPatch, { reason: "Chiusura Serata Film", type: OverwriteType.Role }).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] everyone permission close failed:", err?.message || err);
  });
  const memberRoleId = String(IDs.roles?.Member || "");
  if (memberRoleId) {
    await channel.permissionOverwrites.edit(memberRoleId, permissionPatch, { reason: "Chiusura Serata Film", type: OverwriteType.Role }).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] member permission close failed:", err?.message || err);
    });
  }
  return true;
}

async function isSerataFilmStageLive(guild?) {
  if (!guild) return false;
  const channel = guild.channels.cache.get(MOVIE_NIGHT_EVENT_CHANNEL_ID)
    || (await getGuildChannelCached(guild, MOVIE_NIGHT_EVENT_CHANNEL_ID).catch(() => null));
  if (channel?.stageInstance) return true;
  const cached = guild.stageInstances?.cache?.find?.((row?) => String(row?.channelId || "") === MOVIE_NIGHT_EVENT_CHANNEL_ID);
  if (cached) return true;
  const fetched = await guild.stageInstances?.fetch?.().catch(() => null);
  if (fetched?.find?.((row?) => String(row?.channelId || "") === MOVIE_NIGHT_EVENT_CHANNEL_ID)) return true;
  // Serata spesso senza Stage Instance API: se c'è gente in canale, è ancora in corso.
  const members = channel?.members;
  if (members?.size) {
    for (const member of members.values()) {
      if (!member?.user?.bot) return true;
    }
  }
  return false;
}

async function isSerataFilmScheduledEventActive(guild?) {
  if (!guild?.scheduledEvents?.fetch) return false;
  const { findCurrentWeekMovieNightEvent } = require("./movieNightEvents") as typeof import("./movieNightEvents");
  const event = await findCurrentWeekMovieNightEvent(guild, new Date()).catch(() => null);
  return Number(event?.status || 0) === 2;
}

export = {
  openMovieNightStagePermissions,
  closeMovieNightStagePermissions,
  isSerataFilmStageLive,
  isSerataFilmScheduledEventActive,
};
