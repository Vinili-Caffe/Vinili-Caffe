const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const userButton = require("../../Buttons").user;
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  shouldBlockTenantPartnershipPrefixCommands,
  shouldUseTenantStatsInfoRouting,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { memberCanManageTenantPartnershipSettings } = require("../../Utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../Utils/Partner/tenantPartnershipAdminAccess");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const {
  parseUserInfoArgs,
  buildTenantUserInfoPayload,
} = require("../../Utils/Partner/tenantUserInfoRuntime") as typeof import("../../Utils/Partner/tenantUserInfoRuntime");
const {
  resolveTenantLanguageForMessage,
  tenantOnlyError,
  tenantNoPermissionError,
} = require("../../Utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply") as typeof import("../../Utils/Partner/tenantSetupRequiredReply");

function memberCanUseTenantUserInfo(member?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !member) return false;
  return (
    memberHasPartnerManagerRole(member, guildId) ||
    memberCanManageTenantPartnershipSettings(member, guild)
  );
}

async function executeTenantUserInfo(message?, args = []) {
  await message.channel.sendTyping().catch(() => null);
  if (!message.inGuild?.() || !message.guild || !message.member) return;

  const guildId = message.guild.id;
  const lang = await resolveTenantLanguageForMessage(message);
  if (shouldBlockTenantPartnershipPrefixCommands(guildId)) {
    return safeMessageReply(message, {
      ...(await tenantOnlyError(message, "`+user info`")),
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

  if (!memberCanUseTenantUserInfo(message.member, message.guild)) {
    return safeMessageReply(message, {
      ...(await tenantNoPermissionError(message, "`+user info`")),
      allowedMentions: { repliedUser: false },
    });
  }

  const parsed = parseUserInfoArgs(args, message);
  const payload = await buildTenantUserInfoPayload(message.client, message.guild, {
    ...parsed,
    fallbackUserId: message.author.id,
    lang,
  });
  return safeMessageReply(message, payload);
}

function isUserSnowflakeArg(value?) {
  return /^\d{16,20}$/.test(String(value || "").trim());
}

export = {
  name: userButton.name,
  aliases: ["user"],
  allowEmptyArgs: true,
  subcommands: ["info"],
  description: "Mostra le statistiche di attività di un utente o la scheda di un Partner Manager.",
  usage: "+user <@utente | id> [giorni] · +user info [userId | @utente]",
  examples: [
    "+user @Utente",
    "+user info",
    "+user info @Utente",
    "+user info 295500038401163264",
  ],
  subcommandUsages: {
    info: "+user info [userId | @utente]",
  },
  USER_REFRESH_CUSTOM_ID_PREFIX: userButton.USER_REFRESH_CUSTOM_ID_PREFIX,
  USER_PERIOD_OPEN_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  USER_PERIOD_SET_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_SET_CUSTOM_ID_PREFIX,
  USER_PERIOD_BACK_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildUserOverviewPayload: userButton.buildUserOverviewPayload,
  buildUserComponents: userButton.buildUserComponents,

  async execute(message?, args = []) {
    const guildId = message.guild?.id;
    const first = String(args[0] || "").trim();
    const sub = first.toLowerCase();
    const hasMention = Boolean(message?.mentions?.users?.size);
    const isSnowflake = isUserSnowflakeArg(first);

        if (sub === "info") {
      return executeTenantUserInfo(message, args.slice(1));
    }

    if (shouldUseTenantStatsInfoRouting(guildId) && (isSnowflake || hasMention)) {
      return executeTenantUserInfo(message, args);
    }

        if (shouldUseTenantStatsInfoRouting(guildId)) {
      return safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Su questo server usa `+user info` per la scheda partnership.",
        allowedMentions: { repliedUser: false },
      });
    }

        await message.channel.sendTyping().catch(() => {});
    const { targetId, lookbackDays } = await userButton.resolveUserTargetAndLookback(message, args);
    if (!targetId) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa: `+user <@utente | id | username>`",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    try {
      const payload = await userButton.buildUserOverviewPayload(
        message.guild,
        targetId,
        lookbackDays,
        "main",
        message.client,
      );
      payload.components = userButton.buildUserComponents(
        message.author.id,
        targetId,
        lookbackDays,
        "main",
      );
      await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
    } catch (err) {
      global.logger?.error?.("[+user] Errore:", err?.message || err);
      const hint =
        err?.message && /canvas|Cannot find module/i.test(String(err.message))
          ? " Sul server potrebbe mancare il pacchetto `canvas` (e dipendenze di sistema)."
          : "";
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Errore nel generare le statistiche.${hint}`,
        allowedMentions: { repliedUser: false },
      });
    }
  },
};
