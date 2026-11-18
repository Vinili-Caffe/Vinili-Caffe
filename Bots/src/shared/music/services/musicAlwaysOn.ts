/**
 * Bot sempre in vocale: radio IT o chill preset.
 * Non tocca sessioni utente con coda/brano attivo; riparte quando la coda è vuota / dopo kick.
 */
const { notifyBotPresenceVoiceActivity } = require("../../discord/botPresenceActivity") as typeof import("../../discord/botPresenceActivity");
const { resolveAlwaysOnPlayTarget } = require("./musicAlwaysOnCatalog") as typeof import("./musicAlwaysOnCatalog");
const { logMusic, tracksFromResolve } = require("./musicSearch") as typeof import("./musicSearch");
const { playWithMirrorFallbacks, playEncodedFromStart, describeTrack } = require("./musicMirror") as typeof import("./musicMirror");
const {
  musicPurgeTts,
  guildQueues,
  getShardIdForGuild,
  withMusicVoiceJoinLock,
  forceClearShoukakuGuildVoice,
  musicJoinVoiceChannelErrorMessage,
  clearBlockingNativeVoiceForMusic,
  persistMusicQueueSnapshotNow,
} = require("./musicVoice") as typeof import("./musicVoice");
const {
  resolveDefaultJoinGlobalVolume,
  musicStartCapture,
  getSession,
  isLavalinkUsable,
  attachEndHandler,
  initLavalinkMusicIfEnabled,
} = require("./musicEngine") as typeof import("./musicEngine");

const WAKE_KEY = "musicAlwaysOn.wake.v1";
const ensuring = new Set<string>();
const lastEnsureAt = new Map<string, number>();
const rejoinTimers = new Map<string, NodeJS.Timeout>();

function alwaysOnKey(source?, radioId?) {
  const src = String(source || "").trim().toLowerCase();
  if (src === "chill") return "chill";
  return `radio:${String(radioId || "").trim().toLowerCase() || "rtl1025"}`;
}

function sessionHasUserMusic(session?) {
  if (!session) return false;
  if (session.alwaysOn) return false;
  /* coda o richiedente = sessione utente. nowPlaying da solo = spesso resume dello stream 24/7 senza flag. */
  if (Array.isArray(session.tracks) && session.tracks.length > 0) return true;
  if (String(session.currentRequesterUserId || "").trim()) return true;
  if (String(session.musicSessionOwnerId || "").trim()) return true;
  return false;
}

async function resolveNode(client?) {
  const sh = client?.shoukaku;
  if (!sh) return null;
  return (
    sh.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (sh.nodes?.size ? sh.nodes.values().next().value : undefined) ||
    null
  );
}

function withTimeout(promise?, ms = 3500) {
  const t = Math.max(800, Number(ms) || 3500);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const id = setTimeout(() => reject(new Error("timeout")), t);
      id.unref?.();
    }),
  ]);
}

async function resolveFirstPlayableTrack(node?, urls: string[] = []) {
  for (const url of urls) {
    const raw = String(url || "").trim();
    if (!raw) continue;
    try {
      const resolved = await withTimeout(node.rest.resolve(raw), 3500);
      const tracks = tracksFromResolve(resolved);
      const track = tracks[0];
      if (track?.encoded) return { track, url: raw };
    } catch (err) {
      logMusic("alwaysOn resolve try fail", { url: raw.slice(0, 80), err: err?.message || err });
    }
  }
  return null;
}

