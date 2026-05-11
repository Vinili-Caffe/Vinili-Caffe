const { EmbedBuilder, AuditLogEvent, PermissionsBitField, } = require("discord.js");
const { handleMusicBotVoiceDisconnect } = require("../Services/Music/lavalinkMusicService");
const { leaveTtsGuild, handleTtsBotVoiceMove, isTtsPostJoinVoiceGraceActive } = require("../Services/TTS/ttsService");
const { handleVoiceActivity, } = require("../Services/Community/activityService");
const { trackVoiceEngagement } = require("../Services/Community/dailyEngagementStatsService");
const { handleSerataFilmVoiceState } = require("../Services/Staff/staffAutoValutazioniService");
const IDs = require("../Utils/Config/ids");
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function formatActor(actor) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function isTransientSendError(err) {
  const status = Number(err?.status ?? err?.statusCode ?? err?.httpStatus ?? 0);
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  const msg = err?.message || String(err);
  return /service unavailable|internal server error|503|502|504|500|ECONNRESET|ETIMEDOUT|rate.?limit/i.test(
    msg,
  );
}

async function sendLogWithRetry(logChannel, payload, logTag) {
  const send = () => logChannel.send(payload);
  return send().catch(async (err) => {
    if (isTransientSendError(err)) {
      await sleep(1500);
      await send().catch(() => { });
    } else {
      global.logger?.warn?.(logTag, err?.message || err);
    }
  });
}

async function resolveActivityLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveMemberUpdateAuditInfo(guild, targetUserId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: null, reason: null };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);
    if (logs?.entries?.size) {
      const nowMs = Date.now();
      const entry = logs.entries.find((item) => { const createdMs = Number(item?.createdTimestamp || 0); const targetId = String(item?.target?.id || ""); const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS; return withinWindow && targetId === String(targetUserId || ""); });
      if (entry) {
        return {
          executor: entry.executor || null,
          reason: entry.reason || null,
        };
      }
    }
    if (attempt < 2) await sleep(700);
  }

  return { executor: null, reason: null };
}

async function resolveMemberMoveAuditInfo(guild, targetUserId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: null, count: 1 };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);
    if (logs?.entries?.size) {
      const nowMs = Date.now();
      const entry = logs.entries.find((item) => { const createdMs = Number(item?.createdTimestamp || 0); const targetId = String(item?.target?.id || ""); const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS; return withinWindow && targetId === String(targetUserId || ""); });
      if (entry) {
        return {
          executor: entry.executor || null,
          count: Math.max(1, Number(entry?.extra?.count || 1)),
        };
      }
    }
    if (attempt < 2) await sleep(700);
  }

  return { executor: null, count: 1 };
}

async function resolveMemberDisconnectAuditInfo(guild, targetUserId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: null, count: 1 };
  }

  const actionType = AuditLogEvent?.MemberDisconnect;
  if (!Number.isFinite(Number(actionType))) {
    return { executor: null, count: 1 };
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);
    if (logs?.entries?.size) {
      const nowMs = Date.now();
      const entry = logs.entries.find((item) => { const createdMs = Number(item?.createdTimestamp || 0); const targetId = String(item?.target?.id || ""); const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS; return withinWindow && targetId === String(targetUserId || ""); });
      if (entry) {
        return {
          executor: entry.executor || null,
          count: Math.max(1, Number(entry?.extra?.count || 1)),
        };
      }
    }
    if (attempt < 2) await sleep(700);
  }

  return { executor: null, count: 1 };
}

