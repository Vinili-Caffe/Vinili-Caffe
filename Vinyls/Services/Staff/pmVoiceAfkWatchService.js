const { ChannelType, EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const PM_AFK_VOICE_CATEGORY_ID = String( process.env.VC_PM_AFK_WATCH_CATEGORY_ID || IDs.categories?.categoryPublics || "1442569076902989844" ).trim();
const PM_AFK_SKIP_CATEGORY_IDS = new Set( [IDs.categories?.categoryStanze, IDs.categories?.categoryPrivate ].filter(Boolean).map((id) => String(id)) );
const STAFF_CHAT_CHANNEL_ID = String(IDs.channels?.staffChat || "").trim();
const STAFF_PING_ROLE_ID = String(IDs.roles?.Staff || "").trim();
const ALONE_MIN_MS = Math.max( 60_000, Number(process.env.VC_PM_AFK_WATCH_MIN_MS || 10 * 60 * 1000) );
const SWEEP_MS = Math.max(15_000, Number(process.env.VC_PM_AFK_WATCH_SWEEP_MS || 60_000));
const watchByMemberKey = new Map();
let sweepTimer = null;

function memberWatchKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function isAloneHumanInChannel(member, channel) {
  if (!member?.id || !channel?.members) return false;
  const humans = channel.members.filter((m) => !m.user?.bot);
  return humans.size === 1 && humans.has(member.id);
}

function isPmAfkWatchVoiceChannel(channel) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  const parentId = String(channel.parentId || "");
  if (!parentId || PM_AFK_SKIP_CATEGORY_IDS.has(parentId)) return false;
  if (!PM_AFK_VOICE_CATEGORY_ID || parentId !== PM_AFK_VOICE_CATEGORY_ID) return false;
  return true;
}

function qualifiesForWatch(voiceState, member) {
  if (!voiceState?.channelId || !member) return false;
  if (String(voiceState.guild?.id || member.guild?.id || "") !== MAIN_GUILD_ID) return false;
  if (member.user?.bot) return false;
  const micOff = Boolean(voiceState.selfMute || voiceState.serverMute);
  const audioOff = Boolean(voiceState.selfDeaf || voiceState.serverDeaf);
  if (micOff && audioOff) return false;
  const channel = voiceState.channel || voiceState.guild?.channels?.cache?.get(voiceState.channelId);
  if (!channel || !isPmAfkWatchVoiceChannel(channel)) return false;
  return isAloneHumanInChannel(member, channel);
}

function describeVoicePresence(voiceState) {
  if (!voiceState) return "in vocale";
  const micOff = Boolean(voiceState.selfMute || voiceState.serverMute);
  const audioOff = Boolean(voiceState.selfDeaf || voiceState.serverDeaf);
  if (!micOff && !audioOff) return "con microfono attivo";
  if (micOff && audioOff) {
    return voiceState.serverDeaf || voiceState.serverMute
      ? "muto e silenziato dall'audio (staff)"
      : "muto e audio disattivati";
  }
  if (audioOff) {
    return voiceState.serverDeaf ? "silenziato dall'audio (staff)" : "audio disattivato";
  }
  if (voiceState.serverMute) return "muto (mute staff)";
  if (voiceState.selfMute) return "muto (auto-mute)";
  return "muto";
}

function memberQualifiedBefore(oldState, member) {
  if (!oldState || !member?.id) return undefined;
  if (String(oldState.member?.id || oldState.id || "") !== String(member.id)) return undefined;
  return qualifiesForWatch(oldState, member);
}

function clearMemberWatch(guildId, userId) {
  watchByMemberKey.delete(memberWatchKey(guildId, userId));
}

function touchMemberWatch(guildId, userId, channelId, opts) {
  const key = memberWatchKey(guildId, userId);
  const channelKey = String(channelId || "");
  const resetTimer = Boolean(opts && opts.resetTimer);
  const prev = watchByMemberKey.get(key);
  if (prev && prev.channelId === channelKey && !prev.alertSent && !resetTimer) return;
  watchByMemberKey.set(key, { channelId: channelKey, startedAt: Date.now(), alertSent: false });
}

function evaluateMemberVoiceWatch(member, opts) {
  if (!member?.id || !MAIN_GUILD_ID) return;
  const guildId = String(member.guild?.id || "");
  if (guildId !== MAIN_GUILD_ID) return;
  const voice = member.voice;
  const qualifiesNow = Boolean(voice?.channelId && qualifiesForWatch(voice, member));
  if (!qualifiesNow) {
    clearMemberWatch(guildId, member.id);
    return;
  }
  const resetTimer = Boolean(opts && opts.resetTimer);
  touchMemberWatch(guildId, member.id, voice.channelId, { resetTimer });
}