async function playAlwaysOnTarget(client?, guildId?, player?, session?, target?) {
  const node = await resolveNode(client);
  if (!node?.rest?.resolve || !player || !target) return false;
  const urls = Array.isArray(target.urls) && target.urls.length ? target.urls : [target.url].filter(Boolean);
  const hit = await resolveFirstPlayableTrack(node, urls);
  if (!hit?.track?.encoded) {
    logMusic("alwaysOn no track", { guildId, urls: urls.map((u) => String(u).slice(0, 60)) });
    return false;
  }
  const track = hit.track;

  session.tracks = [];
  session.repeatOne = false;
  session.repeatEncoded = null;
  session.repeatQueue = false;
  session.repeatQueueSnapshot = null;
  session.alwaysOn = true;
  session.alwaysOnKey = alwaysOnKey(target.kind, target.id);
  session.alwaysOnLabel = target.label;
  session.currentRequesterUserId = null;
  session.currentRequesterUserTag = null;
  session.suppressQueueEndUntil = Date.now() + 8000;

  let ok = false;
  try {
    if (target.kind === "chill") {
      const played = await playWithMirrorFallbacks(player, session, node, track);
      ok = Boolean(played?.ok);
      if (ok && played.track) {
        session.nowPlaying = describeTrack(played.track) || target.label;
        session.playingEncoded = played.track.encoded;
      }
    } else {
      if (player.paused) await player.setPaused(false).catch(() => {});
      /* stream radio: skip OAuth YT (switch dashboard deve essere snello) */
      await playEncodedFromStart(player, track.encoded, { skipOauth: true });
      session.nowPlaying = target.label;
      session.playingEncoded = track.encoded;
      ok = true;
    }
  } catch (err) {
    logMusic("alwaysOn play fail", { guildId, err: err?.message || err });
    ok = false;
  }
  if (!ok) return false;
  session._freshPlayAt = Date.now();
  musicIdleSinceSafeDelete(guildId);
  persistMusicQueueSnapshotNow(client);
  return true;
}

function musicIdleSinceSafeDelete(guildId?) {
  try {
    const { musicIdleSince } = require("./musicVoice") as typeof import("./musicVoice");
    musicIdleSince.delete(String(guildId || ""));
  } catch (_) {}
}

async function ensureAlwaysOnForGuild(client?, guildId?, opts: { force?: boolean } = {}) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return false;
  try {
    const { getMusicBotHooks } = require("../../music/musicBotHooks") as typeof import("../../music/musicBotHooks");
    if (getMusicBotHooks()?.profile === "coffee") return false;
  } catch (_) {}
  if (ensuring.has(gid)) return false;
  const now = Date.now();
  if (!opts.force && now - Number(lastEnsureAt.get(gid) || 0) < 8_000) return false;

  let cfg;
  try {
    const VR = require("../../../MultiGuild/services/voiceRuntime") as typeof import("../../../MultiGuild/services/voiceRuntime");
    cfg = await VR.getConfig(gid, true);
  } catch (_) {
    return false;
  }
  const always = cfg?.music?.alwaysOn;
  if (!always?.enabled || !always.voiceChannelId) return false;

  try {
    const MS = require("../../../MultiGuild/core/moduleSwitches") as typeof import("../../../MultiGuild/core/moduleSwitches");
    if (MS.moduleExists(gid, "vocale") && !MS.isModuleOn(gid, "vocale")) return false;
  } catch (_) {}

  const target = resolveAlwaysOnPlayTarget(always.source, always.radioId);
  if (!target) return false;

  ensuring.add(gid);
  lastEnsureAt.set(gid, now);
  try {
    initLavalinkMusicIfEnabled(client);
    if (!isLavalinkUsable(client)) {
      logMusic("alwaysOn wait lavalink", { guildId: gid });
      return false;
    }

    const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) return false;
    const voiceChannel =
      guild.channels.cache.get(String(always.voiceChannelId)) ||
      (await guild.channels.fetch(String(always.voiceChannelId)).catch(() => null));
    if (!voiceChannel?.isVoiceBased?.()) {
      logMusic("alwaysOn bad channel", { guildId: gid, channelId: always.voiceChannelId });
      return false;
    }
    const me = guild.members.me || (await guild.members.fetchMe?.().catch(() => null));
    if (!voiceChannel.permissionsFor?.(me)?.has?.(["Connect", "Speak", "ViewChannel"])) {
      logMusic("alwaysOn missing perms", { guildId: gid, channelId: voiceChannel.id });
      return false;
    }

    const session = getSession(gid);
    if (sessionHasUserMusic(session)) return false;

    const sh = client.shoukaku;
    if (!sh) return false;
    const conn = sh.connections?.get(gid);
    const playerExisting = sh.players?.get(gid);
    const wantKey = alwaysOnKey(target.kind, target.id);
    const inRightChannel = String(conn?.channelId || "") === String(voiceChannel.id);
    const playingOk =
      Boolean(playerExisting?.track) &&
      !playerExisting.paused &&
      session?.alwaysOn === true &&
      String(session?.alwaysOnKey || "") === wantKey &&
      inRightChannel;
    if (playingOk) return true;

    /* cambio radio/chill o reclaim dopo resume: azzera chiave così si riparte sul target dashboard */
    if (opts.force || String(session.alwaysOnKey || "") !== wantKey) {
      session.alwaysOn = false;
      session.alwaysOnKey = null;
    }

    if (await clearBlockingNativeVoiceForMusic(gid, client)) {
      logMusic("alwaysOn blocked by native voice", { guildId: gid });
      return false;
    }

    await musicPurgeTts(gid, client).catch(() => {});

    let player = sh.players.get(gid);
    if (!player || !inRightChannel) {
      const joinOnce = () =>
        sh.joinVoiceChannel({
          guildId: gid,
          shardId: getShardIdForGuild(guild),
          channelId: voiceChannel.id,
          deaf: false,
        });
      try {
        player = await withMusicVoiceJoinLock(gid, async () => {
          if (sh.connections?.has(gid) && !sh.players?.get(gid)) {
            await forceClearShoukakuGuildVoice(client, gid);
          } else if (conn?.channelId && String(conn.channelId) !== String(voiceChannel.id)) {
            await forceClearShoukakuGuildVoice(client, gid);
          }
          return await joinOnce();
        });
        notifyBotPresenceVoiceActivity(client);
        await musicStartCapture({
          guildId: gid,
          voiceChannel,
          client,
          botUserId: client?.user?.id,
        }).catch(() => null);
      } catch (err) {
        logMusic("alwaysOn join fail", {
          guildId: gid,
          err: musicJoinVoiceChannelErrorMessage(err) || err?.message || err,
        });
        await forceClearShoukakuGuildVoice(client, gid).catch(() => {});
        return false;
      }
    }

    if (!player) return false;
    attachEndHandler(client, player, gid);
    await player.setGlobalVolume(resolveDefaultJoinGlobalVolume(gid)).catch(() => {});
    if (player.paused) await player.setPaused(false).catch(() => {});

    session.voiceChannelId = voiceChannel.id;
    session.textChannelId = session.textChannelId || null;
    const ok = await playAlwaysOnTarget(client, gid, player, session, target);
    if (!ok) {
      session.alwaysOn = false;
      session.alwaysOnKey = null;
      logMusic("alwaysOn play not started", { guildId: gid, radio: target.id, label: target.label });
    }
    return ok;
  } finally {
    ensuring.delete(gid);
  }
}

