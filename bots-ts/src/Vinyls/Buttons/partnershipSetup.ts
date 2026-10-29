const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { safePanelMessageUpdate } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const { getGuildChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const {
  refreshPartnershipConfigCache,
  getPartnershipConfigSync,
  isPartnershipSetupComplete,
  setPartnershipChannel,
  setPartnershipLogsChannel,
  setPartnerManagerRole,
  setPartnershipPings,
  completePartnershipSetup,
} = require("../MultiGuild/core/tenantPartnershipSettings") as typeof import("../MultiGuild/core/tenantPartnershipSettings");
const { parsePingMemberThresholdInput } = require("../Utils/Partner/partnershipPingUtils") as typeof import("../Utils/Partner/partnershipPingUtils");
const { ensurePartnershipChannelInvite } = require("../Services/Partner/partnershipInviteService") as typeof import("../Services/Partner/partnershipInviteService");
const {
  PREFIX,
  MODAL_PREFIX,
  PROMPT_TTL_MS,
  parseCustomId,
  buildStepPayload,
  buildPingModal,
  buildSetupAlreadyCompletedEmbed,
} = require("../Utils/Partner/partnershipSetupComponents") as typeof import("../Utils/Partner/partnershipSetupComponents");

const { memberCanManageTenantPartnershipSettings } = require("../Utils/Partner/tenantPartnershipAdminAccess") as typeof import("../Utils/Partner/tenantPartnershipAdminAccess");
const { t, resolveTenantLanguage } = require("../Utils/Partner/tenantPartnershipI18n") as typeof import("../Utils/Partner/tenantPartnershipI18n");
const { resolveTenantLanguageForInteraction, tenantI18nNoticePayload } = require("../Utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../Utils/Partner/tenantPartnershipPrefixMessages");
const { buildSimpleNoticePayload } = require("../Utils/Embeds/simpleNoticeEmbed") as typeof import("../Utils/Embeds/simpleNoticeEmbed");
const { setTenantObjectiveFlag } = require("../Services/Partner/tenantObjectiveService") as typeof import("../Services/Partner/tenantObjectiveService");
const { createPromptMessageCollector } = require("../../shared/discord/promptMessageCollectorRuntime") as typeof import("../../shared/discord/promptMessageCollectorRuntime");

const PRIVATE_FLAG = 1 << 6;
const ACTIVE_COLLECTORS = new Map();

function notice(lang?, key?, guild?, vars: Record<string, any> = {}, options: Record<string, any> = {}) {
  return tenantI18nNoticePayload(lang, key, guild, vars, options);
}

function ephemeralNotice(lang?, key?, guild?, vars: Record<string, any> = {}) {
  return {
    ...tenantI18nNoticePayload(lang, key, guild, vars, { ephemeral: true }),
    flags: PRIVATE_FLAG,
  };
}

function textNotice(text?, guild?, options: Record<string, any> = {}) {
  return buildSimpleNoticePayload(text, guild, options);
}

function stopCollector(key?) {
  const existing = ACTIVE_COLLECTORS.get(key);
  if (existing) {
    existing.stop();
    ACTIVE_COLLECTORS.delete(key);
  }
}

function botCanUseChannel(guild?, channel?) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms?.has(PermissionFlagsBits.SendMessages),
  );
}

function botCanCreateInviteInChannel(guild?, channel?) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  return Boolean(channel.permissionsFor(me)?.has(PermissionFlagsBits.CreateInstantInvite));
}

