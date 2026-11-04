const { EmbedBuilder, AuditLogEvent, PermissionsBitField, } = require("discord.js") as typeof import("discord.js");
const { handleMusicBotVoiceDisconnect } = require("../../../shared/music/services/lavalinkMusicService") as typeof import("../../../shared/music/services/lavalinkMusicService");
const { leaveTtsGuild, handleTtsBotVoiceMove, isTtsPostJoinVoiceGraceActive } = require("../../../shared/tts/services/ttsService") as typeof import("../../../shared/tts/services/ttsService");
const { handleVoiceActivity, } = require("../../Community/services/activityService") as typeof import("../../Community/services/activityService");
const { trackVoiceEngagement } = require("../../Community/services/dailyEngagementStatsService") as typeof import("../../Community/services/dailyEngagementStatsService");
const { handleSerataFilmVoiceState } = require("../../Staff/services/staffAutoValutazioniService") as typeof import("../../Staff/services/staffAutoValutazioniService");
const { handleSerataFilmAttendanceVoiceState } = require("../../Community/services/serataFilmAttendance") as typeof import("../../Community/services/serataFilmAttendance");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

/* perfP1: meno fetch audit (erano 3× + sleep 700ms a evento) */
const AUDIT_FETCH_LIMIT = 10;
const AUDIT_LOOKBACK_MS = 90 * 1000;
const AUDIT_MAX_ATTEMPTS = Math.max(1, Math.min(3, Number(process.env.VC_VOICE_AUDIT_ATTEMPTS || 1) || 1));
const AUDIT_RETRY_MS = Math.max(0, Number(process.env.VC_VOICE_AUDIT_RETRY_MS || 250) || 250);

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function formatActor(actor?) {
  if (!actor) return "sconosciuto";
  return `${actor} \`${actor.id}\`${actor.bot ? " [BOT]" : ""}`;
}

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function isTransientSendError(err?) {
  const status = Number(err?.status ?? err?.statusCode ?? err?.httpStatus ?? 0);
  if (status === 500 || status === 502 || status === 503 || status === 504) return true;
  const msg = err?.message || String(err);
  return /service unavailable|internal server error|503|502|504|500|ECONNRESET|ETIMEDOUT|rate.?limit/i.test(
    msg,
  );
}

async function sendLogWithRetry(logChannel?, payload?, logTag?) {
  const send = () => logChannel.send(payload);
  return send().catch(async (err?) => {
    if (isTransientSendError(err)) {
      await sleep(1500);
      await send().catch(() => { });
    } else {
      global.logger?.warn?.(logTag, err?.message || err);
    }
  });
}

async function resolveActivityLogChannel(guild?) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

async function resolveMemberUpdateAuditInfo(guild?, targetUserId?) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: null, reason: null };
  }

  for (let attempt = 0; attempt < AUDIT_MAX_ATTEMPTS; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);
    if (logs?.entries?.size) {
      const nowMs = Date.now();
      const entry = logs.entries.find((item?) => { const createdMs = Number(item?.createdTimestamp || 0); const targetId = String(item?.target?.id || ""); const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS; return withinWindow && targetId === String(targetUserId || ""); });
      if (entry) {
        return {
          executor: entry.executor || null,
          reason: entry.reason || null,
        };
      }
    }
    if (attempt < AUDIT_MAX_ATTEMPTS - 1 && AUDIT_RETRY_MS > 0) await sleep(AUDIT_RETRY_MS);
  }

  return { executor: null, reason: null };
}