async function guildAlwaysOnEnabled(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  try {
    const VR = require("../../../MultiGuild/services/voiceRuntime") as typeof import("../../../MultiGuild/services/voiceRuntime");
    const cfg = await VR.getConfig(gid, true);
    return Boolean(cfg?.music?.alwaysOn?.enabled && cfg.music.alwaysOn.voiceChannelId);
  } catch (_) {
    return false;
  }
}

async function tryResumeAlwaysOnAfterQueueEmpty(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  /* sempre getConfig fresh: getConfigSync sul processo musica può non avere ancora la cache dashboard */
  if (!(await guildAlwaysOnEnabled(gid))) return false;
  const session = guildQueues.get(gid);
  if (session) {
    session.alwaysOn = false;
    session.alwaysOnKey = null;
    session.alwaysOnLabel = null;
    session.nowPlaying = null;
    session.playingEncoded = null;
    session.tracks = [];
    /* +play lascia musicSessionOwnerId: sessionHasUserMusic lo legge e blocca ensureAlwaysOn */
    session.musicSessionOwnerId = null;
    session.currentRequesterUserId = null;
    session.currentRequesterUserTag = null;
  }
  lastEnsureAt.delete(gid);
  return ensureAlwaysOnForGuild(client, gid, { force: true });
}

/** Dopo kick / disconnect: rientra nel canale 24/7. */
function scheduleAlwaysOnRejoin(client?, guildId?, delayMs = 2500) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return;
  const prev = rejoinTimers.get(gid);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    rejoinTimers.delete(gid);
    void (async () => {
      if (!(await guildAlwaysOnEnabled(gid))) return;
      await tryResumeAlwaysOnAfterQueueEmpty(client, gid);
    })().catch((err?) => {
      logMusic("alwaysOn rejoin fail", { guildId: gid, err: err?.message || err });
    });
  }, Math.max(800, Number(delayMs) || 2500));
  t.unref?.();
  rejoinTimers.set(gid, t);
}

