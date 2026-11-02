/** Stanze vocali: creazione dalla lobby, stanza vuota o occupata, chiusura. */
const { ChannelType, OverwriteType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { accountUsername } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { STANZA_LOBBY_VOICE_ID, getStanzaCategoryParentId, resolveStanzaVoiceCreatePlacement, placeStanzaAfterGroupTail, applyStanzaVoiceCreatePosition, stanzaChannelMeta } = require("./stanzaPlacement") as typeof import("./stanzaPlacement");
const { STANZA_DEFAULT_EMOJI, sanitizeStanzaLabel, buildStanzaCreateName, persistStanzaSnapshotNow } = require("./stanzaNames") as typeof import("./stanzaNames");
const { isStanzaGuildAllowed, stanzaVisitorVoiceSession, ownerKey, notifyStanzaVisitorJoin } = require("./stanzaVisitors") as typeof import("./stanzaVisitors");
const { getStanzaMemberRoleId, STANZA_VOICE_OWNER_OVERWRITE, STANZA_VOICE_BOT_OVERWRITE, stanzaPermissionAllowArrayFromObject, applyStanzaMemberServerMute, clearStanzaServerMuteAnywhere, applyStanzaSilencedTextChat, mirrorStanzaPublicToCompanionText } = require("./stanzaPerms") as typeof import("./stanzaPerms");
const { stanzaOwnerToChannel, channelIdIsLinkedCustomRolePrivateVoc, clearStanzaEmptyTeardownTimer, scheduleStanzaEmptyTeardown, isStanzaUserSilenced, postStanzaPanel, fetchStanzaVoiceChannel, tryRehydrateStanzaRoomByChannelId, getStanzaMetaOrRehydrate } = require("./stanzaPanel") as typeof import("./stanzaPanel");
const { tryAttachOwnerStanzaFromSnapshot, tryDiscoverOwnerStanzaVoiceInGuild } = require("./stanzaSnapshot") as typeof import("./stanzaSnapshot");

const STANZA_TEARDOWN_MOVE_TARGET_VOICE_IDS = [IDs.channels?.vocaleLounge1, IDs.channels?.vocaleLounge2, IDs.channels?.vocaleLounge3].map((id?) => String(id || "").trim()).filter((id?) => /^\d{5,30}$/.test(id));
const stanzaCreateLocks = new Set();
const stanzaPendingOwnerVoiceId = new Map();

function buildStanzaChannelName(member?) {
  const label = sanitizeStanzaLabel(accountUsername(member?.user) || member?.displayName || member?.user?.username);
  return buildStanzaCreateName(STANZA_DEFAULT_EMOJI, label);
}
const STANZA_VOICE_MEMBER_WITH_PANEL_CHAT = { ViewChannel: true, Connect: true, Speak: true, UseVAD: true, Stream: true, UseEmbeddedActivities: true, UseExternalApps: true, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true };
const STANZA_VOICE_OWNER_WITH_PANEL_CHAT = { ...STANZA_VOICE_OWNER_OVERWRITE, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, AddReactions: true, ManageMessages: true };
const STANZA_VOICE_BOT_WITH_PANEL_CHAT = { ...STANZA_VOICE_BOT_OVERWRITE, SendMessages: true, ReadMessageHistory: true, EmbedLinks: true, AttachFiles: true, ManageMessages: true };

async function handleStanzaVoiceLobbyJoin(oldState?, newState?, client?) {
  if (!STANZA_LOBBY_VOICE_ID) return;
  const guild = newState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const member = newState.member;
  if (!member || member.user?.bot) return;
  const joinedId = String(newState.channelId || "");
  const leftLobby = String(oldState.channelId || "");
  if (joinedId !== STANZA_LOBBY_VOICE_ID || leftLobby === STANZA_LOBBY_VOICE_ID) return;

  const ok = newState.channel?.isVoiceBased?.();
  if (!ok) return;

  const me = guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels | PermissionsBitField.Flags.MoveMembers)) {
    global.logger?.warn?.("[stanza] bot missing ManageChannels/MoveMembers permission");
    return;
  }

  const uid = String(member.id);
  if (stanzaCreateLocks.has(uid)) {
    const pendingVid = stanzaPendingOwnerVoiceId.get(uid);
    if (pendingVid) {
      const ch =
        guild.channels.cache.get(pendingVid) || (await guild.channels.fetch(pendingVid).catch(() => null));
      if (ch?.isVoiceBased?.()) await member.voice.setChannel(ch).catch(() => {});
    }
    return;
  }
  const okKey = ownerKey(guild.id, uid);
  if (!stanzaOwnerToChannel.has(okKey)) {
    await tryAttachOwnerStanzaFromSnapshot(guild, uid);
  }
  if (!stanzaOwnerToChannel.has(okKey)) {
    await tryDiscoverOwnerStanzaVoiceInGuild(guild, uid);
  }
  const existingId = stanzaOwnerToChannel.get(okKey);
  if (existingId) {
    const existing =
      guild.channels.cache.get(existingId) || (await guild.channels.fetch(existingId).catch(() => null));
    if (existing?.isVoiceBased?.()) {
      if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, existingId)) {
        stanzaOwnerToChannel.delete(okKey);
        stanzaChannelMeta.delete(existingId);
        persistStanzaSnapshotNow();
      } else {
        await member.voice.setChannel(existing).catch(() => {});
        return;
      }
    } else {
      stanzaOwnerToChannel.delete(okKey);
      stanzaChannelMeta.delete(existingId);
      persistStanzaSnapshotNow();
    }
  }

  stanzaCreateLocks.add(uid);
  try {
    const memberRoleId = getStanzaMemberRoleId();
    if (!memberRoleId) {
      global.logger?.warn?.("[stanza] creazione stanza impossibile: IDs.roles.Member non configurato");
      return;
    }
    const lobbyCh = newState.channel;
    const { parentId, position } = resolveStanzaVoiceCreatePlacement(guild, lobbyCh);
    const name = buildStanzaChannelName(member);
    const createPayload: Record<string, any> = {
      name,
      type: ChannelType.GuildVoice,
      parent: parentId || undefined,
      reason: `Stanza temporanea per ${member.user?.tag || uid}`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            type: OverwriteType.Role,
            deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.Speak, PermissionsBitField.Flags.UseVAD, PermissionsBitField.Flags.Stream, PermissionsBitField.Flags.SendMessages],
          },
          {
            id: memberRoleId,
            type: OverwriteType.Role,
            allow: stanzaPermissionAllowArrayFromObject(STANZA_VOICE_MEMBER_WITH_PANEL_CHAT),
          },
          {
            id: uid,
            type: OverwriteType.Member,
            allow: stanzaPermissionAllowArrayFromObject(STANZA_VOICE_OWNER_WITH_PANEL_CHAT),
          },
          {
            id: client.user.id,
            type: OverwriteType.Member,
            allow: stanzaPermissionAllowArrayFromObject(STANZA_VOICE_BOT_WITH_PANEL_CHAT),
          },
        ],
    };
    if (position !== undefined) createPayload.position = position;
    const voiceChannel = await guild.channels.create(createPayload).catch((err?) => {
      global.logger?.warn?.("[stanza] create failed:", err?.message || err);
      return null;
    });
    if (!voiceChannel) return;

    await applyStanzaVoiceCreatePosition(
      voiceChannel,
      position,
      `Stanza temporanea sotto hub per ${member.user?.tag || uid}`,
    );
    await placeStanzaAfterGroupTail(
      voiceChannel,
      guild,
      `Stanza temporanea sotto gruppo per ${member.user?.tag || uid}`,
    ).catch((err?) => {
      global.logger?.warn?.("[stanza] place under hub failed:", err?.message || err);
    });
    try {
      const { reorderLimitateCategory } = require("../../../Vinili/Services/Voice/publicVoiceHubService") as typeof import("../../../Vinili/Services/Voice/publicVoiceHubService");
      await reorderLimitateCategory(guild, client, {
        parentId: parentId || getStanzaCategoryParentId(),
        forceFetch: true,
      });
      await placeStanzaAfterGroupTail(voiceChannel, guild, "Stanza temporanea ri-ancora sotto hub").catch(
        () => null,
      );
    } catch (eReorder) {
      global.logger?.warn?.("[stanza] hub reorder after create failed:", eReorder?.message || eReorder);
    }

    stanzaPendingOwnerVoiceId.set(uid, voiceChannel.id);

    const movedOk = await member.voice.setChannel(voiceChannel).then(() => true).catch((err?) => {
      global.logger?.warn?.("[stanza] move failed:", err?.message || err);
      return false;
    });
    if (!movedOk) {
      stanzaPendingOwnerVoiceId.delete(uid);
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
      stanzaPendingOwnerVoiceId.delete(uid);
      await refreshed.delete("Pannello non inviato").catch(() => {});
      return;
    }

    stanzaChannelMeta.set(refreshed.id, {
      ownerId: uid,
      viceUserId: null,
      panelMessageId: String(panel.panelMessageId),
      textChannelId: String(refreshed.id),
      guildId: guild.id,
      startedAt: Number(panel.startedAt) || Date.now(),
    });
    stanzaOwnerToChannel.set(okKey, refreshed.id);
    persistStanzaSnapshotNow();
    mirrorStanzaPublicToCompanionText(guild, refreshed).catch(() => {});
  } finally {
    stanzaPendingOwnerVoiceId.delete(uid);
    stanzaCreateLocks.delete(uid);
  }
}

