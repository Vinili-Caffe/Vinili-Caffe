const { safeChannelSend } = require("../../../shared/discord/replyRuntime");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { AvatarPrivacy } = require("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const AVATAR_MODE_PREFIX = "avatar_mode:";

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .trim();
}

async function resolveMember(message, query) {
  const mention = message.mentions?.members?.first();
  if (mention) return mention;
  const id = String(query || "").replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return await getGuildMemberCached(message.guild, id);
  }
  if (!query) return null;
  const target = normalize(query);
  return (
    message.guild.members.cache.find((member) => {
      const username = normalize(member.user?.username);
      const displayName = normalize(member.displayName);
      const tag = normalize(member.user?.tag);
      return username === target || displayName === target || tag === target;
    }) || null
  );
}

module.exports = {
  skipPrefix: false,
  name: "avatar",
  aliases: ["av"],
  allowEmptyArgs: true,

  async execute(message, args) {
    if (!message.guild) {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.",
            ),
        ],
      });
    }

    const subRaw = args[0] ? String(args[0]).toLowerCase() : "";
    if (subRaw === "guild") {
      return safeChannelSend(message.channel, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> `+avatar guild` non esiste più. Usa `+avatar` e cambia vista con le frecce."),
        ],
      });
    }
    const selectedMode = ["server", "user"].includes(subRaw) ? subRaw : "user";
    const query = ["server", "user"].includes(subRaw) ? args.slice(1).join(" ") : args.join(" ");

    const member = (await resolveMember(message, query)) || message.member;
    const payload = await buildAvatarPayload({
      guild: message.guild,
      targetMember: member,
      fallbackUser: message.author,
      requesterId: message.author.id,
      mode: selectedMode,
    });
    return safeChannelSend(message.channel, payload);
  },
  AVATAR_MODE_PREFIX,
  buildAvatarPayload,
};

function buildAvatarRows(requesterId, targetUserId, mode = "user") {
  const activeMode = mode === "server" ? "server" : "user";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${AVATAR_MODE_PREFIX}${requesterId}:${targetUserId}:user`)
        .setStyle(activeMode === "user" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji("⬅️"),
      new ButtonBuilder()
        .setCustomId(`${AVATAR_MODE_PREFIX}${requesterId}:${targetUserId}:server`)
        .setStyle(activeMode === "server" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji("➡️"),
      new ButtonBuilder()
        .setCustomId("avatar_views")
        .setLabel("Classifica Views")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function buildAvatarPayload({ guild, targetMember, fallbackUser, requesterId, mode = "user" }) {
  const member = targetMember || null;
  const user = member?.user || fallbackUser || null;
  if (!guild || !user) {
    return {
      embeds: [new EmbedBuilder().setColor("Red").setDescription("<:vegax:1443934876440068179> Impossibile trovare questo utente.")],
      components: [],
    };
  }

  let privacyDoc = null;
  try {
    privacyDoc = await AvatarPrivacy.findOneAndUpdate(
      { guildId: guild.id, userId: user.id },
      { $setOnInsert: { guildId: guild.id, userId: user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[avatar] fetch:", err?.message || err);
  }

  if (Boolean(privacyDoc?.blocked)) {
    const blockedEmbed = new EmbedBuilder()
      .setColor("#e74c3c")
      .setTitle("<:vegax:1443934876440068179> Avatar Bloccato")
      .setThumbnail("https://images-ext-1.discordapp.net/external/qZp8C7dthauZs3SMmWIVqoxSjwXkKvmCXhZpro2lLzI/%3Fformat%3Dwebp%26quality%3Dlossless%26width%3D640%26height%3D640/https/images-ext-1.discordapp.net/external/fRgXgmNV39-c_gorTdDdWPSyx2fFy_i4t01cYEF-DKY/https/i.imgur.com/7OnTq5S.png?format=webp&quality=lossless&width=640&height=640")
      .setDescription("Questo utente ha bloccato la visualizzazione del proprio avatar.");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`avatar_unblock:${user.id}`)
        .setLabel("Sblocca")
        .setEmoji("<a:VC_Unlock:1482532082466029608>")
        .setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [blockedEmbed], components: [row] };
  }

  let privacyCount = null;
  try {
    privacyCount = await AvatarPrivacy.findOneAndUpdate(
      { guildId: guild.id, userId: user.id },
      { $inc: { views: 1 } },
      { new: true },
    );
  } catch (err) {
    global.logger?.warn?.("[avatar] fetch:", err?.message || err);
  }

  const totalViews = Number(privacyCount?.views || 0);
  const userAvatar = user.displayAvatarURL({ extension: "png", size: 4096, forceStatic: true });
  const memberAvatar = member?.displayAvatarURL?.({ extension: "png", size: 4096, forceStatic: true }) || userAvatar;
  const hasServerAvatar = memberAvatar !== userAvatar;
  const activeMode = mode === "server" ? "server" : "user";
  const imageUrl = activeMode === "server" ? memberAvatar : userAvatar;
  const authorLabel = member?.displayName || member?.user?.username || user.tag;
  const embed = new EmbedBuilder()
    .setTitle(activeMode === "user" ? "User Avatar" : "Server Avatar")
    .setAuthor({ name: authorLabel, iconURL: user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }) })
    .setColor("#6f4e37")
    .setFooter({
      text: `Puoi disabilitare la visualizzazione del tuo avatar tramite il comando ?blockav.\n${totalViews} Views 👁️`,
    });
  if (activeMode === "server" && !hasServerAvatar) {
    embed.setDescription("<:vegax:1443934876440068179> Non ha un avatar impostato solo per questo server.");
  } else {
    embed.setImage(imageUrl);
  }
  return {
    embeds: [embed],
    components: buildAvatarRows(requesterId || user.id, user.id, activeMode),
  };
}