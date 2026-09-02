const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime");
const { getGuildChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const {
  refreshPartnershipConfigCache,
  isPartnershipSetupComplete,
  setPartnershipChannel,
  setPartnershipLogsChannel,
  setPmCommandsChannel,
  setPmCommandsCategories,
  setPartnerManagerRole,
  setPartnershipPings,
  setPartnershipSkipManager,
  setManagerBadgeRole,
  setManagerLeaveAction,
  setThankYouEmbed,
  setManualPartnershipEnabled,
  setPartnerDescChannel,
  setPartnerDescStatic,
  clearPartnerDesc,
} = require("../MultiGuild/core/tenantPartnershipSettings");
const { parsePingDelayInput, DEFAULT_CUSTOM_ROLE_PING_DELAY_MS, parsePingMemberThresholdInput } = require("../Utils/Partner/partnershipPingUtils");
const { ensurePartnershipChannelInvite } = require("../Services/Partner/partnershipInviteService");
const {
  PREFIX,
  MODAL_PREFIX,
  PROMPT_TTL_MS,
  parseCustomId,
  buildViewPayload,
  buildPingModal,
  buildThankYouEmbedModalPage1,
  buildThankYouEmbedModalPage2,
  buildPartnerDescModal,
} = require("../Utils/Partner/partnershipSettingsComponents");
const { seedDefaultThankYouEmbedIfEmpty } = require("../Utils/Partner/partnershipThankYouEmbed");
const { syncTenantPartnerDescription } = require("../Services/Partner/tenantPartnerDescriptionService");
const { memberCanManageTenantPartnershipSettings } = require("../Utils/Partner/tenantPartnershipAdminAccess");
const { t, resolveTenantLanguage } = require("../Utils/Partner/tenantPartnershipI18n");
const { resolveTenantLanguageForInteraction, tenantI18nNoticePayload } = require("../Utils/Partner/tenantPartnershipPrefixMessages");
const { buildSimpleNoticePayload } = require("../Utils/Embeds/simpleNoticeEmbed");
const { resolvePartnershipConfigSync } = require("../Utils/Partner/partnershipConfigResolver");
const { replyInteractionSetupRequired } = require("../Utils/Partner/tenantSetupRequiredReply");
const { setTenantObjectiveFlag } = require("../Services/Partner/tenantObjectiveService");
const {
  parseEmbedColorInput,
  parseEmbedTimestampInput,
  normalizeOptionalUrl,
  buildThankYouVariablesHelpPayload,
} = require("../Utils/Partner/partnershipEmbedTemplate");
const { createPromptMessageCollector } = require("../../shared/discord/promptMessageCollectorRuntime");

const PRIVATE_FLAG = 1 << 6;

function ephemeralNotice(lang, key, guild, vars = {}) {
  return {
    ...tenantI18nNoticePayload(lang, key, guild, vars, { ephemeral: true }),
    flags: PRIVATE_FLAG,
  };
}

function textEphemeralNotice(text, guild) {
  return {
    ...buildSimpleNoticePayload(text, guild, { ephemeral: true }),
    flags: PRIVATE_FLAG,
  };
}

const ACTIVE_COLLECTORS = new Map();

const SETTINGS_MODAL_SELECT_ACTIONS = new Set([
  "open_ping_modal",
  "custom_embed_edit_p1",
  "custom_embed_edit_p2",
  "desc_static_modal",
]);

async function acknowledgeSettingsSelectEarly(interaction) {
  if (!interaction.isStringSelectMenu?.()) return;
  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== PREFIX || !String(parsed.action || "").startsWith("select:")) return;
  const selectedAction = String(interaction.values?.[0] || "").trim();
  if (!selectedAction || SETTINGS_MODAL_SELECT_ACTIONS.has(selectedAction)) return;
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
}

function stopCollector(key) {
  const existing = ACTIVE_COLLECTORS.get(key);
  if (existing) {
    existing.stop();
    ACTIVE_COLLECTORS.delete(key);
  }
}

function botCanUseChannel(guild, channel) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) && perms?.has(PermissionFlagsBits.SendMessages),
  );
}

function botCanReadChannel(guild, channel) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms?.has(PermissionFlagsBits.ReadMessageHistory),
  );
}

function botCanCreateInviteInChannel(guild, channel) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  return Boolean(channel.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite));
}

