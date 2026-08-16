const fs = require("fs");
const path = require("path");
const base = path.resolve(__dirname);
const envPath = path.join(base, ".env");
try {
  if (fs.existsSync(envPath)) {
    const text = fs.readFileSync(envPath, "utf8");
    for (const line of text.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim().replace(/\r/g, "");
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (key) process.env[key] = val;
    }
  }
} catch (_) {}

/** KEY=val per riga → oggetto env (solo stringhe, per PM2). */
function loadKeyValueEnvFile(filePath) {
  const out = {};
  try {
    if (!fs.existsSync(filePath)) return out;
    const text = fs.readFileSync(filePath, "utf8");
    for (const line of text.split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim().replace(/\r/g, "");
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
      if (key) out[key] = String(val);
    }
  } catch (_) {}
  return out;
}

const lavalinkEnvFile = path.join(base, "Lavalink", ".env.lavalink");
const lavalinkEnvFromFile = loadKeyValueEnvFile(lavalinkEnvFile);
const botEnvFromFile = loadKeyValueEnvFile(envPath);
const configuredNodeBinary = String(botEnvFromFile.NODE_BINARY || "").trim();
if (configuredNodeBinary && !fs.existsSync(configuredNodeBinary)) {
  delete botEnvFromFile.NODE_BINARY;
}
/** Preferisci NODE_BINARY (nvm) se presente: native modules (canvas) devono matchare l'ABI. */
const nodeInterpreter =
  botEnvFromFile.NODE_BINARY && fs.existsSync(String(botEnvFromFile.NODE_BINARY).trim())
    ? String(botEnvFromFile.NODE_BINARY).trim()
    : "node";

/** Restart policy condivisa: crash → riparte, ma evita thrash se il boot è lento. */
const HA_RESTART = Object.freeze({
  autorestart: true,
  watch: false,
  min_uptime: "20s",
  max_restarts: 40,
  restart_delay: 2500,
  exp_backoff_restart_delay: 1000,
  kill_timeout: 10000,
});

/**
 * PM2: sempre `java -jar Lavalink.jar` + `--spring.config.additional-location` (cwd = cartella Lavalink).
 * Non usare `interpreter: bash` + `start-lavalink.sh`: dopo reload PM2 può lasciare `interpreter_args` JVM
 * attaccati a bash → `bash: -X: invalid option` e loop di crash.
 */
const lavalinkPm2App = {
  name: "lavalink",
  cwd: path.join(base, "Lavalink"),
  script: path.join(base, "Lavalink", "Lavalink.jar"),
  interpreter: "java",
  // Heap basso: su VPS 4GB Xmx768 riservava troppa RAM anche a idle.
  interpreter_args: "-Xms96m -Xmx384m -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=100 -jar",
  args: "--spring.config.additional-location=optional:file:./",
  instances: 1,
  ...HA_RESTART,
  min_uptime: "45s",
  kill_timeout: 15000,
  max_memory_restart: "550M",
  env: lavalinkEnvFromFile,
};

function mergeNodeOptions(existing, extra) {
  const cur = String(existing || "").trim();
  const add = String(extra || "").trim();
  if (!add) return cur;
  if (!cur) return add;
  const parts = new Set(`${cur} ${add}`.split(/\s+/).filter(Boolean));
  return [...parts].join(" ");
}

function ensurePm2App(name, script, memRestart, extraEnv, nodeOpts, overrides) {
  return {
    name,
    cwd: base,
    script,
    interpreter: nodeInterpreter,
    exec_mode: "fork",
    instances: 1,
    ...HA_RESTART,
    max_memory_restart: memRestart,
    env: {
      NODE_ENV: "production",
      HOST_ROLE: String(botEnvFromFile.HOST_ROLE || "primary"),
      ...botEnvFromFile,
      ...extraEnv,
      NODE_OPTIONS: mergeNodeOptions(botEnvFromFile.NODE_OPTIONS, nodeOpts),
    },
    ...(overrides && typeof overrides === "object" ? overrides : {}),
  };
}

