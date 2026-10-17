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
const nodeInterpreter =
  botEnvFromFile.NODE_BINARY && fs.existsSync(String(botEnvFromFile.NODE_BINARY).trim())
    ? String(botEnvFromFile.NODE_BINARY).trim()
    : "node";

const HA_RESTART = Object.freeze({
  autorestart: true,
  watch: false,
  min_uptime: "20s",
  max_restarts: 40,
  restart_delay: 2500,
  exp_backoff_restart_delay: 1000,
  kill_timeout: 10000,
});

const lavalinkPm2App = {
  name: "lavalink",
  cwd: path.join(base, "Lavalink"),
  script: path.join(base, "Lavalink", "Lavalink.jar"),
  interpreter: "java",
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
    {
      name: "spotify-token-cache",
      cwd: path.join(base, "Lavalink"),
      script: path.join(base, "Lavalink", "spotify-token-cache.js"),
      interpreter: nodeInterpreter,
      exec_mode: "fork",
      instances: 1,
      ...HA_RESTART,
      max_memory_restart: "80M",
      env: {
        NODE_ENV: "production",
        SPOTIFY_TOKEN_UPSTREAM: "http://127.0.0.1:8002/api/token",
        SPOTIFY_TOKEN_CACHE_PORT: "8003",
      },
    },
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
      "620M",
      {
        SITE_API_PORT: "3020",
        WEBSITE_CANDIDATURE_HTTP: "1",
        WEBSITE_PUBLIC_HTTP: "1",
        PARTNERSHIP_MIGRATION_EXTERNAL: "1",
      },
      /* siteApiW4: was 360 — heap pressure under staff+notif caches */
      "--max-old-space-size=512",
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
    ensurePm2App(
      "host-housekeeper",
      "deploy/ha/hostHousekeeperApp.js",
      "110M",
      {
        HOST_HOUSEKEEPER: "1",
        HOST_HOUSEKEEPER_INTERVAL_MS: "60000",
        HOST_HOUSEKEEPER_CLEANUP_MS: "1800000",
        HOST_HOUSEKEEPER_SAT_FAILS: "5",
        HOST_HOUSEKEEPER_REBOOT_COOLDOWN_MS: "21600000",
        HOST_HOUSEKEEPER_SOFT_COOLDOWN_MS: "900000",
        HOST_HOUSEKEEPER_LOAD_MULT: "2.5",
        HOST_HOUSEKEEPER_MEM_PCT: "8",
        HOST_HOUSEKEEPER_DISK_PCT: "92",
        HOST_HOUSEKEEPER_DISK_WARN: "85",
        HOST_HOUSEKEEPER_ALLOW_REBOOT: "1",
      },
      "--max-old-space-size=80",
      {
        min_uptime: "10s",
        max_memory_restart: "110M",
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
                SITE_API_EXTERNAL: "1",
        PARTNERSHIP_MIGRATION_EXTERNAL: "1",
        TOPGG_VOTE_HTTP_EXTERNAL: "1",
        VOTE_QUEUE_EXTERNAL: "1",
        BOT_SCHEDULER_EXTERNAL: "1",
        AUTO_BACKUP_EXTERNAL: "1",
                FULL_STARTUP_SYNC: String(botEnvFromFile.FULL_STARTUP_SYNC || "0"),
                STARTUP_PANELS: String(botEnvFromFile.STARTUP_PANELS || "0"),
                FORCE_SLASH_DEPLOY: "0",
                VC_ECONOMY_RENDER_CONCURRENCY: String(botEnvFromFile.VC_ECONOMY_RENDER_CONCURRENCY || "2"),
        VC_SLOTS_GIF_FRAMES: String(botEnvFromFile.VC_SLOTS_GIF_FRAMES || "16"),
        VC_ROULETTE_GIF_FRAMES: String(botEnvFromFile.VC_ROULETTE_GIF_FRAMES || "14"),
        VC_COINFLIP_GIF_FRAMES: String(botEnvFromFile.VC_COINFLIP_GIF_FRAMES || "16"),
        VC_RPS_GIF_FRAMES: String(botEnvFromFile.VC_RPS_GIF_FRAMES || "20"),
        VC_ROB_GIF_FRAMES: String(botEnvFromFile.VC_ROB_GIF_FRAMES || "16"),
        VC_SCRATCH_GIF_FRAMES: String(botEnvFromFile.VC_SCRATCH_GIF_FRAMES || "18"),
        VC_DUEL_GIF_FRAMES: String(botEnvFromFile.VC_DUEL_GIF_FRAMES || "28"),
                NODE_OPTIONS: mergeNodeOptions(botEnvFromFile.NODE_OPTIONS, "--max-old-space-size=700"),
      },
    },
  ],
};