async function sendPmAfkCheckAlert(client, member, channelId, aloneMs) {
  if (!STAFF_CHAT_CHANNEL_ID || !member?.id) return false;
  const guild =
    member.guild ||
    (await getClientGuildCached(client, MAIN_GUILD_ID).catch(() => null));
  if (!guild) return false;
  const textChannel = await getGuildChannelCached(guild, STAFF_CHAT_CHANNEL_ID).catch(() => null);
  if (!textChannel?.isTextBased?.()) return false;

  const channelRef = channelId ? `<#${channelId}>` : "vocale";
  const minutes = Math.max(1, Math.round(aloneMs / 60_000));
  const presenceLabel = describeVoicePresence(member.voice);

  const embed = new EmbedBuilder()
    .setColor("#E67E22")
    .setTitle("<:VC_Attention:1482534443632558151> Controllo AFK vocale")
    .setDescription(
      [
        `${member} è da **${minutes} minuti** da solo in ${channelRef} (${presenceLabel}).`,
        "",
        "Verificate che **non sia AFK** (regola **3.6**): in caso di inattività oltre **10 minuti** senza risposta in testuale o alle chiamate, procedete con le sanzioni previste.",
      ].join("\n"),
    )
    .setFooter({ text: `ID utente: ${member.id}` });

  const ping = STAFF_PING_ROLE_ID ? `<@&${STAFF_PING_ROLE_ID}>` : "";
  await textChannel.send({ embeds: [embed], ...(ping ? { content: ping } : {}) }).catch((err) => {
    global.logger?.warn?.("[VOICE AFK WATCH] Invio avviso staff fallito:", err?.message || err);
    return null;
  });
  return true;
}

function discoverQualifyingWatchesInGuild(guild) {
  if (!guild) return;
  for (const channel of guild.channels.cache.values()) {
    if (!isPmAfkWatchVoiceChannel(channel)) continue;
    for (const member of channel.members.values()) {
      if (member.user?.bot) continue;
      if (!qualifiesForWatch(member.voice, member)) continue;
      const key = memberWatchKey(guild.id, member.id);
      if (!watchByMemberKey.has(key)) {
        touchMemberWatch(guild.id, member.id, member.voice.channelId);
      }
    }
  }
}

function rescanPmAfkWatchChannels(guild, channelIds, oldState) {
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return;
  const ids = channelIds instanceof Set ? channelIds : new Set(channelIds || []);
  for (const channelId of ids) {
    if (!channelId) continue;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !isPmAfkWatchVoiceChannel(channel)) continue;
    for (const member of channel.members.values()) {
      if (member.user?.bot) continue;
      const qualifiedBefore = memberQualifiedBefore(oldState, member);
      const qualifiesNow = qualifiesForWatch(member.voice, member);
      if (!qualifiesNow) {
        clearMemberWatch(guild.id, member.id);
        continue;
      }
      const justBecameAlone = qualifiedBefore === false;
      evaluateMemberVoiceWatch(member, { resetTimer: justBecameAlone });
    }
  }
}

async function sweepPmVoiceAfkAlerts(client) {
  if (!MAIN_GUILD_ID) return;
  const guild = await getClientGuildCached(client, MAIN_GUILD_ID).catch(() => null);
  if (!guild) return;
  discoverQualifyingWatchesInGuild(guild);
  if (!watchByMemberKey.size) return;
  const now = Date.now();

  for (const [key, entry] of [...watchByMemberKey.entries()]) {
    if (!entry || entry.alertSent) continue;
    if (now - Number(entry.startedAt || 0) < ALONE_MIN_MS) continue;

    const sep = key.indexOf(":");
    if (sep <= 0) {
      watchByMemberKey.delete(key);
      continue;
    }
    const userId = key.slice(sep + 1);
    const member = await getGuildMemberCached(guild, userId).catch(() => null);
    if (!member?.voice?.channelId) {
      watchByMemberKey.delete(key);
      continue;
    }
    if (!qualifiesForWatch(member.voice, member)) {
      watchByMemberKey.delete(key);
      continue;
    }
    if (String(member.voice.channelId) !== String(entry.channelId || "")) {
      touchMemberWatch(guild.id, member.id, member.voice.channelId, { resetTimer: true });
      continue;
    }

    const aloneMs = now - Number(entry.startedAt || now);
    const sent = await sendPmAfkCheckAlert(client, member, entry.channelId, aloneMs);
    if (sent) {
      watchByMemberKey.set(key, { ...entry, alertSent: true });
    }
  }
}

async function syncPmVoiceAfkWatchFromGateway(client) {
  if (!MAIN_GUILD_ID) return;
  watchByMemberKey.clear();
  const guild = await getClientGuildCached(client, MAIN_GUILD_ID).catch(() => null);
  if (!guild) return;
  for (const channel of guild.channels.cache.values()) {
    if (!isPmAfkWatchVoiceChannel(channel)) continue;
    for (const member of channel.members.values()) {
      evaluateMemberVoiceWatch(member);
    }
  }
}

function handlePmVoiceAfkVoiceState(oldState, newState) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return;

  const channelIds = new Set();
  if (oldState?.channelId) channelIds.add(String(oldState.channelId));
  if (newState?.channelId) channelIds.add(String(newState.channelId));

  rescanPmAfkWatchChannels(guild, channelIds, oldState);
}

function startPmVoiceAfkWatchLoop(client) {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    sweepPmVoiceAfkAlerts(client).catch((err) => {
      global.logger?.warn?.("[VOICE AFK WATCH] Sweep fallito:", err?.message || err);
    });
  }, SWEEP_MS);
  if (typeof sweepTimer.unref === "function") sweepTimer.unref();
}

module.exports = { PM_AFK_VOICE_CATEGORY_ID, isPmAfkWatchVoiceChannel, handlePmVoiceAfkVoiceState, syncPmVoiceAfkWatchFromGateway, startPmVoiceAfkWatchLoop, sweepPmVoiceAfkAlerts };