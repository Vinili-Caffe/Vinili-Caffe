const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require("@discordjs/voice");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const { getMemberWatchEntry, isPendingAlert } = require("../Staff/pmVoiceAfkWatchService");
const PROBE_LISTEN_MS = Math.max( 30_000, Number(process.env.VC_PM_AFK_PROBE_LISTEN_MS || 90_000) );
const PROBE_JOIN_TIMEOUT_MS = 15_000;
const activeProbeByGuild = new Map();
const speechResolveByGuild = new Map();

function probeKey(guildId) {
  return String(guildId || "").trim();
}

function isProbeActive(guildId) {
  return activeProbeByGuild.has(probeKey(guildId));
}

function notifyProbeSpeechHeard(guildId, userId) {
  const key = probeKey(guildId);
  const probe = activeProbeByGuild.get(key);
  if (!probe || String(probe.targetUserId) !== String(userId || "")) return false;
  const resolve = speechResolveByGuild.get(key);
  if (typeof resolve === "function") {
    speechResolveByGuild.delete(key);
    resolve(true);
  }
  return true;
}

async function captureReturnVoiceContext(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return { mode: "none", channelId: null };

  const music = require("../Music/lavalinkMusicService");
  const sh = client?.shoukaku;
  const shConn = sh?.connections?.get(gid);
  const shPlayer = sh?.players?.get(gid);
  const musicChannelId = String(shConn?.channelId || music.getGuildMusicVoiceChannelId(gid) || "").trim();
  const hasMusicSession =
    Boolean(musicChannelId) &&
    (Boolean(shPlayer?.track) || music.guildHasMusicVoiceResumeHint(gid));

  if (hasMusicSession) {
    return { mode: "music", channelId: musicChannelId };
  }

  const {
    getTtsReturnChannelIdForGuild,
    snapshotTtsQueueForGuild,
  } = require("../TTS/ttsService");
  const ttsChannelId = getTtsReturnChannelIdForGuild(gid);
  const nativeConn = getVoiceConnection(gid);
  const nativeChannelId = nativeConn?.joinConfig?.channelId
    ? String(nativeConn.joinConfig.channelId)
    : null;
  const channelId = String(ttsChannelId || nativeChannelId || "").trim();
  if (!channelId) return { mode: "none", channelId: null };

  return {
    mode: "tts",
    channelId,
    ttsQueue: snapshotTtsQueueForGuild(gid, channelId),
  };
}

async function suspendActiveVoiceForProbe(client, guildId, returnCtx) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  if (returnCtx?.mode === "music") {
    const music = require("../Music/lavalinkMusicService");
    await music.suspendMusicVoiceForAfkProbe(client, gid).catch((err) => {
      global.logger?.warn?.("[VOICE AFK PROBE] music suspend:", err?.message || err);
    });
    return;
  }
  if (returnCtx?.mode === "tts") {
    const { suspendTtsVoiceForAfkProbe } = require("../TTS/ttsService");
    await suspendTtsVoiceForAfkProbe(client, gid).catch((err) => {
      global.logger?.warn?.("[VOICE AFK PROBE] tts suspend:", err?.message || err);
    });
  }
}

async function restoreVoiceAfterProbe(client, guildId, returnCtx) {
  const gid = String(guildId || "").trim();
  if (!gid || !returnCtx || returnCtx.mode === "none") return;

  const probeConn = getVoiceConnection(gid);
  if (probeConn) {
    try {
      probeConn.destroy();
    } catch (_) {}
  }

  if (returnCtx.mode === "music") {
    const music = require("../Music/lavalinkMusicService");
    await music.resumeMusicVoiceAfterAfkProbe(client, gid).catch((err) => {
      global.logger?.warn?.("[VOICE AFK PROBE] music resume:", err?.message || err);
    });
    return;
  }

  if (returnCtx.mode === "tts" && returnCtx.channelId) {
    const { resumeTtsVoiceAfterAfkProbe } = require("../TTS/ttsService");
    await resumeTtsVoiceAfterAfkProbe(client, gid, returnCtx.channelId, returnCtx.ttsQueue).catch((err) => {
      global.logger?.warn?.("[VOICE AFK PROBE] tts resume:", err?.message || err);
    });
  }
}

function waitForTargetSpeech(connection, guildId, targetUserId, timeoutMs) {
  return new Promise((resolve) => {
    const key = probeKey(guildId);
    let settled = false;
    const finish = (heard) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      speechResolveByGuild.delete(key);
      try {
        connection?.receiver?.speaking?.off?.("start", onStart);
      } catch (_) {}
      resolve(Boolean(heard));
    };
    const onStart = (userId) => {
      if (String(userId) === String(targetUserId)) finish(true);
    };
    speechResolveByGuild.set(key, finish);
    try {
      connection.receiver.speaking.on("start", onStart);
    } catch (_) {
      finish(false);
      return;
    }
    const timer = setTimeout(() => finish(false), Math.max(5_000, Number(timeoutMs) || PROBE_LISTEN_MS));
    if (typeof timer.unref === "function") timer.unref();
  });
}