async function sendMemberDisconnectLog(oldState, newState) {
  const member = newState?.member || oldState?.member;
  const user = member?.user;
  if (!member || !user) return;
  if (!oldState?.channelId || newState?.channelId) return;

  const guild = newState?.guild || oldState?.guild;
  if (!guild) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;
  const audit = await resolveMemberDisconnectAuditInfo(guild, user.id);
  const oldChannelId = String(oldState?.channelId || "");
  const fromChannel = oldState?.channel || (oldChannelId ? `<#${oldChannelId}>` : "#sconosciuto");

  const embed = new EmbedBuilder()
    .setColor("#ED4245")
    .setTitle("<:VC_User:1482527453586002103> Membro Disconnesso")
    .setDescription([`<:VC_Staff:1494286904089247754> **Responsabile:** ${formatActor(audit.executor)}`,
    `<:VC_User:1482527453586002103> **Target:** ${user}\`${user.id}\``,
    `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
    `<:VC_Modifica:1478859646587633717> **Canale:** ${fromChannel}\`${oldChannelId || "sconosciuto"}\``,
    `<:VC_Modifica:1478859646587633717> **Conteggio:** ${Math.max(1, Number(audit?.count || 1))}`,
    ].join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberDisconnectLog failed:");
}

async function sendMemberJoinLog(oldState, newState) {
  const member = newState?.member || oldState?.member;
  const user = member?.user;
  if (!member || !user) return;
  if (oldState?.channelId || !newState?.channelId) return;

  const guild = newState?.guild || oldState?.guild;
  if (!guild) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;
  const newChannelId = String(newState?.channelId || "");
  const destination = newState?.channel || (newChannelId ? `<#${newChannelId}>` : "#sconosciuto");

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("<:VC_User:1482527453586002103> Membro Entrato")
    .setDescription([
      `<:VC_User:1482527453586002103> **Target:** ${user}\`${user.id}\``,
      `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
      `<:VC_Modifica:1478859646587633717> **Canale:** ${destination}\`${newChannelId || "sconosciuto"}\``,
    ].join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberJoinLog failed:");
}

async function sendMemberMoveLog(oldState, newState) {
  const member = newState?.member || oldState?.member;
  const user = member?.user;
  const guild = newState?.guild || oldState?.guild;
  if (!member || !user || !guild) return;

  const oldChannelId = String(oldState?.channelId || "");
  const newChannelId = String(newState?.channelId || "");
  if (!oldChannelId || !newChannelId || oldChannelId === newChannelId) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const audit = await resolveMemberMoveAuditInfo(guild, user.id);
  const responsibleText = formatActor(audit.executor);
  const destination = newState?.channel || `<#${newChannelId}>`;

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("<:VC_User:1482527453586002103> Membro Spostato")
    .setDescription([`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
    `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
    `<:VC_Modifica:1478859646587633717> **Canale:** ${destination}\`${newChannelId}\``,
    `<:VC_Modifica:1478859646587633717> **Conteggio:** ${Math.max(1, Number(audit.count || 1))}`,
    ].join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberMoveLog failed:");
}

function yesNo(value) {
  return value ? "Si" : "No";
}

async function sendMemberVoiceFlagsUpdateLog(oldState, newState) {
  const member = newState?.member || oldState?.member;
  const user = member?.user;
  const guild = newState?.guild || oldState?.guild;
  if (!member || !user || !guild) return;

  const muteChanged = Boolean(oldState?.serverMute) !== Boolean(newState?.serverMute);
  const deafChanged = Boolean(oldState?.serverDeaf) !== Boolean(newState?.serverDeaf);
  const selfMuteChanged = Boolean(oldState?.selfMute) !== Boolean(newState?.selfMute);
  const selfDeafChanged = Boolean(oldState?.selfDeaf) !== Boolean(newState?.selfDeaf);
  if (!muteChanged && !deafChanged && !selfMuteChanged && !selfDeafChanged) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const auditNeeded = muteChanged || deafChanged;
  const audit = auditNeeded ? await resolveMemberUpdateAuditInfo(guild, user.id) : { executor: null, reason: null };
  const responsibleText = auditNeeded ? formatActor(audit.executor) : `${user} \`${user.id}\``;

  const lines = [`<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
  `<:VC_User:1482527453586002103> **Target:** ${user}\`${user.id}\``,
  `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
  ];
  if (auditNeeded && audit.reason) {
    lines.push(`<:VC_Modifica:1478859646587633717> **Motivo:** ${audit.reason}`);
  }
  lines.push("", "**<:VC_tools:1478862265305272364> Cambiamenti**");

  if (muteChanged) {
    lines.push("<:VC_Modifica:1478859646587633717> **Mute**");
    lines.push(`${yesNo(Boolean(oldState?.serverMute))} <:VC_Arrow:1482706699365257397> ${yesNo(Boolean(newState?.serverMute))}`);
  }
  if (deafChanged) {
    lines.push("<:VC_Modifica:1478859646587633717> **Deaf**");
    lines.push(`${yesNo(Boolean(oldState?.serverDeaf))} <:VC_Arrow:1482706699365257397> ${yesNo(Boolean(newState?.serverDeaf))}`);
  }
  if (selfMuteChanged) {
    lines.push("<:VC_Modifica:1478859646587633717> **Self Mute**");
    lines.push(`${yesNo(Boolean(oldState?.selfMute))} <:VC_Arrow:1482706699365257397> ${yesNo(Boolean(newState?.selfMute))}`);
  }
  if (selfDeafChanged) {
    lines.push("<:VC_Modifica:1478859646587633717> **Self Deaf**");
    lines.push(`${yesNo(Boolean(oldState?.selfDeaf))} <:VC_Arrow:1482706699365257397> ${yesNo(Boolean(newState?.selfDeaf))}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("<:VC_User:1482527453586002103> Membro Aggiornato")
    .setDescription(lines.join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberVoiceFlagsUpdateLog failed:");
}

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    try {
      await sendMemberMoveLog(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[voiceStateUpdate] move log failed:", error);
    }
    try {
      await sendMemberVoiceFlagsUpdateLog(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[voiceStateUpdate] flags log failed:", error);
    }
    try {
      await sendMemberDisconnectLog(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[voiceStateUpdate] disconnect log failed:", error);
    }
    try {
      await sendMemberJoinLog(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[voiceStateUpdate] join log failed:", error);
    }

    try {
      await handleSerataFilmVoiceState(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[SERATA FILM STAFF AUTO ERROR]", error);
    }

    try {
      await handleVoiceActivity(oldState, newState);
    } catch (error) {
      if (client?.logs?.error) {
        client.logs.error("[ACTIVITY VOICE ERROR]", error);
      } else {
        global.logger?.error?.("[ACTIVITY VOICE ERROR]", error);
      }
    }
    try {
      await trackVoiceEngagement(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[DAILY ENGAGEMENT VOICE ERROR]", error);
    }

    if (!client?.user?.id) return;
    if (client?.config?.tts?.stayConnected) return;

    const guild = newState?.guild || oldState?.guild;
    if (!guild) return;

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      newState.channelId &&
      String(oldState.channelId) !== String(newState.channelId)
    ) {
      const newChannelId = String(newState.channelId);
      const channel = guild.channels?.cache?.get(newChannelId) || (await guild.channels?.fetch?.(newChannelId).catch(() => null));
      if (channel?.isVoiceBased?.()) {
        await handleTtsBotVoiceMove({ voiceChannel: channel, oldChannelId: oldState.channelId }).catch((err) => {
          global.logger?.warn?.("[voiceStateUpdate] handleTtsBotVoiceMove failed:", err?.message || err);
        });
      }
    }

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      await handleMusicBotVoiceDisconnect(client, guild).catch((err) => {
        global.logger?.warn?.("[voiceStateUpdate] handleMusicBotVoiceDisconnect failed:", err?.message || err);
      });
      await leaveTtsGuild(guild.id, client).catch((err) => {
        global.logger?.warn?.("[voiceStateUpdate] leaveTtsGuild failed:", err?.message || err);
      });
      return;
    }

    const botMember = guild.members.me || guild.members.cache.get(client.user.id);
    const botChannel = botMember?.voice?.channel;
    if (!botChannel) return;
    if (isTtsPostJoinVoiceGraceActive(guild.id)) return;

    const humans = botChannel.members.filter((m) => !m.user.bot);
    if (humans.size === 0) {
      const { shouldDeferTtsLeaveForMusicEmptyVc } = require("../Services/Music/lavalinkMusicService");
      if (shouldDeferTtsLeaveForMusicEmptyVc(client, guild.id)) {
      } else {
        await leaveTtsGuild(guild.id, client).catch((err) => {
          global.logger?.warn?.("[voiceStateUpdate] leaveTtsGuild failed:", err?.message || err);
        });
      }
    }
  },
};