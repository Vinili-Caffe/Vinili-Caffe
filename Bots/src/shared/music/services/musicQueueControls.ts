/** Musica: comandi sulla coda (ripeti, precedente, mescola, riavvolgi, ricomincia). */
const { logMusic } = require("./musicSearch") as typeof import("./musicSearch");
const { safeDiscordLinkLabel, resolveSpotifyWebUrl, formatTrackTitleMarkdownLink } = require("./musicSpotifyLinks") as typeof import("./musicSpotifyLinks");
const { playEncodedFromStart, describeTrack, encodedFromPlayerTrack } = require("./musicMirror") as typeof import("./musicMirror");
const { musicHooks, guildQueues, assertMusicCommandAllowed } = require("./musicVoice") as typeof import("./musicVoice");
const { clearSessionCurrentRequester, getSession, isLavalinkUsable, initLavalinkMusicIfEnabled } = require("./musicEngine") as typeof import("./musicEngine");
const { buildRepeatQueueSnapshot } = require("./musicControls") as typeof import("./musicControls");

/* nameSearchOrig1: IT default; Coffee override via setMusicBotHooks */
function getNowPlayingEmbedTitle() {
  return String(musicHooks().nowPlayingTitle || "In riproduzione");
}
function formatNowPlayingLead(label?) {
  const title = getNowPlayingEmbedTitle();
  const verified = String(musicHooks().nowPlayingVerifiedPrefix || "").trim();
  const prefix = verified ? `${verified} ` : "";
  return label == null ? `${prefix}**${title}:**` : `${prefix}**${title}:** **${label}**`;
}

function syncRepeatQueueSnapshotAfterShuffle(session?) {
  if (!session?.repeatQueue || !Array.isArray(session.repeatQueueSnapshot) || session.repeatQueueSnapshot.length < 1) {
    return;
  }
  const head = session.repeatQueueSnapshot[0];
  session.repeatQueueSnapshot = [
    head,
    ...session.tracks.map((t?) => ({
      encoded: t.encoded,
      label: describeTrack(t),
    })),
  ];
}

function shuffleInPlace(arr?) {
  if (!Array.isArray(arr) || arr.length < 2) return;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

async function toggleRepeatOneGuild(interaction?, keyword?) {
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
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const repGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!repGate.ok) return repGate;
  const session = getSession(guild.id);
  const kw = String(keyword || "").trim().toLowerCase();

  if (kw === "disable" || kw === "off") {
    session.repeatOne = false;
    session.repeatEncoded = null;
    session.repeatQueue = false;
    session.repeatQueueSnapshot = null;
    return { ok: true, mode: "off", explicit: true };
  }
  if (kw === "queue") {
    session.repeatOne = false;
    session.repeatEncoded = null;
    session.repeatQueue = true;
    session.repeatQueueSnapshot = buildRepeatQueueSnapshot(session, player);
    if (!session.repeatQueueSnapshot.length) {
      session.repeatQueue = false;
      session.repeatQueueSnapshot = null;
      return { ok: false, message: "Impossibile attivare la ripetizione coda per questa traccia." };
    }
    return { ok: true, mode: "queue" };
  }
  if (kw === "enable" || kw === "on") {
    session.repeatQueue = false;
    session.repeatQueueSnapshot = null;
    if (session.repeatOne) {
      return { ok: true, mode: "on", already: true };
    }
    const enc = encodedFromPlayerTrack(player.track);
    if (!enc) {
      return { ok: false, message: "Impossibile attivare la ripetizione per questa traccia." };
    }
    session.repeatOne = true;
    session.repeatEncoded = enc;
    return { ok: true, mode: "on" };
  }
  if (kw) {
    return {
      ok: false,
      message:
        "Usa **disable**, **enable**, **queue**, oppure nessun argomento (toggle ripetizione traccia).",
    };
  }
  if (session.repeatQueue) {
    session.repeatQueue = false;
    session.repeatQueueSnapshot = null;
    return { ok: true, mode: "off", queueOff: true };
  }
  if (session.repeatOne) {
    session.repeatOne = false;
    session.repeatEncoded = null;
    return { ok: true, mode: "off", explicit: false };
  }
  const enc = encodedFromPlayerTrack(player.track);
  if (!enc) {
    return { ok: false, message: "Impossibile attivare la ripetizione per questa traccia." };
  }
  session.repeatOne = true;
  session.repeatEncoded = enc;
  return { ok: true, mode: "on" };
}

