const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  ChannelType,
  OverwriteType,
  InteractionWebhook,
} = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity");
const { buildRecoveryVoiceState } = require("../../../shared/discord/voiceStateRecovery");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();
const STANZA_LOBBY_VOICE_ID = String(IDs.channels?.stanzaLobbyVoice || "").trim();
const STANZA_PANEL_CHANNEL_ID = String(IDs.channels?.commands || "").trim();

function stanzaPanelTargetChannelId(meta, voiceChannelId = "") {
  const fromMeta = String(meta?.textChannelId || "").trim();
  if (fromMeta && /^\d{5,30}$/.test(fromMeta)) return fromMeta;
  const vid = String(voiceChannelId || "").trim();
  if (vid && /^\d{5,30}$/.test(vid)) return vid;
  const leg = String(STANZA_PANEL_CHANNEL_ID || "").trim();
  if (leg && /^\d{5,30}$/.test(leg)) return leg;
  return "";
}

/** Conta umani in vocale via voiceStates (channel.members dipende dalla member cache limitata). */
function countStanzaHumanMembers(channel) {
  const guild = channel?.guild;
  const channelId = String(channel?.id || "");
  if (!guild?.voiceStates?.cache || !channelId) return 0;
  let n = 0;
  for (const vs of guild.voiceStates.cache.values()) {
    if (String(vs.channelId || "") !== channelId) continue;
    const member = vs.member || guild.members.cache.get(vs.id);
    if (member?.user?.bot) continue;
    n += 1;
  }
  return n;
}

/** @type {Map<string, { ownerId: string, viceUserId?: string | null, panelMessageId: string, textChannelId?: string, guildId: string, startedAt: number }>} */
const stanzaChannelMeta = new Map();
/** @type {Map<string, string>} ownerKey -> channelId */
const stanzaOwnerToChannel = new Map();
const stanzaCreateLocks = new Set();

/** @type {Map<string, { voiceChannelId: string, expiresAt: number, timerId: ReturnType<typeof setTimeout> | null }>} */
const stanzaRenamePending = new Map();
/** @type {Map<string, { voiceChannelId: string, expiresAt: number, timerId: ReturnType<typeof setTimeout> | null }>} */
const stanzaEmojiPending = new Map();
/** @type {Map<string, { voiceChannelId: string, expiresAt: number, timerId: ReturnType<typeof setTimeout> | null }>} */
const stanzaLimitPending = new Map();
/** @type {Map<string, { voiceChannelId: string, expiresAt: number, timerId: ReturnType<typeof setTimeout> | null }>} */
const stanzaDescPending = new Map();
/** @type {Map<string, { voiceChannelId: string, expiresAt: number, timerId: ReturnType<typeof setTimeout> | null }>} */
const stanzaVicePending = new Map();
/** @type {Map<string, { voiceChannelId: string, action: 'include'|'exclude'|'silenzia', expiresAt: number, timerId: ReturnType<typeof setTimeout> | null, interactionApplicationId?: string, interactionToken?: string }>} */
const stanzaUsersMemberPending = new Map();

const STANZA_NAME_LEAD = "༄";
const STANZA_DEFAULT_EMOJI = "🏠";
const STANZA_ANCHOR = "︲Stanza di ";
const STANZA_NAME_PREFIX = `${STANZA_NAME_LEAD}${STANZA_DEFAULT_EMOJI}${STANZA_ANCHOR}`;
const STANZA_VC_NAME_MAX = 100;
const STANZA_VC_TOPIC_MAX = 1024;
const STANZA_RENAME_PROMPT_MS = 90_000;
const STANZA_EMPTY_TEARDOWN_MS = 10 * 60 * 1000;

/** @type {Map<string, { timerId: ReturnType<typeof setTimeout> }>} */
const stanzaEmptyTeardownTimers = new Map();

function ownerKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function clearStanzaEmptyTeardownTimer(channelId) {
  const id = String(channelId || "");
  const row = stanzaEmptyTeardownTimers.get(id);
  if (row?.timerId) clearTimeout(row.timerId);
  stanzaEmptyTeardownTimers.delete(id);
}

function scheduleStanzaEmptyTeardown(guild, channelId) {
  const id = String(channelId || "");
  if (!stanzaChannelMeta.has(id)) return;
  clearStanzaEmptyTeardownTimer(id);
  const guildId = String(guild?.id || "");
  const client = guild?.client;
  const timerId = setTimeout(async () => {
    stanzaEmptyTeardownTimers.delete(id);
    if (!stanzaChannelMeta.has(id)) return;
    if (!client) return;
    const g = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!g) return;
    const ch = g.channels.cache.get(id) || (await g.channels.fetch(id).catch(() => null));
    if (!ch?.isVoiceBased?.()) {
      stanzaChannelMeta.delete(id);
      return;
    }
    const humans = countStanzaHumanMembers(ch);
    if (humans > 0) return;
    await teardownStanza(g, id);
  }, STANZA_EMPTY_TEARDOWN_MS);
  timerId.unref?.();
  stanzaEmptyTeardownTimers.set(id, { timerId });
}

function isStanzaVoiceChannelCandidate(voiceCh, lobbyParentId = "") {
  if (!voiceCh?.isVoiceBased?.()) return false;
  if (String(voiceCh.id) === STANZA_LOBBY_VOICE_ID) return false;
  if (lobbyParentId && String(voiceCh.parentId || "") !== lobbyParentId) return false;
  return Boolean(parseStanzaVoiceName(voiceCh.name) && resolveStanzaOwnerIdFromChannel(voiceCh));
}

async function adoptOrphanStanzaVoiceChannel(guild, voiceCh, locatedPanel = null) {
  if (!guild || !voiceCh?.id) return false;
  const id = String(voiceCh.id);
  if (stanzaChannelMeta.has(id)) return true;
  const ownerId = resolveStanzaOwnerIdFromChannel(voiceCh);
  if (!ownerId) return false;
  const located = locatedPanel || (await findStanzaPanelMessage(guild, id));
  stanzaChannelMeta.set(id, {
    ownerId,
    viceUserId: null,
    panelMessageId: String(located?.messageId || ""),
    textChannelId: String(located?.channelId || id),
    guildId: guild.id,
    startedAt: Date.now(),
  });
  stanzaOwnerToChannel.set(ownerKey(guild.id, ownerId), id);
  return true;
}

async function sweepEmptyStanzaRooms(guild) {
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return 0;
  const lobby = guild.channels.cache.get(STANZA_LOBBY_VOICE_ID);
  const parentFilter = lobby?.parentId ? String(lobby.parentId) : "";
  let scheduled = 0;

  for (const ch of guild.channels.cache.values()) {
    if (!isStanzaVoiceChannelCandidate(ch, parentFilter)) continue;
    const humans = countStanzaHumanMembers(ch);
    if (humans > 0) {
      clearStanzaEmptyTeardownTimer(ch.id);
      continue;
    }
    if (!stanzaChannelMeta.has(ch.id)) {
      const adopted = await adoptOrphanStanzaVoiceChannel(guild, ch);
      if (!adopted) continue;
      global.logger?.info?.(`[stanza] deleting orphan empty room: ${ch.id}`);
      await teardownStanza(guild, ch.id);
      scheduled += 1;
      continue;
    }
    if (!stanzaEmptyTeardownTimers.has(String(ch.id))) {
      scheduleStanzaEmptyTeardown(guild, ch.id);
      scheduled += 1;
    }
  }
  return scheduled;
}