async function handleStanzaVoiceEmpty(oldState?, newState?) {
  const guild = oldState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const prevId = String(oldState.channelId || "");
  if (!prevId || prevId === STANZA_LOBBY_VOICE_ID) return;
  if (!stanzaChannelMeta.has(prevId)) {
    await tryRehydrateStanzaRoomByChannelId(guild, prevId);
  }
  if (!stanzaChannelMeta.has(prevId)) return;
  const nextCh = newState.channelId ? String(newState.channelId) : "";
  if (prevId === nextCh) return;

  const channel =
    guild.channels.cache.get(prevId) || (await guild.channels.fetch(prevId).catch(() => null));
  if (!channel?.isVoiceBased?.()) {
    clearStanzaEmptyTeardownTimer(prevId);
    const goneMeta = stanzaChannelMeta.get(prevId);
    if (goneMeta) stanzaOwnerToChannel.delete(ownerKey(goneMeta.guildId, goneMeta.ownerId));
    stanzaChannelMeta.delete(prevId);
    persistStanzaSnapshotNow();
    return;
  }
  const humans = channel.members.filter((m?) => !m.user.bot);
  if (humans.size > 0) {
    clearStanzaEmptyTeardownTimer(prevId);
    return;
  }
  scheduleStanzaEmptyTeardown(guild, prevId);
}

