/** Caricamento backup: messaggi e pulsanti (avviso, controllo, fatto, errore). */
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { LOAD_ACTIONS, DEFAULT_MESSAGES_LIMIT, sanitizeActions, normalizeMessagesLimit, formatMessagesLimit } = require("./backupLoadSessions") as typeof import("./backupLoadSessions");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MESSAGE_LIMIT_PRESETS = [{ label: "100 messages", value: "100", description: "Ripristina max 100 messaggi", emoji: E.VC_Chat, }, { label: "500 messages", value: "500", description: "Ripristina max 500 messaggi", emoji: E.VC_Chat, }, { label: "1,000 messages", value: "1000", description: "Ripristina max 1000 messaggi", emoji: E.VC_Chat, }, { label: "5,000 messages", value: "5000", description: "Ripristina max 5000 messaggi", emoji: E.VC_Chat, }, { label: "10,000 messages", value: "10000", description: "Ripristina max 10000 messaggi", emoji: E.VC_Chat, }, { label: "All available", value: "ALL", description: "Ripristina tutti i messaggi nel backup", emoji: E.VC_Announce, },];

function buildLoadWarningEmbed(backupId?, messagesLimit = DEFAULT_MESSAGES_LIMIT) {
  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle(`${E.VC_Alert} Warning`)
    .setDescription(
      [
        `${E.VC_update} What do you want the bot to load from the backup?`,
        "",
        `${E.VC_InactiveStatus} Select below what actions should be performed.`,
        `${E.VC_update} In the next step the restore starts immediately.`,
        "",
        `${E.VC_Chat} Messages limit: \`${formatMessagesLimit(messagesLimit)}\``,
        "",
        `${E.VC_id} Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadInProgressEmbed(backupId?, checkpointId = null) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("Info")
    .setDescription(
      [
        `${E.VC_update} **The backup will start loading now.** Please be patient, this can take a while!`,
        "",
        `${E.VC_update} Usa **+backup** → menu **Stato caricamento** / **Annulla caricamento** per stato e stop.`,
        "",
        `${E.VC_update} *This message might not be updated.*`,
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
    lines.push(`${E.VC_Mention} **${backupRoles.length}** roles will be created`);
  }
  if (safeActions.has("delete_roles")) {
    const rolesToDelete = [...guild.roles.cache.values()].filter((r?) => r.editable && !r.managed && r.id !== guild.id,).length;
    lines.push(`${E.VC_purge} **${rolesToDelete}** roles will be deleted`);
  }
  if (safeActions.has("load_channels")) {
    lines.push(`${E.channeltext} **${backupChannels.length}** channels will be created`);
  }
  if (safeActions.has("delete_channels")) {
    lines.push(`${E.VC_purge} **${guild.channels.cache.size}** channels will be deleted`);
  }
  if (safeActions.has("load_settings")) {
    lines.push(`${E.VC_tools} Server settings will be updated`);
  }
  if (safeActions.has("load_threads")) {
    lines.push(`${E.VC_threads} **${backupThreads.length}** threads will be created`);
  }
  if (safeActions.has("load_member_info")) {
    lines.push(`${E.member_role_icon} **${backupMembers.length}** members will be updated`);
  }
  if (safeActions.has("load_bans")) {
    lines.push(`${E.VC_BanHammer} **${backupBans.length}** bans will be loaded`);
  }
  if (safeActions.has("load_messages")) {
    lines.push(`${E.VC_Chat} **${loadableMessages}** messages will be loaded (limit: \`${formatMessagesLimit(effectiveLimit)}\`)`);
  }
  if (safeActions.has("load_pinned_messages")) {
    lines.push(`${E.VC_BlackPin} **${pinnedMessages}** pinned messages will be loaded`);
  }
  if (safeActions.has("load_emojis")) {
    lines.push(`${E.VC_Reply} **${backupEmojis.length}** emojis will be loaded`);
  }
  if (safeActions.has("load_stickers")) {
    lines.push(`${E.VC_Ticket} **${backupStickers.length}** stickers will be loaded`);
  }
  if (safeActions.has("load_webhooks")) {
    lines.push(`${E.VC_webhooks} **${backupWebhooks.length}** webhooks will be loaded`);
  }
  if (safeActions.has("load_invites")) {
    lines.push(`${E.link} **${backupInvites.length}** invites will be loaded`);
  }
  if (safeActions.has("load_events")) {
    lines.push(`<:a:VC_Calendar:1448670320180592724> **${backupEvents.length}** scheduled events will be loaded`);
  }
  if (safeActions.has("load_automod_rules")) {
    lines.push(`${E.VC_AutoMod} **${backupAutomodRules.length}** AutoMod rules will be loaded`);
  }

  if (!lines.length) lines.push(`${E.VC_Alert} No action selected`);

  return new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle(`${E.VC_Alert} Warning`)
    .setDescription(
      [
        `${E.VC_update} **Hey, be careful!** The following actions will be taken on this server and **can not be undone**:`,
        "",
        ...lines,
        "",
        `${E.VC_id} Backup ID: \`${String(backupId || "").toUpperCase()}\``,
      ].filter(Boolean).join("\n"),
    );
}

function buildPreflightButtons(sessionId?) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`backup_load_confirm:${sessionId}`)
      .setEmoji(E.success)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_load_cancel:${sessionId}`)
      .setEmoji(E.cancel)
      .setStyle(ButtonStyle.Danger),
  );
}

function buildLoadDoneEmbed(backupId?, stats?) {
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle(`${E.VC_update} Backup loaded`)
    .setDescription(
      [
        `${E.VC_update} Ripristino completato per \`${String(backupId || "").toUpperCase()}\`.`,
        "",
        `${E.VC_purge} Ruoli eliminati: **${stats.deletedRoles}**`,
        `${E.channeltext} Canali eliminati: **${stats.deletedChannels}**`,
        `${E.VC_Mention} Ruoli creati: **${stats.createdRoles}**`,
        `${E.channeltext} Canali creati: **${stats.createdChannels}**`,
        `${E.VC_threads} Thread creati: **${stats.createdThreads}**`,
        `${E.member_role_icon} Member aggiornati: **${stats.updatedMembers}**`,
        `${E.VC_BanHammer} Ban applicati: **${stats.loadedBans}**`,
        `${E.VC_Chat} Messaggi inviati: **${stats.loadedMessages}**`,
        `${E.VC_BlackPin} Messaggi pinnati: **${stats.loadedPinnedMessages}**`,
        `${E.VC_Reply} Emoji create: **${stats.loadedEmojis}**`,
        `${E.VC_Ticket} Sticker creati: **${stats.loadedStickers}**`,
        `${E.VC_webhooks} Webhook creati: **${stats.loadedWebhooks}**`,
        `${E.link} Inviti creati: **${stats.loadedInvites}**`,
        `<:a:VC_Calendar:1448670320180592724> Eventi creati: **${stats.loadedEvents}**`,
        `${E.VC_AutoMod} Regole AutoMod create: **${stats.loadedAutomodRules}**`,
      ].filter(Boolean).join("\n"),
    );
}

