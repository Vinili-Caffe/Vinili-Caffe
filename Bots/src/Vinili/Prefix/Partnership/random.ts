const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  shouldBlockTenantPartnershipPrefixCommands,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { memberCanManageTenantPartnershipSettings } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const {
  buildTenantServerInfoPayload,
  pickRandomOperationalPartnershipGuildId,
} = require("../../MultiGuild/utils/Partner/tenantServerInfoRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantServerInfoRuntime");
const { buildTenantLookupNotFoundPayload } = require("../../MultiGuild/utils/Partner/tenantLookupNotFoundRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantLookupNotFoundRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
  tenantNoticePayload,
} = require("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../MultiGuild/utils/Partner/tenantSetupRequiredReply") as typeof import("../../MultiGuild/utils/Partner/tenantSetupRequiredReply");

function memberCanUseTenantRandomServer(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

export = {
  name: "random",
  subcommands: ["server"],
  allowEmptyArgs: false,
  description: "Seleziona un server partner attivo a caso e ne mostra la scheda.",
  usage: "+random server",
  examples: ["+random server"],

  async execute(message?, args = []) {
    await message.channel.sendTyping().catch(() => null);
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const sub = String(args[0] || "").trim().toLowerCase();
    const guildId = message.guild.id;
    const lang = await resolveTenantLanguageForMessage(message);
    if (sub !== "server") {
      return safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "random_usage")),
        allowedMentions: { repliedUser: false },
      });
    }

    if (shouldBlockTenantPartnershipPrefixCommands(guildId)) {
      return safeMessageReply(message, {
        ...(await tenantOnlyError(message, "`+random server`")),
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

    if (!memberCanUseTenantRandomServer(message.member, message.guild)) {
      return safeMessageReply(message, {
        ...(await tenantNoPermissionError(message, "`+random server`")),
        allowedMentions: { repliedUser: false },
      });
    }

    const randomGuildId = pickRandomOperationalPartnershipGuildId(guildId);
    if (!randomGuildId) {
      return safeMessageReply(
        message,
        buildTenantLookupNotFoundPayload("server", {
          guild: message.guild,
          client: message.client,
          lang,
        }),
      );
    }

    const payload = await buildTenantServerInfoPayload(message.client, message.guild, {
      guildId: randomGuildId,
      lang,
    });
    return safeMessageReply(message, payload);
  },
};