async function resolveChannelFromMessage(message?) {
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

function resolveRoleFromMessage(message?) {
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

function parseOptionalInt(raw?) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const n = Number.parseInt(text, 10);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

function match(interaction?) {
  const customId = String(interaction?.customId || "");
  return customId.startsWith(`${PREFIX}:`) || customId.startsWith(`${MODAL_PREFIX}:`);
}

async function rejectIfSetupAlreadyComplete(interaction?, lang?) {
  if (!interaction?.guild?.id) return false;
  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(interaction.guild.id);
  if (!isPartnershipSetupComplete(config)) return false;
  await interaction
    .reply({
      embeds: [buildSetupAlreadyCompletedEmbed(lang)],
      flags: PRIVATE_FLAG,
    })
    .catch(() => null);
  return true;
}

async function applyPanelPayload(interaction?, payload?) {
  await safePanelMessageUpdate(interaction, payload);
}

async function refreshPanel(interaction?, step?, lang?) {
  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(interaction.guild.id);
  const parsed = parseCustomId(interaction.customId);
  const ownerId = parsed?.ownerId || interaction.user.id;
  const payload = buildStepPayload(interaction.guild, ownerId, step, config, lang);
  await safePanelMessageUpdate(interaction, payload);
  return config;
}

async function startChannelCollector(interaction?, ownerId?, field?, lang?) {
  const collectorKey = `${interaction.guild.id}:${ownerId}:${field}`;
  stopCollector(collectorKey);

  const isPartner = field === "partner";
  const prompt = isPartner
    ? t(lang, "setup_prompt_partnerChannel")
    : t(lang, "setup_prompt_logsChannel");

  await interaction.reply({ ...textNotice(prompt, interaction.guild, { ephemeral: true }), flags: PRIVATE_FLAG }).catch(() => {});

  const collector = createPromptMessageCollector(interaction.channel, {
    userId: ownerId,
    time: PROMPT_TTL_MS,
    max: 1,
  });
  if (!collector) return;
  ACTIVE_COLLECTORS.set(collectorKey, collector);

  collector.on("collect", async (msg?) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    const raw = String(msg.content || "").trim();
    await msg.delete().catch(() => {});

    if (/^annulla$/i.test(raw)) {
      await interaction.editReply(notice(lang, "admin_cancelled", interaction.guild)).catch(() => {});
      return;
    }

    if (!isPartner && /^off$/i.test(raw)) {
      const result = await setPartnershipLogsChannel(interaction.guild.id, null);
      if (!result.ok) {
        await interaction.editReply(notice(lang, "admin_saveFailed", interaction.guild)).catch(() => {});
        return;
      }
      await refreshPanel(interaction, "channels", lang);
      await interaction.editReply(notice(lang, "admin_logsRemoved", interaction.guild)).catch(() => {});
      return;
    }

    const resolved = await resolveChannelFromMessage(msg);
    if (resolved.cancel) {
      await interaction.editReply(notice(lang, "admin_cancelled", interaction.guild)).catch(() => {});
      return;
    }
    if (!resolved.channel) {
      await interaction
        .editReply(notice(lang, "admin_invalidChannel", interaction.guild))
        .catch(() => {});
      return;
    }
    if (!botCanUseChannel(interaction.guild, resolved.channel)) {
      await interaction
        .editReply(notice(lang, "admin_noSendPerms", interaction.guild))
        .catch(() => {});
      return;
    }

    if (isPartner) {
      if (!botCanCreateInviteInChannel(interaction.guild, resolved.channel)) {
        await interaction
          .editReply(notice(lang, "admin_noInvitePerms", interaction.guild))
          .catch(() => {});
        return;
      }
      const saved = await setPartnershipChannel(interaction.guild.id, resolved.channel.id);
      if (!saved.ok) {
        await interaction.editReply(notice(lang, "admin_saveFailed", interaction.guild)).catch(() => {});
        return;
      }
      const inviteResult = await ensurePartnershipChannelInvite(interaction.guild, resolved.channel.id);
      await refreshPanel(interaction, "channels", lang);
      const inviteNote = inviteResult.ok
        ? t(lang, "admin_partnerInviteCreated", { url: inviteResult.invite.url })
        : t(lang, "admin_partnerInviteFailed");
      await interaction
        .editReply(
          notice(lang, "admin_partnerSet", interaction.guild, {
            channel: resolved.channel,
            note: inviteNote,
          }),
        )
        .catch(() => {});
      return;
    }

    const result = await setPartnershipLogsChannel(interaction.guild.id, resolved.channel.id);
    if (!result.ok) {
      await interaction.editReply(notice(lang, "admin_saveFailed", interaction.guild)).catch(() => {});
      return;
    }
    await refreshPanel(interaction, "channels", lang);
    await interaction
      .editReply(notice(lang, "admin_logsSet", interaction.guild, { channel: resolved.channel }))
      .catch(() => {});
  });

  collector.on("end", async (collected?, reason?) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await interaction
        .editReply(notice(lang, "admin_timeout", interaction.guild))
        .catch(() => {});
    }
  });
}

async function startRoleCollector(interaction?, ownerId?, lang?) {
  const collectorKey = `${interaction.guild.id}:${ownerId}:role`;
  stopCollector(collectorKey);

  await interaction
    .reply(ephemeralNotice(lang, "setup_prompt_role", interaction.guild))
    .catch(() => {});

  const collector = createPromptMessageCollector(interaction.channel, {
    userId: ownerId,
    time: PROMPT_TTL_MS,
    max: 1,
  });
  if (!collector) return;
  ACTIVE_COLLECTORS.set(collectorKey, collector);

  collector.on("collect", async (msg?) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    await msg.delete().catch(() => {});

    const resolved = resolveRoleFromMessage(msg);
    if (resolved.cancel) {
      await interaction.editReply(notice(lang, "admin_cancelled", interaction.guild)).catch(() => {});
      return;
    }
    if (!resolved.role) {
      await interaction
        .editReply(notice(lang, "admin_invalidRole", interaction.guild))
        .catch(() => {});
      return;
    }
    if (resolved.role.managed) {
      await interaction
        .editReply(notice(lang, "admin_managedRole", interaction.guild))
        .catch(() => {});
      return;
    }

    const result = await setPartnerManagerRole(interaction.guild.id, resolved.role.id);
    if (!result.ok) {
      const sameRoleMsg =
        result.reason === "same_as_badge_role"
          ? t(lang, "admin_sameManagerBadgeRole")
          : t(lang, "admin_saveFailed");
      await interaction.editReply(textNotice(sameRoleMsg, interaction.guild)).catch(() => {});
      return;
    }
    await refreshPanel(interaction, "roles", lang);
    await interaction
      .editReply(notice(lang, "admin_roleSet", interaction.guild, { role: resolved.role }))
      .catch(() => {});
  });

  collector.on("end", async (collected?, reason?) => {
    ACTIVE_COLLECTORS.delete(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await interaction
        .editReply(notice(lang, "admin_timeout", interaction.guild))
        .catch(() => {});
    }
  });
}

