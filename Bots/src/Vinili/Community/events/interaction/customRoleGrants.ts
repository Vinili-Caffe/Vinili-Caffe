/** Ruoli personalizzati: approvazione delle richieste (staff e proprietario). */
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getClientGuildCached, getUserCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { fetchGuildChannel, fetchGuildMember, fetchGuildRole } = require("../../../Community/utils/customRoleUtils") as typeof import("../../../Community/utils/customRoleUtils");
const { deletePendingSiteRoleRequest, resolvePendingSiteRoleRequest, deletePendingRoleGrant, resolvePendingRoleGrant, persistPendingNow, ensurePendingLoaded } = require("./customRolePending") as typeof import("./customRolePending");
const { PRIVATE_FLAG } = require("./customRoleHelpers") as typeof import("./customRoleHelpers");
const { buildSiteRoleRequestButtons } = require("./customRoleRequests") as typeof import("./customRoleRequests");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
async function handleGrantButtons(interaction?) {
  if (
    !interaction.isButton() ||
    !String(interaction.customId || "").startsWith("customrole_grant:")
  )
    return false;

  const grantParts = String(interaction.customId).split(":");
  if (grantParts.length !== 3) return false;
  const [, token, action] = grantParts;
  if (action !== "yes" && action !== "no") {
    await interaction
      .reply({
        content:
          `${E.vegax} Azione richiesta non valida.`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  ensurePendingLoaded();
  const request = await resolvePendingRoleGrant(token);
  if (!request) {
    await interaction
      .reply({
        content:
          `${E.vegax} Questa richiesta non è più valida.`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  if (interaction.user.id !== request.targetId) {
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle(`${E.VC_Lock} Accesso negato`)
            .setDescription(
              `${E.VC_Alert}Solo l'utente invitato può rispondere a questa richiesta.`,
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  if (Date.now() > request.expiresAt) {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    await interaction
      .reply({ content: `${E.VC_Refresh} Richiesta scaduta.`, flags: 1 << 6 })
      .catch(() => { });
    return true;
  }

  await interaction.deferUpdate().catch(() => { });
  const updateGrantMessage = async (payload?) => {
    const msg = interaction.message;
    if (msg?.editable) {
      await msg.edit(payload).catch(() => { });
      return;
    }
    await interaction.update(payload).catch(() => { });
  };

  const guild = await getClientGuildCached(interaction.client, request.guildId);
  const channel = request.channelId ? await fetchGuildChannel(guild, request.channelId) : null;
  const role = await fetchGuildRole(guild, request.roleId);
  const requester = await fetchGuildMember(guild, request.requesterId);
  const targetMember = await fetchGuildMember(guild, request.targetId);
  const promptMsg =
    request.promptMessageId && channel
      ? channel?.messages?.cache?.get(request.promptMessageId) ||
        (await channel?.messages?.fetch(request.promptMessageId).catch(() => null))
      : null;

  const disabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`customrole_grant:${token}:yes`)
    .setEmoji(E.vegacheckmark)
    .setStyle(ButtonStyle.Success)
    .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:no`)
      .setEmoji(E.vegax)
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );

  if (action === "no") {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("#e67e22")
              .setTitle(`${E.cancel} Richiesta rifiutata`)
              .setDescription(
                `${E.vegax} ${targetMember || `<@${request.targetId}>`} ha rifiutato il ruolo ${role ? `**${role.name}**` : ""}.`,
              ),
          ],
        })
        .catch(() => { });
    }
    const rejectedEmbed = new EmbedBuilder()
      .setColor("#e67e22")
      .setTitle(`${E.cancel} Ruolo rifiutato`)
      .setDescription(
        `${E.vegax} ${targetMember || `<@${request.targetId}>`} ha rifiutato di ricevere il ruolo ${role ? `**${role.name}**` : ""}.`,
      );
    if (channel) {
      await channel.send({ embeds: [rejectedEmbed] }).catch(() => { });
    } else if (requester?.user && typeof requester.user.send === "function") {
      await requester.user.send({ embeds: [rejectedEmbed] }).catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle(`${E.cancel} Richiesta rifiutata`)
          .setDescription(`${E.vegax} Hai rifiutato il ruolo.`),
      ],
      components: [disabledRow],
    });
    return true;
  }

  if (!guild || !role || !targetMember || !requester) {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    await updateGrantMessage({
      content:
        `${E.vegax} Errore: dati richiesta non validi.`,
      embeds: [],
      components: [disabledRow],
    });
    return true;
  }
  const me = guild.members.me || guild.members.cache.get(interaction.client.user.id);
  if (
    !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    await deletePendingRoleGrant(token);
    persistPendingNow();
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle(`${E.VC_Attention} Impossibile assegnare`)
              .setDescription(
                `${E.VC_Alert} Non posso assegnare questo ruolo per permessi/gerarchia.`,
              ),
          ],
        })
        .catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle(`${E.vegax} Errore`)
          .setDescription(`${E.VC_Alert} Il bot non può assegnare questo ruolo.`),
      ],
      components: [disabledRow],
    });
    return true;
  }

  const grantApplied = await targetMember.roles
    .add(role.id, `Custom role accepted from ${requester.user.tag}`)
    .then(() => true)
    .catch(() => false);
  await deletePendingRoleGrant(token);
  persistPendingNow();
  const refreshedTargetMember = grantApplied
    ? await fetchGuildMember(guild, request.targetId).catch(() => null)
    : null;
  const rolePresentAfterGrant = Boolean(
    refreshedTargetMember?.roles?.cache?.has(role.id) ||
    targetMember.roles.cache.has(role.id),
  );
  if (!grantApplied || !rolePresentAfterGrant) {
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle(`${E.VC_Attention} Impossibile assegnare`)
              .setDescription(
                `${E.VC_Alert} L'assegnazione del ruolo non è andata a buon fine.`,
              ),
          ],
        })
        .catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle(`${E.vegax} Errore`)
          .setDescription(`${E.VC_Alert} Il bot non è riuscito ad assegnare questo ruolo.`),
      ],
      components: [disabledRow],
    });
    return true;
  }
  if (promptMsg) {
    await promptMsg
      .edit({
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle(`${E.success} Ruolo Concesso`)
            .setDescription(
              `${E.vegacheckmark} ${targetMember} ha accettato il ruolo **${role.name}**.`,
            ),
        ],
      })
      .catch(() => { });
  }
  const grantedEmbed = new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle(`${E.success} Ruolo Concesso`)
    .setDescription(
      `${E.vegacheckmark} Il ruolo **${role.name}** è stato assegnato a ${targetMember}.`,
    );
  if (channel) {
    await channel.send({ embeds: [grantedEmbed] }).catch(() => { });
  } else if (requester?.user && typeof requester.user.send === "function") {
    // Grant da sito/DM-only: niente canale guild → avvisa il richiedente in DM
    await requester.user.send({ embeds: [grantedEmbed] }).catch(() => { });
  }
  await updateGrantMessage({
    embeds: [
      new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle(`${E.success} Richiesta accettata`)
        .setDescription(`${E.vegacheckmark} Hai accettato il ruolo **${role.name}**.`),
    ],
    components: [disabledRow],
  });
  return true;
}

