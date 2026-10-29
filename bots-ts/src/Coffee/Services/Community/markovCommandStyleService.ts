const {
  COFFEE_PREFIX_COMMAND_NAMES,
  isCoffeePrefixCommandToken,
} = require("../../../shared/discord/coffeePrefixCommandTokens") as typeof import("../../../shared/discord/coffeePrefixCommandTokens");
const {
  VINYLS_PREFIX_COMMAND_NAMES,
  isVinylsPrefixCommandToken,
} = require("../../../shared/discord/vinylsPrefixCommandTokens") as typeof import("../../../shared/discord/vinylsPrefixCommandTokens");

const COFFEE_ARG_COMMANDS = new Set([
  "play",
  "lyrics",
  "set",
  "volume",
  "rewind",
  "upcoming",
  "requested",
]);

const VINYLS_ARG_COMMANDS = new Set([
  "quote",
  "profile",
  "avatar",
  "banner",
  "afk",
  "repost",
  "help",
  "ping",
  "settings",
]);

const COMMAND_LINE_RE = /^([+,./])([a-zA-Z0-9_-]+)(?:\s+(.*))?$/;

function getPrefixConfig(client?) {
  const markov = client?.config?.markov || {};
  return {
    coffeePrefix: String(client?.config?.prefix || ",").trim() || ",",
    vinylsPrefix: String(markov.vinylsStylePrefix || "+").trim() || "+",
  };
}

function getCommandStyleConfig(client?) {
  const markov = client?.config?.markov || {};
  const auto = markov.autoSend && typeof markov.autoSend === "object" ? markov.autoSend : {};
  const chanceRaw = Number(auto.commandStyleChance ?? markov.commandStyleChance ?? 0);
  const prefixes = getPrefixConfig(client);
  return {
    enabled: auto.commandStyleEnabled === true && markov.commandStyleEnabled === true,
    chance: Number.isFinite(chanceRaw) ? Math.min(1, Math.max(0, chanceRaw)) : 0,
    ...prefixes,
  };
}

function looksLikeWrittenCommand(text?) {
  return COMMAND_LINE_RE.test(String(text || "").trim());
}

function parseCommandLine(text?) {
  const match = String(text || "").trim().match(COMMAND_LINE_RE);
  if (!match) return null;
  return {
    prefix: match[1],
    command: match[2].toLowerCase(),
    args: String(match[3] || "").trim(),
  };
}

function isKnownPrefixCommand(prefix?, command?, cfg: Record<string, any> = {}) {
  const cmd = String(command || "").toLowerCase();
  if (!cmd) return false;
  if (prefix === cfg.coffeePrefix) return isCoffeePrefixCommandToken(cmd);
  if (prefix === cfg.vinylsPrefix) return isVinylsPrefixCommandToken(cmd);
  return false;
}

function extractCommandExamplesFromCorpus(corpus?, cfg?) {
  const out = [];
  const seen = new Set();
  for (const line of Array.isArray(corpus) ? corpus : []) {
    const parsed = parseCommandLine(line);
    if (!parsed || !isKnownPrefixCommand(parsed.prefix, parsed.command, cfg)) continue;
    const key = `${parsed.prefix}${parsed.command}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

function pickRandom(items?) {
  if (!Array.isArray(items) || !items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function commandAcceptsArgs(prefix?, command?, cfg?) {
  const cmd = String(command || "").toLowerCase();
  if (prefix === cfg.coffeePrefix) return COFFEE_ARG_COMMANDS.has(cmd);
  if (prefix === cfg.vinylsPrefix) return VINYLS_ARG_COMMANDS.has(cmd);
  return false;
}

function pickCommandName(prefix?, cfg?, corpusExamples?) {
  const fromCorpus = corpusExamples.filter((entry?) => entry.prefix === prefix);
  if (fromCorpus.length && Math.random() < 0.65) {
    return fromCorpus[Math.floor(Math.random() * fromCorpus.length)].command;
  }
  if (prefix === cfg.coffeePrefix) {
    return pickRandom([...COFFEE_PREFIX_COMMAND_NAMES]);
  }
  if (prefix === cfg.vinylsPrefix) {
    return pickRandom([...VINYLS_PREFIX_COMMAND_NAMES]);
  }
  return null;
}

function pickCommandPrefix(cfg?) {
  return Math.random() < 0.5 ? cfg.coffeePrefix : cfg.vinylsPrefix;
}

function stripCommandPrefixFromArgs(text?) {
  const parsed = parseCommandLine(text);
  if (!parsed?.args) return String(text || "").trim();
  return parsed.args;
}

function buildFakeCommandLine(prefix?, command?, args?) {
  const cmd = String(command || "").trim();
  if (!cmd) return "";
  const body = String(args || "").trim();
  if (!body) return `${prefix}${cmd}`;
  return `${prefix}${cmd} ${body}`;
}

function sanitizeCommandLikeText(client?, text?) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return "";
  const parsed = parseCommandLine(trimmed);
  if (!parsed) return trimmed;
  const cfg = getPrefixConfig(client);
  if (isKnownPrefixCommand(parsed.prefix, parsed.command, cfg)) return trimmed;
  return parsed.args || "";
}

function sanitizeMarkovCollectLine(client?, content?) {
  const trimmed = String(content || "").trim();
  if (!trimmed) return "";
  const parsed = parseCommandLine(trimmed);
  if (!parsed) return trimmed;
  const cfg = getPrefixConfig(client);
  if (isKnownPrefixCommand(parsed.prefix, parsed.command, cfg)) return trimmed;
  return parsed.args || "";
}

function maybeApplyCommandStyle(client?, text?, corpus = []) {
  const cfg = getCommandStyleConfig(client);
  const trimmed = String(text || "").trim();
  if (!trimmed || !cfg.enabled) return sanitizeCommandLikeText(client, trimmed);
  if (looksLikeWrittenCommand(trimmed)) return sanitizeCommandLikeText(client, trimmed);
  if (cfg.chance <= 0 || Math.random() >= cfg.chance) return trimmed;

  const corpusExamples = extractCommandExamplesFromCorpus(corpus, cfg);
  const prefix = pickCommandPrefix(cfg);
  const command = pickCommandName(prefix, cfg, corpusExamples);
  if (!command) return trimmed;
  const argsSource = stripCommandPrefixFromArgs(trimmed);
  const withArgs = commandAcceptsArgs(prefix, command, cfg) && argsSource;
  return buildFakeCommandLine(prefix, command, withArgs ? argsSource : "");
}

export = {
  getCommandStyleConfig,
  getPrefixConfig,
  looksLikeWrittenCommand,
  parseCommandLine,
  isKnownPrefixCommand,
  extractCommandExamplesFromCorpus,
  sanitizeCommandLikeText,
  sanitizeMarkovCollectLine,
  maybeApplyCommandStyle,
  buildFakeCommandLine,
};