async function resolveChannelFromMessage(message) {
  const guild = message.guild;
  if (!guild) return { channel: null, error: "guild_missing" };
  const raw = String(message.content || "").trim();
  if (!raw) return { channel: null, error: "missing_input" };
  if (/^(annulla|cancel)$/i.test(raw)) return { channel: null, cancel: true };

  const mention = message.mentions?.channels?.first?.();
  if (mention?.isTextBased?.()) return { channel: mention };

  const mentionMatch = raw.match(/^<#(\d{16,20})>$/);
  const channelId = mentionMatch ? mentionMatch[1] : /^\d{16,20}$/.test(raw) ? raw : null;
  if (channelId) {
    const channel =
      guild.channels.cache.get(channelId) ||
      (await getGuildChannelCached(guild, channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return { channel: null, error: "invalid_channel" };
    return { channel };
  }
  return { channel: null, error: "invalid_channel" };
}

function resolveRoleFromMessage(message) {
  const guild = message.guild;
  if (!guild) return { role: null, error: "guild_missing" };
  const raw = String(message.content || "").trim();
  if (!raw) return { role: null, error: "missing_input" };
  if (/^(annulla|cancel)$/i.test(raw)) return { role: null, cancel: true };

  const mention = message.mentions?.roles?.first?.();
  if (mention) return { role: mention };

  const mentionMatch = raw.match(/^<@&(\d{16,20})>$/);
  const roleId = mentionMatch ? mentionMatch[1] : /^\d{16,20}$/.test(raw) ? raw : null;
  if (roleId) {
    const role = guild.roles.cache.get(roleId);
    if (!role) return { role: null, error: "invalid_role" };
    return { role };
  }
  return { role: null, error: "invalid_role" };
}

async function resolveCategoriesFromMessage(message) {
  const guild = message.guild;
  if (!guild) return { categoryIds: [], error: "guild_missing" };
  const raw = String(message.content || "").trim();
  if (!raw) return { categoryIds: [], error: "missing_input" };
  if (/^(annulla|cancel)$/i.test(raw)) return { categoryIds: [], cancel: true };

  const ids = [];
  const seen = new Set();
  for (const match of raw.matchAll(/\d{16,20}/g)) {
    const id = match[0];
    if (seen.has(id)) continue;
    seen.add(id);
    let channel = guild.channels.cache.get(id);
    if (!channel) {
      channel = await getGuildChannelCached(guild, id).catch(() => null);
    }
    if (!channel || channel.type !== ChannelType.GuildCategory) continue;
    ids.push(id);
  }
  return { categoryIds: ids };
}

function parseOptionalInt(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function match(interaction) {
  const customId = String(interaction?.customId || "");
  return customId.startsWith(`${PREFIX}:`) || customId.startsWith(`${MODAL_PREFIX}:`);
}

async function applyPanelPayload(interaction, payload) {
  await safePanelMessageUpdate(interaction, payload);
}

async function showSettingsModal(interaction, ownerId, view, buildModal, lang) {
  if (interaction.deferred || interaction.replied) return;
  await refreshPartnershipConfigCache().catch(() => null);
  if (buildModal === buildThankYouEmbedModalPage1 || buildModal === buildThankYouEmbedModalPage2) {
    await seedDefaultThankYouEmbedIfEmpty(interaction.guild.id).catch(() => null);
    await refreshPartnershipConfigCache().catch(() => null);
  }
  const config = resolvePartnershipConfigSync(interaction.guild.id);
  await interaction.showModal(buildModal(ownerId, config, lang)).catch(() => {});
      const payload = buildViewPayload(interaction.guild, ownerId, view, config, lang);
  await interaction.message?.edit?.(payload).catch(() => {});
}

async function refreshPanel(interaction, view, lang) {
  await refreshPartnershipConfigCache().catch(() => null);
  const config = resolvePartnershipConfigSync(interaction.guild.id);
  const parsed = parseCustomId(interaction.customId);
  const ownerId = parsed?.ownerId || interaction.user.id;
  const payload = buildViewPayload(interaction.guild, ownerId, view, config, lang);
  await safePanelMessageUpdate(interaction, payload);
  return config;
}

async function acknowledgeSelectIfNeeded(interaction) {
  if (interaction.isStringSelectMenu?.() && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
}

async function replyPrivate(interaction, content) {
  const payload = textEphemeralNotice(content, interaction.guild);
  if (interaction.isStringSelectMenu?.()) {
    await acknowledgeSelectIfNeeded(interaction);
    await interaction.followUp(payload).catch(() => {});
    return;
  }
  await interaction.reply(payload).catch(() => {});
}

async function replyPrivateEmbeds(interaction, payload) {
  const body = payload && typeof payload === "object" ? payload : { embeds: payload };
  const replyPayload = { ...body, flags: PRIVATE_FLAG };
  if (interaction.isStringSelectMenu?.()) {
    await acknowledgeSelectIfNeeded(interaction);
    await interaction.followUp(replyPayload).catch(() => {});
    return;
  }
  await interaction.reply(replyPayload).catch(() => {});
}

async function sendCollectorPrompt(interaction, content) {
  const payload = textEphemeralNotice(content, interaction.guild);
  if (interaction.isStringSelectMenu?.()) {
    await acknowledgeSelectIfNeeded(interaction);
    return interaction.followUp(payload).catch(() => null);
  }
  await interaction.reply(payload).catch(() => null);
  return null;
}

async function editCollectorPrompt(interaction, promptMessage, content) {
  const payload = buildSimpleNoticePayload(content, interaction.guild);
  if (promptMessage?.edit) {
    await promptMessage.edit(payload).catch(() => {});
    return;
  }
  await interaction.editReply(payload).catch(() => {});
}

async function startChannelCollector(interaction, ownerId, field, lang) {
  const collectorKey = `${interaction.guild.id}:${ownerId}:settings:${field}`;
  stopCollector(collectorKey);

  const isPartner = field === "partner";
  const isDesc = field === "desc";
  const isPmCommands = field === "pm_commands";
  const prompt = isPartner
    ? t(lang, "settings_prompt_partnerChannel")
    : isDesc
      ? t(lang, "settings_prompt_descChannel")
      : isPmCommands
        ? t(lang, "settings_prompt_pmCommands")
        : t(lang, "settings_prompt_logsChannel");

  await acknowledgeSelectIfNeeded(interaction);
  const promptMessage = await sendCollectorPrompt(interaction, prompt);

  const collector = createPromptMessageCollector(interaction.channel, {
    userId: ownerId,
    time: PROMPT_TTL_MS,
    max: 1,
  });
  if (!collector) return;
  ACTIVE_COLLECTORS.set(collectorKey, collector);

  collector.on("collect", async (msg) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    const raw = String(msg.content || "").trim();
    await msg.delete().catch(() => {});

    if (/^annulla$/i.test(raw)) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_cancelled")).catch(() => {});
      return;
    }

    if (!isPartner && !isDesc && /^off$/i.test(raw)) {
      const result = isPmCommands
        ? await setPmCommandsChannel(interaction.guild.id, null)
        : await setPartnershipLogsChannel(interaction.guild.id, null);
      if (!result.ok) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
        return;
      }
      await refreshPanel(interaction, "channels", lang);
      await editCollectorPrompt(
        interaction,
        promptMessage,
        isPmCommands ? t(lang, "admin_pmCommandsRemoved") : t(lang, "admin_logsRemoved"),
      ).catch(() => {});
      return;
    }

    const resolved = await resolveChannelFromMessage(msg);
    if (resolved.cancel) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_cancelled")).catch(() => {});
      return;
    }
    if (!resolved.channel) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_invalidChannel")).catch(() => {});
      return;
    }
    if (!isDesc && !botCanUseChannel(interaction.guild, resolved.channel)) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_noSendPerms")).catch(() => {});
      return;
    }
    if (isDesc && !botCanReadChannel(interaction.guild, resolved.channel)) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_noReadPerms")).catch(() => {});
      return;
    }

    if (isPartner) {
      if (!botCanCreateInviteInChannel(interaction.guild, resolved.channel)) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_noInvitePerms")).catch(() => {});
        return;
      }
      const saved = await setPartnershipChannel(interaction.guild.id, resolved.channel.id);
      if (!saved.ok) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
        return;
      }
      const inviteResult = await ensurePartnershipChannelInvite(interaction.guild, resolved.channel.id);
      await refreshPanel(interaction, "channels", lang);
      const inviteNote = inviteResult.ok
        ? t(lang, "admin_partnerInviteCreated", { url: inviteResult.invite.url })
        : t(lang, "admin_partnerInviteFailed");
      await editCollectorPrompt(
        interaction,
        promptMessage,
        t(lang, "admin_partnerSet", { channel: resolved.channel, note: inviteNote }),
      ).catch(() => {});
      return;
    }

    if (isDesc) {
      const saved = await setPartnerDescChannel(interaction.guild.id, resolved.channel.id);
      if (!saved.ok) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
        return;
      }
      await syncTenantPartnerDescription(interaction.client, interaction.guild.id).catch(() => "");
      void setTenantObjectiveFlag(interaction.client, interaction.guild.id, interaction.user.id, "descSet", {
        discordLocale: interaction.locale,
      }).catch(() => null);
      await refreshPanel(interaction, "partner_desc", lang);
      await editCollectorPrompt(
        interaction,
        promptMessage,
        t(lang, "admin_descChannelSet", { channel: resolved.channel }),
      ).catch(() => {});
      return;
    }

    if (isPmCommands) {
      if (!botCanUseChannel(interaction.guild, resolved.channel)) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_noSendPerms")).catch(() => {});
        return;
      }
      const saved = await setPmCommandsChannel(interaction.guild.id, resolved.channel.id);
      if (!saved.ok) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
        return;
      }
      await refreshPanel(interaction, "channels", lang);
      await editCollectorPrompt(
        interaction,
        promptMessage,
        t(lang, "admin_pmCommandsSet", { channel: resolved.channel }),
      ).catch(() => {});
      return;
    }

    const result = await setPartnershipLogsChannel(interaction.guild.id, resolved.channel.id);
    if (!result.ok) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
      return;
    }
    await refreshPanel(interaction, "channels", lang);
    await editCollectorPrompt(
      interaction,
      promptMessage,
      t(lang, "admin_logsSet", { channel: resolved.channel }),
    ).catch(() => {});
  });

  collector.on("end", async (collected, reason) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_timeoutSelect")).catch(() => {});
    }
  });
}

