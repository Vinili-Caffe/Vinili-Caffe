/**
 * Tuning REST Discord condiviso: keep-alive undici + opzioni Client/REST.
 * Non riduce la RTT di rete verso Discord (~50ms EU), ma evita handshake TLS
 * ripetuti e ritardi da offset/retry aggressivi.
 */
let sharedAgent = null;

function preferIpv4Dns() {
  try {
    const dns = require("dns") as typeof import("dns");
    if (typeof dns.setDefaultResultOrder === "function") {
      dns.setDefaultResultOrder("ipv4first");
    }
  } catch (_) {}
}

function getSharedDiscordRestAgent() {
  if (sharedAgent) return sharedAgent;
  try {
    const { Agent } = require("undici") as typeof import("undici");
    sharedAgent = new Agent({
      connections: 16,
      pipelining: 1,
      keepAliveTimeout: 60_000,
      keepAliveMaxTimeout: 120_000,
      connect: {
        timeout: 8_000,
        // Preferisci IPv4 se disponibile (su OVH EU spesso path migliore di IPv6).
        // undici rispetta anche dns.setDefaultResultOrder.
      },
    });
  } catch (_) {
    sharedAgent = null;
  }
  return sharedAgent;
}

/** Opzioni `rest` per `new Client({ rest })`. */
function buildDiscordJsRestOptions(overrides: Record<string, any> = {}) {
  preferIpv4Dns();
  const agent = getSharedDiscordRestAgent();
  const out: Record<string, any> = {
    /* Default d.js è 50ms oltre il reset rate-limit: abbassa coda post-429. */
    offset: 0,
    retries: 2,
    timeout: 15_000,
    ...overrides,
  };
  if (agent && out.agent == null) out.agent = agent;
  return out;
}

/** Opzioni per `new REST({ ... })` standalone (deploy comandi, site-api, ecc.). */
function buildStandaloneRestOptions(overrides: Record<string, any> = {}) {
  preferIpv4Dns();
  const agent = getSharedDiscordRestAgent();
  const timeout = Math.max(3000, Number(overrides.timeout) || 12_000);
  const out: Record<string, any> = {
    version: "10",
    offset: 0,
    retries: 2,
    ...overrides,
    timeout,
  };
  if (agent && out.agent == null) out.agent = agent;
  return out;
}

function createTunedREST(token?, overrides: Record<string, any> = {}) {
  const { REST } = require("discord.js") as typeof import("discord.js");
  const rest = new REST(buildStandaloneRestOptions(overrides));
  if (token) rest.setToken(String(token));
  return rest;
}

export = {
  preferIpv4Dns,
  getSharedDiscordRestAgent,
  buildDiscordJsRestOptions,
  buildStandaloneRestOptions,
  createTunedREST,
};
