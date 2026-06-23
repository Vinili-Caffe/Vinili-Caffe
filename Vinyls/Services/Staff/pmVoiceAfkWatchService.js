const { ChannelType, EmbedBuilder, PermissionsBitField } = require("discord.js");
const { formatItalianMinutesBold } = require("../../Utils/Text/italianDurationLabels");
const IDs = require("../../Utils/Config/ids");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const PM_AFK_VOICE_CATEGORY_ID = String( process.env.VC_PM_AFK_WATCH_CATEGORY_ID || IDs.categories?.categoryPublics || "1442569076902989844" ).trim();
const PM_AFK_SKIP_CATEGORY_IDS = new Set( [IDs.categories?.categoryStanze, IDs.categories?.categoryPrivate ].filter(Boolean).map((id) => String(id)) );
const SANZIONI_CHANNEL_ID = String(IDs.channels?.sanzioniUtenti || "").trim();
const STAFF_PING_ROLE_ID = String(IDs.roles?.Staff || "").trim();
const FOUNDER_ROLE_ID = String(IDs.roles?.Founder || "").trim();
const ALONE_MIN_MS = Math.max( 60_000, Number(process.env.VC_PM_AFK_WATCH_MIN_MS || 10 * 60 * 1000) );
const SWEEP_MS = Math.max(15_000, Number(process.env.VC_PM_AFK_WATCH_SWEEP_MS || 60_000));
const PM_AFK_EXEMPT_BOT_IDS = (() => {
  const fromEnv = String(process.env.VC_PM_AFK_WATCH_EXEMPT_BOT_IDS || "")
    .split(",")
    .map((id) => String(id || "").trim())
    .filter((id) => /^\d{16,20}$/.test(id));
  if (fromEnv.length) return new Set(fromEnv);
  return new Set(
    [IDs.bots?.ViniliCaffeBot, IDs.bots?.ViniliCaffeBotTest].filter(Boolean).map(String),
  );
})();
const watchByMemberKey = new Map();
let sweepTimer = null;

function memberWatchKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function channelHasExemptOfficialBot(channel) {
  if (!channel?.members || !PM_AFK_EXEMPT_BOT_IDS.size) return false;
  for (const occupant of channel.members.values()) {
    if (!occupant?.user?.bot) continue;
    if (PM_AFK_EXEMPT_BOT_IDS.has(String(occupant.id))) return true;
  }
  return false;
}

function isAloneHumanInChannel(member, channel) {
  if (!member?.id || !channel?.members) return false;
  if (channelHasExemptOfficialBot(channel)) return false;
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

function memberHasFounderRole(member) {
  if (!member || !FOUNDER_ROLE_ID) return false;
  return member.roles?.cache?.has(FOUNDER_ROLE_ID) === true;
}

function isStaffMember(member) {
  if (!member) return false;
  if (memberHasFounderRole(member)) return true;
  if (STAFF_PING_ROLE_ID && member.roles?.cache?.has(STAFF_PING_ROLE_ID)) return true;
  return member.permissions?.has(PermissionsBitField.Flags.ManageGuild) === true;
}

function isStaffInVoiceWithTarget(staffMember, targetMember) {
  if (!staffMember?.voice?.channelId || !targetMember?.voice?.channelId) return false;
  return String(staffMember.voice.channelId) === String(targetMember.voice.channelId);
}

function isPendingAlert(entry) {
  return Boolean(entry?.alertSent && !entry?.resolved);
}

function getMemberWatchEntry(guildId, userId) {
  return watchByMemberKey.get(memberWatchKey(guildId, userId)) || null;
}

function qualifiesForWatch(voiceState, member) {
  if (!voiceState?.channelId || !member) return false;
  if (String(voiceState.guild?.id || member.guild?.id || "") !== MAIN_GUILD_ID) return false;
  if (member.user?.bot) return false;
  if (memberHasFounderRole(member)) return false;
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
  if (prev && isPendingAlert(prev)) return;
  if (prev && prev.channelId === channelKey && !prev.alertSent && !resetTimer) return;
  watchByMemberKey.set(key, {
    channelId: channelKey,
    startedAt: Date.now(),
    alertSent: false,
    resolved: false,
    alertChannelId: null,
    alertMessageId: null,
  });
}

function resetPmVoiceAfkCountdown(guildId, userId, channelId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const cid = String(channelId || "");
  if (!gid || !uid || !cid) return false;
  const key = memberWatchKey(gid, uid);
  watchByMemberKey.set(key, {
    channelId: cid,
    startedAt: Date.now(),
    alertSent: false,
    resolved: false,
    alertChannelId: null,
    alertMessageId: null,
  });
  return true;
}

function clearPmVoiceAfkCountdown(guildId, userId) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!gid || !uid) return false;
  clearMemberWatch(gid, uid);
  return true;
}

