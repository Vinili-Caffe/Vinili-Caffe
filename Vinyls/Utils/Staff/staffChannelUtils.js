const IDs = require("../Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache");

async function resolveStaffValutazioniChannel(guild, client = null) {
  if (!guild) return null;
  return (
    guild.channels.cache.get(IDs.channels?.valutazioniStaff) ||
    (await getGuildChannelCached(guild, IDs.channels?.valutazioniStaff)) ||
    (client ? await getClientChannelCached(client, IDs.channels?.valutazioniStaff) : null)
  );
}

module.exports = { resolveStaffValutazioniChannel };