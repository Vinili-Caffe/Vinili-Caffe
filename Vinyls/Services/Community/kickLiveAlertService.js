const { EmbedBuilder } = require("discord.js");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const IDs = require("../../Utils/Config/ids");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");

const execFileAsync = promisify(execFile);
const STATE_KEY = "kickLiveAlert.v1";
const DEFAULT_POLL_INTERVAL_SEC = 90;
const DEFAULT_REANNOUNCE_COOLDOWN_SEC = 45 * 60;
const TOKEN_REFRESH_BUFFER_MS = 120_000;
const KICK_TOKEN_URL = "https://id.kick.com/oauth/token";
const KICK_API_CHANNELS_URL = "https://api.kick.com/public/v1/channels";
const KICK_PUBLIC_LOOKUP_SCRIPT = path.join(__dirname, "../../Scripts/kickChannelLookup.py");
const KICK_VIDEOS_LOOKUP_SCRIPT = path.join(__dirname, "../../Scripts/kickVideosLookup.py");
const KICK_BRAND_COLOR = "#53FC18";
const loopStarted = new WeakSet();
let tokenCache = { accessToken: "", expiresAt: 0 };
let pollInFlight = false;

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(www\.)?kick\.com\//i, "")
    .split(/[/?#]/)[0];
}

function resolveConfig(client) {
  const raw = client?.config?.kickLiveAlerts && typeof client.config.kickLiveAlerts === "object"
    ? client.config.kickLiveAlerts
    : {};
  const pollIntervalSec = Math.max(60, Math.min(600, Math.floor(Number(raw.pollIntervalSec) || DEFAULT_POLL_INTERVAL_SEC)));
  const reannounceCooldownSec = Math.max(
    300,
    Math.min(6 * 3600, Math.floor(Number(raw.reannounceCooldownSec) || DEFAULT_REANNOUNCE_COOLDOWN_SEC)),
  );
  const channelId = String(raw.channelId || IDs.channels?.news || "").trim();
  const pingRoleId = String(raw.pingRoleId || IDs.roles?.Live || "").trim();
  const streamers = (Array.isArray(raw.streamers) ? raw.streamers : [])
    .map((entry) => {
      const slug = normalizeSlug(entry?.slug || entry?.login || entry?.username);
      if (!slug || slug === "replace_me") return null;
      const streamVoiceChannelId = String(
        entry?.streamVoiceChannelId || raw.streamVoiceChannelId || "",
      ).trim() || null;
      const voiceStatusOn = String(entry?.voiceStatusOn || "").trim()
        || `Sono in live su https://kick.com/${slug}`;
      return {
        slug,
        login: slug,
        displayName: String(entry?.displayName || entry?.label || slug).trim() || slug,
        discordUserId: String(entry?.discordUserId || "").trim() || null,
        streamVoiceChannelId,
        voiceNameOn: String(entry?.voiceNameOn || "").trim() || null,
        voiceNameOff: String(entry?.voiceNameOff || "").trim() || null,
        voiceStatusOn,
        deleteAnnouncementOnOffline: entry?.deleteAnnouncementOnOffline === true,
      };
    })
    .filter(Boolean);
  const clientId = String(process.env.KICK_CLIENT_ID || raw.clientId || "").trim();
  const clientSecret = String(process.env.KICK_CLIENT_SECRET || raw.clientSecret || "").trim();
  return {
    enabled: raw.enabled !== false,
    pollIntervalSec,
    reannounceCooldownSec,
    channelId,
    pingRoleId,
    streamers,
    clientId,
    clientSecret,
    preferOfficialApi: raw.preferOfficialApi !== false,
  };
}

function isConfigured(cfg) {
  return Boolean(cfg.enabled && cfg.channelId && cfg.pingRoleId && cfg.streamers.length);
}

async function getAppAccessToken(clientId, clientSecret) {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.accessToken;
  }
  const body = new URLSearchParams({
    client_id: String(clientId || "").trim(),
    client_secret: String(clientSecret || "").trim(),
    grant_type: "client_credentials",
  });
  let res = null;
  let fetchErr = null;
  try {
    res = await fetch(KICK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    fetchErr = err;
  }
  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "";
    const net = fetchErr?.cause?.code || fetchErr?.cause?.message || fetchErr?.message || "";
    const detail = String(text || net || "").trim().slice(0, 240);
    throw new Error(`Kick token HTTP ${res?.status || "?"} ${detail}`.trim());
  }
  const data = await res.json().catch(() => ({}));
  const accessToken = String(data?.access_token || "").trim();
  const expiresIn = Math.max(300, Math.floor(Number(data?.expires_in) || 3600));
  if (!accessToken) throw new Error("Kick token response missing access_token");
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

function normalizeLiveStreamFromOfficial(channel) {
  const stream = channel?.stream && typeof channel.stream === "object" ? channel.stream : null;
  if (!stream || stream.is_live !== true) return null;
  const slug = normalizeSlug(channel?.slug);
  const startTime = String(stream.start_time || "").trim();
  const broadcasterId = String(channel?.broadcaster_user_id || "").trim();
  const id = startTime && broadcasterId
    ? `${broadcasterId}:${startTime}`
    : `${broadcasterId || slug}:${startTime || "live"}`;
  return {
    id,
    slug,
    kind: "live",
    title: String(channel?.stream_title || "Diretta in corso").trim() || "Diretta in corso",
    category: String(channel?.category?.name || "").trim(),
    viewer_count: Math.max(0, Math.floor(Number(stream.viewer_count) || 0)),
    thumbnail_url: String(stream.thumbnail || "").trim() || null,
    started_at: startTime || null,
  };
}

function normalizeLiveStreamFromPublic(payload) {
  const livestream = payload?.livestream && typeof payload.livestream === "object" ? payload.livestream : null;
  if (!livestream || !livestream.id) return null;
  if (livestream.is_live !== true && livestream.is_live !== 1 && livestream.is_live !== "true") {
    // Kick lascia playback_url anche offline → non trattare come live.
    return null;
  }
  const slug = normalizeSlug(payload?.slug || payload?.user?.username);
  const categories = Array.isArray(livestream.categories) ? livestream.categories : [];
  const categoryName = String(categories[0]?.name || livestream.category?.name || "").trim();
  const thumb =
    String(livestream?.thumbnail?.url || livestream?.thumbnail || "").trim() || null;
  return {
    id: String(livestream.id),
    slug,
    kind: "live",
    title: String(livestream.session_title || livestream.title || "Diretta in corso").trim() || "Diretta in corso",
    category: categoryName,
    viewer_count: Math.max(0, Math.floor(Number(livestream.viewer_count) || 0)),
    thumbnail_url: thumb,
    started_at: String(livestream.created_at || livestream.start_time || "").trim() || null,
    playback_url: String(payload?.playback_url || "").trim() || null,
  };
}

async function fetchLiveStreamsOfficial(accessToken, slugs) {
  if (!slugs.length) return [];
  const url = new URL(KICK_API_CHANNELS_URL);
  for (const slug of slugs) url.searchParams.append("slug", slug);
  let res = null;
  let fetchErr = null;
  try {
    res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (err) {
    fetchErr = err;
  }
  if (!res?.ok) {
    const text = res ? await res.text().catch(() => "") : "";
    const net = fetchErr?.cause?.code || fetchErr?.cause?.message || fetchErr?.message || "";
    const detail = String(text || net || "").trim().slice(0, 240);
    throw new Error(`Kick channels HTTP ${res?.status || "?"} ${detail}`.trim());
  }
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.data) ? data.data : [];
  return rows.map(normalizeLiveStreamFromOfficial).filter(Boolean);
}

async function fetchLiveStreamPublic(slug) {
  const key = normalizeSlug(slug);
  if (!key) return null;
  // Kick WAF blocks Node/curl TLS fingerprints; Python urllib still works.
  let stdout = "";
  try {
    const result = await execFileAsync("python3", [KICK_PUBLIC_LOOKUP_SCRIPT, key], {
      timeout: 25_000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = String(result?.stdout || "").trim();
  } catch (err) {
    stdout = String(err?.stdout || "").trim();
    if (!stdout) {
      throw new Error(`Kick public lookup failed: ${err?.message || err}`);
    }
  }
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Kick public lookup invalid JSON: ${stdout.slice(0, 180)}`);
  }
  if (!parsed?.ok) {
    const detail = String(parsed?.error || parsed?.status || "unknown").slice(0, 240);
    throw new Error(`Kick public channel HTTP ${parsed?.status || "?"} ${detail}`.trim());
  }
  return normalizeLiveStreamFromPublic(parsed.data || {});
}

function normalizeVodFromPublic(channelSlug, video) {
  if (!video || typeof video !== "object") return null;
  if (video.is_live === true) return null;
  const vodSlug = String(video.slug || "").trim();
  const id = String(video.id || "").trim();
  const source = String(video.source || "").trim();
  if (!id || !source) return null;
  const channel = normalizeSlug(channelSlug);
  const categories = Array.isArray(video.categories) ? video.categories : [];
  const categoryName = String(categories[0]?.name || video.category?.name || "").trim();
  const thumb =
    String(video?.thumbnail?.src || video?.thumbnail?.url || video?.thumbnail || "").trim() || null;
  const views = Math.max(0, Math.floor(Number(video.views ?? video.viewer_count) || 0));
  return {
    id: `vod:${id}`,
    slug: channel,
    kind: "vod",
    title: String(video.session_title || video.title || "Ultimo VOD").trim() || "Ultimo VOD",
    category: categoryName,
    viewer_count: views,
    thumbnail_url: thumb,
    started_at: String(video.created_at || video.start_time || "").trim() || null,
    playback_url: source,
    vod_slug: vodSlug || null,
    duration_ms: Math.max(0, Math.floor(Number(video.duration) || 0)),
    url: channel && vodSlug ? `https://kick.com/${channel}/videos/${encodeURIComponent(vodSlug)}` : channel ? `https://kick.com/${channel}` : "https://kick.com/",
  };
}

async function fetchLatestVodPublic(slug) {
  const key = normalizeSlug(slug);
  if (!key) return null;
  let stdout = "";
  try {
    const result = await execFileAsync("python3", [KICK_VIDEOS_LOOKUP_SCRIPT, key], {
      timeout: 25_000,
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    stdout = String(result?.stdout || "").trim();
  } catch (err) {
    stdout = String(err?.stdout || "").trim();
    if (!stdout) {
      throw new Error(`Kick videos lookup failed: ${err?.message || err}`);
    }
  }
  let parsed = null;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`Kick videos lookup invalid JSON: ${stdout.slice(0, 180)}`);
  }
  if (!parsed?.ok) {
    const detail = String(parsed?.error || parsed?.status || "unknown").slice(0, 240);
    throw new Error(`Kick videos HTTP ${parsed?.status || "?"} ${detail}`.trim());
  }
  const rows = Array.isArray(parsed.data) ? parsed.data : [];
  for (const row of rows) {
    const vod = normalizeVodFromPublic(key, row);
    if (vod) return vod;
  }
  return null;
}

async function fetchLiveStreams(cfg) {
  const slugs = cfg.streamers.map((s) => s.slug);
  if (cfg.preferOfficialApi && cfg.clientId && cfg.clientSecret) {
    try {
      const token = await getAppAccessToken(cfg.clientId, cfg.clientSecret);
      return await fetchLiveStreamsOfficial(token, slugs);
    } catch (err) {
      global.logger?.warn?.("[KICK LIVE] official API failed, falling back to public:", err?.message || err);
    }
  }
  const out = [];
  for (const slug of slugs) {
    const stream = await fetchLiveStreamPublic(slug);
    if (stream) out.push(stream);
  }
  return out;
}

function buildAnnouncementContent({ streamer, stream, pingRoleId }) {
  const slug = normalizeSlug(streamer.slug || streamer.login);
  const displayName = String(streamer.displayName || stream?.slug || slug).trim() || slug;
  const title = String(stream?.title || "Diretta in corso").trim() || "Diretta in corso";
  const game = String(stream?.category || "").trim();
  const url = `https://kick.com/${slug}`;
  const viewerCount = Math.max(0, Math.floor(Number(stream?.viewer_count) || 0));
  const userMention = streamer.discordUserId ? `<@${streamer.discordUserId}>` : displayName;

  const lines = [
    "# <a:VC_TwitchLive:1524066585646596106> LIVE SU KICK",
    "",
    `> <a:VC_HeartsPink:1468685897389052008> **${userMention}** è in live adesso!`,
    "",
    `<:VC_Info:1482526956703580372> **${title}**`,
  ];
  if (game) lines.push(`<:VC_CommunityManager:1494286896459681924> Categoria: **${game}**`);
  if (viewerCount > 0) lines.push(`<:VC_Stats:1482527532682055780> Spettatori: **${viewerCount.toLocaleString("it-IT")}**`);
  lines.push("", `<:VC_Reply:1482532158080942191> [Guarda la diretta](${url})`);
  lines.push("", `<a:VC_Ping:1482694298687246377>︲<@&${pingRoleId}>`);

  const embed = new EmbedBuilder()
    .setColor(KICK_BRAND_COLOR)
    .setURL(url)
    .setTitle(`${displayName} è in live su Kick`)
    .setDescription(title.slice(0, 4096));
  if (stream?.thumbnail_url) embed.setImage(String(stream.thumbnail_url).slice(0, 2048));
  if (game) embed.addFields({ name: "Categoria", value: game.slice(0, 256), inline: true });
  if (viewerCount > 0) {
    embed.addFields({ name: "Spettatori", value: viewerCount.toLocaleString("it-IT"), inline: true });
  }

  return {
    content: lines.join("\n"),
    embeds: [embed],
    allowedMentions: { roles: [pingRoleId], users: streamer.discordUserId ? [streamer.discordUserId] : [] },
  };
}

async function loadState() {
  const raw = await getBotState(STATE_KEY, null);
  const streamers = raw?.streamers && typeof raw.streamers === "object" ? raw.streamers : {};
  return { streamers };
}

async function saveStreamerState(slug, patch) {
  const key = normalizeSlug(slug);
  if (!key) return;
  const state = await loadState();
  const prev = state.streamers[key] && typeof state.streamers[key] === "object" ? state.streamers[key] : {};
  state.streamers[key] = { ...prev, ...patch };
  await setBotState(STATE_KEY, state);
}

function parseIsoMs(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function evaluateLiveAnnouncementDecision(prev, streamId, reannounceCooldownSec, { ignoreCooldown = false } = {}) {
  const sid = String(streamId || "").trim();
  if (!sid) return { publish: false, silentStreamIdUpdate: false, reason: "no_stream" };
  if (String(prev?.lastStreamId || "") === sid) {
    return { publish: false, silentStreamIdUpdate: false, reason: "already_announced" };
  }

  const cooldownMs = Math.max(0, Number(reannounceCooldownSec) || 0) * 1000;
  const lastAnnouncedMs = parseIsoMs(prev?.announcedAt);
  if (!ignoreCooldown && cooldownMs > 0 && lastAnnouncedMs > 0) {
    const elapsedMs = Date.now() - lastAnnouncedMs;
    if (elapsedMs < cooldownMs) {
      return {
        publish: false,
        silentStreamIdUpdate: true,
        reason: "reannounce_cooldown",
      };
    }
  }

  return { publish: true, silentStreamIdUpdate: false, reason: "publish" };
}

async function publishLiveAnnouncement(client, cfg, streamer, stream) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return { ok: false, reason: "missing_guild" };
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "guild_unavailable" };
  const channel = guild.channels.cache.get(cfg.channelId) || (await getGuildChannelCached(guild, cfg.channelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_unavailable" };

  const payload = buildAnnouncementContent({ streamer, stream, pingRoleId: cfg.pingRoleId });
  const sent = await channel.send(payload).catch((err) => {
    global.logger?.warn?.("[KICK LIVE] send failed:", err?.message || err);
    return null;
  });
  if (!sent?.id) return { ok: false, reason: "send_failed" };

  await saveStreamerState(streamer.slug, {
    lastStreamId: String(stream?.id || ""),
    announcedAt: new Date().toISOString(),
    isLive: true,
    messageId: String(sent.id),
    channelId: String(channel.id),
  });
  return { ok: true, messageId: String(sent.id) };
}

function cfgChannelId(client) {
  return String(resolveConfig(client)?.channelId || "").trim();
}

async function deleteLiveAnnouncementMessage(client, streamer, prev) {
  if (!streamer?.deleteAnnouncementOnOffline) {
    return { ok: false, reason: "disabled" };
  }
  const messageId = String(prev?.messageId || "").trim();
  const channelId = String(prev?.channelId || cfgChannelId(client) || "").trim();
  if (!messageId || !channelId) return { ok: false, reason: "no_message" };

  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "guild_unavailable" };
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_unavailable" };

  const deleted = await channel.messages.delete(messageId).then(() => true).catch((err) => {
    if (err?.code === 10008) return true;
    global.logger?.warn?.("[KICK LIVE] delete failed:", streamer.slug, err?.message || err);
    return false;
  });
  if (!deleted) return { ok: false, reason: "delete_failed" };

  return { ok: true };
}

async function setVoiceChannelStatus(client, channelId, status, reason = "Kick live status") {
  const chId = String(channelId || "").trim();
  if (!chId || !client?.rest) return false;
  const statusText = String(status || "").trim();
  try {
    if (statusText) {
      await client.rest.put(`/channels/${chId}/voice-status`, {
        body: { status: statusText.slice(0, 500) },
        reason,
      });
    } else {
      await client.rest.put(`/channels/${chId}/voice-status`, {
        body: { status: "" },
        reason,
      }).catch(() => client.rest.delete(`/channels/${chId}/voice-status`, { reason }));
    }
    return true;
  } catch (err) {
    const msg = String(err?.message || err || "");
    // Stage / forum / ecc.: l'API voice-status non è supportata — non spammiamo i log.
    if (/Cannot execute action on this channel type/i.test(msg) || Number(err?.code) === 50024) {
      return false;
    }
    global.logger?.warn?.("[KICK LIVE] voice status failed:", chId, msg);
    return false;
  }
}

function isStageChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isStageChannel === "function" && channel.isStageChannel()) return true;
  return Number(channel.type) === 13;
}