async function joinProbeVoiceConnection(guild, voiceChannel, client) {
  const gid = String(guild.id || "");
  if (client?.shoukaku?.connections?.get(gid)?.channelId) {
    const music = require("../Music/lavalinkMusicService");
    music.markMusicVoiceLeaveIntentional(client, gid);
    await client.shoukaku.leaveVoiceChannel(gid).catch(() => {});
  }
  const existing = getVoiceConnection(gid);
  if (existing && String(existing.joinConfig?.channelId) !== String(voiceChannel.id)) {
    try {
      existing.destroy();
    } catch (_) {}
  }
  const connection = joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: guild.id,
    adapterCreator: guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });
  await entersState(connection, VoiceConnectionStatus.Ready, PROBE_JOIN_TIMEOUT_MS);
  return connection;
}

function buildAfkProbeTtsPrompt(listenSec) {
  const sec = Math.max(30, Math.floor(Number(listenSec) || 90));
  return [
    "Ciao! Controllo anti-AFK.",
    "Sei da solo in questo canale da un po'.",
    `Per confermare che non sei inattivo, parla nel microfono entro ${sec} secondi.`,
    "Puoi anche scrivere in chat oppure uscire dal vocale per annullare il controllo.",
  ].join(" ");
}

async function playAfkProbeTtsPrompt(client, connection, listenSec) {
  if (!connection) return false;
  try {
    const { resolveDefaultTtsLang, playOneShotTtsOnConnection } = require("../TTS/ttsService");
    const lang = resolveDefaultTtsLang(client);
    const text = buildAfkProbeTtsPrompt(listenSec);
    return await playOneShotTtsOnConnection(connection, text, lang);
  } catch (err) {
    global.logger?.warn?.("[VOICE AFK PROBE] TTS prompt failed:", err?.message || err);
    return false;
  }
}

function abortPmVoiceAfkProbe(guildId) {
  const key = probeKey(guildId);
  const probe = activeProbeByGuild.get(key);
  if (probe) probe.aborted = true;
  const resolve = speechResolveByGuild.get(key);
  if (typeof resolve === "function") resolve(false);
}

async function deleteProbeAlertMessage(client, guildId, channelId, messageId) {
  if (!client || !channelId || !messageId) return false;
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  const channel = guild ? await getGuildChannelCached(guild, channelId).catch(() => null) : null;
  if (!channel?.messages?.fetch) return false;
  const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
  if (!msg?.deletable) return false;
  await msg.delete().catch(() => null);
  return true;
}

async function editProbeAlertMessage(client, guildId, channelId, messageId, suffixLines) {
  if (!client || !channelId || !messageId) return;
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  const channel = guild ? await getGuildChannelCached(guild, channelId).catch(() => null) : null;
  if (!channel?.messages?.fetch) return;
  const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
  if (!msg?.editable) return;
  const embed = msg.embeds?.[0];
  if (!embed) return;
  const base = String(embed.data?.description || embed.description || "").trim();
  const next = [base, "", ...suffixLines].filter(Boolean).join("\n");
  const { EmbedBuilder } = require("discord.js");
  await msg.edit({ embeds: [EmbedBuilder.from(embed).setDescription(next.slice(0, 4096))], components: [] }).catch(() => null);
}

async function escalatePmAfkToStaff(client, member, voiceChannelId, aloneMs) {
  const IDs = require("../../Utils/Config/ids");
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
  const { formatItalianMinutesBold } = require("../../Utils/Text/italianDurationLabels");
  const sanzioniId = String(IDs.channels?.sanzioniUtenti || "").trim();
  const staffRoleId = String(IDs.roles?.Staff || "").trim();
  if (!sanzioniId || !member?.id) return false;

  const guild = member.guild || (await getClientGuildCached(client, IDs.guilds?.main).catch(() => null));
  if (!guild) return false;
  const textChannel = await getGuildChannelCached(guild, sanzioniId).catch(() => null);
  if (!textChannel?.isTextBased?.()) return false;

  const channelRef = voiceChannelId ? `<#${voiceChannelId}>` : "vocale";
  const minutes = Math.max(1, Math.round(aloneMs / 60_000));
  const embed = new EmbedBuilder()
    .setColor("#E74C3C")
    .setTitle("<:VC_Attention:1482534443632558151> Controllo anti-AFK")
    .setDescription(
      [
        `${member} non ha risposto in vocale al controllo automatico.`,
        `È da ${formatItalianMinutesBold(minutes)} da solo in ${channelRef}.`,
        "",
        "Verificate la regola **3.6**: se l'utente è AFK senza risposta, procedete con le sanzioni previste.",
        "Per usare i pulsanti serve essere **nello stesso canale vocale** dell'utente.",
      ].join("\n"),
    )
    .setFooter({ text: `ID utente: ${member.id}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pm_afk_watch_confirm:${String(member.id)}:${String(voiceChannelId || "")}`)
      .setLabel("Conferma AFK (sanziona)")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`pm_afk_watch_deny:${String(member.id)}:${String(voiceChannelId || "")}`)
      .setLabel("Non è AFK (reset)")
      .setStyle(ButtonStyle.Secondary),
  );
  const ping = staffRoleId ? `<@&${staffRoleId}>` : "";
  await textChannel
    .send({ embeds: [embed], components: [row], ...(ping ? { content: ping } : {}) })
    .catch((err) => {
      global.logger?.warn?.("[VOICE AFK PROBE] staff escalation failed:", err?.message || err);
      return null;
    });
  return true;
}