async function startCategoryCollector(interaction, ownerId, lang) {
  const collectorKey = `${interaction.guild.id}:${ownerId}:settings:pm_categories`;
  stopCollector(collectorKey);

  await acknowledgeSelectIfNeeded(interaction);
  const promptMessage = await sendCollectorPrompt(interaction, t(lang, "settings_prompt_pmCategories"));

  const collector = createPromptMessageCollector(interaction.channel, {
    userId: ownerId,
    time: PROMPT_TTL_MS,
    max: 1,
  });
  if (!collector) return;
  ACTIVE_COLLECTORS.set(collectorKey, collector);

  collector.on("collect", async (msg) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    const raw = String(msg.content || "").trim();
    await msg.delete().catch(() => {});

    if (/^annulla$/i.test(raw)) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_cancelled")).catch(() => {});
      return;
    }

    if (/^off$/i.test(raw)) {
      const result = await setPmCommandsCategories(interaction.guild.id, null);
      if (!result.ok) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
        return;
      }
      await refreshPanel(interaction, "channels", lang);
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_pmCategoriesRemoved")).catch(() => {});
      return;
    }

    const resolved = await resolveCategoriesFromMessage(msg);
    if (resolved.cancel) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_cancelled")).catch(() => {});
      return;
    }
    if (!resolved.categoryIds.length) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_invalidCategory")).catch(() => {});
      return;
    }

    const result = await setPmCommandsCategories(interaction.guild.id, resolved.categoryIds);
    if (!result.ok) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
      return;
    }
    await refreshPanel(interaction, "channels", lang);
    await editCollectorPrompt(
      interaction,
      promptMessage,
      t(lang, "admin_pmCategoriesSet", { count: resolved.categoryIds.length }),
    ).catch(() => {});
  });

  collector.on("end", async (collected, reason) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_timeoutSelect")).catch(() => {});
    }
  });
}

