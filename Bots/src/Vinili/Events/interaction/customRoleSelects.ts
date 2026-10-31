/** Ruoli personalizzati: menu per aggiungere e togliere membri. */
const { EmbedBuilder, ChannelType, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { canManageRole } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { CUSTOM_VOC_MEMBER_PERMS } = require("../../Services/Community/customVocPermissionsService") as typeof import("../../Services/Community/customVocPermissionsService");
const { hasPendingRoleGrantFor } = require("./customRolePending") as typeof import("./customRolePending");
const { PRIVATE_FLAG, checkOwnership, ensureOwnerCustomRoleActive, ensureOwnerCustomVocAccess, fetchRole } = require("./customRoleHelpers") as typeof import("./customRoleHelpers");
const { createCustomRoleGrantRequest } = require("./customRoleRequests") as typeof import("./customRoleRequests");

async function handleAddRemoveSelectMenus(interaction?) {
  if (
    interaction.isUserSelectMenu &&
    interaction.isUserSelectMenu() &&
    String(interaction.customId || "").startsWith("customrole_add_select:")
  ) {
    const addParts = String(interaction.customId).split(":");
    if (addParts.length !== 3) return true;
    const [, ownerId, roleId] = addParts;
    if (!ownerId || !roleId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
    if (!ownerState.ok) return true;

    const targetId = interaction.values?.[0];
    const role = (ownerState.state as any).resolvedRole || (await fetchRole(interaction, roleId));
    if (!targetId || !role) {
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Target o ruolo non valido.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const started = await createCustomRoleGrantRequest({ client: interaction.client, guildId: interaction.guild.id, channelId: interaction.channel.id, requesterId: ownerId, targetId, roleId });

    if (!started?.ok) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non sono riuscito ad avviare la richiesta (DM chiusi o errore).",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    await interaction
      .update({
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("<:success:1461731530333229226> Richiesta inviata")
            .setDescription(`<:thumbsup:1471292172145004768> Ho inviato la richiesta in DM a <@${targetId}>.`),
        ],
        components: [],
      })
      .catch(() => { });
    return true;
  }

  if (
    interaction.isStringSelectMenu &&
    interaction.isStringSelectMenu() &&
    String(interaction.customId || "").startsWith("customrole_remove_select:")
  ) {
    const removeParts = String(interaction.customId).split(":");
    if (removeParts.length !== 3) return true;
    const [, ownerId, roleId] = removeParts;
    if (!ownerId || !roleId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
    if (!ownerState.ok) return true;

    const role = (ownerState.state as any).resolvedRole || (await fetchRole(interaction, roleId));
    if (!role) {
      await CustomRole.updateOne(
        { guildId: interaction.guild.id, userId: ownerId },
        String(roleId) === String(ownerState.state.doc?.secondaryRoleId || "")
          ? { $set: { secondaryRoleId: null } }
          : { $set: { roleId: null } },
      ).catch(() => { });
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con [Personalizza](https://www.viniliecaffe.it/personalizza/).",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    if (!canManageRole(interaction, role)) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const targetId = interaction.values?.[0];
    if (targetId === ownerId) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non puoi rimuovere il tuo stesso ruolo con questo comando.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const targetMember = await getGuildMemberCached(interaction.guild, targetId);
    if (!targetMember) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Utente non trovato.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    if (
      hasPendingRoleGrantFor({
        guildId: interaction.guild.id,
        requesterId: ownerId,
        targetId,
        roleId: role.id,
      })
    ) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> C'è ancora una richiesta in attesa di accettazione per questo utente. Attendi la risposta.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    await targetMember.roles
      .remove(role.id, `Custom role member removal by ${interaction.user.tag}`)
      .catch(() => { });

    await targetMember.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#e74c3c")
          .setTitle("<:VC_Attention:1482534443632558151> Ruolo Rimosso")
          .setDescription(`Sei stato rimosso dal ruolo personalizzato **${role.name}** in **${interaction.guild.name}**.`),
      ],
    }).catch(() => { });
    await interaction
      .update({
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle("<:cancel:1461730653677551691> Utente Rimosso")
            .setDescription(
              `<:thumbsdown:1471292163957457013> L'utente ${targetMember} è stato rimosso dal tuo ruolo.`,
            ),
        ],
        components: [],
      })
      .catch(() => { });
    return true;
  }

  if (
    interaction.isUserSelectMenu &&
    interaction.isUserSelectMenu() &&
    String(interaction.customId || "").startsWith("customvoc_add_select:")
  ) {
    const addParts = String(interaction.customId).split(":");
    if (addParts.length !== 3) return true;
    const [, ownerId, channelId] = addParts;
    if (!ownerId || !channelId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const vocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
    if (!vocState.ok) return true;
    const channel =
      interaction.guild?.channels?.cache?.get(channelId) ||
      (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    const targetId = String(interaction.values?.[0] || "").trim();
    if (!/^\d{16,20}$/.test(targetId)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Utente non valido.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await channel.permissionOverwrites.edit(
      targetId,
      CUSTOM_VOC_MEMBER_PERMS,
      {
        reason: `Custom voc grant by ${interaction.user?.tag || interaction.user?.id}`,
        type: OverwriteType.Member,
      },
    ).catch(() => {});
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("<:success:1461731530333229226> Utente aggiunto")
          .setDescription(`<:thumbsup:1471292172145004768> <@${targetId}> ora può accedere alla tua custom voc.`),
      ],
      components: [],
    }).catch(() => {});
    return true;
  }

  if (
    interaction.isStringSelectMenu &&
    interaction.isStringSelectMenu() &&
    String(interaction.customId || "").startsWith("customvoc_remove_select:")
  ) {
    const removeParts = String(interaction.customId).split(":");
    if (removeParts.length !== 3) return true;
    const [, ownerId, channelId] = removeParts;
    if (!ownerId || !channelId) return true;
    if (!(await checkOwnership(interaction, ownerId))) return true;
    const vocState = await ensureOwnerCustomVocAccess(interaction, ownerId, channelId);
    if (!vocState.ok) return true;
    const channel =
      interaction.guild?.channels?.cache?.get(channelId) ||
      (await interaction.guild?.channels?.fetch(channelId).catch(() => null));
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Canale vocale non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    const targetId = String(interaction.values?.[0] || "").trim();
    if (!/^\d{16,20}$/.test(targetId)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Utente non valido.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await channel.permissionOverwrites.delete(targetId, `Custom voc revoke by ${interaction.user?.tag || interaction.user?.id}`).catch(() => {});
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:cancel:1461730653677551691> Utente rimosso")
          .setDescription(`<:thumbsdown:1471292163957457013> <@${targetId}> non ha più accesso alla tua custom voc.`),
      ],
      components: [],
    }).catch(() => {});
    return true;
  }

  return false;
}

export = { handleAddRemoveSelectMenus };