function sanitizeStanzaLabel(raw) {
  const s = String(raw || "utente")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[#[\]|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (s || "utente").slice(0, 32);
}

function sanitizeStanzaNamePart(raw, maxLen) {
  const s = String(raw || "")
    .replace(/[\n\r\t]/g, " ")
    .replace(/[#[\]|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;
  const cap = Math.max(
    1,
    Number(maxLen) > 0
      ? Number(maxLen)
      : STANZA_VC_NAME_MAX - STANZA_NAME_LEAD.length - STANZA_DEFAULT_EMOJI.length - STANZA_ANCHOR.length,
  );
  return s.slice(0, cap);
}

function parseStanzaVoiceName(name) {
  const n = String(name || "");
  const i = n.indexOf(STANZA_ANCHOR);
  if (i <= 1 || !n.startsWith(STANZA_NAME_LEAD)) return null;
  const emojiPart = n.slice(STANZA_NAME_LEAD.length, i);
  if (!emojiPart) return null;
  const labelPart = n.slice(i + STANZA_ANCHOR.length);
  return { emojiPart, labelPart };
}

function buildStanzaFullName(emojiPart, labelPart) {
  return `${STANZA_NAME_LEAD}${String(emojiPart || STANZA_DEFAULT_EMOJI)}${STANZA_ANCHOR}${String(labelPart || "")}`.slice(
    0,
    STANZA_VC_NAME_MAX,
  );
}

function buildStanzaVoiceNameFromUserPart(userInput, currentVoiceName) {
  const parsed = parseStanzaVoiceName(String(currentVoiceName || ""));
  const emojiPart = parsed?.emojiPart || STANZA_DEFAULT_EMOJI;
  const maxLabel = Math.max(
    1,
    STANZA_VC_NAME_MAX - STANZA_NAME_LEAD.length - String(emojiPart).length - STANZA_ANCHOR.length,
  );
  const part = sanitizeStanzaNamePart(userInput, maxLabel);
  if (!part) return null;
  return buildStanzaFullName(emojiPart, part);
}

function buildStanzaVoiceNameWithNewEmoji(currentVoiceName, newEmoji) {
  const parsed = parseStanzaVoiceName(String(currentVoiceName || ""));
  if (!parsed) return null;
  return buildStanzaFullName(newEmoji, parsed.labelPart);
}

function extractExactUnicodeEmojiLine(raw) {
  const line = String(raw || "")
    .split("\n")[0]
    .trim();
  if (!line) return null;
  const m = line.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  const seq = m ? m[1] : null;
  if (!seq || seq !== line) return null;
  return seq;
}

function parseStanzaLimitUserInput(raw) {
  const line = String(raw || "")
    .split("\n")[0]
    .trim();
  if (!/^\d{1,2}$/.test(line)) return null;
  const n = Number(line);
  if (!Number.isFinite(n) || n < 0 || n > 99) return null;
  return n;
}

function sanitizeStanzaVoiceTopic(raw) {
  const t = String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\0/g, "")
    .trim();
  if (!t) return null;
  return t.slice(0, STANZA_VC_TOPIC_MAX);
}

function pendingRenameKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaRenamePending(guildId, userId) {
  const key = pendingRenameKey(guildId, userId);
  const old = stanzaRenamePending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaRenamePending.delete(key);
}

function clearStanzaRenamePendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  for (const [key, v] of stanzaRenamePending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaRenamePending.delete(key);
    }
  }
}

function pendingEmojiKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaEmojiPending(guildId, userId) {
  const key = pendingEmojiKey(guildId, userId);
  const old = stanzaEmojiPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaEmojiPending.delete(key);
}

function clearStanzaEmojiPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  for (const [key, v] of stanzaEmojiPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaEmojiPending.delete(key);
    }
  }
}

function registerStanzaEmojiPending(guildId, userId, voiceChannelId) {
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
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaEmojiPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
}

function clearStanzaVicePending(guildId, userId) {
  const key = ownerKey(guildId, userId);
  const old = stanzaVicePending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaVicePending.delete(key);
}

function clearStanzaVicePendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  for (const [key, v] of stanzaVicePending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaVicePending.delete(key);
    }
  }
}

function clearStanzaUsersMemberPending(guildId, userId) {
  const key = ownerKey(guildId, userId);
  const old = stanzaUsersMemberPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaUsersMemberPending.delete(key);
}

function clearStanzaUsersMemberPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  for (const [key, v] of stanzaUsersMemberPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaUsersMemberPending.delete(key);
    }
  }
}

function registerStanzaUsersMemberPending(guildId, userId, voiceChannelId, action, interaction = null) {
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
}

async function editStanzaUsersMemberFollowup(client, pending, options) {
  const appId = pending?.interactionApplicationId;
  const token = pending?.interactionToken;
  if (!client || !appId || !token) return;
  const hook = new InteractionWebhook(client, appId, token);
  await hook.editMessage("@original", options).catch(() => {});
}

function registerStanzaVicePending(guildId, userId, voiceChannelId) {
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
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaVicePending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
}

function registerStanzaRenamePending(guildId, userId, voiceChannelId) {
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
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaRenamePending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
}

function pendingLimitKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaLimitPending(guildId, userId) {
  const key = pendingLimitKey(guildId, userId);
  const old = stanzaLimitPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaLimitPending.delete(key);
}

function clearStanzaLimitPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  for (const [key, v] of stanzaLimitPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaLimitPending.delete(key);
    }
  }
}

function registerStanzaLimitPending(guildId, userId, voiceChannelId) {
  clearStanzaVicePending(guildId, userId);
  clearStanzaUsersMemberPending(guildId, userId);
  clearStanzaRenamePending(guildId, userId);
  clearStanzaEmojiPending(guildId, userId);
  const key = pendingLimitKey(guildId, userId);
  clearStanzaLimitPending(guildId, userId);
  const expiresAt = Date.now() + STANZA_RENAME_PROMPT_MS;
  const timerId = setTimeout(() => {
    stanzaLimitPending.delete(key);
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaLimitPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
}

function pendingDescKey(guildId, userId) {
  return ownerKey(guildId, userId);
}

function clearStanzaDescPending(guildId, userId) {
  const key = pendingDescKey(guildId, userId);
  const old = stanzaDescPending.get(key);
  if (old?.timerId) clearTimeout(old.timerId);
  stanzaDescPending.delete(key);
}

function clearStanzaDescPendingByVoiceChannel(voiceChannelId) {
  const vid = String(voiceChannelId || "");
  for (const [key, v] of stanzaDescPending) {
    if (String(v?.voiceChannelId || "") === vid) {
      if (v?.timerId) clearTimeout(v.timerId);
      stanzaDescPending.delete(key);
    }
  }
}

function registerStanzaDescPending(guildId, userId, voiceChannelId) {
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
  }, STANZA_RENAME_PROMPT_MS);
  timerId.unref?.();
  stanzaDescPending.set(key, {
    voiceChannelId: String(voiceChannelId || ""),
    expiresAt,
    timerId,
  });
}

function buildStanzaChannelName(member) {
  const label = sanitizeStanzaLabel(accountUsername(member?.user) || member?.displayName || member?.user?.username);
  return buildStanzaFullName(STANZA_DEFAULT_EMOJI, label);
}

function resolveVoicePrivacyLines(voiceChannel, guild) {
  if (!voiceChannel?.permissionOverwrites?.cache || !guild?.roles?.everyone) {
    return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
  }
  const everyoneId = guild.roles.everyone.id;
  const ow = voiceChannel.permissionOverwrites.cache.get(everyoneId);
  const denyView = ow?.deny?.has(PermissionsBitField.Flags.ViewChannel);
  const denyConnect = ow?.deny?.has(PermissionsBitField.Flags.Connect);
  if (denyView) return { privacy: "🔒 Privata", visibility: "👻 Invisibile" };
  if (denyConnect) return { privacy: "🔒 Privata", visibility: "👁️ Visibile" };
  return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
}

function isStanzaEveryoneViewHidden(voiceChannel, guild) {
  if (!voiceChannel?.permissionOverwrites?.cache || !guild?.roles?.everyone) return false;
  const ow = voiceChannel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  return Boolean(ow?.deny?.has(PermissionsBitField.Flags.ViewChannel));
}

const STANZA_VOICE_EVERYONE_PUBLIC = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  UseVAD: true,
  Stream: true,
  UseEmbeddedActivities: true,
  UseExternalApps: true,
};

const STANZA_VOICE_EVERYONE_LOCKED = {
  ViewChannel: false,
  Connect: false,
};

const STANZA_VOICE_OWNER_OVERWRITE = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  UseVAD: true,
  Stream: true,
  UseEmbeddedActivities: true,
  UseExternalApps: true,
  MoveMembers: true,
  MuteMembers: true,
  DeafenMembers: true,
  ManageChannels: true,
};

const STANZA_VOICE_BOT_OVERWRITE = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  ManageChannels: true,
  MoveMembers: true,
};

const STANZA_VOICE_MEMBER_ALLOW = {
  ViewChannel: true,
  Connect: true,
  Speak: true,
  UseVAD: true,
  Stream: true,
  UseEmbeddedActivities: true,
  UseExternalApps: true,
};

const STANZA_VOICE_MEMBER_EXCLUDE = {
  ViewChannel: false,
  Connect: false,
};

