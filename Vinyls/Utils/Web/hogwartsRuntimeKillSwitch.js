/**
 * Kill-switch runtime Hogwarts: niente loop/scheduler/spawn dopo fine evento.
 * Per riattivare: hogwartsRuntime.disabled = false in config.json (e riavvio bot).
 */
function isHogwartsRuntimeDisabled(client) {
  try {
    const raw = client?.config?.hogwartsRuntime;
    if (raw && typeof raw === "object" && raw.disabled === false) return false;
  } catch (_) {}
  // Default: disattivato (evento chiuso).
  return true;
}

module.exports = { isHogwartsRuntimeDisabled };