async function handleStanzaVoiceOccupied(oldState?, newState?) {
  const guild = newState.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const joinedId = String(newState.channelId || "");
  if (!joinedId || joinedId === STANZA_LOBBY_VOICE_ID) return;
  const meta = await getStanzaMetaOrRehydrate(guild, joinedId);
  if (!meta) return;
  const member = newState.member;
  if (!member || member.user?.bot) return;
  const leftId = String(oldState.channelId || "");
  if (leftId === joinedId) return;
  clearStanzaEmptyTeardownTimer(joinedId);
  const userKey = ownerKey(guild.id, member.id);
  stanzaVisitorVoiceSession.set(userKey, { voiceChannelId: joinedId, startedAt: Date.now() });
  const voiceCh =
    newState.channel?.isVoiceBased?.() && String(newState.channel.id) === joinedId
      ? newState.channel
      : await fetchStanzaVoiceChannel(guild, joinedId);
  if (voiceCh && String(member.id) !== String(meta.ownerId || "")) {
    await notifyStanzaVisitorJoin(member, voiceCh, meta);
  }
}

/**
 * Silenzio stanza = server mute + deny chat sul canale testo della stanza:
 * - uscita → toglie solo server mute (lista + deny chat restano)
 * - rientro → rimuta + riapplica deny chat finché non smutato dal pannello
 */
