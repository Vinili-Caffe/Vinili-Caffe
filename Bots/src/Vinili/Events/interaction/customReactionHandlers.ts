/** Reazioni personalizzate: pulsanti, moduli e menu. */
const { MentionReaction } = require("../../Schemas/Community/autoInteractionSchemas") as typeof import("../../Schemas/Community/autoInteractionSchemas");
const { MAX_REACTIONS, parseReactionTokens } = require("../../Utils/Community/mentionReactionPanelUtils") as typeof import("../../Utils/Community/mentionReactionPanelUtils");
const { replyEphemeral } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { PRIVATE_FLAG, checkOwnership, ensureOwnerCustomReactionAllowed } = require("./customRoleHelpers") as typeof import("./customRoleHelpers");

async function refreshProfileCustomReactionPanel(..._args: any[]) {
  /* Pannello profilo Discord dismesso — custom reaction resta sui bottoni dedicati. */
  return false;
}

async function handleCustomReactionButton(interaction?) {
  if (!interaction.isButton()) return false;
  const id = String(interaction.customId || "");
  const match = id.match(/^customreaction_(add|remove|clear):(\d{16,20})$/);
  if (!match) return false;
  const [, action, ownerId] = match;
  if (!(await checkOwnership(interaction, ownerId))) return true;

  const ownerState = await ensureOwnerCustomReactionAllowed(interaction, ownerId);
  if (!ownerState.ok) return true;

  const guildId = interaction.guild?.id;
  if (!guildId) return true;

  if (action === "add" || action === "remove") {
    const isAdd = action === "add";
    const maxReactions = Number(ownerState.maxReactions) || MAX_REACTIONS;
    const promptText = isAdd 
      ? `<:VC_Mention:1482526855289634997> Manda da 1 a ${maxReactions} emoji che vuoi **aggiungere**:` 
      : `<:VC_Mention:1482526855289634997> Manda da 1 a ${maxReactions} emoji che vuoi **rimuovere**:`;

    await interaction.reply({
      content: promptText,
      flags: PRIVATE_FLAG,
    }).catch(() => {});

    const filter = (m?) => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on("collect", async (m?) => {
      const tokens = parseReactionTokens(m.content, maxReactions, interaction.guild);
      
      if (!tokens.length) {
        await interaction.followUp({
          content: "<:vegax:1443934876440068179> Nessuna emoji valida trovata. Riprova cliccando di nuovo il bottone.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return;
      }

      const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
      let current = Array.isArray(doc?.reactions) ? doc.reactions.slice(0, maxReactions) : [];
      let next;

      if (isAdd) {
        next = Array.from(new Set([...current, ...tokens])).slice(0, maxReactions);
      } else {
        const toRemove = new Set(tokens);
        next = current.filter(t => !toRemove.has(t));
      }

      if (next.length === 0 && !isAdd) {
        await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
      } else {
        await MentionReaction.findOneAndUpdate(
          { guildId, userId: ownerId },
          { $set: { reactions: next } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).catch(() => {});
      }

            await refreshProfileCustomReactionPanel(interaction, ownerId);

            await m.delete().catch(() => {});
      await interaction.deleteReply().catch(() => {});
    });

    collector.on("end", async (collected?, reason?) => {
      if (reason === "time" && collected.size === 0) {
        await interaction.editReply({
          content: "<:VC_Clock:1473359204189474886> Tempo scaduto. Clicca di nuovo il bottone per riprovare.",
        }).catch(() => {});
      }
    });

    return true;
  }

  if (action === "clear") {
    await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
    await refreshProfileCustomReactionPanel(interaction, ownerId, { updateInteraction: true });
    return true;
  }

  return false;
}

async function handleCustomReactionModal(interaction?) {
  if (!interaction.isModalSubmit()) return false;
  const customId = String(interaction.customId || "");
  if (!customId.startsWith("customreaction_modal_add:")) return false;
  const parts = customId.split(":");
  const ownerId = parts[1];
  if (!ownerId) return true;
  if (interaction.user.id !== ownerId) {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Non puoi modificare queste impostazioni.",
      flags: PRIVATE_FLAG,
    });
    return true;
  }

  const ownerState = await ensureOwnerCustomReactionAllowed(interaction, ownerId);
  if (!ownerState.ok) return true;
  const maxReactions = Number(ownerState.maxReactions) || MAX_REACTIONS;

  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});

  const raw = interaction.fields.getTextInputValue("value") || "";
  const tokens = parseReactionTokens(raw, maxReactions, interaction.guild);
  if (!tokens.length) {
    await interaction.editReply({
      content:
        "<:vegax:1443934876440068179> Nessuna reaction valida. Usa emoji unicode, `<:nome:id>` (anche da altri server dove il bot è presente) o `:nome:` risolto su questo server o su altri server del bot.",
    }).catch(() => {});
    return true;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.editReply({ content: "<:vegax:1443934876440068179> Errore server." }).catch(() => {});
    return true;
  }

  const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
  const current = Array.isArray(doc?.reactions) ? doc.reactions.slice(0, maxReactions) : [];
  const next = Array.from(new Set([...current, ...tokens])).slice(0, maxReactions);

  if (!next.length) {
    await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
  } else {
    await MentionReaction.findOneAndUpdate(
      { guildId, userId: ownerId },
      { $set: { reactions: next } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => {});
  }

  await interaction.editReply({
    content: "<:vegacheckmark:1443666279058772028> Reaction aggiornate.",
  }).catch(() => {});

  await refreshProfileCustomReactionPanel(interaction, ownerId);
  return true;
}

async function handleCustomReactionSelect(interaction?) {
  if (!interaction.isStringSelectMenu()) return false;
  const id = String(interaction.customId || "");
  const prefix = "customreaction_remove_pick:";
  if (!id.startsWith(prefix)) return false;
  const rest = id.slice(prefix.length);
  const seg = rest.split(":");
  if (seg.length < 2) return false;
  const ownerId = seg[0];
  const panelMessageId = seg[1];
  if (interaction.user.id !== ownerId) {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Non puoi modificare queste impostazioni.",
      flags: PRIVATE_FLAG,
    });
    return true;
  }

  const ownerState = await ensureOwnerCustomReactionAllowed(interaction, ownerId);
  if (!ownerState.ok) return true;
  const maxReactions = Number(ownerState.maxReactions) || MAX_REACTIONS;

  const token = interaction.values?.[0];
  if (!token) {
    await interaction.update({ content: "<:vegax:1443934876440068179> Selezione non valida.", components: [] }).catch(() => {});
    return true;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) return true;

  const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
  const list = Array.isArray(doc?.reactions) ? doc.reactions.slice(0, maxReactions) : [];
  const next = list.filter((t?) => String(t) !== String(token));

  if (!next.length) {
    await MentionReaction.deleteOne({ guildId, userId: ownerId }).catch(() => {});
  } else {
    await MentionReaction.findOneAndUpdate(
      { guildId, userId: ownerId },
      { $set: { reactions: next } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => {});
  }

  await interaction.update({
    content: "<:vegacheckmark:1443666279058772028> Reaction rimossa.",
    components: [],
  }).catch(() => {});

  const ch = interaction.channel;
  if (ch?.messages?.fetch) {
    const panelMessage = await ch.messages.fetch(panelMessageId).catch(() => null);
    if (panelMessage) {
    }
  }
  return true;
}

export = { handleCustomReactionButton, handleCustomReactionModal, handleCustomReactionSelect };
