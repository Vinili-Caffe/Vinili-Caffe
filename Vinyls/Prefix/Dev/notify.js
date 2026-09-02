const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { isPartnershipOperational } = require("../../Utils/Partner/partnershipConfigResolver");
const { recordTenantStaffNotification } = require("../../Services/Partner/tenantStaffNotificationService");
const { getDevIds, isMainGuild } = require("../../Utils/Moderation/commandPermissions");
const { replyPrefixSetupRequired } = require("../../Utils/Partner/tenantSetupRequiredReply");

function isBotDev(userId, client) {
  return getDevIds(client).includes(String(userId || ""));
}

module.exports = {
  skipPrefix: true,
  name: "notify",
  allowEmptyArgs: false,
  hideFromHelp: true,
  description: "Registra una notifica staff per i Partner Manager (solo main, dev bot).",
  usage: "+notify <messaggio>",
  examples: ["+notify Aggiornamento partnership in corso!"],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => null);
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    const guildId = message.guild.id;
    if (!isMainGuild(guildId)) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> `+notify` è disponibile solo sul server principale.",
        allowedMentions: { repliedUser: false },
      });
    }

    if (!isBotDev(message.author.id, message.client)) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Solo gli sviluppatori del bot possono usare `+notify`.",
        allowedMentions: { repliedUser: false },
      });
    }

    if (!isPartnershipOperational(guildId)) {
      return replyPrefixSetupRequired(message);
    }

    const text = String(args.join(" ") || "").trim();
    if (!text) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Scrivi il testo della notifica dopo `+notify`.",
        allowedMentions: { repliedUser: false },
      });
    }

    await recordTenantStaffNotification(guildId, text, message.author.id);

    return safeMessageReply(message, {
      content: "<:success:1461731530333229226> Notifica registrata nel profilo.",
      allowedMentions: { repliedUser: false },
    });
  },
};
