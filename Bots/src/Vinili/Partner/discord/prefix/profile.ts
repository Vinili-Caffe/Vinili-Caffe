const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { shouldApplyMultiGuildLayer } = require("../../../../MultiGuild/core/accessPolicy") as typeof import("../../../../MultiGuild/core/accessPolicy");
const {
  isPartnershipOperational,
  isProfilePmModeArg,
  shouldApplyMainPartnershipFilters,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const {
  rejectIfPartnershipToolkitBlocked,
} = require("../../core/partnershipPrefixToolkit") as typeof import("../../core/partnershipPrefixToolkit");
const { buildTenantProfilePayload } = require("../../tenant/tenantProfileRuntime") as typeof import("../../tenant/tenantProfileRuntime");
const { TENANT_PROFILE_SECTIONS } = require("../../tenant/tenantProfileConstants") as typeof import("../../tenant/tenantProfileConstants");
const {
  replyTenantMessage,
  tenantNoticePayload,
} = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../runtime/partnersChatChannelUtils") as typeof import("../../runtime/partnersChatChannelUtils");
const { buildSimpleNoticePayload } = require("../../../../shared/embeds/simpleNoticeEmbed") as typeof import("../../../../shared/embeds/simpleNoticeEmbed");
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

async function replyPartnershipProfile(message?, targetUser?) {
  const payload = await buildTenantProfilePayload(message.client, message.guild, {
    ownerId: message.author.id,
    targetUserId: targetUser.id,
    section: TENANT_PROFILE_SECTIONS.HOME,
    discordLocale: message.author?.locale,
  });
  await upsertProfileReply(message, payload);
}

async function prepareProfileTarget(message?, args = []) {
  if (await rejectIfPartnershipToolkitBlocked(message, "+profile", NO_REPLY_MENTIONS)) {
    return null;
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
    return null;
  }

  const targetUser = await resolveTargetUser(message, args);
  if (!targetUser) {
    await safeMessageReply(message, {
      ...(await tenantNoticePayload(message, "profile_userNotFound")),
      allowedMentions: { repliedUser: false },
    });
    return null;
  }
  if (targetUser.bot) {
    await replyProfileBotDenied(message);
    return null;
  }

  const guildId = message.guild.id;
  if (!isPartnershipOperational(guildId)) {
    await replyPrefixSetupRequired(message, { keepCommandMessage: true });
    return null;
  }

  const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
  if (denied) {
    await sendPartnersChatDeniedPrefixCleanup(message, denied);
    return null;
  }

  return targetUser;
}

async function executeMainProfile(message?, args = []) {
  const targetUser = await prepareProfileTarget(message, args);
  if (!targetUser) return;
  await replyPartnershipProfile(message, targetUser);
}

async function executeTenantProfile(message?, args = []) {
  const targetUser = await prepareProfileTarget(message, args);
  if (!targetUser) return;

  const guildId = message.guild.id;
  if (isPartnershipOperational(guildId)) {
    await replyPartnershipProfile(message, targetUser);
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
}

export = {
  name: "profile",
  keepCommandMessage: true,
  allowEmptyArgs: true,
  description: "Apre il profilo partnership di un Partner Manager.",
  usage: "+profile [@utente]",
  examples: ["+profile", "+profile @Utente"],

  async execute(message?, args = []) {
    if (!message?.guild || !message?.author) return;
    if (shouldApplyMainPartnershipFilters(message.guild.id)) {
      return executeMainProfile(message, args);
    }
    return executeTenantProfile(message, args);
  },
};