const STANZA_VOICE_MEMBER_SILENCE = {
  ViewChannel: true,
  Connect: true,
  Speak: false,
  Stream: false,
  UseVAD: false,
  UseEmbeddedActivities: false,
  UseExternalApps: false,
};

async function ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId) {
  const id = String(ownerId || "");
  if (!id) return false;
  if (voiceChannel.permissionOverwrites.cache.has(id)) return true;
  return voiceChannel.permissionOverwrites
    .create(id, STANZA_VOICE_OWNER_OVERWRITE, {
      reason: "Stanza: accesso creatore",
      type: OverwriteType.Member,
    })
    .then(() => true)
    .catch(() => false);
}

async function setStanzaPrivilegedUserVoiceOverwrite(voiceChannel, userId, reason) {
  const id = String(userId || "").trim();
  if (!id) return false;
  if (voiceChannel.permissionOverwrites.cache.has(id)) {
    return voiceChannel.permissionOverwrites
      .edit(id, STANZA_VOICE_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
      .then(() => true)
      .catch(() => false);
  }
  return voiceChannel.permissionOverwrites
    .create(id, STANZA_VOICE_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function ensureStanzaBotVoiceOverwrite(voiceChannel, botUserId) {
  const id = String(botUserId || "");
  if (!id) return false;
  if (voiceChannel.permissionOverwrites.cache.has(id)) return true;
  return voiceChannel.permissionOverwrites
    .create(id, STANZA_VOICE_BOT_OVERWRITE, {
      reason: "Stanza: accesso bot",
      type: OverwriteType.Member,
    })
    .then(() => true)
    .catch(() => false);
}

async function removeStanzaMemberVoiceOverwrite(voiceChannel, userId) {
  const id = String(userId || "").trim();
  if (!id) return true;
  if (!voiceChannel.permissionOverwrites.cache.has(id)) return true;
  return voiceChannel.permissionOverwrites
    .delete(id, "Stanza: revoca vice")
    .then(() => true)
    .catch(() => false);
}

async function applyStanzaMemberVoicePerms(voiceChannel, userId, permsObject, reason) {
  const id = String(userId || "").trim();
  if (!id) return false;
  try {
    const extras = { reason, type: OverwriteType.Member };
    if (voiceChannel.permissionOverwrites.cache.has(id)) {
      await voiceChannel.permissionOverwrites.edit(id, permsObject, extras);
    } else {
      await voiceChannel.permissionOverwrites.create(id, permsObject, extras);
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] member overwrite failed:", err?.message || err);
    return false;
  }
}

async function ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId) {
  const chId = String(voiceChannel?.id || "");
  const viceId = String(stanzaChannelMeta.get(chId)?.viceUserId || "").trim();
  const oid = String(ownerId || "");
  if (!viceId || viceId === oid) return true;
  return setStanzaPrivilegedUserVoiceOverwrite(
    voiceChannel,
    viceId,
    "Stanza: accesso vice (stessi permessi del creatore)",
  );
}

async function applyStanzaEveryoneAccessLocked(voiceChannel, guild, ownerId) {
  const everyoneId = guild.roles.everyone.id;
  const botId = String(guild.client?.user?.id || "");
  if (!(await ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaBotVoiceOverwrite(voiceChannel, botId))) return false;
  if (!(await ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId))) return false;
  return voiceChannel.permissionOverwrites
    .edit(everyoneId, STANZA_VOICE_EVERYONE_LOCKED, {
      reason: "Stanza: blocca accesso",
      type: OverwriteType.Role,
    })
    .then(() => true)
    .catch(() => false);
}

async function applyStanzaEveryoneAccessPublic(voiceChannel, guild) {
  const everyoneId = guild.roles.everyone.id;
  return voiceChannel.permissionOverwrites
    .edit(everyoneId, STANZA_VOICE_EVERYONE_PUBLIC, {
      reason: "Stanza: sblocca accesso",
      type: OverwriteType.Role,
    })
    .then(() => true)
    .catch(() => false);
}

async function applyStanzaEveryoneViewHidden(voiceChannel, guild, ownerId) {
  const everyoneId = guild.roles.everyone.id;
  const botId = String(guild.client?.user?.id || "");
  if (!(await ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaBotVoiceOverwrite(voiceChannel, botId))) return false;
  if (!(await ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId))) return false;
  return voiceChannel.permissionOverwrites
    .edit(everyoneId, { ViewChannel: false }, {
      reason: "Stanza: nascondi canale",
      type: OverwriteType.Role,
    })
    .then(() => true)
    .catch(() => false);
}

async function applyStanzaEveryoneViewVisible(voiceChannel, guild) {
  const everyoneId = guild.roles.everyone.id;
  return voiceChannel.permissionOverwrites
    .edit(everyoneId, { ViewChannel: true }, {
      reason: "Stanza: mostra canale",
      type: OverwriteType.Role,
    })
    .then(() => true)
    .catch(() => false);
}

function displayEmojiFromVoiceName(name) {
  return parseStanzaVoiceName(String(name || ""))?.emojiPart || STANZA_DEFAULT_EMOJI;
}

function buildStanzaHomePanelEmbed(ownerMember, voiceChannel, startedAt, meta = null) {
  const ownerId = String(ownerMember?.id || "");
  const limit = voiceChannel?.userLimit ? String(voiceChannel.userLimit) : "Infinito";
  const { privacy, visibility } = resolveVoicePrivacyLines(voiceChannel, voiceChannel.guild);
  const viceId = String(meta?.viceUserId || "").trim();
  const viceLine = viceId ? `<@${viceId}>` : "Nessuno";
  const elapsedSec = Math.max(0, Math.floor((Date.now() - (startedAt || Date.now())) / 1000));
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🏠 · Pannello Gestione Stanza")
    .setDescription(
      `Benvenuto nella stanza, <@${ownerId}>!\n` +
        "Usa i menu qui sotto per personalizzare la tua stanza.\n\n" +
        "*Le stanze sono spazi temporanei gestiti dagli utenti: chi le crea ne definisce le regole e l'accesso.*\n\n" +
        `**Canale:** <#${voiceChannel?.id || "0"}>\n` +
        `**Limite:** ${limit}\n` +
        `**Privacy:** ${privacy}\n` +
        `**Visibilità:** ${visibility}\n` +
        `**Vice:** ${viceLine}\n` +
        `**Modalità:** 🗣️ Chat\n` +
        `**⏱️ Tempo stanza:** ${m}m ${s}s`,
    )
    .setFooter({ text: "🏠 Stanze • discord.gg/viniliecaffe" });
}

function buildStanzaManageSettingsEmbed(voiceChannel, meta = null) {
  const chName = String(voiceChannel?.name || "—");
  const emoji = displayEmojiFromVoiceName(chName);
  const limit = voiceChannel?.userLimit ? String(voiceChannel.userLimit) : "Infinito";
  const { privacy, visibility } = resolveVoicePrivacyLines(voiceChannel, voiceChannel.guild);
  const viceId = String(meta?.viceUserId || "").trim();
  const viceVal = viceId ? `<@${viceId}>` : "Nessuno";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🎛️ · Impostazioni Stanza")
    .setDescription("Visualizza e modifica le impostazioni principali della tua stanza.")
    .addFields(
      {
        name: "📋 · Info generali",
        value: [`**Nome:** ${chName}`, `**Emoji:** ${emoji}`, `**Limite:** ${limit}`].join("\n"),
        inline: true,
      },
      {
        name: "⚙️ · Impostazioni",
        value: [`**Privacy:** ${privacy}`, `**Visibilità:** ${visibility}`, "**Modalità:** 🗣️ Chat"].join("\n"),
        inline: true,
      },
      { name: "🌙 · Vice", value: viceVal, inline: false },
    )
    .setFooter({ text: "🏠 Stanze • discord.gg/viniliecaffe" });
}

function buildStanzaHomeRows(channelId) {
  const cid = String(channelId || "");
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stanza_manage:${cid}`)
      .setLabel("Gestisci Stanza")
      .setEmoji("🎛️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`stanza_users:${cid}`)
      .setLabel("Gestisci Utenti")
      .setEmoji("👤")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stanza_delete:${cid}`)
      .setLabel("Cancella")
      .setEmoji("💔")
      .setStyle(ButtonStyle.Danger),
  );
  return [row1];
}

