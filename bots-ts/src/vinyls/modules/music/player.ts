import type { Client, Guild, VoiceBasedChannel } from "discord.js";
import { Connectors, Shoukaku, type Player } from "shoukaku";
import { logger } from "../../../shared";
import { getLavalinkStatus, wantShoukakuConnect } from "./lavalink";
import { clearSession, getSession, type QueueTrack } from "./musicSession";

let shoukaku: Shoukaku | null = null;
const endHandlers = new Set<string>();
const suppressEnd = new Set<string>();

export function getShoukaku(): Shoukaku | null {
  return shoukaku;
}

export function isVoicePlayerReady(): boolean {
  if (!shoukaku) return false;
  for (const node of shoukaku.nodes.values()) {
    if (node.state === 1 /* CONNECTED */) return true;
  }
  return false;
}

/** Init Shoukaku dopo clientReady — solo con CONNECT + ALLOW_SHARED. */
export function initShoukaku(client: Client): void {
  if (shoukaku) return;
  const st = getLavalinkStatus();
  if (!wantShoukakuConnect()) {
    logger.info(`[music-player] skip — ${st.note}`);
    return;
  }
  const host = st.host;
  const pwd = String(process.env.LAVALINK_PASSWORD || process.env.VC_TS_LAVALINK_PASSWORD || "").trim();
  if (!host || !pwd) {
    logger.warn("[music-player] manca host/password");
    return;
  }
  const secure = String(process.env.LAVALINK_SECURE || "").trim() === "1";
  const nodes = [
    {
      name: process.env.LAVALINK_NODE_NAME || process.env.LAVALINK_NAME || "main",
      url: `${host}:${st.port}`,
      auth: pwd,
      secure,
    },
  ];
  try {
    shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
      moveOnDisconnect: false,
      resume: false,
      reconnectTries: 10,
      reconnectInterval: 5,
      restTimeout: 60,
      voiceConnectionTimeout: 60,
    });
    shoukaku.on("ready", (name) => {
      logger.info(`[music-player] Lavalink ready · nodo ${name}`);
    });
    shoukaku.on("error", (name, err) => {
      logger.warn(`[music-player] nodo ${name}:`, err?.message || err);
    });
    shoukaku.on("close", (name, code, reason) => {
      logger.warn(`[music-player] close ${name} ${code} ${reason || ""}`);
    });
    logger.info(`[music-player] Shoukaku init → ${host}:${st.port}`);
  } catch (err) {
    shoukaku = null;
    logger.error("[music-player] init failed", err);
  }
}

function shardId(guild: Guild): number {
  if (guild.shardId != null && Number.isFinite(guild.shardId)) return guild.shardId;
  return 0;
}

async function ensurePlayer(guild: Guild, channel: VoiceBasedChannel): Promise<Player | null> {
  if (!shoukaku) return null;
  let player = shoukaku.players.get(guild.id);
  if (player) return player;
  try {
    player = await shoukaku.joinVoiceChannel({
      guildId: guild.id,
      channelId: channel.id,
      shardId: shardId(guild),
      deaf: true,
    });
    attachEndHandler(guild.id, player);
    try {
      const { attachPcmCapture } = await import("../utility/pcmRing.js");
      attachPcmCapture(guild.id);
    } catch {
      /* optional */
    }
    return player;
  } catch (err) {
    logger.warn("[music-player] joinVoiceChannel", err);
    return null;
  }
}

function attachEndHandler(guildId: string, player: Player): void {
  if (endHandlers.has(guildId)) return;
  endHandlers.add(guildId);
  player.on("end", (ev) => {
    if (suppressEnd.has(guildId)) return;
    const reason = String((ev as { reason?: string })?.reason || "");
    if (reason === "replaced" || reason === "stopped") return;
    void advanceQueue(guildId, reason === "finished" || reason === "loadFailed");
  });
  player.on("exception", (ev) => {
    logger.warn("[music-player] exception", guildId, (ev as { exception?: { message?: string } })?.exception?.message);
  });
}

async function playEncoded(player: Player, track: QueueTrack): Promise<boolean> {
  const enc = String(track.encoded || "").trim();
  if (!enc) return false;
  const vol = Math.max(1, Math.min(200, Math.floor(getSession(player.guildId).volume)));
  try {
    await player.setGlobalVolume(vol);
    await player.playTrack({ track: { encoded: enc } });
    return true;
  } catch (err) {
    logger.warn("[music-player] playTrack", err);
    return false;
  }
}

async function startPlaying(guildId: string): Promise<boolean> {
  const session = getSession(guildId);
  if (!session.playing?.encoded || !session.voiceChannelId || !shoukaku) return false;
  const player = shoukaku.players.get(guildId);
  if (!player) return false;
  session.paused = false;
  return playEncoded(player, session.playing);
}

