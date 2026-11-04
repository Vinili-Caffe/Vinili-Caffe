const { ChannelType } = require("discord.js") as typeof import("discord.js");
const { STANZA_CATEGORY_ID, isManagedStanzaRoomChannel, resolveStanzaVoiceCreatePlacement, placeStanzaAfterGroupTail, stanzaChannelMeta } = require("./stanzaPlacement") as typeof import("./stanzaPlacement");
const { MAIN_GUILD_ID, isStanzaBotRename, isCanonicalStanzaVoiceName, resolveEnforcedStanzaVoiceName } = require("./stanzaNames") as typeof import("./stanzaNames");
const { isStanzaGuildAllowed, finalizeStanzaVisitorVoiceSessionIfLeft } = require("./stanzaVisitors") as typeof import("./stanzaVisitors");
const { markStanzaBotRename, syncStanzaCompanionTextName, parseStanzaButtonId, getStanzaMetaOrRehydrate, refreshStanzaPanelEmbedsIfPossible } = require("./stanzaPanel") as typeof import("./stanzaPanel");
const { restoreStanzaRoomsFromSnapshot } = require("./stanzaSnapshot") as typeof import("./stanzaSnapshot");
const { handleStanzaVoiceLobbyJoin, handleStanzaVoiceEmpty, handleStanzaVoiceOccupied, handleStanzaVoiceSilenceSync } = require("./stanzaLifecycle") as typeof import("./stanzaLifecycle");
const { isStanzaRoomController, handleStanzaButton } = require("./stanzaButtons") as typeof import("./stanzaButtons");
const { handleStanzaPanelPromptMessageCreate } = require("./stanzaPrompts") as typeof import("./stanzaPrompts");




/** Marker used in deploy/probe asserts — do not remove. */
const STANZA_NAME_ENFORCE_MARKER = "stanzaCreateOnlyStanzaDi1";
async function isStanzaButtonActorAllowed(interaction?) {
  if (!interaction?.isButton?.()) return false;
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith("stanza_")) return false;
  const parsed = parseStanzaButtonId(customId);
  if (!parsed) return false;
  const guild = interaction.guild;
  if (!guild) return false;
  if (String(guild.id) !== MAIN_GUILD_ID) return true;
  const meta = await getStanzaMetaOrRehydrate(guild, parsed.channelId);
  if (!meta) return false;
  return isStanzaRoomController(meta, interaction.user?.id);
}

/**
 * Enforce ༄{emoji}︲{label} after manual Discord renames (and any other name edits).
 * Only for tracked stanza rooms (meta/snapshot) — never other ༄ voice/stage channels.
 * Never injects "Stanza di" on rename (create-only).
 * Bot-initiated setName is ignored via stanzaBotRenameUntil to avoid loops.
 */
async function handleStanzaChannelUpdate(oldChannel?, newChannel?) {
  void STANZA_NAME_ENFORCE_MARKER;
  if (!newChannel?.guild || !isStanzaGuildAllowed(newChannel.guild.id)) return false;
  const isVoice =
    newChannel.type === ChannelType.GuildVoice ||
    (typeof newChannel.isVoiceBased === "function" && newChannel.isVoiceBased());
  if (!isVoice) return false;

  const cid = String(newChannel.id || "");
  if (!cid) return false;
  if (isStanzaBotRename(cid)) return false;

  const oldName = String(oldChannel?.name || "");
  const newName = String(newChannel.name || "");
  if (!oldName || oldName === newName) return false;

  const guild = newChannel.guild;
  const meta = await getStanzaMetaOrRehydrate(guild, cid);
  /* Meta-only: do not infer "stanza" from ༄ prefix (Streaming / duo / stage, etc.). */
  if (!meta) return false;

  const enforced = resolveEnforcedStanzaVoiceName(oldName, newName);
  if (!enforced || enforced === newName) return false;

  markStanzaBotRename(cid);
  const ok = await newChannel.setName(enforced, "Stanza: ripristino prefisso").then(() => true).catch((err?) => {
    global.logger?.warn?.("[stanza] name enforce failed:", err?.message || err);
    return false;
  });
  if (!ok) return false;

  await syncStanzaCompanionTextName(guild, cid, enforced);
  await refreshStanzaPanelEmbedsIfPossible(guild, cid).catch(() => {});
  return true;
}

function isStanzaVoiceChannelCached(guild?, channelId?) {
  const cid = String(channelId || "").trim();
  const gid = String(guild?.id || "").trim();
  if (!cid || !gid) return false;
  if (stanzaChannelMeta.has(cid)) return true;
  for (const meta of stanzaChannelMeta.values()) {
    if (String(meta?.guildId || "") !== gid) continue;
    if (String(meta?.textChannelId || "") === cid) return true;
  }
  return false;
}

async function isStanzaCommandChannel(guild?, channel?) {
  if (!guild || !channel) return false;
  const cid = String(channel.id || "").trim();
  if (!cid) return false;
  if (isStanzaVoiceChannelCached(guild, cid)) return true;
  const isVoice =
    channel.type === ChannelType.GuildVoice ||
    (typeof channel.isVoiceBased === "function" && channel.isVoiceBased() && !channel.isThread?.());
  if (isVoice) {
    const meta = await getStanzaMetaOrRehydrate(guild, cid);
    if (meta) return true;
    if (STANZA_CATEGORY_ID && String(channel.parentId || "") === STANZA_CATEGORY_ID) return true;
  }
  return false;
}

export = {
  isStanzaButtonActorAllowed,
  isStanzaCommandChannel,
  restoreStanzaRoomsFromSnapshot,
  finalizeStanzaVisitorVoiceSessionIfLeft,
  handleStanzaVoiceLobbyJoin,
  handleStanzaVoiceOccupied,
  handleStanzaVoiceEmpty,
  handleStanzaVoiceSilenceSync,
  handleStanzaButton,
  handleStanzaPanelPromptMessageCreate,
  handleStanzaChannelUpdate,
  resolveEnforcedStanzaVoiceName,
  isCanonicalStanzaVoiceName,
  resolveStanzaVoiceCreatePlacement,
  placeStanzaAfterGroupTail,
  isManagedStanzaRoomChannel,
};