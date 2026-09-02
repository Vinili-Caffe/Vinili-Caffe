function intAmount(value) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function economyUsername(source, fallback = "Utente") {
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
    const { resolveEconomyMode } = require("../../Services/Community/activeEconomyService");
    const mode = resolveEconomyMode(client?.config ? client : { config: loadBotConfig(client) });
    if (mode === "galeoni" || mode === "server") return mode;
  } catch {
      }
  const config = loadBotConfig(client);
  if (!config) return null;
  if (config.serverEconomy?.enabled === true) return "server";
  if (config.galeoniEconomy?.enabled === false) return null;
  if (config.galeoniEconomy?.enabled === true || config.serverEconomy?.enabled === false) return "galeoni";
  return null;
}

function formatEconomyAmount(amount, client = null) {
  const n = intAmount(amount);
  const mode = resolveDisplayMode(client);
  if (mode === "galeoni") {
    try {
      const { formatGaleoni } = require("../../Services/Community/gringottService");
      return formatGaleoni(n);
    } catch {
      return `${n} ${n === 1 ? "Galeone d'Oro" : "Galeoni d'Oro"}`;
    }
  }
  if (mode === "server") {
    try {
      const { formatCurrency } = require("../../Services/Community/serverWalletService");
      return formatCurrency("caffe", n);
    } catch {
      return `${n} Caffè`;
    }
  }
  return `${n} Caffè`;
}

function formatEconomyAmountShort(amount, client = null) {
  const n = intAmount(amount);
  const mode = resolveDisplayMode(client);
  if (mode === "galeoni") {
    return `${n} ${n === 1 ? "Galeone" : "Galeoni"}`;
  }
  if (mode === "server") {
    return `${n} ${n === 1 ? "Caffè" : "Caffè"}`;
  }
  return `${n} ${n === 1 ? "Galeone" : "Galeoni"}`;
}

function formatEconomyBet(amount, client = null) {
  return formatEconomyAmount(amount, client);
}

module.exports = {
  economyUsername,
  formatEconomyAmount,
  formatEconomyAmountShort,
  formatEconomyBet,
  resolveDisplayMode,
};