function evaluateMemberVoiceWatch(member, opts) {
  if (!member?.id || !MAIN_GUILD_ID) return;
  const guildId = String(member.guild?.id || "");
  if (guildId !== MAIN_GUILD_ID) return;
  const voice = member.voice;
  const entry = getMemberWatchEntry(guildId, member.id);
  const qualifiesNow = Boolean(voice?.channelId && qualifiesForWatch(voice, member));
  if (!qualifiesNow) {
    if (!isPendingAlert(entry)) clearMemberWatch(guildId, member.id);
    return;
  }
  const resetTimer = Boolean(opts && opts.resetTimer);
  touchMemberWatch(guildId, member.id, voice.channelId, { resetTimer });
}

async function deletePmAfkUserAlertMessage(client, guildId, userId) {
  const entry = getMemberWatchEntry(guildId, userId);
  if (!entry) return false;
  const alertChannelId = String(entry.alertChannelId || entry.channelId || "");
  const alertMessageId = String(entry.alertMessageId || "");
  if (!client || !alertChannelId || !alertMessageId) return false;
  const { deleteProbeAlertMessage } = require("../Voice/pmVoiceAfkProbeService");
  return deleteProbeAlertMessage(client, guildId, alertChannelId, alertMessageId);
}

async function cancelPendingPmAfkAlert(client, guildId, userId, opts) {
  const gid = String(guildId || "");
  const uid = String(userId || "");
  if (!gid || !uid) return false;
  try {
    const { abortPmVoiceAfkProbe } = require("../Voice/pmVoiceAfkProbeService");
    abortPmVoiceAfkProbe(gid);
  } catch (_) {}
  const key = memberWatchKey(gid, uid);
  const entry = watchByMemberKey.get(key);
  if (!entry || !isPendingAlert(entry)) {
    clearMemberWatch(gid, uid);
    return false;
  }
  const keepMessage = Boolean(opts && opts.keepMessage);
  const alertChannelId = String(entry.alertChannelId || entry.channelId || "");
  const alertMessageId = String(entry.alertMessageId || "");
  if (!keepMessage && client && alertChannelId && alertMessageId) {
    const { deleteProbeAlertMessage } = require("../Voice/pmVoiceAfkProbeService");
    await deleteProbeAlertMessage(client, gid, alertChannelId, alertMessageId);
  }
  clearMemberWatch(gid, uid);
  return true;
}

async function maybeCancelPendingAlertOnVoiceLeave(client, oldState, newState) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return;
  const userId = String(newState?.id || oldState?.id || "");
  if (!userId) return;
  const entry = getMemberWatchEntry(guild.id, userId);
  if (!isPendingAlert(entry)) return;
  const watchedChannelId = String(entry.channelId || "");
  const oldChannelId = String(oldState?.channelId || "");
  const newChannelId = String(newState?.channelId || "");
  const leftVoice = Boolean(oldChannelId && !newChannelId);
  const leftWatchedChannel = Boolean(
    oldChannelId &&
      oldChannelId === watchedChannelId &&
      newChannelId !== watchedChannelId,
  );
  if (leftVoice || leftWatchedChannel) {
    try {
      const { abortPmVoiceAfkProbe } = require("../Voice/pmVoiceAfkProbeService");
      abortPmVoiceAfkProbe(guild.id);
    } catch (_) {}
    await cancelPendingPmAfkAlert(client, guild.id, userId);
  }
}

