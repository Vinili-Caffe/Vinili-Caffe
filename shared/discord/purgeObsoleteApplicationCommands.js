const { Routes } = require("discord-api-types/v10");

const DEFAULT_OBSOLETE_SLASH_NAMES = [
  "music",
  "squalifica",
  "dmbroadcast",
  "gringott",
  "aggiungi-punti",
  "rimuovi-punti",
  "rimuovi",
];

/** Context menu / slash da rimuovere anche se il nome coincide con comandi ancora attivi (altro type). */
const DEFAULT_OBSOLETE_TYPED_COMMANDS = [
  // Legacy "Sanziona" sul messaggio: sostituito dal menu utente (ApplicationCommandType.User = 2).
  { name: "sanziona", type: 3 },
];

function normalizeObsoleteCommand(entry) {
  if (entry == null) return null;
  if (typeof entry === "string") {
    const name = String(entry || "").trim().toLowerCase();
    return name ? { name, type: null } : null;
  }
  if (typeof entry === "object") {
    const name = String(entry.name || "").trim().toLowerCase();
    if (!name) return null;
    const type = entry.type == null ? null : Number(entry.type);
    return { name, type: Number.isFinite(type) ? type : null };
  }
  return null;
}

function buildObsoleteMatchers(obsoleteNames = [], obsoleteTyped = []) {
  const matchers = [];
  for (const raw of [...obsoleteNames, ...obsoleteTyped]) {
    const normalized = normalizeObsoleteCommand(raw);
    if (normalized) matchers.push(normalized);
  }
  return matchers;
}

function commandMatchesObsolete(cmd, matchers) {
  const name = String(cmd?.name || "").trim().toLowerCase();
  if (!name) return false;
  const type = cmd?.type == null ? null : Number(cmd.type);
  return matchers.some((matcher) => {
    if (matcher.name !== name) return false;
    if (matcher.type == null) return true;
    return matcher.type === type;
  });
}

/**
 * Elimina dalla Discord API i comandi slash/context con nome ancora registrato ma rimossi dal codice.
 * @param {import("@discordjs/rest").REST} rest
 * @param {string} clientId
 * @param {string[]} guildIds
 * @param {Array<string|{name: string, type?: number|null}>} obsoleteNames
 * @returns {Promise<number>} numero di DELETE eseguiti
 */
async function purgeObsoleteApplicationCommands(
  rest,
  clientId,
  guildIds = [],
  obsoleteNames = DEFAULT_OBSOLETE_SLASH_NAMES,
  obsoleteTyped = DEFAULT_OBSOLETE_TYPED_COMMANDS,
) {
  const matchers = buildObsoleteMatchers(obsoleteNames, obsoleteTyped);
  if (!matchers.length || !rest || !clientId) return 0;
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
      if (!commandMatchesObsolete(cmd, matchers) || !cmd?.id) continue;
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
  DEFAULT_OBSOLETE_TYPED_COMMANDS,
  normalizeObsoleteCommand,
  commandMatchesObsolete,
};