#!/usr/bin/env node
/**
 * Host watchdog: ping health HTTP + stato PM2; se un servizio critico resta giù,
 * forza `pm2 restart <name>` (con cooldown + grace boot). Non sostituisce una 2ª VPS.
 */
"use strict";

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");

const INTERVAL_MS = Math.max(15_000, Number(process.env.HOST_WATCHDOG_INTERVAL_MS || 45_000) || 45_000);
const FAIL_THRESHOLD = Math.max(3, Number(process.env.HOST_WATCHDOG_FAIL_THRESHOLD || 5) || 5);
const COOLDOWN_MS = Math.max(120_000, Number(process.env.HOST_WATCHDOG_COOLDOWN_MS || 300_000) || 300_000);
const HOST_ROLE = String(process.env.HOST_ROLE || "primary").trim().toLowerCase();

/** Grace dopo start/restart: non riavviare mentre il processo sta ancora boottando. */
const BOTS_GRACE = Math.max(120_000, Number(process.env.HOST_WATCHDOG_BOTS_GRACE_MS || 240_000) || 240_000);
const BOOT_GRACE_MS = {
  bots: BOTS_GRACE,
  "bots-vinyls": BOTS_GRACE,
  "bots-coffee": BOTS_GRACE,
  "site-api": Math.max(60_000, Number(process.env.HOST_WATCHDOG_SITE_API_GRACE_MS || 90_000) || 90_000),
  lavalink: Math.max(45_000, Number(process.env.HOST_WATCHDOG_LAVALINK_GRACE_MS || 90_000) || 90_000),
  default: Math.max(45_000, Number(process.env.HOST_WATCHDOG_DEFAULT_GRACE_MS || 60_000) || 60_000),
};

const LAVALINK_PASSWORD = String(process.env.LAVALINK_PASSWORD || "youshallnotpass").trim() || "youshallnotpass";

/** @type {{ name: string, kind: 'http'|'tcp', url?: string, host?: string, port?: number, headers?: Record<string,string> }} */
const CHECKS = [
  /* perfP0: health webhook è sul processo Vinyls (LOADER_BOTS=vinyls) */
  { name: "bots-vinyls", kind: "http", url: "http://127.0.0.1:3000/webhooks/health" },
  { name: "site-api", kind: "http", url: "http://127.0.0.1:3020/webhooks/site-api/health" },
  { name: "discadia-votes", kind: "http", url: "http://127.0.0.1:3010/webhooks/discadia/health" },
  { name: "topgg-votes", kind: "http", url: "http://127.0.0.1:3014/webhooks/topgg/health" },
  /* lavalinkAuthHealth1: HTTP /version con Authorization (niente WARN RequestAuthorizationFilter) */
  {
    name: "lavalink",
    kind: "http",
    url: "http://127.0.0.1:2333/version",
    headers: { Authorization: LAVALINK_PASSWORD },
  },
  { name: "mongo", kind: "tcp", host: "127.0.0.1", port: 27017 },
];

const PM2_RESTARTABLE = new Set([
  "bots",
  "bots-vinyls",
  "bots-coffee",
  "site-api",
  "discadia-votes",
  "topgg-votes",
  "lavalink",
  "vote-drain",
  "bot-scheduler",
  "auto-backup",
  "partnership-migration",
]);

const failCounts = new Map();
const lastRestartAt = new Map();

function log(level, msg, extra) {
  const line = `[host-watchdog] [${level}] ${msg}${extra ? ` ${extra}` : ""}`;
  if (level === "error") console.error(line);
  else console.log(line);
}

function bootGraceMs(name) {
  return BOOT_GRACE_MS[name] != null ? BOOT_GRACE_MS[name] : BOOT_GRACE_MS.default;
}

function httpGetOk(url, timeoutMs = 8000, headers = null) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    try {
      const req = http.get(url, { timeout: timeoutMs, headers: headers || undefined }, (res) => {
        res.resume();
        /* lavalink /version: solo 2xx = sano (401 = password sbagliata / manca auth) */
        done(res.statusCode >= 200 && res.statusCode < 300);
      });
      req.on("timeout", () => {
        req.destroy();
        done(false);
      });
      req.on("error", () => done(false));
    } catch (_) {
      done(false);
    }
  });
}

