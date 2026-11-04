/** Stanze vocali: risposte scritte dopo un pulsante (nome, emoji, limite, descrizione, utenti, vice). */
const { MAIN_GUILD_ID, stanzaRenamePending, stanzaEmojiPending, stanzaLimitPending, stanzaDescPending, stanzaVicePending, stanzaUsersMemberPending, normalizeStanzaDiscordUserId, buildStanzaVoiceNameFromUserPart, buildStanzaVoiceNameWithNewEmoji, extractExactUnicodeEmojiLine, parseStanzaLimitUserInput, sanitizeStanzaVoiceStatus, setStanzaVoiceChannelStatus, persistStanzaSnapshotNow } = require("./stanzaNames") as typeof import("./stanzaNames");
const { ownerKey } = require("./stanzaVisitors") as typeof import("./stanzaVisitors");
const { pendingRenameKey, clearStanzaRenamePending, pendingEmojiKey, clearStanzaEmojiPending, clearStanzaVicePending, clearStanzaUsersMemberPending, editStanzaUsersMemberFollowup, pendingLimitKey, clearStanzaLimitPending, pendingDescKey, clearStanzaDescPending } = require("./stanzaPending") as typeof import("./stanzaPending");
const { setStanzaPrivilegedUserVoiceOverwrite, ensureStanzaBotVoiceOverwrite, applyStanzaMemberServerMute, addStanzaSilencedUser, removeStanzaSilencedUser, isLegacyStanzaSilenceVoiceOverwrite, isLegacyStanzaSilenceTextOverwrite, clearLegacyStanzaSilenceVoiceOverwrite, applyStanzaSilencedTextChat, removeStanzaMemberVoiceOverwrite, applyStanzaMemberVoicePerms, applyStanzaMemberTextPerms, setStanzaPrivilegedUserTextOverwrite, removeStanzaMemberTextOverwrite, stanzaCompanionTextChannel } = require("./stanzaPerms") as typeof import("./stanzaPerms");
const { markStanzaBotRename, stanzaPanelTargetChannelId, isStanzaUserSilenced, syncStanzaCompanionTextName, fetchStanzaVoiceChannel, getStanzaMetaOrRehydrate, refreshStanzaPanelEmbedsIfPossible } = require("./stanzaPanel") as typeof import("./stanzaPanel");
const { isStanzaRoomController } = require("./stanzaButtons") as typeof import("./stanzaButtons");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const STANZA_VOICE_MEMBER_ALLOW = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true };
const STANZA_VOICE_MEMBER_EXCLUDE = { ViewChannel: false, Connect: false };
const STANZA_TEXT_MEMBER_ALLOW = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };
const STANZA_TEXT_MEMBER_EXCLUDE = { ViewChannel: false, SendMessages: false };

