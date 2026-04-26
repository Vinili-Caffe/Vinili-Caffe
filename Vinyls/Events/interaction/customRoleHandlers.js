const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, UserSelectMenuBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionsBitField, ChannelType, } = require("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const { MentionReaction } = require("../../Schemas/Community/autoInteractionSchemas");
const {
  MAX_REACTIONS,
  parseReactionTokens,
  toDisplay,
  buildCustomReactionPanelEmbed,
  buildCustomReactionPanelRows,
  memberHasCustomReactionRoleAccess,
} = require("../../Utils/Community/mentionReactionPanelUtils");
const axios = require("axios");
const crypto = require("crypto");
const { resolveCustomRoleState, buildExpiryText, } = require("../../Utils/Community/customRoleState");
const { getClientGuildCached, getGuildMemberCached, getGuildRoleCached, getGuildChannelCached, getUserCached, } = require("../../Utils/Interaction/interactionEntityCache");
const { userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { fetchGuildChannel, fetchGuildMember, fetchGuildRole, replyEphemeral, parseRoleActionId, parseVoiceActionId, findCustomVoiceByRole, canManageRole, refreshEmbedRoleLine, sanitizeVoiceBaseName, parseCustomVocName, buildCustomVocName } = require("../../Utils/Interaction/customRoleUtils");
const pendingRoleGrants = new Map();
const pendingSiteRoleRequests = new Map();
const PRIVATE_FLAG = 1 << 6;
const MAX_ROLE_ICON_BYTES = 2 * 1024 * 1024;

function isSafeRoleIconUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = String(parsed.hostname || "").trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }
  return true;
}

async function checkOwnership(interaction, ownerId) {
  if (interaction.user.id === ownerId) return true;
  await interaction
    .reply({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
          .setDescription(
            "<:VC_Attention:1482534443632558151> Solo il proprietario del ruolo personalizzato può usare questo controllo.",
          ),
      ],
      flags: PRIVATE_FLAG,
    })
    .catch(() => { });
  return false;
}

async function ensureOwnerCustomRoleActive(
  interaction,
  ownerId,
  expectedRoleId = null,
) {
  const state = await resolveCustomRoleState({ guild: interaction.guild, userId: ownerId, client: interaction.client, cleanupExpired: true, });

  if (state.status === "none") {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Non hai più un custom role attivo. Usa `+profile`.",
      flags: PRIVATE_FLAG,
    });
    return { ok: false, state };
  }

  if (state.status === "expired") {
    await replyEphemeral(interaction, {
      content: [
        "<a:VC_Alert:1482706673176150077> Il tuo custom role temporaneo è scaduto.",
        `<:VC_Clock:1473359204189474886> Scadenza: ${buildExpiryText(state.doc)}`,
        "<:VC_InactiveStatus:1482526984234860574> Usa `+profile` per crearne uno nuovo.",
      ].join("\n"),
      flags: PRIVATE_FLAG,
    });
    return { ok: false, state };
  }

  if (state.status === "missing_role") {
    await replyEphemeral(interaction, {
      content:
        "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con `+profile`.",
      flags: PRIVATE_FLAG,
    });
    return { ok: false, state };
  }

  if (
    expectedRoleId &&
    String(state.role?.id || "") !== String(expectedRoleId)
  ) {
    await replyEphemeral(interaction, {
      content:
        "<:vegax:1443934876440068179> Questo pannello non è più allineato al tuo ruolo attuale. Riapri con `+profile`.",
      flags: PRIVATE_FLAG,
    });
    return { ok: false, state };
  }

  return { ok: true, state };
}

async function ensureOwnerCustomReactionAllowed(interaction, ownerId) {
  const member =
    interaction.member && String(interaction.member.id) === String(ownerId)
      ? interaction.member
      : await interaction.guild?.members?.fetch?.(ownerId).catch(() => null);
  if (memberHasCustomReactionRoleAccess(member)) return { ok: true };
  return ensureOwnerCustomRoleActive(interaction, ownerId);
}

async function fetchRole(interaction, roleId) {
  const guild = interaction.guild;
  if (!guild) return null;
  return (
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null))
  );
}

async function updatePanelMessage(interaction, panelMessageId, role) {
  if (!panelMessageId || !interaction.channel) return;
  const msg = interaction.channel.messages.cache.get(panelMessageId) || (await interaction.channel.messages.fetch(panelMessageId).catch(() => null));
  if (!msg) return;
  const updated = refreshEmbedRoleLine(msg.embeds?.[0], role);
  await msg.edit({ embeds: [updated] }).catch(() => { });
}

