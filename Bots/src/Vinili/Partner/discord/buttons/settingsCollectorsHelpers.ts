const { PermissionFlagsBits, ChannelType } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const {
  setPartnershipChannel,
  setPartnershipLogsChannel,
  setPmCommandsChannel,
  setPmCommandsCategories,
  setPartnerManagerRole,
  setManagerBadgeRole,
  setPartnerDescChannel,
} = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { ensurePartnershipChannelInvite } = require("../../../Partner/services/partnershipInviteService") as typeof import("../../../Partner/services/partnershipInviteService");
const { PROMPT_TTL_MS } = require("../../../Partner/runtime/partnershipSettingsComponents") as typeof import("../../../Partner/runtime/partnershipSettingsComponents");
const { syncTenantPartnerDescription } = require("../../services/tenantPartnerDescriptionService") as typeof import("../../services/tenantPartnerDescriptionService");
const { t } = require("../../i18n/tenantPartnershipI18n/index") as typeof import("../../i18n/tenantPartnershipI18n/index");
const { buildSimpleNoticePayload } = require("../../../../shared/embeds/simpleNoticeEmbed") as typeof import("../../../../shared/embeds/simpleNoticeEmbed");
const { setTenantObjectiveFlag } = require("../../services/tenantObjectiveService") as typeof import("../../services/tenantObjectiveService");
const {
  createCollectorRegistry,
  botCanUseChannel,
  botCanCreateInviteInChannel,
  resolveChannelFromMessage,
  resolveRoleFromMessage,
} = require("./collectorsHelpers") as typeof import("./collectorsHelpers");
const { stopCollector, forgetCollector, createTrackedCollector } = createCollectorRegistry();
const { textEphemeralNotice, refreshPanel } = require("./settingsPanelHelpers") as typeof import("./settingsPanelHelpers");

function botCanReadChannel(guild?, channel?) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) &&
      perms?.has(PermissionFlagsBits.ReadMessageHistory),
  );
}

async function resolveCategoriesFromMessage(message?) {
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

async function acknowledgeSelectIfNeeded(interaction?) {
  if (interaction.isStringSelectMenu?.() && !interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
}

async function sendCollectorPrompt(interaction?, content?) {
  const payload = textEphemeralNotice(content, interaction.guild);
  if (interaction.isStringSelectMenu?.()) {
    await acknowledgeSelectIfNeeded(interaction);
    return interaction.followUp(payload).catch(() => null);
  }
  await interaction.reply(payload).catch(() => null);
  return null;
}

async function editCollectorPrompt(interaction?, promptMessage?, content?) {
  const payload = buildSimpleNoticePayload(content, interaction.guild);
  if (promptMessage?.edit) {
    await promptMessage.edit(payload).catch(() => {});
    return;
  }
  await interaction.editReply(payload).catch(() => {});
}

async function startChannelCollector(interaction?, ownerId?, field?, lang?) {
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

  const collector = createTrackedCollector(collectorKey, interaction.channel, ownerId, PROMPT_TTL_MS);
  if (!collector) return;

  collector.on("collect", async (msg?) => {
    forgetCollector(collectorKey);
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

  collector.on("end", async (collected?, reason?) => {
    forgetCollector(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_timeoutSelect")).catch(() => {});
    }
  });
}

async function startCategoryCollector(interaction?, ownerId?, lang?) {
  const collectorKey = `${interaction.guild.id}:${ownerId}:settings:pm_categories`;
  stopCollector(collectorKey);

  await acknowledgeSelectIfNeeded(interaction);
  const promptMessage = await sendCollectorPrompt(interaction, t(lang, "settings_prompt_pmCategories"));

  const collector = createTrackedCollector(collectorKey, interaction.channel, ownerId, PROMPT_TTL_MS);
  if (!collector) return;

  collector.on("collect", async (msg?) => {
    forgetCollector(collectorKey);
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

  collector.on("end", async (collected?, reason?) => {
    forgetCollector(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_timeoutSelect")).catch(() => {});
    }
  });
}

async function startRoleCollector(interaction?, ownerId?, field?, lang?) {
  const collectorKey = `${interaction.guild.id}:${ownerId}:settings:role:${field}`;
  stopCollector(collectorKey);

  const prompt =
    field === "badge" ? t(lang, "settings_prompt_badgeRole") : t(lang, "settings_prompt_managerRole");

  await acknowledgeSelectIfNeeded(interaction);
  const promptMessage = await sendCollectorPrompt(interaction, prompt);

  const collector = createTrackedCollector(collectorKey, interaction.channel, ownerId, PROMPT_TTL_MS);
  if (!collector) return;

  collector.on("collect", async (msg?) => {
    forgetCollector(collectorKey);
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

  collector.on("end", async (collected?, reason?) => {
    forgetCollector(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await editCollectorPrompt(interaction, promptMessage, t(lang, "admin_timeoutSelect")).catch(() => {});
    }
  });
}

export = {
  acknowledgeSelectIfNeeded,
  startChannelCollector,
  startCategoryCollector,
  startRoleCollector,
};