function channelSupportsVoiceStatus(channel) {
  if (!channel?.isVoiceBased?.()) return false;
  // GuildStageVoice: rename ok, voice-status no → usiamo il topic Stage.
  if (isStageChannel(channel)) return false;
  return true;
}

/**
 * Topic Stage (max 120). ON: crea/aggiorna Stage Instance; OFF: chiude l'istanza.
 */
async function syncKickStageTopic(guild, channel, topic, live) {
  if (!guild?.stageInstances || !isStageChannel(channel)) return false;
  const channelId = String(channel.id || "").trim();
  if (!channelId) return false;
  const topicText = String(topic || "").trim().slice(0, 120);

  try {
    let existing = channel.stageInstance || null;
    if (!existing && guild.stageInstances.cache?.size) {
      existing =
        guild.stageInstances.cache.find((row) => String(row?.channelId || "") === channelId) || null;
    }
    if (!existing) {
      const fetched = await guild.stageInstances.fetch(channelId).catch(() => null);
      if (fetched) existing = fetched;
    }

    if (live) {
      if (!topicText) return false;
      if (existing) {
        if (String(existing.topic || "") === topicText) return true;
        if (typeof existing.setTopic === "function") {
          await existing.setTopic(topicText);
        } else {
          await guild.stageInstances.edit(channelId, { topic: topicText });
        }
        return true;
      }
      try {
        await guild.stageInstances.create(channelId, {
          topic: topicText,
          privacyLevel: 2, // GuildOnly
        });
      } catch (createErr) {
        const msg = String(createErr?.message || createErr || "");
        // Istanza già attiva (avviata a mano): aggiorna solo il topic.
        if (/already|exist/i.test(msg) || Number(createErr?.code) === 150000 || Number(createErr?.code) === 150006) {
          await guild.stageInstances.edit(channelId, { topic: topicText });
        } else {
          throw createErr;
        }
      }
      return true;
    }

    if (existing) {
      if (typeof existing.delete === "function") {
        await existing.delete();
      } else {
        await guild.stageInstances.delete(channelId);
      }
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[KICK LIVE] stage topic failed:", channelId, err?.message || err);
    return false;
  }
}

async function updateStreamVoiceChannelById(client, channelId, streamer, mode) {
  channelId = String(channelId || "").trim();
  if (!channelId) return { ok: false, reason: "missing_channel" };
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false, reason: "guild_unavailable" };
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isVoiceBased?.()) return { ok: false, reason: "channel_unavailable" };

  const isOn = String(mode || "").toLowerCase() === "on";
  const name = isOn
    ? String(streamer.voiceNameOn || "").trim()
    : String(streamer.voiceNameOff || "").trim();
  if (name && String(channel.name || "") !== name.slice(0, 100)) {
    await channel.setName(name.slice(0, 100), `Kick live ${isOn ? "ON" : "OFF"}`).catch((err) => {
      global.logger?.warn?.("[KICK LIVE] rename failed:", channelId, err?.message || err);
    });
  }
  if (isStageChannel(channel)) {
    await syncKickStageTopic(guild, channel, streamer.voiceStatusOn, isOn);
  } else if (channelSupportsVoiceStatus(channel)) {
    if (isOn) {
      await setVoiceChannelStatus(client, channelId, streamer.voiceStatusOn, "Kick live ON");
    } else {
      await setVoiceChannelStatus(client, channelId, "", "Kick live OFF");
    }
  }
  return { ok: true, channelId, mode: isOn ? "on" : "off" };
}

