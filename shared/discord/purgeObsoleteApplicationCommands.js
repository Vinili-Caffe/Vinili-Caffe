const { Routes } = require("discord-api-types/v10");

const DEFAULT_OBSOLETE_SLASH_NAMES = ["music"];

/**
 * Elimina dalla Discord API i comandi slash con nome ancora registrato ma rimossi dal codice.
 * @param {import("@discordjs/rest").REST} rest
 * @param {string} clientId
 * @param {string[]} guildIds
 * @param {string[]} obsoleteNames
 * @returns {Promise<number>} numero di DELETE eseguiti
 */
async function purgeObsoleteApplicationCommands(
  rest,
  clientId,
  guildIds = [],
  obsoleteNames = DEFAULT_OBSOLETE_SLASH_NAMES,
) {
  const nameSet = new Set(
    (Array.isArray(obsoleteNames) ? obsoleteNames : []).map((s) =>
      String(s || "").toLowerCase(),
    ).filter(Boolean),
  );
  if (!nameSet.size || !rest || !clientId) return 0;
  let removed = 0;

  async function purgeScope(guildId) {
    const listPath = guildId
      ? Routes.applicationGuildCommands(clientId, guildId)
      : Routes.applicationCommands(clientId);
    let list;
    try {
      list = await rest.get(listPath);
    } catch {
      return;
    }
    if (!Array.isArray(list)) return;
    for (const cmd of list) {
      const n = String(cmd?.name || "").toLowerCase();
      if (!nameSet.has(n) || !cmd?.id) continue;
      try {
        const delPath = guildId
          ? Routes.applicationGuildCommand(clientId, guildId, cmd.id)
          : Routes.applicationCommand(clientId, cmd.id);
        await rest.delete(delPath);
        removed += 1;
      } catch {
        /* Missing Access, comando già assente, ecc. */
      }
    }
  }

  await purgeScope(null);
  for (const gid of guildIds) {
    if (!gid) continue;
    await purgeScope(String(gid));
  }
  return removed;
}

module.exports = {
  purgeObsoleteApplicationCommands,
  DEFAULT_OBSOLETE_SLASH_NAMES,
};