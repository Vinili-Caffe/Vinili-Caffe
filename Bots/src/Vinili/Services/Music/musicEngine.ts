/** Musica: il motore (sessioni per server, avvio dei brani, fine brano, collegamento a Lavalink). */
const { Shoukaku, Connectors, Constants, Utils } = require("shoukaku") as typeof import("shoukaku");
const { logMusic } = require("./musicSearch") as typeof import("./musicSearch");
const { musicHooks } = require("./musicVoice") as typeof import("./musicVoice");
const { getShoukakuVoiceConnectionTimeoutSeconds } = require("./musicVoice") as typeof import("./musicVoice");
const {
  trackForManualQueue,
  clearSessionCurrentRequester,
  getSession,
  cancelPendingQueueEndedEmbed,
  attachEndHandler,
  restoreMusicQueueSnapshot,
  startMusicQueueSnapshotLoop,
} = require("./musicSessionQueue") as typeof import("./musicSessionQueue");
const { startMusicInactivityWatcher } = require("./musicInactivity") as typeof import("./musicInactivity");
const { scheduleMusicPlaybackResume } = require("./musicResume") as typeof import("./musicResume");

const MUSIC_DEFAULT_LAVALINK_VOLUME = 20;

function lavalinkGlobalVolumeFromUserPercent(percent0to100?) {
  const n = Math.round(Number(percent0to100));
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, n));
}

function resolveDefaultJoinGlobalVolume() {
  const raw = Number(process.env.MUSIC_DEFAULT_VOLUME);
  if (!Number.isFinite(raw) || raw < 0) return lavalinkGlobalVolumeFromUserPercent(MUSIC_DEFAULT_LAVALINK_VOLUME);
  let v = Math.floor(raw);
  if (v > 100) v = Math.min(100, Math.max(0, Math.round(v / 10)));
  return lavalinkGlobalVolumeFromUserPercent(v);
}

async function musicStartCapture(opts?) {
  const h = musicHooks();
  if (!h.enableVoiceCapture) return;
  if (typeof h.startVoiceContinuousCapture === "function") {
    return (h.startVoiceContinuousCapture as any)(opts);
  }
  const { startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService") as typeof import("../Voice/voiceContinuousCaptureService");
  return startVoiceContinuousCapture(opts);
}

function isLavalinkUsable(client?) {
  const sh = client?.shoukaku;
  if (!sh?.nodes?.size) return false;
  const nodeName = String(process.env.LAVALINK_NODE_NAME || process.env.LAVALINK_NAME || "main").trim() || "main";
  const node = sh.nodes.get(nodeName) || sh.nodes.values().next().value;
  if (!node) return false;
  const connected = Constants?.State?.CONNECTED;
  if (node.state === connected) return true;
    return String(node.state || "").toUpperCase() === "CONNECTED";
}

function initLavalinkMusicIfEnabled(client?) {
  if (client._shoukakuInitPending) return;
  if (client._shoukakuInitDone && client?.shoukaku?.nodes?.size) return;
  if (client._shoukakuInitDone && !client?.shoukaku?.nodes?.size) {
    client._shoukakuInitDone = false;
    try {
      client.shoukaku?.removeAllListeners?.();
    } catch (_) {}
    client.shoukaku = null;
  }
  if (String(process.env.MUSIC_ENABLED || "1").trim() === "0") {
    logMusic("disabilitato (MUSIC_ENABLED=0)");
    client._shoukakuInitDone = true;
    return;
  }
  client._shoukakuInitPending = true;
  void waitForLavalinkTcpThenInitShoukaku(client).catch((err?) => {
    client._shoukakuInitPending = false;
    global.logger?.error?.("[MUSIC] Inizializzazione Shoukaku fallita:", err?.message || err, err?.stack);
  });
}

function isTransientLavalinkConnectError(err?) {
  return require("../../../shared/music/lavalinkProbe").isTransientLavalinkConnectError(err);
}

async function waitForLavalinkTcpThenInitShoukaku(client?) {
  const { waitUntilLavalinkReady } = require("../../../shared/music/lavalinkProbe") as typeof import("../../../shared/music/lavalinkProbe");
  const ready = await waitUntilLavalinkReady({});
  const { host, port, url } = ready;
  const portNum = Number(port) || 2333;

  if (!ready.ok) {
    client._shoukakuInitPending = false;
    /* wait-for-lavalink già monitora: niente warn duplicato al boot. */
    return;
  }

  const password = process.env.LAVALINK_PASSWORD || "youshallnotpass";
  const secure = String(process.env.LAVALINK_SECURE || "").trim() === "1";
  const nodes = [
    {
      name: process.env.LAVALINK_NODE_NAME || process.env.LAVALINK_NAME || "main",
      url,
      auth: password,
      secure,
    },
  ];

  try {
    const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
      moveOnDisconnect: false,
      resume: true,
      resumeByLibrary: true,
      resumeTimeout: 60,
      reconnectTries: 60,
      reconnectInterval: 7,
      restTimeout: 120,
      voiceConnectionTimeout: getShoukakuVoiceConnectionTimeoutSeconds(),
    });
        if (typeof client.isReady === "function" && client.isReady() && client.user?.id && shoukaku.nodes.size === 0) {
      shoukaku.id = client.user.id;
      for (const nodeOpt of nodes) {
        shoukaku.addNode(Utils.mergeDefault(Constants.NodeDefaults, { ...nodeOpt }));
      }
    }
    if (!shoukaku.nodes.size) {
      client._shoukakuInitPending = false;
      global.logger?.warn?.("[MUSIC] Shoukaku senza nodi dopo init (clientReady race). Riprovo al prossimo play.");
      return;
    }
    client.shoukaku = shoukaku;
    client._shoukakuInitDone = true;
    client._shoukakuInitPending = false;
    restoreMusicQueueSnapshot();
    let refusedLogged = false;
    shoukaku.on("error", (name?, err?) => {
      if (isTransientLavalinkConnectError(err)) {
        if (!refusedLogged) {
          refusedLogged = true;
          logMusic(
            `Shoukaku node ${name}: Lavalink momentaneamente non raggiungibile, riconnessione automatica...`,
          );
        }
        return;
      }
      refusedLogged = false;
      global.logger?.warn?.(`[MUSIC] Shoukaku node ${name}:`, err?.message || err);
    });
    shoukaku.on("ready", (name?) => {
      refusedLogged = false;
      logMusic(`Lavalink collegato (nodo ${name})`);
            scheduleMusicPlaybackResume(client);
    });
    startMusicInactivityWatcher(client);
    startMusicQueueSnapshotLoop(client);
  } catch (err) {
    client._shoukakuInitPending = false;
    global.logger?.error?.("[MUSIC] Inizializzazione Shoukaku fallita:", err?.message || err, err?.stack);
  }
}

export = { lavalinkGlobalVolumeFromUserPercent, resolveDefaultJoinGlobalVolume, musicStartCapture, trackForManualQueue, clearSessionCurrentRequester, getSession, isLavalinkUsable, cancelPendingQueueEndedEmbed, attachEndHandler, initLavalinkMusicIfEnabled };
