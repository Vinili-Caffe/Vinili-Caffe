const net = require("net") as typeof import("net");
const { spawn, spawnSync } = require("child_process") as typeof import("child_process");
const path = require("path") as typeof import("path");

const raw = (process.env.LAVALINK_HOST || "127.0.0.1:2333").trim().replace(/^https?:\/\//i, "");
const lastColon = raw.lastIndexOf(":");
const host = lastColon > 0 ? raw.slice(0, lastColon) : raw;
const port = parseInt(lastColon > 0 ? raw.slice(lastColon + 1) : "2333", 10) || 2333;
const intervalMs = 2000;
const blockUntilReady = String(process.env.LAVALINK_BLOCK_STARTUP || "").trim() === "1";
const settleMs = Math.max(0, Number(process.env.LAVALINK_SETTLE_MS || (blockUntilReady ? 4000 : 3000)) || 0);
let loaderChild = null;
let stopping = false;
let lavalinkReady = false;
let settleTimer = null;
let lavalinkUnavailableLogged = false;
let lastLavalinkUnavailableLogAt = 0;
const LAVALINK_UNAVAIL_LOG_COOLDOWN_MS = 5 * 60 * 1000;
let loaderStarted = false;

function killChildTree(pid?) {
  if (!pid || Number.isNaN(pid)) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
      return;
    }
    process.kill(pid, "SIGTERM");
  } catch (_) {}
}

function requestStop(exitCode = 0, reason = "") {
  if (stopping) return;
  stopping = true;
  if (reason) {
    console.log("[wait-for-lavalink] Arresto: " + reason);
  }
  if (loaderChild?.pid) {
    killChildTree(loaderChild.pid);
    setTimeout(() => process.exit(exitCode), 1500);
    return;
  }
  process.exit(exitCode);
}

function checkTcp() {
  return new Promise((resolve?) => {
    const socket = net.connect({ host, port });
    let settled = false;

    const finish = (ok?) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {}
      resolve(ok);
    };

    socket.setTimeout(5000);
    socket.on("connect", () => finish(true));
    socket.on("error", () => finish(false));
    socket.on("timeout", () => finish(false));
  });
}

async function checkHttpReady() {
  const password = process.env.LAVALINK_PASSWORD || "youshallnotpass";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`http://${host}:${port}/version`, {
      headers: { Authorization: password },
      signal: ctrl.signal,
    });
    return Boolean(res?.ok);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function check() {
  if (!(await checkTcp())) return false;
  return checkHttpReady();
}

function runLoader() {
  if (loaderChild?.pid || loaderStarted) return;
  loaderStarted = true;
  const node = process.execPath || "node";
  const loader = path.join(__dirname, "loader.js");
  console.log("[wait-for-lavalink] Esecuzione: " + node + " loader.js");
  loaderChild = spawn(node, ["--disable-warning=ExperimentalWarning", loader], {
    cwd: __dirname,
    stdio: ["inherit", "pipe", "pipe"],
    env: {
      ...process.env,
      /* perfP1: Shoukaku non riattende 90s se il wrapper ha già visto Lavalink up */
      LAVALINK_ALREADY_WAITED: lavalinkReady ? "1" : String(process.env.LAVALINK_ALREADY_WAITED || "0"),
    },
  });
  loaderChild.stdout.pipe(process.stdout);
  loaderChild.stderr.pipe(process.stderr);
  loaderChild.on("exit", (code?) => {
    loaderChild = null;
    process.exit(code != null ? code : 0);
  });
}

function scheduleNextCheck(delayMs = intervalMs) {
  if (stopping) return;
  setTimeout(checkLavalinkStatus, delayMs);
}

function checkLavalinkStatus() {
  if (stopping) return;
  check().then((ok?) => {
    if (!ok) {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      {
        const now = Date.now();
        const shouldLog =
          (lavalinkReady || !lavalinkUnavailableLogged) &&
          now - lastLavalinkUnavailableLogAt >= LAVALINK_UNAVAIL_LOG_COOLDOWN_MS;
        lavalinkReady = false;
        lavalinkUnavailableLogged = true;
        if (shouldLog) {
          lastLavalinkUnavailableLogAt = now;
          console.warn("[wait-for-lavalink] Lavalink non raggiungibile al momento. Il backend resta attivo, la musica no.");
        }
      }
      if (!blockUntilReady && !loaderStarted) runLoader();
      scheduleNextCheck(intervalMs);
      return;
    }
    if (lavalinkReady || settleTimer) {
      if (!blockUntilReady && !loaderStarted) runLoader();
      scheduleNextCheck(intervalMs);
      return;
    }
    if (settleMs <= 0) {
      lavalinkReady = true;
      lavalinkUnavailableLogged = false;
      console.log("[wait-for-lavalink] Lavalink raggiungibile.");
      if (!loaderStarted) runLoader();
      scheduleNextCheck(intervalMs);
      return;
    }
    console.log("[wait-for-lavalink] Lavalink raggiungibile, attendo " + settleMs / 1000 + "s (stabilizzazione JVM)...");
    settleTimer = setTimeout(() => {
      settleTimer = null;
      check().then((stillOk?) => {
        if (!stillOk) {
          if (!blockUntilReady && !loaderStarted) runLoader();
          scheduleNextCheck(intervalMs);
          return;
        }
        lavalinkReady = true;
        lavalinkUnavailableLogged = false;
        console.log("[wait-for-lavalink] Lavalink pronto.");
        if (!loaderStarted) runLoader();
        scheduleNextCheck(intervalMs);
      });
    }, settleMs);
  });
}

if (blockUntilReady) {
  console.log(
    "[wait-for-lavalink] Controllo Lavalink su " +
      host +
      ":" +
      port +
      "; il backend parte solo dopo il primo check TCP OK (LAVALINK_BLOCK_STARTUP=1).",
  );
} else {
  console.log(
    "[wait-for-lavalink] Avvio immediato del backend; Lavalink su " +
      host +
      ":" +
      port +
      " viene monitorato in background (musica si collega quando pronto).",
  );
  runLoader();
}

["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"].forEach((signalName?) => {
  process.on(signalName, () => requestStop(0, "segnale " + signalName + " ricevuto"));
});

process.on("exit", () => {
  if (settleTimer) clearTimeout(settleTimer);
  if (loaderChild?.pid) killChildTree(loaderChild.pid);
});

checkLavalinkStatus();
