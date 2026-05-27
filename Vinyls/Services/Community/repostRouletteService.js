const cron = require("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached");
const { sendRepostRoulette, isRepostDisabledInGuild } = require("./repostService");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { canInvokePrefixCommand } = require("../../MultiGuild/core/accessPolicy");
const { resolveQuoteChannelId } = require("../../Utils/Quote/quotePostChannel");

function shouldRunRepostRouletteForGuild(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || isRepostDisabledInGuild(gid)) return false;
  if (!resolveQuoteChannelId(gid)) return false;
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

/**
 * Ogni 30 minuti (alle :00 e :30) invia un repost casuale per ogni server con bacheca configurata.
 * @param {import("discord.js").Client} client
 */
function startRepostRouletteCron(client) {
  if (client._repostRouletteCron) return;

  client._repostRouletteCron = cron.schedule(
    "0,30 * * * *",
    runCronDetached("[REPOST ROULETTE]", async () => {
      await runRepostRouletteSweep(client);
    }),
    { timezone: "Europe/Rome", noOverlap: true },
  );
}

module.exports = { startRepostRouletteCron, runRepostRouletteSweep, shouldRunRepostRouletteForGuild };