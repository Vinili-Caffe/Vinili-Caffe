function envFlag(name?, defaultOn = false) {
  const raw = String(process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return defaultOn;
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function isMultiGuildLayerEnabled() {
  return envFlag("MULTI_GUILD_LAYER", false);
}

function allowUnknownGuilds() {
  return envFlag("MULTI_GUILD_ALLOW_UNKNOWN", false);
}

function autoRegisterGuildsOnJoin() {
  if (!isMultiGuildLayerEnabled()) return false;
  const raw = String(process.env.MULTI_GUILD_AUTO_REGISTER ?? "").trim();
  if (!raw) return true;
  return envFlag("MULTI_GUILD_AUTO_REGISTER", false);
}

export = { isMultiGuildLayerEnabled, allowUnknownGuilds, autoRegisterGuildsOnJoin };