async function previousGuildTrack(interaction?) {
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
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const session = getSession(guildId);
  if (!Array.isArray(session.history) || !session.history.length) {
    return { ok: false, message: "Non c'è un brano precedente." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const prevGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!prevGate.ok) return prevGate;
  const prev = session.history.pop();
  if (!prev?.encoded) {
    return { ok: false, message: "Non c'è un brano precedente." };
  }
  const node =
    client.shoukaku?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof client.shoukaku?.getIdealNode === "function" ? client.shoukaku.getIdealNode() : null) ||
    (client.shoukaku?.nodes?.size ? client.shoukaku.nodes.values().next().value : null);
  const currentEnc = encodedFromPlayerTrack(player.track);
  const oldNowLabel = String(session.nowPlaying || "").trim() || "Traccia";
  if (currentEnc) {
    session.tracks.unshift({ encoded: currentEnc });
  }
  session.repeatOne = false;
  session.repeatEncoded = null;
  session.repeatQueue = false;
  session.repeatQueueSnapshot = null;
  session.nowPlaying = String(prev.label || "").trim() || "Traccia sconosciuta";
  clearSessionCurrentRequester(session);
  try {
    await playEncodedFromStart(player, prev.encoded);
  } catch (err) {
    session.history.push(prev);
    if (currentEnc) session.tracks.shift();
    session.nowPlaying = oldNowLabel;
    return { ok: false, message: err?.message || "Impossibile tornare al brano precedente." };
  }
  let embedDescription = `**${safeDiscordLinkLabel(session.nowPlaying)}**`;
  if (node?.rest?.decode) {
    try {
      const t = await node.rest.decode(prev.encoded);
      const label = describeTrack(t);
      session.nowPlaying = label;
      const url = await resolveSpotifyWebUrl(node, t);
      embedDescription = formatTrackTitleMarkdownLink(label, url);
    } catch (_) {}
  }
  const embedBody = `${formatNowPlayingLead()} ${embedDescription}`;
  return {
    ok: true,
    message: `${formatNowPlayingLead()} ${session.nowPlaying}`,
    embedTitle: getNowPlayingEmbedTitle(),
    embedDescription,
    embedBody,
  };
}

async function shuffleGuildQueue(interaction?) {
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
  const session = guildQueues.get(guildId);
  const tracks = session?.tracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { ok: false, message: "La coda è vuota: niente da mescolare." };
  }
  if (tracks.length < 2) {
    return { ok: false, message: "Servono almeno due brani in coda per mescolare." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const shufGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!shufGate.ok) return shufGate;
  shuffleInPlace(tracks);
  syncRepeatQueueSnapshotAfterShuffle(session);
  return { ok: true };
}

async function rewindGuildTrack(interaction?) {
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
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const rewGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!rewGate.ok) return rewGate;
  const enc = encodedFromPlayerTrack(player.track);
  if (!enc) {
    return { ok: false, message: "Impossibile riavvolgere questa traccia." };
  }
  let seekable = true;
  const node =
    client.shoukaku?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof client.shoukaku?.getIdealNode === "function" ? client.shoukaku.getIdealNode() : null) ||
    (client.shoukaku?.nodes?.size ? client.shoukaku.nodes.values().next().value : null);
  if (node?.rest?.decode) {
    try {
      const t = await node.rest.decode(enc);
      if (t?.info?.isSeekable === false) seekable = false;
    } catch (_) {}
  }
  if (seekable && typeof player.seekTo === "function") {
    try {
      await player.seekTo(0);
      return { ok: true };
    } catch (err) {
      logMusic("seekTo(0):", err?.message || err);
    }
  }
  try {
    await player.playTrack({ track: { encoded: enc } });
  } catch (err) {
    return { ok: false, message: err?.message || "Riavvolgimento non riuscito." };
  }
  return { ok: true };
}

async function restartQueueGuild(interaction?) {
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
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const session = getSession(guildId);
  const snap = buildRepeatQueueSnapshot(session, player);
  if (!snap.length) {
    return { ok: false, message: "Impossibile ricominciare la coda." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const rstGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!rstGate.ok) return rstGate;
  session.repeatOne = false;
  session.repeatEncoded = null;
  session.tracks = snap.slice(1).map((e?) => ({ encoded: e.encoded }));
  session.nowPlaying = String(snap[0].label || "").trim() || "Traccia sconosciuta";
  clearSessionCurrentRequester(session);
  if (session.repeatQueue) {
    session.repeatQueueSnapshot = snap.map((e?) => ({ encoded: e.encoded, label: e.label }));
  }
  try {
    await playEncodedFromStart(player, snap[0].encoded);
  } catch (err) {
    return { ok: false, message: err?.message || "Restart coda non riuscito." };
  }
  return { ok: true };
}

export = { getNowPlayingEmbedTitle, formatNowPlayingLead, toggleRepeatOneGuild, previousGuildTrack, shuffleGuildQueue, rewindGuildTrack, restartQueueGuild };
