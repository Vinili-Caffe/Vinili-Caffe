const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require("@discordjs/voice") as typeof import("@discordjs/voice");
const { getClientGuildCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getMemberWatchEntry, isPendingAlert } = require("../Staff/pmVoiceAfkWatchService") as typeof import("../Staff/pmVoiceAfkWatchService");
const PROBE_LISTEN_MS = Math.max( 30_000, Number(process.env.VC_PM_AFK_PROBE_LISTEN_MS || 90_000) );
const PROBE_JOIN_TIMEOUT_MS = 15_000;
const PROBE_JOIN_ATTEMPTS = 3;
const activeProbeByGuild = new Map();
const speechResolveByGuild = new Map();

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, Math.max(0, Number(ms) || 0));
    if (typeof timer.unref === "function") timer.unref();
  });
}

function createDeferred() {
  let resolve: (value?: any) => void = () => {};
  const promise = new Promise((res?) => {
    resolve = (res as any);
  });
  return { promise, resolve };
}

function probeKey(guildId?) {
  return String(guildId || "").trim();
}

function isProbeActive(guildId?) {
  return activeProbeByGuild.has(probeKey(guildId));
}

function notifyProbeSpeechHeard(guildId?, userId?) {
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

async function captureReturnVoiceContext(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { mode: "none", channelId: null };

  const music = require("../Music/lavalinkMusicService") as typeof import("../Music/lavalinkMusicService");
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
  } = require("../TTS/ttsService") as typeof import("../TTS/ttsService");
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

async function suspendActiveVoiceForProbe(client?, guildId?, returnCtx?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  if (returnCtx?.mode === "music") {
    const music = require("../Music/lavalinkMusicService") as typeof import("../Music/lavalinkMusicService");
    await music.suspendMusicVoiceForAfkProbe(client, gid).catch((err?) => {
      global.logger?.warn?.("[VOICE AFK PROBE] music suspend:", err?.message || err);
    });
    return;
  }
  if (returnCtx?.mode === "tts") {
    const { suspendTtsVoiceForAfkProbe } = require("../TTS/ttsService") as typeof import("../TTS/ttsService");
    await suspendTtsVoiceForAfkProbe(client, gid).catch((err?) => {
      global.logger?.warn?.("[VOICE AFK PROBE] tts suspend:", err?.message || err);
    });
  }
}

async function restoreVoiceAfterProbe(client?, guildId?, returnCtx?) {
  const gid = String(guildId || "").trim();
  if (!gid || !returnCtx || returnCtx.mode === "none") return;

  const probeConn = getVoiceConnection(gid);
  if (probeConn) {
    try {
      probeConn.destroy();
    } catch (_) {}
  }

  if (returnCtx.mode === "music") {
    const music = require("../Music/lavalinkMusicService") as typeof import("../Music/lavalinkMusicService");
    await music.resumeMusicVoiceAfterAfkProbe(client, gid).catch((err?) => {
      global.logger?.warn?.("[VOICE AFK PROBE] music resume:", err?.message || err);
    });
    return;
  }

  if (returnCtx.mode === "tts" && returnCtx.channelId) {
    const { resumeTtsVoiceAfterAfkProbe } = require("../TTS/ttsService") as typeof import("../TTS/ttsService");
    await resumeTtsVoiceAfterAfkProbe(client, gid, returnCtx.channelId, returnCtx.ttsQueue).catch((err?) => {
      global.logger?.warn?.("[VOICE AFK PROBE] tts resume:", err?.message || err);
    });
  }
}

function waitForTargetSpeech(connection?, guildId?, targetUserId?, timeoutMs?) {
  return new Promise((resolve?) => {
    const key = probeKey(guildId);
    let settled = false;
    const finish = (heard?) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      speechResolveByGuild.delete(key);
      try {
        connection?.receiver?.speaking?.off?.("start", onStart);
      } catch (_) {}
      resolve(Boolean(heard));
    };
    const onStart = (userId?) => {
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

function isProbeAborted(guildId?) {
  return activeProbeByGuild.get(probeKey(guildId))?.aborted === true;
}

async function waitForGuildVoiceIdle(guildId?, client?, maxMs = 4000) {
  const gid = String(guildId || "").trim();
  if (!gid) return true;
  const deadline = Date.now() + Math.max(500, Number(maxMs) || 4000);
  while (Date.now() < deadline) {
    const shConn = client?.shoukaku?.connections?.get(gid);
    const native = getVoiceConnection(gid);
    const shBusy = Boolean(shConn?.channelId);
    const nativeBusy = Boolean(native && native.state?.status !== VoiceConnectionStatus.Destroyed);
    if (!shBusy && !nativeBusy) return true;
    await sleep(250);
  }
  return false;
}

async function releaseGuildVoiceForProbe(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  if (client?.shoukaku?.connections?.get(gid)?.channelId) {
    const music = require("../Music/lavalinkMusicService") as typeof import("../Music/lavalinkMusicService");
    music.markMusicVoiceLeaveIntentional(client, gid);
    await client.shoukaku.leaveVoiceChannel(gid).catch(() => {});
  }
  const native = getVoiceConnection(gid);
  if (native) {
    try {
      native.destroy();
    } catch (_) {}
  }
  await waitForGuildVoiceIdle(gid, client, 4000);
}

async function resolveProbeGuild(client?, guildId?, fallbackGuild = null) {
  if (fallbackGuild?.voiceAdapterCreator) return fallbackGuild;
  const cached = await getClientGuildCached(client, guildId).catch(() => null);
  if (cached?.voiceAdapterCreator) return cached;
  return client?.guilds?.fetch?.(guildId).catch(() => cached || fallbackGuild);
}

async function joinProbeVoiceConnection(guild?, voiceChannel?, client?) {
  const gid = String(guild?.id || voiceChannel?.guild?.id || "").trim();
  if (!gid || !voiceChannel?.id) throw new Error("invalid_voice_channel");
  await releaseGuildVoiceForProbe(client, gid);
  const liveGuild = await resolveProbeGuild(client, gid, guild);
  if (!liveGuild?.voiceAdapterCreator) throw new Error("missing_voice_adapter");

  let lastErr = null;
  for (let attempt = 1; attempt <= PROBE_JOIN_ATTEMPTS; attempt += 1) {
    try {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: liveGuild.id,
        adapterCreator: liveGuild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: true,
      });
      await entersState(connection, VoiceConnectionStatus.Ready, PROBE_JOIN_TIMEOUT_MS);
      return connection;
    } catch (err) {
      lastErr = err;
      const stale = getVoiceConnection(gid);
      if (stale) {
        try {
          stale.destroy();
        } catch (_) {}
      }
      if (attempt < PROBE_JOIN_ATTEMPTS) await sleep(1500 * attempt);
    }
  }
  throw lastErr || new Error("join_failed");
}

function buildAfkProbeTtsPrompt(listenSec?) {
  const sec = Math.max(30, Math.floor(Number(listenSec) || 90));
  return [
    "Ciao! Controllo anti-AFK.",
    "Sei da solo in questo canale da un po'.",
    `Per confermare che non sei inattivo, parla nel microfono entro ${sec} secondi.`,
    "Puoi anche scrivere in chat oppure uscire dal vocale per annullare il controllo.",
  ].join(" ");
}

async function playAfkProbeTtsPrompt(client?, connection?, listenSec?) {
  if (!connection) return false;
  try {
    const { resolveDefaultTtsLang, playOneShotTtsOnConnection } = require("../TTS/ttsService") as typeof import("../TTS/ttsService");
    const lang = resolveDefaultTtsLang(client);
    const text = buildAfkProbeTtsPrompt(listenSec);
    return await playOneShotTtsOnConnection(connection, text, lang);
  } catch (err) {
    global.logger?.warn?.("[VOICE AFK PROBE] TTS prompt failed:", err?.message || err);
    return false;
  }
}

function abortPmVoiceAfkProbe(guildId?) {
  const key = probeKey(guildId);
  const probe = activeProbeByGuild.get(key);
  if (probe) probe.aborted = true;
  const resolve = speechResolveByGuild.get(key);
  if (typeof resolve === "function") resolve(false);
}

async function deleteProbeAlertMessage(client?, guildId?, channelId?, messageId?) {
  if (!client || !channelId || !messageId) return false;
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  const channel = guild ? await getGuildChannelCached(guild, channelId).catch(() => null) : null;
  if (!channel?.messages?.fetch) return false;
  const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
  if (!msg?.deletable) return false;
  await msg.delete().catch(() => null);
  return true;
}

async function editProbeAlertMessage(client?, guildId?, channelId?, messageId?, suffixLines?) {
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
  const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
  await msg.edit({ embeds: [EmbedBuilder.from(embed).setDescription(next.slice(0, 4096))], components: [] }).catch(() => null);
}

async function escalatePmAfkToStaff(client?, member?, voiceChannelId?, aloneMs?) {
  const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
  const { formatItalianMinutesBold } = require("../../Utils/Text/italianDurationLabels") as typeof import("../../Utils/Text/italianDurationLabels");
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
        "Verificate la regola **3.5**: se l'utente è AFK senza risposta, procedete con le sanzioni previste.",
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
    .catch((err?) => {
      global.logger?.warn?.("[VOICE AFK PROBE] staff escalation failed:", err?.message || err);
      return null;
    });
  return true;
}

async function sendPmAfkUserAlertEmbed(client?, member?, voiceChannel?, aloneMs?) {
  if (!member?.id || !voiceChannel?.id) return null;
  const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
  const { formatItalianMinutesBold } = require("../../Utils/Text/italianDurationLabels") as typeof import("../../Utils/Text/italianDurationLabels");
  const minutes = Math.max(1, Math.round(aloneMs / 60_000));
  const listenSec = Math.max(30, Math.round(PROBE_LISTEN_MS / 1000));
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
    );
  const sent = await voiceChannel
    .send({
      content: `${member}`,
      embeds: [embed],
      allowedMentions: { users: [String(member.id)] },
    })
    .catch((err?) => {
      global.logger?.warn?.("[VOICE AFK PROBE] Invio avviso utente fallito:", err?.message || err);
      return null;
    });
  if (!sent?.id) return null;
  return { channelId: String(voiceChannel.id), messageId: String(sent.id) };
}

async function startPmVoiceAfkProbe(client?, opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || "").trim();
  const targetUserId = String(opts.targetUserId || "").trim();
  const voiceChannelId = String(opts.voiceChannelId || "").trim();
  let alertMessageId = String(opts.alertMessageId || "").trim();
  const aloneMs = Number(opts.aloneMs || 0);
  const composeAlert = opts.composeAlert === true;
  const member = opts.member || null;
  if (!client || !guildId || !targetUserId || !voiceChannelId) return null;
  if (activeProbeByGuild.has(guildId)) return null;

  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return null;
  const voiceChannel = await getGuildChannelCached(guild, voiceChannelId).catch(() => null);
  if (!voiceChannel?.isVoiceBased?.()) return null;

  const returnCtx = await captureReturnVoiceContext(client, guildId);
  const alertReady = composeAlert ? createDeferred() : null;
  activeProbeByGuild.set(guildId, {
    targetUserId,
    voiceChannelId,
    alertMessageId,
    returnCtx,
    startedAt: Date.now(),
    aborted: false,
  });

  void (async () => {
    let connection = null;
    let heard: any = false;
    try {
      await suspendActiveVoiceForProbe(client, guildId, returnCtx);
      if (isProbeAborted(guildId)) return;
      connection = await joinProbeVoiceConnection(guild, voiceChannel, client);
      if (isProbeAborted(guildId)) return;

      if (composeAlert && member) {
        const sent = await sendPmAfkUserAlertEmbed(client, member, voiceChannel, aloneMs);
        if (!sent?.messageId) {
          alertReady?.resolve(null);
          return;
        }
        alertMessageId = sent.messageId;
        const probe = activeProbeByGuild.get(guildId);
        if (probe) probe.alertMessageId = alertMessageId;
        const { markPmAfkAlertSent } = require("../Staff/pmVoiceAfkWatchService") as typeof import("../Staff/pmVoiceAfkWatchService");
        markPmAfkAlertSent(guildId, targetUserId, sent.channelId, sent.messageId);
        alertReady?.resolve(sent);
      } else if (alertReady) {
        (alertReady.resolve as any)(alertMessageId ? { channelId: voiceChannelId, messageId: alertMessageId } : null);
      }

      const { startVoiceContinuousCapture } = require("./voiceContinuousCaptureService") as typeof import("./voiceContinuousCaptureService");
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
      alertReady?.resolve(null);
    } finally {
      activeProbeByGuild.delete(guildId);
      speechResolveByGuild.delete(guildId);
      const { stopVoiceContinuousCapture } = require("./voiceContinuousCaptureService") as typeof import("./voiceContinuousCaptureService");
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
      const { clearPmVoiceAfkCountdown } = require("../Staff/pmVoiceAfkWatchService") as typeof import("../Staff/pmVoiceAfkWatchService");
      clearPmVoiceAfkCountdown(guildId, targetUserId);
      return;
    }

    if (!isPendingAlert(entry)) return;

    const liveGuild = await getClientGuildCached(client, guildId).catch(() => guild);
    const liveMember = await liveGuild?.members?.fetch?.(targetUserId).catch(() => null);
    if (!liveMember?.voice?.channelId || String(liveMember.voice.channelId) !== voiceChannelId) {
      await deleteProbeAlertMessage(client, guildId, voiceChannelId, alertMessageId);
      const { clearPmVoiceAfkCountdown } = require("../Staff/pmVoiceAfkWatchService") as typeof import("../Staff/pmVoiceAfkWatchService");
      clearPmVoiceAfkCountdown(guildId, targetUserId);
      return;
    }

    await editProbeAlertMessage(client, guildId, voiceChannelId, alertMessageId, [
      "⚠️ **Non ti abbiamo sentito** nel tempo previsto.",
      "Se non sei AFK, **parla ora in vocale** o scrivi in chat; altrimenti lo staff potrebbe intervenire (regola **3.5**).",
    ]);
    await escalatePmAfkToStaff(client, liveMember, voiceChannelId, aloneMs);
  })().catch((err?) => {
    global.logger?.warn?.("[VOICE AFK PROBE] probe run failed:", err?.message || err);
    alertReady?.resolve(null);
  });

  if (alertReady) return alertReady.promise;
  return { channelId: voiceChannelId, messageId: alertMessageId || "" };
}

export = { PROBE_LISTEN_MS, isProbeActive, notifyProbeSpeechHeard, abortPmVoiceAfkProbe, editProbeAlertMessage, deleteProbeAlertMessage, startPmVoiceAfkProbe };