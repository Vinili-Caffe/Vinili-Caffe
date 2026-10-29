const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
const {
  isPartnershipOperational,
  shouldRouteTenantPartnershipProfile,
  isProfilePmModeArg,
  shouldBlockTenantPartnershipPrefixCommands,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const { buildTenantProfilePayload } = require("../../Utils/Partner/tenantProfileRuntime") as typeof import("../../Utils/Partner/tenantProfileRuntime");
const { TENANT_PROFILE_SECTIONS } = require("../../Utils/Partner/tenantProfileConstants") as typeof import("../../Utils/Partner/tenantProfileConstants");
const {
  replyTenantMessage,
  tenantNoticePayload,
  tenantOnlyError,
} = require("../../Utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply") as typeof import("../../Utils/Partner/tenantSetupRequiredReply");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils") as typeof import("../../Utils/Partner/partnersChatChannelUtils");
const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed") as typeof import("../../Utils/Embeds/simpleNoticeEmbed");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const NO_REPLY_MENTIONS = { repliedUser: false, parse: [] };

function withDiscordTimeout(promise?, ms = 8000, label = "discord") {
  const limit = Math.max(500, Number(ms) || 8000);
  return Promise.race([
    promise,
    new Promise((_?, reject?) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${limit}ms`));
      }, limit);
      timer.unref?.();
    }),
  ]);
}

async function resolveTargetUser(message?, args = []) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned) return mentioned;
  const raw = String(Array.isArray(args) ? args.join(" ") : "").trim();
  if (!raw) return message?.author || null;
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return message.client.users.fetch(id).catch(() => null);
  }
  return message?.author || null;
}

async function replyProfileBotDenied(message?) {
  await safeMessageReply(message, {
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription(await replyTenantMessage(message, "profile_botNotAllowed")),
    ],
    allowedMentions: { repliedUser: false },
  });
}

async function upsertProfileReply(message?, payload?) {
  const normalizedPayload = {
    ...(payload && typeof payload === "object" ? payload : {}),
    allowedMentions: { repliedUser: false },
  };
  const botId = String(message?.client?.user?.id || "");
  if (!botId || !message?.channel?.messages?.fetch) {
    return safeMessageReply(message, normalizedPayload);
  }
  const recent = await withDiscordTimeout(
    message.channel.messages.fetch({ limit: 50 }).catch(() => null),
    8000,
    "profile reply scan",
  ).catch(() => null);
  const existing = recent?.find?.(
    (msg?) =>
      String(msg?.author?.id || "") === botId &&
      String(msg?.reference?.messageId || "") === String(message.id || "") &&
      msg?.editable,
  );
  if (existing) {
    await existing.delete().catch(() => null);
  }
  return safeMessageReply(message, normalizedPayload);
}

async function replyTenantPartnershipProfile(message?, targetUser?) {
  const payload = await buildTenantProfilePayload(message.client, message.guild, {
    ownerId: message.author.id,
    targetUserId: targetUser.id,
    section: TENANT_PROFILE_SECTIONS.HOME,
    discordLocale: message.author?.locale,
  });
  await upsertProfileReply(message, payload);
}

export = {
  name: "profile",
  keepCommandMessage: true,
  allowEmptyArgs: true,
  description: "Apre il profilo partnership su server tenant.",
  usage: "+profile [@utente]",
  examples: ["+profile", "+profile @Utente"],

  async execute(message?, args = []) {
    if (!message?.guild || !message?.author) return;

    const guildId = message.guild.id;

    if (shouldBlockTenantPartnershipPrefixCommands(guildId)) {
      return safeMessageReply(message, {
        ...(await tenantOnlyError(message, "`+profile`")),
        allowedMentions: NO_REPLY_MENTIONS,
      });
    }

    await message.channel.sendTyping().catch(() => {});

    if (isProfilePmModeArg(args)) {
      await safeMessageReply(message, {
        ...buildSimpleNoticePayload(
          "<:vegax:1443934876440068179> Qui usa solo `+profile` (senza `pm`).",
          message.guild,
        ),
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const targetUser = await resolveTargetUser(message, args);
    if (!targetUser) {
      await safeMessageReply(message, {
        ...(await tenantNoticePayload(message, "profile_userNotFound")),
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    if (targetUser.bot) {
      await replyProfileBotDenied(message);
      return;
    }

    if (!isPartnershipOperational(guildId)) {
      return replyPrefixSetupRequired(message, { keepCommandMessage: true });
    }

    const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
    if (denied) {
      return sendPartnersChatDeniedPrefixCleanup(message, denied);
    }

    if (await shouldRouteTenantPartnershipProfile(message)) {
      await replyTenantPartnershipProfile(message, targetUser);
      return;
    }

    // Main guild: same Discord partnership profile as tenant servers (no site redirect embed).
    if (isViniliFullFeatureGuild(guildId) && isPartnershipOperational(guildId)) {
      await replyTenantPartnershipProfile(message, targetUser);
      return;
    }

    if (shouldApplyMultiGuildLayer(guildId)) {
      return replyPrefixSetupRequired(message, { keepCommandMessage: true });
    }

    await safeMessageReply(message, {
      ...buildSimpleNoticePayload(
        "<:vegax:1443934876440068179> Il profilo partnership non è disponibile su questo server.",
        message.guild,
      ),
      allowedMentions: { repliedUser: false },
    });
  },
};
