const { safeChannelSend } = require("../../../shared/discord/replyRuntime");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { BannerPrivacy } = require("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const BANNER_MODE_PREFIX = "banner_mode:";

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
  name: "banner",
  aliases: ["bn"],
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
            .setDescription("<:vegax:1443934876440068179> `+banner guild` non esiste più. Usa `+banner` e cambia vista con le frecce."),
        ],
      });
    }
    const selectedMode = ["user", "server"].includes(subRaw) ? subRaw : "user";
    const query = ["user", "server"].includes(subRaw) ? args.slice(1).join(" ") : args.join(" ");

    const member = (await resolveMember(message, query)) || message.member;
    const payload = await buildBannerPayload({
      guild: message.guild,
      targetMember: member,
      fallbackUser: message.author,
      requesterId: message.author.id,
      mode: selectedMode,
    });
    return safeChannelSend(message.channel, payload);
  },
  BANNER_MODE_PREFIX,
  buildBannerPayload,
};

function normalizeViewState(state) {
  const base = { user: false, server: false };
  if (!state || typeof state !== "object") return base;
  base.user = Boolean(state.user);
  base.server = Boolean(state.server);
  return base;
}

function encodeViewState(state) {
  const normalized = normalizeViewState(state);
  return `${normalized.user ? 1 : 0}${normalized.server ? 1 : 0}`;
}

function buildBannerRows(requesterId, targetUserId, mode = "user", viewState = null) {
  const activeMode = mode === "server" ? "server" : "user";
  const stateToken = encodeViewState(viewState);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BANNER_MODE_PREFIX}${requesterId}:${targetUserId}:user:${stateToken}`)
        .setStyle(activeMode === "user" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji("⬅️"),
      new ButtonBuilder()
        .setCustomId(`${BANNER_MODE_PREFIX}${requesterId}:${targetUserId}:server:${stateToken}`)
        .setStyle(activeMode === "server" ? ButtonStyle.Primary : ButtonStyle.Secondary)
        .setEmoji("➡️"),
      new ButtonBuilder()
        .setCustomId("banner_views")
        .setLabel("Classifica Views")
        .setEmoji("📊")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function buildBannerPayload({ guild, targetMember, fallbackUser, requesterId, mode = "user", viewState = null }) {
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
    privacyDoc = await BannerPrivacy.findOne({ guildId: guild.id, userId: user.id });
  } catch (err) {
    global.logger?.warn?.("[banner] fetch:", err?.message || err);
  }

  if (Boolean(privacyDoc?.blocked)) {
    const blockedEmbed = new EmbedBuilder()
      .setColor("#e74c3c")
      .setTitle("<:vegax:1443934876440068179> Banner Bloccato")
      .setThumbnail("https://images-ext-1.discordapp.net/external/qZp8C7dthauZs3SMmWIVqoxSjwXkKvmCXhZpro2lLzI/%3Fformat%3Dwebp%26quality%3Dlossless%26width%3D640%26height%3D640/https/images-ext-1.discordapp.net/external/fRgXgmNV39-c_gorTdDdWPSyx2fFy_i4t01cYEF-DKY/https/i.imgur.com/7OnTq5S.png?format=webp&quality=lossless&width=640&height=640")
      .setDescription("Questo utente ha bloccato la visualizzazione del proprio banner.");
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`banner_unblock:${user.id}`)
        .setLabel("Sblocca")
        .setEmoji("<a:VC_Unlock:1482532082466029608>")
        .setStyle(ButtonStyle.Secondary),
    );
    return { embeds: [blockedEmbed], components: [row] };
  }

  let fetchedUser = user;
  try {
    fetchedUser = await user.fetch();
  } catch (err) {
    global.logger?.warn?.("[banner] fetch:", err?.message || err);
  }

  const activeMode = mode === "server" ? "server" : "user";
  const userBanner = fetchedUser.bannerURL({ extension: "png", size: 4096, forceStatic: true });
  const serverBanner = member?.bannerURL?.({ extension: "png", size: 4096, forceStatic: true }) || null;
  const canCountThisMode = activeMode === "user" ? Boolean(userBanner) : Boolean(serverBanner);
  const nextViewState = normalizeViewState(viewState);
  let privacyCount = null;
  const shouldCountNow = canCountThisMode && !nextViewState[activeMode];
  if (shouldCountNow) {
    try {
      privacyCount = await BannerPrivacy.findOneAndUpdate(
        { guildId: guild.id, userId: user.id },
        { $inc: { views: 1 } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      nextViewState[activeMode] = true;
    } catch (err) {
      global.logger?.warn?.("[banner] fetch:", err?.message || err);
    }
  } else {
    try {
      privacyCount = await BannerPrivacy.findOne({ guildId: guild.id, userId: user.id });
    } catch (err) {
      global.logger?.warn?.("[banner] fetch:", err?.message || err);
    }
  }

  const totalViews = Number(privacyCount?.views || 0);
  const authorLabel = member?.displayName || member?.user?.username || user.tag;
  const embed = new EmbedBuilder()
    .setTitle(activeMode === "user" ? "User Banner" : "Server Banner")
    .setAuthor({ name: authorLabel, iconURL: user.displayAvatarURL() })
    .setColor("#6f4e37")
    .setFooter({
      text: `Puoi disabilitare la visualizzazione del tuo banner tramite il comando +profile.\n${totalViews} Views 👁️`,
    });
  const imageUrl = activeMode === "server" ? serverBanner : userBanner;
  if (!imageUrl) {
    embed.setDescription(
      activeMode === "server"
        ? "<:vegax:1443934876440068179> Questo utente non ha un banner impostato per questo server."
        : "<:vegax:1443934876440068179> Questo utente non ha un banner.",
    );
  } else {
    embed.setImage(imageUrl);
  }
  return {
    embeds: [embed],
    components: buildBannerRows(requesterId || user.id, user.id, activeMode, nextViewState),
  };
}