async function createCustomRoleGrantRequest({ client, guildId, channelId, requesterId, targetId, roleId, timeoutMs = 60_000 }) {
  const guild = await getClientGuildCached(client, guildId);
  const channel = await fetchGuildChannel(guild, channelId);
  const targetMember = await fetchGuildMember(guild, targetId);
  const requesterMember = await fetchGuildMember(guild, requesterId);
  const role = await fetchGuildRole(guild, roleId);
  if (!guild || !channel || !targetMember || !requesterMember || !role)
    return { ok: false };

  const waitingEmbed = new EmbedBuilder()
    .setColor("#f1c40f")
    .setTitle("<a:VC_pixeltime:1482535344103620771> In attesa di conferma")
    .setDescription(
      `<a:VC_Timer:1482527426557775954> Sto aspettando che ${targetMember} accetti di ricevere il ruolo **${role.name}**.`,
  );
  const promptMsg = await channel.send({ embeds: [waitingEmbed] }).catch(() => null);
  if (!promptMsg) return { ok: false };

  const token = crypto.randomBytes(16).toString("hex");
  const dmRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`customrole_grant:${token}:yes`)
    .setEmoji("<:vegacheckmark:1443666279058772028>")
    .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:no`)
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );
  const dmEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_PinkQuestionMark:1471892611026391306> Richiesta ruolo personalizzato")
    .setDescription(
      `${requesterMember} vuole aggiungerti il ruolo **${role.name}** nel server. Accetti?`,
    );

  const dmSent = await targetMember.send({ embeds: [dmEmbed], components: [dmRow] }).catch(() => null);
  if (!dmSent) {
    await promptMsg
      .edit({
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setTitle("<a:VC_Alert:1482706673176150077> Impossibile inviare DM")
            .setDescription(
              `<:vegax:1443934876440068179> Non posso inviare il messaggio privato a ${targetMember}.`,
            ),
        ],
      })
      .catch(() => { });
    return { ok: false };
  }

  pendingRoleGrants.set(token, {
    guildId,
    channelId,
    requesterId,
    targetId,
    roleId,
    promptMessageId: promptMsg.id,
    dmChannelId: dmSent.channelId,
    dmMessageId: dmSent.id,
    expiresAt: Date.now() + Math.max(15_000, Number(timeoutMs || 60_000)),
  });

  const expiryTimer = setTimeout(
    async () => {
      const req = pendingRoleGrants.get(token);
      if (!req) return;
      pendingRoleGrants.delete(token);
      const g = await getClientGuildCached(client, req.guildId);
      const ch = await fetchGuildChannel(g, req.channelId);
      const msg = ch?.messages?.cache?.get(req.promptMessageId) || (await ch?.messages?.fetch(req.promptMessageId).catch(() => null));
      if (msg) {
        await msg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#e67e22")
                .setTitle("<:VC_update:1478721333096349817> Scaduto")
                .setDescription(`<a:VC_Timer:1482527426557775954> <@${req.targetId}> non ha risposto in tempo.`),
            ],
          })
          .catch(() => { });
      }

      const user = await getUserCached(client, req.targetId);
      const dmChannel = user?.dmChannel || (await user?.createDM().catch(() => null));
      const dmMsg = dmChannel?.messages?.cache?.get(req.dmMessageId) || (await dmChannel?.messages?.fetch(req.dmMessageId).catch(() => null));
      if (dmMsg) {
        await dmMsg
          .edit({
            embeds: [
              new EmbedBuilder()
                .setColor("#e67e22")
                .setTitle("<:VC_update:1478721333096349817> Scaduto")
                .setDescription( "<a:VC_Timer:1482527426557775954> Tempo scaduto: la richiesta non è più valida." ),
            ],
            components: [],
          })
          .catch(() => { });
      }
    },
    Math.max(15_000, Number(timeoutMs || 60_000)),
  );
  if (typeof expiryTimer?.unref === "function") expiryTimer.unref();

  return { ok: true, promptMessageId: promptMsg.id };
}

function buildSiteRoleRequestButtons(token, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`siterolerequest:${token}:approve`)
      .setLabel("Approva")
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`siterolerequest:${token}:reject`)
      .setLabel("Rifiuta")
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

async function createSiteRoleJoinRequest({
  client,
  guildId,
  requesterId,
  ownerId,
  roleId,
  reason,
  timeoutMs = 3 * 24 * 60 * 60 * 1000,
}) {
  const guild = await getClientGuildCached(client, guildId);
  const ownerMember = await fetchGuildMember(guild, ownerId);
  const requesterMember = await fetchGuildMember(guild, requesterId);
  const role = await fetchGuildRole(guild, roleId);
  if (!guild || !ownerMember || !requesterMember || !role) {
    return { ok: false, error: "invalid_context" };
  }

  const now = Date.now();
  for (const [token, request] of pendingSiteRoleRequests.entries()) {
    if (!request) continue;
    if (Number(request.expiresAt || 0) <= now) {
      pendingSiteRoleRequests.delete(token);
      continue;
    }
    if (
      String(request.guildId || "") === String(guildId) &&
      String(request.requesterId || "") === String(requesterId) &&
      String(request.ownerId || "") === String(ownerId) &&
      String(request.roleId || "") === String(roleId)
    ) {
      return { ok: false, error: "already_pending" };
    }
  }

  const token = crypto.randomBytes(16).toString("hex");
  const ownerUser = ownerMember.user || (await getUserCached(client, ownerId));
  const requesterUser = requesterMember.user || (await getUserCached(client, requesterId));
  const dmEmbed = new EmbedBuilder()
    .setColor("#8b5cf6")
    .setTitle("<:VC_PinkQuestionMark:1471892611026391306> Richiesta di accesso al tuo ruolo")
    .setDescription(
      [
        `${requesterMember} vuole ottenere il tuo ruolo personalizzato **${role.name}**.`,
        "",
        `**Utente:** ${requesterMember} (\`${requesterId}\`)`,
        `**Ruolo:** ${role.name}`,
        "",
        "**Motivazione**",
        String(reason || "Nessuna motivazione."),
      ].join("\n"),
    )
    .setFooter({ text: "Puoi approvare o rifiutare direttamente da qui." })
    .setTimestamp(new Date());
  const reqThumb = userAvatarUrlDynamic(requesterUser, { size: 256 });
  if (reqThumb) dmEmbed.setThumbnail(reqThumb);

  const dmSent = await ownerMember
    .send({
      embeds: [dmEmbed],
      components: [buildSiteRoleRequestButtons(token, false)],
    })
    .catch(() => null);
  if (!dmSent) {
    return { ok: false, error: "dm_closed" };
  }

  pendingSiteRoleRequests.set(token, {
    guildId,
    requesterId,
    ownerId,
    roleId,
    reason: String(reason || ""),
    dmChannelId: dmSent.channelId,
    dmMessageId: dmSent.id,
    expiresAt: now + Math.max(15_000, Number(timeoutMs || 0)),
  });

  const expiryTimer = setTimeout(async () => {
    const request = pendingSiteRoleRequests.get(token);
    if (!request) return;
    pendingSiteRoleRequests.delete(token);
    const owner = await getUserCached(client, request.ownerId);
    const dmChannel = owner?.dmChannel || (await owner?.createDM().catch(() => null));
    const dmMsg =
      dmChannel?.messages?.cache?.get(request.dmMessageId) ||
      (await dmChannel?.messages?.fetch(request.dmMessageId).catch(() => null));
    if (dmMsg) {
      await dmMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("#e67e22")
              .setTitle("<:VC_update:1478721333096349817> Richiesta scaduta")
              .setDescription("La richiesta del ruolo non è più valida: tempo scaduto."),
          ],
          components: [buildSiteRoleRequestButtons(token, true)],
        })
        .catch(() => { });
    }
  }, Math.max(15_000, Number(timeoutMs || 0)));
  if (typeof expiryTimer?.unref === "function") expiryTimer.unref();

  return { ok: true };
}

