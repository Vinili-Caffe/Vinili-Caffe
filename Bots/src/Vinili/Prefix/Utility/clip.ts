const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  exportClipFromCommand,
  parseClipDurationSec,
} = require("../../Services/Voice/voiceClipService") as typeof import("../../Services/Voice/voiceClipService");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../../shared/utils/ephemeralMessageTtl") as typeof import("../../../shared/utils/ephemeralMessageTtl");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { isTenantBoardFeatureEnabledSync } = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");

const CLIP_DISABLED_MESSAGE = "Le clip sono disattivate su questo server.";

export = {
  name: "clip",
  allowEmptyArgs: true,
  async execute(message?, args?) {
    if (!message?.guild) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando funziona solo in un server."),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (!isTenantBoardFeatureEnabledSync(message.guild.id, "clip")) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`<:vegax:1443934876440068179> ${CLIP_DISABLED_MESSAGE}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      const warn = await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription("<:vegax:1443934876440068179> Devi essere in un canale vocale."),
        ],
        allowedMentions: { repliedUser: false },
      });
      if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
      return;
    }

    const parsed = parseClipDurationSec(args, message.client);
    if (!parsed.ok) {
      const fail = await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("#ED4245")
            .setDescription(`<:vegax:1443934876440068179> ${parsed.message}`),
        ],
        allowedMentions: { repliedUser: false },
      });
      if (fail) scheduleMessageDeletion(fail, EPHEMERAL_TTL_SHORT_MS);
      return;
    }

    const pending = await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor(TENANT_EMBED_COLOR)
          .setDescription(`🎙️ Estrazione ultimi **${parsed.seconds}s** in corso…`),
      ],
      allowedMentions: { repliedUser: false },
    });

    const result = await exportClipFromCommand({
      guild: message.guild,
      requester: message.member || message.author,
      voiceChannel,
      commandChannel: message.channel,
      client: message.client,
      seconds: parsed.seconds,
    });

    if (!result.ok) {
      const failEmbed = new EmbedBuilder()
        .setColor("#ED4245")
        .setDescription(`<:vegax:1443934876440068179> ${result.message || "Clip non riuscita."}`);
      if (pending?.editable) {
        await pending.edit({ embeds: [failEmbed], components: [] }).catch(() => null);
        scheduleMessageDeletion(pending, EPHEMERAL_TTL_SHORT_MS);
        return;
      }
      const fail = await safeMessageReply(message, { embeds: [failEmbed], allowedMentions: { repliedUser: false } });
      if (fail) scheduleMessageDeletion(fail, EPHEMERAL_TTL_SHORT_MS);
      return;
    }

    if (pending?.editable) {
      await pending.edit({
        embeds: [EmbedBuilder.from((result.ackEmbed as any))],
        components: [],
        allowedMentions: { users: [message.author.id] },
      }).catch(() => null);
      return;
    }

    await safeMessageReply(message, {
      embeds: [EmbedBuilder.from((result.ackEmbed as any))],
      allowedMentions: { users: [message.author.id] },
    });
  },
};