#!/usr/bin/env node
/**
 * Host housekeeper: tiene la VPS pulita e reagisce alla saturazione.
 *
 * - Cleanup periodico: /tmp deploy morti, journal, apt cache, log PM2, docker exited,
 *   cache browser/pip inutili, zombie report.
 * - Saturazione (CPU/RAM/disk): soft mitigate → restart PM2 pesanti → reboot di emergenza
 *   solo dopo soglie sostenute + cooldown (default 6h).
 *
 * Non sostituisce host-watchdog (health servizi). Affiancalo.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");

const INTERVAL_MS = Math.max(20_000, Number(process.env.HOST_HOUSEKEEPER_INTERVAL_MS || 60_000) || 60_000);
const CLEANUP_EVERY_MS = Math.max(
  5 * 60_000,
  Number(process.env.HOST_HOUSEKEEPER_CLEANUP_MS || 30 * 60_000) || 30 * 60_000,
);
const SAT_FAIL_THRESHOLD = Math.max(3, Number(process.env.HOST_HOUSEKEEPER_SAT_FAILS || 5) || 5);
const REBOOT_COOLDOWN_MS = Math.max(
  60 * 60_000,
  Number(process.env.HOST_HOUSEKEEPER_REBOOT_COOLDOWN_MS || 6 * 60 * 60_000) || 6 * 60 * 60_000,
);
const SOFT_COOLDOWN_MS = Math.max(
  5 * 60_000,
  Number(process.env.HOST_HOUSEKEEPER_SOFT_COOLDOWN_MS || 15 * 60_000) || 15 * 60_000,
);
const LOAD_MULT = Math.max(1.5, Number(process.env.HOST_HOUSEKEEPER_LOAD_MULT || 2.5) || 2.5);
const MEM_AVAIL_PCT_CRIT = Math.min(20, Math.max(3, Number(process.env.HOST_HOUSEKEEPER_MEM_PCT || 8) || 8));
const DISK_PCT_CRIT = Math.min(98, Math.max(85, Number(process.env.HOST_HOUSEKEEPER_DISK_PCT || 92) || 92));
const DISK_PCT_WARN = Math.min(DISK_PCT_CRIT - 1, Math.max(75, Number(process.env.HOST_HOUSEKEEPER_DISK_WARN || 85) || 85));
/* diskWarnSpamFix1: non loggare/cleanup-spam ogni tick se il disco resta sopra warn */
const DISK_WARN_COOLDOWN_MS = Math.max(
  5 * 60_000,
  Number(process.env.HOST_HOUSEKEEPER_DISK_WARN_COOLDOWN_MS || 20 * 60_000) || 20 * 60_000,
);
const TMP_VC_MAX_AGE_MS = Math.max(
  2 * 60 * 60_000,
  Number(process.env.HOST_HOUSEKEEPER_TMP_AGE_MS || 6 * 60 * 60_000) || 6 * 60 * 60_000,
);
const ALLOW_REBOOT = String(process.env.HOST_HOUSEKEEPER_ALLOW_REBOOT || "1").trim() !== "0";
const STATE_DIR = String(process.env.HOST_HOUSEKEEPER_STATE_DIR || "/var/lib/vc-housekeeper").trim();
const LOG_FILE = String(process.env.HOST_HOUSEKEEPER_LOG || "/var/log/vc-housekeeper.log").trim();

const KEEP_TMP_NAMES = new Set(["vc_pw_venv", "hsperfdata_root", "snap-private-tmp"]);

const HEAVY_PM2 = ["bots", "site-api", "lavalink"];

let satFails = 0;
let lastSoftAt = 0;
let lastCleanupAt = 0;
let lastRebootAt = 0;
let lastDiskWarnAt = 0;
let cleaning = false;
let mitigating = false;

function stamp() {
  return new Date().toISOString();
}

function log(level, msg, extra) {
  const line = `[host-housekeeper] [${level}] ${msg}${extra ? ` ${extra}` : ""}`;
  if (level === "error") console.error(line);
  else console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, `${stamp()} ${line}\n`, "utf8");
  } catch (_) {}
}

function ensureDirs() {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch (_) {}
  try {
    if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "", "utf8");
  } catch (_) {}
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      ...opts,
    });
    let out = "";
    let err = "";
    const t = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch (_) {}
    }, opts.timeoutMs || 120_000);
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(t);
      resolve({ code: 1, out, err: e.message || String(e) });
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code || 0, out, err });
    });
  });
}

function sh(script, timeoutMs = 120_000) {
  return run("bash", ["-lc", script], { timeoutMs });
}

