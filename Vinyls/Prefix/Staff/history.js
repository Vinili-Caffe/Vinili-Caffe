const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { applyPartnershipPayloadBranding } = require("../../MultiGuild/utils/tenantEmbedBranding");
const {
  listRecentPartnerGuildIds,
  parseHistoryArgs,
  clampHistoryDays,
} = require("../../Services/Partner/partnershipHistoryService");
const { isPartnershipOperational, memberHasPartnerManagerRole, shouldBlockTenantPartnershipPrefixCommands } = require("../../Utils/Partner/partnershipConfigResolver");
const { memberCanManageTenantPartnershipSettings } = require("../../Utils/Partner/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils");
const { isKnownPartnershipGuild } = require("../../Utils/Partner/tenantServerInfoRuntime");
const { buildTenantLookupNotFoundPayload } = require("../../Utils/Partner/tenantLookupNotFoundRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
} = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply");
const { t } = require("../../Utils/Partner/tenantPartnershipI18n");

const MAX_EMBED_DESCRIPTION = 4096;

function memberCanUsePartnershipHistory(member, guild) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

function formatHistoryDaysLabel(days, lang) {
  const n = clampHistoryDays(days);
  return n === 1 ? t(lang, "history_daysOne") : t(lang, "history_daysMany", { n });
}

function buildHistoryEmbeds(targetGuildName, ids, days, lang) {
  const daysLabel = formatHistoryDaysLabel(days, lang);
  const title = t(lang, "history_title");
  const intro = t(lang, "history_intro", { guildName: targetGuildName, days: daysLabel });

  if (!ids.length) {
    return [
      new EmbedBuilder()
        .setTitle(title)
        .setDescription(`${intro}\n\`\`\`\n${t(lang, "history_empty")}\n\`\`\``),
    ];
  }

  const embeds = [];
  let batch = [];
  const continuationTitle = t(lang, "history_continuation");

  const flush = (withIntro) => {
    if (!batch.length) return;
    const codeBlock = `\`\`\`\n${batch.join("\n")}\n\`\`\``;
    const description = (withIntro ? `${intro}\n${codeBlock}` : codeBlock).slice(0, MAX_EMBED_DESCRIPTION);
    embeds.push(
      new EmbedBuilder()
        .setTitle(embeds.length === 0 ? title : continuationTitle)
        .setDescription(description),
    );
    batch = [];
  };

  for (const id of ids) {
    const withIntro = embeds.length === 0 && batch.length === 0;
    const candidate = [...batch, id];
    const codeBlock = `\`\`\`\n${candidate.join("\n")}\n\`\`\``;
    const description = withIntro ? `${intro}\n${codeBlock}` : codeBlock;
    if (description.length > MAX_EMBED_DESCRIPTION && batch.length) {
      flush(withIntro);
      batch.push(id);
      continue;
    }
    batch.push(id);
  }

  flush(embeds.length === 0);
  return embeds;
}

function buildHistoryReplyPayload(brandingGuild, embeds, client, brandingGuildId) {
  return applyPartnershipPayloadBranding(
    applyDefaultFooterToEmbeds({ embeds, allowedMentions: { repliedUser: false } }, brandingGuild),
    { guildId: brandingGuildId || brandingGuild?.id, guild: brandingGuild, client },
  );
}

async function resolveHistoryTargetGuild(client, sourceGuild, guildId, lang) {
  const explicit = String(guildId || "").trim();
  if (!explicit) {
    return {
      guild: sourceGuild,
      guildId: String(sourceGuild?.id || ""),
      displayName: sourceGuild?.name || t(lang, "history_thisServer"),
    };
  }
  const guild =
    client?.guilds?.cache?.get(explicit) ||
    (await client?.guilds?.fetch?.(explicit).catch(() => null));
  return {
    guild,
    guildId: explicit,
    displayName: guild?.name || `Server ${explicit}`,
  };
}

module.exports = {
  name: "history",
  allowEmptyArgs: true,
  description: "Mostra la cronologia delle partnership recenti.",
  usage: "+history [giorni] [guildId]",
  examples: ["+history", "+history 7", "+history 1471511928739201047", "+history 7 1471511928739201047"],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => null);
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const guildId = message.guild.id;
    const lang = await resolveTenantLanguageForMessage(message);
    if (shouldBlockTenantPartnershipPrefixCommands(guildId)) {
      return safeMessageReply(message, {
        ...(await tenantOnlyError(message, "`+history`")),
        allowedMentions: { repliedUser: false },
      });
    }

    if (!isPartnershipOperational(guildId)) {
      return replyPrefixSetupRequired(message);
    }

    const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
    if (denied) {
      return sendPartnersChatDeniedPrefixCleanup(message, denied);
    }

    if (!memberCanUsePartnershipHistory(message.member, message.guild)) {
      return safeMessageReply(message, {
        ...(await tenantNoPermissionError(message, "`+history`")),
        allowedMentions: { repliedUser: false },
      });
    }

    const parsed = parseHistoryArgs(args);
    if (parsed.invalidId) {
      return safeMessageReply(
        message,
        buildTenantLookupNotFoundPayload("server", {
          guild: message.guild,
          client: message.client,
          lang,
        }),
      );
    }

    // Tenant isolation: cross-guild history solo dal main Vinili
    const IDs = require("../../Utils/Config/ids");
    const mainId = String(IDs.guilds?.main || "").trim();
    const here = String(message.guild.id);
    const allowCross = Boolean(mainId && here === mainId);
    const requested = String(parsed.guildId || "").trim();
    const targetGuildId = allowCross && requested ? requested : here;
    if (!isKnownPartnershipGuild(targetGuildId)) {
      return safeMessageReply(
        message,
        buildTenantLookupNotFoundPayload("server", {
          guild: message.guild,
          client: message.client,
          lang,
        }),
      );
    }

    const target = await resolveHistoryTargetGuild(
      message.client,
      message.guild,
      allowCross ? parsed.guildId : null,
      lang,
    );
    const displayName = target.displayName || target.guild?.name || message.guild.name;
    const { ids } = await listRecentPartnerGuildIds(targetGuildId, parsed.days);
    const embeds = buildHistoryEmbeds(displayName, ids, parsed.days, lang);
    const brandingGuild = parsed.guildId && target.guild ? target.guild : message.guild;
    const payload = buildHistoryReplyPayload(
      brandingGuild,
      embeds,
      message.client,
      targetGuildId,
    );

    return message.reply(payload).catch(() => safeMessageReply(message, payload));
  },
};
