const startupPanelsTrigger = require("../../../Community/discord/panels/startupPanels") as typeof import("../../../Community/discord/panels/startupPanels");
const {
  getEnabledDiscordPanelNames,
} = require("../../../Community/config/discordPanelsConfig") as typeof import("../../../Community/config/discordPanelsConfig");
const {
  STARTUP_THROTTLE_NS,
  STARTUP_PANELS_TTL_MS,
  shouldRunStartupWork,
  markStartupThrottle,
  formatDurationMs,
  envFlagEnabled,
} = require("./startupHelpers") as typeof import("./startupHelpers");

/** panelsCodeChange1: impronta del codice dei pannelli (cartella Embeds). Se cambia (nuova pubblicazione)
 *  i pannelli si ripubblicano subito, senza aspettare le 6 ore del limite all'avvio. */
const PANELS_CODE_FP_FILE = require("path").join(require("os").tmpdir(), "vinili-caffe-startup-throttle", "panels-code.txt");

function panelsCodeFingerprint() {
  const fsMod = require("fs") as typeof import("fs");
  const pathMod = require("path") as typeof import("path");
  const hash = (require("crypto") as typeof import("crypto")).createHash("sha1");
  const walk = (dir?) => {
    let entries = [];
    try {
      entries = fsMod.readdirSync(dir, { withFileTypes: true }).sort((a?, b?) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const e of entries) {
      const p = pathMod.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(js|ts)$/.test(e.name)) {
        hash.update(e.name);
        try {
          hash.update(fsMod.readFileSync(p));
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(pathMod.join(__dirname, "..", "..", "Community", "discord", "panels"));
  walk(pathMod.join(__dirname, "..", "..", "Moderation", "discord", "panels"));
  walk(pathMod.join(__dirname, "..", "..", "..", "shared", "embeds"));
  return hash.digest("hex");
}

async function runStartupPanels(client?, label = "immediate") {
  if (client._startupPanelsRefreshRunning) return;

  /* DEFAULT_ENABLED=[]: niente da ripubblicare. Solo force env o allowlist DISCORD_PANELS_ENABLED. */
  const enabledNames = getEnabledDiscordPanelNames();
  if (!enabledNames.length && !envFlagEnabled("STARTUP_PANELS")) {
    markStartupThrottle(STARTUP_THROTTLE_NS, "startup-panels");
    return;
  }

  let decision = shouldRunStartupWork(STARTUP_THROTTLE_NS, "startup-panels", {
    ttlMs: STARTUP_PANELS_TTL_MS,
    forceEnv: "STARTUP_PANELS",
  });
  const codeFp = panelsCodeFingerprint();
  let prevFp = "";
  try {
    prevFp = String(require("fs").readFileSync(PANELS_CODE_FP_FILE, "utf8") || "").trim();
  } catch {
    prevFp = "";
  }
  if (!decision.run && codeFp && codeFp !== prevFp) decision = { run: true, reason: "panels_code_changed" };
  if (!decision.run) return;

  client._startupPanelsRefreshRunning = true;
  const panelsStartedAt = Date.now();
  try {
    client._panelUpsertMessageCache = new Map();
    if (typeof startupPanelsTrigger?.execute === "function") {
      await startupPanelsTrigger.execute(client);
    }
    markStartupThrottle(STARTUP_THROTTLE_NS, "startup-panels");
    try {
      require("fs").mkdirSync(require("path").dirname(PANELS_CODE_FP_FILE), { recursive: true });
      require("fs").writeFileSync(PANELS_CODE_FP_FILE, codeFp);
    } catch {
      /* ignore */
    }
    global.logger?.info?.(
      `[STARTUP] Panels refresh (${label}, ${decision.reason}) in ${formatDurationMs(Date.now() - panelsStartedAt)}.`,
    );
  } catch (err) {
    global.logger?.error?.(
      `[CLIENT READY] Startup panels refresh failed (${label}):`,
      err,
    );
  } finally {
    client._panelUpsertMessageCache = new Map();
    client._startupPanelsRefreshRunning = false;
  }
}

export = {
  runStartupPanels,
  panelsCodeFingerprint,
};