async function resolveMemberMoveAuditInfo(guild?, targetUserId?) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: null, count: 1 };
  }

  for (let attempt = 0; attempt < AUDIT_MAX_ATTEMPTS; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberMove, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);
    if (logs?.entries?.size) {
      const nowMs = Date.now();
      const entry = logs.entries.find((item?) => { const createdMs = Number(item?.createdTimestamp || 0); const targetId = String(item?.target?.id || ""); const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS; return withinWindow && targetId === String(targetUserId || ""); });
      if (entry) {
        return {
          executor: entry.executor || null,
          count: Math.max(1, Number(entry?.extra?.count || 1)),
        };
      }
    }
    if (attempt < AUDIT_MAX_ATTEMPTS - 1 && AUDIT_RETRY_MS > 0) await sleep(AUDIT_RETRY_MS);
  }

  return { executor: null, count: 1 };
}

async function resolveMemberDisconnectAuditInfo(guild?, targetUserId?) {
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

  for (let attempt = 0; attempt < AUDIT_MAX_ATTEMPTS; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: actionType, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);
    if (logs?.entries?.size) {
      const nowMs = Date.now();
      const entry = logs.entries.find((item?) => { const createdMs = Number(item?.createdTimestamp || 0); const targetId = String(item?.target?.id || ""); const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS; return withinWindow && targetId === String(targetUserId || ""); });
      if (entry) {
        return {
          executor: entry.executor || null,
          count: Math.max(1, Number(entry?.extra?.count || 1)),
        };
      }
    }
    if (attempt < AUDIT_MAX_ATTEMPTS - 1 && AUDIT_RETRY_MS > 0) await sleep(AUDIT_RETRY_MS);
  }

  return { executor: null, count: 1 };
}

