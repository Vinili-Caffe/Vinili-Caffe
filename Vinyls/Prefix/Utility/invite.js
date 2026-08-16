const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const {
  applyPartnershipPayloadBranding,
  resolveEmbedColorForGuild,
} = require("../../MultiGuild/utils/tenantEmbedBranding");
const { t } = require("../../Utils/Partner/tenantPartnershipI18n");
const { resolveTenantLanguageForMessage } = require("../../Utils/Partner/tenantPartnershipPrefixMessages");

function resolveBotClientId(client) {
  return String(
    client?.user?.id ||
      process.env.DISCORD_CLIENT_ID ||
      process.env.DISCORD_CLIENT_ID_OFFICIAL ||
      IDs?.bots?.ViniliCaffeBot ||
      "",
  ).trim();
}

function buildBotInviteUrl(client) {
  const clientId = resolveBotClientId(client);
  if (!clientId) return null;
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(PermissionFlagsBits.Administrator),
    scope: "bot applications.commands",
  });
  return `https://discord.com/api/oauth2/authorize?${params.toString()}`;
}

module.exports = {
  name: "invite",
  tenantOnly: true,
  allowEmptyArgs: true,
  description: "Genera il link di invito per aggiungere il bot a un altro server.",
  usage: "+invite",
  examples: ["+invite"],

  async execute(message) {
    await message.channel.sendTyping().catch(() => null);
    if (!message.guild) return;

    const guildId = message.guild.id;
    if (isViniliFullFeatureGuild(guildId)) {
      return safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> `+invite` è disponibile solo sugli altri server (partnership).",
        allowedMentions: { repliedUser: false },
      });
    }

    const lang = await resolveTenantLanguageForMessage(message);

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
  },
};