async function sendPmAfkCheckAlert(client, member, channelId, aloneMs) {
  if (!member?.id || !channelId) return false;
  const guild =
    member.guild ||
    (await getClientGuildCached(client, MAIN_GUILD_ID).catch(() => null));
  if (!guild) return false;

  const existingEntry = getMemberWatchEntry(guild.id, member.id);
  if (existingEntry?.alertMessageId) {
    const { deleteProbeAlertMessage } = require("../Voice/pmVoiceAfkProbeService");
    await deleteProbeAlertMessage(
      client,
      guild.id,
      String(existingEntry.alertChannelId || existingEntry.channelId || channelId),
      String(existingEntry.alertMessageId),
    ).catch(() => null);
  }

  const voiceChannel = guild.channels.cache.get(String(channelId))
    || (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!voiceChannel?.isTextBased?.()) {
    global.logger?.warn?.("[VOICE AFK WATCH] Canale vocale senza chat testuale:", channelId);
    return false;
  }

  const minutes = Math.max(1, Math.round(aloneMs / 60_000));
  const listenSec = Math.max(30, Math.round(
    Number(process.env.VC_PM_AFK_PROBE_LISTEN_MS || 90_000) / 1000,
  ));

  const embed = new EmbedBuilder()
    .setColor("#E67E22")
    .setTitle("<:VC_Attention:1482534443632558151> Controllo anti-AFK")
    .setDescription(
      [
        `Sei in questo canale da ${formatItalianMinutesBold(minutes)} **da solo**.`,
        "",
        "Per confermare che **non sei AFK**:",
        `> 🎙️ **Parla nel microfono** entro **${listenSec} secondi** mentre il bot è in ascolto.`,
        "",
        "Puoi anche **scrivere in chat** o **uscire dal vocale** per annullare il controllo.",
      ].join("\n"),
    )

  const sent = await voiceChannel
    .send({
      content: `${member}`,
      embeds: [embed],
      allowedMentions: { users: [String(member.id)] },
    })
    .catch((err) => {
      global.logger?.warn?.("[VOICE AFK WATCH] Invio avviso utente fallito:", err?.message || err);
      return null;
    });
  if (!sent?.id) return null;

  const { startPmVoiceAfkProbe } = require("../Voice/pmVoiceAfkProbeService");
  void startPmVoiceAfkProbe(client, {
    guildId: guild.id,
    targetUserId: member.id,
    voiceChannelId: String(channelId),
    alertMessageId: String(sent.id),
    aloneMs,
  }).catch((err) => {
    global.logger?.warn?.("[VOICE AFK WATCH] Probe vocale fallita:", err?.message || err);
  });

  return { channelId: String(voiceChannel.id), messageId: String(sent.id) };
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

function rescanPmAfkWatchChannels(guild, channelIds, oldState, client) {
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
        const entry = getMemberWatchEntry(guild.id, member.id);
        if (isPendingAlert(entry) && client) {
          void cancelPendingPmAfkAlert(client, guild.id, member.id).catch(() => null);
        } else {
          clearMemberWatch(guild.id, member.id);
        }
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
      if (isPendingAlert(entry)) {
        await cancelPendingPmAfkAlert(client, guild.id, userId).catch(() => null);
      } else {
        watchByMemberKey.delete(key);
      }
      continue;
    }
    if (!qualifiesForWatch(member.voice, member)) {
      if (isPendingAlert(entry)) {
        await cancelPendingPmAfkAlert(client, guild.id, userId).catch(() => null);
      } else {
        watchByMemberKey.delete(key);
      }
      continue;
    }
    if (String(member.voice.channelId) !== String(entry.channelId || "")) {
      touchMemberWatch(guild.id, member.id, member.voice.channelId, { resetTimer: true });
      continue;
    }

    const aloneMs = now - Number(entry.startedAt || now);
    const sent = await sendPmAfkCheckAlert(client, member, entry.channelId, aloneMs);
    if (sent?.messageId) {
      watchByMemberKey.set(key, {
        ...entry,
        alertSent: true,
        resolved: false,
        alertChannelId: sent.channelId,
        alertMessageId: sent.messageId,
      });
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

async function handlePmVoiceAfkChatMessage(message, client) {
  if (!message?.guild || message.author?.bot || message.system) return false;
  if (String(message.guild.id) !== MAIN_GUILD_ID) return false;
  const entry = getMemberWatchEntry(message.guild.id, message.author.id);
  if (!isPendingAlert(entry)) return false;
  try {
    const { abortPmVoiceAfkProbe } = require("../Voice/pmVoiceAfkProbeService");
    abortPmVoiceAfkProbe(message.guild.id);
  } catch (_) {}
  await cancelPendingPmAfkAlert(client, message.guild.id, message.author.id);
  return true;
}

function handlePmVoiceAfkSpeakingProbe(client, oldState, newState) {
  if (!newState?.guild || String(newState.guild.id) !== MAIN_GUILD_ID) return;
  if (!newState?.speaking) return;
  const userId = String(newState.id || newState.member?.id || "");
  if (!userId || newState.member?.user?.bot) return;
  try {
    const { notifyProbeSpeechHeard } = require("../Voice/pmVoiceAfkProbeService");
    notifyProbeSpeechHeard(newState.guild.id, userId);
  } catch (_) {}
  const entry = getMemberWatchEntry(newState.guild.id, userId);
  if (isPendingAlert(entry) && client) {
    void cancelPendingPmAfkAlert(client, newState.guild.id, userId).catch(() => null);
  }
}

async function handlePmVoiceAfkVoiceState(oldState, newState, client) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return;

  handlePmVoiceAfkSpeakingProbe(client, oldState, newState);

  await maybeCancelPendingAlertOnVoiceLeave(client, oldState, newState);

  const channelIds = new Set();
  if (oldState?.channelId) channelIds.add(String(oldState.channelId));
  if (newState?.channelId) channelIds.add(String(newState.channelId));

  rescanPmAfkWatchChannels(guild, channelIds, oldState, client);
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

async function sendPmAfkSanctionNotice(client, guild, opts = {}) {
  if (!SANZIONI_CHANNEL_ID || !guild?.id) return false;
  const target = opts.target;
  const staffMember = opts.staffMember;
  const stepLabel = String(opts.stepLabel || "").trim();
  const reason = String(opts.reason || "").trim();
  const voiceChannelId = String(opts.voiceChannelId || "").trim();
  const durationMs = Number(opts.durationMs || 0);
  if (!target?.id || !staffMember?.id) return false;

  const textChannel = await getGuildChannelCached(guild, SANZIONI_CHANNEL_ID).catch(() => null);
  if (!textChannel?.isTextBased?.()) return false;

  const { formatDuration } = require("../../Utils/Moderation/moderation");
  const channelRef = voiceChannelId ? `<#${voiceChannelId}>` : "vocale";
  const durationLabel = durationMs > 0 ? formatDuration(durationMs) : "N/A";

  const embed = new EmbedBuilder()
    .setColor("#C0392B")
    .setTitle("<:banhammer:1443651875441217639> Sanzione AFK vocale applicata")
    .setDescription(
      [
        `${target} è stato **mutato** per AFK in vocale (regola **3.6**).`,
        `Canale: ${channelRef}`,
        `Sanzione: **${stepLabel || "Mute"}** (${durationLabel})`,
        reason ? `Motivo: ${reason}` : null,
        `Confermato da ${staffMember}.`,
      ].filter(Boolean).join("\n"),
    )
    .setFooter({ text: `ID utente: ${target.id}` });

  await textChannel
    .send({ embeds: [embed] })
    .catch((err) => {
      global.logger?.warn?.("[VOICE AFK WATCH] Invio sanzione in sanzioni fallito:", err?.message || err);
      return null;
    });
  return true;
}

module.exports = { PM_AFK_VOICE_CATEGORY_ID, isPmAfkWatchVoiceChannel, handlePmVoiceAfkVoiceState, syncPmVoiceAfkWatchFromGateway, startPmVoiceAfkWatchLoop, sweepPmVoiceAfkAlerts, resetPmVoiceAfkCountdown, clearPmVoiceAfkCountdown, cancelPendingPmAfkAlert, deletePmAfkUserAlertMessage, sendPmAfkSanctionNotice, handlePmVoiceAfkChatMessage, isStaffInVoiceWithTarget, isStaffMember, isPendingAlert, getMemberWatchEntry };