async function sendMemberDisconnectLog(oldState?, newState?) {
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
    .setTitle(`${E.VC_User} Membro Disconnesso`)
    .setDescription([`${E.VC_Staff} **Responsabile:** ${formatActor(audit.executor)}`,
    `${E.VC_User} **Target:** ${user}\`${user.id}\``,
    `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      `**${E.VC_tools} Informazioni aggiuntive**`,
    `${E.VC_Modifica} **Canale:** ${fromChannel}\`${oldChannelId || "sconosciuto"}\``,
    `${E.VC_Modifica} **Conteggio:** ${Math.max(1, Number(audit?.count || 1))}`,
    ].join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberDisconnectLog failed:");
}

async function sendMemberJoinLog(oldState?, newState?) {
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
    .setTitle(`${E.VC_User} Membro Entrato`)
    .setDescription([
      `${E.VC_User} **Target:** ${user}\`${user.id}\``,
      `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      `**${E.VC_tools} Informazioni aggiuntive**`,
      `${E.VC_Modifica} **Canale:** ${destination}\`${newChannelId || "sconosciuto"}\``,
    ].join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberJoinLog failed:");
}

async function sendMemberMoveLog(oldState?, newState?) {
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
    .setTitle(`${E.VC_User} Membro Spostato`)
    .setDescription([`${E.VC_Staff} **Responsabile:** ${responsibleText}`,
    `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
      "",
    `**${E.VC_tools} Informazioni aggiuntive**`,
    `${E.VC_Modifica} **Canale:** ${destination}\`${newChannelId}\``,
    `${E.VC_Modifica} **Conteggio:** ${Math.max(1, Number(audit.count || 1))}`,
    ].join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberMoveLog failed:");
}

function yesNo(value?) {
  return value ? "Si" : "No";
}

async function sendMemberVoiceFlagsUpdateLog(oldState?, newState?) {
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

  const lines = [`${E.VC_Staff} **Responsabile:** ${responsibleText}`,
  `${E.VC_User} **Target:** ${user}\`${user.id}\``,
  `${E.VC_Clock} ${toDiscordTimestamp(new Date(), "F")}`,
  ];
  if (auditNeeded && audit.reason) {
    lines.push(`${E.VC_Modifica} **Motivo:** ${audit.reason}`);
  }
  lines.push("", `**${E.VC_tools} Cambiamenti**`);

  if (muteChanged) {
    lines.push(`${E.VC_Modifica} **Mute**`);
    lines.push(`${yesNo(Boolean(oldState?.serverMute))} ${E.VC_Arrow} ${yesNo(Boolean(newState?.serverMute))}`);
  }
  if (deafChanged) {
    lines.push(`${E.VC_Modifica} **Deaf**`);
    lines.push(`${yesNo(Boolean(oldState?.serverDeaf))} ${E.VC_Arrow} ${yesNo(Boolean(newState?.serverDeaf))}`);
  }
  if (selfMuteChanged) {
    lines.push(`${E.VC_Modifica} **Self Mute**`);
    lines.push(`${yesNo(Boolean(oldState?.selfMute))} ${E.VC_Arrow} ${yesNo(Boolean(newState?.selfMute))}`);
  }
  if (selfDeafChanged) {
    lines.push(`${E.VC_Modifica} **Self Deaf**`);
    lines.push(`${yesNo(Boolean(oldState?.selfDeaf))} ${E.VC_Arrow} ${yesNo(Boolean(newState?.selfDeaf))}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`${E.VC_User} Membro Aggiornato`)
    .setDescription(lines.join("\n"));

  await sendLogWithRetry(logChannel, { embeds: [embed] }, "[voiceStateUpdate] sendMemberVoiceFlagsUpdateLog failed:");
}

export = {
  name: "voiceStateUpdate",
  async execute(oldState?, newState?, client?) {
    const guildId = String(newState?.guild?.id || oldState?.guild?.id || "").trim();
    if (guildId && !isViniliFullFeatureGuild(guildId)) return;

    try {
      const {
        finalizeStanzaVisitorVoiceSessionIfLeft,
        handleStanzaVoiceLobbyJoin,
        handleStanzaVoiceOccupied,
        handleStanzaVoiceEmpty,
        handleStanzaVoiceSilenceSync,
      } = require("../../Voice/services/stanzaVoiceRoomsService") as typeof import("../../Voice/services/stanzaVoiceRoomsService");
      try {
        await finalizeStanzaVisitorVoiceSessionIfLeft(oldState, newState);
      } catch (error) {
        global.logger?.warn?.("[voiceStateUpdate] stanza visitor flush:", error?.message || error);
      }
      try {
        await handleStanzaVoiceLobbyJoin(oldState, newState, client);
      } catch (error) {
        global.logger?.warn?.("[voiceStateUpdate] stanza lobby join:", error?.message || error);
      }
      try {
        await handleStanzaVoiceOccupied(oldState, newState);
      } catch (error) {
        global.logger?.warn?.("[voiceStateUpdate] stanza occupied:", error?.message || error);
      }
      try {
        await handleStanzaVoiceEmpty(oldState, newState);
      } catch (error) {
        global.logger?.warn?.("[voiceStateUpdate] stanza empty:", error?.message || error);
      }
      try {
        await handleStanzaVoiceSilenceSync(oldState, newState);
      } catch (error) {
        global.logger?.warn?.("[voiceStateUpdate] stanza silence sync:", error?.message || error);
      }
    } catch (error) {
      global.logger?.warn?.("[voiceStateUpdate] stanza hooks load:", error?.message || error);
    }

    /* perfP1: log audit fuori dal critical path (non bloccano activity/hub) */
    void sendMemberMoveLog(oldState, newState).catch((error?) => {
      global.logger?.error?.("[voiceStateUpdate] move log failed:", error);
    });
    void sendMemberVoiceFlagsUpdateLog(oldState, newState).catch((error?) => {
      global.logger?.error?.("[voiceStateUpdate] flags log failed:", error);
    });
    void sendMemberDisconnectLog(oldState, newState).catch((error?) => {
      global.logger?.error?.("[voiceStateUpdate] disconnect log failed:", error);
    });
    void sendMemberJoinLog(oldState, newState).catch((error?) => {
      global.logger?.error?.("[voiceStateUpdate] join log failed:", error);
    });

    try {
      await handleSerataFilmVoiceState(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[SERATA FILM STAFF AUTO ERROR]", error);
    }

    try {
      await handleSerataFilmAttendanceVoiceState(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[SERATA FILM ATTENDANCE ERROR]", error);
    }

    try {
      const { handleCustomVocVoiceStateUpdate } = require("../../Community/services/customVocPermissionsService") as typeof import("../../Community/services/customVocPermissionsService");
      await handleCustomVocVoiceStateUpdate(oldState, newState);
    } catch (error) {
      global.logger?.error?.("[CUSTOM VOC PERMS] voiceStateUpdate failed:", error);
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
    try {
      const { handleMinigameVoiceState } = require("../../Minigames/services/minigameService") as typeof import("../../Minigames/services/minigameService");
      await handleMinigameVoiceState(oldState, newState, client);
    } catch (error) {
      global.logger?.error?.("[MINIGAMES] voiceStateUpdate failed:", error);
    }
    try {
      const { handlePublicVoiceHubJoin, handlePublicVoiceHubEmpty } = require("../../Community/services/publicVoiceHubService") as typeof import("../../Community/services/publicVoiceHubService");
      if (
        client?.config?.publicVoiceHubs?.enabled !== false ||
        client?.config?.gameVoiceHubs?.enabled !== false
      ) {
        await handlePublicVoiceHubJoin(oldState, newState, client);
        await handlePublicVoiceHubEmpty(oldState, newState, client);
      }
    } catch (error) {
      global.logger?.error?.("[PUBLIC VOICE HUB ERROR]", error);
    }

        
    try {
      const { syncCaptureVoiceChannelMember } = require("../../Community/services/voiceContinuousCaptureService") as typeof import("../../Community/services/voiceContinuousCaptureService");
      if (newState?.channelId && newState.member && !newState.member.user?.bot) {
        syncCaptureVoiceChannelMember(newState.guild?.id, newState.member);
      }
    } catch (error) {
      global.logger?.warn?.("[voiceStateUpdate] clip capture sync failed:", error?.message || error);
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
        await handleTtsBotVoiceMove({ voiceChannel: channel, oldChannelId: oldState.channelId }).catch((err?) => {
          global.logger?.warn?.("[voiceStateUpdate] handleTtsBotVoiceMove failed:", err?.message || err);
        });
      }
    }

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      await handleMusicBotVoiceDisconnect(client, guild).catch((err?) => {
        global.logger?.warn?.("[voiceStateUpdate] handleMusicBotVoiceDisconnect failed:", err?.message || err);
      });
      await guild.members.fetch({ user: client.user.id, force: true }).catch(() => null);
      await leaveTtsGuild(guild.id, client).catch((err?) => {
        global.logger?.warn?.("[voiceStateUpdate] leaveTtsGuild failed:", err?.message || err);
      });
      return;
    }

    const botMember = guild.members.me || guild.members.cache.get(client.user.id);
    const botChannel = botMember?.voice?.channel;
    if (!botChannel) return;
    if (isTtsPostJoinVoiceGraceActive(guild.id)) return;

    const humans = botChannel.members.filter((m?) => !m.user.bot);
    if (humans.size === 0) {
      const { shouldDeferTtsLeaveForFindBotVoiceMinigame } = require("../../Minigames/services/minigameService") as typeof import("../../Minigames/services/minigameService");
      const { shouldDeferTtsLeaveForMusicEmptyVc } = require("../../../shared/music/services/lavalinkMusicService") as typeof import("../../../shared/music/services/lavalinkMusicService");
      if (shouldDeferTtsLeaveForFindBotVoiceMinigame(client, guild.id, botChannel.id)) {
      } else if (shouldDeferTtsLeaveForMusicEmptyVc(client, guild.id)) {
      } else {
        await leaveTtsGuild(guild.id, client).catch((err?) => {
          global.logger?.warn?.("[voiceStateUpdate] leaveTtsGuild failed:", err?.message || err);
        });
      }
    }
  },
};