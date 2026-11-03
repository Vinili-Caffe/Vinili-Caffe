/** Musica: uscita automatica per inattività (coda vuota / VC vuoto). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { applyDefaultFooterToEmbeds } = require("../../embeds/defaultFooter") as typeof import("../../embeds/defaultFooter");
const { guildQueues, endListeners, musicIdleSince, leaveMusicVoiceChannelMarked, musicLeaveTts } = require("./musicVoice") as typeof import("./musicVoice");

const _musicIdleRawMs = Number(process.env.MUSIC_INACTIVITY_IDLE_MS || 180_000);
const MUSIC_INACTIVITY_MS = Math.max(
  60_000,
  Number.isFinite(_musicIdleRawMs) && _musicIdleRawMs > 0 ? _musicIdleRawMs : 180_000,
);

function isMusicSessionQueueIdle(guildId?) {
  const session = guildQueues.get(String(guildId || "").trim());
  const np = String(session?.nowPlaying || "").trim();
  const pending = Array.isArray(session?.tracks) ? session.tracks.length : 0;
  return !np && pending === 0;
}

async function sendMusicInactivityLeaveEmbed(client?, textChannelId?, guildId?) {
  const cid = String(textChannelId || "").trim();
  const gid = String(guildId || "").trim();
  if (!cid || !client) return;
  try {
    const ch = client.channels.cache.get(cid) || (await client.channels.fetch(cid).catch(() => null));
    if (!ch?.isTextBased?.() || ch.isDMBased?.()) return;
    const guild =
      gid ? client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null)) : ch.guild || null;
    const mins = Math.max(1, Math.round(MUSIC_INACTIVITY_MS / 60_000));
    const minLabel = mins === 1 ? "1 minuto" : `${mins} minuti`;
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription(
        `Non è in riproduzione alcun brano oppure non c'è nessuno nel canale vocale da ${minLabel}: esco 👋`,
      );
    const payload = applyDefaultFooterToEmbeds({ embeds: [embed] }, guild || ch.guild);
    await ch.send(payload).catch(() => {});
  } catch (_) {}
}

async function tickMusicInactivity(client?) {
  const sh = client.shoukaku;
  if (!sh?.connections?.size) {
    musicIdleSince.clear();
    return;
  }
  const now = Date.now();
  for (const [guildId, conn] of sh.connections) {
    const gid = String(guildId || "").trim();
    if (!gid || !conn?.channelId) continue;
    const { isGuildClipRecording } = require("../../../Vinili/Community/services/voiceClipService") as typeof import("../../../Vinili/Community/services/voiceClipService");
    if (isGuildClipRecording(gid)) {
      musicIdleSince.delete(gid);
      continue;
    }
    const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) continue;
    const vc =
      guild.channels.cache.get(String(conn.channelId)) ||
      (await guild.channels.fetch(String(conn.channelId)).catch(() => null));
    if (!vc?.isVoiceBased?.()) continue;
    let humans = 0;
    for (const m of vc.members.values()) {
      if (!m.user?.bot) humans += 1;
    }
    const player = sh.players.get(gid);
    const session = guildQueues.get(gid);
    const queueIdle = isMusicSessionQueueIdle(gid);
    /* playlistRaceFix1: tra un brano e l'altro / mirror probe non contare idle */
    const hasQueueWork = Boolean(
      session &&
        (session.nowPlaying ||
          (Array.isArray(session.tracks) && session.tracks.length) ||
          session._mirrorProbing ||
          session._playAdvanceLock),
    );
    const trackPlaying = Boolean(player?.track) && !player.paused;
    const emptyVc = humans === 0;
    const trulyIdle = !trackPlaying && !hasQueueWork && queueIdle;
    if (!emptyVc && !trulyIdle) {
      musicIdleSince.delete(gid);
      continue;
    }
    if (!musicIdleSince.has(gid)) {
      musicIdleSince.set(gid, now);
      continue;
    }
    const since = musicIdleSince.get(gid) || now;
    if (now - since < MUSIC_INACTIVITY_MS) continue;
    musicIdleSince.delete(gid);
    const textChannelId = session?.textChannelId || null;
    guildQueues.delete(gid);
    endListeners.delete(gid);
    try {
      const pl = sh.players.get(gid);
      if (pl) await pl.destroy();
    } catch (_) {}
    await leaveMusicVoiceChannelMarked(client, gid);
    if (textChannelId) {
      await sendMusicInactivityLeaveEmbed(client, textChannelId, gid);
    }
    await musicLeaveTts(gid, client).catch(() => {});
  }
}

function startMusicInactivityWatcher(client?) {
  if (client._musicInactivityTickTimer) return;
  client._musicInactivityTickTimer = setInterval(() => {
    void tickMusicInactivity(client).catch((e?) => {
      global.logger?.warn?.("[MUSIC] inactivity tick:", e?.message || e);
    });
  }, 15_000);
  client._musicInactivityTickTimer.unref?.();
}

export = { startMusicInactivityWatcher };
