/** Stanze vocali: permessi su vocale e chat (proprietario, vice, membri, silenziati, bot). */
const { OverwriteType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { stanzaChannelMeta } = require("./stanzaPlacement") as typeof import("./stanzaPlacement");
const { normalizeStanzaDiscordUserId, ensureStanzaSilencedUserIds } = require("./stanzaNames") as typeof import("./stanzaNames");
const { fetchStanzaTextChannel } = require("./stanzaVisitors") as typeof import("./stanzaVisitors");

const STANZA_MEMBER_ROLE_ID = String(IDs.roles?.Member || "").trim();

function getStanzaMemberRoleId() {
  return STANZA_MEMBER_ROLE_ID || "";
}

const STANZA_VOICE_MEMBER_ROLE_PUBLIC = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true };
const STANZA_VOICE_MEMBER_ROLE_LOCKED = { ViewChannel: false, Connect: false };
const STANZA_VOICE_OWNER_OVERWRITE = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true, ManageChannels: true };
const STANZA_VOICE_BOT_OVERWRITE = { ViewChannel: true, Connect: true, Speak: true, ManageChannels: true, MoveMembers: true, MuteMembers: true, DeafenMembers: true };

function stanzaPermissionAllowArrayFromObject(obj?) {
  const P = PermissionsBitField.Flags;
  const out = [];
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== true) continue;
    const bit = P[k];
    if (bit != null) out.push(bit);
  }
  return out;
}
const STANZA_TEXT_MEMBER_ROLE_PUBLIC = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };
const STANZA_TEXT_MEMBER_ROLE_LOCKED = { ViewChannel: false, SendMessages: false };
const STANZA_TEXT_OWNER_OVERWRITE = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true, ManageChannels: true, ManageMessages: true };
const STANZA_TEXT_BOT_OVERWRITE = { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, ManageMessages: true, ManageChannels: true };
const STANZA_TEXT_MEMBER_SILENCE = { ViewChannel: true, SendMessages: false, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };

