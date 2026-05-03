const net = require("net");
const { spawn, spawnSync } = require("child_process");
const path = require("path");

const raw = (process.env.LAVALINK_HOST || "127.0.0.1:2333").trim().replace(/^https?:\/\//i, "");
const lastColon = raw.lastIndexOf(":");
const host = lastColon > 0 ? raw.slice(0, lastColon) : raw;
const port = parseInt(lastColon > 0 ? raw.slice(lastColon + 1) : "2333", 10) || 2333;
const intervalMs = 2000;
const settleMs = 4000;
let loaderChild = null;
let stopping = false;
let lavalinkReady = false;
let settleTimer = null;
let lavalinkUnavailableLogged = false;
let loaderStarted = false;

function killChildTree(pid) {
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

function check() {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let settled = false;

    const finish = (ok) => {
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

function runLoader() {
  if (loaderChild?.pid) return;
  const node = process.execPath || "node";
  const loader = path.join(__dirname, "loader.js");
  console.log("[wait-for-lavalink] Esecuzione: " + node + " loader.js");
  loaderChild = spawn(node, ["--disable-warning=ExperimentalWarning", loader], {
    cwd: __dirname,
    stdio: ["inherit", "pipe", "pipe"],
    env: process.env,
  });
  loaderChild.stdout.pipe(process.stdout);
  loaderChild.stderr.pipe(process.stderr);
  loaderChild.on("exit", (code) => {
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
  check().then((ok) => {
    if (!ok) {
      if (settleTimer) {
        clearTimeout(settleTimer);
        settleTimer = null;
      }
      if (lavalinkReady || !lavalinkUnavailableLogged) {
        lavalinkReady = false;
        lavalinkUnavailableLogged = true;
        console.warn("[wait-for-lavalink] Lavalink non raggiungibile al momento. Il backend resta attivo, la musica no.");
      }
      scheduleNextCheck(intervalMs);
      return;
    }
    if (lavalinkReady || settleTimer) {
      scheduleNextCheck(intervalMs);
      return;
    }
    console.log("[wait-for-lavalink] Lavalink raggiungibile, attendo " + settleMs / 1000 + "s (stabilizzazione JVM)...");
    settleTimer = setTimeout(() => {
      settleTimer = null;
      check().then((stillOk) => {
        if (!stillOk) {
          scheduleNextCheck(intervalMs);
          return;
        }
        lavalinkReady = true;
        lavalinkUnavailableLogged = false;
        console.log("[wait-for-lavalink] Lavalink pronto.");
        if (!loaderStarted) {
          loaderStarted = true;
          runLoader();
        }
        scheduleNextCheck(intervalMs);
      });
    }, settleMs);
  });
}

console.log(
  "[wait-for-lavalink] Controllo Lavalink su " +
    host +
    ":" +
    port +
    "; il backend parte solo dopo il primo check TCP+stabilizzazione OK (così Shoukaku non prova il WebSocket su nodo non pronto).",
);
["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"].forEach((signalName) => {
  process.on(signalName, () => requestStop(0, "segnale " + signalName + " ricevuto"));
});

process.on("exit", () => {
  if (settleTimer) clearTimeout(settleTimer);
  if (loaderChild?.pid) killChildTree(loaderChild.pid);
});

checkLavalinkStatus();