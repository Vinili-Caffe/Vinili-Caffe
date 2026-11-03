/* Stub live: economia Discord spenta. Implementazione in Bots/archivio/giochi-economia. */

function resolveEconomyMode(_client?, _nowMs = Date.now()) {
  return null;
}

function isEconomyCommandsVisible(_client?, _nowMs = Date.now()) {
  return false;
}

function isEconomyGameEnabled(_client?, _action?) {
  return false;
}

function isServerEconomyEnabled(_client?) {
  return false;
}

function economyConfig(_client?) {
  return Object.freeze({ enabled: false });
}

export = {
  economyConfig,
  isEconomyCommandsVisible,
  isEconomyGameEnabled,
  isServerEconomyEnabled,
  resolveEconomyMode,
};
