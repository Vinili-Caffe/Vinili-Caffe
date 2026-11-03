/** Stanze vocali: pannello con i pulsanti (home, impostazioni, utenti, permessi). */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, OverwriteType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const fs = require("fs") as typeof import("fs");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { CustomRole } = require("../../../shared/schemas/communitySchemas") as typeof import("../../../shared/schemas/communitySchemas");
const { stanzaChannelMeta, parseStanzaVoiceName } = require("./stanzaPlacement") as typeof import("./stanzaPlacement");
const { MAIN_GUILD_ID, stanzaVoiceStatusByChannelId, stanzaBotRenameUntil, STANZA_DEFAULT_EMOJI, STANZA_SNAPSHOT_VERSION, STANZA_SNAPSHOT_PATH, normalizeStanzaDiscordUserId, sanitizeStanzaMetaViceUserId, isCanonicalStanzaVoiceName, resolveEnforcedStanzaVoiceName, rememberStanzaVoiceChannelStatus, ensureStanzaSilencedUserIds, persistStanzaSnapshotNow } = require("./stanzaNames") as typeof import("./stanzaNames");
const { ownerKey, flushStanzaVisitorVoiceSessionsForChannel } = require("./stanzaVisitors") as typeof import("./stanzaVisitors");
const { clearStanzaRenamePending, clearStanzaRenamePendingByVoiceChannel, clearStanzaEmojiPending, clearStanzaEmojiPendingByVoiceChannel, clearStanzaVicePending, clearStanzaVicePendingByVoiceChannel, clearStanzaUsersMemberPending, clearStanzaUsersMemberPendingByVoiceChannel, clearStanzaLimitPending, clearStanzaLimitPendingByVoiceChannel, clearStanzaDescPending, clearStanzaDescPendingByVoiceChannel } = require("./stanzaPending") as typeof import("./stanzaPending");
const { getStanzaMemberRoleId, applyStanzaMemberServerMute, clearStanzaServerMuteAnywhere, isLegacyStanzaSilenceVoiceOverwrite, applyStanzaSilencedTextChat, stanzaCompanionTextChannel } = require("./stanzaPerms") as typeof import("./stanzaPerms");

const STANZA_PANEL_CHANNEL_ID = String(IDs.channels?.commands || "").trim();
const stanzaOwnerToChannel = new Map();
const STANZA_BOT_RENAME_TTL_MS = 12_000;
const STANZA_EMPTY_TEARDOWN_MS = 10 * 60 * 1000;

const stanzaEmptyTeardownTimers = new Map();

async function channelIdIsLinkedCustomRolePrivateVoc(guildId?, channelId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !/^\d{5,30}$/.test(cid)) return false;
  const doc = await CustomRole.findOne({ guildId: gid, customVocChannelId: cid }, { customVocChannelId: 1 })
    .lean()
    .catch(() => null);
  return Boolean(doc?.customVocChannelId && String(doc.customVocChannelId).trim() === cid);
}

function clearStanzaEmptyTeardownTimer(channelId?) {
  const id = String(channelId || "");
  const row = stanzaEmptyTeardownTimers.get(id);
  if (row?.timerId) clearTimeout(row.timerId);
  stanzaEmptyTeardownTimers.delete(id);
}

function scheduleStanzaEmptyTeardown(guild?, channelId?) {
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
    const humans = ch.members.filter((m?) => !m.user.bot);
    if (humans.size > 0) return;
    await teardownStanza(g, id);
  }, STANZA_EMPTY_TEARDOWN_MS);
  timerId.unref?.();
  stanzaEmptyTeardownTimers.set(id, { timerId });
}

function markStanzaBotRename(channelId?, ttlMs = STANZA_BOT_RENAME_TTL_MS) {
  const id = String(channelId || "");
  if (!id) return;
  stanzaBotRenameUntil.set(id, Date.now() + Math.max(1000, Number(ttlMs) || STANZA_BOT_RENAME_TTL_MS));
}