async function handleStanzaRenameMessageCreate(message?) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingRenameKey(message.guild.id, message.author.id);
  const pending = stanzaRenamePending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaRenamePending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaRenamePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaRenamePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const newName = buildStanzaVoiceNameFromUserPart(rawLine, voiceCh.name);
  if (!newName) {
    await message.delete().catch(() => {});
    clearStanzaRenamePending(message.guild.id, message.author.id);
    return true;
  }

  markStanzaBotRename(vid);
  await voiceCh.setName(newName, "Stanza: rinomina").catch(() => {});
  await syncStanzaCompanionTextName(message.guild, vid, newName);
  await message.delete().catch(() => {});
  clearStanzaRenamePending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaEmojiMessageCreate(message?) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingEmojiKey(message.guild.id, message.author.id);
  const pending = stanzaEmojiPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const emojiOnly = extractExactUnicodeEmojiLine(rawLine);
  if (!emojiOnly) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const newName = buildStanzaVoiceNameWithNewEmoji(voiceCh.name, emojiOnly);
  if (!newName) {
    await message.delete().catch(() => {});
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    return true;
  }

  markStanzaBotRename(vid);
  await voiceCh.setName(newName, "Stanza: emoji").catch(() => {});
  await syncStanzaCompanionTextName(message.guild, vid, newName);
  await message.delete().catch(() => {});
  clearStanzaEmojiPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaLimitMessageCreate(message?) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingLimitKey(message.guild.id, message.author.id);
  const pending = stanzaLimitPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaLimitPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const limitVal = parseStanzaLimitUserInput(rawLine);
  if (limitVal === null) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaLimitPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaLimitPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  await voiceCh.setUserLimit(limitVal, "Stanza: limite utenti").catch(() => {});
  await message.delete().catch(() => {});
  clearStanzaLimitPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaDescMessageCreate(message?) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = pendingDescKey(message.guild.id, message.author.id);
  const pending = stanzaDescPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const firstLine = String(message.content || "").split("\n")[0];
  if (firstLine.trimStart().startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  const meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const statusText = sanitizeStanzaVoiceStatus(message.content);
  await setStanzaVoiceChannelStatus(message.client, voiceCh.id, statusText, "Stanza: stato canale vocale").catch(() => {});
  await message.delete().catch(() => {});
  clearStanzaDescPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaUsersMemberMessageCreate(message?) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = ownerKey(message.guild.id, message.author.id);
  const pending = stanzaUsersMemberPending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  let meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: `${E.VC_Cross} Questa stanza non è più attiva.` });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: `${E.VC_Cross} Canale vocale non trovato.` });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }

  if (!isStanzaRoomController(meta, message.author.id)) {
    await editStanzaUsersMemberFollowup(message.client, pending, {
      content: `${E.VC_Cross} Solo il creatore della stanza e il vice possono usare questa azione.`,
    });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned || mentioned.bot) return false;

  const targetId = mentioned.id;
  const botId = String(message.client.user.id);
  const viceId = normalizeStanzaDiscordUserId(meta.viceUserId);
  const failPerm =
    `${E.VC_Cross} Non sono riuscito ad aggiornare i permessi sul canale.`;

  if (targetId === botId || targetId === String(meta.ownerId) || (viceId && targetId === viceId)) {
    await editStanzaUsersMemberFollowup(message.client, pending, {
      content: `${E.VC_Cross} Non puoi usare questa azione su bot, creatore o vice.`,
    });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
  if (!targetMember || targetMember.user?.bot) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: `${E.VC_Cross} Utente non valido.` });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const action = pending.action;
  let ok: any = false;
  let doneLine = "";

  const tchUsers = await stanzaCompanionTextChannel(message.guild, vid);

  if (action === "include") {
    ok = await applyStanzaMemberVoicePerms(voiceCh, targetId, STANZA_VOICE_MEMBER_ALLOW, "Stanza: includi utente").catch(() => {});
    if (ok && tchUsers) {
      await applyStanzaMemberTextPerms(tchUsers, targetId, STANZA_TEXT_MEMBER_ALLOW, "Stanza: includi utente").catch(() => {});
    }
    doneLine = ok ? `${E.VC_Verified} ${targetMember} è stato incluso.` : failPerm;
  } else if (action === "exclude") {
    ok = await applyStanzaMemberVoicePerms(voiceCh, targetId, STANZA_VOICE_MEMBER_EXCLUDE, "Stanza: escludi utente").catch(() => {});
    if (ok && tchUsers) {
      await applyStanzaMemberTextPerms(tchUsers, targetId, STANZA_TEXT_MEMBER_EXCLUDE, "Stanza: escludi utente").catch(() => {});
    }
    if (ok && targetMember.voice?.channelId === voiceCh.id) {
      await targetMember.voice.disconnect("Stanza: escluso dalla stanza").catch(() => {});
    }
    doneLine = ok ? `${E.VC_Verified} ${targetMember} è stato escluso.` : failPerm;
  } else if (action === "silenzia") {
    const botId = String(message.client?.user?.id || "");
    if (botId) await ensureStanzaBotVoiceOverwrite(voiceCh, botId).catch(() => {});
    await clearLegacyStanzaSilenceVoiceOverwrite(
      voiceCh,
      targetId,
      "Stanza: silenzio via server mute (no Speak-deny)",
    );
    addStanzaSilencedUser(meta, targetId);
    persistStanzaSnapshotNow();
    const chatOk = await applyStanzaSilencedTextChat(
      message.guild,
      voiceCh.id,
      targetId,
      true,
      "Stanza: silenzia chat",
    ).catch(() => false);
    if (String(targetMember.voice?.channelId || "") === String(voiceCh.id)) {
      ok = await applyStanzaMemberServerMute(targetMember, voiceCh.id, true, "Stanza: silenzia utente");
      doneLine = ok
        ? `${E.VC_Verified} ${targetMember} è stato silenziato (microfono + chat).`
        : failPerm;
    } else {
      ok = true;
      doneLine = `${E.VC_Verified} ${targetMember} è silenziato in questa stanza (mute al prossimo ingresso; chat già bloccata).`;
    }
    if (ok && chatOk === false && tchUsers) {
      doneLine += `\n${E.VC_Attention} Mute ok, ma non sono riuscito a bloccare la chat.`;
    }
  } else if (action === "smuta") {
    const legacyOw = voiceCh.permissionOverwrites.cache.get(targetId);
    const textOw = tchUsers?.permissionOverwrites?.cache?.get?.(targetId);
    const wasSilenced =
      isStanzaUserSilenced(meta, targetId) ||
      isLegacyStanzaSilenceVoiceOverwrite(legacyOw) ||
      isLegacyStanzaSilenceTextOverwrite(textOw);
    if (!wasSilenced) {
      doneLine = `${E.VC_Cross} ${targetMember} non risulta silenziato in questa stanza.`;
    } else {
      const botId = String(message.client?.user?.id || "");
      if (botId) await ensureStanzaBotVoiceOverwrite(voiceCh, botId).catch(() => {});
      await clearLegacyStanzaSilenceVoiceOverwrite(
        voiceCh,
        targetId,
        "Stanza: smuta (rimuovi Speak-deny legacy)",
      );
      removeStanzaSilencedUser(meta, targetId);
      persistStanzaSnapshotNow();
      await applyStanzaSilencedTextChat(
        message.guild,
        voiceCh.id,
        targetId,
        false,
        "Stanza: smuta chat",
      ).catch(() => {});
      if (String(targetMember.voice?.channelId || "") === String(voiceCh.id)) {
        ok = await applyStanzaMemberServerMute(targetMember, voiceCh.id, false, "Stanza: smuta utente");
      } else {
        ok = true;
      }
      doneLine = ok
        ? `${E.VC_Verified} ${targetMember} è stato smutato (microfono + chat).`
        : failPerm;
    }
  }

  await editStanzaUsersMemberFollowup(message.client, pending, { content: doneLine });
  await message.delete().catch(() => {});
  clearStanzaUsersMemberPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaViceMessageCreate(message?) {
  if (!message.guild || String(message.guild.id) !== MAIN_GUILD_ID) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;

  const key = ownerKey(message.guild.id, message.author.id);
  const pending = stanzaVicePending.get(key);
  if (!pending) return false;
  if (Date.now() > pending.expiresAt) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    return false;
  }

  const prefix = String(message.client?.config?.prefix || "+");
  const rawLine = String(message.content || "").split("\n")[0].trim();
  if (rawLine.startsWith(prefix)) return false;

  const vid = pending.voiceChannelId;
  let meta = await getStanzaMetaOrRehydrate(message.guild, vid);
  if (!meta) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    persistStanzaSnapshotNow();
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    persistStanzaSnapshotNow();
    return true;
  }

  const ownerId = String(meta.ownerId || "");
  const tchVice = await stanzaCompanionTextChannel(message.guild, vid);

  if (/^nessuno$/i.test(rawLine)) {
    const oldVice = normalizeStanzaDiscordUserId(meta.viceUserId);
    if (oldVice) {
      await removeStanzaMemberVoiceOverwrite(voiceCh, oldVice);
      if (tchVice) await removeStanzaMemberTextOverwrite(tchVice, oldVice);
      meta.viceUserId = null;
    }
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned || mentioned.bot) return false;

  const targetId = mentioned.id;
  if (targetId === ownerId) {
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }

  const currentVice = normalizeStanzaDiscordUserId(meta.viceUserId);
  if (currentVice && targetId === currentVice) {
    await removeStanzaMemberVoiceOverwrite(voiceCh, currentVice);
    if (tchVice) await removeStanzaMemberTextOverwrite(tchVice, currentVice);
    meta.viceUserId = null;
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }

  const prevVice = currentVice;
  if (prevVice) {
    await removeStanzaMemberVoiceOverwrite(voiceCh, prevVice);
    if (tchVice) await removeStanzaMemberTextOverwrite(tchVice, prevVice);
  }

  const ok = await setStanzaPrivilegedUserVoiceOverwrite(voiceCh, targetId, "Stanza: accesso vice").catch(() => {});
  if (!ok) {
    if (prevVice) {
      await setStanzaPrivilegedUserVoiceOverwrite(voiceCh, prevVice, "Stanza: accesso vice").catch(() => {});
      if (tchVice) {
        await setStanzaPrivilegedUserTextOverwrite(tchVice, prevVice, "Stanza: accesso vice").catch(() => {});
      }
    }
    meta.viceUserId = prevVice || null;
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    persistStanzaSnapshotNow();
    return true;
  }
  if (tchVice) {
    await setStanzaPrivilegedUserTextOverwrite(tchVice, targetId, "Stanza: accesso vice").catch(() => {});
  }
  meta.viceUserId = normalizeStanzaDiscordUserId(targetId) || null;
  await message.delete().catch(() => {});
  clearStanzaVicePending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  persistStanzaSnapshotNow();
  return true;
}

async function handleStanzaPanelPromptMessageCreate(message?) {
  if (await handleStanzaUsersMemberMessageCreate(message)) return true;
  if (await handleStanzaViceMessageCreate(message)) return true;
  if (await handleStanzaEmojiMessageCreate(message)) return true;
  if (await handleStanzaLimitMessageCreate(message)) return true;
  if (await handleStanzaDescMessageCreate(message)) return true;
  if (await handleStanzaRenameMessageCreate(message)) return true;
  return false;
}

export = { handleStanzaPanelPromptMessageCreate };
