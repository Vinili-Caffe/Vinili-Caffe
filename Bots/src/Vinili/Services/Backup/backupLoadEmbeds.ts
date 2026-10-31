/** Caricamento backup: messaggi e pulsanti (avviso, controllo, fatto, errore). */
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { LOAD_ACTIONS, DEFAULT_MESSAGES_LIMIT, sanitizeActions, normalizeMessagesLimit, formatMessagesLimit } = require("./backupLoadSessions") as typeof import("./backupLoadSessions");

const MESSAGE_LIMIT_PRESETS = [{ label: "100 messages", value: "100", description: "Ripristina max 100 messaggi", emoji: "<:VC_Chat:1482532573002465413>", }, { label: "500 messages", value: "500", description: "Ripristina max 500 messaggi", emoji: "<:VC_Chat:1482532573002465413>", }, { label: "1,000 messages", value: "1000", description: "Ripristina max 1000 messaggi", emoji: "<:VC_Chat:1482532573002465413>", }, { label: "5,000 messages", value: "5000", description: "Ripristina max 5000 messaggi", emoji: "<:VC_Chat:1482532573002465413>", }, { label: "10,000 messages", value: "10000", description: "Ripristina max 10000 messaggi", emoji: "<:VC_Chat:1482532573002465413>", }, { label: "All available", value: "ALL", description: "Ripristina tutti i messaggi nel backup", emoji: "<a:VC_Announce:1482534613568979007>", },];

