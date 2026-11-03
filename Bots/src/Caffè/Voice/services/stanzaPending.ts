/** Stanze vocali: risposte in attesa dopo un pulsante (nome, emoji, limite, descrizione, vice, utenti). */
const { InteractionWebhook } = require("discord.js") as typeof import("discord.js");
const { stanzaRenamePending, stanzaEmojiPending, stanzaLimitPending, stanzaDescPending, stanzaVicePending, stanzaUsersMemberPending, persistStanzaSnapshotNow } = require("./stanzaNames") as typeof import("./stanzaNames");
const { ownerKey } = require("./stanzaVisitors") as typeof import("./stanzaVisitors");

const STANZA_RENAME_PROMPT_MS = 90_000;

function pendingRenameKey(guildId?, userId?) {
  return ownerKey(guildId, userId);
}

function clearStanzaRenamePending(guildId?, userId?) {
  const key = pendingRenameKey(guildId, userId);
  const old = stanzaRenamePending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaRenamePending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaRenamePendingByVoiceChannel(voiceChannelId?) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaRenamePending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaRenamePending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function pendingEmojiKey(guildId?, userId?) {
  return ownerKey(guildId, userId);
}

function clearStanzaEmojiPending(guildId?, userId?) {
  const key = pendingEmojiKey(guildId, userId);
  const old = stanzaEmojiPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaEmojiPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaEmojiPendingByVoiceChannel(voiceChannelId?) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaEmojiPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaEmojiPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaEmojiPending(guildId?, userId?, voiceChannelId?) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  const key = pendingEmojiKey(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaEmojiPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaEmojiPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function clearStanzaVicePending(guildId?, userId?) {
  const key = ownerKey(guildId, userId);
  const old = stanzaVicePending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaVicePending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaVicePendingByVoiceChannel(voiceChannelId?) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaVicePending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaVicePending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function clearStanzaUsersMemberPending(guildId?, userId?) {
  const key = ownerKey(guildId, userId);
  const old = stanzaUsersMemberPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaUsersMemberPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaUsersMemberPendingByVoiceChannel(voiceChannelId?) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaUsersMemberPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaUsersMemberPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaUsersMemberPending(guildId?, userId?, voiceChannelId?, action?, interaction = null) {
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  clearStanzaVicePending(guildId, userId);
  const key = ownerKey(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaUsersMemberPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  const interactionApplicationId = interaction?.applicationId ? String(interaction.applicationId) : "";
  const interactionToken = interaction?.token ? String(interaction.token) : "";
  stanzaUsersMemberPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    action,
    expiresAt,
    timerId,
    ...(interactionApplicationId && interactionToken
      ? { interactionApplicationId, interactionToken }
      : {}),
  });
  persistStanzaSnapshotNow();
}

async function editStanzaUsersMemberFollowup(client?, pending?, options?) {
  const appId = pending?.interactionApplicationId;
  const token = pending?.interactionToken;
  if (!client || !appId || !token) return;
  const hook = new InteractionWebhook(client, appId, token);
  await hook.editMessage("@original", options).catch(() => {});
}

function registerStanzaVicePending(guildId?, userId?, voiceChannelId?) {
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  const key = ownerKey(guildId, userId);
  clearStanzaVicePending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaVicePending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaVicePending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function registerStanzaRenamePending(guildId?, userId?, voiceChannelId?) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  const key = pendingRenameKey(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaRenamePending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaRenamePending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function pendingLimitKey(guildId?, userId?) {
  return ownerKey(guildId, userId);
}

function clearStanzaLimitPending(guildId?, userId?) {
  const key = pendingLimitKey(guildId, userId);
  const old = stanzaLimitPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaLimitPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaLimitPendingByVoiceChannel(voiceChannelId?) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaLimitPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaLimitPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaLimitPending(guildId?, userId?, voiceChannelId?) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  const key = pendingLimitKey(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaLimitPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaLimitPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

function pendingDescKey(guildId?, userId?) {
  return ownerKey(guildId, userId);
}

function clearStanzaDescPending(guildId?, userId?) {
  const key = pendingDescKey(guildId, userId);
  const old = stanzaDescPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaDescPending.delete(key);
  persistStanzaSnapshotNow();
}

function clearStanzaDescPendingByVoiceChannel(voiceChannelId?) {
  const vid = String(voiceChannelId || "");
  let changed = false;
  for (const [key, v] of stanzaDescPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaDescPending.delete(key);
      changed = true;
    }
  }
  if (changed) persistStanzaSnapshotNow();
}

function registerStanzaDescPending(guildId?, userId?, voiceChannelId?) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  const key = pendingDescKey(guildId, userId);
  clearStanzaDescPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaDescPending.delete(key);
    persistStanzaSnapshotNow();
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaDescPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
  persistStanzaSnapshotNow();
}

export = { pendingRenameKey, clearStanzaRenamePending, clearStanzaRenamePendingByVoiceChannel, pendingEmojiKey, clearStanzaEmojiPending, clearStanzaEmojiPendingByVoiceChannel, registerStanzaEmojiPending, clearStanzaVicePending, clearStanzaVicePendingByVoiceChannel, clearStanzaUsersMemberPending, clearStanzaUsersMemberPendingByVoiceChannel, registerStanzaUsersMemberPending, editStanzaUsersMemberFollowup, registerStanzaVicePending, registerStanzaRenamePending, pendingLimitKey, clearStanzaLimitPending, clearStanzaLimitPendingByVoiceChannel, registerStanzaLimitPending, pendingDescKey, clearStanzaDescPending, clearStanzaDescPendingByVoiceChannel, registerStanzaDescPending };
