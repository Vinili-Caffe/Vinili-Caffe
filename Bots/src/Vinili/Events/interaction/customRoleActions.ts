/** Ruoli personalizzati: pulsanti del pannello e scelta del tipo di colore. */
const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { replyEphemeral, parseRoleActionId, canManageRole } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { PRIVATE_FLAG, getGuildMemberForOwner, memberHasCustomRoleGradientHoloAccess, checkOwnership, ensureOwnerCustomRoleActive, fetchRole, updatePanelMessage } = require("./customRoleHelpers") as typeof import("./customRoleHelpers");
const { GRADIENT_HOLO_DENIED_MSG, registerProfilePrompt } = require("./customRoleProfilePrompt") as typeof import("./customRoleProfilePrompt");

async function handleRoleActionButton(interaction?) {
  if (!interaction.isButton()) return false;
  if (String(interaction.customId || "").startsWith("customrole_grant:"))
    return false;
  const parsed = parseRoleActionId(interaction.customId);
  if (!parsed || !parsed.head.startsWith("customrole_")) return false;

  const { head, ownerId, roleId } = parsed;
  if (!(await checkOwnership(interaction, ownerId))) return true;

  const modalHeads = new Set([ "customrole_color_solid", "customrole_color_gradient" ]);
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
      const member = await getGuildMemberForOwner(interaction, ownerId);
      if (!memberHasCustomRoleGradientHoloAccess(member)) {
        await replyEphemeral(interaction, { content: GRADIENT_HOLO_DENIED_MSG, flags: PRIVATE_FLAG });
        return true;
      }
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
    const isSecondary = String(roleId) === String(ownerDoc?.secondaryRoleId || "");
    const hadSecondary = Boolean(ownerDoc?.secondaryRoleId);
    
    const roleName = role.name;
    const roleDeleted = await role
      .delete(`Ruolo personalizzato eliminato da ${interaction.user.tag}`)
      .then(() => true)
      .catch(() => false);
    if (!roleDeleted) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non sono riuscito a eliminare il ruolo. Controlla gerarchia e permessi.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const updatePayload = isSecondary
      ? { $set: { secondaryRoleId: null } }
      : hadSecondary
        ? { $set: { roleId: ownerDoc.secondaryRoleId, secondaryRoleId: null } }
        : { $set: { roleId: null } };
    await CustomRole.updateOne(
      { guildId: interaction.guild.id, userId: ownerId },
      updatePayload,
    ).catch(() => { });

    await interaction.deferUpdate().catch(() => { });
    const doneMsg = `<:vegacheckmark:1443666279058772028> Il ruolo **${roleName}** è stato eliminato.`;
    await interaction.followUp({ content: doneMsg, flags: PRIVATE_FLAG }).catch(() => {
      return interaction.reply({ content: doneMsg, flags: PRIVATE_FLAG }).catch(() => { });
    });
    return true;
  }

  if (head === "customrole_name") {
    registerProfilePrompt(interaction, { type: "role_name", ownerId, roleId });
    await interaction.reply({ content: "✏️ Invia il nuovo nome del custom role in questo canale.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_emoji") {
    registerProfilePrompt(interaction, { type: "role_emoji", ownerId, roleId });
    await interaction.reply({ content: "✏️ Invia l'emoji/icona del ruolo. Puoi usare emoji unicode, `<:nome:id>`, `:nome:`, URL immagine oppure `nessuno` per rimuoverla.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_color") {
    registerProfilePrompt(interaction, { type: "role_color", ownerId, roleId });
    await interaction.reply({ content: "✏️ Invia un colore HEX (`#ff66cc`). Se hai accesso a gradiente puoi inviare due HEX (`#ff66cc #6f4e37`) oppure `olografico`.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_members") {
    registerProfilePrompt(interaction, { type: "role_add", ownerId, roleId });
    await interaction.reply({ content: "✏️ Menziona l'utente a cui vuoi inviare la richiesta per il custom role.", flags: PRIVATE_FLAG }).catch(() => { });
    return true;
  }

  if (head === "customrole_members_remove") {
    registerProfilePrompt(interaction, { type: "role_remove", ownerId, roleId });
    await interaction.reply({ content: "✏️ Menziona l'utente da rimuovere dal tuo custom role.", flags: PRIVATE_FLAG }).catch(() => { });
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
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await replyEphemeral(interaction, { content: GRADIENT_HOLO_DENIED_MSG, flags: PRIVATE_FLAG });
      return true;
    }
    const role = await fetchRole(interaction, roleId);
    if (!role) return true;
    if (!canManageRole(interaction, role)) {
      await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non posso modificare questo ruolo.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };
    const edited = await role.edit({ colors: HOLO }, `Custom role holographic by ${interaction.user.tag}`).then(() => true).catch(() => false);
    // bug: confirmRoleState esiste solo nella funzione dei modali, qui era undefined e lo stile olografico
    // andava in errore. Stesso controllo: si rilegge il ruolo da Discord e si guarda se i colori sono quelli giusti.
    const confirmHoloState = async (checkFn) => {
      const refreshedRole = await fetchRole(interaction, roleId);
      const roleToCheck = refreshedRole || role;
      return Boolean(roleToCheck && checkFn(roleToCheck));
    };
    const applied =
      edited &&
      (await confirmHoloState((liveRole?) => {
        const p = Number(liveRole.colors?.primaryColor ?? NaN);
        const s = Number(liveRole.colors?.secondaryColor ?? NaN);
        const t = Number(liveRole.colors?.tertiaryColor ?? NaN);
        return p === HOLO.primaryColor && s === HOLO.secondaryColor && t === HOLO.tertiaryColor;
      }));
    if (!applied) {
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

async function handleRoleColorTypeSelect(interaction?) {
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
    const shown = await interaction.showModal(modal).then(() => true).catch((err?) => {
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
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await interaction.update({ content: GRADIENT_HOLO_DENIED_MSG, embeds: [], components: [] }).catch(() => { });
      return true;
    }
    const modalId = `customrole_modal_color_gradient:${ownerId}:${roleId}:${panelMessageId || ""}`;
    const input1 = new TextInputBuilder().setCustomId("value1").setLabel("Colore 1 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #ff66cc").setMaxLength(64);
    const input2 = new TextInputBuilder().setCustomId("value2").setLabel("Colore 2 (HEX)").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Es: #6f4e37").setMaxLength(64);
    const modal = new ModalBuilder().setCustomId(modalId).setTitle("Colore gradiente").addComponents(new ActionRowBuilder().addComponents(input1), new ActionRowBuilder().addComponents(input2));
    const shown = await interaction.showModal(modal).then(() => true).catch((err?) => {
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
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await interaction.update({ content: GRADIENT_HOLO_DENIED_MSG, embeds: [], components: [] }).catch(() => { });
      return true;
    }
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

export = { handleRoleActionButton, handleRoleColorTypeSelect };
