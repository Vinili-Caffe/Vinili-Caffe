const { safePanelMessageUpdate } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const {
  refreshPartnershipConfigCache,
  getPartnershipConfigSync,
  setPartnershipChannel,
  setPartnershipLogsChannel,
  setPartnerManagerRole,
} = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { ensurePartnershipChannelInvite } = require("../../../Services/Partner/partnershipInviteService") as typeof import("../../../Services/Partner/partnershipInviteService");
const {
  PROMPT_TTL_MS,
  parseCustomId,
  buildStepPayload,
} = require("../../../Utils/Partner/partnershipSetupComponents") as typeof import("../../../Utils/Partner/partnershipSetupComponents");
const { t } = require("../../utils/Partner/tenantPartnershipI18n/index") as typeof import("../../utils/Partner/tenantPartnershipI18n/index");
const { tenantI18nNoticePayload } = require("../../utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../utils/Partner/tenantPartnershipPrefixMessages");
const { buildSimpleNoticePayload } = require("../../../Utils/Embeds/simpleNoticeEmbed") as typeof import("../../../Utils/Embeds/simpleNoticeEmbed");
const {
  PRIVATE_FLAG,
  ephemeralNotice,
  createCollectorRegistry,
  botCanUseChannel,
  botCanCreateInviteInChannel,
  resolveChannelFromMessage,
  resolveRoleFromMessage,
} = require("./collectorsHelpers") as typeof import("./collectorsHelpers");
const { stopCollector, forgetCollector, createTrackedCollector } = createCollectorRegistry();

function notice(lang?, key?, guild?, vars: Record<string, any> = {}, options: Record<string, any> = {}) {
  return tenantI18nNoticePayload(lang, key, guild, vars, options);
}

function textNotice(text?, guild?, options: Record<string, any> = {}) {
  return buildSimpleNoticePayload(text, guild, options);
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

  const collector = createTrackedCollector(collectorKey, interaction.channel, ownerId, PROMPT_TTL_MS);
  if (!collector) return;

  collector.on("collect", async (msg?) => {
    forgetCollector(collectorKey);
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
    forgetCollector(collectorKey);
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

  const collector = createTrackedCollector(collectorKey, interaction.channel, ownerId, PROMPT_TTL_MS);
  if (!collector) return;

  collector.on("collect", async (msg?) => {
    forgetCollector(collectorKey);
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
    forgetCollector(collectorKey);
    if (reason === "time" && collected.size === 0) {
      await interaction
        .editReply(notice(lang, "admin_timeout", interaction.guild))
        .catch(() => {});
    }
  });
}

export = {
  startChannelCollector,
  startRoleCollector,
};