function readLastReboot() {
  try {
    const p = path.join(STATE_DIR, "last-reboot.json");
    if (!fs.existsSync(p)) return 0;
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return Number(j.at || 0) || 0;
  } catch (_) {
    return 0;
  }
}

function writeLastReboot(reason, metrics) {
  try {
    const p = path.join(STATE_DIR, "last-reboot.json");
    fs.writeFileSync(
      p,
      JSON.stringify({ at: Date.now(), iso: stamp(), reason, metrics }, null, 2),
      "utf8",
    );
  } catch (e) {
    log("error", "write last-reboot failed", e.message || String(e));
  }
}

function memMetrics() {
  const total = os.totalmem();
  const free = os.freemem();
  let available = free;
  try {
    const txt = fs.readFileSync("/proc/meminfo", "utf8");
    const m = txt.match(/^MemAvailable:\s+(\d+)\s+kB/m);
    if (m) available = Number(m[1]) * 1024;
  } catch (_) {}
  const availPct = total > 0 ? (available / total) * 100 : 100;
  let swapTotal = 0;
  let swapFree = 0;
  try {
    const txt = fs.readFileSync("/proc/meminfo", "utf8");
    const st = txt.match(/^SwapTotal:\s+(\d+)\s+kB/m);
    const sf = txt.match(/^SwapFree:\s+(\d+)\s+kB/m);
    if (st) swapTotal = Number(st[1]) * 1024;
    if (sf) swapFree = Number(sf[1]) * 1024;
  } catch (_) {}
  const swapUsedPct = swapTotal > 0 ? ((swapTotal - swapFree) / swapTotal) * 100 : 0;
  return { total, available, availPct, swapTotal, swapUsedPct };
}

function loadMetrics() {
  const cpus = Math.max(1, os.cpus()?.length || 1);
  const [l1, l5, l15] = os.loadavg();
  return { cpus, l1, l5, l15, loadRatio: l1 / cpus };
}

function diskMetrics(mount = "/") {
  return new Promise((resolve) => {
    execFile("df", ["-P", mount], { timeout: 8000 }, (err, stdout) => {
      if (err) return resolve({ mount, pct: 0, availKb: 0, ok: false });
      const lines = String(stdout || "")
        .trim()
        .split(/\n/);
      const row = lines[lines.length - 1] || "";
      const parts = row.split(/\s+/);
      // Filesystem 1024-blocks Used Available Capacity Mounted
      const availKb = Number(parts[3]) || 0;
      const cap = String(parts[4] || "").replace("%", "");
      const pct = Number(cap) || 0;
      resolve({ mount, pct, availKb, ok: true });
    });
  });
}

function rmTreeSafe(target) {
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 2 });
    return true;
  } catch (_) {
    return false;
  }
}

function ageMs(p) {
  try {
    return Date.now() - fs.statSync(p).mtimeMs;
  } catch (_) {
    return 0;
  }
}

async function cleanupTmp() {
  let removed = 0;
  const tmp = "/tmp";
  let entries = [];
  try {
    entries = fs.readdirSync(tmp);
  } catch (_) {
    return 0;
  }
  for (const name of entries) {
    if (KEEP_TMP_NAMES.has(name)) continue;
    if (name.startsWith("systemd-private-")) continue;
    const full = path.join(tmp, name);
    const isVcDeploy = /^vc_20\d{6}/.test(name) || name.startsWith("_tmp_") || /^vc_.*\.(png|jpg|webp)$/.test(name);
    const isOldVc = name.startsWith("vc_") && name !== "vc_pw_venv";
    if (!isVcDeploy && !isOldVc && !name.startsWith("undertow") && !name.startsWith("puppeteer_dev_")) continue;
    // deploy tmp: 90m under disk pressure / 6h normal; screenshot: 12h
    const maxAge = /^vc_.*\.(png|jpg|webp)$/.test(name)
      ? 12 * 60 * 60_000
      : /^vc_20\d{6}/.test(name) || name.startsWith("_tmp_")
        ? Math.min(TMP_VC_MAX_AGE_MS, 90 * 60_000)
        : TMP_VC_MAX_AGE_MS;
    if (ageMs(full) < maxAge) continue;
    if (rmTreeSafe(full)) removed += 1;
  }
  return removed;
}