function buildStanzaManageRows(voiceChannel) {
  const cid = String(voiceChannel?.id || "");
  const guild = voiceChannel?.guild;
  const viewHidden = guild ? isStanzaEveryoneViewHidden(voiceChannel, guild) : false;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`stanza_nome:${cid}`).setLabel("Nome").setEmoji("✏️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`stanza_emoji:${cid}`).setLabel("Emoji").setEmoji("🌀").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`stanza_limite:${cid}`).setLabel("Limite").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`stanza_desc:${cid}`).setLabel("Descrizione").setEmoji("🔗").setStyle(ButtonStyle.Secondary),
  );
  const vistaBtn = viewHidden
    ? new ButtonBuilder()
        .setCustomId(`stanza_mostra:${cid}`)
        .setLabel("Mostra")
        .setEmoji("👁️")
        .setStyle(ButtonStyle.Success)
    : new ButtonBuilder()
        .setCustomId(`stanza_nascondi:${cid}`)
        .setLabel("Nascondi")
        .setEmoji("🙈")
        .setStyle(ButtonStyle.Secondary);
  const row2 = new ActionRowBuilder().addComponents(
    vistaBtn,
    new ButtonBuilder().setCustomId(`stanza_blocca:${cid}`).setLabel("Blocca").setEmoji("🔒").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`stanza_sblocca:${cid}`).setLabel("Sblocca").setEmoji("🌟").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`stanza_vice:${cid}`).setLabel("Nomina Vice").setEmoji("🌙").setStyle(ButtonStyle.Primary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`stanza_back:${cid}`).setLabel("Indietro").setEmoji("<:1343arrowleft:1525249879151083621>️").setStyle(ButtonStyle.Secondary),
  );
  return [row1, row2, row3];
}

function buildStanzaUsersManageEmbed(voiceChannel) {
  const chLabel = voiceChannel?.id ? `<#${voiceChannel.id}>` : "—";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("👥 · Gestione Membri Stanza")
    .setDescription(
      `Scegli un'azione per gestire chi può entrare o parlare.\n\n**Canale:** ${chLabel}`,
    )
    .setFooter({ text: "🏠 Stanze • discord.gg/viniliecaffe" });
}

function buildStanzaUsersManageRows(channelId) {
  const cid = String(channelId || "");
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stanza_users_include:${cid}`)
      .setLabel("Includi")
      .setEmoji("➕")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stanza_users_exclude:${cid}`)
      .setLabel("Escludi")
      .setEmoji("🚫")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`stanza_users_silenzia:${cid}`)
      .setLabel("Silenzia")
      .setEmoji("🔇")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`stanza_users_list:${cid}`)
      .setLabel("Lista Membri")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`stanza_users_back:${cid}`)
      .setLabel("Indietro")
      .setEmoji("<:1343arrowleft:1525249879151083621>️")
      .setStyle(ButtonStyle.Primary),
  );
  return [row];
}

async function postStanzaPanel(guild, member, voiceChannel, textChannel, metaForEmbed = null) {
  const panelCh = textChannel || voiceChannel;
  if (!panelCh?.isTextBased?.()) return null;
  const startedAt = Date.now();
  const msg = await panelCh
    .send({
      content: `<@${member.id}>`,
      embeds: [buildStanzaHomePanelEmbed(member, voiceChannel, startedAt, metaForEmbed)],
      components: buildStanzaHomeRows(voiceChannel.id),
    })
    .catch(() => null);
  return { panelMessageId: msg?.id || null, startedAt, textChannelId: String(panelCh.id || "") };
}

async function teardownStanza(guild, channelId) {
  const id = String(channelId || "");
  const meta = stanzaChannelMeta.get(id);
  if (!meta) return;
  clearStanzaEmptyTeardownTimer(id);
  stanzaChannelMeta.delete(id);
  stanzaOwnerToChannel.delete(ownerKey(meta.guildId, meta.ownerId));
  clearStanzaRenamePending(meta.guildId, meta.ownerId);
  clearStanzaRenamePendingByVoiceChannel(id);
  clearStanzaEmojiPending(meta.guildId, meta.ownerId);
  clearStanzaEmojiPendingByVoiceChannel(id);
  clearStanzaLimitPending(meta.guildId, meta.ownerId);
  clearStanzaLimitPendingByVoiceChannel(id);
  clearStanzaDescPending(meta.guildId, meta.ownerId);
  clearStanzaDescPendingByVoiceChannel(id);
  clearStanzaVicePending(meta.guildId, meta.ownerId);
  clearStanzaVicePendingByVoiceChannel(id);
  clearStanzaUsersMemberPending(meta.guildId, meta.ownerId);
  clearStanzaUsersMemberPendingByVoiceChannel(id);

  const panelChId = stanzaPanelTargetChannelId(meta, id);
  if (meta.panelMessageId && panelChId) {
    const panelCh =
      guild.channels.cache.get(panelChId) || (await guild.channels.fetch(panelChId).catch(() => null));
    if (panelCh?.isTextBased?.()) {
      const msg = await panelCh.messages.fetch(meta.panelMessageId).catch(() => null);
      if (msg?.deletable) await msg.delete().catch(() => {});
    }
  }

  const ch = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
  if (ch?.deletable) await ch.delete("Stanza vuota o chiusura").catch(() => {});
}

