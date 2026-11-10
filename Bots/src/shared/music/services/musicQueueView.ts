/** Musica: coda, brano in riproduzione e prossimi brani da mostrare. */
const { logMusic } = require("./musicSearch") as typeof import("./musicSearch");
const { safeDiscordLinkLabel, resolveSpotifyWebUrl, resolveSpotifyWebUrlSync, splitNowPlayingLabel } = require("./musicSpotifyLinks") as typeof import("./musicSpotifyLinks");
const { describeTrack, encodedFromPlayerTrack } = require("./musicMirror") as typeof import("./musicMirror");
const { guildQueues } = require("./musicVoice") as typeof import("./musicVoice");
const { isLavalinkUsable, initLavalinkMusicIfEnabled } = require("./musicEngine") as typeof import("./musicEngine");

async function fetchGuildQueueEntryRows(client?, guild?) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "La musica non è disponibile in questo momento: riprova tra poco." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);

  const rows = [];
  let queueIndex = 1;

  function pushRowFromTrack(trackObj?) {
    const info = trackObj?.info;
    const title = String(info?.title || "Senza titolo").trim();
    const author = String(info?.author || "?").trim();
    const ms = Number(info?.length || 0);
    const dur = formatTrackDurationMs(ms);
    const url = resolveSpotifyWebUrlSync(trackObj);
    rows.push({ queueIndex, dur, title, author, url });
    queueIndex += 1;
  }

  if (player?.track) {
    if (node?.rest?.decode) {
      try {
        const decoded = await node.rest.decode(encodedFromPlayerTrack(player.track));
        pushRowFromTrack(decoded);
      } catch (err) {
        logMusic("queue decode current:", err?.message || err);
        const label = String(session?.nowPlaying || "").trim() || "In riproduzione";
        const { title, author } = splitNowPlayingLabel(label);
        rows.push({
          queueIndex,
          dur: "—",
          title: title || label,
          author: author || "?",
          url: null,
        });
        queueIndex += 1;
      }
    } else {
      const label = String(session?.nowPlaying || "").trim() || "In riproduzione";
      const { title, author } = splitNowPlayingLabel(label);
      rows.push({
        queueIndex,
        dur: "—",
        title: title || label,
        author: author || "?",
        url: null,
      });
      queueIndex += 1;
    }
  }

  for (const t of pending) {
    let tr = t;
    if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(tr.encoded);
      } catch (_) {
        tr = null;
      }
    }
    if (!tr?.info) {
      rows.push({
        queueIndex,
        dur: "—",
        title: "Traccia",
        author: "?",
        url: null,
      });
      queueIndex += 1;
      continue;
    }
    pushRowFromTrack(tr);
  }

  if (!rows.length) {
    return { ok: false, message: "La coda è vuota e non c'è nulla in riproduzione." };
  }
  return { ok: true, rows };
}

function formatTrackDurationMs(ms?) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const totalSec = Math.floor(n / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatPlaybackPositionClock(ms?) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "00:00";
  const totalSec = Math.floor(n / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatEstimatedUntilPlayMs(ms?) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "00:00";
  const totalSec = Math.ceil(n / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function fetchGuildUpcomingQueueRows(client?, guild?) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "La musica non è disponibile in questo momento: riprova tra poco." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  if (!pending.length) {
    if (player?.track) {
      return { ok: false, message: "Non ci sono altri brani in coda." };
    }
    return { ok: false, message: "La coda è vuota." };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);

  let offsetMs = 0;
  if (player?.track && node?.rest?.decode) {
    try {
      const cur = await node.rest.decode(encodedFromPlayerTrack(player.track));
      const len = Number(cur?.info?.length);
      if (Number.isFinite(len) && len > 0) {
        const pos = Number(player.position) || 0;
        offsetMs = Math.max(0, len - pos);
      }
    } catch (err) {
      logMusic("upcoming decode current:", err?.message || err);
    }
  }

  const rows = [];
  let cumulative = offsetMs;
  let upcomingIndex = 1;
  for (const t of pending) {
    let tr = t;
    if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(tr.encoded);
      } catch (_) {
        tr = null;
      }
    }
    const etaClock = formatEstimatedUntilPlayMs(cumulative);
    if (!tr?.info) {
      rows.push({
        upcomingIndex,
        etaClock,
        title: "Traccia",
        author: "?",
        url: null,
      });
    } else {
      const title = String(tr.info.title || "Senza titolo").trim();
      const author = String(tr.info.author || "?").trim();
      const url = resolveSpotifyWebUrlSync(tr);
      rows.push({ upcomingIndex, etaClock, title, author, url });
      cumulative += Number(tr.info.length || 0);
    }
    upcomingIndex += 1;
  }
  return { ok: true, rows };
}

