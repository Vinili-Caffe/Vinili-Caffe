const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
const { isPartnershipOperational } = require("./partnershipConfigResolver") as typeof import("./partnershipConfigResolver");
const { buildTenantProfilePayload } = require("../../MultiGuild/utils/Partner/tenantProfileRuntime") as typeof import("../../MultiGuild/utils/Partner/tenantProfileRuntime");
const { TENANT_PROFILE_SECTIONS } = require("../../MultiGuild/utils/Partner/tenantProfileConstants") as typeof import("../../MultiGuild/utils/Partner/tenantProfileConstants");
const {
  replyTenantMessage,
} = require("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipPrefixMessages");
const { isChannelOrThreadUnderStaffCmds, isStaffCmdsPmCommandsThread } = require("../Staff/staffCmdsChannelUtils") as typeof import("../Staff/staffCmdsChannelUtils");
const { siteWorkflowUrl } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");

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

export = {
  name: "profile",
  keepCommandMessage: true,
  allowEmptyArgs: true,
  usage: "`+profile` · `+profile @utente`",
  examples: ["+profile", "+profile @Lore"],

  async execute(message?, args = []) {
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

    if ((await isStaffCmdsPmCommandsThread(message.channel)) || isChannelOrThreadUnderStaffCmds(message.channel)) {
      const base = siteWorkflowUrl("userProfile") || "https://www.viniliecaffe.it/user/";
      const profileUrl = `${base}${base.includes("?") ? "&" : "?"}tab=staff`;
      await safeMessageReply(message, {
        content: `<:VC_Staff:1494286904089247754> Il pannello staff Discord non è più attivo. Apri il profilo sul **sito**: ${profileUrl}`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!isViniliFullFeatureGuild(guildId) && shouldApplyMultiGuildLayer(guildId)) {
      return safeMessageReply(message, {
        content: await replyTenantMessage(message, "settings_notReady"),
        allowedMentions: { repliedUser: false },
        skipAutoCleanup: true,
      });
    }

    const personalizza = siteWorkflowUrl("userPersonalize") || "https://www.viniliecaffe.it/personalizza/";
    const userPage = siteWorkflowUrl("userProfile") || "https://www.viniliecaffe.it/user/";
    await safeMessageReply(message, {
      content:
        `<:VC_Attention:1482534443632558151> Il profilo Discord non è più attivo.\n` +
        `Personalizza: ${personalizza}\n` +
        `Profilo: ${userPage}`,
      allowedMentions: { repliedUser: false },
    });
  },
};