function resolveVoicePrivacyLines(voiceChannel?, guild?) {
  const roleId = getStanzaMemberRoleId();
  if (!voiceChannel?.permissionOverwrites?.cache || !roleId) {
    return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
  }
  const ow = voiceChannel.permissionOverwrites.cache.get(roleId);
  if (!ow) return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
  const denyView = ow?.deny?.has(PermissionsBitField.Flags.ViewChannel);
  const denyConnect = ow?.deny?.has(PermissionsBitField.Flags.Connect);
  if (denyView) return { privacy: "🔒 Privata", visibility: "👻 Invisibile" };
  if (denyConnect) return { privacy: "🔒 Privata", visibility: "👁️ Visibile" };
  return { privacy: "🌟 Pubblica", visibility: "👁️ Visibile" };
}

function isStanzaMemberRoleViewHidden(voiceChannel?, guild?) {
  const roleId = getStanzaMemberRoleId();
  if (!voiceChannel?.permissionOverwrites?.cache || !roleId) return false;
  const ow = voiceChannel.permissionOverwrites.cache.get(roleId);
  return Boolean(ow?.deny?.has(PermissionsBitField.Flags.ViewChannel));
}

function isStanzaMemberRoleConnectBlocked(voiceChannel?, guild?) {
  const roleId = getStanzaMemberRoleId();
  if (!voiceChannel?.permissionOverwrites?.cache || !roleId) return false;
  const ow = voiceChannel.permissionOverwrites.cache.get(roleId);
  return Boolean(ow?.deny?.has(PermissionsBitField.Flags.Connect));
}

function stanzaPanelTargetChannelId(meta?) {
  const fromMeta = String(meta?.textChannelId || "").trim();
  if (fromMeta && /^\d{5,30}$/.test(fromMeta)) return fromMeta;
  const leg = String(STANZA_PANEL_CHANNEL_ID || "").trim();
  if (leg && /^\d{5,30}$/.test(leg)) return leg;
  return "";
}

function isStanzaUserSilenced(meta?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return false;
  return ensureStanzaSilencedUserIds(meta).includes(id);
}

async function syncStanzaCompanionTextName(guild?, voiceChannelId?, name?) {
  const tch = await stanzaCompanionTextChannel(guild, voiceChannelId);
  if (!tch || !name) return;
  if (String(tch.id) === String(voiceChannelId)) return;
  await tch.setName(String(name).slice(0, 100), "Stanza: nome chat allineato").catch(() => {});
}

function displayEmojiFromVoiceName(name?) {
  return parseStanzaVoiceName(String(name || ""))?.emojiPart || STANZA_DEFAULT_EMOJI;
}

function buildStanzaHomePanelEmbed(ownerMember?, voiceChannel?, startedAt?, meta = null) {
  const ownerId = String(ownerMember?.id || "");
  const limit = voiceChannel?.userLimit ? String(voiceChannel.userLimit) : "Infinito";
  const { privacy, visibility } = resolveVoicePrivacyLines(voiceChannel, voiceChannel.guild);
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const viceLine = viceId ? `<@${viceId}>` : "Nessuno";
  const chatId = String(meta?.textChannelId || "").trim();
  const voiceId = String(voiceChannel?.id || "").trim();
  const chatLine =
    chatId && chatId !== voiceId ? `**Chat stanza:** <#${chatId}>\n` : "";
  const elapsedSec = Math.max(0, Math.floor((Date.now() - (startedAt || Date.now())) / 1000));
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🏠 · Pannello Gestione Stanza")
    .setDescription(
      `👋Benvenuto nella stanza, <@${ownerId}>!\n` +
        "🔧 Usa i menu qui sotto per personalizzare la tua stanza.\n\n" +
        "💡 Le stanze sono spazi temporanei gestiti dagli utenti: chi le crea ne definisce le regole e l'accesso.\n\n" +
        `🎤 **Canale:** <#${voiceChannel?.id || "0"}>\n` +
        chatLine +
        `🔊 **Limite:** ${limit}\n` +
        `🔒 **Privacy:** ${privacy}\n` +
        `👁️ **Visibilità:** ${visibility}\n` +
        `🌙 **Vice:** ${viceLine}\n` +
        `⏱️ **Tempo stanza:** ${m}m ${s}s`,
    )
}