async function advanceQueue(guildId: string, natural: boolean): Promise<void> {
  const session = getSession(guildId);
  if (!session.playing) return;
  if (session.repeat === "track" && natural) {
    await startPlaying(guildId);
    return;
  }
  session.history.push(session.playing);
  if (session.history.length > 50) session.history.shift();
  if (session.repeat === "queue" && natural) {
    session.queue.push(session.playing);
  }
  session.playing = session.queue.shift() || null;
  session.paused = false;
  if (session.playing) {
    await startPlaying(guildId);
  } else if (shoukaku) {
    await shoukaku.leaveVoiceChannel(guildId).catch(() => undefined);
    endHandlers.delete(guildId);
  }
}

export interface EnqueueResult {
  ok: boolean;
  message: string;
  started: boolean;
  position: number;
}

export async function enqueueAndPlay(opts: {
  guild: Guild;
  voiceChannel: VoiceBasedChannel;
  textChannelId: string;
  track: QueueTrack;
}): Promise<EnqueueResult> {
  if (!shoukaku || !isVoicePlayerReady()) {
    return {
      ok: false,
      message: "Voice player non pronto (VC_TS_LAVALINK_CONNECT=1 + nodo up).",
      started: false,
      position: 0,
    };
  }
  if (!opts.track.encoded) {
    return {
      ok: false,
      message: "Track senza encoded — resolve REST fallito.",
      started: false,
      position: 0,
    };
  }
  const session = getSession(opts.guild.id);
  session.voiceChannelId = opts.voiceChannel.id;
  session.textChannelId = opts.textChannelId;

  const player = await ensurePlayer(opts.guild, opts.voiceChannel);
  if (!player) {
    return { ok: false, message: "Join vocale fallito.", started: false, position: 0 };
  }

  if (!session.playing) {
    session.playing = opts.track;
    const ok = await playEncoded(player, opts.track);
    return {
      ok,
      message: ok ? `Play: **${opts.track.title}**` : "playTrack fallito.",
      started: ok,
      position: 0,
    };
  }
  session.queue.push(opts.track);
  return {
    ok: true,
    message: `In coda (#${session.queue.length}): **${opts.track.title}**`,
    started: false,
    position: session.queue.length,
  };
}

export async function skipTrack(guildId: string): Promise<{ ok: boolean; message: string }> {
  const session = getSession(guildId);
  if (!session.playing) return { ok: false, message: "Niente in riproduzione." };
  const skipped = session.playing;
  const player = shoukaku?.players.get(guildId);
  suppressEnd.add(guildId);
  try {
    session.history.push(skipped);
    if (session.history.length > 50) session.history.shift();
    session.playing = session.queue.shift() || null;
    session.paused = false;
    if (session.playing && player) {
      await playEncoded(player, session.playing);
    } else if (player) {
      await player.stopTrack().catch(() => undefined);
      await shoukaku?.leaveVoiceChannel(guildId).catch(() => undefined);
      endHandlers.delete(guildId);
    }
  } finally {
    suppressEnd.delete(guildId);
  }
  return {
    ok: true,
    message: session.playing
      ? `Skip **${skipped.title}** → **${session.playing.title}**`
      : `Skip **${skipped.title}** · coda vuota.`,
  };
}

export async function stopPlayback(guildId: string): Promise<void> {
  suppressEnd.add(guildId);
  try {
    clearSession(guildId);
    endHandlers.delete(guildId);
    if (shoukaku) {
      const player = shoukaku.players.get(guildId);
      if (player) await player.stopTrack().catch(() => undefined);
      await shoukaku.leaveVoiceChannel(guildId).catch(() => undefined);
    }
  } finally {
    suppressEnd.delete(guildId);
  }
}

export async function setPaused(guildId: string, paused: boolean): Promise<boolean> {
  const session = getSession(guildId);
  const player = shoukaku?.players.get(guildId);
  if (!session.playing || !player) return false;
  session.paused = paused;
  await player.setPaused(paused);
  return true;
}

export async function setVolume(guildId: string, volume: number): Promise<boolean> {
  const session = getSession(guildId);
  session.volume = volume;
  const player = shoukaku?.players.get(guildId);
  if (!player) return true;
  await player.setGlobalVolume(volume);
  return true;
}

export async function seekMs(guildId: string, positionMs: number): Promise<boolean> {
  const player = shoukaku?.players.get(guildId);
  if (!player) return false;
  await player.seekTo(Math.max(0, Math.floor(positionMs)));
  return true;
}

export async function restartTrack(guildId: string): Promise<boolean> {
  const session = getSession(guildId);
  const player = shoukaku?.players.get(guildId);
  if (!session.playing?.encoded || !player) return false;
  session.paused = false;
  return playEncoded(player, session.playing);
}

export async function playPrevious(guildId: string): Promise<{ ok: boolean; message: string }> {
  const session = getSession(guildId);
  const prev = session.history.pop();
  if (!prev) return { ok: false, message: "Nessun brano precedente." };
  if (session.playing) session.queue.unshift(session.playing);
  session.playing = prev;
  session.paused = false;
  const player = shoukaku?.players.get(guildId);
  if (player && prev.encoded) {
    await playEncoded(player, prev);
  }
  return { ok: true, message: `Previous: **${prev.title}**` };
}
