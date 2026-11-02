const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const {
  rejectIfPartnershipToolkitBlocked,
  isMainPartnershipPrefixGuild,
} = require("../../core/partnershipPrefixToolkit") as typeof import("../../core/partnershipPrefixToolkit");
const { memberCanManageTenantPartnershipSettings } = require("../../core/tenantPartnershipAdminAccess") as typeof import("../../core/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const {
  buildTenantServerInfoPayload,
  pickRandomOperationalPartnershipGuildId,
} = require("../../tenant/tenantServerInfoRuntime") as typeof import("../../tenant/tenantServerInfoRuntime");
const { buildTenantLookupNotFoundPayload } = require("../../tenant/tenantLookupNotFoundRuntime") as typeof import("../../tenant/tenantLookupNotFoundRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantNoPermissionError,
  tenantNoticePayload,
} = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");

function memberCanUseRandomServer(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

async function runRandomServer(message?, args = []) {
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

  if (await rejectIfPartnershipToolkitBlocked(message, "+random server")) return;

  if (!isPartnershipOperational(guildId)) {
    return replyPrefixSetupRequired(message);
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
  if (denied) {
    return sendPartnersChatDeniedPrefixCleanup(message, denied);
  }

  if (!memberCanUseRandomServer(message.member, message.guild)) {
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
}

async function executeMainRandom(message?, args = []) {
  return runRandomServer(message, args);
}

async function executeTenantRandom(message?, args = []) {
  return runRandomServer(message, args);
}

export = {
  name: "random",
  subcommands: ["server"],
  allowEmptyArgs: false,
  description: "Seleziona un server partner attivo a caso e ne mostra la scheda.",
  usage: "+random server",
  examples: ["+random server"],

  async execute(message?, args = []) {
    if (isMainPartnershipPrefixGuild(message?.guild?.id)) {
      return executeMainRandom(message, args);
    }
    return executeTenantRandom(message, args);
  },
};
