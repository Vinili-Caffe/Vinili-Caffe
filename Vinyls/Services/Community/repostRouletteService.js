const cron = require("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const { sendRepostRoulette, isRepostDisabledInGuild } = require("./repostService");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { canInvokePrefixCommand } = require("../../MultiGuild/core/accessPolicy");
const { resolveRouletteChannelId } = require("../../Utils/Quote/repostRoulettePostChannel");

function shouldRunRepostRouletteForGuild(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || isRepostDisabledInGuild(gid)) return false;
  if (!resolveRouletteChannelId(gid)) return false;
  if (!isMultiGuildLayerEnabled() || isViniliProtectedGuild(gid)) return true;
  const gate = canInvokePrefixCommand(gid, "utility");
  if (!gate.managed) return true;
  return Boolean(gate.ok);
}

/**
 * @param {import("discord.js").Client} client
 */
async function runRepostRouletteSweep(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!shouldRunRepostRouletteForGuild(guild.id)) continue;
    await sendRepostRoulette(client, guild.id).catch(() => {});
  }
}

const REPOST_ROULETTE_TZ = "Europe/Rome";
const REPOST_ROULETTE_CRON_ON_HOUR = "0 0,8-23 * * *";
const REPOST_ROULETTE_CRON_ON_HALF = "30 8-23 * * *";

function scheduleRepostRouletteTick(client) {
  return runCronDetached("[REPOST ROULETTE]", async () => {
    await runRepostRouletteSweep(client);
  });
}

/**
 * Ogni 30 min dalle 8:00 alle 00:00 (ultimo alle 00:00), poi pausa fino alle 8:00 (Europe/Rome).
 * @param {import("discord.js").Client} client
 */
function startRepostRouletteCron(client) {
  if (client._repostRouletteCron) return;
  const opts = { timezone: REPOST_ROULETTE_TZ, noOverlap: true };
  client._repostRouletteCron = [
    cron.schedule(REPOST_ROULETTE_CRON_ON_HOUR, scheduleRepostRouletteTick(client), opts),
    cron.schedule(REPOST_ROULETTE_CRON_ON_HALF, scheduleRepostRouletteTick(client), opts),
  ];
}

module.exports = { startRepostRouletteCron, runRepostRouletteSweep, shouldRunRepostRouletteForGuild };