const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const STATE_KEY = "twitchLiveAlert.v1";
const DEFAULT_POLL_INTERVAL_SEC = 90;
const TOKEN_REFRESH_BUFFER_MS = 120_000;
const loopStarted = new WeakSet();
let tokenCache = { accessToken: "", expiresAt: 0 };
let pollInFlight = false;

function normalizeLogin(value) {
  return String(value || "").trim().toLowerCase().replace(/^@/, "");
}

function resolveConfig(client) {
  const raw = client?.config?.twitchLiveAlerts && typeof client.config.twitchLiveAlerts === "object"
    ? client.config.twitchLiveAlerts
    : {};
  const pollIntervalSec = Math.max(60, Math.min(600, Math.floor(Number(raw.pollIntervalSec) || DEFAULT_POLL_INTERVAL_SEC)));
  const channelId = String(raw.channelId || IDs.channels?.news || "").trim();
  const pingRoleId = String(raw.pingRoleId || IDs.roles?.Live || "").trim();
  const streamers = (Array.isArray(raw.streamers) ? raw.streamers : [])
    .map((entry) => {
      const login = normalizeLogin(entry?.login);
      if (!login || login === "replace_me") return null;
      const streamVoiceChannelId = String(
        entry?.streamVoiceChannelId || raw.streamVoiceChannelId || "",
      ).trim() || null;
      const voiceStatusOn = String(entry?.voiceStatusOn || "").trim()
        || `Sono in live su https://www.twitch.tv/${login}`;
      return {
        login,
        displayName: String(entry?.displayName || entry?.label || login).trim() || login,
        discordUserId: String(entry?.discordUserId || "").trim() || null,
        streamVoiceChannelId,
        voiceNameOn: String(entry?.voiceNameOn || "").trim() || null,
        voiceNameOff: String(entry?.voiceNameOff || "").trim() || null,
        voiceStatusOn,
      };
    })
    .filter(Boolean);
  const clientId = String(process.env.TWITCH_CLIENT_ID || raw.clientId || "").trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || raw.clientSecret || "").trim();
  return {
    enabled: raw.enabled !== false,
    pollIntervalSec,
    channelId,
    pingRoleId,
    streamers,
    clientId,
    clientSecret,
  };
}

function isConfigured(cfg) {
  return Boolean(cfg.enabled && cfg.channelId && cfg.pingRoleId && cfg.streamers.length && cfg.clientId && cfg.clientSecret);
}