async function rejectIfNotPartnershipAdmin(interaction?, lang?) {
  if (memberCanManageTenantPartnershipSettings(interaction.member, interaction.guild)) {
    return false;
  }
  await interaction
    .reply(ephemeralNotice(lang, "admin_denied", interaction.guild))
    .catch(() => null);
  return true;
}

async function execute(interaction?) {
  const lang = await resolveTenantLanguageForInteraction(interaction);
  if (await rejectIfNotPartnershipAdmin(interaction, lang)) return true;
  if (await rejectIfSetupAlreadyComplete(interaction, lang)) return true;

  if (interaction.isModalSubmit?.()) {
    const parsed = parseCustomId(interaction.customId);
    if (!parsed || parsed.kind !== MODAL_PREFIX || parsed.action !== "ping") return false;
    if (String(interaction.user?.id || "") !== parsed.ownerId) {
      await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
      return true;
    }

    const hereMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("here_members"));
    const everyoneMembers = parsePingMemberThresholdInput(interaction.fields.getTextInputValue("everyone_members"));
    const customRoleRaw = String(interaction.fields.getTextInputValue("custom_role_id") || "").trim();
    const customRoleMembers = parseOptionalInt(interaction.fields.getTextInputValue("custom_role_members"));

    if (
      Number.isNaN(hereMembers) ||
      Number.isNaN(everyoneMembers) ||
      Number.isNaN(customRoleMembers)
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
    });
    if (!saved.ok) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_saveFailed", interaction.guild))
        .catch(() => {});
      return true;
    }

    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    const payload = buildStepPayload(interaction.guild, parsed.ownerId, "pings", config, lang);
    await interaction.message?.edit?.(payload).catch(() => null);
    await interaction
      .reply(ephemeralNotice(lang, "admin_pingSaved", interaction.guild))
      .catch(() => {});
    return true;
  }

  if (!interaction.isButton?.()) return false;

  const parsed = parseCustomId(interaction.customId);
  if (!parsed || parsed.kind !== PREFIX) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await interaction.reply(ephemeralNotice(lang, "admin_notYourPanel", interaction.guild)).catch(() => {});
    return true;
  }

  const { action, ownerId } = parsed;

  if (action === "ch_partner") {
    await startChannelCollector(interaction, ownerId, "partner", lang);
    return true;
  }
  if (action === "ch_logs") {
    await startChannelCollector(interaction, ownerId, "logs", lang);
    return true;
  }
  if (action === "ch_next") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    if (!config?.partnershipsChannelId) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_setup_needPartnerChannel", interaction.guild))
        .catch(() => {});
      return true;
    }
    const payload = buildStepPayload(interaction.guild, ownerId, "roles", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }

  if (action === "role_manager") {
    await startRoleCollector(interaction, ownerId, lang);
    return true;
  }
  if (action === "role_next") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    if (!config?.partnerManagerRoleId) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_setup_needPartnerRole", interaction.guild))
        .catch(() => {});
      return true;
    }
    const payload = buildStepPayload(interaction.guild, ownerId, "pings", config, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }

  if (action === "ping_config") {
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    await interaction.showModal(buildPingModal(ownerId, config, lang)).catch(() => {});
    return true;
  }

  if (action === "ping_done") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    await refreshPartnershipConfigCache().catch(() => null);
    const config = getPartnershipConfigSync(interaction.guild.id);
    if (!config?.partnershipsChannelId || !config?.partnerManagerRoleId) {
      await interaction
        .reply(ephemeralNotice(lang, "admin_setup_needRequired", interaction.guild))
        .catch(() => {});
      return true;
    }
    if (config.partnershipsChannelId) {
      await ensurePartnershipChannelInvite(interaction.guild, config.partnershipsChannelId);
      await refreshPartnershipConfigCache().catch(() => null);
    }
    await completePartnershipSetup(interaction.guild.id, ownerId);
    void setTenantObjectiveFlag(interaction.client, interaction.guild.id, ownerId, "setupDone", {
      discordLocale: interaction.locale,
    }).catch(() => null);
    await refreshPartnershipConfigCache().catch(() => null);
    const fresh = getPartnershipConfigSync(interaction.guild.id);
    const payload = buildStepPayload(interaction.guild, ownerId, "complete", fresh, lang);
    await applyPanelPayload(interaction, payload);
    return true;
  }

  return false;
}

export = {
  name: "partnershipSetup",
  order: 45,
  match,
  execute,
};
