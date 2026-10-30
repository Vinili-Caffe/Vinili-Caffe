/** Minigiochi: protezione delle risposte dallo snipe dei messaggi cancellati. */
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { normalizeMemorySequence } = require("./minigameText") as typeof import("./minigameText");
const { activeGames } = require("./minigameState") as typeof import("./minigameState");

function suppressMinigameSnipe(client?, channelId?, messageId?) {
  if (!client) return;
  const mid = String(messageId || "").trim();
  if (mid) {
    if (!(client._minigameSnipeSuppressIds instanceof Set)) client._minigameSnipeSuppressIds = new Set();
    client._minigameSnipeSuppressIds.add(mid);
    setTimeout(() => {
      try {
        client._minigameSnipeSuppressIds?.delete?.(mid);
      } catch (_) {}
    }, 120_000).unref?.();
  }
  const chId = String(channelId || "").trim();
  if (!chId || !(client.snipes instanceof Map)) return;
  const raw = client.snipes.get(chId);
  const history = Array.isArray(raw) ? raw : raw ? [raw] : [];
  if (!history.length) return;
  const secrets = collectActiveMinigameAnswerSecrets(activeGames.get(chId));
  const filtered = history.filter((item?) => {
    if (!item || typeof item !== "object") return false;
    if (mid && String(item.messageId || "") === mid) return false;
    if (item.hideForMinigame) return false;
    if (snipeContentLeaksMinigameAnswer(item.content, secrets)) return false;
    return true;
  });
  if (filtered.length) client.snipes.set(chId, filtered.slice(0, 10));
  else client.snipes.delete(chId);
}

function isMinigameSnipeSuppressed(client?, messageId?) {
  const mid = String(messageId || "").trim();
  if (!mid || !client) return false;
  return Boolean(client._minigameSnipeSuppressIds?.has?.(mid));
}

function collectActiveMinigameAnswerSecrets(game?) {
  const secrets = new Set();
  if (!game || typeof game !== "object") return secrets;
  const add = (value?) => {
    const raw = String(value ?? "").trim();
    if (!raw) return;
    secrets.add(raw);
    secrets.add(raw.toLowerCase());
    const compact = raw.toLowerCase().replace(/\s+/g, "");
    if (compact) secrets.add(compact);
    const noPunct = raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    if (noPunct) secrets.add(noPunct);
    try {
      const mem = normalizeMemorySequence(raw);
      if (mem) secrets.add(mem);
    } catch (_) {}
    try {
      const country = normalizeCountryName(raw);
      if (country) secrets.add(country);
    } catch (_) {}
  };
  add(game.sequence);
  add(game.normalizedSequence);
  add(game.answer);
  add(game.phrase);
  add(game.normalizedPhrase);
  add(game.word);
  add(game.target);
  add(game.year);
  add(game.correct);
  add(game.expression);
  add(game.city);
  add(game.landmark);
  add(game.title);
  add(game.subtitle);
  add(game.verse);
  if (Array.isArray(game.answers)) {
    for (const item of game.answers) add(item);
  }
  if (Array.isArray(game.sourceAnswers)) {
    for (const item of game.sourceAnswers) add(item);
  }
  if (Array.isArray(game.options) && Number.isFinite(game.correctIndex)) {
    add(game.options[game.correctIndex]);
  }
  if (typeof game.answer === "boolean") {
    add(game.answer ? "vero" : "falso");
    add(game.answer ? "true" : "false");
    add(game.answer ? "v" : "f");
  }
  return secrets;
}

function snipeContentLeaksMinigameAnswer(content?, secrets?) {
  const raw = String(content || "").trim();
  if (!raw || !(secrets instanceof Set) || !secrets.size) return false;
  const lower = raw.toLowerCase();
  const compact = lower.replace(/\s+/g, "");
  let memNorm = "";
  try {
    memNorm = normalizeMemorySequence(raw);
  } catch (_) {}
  let countryNorm = "";
  try {
    countryNorm = normalizeCountryName(raw);
  } catch (_) {}
  for (const secret of secrets) {
    const s = String(secret || "").trim();
    if (!s) continue;
        if (s.length < 2 && !/^\d+$/.test(s)) continue;
    if (lower === s || compact === s.replace(/\s+/g, "")) return true;
    if (s.length >= 3 && (lower.includes(s) || compact.includes(s.replace(/\s+/g, "")))) return true;
    if (memNorm && memNorm === s) return true;
    if (countryNorm && countryNorm === s) return true;
  }
  return false;
}

function pickSnipeEntryForChannel(client?, channelId?, history?) {
  const list = Array.isArray(history) ? history : history ? [history] : [];
  const chId = String(channelId || "").trim();
  const game = chId ? activeGames.get(chId) : null;
  const secrets = collectActiveMinigameAnswerSecrets(game);
  for (const item of list) {
    if (!item || item.isEmbedOnly) continue;
    if (item.messageId && isMinigameSnipeSuppressed(client, item.messageId)) continue;
    if (item.hideForMinigame) continue;
    if (snipeContentLeaksMinigameAnswer(item.content, secrets)) continue;
    return item;
  }
  return null;
}

function shouldSkipStoringSnipe(client?, channelId?, payload?) {
  if (!payload || typeof payload !== "object") return true;
  if (payload.messageId && isMinigameSnipeSuppressed(client, payload.messageId)) return true;
  if (payload.hideForMinigame) return true;
  const chId = String(channelId || "").trim();
  const secrets = collectActiveMinigameAnswerSecrets(chId ? activeGames.get(chId) : null);
  return snipeContentLeaksMinigameAnswer(payload.content, secrets);
}

function redactSnipeContentForMinigame(client?, channelId?, content?) {
  const chId = String(channelId || "").trim();
  const secrets = collectActiveMinigameAnswerSecrets(chId ? activeGames.get(chId) : null);
  if (!snipeContentLeaksMinigameAnswer(content, secrets)) return String(content || "");
  return "Contenuto nascosto (risposta minigame).";
}

export = { suppressMinigameSnipe, isMinigameSnipeSuppressed, pickSnipeEntryForChannel, shouldSkipStoringSnipe, redactSnipeContentForMinigame };