async function startRoleCollector(interaction, ownerId, field, lang) {
  const collectorKey = `${interaction.guild.id}:${ownerId}:settings:role:${field}`;
  stopCollector(collectorKey);

  const prompt =
    field === "badge" ? t(lang, "settings_prompt_badgeRole") : t(lang, "settings_prompt_managerRole");

  await acknowledgeSelectIfNeeded(interaction);
  const promptMessage = await sendCollectorPrompt(interaction, prompt);

  const collector = createPromptMessageCollector(interaction.channel, {
    userId: ownerId,
    time: PROMPT_TTL_MS,
    max: 1,
  });
  if (!collector) return;
  ACTIVE_COLLECTORS.set(collectorKey, collector);

  collector.on("collect", async (msg) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    await msg.delete().catch(() => {});

    const raw = String(msg.content || "").trim();
    if (/^annulla$/i.test(raw)) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_cancelled")).catch(() => {});
      return;
    }

    if (field === "badge" && /^off$/i.test(raw)) {
      const result = await setManagerBadgeRole(interaction.guild.id, null);
      if (!result.ok) {
        await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_saveFailed")).catch(() => {});
        return;
      }
      await refreshPanel(interaction, "behaviors", lang);
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_badgeRoleRemoved")).catch(() => {});
      return;
    }

    const resolved = resolveRoleFromMessage(msg);
    if (resolved.cancel) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_cancelled")).catch(() => {});
      return;
    }
    if (!resolved.role) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_invalidRole")).catch(() => {});
      return;
    }
    if (resolved.role.managed) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_managedRole")).catch(() => {});
      return;
    }

    const saveFn = field === "badge" ? setManagerBadgeRole : setPartnerManagerRole;
    const result = await saveFn(interaction.guild.id, resolved.role.id);
    if (!result.ok) {
      const sameRoleMsg =
        result.reason === "same_as_manager_role" || result.reason === "same_as_badge_role"
          ? t(lang, "admin_sameManagerBadgeRole")
          : t(lang, "admin_saveFailed");
      await editCollectorPrompt(interaction, promptMessage, sameRoleMsg).catch(() => {});
      return;
    }
    const view = field === "badge" ? "behaviors" : "roles";
    await refreshPanel(interaction, view, lang);
    await editCollectorPrompt(
      interaction,
      promptMessage,
      field === "badge"
        ? t(lang, "admin_badgeRoleSet", { role: resolved.role })
        : t(lang, "admin_roleSet", { role: resolved.role }),
    ).catch(() => {});
  });

  collector.on("end", async (collected, reason) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_timeoutSelect")).catch(() => {});
    }
  });
}

