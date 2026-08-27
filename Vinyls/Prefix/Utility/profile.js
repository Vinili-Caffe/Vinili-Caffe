const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { EmbedBuilder } = require("discord.js");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy");
const {
  isPartnershipOperational,
  shouldRouteTenantPartnershipProfile,
  isProfilePmModeArg,
} = require("../../Utils/Partner/partnershipConfigResolver");
const { buildTenantProfilePayload } = require("../../Utils/Partner/tenantProfileRuntime");
const { TENANT_PROFILE_SECTIONS } = require("../../Utils/Partner/tenantProfileConstants");
const {
  replyTenantMessage,
  tenantNoticePayload,
} = require("../../Utils/Partner/tenantPartnershipPrefixMessages");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply");
const profileButton = require("../../Buttons/profile");
const { isChannelOrThreadUnderStaffCmds, isStaffCmdsPmCommandsThread } = require("../../Utils/Staff/staffCmdsChannelUtils");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils");
const { siteWorkflowUrl, buildSiteLinkRow } = require("../../Utils/Web/discordWorkflowUiGate");
const { buildSimpleNoticePayload } = require("../../Utils/Embeds/simpleNoticeEmbed");

async function replyStaffProfileMovedToSite(message) {
  const url = siteWorkflowUrl("staff");
  await safeMessageReply(message, {
    ...buildSimpleNoticePayload(
      "<:VC_Attention:1482534443632558151> Il **profilo staff** e la gestione (pex, pause, organico…) sono sul **sito staff** (non più via `+profile`).\n\n<a:VC_Arrow:1482706699365257397> " +
        url,
      message.guild,
    ),
    components: [buildSiteLinkRow("Apri area staff", url)],
    allowedMentions: { repliedUser: false },
  });
}

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

async function replyTenantPartnershipProfile(message, targetUser) {
  const payload = await buildTenantProfilePayload(message.client, message.guild, {
    ownerId: message.author.id,
    targetUserId: targetUser.id,
    section: TENANT_PROFILE_SECTIONS.HOME,
    discordLocale: message.author?.locale,
  });
  await upsertProfileReply(message, payload);
}

module.exports = {
  name: "profile",
  keepCommandMessage: true,
  allowEmptyArgs: true,
  subcommands: ["pm"],
  description:
    "Apre il profilo utente. Su tenant / thread Comandi PM (main): profilo partnership. Staff: solo sito.",
  usage: "+profile [@utente]",
  examples: ["+profile", "+profile @Utente"],
  subcommandUsages: {
    pm: "Alias deprecato: usa `+profile` nel thread Comandi PM",
  },
  subcommandDescriptions: {
    pm: "Stessa vista di `+profile` nel thread Comandi PM (senza bisogno di scrivere `pm`).",
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
    const isMain = isViniliFullFeatureGuild(guildId);
    const inPmCommandsThread = await isStaffCmdsPmCommandsThread(message.channel);

    // Tenant: solo `+profile` (senza `pm`) → profilo partnership come su main nel thread PM.
    if (pmMode && !isMain) {
      await safeMessageReply(message, {
        ...buildSimpleNoticePayload(
          "<:vegax:1443934876440068179> Qui usa solo `+profile` (senza `pm`).",
          message.guild,
        ),
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    // Main: vista partnership (ex `+profile pm`) solo nel thread Comandi PM, con `+profile` senza `pm`.
    if (isMain && (inPmCommandsThread || pmMode)) {
      if (!inPmCommandsThread) {
        const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel).catch(() => null);
        if (denied) {
          await sendPartnersChatDeniedPrefixCleanup(message, denied);
          return;
        }
        await safeMessageReply(message, {
          ...buildSimpleNoticePayload(
            "<:vegax:1443934876440068179> Il profilo partnership va usato solo nel thread **Comandi Partner Manager** (sotto `#staff-cmds`), con `+profile` (senza `pm`).",
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
        await safeMessageReply(message, {
          ...buildSimpleNoticePayload(
            "<:vegax:1443934876440068179> Il profilo partnership è riservato ai Partner Manager.",
            message.guild,
          ),
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      await replyTenantPartnershipProfile(message, targetUser);
      return;
    }

    // Tenant: stessa visualizzazione partnership di ex `+profile pm`, senza argomento `pm`.
    if (await shouldRouteTenantPartnershipProfile(message)) {
      await replyTenantPartnershipProfile(message, targetUser);
      return;
    }

    // Altri thread sotto #staff-cmds: profilo staff solo sul sito.
    if (isChannelOrThreadUnderStaffCmds(message.channel)) {
      await replyStaffProfileMovedToSite(message);
      return;
    }

    if (!isMain && shouldApplyMultiGuildLayer(guildId)) {
      return replyPrefixSetupRequired(message, { keepCommandMessage: true });
    }

    const payload = await profileButton
      .buildPanelPayload(
        message.guild,
        targetUser.id,
        message.client,
        "home",
        null,
        message.author.id,
      )
      .catch((err) => {
        global.logger?.warn?.("[profile] buildPanelPayload failed:", err?.message || err);
        return null;
      });
    if (!payload) {
      await safeMessageReply(message, {
        content:
          "<:VC_Attention:1482534443632558151> Il profilo non risponde in tempo (database o Discord lenti). Riprova tra qualche secondo.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await upsertProfileReply(message, payload);
  },
};
