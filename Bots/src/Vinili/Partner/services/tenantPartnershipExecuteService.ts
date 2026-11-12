const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Staff/utils/staffDocUtils") as typeof import("../../Staff/utils/staffDocUtils");
const { initPartnerManagerFieldsIfMissing } = require("../../Staff/utils/staffPmUtils") as typeof import("../../Staff/utils/staffPmUtils");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { isPartnershipGuildBlacklisted } = require("./partnershipBlacklistService") as typeof import("./partnershipBlacklistService");
const { isTenantPartnershipGuildBlacklisted } = require("./tenantPartnershipBlacklistService") as typeof import("./tenantPartnershipBlacklistService");
const { isGuildBotUsageBlacklisted } = require("../../Moderation/services/botUsageBlacklistService") as typeof import("../../Moderation/services/botUsageBlacklistService");
const { buildPartnershipBlacklistCancelledPayload } = require("../runtime/partnershipCancelledEmbed") as typeof import("../runtime/partnershipCancelledEmbed");
const { getGuildMemberCached, getGuildChannelCached, getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { accountUsername, guildIconUrl, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { resolvePartnerPointsShown, resolvePartnerTotalEarned } = require("../../Staff/utils/partnerPointsDisplayUtils") as typeof import("../../Staff/utils/partnerPointsDisplayUtils");
const { maybeSendPartnerManagerRewardMilestoneDms } = require("../../Staff/utils/partnerManagerMilestoneDm") as typeof import("../../Staff/utils/partnerManagerMilestoneDm");
const { runImmediatePartnerAuditForUser } = require("./partnerAuditService") as typeof import("./partnerAuditService");
const { checkSamePartnerTargetCooldown, resolveSameServerCooldownMs } = require("../runtime/partnerSameTargetCooldown") as typeof import("../runtime/partnerSameTargetCooldown");
const { formatPingDelayLabel } = require("../runtime/partnershipPingUtils") as typeof import("../runtime/partnershipPingUtils");
const { resolvePartnershipConfigSync, getPartnershipPingRoleId, getPartnerBlacklistRoleId, isPartnershipSkipManagerAllowed, buildSkipDeniedEmbed, buildPartnershipCompletedReplyEmbed } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
const { resolvePartnershipPublishPings, buildPartnershipPublishAllowedMentions, detectUsedPingsInContent } = require("../runtime/partnershipPingUtils") as typeof import("../runtime/partnershipPingUtils");
const { userSuppressesManagerPing, resolveManagerSelectedBadgeEmojis } = require("./tenantProfilePreferencesService") as typeof import("./tenantProfilePreferencesService");
const { touchPartnershipPublishPings } = require("../core/tenantPartnershipSettings") as typeof import("../core/tenantPartnershipSettings");
const { reserveAndPersistPartnershipLogId, sendPartnershipExecuteLog } = require("./partnershipExecuteLogService") as typeof import("./partnershipExecuteLogService");
const { evaluateTenantObjectives } = require("./tenantObjectiveService") as typeof import("./tenantObjectiveService");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  extractInviteCode,
  hasRequiredDiscordInviteLink,
  isValidServerName,
  stripOuterCodeBlock,
  splitMessage,
  stripTrailingManagerLine,
  buildPartnershipAboveEmbedContent,
  resolvePartnershipDescriptionForPublish,
} = require("../runtime/partnershipMessageUtils") as typeof import("../runtime/partnershipMessageUtils");
const { buildThankYouEmbed, sendThankYouMessage } = require("../runtime/partnershipThankYouEmbed") as typeof import("../runtime/partnershipThankYouEmbed");

async function partnerInteractionReply(interaction?, payload?) {
  if (interaction.deferred && !interaction.replied) {
    return interaction.editReply(payload).catch(() => null);
  }
  if (interaction.replied) {
    return interaction.followUp(payload).catch(() => null);
  }
  return interaction.reply(payload).catch(() => null);
}

async function getOrCreateStaffPartnerDoc(guildId?, userId?) {
  const staffDoc = await getOrCreateStaffDoc(guildId, userId);
  if (!staffDoc) return null;
  const s = ensureStaff(staffDoc);
  initPartnerManagerFieldsIfMissing(s);
  return staffDoc;
}

function normalizePartnershipDescription(rawDescription?, partnershipCfg?) {
  const rawDescriptionTrimmed = String(rawDescription || "").trim();
  return partnershipCfg?.legacy
    ? stripOuterCodeBlock(rawDescriptionTrimmed)
    : rawDescriptionTrimmed;
}

async function executeTenantPartnership(interaction?, { description: rawDescription, managerId, skipped = false }: any = {}) {
  const guildId = interaction.guild?.id;
  const partnershipCfg = resolvePartnershipConfigSync(guildId);
  const description = normalizePartnershipDescription(rawDescription, partnershipCfg);
  const PARTNER_BLACKLIST_ROLE = getPartnerBlacklistRoleId(guildId);
  const skipAllowed = isPartnershipSkipManagerAllowed(guildId);
  const useSkip = Boolean(skipped && skipAllowed && !partnershipCfg?.legacy);

  if (skipped && !skipAllowed && !partnershipCfg?.legacy) {
    await partnerInteractionReply(interaction, {
      embeds: [buildSkipDeniedEmbed()],
    });
    return false;
  }

  if (!useSkip && !managerId) {
    await partnerInteractionReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `${E.VC_Alert} Devi indicare un **manager** per questa partnership.`,
          ),
      ],
    });
    return false;
  }

  let managerMember = null;
  if (!useSkip) {
    managerMember = await getGuildMemberCached(interaction.guild, managerId);
    if (!managerMember) {
      await partnerInteractionReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.VC_Alert} Manager non trovato nel server.`,
            ),
        ],
      });
      return false;
    }
  }
  const memberForRoles =
    !useSkip &&
    String(managerId) === String(interaction.user?.id) &&
    interaction.member?.roles?.cache
      ? interaction.member
      : managerMember;
  if (!useSkip) {
    const isVerifiedMember = partnershipCfg?.legacy
      ? Boolean(memberForRoles.roles?.cache?.has(IDs.roles.Member))
      : true;
    if (!isVerifiedMember) {
      await partnerInteractionReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.VC_Alert} Questo utente non ha completato l'inserimento, farglielo completare prima di riprovare!`,
            ),
        ],
      });
      return false;
    }
    if (partnershipCfg?.legacy && PARTNER_BLACKLIST_ROLE && memberForRoles?.roles?.cache?.has(PARTNER_BLACKLIST_ROLE)) {
      await partnerInteractionReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setDescription(
              `${E.VC_Alert} Non puoi fare partner con questo manager poiché blacklistato!`,
            ),
        ],
      });
      return false;
    }
  }
  if (!hasRequiredDiscordInviteLink(description)) {
    await partnerInteractionReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `${E.VC_Alert} Devi inserire un **link d'invito Discord** valido (\`discord.gg/...\` o \`discord.com/invite/...\`).`,
          ),
      ],
    });
    return false;
  }
  const inviteCode = extractInviteCode(description);
  let serverName = "";
  let serverIcon = null;
  let resolvedInviteGuildId = "";
  let partnerMemberCount = null;
  const inviteUrl = `https://discord.gg/${inviteCode}`;
  const ourGuildIdForPartnerBlock = String(interaction.guild?.id || "").trim();
  const { fetchInviteGuildMeta } = require("../runtime/partnershipBlacklistDisplay") as typeof import("../runtime/partnershipBlacklistDisplay");
  const inviteMeta = await fetchInviteGuildMeta(inviteCode, {
    client: interaction.client,
    timeoutMs: 12_000,
    requireMemberCount: true,
  });
  resolvedInviteGuildId = String(inviteMeta?.guildId || "").trim();
  const rawMemberCount = inviteMeta?.memberCount;
  partnerMemberCount =
    rawMemberCount === null || rawMemberCount === undefined || rawMemberCount === ""
      ? null
      : Math.max(0, Math.floor(Number(rawMemberCount) || 0));
  if (!(partnerMemberCount > 0) || !resolvedInviteGuildId) {
    await partnerInteractionReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `${E.VC_Alert} Non riesco a leggere i dati di questo invito (server/membri). Controlla che il link sia valido e riprova tra poco.`,
          ),
      ],
    });
    return false;
  }
  serverName = String(inviteMeta?.guildName || "").trim() || `discord.gg/${inviteCode}`;
  serverIcon = inviteMeta?.iconUrl || null;
  if (resolvedInviteGuildId) {
    try {
      if (partnershipCfg?.legacy && (await isPartnershipGuildBlacklisted(resolvedInviteGuildId))) {
        await partnerInteractionReply(interaction, buildPartnershipBlacklistCancelledPayload());
        return false;
      }
      if (
        !partnershipCfg?.legacy &&
        (await isTenantPartnershipGuildBlacklisted(ourGuildIdForPartnerBlock, resolvedInviteGuildId))
      ) {
        await partnerInteractionReply(interaction, buildPartnershipBlacklistCancelledPayload());
        return false;
      }
      if (await isGuildBotUsageBlacklisted(resolvedInviteGuildId)) {
        await partnerInteractionReply(interaction, buildPartnershipBlacklistCancelledPayload());
        return false;
      }
    } catch {
          }
  }
  if (!isValidServerName(serverName)) {
    await partnerInteractionReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `${E.VC_Alert} Invite senza nome server leggibile. Riprova con un altro invite.`,
          ),
      ],
    });
    return false;
  }
  const inviteTargetsOurGuild =
    Boolean(resolvedInviteGuildId && ourGuildIdForPartnerBlock) &&
    resolvedInviteGuildId === ourGuildIdForPartnerBlock;
  const vanitySlugLooksLikeOurs =
    partnershipCfg?.legacy &&
    !resolvedInviteGuildId &&
    inviteCode.toLowerCase().includes("viniliecaffe");
  if (inviteTargetsOurGuild || vanitySlugLooksLikeOurs) {
    const ownGuildActorLabel = accountUsername(interaction.member || interaction.user);
    const embed = new EmbedBuilder()
      .setAuthor({
        name: ownGuildActorLabel,
        iconURL: guildMemberDisplayAvatarUrlDynamic(interaction.member || interaction.user) || undefined,
      })
      .setTitle(`**${E.partneredserverowner} Partnership con ${serverName} da ${ownGuildActorLabel}**`)
      .setDescription(`${E.VC_Alert} Non puoi fare partner con il tuo server`)
      .setFooter({ text: serverName, iconURL: serverIcon })
      .setColor("Red")
      .setTimestamp()
      .setThumbnail(guildIconUrl(interaction.guild, { size: 256 }) || undefined);
    await partnerInteractionReply(interaction, { embeds: [embed] });
    return false;
  }

  const sameServerCooldownMs = resolveSameServerCooldownMs(partnershipCfg);
  if (sameServerCooldownMs) {
    const cooldown = await checkSamePartnerTargetCooldown(
      interaction.guild.id,
      resolvedInviteGuildId,
      inviteCode,
      sameServerCooldownMs,
    );
    if (!cooldown.ok && cooldown.nextAllowedAt) {
      const ts = Math.floor(cooldown.nextAllowedAt.getTime() / 1000);
      const windowLabel = formatPingDelayLabel(cooldown.cooldownMs || sameServerCooldownMs) || "12h";
      await partnerInteractionReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.VC_Alert} È già stata pubblicata una **partnership con questo server** nelle ultime **${windowLabel}**.\nPuoi ripetere la stessa partner a partire da **<t:${ts}:F>** (<t:${ts}:R>).`,
            ),
        ],
      });
      return false;
    }
  }

  const isLegacyPartnership = Boolean(partnershipCfg?.legacy);
  const publishDescription = resolvePartnershipDescriptionForPublish({
    description,
    legacy: isLegacyPartnership,
    contentFilters: partnershipCfg?.contentFilters,
  });
  if (!publishDescription) {
    await partnerInteractionReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `${E.VC_Alert} La descrizione è vuota.`,
          ),
      ],
    });
    return false;
  }

  try {
    const guild = interaction.guild;
    const client = interaction.client;
    const partnershipsChannelId = partnershipCfg.partnershipsChannelId;
    const partnershipChannel =
      guild.channels.cache.get(partnershipsChannelId) ||
      (await getGuildChannelCached(guild, partnershipsChannelId)) ||
      (await getClientChannelCached(client, partnershipsChannelId));
    if (!partnershipChannel?.isTextBased?.()) {
      await partnerInteractionReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.VC_Alert} Canale partnership non configurato correttamente.`,
            ),
        ],
      });
      return false;
    }
    const staffDoc = await getOrCreateStaffPartnerDoc(guildId, interaction.user.id);
    if (!staffDoc) {
      await partnerInteractionReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.VC_Alert} Impossibile creare il record staff. Riprova.`,
            ),
        ],
      }).catch(() => {});
      return false;
    }

    const s = staffDoc.staff;
    const beforePoints = resolvePartnerPointsShown(s);
    s.partnerCount++;
    const resolvedManagerId = useSkip ? null : managerId;
    if (resolvedManagerId) {
      s.managerId = resolvedManagerId;
    }
    const actionEntry = {
      action: "create",
      partner: serverName,
      invite: inviteUrl,
      partnerGuildId: /^\d{17,20}$/.test(String(resolvedInviteGuildId || "").trim()) ? String(resolvedInviteGuildId).trim() : undefined,
      managerId: resolvedManagerId,
      partnershipChannelId: partnershipsChannelId,
      partnerMessageIds: [],
      date: new Date(),
    };
    s.partnerActions.push(actionEntry);
    const actionIndex = Math.max(0, s.partnerActions.length - 1);
    staffDoc.markModified("staff");
    await staffDoc.save();

    const pingPlan = resolvePartnershipPublishPings({
      partnerMemberCount,
      pings: partnershipCfg?.pings,
      legacy: Boolean(partnershipCfg?.legacy),
      legacyPingRoleId: getPartnershipPingRoleId(guildId),
    });
    const pingRoleId = pingPlan.customRoleId;

    const sentMessageIds = [];
        const publishContent = stripTrailingManagerLine(
      resolvePartnershipDescriptionForPublish({
        description: publishDescription,
        legacy: isLegacyPartnership,
        contentFilters: partnershipCfg?.contentFilters,
      }),
    );
    const managerBadgeEmojis = resolvedManagerId
      ? await resolveManagerSelectedBadgeEmojis(guildId, resolvedManagerId).catch(() => [])
      : [];
    const aboveEmbedContent = buildPartnershipAboveEmbedContent({
      managerId: resolvedManagerId,
      pingPlan,
      badgeEmojis: managerBadgeEmojis,
    });
    const suppressManagerPing =
      Boolean(resolvedManagerId) &&
      (await userSuppressesManagerPing(guildId, resolvedManagerId).catch(() => false));
    const descriptionAllowedMentions = { parse: [], users: [], roles: [] };
    const parts = splitMessage(publishContent);
    for (const part of parts) {
      if (!String(part || "").trim()) continue;
      const sent = await partnershipChannel
        .send({ content: part, allowedMentions: descriptionAllowedMentions })
        .catch(() => null);
      if (sent?.id) sentMessageIds.push(sent.id);
    }
    if (sentMessageIds.length === 0) {
      if (Array.isArray(s.partnerActions) && s.partnerActions.length > actionIndex) {
        s.partnerActions.splice(actionIndex, 1);
      }
      s.partnerCount = Math.max(0, Number(s.partnerCount || 1) - 1);
      if (resolvedManagerId && s.managerId === resolvedManagerId) {
        const lastAction = Array.isArray(s.partnerActions) ? s.partnerActions[s.partnerActions.length - 1] : null;
        s.managerId = lastAction?.managerId || null;
      }
      staffDoc.markModified("staff");
      await staffDoc.save().catch(() => {});
      await partnerInteractionReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.VC_Alert} Non sono riuscito a pubblicare la partner nel canale configurato.`,
            ),
        ],
      });
      return false;
    }

    if (s.partnerActions?.[actionIndex]) {
      s.partnerActions[actionIndex].partnershipChannelId = partnershipChannel.id;
      s.partnerActions[actionIndex].partnerMessageIds = sentMessageIds.slice();
      staffDoc.markModified("staff");
      await staffDoc.save().catch(() => {});
    }

    if (!partnershipCfg?.legacy) {
      const usedPings = detectUsedPingsInContent(aboveEmbedContent || "", pingPlan);
      if (usedPings.pingHere || usedPings.pingEveryone || usedPings.customRoleId) {
        await touchPartnershipPublishPings(guildId, usedPings).catch(() => null);
      }
    }

    const partnershipLogId = await reserveAndPersistPartnershipLogId(staffDoc, actionIndex);

    if (partnershipCfg?.logsChannelId && partnershipLogId) {
      await sendPartnershipExecuteLog({
        client,
        guild,
        logsChannelId: partnershipCfg.logsChannelId,
        pmUserId: interaction.user.id,
        managerId: resolvedManagerId,
        pingRoleId,
        pingHere: pingPlan.pingHere,
        pingEveryone: pingPlan.pingEveryone,
        partnershipChannelId: partnershipChannel.id,
        partnershipMessageId: sentMessageIds[0],
        partnershipId: partnershipLogId,
      }).catch(() => null);
    }

    if (partnershipCfg?.legacy) {
      await runImmediatePartnerAuditForUser(interaction.client, interaction.user.id, guildId);
    }

    const staffAfterAudit = partnershipCfg?.legacy
      ? await getOrCreateStaffPartnerDoc(guildId, interaction.user.id)
      : staffDoc;
    const sAfter = staffAfterAudit && staffAfterAudit.staff ? staffAfterAudit.staff : s;
    /* thankYouSpendableOnly1: embed default usa solo spendibile */
    const shownPartnerPoints = resolvePartnerPointsShown(sAfter);
    const totalPartnerEarned = resolvePartnerTotalEarned(sAfter);

    const thankYou = await buildThankYouEmbed({
      guild: interaction.guild,
      actorMember: interaction.member || interaction.user,
      partnershipCfg,
      serverName,
      serverIcon,
      shownPartnerPoints,
      totalPartnerEarned,
      legacy: Boolean(partnershipCfg?.legacy),
      managerId: resolvedManagerId,
      includeManagerInContent: false,
      staffPartnerActions: sAfter?.partnerActions || s.partnerActions || [],
      pingPlan,
    });

    const thankYouMessage: any = await sendThankYouMessage(
      partnershipChannel,
      thankYou,
      aboveEmbedContent || null,
      aboveEmbedContent
        ? buildPartnershipPublishAllowedMentions(pingPlan, resolvedManagerId, { excludeUserIds: suppressManagerPing ? [resolvedManagerId] : [] })
        : null,
    );
    if (thankYouMessage?.id && staffAfterAudit?.staff?.partnerActions?.[actionIndex]) {
      const ids = Array.isArray(staffAfterAudit.staff.partnerActions[actionIndex].partnerMessageIds)
        ? staffAfterAudit.staff.partnerActions[actionIndex].partnerMessageIds.slice()
        : sentMessageIds.slice();
      ids.push(thankYouMessage.id);
      staffAfterAudit.staff.partnerActions[actionIndex].partnerMessageIds = ids;
      staffAfterAudit.markModified("staff");
      await staffAfterAudit.save().catch(() => {});
    }

    if (partnershipCfg?.legacy) {
      void maybeSendPartnerManagerRewardMilestoneDms(
        interaction.client,
        guild,
        interaction.user.id,
        beforePoints,
        resolvePartnerPointsShown(sAfter),
      ).catch(() => null);
    } else {
      void evaluateTenantObjectives(interaction.client, guildId, interaction.user.id, {
        discordLocale: interaction.locale,
      }).catch(() => null);
    }

    const doneEmbed = buildPartnershipCompletedReplyEmbed({
      client: interaction.client,
      guildId,
      managerId: resolvedManagerId,
      pingRoleId,
      pingHere: pingPlan.pingHere,
      pingEveryone: pingPlan.pingEveryone,
    });

    await partnerInteractionReply(interaction, { embeds: [doneEmbed] });
    return true;
  } catch (err) {
    global.logger.error(err);
    await partnerInteractionReply(interaction, {
      embeds: [
        new EmbedBuilder()
          .setColor("#e74c3c")
          .setDescription(
            `${E.VC_Alert} C'è stato un errore nell'esecuzione del comando.`,
          ),
      ],
    });
    return false;
  }
}

export = { executeTenantPartnership, normalizePartnershipDescription };