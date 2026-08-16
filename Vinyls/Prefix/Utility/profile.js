const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { EmbedBuilder } = require("discord.js");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy");
const { isPartnershipOperational, shouldRouteTenantPartnershipProfile, isProfilePmModeArg } = require("../../Utils/Partner/partnershipConfigResolver");
const { buildTenantProfilePayload } = require("../../Utils/Partner/tenantProfileRuntime");
const { TENANT_PROFILE_SECTIONS } = require("../../Utils/Partner/tenantProfileConstants");
const { resolveTenantLanguageForMessage,
  replyTenantMessage, tenantNoticePayload } = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply");
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

async function replyProfileBotDenied(message) {
  await safeMessageReply(message, {
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setDescription(await replyTenantMessage(message, "profile_botNotAllowed")),
    ],
    allowedMentions: { repliedUser: false },
  });
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
  subcommands: ["pm"],
  description: "Apre il profilo (su tenant: partnership PM; su main: profilo utente, oppure `pm` per partnership).",
  usage: "+profile [@utente] · +profile pm [@utente] (solo main)",
  examples: ["+profile", "+profile @Utente", "+profile pm", "+profile pm @Utente"],
  subcommandUsages: {
    pm: "+profile pm [@utente] (solo server main)",
  },
  subcommandDescriptions: {
    pm: "Profilo partnership Partner Manager (solo server main).",
  },

  async execute(message, args = []) {
    if (!message?.guild || !message?.author) return;
    await message.channel.sendTyping().catch(() => {});
    const pmMode = isProfilePmModeArg(args);
    const resolveArgs = pmMode ? args.slice(1) : args;
    const targetUser = await resolveTargetUser(message, resolveArgs);
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
    const guildId = message.guild.id;
    if (pmMode) {
      // Tenant: solo `+profile`. `+profile pm` è riservato al server main.
      if (!isViniliFullFeatureGuild(guildId)) {
        const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed");
        await safeMessageReply(message, {
          ...buildSimpleNoticePayload(
            "<:vegax:1443934876440068179> Qui usa solo `+profile` (senza `pm`).",
            message.guild,
          ),
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      if (!isPartnershipOperational(guildId)) {
        return replyPrefixSetupRequired(message, { keepCommandMessage: true });
      }
      if (!(await shouldRouteTenantPartnershipProfile(message, { forcePmMode: true }))) {
        const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed");
        await safeMessageReply(message, {
          ...buildSimpleNoticePayload(
            "<:vegax:1443934876440068179> Il profilo partnership PM è riservato ai Partner Manager.",
            message.guild,
          ),
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      const payload = await buildTenantProfilePayload(message.client, message.guild, {
        ownerId: message.author.id,
        targetUserId: targetUser.id,
        section: TENANT_PROFILE_SECTIONS.HOME,
        discordLocale: message.author?.locale,
      });
      await upsertProfileReply(message, payload);
      return;
    }
    if (await shouldRouteTenantPartnershipProfile(message)) {
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
      return replyPrefixSetupRequired(message, { keepCommandMessage: true });
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