module.exports = {
  apps: [
    lavalinkPm2App,
    ensurePm2App(
      "discadia-votes",
      "Vinyls/Services/Web/discadiaVoteIntakeApp.js",
      "160M",
      { DISCADIA_VOTE_INTAKE_PORT: "3010" },
      "--max-old-space-size=128",
    ),
    ensurePm2App(
      "topgg-votes",
      "Vinyls/Services/Web/topggVoteIntakeApp.js",
      "160M",
      { TOPGG_VOTE_INTAKE_PORT: "3014" },
      "--max-old-space-size=128",
    ),
    ensurePm2App(
      "vote-drain",
      "Vinyls/Services/Web/voteQueueDrainWorkerApp.js",
      "180M",
      { VOTE_QUEUE_WORKER: "1" },
      "--max-old-space-size=140",
    ),
    ensurePm2App(
      "site-api",
      "Vinyls/Services/Web/durableSiteApiApp.js",
      // RSS a idle è già ~290–310M (Express + Mongo + REST Discord + prefix).
      // 280M faceva restart loop: PM2 uccideva il processo appena finito il boot.
      "450M",
      {
        SITE_API_PORT: "3020",
        WEBSITE_CANDIDATURE_HTTP: "1",
        WEBSITE_PUBLIC_HTTP: "1",
        PARTNERSHIP_MIGRATION_EXTERNAL: "1",
      },
      "--max-old-space-size=360",
    ),
    ensurePm2App(
      "partnership-migration",
      "Vinyls/Services/Web/partnershipMigrationWorkerApp.js",
      "180M",
      { PARTNERSHIP_MIGRATION_WORKER: "1" },
      "--max-old-space-size=140",
    ),
    ensurePm2App(
      "bot-scheduler",
      "Vinyls/Services/Web/botSchedulerWorkerApp.js",
      "320M",
      { BOT_SCHEDULER_WORKER: "1" },
      "--max-old-space-size=240",
    ),
    ensurePm2App(
      "auto-backup",
      "Vinyls/Services/Web/autoBackupWorkerApp.js",
      "350M",
      { AUTO_BACKUP_WORKER: "1" },
      "--max-old-space-size=280",
    ),
    ensurePm2App(
      "host-watchdog",
      "deploy/ha/hostWatchdogApp.js",
      "90M",
      {
        HOST_WATCHDOG: "1",
        HOST_WATCHDOG_INTERVAL_MS: "45000",
        HOST_WATCHDOG_FAIL_THRESHOLD: "5",
        HOST_WATCHDOG_COOLDOWN_MS: "300000",
        HOST_WATCHDOG_BOTS_GRACE_MS: "240000",
      },
      "--max-old-space-size=64",
      {
        min_uptime: "10s",
        max_memory_restart: "90M",
      },
    ),
    {
      name: "bots",
      cwd: base,
      script: "wait-for-lavalink.js",
      interpreter: nodeInterpreter,
      exec_mode: "fork",
      instances: 1,
      ...HA_RESTART,
      min_uptime: "45s",
      max_memory_restart: "850M",
      kill_timeout: 15000,
      wait_ready: false,
      env: {
        NODE_ENV: "production",
        HOST_ROLE: String(botEnvFromFile.HOST_ROLE || "primary"),
        ...botEnvFromFile,
        // Worker dedicati: non duplicare su gateway.
        SITE_API_EXTERNAL: "1",
        PARTNERSHIP_MIGRATION_EXTERNAL: "1",
        TOPGG_VOTE_HTTP_EXTERNAL: "1",
        VOTE_QUEUE_EXTERNAL: "1",
        BOT_SCHEDULER_EXTERNAL: "1",
        AUTO_BACKUP_EXTERNAL: "1",
        // Recovery Discord pesanti solo se FULL_STARTUP_SYNC=1 (settimanale / post-outage).
        FULL_STARTUP_SYNC: String(botEnvFromFile.FULL_STARTUP_SYNC || "0"),
        // Pannelli: di default TTL (6h). STARTUP_PANELS=1 forza refresh completo a ogni boot.
        STARTUP_PANELS: String(botEnvFromFile.STARTUP_PANELS || "0"),
        // Override .env: un PUT slash completo a ogni reload costa 20–30s. La cache hash basta.
        FORCE_SLASH_DEPLOY: "0",
        // Economy: max 2 render canvas/GIF concorrenti; frame GIF ridotti sotto i default del codice.
        VC_ECONOMY_RENDER_CONCURRENCY: String(botEnvFromFile.VC_ECONOMY_RENDER_CONCURRENCY || "2"),
        VC_SLOTS_GIF_FRAMES: String(botEnvFromFile.VC_SLOTS_GIF_FRAMES || "16"),
        VC_ROULETTE_GIF_FRAMES: String(botEnvFromFile.VC_ROULETTE_GIF_FRAMES || "14"),
        VC_COINFLIP_GIF_FRAMES: String(botEnvFromFile.VC_COINFLIP_GIF_FRAMES || "16"),
        VC_RPS_GIF_FRAMES: String(botEnvFromFile.VC_RPS_GIF_FRAMES || "20"),
        VC_ROB_GIF_FRAMES: String(botEnvFromFile.VC_ROB_GIF_FRAMES || "16"),
        VC_SCRATCH_GIF_FRAMES: String(botEnvFromFile.VC_SCRATCH_GIF_FRAMES || "18"),
        VC_DUEL_GIF_FRAMES: String(botEnvFromFile.VC_DUEL_GIF_FRAMES || "28"),
        // Cap heap Node (Vinyls+Coffee sotto lo stesso albero PM2).
        NODE_OPTIONS: mergeNodeOptions(botEnvFromFile.NODE_OPTIONS, "--max-old-space-size=700"),
      },
    },
  ],
};
