function intAmount(value?) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function economyUsername(source?, fallback = "Utente") {
  if (source == null) return fallback;
  if (typeof source === "string") {
    const s = source.trim();
    return s || fallback;
  }
  const user = source.user && typeof source.user === "object" ? source.user : source;
  const name = String(user?.username || "").trim();
  if (name) return name;
  const id = String(user?.id || source?.id || "").trim();
  if (id) return `Utente ${id.slice(-4)}`;
  return fallback;
}

function loadBotConfig(client = null) {
  if (client?.config && typeof client.config === "object") return client.config;
  try {
    return require("../../config.json");
  } catch {
    return null;
  }
}

function resolveDisplayMode(client = null) {
  try {
    const { resolveEconomyMode } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
    const mode = resolveEconomyMode(client?.config ? client : { config: loadBotConfig(client) });
    if (mode === "server") return mode;
  } catch {
      }
  const config = loadBotConfig(client);
  if (!config) return null;
  if (config.serverEconomy?.enabled === true) return "server";
  return null;
}

function formatEconomyAmount(amount?, client = null) {
  const n = intAmount(amount);
  const mode = resolveDisplayMode(client);
  if (mode === "server") {
    try {
      const { formatCurrency } = require("../../Services/Community/serverWalletService") as typeof import("../../Services/Community/serverWalletService");
      return formatCurrency("caffe", n);
    } catch {
      return `${n} Caffè`;
    }
  }
  return `${n} Caffè`;
}

function formatEconomyAmountShort(amount?, client = null) {
  const n = intAmount(amount);
  const mode = resolveDisplayMode(client);
  return `${n} Caffè`;
}

export = {
  economyUsername,
  formatEconomyAmount,
  formatEconomyAmountShort,
};
