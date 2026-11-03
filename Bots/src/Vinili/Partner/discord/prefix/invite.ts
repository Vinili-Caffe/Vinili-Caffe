const { EmbedBuilder, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const {
  applyPartnershipPayloadBranding,
  resolveEmbedColorForGuild,
} = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { t } = require("../../i18n/tenantPartnershipI18n/index") as typeof import("../../i18n/tenantPartnershipI18n/index");
const { resolveTenantLanguageForMessage } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");
const { shouldApplyMainPartnershipFilters } = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");

function resolveBotClientId(client?) {
  /* botInviteFix2: always Vinili official — never Caffè/test (code-grant locked) */
  const official = String(
    process.env.DISCORD_CLIENT_ID_OFFICIAL ||
      process.env.DISCORD_CLIENT_ID ||
      IDs?.bots?.ViniliCaffeBot ||
      "",
  ).trim();
  if (/^\d{17,22}$/.test(official)) return official;
  const live = String(client?.user?.id || "").trim();
  if (/^\d{17,22}$/.test(live) && live !== String(IDs?.bots?.ViniliCaffeBotTest || "").trim()) {
    return live;
  }
  return "";
}

function buildBotInviteUrl(client?) {
  const clientId = resolveBotClientId(client);
  if (!clientId) return null;
  /* botInviteScopes2: same as dashboard — code + guilds.join + prompt=none */
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(PermissionFlagsBits.Administrator),
    response_type: "code",
    redirect_uri: "https://viniliecaffe.it/",
    integration_type: "0",
    scope: "applications.commands.permissions.update bot applications.commands guilds.join",
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function sendInvitePayload(message?, lang?) {
  const guildId = message.guild.id;
  const inviteUrl = buildBotInviteUrl(message.client);
  if (!inviteUrl) {
    return safeMessageReply(message, {
      content: t(lang, "invite_error"),
      allowedMentions: { repliedUser: false },
    });
  }

  const embed = new EmbedBuilder()
    .setColor(resolveEmbedColorForGuild(guildId))
    .setDescription(t(lang, "invite_link", { url: inviteUrl }));

  const payload = applyPartnershipPayloadBranding(
    { embeds: [embed], allowedMentions: { repliedUser: false } },
    {
      guildId,
      guild: message.guild,
      client: message.client,
      includeBanner: false,
    },
  );

  return safeMessageReply(message, payload);
}

async function executeMainInvite(message?, lang?) {
  return sendInvitePayload(message, lang);
}

async function executeTenantInvite(message?, lang?) {
  return sendInvitePayload(message, lang);
}

export = {
  name: "invite",
  allowEmptyArgs: true,
  description: "Genera il link di invito per aggiungere il bot a un altro server.",
  usage: "+invite",
  examples: ["+invite"],

  async execute(message?) {
    await message.channel.sendTyping().catch(() => null);
    if (!message.guild) return;
    const lang = await resolveTenantLanguageForMessage(message);
    if (shouldApplyMainPartnershipFilters(message.guild.id)) {
      return executeMainInvite(message, lang);
    }
    return executeTenantInvite(message, lang);
  },
};