async function updateStreamVoiceChannel(client, streamer, mode) {
  return updateStreamVoiceChannelById(client, streamer?.streamVoiceChannelId, streamer, mode);
}

async function applyStreamerOfflineState(client, streamer, prev) {
  const patch = {
    isLive: false,
    voiceChannelMode: "off",
    voiceChannelId: null,
    lastOfflineAt: new Date().toISOString(),
  };
  if (prev?.messageId) {
    const deleted = await deleteLiveAnnouncementMessage(client, streamer, prev);
    if (deleted.ok) {
      patch.messageId = null;
      patch.channelId = null;
    }
  }
  await saveStreamerState(streamer.slug, patch);
  if (prev?.voiceChannelMode !== "off") {
    const offChannelId = String(prev?.voiceChannelId || streamer.streamVoiceChannelId || "").trim();
    if (offChannelId) {
      await updateStreamVoiceChannelById(client, offChannelId, streamer, "off");
    }
  }
}

async function applyStreamerOnlineVoiceState(client, streamer, prev) {
  const configuredChannelId = String(streamer?.streamVoiceChannelId || "").trim();
  if (!configuredChannelId) return { ok: false, reason: "missing_channel" };
  const previousChannelId = String(prev?.voiceChannelId || "").trim();
  if (prev?.voiceChannelMode === "on" && previousChannelId === configuredChannelId) {
    // Già ON: riallinea comunque il topic Stage (es. palco già avviato a mano).
    await updateStreamVoiceChannelById(client, configuredChannelId, streamer, "on");
    return { ok: true, skipped: true, reason: "already_on" };
  }
  if (prev?.voiceChannelMode === "on" && previousChannelId && previousChannelId !== configuredChannelId) {
    await updateStreamVoiceChannelById(client, previousChannelId, streamer, "off");
  }
  const channel = await updateStreamVoiceChannel(client, streamer, "on");
  if (channel?.ok) {
    await saveStreamerState(streamer.slug, {
      voiceChannelMode: "on",
      voiceChannelId: configuredChannelId,
    });
  }
  return channel;
}