async function handleSiteRoleRequestButtons(interaction?) {
  if (!interaction.isButton()) return false;
  if (!String(interaction.customId || "").startsWith("siterolerequest:")) return false;

  const parts = String(interaction.customId || "").split(":");
  const token = String(parts[1] || "").trim();
  const action = String(parts[2] || "").trim().toLowerCase();
  const request = await resolvePendingSiteRoleRequest(token);
  if (!request) {
    await interaction
      .reply({ content: `${E.VC_Refresh} Questa richiesta non è più disponibile.`, flags: PRIVATE_FLAG })
      .catch(() => { });
    return true;
  }

  if (String(interaction.user?.id || "") !== String(request.ownerId || "")) {
    await interaction
      .reply({
        content: `${E.VC_Attention} Solo il proprietario del ruolo può rispondere a questa richiesta.`,
        flags: PRIVATE_FLAG,
      })
      .catch(() => { });
    return true;
  }

  const disabledRow = buildSiteRoleRequestButtons(token, true);
  const updateMessage = async (payload?) => {
    const msg = interaction.message;
    if (msg?.editable) {
      await msg.edit(payload).catch(() => { });
      return;
    }
    await interaction.update(payload).catch(() => { });
  };

  if (Date.now() > Number(request.expiresAt || 0)) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle(`${E.VC_update} Richiesta scaduta`)
          .setDescription("La richiesta del ruolo non è più valida: tempo scaduto."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  await interaction.deferUpdate().catch(() => { });

  const guild = await getClientGuildCached(interaction.client, request.guildId);
  const role = await fetchGuildRole(guild, request.roleId);
  const requesterMember = await fetchGuildMember(guild, request.requesterId);
  const ownerMember = await fetchGuildMember(guild, request.ownerId);
  const requesterUser = await getUserCached(interaction.client, request.requesterId);

  if (action === "reject") {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle(`${E.cancel} Richiesta rifiutata`)
          .setDescription(
            `${requesterMember || `<@${request.requesterId}>`} non riceverà il ruolo ${role ? `**${role.name}**` : "richiesto"}.`,
          ),
      ],
      components: [disabledRow],
    });
    await requesterUser
      ?.send({
        embeds: [
          new EmbedBuilder()
            .setColor("#e67e22")
            .setTitle(`${E.cancel} Richiesta rifiutata`)
            .setDescription(
              `La tua richiesta per il ruolo ${role ? `**${role.name}**` : "custom"} è stata rifiutata dal proprietario.`,
            ),
        ],
      })
      .catch(() => { });
    return true;
  }

  if (!guild || !role || !requesterMember || !ownerMember) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle(`${E.vegax} Errore`)
          .setDescription("Non riesco più a recuperare i dati di questa richiesta."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  if (requesterMember.roles.cache.has(role.id)) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#60a5fa")
          .setTitle(`${E.VC_Refresh} Richiesta già soddisfatta`)
          .setDescription(`<@${request.requesterId}> possiede già il ruolo **${role.name}**.`),
      ],
      components: [disabledRow],
    });
    return true;
  }

  const me = guild.members.me || guild.members.cache.get(interaction.client.user.id);
  if (
    !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    await deletePendingSiteRoleRequest(token);
    persistPendingNow();
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle(`${E.VC_Attention} Impossibile assegnare`)
          .setDescription("Il bot non può assegnare questo ruolo per permessi o gerarchia."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  const granted = await requesterMember.roles
    .add(role.id, `Custom role request approved by ${ownerMember.user?.tag || request.ownerId}`)
    .then(() => true)
    .catch(() => false);
  await deletePendingSiteRoleRequest(token);
  persistPendingNow();

  if (!granted) {
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle(`${E.vegax} Errore`)
          .setDescription("Non sono riuscito ad assegnare il ruolo all'utente richiesto."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  await updateMessage({
    embeds: [
      new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle(`${E.success} Richiesta approvata`)
        .setDescription(`<@${request.requesterId}> ha ricevuto il ruolo **${role.name}**.`),
    ],
    components: [disabledRow],
  });
  await requesterUser
    ?.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle(`${E.success} Richiesta approvata`)
          .setDescription(`Il proprietario ha approvato la tua richiesta: ora hai il ruolo **${role.name}**.`),
      ],
    })
    .catch(() => { });
  return true;
}

export = { handleGrantButtons, handleSiteRoleRequestButtons };