async function getAppAccessToken(clientId, clientSecret) {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt > now + TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.accessToken;
  }
  const url = new URL("https://id.twitch.tv/oauth2/token");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("grant_type", "client_credentials");
  const res = await fetch(url, { method: "POST" }).catch(() => null);
  if (!res?.ok) {
    const body = await res?.text?.().catch(() => "");
    throw new Error(`Twitch token HTTP ${res?.status || "?"} ${body || ""}`.trim());
  }
  const data = await res.json().catch(() => ({}));
  const accessToken = String(data?.access_token || "").trim();
  const expiresIn = Math.max(300, Math.floor(Number(data?.expires_in) || 3600));
  if (!accessToken) throw new Error("Twitch token response missing access_token");
  tokenCache = { accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

async function fetchLiveStreams(clientId, accessToken, logins) {
  if (!logins.length) return [];
  const url = new URL("https://api.twitch.tv/helix/streams");
  for (const login of logins) url.searchParams.append("user_login", login);
  const res = await fetch(url, {
    headers: {
      "Client-Id": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => null);
  if (!res?.ok) {
    const body = await res?.text?.().catch(() => "");
    throw new Error(`Twitch streams HTTP ${res?.status || "?"} ${body || ""}`.trim());
  }
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.data) ? data.data : [];
}

function buildStreamThumbnailUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return null;
  return url.replace("{width}", "1280").replace("{height}", "720");
}

function buildAnnouncementContent({ streamer, stream, pingRoleId }) {
  const login = normalizeLogin(streamer.login);
  const displayName = String(streamer.displayName || stream?.user_name || login).trim() || login;
  const title = String(stream?.title || "Diretta in corso").trim() || "Diretta in corso";
  const game = String(stream?.game_name || "").trim();
  const url = `https://www.twitch.tv/${login}`;
  const viewerCount = Math.max(0, Math.floor(Number(stream?.viewer_count) || 0));
  const userMention = streamer.discordUserId ? `<@${streamer.discordUserId}>` : displayName;

  const lines = [
    "# <a:VC_Announce:1482534613568979007> LIVE SU TWITCH",
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
    .setColor("#9146FF")
    .setURL(url)
    .setTitle(`${displayName} è in live su Twitch`)
    .setDescription(title.slice(0, 4096));
  const thumb = buildStreamThumbnailUrl(stream?.thumbnail_url);
  if (thumb) embed.setImage(thumb);
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

async function saveStreamerState(login, patch) {
  const key = normalizeLogin(login);
  if (!key) return;
  const state = await loadState();
  const prev = state.streamers[key] && typeof state.streamers[key] === "object" ? state.streamers[key] : {};
  state.streamers[key] = { ...prev, ...patch };
  await setBotState(STATE_KEY, state);
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
    global.logger?.warn?.("[TWITCH LIVE] send failed:", err?.message || err);
    return null;
  });
  if (!sent?.id) return { ok: false, reason: "send_failed" };

  await saveStreamerState(streamer.login, {
    lastStreamId: String(stream?.id || ""),
    announcedAt: new Date().toISOString(),
    messageId: String(sent.id),
    channelId: String(channel.id),
  });
  global.logger?.info?.("[TWITCH LIVE] announced:", streamer.login, stream?.id || "?", "->", channel.id);
  return { ok: true, messageId: String(sent.id) };
}

function resolveStreamerByDiscordUserId(client, discordUserId) {
  const uid = String(discordUserId || "").trim();
  if (!uid) return null;
  const cfg = resolveConfig(client);
  return cfg.streamers.find((row) => String(row.discordUserId || "") === uid) || null;
}

async function fetchLiveStreamForLogin(client, login) {
  const cfg = resolveConfig(client);
  if (!isConfigured(cfg)) return null;
  const normalized = normalizeLogin(login);
  if (!normalized) return null;
  const token = await getAppAccessToken(cfg.clientId, cfg.clientSecret);
  const streams = await fetchLiveStreams(cfg.clientId, token, [normalized]);
  return streams[0] || null;
}

async function setVoiceChannelStatus(client, channelId, status, reason = "Twitch live status") {
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
    global.logger?.warn?.("[TWITCH LIVE] voice status failed:", chId, err?.message || err);
    return false;
  }
}

async function updateStreamVoiceChannel(client, streamer, mode) {
  const channelId = String(streamer?.streamVoiceChannelId || "").trim();
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
  if (name) {
    await channel.setName(name.slice(0, 100), `Twitch live ${isOn ? "ON" : "OFF"}`).catch((err) => {
      global.logger?.warn?.("[TWITCH LIVE] rename failed:", channelId, err?.message || err);
    });
  }
  if (isOn) {
    await setVoiceChannelStatus(client, channelId, streamer.voiceStatusOn, "Twitch live ON");
  } else {
    await setVoiceChannelStatus(client, channelId, "", "Twitch live OFF");
  }
  return { ok: true, channelId, mode: isOn ? "on" : "off" };
}

async function forceLiveAnnouncementIfNeeded(client, streamer, stream) {
  if (!stream?.id) return { ok: false, reason: "no_stream" };
  const cfg = resolveConfig(client);
  if (!isConfigured(cfg)) return { ok: false, reason: "not_configured" };
  const state = await loadState();
  const streamId = String(stream.id);
  const prev = state.streamers?.[streamer.login];
  if (String(prev?.lastStreamId || "") === streamId) {
    return { ok: true, skipped: true, reason: "already_announced" };
  }
  return publishLiveAnnouncement(client, cfg, streamer, stream);
}

