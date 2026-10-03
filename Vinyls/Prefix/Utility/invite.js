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

function buildBotInviteUrl(client) {
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