async function handleStanzaVoiceLobbyJoin(oldState, newState, client) {
  if (!MAIN_GUILD_ID || !STANZA_LOBBY_VOICE_ID) return;
  const guild = newState.guild;
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return;
  const uid = String(newState.id || newState.member?.id || "").trim();
  if (!uid) return;
  let member = newState.member || guild.members.cache.get(uid) || null;
  if (!member) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  if (!member || member.user?.bot) return;
  const joinedId = String(newState.channelId || "");
  const leftLobby = String(oldState.channelId || "");
  if (joinedId !== STANZA_LOBBY_VOICE_ID || leftLobby === STANZA_LOBBY_VOICE_ID) return;

  const ok =
    newState.channel?.isVoiceBased?.() ||
    guild.channels.cache.get(joinedId)?.isVoiceBased?.();
  if (!ok) return;

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels | PermissionsBitField.Flags.MoveMembers)) {
    global.logger?.warn?.("[stanza] bot missing ManageChannels/MoveMembers");
    return;
  }

  if (stanzaCreateLocks.has(uid)) return;
  const okKey = ownerKey(guild.id, uid);
  const existingId = stanzaOwnerToChannel.get(okKey);
  if (existingId) {
    const existing =
      guild.channels.cache.get(existingId) || (await guild.channels.fetch(existingId).catch(() => null));
    if (existing?.isVoiceBased?.()) {
      await member.voice.setChannel(existing).catch(() => {});
      return;
    }
    stanzaOwnerToChannel.delete(okKey);
    stanzaChannelMeta.delete(existingId);
  }

  stanzaCreateLocks.add(uid);
  try {
    const lobbyCh = newState.channel;
    const parentId = lobbyCh?.parentId || IDs.categories?.categoryPrivate || null;
    const name = buildStanzaChannelName(member);
    const voiceChannel = await guild.channels
      .create({
        name,
        type: ChannelType.GuildVoice,
        parent: parentId || undefined,
        reason: `Stanza temporanea per ${member.user?.tag || uid}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            type: OverwriteType.Role,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.UseVAD,
              PermissionsBitField.Flags.Stream,
              PermissionsBitField.Flags.UseEmbeddedActivities,
              PermissionsBitField.Flags.UseExternalApps,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.AddReactions,
            ],
          },
          {
            id: uid,
            type: OverwriteType.Member,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.UseVAD,
              PermissionsBitField.Flags.Stream,
              PermissionsBitField.Flags.UseEmbeddedActivities,
              PermissionsBitField.Flags.UseExternalApps,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.AddReactions,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.MoveMembers,
              PermissionsBitField.Flags.MuteMembers,
              PermissionsBitField.Flags.DeafenMembers,
              PermissionsBitField.Flags.ManageChannels,
            ],
          },
          {
            id: client.user.id,
            type: OverwriteType.Member,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.EmbedLinks,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.ManageMessages,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers,
            ],
          },
        ],
      })
      .catch((err) => {
        global.logger?.warn?.("[stanza] create failed:", err?.message || err);
        return null;
      });
    if (!voiceChannel) return;

    const movedOk = await member.voice.setChannel(voiceChannel).then(() => true).catch((err) => {
      global.logger?.warn?.("[stanza] move failed:", err?.message || err);
      return false;
    });
    if (!movedOk) {
      await voiceChannel.delete("Move fallito").catch(() => {});
      return;
    }

    const refreshed =
      (await guild.channels.fetch(voiceChannel.id).catch(() => null)) || voiceChannel;
    const panel = await postStanzaPanel(guild, member, refreshed, refreshed, {
      textChannelId: refreshed.id,
      viceUserId: null,
    });
    if (!panel?.panelMessageId) {
      await refreshed.delete("Pannello non inviato").catch(() => {});
      return;
    }

    stanzaChannelMeta.set(refreshed.id, {
      ownerId: uid,
      viceUserId: null,
      panelMessageId: String(panel.panelMessageId),
      textChannelId: String(panel.textChannelId || refreshed.id),
      guildId: guild.id,
      startedAt: Number(panel.startedAt) || Date.now(),
    });
    stanzaOwnerToChannel.set(okKey, refreshed.id);
  } finally {
    stanzaCreateLocks.delete(uid);
  }
}

async function handleStanzaVoiceEmpty(oldState, newState) {
  if (!MAIN_GUILD_ID) return;
  const guild = oldState.guild;
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return;
  const prevId = String(oldState.channelId || "");
  if (!prevId || prevId === STANZA_LOBBY_VOICE_ID) return;
  const nextCh = newState.channelId ? String(newState.channelId) : "";
  if (prevId === nextCh) return;

  const channel =
    guild.channels.cache.get(prevId) || (await guild.channels.fetch(prevId).catch(() => null));
  if (!channel?.isVoiceBased?.()) {
    clearStanzaEmptyTeardownTimer(prevId);
    stanzaChannelMeta.delete(prevId);
    return;
  }
  if (!stanzaChannelMeta.has(prevId)) {
    const lobby = guild.channels.cache.get(STANZA_LOBBY_VOICE_ID);
    const parentFilter = lobby?.parentId ? String(lobby.parentId) : "";
    if (!isStanzaVoiceChannelCandidate(channel, parentFilter)) return;
    await adoptOrphanStanzaVoiceChannel(guild, channel);
  }
  if (!stanzaChannelMeta.has(prevId)) return;
  const humans = countStanzaHumanMembers(channel);
  if (humans > 0) {
    clearStanzaEmptyTeardownTimer(prevId);
    return;
  }
  scheduleStanzaEmptyTeardown(guild, prevId);
}

async function handleStanzaVoiceOccupied(oldState, newState) {
  if (!MAIN_GUILD_ID) return;
  const guild = newState.guild;
  if (!guild || String(guild.id) !== MAIN_GUILD_ID) return;
  const joinedId = String(newState.channelId || "");
  if (!joinedId || joinedId === STANZA_LOBBY_VOICE_ID) return;
  if (!stanzaChannelMeta.has(joinedId)) return;
  const uid = String(newState.id || newState.member?.id || "").trim();
  let member = newState.member || (uid ? guild.members.cache.get(uid) : null) || null;
  if (!member && uid) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  if (!member || member.user?.bot) return;
  const leftId = String(oldState.channelId || "");
  if (leftId === joinedId) return;
  clearStanzaEmptyTeardownTimer(joinedId);
}

function parseStanzaButtonId(customId) {
  const raw = String(customId || "");
  const idx = raw.indexOf(":");
  if (idx === -1) return null;
  const head = raw.slice(0, idx);
  const channelId = raw.slice(idx + 1);
  if (!head.startsWith("stanza_")) return null;
  if (!/^\d{5,30}$/.test(channelId)) return null;
  return { head, channelId };
}

function formatStanzaPermListLines(ids, cap = 18) {
  if (!ids?.length) return "_Nessuno_";
  const slice = ids.slice(0, cap);
  const lines = slice.map((id) => `• <@${id}>`);
  if (ids.length > cap) lines.push(`_(+${ids.length - cap} altri)_`);
  return lines.join("\n");
}

function collectStanzaPermissionMemberLists(voiceChannel, meta) {
  const ownerId = String(meta?.ownerId || "");
  const viceId = String(meta?.viceUserId || "").trim();
  const botId = String(voiceChannel.client?.user?.id || "");
  const everyoneId = voiceChannel.guild?.roles?.everyone?.id;
  const P = PermissionsBitField.Flags;
  const included = [];
  const excluded = [];
  const silenced = [];
  for (const ow of voiceChannel.permissionOverwrites.cache.values()) {
    if (Number(ow.type) !== OverwriteType.Member) continue;
    const id = String(ow.id);
    if (id === everyoneId || id === botId || id === ownerId || (viceId && id === viceId)) continue;
    if (ow.deny.has(P.ViewChannel) || ow.deny.has(P.Connect)) {
      excluded.push(id);
      continue;
    }
    if (ow.deny.has(P.Speak)) {
      silenced.push(id);
      continue;
    }
    if (
      ow.allow.has(P.ViewChannel) &&
      ow.allow.has(P.Connect) &&
      ow.allow.has(P.Speak) &&
      !ow.allow.has(P.ManageChannels)
    ) {
      included.push(id);
    }
  }
  return { included, excluded, silenced };
}

function buildStanzaPermissionsListEmbed(voiceChannel, meta) {
  const ownerId = String(meta?.ownerId || "");
  const viceId = String(meta?.viceUserId || "").trim();
  const lists = collectStanzaPermissionMemberLists(voiceChannel, meta);
  const staffLines = [`👑 <@${ownerId}> **(Owner)**`];
  if (viceId) staffLines.push(`⭐ <@${viceId}> **(Vice)**`);
  const staffBlock = `🛡️ **Staff**\n${staffLines.join("\n")}`;
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("📜 · Lista Permessi Stanza")
    .setDescription(staffBlock)
    .addFields(
      { name: "✅ Inclusi", value: formatStanzaPermListLines(lists.included), inline: true },
      { name: "⛔ Esclusi", value: formatStanzaPermListLines(lists.excluded), inline: true },
      { name: "🔇 Silenziati", value: formatStanzaPermListLines(lists.silenced), inline: true },
    )
    .setFooter({ text: "🏠 Stanze • discord.gg/viniliecaffe" });
}

async function fetchOwnerMember(guild, ownerId) {
  return (
    guild.members.cache.get(ownerId) ||
    (await guild.members.fetch(ownerId).catch(() => null))
  );
}

async function fetchStanzaVoiceChannel(guild, channelId) {
  const ch =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  return ch;
}

function pickRandomPublicVoiceChannel(guild, excludeChannelId) {
  const exclude = new Set([String(excludeChannelId || ""), STANZA_LOBBY_VOICE_ID].filter(Boolean));
  const everyone = guild.roles.everyone;
  const candidates = [];
  for (const ch of guild.channels.cache.values()) {
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (exclude.has(ch.id)) continue;
    if (guild.afkChannelId && ch.id === guild.afkChannelId) continue;
    const perms = ch.permissionsFor(everyone);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) continue;
    if (!perms.has(PermissionsBitField.Flags.Connect)) continue;
    const limit = Number(ch.userLimit) || 0;
    if (limit > 0 && ch.members.size >= limit) continue;
    candidates.push(ch);
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function moveStanzaOccupantsToChannel(voiceChannel, targetVoice) {
  if (!voiceChannel || !targetVoice) return;
  const moves = [...voiceChannel.members.values()]
    .filter((m) => !m.user?.bot)
    .map((m) => m.voice.setChannel(targetVoice).catch(() => {}));
  await Promise.all(moves);
}

async function handleStanzaButton(interaction) {
  if (!interaction?.isButton?.()) return false;
  const parsed = parseStanzaButtonId(interaction.customId);
  if (!parsed) return false;
  const meta = stanzaChannelMeta.get(parsed.channelId);
  if (!meta || String(meta.guildId) !== String(interaction.guildId || "")) {
    await interaction.reply({ content: "Questa stanza non è più attiva.", flags: 64 }).catch(() => {});
    return true;
  }
  const isOwner = String(interaction.user?.id || "") === String(meta.ownerId);
  const canMod = Boolean(
    interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels),
  );
  if (!isOwner && !canMod) {
    await interaction.reply({ content: "Solo il creatore della stanza (o lo staff) può usare questi pulsanti.", flags: 64 }).catch(() => {});
    return true;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Questa azione è disponibile solo nel server.", flags: 64 }).catch(() => {});
    return true;
  }
  if (
    parsed.head !== "stanza_nome" &&
    parsed.head !== "stanza_emoji" &&
    parsed.head !== "stanza_limite" &&
    parsed.head !== "stanza_desc" &&
    parsed.head !== "stanza_vice"
  ) {
    clearStanzaRenamePending(guild.id, interaction.user.id);
    clearStanzaEmojiPending(guild.id, interaction.user.id);
    clearStanzaLimitPending(guild.id, interaction.user.id);
    clearStanzaDescPending(guild.id, interaction.user.id);
    clearStanzaVicePending(guild.id, interaction.user.id);
    clearStanzaUsersMemberPending(guild.id, interaction.user.id);
  }

  if (parsed.head === "stanza_delete") {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const vid = parsed.channelId;
    const voiceCh = await fetchStanzaVoiceChannel(guild, vid);
    await interaction
      .editReply({ content: "💥 Eliminazione stanza e spostamento..." })
      .catch(() => {});
    const me = guild.members.me;
    const canMove = Boolean(me?.permissions?.has(PermissionsBitField.Flags.MoveMembers));
    let moveTarget = null;
    let movedOk = false;
    if (voiceCh && canMove) {
      moveTarget = pickRandomPublicVoiceChannel(guild, vid);
      if (moveTarget) {
        await moveStanzaOccupantsToChannel(voiceCh, moveTarget);
        movedOk = true;
      }
    }
    await teardownStanza(guild, vid);
    let doneText = "✅ Stanza eliminata.";
    if (voiceCh && !canMove) {
      doneText =
        "✅ Stanza eliminata. Non ho potuto spostare gli utenti: al bot manca **Sposta membri**.";
    } else if (voiceCh && canMove && !moveTarget) {
      doneText =
        "✅ Stanza eliminata. Non ho trovato una vocale pubblica con posto libero per lo spostamento.";
    } else if (voiceCh && movedOk) {
      doneText = "✅ Stanza eliminata. Gli utenti in stanza sono stati spostati in una vocale pubblica.";
    }
    await interaction.editReply({ content: doneText }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_nome") {
    registerStanzaRenamePending(guild.id, interaction.user.id, parsed.channelId);
    await interaction.reply({ content: "✏️ Scrivi il nuovo nome.", flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_emoji") {
    registerStanzaEmojiPending(guild.id, interaction.user.id, parsed.channelId);
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Cambia Emoji")
      .setDescription("Invia un'emoji Unicode (es: 🫧, 🔥).");
    await interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_limite") {
    registerStanzaLimitPending(guild.id, interaction.user.id, parsed.channelId);
    await interaction.reply({ content: "🔢 Scrivi il limite (0-99).", flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_desc") {
    registerStanzaDescPending(guild.id, interaction.user.id, parsed.channelId);
    await interaction.reply({ content: "📝 Scrivi la descrizione.", flags: 64 }).catch(() => {});
    return true;
  }

  const voiceCh = await fetchStanzaVoiceChannel(guild, parsed.channelId);
  if (!voiceCh) {
    await interaction.reply({ content: "Canale vocale non trovato.", flags: 64 }).catch(() => {});
    return true;
  }

  const ownerMember = await fetchOwnerMember(guild, meta.ownerId);
  if (!ownerMember) {
    await interaction.reply({ content: "Impossibile caricare il creatore della stanza.", flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_manage") {
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(voiceCh, meta)],
        components: buildStanzaManageRows(voiceCh),
      })
      .catch(async () => {
        await interaction.reply({ content: "Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_users") {
    const updated = (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaUsersManageEmbed(updated)],
        components: buildStanzaUsersManageRows(parsed.channelId),
      })
      .catch(async () => {
        await interaction.reply({ content: "Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_users_back") {
    const startedAt = Number(meta.startedAt) || Date.now();
    const updatedHome =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaHomePanelEmbed(ownerMember, updatedHome, startedAt, meta)],
        components: buildStanzaHomeRows(parsed.channelId),
      })
      .catch(async () => {
        await interaction.reply({ content: "Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_back") {
    const startedAt = Number(meta.startedAt) || Date.now();
    const updatedHome =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaHomePanelEmbed(ownerMember, updatedHome, startedAt, meta)],
        components: buildStanzaHomeRows(parsed.channelId),
      })
      .catch(async () => {
        await interaction.reply({ content: "Non è stato possibile aggiornare il pannello.", flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_nascondi" || parsed.head === "stanza_mostra") {
    const hide = parsed.head === "stanza_nascondi";
    const ok = hide
      ? await applyStanzaEveryoneViewHidden(voiceCh, guild, meta.ownerId)
      : await applyStanzaEveryoneViewVisible(voiceCh, guild);
    const updated =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    if (!ok) {
      await interaction
        .reply({
          content:
            "Non è stato possibile aggiornare i permessi del canale. Verifica che il bot abbia **Gestisci canali**.",
          flags: 64,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(updated, meta)],
        components: buildStanzaManageRows(updated),
      })
      .catch(async () => {
        await interaction
          .reply({
            content: hide ? "👻 Canale nascosto a @everyone." : "👁️ Visibilità @everyone ripristinata.",
            flags: 64,
          })
          .catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_blocca" || parsed.head === "stanza_sblocca") {
    const lock = parsed.head === "stanza_blocca";
    const ok = lock
      ? await applyStanzaEveryoneAccessLocked(voiceCh, guild, meta.ownerId)
      : await applyStanzaEveryoneAccessPublic(voiceCh, guild);
    const updated =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    if (!ok) {
      await interaction
        .reply({
          content:
            "Non è stato possibile aggiornare i permessi del canale. Verifica che il bot abbia **Gestisci canali**.",
          flags: 64,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(updated, meta)],
        components: buildStanzaManageRows(updated),
      })
      .catch(async () => {
        await interaction
          .reply({
            content: lock ? "🔒 Accesso bloccato per @everyone." : "🌟 Accesso @everyone ripristinato.",
            flags: 64,
          })
          .catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_vice") {
    registerStanzaVicePending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content:
          "🌙 Menziona l'utente da nominare **Vice**.\n" +
          "Scrivi `nessuno` o menziona il vice attuale per rimuoverlo.\n\n" +
          "*Il vice ottiene sul canale gli stessi permessi del creatore (solo per questa stanza).*",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_include") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "include", interaction);
    await interaction.reply({ content: "✏️ *Menziona l'utente da includere.*", flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_exclude") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "exclude", interaction);
    await interaction.reply({ content: "✏️ *Menziona l'utente da escludere.*", flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_silenzia") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "silenzia", interaction);
    await interaction
      .reply({ content: "🛡️ *Menziona l'utente da silenziare o smutare.*", flags: 64 })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_list") {
    await interaction
      .reply({ embeds: [buildStanzaPermissionsListEmbed(voiceCh, meta)], flags: 64 })
      .catch(() => {});
    return true;
  }

  await interaction.reply({ content: "Azione non disponibile.", flags: 64 }).catch(() => {});
  return true;
}

function getStanzaPanelViewKind(msg) {
  for (const row of msg.components || []) {
    for (const comp of row.components || []) {
      const id = String(comp.customId || "");
      if (
        id.startsWith("stanza_users_include:") ||
        id.startsWith("stanza_users_exclude:") ||
        id.startsWith("stanza_users_silenzia:") ||
        id.startsWith("stanza_users_list:") ||
        id.startsWith("stanza_users_back:")
      ) {
        return "users";
      }
      if (id.startsWith("stanza_back:")) return "manage";
    }
  }
  return "home";
}

async function refreshStanzaPanelEmbedsIfPossible(guild, voiceChannelId) {
  const vid = String(voiceChannelId || "");
  const meta = stanzaChannelMeta.get(vid);
  const panelChId = stanzaPanelTargetChannelId(meta, vid);
  if (!meta?.panelMessageId || !panelChId) return;
  const panelCh =
    guild.channels.cache.get(panelChId) || (await guild.channels.fetch(panelChId).catch(() => null));
  if (!panelCh?.isTextBased?.()) return;
  const msg = await panelCh.messages.fetch(meta.panelMessageId).catch(() => null);
  if (!msg?.editable) return;
  const voiceCh = await fetchStanzaVoiceChannel(guild, vid);
  if (!voiceCh) return;
  const ownerMember = await fetchOwnerMember(guild, meta.ownerId);
  if (!ownerMember) return;
  const startedAt = Number(meta.startedAt) || Date.now();
  const kind = getStanzaPanelViewKind(msg);
  const embeds =
    kind === "manage"
      ? [buildStanzaManageSettingsEmbed(voiceCh, meta)]
      : kind === "users"
        ? [buildStanzaUsersManageEmbed(voiceCh)]
        : [buildStanzaHomePanelEmbed(ownerMember, voiceCh, startedAt, meta)];
  const components =
    kind === "manage"
      ? buildStanzaManageRows(voiceCh)
      : kind === "users"
        ? buildStanzaUsersManageRows(vid)
        : buildStanzaHomeRows(vid);
  await msg.edit({ embeds, components }).catch(() => {});
}

async function handleStanzaRenameMessageCreate(message) {
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
  const meta = stanzaChannelMeta.get(vid);
  if (!meta) {
    clearStanzaRenamePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta, vid);
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

  await voiceCh.setName(newName, "Stanza: rinomina").catch(() => {});
  await message.delete().catch(() => {});
  clearStanzaRenamePending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaEmojiMessageCreate(message) {
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
  const meta = stanzaChannelMeta.get(vid);
  if (!meta) {
    clearStanzaEmojiPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta, vid);
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

  await voiceCh.setName(newName, "Stanza: emoji").catch(() => {});
  await message.delete().catch(() => {});
  clearStanzaEmojiPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaLimitMessageCreate(message) {
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
  const meta = stanzaChannelMeta.get(vid);
  if (!meta) {
    clearStanzaLimitPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta, vid);
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

async function handleStanzaDescMessageCreate(message) {
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
  const meta = stanzaChannelMeta.get(vid);
  if (!meta) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta, vid);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaDescPending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const topicText = sanitizeStanzaVoiceTopic(message.content);
  await voiceCh
    .edit({ topic: topicText === null ? null : topicText }, { reason: "Stanza: descrizione" })
    .catch(() => {});
  await message.delete().catch(() => {});
  clearStanzaDescPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaUsersMemberMessageCreate(message) {
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
  const meta = stanzaChannelMeta.get(vid);
  if (!meta) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: "Questa stanza non è più attiva." });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta, vid);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: "Canale vocale non trovato." });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }

  const isOwner = String(message.author.id) === String(meta.ownerId);
  const canMod = Boolean(message.member?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels));
  if (!isOwner && !canMod) {
    await editStanzaUsersMemberFollowup(message.client, pending, {
      content: "Solo il creatore della stanza (o lo staff) può usare questa azione.",
    });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    return true;
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned || mentioned.bot) return false;

  const targetId = mentioned.id;
  const botId = String(message.client.user.id);
  const viceId = String(meta.viceUserId || "").trim();
  const failPerm =
    "<:vegax:1443934876440068179> Non sono riuscito ad aggiornare i permessi sul canale. Verifica che il bot abbia **Gestisci canali**.";

  if (targetId === botId || targetId === String(meta.ownerId) || (viceId && targetId === viceId)) {
    await editStanzaUsersMemberFollowup(message.client, pending, {
      content: "<:vegax:1443934876440068179> Non puoi usare questa azione su bot, creatore o vice.",
    });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const targetMember = await message.guild.members.fetch(targetId).catch(() => null);
  if (!targetMember || targetMember.user?.bot) {
    await editStanzaUsersMemberFollowup(message.client, pending, { content: "<:vegax:1443934876440068179> Utente non valido." });
    await message.delete().catch(() => {});
    clearStanzaUsersMemberPending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const action = pending.action;
  const P = PermissionsBitField.Flags;
  let ok = false;
  let doneLine = "";

  if (action === "include") {
    ok = await applyStanzaMemberVoicePerms(voiceCh, targetId, STANZA_VOICE_MEMBER_ALLOW, "Stanza: includi utente");
    doneLine = ok ? `✅ *${targetMember} è stato **incluso**.*` : failPerm;
  } else if (action === "exclude") {
    ok = await applyStanzaMemberVoicePerms(
      voiceCh,
      targetId,
      STANZA_VOICE_MEMBER_EXCLUDE,
      "Stanza: escludi utente",
    );
    if (ok && targetMember.voice?.channelId === voiceCh.id) {
      await targetMember.voice.disconnect("Escluso dalla stanza").catch(() => {});
    }
    doneLine = ok ? `⛔ *${targetMember} è stato **escluso**.*` : failPerm;
  } else if (action === "silenzia") {
    const ow = voiceCh.permissionOverwrites.cache.get(targetId);
    const muted =
      ow &&
      ow.deny.has(P.Speak) &&
      !ow.deny.has(P.ViewChannel) &&
      !ow.deny.has(P.Connect);
    if (muted) {
      ok = await applyStanzaMemberVoicePerms(voiceCh, targetId, STANZA_VOICE_MEMBER_ALLOW, "Stanza: smuta utente");
      doneLine = ok ? `🔊 *${targetMember} è stato **smutato**.*` : failPerm;
    } else {
      ok = await applyStanzaMemberVoicePerms(
        voiceCh,
        targetId,
        STANZA_VOICE_MEMBER_SILENCE,
        "Stanza: silenzia utente (canale)",
      );
      doneLine = ok ? `🔇 *${targetMember} è stato **silenziato**.*` : failPerm;
    }
  }

  await editStanzaUsersMemberFollowup(message.client, pending, { content: doneLine });
  await message.delete().catch(() => {});
  clearStanzaUsersMemberPending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function handleStanzaViceMessageCreate(message) {
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
  const meta = stanzaChannelMeta.get(vid);
  if (!meta) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }
  const panelChId = stanzaPanelTargetChannelId(meta, vid);
  if (!panelChId || String(message.channelId || "") !== panelChId) return false;

  const voiceCh = await fetchStanzaVoiceChannel(message.guild, vid);
  if (!voiceCh) {
    clearStanzaVicePending(message.guild.id, message.author.id);
    await message.delete().catch(() => {});
    return true;
  }

  const ownerId = String(meta.ownerId || "");

  if (/^nessuno$/i.test(rawLine)) {
    const oldVice = String(meta.viceUserId || "").trim();
    if (oldVice) {
      await removeStanzaMemberVoiceOverwrite(voiceCh, oldVice);
      meta.viceUserId = null;
    }
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const mentioned = message.mentions.users.first();
  if (!mentioned || mentioned.bot) return false;

  const targetId = mentioned.id;
  if (targetId === ownerId) {
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const currentVice = String(meta.viceUserId || "").trim();
  if (currentVice && targetId === currentVice) {
    await removeStanzaMemberVoiceOverwrite(voiceCh, currentVice);
    meta.viceUserId = null;
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }

  const prevVice = currentVice;
  if (prevVice) await removeStanzaMemberVoiceOverwrite(voiceCh, prevVice);

  const ok = await setStanzaPrivilegedUserVoiceOverwrite(
    voiceCh,
    targetId,
    "Stanza: accesso vice (stessi permessi del creatore)",
  );
  if (!ok) {
    if (prevVice) {
      await setStanzaPrivilegedUserVoiceOverwrite(
        voiceCh,
        prevVice,
        "Stanza: accesso vice (stessi permessi del creatore)",
      );
    }
    meta.viceUserId = prevVice || null;
    await message.delete().catch(() => {});
    clearStanzaVicePending(message.guild.id, message.author.id);
    await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
    return true;
  }
  meta.viceUserId = targetId;
  await message.delete().catch(() => {});
  clearStanzaVicePending(message.guild.id, message.author.id);
  await refreshStanzaPanelEmbedsIfPossible(message.guild, vid);
  return true;
}

async function findStanzaPanelMessage(guild, voiceChannelId, panelMessagesCache = null) {
  const vid = String(voiceChannelId || "").trim();
  if (!vid) return null;
  const botId = String(guild.client?.user?.id || "");
  const suffix = `:${vid}`;
  const scan = (messages) => {
    if (!messages) return null;
    for (const msg of messages.values()) {
      if (String(msg.author?.id || "") !== botId) continue;
      for (const row of msg.components || []) {
        for (const comp of row.components || []) {
          const raw = String(comp.customId || "");
          if (raw.startsWith("stanza_") && raw.endsWith(suffix)) return String(msg.id || "");
        }
      }
    }
    return null;
  };
  if (panelMessagesCache) {
    const messageId = scan(panelMessagesCache);
    return messageId ? { messageId, channelId: vid } : null;
  }
  const panelCh =
    guild.channels.cache.get(vid) || (await guild.channels.fetch(vid).catch(() => null));
  if (panelCh?.isTextBased?.()) {
    const messages = await panelCh.messages.fetch({ limit: 100 }).catch(() => null);
    const messageId = scan(messages);
    if (messageId) return { messageId, channelId: vid };
  }
  if (!STANZA_PANEL_CHANNEL_ID) return null;
  const legacyCh =
    guild.channels.cache.get(STANZA_PANEL_CHANNEL_ID) ||
    (await guild.channels.fetch(STANZA_PANEL_CHANNEL_ID).catch(() => null));
  if (!legacyCh?.isTextBased?.()) return null;
  const messages = await legacyCh.messages.fetch({ limit: 100 }).catch(() => null);
  const messageId = scan(messages);
  return messageId ? { messageId, channelId: STANZA_PANEL_CHANNEL_ID } : null;
}

async function findStanzaPanelMessageId(guild, voiceChannelId, panelMessagesCache = null) {
  const found = await findStanzaPanelMessage(guild, voiceChannelId, panelMessagesCache);
  return found?.messageId || null;
}

async function loadStanzaPanelMessageIndex(guild) {
  /** @type {Map<string, { messageId: string, channelId: string }>} */
  const byVoiceId = new Map();
  const botId = String(guild.client?.user?.id || "");
  const indexMessages = (messages, channelId) => {
    if (!messages) return;
    for (const msg of messages.values()) {
      if (String(msg.author?.id || "") !== botId) continue;
      for (const row of msg.components || []) {
        for (const comp of row.components || []) {
          const raw = String(comp.customId || "");
          const idx = raw.indexOf(":");
          if (idx === -1 || !raw.startsWith("stanza_")) continue;
          const vid = raw.slice(idx + 1);
          if (vid && !byVoiceId.has(vid)) {
            byVoiceId.set(vid, { messageId: String(msg.id || ""), channelId: String(channelId || "") });
          }
        }
      }
    }
  };

  for (const ch of guild.channels.cache.values()) {
    if (!ch?.isVoiceBased?.()) continue;
    if (String(ch.id) === STANZA_LOBBY_VOICE_ID) continue;
    if (!parseStanzaVoiceName(ch.name)) continue;
    const messages = await ch.messages.fetch({ limit: 100 }).catch(() => null);
    indexMessages(messages, ch.id);
  }

  if (STANZA_PANEL_CHANNEL_ID) {
    const legacyCh =
      guild.channels.cache.get(STANZA_PANEL_CHANNEL_ID) ||
      (await guild.channels.fetch(STANZA_PANEL_CHANNEL_ID).catch(() => null));
    if (legacyCh?.isTextBased?.()) {
      const messages = await legacyCh.messages.fetch({ limit: 100 }).catch(() => null);
      indexMessages(messages, STANZA_PANEL_CHANNEL_ID);
    }
  }

  return { messages: null, byVoiceId };
}

function resolveStanzaOwnerIdFromChannel(voiceCh) {
  if (!voiceCh?.permissionOverwrites?.cache) return null;
  for (const ow of voiceCh.permissionOverwrites.cache.values()) {
    if (ow.type !== OverwriteType.Member) continue;
    if (ow.allow?.has(PermissionsBitField.Flags.ManageChannels)) return String(ow.id || "");
  }
  return null;
}

async function rehydrateExistingStanzaRooms(guild) {
  if (!MAIN_GUILD_ID || String(guild.id) !== MAIN_GUILD_ID) return 0;
  const lobby = guild.channels.cache.get(STANZA_LOBBY_VOICE_ID);
  const parentFilter = lobby?.parentId ? String(lobby.parentId) : "";
  const { byVoiceId } = await loadStanzaPanelMessageIndex(guild);
  let restored = 0;

  for (const ch of guild.channels.cache.values()) {
    if (!ch?.isVoiceBased?.()) continue;
    if (String(ch.id) === STANZA_LOBBY_VOICE_ID) continue;
    if (parentFilter && String(ch.parentId || "") !== parentFilter) continue;
    if (!parseStanzaVoiceName(ch.name)) continue;
    if (stanzaChannelMeta.has(ch.id)) continue;

    const ownerId = resolveStanzaOwnerIdFromChannel(ch);
    if (!ownerId) continue;
    const indexed = byVoiceId.get(String(ch.id));
    const located =
      indexed ||
      (await findStanzaPanelMessage(guild, ch.id));

    stanzaChannelMeta.set(ch.id, {
      ownerId,
      viceUserId: null,
      panelMessageId: String(located?.messageId || ""),
      textChannelId: String(located?.channelId || ch.id),
      guildId: guild.id,
      startedAt: Date.now(),
    });
    stanzaOwnerToChannel.set(ownerKey(guild.id, ownerId), ch.id);
    const humans = countStanzaHumanMembers(ch);
    if (humans === 0) scheduleStanzaEmptyTeardown(guild, ch.id);
    restored += 1;
  }
  return restored;
}

async function recoverStanzaVoiceOnStartup(client) {
  if (!MAIN_GUILD_ID || !STANZA_LOBBY_VOICE_ID) return { restored: 0, lobbies: 0 };
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return { restored: 0, lobbies: 0 };

  await guild.channels.fetch().catch(() => null);
  await guild.members.fetch({ withPresences: false }).catch(() => null);

  const restored = await rehydrateExistingStanzaRooms(guild);
  const swept = await sweepEmptyStanzaRooms(guild);
  let lobbies = 0;
  const lobby =
    guild.channels.cache.get(STANZA_LOBBY_VOICE_ID) ||
    (await guild.channels.fetch(STANZA_LOBBY_VOICE_ID).catch(() => null));
  if (lobby?.isVoiceBased?.()) {
    const lobbyUserIds = [
      ...new Set(
        [...guild.voiceStates.cache.values()]
          .filter((vs) => String(vs.channelId || "") === String(STANZA_LOBBY_VOICE_ID))
          .map((vs) => String(vs.id || "").trim())
          .filter(Boolean),
      ),
    ];
    for (const userId of lobbyUserIds) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || member.user?.bot) continue;
      const oldState = buildRecoveryVoiceState(guild, member, null);
      const newState = buildRecoveryVoiceState(guild, member, STANZA_LOBBY_VOICE_ID);
      await handleStanzaVoiceLobbyJoin(oldState, newState, client);
      lobbies += 1;
    }
  }

  if (restored > 0 || lobbies > 0 || swept > 0) {
    global.logger?.info?.(`[stanza] recovery: rooms=${restored} lobbies=${lobbies} swept=${swept}`);
  }
  return { restored, lobbies, swept };
}

const STANZA_EMPTY_SWEEP_MS = 5 * 60 * 1000;
/** @type {ReturnType<typeof setInterval> | null} */
let stanzaEmptySweepInterval = null;

function startStanzaEmptySweep(client) {
  if (stanzaEmptySweepInterval) return;
  stanzaEmptySweepInterval = setInterval(() => {
    const guild =
      client.guilds.cache.get(MAIN_GUILD_ID) ||
      null;
    if (!guild) return;
    sweepEmptyStanzaRooms(guild).catch((err) =>
      global.logger?.warn?.("[stanza] empty sweep failed:", err?.message || err),
    );
  }, STANZA_EMPTY_SWEEP_MS);
  stanzaEmptySweepInterval.unref?.();
}

function startStanzaVoiceRecovery(client) {
  setTimeout(() => {
    recoverStanzaVoiceOnStartup(client)
      .then(() => startStanzaEmptySweep(client))
      .catch((err) =>
        global.logger?.warn?.("[stanza] startup recovery failed:", err?.message || err),
      );
  }, 12_000).unref?.();
}

async function handleStanzaPanelPromptMessageCreate(message) {
  if (await handleStanzaUsersMemberMessageCreate(message)) return true;
  if (await handleStanzaViceMessageCreate(message)) return true;
  if (await handleStanzaEmojiMessageCreate(message)) return true;
  if (await handleStanzaLimitMessageCreate(message)) return true;
  if (await handleStanzaDescMessageCreate(message)) return true;
  if (await handleStanzaRenameMessageCreate(message)) return true;
  return false;
}

module.exports = {
  handleStanzaVoiceLobbyJoin,
  handleStanzaVoiceOccupied,
  handleStanzaVoiceEmpty,
  recoverStanzaVoiceOnStartup,
  startStanzaVoiceRecovery,
  handleStanzaButton,
  handleStanzaRenameMessageCreate,
  handleStanzaEmojiMessageCreate,
  handleStanzaLimitMessageCreate,
  handleStanzaDescMessageCreate,
  handleStanzaViceMessageCreate,
  handleStanzaPanelPromptMessageCreate,
  buildStanzaChannelName,
};