const { ChannelType, EmbedBuilder, PermissionsBitField, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { resolveCustomRoleState, buildExpiryText, } = require("../../Utils/Community/customRoleState");

const CUSTOM_VOICE_CATEGORY_ID = "1442569078379118755";
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");

function sanitizeVoiceBaseName(name) {
  const clean=String(name||"").replace(/[^\p{L}\p{N}_ ',.!?\-]/gu, "").replace(/\s+/g," ").trim();
  if (!clean) return "privata";
  return clean;
}

function buildCustomVocName(emoji, baseName) {
  const safeEmoji = String(emoji || "\uD83C\uDFA7").trim() || "\uD83C\uDFA7";
  const safeBase = sanitizeVoiceBaseName(baseName);
  const prefix = `\u0F04${safeEmoji}\uFE32`;
  const maxBaseLength = Math.max(1, 100 - prefix.length);
  return `${prefix}${safeBase.slice(0, maxBaseLength)}`;
}

function findExistingVoiceChannel(guild, roleId) {
  return (
    guild.channels.cache.find((ch) => {
      if (ch.type !== ChannelType.GuildVoice) return false;
      if (ch.parentId !== CUSTOM_VOICE_CATEGORY_ID) return false;
      const overwrite = ch.permissionOverwrites.cache.get(roleId);
      if (!overwrite) return false;
      return (
        overwrite.allow.has(PermissionsBitField.Flags.ViewChannel) &&
        overwrite.allow.has(PermissionsBitField.Flags.Connect) &&
        overwrite.allow.has(PermissionsBitField.Flags.Speak)
      );
    }) || null
  );
}

function buildVoicePanelEmbed(channel, customRole, doc) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Pannello Vocale Privata")
    .setDescription(
      [
        `<:vegacheckmark:1443666279058772028> Canale: ${channel}`,
        `<:VC_Dot:1482532364222595303> Categoria: <#${CUSTOM_VOICE_CATEGORY_ID}>`,
        `<:VC_Dot:1482532364222595303> Accesso consentito a chi possiede ${customRole}`,
        "",
        `Stato custom: ${buildExpiryText(doc)}`,
      ].join("\n"),
    );

  return embed;
}

function buildVoicePanelRow(ownerId, channelId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customvoc_name:${ownerId}:${channelId}`)
      .setLabel("Modifica Nome")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`customvoc_emoji:${ownerId}:${channelId}`)
      .setLabel("Aggiungi Emoji")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function updateCustomRoleData(
  guildId,
  userId,
  extraSet = {},
) {
  const setData = { ...extraSet };
  if (!Object.keys(setData).length) return null;
  return CustomRole.findOneAndUpdate(
    { guildId, userId },
    { $set: setData },
    { new: true },
  )
    .lean()
    .catch(() => null);
}

module.exports = {
  name: "customvoc",
  allowEmptyArgs: true,

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;

    const state=await resolveCustomRoleState({guild:message.guild,userId:message.author.id,client:message.client,cleanupExpired:true,});

    if (state.status === "none") {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Non hai un ruolo personalizzato. Usa prima `+customrole create`.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (state.status === "expired") {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              [
                "<:vegax:1443934876440068179> Il tuo custom role temporaneo è scaduto.",
                `Scadenza: ${buildExpiryText(state.doc)}`,
                "Usa `+customrole create` per crearne uno nuovo.",
              ].join("\n"),
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (state.status === "missing_role") {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste più. Ricrealo con `+customrole create`.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const customRole = state.role;
    const customRoleDoc = state.doc;

    const me=message.guild.members.me||message.guild.members.cache.get(message.client.user.id);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Mi serve il permesso `Gestisci Canali` per creare la vocale privata.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const category = message.guild.channels.cache.get(CUSTOM_VOICE_CATEGORY_ID) || (await getGuildChannelCached(message.guild, CUSTOM_VOICE_CATEGORY_ID));
    if (!category || category.type !== ChannelType.GuildCategory) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Categoria vocale privata non trovata o non valida.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const existing = findExistingVoiceChannel(message.guild, customRole.id);
    if (existing) {
      const updatedDoc=await updateCustomRoleData(message.guild.id,message.author.id,{customVocChannelId:existing.id},);
      await safeMessageReply(message, {
        embeds: [
          buildVoicePanelEmbed(
            existing,
            customRole,
            updatedDoc || customRoleDoc,
          ),
        ],
        components: [buildVoicePanelRow(message.author.id, existing.id)],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const channelName=buildCustomVocName(customRoleDoc?.customVocEmoji||customRole.unicodeEmoji||"\uD83C\uDFA7",message.member.displayName||message.author.username,);

    const channel=await message.guild.channels.create({name:channelName,type:ChannelType.GuildVoice,parent:CUSTOM_VOICE_CATEGORY_ID,reason:`Private voice channel for ${message.author.tag}`,
        permissionOverwrites: [
          {
            id: message.guild.roles.everyone.id,
            deny: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
            ],
          },
          {
            id: customRole.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
            ],
          },
          {
            id: message.client.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.Connect,
              PermissionsBitField.Flags.Speak,
              PermissionsBitField.Flags.ManageChannels,
              PermissionsBitField.Flags.MoveMembers,
            ],
          },
        ],
      })
      .catch(() => null);

    if (!channel) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Non sono riuscito a creare la vocale privata.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    try {
      const existingVoicePositions = message.guild.channels.cache
        .filter((ch) => ch && ch.type === ChannelType.GuildVoice && String(ch.parentId || "") === String(CUSTOM_VOICE_CATEGORY_ID))
        .filter((ch) => Boolean(ch.permissionOverwrites?.cache?.get(customRole.id)))
        .map((ch) => Number(ch.position))
        .filter((n) => Number.isFinite(n));
      const maxPos = existingVoicePositions.length ? Math.max(...existingVoicePositions) : null;
      if (maxPos != null && Number.isFinite(maxPos)) {
        await channel.setPosition(maxPos + 1).catch(() => { });
      }
    } catch (_) {}

    const updatedDoc=await updateCustomRoleData(message.guild.id,message.author.id,{customVocChannelId:channel.id},);

    await safeMessageReply(message, {
      embeds: [
        buildVoicePanelEmbed(
          channel,
          customRole,
          updatedDoc || customRoleDoc,
        ),
      ],
      components: [buildVoicePanelRow(message.author.id, channel.id)],
      allowedMentions: { repliedUser: false },
    });
  },
};