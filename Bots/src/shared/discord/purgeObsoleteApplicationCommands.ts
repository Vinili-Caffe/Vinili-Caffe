const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");

const DEFAULT_OBSOLETE_SLASH_NAMES = [
  "music",
  "poll",
  "copy",
  "squalifica",
  "dmbroadcast",
  "gringott",
  "aggiungi-punti",
  "rimuovi-punti",
  "aggiungi punti",
  "rimuovi punti",
  "rimuovi",
  "segnala",
  "elimina partnership",
  "kick",
];

const DEFAULT_OBSOLETE_TYPED_COMMANDS = [
  { name: "sanziona", type: 3 },
  { name: "rimuovi", type: 3 },
  { name: "segnala", type: 3 },
  { name: "elimina partnership", type: 3 },
  /* vecchio context omonimo di /partnership → conflitto deploy globale */
  { name: "partnership", type: 3 },
  { name: "aggiungi punti", type: 2 },
  { name: "rimuovi punti", type: 2 },
];

function normalizeObsoleteCommand(entry?) {
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

function commandMatchesObsolete(cmd?, matchers?) {
  const name = String(cmd?.name || "").trim().toLowerCase();
  if (!name) return false;
  const type = cmd?.type == null ? null : Number(cmd.type);
  return matchers.some((matcher?) => {
    if (matcher.name !== name) return false;
    if (matcher.type == null) return true;
    return matcher.type === type;
  });
}

async function purgeObsoleteApplicationCommands(
  rest?,
  clientId?,
  guildIds = [],
  obsoleteNames = DEFAULT_OBSOLETE_SLASH_NAMES,
  obsoleteTyped = DEFAULT_OBSOLETE_TYPED_COMMANDS,
) {
  const matchers = buildObsoleteMatchers(obsoleteNames, obsoleteTyped);
  if (!matchers.length || !rest || !clientId) return 0;
  let removed = 0;

  async function purgeScope(guildId?) {
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

export = {
  purgeObsoleteApplicationCommands,
  DEFAULT_OBSOLETE_SLASH_NAMES,
};