async function handleStanzaVoiceSilenceSync(oldState?, newState?) {
  const guild = newState?.guild || oldState?.guild;
  if (!guild || !isStanzaGuildAllowed(guild.id)) return;
  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;
  const leftId = String(oldState?.channelId || "");
  const joinedId = String(newState?.channelId || "");
  if (leftId === joinedId) return;

  if (leftId && leftId !== STANZA_LOBBY_VOICE_ID) {
    const leftMeta = await getStanzaMetaOrRehydrate(guild, leftId);
    if (leftMeta && isStanzaUserSilenced(leftMeta, member.id)) {
      await clearStanzaServerMuteAnywhere(member, "Stanza: uscita (silenzio resta in stanza)").catch(() => {});
    }
  }

  if (joinedId && joinedId !== STANZA_LOBBY_VOICE_ID) {
    const joinedMeta = await getStanzaMetaOrRehydrate(guild, joinedId);
    if (joinedMeta && isStanzaUserSilenced(joinedMeta, member.id)) {
      await applyStanzaMemberServerMute(member, joinedId, true, "Stanza: rientro silenziato").catch(() => {});
      await applyStanzaSilencedTextChat(guild, joinedId, member.id, true, "Stanza: rientro silenziato chat").catch(() => {});
    }
  }
}

async function resolveStanzaTeardownPermissionProbe(guild?) {
  const rid = getStanzaMemberRoleId();
  if (!rid || !/^\d{5,30}$/.test(rid)) return guild.roles.everyone;
  let role = guild.roles.cache.get(rid);
  if (!role) role = await guild.roles.fetch(rid).catch(() => null);
  return role || guild.roles.everyone;
}

async function pickRandomTeardownMoveTarget(guild?, excludeChannelId?) {
  const exclude = new Set([String(excludeChannelId || ""), STANZA_LOBBY_VOICE_ID].filter(Boolean));
  const probe = await resolveStanzaTeardownPermissionProbe(guild);
  const candidates = [];
  for (const id of STANZA_TEARDOWN_MOVE_TARGET_VOICE_IDS) {
    if (exclude.has(id)) continue;
    const ch = await fetchStanzaVoiceChannel(guild, id);
    if (!ch) continue;
    if (guild.afkChannelId && ch.id === guild.afkChannelId) continue;
    const perms = ch.permissionsFor(probe);
    if (!perms?.has(PermissionsBitField.Flags.ViewChannel)) continue;
    if (!perms.has(PermissionsBitField.Flags.Connect)) continue;
    const limit = Number(ch.userLimit) || 0;
    if (limit > 0 && ch.members.size >= limit) continue;
    candidates.push(ch);
  }
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function moveStanzaOccupantsToChannel(voiceChannel?, targetVoice?) {
  if (!voiceChannel || !targetVoice) return { moved: 0, attempted: 0 };
  const humans = [...voiceChannel.members.values()].filter((m?) => !m.user?.bot);
  if (!humans.length) return { moved: 0, attempted: 0 };
  const results = await Promise.all(
    humans.map((m?) => m.voice.setChannel(targetVoice).then(() => true).catch(() => false)),
  );
  const moved = results.filter(Boolean).length;
  return { moved, attempted: humans.length };
}

export = { handleStanzaVoiceLobbyJoin, handleStanzaVoiceEmpty, handleStanzaVoiceOccupied, handleStanzaVoiceSilenceSync, pickRandomTeardownMoveTarget, moveStanzaOccupantsToChannel };
