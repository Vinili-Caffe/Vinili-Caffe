const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope");
const { setTenantQuoteChannel } = require("../../MultiGuild/core/tenantGuildSettings");
const { resolveQuoteChannelId } = require("../../Utils/Quote/quotePostChannel");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");

const CLEAR_TOKENS = new Set(["off", "none", "reset", "disable", "disabled", "remove", "clear"]);
const HERE_TOKENS = new Set(["here", "this", "current"]);

function memberCanManageSettings(member) {
  if (!member?.permissions) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

async function resolveSettingsChannel(message, rawArg) {
  const guild = message.guild;
  if (!guild) return { channel: null, error: "guild_missing" };
  const raw = String(rawArg || "").trim();
  if (!raw) return { channel: null, error: "missing_channel" };
  const lower = raw.toLowerCase();
  if (CLEAR_TOKENS.has(lower)) return { channel: null, clear: true };
  if (HERE_TOKENS.has(lower)) {
    const here = message.channel;
    if (!here?.isTextBased?.()) return { channel: null, error: "invalid_channel" };
    return { channel: here };
  }
  const mention = raw.match(/^<#(\d{16,20})>$/);
  const channelId = mention ? mention[1] : /^\d{16,20}$/.test(raw) ? raw : null;
  if (!channelId) return { channel: null, error: "invalid_channel" };
  const channel =
    guild.channels.cache.get(channelId) ||
    (await getGuildChannelCached(guild, channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { channel: null, error: "invalid_channel" };
  return { channel };
}

function botCanPostInChannel(guild, channel) {
  const me = guild?.members?.me;
  if (!me || !channel?.permissionsFor) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) &&
    perms?.has(PermissionFlagsBits.SendMessages),
  );
}

async function buildSettingsShowEmbed(guild) {
  const quoteChannelId = resolveQuoteChannelId(guild.id);
  let quoteValue = "Non impostato — le quote restano solo nel canale del comando.";
  if (quoteChannelId) {
    const channel =
      guild.channels.cache.get(quoteChannelId) ||
      (await getGuildChannelCached(guild, quoteChannelId).catch(() => null));
    quoteValue = channel ? `<#${channel.id}>` : `\`${quoteChannelId}\` *(canale non trovato)*`;
  }
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Impostazioni server")
    .setDescription("Configurazione bot per questo server tenant.")
    .addFields(
      {
        name: "Canale quote",
        value: [
          quoteValue,
          "",
          "Imposta con `+settings quotes #canale`, `+settings quotes here` o rimuovi con `+settings quotes off`.",
        ].join("\n"),
      },
    )
    .setFooter({ text: "Richiede Gestisci server" });
}

module.exports = {
  name: "settings",
  tenantOnly: true,
  allowEmptyArgs: true,
  description: "Impostazioni bot per server tenant (canale quote, ecc.).",
  usage: "+settings [show | quotes <canale | here | off>]",
  examples: ["+settings", "+settings quotes #quote", "+settings quotes here", "+settings quotes off"],
  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    if (isViniliFullFeatureGuild(message.guild.id)) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> `+settings` è disponibile solo sui server tenant.",
        allowedMentions: { repliedUser: false },
      });
    }
    if (!memberCanManageSettings(message.member)) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Ti serve il permesso **Gestisci server** per usare questo comando.",
        allowedMentions: { repliedUser: false },
      });
    }

    const sub = String(args[0] || "show").trim().toLowerCase();
    if (sub === "show" || sub === "list" || !sub) {
      const embed = await buildSettingsShowEmbed(message.guild);
      return safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    }

    if (sub !== "quotes" && sub !== "quote") {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Uso: `+settings` · `+settings quotes #canale` · `+settings quotes here` · `+settings quotes off`",
        allowedMentions: { repliedUser: false },
      });
    }

    const channelArg = args.slice(1).join(" ").trim();
    if (!channelArg) {
      const embed = await buildSettingsShowEmbed(message.guild);
      return safeMessageReply(message, {
        embeds: [embed],
        allowedMentions: { repliedUser: false },
      });
    }

    const resolved = await resolveSettingsChannel(message, channelArg);
    if (resolved.error === "invalid_channel") {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Canale non valido. Usa `#canale`, l'ID, `here` oppure `off`.",
        allowedMentions: { repliedUser: false },
      });
    }

    if (resolved.clear) {
      const result = await setTenantQuoteChannel(message.guild.id, null);
      if (!result.ok) {
        return safeMessageReply(message, {
          content: "<:vegax:1443934876440068179> Impossibile salvare l'impostazione. Riprova tra poco.",
          allowedMentions: { repliedUser: false },
        });
      }
      return safeMessageReply(message, {
        content: "<:vegacheckmark:1443666279058772028> Canale quote rimosso. Le quote resteranno solo nel canale del comando.",
        allowedMentions: { repliedUser: false },
      });
    }

    const channel = resolved.channel;
    if (!channel || !botCanPostInChannel(message.guild, channel)) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Non posso inviare messaggi in quel canale. Controlla permessi del bot.",
        allowedMentions: { repliedUser: false },
      });
    }

    const result = await setTenantQuoteChannel(message.guild.id, channel.id);
    if (!result.ok) {
      return safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Impossibile salvare l'impostazione. Riprova tra poco.",
        allowedMentions: { repliedUser: false },
      });
    }

    return safeMessageReply(message, {
      content: `<:vegacheckmark:1443666279058772028> Canale quote impostato su ${channel}.`,
      allowedMentions: { repliedUser: false },
    });
  },
};