function buildStanzaManageSettingsEmbed(voiceChannel?, meta = null) {
  const chName = String(voiceChannel?.name || "—");
  const emoji = displayEmojiFromVoiceName(chName);
  const limit = voiceChannel?.userLimit ? String(voiceChannel.userLimit) : "Infinito";
  const { privacy, visibility } = resolveVoicePrivacyLines(voiceChannel, voiceChannel.guild);
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const viceVal = viceId ? `<@${viceId}>` : "Nessuno";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("🎛️ · Impostazioni Stanza")
    .setDescription("🔍 Visualizza e modifica le impostazioni principali della tua stanza.")
    .addFields(
      {
        name: "📋 · Info generali",
        value: [`🔤 **Nome:** ${chName}`, `🌀 **Emoji:** ${emoji}`, `🔊 **Limite:** ${limit}`].join("\n"),
        inline: true,
      },
      {
        name: "⚙️ · Impostazioni",
        value: [`🔒 **Privacy:** ${privacy}`, `👁️ **Visibilità:** ${visibility}`].join("\n"),
        inline: true,
      },
      { name: "🌙 · Vice", value: `👥 ${viceVal}`, inline: false },
    )
}

function buildStanzaHomeRows(channelId?) {
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

function buildStanzaManageRows(voiceChannel?) {
  const cid = String(voiceChannel?.id || "");
  const guild = voiceChannel?.guild;
  const viewHidden = guild ? isStanzaMemberRoleViewHidden(voiceChannel, guild) : false;
  const connectBlocked = guild ? isStanzaMemberRoleConnectBlocked(voiceChannel, guild) : false;
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`stanza_nome:${cid}`).setLabel("Nome").setEmoji("✏️").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`stanza_emoji:${cid}`).setLabel("Emoji").setEmoji("🌀").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`stanza_limite:${cid}`).setLabel("Limite").setEmoji("🔊").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`stanza_desc:${cid}`).setLabel("Stato").setEmoji("📝").setStyle(ButtonStyle.Secondary),
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
  const lockToggleBtn = connectBlocked
    ? new ButtonBuilder()
        .setCustomId(`stanza_sblocca:${cid}`)
        .setLabel("Sblocca")
        .setEmoji("🌟")
        .setStyle(ButtonStyle.Success)
    : new ButtonBuilder()
        .setCustomId(`stanza_blocca:${cid}`)
        .setLabel("Blocca")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger);
  const row2 = new ActionRowBuilder().addComponents(vistaBtn, lockToggleBtn, new ButtonBuilder().setCustomId(`stanza_vice:${cid}`).setLabel("Nomina Vice").setEmoji("🌙").setStyle(ButtonStyle.Primary));
  const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`stanza_back:${cid}`).setLabel("Indietro").setEmoji("<:1343arrowleft:1525249879151083621>️").setStyle(ButtonStyle.Secondary));
  return [row1, row2, row3];
}

function buildStanzaUsersManageEmbed(voiceChannel?) {
  const chLabel = voiceChannel?.id ? `<#${voiceChannel.id}>` : "—";
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("👥 · Gestione Membri Stanza")
    .setDescription(
      `🔍 Scegli un'azione per gestire chi può entrare o parlare.\n\n🎤 **Canale:** ${chLabel}`,
    )
}

