/** Musica: comandi di base (volume, salta, stop, pausa, riprendi, svuota). */
const { safeEmbedBoldFragment } = require("./musicSpotifyLinks") as typeof import("./musicSpotifyLinks");
const { describeTrack, encodedFromPlayerTrack } = require("./musicMirror") as typeof import("./musicMirror");
const { musicPurgeTts, guildQueues, endListeners, assertMusicCommandAllowed, persistMusicQueueSnapshotNow, leaveMusicVoiceChannelMarked, destroyGhostMusicStateIfBotNotInVoice } = require("./musicVoice") as typeof import("./musicVoice");
const { lavalinkGlobalVolumeFromUserPercent, getSession, isLavalinkUsable, initLavalinkMusicIfEnabled } = require("./musicEngine") as typeof import("./musicEngine");
const { formatPlaybackPositionClock } = require("./musicQueueView") as typeof import("./musicQueueView");

function buildRepeatQueueSnapshot(session?, player?) {
  const enc = encodedFromPlayerTrack(player.track);
  if (!enc) return [];
  const label = String(session?.nowPlaying || "").trim() || "Traccia";
  const out = [{ encoded: enc, label }];
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  for (const t of pending) {
    if (t?.encoded) {
      out.push({ encoded: t.encoded, label: describeTrack(t) });
    }
  }
  return out;
}

function formatSkippedTrackDisplay(label?) {
  const s = String(label || "").trim();
  if (!s) return "Traccia sconosciuta";
  return s.replace(/\s*—\s*/g, " di ");
}

async function setGuildMusicVolume(client?, guild?, rawPercent?, requesterUserId?) {
  const guildId = guild?.id;
  if (!guildId) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guildId);
  if (!player) {
    return { ok: false, message: "Nessun player musica attivo in questo server." };
  }
  const member =
    guild.members.cache.get(String(requesterUserId || "")) ||
    (await guild.members.fetch(String(requesterUserId || "")).catch(() => null));
  const volGate = assertMusicCommandAllowed(client, guild, member, requesterUserId);
  if (!volGate.ok) return volGate;
  const n = Number(String(rawPercent ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, message: "Indica un numero da 0 a 100." };
  }
  const userVol = Math.min(100, Math.max(0, Math.round(n)));
  const lavalinkVol = lavalinkGlobalVolumeFromUserPercent(userVol);
  try {
    await player.setGlobalVolume(lavalinkVol);
  } catch (err) {
    return { ok: false, message: err?.message || "Impostazione volume fallita." };
  }
  return { ok: true, volumePercent: userVol };
}

async function skipGuild(interaction?) {
  const client = interaction.client;
  const guild = interaction.guild;
  const requester = interaction.user || interaction.author;
  if (!guild) return { ok: false, message: "Solo in server." };
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const player = client.shoukaku?.players?.get(guildId);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const gate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!gate.ok) return gate;
  const session = guildQueues.get(guildId);
  let skippedLabel = String(session?.nowPlaying || "").trim();
  if (!skippedLabel) {
    const sh = client.shoukaku;
    const node =
      sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
      (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
      (sh?.nodes?.size ? sh.nodes.values().next().value : null);
    if (node?.rest?.decode && player.track) {
      try {
        const t = await node.rest.decode(player.track);
        skippedLabel = describeTrack(t);
      } catch (_) {}
    }
  }
  if (!skippedLabel) skippedLabel = "Traccia sconosciuta";
  const trackDisplay = safeEmbedBoldFragment(formatSkippedTrackDisplay(skippedLabel));
  try {
    await player.stopTrack();
  } catch (err) {
    return { ok: false, message: err?.message || "Skip fallito." };
  }
  return {
    ok: true,
    message: "Traccia saltata.",
    embedDescription: `**${trackDisplay}** è stata saltata da <@${requester.id}>`,
  };
}

async function stopGuild(interaction?) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  const guildId = guild.id;
  initLavalinkMusicIfEnabled(client);
  await destroyGhostMusicStateIfBotNotInVoice(client, guild);
  const sh = client.shoukaku;
  const session = guildQueues.get(guildId);
  const player = sh?.players?.get(guildId);
  const conn = sh?.connections?.get(guildId);
  const active =
    Boolean(conn?.channelId) ||
    Boolean(player?.track) ||
    Boolean(session?.tracks?.length) ||
    Boolean(session?.nowPlaying);
  if (!active) {
    return { ok: false, message: "Non c'è musica attiva in questo server." };
  }
  if (!guild.members?.me?.voice?.channel?.id) {
    return {
      ok: false,
      message: "Il bot non è in un canale vocale: non c'è una sessione musica da fermare.",
    };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const stopGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!stopGate.ok) return stopGate;
  guildQueues.delete(guildId);
  endListeners.delete(guildId);
  if (player) {
    try {
      await player.destroy();
    } catch (_) {}
  }
  await leaveMusicVoiceChannelMarked(client, guildId);
  persistMusicQueueSnapshotNow(client);
  await musicPurgeTts(guildId, client).catch(() => {});
  try {
    const { clearVoiceSession } = require("../Voice/voiceSessionService") as typeof import("../Voice/voiceSessionService");
    clearVoiceSession(guildId);
  } catch (_) {}
  return { ok: true, message: "Musica fermata e coda svuotata." };
}

async function pauseToggle(interaction?, pause?) {
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  const player = interaction.client.shoukaku?.players?.get(guild.id);
  if (!player) return { ok: false, message: "Il bot non è in un canale vocale." };
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const ptGate = assertMusicCommandAllowed(interaction.client, guild, member, requester.id);
  if (!ptGate.ok) return ptGate;
  try {
    await player.setPaused(pause);
  } catch (err) {
    return { ok: false, message: err?.message || "Errore pausa." };
  }
  return { ok: true, message: pause ? "In pausa." : "Ripresa." };
}

async function pauseGuildTrack(interaction?) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guild.id);
  if (!player) {
    return { ok: false, message: "Il bot non è in un canale vocale." };
  }
  if (!player.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const pauGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!pauGate.ok) return pauGate;
  if (player.paused) {
    return { ok: false, message: "La traccia è già in pausa." };
  }
  const posMs = Number(player.position) || 0;
  const at = formatPlaybackPositionClock(posMs);
  try {
    await player.setPaused(true);
  } catch (err) {
    return { ok: false, message: err?.message || "Errore pausa." };
  }
  return { ok: true, positionLabel: at };
}

async function resumeGuildTrack(interaction?) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guild.id);
  if (!player) {
    return { ok: false, message: "Il bot non è in un canale vocale." };
  }
  if (!player.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const resGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!resGate.ok) return resGate;
  if (!player.paused) {
    return { ok: false, message: "La traccia non è in pausa." };
  }
  try {
    await player.setPaused(false);
  } catch (err) {
    return { ok: false, message: err?.message || "Errore ripresa." };
  }
  return { ok: true };
}

async function clearGuildQueue(interaction?) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const player = client.shoukaku?.players?.get(guildId);
  const session = getSession(guildId);
  const hadPending = Array.isArray(session.tracks) && session.tracks.length > 0;
  if (!hadPending) {
    return { ok: false, message: "La coda è già vuota." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const clrGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!clrGate.ok) return clrGate;
  session.tracks.length = 0;
  if (session.repeatQueue && player?.track) {
    session.repeatQueueSnapshot = buildRepeatQueueSnapshot(session, player);
  }
  return { ok: true };
}

export = { buildRepeatQueueSnapshot, setGuildMusicVolume, skipGuild, stopGuild, pauseToggle, pauseGuildTrack, resumeGuildTrack, clearGuildQueue };