function tcpOk(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

function runPm2(args) {
  return new Promise((resolve) => {
    const child = spawn("pm2", args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => {
      out += String(d);
    });
    child.stderr.on("data", (d) => {
      err += String(d);
    });
    child.on("error", (e) => resolve({ code: 1, out, err: e.message || String(e) }));
    child.on("close", (code) => resolve({ code: code || 0, out, err }));
  });
}

async function pm2InfoMap() {
  const res = await runPm2(["jlist"]);
  if (res.code !== 0) return null;
  try {
    const list = JSON.parse(res.out || "[]");
    const map = new Map();
    for (const p of list) {
      const name = String(p?.name || "");
      if (!name) continue;
      const status = String(p?.pm2_env?.status || "unknown");
      const created = Number(p?.pm2_env?.created_at || p?.pm2_env?.pm_uptime || 0) || 0;
      const uptimeMs = created > 0 ? Math.max(0, Date.now() - created) : 0;
      map.set(name, { status, uptimeMs });
    }
    return map;
  } catch (_) {
    return null;
  }
}

function isInBootGrace(name, info) {
  if (!info || info.status !== "online") return false;
  const grace = bootGraceMs(name);
  return Number(info.uptimeMs || 0) < grace;
}

async function maybeRestart(name, reason, info) {
  if (!PM2_RESTARTABLE.has(name)) {
    log("warn", `down but not restartable via PM2: ${name}`, reason);
    return;
  }
  if (isInBootGrace(name, info)) {
    log("info", `skip restart ${name} (boot grace ${Math.round(bootGraceMs(name) / 1000)}s)`, reason);
    return;
  }
  const now = Date.now();
  const last = lastRestartAt.get(name) || 0;
  if (now - last < COOLDOWN_MS) {
    log("info", `skip restart ${name} (cooldown)`, reason);
    return;
  }
  lastRestartAt.set(name, now);
  log("warn", `restarting ${name}`, reason);
  // MAI --update-env: eredita NODE_OPTIONS sbagliati dalla shell/CLI (es. heap 64 del watchdog).
  const res = await runPm2(["restart", name]);
  if (res.code !== 0) log("error", `pm2 restart ${name} failed`, res.err || res.out);
  else log("info", `pm2 restart ${name} ok`);
}

async function tick() {
  const pm2 = await pm2InfoMap();
  for (const check of CHECKS) {
    const info = pm2?.get(check.name) || null;
    let ok = false;
    if (check.kind === "http") ok = await httpGetOk(check.url, 8000, check.headers || null);
    else if (check.kind === "tcp") ok = await tcpOk(check.host, check.port);

    if (info && check.name !== "mongo") {
      if (info.status !== "online") ok = false;
      // Processo online ma ancora in boot: non contare come fail.
      else if (!ok && isInBootGrace(check.name, info)) {
        log("info", `${check.name} still booting (uptime ${Math.round(info.uptimeMs / 1000)}s)`);
        failCounts.set(check.name, 0);
        continue;
      }
    }

    const prev = failCounts.get(check.name) || 0;
    if (ok) {
      if (prev > 0) log("info", `${check.name} recovered`);
      failCounts.set(check.name, 0);
      continue;
    }

    const next = prev + 1;
    failCounts.set(check.name, next);
    log("warn", `${check.name} unhealthy (${next}/${FAIL_THRESHOLD})`);
    if (next >= FAIL_THRESHOLD) {
      await maybeRestart(check.name, `failed_${next}_checks`, info);
      failCounts.set(check.name, 0);
    }
  }

  if (pm2) {
    for (const name of ["vote-drain", "bot-scheduler", "auto-backup", "partnership-migration"]) {
      const info = pm2.get(name);
      if (!info || info.status === "online") {
        failCounts.set(name, 0);
        continue;
      }
      if (isInBootGrace(name, info)) {
        failCounts.set(name, 0);
        continue;
      }
      const next = (failCounts.get(name) || 0) + 1;
      failCounts.set(name, next);
      log("warn", `${name} pm2 status=${info.status} (${next}/${FAIL_THRESHOLD})`);
      if (next >= FAIL_THRESHOLD) {
        await maybeRestart(name, `pm2_${info.status}`, info);
        failCounts.set(name, 0);
      }
    }
  }
}

async function main() {
  log(
    "info",
    `started role=${HOST_ROLE} interval=${INTERVAL_MS}ms threshold=${FAIL_THRESHOLD} cooldown=${COOLDOWN_MS}ms botsGrace=${BOOT_GRACE_MS.bots}ms`,
  );
  if (HOST_ROLE === "standby") {
    log("warn", "HOST_ROLE=standby: watchdog attivo ma i bot Discord non devono essere online su questo host");
  }
  const loop = async () => {
    try {
      await tick();
    } catch (err) {
      log("error", "tick failed", err?.message || String(err));
    }
  };
  await loop();
  setInterval(loop, INTERVAL_MS);
}

main().catch((err) => {
  log("error", "fatal", err?.message || String(err));
  process.exit(1);
});
