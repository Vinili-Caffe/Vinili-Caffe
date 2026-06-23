const { COFFEE_PREFIX_COMMAND_NAMES } = require("../../../shared/discord/coffeePrefixCommandTokens");

const VINYLS_STYLE_COMMANDS = [
  "profile",
  "avatar",
  "banner",
  "afk",
  "quote",
  "rank",
  "snipe",
  "myrepost",
  "classifica",
  "repost",
  "clip",
];

const COFFEE_ARG_COMMANDS = new Set([
  "play",
  "lyrics",
  "set",
  "volume",
  "rewind",
  "upcoming",
  "requested",
]);

const COMMAND_LINE_RE = /^([+,./])([a-zA-Z0-9_-]+)(?:\s+(.*))?$/;

function getCommandStyleConfig(client) {
  const markov = client?.config?.markov || {};
  const auto = markov.autoSend && typeof markov.autoSend === "object" ? markov.autoSend : {};
  const chanceRaw = Number(auto.commandStyleChance ?? markov.commandStyleChance ?? 0.2);
  return {
    enabled: auto.commandStyleEnabled !== false && markov.commandStyleEnabled !== false,
    chance: Number.isFinite(chanceRaw) ? Math.min(1, Math.max(0, chanceRaw)) : 0.2,
    coffeePrefix: String(client?.config?.prefix || ",").trim() || ",",
    vinylsPrefix: String(markov.vinylsStylePrefix || "+").trim() || "+",
  };
}

function looksLikeWrittenCommand(text) {
  return COMMAND_LINE_RE.test(String(text || "").trim());
}

function parseCommandLine(text) {
  const match = String(text || "").trim().match(COMMAND_LINE_RE);
  if (!match) return null;
  return {
    prefix: match[1],
    command: match[2].toLowerCase(),
    args: String(match[3] || "").trim(),
  };
}

function extractCommandExamplesFromCorpus(corpus) {
  const out = [];
  const seen = new Set();
  for (const line of Array.isArray(corpus) ? corpus : []) {
    const parsed = parseCommandLine(line);
    if (!parsed) continue;
    const key = `${parsed.prefix}${parsed.command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

function pickRandom(items) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function commandAcceptsArgs(prefix, command, cfg) {
  const cmd = String(command || "").toLowerCase();
  if (prefix === cfg.coffeePrefix) return COFFEE_ARG_COMMANDS.has(cmd);
  if (prefix === cfg.vinylsPrefix) return new Set(["quote", "profile", "avatar", "banner", "afk", "repost"]).has(cmd);
  return cmd === "play" || cmd === "help";
}

function pickCommandName(prefix, cfg, corpusExamples) {
  const fromCorpus = corpusExamples.filter((entry) => entry.prefix === prefix);
  if (fromCorpus.length && Math.random() < 0.65) {
    return fromCorpus[Math.floor(Math.random() * fromCorpus.length)].command;
  }
  if (prefix === cfg.coffeePrefix) {
    return pickRandom([...COFFEE_PREFIX_COMMAND_NAMES]);
  }
  if (prefix === cfg.vinylsPrefix) {
    return pickRandom(VINYLS_STYLE_COMMANDS);
  }
  return pickRandom(["help", "play", "ping", "profile", "settings"]);
}

function pickCommandPrefix(cfg) {
  const roll = Math.random();
  if (roll < 0.58) return cfg.coffeePrefix;
  if (roll < 0.9) return cfg.vinylsPrefix;
  return "/";
}

function stripCommandPrefixFromArgs(text) {
  const parsed = parseCommandLine(text);
  if (!parsed?.args) return String(text || "").trim();
  return parsed.args;
}

function buildFakeCommandLine(prefix, command, args) {
  const cmd = String(command || "").trim();
  if (!cmd) return "";
  const body = String(args || "").trim();
  if (!body) return `${prefix}${cmd}`;
  return `${prefix}${cmd} ${body}`;
}

function maybeApplyCommandStyle(client, text, corpus = []) {
  const cfg = getCommandStyleConfig(client);
  const trimmed = String(text || "").trim();
  if (!trimmed || !cfg.enabled) return trimmed;
  if (looksLikeWrittenCommand(trimmed)) return trimmed;
  if (cfg.chance <= 0 || Math.random() >= cfg.chance) return trimmed;

  const corpusExamples = extractCommandExamplesFromCorpus(corpus);
  const prefix = pickCommandPrefix(cfg);
  const command = pickCommandName(prefix, cfg, corpusExamples);
  const argsSource = stripCommandPrefixFromArgs(trimmed);
  const withArgs = commandAcceptsArgs(prefix, command, cfg) && argsSource;
  return buildFakeCommandLine(prefix, command, withArgs ? argsSource : "");
}

module.exports = {
  getCommandStyleConfig,
  looksLikeWrittenCommand,
  parseCommandLine,
  extractCommandExamplesFromCorpus,
  maybeApplyCommandStyle,
  buildFakeCommandLine,
};