async function startPmVoiceAfkProbe(client, opts = {}) {
  const guildId = String(opts.guildId || "").trim();
  const targetUserId = String(opts.targetUserId || "").trim();
  const voiceChannelId = String(opts.voiceChannelId || "").trim();
  const alertMessageId = String(opts.alertMessageId || "").trim();
  const aloneMs = Number(opts.aloneMs || 0);
  if (!client || !guildId || !targetUserId || !voiceChannelId) return false;
  if (activeProbeByGuild.has(guildId)) return false;

  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return false;
  const voiceChannel = await getGuildChannelCached(guild, voiceChannelId).catch(() => null);
  if (!voiceChannel?.isVoiceBased?.()) return false;

  const returnCtx = await captureReturnVoiceContext(client, guildId);
  activeProbeByGuild.set(guildId, {
    targetUserId,
    voiceChannelId,
    alertMessageId,
    returnCtx,
    startedAt: Date.now(),
  });

  let connection = null;
  let heard = false;
  try {
    await suspendActiveVoiceForProbe(client, guildId, returnCtx);
    connection = await joinProbeVoiceConnection(guild, voiceChannel, client);
    const { startVoiceContinuousCapture } = require("./voiceContinuousCaptureService");
    await startVoiceContinuousCapture({
      guildId,
      voiceChannel,
      client,
      botUserId: client?.user?.id,
    }).catch(() => null);
    const listenSec = Math.round(PROBE_LISTEN_MS / 1000);
    await playAfkProbeTtsPrompt(client, connection, listenSec);
    heard = await waitForTargetSpeech(connection, guildId, targetUserId, PROBE_LISTEN_MS);
  } catch (err) {
    global.logger?.warn?.("[VOICE AFK PROBE] listen failed:", err?.message || err);
  } finally {
    activeProbeByGuild.delete(guildId);
    speechResolveByGuild.delete(guildId);
    const { stopVoiceContinuousCapture } = require("./voiceContinuousCaptureService");
    await stopVoiceContinuousCapture(guildId, client).catch(() => null);
    if (connection) {
      try {
        connection.destroy();
      } catch (_) {}
    }
    await restoreVoiceAfterProbe(client, guildId, returnCtx);
  }

  const entry = getMemberWatchEntry(guildId, targetUserId);

  if (heard) {
    await deleteProbeAlertMessage(client, guildId, voiceChannelId, alertMessageId);
    const { clearPmVoiceAfkCountdown } = require("../Staff/pmVoiceAfkWatchService");
    clearPmVoiceAfkCountdown(guildId, targetUserId);
    return true;
  }

  if (!isPendingAlert(entry)) return false;

  const member = await guild.members.fetch(targetUserId).catch(() => null);
  if (!member?.voice?.channelId || String(member.voice.channelId) !== voiceChannelId) {
    await deleteProbeAlertMessage(client, guildId, voiceChannelId, alertMessageId);
    const { clearPmVoiceAfkCountdown } = require("../Staff/pmVoiceAfkWatchService");
    clearPmVoiceAfkCountdown(guildId, targetUserId);
    return false;
  }

  await editProbeAlertMessage(client, guildId, voiceChannelId, alertMessageId, [
    "⚠️ **Non ti abbiamo sentito** nel tempo previsto.",
    "Se non sei AFK, **parla ora in vocale** o scrivi in chat; altrimenti lo staff potrebbe intervenire (regola **3.6**).",
  ]);
  await escalatePmAfkToStaff(client, member, voiceChannelId, aloneMs);
  return false;
}

module.exports = { PROBE_LISTEN_MS, isProbeActive, notifyProbeSpeechHeard, abortPmVoiceAfkProbe, editProbeAlertMessage, deleteProbeAlertMessage, startPmVoiceAfkProbe };