async function ensureStanzaOwnerVoiceOverwrite(voiceChannel?, ownerId?) {
  const id = String(ownerId || "");
  if (!id) return false;
  if (voiceChannel.permissionOverwrites.cache.has(id)) return true;
  return voiceChannel.permissionOverwrites
    .create(id, STANZA_VOICE_OWNER_OVERWRITE, { reason: "Stanza: accesso creatore", type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function setStanzaPrivilegedUserVoiceOverwrite(voiceChannel?, userId?, reason?) {
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

async function ensureStanzaBotVoiceOverwrite(voiceChannel?, botUserId?) {
  const id = String(botUserId || "");
  if (!id) return false;
  try {
    if (voiceChannel.permissionOverwrites.cache.has(id)) {
      await voiceChannel.permissionOverwrites.edit(id, STANZA_VOICE_BOT_OVERWRITE, {
        reason: "Stanza: accesso bot",
        type: OverwriteType.Member,
      });
    } else {
      await voiceChannel.permissionOverwrites.create(id, STANZA_VOICE_BOT_OVERWRITE, {
        reason: "Stanza: accesso bot",
        type: OverwriteType.Member,
      });
    }
    return true;
  } catch {
    return false;
  }
}

async function applyStanzaMemberServerMute(member?, voiceChannelId?, muted?, reason?) {
  if (!member?.voice) return false;
  if (String(member.voice.channelId || "") !== String(voiceChannelId || "")) return false;
  if (Boolean(member.voice.serverMute) === Boolean(muted)) return true;
  try {
    await member.voice.setMute(Boolean(muted), reason);
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] server mute failed:", err?.message || err);
    return false;
  }
}

async function clearStanzaServerMuteAnywhere(member?, reason?) {
  if (!member?.voice) return false;
  // Uscita vocale: Discord non accetta setMute se channelId è null (race voiceStateUpdate).
  if (!member.voice.channelId) return true;
  if (!member.voice.serverMute) return true;
  try {
    await member.voice.setMute(false, reason);
    return true;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/not connected to voice/i.test(msg)) return true;
    global.logger?.warn?.("[stanza] clear server mute failed:", msg);
    return false;
  }
}

function addStanzaSilencedUser(meta?, userId?) {
  const id = String(userId || "").trim();
  if (!id || !/^\d{5,30}$/.test(id)) return false;
  const arr = ensureStanzaSilencedUserIds(meta);
  if (arr.includes(id)) return false;
  arr.push(id);
  return true;
}

function removeStanzaSilencedUser(meta?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  const before = ensureStanzaSilencedUserIds(meta);
  meta.silencedUserIds = before.filter((x?) => x !== id);
  return meta.silencedUserIds.length !== before.length;
}

function isLegacyStanzaSilenceVoiceOverwrite(ow?) {
  if (!ow) return false;
  const P = PermissionsBitField.Flags;
  return Boolean(ow.deny?.has?.(P.Speak) && !ow.deny?.has?.(P.ViewChannel) && !ow.deny?.has?.(P.Connect));
}

function isLegacyStanzaSilenceTextOverwrite(ow?) {
  if (!ow) return false;
  const P = PermissionsBitField.Flags;
  return Boolean(ow.deny?.has?.(P.SendMessages) && !ow.deny?.has?.(P.ViewChannel));
}

/** Solo Speak-deny legacy sul vocale (il deny chat è gestito a parte). */
async function clearLegacyStanzaSilenceVoiceOverwrite(voiceChannel?, userId?, reason?) {
  const id = String(userId || "").trim();
  if (!id || !voiceChannel) return;
  const vow = voiceChannel.permissionOverwrites?.cache?.get?.(id);
  if (isLegacyStanzaSilenceVoiceOverwrite(vow)) {
    await voiceChannel.permissionOverwrites.delete(id, reason || "Stanza: rimuovi Speak-deny legacy").catch(() => {});
  }
}

/**
 * Silenzio chat stanza: deny SendMessages sul canale testo (o voice-chat se è lo stesso id).
 * Allo smuta ripristina scrittura se l'utente non è escluso.
 */
async function applyStanzaSilencedTextChat(guild?, voiceChannelId?, userId?, silenced?, reason?) {
  const id = String(userId || "").trim();
  if (!id || !guild) return false;
  const tch = await stanzaCompanionTextChannel(guild, voiceChannelId).catch(() => null);
  if (!tch) return true;
  if (silenced) {
    return applyStanzaMemberTextPerms(
      tch,
      id,
      STANZA_TEXT_MEMBER_SILENCE,
      reason || "Stanza: silenzia chat",
    );
  }
  const ow = tch.permissionOverwrites.cache.get(id);
  if (ow?.deny?.has?.(PermissionsBitField.Flags.ViewChannel)) return true;
  return applyStanzaMemberTextPerms(
    tch,
    id,
    {
      SendMessages: true,
      EmbedLinks: true,
      AttachFiles: true,
      AddReactions: true,
      ReadMessageHistory: true,
    },
    reason || "Stanza: smuta chat",
  );
}

async function removeStanzaMemberVoiceOverwrite(voiceChannel?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return true;
  if (!voiceChannel.permissionOverwrites.cache.has(id)) return true;
  return voiceChannel.permissionOverwrites
    .delete(id, "Stanza: revoca vice")
    .then(() => true)
    .catch(() => false);
}

async function applyStanzaMemberVoicePerms(voiceChannel?, userId?, permsObject?, reason?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  try {
    if (voiceChannel.permissionOverwrites.cache.has(id)) {
      await voiceChannel.permissionOverwrites.edit(id, permsObject, { reason, type: OverwriteType.Member });
    } else {
      await voiceChannel.permissionOverwrites.create(id, permsObject, { reason, type: OverwriteType.Member });
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] member overwrite failed:", err?.message || err);
    return false;
  }
}

async function ensureStanzaViceOverwriteIfAny(voiceChannel?, ownerId?) {
  const chId = String(voiceChannel?.id || "");
  const viceId = normalizeStanzaDiscordUserId(stanzaChannelMeta.get(chId)?.viceUserId);
  const oid = String(ownerId || "");
  if (!viceId || viceId === oid) return true;
  return setStanzaPrivilegedUserVoiceOverwrite(
    voiceChannel,
    viceId,
    "Stanza: accesso vice",
  );
}

async function ensureStanzaEveryoneNoAccess(voiceChannel?, guild?) {
  const everyoneId = guild.roles.everyone.id;
  const payload = { ViewChannel: false, Connect: false, Speak: false, UseVAD: false, Stream: false };
  try {
    if (voiceChannel.permissionOverwrites.cache.has(everyoneId)) {
      await voiceChannel.permissionOverwrites.edit(everyoneId, payload, { reason: "Stanza: @everyone senza accesso al canale", type: OverwriteType.Role });
    } else {
      await voiceChannel.permissionOverwrites.create(everyoneId, payload, { reason: "Stanza: @everyone senza accesso al canale", type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function setStanzaMemberRoleChannelOverwrite(voiceChannel?, payload?, reason?) {
  const roleId = getStanzaMemberRoleId();
  if (!roleId) return false;
  try {
    if (voiceChannel.permissionOverwrites.cache.has(roleId)) {
      await voiceChannel.permissionOverwrites.edit(roleId, payload, { reason, type: OverwriteType.Role });
    } else {
      await voiceChannel.permissionOverwrites.create(roleId, payload, { reason, type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function applyStanzaMemberRoleAccessLocked(voiceChannel?, guild?, ownerId?) {
  const botId = String(guild.client?.user?.id || "");
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaBotVoiceOverwrite(voiceChannel, botId))) return false;
  if (!(await ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, STANZA_VOICE_MEMBER_ROLE_LOCKED, "Stanza: blocca accesso");
  if (!ok) return false;
  mirrorStanzaLockedToCompanionText(guild, voiceChannel, ownerId).catch(() => {});
  return true;
}

async function applyStanzaMemberRoleAccessPublic(voiceChannel?, guild?) {
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, STANZA_VOICE_MEMBER_ROLE_PUBLIC, "Stanza: sblocca accesso");
  if (!ok) return false;
  mirrorStanzaPublicToCompanionText(guild, voiceChannel).catch(() => {});
  return true;
}

async function applyStanzaMemberRoleViewHidden(voiceChannel?, guild?, ownerId?) {
  const botId = String(guild.client?.user?.id || "");
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaOwnerVoiceOverwrite(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaBotVoiceOverwrite(voiceChannel, botId))) return false;
  if (!(await ensureStanzaViceOverwriteIfAny(voiceChannel, ownerId))) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, { ViewChannel: false }, "Stanza: nascondi canale");
  if (!ok) return false;
  mirrorStanzaViewHiddenToCompanionText(guild, voiceChannel).catch(() => {});
  return true;
}

async function applyStanzaMemberRoleViewVisible(voiceChannel?, guild?) {
  if (!getStanzaMemberRoleId()) return false;
  if (!(await ensureStanzaEveryoneNoAccess(voiceChannel, guild))) return false;
  const ok = await setStanzaMemberRoleChannelOverwrite(voiceChannel, { ViewChannel: true }, "Stanza: mostra canale");
  if (!ok) return false;
  mirrorStanzaViewVisibleToCompanionText(guild, voiceChannel).catch(() => {});
  return true;
}

async function applyStanzaMemberTextPerms(textChannel?, userId?, permsObject?, reason?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  try {
    if (textChannel.permissionOverwrites.cache.has(id)) {
      await textChannel.permissionOverwrites.edit(id, permsObject, { reason, type: OverwriteType.Member });
    } else {
      await textChannel.permissionOverwrites.create(id, permsObject, { reason, type: OverwriteType.Member });
    }
    return true;
  } catch (err) {
    global.logger?.warn?.("[stanza] testo member overwrite failed:", err?.message || err);
    return false;
  }
}

async function setStanzaMemberRoleTextChannelOverwrite(textChannel?, payload?, reason?) {
  const roleId = getStanzaMemberRoleId();
  if (!roleId) return false;
  try {
    if (textChannel.permissionOverwrites.cache.has(roleId)) {
      await textChannel.permissionOverwrites.edit(roleId, payload, { reason, type: OverwriteType.Role });
    } else {
      await textChannel.permissionOverwrites.create(roleId, payload, { reason, type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function ensureStanzaOwnerTextOverwrite(textChannel?, ownerId?) {
  const id = String(ownerId || "");
  if (!id) return false;
  if (textChannel.permissionOverwrites.cache.has(id)) return true;
  return textChannel.permissionOverwrites
    .create(id, STANZA_TEXT_OWNER_OVERWRITE, { reason: "Stanza: accesso creatore (chat)", type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function setStanzaPrivilegedUserTextOverwrite(textChannel?, userId?, reason?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  if (textChannel.permissionOverwrites.cache.has(id)) {
    return textChannel.permissionOverwrites
      .edit(id, STANZA_TEXT_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
      .then(() => true)
      .catch(() => false);
  }
  return textChannel.permissionOverwrites
    .create(id, STANZA_TEXT_OWNER_OVERWRITE, { reason, type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function ensureStanzaBotTextOverwrite(textChannel?, botUserId?) {
  const id = String(botUserId || "");
  if (!id) return false;
  if (textChannel.permissionOverwrites.cache.has(id)) return true;
  return textChannel.permissionOverwrites
    .create(id, STANZA_TEXT_BOT_OVERWRITE, { reason: "Stanza: accesso bot (chat)", type: OverwriteType.Member })
    .then(() => true)
    .catch(() => false);
}

async function removeStanzaMemberTextOverwrite(textChannel?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return true;
  if (!textChannel.permissionOverwrites.cache.has(id)) return true;
  return textChannel.permissionOverwrites
    .delete(id, "Stanza: revoca vice (chat)")
    .then(() => true)
    .catch(() => false);
}

async function ensureStanzaEveryoneNoAccessText(textChannel?, guild?) {
  const everyoneId = guild.roles.everyone.id;
  const payload = { ViewChannel: false, SendMessages: false };
  try {
    if (textChannel.permissionOverwrites.cache.has(everyoneId)) {
      await textChannel.permissionOverwrites.edit(everyoneId, payload, { reason: "Stanza: @everyone senza accesso alla chat", type: OverwriteType.Role });
    } else {
      await textChannel.permissionOverwrites.create(everyoneId, payload, { reason: "Stanza: @everyone senza accesso alla chat", type: OverwriteType.Role });
    }
    return true;
  } catch {
    return false;
  }
}

async function ensureStanzaViceTextOverwriteIfAny(textChannel?, voiceChannelId?, ownerId?) {
  const viceId = normalizeStanzaDiscordUserId(stanzaChannelMeta.get(String(voiceChannelId || ""))?.viceUserId);
  const oid = String(ownerId || "");
  if (!viceId || viceId === oid) return true;
  return setStanzaPrivilegedUserTextOverwrite(textChannel, viceId, "Stanza: accesso vice");
}

async function stanzaCompanionTextChannel(guild?, voiceChannelId?) {
  const tid = String(stanzaChannelMeta.get(String(voiceChannelId || ""))?.textChannelId || "").trim();
  if (!tid || !/^\d{5,30}$/.test(tid)) return null;
  return fetchStanzaTextChannel(guild, tid);
}

async function mirrorStanzaLockedToCompanionText(guild?, voiceChannel?, ownerId?) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  const botId = String(guild.client?.user?.id || "");
  await ensureStanzaOwnerTextOverwrite(tch, ownerId);
  await ensureStanzaBotTextOverwrite(tch, botId);
  await ensureStanzaViceTextOverwriteIfAny(tch, voiceChannel.id, ownerId);
  await ensureStanzaEveryoneNoAccessText(tch, guild);
  await setStanzaMemberRoleTextChannelOverwrite(tch, STANZA_TEXT_MEMBER_ROLE_LOCKED, "Stanza: blocca accesso chat");
}

async function mirrorStanzaPublicToCompanionText(guild?, voiceChannel?) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  await ensureStanzaEveryoneNoAccessText(tch, guild);
  await setStanzaMemberRoleTextChannelOverwrite(tch, STANZA_TEXT_MEMBER_ROLE_PUBLIC, "Stanza: sblocca accesso chat");
}

async function mirrorStanzaViewHiddenToCompanionText(guild?, voiceChannel?) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  await setStanzaMemberRoleTextChannelOverwrite(tch, { ViewChannel: false }, "Stanza: nascondi chat");
}

async function mirrorStanzaViewVisibleToCompanionText(guild?, voiceChannel?) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannel.id);
  if (!tch) return;
  await setStanzaMemberRoleTextChannelOverwrite(tch, STANZA_TEXT_MEMBER_ROLE_PUBLIC, "Stanza: mostra chat");
}

export = { getStanzaMemberRoleId, STANZA_VOICE_OWNER_OVERWRITE, STANZA_VOICE_BOT_OVERWRITE, stanzaPermissionAllowArrayFromObject, setStanzaPrivilegedUserVoiceOverwrite, ensureStanzaBotVoiceOverwrite, applyStanzaMemberServerMute, clearStanzaServerMuteAnywhere, addStanzaSilencedUser, removeStanzaSilencedUser, isLegacyStanzaSilenceVoiceOverwrite, isLegacyStanzaSilenceTextOverwrite, clearLegacyStanzaSilenceVoiceOverwrite, applyStanzaSilencedTextChat, removeStanzaMemberVoiceOverwrite, applyStanzaMemberVoicePerms, applyStanzaMemberRoleAccessLocked, applyStanzaMemberRoleAccessPublic, applyStanzaMemberRoleViewHidden, applyStanzaMemberRoleViewVisible, applyStanzaMemberTextPerms, setStanzaPrivilegedUserTextOverwrite, removeStanzaMemberTextOverwrite, stanzaCompanionTextChannel, mirrorStanzaPublicToCompanionText };