async function cleanupCaches() {
  const actions = [];
  // journal
  actions.push(await sh("journalctl --vacuum-size=180M --vacuum-time=7d >/dev/null 2>&1 || true"));
  // apt
  actions.push(await sh("apt-get clean >/dev/null 2>&1 || true; apt-get autoclean -y >/dev/null 2>&1 || true"));
  // chrome / pip caches (safe)
  for (const p of [
    "/root/.cache/google-chrome-headless",
    "/root/.cache/mesa_shader_cache",
    "/root/.cache/pip",
  ]) {
    if (fs.existsSync(p) && ageMs(p) > 7 * 24 * 60 * 60_000) rmTreeSafe(p);
  }
  // npm cache (large) — keep if recently used < 3d
  try {
    const npmCache = "/root/.npm/_cacache";
    if (fs.existsSync(npmCache) && ageMs(npmCache) > 5 * 24 * 60 * 60_000) {
      await sh("npm cache clean --force >/dev/null 2>&1 || true");
    }
  } catch (_) {}
  // docker: only exited containers + dangling images (never volumes / running)
  actions.push(await sh("docker container prune -f >/dev/null 2>&1 || true"));
  actions.push(await sh("docker image prune -f >/dev/null 2>&1 || true"));
  actions.push(await sh("docker builder prune -f --filter until=168h >/dev/null 2>&1 || true"));
  return actions.length;
}