function buildLoadErrorEmbed(error?) {
  const detail = String(error?.message || error || `${E.VC_Alert} Errore sconosciuto`).slice(0, 700);
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle(`${E.VC_Alert} Backup load failed`)
    .setDescription(`${E.VC_Alert} ${detail}`);
}

function buildLoadCancelledEmbed(backupId?) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(`${E.VC_InactiveStatus} Info`)
    .setDescription(
      [
        `${E.VC_update} The loading process has been **cancelled**.`,
        "",
        `${E.VC_update} Riprova da **+backup** → **Carica backup**.`,
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
    .setPlaceholder(`${E.VC_InactiveStatus} Select load actions`)
    .setMinValues(1)
    .setMaxValues(options.length)
    .addOptions(options),
  );

  const buttonRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`backup_load_continue:${sessionId}`)
    .setEmoji(E.success)
    .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`backup_load_cancel:${sessionId}`)
      .setEmoji(E.cancel)
      .setStyle(ButtonStyle.Danger),
  );

  const limitRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`backup_load_messages_limit:${sessionId}`)
    .setPlaceholder(`${E.VC_InactiveStatus} Select messages limit`)
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

export = { buildLoadWarningEmbed, buildLoadInProgressEmbed, buildLoadStartComponents, buildPreflightWarningEmbed, buildPreflightButtons, buildLoadDoneEmbed, buildLoadErrorEmbed, buildLoadCancelledEmbed, buildLoadComponents };