async function fetchGuildRequestedSessionRows(client?, guild?) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "La musica non è disponibile in questo momento: riprova tra poco." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  const history = Array.isArray(session?.history) ? session.history : [];
  if (!player?.track && !pending.length && !history.length) {
    return {
      ok: false,
      message:
        "Nessuna traccia in questa sessione (nessuna cronologia, niente in riproduzione e coda vuota). Avvia un brano con +play.",
    };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);

  const rows = [];
  let listIndex = 1;

  function pushRowFromDecoded(tr?) {
    const info = tr?.info;
    if (!info) return;
    const title = String(info.title || "Senza titolo").trim();
    const author = String(info.author || "?").trim();
    const ms = Number(info.length || 0);
    const dur = formatTrackDurationMs(ms);
    const url = resolveSpotifyWebUrlSync(tr);
    rows.push({ listIndex, dur, title, author, url });
    listIndex += 1;
  }

  for (const h of history) {
    let tr = null;
    const enc = typeof h?.encoded === "string" ? h.encoded : null;
    if (enc && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(enc);
      } catch (err) {
        logMusic("requested history decode:", err?.message || err);
      }
    }
    if (tr?.info) {
      pushRowFromDecoded(tr);
    } else {
      const label = String(h?.label || "").trim() || "Traccia";
      const { title, author } = splitNowPlayingLabel(label);
      rows.push({
        listIndex,
        dur: "—",
        title: title || label,
        author: author || "?",
        url: null,
      });
      listIndex += 1;
    }
  }

  if (player?.track) {
    const enc = encodedFromPlayerTrack(player.track);
    let tr = null;
    if (enc && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(enc);
      } catch (err) {
        logMusic("requested current decode:", err?.message || err);
      }
    }
    if (tr?.info) {
      pushRowFromDecoded(tr);
    } else {
      const label = String(session?.nowPlaying || "").trim() || "In riproduzione";
      const { title, author } = splitNowPlayingLabel(label);
      rows.push({
        listIndex,
        dur: "—",
        title: title || label,
        author: author || "?",
        url: null,
      });
      listIndex += 1;
    }
  }

  for (const t of pending) {
    let tr = t;
    if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(tr.encoded);
      } catch (_) {
        tr = null;
      }
    }
    if (!tr?.info) {
      rows.push({
        listIndex,
        dur: "—",
        title: "Traccia",
        author: "?",
        url: null,
      });
      listIndex += 1;
      continue;
    }
    pushRowFromDecoded(tr);
  }

  return { ok: true, rows };
}

async function fetchGuildNextUpDetails(client?, guild?) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "La musica non è disponibile in questo momento: riprova tra poco." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  if (!pending.length) {
    return { ok: false, message: "Non c'è un brano successivo in coda." };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);
  const first = pending[0];
  let tr = first;
  if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
    try {
      tr = await node.rest.decode(tr.encoded);
    } catch (_) {
      tr = first;
    }
  }
  if (!tr?.info) {
    return { ok: false, message: "Impossibile leggere il prossimo brano." };
  }

  let remainingCurrent = 0;
  const enc = encodedFromPlayerTrack(player.track);
  if (enc && node?.rest?.decode) {
    try {
      const cur = await node.rest.decode(enc);
      const len = Number(cur?.info?.length);
      if (Number.isFinite(len) && len > 0) {
        const pos = Number(player.position) || 0;
        remainingCurrent = Math.max(0, len - pos);
      }
    } catch (err) {
      logMusic("next up decode current:", err?.message || err);
    }
  }

  const estimatedMs = remainingCurrent;
  const lengthMs = Number(tr.info.length || 0);
  const label = describeTrack(tr);
  const url = node ? await resolveSpotifyWebUrl(node, tr) : null;
  const safeLabel = safeDiscordLinkLabel(label);
  const trackFieldValue = (url ? `[${safeLabel}](${url})` : `**${safeLabel}**`).slice(0, 1024);

  const art = String(tr.info.artworkUrl || "").trim();
  const thumbnailUrl = art.startsWith("http://") || art.startsWith("https://") ? art : null;

  return {
    ok: true,
    trackFieldValue,
    estimatedUntil: formatEstimatedUntilPlayMs(estimatedMs),
    length: formatTrackDurationMs(lengthMs),
    positionInQueue: 2,
    thumbnailUrl,
    requesterUserId: first.vcRequestedByUserId || null,
    requesterDisplayTag: first.vcRequestedByUserTag || null,
  };
}