function buildStanzaUsersManageRows(voiceChannel?, meta = null) {
  const cid = String(voiceChannel?.id || voiceChannel || "");
  const ch = voiceChannel && typeof voiceChannel === "object" ? voiceChannel : null;
  const row1 = new ActionRowBuilder().addComponents(
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
      .setCustomId(`stanza_users_smuta:${cid}`)
      .setLabel("Smuta")
      .setEmoji("🔊")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`stanza_users_list:${cid}`)
      .setLabel("Lista Membri")
      .setEmoji("👥")
      .setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stanza_users_back:${cid}`)
      .setLabel("Indietro")
      .setEmoji("<:1343arrowleft:1525249879151083621>️")
      .setStyle(ButtonStyle.Primary),
  );
  return [row1, row2];
}

async function postStanzaPanel(guild?, member?, voiceChannel?, textChannel?, metaForEmbed = null) {
  if (!textChannel?.isTextBased?.()) return null;
  const startedAt = Date.now();
  const msg = await textChannel
    .send({
      content: `<@${member.id}>`,
      embeds: [buildStanzaHomePanelEmbed(member, voiceChannel, startedAt, metaForEmbed)],
      components: buildStanzaHomeRows(voiceChannel.id),
    })
    .catch(() => null);
  return { panelMessageId: msg?.id || null, startedAt };
}

async function teardownStanza(guild?, channelId?, opts: Record<string, any> = {}) {
  const id = String(channelId || "");
  const meta = stanzaChannelMeta.get(id);
  if (!meta) return false;
  const linkedProfileVoc = await channelIdIsLinkedCustomRolePrivateVoc(guild.id, id);
  const preserveVoice = Boolean(opts?.preserveVoiceChannel) || linkedProfileVoc;
  if (linkedProfileVoc) {
    global.logger?.warn?.("[stanza] teardown: vocale collegata a CustomRole; non elimino il canale", id);
  }
  await flushStanzaVisitorVoiceSessionsForChannel(guild.id, id);
  clearStanzaEmptyTeardownTimer(id);
  stanzaVoiceStatusByChannelId.delete(id);
  const silencedIds = ensureStanzaSilencedUserIds(meta);
  for (const uid of silencedIds) {
    const m =
      guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (m?.voice?.serverMute) {
      await clearStanzaServerMuteAnywhere(m, "Stanza: chiusura stanza").catch(() => {});
    }
  }
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

  const textId = String(meta.textChannelId || "").trim();
  if (textId && /^\d{5,30}$/.test(textId) && textId !== id) {
    const tch = guild.channels.cache.get(textId) || (await guild.channels.fetch(textId).catch(() => null));
    if (tch?.deletable) await tch.delete("Stanza: chiusura chat").catch(() => {});
  } else if (meta.panelMessageId && STANZA_PANEL_CHANNEL_ID) {
    const panelCh =
      guild.channels.cache.get(STANZA_PANEL_CHANNEL_ID) ||
      (await guild.channels.fetch(STANZA_PANEL_CHANNEL_ID).catch(() => null));
    if (panelCh?.isTextBased?.()) {
      const msg = await panelCh.messages.fetch(meta.panelMessageId).catch(() => null);
      if (msg?.deletable) await msg.delete().catch(() => {});
    }
  }

  const ch = guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
  if (!preserveVoice && ch?.deletable) await ch.delete("Stanza vuota o chiusura").catch(() => {});
  else if (preserveVoice) {
    const panelId = String(meta.panelMessageId || "").trim();
    if (panelId && /^\d{5,30}$/.test(panelId) && ch?.messages) {
      const pm = await ch.messages.fetch(panelId).catch(() => null);
      if (pm?.deletable) await pm.delete("Stanza: rimozione pannello").catch(() => {});
    }
  }
  persistStanzaSnapshotNow();
  return preserveVoice;
}

function parseStanzaButtonId(customId?) {
  const raw = String(customId || "");
  const idx = raw.indexOf(":");
  if (idx === -1) return null;
  const head = raw.slice(0, idx);
  const channelId = raw.slice(idx + 1);
  if (!head.startsWith("stanza_")) return null;
  if (!/^\d{5,30}$/.test(channelId)) return null;
  return { head, channelId };
}

function formatStanzaPermListLines(ids?, cap = 18) {
  if (!ids?.length) return "_Nessuno_";
  const slice = ids.slice(0, cap);
  const lines = slice.map((id?) => `• <@${id}>`);
  if (ids.length > cap) lines.push(`_(+${ids.length - cap} altri)_`);
  return lines.join("\n");
}

function collectStanzaPermissionMemberLists(voiceChannel?, meta?) {
  const ownerId = String(meta?.ownerId || "");
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const botId = String(voiceChannel.client?.user?.id || "");
  const everyoneId = voiceChannel.guild?.roles?.everyone?.id;
  const P = PermissionsBitField.Flags;
  const included = [];
  const excluded = [];
  const silencedSet = new Set(ensureStanzaSilencedUserIds(meta));
  for (const ow of voiceChannel.permissionOverwrites.cache.values()) {
    if (Number(ow.type) !== OverwriteType.Member) continue;
    const id = String(ow.id);
    if (id === everyoneId || id === botId || id === ownerId || (viceId && id === viceId)) continue;
    if (ow.deny.has(P.ViewChannel) || ow.deny.has(P.Connect)) {
      excluded.push(id);
      continue;
    }
    if (isLegacyStanzaSilenceVoiceOverwrite(ow)) {
      silencedSet.add(id);
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
  return { included, excluded, silenced: [...silencedSet] };
}

function buildStanzaPermissionsListEmbed(voiceChannel?, meta?) {
  const ownerId = String(meta?.ownerId || "");
  const viceId = normalizeStanzaDiscordUserId(meta?.viceUserId);
  const lists = collectStanzaPermissionMemberLists(voiceChannel, meta);
  const staffLines = [`👑 <@${ownerId}>`];
  if (viceId) staffLines.push(`⭐ <@${viceId}>`);
  const staffBlock = `🛡️ ${staffLines.join("\n")}`;
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("📜 · Lista Permessi")
    .setDescription(staffBlock)
    .addFields(
      { name: "✅ Inclusi", value: formatStanzaPermListLines(lists.included), inline: true },
      { name: "⛔ Esclusi", value: formatStanzaPermListLines(lists.excluded), inline: true },
      { name: "🔇 Silenziati", value: formatStanzaPermListLines(lists.silenced), inline: true },
    )
}

async function fetchOwnerMember(guild?, ownerId?) {
  return (
    guild.members.cache.get(ownerId) ||
    (await guild.members.fetch(ownerId).catch(() => null))
  );
}

async function fetchStanzaVoiceChannel(guild?, channelId?) {
  const ch =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!ch || ch.type !== ChannelType.GuildVoice) return null;
  return ch;
}

function readStanzaSnapshotRaw() {
  try {
    if (!fs.existsSync(STANZA_SNAPSHOT_PATH)) return null;
    const j = JSON.parse(fs.readFileSync(STANZA_SNAPSHOT_PATH, "utf8"));
    if (!j || j.version !== STANZA_SNAPSHOT_VERSION || !j.rooms || typeof j.rooms !== "object") return null;
    return j;
  } catch {
    return null;
  }
}

function readStanzaSnapshotRoomsRaw() {
  const j = readStanzaSnapshotRaw();
  return j?.rooms || null;
}

function normalizeStanzaRecordFromSnapshot(rec?, guildId?) {
  const ownerId = normalizeStanzaDiscordUserId(rec?.ownerId);
  if (!ownerId) return null;
  const panelMessageId = String(rec?.panelMessageId || "").trim();
  if (!panelMessageId) return null;
  const gid = String(rec?.guildId || guildId || MAIN_GUILD_ID).trim();
  const viceUserId = normalizeStanzaDiscordUserId(rec?.viceUserId) || null;
  let textChannelId = String(rec?.textChannelId || "").trim();
  if (!textChannelId || !/^\d{5,30}$/.test(textChannelId)) textChannelId = null;
  const voiceStatus = typeof rec?.voiceStatus === "string" && rec.voiceStatus.trim() ? rec.voiceStatus.trim() : null;
  const silencedUserIds = Array.isArray(rec?.silencedUserIds)
    ? rec.silencedUserIds.map((id?) => String(id || "").trim()).filter((id?) => /^\d{5,30}$/.test(id))
    : [];
  return {
    ownerId,
    viceUserId,
    panelMessageId,
    textChannelId,
    guildId: gid,
    startedAt: Number(rec?.startedAt) || Date.now(),
    voiceStatus,
    silencedUserIds,
  };
}

async function tryRehydrateStanzaRoomFromSnapshotRecord(guild?, channelId?, rec?) {
  const id = String(channelId || "");
  if (!/^\d{5,30}$/.test(id)) return false;
  if (stanzaChannelMeta.has(id)) return true;
  const meta = normalizeStanzaRecordFromSnapshot(rec, guild.id);
  if (!meta || String(meta.guildId) !== String(guild.id)) return false;
  const voiceCh = await fetchStanzaVoiceChannel(guild, id);
  if (!voiceCh?.isVoiceBased?.()) return false;
  if (await channelIdIsLinkedCustomRolePrivateVoc(guild.id, id)) return false;
  const ownerOw = voiceCh.permissionOverwrites.cache.get(meta.ownerId);
  if (!ownerOw?.allow?.has(PermissionsBitField.Flags.ManageChannels)) return false;
  stanzaChannelMeta.set(id, meta);
  if (meta.voiceStatus) rememberStanzaVoiceChannelStatus(id, meta.voiceStatus);
  stanzaOwnerToChannel.set(ownerKey(guild.id, meta.ownerId), id);
  const humans = voiceCh.members.filter((m?) => !m.user.bot);
  if (humans.size === 0) {
    scheduleStanzaEmptyTeardown(guild, id);
  } else {
    for (const m of humans.values()) {
      if (isStanzaUserSilenced(meta, m.id)) {
        await applyStanzaMemberServerMute(m, id, true, "Stanza: ripristino silenzio").catch(() => {});
        await applyStanzaSilencedTextChat(guild, id, m.id, true, "Stanza: ripristino silenzio chat").catch(() => {});
      }
    }
  }
  // Heal stripped names after restart (no channelUpdate until next rename).
  if (!isCanonicalStanzaVoiceName(voiceCh.name)) {
    const enforced = resolveEnforcedStanzaVoiceName(voiceCh.name, voiceCh.name);
    if (enforced && enforced !== String(voiceCh.name || "")) {
      markStanzaBotRename(id);
      await voiceCh.setName(enforced, "Stanza: ripristino prefisso").catch(() => {});
      await syncStanzaCompanionTextName(guild, id, enforced);
    }
  }
  return true;
}

async function tryRehydrateStanzaRoomByChannelId(guild?, channelId?) {
  const rooms = readStanzaSnapshotRoomsRaw();
  if (!rooms) return false;
  const rec = rooms[channelId];
  if (!rec) return false;
  return tryRehydrateStanzaRoomFromSnapshotRecord(guild, channelId, rec);
}

async function getStanzaMetaOrRehydrate(guild?, channelId?) {
  const id = String(channelId || "");
  if (!id || !guild) return null;
  if (String(guild.id) !== MAIN_GUILD_ID) return null;
  const cur = stanzaChannelMeta.get(id);
  if (cur && String(cur.guildId) === String(guild.id)) {
    sanitizeStanzaMetaViceUserId(cur);
    return cur;
  }
  await tryRehydrateStanzaRoomByChannelId(guild, id);
  const meta = stanzaChannelMeta.get(id);
  if (meta && String(meta.guildId) === String(guild.id)) {
    sanitizeStanzaMetaViceUserId(meta);
    return meta;
  }
  return null;
}

function getStanzaPanelViewKind(msg?) {
  for (const row of msg.components || []) {
    for (const comp of row.components || []) {
      const id = String(comp.customId || "");
      if (
        id.startsWith("stanza_users_include:") ||
        id.startsWith("stanza_users_exclude:") ||
        id.startsWith("stanza_users_silenzia:") ||
        id.startsWith("stanza_users_smuta:") ||
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

async function refreshStanzaPanelEmbedsIfPossible(guild?, voiceChannelId?) {
  const vid = String(voiceChannelId || "");
  const meta = await getStanzaMetaOrRehydrate(guild, vid);
  const panelId = stanzaPanelTargetChannelId(meta);
  if (!meta?.panelMessageId || !panelId) return;
  const panelCh =
    guild.channels.cache.get(panelId) || (await guild.channels.fetch(panelId).catch(() => null));
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
        ? buildStanzaUsersManageRows(voiceCh, meta)
        : buildStanzaHomeRows(vid);
  await msg.edit({ embeds, components }).catch(() => {});
}

export = { stanzaOwnerToChannel, channelIdIsLinkedCustomRolePrivateVoc, clearStanzaEmptyTeardownTimer, scheduleStanzaEmptyTeardown, markStanzaBotRename, stanzaPanelTargetChannelId, isStanzaUserSilenced, syncStanzaCompanionTextName, buildStanzaHomePanelEmbed, buildStanzaManageSettingsEmbed, buildStanzaHomeRows, buildStanzaManageRows, buildStanzaUsersManageEmbed, buildStanzaUsersManageRows, postStanzaPanel, teardownStanza, parseStanzaButtonId, buildStanzaPermissionsListEmbed, fetchOwnerMember, fetchStanzaVoiceChannel, readStanzaSnapshotRaw, readStanzaSnapshotRoomsRaw, tryRehydrateStanzaRoomFromSnapshotRecord, tryRehydrateStanzaRoomByChannelId, getStanzaMetaOrRehydrate, refreshStanzaPanelEmbedsIfPossible };