async function handleStreamerLiveCommand(client, discordUserId, mode) {
  const streamer = resolveStreamerByDiscordUserId(client, discordUserId);
  if (!streamer) return { ok: false, code: "not_streamer" };

  const action = String(mode || "").trim().toLowerCase();
  if (action === "on") {
    let stream = null;
    try {
      stream = await fetchLiveStreamForLogin(client, streamer.login);
    } catch (err) {
      global.logger?.warn?.("[TWITCH LIVE] live check failed:", err?.message || err);
      return { ok: false, code: "twitch_error" };
    }
    if (!stream?.id) return { ok: false, code: "not_live" };
    const channel = await updateStreamVoiceChannel(client, streamer, "on");
    const announce = await forceLiveAnnouncementIfNeeded(client, streamer, stream);
    return { ok: true, code: "on", streamer, stream, channel, announce };
  }

  if (action === "off") {
    const channel = await updateStreamVoiceChannel(client, streamer, "off");
    return { ok: true, code: "off", streamer, channel };
  }

  return { ok: false, code: "invalid_mode" };
}

async function runTwitchLiveAlertPoll(client) {
  if (pollInFlight) return;
  const cfg = resolveConfig(client);
  if (!isConfigured(cfg)) return;

  pollInFlight = true;
  try {
    const token = await getAppAccessToken(cfg.clientId, cfg.clientSecret);
    const streams = await fetchLiveStreams(cfg.clientId, token, cfg.streamers.map((s) => s.login));
    const liveByLogin = new Map(streams.map((stream) => [normalizeLogin(stream?.user_login), stream]));
    const state = await loadState();

    for (const streamer of cfg.streamers) {
      const stream = liveByLogin.get(streamer.login);
      if (!stream?.id) continue;
      const streamId = String(stream.id);
      const prev = state.streamers?.[streamer.login];
      if (String(prev?.lastStreamId || "") === streamId) continue;
      await publishLiveAnnouncement(client, cfg, streamer, stream);
    }
  } catch (err) {
    global.logger?.warn?.("[TWITCH LIVE] poll failed:", err?.message || err);
  } finally {
    pollInFlight = false;
  }
}

function startTwitchLiveAlertLoop(client) {
  if (!client || loopStarted.has(client)) return;
  const cfg = resolveConfig(client);
  if (!cfg.enabled) return;
  if (!cfg.streamers.length) {
    global.logger?.warn?.("[TWITCH LIVE] enabled but no streamers configured in twitchLiveAlerts.streamers");
    return;
  }
  if (!cfg.clientId || !cfg.clientSecret) {
    global.logger?.warn?.("[TWITCH LIVE] missing TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET");
    return;
  }
  if (!cfg.channelId || !cfg.pingRoleId) {
    global.logger?.warn?.("[TWITCH LIVE] missing news channel or Live ping role id");
    return;
  }

  loopStarted.add(client);
  const intervalMs = cfg.pollIntervalSec * 1000;
  const tick = () => runTwitchLiveAlertPoll(client).catch(() => {});
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  client._twitchLiveAlertInterval = timer;
  global.logger?.info?.(
    `[TWITCH LIVE] loop started (${cfg.pollIntervalSec}s) for: ${cfg.streamers.map((s) => s.login).join(", ")}`,
  );
}

module.exports = {
  startTwitchLiveAlertLoop,
  runTwitchLiveAlertPoll,
  resolveConfig,
  buildAnnouncementContent,
  resolveStreamerByDiscordUserId,
  fetchLiveStreamForLogin,
  updateStreamVoiceChannel,
  forceLiveAnnouncementIfNeeded,
  handleStreamerLiveCommand,
};
