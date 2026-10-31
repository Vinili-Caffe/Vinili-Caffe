/** Vocale personalizzata: pulsanti e moduli. */
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, PermissionsBitField, ChannelType } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { replyEphemeral, parseVoiceActionId, parseCustomVocName, buildCustomVocName, normalizeCustomVocEmojiValue } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { PRIVATE_FLAG, ensureOwnerCustomVocAccess } = require("./customRoleHelpers") as typeof import("./customRoleHelpers");
const { registerProfilePrompt } = require("./customRoleProfilePrompt") as typeof import("./customRoleProfilePrompt");

async function handleCustomVocButton(interaction?) {
  if (!interaction.isButton()) return false;
  const parsed = parseVoiceActionId(interaction.customId);
  if (!parsed) return false;

  const { head, ownerId, channelId } = parsed;
  if (interaction.user.id !== ownerId) {
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
            .setDescription(
              "<a:VC_Alert:1482706673176150077> Solo il proprietario della vocale privata può usare questo controllo.",
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  const ownerVocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
  if (!ownerVocState.ok) return true;

  const channel = interaction.guild?.channels?.cache?.get(channelId) || (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    await interaction
      .reply({
        content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (head === "customvoc_add") {
    registerProfilePrompt(interaction, { type: "voc_add", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Menziona l'utente da aggiungere alla custom voc.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (head === "customvoc_remove") {
    registerProfilePrompt(interaction, { type: "voc_remove", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Menziona l'utente da rimuovere dalla custom voc.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (head === "customvoc_name") {
    registerProfilePrompt(interaction, { type: "voc_name", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Invia il nuovo nome della custom voc in questo canale.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (head === "customvoc_emoji") {
    registerProfilePrompt(interaction, { type: "voc_emoji", ownerId, vocChannelId: channelId });
    await interaction.reply({ content: "✏️ Invia **un'emoji standard** (es. 🎧 🔥) in questo canale. Nel nome vocale non funzionano le emoji custom del server (`<:nome:id>`).", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  const modal = new ModalBuilder().setCustomId(`${head === "customvoc_emoji" ? "customvoc_modal_emoji" : "customvoc_modal_name"}:${ownerId}:${channelId}`,
  )
    .setTitle(
      head === "customvoc_emoji"
        ? "Imposta emoji vocale"
        : "Modifica nome vocale",
    );
  const input = new TextInputBuilder().setCustomId("value").setLabel(head === "customvoc_emoji" ? "Emoji" : "Nuovo nome").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder(head === "customvoc_emoji" ? "Es: ?" : "Es: privata - lore").setMaxLength(head === "customvoc_emoji" ? 32 : 90);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  const shown = await interaction.showModal(modal).then(() => true).catch(() => false);
  if (!shown) {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Impossibile aprire il modulo, riprova.",
      flags: 1 << 6,
    });
  }
  return true;
}

async function handleCustomVocModal(interaction?) {
  if (!interaction.isModalSubmit()) return false;
  const customId = String(interaction.customId || "");
  const isNameModal = customId.startsWith("customvoc_modal_name:");
  const isEmojiModal = customId.startsWith("customvoc_modal_emoji:");
  if (!isNameModal && !isEmojiModal) return false;
  const vocParts = customId.split(":");
  if (vocParts.length !== 3) return true;
  const [, ownerId, channelId] = vocParts;
  if (!ownerId || !channelId) return true;

  const send = async (payload?) => { if (interaction.deferred || interaction.replied) { return interaction.editReply(payload).catch(() => { }); } return interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch(() => { }); };

  try {
    if (interaction.user.id !== ownerId) {
      await send({
        content:
          "<:VC_Attention:1482534443632558151> Non puoi modificare questo canale.",
      });
      return true;
    }

    const ownerVocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
    if (!ownerVocState.ok) return true;

    await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });

    const channel = interaction.guild?.channels?.cache?.get(channelId) || (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await send({
        content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.",
      });
      return true;
    }

    const me = interaction.guild?.members?.me || interaction.guild?.members?.cache?.get(interaction.client.user.id);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
      await send({
        content:
          "<:VC_Attention:1482534443632558151> Mi serve il permesso Gestisci Canali.",
      });
      return true;
    }

    const raw = interaction.fields.getTextInputValue("value") || "";
    const ownerCustomRoleDoc = ownerVocState.doc || null;

    if (isEmojiModal) {
      const emoji = normalizeCustomVocEmojiValue(raw);
      if (!emoji) {
        await send({
          content: /<a?:[a-zA-Z0-9_~]{2,32}:\d{16,22}>/.test(String(raw || ""))
            ? "<:VC_Attention:1482534443632558151> Nel nome della vocale puoi usare solo **emoji standard** (es. 🎧 🔥), non quelle custom del server (`<:nome:id>`)."
            : "<:vegax:1443934876440068179> Emoji non valida. Invia un'emoji standard (unicode), es. 🎧",
        });
        return true;
      }
      if (ownerCustomRoleDoc) {
        await CustomRole.updateOne(
          { guildId: interaction.guild.id, userId: ownerId },
          { $set: { customVocEmoji: emoji } },
        ).catch(() => { });
      }
      const parsedCurrent = parseCustomVocName(channel.name || "");
      const currentBase = parsedCurrent.baseName || "privata";
      const nextNameFromEmoji = buildCustomVocName(emoji, currentBase);
      await channel
        .edit(
          { name: nextNameFromEmoji },
          `Custom voc emoji by ${interaction.user.tag}`,
        )
        .catch(() => { });
      await send({
        content: `<:success:1461731530333229226> Emoji aggiornata: ${emoji}`,
      });
      return true;
    }

    const parsedCurrent = parseCustomVocName(channel.name || "");
    const preservedEmoji = parsedCurrent.emoji || ownerCustomRoleDoc?.customVocEmoji || "🎧";
    const nextName = buildCustomVocName(preservedEmoji, raw);
    await channel
      .edit({ name: nextName }, `Custom voc rename by ${interaction.user.tag}`)
      .catch(() => { });
    await send({
      content: `<:success:1461731530333229226> Nome aggiornato: \`${nextName}\``,
    });
    return true;
  } catch (error) {
    global.logger.error(error);
    await send({
      content:
        "<:vegax:1443934876440068179> Errore durante la modifica della vocale.",
    });
    return true;
  }
}

export = { handleCustomVocButton, handleCustomVocModal };
