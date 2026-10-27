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
    /* perfP0: heap Lavalink più stretto (ex 384/550) */
    interpreter_args: "-Xms64m -Xmx320m -XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=100 -jar",
  args: "--spring.config.additional-location=optional:file:./",
  instances: 1,
  ...HA_RESTART,
  min_uptime: "45s",
  kill_timeout: 15000,
  max_memory_restart: "420M",
  env: lavalinkEnvFromFile,
};

function makeBotsApp(name, loaderBots, memRestart, nodeHeapMb) {
  return {
    name,
    cwd: base,
    script: "wait-for-lavalink.js",
    interpreter: nodeInterpreter,
    exec_mode: "fork",
    instances: 1,
    ...HA_RESTART,
    min_uptime: "45s",
    max_memory_restart: memRestart,
    kill_timeout: 15000,
    wait_ready: false,
    env: {
      NODE_ENV: "production",
      HOST_ROLE: String(botEnvFromFile.HOST_ROLE || "primary"),
      ...botEnvFromFile,
      LOADER_BOTS: loaderBots,
      SITE_API_EXTERNAL: "1",
      PARTNERSHIP_MIGRATION_EXTERNAL: "1",
      TOPGG_VOTE_HTTP_EXTERNAL: "1",
      VOTE_QUEUE_EXTERNAL: "1",
      BOT_SCHEDULER_EXTERNAL: "1",
      AUTO_BACKUP_EXTERNAL: "1",
      COMMUNITY_POLL_EXTERNAL: "1",
      FULL_STARTUP_SYNC: String(botEnvFromFile.FULL_STARTUP_SYNC || "0"),
      STARTUP_PANELS: String(botEnvFromFile.STARTUP_PANELS || "0"),
      FORCE_SLASH_DEPLOY: "0",
      /* perfP2: mai git/npm dal loader in prod */
      ENABLE_LOADER_GIT_PULL: "0",
      ENABLE_LOADER_NPM_INSTALL: "0",
      VC_VOICE_PCM_RING_SEC: String(botEnvFromFile.VC_VOICE_PCM_RING_SEC || "20"),
      VC_ACTIVITY_CANVAS_GIF: String(botEnvFromFile.VC_ACTIVITY_CANVAS_GIF || "0"),
      VC_MUSIC_QUEUE_SNAPSHOT_MS: String(botEnvFromFile.VC_MUSIC_QUEUE_SNAPSHOT_MS || "30000"),
      VC_MINIGAME_TICK_MS: String(botEnvFromFile.VC_MINIGAME_TICK_MS || "30000"),
      VC_MONGO_POOL_SIZE: String(botEnvFromFile.VC_MONGO_POOL_SIZE || "6"),
      /* residuo1: profilo activity senza nested daily/hourly */
      ACTIVITY_DAILY_STORAGE_MODE: String(botEnvFromFile.ACTIVITY_DAILY_STORAGE_MODE || "compact"),
      ACTIVITY_HOURLY_STORAGE_MODE: String(botEnvFromFile.ACTIVITY_HOURLY_STORAGE_MODE || "compact"),
      LOOP_STAGGER_MS: String(botEnvFromFile.LOOP_STAGGER_MS || "400"),
      VC_ALERT_LOOPS_DELAY_MS: String(botEnvFromFile.VC_ALERT_LOOPS_DELAY_MS || "90000"),
      LIVE_VOICE_EXP_INTERVAL_MS: String(botEnvFromFile.LIVE_VOICE_EXP_INTERVAL_MS || "45000"),
      LIVE_VOICE_EXP_BATCH_SIZE: String(botEnvFromFile.LIVE_VOICE_EXP_BATCH_SIZE || "50"),
      VC_VOICE_AUDIT_ATTEMPTS: String(botEnvFromFile.VC_VOICE_AUDIT_ATTEMPTS || "1"),
      LAVALINK_MUSIC_WAIT_MS: String(botEnvFromFile.LAVALINK_MUSIC_WAIT_MS || "20000"),
      /* perfP0: canvas meno paralleli / meno frame GIF */
      VC_ECONOMY_RENDER_CONCURRENCY: String(botEnvFromFile.VC_ECONOMY_RENDER_CONCURRENCY || "1"),
      VC_SLOTS_GIF_FRAMES: String(botEnvFromFile.VC_SLOTS_GIF_FRAMES || "14"),
      VC_ROULETTE_GIF_FRAMES: String(botEnvFromFile.VC_ROULETTE_GIF_FRAMES || "12"),
      VC_COINFLIP_GIF_FRAMES: String(botEnvFromFile.VC_COINFLIP_GIF_FRAMES || "14"),
      VC_RPS_GIF_FRAMES: String(botEnvFromFile.VC_RPS_GIF_FRAMES || "16"),
      VC_ROB_GIF_FRAMES: String(botEnvFromFile.VC_ROB_GIF_FRAMES || "14"),
      VC_SCRATCH_GIF_FRAMES: String(botEnvFromFile.VC_SCRATCH_GIF_FRAMES || "16"),
      VC_DUEL_GIF_FRAMES: String(botEnvFromFile.VC_DUEL_GIF_FRAMES || "22"),
      VC_SHIP_GIF_FRAMES: String(botEnvFromFile.VC_SHIP_GIF_FRAMES || "18"),
      NODE_OPTIONS: mergeNodeOptions(
        botEnvFromFile.NODE_OPTIONS,
        `--max-old-space-size=${nodeHeapMb}`,
      ),
    },
  };
}

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
        VC_SITE_VOTE_WARM_MS: String(botEnvFromFile.VC_SITE_VOTE_WARM_MS || "60000"),
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
      "community-poll",
      "Vinyls/Services/Web/communityPollWorkerApp.js",
      "280M",
      {
        COMMUNITY_POLL_WORKER: "1",
        COMMUNITY_POLL_EXTERNAL: "1",
        LIVE_VOICE_EXP_INTERVAL_MS: String(botEnvFromFile.LIVE_VOICE_EXP_INTERVAL_MS || "45000"),
        LIVE_VOICE_EXP_BATCH_SIZE: String(botEnvFromFile.LIVE_VOICE_EXP_BATCH_SIZE || "50"),
      },
      "--max-old-space-size=220",
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
    /* perfP0: Vinyls e Coffee in processi separati (heap isolato) */
    makeBotsApp("bots-vinyls", "vinyls", "720M", 580),
    makeBotsApp("bots-coffee", "coffee", "420M", 320),
  ],
};