async function handleRoleActionButton(interaction) {
  if (!interaction.isButton()) return false;
  if (String(interaction.customId || "").startsWith("customrole_grant:"))
    return false;
  const parsed = parseRoleActionId(interaction.customId);
  if (!parsed || !parsed.head.startsWith("customrole_")) return false;

  const { head, ownerId, roleId } = parsed;
  if (!(await checkOwnership(interaction, ownerId))) return true;

  const modalHeads = new Set([
    "customrole_name",
    "customrole_color_solid",
    "customrole_color_gradient",
    "customrole_emoji",
  ]);
  if (modalHeads.has(head)) {
    let modalId = null;
    let title = null;
    let label = null;
    let placeholder = null;
    const panelMessageId = interaction.message?.id || "";

    if (head === "customrole_name") {
      modalId = `customrole_modal_name:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Modifica nome ruolo";
      label = "Nuovo nome";
      placeholder = "Es: AstroFam";
    } else if (head === "customrole_color_solid") {
      modalId = `customrole_modal_color_solid:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Colore solido";
      label = "Colore HEX";
      placeholder = "Es: #ff66cc";
    } else if (head === "customrole_color_gradient") {
      modalId = `customrole_modal_color_gradient:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Colore gradiente";
    } else if (head === "customrole_emoji") {
      modalId = `customrole_modal_emoji:${ownerId}:${roleId}:${panelMessageId}`;
      title = "Imposta emoji o icona ruolo";
      label = "Emoji / icona (unicode, URL, :nome:, <:...:...>)";
      placeholder = "Es: :VC_PandaExcited: oppure <:VC_PandaExcited:123> oppure https://.../icon.png";
    }

    if (!modalId) return true;
    const rows = [];
    if (head === "customrole_color_gradient") {
      const input1 = new TextInputBuilder().setCustomId("value1").setLabel("Colore 1 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
      const input2 = new TextInputBuilder().setCustomId("value2").setLabel("Colore 2 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #6f4e37").setMaxLength(64);
      rows.push(new ActionRowBuilder().addComponents(input1));
      rows.push(new ActionRowBuilder().addComponents(input2));
    } else {
      const input = new TextInputBuilder().setCustomId("value").setLabel(String(label || "").slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(head !== "customrole_emoji").setPlaceholder(placeholder).setMaxLength(4000);
      rows.push(new ActionRowBuilder().addComponents(input));
    }

    const modal = new ModalBuilder().setCustomId(modalId).setTitle(String(title || "").slice(0, 45)).addComponents(...rows);
    const shown = await interaction.showModal(modal).then(() => true).catch(() => false);
    if (!shown) {
      await replyEphemeral(interaction, {
        content: "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
        flags: 1 << 6,
      });
    }
    return true;
  }

  const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
  if (!ownerState.ok) return true;

  const role = ownerState.state.role || (await fetchRole(interaction, roleId));
  if (!role) {
    await CustomRole.deleteOne({
      guildId: interaction.guild.id,
      userId: ownerId,
    }).catch(() => { });
    await interaction
      .reply({
        content:
          "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con `+profile`.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (head === "customrole_delete") {
    if (!canManageRole(interaction, role)) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non posso eliminare questo ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const ownerDoc = await CustomRole.findOne({ guildId: interaction.guild.id, userId: ownerId, }).lean().catch(() => null);
    const me = interaction.guild?.members?.me || interaction.guild?.members?.cache?.get(interaction.client.user.id);
    const canManageChannels = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageChannels),);
    if (canManageChannels) {
      const linkedVoice = (ownerDoc?.customVocChannelId ? await getGuildChannelCached(interaction.guild, ownerDoc.customVocChannelId) : null) || findCustomVoiceByRole(interaction.guild, role.id);
      if (linkedVoice) {
        await linkedVoice
          .delete(`Custom private voice deleted by ${interaction.user.tag}`)
          .catch(() => { });
      }
    }

    const roleName = role.name;
    const roleDeleted = await role
      .delete(`Custom role deleted by ${interaction.user.tag}`)
      .then(() => true)
      .catch(() => false);
    if (!roleDeleted) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non sono riuscito a eliminare il ruolo. Controlla gerarchia e permessi.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    await CustomRole.deleteOne({
      guildId: interaction.guild.id,
      userId: ownerId,
    }).catch(() => { });

    const deletedEmbed = new EmbedBuilder()
      .setColor("#e74c3c")
      .setTitle("<:VC_Attention:1482534443632558151> Ruolo eliminato")
      .setDescription(
        `<:success:1461731530333229226> Il ruolo **${roleName}** è stato cancellato con successo.`,
    );

    const updated = await interaction.update({ embeds: [deletedEmbed], components: [] }).then(() => true).catch(() => false);
    if (!updated) {
      await interaction.message
        ?.edit({ embeds: [deletedEmbed], components: [] })
        .catch(() => { });
      if (!interaction.replied && !interaction.deferred) {
        await interaction
          .reply({
            content: "<:vegacheckmark:1443666279058772028> Ruolo eliminato.",
            flags: 1 << 6,
          })
          .catch(() => { });
      }
    }
    return true;
  }

  if (head === "customrole_members") {
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("<:VC_Mention:1482526855289634997> Seleziona un utente")
            .setDescription("<:VC_InactiveStatus:1482526984234860574> Seleziona un utente: riceverà una richiesta in DM per accettare il ruolo." ),
        ],
        components: [
          new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
              .setCustomId(`customrole_add_select:${ownerId}:${roleId}`)
              .setPlaceholder("Seleziona un utente")
              .setMinValues(1)
              .setMaxValues(1),
          ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (head === "customrole_members_remove") {
    const role = await fetchRole(interaction, roleId);
    if (!role) return true;

    await interaction.guild.members.fetch().catch(() => { });
    const membersWithRole = Array.from(role.members.values())
      .filter((m) => !m.user?.bot && m.id !== ownerId)
      .slice(0, 25);

    if (!membersWithRole.length) {
      await interaction.reply({
        content: "<:vegax:1443934876440068179> Nessun utente (diverso da te) ha attualmente questo ruolo.",
        flags: 1 << 6,
      }).catch(() => { });
      return true;
    }

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`customrole_remove_select:${ownerId}:${roleId}`)
        .setPlaceholder("Seleziona un utente da rimuovere")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
          membersWithRole.map((m) => ({
            label: String(m.user?.username || m.id).slice(0, 100),
            value: m.id,
            description: String(m.displayName || m.user?.username || "").slice(0, 100),
          }))
        ),
    );

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("<:VC_Mention:1482526855289634997> Rimuovi Utenti")
          .setDescription("<:VC_InactiveStatus:1482526984234860574> Seleziona l'utente da rimuovere dal tuo ruolo personalizzato."),
      ],
      components: [row],
      flags: 1 << 6,
    }).catch(() => { });
    return true;
  }

  if (head === "customrole_color") {
    const panelMessageId = interaction.message?.id || "";
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`customrole_color_type_select:${ownerId}:${roleId}:${panelMessageId}`)
      .setPlaceholder("Scegli il tipo di colore")
      .addOptions(
        { label: "Solido (1 colore)", value: "solid", description: "Imposta un singolo colore HEX" },
        { label: "Gradiente (2 colori)", value: "gradient", description: "Imposta due colori HEX" },
        { label: "Olografico", value: "holo", description: "Stile olografico predefinito" },
      );
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("Modifica colore ruolo")
            .setDescription("Scegli come vuoi impostare il colore del tuo custom role."),
        ],
        components: [new ActionRowBuilder().addComponents(menu)],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  let modalId = null;
  let title = null;
  let label = null;
  let placeholder = null;
  const panelMessageId = interaction.message?.id || "";

  if (head === "customrole_name") {
    modalId = `customrole_modal_name:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Modifica nome ruolo";
    label = "Nuovo nome";
    placeholder = "Es: AstroFam";
  } else if (head === "customrole_color_solid") {
    modalId = `customrole_modal_color_solid:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Colore solido";
    label = "Colore HEX";
    placeholder = "Es: #ff66cc";
  } else if (head === "customrole_color_gradient") {
    modalId = `customrole_modal_color_gradient:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Colore gradiente";
  } else if (head === "customrole_emoji") {
    modalId = `customrole_modal_emoji:${ownerId}:${roleId}:${panelMessageId}`;
    title = "Imposta emoji o icona ruolo";
    label = "Emoji / icona (unicode, URL, :nome:, <:...:...>)";
    placeholder = "Es: :VC_PandaExcited: oppure <:VC_PandaExcited:123> oppure https://.../icon.png";
  } else if (head === "customrole_color_holo") {
    const role = await fetchRole(interaction, roleId);
    if (!role) return true;
    if (!canManageRole(interaction, role)) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };
    const edited = await role.edit({ colors: HOLO }, `Custom role holographic by ${interaction.user.tag}`).then(() => true).catch(() => false);
    if (!edited) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare lo stile olografico.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction.reply({ content: "<:success:1461731530333229226> Stile olografico applicato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (!modalId) return true;

  const rows = [];
  if (head === "customrole_color_gradient") {
    const input1 = new TextInputBuilder().setCustomId("value1").setLabel("Colore 1 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
    const input2 = new TextInputBuilder().setCustomId("value2").setLabel("Colore 2 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #6f4e37").setMaxLength(64);
    rows.push(new ActionRowBuilder().addComponents(input1));
    rows.push(new ActionRowBuilder().addComponents(input2));
  } else {
    const input = new TextInputBuilder().setCustomId("value").setLabel(String(label || "").slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(head !== "customrole_emoji").setPlaceholder(placeholder).setMaxLength(4000);
    rows.push(new ActionRowBuilder().addComponents(input));
  }

  const modal = new ModalBuilder().setCustomId(modalId).setTitle(String(title || "").slice(0, 45)).addComponents(...rows);
  const shown = await interaction.showModal(modal).then(() => true).catch(() => false);
  if (!shown) {
    await replyEphemeral(interaction, {
      content:
        "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
      flags: 1 << 6,
    });
  }
  return true;
}

async function handleRoleActionModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  if (!String(interaction.customId || "").startsWith("customrole_modal_"))
    return false;

  const modalBody = String(interaction.customId).replace("customrole_modal_", "",);
  const modalParts = modalBody.split(":");
  if (modalParts.length < 4) return false;
  const [action, ownerId, roleId, panelMessageId] = modalParts;
  if (!action || !ownerId || !roleId) return false;
  if (!(await checkOwnership(interaction, ownerId))) return true;
  const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId, roleId,);
  if (!ownerState.ok) return true;

  const role = ownerState.state.role || (await fetchRole(interaction, roleId));
  if (!role) {
    await CustomRole.deleteOne({
      guildId: interaction.guild.id,
      userId: ownerId,
    }).catch(() => { });
    await interaction
      .reply({
        content:
          "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con `+profile`.",
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

  let value = "";
  try {
    value = interaction.fields.getTextInputValue("value")?.trim() || "";
  } catch (err) {}

  async function confirmRoleState(checkFn) {
    const refreshedRole = await fetchRole(interaction, roleId);
    const roleToCheck = refreshedRole || role;
    return Boolean(roleToCheck && checkFn(roleToCheck));
  }

  if (action === "name") {
    const cleaned = String(value).replace(/\s+/g, " ").trim();
    const name = (cleaned.startsWith("༄") ? cleaned : `༄ ${cleaned}`).slice(0, 32).trim();
    if (!name) {
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Nome non valido.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const edited = await role
      .edit({ name }, `Custom role rename by ${interaction.user.tag}`)
      .then(() => true)
      .catch(() => false);
    const renameApplied = edited || await confirmRoleState((liveRole) => String(liveRole.name || "") === name);
    if (!renameApplied) {
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare il nome del ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction
      .reply({
        content: `<:success:1461731530333229226> Nome aggiornato: **${name}**`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (action === "color" || action === "color_solid") {
    const hex = value.startsWith("#") ? value : `#${value}`;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex)) {
      await interaction
        .reply({
          content:
            "<:vegax:1443934876440068179> Colore HEX non valido. Esempio: `#ff66cc`.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const edited = await role
      .edit({ colors: { primaryColor: hex } }, `Custom role color by ${interaction.user.tag}`)
      .then(() => true)
      .catch(() => false);
    const colorApplied = edited || await confirmRoleState((liveRole) => String(liveRole.hexColor || "").toUpperCase() === hex.toUpperCase());
    if (!colorApplied) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare il colore del ruolo.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction
      .reply({
        content: `<:success:1461731530333229226> Colore aggiornato: \`${hex}\``,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (action === "color_gradient") {
    const raw1 = interaction.fields.getTextInputValue("value1")?.trim() || "";
    const raw2 = interaction.fields.getTextInputValue("value2")?.trim() || "";
    const hex1 = raw1.startsWith("#") ? raw1 : `#${raw1}`;
    const hex2 = raw2.startsWith("#") ? raw2 : `#${raw2}`;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex1) || !/^#?[0-9a-fA-F]{6}$/.test(hex2)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Colori HEX non validi. Esempio: `#ff66cc`.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const edited = await role.edit({ colors: { primaryColor: hex1, secondaryColor: hex2 } }, `Custom role gradient by ${interaction.user.tag}`).then(() => true).catch(() => false);
    const applied = edited || await confirmRoleState((liveRole) => String(liveRole.hexColor || "").toUpperCase() === hex1.toUpperCase());
    if (!applied) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare il gradiente.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction.reply({ content: `<:success:1461731530333229226> Gradiente aggiornato: \`${hex1}\` → \`${hex2}\``, flags: 1 << 6 }).catch(() => { });
    return true;
  }

  if (action === "emoji") {
    if (!value) {
      const cleared = await role
        .edit(
          { unicodeEmoji: null, icon: null },
          `Custom role icon cleared by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const clearApplied = cleared || await confirmRoleState((liveRole) => !liveRole.icon && !liveRole.unicodeEmoji);
      if (!clearApplied) {
        await interaction
          .reply({
            content: "<:VC_Attention:1482534443632558151> Non sono riuscito a rimuovere icona del ruolo.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction
        .reply({
          content: "<:success:1461731530333229226> Icona rimossa.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const isUrl = /^https?:\/\/\S+$/i.test(value);
    if (isUrl) {
      if (!isSafeRoleIconUrl(value)) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> URL non sicuro o non supportato. Usa un link `https` pubblico.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      const iconBuffer = await axios
        .get(value, {
          responseType: "arraybuffer",
          timeout: 15000,
          maxContentLength: MAX_ROLE_ICON_BYTES,
          maxBodyLength: MAX_ROLE_ICON_BYTES,
          validateStatus: (status) => status >= 200 && status < 300,
        })
        .then((r) => Buffer.from(r.data))
        .catch(() => null);
      if (!iconBuffer) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> URL immagine non valida o non raggiungibile.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      const edited = await role
        .edit(
          { icon: iconBuffer, unicodeEmoji: null },
          `Custom role icon by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const iconApplied = edited || await confirmRoleState((liveRole) => Boolean(liveRole.icon));
      if (!iconApplied) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction
        .reply({
          content:
            "<:success:1461731530333229226> Icona ruolo aggiornata.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const nameOnlyMatch = String(value || "").trim().match(/^:([a-zA-Z0-9_]{2,32}):$/);
    if (nameOnlyMatch) {
      const emojiName = String(nameOnlyMatch[1] || "");
      const found = interaction.guild?.emojis?.cache?.find?.((e) => String(e?.name || "") === emojiName) || null;
      if (!found?.id) {
        await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non trovo questa custom emoji nel server. Incolla l'emoji completa `<:nome:id>` oppure usa un URL.", flags: 1 << 6 }).catch(() => { });
        return true;
      }
      const ext = found.animated ? "gif" : "png";
      const emojiUrl = `https://cdn.discordapp.com/emojis/${found.id}.${ext}?size=128&quality=lossless`;
      const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, }).then((r) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null,).catch(() => null);
      if (!iconBuffer) {
        await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito a caricare l'emoji. Riprova o incolla un URL immagine.", flags: 1 << 6 }).catch(() => { });
        return true;
      }
      const edited = await role
        .edit(
          { icon: iconBuffer, unicodeEmoji: null },
          `Custom role icon (emoji name) by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const iconApplied = edited || await confirmRoleState((liveRole) => Boolean(liveRole.icon));
      if (!iconApplied) {
        await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo.", flags: 1 << 6 }).catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction.reply({ content: "<:success:1461731530333229226> Icona ruolo aggiornata con la custom emoji.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const customEmojiMatch = String(value || "").trim().match(/^<(?:(a):)?[a-zA-Z0-9_]+:(\d+)>$/);
    if (customEmojiMatch) {
      const animated = Boolean(customEmojiMatch[1]);
      const emojiId = String(customEmojiMatch[2] || "");
      const ext = animated ? "gif" : "png";
      const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128&quality=lossless`;
      const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, }).then((r) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null,).catch(() => null);
      if (!iconBuffer) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> Non sono riuscito a caricare l'emoji. Assicurati che sia una custom emoji valida e accessibile.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      const edited = await role
        .edit(
          { icon: iconBuffer, unicodeEmoji: null },
          `Custom role icon (emoji) by ${interaction.user.tag}`,
        )
        .then(() => true)
        .catch(() => false);
      const iconApplied = edited || await confirmRoleState((liveRole) => Boolean(liveRole.icon));
      if (!iconApplied) {
        await interaction
          .reply({
            content:
              "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo.",
            flags: 1 << 6,
          })
          .catch(() => { });
        return true;
      }
      await updatePanelMessage(interaction, panelMessageId, role);
      await interaction
        .reply({
          content:
            "<:success:1461731530333229226> Icona ruolo aggiornata con la custom emoji.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    const looksLikeUnicodeEmoji = /[\p{Extended_Pictographic}\u200D\uFE0F]/u.test(String(value || ""));
    if (!looksLikeUnicodeEmoji) {
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Valore non valido. Usa un'emoji unicode (es. `🐼`), una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    let edited = false;
    let editErr = null;
    try {
      await role.edit(
        { unicodeEmoji: value, icon: null },
        `Custom role emoji by ${interaction.user.tag}`,
      );
      edited = true;
    } catch (e) {
      editErr = e;
    }
    const emojiApplied = edited || await confirmRoleState((liveRole) => String(liveRole.unicodeEmoji || "") === value);
    if (!emojiApplied) {
      const code = editErr?.code || editErr?.rawError?.code || null;
      const message = String(editErr?.rawError?.message || editErr?.message || "");
      const hint = code === 50035 || /role icon|unicode|emoji/i.test(message)
        ? " Probabile che il server non abbia i requisiti per le icone ruolo oppure che l'emoji non sia supportata. Prova con una custom emoji (`<:nome:id>` / `:nome:`) o un URL immagine."
        : "";
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Non sono riuscito ad aggiornare l'icona del ruolo." + hint,
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }
    await updatePanelMessage(interaction, panelMessageId, role);
    await interaction
      .reply({
        content: `<:success:1461731530333229226> Icona ruolo aggiornata: ${value}`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  return true;
}

async function handleRoleColorTypeSelect(interaction) {
  if (!interaction.isStringSelectMenu?.() || !interaction.guild) return false;
  const customId = String(interaction.customId || "");
  if (!customId.startsWith("customrole_color_type_select:")) return false;

  const parts = customId.split(":");
  if (parts.length < 4) return true;
  const [, ownerId, roleId, panelMessageId] = parts;
  const choice = String(interaction.values?.[0] || "");
  if (!(await checkOwnership(interaction, ownerId))) return true;

  if (choice === "solid") {
    const modalId = `customrole_modal_color_solid:${ownerId}:${roleId}:${panelMessageId || ""}`;
    const input = new TextInputBuilder().setCustomId("value").setLabel("Colore HEX").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Colore solido").addComponents(new ActionRowBuilder().addComponents(input));
    const shown = await interaction.showModal(modal).then(() => true).catch((err) => {
      global.logger?.warn?.("[customrole] showModal solid failed:", err?.code || err?.message || err);
      return false;
    });
    if (!shown) {
      await replyEphemeral(interaction, {
        content: "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
        flags: 1 << 6,
      });
    }
    return true;
  }

  if (choice === "gradient") {
    const modalId = `customrole_modal_color_gradient:${ownerId}:${roleId}:${panelMessageId || ""}`;
    const input1 = new TextInputBuilder().setCustomId("value1").setLabel("Colore 1 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
    const input2 = new TextInputBuilder().setCustomId("value2").setLabel("Colore 2 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #6f4e37").setMaxLength(64);
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Colore gradiente").addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2));
    const shown = await interaction.showModal(modal).then(() => true).catch((err) => {
      global.logger?.warn?.("[customrole] showModal gradient failed:", err?.code || err?.message || err);
      return false;
    });
    if (!shown) {
      await replyEphemeral(interaction, {
        content: "<:vegax:1443934876440068179> Impossibile aprire il modulo, riprova.",
        flags: 1 << 6,
      });
    }
    return true;
  }

  if (choice === "holo") {
    const role = await fetchRole(interaction, roleId);
    if (!role) return true;
    if (!canManageRole(interaction, role)) {
      await interaction.update({ content: "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.", embeds: [], components: [] }).catch(() => { });
      return true;
    }
    const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };
    const edited = await role.edit({ colors: HOLO }, `Custom role holographic by ${interaction.user.tag}`).then(() => true).catch(() => false);
    await interaction.update({ content: edited ? "<:success:1461731530333229226> Stile olografico applicato." : "<:VC_Attention:1482534443632558151> Non sono riuscito ad applicare lo stile olografico.", embeds: [], components: [] }).catch(() => { });
    if (edited) await updatePanelMessage(interaction, panelMessageId, role);
    return true;
  }

  await interaction.update({ content: "<:vegax:1443934876440068179> Scelta non valida.", embeds: [], components: [] }).catch(() => { });
  return true;
}

async function handleAddRemoveSelectMenus(interaction) {
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
    const role = ownerState.state.role || (await fetchRole(interaction, roleId));
    if (!targetId || !role) {
      await interaction
        .reply({
          content: "<:VC_Attention:1482534443632558151> Target o ruolo non valido.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const started = await createCustomRoleGrantRequest({ client: interaction.client, guildId: interaction.guild.id, channelId: interaction.channel.id, requesterId: ownerId, targetId, roleId, timeoutMs: 60_000, });

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

    const role = ownerState.state.role || (await fetchRole(interaction, roleId));
    if (!role) {
      await CustomRole.deleteOne({
        guildId: interaction.guild.id,
        userId: ownerId,
      }).catch(() => { });
      await interaction
        .reply({
          content:
            "<:VC_Attention:1482534443632558151> Ruolo non trovato, ricrealo con `+profile`.",
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

  return false;
}

async function handleCustomReactionButton(interaction) {
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
    const promptText = isAdd 
      ? "<:VC_Mention:1482526855289634997> Manda da 1 a 3 emoji che vuoi **aggiungere**:" 
      : "<:VC_Mention:1482526855289634997> Manda da 1 a 3 emoji che vuoi **rimuovere**:";

    await interaction.reply({
      content: promptText,
      flags: PRIVATE_FLAG,
    }).catch(() => {});

    const filter = (m) => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on("collect", async (m) => {
      const tokens = parseReactionTokens(m.content, MAX_REACTIONS, interaction.guild);
      
      if (!tokens.length) {
        await interaction.followUp({
          content: "<:vegax:1443934876440068179> Nessuna emoji valida trovata. Riprova cliccando di nuovo il bottone.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return;
      }

      const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
      let current = Array.isArray(doc?.reactions) ? doc.reactions : [];
      let next;

      if (isAdd) {
        next = Array.from(new Set([...current, ...tokens])).slice(0, MAX_REACTIONS);
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

      // Update Panel
      if (interaction.message) {
        const embed = buildCustomReactionPanelEmbed(next);
        const rows = buildCustomReactionPanelRows(ownerId);
        await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});
      }

      // Cleanup
      await m.delete().catch(() => {});
      await interaction.deleteReply().catch(() => {});
    });

    collector.on("end", async (collected, reason) => {
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
    const embed = buildCustomReactionPanelEmbed([]);
    const rows = buildCustomReactionPanelRows(ownerId);
    await interaction.update({ embeds: [embed], components: rows }).catch(() => {});
    return true;
  }

  return false;
}

async function handleCustomReactionModal(interaction) {
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

  await interaction.deferReply({ flags: PRIVATE_FLAG }).catch(() => {});

  const raw = interaction.fields.getTextInputValue("value") || "";
  const tokens = parseReactionTokens(raw, MAX_REACTIONS, interaction.guild);
  if (!tokens.length) {
    await interaction.editReply({
      content:
        "<:vegax:1443934876440068179> Nessuna reaction valida. Usa emoji unicode o `<:nome:id>`.",
    }).catch(() => {});
    return true;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) {
    await interaction.editReply({ content: "<:vegax:1443934876440068179> Errore server." }).catch(() => {});
    return true;
  }

  const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
  const current = Array.isArray(doc?.reactions) ? doc.reactions : [];
  const next = Array.from(new Set([...current, ...tokens])).slice(0, MAX_REACTIONS);

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

  if (interaction.message) {
    const embed = buildCustomReactionPanelEmbed(next);
    const rows = buildCustomReactionPanelRows(ownerId);
    await interaction.message.edit({ embeds: [embed], components: rows }).catch(() => {});
  }
  return true;
}

async function handleCustomReactionSelect(interaction) {
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

  const token = interaction.values?.[0];
  if (!token) {
    await interaction.update({ content: "<:vegax:1443934876440068179> Selezione non valida.", components: [] }).catch(() => {});
    return true;
  }

  const guildId = interaction.guild?.id;
  if (!guildId) return true;

  const doc = await MentionReaction.findOne({ guildId, userId: ownerId }).catch(() => null);
  const list = Array.isArray(doc?.reactions) ? [...doc.reactions] : [];
  const next = list.filter((t) => String(t) !== String(token));

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
      const embed = buildCustomReactionPanelEmbed(next);
      const rows = buildCustomReactionPanelRows(ownerId);
      await panelMessage.edit({ embeds: [embed], components: rows }).catch(() => {});
    }
  }
  return true;
}

async function handleCustomVocButton(interaction) {
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
  const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId);
  if (!ownerState.ok) return true;

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

async function handleCustomVocModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  const customId = String(interaction.customId || "");
  const isNameModal = customId.startsWith("customvoc_modal_name:");
  const isEmojiModal = customId.startsWith("customvoc_modal_emoji:");
  if (!isNameModal && !isEmojiModal) return false;
  const vocParts = customId.split(":");
  if (vocParts.length !== 3) return true;
  const [, ownerId, channelId] = vocParts;
  if (!ownerId || !channelId) return true;

  const send = async (payload) => { if (interaction.deferred || interaction.replied) { return interaction.editReply(payload).catch(() => { }); } return interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch(() => { }); };

  try {
    if (interaction.user.id !== ownerId) {
      await send({
        content:
          "<:VC_Attention:1482534443632558151> Non puoi modificare questo canale.",
      });
      return true;
    }

    const ownerState = await ensureOwnerCustomRoleActive(interaction, ownerId);
    if (!ownerState.ok) return true;

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
    const ownerCustomRoleDoc = ownerState.state.doc || null;
    const ownerRole = ownerState.state.role || null;

    if (isEmojiModal) {
      const emoji = raw.trim();
      if (!emoji) {
        await send({
          content: "<:vegax:1443934876440068179> Emoji non valida.",
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
    const preservedEmoji = parsedCurrent.emoji || ownerCustomRoleDoc?.customVocEmoji || ownerRole?.unicodeEmoji || "?";
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
async function handleGrantButtons(interaction) {
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
          "<:vegax:1443934876440068179> Azione richiesta non valida.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  const request = pendingRoleGrants.get(token);
  if (!request) {
    await interaction
      .reply({
        content:
          "<:vegax:1443934876440068179> Questa richiesta non è più valida.",
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
            .setTitle("<:VC_Lock:1482526739044368476> Accesso negato")
            .setDescription(
              "<a:VC_Alert:1482706673176150077>Solo l'utente invitato può rispondere a questa richiesta.",
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }
  if (Date.now() > request.expiresAt) {
    pendingRoleGrants.delete(token);
    await interaction
      .reply({ content: "<:VC_Refresh:1473359252276904203> Richiesta scaduta.", flags: 1 << 6 })
      .catch(() => { });
    return true;
  }

  await interaction.deferUpdate().catch(() => { });
  const updateGrantMessage = async (payload) => {
    const msg = interaction.message;
    if (msg?.editable) {
      await msg.edit(payload).catch(() => { });
      return;
    }
    await interaction.update(payload).catch(() => { });
  };

  const guild = await getClientGuildCached(interaction.client, request.guildId);
  const channel = await fetchGuildChannel(guild, request.channelId);
  const role = await fetchGuildRole(guild, request.roleId);
  const requester = await fetchGuildMember(guild, request.requesterId);
  const targetMember = await fetchGuildMember(guild, request.targetId);
  const promptMsg = channel?.messages?.cache?.get(request.promptMessageId) || (await channel?.messages?.fetch(request.promptMessageId).catch(() => null));

  const disabledRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`customrole_grant:${token}:yes`)
    .setEmoji("<:vegacheckmark:1443666279058772028>")
    .setStyle(ButtonStyle.Success)
    .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`customrole_grant:${token}:no`)
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );

  if (action === "no") {
    pendingRoleGrants.delete(token);
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("#e67e22")
              .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
              .setDescription(
                `<:vegax:1443934876440068179> ${targetMember || `<@${request.targetId}>`} ha rifiutato il ruolo ${role ? `**${role.name}**` : ""}.`,
              ),
          ],
        })
        .catch(() => { });
    }
    if (channel) {
      await channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#e67e22")
              .setTitle("<:cancel:1461730653677551691> Ruolo rifiutato")
              .setDescription(
                `<:vegax:1443934876440068179> ${targetMember || `<@${request.targetId}>`} ha rifiutato di ricevere il ruolo ${role ? `**${role.name}**` : ""}.`,
              ),
          ],
        })
        .catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
          .setDescription("<:vegax:1443934876440068179> Hai rifiutato il ruolo."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  if (!guild || !channel || !role || !targetMember || !requester) {
    pendingRoleGrants.delete(token);
    await updateGrantMessage({
      content:
        "<:vegax:1443934876440068179> Errore: dati richiesta non validi.",
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
    pendingRoleGrants.delete(token);
    if (promptMsg) {
      await promptMsg
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setTitle("<:VC_Attention:1482534443632558151> Impossibile assegnare")
              .setDescription(
                "<a:VC_Alert:1482706673176150077> Non posso assegnare questo ruolo per permessi/gerarchia.",
              ),
          ],
        })
        .catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
          .setDescription("<a:VC_Alert:1482706673176150077> Il bot non può assegnare questo ruolo."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  const grantApplied = await targetMember.roles
    .add(role.id, `Custom role accepted from ${requester.user.tag}`)
    .then(() => true)
    .catch(() => false);
  pendingRoleGrants.delete(token);
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
              .setTitle("<:VC_Attention:1482534443632558151> Impossibile assegnare")
              .setDescription(
                "<a:VC_Alert:1482706673176150077> L'assegnazione del ruolo non è andata a buon fine.",
              ),
          ],
        })
        .catch(() => { });
    }
    await updateGrantMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
          .setDescription("<a:VC_Alert:1482706673176150077> Il bot non è riuscito ad assegnare questo ruolo."),
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
            .setTitle("<:success:1461731530333229226> Ruolo Concesso")
            .setDescription(
              `<:vegacheckmark:1443666279058772028> ${targetMember} ha accettato il ruolo **${role.name}**.`,
            ),
        ],
      })
      .catch(() => { });
  }
  await channel
    .send({
      embeds: [
        new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("<:success:1461731530333229226> Ruolo Concesso")
          .setDescription(
            `<:vegacheckmark:1443666279058772028> Il ruolo **${role.name}** è stato assegnato a ${targetMember}.`,
          ),
      ],
    })
    .catch(() => { });
  await updateGrantMessage({
    embeds: [
      new EmbedBuilder()
        .setColor("#2ecc71")
        .setTitle("<:success:1461731530333229226> Richiesta accettata")
        .setDescription(`<:vegacheckmark:1443666279058772028> Hai accettato il ruolo **${role.name}**.`),
    ],
    components: [disabledRow],
  });
  return true;
}

async function handleSiteRoleRequestButtons(interaction) {
  if (!interaction.isButton()) return false;
  if (!String(interaction.customId || "").startsWith("siterolerequest:")) return false;

  const parts = String(interaction.customId || "").split(":");
  const token = String(parts[1] || "").trim();
  const action = String(parts[2] || "").trim().toLowerCase();
  const request = pendingSiteRoleRequests.get(token);
  if (!request) {
    await interaction
      .reply({ content: "<:VC_Refresh:1473359252276904203> Questa richiesta non è più disponibile.", flags: PRIVATE_FLAG })
      .catch(() => { });
    return true;
  }

  if (String(interaction.user?.id || "") !== String(request.ownerId || "")) {
    await interaction
      .reply({
        content: "<:VC_Attention:1482534443632558151> Solo il proprietario del ruolo può rispondere a questa richiesta.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => { });
    return true;
  }

  const disabledRow = buildSiteRoleRequestButtons(token, true);
  const updateMessage = async (payload) => {
    const msg = interaction.message;
    if (msg?.editable) {
      await msg.edit(payload).catch(() => { });
      return;
    }
    await interaction.update(payload).catch(() => { });
  };

  if (Date.now() > Number(request.expiresAt || 0)) {
    pendingSiteRoleRequests.delete(token);
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:VC_update:1478721333096349817> Richiesta scaduta")
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
    pendingSiteRoleRequests.delete(token);
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#e67e22")
          .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
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
            .setTitle("<:cancel:1461730653677551691> Richiesta rifiutata")
            .setDescription(
              `La tua richiesta per il ruolo ${role ? `**${role.name}**` : "custom"} è stata rifiutata dal proprietario.`,
            ),
        ],
      })
      .catch(() => { });
    return true;
  }

  if (!guild || !role || !requesterMember || !ownerMember) {
    pendingSiteRoleRequests.delete(token);
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
          .setDescription("Non riesco più a recuperare i dati di questa richiesta."),
      ],
      components: [disabledRow],
    });
    return true;
  }

  if (requesterMember.roles.cache.has(role.id)) {
    pendingSiteRoleRequests.delete(token);
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("#60a5fa")
          .setTitle("<:VC_Refresh:1473359252276904203> Richiesta già soddisfatta")
          .setDescription(`${requesterMember} possiede già il ruolo **${role.name}**.`),
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
    pendingSiteRoleRequests.delete(token);
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:VC_Attention:1482534443632558151> Impossibile assegnare")
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
  pendingSiteRoleRequests.delete(token);

  if (!granted) {
    await updateMessage({
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("<:vegax:1443934876440068179> Errore")
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
        .setTitle("<:success:1461731530333229226> Richiesta approvata")
        .setDescription(`${requesterMember} ha ricevuto il ruolo **${role.name}**.`),
    ],
    components: [disabledRow],
  });
  await requesterUser
    ?.send({
      embeds: [
        new EmbedBuilder()
          .setColor("#2ecc71")
          .setTitle("<:success:1461731530333229226> Richiesta approvata")
          .setDescription(`Il proprietario ha approvato la tua richiesta: ora hai il ruolo **${role.name}**.`),
      ],
    })
    .catch(() => { });
  return true;
}

async function handleCustomRoleInteraction(interaction) {
  if (await handleCustomReactionButton(interaction)) return true;
  if (await handleCustomReactionModal(interaction)) return true;
  if (await handleCustomReactionSelect(interaction)) return true;
  if (await handleCustomVocButton(interaction)) return true;
  if (await handleCustomVocModal(interaction)) return true;
  if (await handleAddRemoveSelectMenus(interaction)) return true;
  if (await handleGrantButtons(interaction)) return true;
  if (await handleSiteRoleRequestButtons(interaction)) return true;
  if (await handleRoleColorTypeSelect(interaction)) return true;
  if (await handleRoleActionButton(interaction)) return true;
  if (await handleRoleActionModal(interaction)) return true;
  return false;
}

function getPendingRoleGrantByToken(token) {
  if (!token) return null;
  return pendingRoleGrants.get(String(token)) || null;
}

module.exports = {
  handleCustomRoleInteraction,
  createCustomRoleGrantRequest,
  createSiteRoleJoinRequest,
  getPendingRoleGrantByToken,
};