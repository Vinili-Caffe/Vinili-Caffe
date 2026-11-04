const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  pickSnipeEntryForChannel,
  redactSnipeContentForMinigame,
} = require("../../../Minigames/services/minigameService") as typeof import("../../../Minigames/services/minigameService");

export = {
  name: "snipe",
  allowEmptyArgs: true,
  async execute(message?, args?, client?) {
    await message.channel.sendTyping();
    if (!message.guild) return;
    if (!client.snipes || !(client.snipes instanceof Map)) {
      client.snipes = new Map();
    }
    const targetChannel = message.mentions?.channels?.first() || message.channel;
    const channelId = targetChannel.id;
    const raw = client.snipes.get(channelId);
    const history = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const snipe = pickSnipeEntryForChannel(client, channelId, history);

    if (!snipe) {
      const where = targetChannel.id !== message.channel.id ? ` in ${targetChannel}` : "";
      const hiddenByMinigame = history.some((item?) => item && !item.isEmbedOnly);
      return safeMessageReply(message, {
        content: hiddenByMinigame
          ? `${E.vegax} Nessun messaggio snipabile${where} (risposte minigame nascoste).`
          : `${E.vegax} Nessun messaggio eliminato recentemente${where}.`,
        allowedMentions: { repliedUser: false },
      });
    }
    const rawContent = redactSnipeContentForMinigame(
      client,
      channelId,
      String(snipe.content || "").trim(),
    );
    const safeContent = rawContent
      ? rawContent.replace(/```/g, "\\`\\`\\`")
      : `*${E.vegax} Nessun contenuto*`;
    const maxFieldPayload = 980;
    const clippedContent =
      safeContent.length > maxFieldPayload ? `${safeContent.slice(0, maxFieldPayload)}...` : safeContent;
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .addFields(
        {
          name: `${E.member_role_icon} Messaggio inviato da:`,
          value: snipe.authorId ? `<@${snipe.authorId}> (${snipe.authorTag})` : "Sconosciuto",
          inline: true,
        },
        {
          name: `${E.VC_BlackPin} Canale:`,
          value: snipe.channel || `${targetChannel}`,
          inline: true,
        },
        {
          name: `${E.VC_Chat} Contenuto:`,
          value: `\`\`\`${clippedContent}\`\`\``,
        },
      )
      .setTimestamp();
    if (snipe.attachment && !String(rawContent).includes("nascosto")) {
      embed.setImage(snipe.attachment);
    }
    return safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};
