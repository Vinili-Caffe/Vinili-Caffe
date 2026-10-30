function buildPrefixLookupKeys(commandName?, subcommandName = null) {
  const command = String(commandName || "").trim().toLowerCase();
  if (!command) return [];
  const sub = String(subcommandName || "").trim().toLowerCase();
  const keys = [];
  if (sub) {
    keys.push(`prefix:${command}.${sub}`, `any:${command}.${sub}`);
  }
  keys.push(`prefix:${command}`, `any:${command}`);
  return Array.from(new Set(keys));
}

function buildSlashLookupKeys(commandName?, groupName = null, subcommandName = null) {
  const command = String(commandName || "").trim().toLowerCase();
  if (!command) return [];
  const group = String(groupName || "").trim().toLowerCase();
  const sub = String(subcommandName || "").trim().toLowerCase();
  const keys = [];

  if (group && sub) {
    keys.push(
      `slash:${command}.${group}.${sub}`,
      `any:${command}.${group}.${sub}`,
    );
    keys.push(`slash:${command}.${sub}`, `any:${command}.${sub}`);
  } else if (sub) {
    keys.push(`slash:${command}.${sub}`, `any:${command}.${sub}`);
  }

  keys.push(`slash:${command}`, `any:${command}`);
  return Array.from(new Set(keys));
}

export = { buildPrefixLookupKeys, buildSlashLookupKeys };