function renderPlaybackProgressBar(positionMs?, lengthMs?, width = 14) {
  const w = Math.max(4, Math.min(32, Math.floor(Number(width)) || 14));
  const len = Number(lengthMs);
  const pos = Number(positionMs);
  if (!Number.isFinite(len) || len <= 0 || !Number.isFinite(pos) || pos < 0) {
    return "░".repeat(w);
  }
  const frac = Math.min(1, Math.max(0, pos / len));
  const filled = Math.round(frac * w);
  return `${"█".repeat(filled)}${"░".repeat(w - filled)}`;
}

async function fetchGuildNowPlayingDetails(client?, guild?) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "La musica non è disponibile in questo momento: riprova tra poco." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);
  const positionMs = Number(player.position) || 0;
  const paused = Boolean(player.paused);
  let tr = null;
  if (node?.rest?.decode) {
    try {
      tr = await node.rest.decode(encodedFromPlayerTrack(player.track));
    } catch (err) {
      logMusic("now playing decode:", err?.message || err);
    }
  }
  if (!tr?.info) {
    const label = String(session?.nowPlaying || "").trim();
    if (!label) {
      return { ok: false, message: "Dettagli sul brano in riproduzione non disponibili." };
    }
    const safe = safeDiscordLinkLabel(label);
    return {
      ok: true,
      trackFieldValue: `**${safe}**`.slice(0, 1024),
      progressBar: renderPlaybackProgressBar(positionMs, 0, 14),
      positionClock: formatPlaybackPositionClock(positionMs),
      lengthClock: "—",
      thumbnailUrl: null,
      positionInQueue: 1,
      requesterUserId: session?.currentRequesterUserId || null,
      requesterDisplayTag: session?.currentRequesterUserTag || null,
      paused,
    };
  }
  const lengthMs = Number(tr.info.length || 0);
  const label = describeTrack(tr);
  const url = node ? await resolveSpotifyWebUrl(node, tr) : null;
  const safeLabel = safeDiscordLinkLabel(label);
  const trackFieldValue = (url ? `[${safeLabel}](${url})` : `**${safeLabel}**`).slice(0, 1024);
  const art = String(tr.info.artworkUrl || "").trim();
  const thumbnailUrl = art.startsWith("http://") || art.startsWith("https://") ? art : null;
  return {
    ok: true,
    trackFieldValue,
    progressBar: renderPlaybackProgressBar(positionMs, lengthMs, 14),
    positionClock: formatPlaybackPositionClock(positionMs),
    lengthClock: formatTrackDurationMs(lengthMs),
    thumbnailUrl,
    positionInQueue: 1,
    requesterUserId: session?.currentRequesterUserId || null,
    requesterDisplayTag: session?.currentRequesterUserTag || null,
    paused,
  };
}

function formatQueue(interaction?) {
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const player = interaction.client.shoukaku?.players?.get(guild.id);
  const session = guildQueues.get(guild.id);
  const lines = [];
  if (player?.track && session?.nowPlaying) {
    lines.push(`**In riproduzione:** ${session.nowPlaying}`);
  } else if (player?.track) {
    lines.push("**In riproduzione** (dettagli non disponibili)");
  } else {
    lines.push("Nessuna traccia attiva.");
  }
  if (session?.tracks?.length) {
    session.tracks.slice(0, 15).forEach((t?, i?) => {
      lines.push(`${i + 1}. ${describeTrack(t)}`);
    });
    if (session.tracks.length > 15) {
      lines.push(`… e altre ${session.tracks.length - 15}.`);
    }
  } else {
    lines.push("Coda vuota.");
  }
  return { ok: true, message: lines.join("\n") };
}

export = { fetchGuildQueueEntryRows, formatTrackDurationMs, formatPlaybackPositionClock, formatEstimatedUntilPlayMs, fetchGuildUpcomingQueueRows, fetchGuildRequestedSessionRows, fetchGuildNextUpDetails, fetchGuildNowPlayingDetails, formatQueue };
