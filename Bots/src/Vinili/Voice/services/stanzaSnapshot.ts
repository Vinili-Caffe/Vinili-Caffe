/** Stanze vocali: salvataggio e ripristino dopo un riavvio. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { STANZA_LOBBY_VOICE_ID, getStanzaCategoryParentId, stanzaChannelMeta, STANZA_NAME_LEAD, findStanzaAnchorIndex, parseStanzaVoiceName } = require("./stanzaPlacement") as typeof import("./stanzaPlacement");
const { MAIN_GUILD_ID, stanzaRenamePending, stanzaEmojiPending, stanzaLimitPending, stanzaDescPending, stanzaVicePending, stanzaUsersMemberPending, persistStanzaSnapshotNow } = require("./stanzaNames") as typeof import("./stanzaNames");
const { STANZA_ALLOWED_GUILD_IDS, ownerKey } = require("./stanzaVisitors") as typeof import("./stanzaVisitors");
const { mirrorStanzaPublicToCompanionText } = require("./stanzaPerms") as typeof import("./stanzaPerms");
const { stanzaOwnerToChannel, channelIdIsLinkedCustomRolePrivateVoc, postStanzaPanel, readStanzaSnapshotRaw, readStanzaSnapshotRoomsRaw, tryRehydrateStanzaRoomFromSnapshotRecord } = require("./stanzaPanel") as typeof import("./stanzaPanel");

const STANZA_DISCOVERY_EXCLUDE_PARENT_IDS = new Set((Array.isArray(IDs.stanzaDiscoveryExcludeParentIds) ? IDs.stanzaDiscoveryExcludeParentIds : []).map((x?) => String(x || "").trim()).filter((x?) => /^\d{5,30}$/.test(x)));

function getStanzaDiscoveryParentFilter(guild?) {
  const fromCategory = getStanzaCategoryParentId();
  if (fromCategory) return fromCategory;
  const lobby = guild?.channels?.cache?.get(STANZA_LOBBY_VOICE_ID);
  return lobby?.parentId ? String(lobby.parentId) : "";
}

function isVoiceChannelProbablyStanza(voiceChannel?) {
  return Boolean(parseStanzaVoiceName(String(voiceChannel?.name || "")));
}

function isVoiceChannelDiscoveryStanzaCandidate(voiceChannel?) {
  const n = String(voiceChannel?.name || "");
  if (!n.startsWith(STANZA_NAME_LEAD)) return false;
  return Boolean(findStanzaAnchorIndex(n.slice(STANZA_NAME_LEAD.length)));
}

function isVoiceChannelDiscoveryRenamedStanzaCandidate(voiceChannel?) {
  if (!isVoiceChannelProbablyStanza(voiceChannel)) return false;
  if (isVoiceChannelDiscoveryStanzaCandidate(voiceChannel)) return false;
  return true;
}

function restoreStanzaPendingMapFromSnapshot(targetMap?, rows?, sanitizeRow?) {
  if (!rows || typeof rows !== "object") return;
  const now = Date.now();
  for (const [keyRaw, rowRaw] of Object.entries(rows)) {
    const key = String(keyRaw || "").trim();
    if (!key) continue;
    const row = sanitizeRow(rowRaw);
    if (!row) continue;
    const remainingMs = Number(row.expiresAt || 0) - now;
    if (!Number.isFinite(remainingMs) || remainingMs <= 0) continue;
    const timerId = setTimeout(() => {
      targetMap.delete(key);
      persistStanzaSnapshotNow();
    }, remainingMs);
    timerId.unref?.();
    targetMap.set(key, { ...row, timerId });
  }
}

function restoreStanzaPendingFromSnapshot() {
  const raw = readStanzaSnapshotRaw();
  const pending = raw?.pending && typeof raw.pending === "object" ? raw.pending : {};
  const sanitizeBase = (row?) => {
    const voiceChannelId = String(row?.voiceChannelId || "").trim();
    const expiresAt = Number(row?.expiresAt || 0);
    if (!voiceChannelId || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
    return { voiceChannelId, expiresAt };
  };
  restoreStanzaPendingMapFromSnapshot(stanzaRenamePending, pending.rename, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaEmojiPending, pending.emoji, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaLimitPending, pending.limit, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaDescPending, pending.desc, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaVicePending, pending.vice, sanitizeBase);
  restoreStanzaPendingMapFromSnapshot(stanzaUsersMemberPending, pending.usersMember, (row?) => {
    const base = sanitizeBase(row);
    if (!base) return null;
    const action = String(row?.action || "").trim();
    if (!action) return null;
    const interactionApplicationId = row?.interactionApplicationId ? String(row.interactionApplicationId) : "";
    const interactionToken = row?.interactionToken ? String(row.interactionToken) : "";
    return {
      ...base,
      action,
      ...(interactionApplicationId && interactionToken
        ? { interactionApplicationId, interactionToken }
        : {}),
    };
  });
}

async function tryAttachOwnerStanzaFromSnapshot(guild?, ownerUserId?) {
  const rooms = readStanzaSnapshotRoomsRaw();
  if (!rooms) return false;
  const oid = String(ownerUserId);
  let any = false;
  for (const [channelId, rec] of Object.entries(rooms)) {
    if (String(rec?.ownerId || "") !== oid) continue;
    if (String(rec?.guildId || "") !== String(guild.id)) continue;
    if (await tryRehydrateStanzaRoomFromSnapshotRecord(guild, channelId, rec)) any = true;
  }
  return any;
}

function stanzaVoiceMessageHasStanzaPanelForVoice(msg?, botId?, voiceChannelId?) {
  const want = String(voiceChannelId || "").trim();
  if (!msg || String(msg.author?.id || "") !== String(botId || "") || !want) return false;
  for (const row of msg.components || []) {
    for (const comp of row.components || []) {
      const raw = String(comp.customId || "");
      const idx = raw.indexOf(":");
      if (idx === -1) continue;
      const head = raw.slice(0, idx);
      const rest = raw.slice(idx + 1);
      if (rest !== want) continue;
      if (head.startsWith("stanza_")) return true;
    }
  }
  return false;
}

async function voiceChannelHasBoundStanzaPanel(guild?, voiceCh?) {
  const botId = String(guild.client?.user?.id || "");
  const vid = String(voiceCh?.id || "");
  if (!vid) return false;
  const msgs = await voiceCh.messages.fetch({ limit: 40 }).catch(() => null);
  if (!msgs?.size) return false;
  for (const m of msgs.values()) {
    if (stanzaVoiceMessageHasStanzaPanelForVoice(m, botId, vid)) return true;
  }
  return false;
}

async function ensureStanzaMetaForOwnedVoiceChannel(guild?, voiceCh?, ownerId?) {
  const uid = String(ownerId || "").trim();
  const id = String(voiceCh?.id || "");
  if (!uid || !id) return null;
  if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, id)) return null;
  const ok = ownerKey(guild.id, uid);
  const existingMeta = stanzaChannelMeta.get(id);
  if (existingMeta && String(existingMeta.ownerId || "") === uid) {
    stanzaOwnerToChannel.set(ok, id);
    return existingMeta;
  }
  if (existingMeta && String(existingMeta.ownerId || "") !== uid) return null;

  const botId = String(guild.client?.user?.id || "");
  let panelMessageId = "";
  const msgs = await voiceCh.messages.fetch({ limit: 50 }).catch(() => null);
  if (msgs?.size) {
    for (const m of msgs.values()) {
      if (stanzaVoiceMessageHasStanzaPanelForVoice(m, botId, id)) {
        panelMessageId = String(m.id || "");
        break;
      }
    }
  }
  let meta;
  if (panelMessageId && /^\d{5,30}$/.test(panelMessageId)) {
    meta = {
      ownerId: uid,
      viceUserId: null,
      panelMessageId,
      textChannelId: String(voiceCh.id),
      guildId: guild.id,
      startedAt: Date.now(),
    };
  } else {
    const member = await guild.members.fetch(uid).catch(() => null);
    if (!member) return null;
    const panel = await postStanzaPanel(guild, member, voiceCh, voiceCh, {
      textChannelId: voiceCh.id,
      viceUserId: null,
    });
    if (!panel?.panelMessageId) return null;
    meta = {
      ownerId: uid,
      viceUserId: null,
      panelMessageId: String(panel.panelMessageId),
      textChannelId: String(voiceCh.id),
      guildId: guild.id,
      startedAt: Number(panel.startedAt) || Date.now(),
    };
  }
  stanzaChannelMeta.set(id, meta);
  stanzaOwnerToChannel.set(ok, id);
  persistStanzaSnapshotNow();
  mirrorStanzaPublicToCompanionText(guild, voiceCh).catch(() => {});
  return meta;
}

function collectOwnerStanzaVoiceCandidatesForDiscovery(guild?, ownerUserId?, parentIdFilter?, predicate?) {
  const uid = String(ownerUserId || "").trim();
  if (!uid) return [];
  const out = [];
  const tryCollect = (useParent?) => {
    for (const ch of guild.channels.cache.values()) {
      if (!ch?.isVoiceBased?.()) continue;
      if (String(ch.id) === STANZA_LOBBY_VOICE_ID) continue;
      const chParent = String(ch.parentId || "").trim();
      if (chParent && STANZA_DISCOVERY_EXCLUDE_PARENT_IDS.has(chParent)) continue;
      if (useParent && parentIdFilter && String(ch.parentId || "") !== parentIdFilter) continue;
      if (!predicate(ch)) continue;
      const ow = ch.permissionOverwrites.cache.get(uid);
      if (!ow?.allow?.has(PermissionsBitField.Flags.ManageChannels)) continue;
      out.push(ch);
    }
  };
  if (parentIdFilter) tryCollect(true);
  if (!out.length) tryCollect(false);
  return out;
}

const STANZA_DISCOVERY_RENAMED_PANEL_CHECK_CAP = 20;

async function tryDiscoverOwnerStanzaVoiceInGuild(guild?, ownerUserId?) {
  const uid = String(ownerUserId || "").trim();
  if (!uid || String(guild.id) !== MAIN_GUILD_ID) return false;
  const ok = ownerKey(guild.id, uid);
  if (stanzaOwnerToChannel.has(ok)) return true;
  const parentFilter = getStanzaDiscoveryParentFilter(guild);
  const byAnchor = collectOwnerStanzaVoiceCandidatesForDiscovery(
    guild,
    uid,
    parentFilter,
    isVoiceChannelDiscoveryStanzaCandidate,
  );
  let best = null;
  for (const ch of byAnchor) {
    if (!(await channelIdIsLinkedCustomRolePrivateVoc(guild.id, ch.id))) {
      best = ch;
      break;
    }
  }
  if (!best) {
    const renamed = collectOwnerStanzaVoiceCandidatesForDiscovery(
      guild,
      uid,
      parentFilter,
      isVoiceChannelDiscoveryRenamedStanzaCandidate,
    );
    const slice = renamed.slice(0, STANZA_DISCOVERY_RENAMED_PANEL_CHECK_CAP);
    for (const ch of slice) {
      if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, ch.id)) continue;
      if (await voiceChannelHasBoundStanzaPanel(guild, ch)) {
        best = ch;
        break;
      }
    }
  }
  if (!best) return false;
  const attached = await ensureStanzaMetaForOwnedVoiceChannel(guild, best, uid);
  return Boolean(attached);
}

async function restoreStanzaRoomsFromSnapshot(client?) {
  restoreStanzaPendingFromSnapshot();
  const rooms = readStanzaSnapshotRoomsRaw();
  if (!rooms) return;
  const allowedGuildIds = STANZA_ALLOWED_GUILD_IDS.size
    ? [...STANZA_ALLOWED_GUILD_IDS]
    : [MAIN_GUILD_ID].filter(Boolean);
  let restored = 0;
  for (const guildId of allowedGuildIds) {
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) continue;
    for (const [channelId, rec] of Object.entries(rooms)) {
      if (String(rec?.guildId || "") !== String(guild.id)) continue;
      if (await tryRehydrateStanzaRoomFromSnapshotRecord(guild, channelId, rec)) restored += 1;
    }
  }
  persistStanzaSnapshotNow();
}

export = { tryAttachOwnerStanzaFromSnapshot, tryDiscoverOwnerStanzaVoiceInGuild, restoreStanzaRoomsFromSnapshot };