function buildLoadWarningEmbed(backupId?, messagesLimit = DEFAULT_MESSAGES_LIMIT) {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("<a:VC_Alert:1482706673176150077> Warning")
    .setDescription(
      [
        "<:VC_update:1478721333096349817> What do you want the bot to load from the backup?",
        "",
        "<:VC_InactiveStatus:1482526984234860574> Select below what actions should be performed.",
        "<:VC_update:1478721333096349817> In the next step the restore starts immediately.",
        "",
        `<:VC_Chat:1482532573002465413> Messages limit: \`${formatMessagesLimit(messagesLimit)}\``,
        "",
        `<:VC_id:1478517313618575419> Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadInProgressEmbed(backupId?, checkpointId = null) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Info")
    .setDescription(
      [
        "<:VC_update:1478721333096349817> **The backup will start loading now.** Please be patient, this can take a while!",
        "",
        "<:VC_update:1478721333096349817> Usa **+backup** → menu **Stato caricamento** / **Annulla caricamento** per stato e stop.",
        "",
        "<:VC_update:1478721333096349817> *This message might not be updated.*",
        "",
        checkpointId ? `Checkpoint ID: \`${String(checkpointId || "").toUpperCase()}\`` : null,
        `Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadStartComponents(sessionId?) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`backup_load_status:${sessionId}`)
        .setLabel("View Status")
        .setStyle(ButtonStyle.Primary),
    ),
  ];
}

function countBackupMessages(payload?) {
  const channels = payload?.messages?.channels || {};
  const threads = payload?.messages?.threads || {};
  const chCount = Object.values(channels).reduce((sum?, list?) => sum + (Array.isArray(list) ? list.length : 0), 0,);
  const thCount = Object.values(threads).reduce((sum?, list?) => sum + (Array.isArray(list) ? list.length : 0), 0,);
  return chCount + thCount;
}

function countBackupPinnedMessages(payload?) {
  const channels = payload?.messages?.channels || {};
  const threads = payload?.messages?.threads || {};
  const allLists = [...Object.values(channels), ...Object.values(threads)];
  let total = 0;
  for (const list of allLists) {
    if (!Array.isArray(list)) continue;
    total += list.filter((m?) => Boolean(m?.pinned)).length;
  }
  return total;
}

function buildPreflightWarningEmbed({
  guild,
  payload,
  actions,
  backupId,
  messagesLimit = DEFAULT_MESSAGES_LIMIT,
}) {
  const safeActions = sanitizeActions(actions);
  const lines = [];
  const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : []).filter((r?) => String(r?.name || "").trim() !== "@everyone",);
  const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
  const backupThreads = Array.isArray(payload?.threads) ? payload.threads : [];
  const backupMembers = Array.isArray(payload?.members) ? payload.members : [];
  const backupBans = Array.isArray(payload?.bans) ? payload.bans : [];
  const backupEmojis = Array.isArray(payload?.emojis) ? payload.emojis : [];
  const backupStickers = Array.isArray(payload?.stickers) ? payload.stickers : [];
  const backupWebhooks = Array.isArray(payload?.webhooks) ? payload.webhooks : [];
  const backupInvites = Array.isArray(payload?.invites) ? payload.invites : [];
  const backupEvents = Array.isArray(payload?.scheduledEvents) ? payload.scheduledEvents : [];
  const backupAutomodRules = Array.isArray(payload?.autoModerationRules) ? payload.autoModerationRules : [];
  const totalMessages = countBackupMessages(payload);
  const effectiveLimit = normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT);
  const loadableMessages = effectiveLimit == null ? totalMessages : Math.min(totalMessages, effectiveLimit);
  const pinnedMessages = countBackupPinnedMessages(payload);

  if (safeActions.has("load_roles")) {
    lines.push(`<:VC_Mention:1482526855289634997> **${backupRoles.length}** roles will be created`);
  }
  if (safeActions.has("delete_roles")) {
    const rolesToDelete = [...guild.roles.cache.values()].filter((r?) => r.editable && !r.managed && r.id !== guild.id,).length;
    lines.push(`<:VC_purge:1478861828271636561> **${rolesToDelete}** roles will be deleted`);
  }
  if (safeActions.has("load_channels")) {
    lines.push(`<:channeltext:1443247596922470551> **${backupChannels.length}** channels will be created`);
  }
  if (safeActions.has("delete_channels")) {
    lines.push(`<:VC_purge:1478861828271636561> **${guild.channels.cache.size}** channels will be deleted`);
  }
  if (safeActions.has("load_settings")) {
    lines.push("<:VC_tools:1478862265305272364> Server settings will be updated");
  }
  if (safeActions.has("load_threads")) {
    lines.push(`<:VC_threads:1478515497569095760> **${backupThreads.length}** threads will be created`);
  }
  if (safeActions.has("load_member_info")) {
    lines.push(`<:member_role_icon:1330530086792728618> **${backupMembers.length}** members will be updated`);
  }
  if (safeActions.has("load_bans")) {
    lines.push(`<:VC_BanHammer:1482534474502897795> **${backupBans.length}** bans will be loaded`);
  }
  if (safeActions.has("load_messages")) {
    lines.push(`<:VC_Chat:1482532573002465413> **${loadableMessages}** messages will be loaded (limit: \`${formatMessagesLimit(effectiveLimit)}\`)`);
  }
  if (safeActions.has("load_pinned_messages")) {
    lines.push(`<:VC_BlackPin:1482534513400610948> **${pinnedMessages}** pinned messages will be loaded`);
  }
  if (safeActions.has("load_emojis")) {
    lines.push(`<:VC_Reply:1482532158080942191> **${backupEmojis.length}** emojis will be loaded`);
  }
  if (safeActions.has("load_stickers")) {
    lines.push(`<:VC_Ticket:1482535175283019888> **${backupStickers.length}** stickers will be loaded`);
  }
  if (safeActions.has("load_webhooks")) {
    lines.push(`<:VC_webhooks:1478515450769047704> **${backupWebhooks.length}** webhooks will be loaded`);
  }
  if (safeActions.has("load_invites")) {
    lines.push(`<:link:1470064815899803668> **${backupInvites.length}** invites will be loaded`);
  }
  if (safeActions.has("load_events")) {
    lines.push(`<:a:VC_Calendar:1448670320180592724> **${backupEvents.length}** scheduled events will be loaded`);
  }
  if (safeActions.has("load_automod_rules")) {
    lines.push(`<:VC_AutoMod:1478861194759508039> **${backupAutomodRules.length}** AutoMod rules will be loaded`);
  }

  if (!lines.length) lines.push("<a:VC_Alert:1482706673176150077> No action selected");

  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("<a:VC_Alert:1482706673176150077> Warning")
    .setDescription(
      [
        "<:VC_update:1478721333096349817> **Hey, be careful!** The following actions will be taken on this server and **can not be undone**:",
        "",
        ...lines,
        "",
        `<:VC_id:1478517313618575419> Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildPreflightButtons(sessionId?) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_load_confirm:${sessionId}`)
      .setEmoji(`<:success:1461731530333229226>`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_load_cancel:${sessionId}`)
      .setEmoji(`<:cancel:1461730653677551691>`)
      .setStyle(ButtonStyle.Danger),
  );
}

function buildLoadDoneEmbed(backupId?, stats?) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("<:VC_update:1478721333096349817> Backup loaded")
    .setDescription(
      [
        `<:VC_update:1478721333096349817> Ripristino completato per \`${String(backupId || "").toUpperCase()}\`.`,
        "",
        `<:VC_purge:1478861828271636561> Ruoli eliminati: **${stats.deletedRoles}**`,
        `<:channeltext:1443247596922470551> Canali eliminati: **${stats.deletedChannels}**`,
        `<:VC_Mention:1482526855289634997> Ruoli creati: **${stats.createdRoles}**`,
        `<:channeltext:1443247596922470551> Canali creati: **${stats.createdChannels}**`,
        `<:VC_threads:1478515497569095760> Thread creati: **${stats.createdThreads}**`,
        `<:member_role_icon:1330530086792728618> Member aggiornati: **${stats.updatedMembers}**`,
        `<:VC_BanHammer:1482534474502897795> Ban applicati: **${stats.loadedBans}**`,
        `<:VC_Chat:1482532573002465413> Messaggi inviati: **${stats.loadedMessages}**`,
        `<:VC_BlackPin:1482534513400610948> Messaggi pinnati: **${stats.loadedPinnedMessages}**`,
        `<:VC_Reply:1482532158080942191> Emoji create: **${stats.loadedEmojis}**`,
        `<:VC_Ticket:1482535175283019888> Sticker creati: **${stats.loadedStickers}**`,
        `<:VC_webhooks:1478515450769047704> Webhook creati: **${stats.loadedWebhooks}**`,
        `<:link:1470064815899803668> Inviti creati: **${stats.loadedInvites}**`,
        `<:a:VC_Calendar:1448670320180592724> Eventi creati: **${stats.loadedEvents}**`,
        `<:VC_AutoMod:1478861194759508039> Regole AutoMod create: **${stats.loadedAutomodRules}**`,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadErrorEmbed(error?) {
  const detail = String(error?.message || error || "<a:VC_Alert:1482706673176150077> Errore sconosciuto").slice(0, 700);
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle("<a:VC_Alert:1482706673176150077> Backup load failed")
    .setDescription(`<a:VC_Alert:1482706673176150077> ${detail}`);
}

function buildLoadCancelledEmbed(backupId?) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_InactiveStatus:1482526984234860574> Info")
    .setDescription(
      [
        "<:VC_update:1478721333096349817> The loading process has been **cancelled**.",
        "",
        "<:VC_update:1478721333096349817> Riprova da **+backup** → **Carica backup**.",
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadComponents(
  sessionId?,
  selectedActions?,
  messagesLimit = DEFAULT_MESSAGES_LIMIT,
) {
  const selected = sanitizeActions(selectedActions);
  const limitValue = formatMessagesLimit(normalizeMessagesLimit(messagesLimit));
  const options = LOAD_ACTIONS.map((action?) => ({ label: action.label, description: action.description, value: action.key, emoji: action.emoji, default: selected.has(action.key), }));

  const selectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`backup_load_actions:${sessionId}`)
    .setPlaceholder("<:VC_InactiveStatus:1482526984234860574> Select load actions")
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options),
  );

  const buttonRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`backup_load_continue:${sessionId}`)
    .setEmoji(`<:success:1461731530333229226>`)
    .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_load_cancel:${sessionId}`)
      .setEmoji(`<:cancel:1461730653677551691>`)
      .setStyle(ButtonStyle.Danger),
  );

  const limitRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`backup_load_messages_limit:${sessionId}`)
    .setPlaceholder("<:VC_InactiveStatus:1482526984234860574> Select messages limit")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      MESSAGE_LIMIT_PRESETS.map((item?) => ({
        label: item.label,
        value: item.value,
        description: item.description,
        emoji: item.emoji,
        default: String(item.value).toUpperCase() === String(limitValue).toUpperCase(),
      })),
    ),
  );

  return [selectRow, limitRow, buttonRow];
}

function buildDryRunEmbed(result?) {
  const actionLines = Array.isArray(result?.actions) ? result.actions.map((a?) => String(a || "").trim()).filter(Boolean).map((a?) => `• \`${a}\``) : [];
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_update:1478721333096349817> Backup Dry Run")
    .setDescription(
      [
        `<:VC_id:1478517313618575419> Backup ID: \`${String(result?.backupId || "")}\``,
        `Source Guild: \`${String(result?.sourceGuildId || "unknown")}\``,
        "",
        "<:VC_update:1478721333096349817> **Planned Actions**",
        actionLines.join("\n") || "• none",
        "",
        "<:VC_update:1478721333096349817> **Estimated Changes**",
        `<:VC_Mention:1482526855289634997> Roles to create: **${Number(result?.expected?.createRoles || 0)}**`,
        `<:channeltext:1443247596922470551> Channels to create: **${Number(result?.expected?.createChannels || 0)}**`,
        `<:VC_threads:1478515497569095760> Threads to create: **${Number(result?.expected?.createThreads || 0)}**`,
        `<:member_role_icon:1330530086792728618> Members to update: **${Number(result?.expected?.updateMembers || 0)}**`,
          `<:VC_Chat:1482532573002465413> Messages to load: **${Number(result?.expected?.loadMessages || 0)}**`,
        `<:VC_update:1478721333096349817> Messages limit: \`${formatMessagesLimit(result?.expected?.messagesLimit)}\``,
        `<:VC_BlackPin:1482534513400610948> Pinned to load: **${Number(result?.expected?.loadPinnedMessages || 0)}**`,
        "",
        "<:VC_update:1478721333096349817> **Permission Diff**",
        `<:VC_update:1478721333096349817> Missing roles: **${Number(result?.permissions?.roleMissing || 0)}**`,
        `<:VC_update:1478721333096349817> Role permission mismatches: **${Number(result?.permissions?.rolePermissionMismatches || 0)}**`,
        `<:VC_update:1478721333096349817> Missing channels: **${Number(result?.permissions?.channelMissing || 0)}**`,
        `<:VC_update:1478721333096349817> Channel overwrite mismatches: **${Number(result?.permissions?.channelOverwriteMismatches || 0)}**`,
        "",
        "<:VC_update:1478721333096349817> **Safety Checks**",
        `<:VC_update:1478721333096349817> Deletable roles check: **${result?.canDeleteRoles ? "OK" : "BLOCKED"}**`,
        `<:VC_update:1478721333096349817> Deletable channels check: **${result?.canDeleteChannels ? "OK" : "BLOCKED"}**`,
      ].filter(Boolean).join("\n"),
    );
}

export = { buildLoadWarningEmbed, buildLoadInProgressEmbed, buildLoadStartComponents, countBackupMessages, countBackupPinnedMessages, buildPreflightWarningEmbed, buildPreflightButtons, buildLoadDoneEmbed, buildLoadErrorEmbed, buildLoadCancelledEmbed, buildLoadComponents, buildDryRunEmbed };