async function rejectIfNotPartnershipAdmin(interaction, lang) {
  if (memberCanManageTenantPartnershipSettings(interaction.member, interaction.guild)) {
    return false;
  }
  await interaction
    .reply(ephemeralNotice(lang, "admin_denied", interaction.guild))
    .catch(() => null);
  return true;
}

async function rejectIfSetupIncomplete(interaction, lang) {
  await refreshPartnershipConfigCache().catch(() => null);
  const config = resolvePartnershipConfigSync(interaction.guild?.id);
  if (isPartnershipSetupComplete(config)) return false;
  await replyInteractionSetupRequired(interaction, { lang });
  return true;
}

async function processSettingsAction(interaction, ownerId, action, lang) {
  const guildId = interaction.guild.id;

  if (action === "open_channels") {
    const payload = buildViewPayload(interaction.guild, ownerId, "channels", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_roles") {
    const payload = buildViewPayload(interaction.guild, ownerId, "roles", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "toggle_skip") {
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    await setPartnershipSkipManager(guildId, !config?.skipManager);
    const payload = buildViewPayload(interaction.guild, ownerId, "home", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "back_home" || action === "behaviors_back") {
    const payload = buildViewPayload(interaction.guild, ownerId, "home", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_ping_modal") {
    await showSettingsModal(interaction, ownerId, "home", buildPingModal, lang);
    return true;
  }
  if (action === "open_custom_embed") {
    const payload = buildViewPayload(interaction.guild, ownerId, "custom_embed", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "custom_embed_edit_p1") {
    await showSettingsModal(interaction, ownerId, "custom_embed", buildThankYouEmbedModalPage1, lang);
    return true;
  }
  if (action === "custom_embed_edit_p2") {
    await showSettingsModal(interaction, ownerId, "custom_embed", buildThankYouEmbedModalPage2, lang);
    return true;
  }
  if (action === "custom_embed_vars") {
    const payload = await buildThankYouVariablesHelpPayload(interaction, lang);
    await replyPrivateEmbeds(interaction, payload);
    return true;
  }
  if (action === "custom_embed_toggle_manual") {
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    await setManualPartnershipEnabled(guildId, !config?.manualPartnershipEnabled);
    const payload = buildViewPayload(interaction.guild, ownerId, "custom_embed", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_partner_desc") {
    const payload = buildViewPayload(interaction.guild, ownerId, "partner_desc", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "desc_channel") {
    await startChannelCollector(interaction, ownerId, "desc", lang);
    return true;
  }
  if (action === "desc_static_modal") {
    await showSettingsModal(interaction, ownerId, "partner_desc", buildPartnerDescModal, lang);
    return true;
  }
  if (action === "desc_clear") {
    await clearPartnerDesc(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "partner_desc", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "open_behaviors") {
    const payload = buildViewPayload(interaction.guild, ownerId, "behaviors", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "behavior_create_role") {
    await startRoleCollector(interaction, ownerId, "badge", lang);
    return true;
  }
  if (action === "open_leave") {
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_back") {
    const payload = buildViewPayload(interaction.guild, ownerId, "behaviors", undefined, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_delete_5m") {
    await setManagerLeaveAction(guildId, "delete");
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_warn") {
    await setManagerLeaveAction(guildId, "warn");
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "leave_null") {
    await setManagerLeaveAction(guildId, null);
    await refreshPartnershipConfigCache().catch(() => null);
    const config = resolvePartnershipConfigSync(guildId);
    const payload = buildViewPayload(interaction.guild, ownerId, "leave", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }
  if (action === "ch_partner") {
    await startChannelCollector(interaction, ownerId, "partner", lang);
    return true;
  }
  if (action === "ch_logs") {
    await startChannelCollector(interaction, ownerId, "logs", lang);
    return true;
  }
  if (action === "ch_pm_commands") {
    await startChannelCollector(interaction, ownerId, "pm_commands", lang);
    return true;
  }
  if (action === "ch_pm_categories") {
    await startCategoryCollector(interaction, ownerId, lang);
    return true;
  }
  if (action === "role_manager") {
    await startRoleCollector(interaction, ownerId, "manager", lang);
    return true;
  }

  return false;
}

async function execute(interaction) {
  await acknowledgeSettingsSelectEarly(interaction);

  const lang = await resolveTenantLanguageForInteraction(interaction);
  if (await rejectIfNotPartnershipAdmin(interaction, lang)) return true;
  if (await rejectIfSetupIncomplete(interaction, lang)) return true;

  if (interaction.isModalSubmit?.()) {
    const parsed = parseCustomId(interaction.customId);
    if (!parsed || parsed.kind !== MODAL_PREFIX) return false;
    if (String(interaction.user?.id || "") !== parsed.ownerId) {
      await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
      return true;
    }

    if (parsed.action === "thank_you_p1") {
      const saved = await setThankYouEmbed(interaction.guild.id, {
        color: parseEmbedColorInput(interaction.fields.getTextInputValue("embed_color")),
        authorIconUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_author_icon")),
        authorName: String(interaction.fields.getTextInputValue("embed_author_name") || "").trim() || null,
        title: String(interaction.fields.getTextInputValue("embed_title") || "").trim() || null,
        thumbnailUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_thumbnail")),
      });
      if (!saved.ok) {
        await interaction
          .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
          .catch(() => {});
        return true;
      }
      await refreshPartnershipConfigCache().catch(() => null);
      void setTenantObjectiveFlag(interaction.client, interaction.guild.id, interaction.user.id, "thankYouSet", {
        discordLocale: interaction.locale,
      }).catch(() => null);
      await refreshPanel(interaction, "custom_embed", lang);
      await interaction
        .reply(ephemeralNotice(lang, "settings_embedP1Saved", interaction.guild))
        .catch(() => {});
      return true;
    }

    if (parsed.action === "thank_you_p2") {
      const description = String(interaction.fields.getTextInputValue("embed_description") || "").trim() || null;
      const saved = await setThankYouEmbed(interaction.guild.id, {
        description,
        imageUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_image")),
        footerText: String(interaction.fields.getTextInputValue("embed_footer") || "").trim() || null,
        footerIconUrl: normalizeOptionalUrl(interaction.fields.getTextInputValue("embed_footer_icon")),
        timestampEnabled: parseEmbedTimestampInput(interaction.fields.getTextInputValue("embed_timestamp")),
      });
      if (!saved.ok) {
        await interaction
          .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
          .catch(() => {});
        return true;
      }
      await refreshPartnershipConfigCache().catch(() => null);
      void setTenantObjectiveFlag(interaction.client, interaction.guild.id, interaction.user.id, "thankYouSet", {
        discordLocale: interaction.locale,
      }).catch(() => null);
      await refreshPanel(interaction, "custom_embed", lang);
      await interaction
        .reply(ephemeralNotice(lang, "settings_embedSaved", interaction.guild))
        .catch(() => {});
      return true;
    }

    if (parsed.action === "partner_desc_static") {
      const staticText = String(interaction.fields.getTextInputValue("partner_desc_text") || "").trim();
      if (!staticText) {
        await interaction
          .reply(ephemeralNotice(lang, "settings_descEmpty", interaction.guild))
          .catch(() => {});
        return true;
      }
      const saved = await setPartnerDescStatic(interaction.guild.id, staticText);
      if (!saved.ok) {
        const err =
          saved.reason === "too_long" ? t(lang, "settings_descTooLong") : t(lang, "admin_saveFailed");
        await interaction.reply(textEphemeralNotice(err, interaction.guild)).catch(() => {});
        return true;
      }
      await refreshPartnershipConfigCache().catch(() => null);
      void setTenantObjectiveFlag(interaction.client, interaction.guild.id, interaction.user.id, "descSet", {
        discordLocale: interaction.locale,
      }).catch(() => null);
      await refreshPanel(interaction, "partner_desc", lang);
      await interaction.reply(ephemeralNotice(lang, "settings_descSaved", interaction.guild)).catch(() => {});
      return true;
    }

    if (parsed.action !== "ping") return false;

    const hereMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("here_members"));
    const everyoneMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("everyone_members"));
    const customRoleRaw = String(interaction.fields.getTextInputValue("custom_role_id") || "").trim();
    const customRoleMembers = parseOptionalInt(interaction.fields.getTextInputValue("custom_role_members"));
    const delayRaw = String(interaction.fields.getTextInputValue("custom_role_delay") || "").trim();
    const customRoleDelayMs = delayRaw
      ? parsePingDelayInput(delayRaw)
      : DEFAULT_CUSTOM_ROLE_PING_DELAY_MS;

    if (
      Number.isNaN(hereMembers) ||
      Number.isNaN(everyoneMembers) ||
      Number.isNaN(customRoleMembers) ||
      Number.isNaN(customRoleDelayMs)
    ) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_invalidNumbers", interaction.guild))
        .catch(() => {});
      return true;
    }

    let customRoleId = null;
    if (customRoleRaw) {
      const mentionMatch = customRoleRaw.match(/^<@&(\d{16,20})>$/);
      customRoleId = mentionMatch
        ? mentionMatch[1]
        : /^\d{16,20}$/.test(customRoleRaw)
          ? customRoleRaw
          : null;
      if (!customRoleId || !interaction.guild.roles.cache.has(customRoleId)) {
        await interaction
          .reply(ephemeralNotice(lang, "admin_invalidCustomRole", interaction.guild))
          .catch(() => {});
        return true;
      }
    }

    if ((customRoleId && customRoleMembers === null) || (!customRoleId && customRoleMembers !== null)) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_customPingIncomplete", interaction.guild))
        .catch(() => {});
      return true;
    }

    const saved = await setPartnershipPings(interaction.guild.id, {
      hereMembers,
      everyoneMembers,
      customRoleId,
      customRoleMembers,
      customRoleDelayMs,
    });
    if (!saved.ok) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
        .catch(() => {});
      return true;
    }

    await refreshPartnershipConfigCache().catch(() => null);
    await refreshPanel(interaction, "home", lang);
    await interaction.reply(ephemeralNotice(lang, "admin_pingSaved", interaction.guild)).catch(() => {});
    return true;
  }

  if (interaction.isStringSelectMenu?.()) {
    const parsed = parseCustomId(interaction.customId);
    if (!parsed || parsed.kind !== PREFIX || !String(parsed.action || "").startsWith("select:")) return false;
    if (String(interaction.user?.id || "") !== parsed.ownerId) {
      await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
      return true;
    }
    const selectedAction = String(interaction.values?.[0] || "").trim();
    if (!selectedAction) return false;

    if (
      !SETTINGS_MODAL_SELECT_ACTIONS.has(selectedAction) &&
      !interaction.deferred &&
      !interaction.replied
    ) {
      await interaction.deferUpdate().catch(() => {});
    }

    return processSettingsAction(interaction, parsed.ownerId, selectedAction, lang);
  }

  if (!interaction.isButton?.()) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== PREFIX) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
    return true;
  }

  return processSettingsAction(interaction, parsed.ownerId, parsed.action, lang);
}

module.exports = {
  name: "partnershipSettings",
  order: 46,
  match,
  execute,
};