/** Dashboard (site-api) non ha Lavalink: sveglia bots-vinyls via BotState. */
async function requestAlwaysOnWake(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  try {
    const { getBotState, setBotState } = require("../../botState/botStateStore") as typeof import("../../botState/botStateStore");
    const prev = (await getBotState(WAKE_KEY, [])) || [];
    const list = Array.isArray(prev) ? prev.map(String) : [];
    if (!list.includes(gid)) list.push(gid);
    await setBotState(WAKE_KEY, list.slice(-50));
  } catch (err) {
    logMusic("alwaysOn wake write fail", err?.message || err);
  }
}

async function drainAlwaysOnWakes(client?) {
  if (!client) return;
  let list: string[] = [];
  try {
    const { getBotState, setBotState } = require("../../botState/botStateStore") as typeof import("../../botState/botStateStore");
    const prev = (await getBotState(WAKE_KEY, [])) || [];
    list = Array.isArray(prev) ? prev.map(String).filter(Boolean) : [];
    if (list.length) await setBotState(WAKE_KEY, []);
  } catch (_) {
    return;
  }
  for (const gid of list) {
    lastEnsureAt.delete(gid);
    await ensureAlwaysOnForGuild(client, gid, { force: true }).catch((err?) => {
      logMusic("alwaysOn wake ensure fail", { guildId: gid, err: err?.message || err });
    });
  }
}

async function tickAlwaysOn(client?) {
  if (!client) return;
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) return;
  await drainAlwaysOnWakes(client);
  let ids: string[] = [];
  try {
    const { listAlwaysOnGuildIds } = require("../../../MultiGuild/services/voiceRuntime") as typeof import("../../../MultiGuild/services/voiceRuntime");
    ids = await listAlwaysOnGuildIds(true);
  } catch (_) {
    return;
  }
  for (const gid of ids) {
    if (!client.guilds.cache.has(gid)) continue;
    await ensureAlwaysOnForGuild(client, gid).catch((err?) => {
      logMusic("alwaysOn tick fail", { guildId: gid, err: err?.message || err });
    });
  }
}

function startAlwaysOnWatcher(client?) {
  if (!client || client._musicAlwaysOnTickTimer) return;
  /* tick pieno: reclaim / kick / check periodico */
  client._musicAlwaysOnTickTimer = setInterval(() => {
    void tickAlwaysOn(client).catch((e?) => {
      global.logger?.warn?.("[MUSIC] alwaysOn tick:", e?.message || e);
    });
  }, 15_000);
  client._musicAlwaysOnTickTimer.unref?.();
  /* wake dalla dashboard (site-api): poll veloce, altrimenti switch radio ≈ 15–30s */
  if (!client._musicAlwaysOnWakeTimer) {
    client._musicAlwaysOnWakeTimer = setInterval(() => {
      if (!isLavalinkUsable(client)) return;
      void drainAlwaysOnWakes(client).catch(() => {});
    }, 1_500);
    client._musicAlwaysOnWakeTimer.unref?.();
  }
  setTimeout(() => {
    void tickAlwaysOn(client).catch(() => {});
  }, 2_000).unref?.();
}

function notifyAlwaysOnConfigChanged(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  lastEnsureAt.delete(gid);
  try {
    const session = guildQueues.get(gid);
    if (session && !sessionHasUserMusic(session)) {
      session.alwaysOn = false;
      session.alwaysOnKey = null;
    }
  } catch (_) {}
  void requestAlwaysOnWake(gid);
  /* se siamo sul processo musica (vinyls) prova subito; su site-api resta il wake */
  if (client?.shoukaku) {
    void ensureAlwaysOnForGuild(client, gid, { force: true }).catch((err?) => {
      global.logger?.warn?.("[MUSIC] alwaysOn config ensure:", err?.message || err);
    });
  }
}

export = {
  ensureAlwaysOnForGuild,
  tryResumeAlwaysOnAfterQueueEmpty,
  scheduleAlwaysOnRejoin,
  requestAlwaysOnWake,
  tickAlwaysOn,
  startAlwaysOnWatcher,
  notifyAlwaysOnConfigChanged,
  sessionHasUserMusic,
};
