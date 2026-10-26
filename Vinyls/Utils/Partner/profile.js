const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy");
const { isPartnershipOperational } = require("../../Utils/Partner/partnershipConfigResolver");
const { buildTenantProfilePayload } = require("../../Utils/Partner/tenantProfileRuntime");
const { TENANT_PROFILE_SECTIONS } = require("../../Utils/Partner/tenantProfileConstants");
const {
  replyTenantMessage,
} = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const profileButton = require("../../Buttons/profile");
const { buildStaffProfilePayload, SECTION_HOME } = require("../../Utils/Staff/staffProfilePanelRuntime");
const { isChannelOrThreadUnderStaffCmds, isStaffCmdsPmCommandsThread } = require("../../Utils/Staff/staffCmdsChannelUtils");

function withDiscordTimeout(promise, ms = 8000, label = "discord") {
  const limit = Math.max(500, Number(ms) || 8000);
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${limit}ms`));
      }, limit);
      timer.unref?.();
    }),
  ]);
}

async function resolveTargetUser(message, args = []) {
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

async function upsertProfileReply(message, payload) {
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
    (msg) =>
      String(msg?.author?.id || "") === botId &&
      String(msg?.reference?.messageId || "") === String(message.id || "") &&
      msg?.editable,
  );
  if (existing) {
    await existing.delete().catch(() => null);
  }
  return safeMessageReply(message, normalizedPayload);
}

module.exports = {
  name: "profile",
  keepCommandMessage: true,
  allowEmptyArgs: true,
  usage: "`+profile` · `+profile @utente`",
  examples: ["+profile", "+profile @Lore"],

  async execute(message, args = []) {
    if (!message?.guild || !message?.author) return;
    await message.channel.sendTyping().catch(() => {});
    const targetUser = await resolveTargetUser(message, args);
    if (!targetUser) {
      await safeMessageReply(message, {
        content: await replyTenantMessage(message, "profile_userNotFound"),
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const guildId = message.guild.id;
    if (!isViniliFullFeatureGuild(guildId) && isPartnershipOperational(guildId)) {
      const payload = await buildTenantProfilePayload(message.client, message.guild, {
        ownerId: message.author.id,
        targetUserId: targetUser.id,
        section: TENANT_PROFILE_SECTIONS.HOME,
        discordLocale: message.author?.locale,
      });
      await upsertProfileReply(message, payload);
      return;
    }

    if (await isStaffCmdsPmCommandsThread(message.channel)) {
      const staffPayload = await buildStaffProfilePayload(
        message.guild,
        targetUser.id,
        message.author.id,
        message.client,
        SECTION_HOME,
        { sourceMessageId: message.id, partnersChatPanel: true, sourceChannel: message.channel },
      );
      await upsertProfileReply(message, staffPayload);
      return;
    }

    if (isChannelOrThreadUnderStaffCmds(message.channel)) {
      const staffPayload = await buildStaffProfilePayload(
        message.guild,
        targetUser.id,
        message.author.id,
        message.client,
        SECTION_HOME,
        { sourceMessageId: message.id, partnersChatPanel: false, sourceChannel: message.channel },
      );
      await upsertProfileReply(message, staffPayload);
      return;
    }

    if (!isViniliFullFeatureGuild(guildId) && shouldApplyMultiGuildLayer(guildId)) {
      return safeMessageReply(message, {
        content: await replyTenantMessage(message, "settings_notReady"),
        allowedMentions: { repliedUser: false },
        skipAutoCleanup: true,
      });
    }

    const payload = await profileButton.buildPanelPayload(
      message.guild,
      targetUser.id,
      message.client,
      "home",
      null,
      message.author.id,
    ).catch((err) => {
      global.logger?.warn?.("[profile] buildPanelPayload failed:", err?.message || err);
      return null;
    });
    if (!payload) {
      await safeMessageReply(message, {
        content: "<:VC_Attention:1482534443632558151> Il profilo non risponde in tempo (database o Discord lenti). Riprova tra qualche secondo.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await upsertProfileReply(message, payload);
  },
};