async function runKickLiveAlertPoll(client) {
  if (pollInFlight) return;
  const cfg = resolveConfig(client);
  if (!isConfigured(cfg)) return;

  pollInFlight = true;
  try {
    const streams = await fetchLiveStreams(cfg);
    const liveBySlug = new Map(streams.map((stream) => [normalizeSlug(stream?.slug), stream]));
    const state = await loadState();

    for (const streamer of cfg.streamers) {
      const stream = liveBySlug.get(streamer.slug);
      const prev = state.streamers?.[streamer.slug];

      if (!stream?.id) {
        if (prev?.isLive || prev?.voiceChannelMode === "on") {
          await applyStreamerOfflineState(client, streamer, prev);
        }
        continue;
      }

      const streamId = String(stream.id);
      // Treat as "never announced" if we only marked live without a successful post.
      const prevAnnounced = Boolean(prev?.announcedAt && prev?.messageId);
      const decisionPrev = prevAnnounced
        ? prev
        : { ...prev, lastStreamId: null, announcedAt: null, messageId: null };
      const decision = evaluateLiveAnnouncementDecision(decisionPrev, streamId, cfg.reannounceCooldownSec);
      if (!decision.publish) {
        if (decision.silentStreamIdUpdate && prevAnnounced) {
          await saveStreamerState(streamer.slug, {
            isLive: true,
            lastStreamId: streamId,
            voiceChannelMode: streamer.streamVoiceChannelId ? "on" : prev?.voiceChannelMode,
          });
        }
      } else {
        const published = await publishLiveAnnouncement(client, cfg, streamer, stream);
        if (!published?.ok) {
          // Keep lastStreamId unset so the next poll retries the news post.
          await saveStreamerState(streamer.slug, {
            isLive: true,
            lastStreamId: null,
            announcedAt: null,
            messageId: null,
          });
        }
      }

      // Voice after announce so a stuck Discord rename cannot block the news post.
      try {
        await Promise.race([
          applyStreamerOnlineVoiceState(client, streamer, prev),
          new Promise((resolve) => setTimeout(() => resolve({ ok: false, reason: "timeout" }), 12_000)),
        ]);
      } catch (err) {
        global.logger?.warn?.("[KICK LIVE] voice update failed:", streamer.slug, err?.message || err);
      }
    }
  } catch (err) {
    global.logger?.warn?.("[KICK LIVE] poll failed:", err?.message || err);
  } finally {
    pollInFlight = false;
  }
}

function startKickLiveAlertLoop(client) {
  if (!client || loopStarted.has(client)) return;
  const cfg = resolveConfig(client);
  if (!cfg.enabled) return;
  if (!cfg.streamers.length) {
    global.logger?.warn?.("[KICK LIVE] enabled but no streamers configured in kickLiveAlerts.streamers");
    return;
  }
  if (!cfg.channelId || !cfg.pingRoleId) {
    global.logger?.warn?.("[KICK LIVE] missing news channel or Live ping role id");
    return;
  }
  loopStarted.add(client);
  const intervalMs = cfg.pollIntervalSec * 1000;
  const tick = () => runKickLiveAlertPoll(client).catch(() => {});
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  client._kickLiveAlertInterval = timer;
}

module.exports = {
  startKickLiveAlertLoop,
  runKickLiveAlertPoll,
  evaluateLiveAnnouncementDecision,
  resolveConfig,
  fetchLiveStreams,
  fetchLiveStreamPublic,
  fetchLatestVodPublic,
  buildAnnouncementContent,
  normalizeSlug,
  updateStreamVoiceChannelById,
};