async function cleanupPm2Logs() {
  const logDir = "/root/.pm2/logs";
  let trimmed = 0;
  try {
    if (!fs.existsSync(logDir)) return 0;
    for (const name of fs.readdirSync(logDir)) {
      const full = path.join(logDir, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch (_) {
        continue;
      }
      if (!st.isFile()) continue;
      // > 40MB → truncate keep last ~2MB
      if (st.size > 40 * 1024 * 1024) {
        await sh(
          `tail -c 2M ${JSON.stringify(full)} > ${JSON.stringify(full + ".trim")} && mv ${JSON.stringify(full + ".trim")} ${JSON.stringify(full)}`,
        );
        trimmed += 1;
      }
    }
  } catch (_) {}
  return trimmed;
}

async function reapZombiesReport() {
  try {
    const res = await sh("ps -eo pid,ppid,state,cmd | awk '$3 ~ /Z/ {print}' | head -40");
    const lines = String(res.out || "")
      .trim()
      .split(/\n/)
      .filter(Boolean);
    if (lines.length) log("warn", `zombies=${lines.length}`, lines.slice(0, 5).join(" | "));
    return lines.length;
  } catch (_) {
    return 0;
  }
}

async function dropPageCache() {
  // Solo sotto pressione: libera buff/cache senza killare processi
  await sh("sync; echo 3 > /proc/sys/vm/drop_caches");
}

async function runCleanup(reason) {
  if (cleaning) return;
  cleaning = true;
  try {
    const tmpN = await cleanupTmp();
    await cleanupCaches();
    const logsN = await cleanupPm2Logs();
    const z = await reapZombiesReport();
    lastCleanupAt = Date.now();
    log("info", `cleanup done reason=${reason}`, `tmpRemoved=${tmpN} logsTrimmed=${logsN} zombies=${z}`);
    try {
      fs.writeFileSync(
        path.join(STATE_DIR, "last-cleanup.json"),
        JSON.stringify({ at: Date.now(), iso: stamp(), reason, tmpN, logsN, z }, null, 2),
      );
    } catch (_) {}
  } catch (e) {
    log("error", "cleanup failed", e.message || String(e));
  } finally {
    cleaning = false;
  }
}

async function softMitigate(reason, metrics) {
  if (mitigating) return;
  const now = Date.now();
  if (now - lastSoftAt < SOFT_COOLDOWN_MS) {
    log("info", "skip soft mitigate (cooldown)", reason);
    return;
  }
  mitigating = true;
  lastSoftAt = now;
  try {
    log("warn", `soft mitigate: ${reason}`, JSON.stringify(metrics));
    await runCleanup(`sat:${reason}`);
    await dropPageCache();
    // Restart heavy PM2 one by one with short gaps (watchdog has grace)
    for (const name of HEAVY_PM2) {
      const r = await run("pm2", ["restart", name], { timeoutMs: 60_000 });
      log(r.code === 0 ? "info" : "error", `pm2 restart ${name}`, r.code === 0 ? "ok" : r.err || r.out);
      await new Promise((r) => setTimeout(r, 4000));
    }
  } catch (e) {
    log("error", "soft mitigate failed", e.message || String(e));
  } finally {
    mitigating = false;
  }
}

async function emergencyReboot(reason, metrics) {
  if (!ALLOW_REBOOT) {
    log("error", "reboot blocked by HOST_HOUSEKEEPER_ALLOW_REBOOT=0", reason);
    return;
  }
  const now = Date.now();
  lastRebootAt = lastRebootAt || readLastReboot();
  if (now - lastRebootAt < REBOOT_COOLDOWN_MS) {
    log("warn", "reboot skipped (cooldown)", reason);
    return;
  }
  writeLastReboot(reason, metrics);
  lastRebootAt = now;
  log("error", `EMERGENCY REBOOT in 8s: ${reason}`, JSON.stringify(metrics));
  await sh("sync");
  // wall message if available
  await sh(`echo "vc-housekeeper reboot: ${reason}" | wall 2>/dev/null || true`);
  setTimeout(() => {
    spawn("shutdown", ["-r", "now", `vc-housekeeper:${reason}`], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }, 8000);
}

async function evaluateSaturation() {
  const load = loadMetrics();
  const mem = memMetrics();
  const disk = await diskMetrics("/");
  const metrics = {
    load1: Number(load.l1.toFixed(2)),
    loadRatio: Number(load.loadRatio.toFixed(2)),
    memAvailPct: Number(mem.availPct.toFixed(1)),
    swapUsedPct: Number(mem.swapUsedPct.toFixed(1)),
    diskPct: disk.pct,
  };

  const cpuSat = load.loadRatio >= LOAD_MULT && load.l5 >= load.cpus * (LOAD_MULT * 0.75);
  const memSat = mem.availPct <= MEM_AVAIL_PCT_CRIT || mem.swapUsedPct >= 92;
  const diskSat = disk.ok && disk.pct >= DISK_PCT_CRIT;
  const diskWarn = disk.ok && disk.pct >= DISK_PCT_WARN;

  if (diskWarn && !diskSat) {
    const now = Date.now();
    if (now - lastDiskWarnAt >= DISK_WARN_COOLDOWN_MS) {
      lastDiskWarnAt = now;
      log("warn", "disk high — cleanup", `pct=${disk.pct}`);
      await runCleanup("disk_warn");
    }
  }

  const critical = cpuSat || memSat || diskSat;
  if (!critical) {
    if (satFails > 0) log("info", "saturation recovered", JSON.stringify(metrics));
    satFails = 0;
    return { critical: false, metrics };
  }

  satFails += 1;
  const reasons = [];
  if (cpuSat) reasons.push("cpu");
  if (memSat) reasons.push("mem");
  if (diskSat) reasons.push("disk");
  const reason = reasons.join("+");
  log("warn", `saturated ${reason} (${satFails}/${SAT_FAIL_THRESHOLD})`, JSON.stringify(metrics));

  if (satFails === 1 || satFails === Math.ceil(SAT_FAIL_THRESHOLD / 2)) {
    await softMitigate(reason, metrics);
  }

  if (satFails >= SAT_FAIL_THRESHOLD) {
    // Ultimo soft, poi reboot
    await softMitigate(`${reason}:pre-reboot`, metrics);
    await new Promise((r) => setTimeout(r, 12_000));
    // Re-check: se dopo soft siamo ok, non rebootare
    const mem2 = memMetrics();
    const load2 = loadMetrics();
    const disk2 = await diskMetrics("/");
    const still =
      (load2.loadRatio >= LOAD_MULT && load2.l5 >= load2.cpus * (LOAD_MULT * 0.7)) ||
      mem2.availPct <= MEM_AVAIL_PCT_CRIT ||
      (disk2.ok && disk2.pct >= DISK_PCT_CRIT);
    if (still) {
      satFails = 0;
      await emergencyReboot(reason, {
        ...metrics,
        afterSoft: {
          loadRatio: Number(load2.loadRatio.toFixed(2)),
          memAvailPct: Number(mem2.availPct.toFixed(1)),
          diskPct: disk2.pct,
        },
      });
    } else {
      satFails = 0;
      log("info", "soft mitigate cleared saturation — no reboot", JSON.stringify({
        loadRatio: load2.loadRatio,
        memAvailPct: mem2.availPct,
        diskPct: disk2.pct,
      }));
    }
  }

  return { critical: true, metrics };
}

async function tick() {
  const now = Date.now();
  if (!lastCleanupAt || now - lastCleanupAt >= CLEANUP_EVERY_MS) {
    await runCleanup("schedule");
  }
  await evaluateSaturation();
}

async function main() {
  ensureDirs();
  lastRebootAt = readLastReboot();
  log(
    "info",
    `started interval=${INTERVAL_MS}ms cleanupEvery=${CLEANUP_EVERY_MS}ms satFails=${SAT_FAIL_THRESHOLD} rebootCooldown=${REBOOT_COOLDOWN_MS}ms allowReboot=${ALLOW_REBOOT ? 1 : 0}`,
  );
  await runCleanup("boot");
  const loop = async () => {
    try {
      await tick();
    } catch (e) {
      log("error", "tick failed", e.message || String(e));
    }
  };
  await loop();
  setInterval(loop, INTERVAL_MS);
}

main().catch((err) => {
  log("error", "fatal", err?.message || String(err));
  process.exit(1);
});
