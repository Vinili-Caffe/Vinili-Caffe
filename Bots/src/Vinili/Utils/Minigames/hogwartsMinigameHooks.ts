/**
 * Evento Hogwarts concluso: il codice è in Bots/archivio/hogwarts. minigameService ha ancora rami Hogwarts
 * e li chiede a queste funzioni, che rispondono sempre "evento spento" senza caricare niente dall'archivio.
 * Per riattivare l'evento: riportare i file da Bots/archivio/hogwarts e ripristinare queste funzioni.
 */
function isHogwartsRuntimeDisabled(_client?) {
  return true;
}

function isHogwartsExclusiveMinigamesEnabled(client?, cfg?) {
  const raw = client?.config?.minigames?.hogwartsExclusiveDuringEvent;
  if (raw === false) return false;
  if (raw === true) return true;
  return cfg?.hogwartsExclusiveDuringEvent !== false;
}

function isHogwartsEventLiveForMinigames(_client?, _nowMs = Date.now()) {
  return false;
}

function shouldUseHogwartsTheme(cfg?) {
  return Boolean(cfg?.hogwartsEventLive) && isHogwartsExclusiveMinigamesEnabled(null, cfg);
}

export = {
  isHogwartsRuntimeDisabled,
  isHogwartsExclusiveMinigamesEnabled,
  isHogwartsEventLiveForMinigames,
  shouldUseHogwartsTheme,
};
