/** Stanze vocali: gestione dei pulsanti del pannello. */
const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { normalizeStanzaDiscordUserId } = require("./stanzaNames") as typeof import("./stanzaNames");
const { clearStanzaRenamePending, clearStanzaEmojiPending, registerStanzaEmojiPending, clearStanzaVicePending, clearStanzaUsersMemberPending, registerStanzaUsersMemberPending, registerStanzaVicePending, registerStanzaRenamePending, clearStanzaLimitPending, registerStanzaLimitPending, clearStanzaDescPending, registerStanzaDescPending } = require("./stanzaPending") as typeof import("./stanzaPending");
const { applyStanzaMemberRoleAccessLocked, applyStanzaMemberRoleAccessPublic, applyStanzaMemberRoleViewHidden, applyStanzaMemberRoleViewVisible } = require("./stanzaPerms") as typeof import("./stanzaPerms");
const { channelIdIsLinkedCustomRolePrivateVoc, buildStanzaHomePanelEmbed, buildStanzaManageSettingsEmbed, buildStanzaHomeRows, buildStanzaManageRows, buildStanzaUsersManageEmbed, buildStanzaUsersManageRows, teardownStanza, parseStanzaButtonId, buildStanzaPermissionsListEmbed, fetchOwnerMember, fetchStanzaVoiceChannel, getStanzaMetaOrRehydrate } = require("./stanzaPanel") as typeof import("./stanzaPanel");
const { pickRandomTeardownMoveTarget, moveStanzaOccupantsToChannel } = require("./stanzaLifecycle") as typeof import("./stanzaLifecycle");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function isStanzaRoomController(meta?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid || !meta) return false;
  if (uid === String(meta.ownerId || "")) return true;
  const vice = normalizeStanzaDiscordUserId(meta.viceUserId);
  return Boolean(vice && uid === vice);
}

async function handleStanzaButton(interaction?) {
  if (!interaction?.isButton?.()) return false;
  const parsed = parseStanzaButtonId(interaction.customId);
  if (!parsed) return false;
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: `${E.VC_Cross} Questa azione è disponibile solo nel server.`, flags: 64 }).catch(() => {});
    return true;
  }
  const meta = await getStanzaMetaOrRehydrate(guild, parsed.channelId);
  if (!meta) {
    await interaction.reply({ content: `${E.VC_Cross} Questa stanza non è più attiva.`, flags: 64 }).catch(() => {});
    return true;
  }
  if (!isStanzaRoomController(meta, interaction.user?.id)) {
    await interaction
      .reply({ content: `${E.VC_Cross} Solo il creatore della stanza e il vice possono usare questi pulsanti.`, flags: 64 })
      .catch(() => {});
    return true;
  }
  if (
    parsed.head !== "stanza_nome" &&
    parsed.head !== "stanza_emoji" &&
    parsed.head !== "stanza_limite" &&
    parsed.head !== "stanza_desc" &&
    parsed.head !== "stanza_vice"
  ) {
    clearStanzaRenamePending(guild.id, interaction.user.id);
    clearStanzaEmojiPending(guild.id, interaction.user.id);
    clearStanzaLimitPending(guild.id, interaction.user.id);
    clearStanzaDescPending(guild.id, interaction.user.id);
    clearStanzaVicePending(guild.id, interaction.user.id);
    clearStanzaUsersMemberPending(guild.id, interaction.user.id);
  }

  if (parsed.head === "stanza_delete") {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
    const vid = parsed.channelId;
    const voiceCh = await fetchStanzaVoiceChannel(guild, vid);
    const profileVoc = await channelIdIsLinkedCustomRolePrivateVoc(guild.id, vid);
    await interaction
      .editReply({
        content: profileVoc
          ? `${E.VC_Loading__376253} Rimuovo il pannello stanza dalla vocale privata…`
          : `${E.VC_Loading__376253} Eliminazione stanza e spostamento...`,
      })
      .catch(() => {});
    const me = guild.members.me;
    const canMove = Boolean(me?.permissions?.has(PermissionsBitField.Flags.MoveMembers));
    let moveTarget = null;
    let moveStats = { moved: 0, attempted: 0 };
    if (!profileVoc && voiceCh && canMove) {
      moveTarget = await pickRandomTeardownMoveTarget(guild, vid);
      if (moveTarget) {
        moveStats = await moveStanzaOccupantsToChannel(voiceCh, moveTarget);
      }
    }
    const preservedProfileVoc = await teardownStanza(guild, vid);
    let doneText = preservedProfileVoc
      ? `${E.VC_Verified} Pannello rimosso.`
      : `${E.VC_Verified} Stanza eliminata.`;
    if (
      !preservedProfileVoc &&
      voiceCh &&
      !canMove
    ) {
      doneText = `${E.VC_Verified} Stanza eliminata.`;
    } else if (!preservedProfileVoc && voiceCh && canMove && !moveTarget) {
      doneText =
        `${E.VC_Verified} Stanza eliminata.`;
    } else if (!preservedProfileVoc && voiceCh && moveTarget && moveStats.attempted > 0 && moveStats.moved === 0) {
      doneText =
        `${E.VC_Verified} Stanza eliminata.`;
    } else if (!preservedProfileVoc && voiceCh && moveStats.moved > 0) {
      doneText =
        moveStats.moved === moveStats.attempted
          ? `${E.VC_Verified} Stanza eliminata.`
          : `${E.VC_Verified} Stanza eliminata.`;
    }
    await interaction.editReply({ content: doneText }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_nome") {
    registerStanzaRenamePending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content:
          "✏️ Scrivi il nuovo nome della stanza.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_emoji") {
    registerStanzaEmojiPending(guild.id, interaction.user.id, parsed.channelId);
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("🌀 · Cambia Emoji")
      .setDescription("Invia un'emoji Unicode (es: 🫧, 🔥).");
    await interaction.reply({ embeds: [embed], flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_limite") {
    registerStanzaLimitPending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content: "🔢 · Scrivi il limite (0-99).",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_desc") {
    registerStanzaDescPending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content:
          "📝 · Scrivi lo stato del canale vocale. Lascia vuoto per cancellarlo.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  const voiceCh = await fetchStanzaVoiceChannel(guild, parsed.channelId);
  if (!voiceCh) {
    await interaction.reply({ content: `${E.VC_Cross} Canale vocale non trovato.`, flags: 64 }).catch(() => {});
    return true;
  }

  const ownerMember = await fetchOwnerMember(guild, meta.ownerId);
  if (!ownerMember) {
    await interaction.reply({ content: `${E.VC_Cross} Impossibile caricare il creatore della stanza.`, flags: 64 }).catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_manage") {
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(voiceCh, meta)],
        components: buildStanzaManageRows(voiceCh),
      })
      .catch(async () => {
        await interaction.reply({ content: `${E.VC_Cross} Non è stato possibile aggiornare il pannello.`, flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_users") {
    const updated = (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaUsersManageEmbed(updated)],
        components: buildStanzaUsersManageRows(updated, meta),
      })
      .catch(async () => {
        await interaction.reply({ content: `${E.VC_Cross} Non è stato possibile aggiornare il pannello.`, flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_users_back") {
    const startedAt = Number(meta.startedAt) || Date.now();
    const updatedHome =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaHomePanelEmbed(ownerMember, updatedHome, startedAt, meta)],
        components: buildStanzaHomeRows(parsed.channelId),
      })
      .catch(async () => {
        await interaction.reply({ content: `${E.VC_Cross} Non è stato possibile aggiornare il pannello.`, flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_back") {
    const startedAt = Number(meta.startedAt) || Date.now();
    const updatedHome =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    await interaction
      .update({
        embeds: [buildStanzaHomePanelEmbed(ownerMember, updatedHome, startedAt, meta)],
        components: buildStanzaHomeRows(parsed.channelId),
      })
      .catch(async () => {
        await interaction.reply({ content: `${E.VC_Cross} Non è stato possibile aggiornare il pannello.`, flags: 64 }).catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_nascondi" || parsed.head === "stanza_mostra") {
    const hide = parsed.head === "stanza_nascondi";
    const ok = hide
      ? await applyStanzaMemberRoleViewHidden(voiceCh, guild, meta.ownerId)
      : await applyStanzaMemberRoleViewVisible(voiceCh, guild);
    const updated =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    if (!ok) {
      await interaction
        .reply({
          content:
            `${E.VC_Cross} Non è stato possibile aggiornare i permessi del canale.`,
          flags: 64,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(updated, meta)],
        components: buildStanzaManageRows(updated),
      })
      .catch(async () => {
        await interaction
          .reply({
            content: hide
              ? "👻 Canale nascosto per tutti."
              : "👁️ Visibilità ripristinata per tutti.",
            flags: 64,
          })
          .catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_blocca" || parsed.head === "stanza_sblocca") {
    const lock = parsed.head === "stanza_blocca";
    const ok = lock
      ? await applyStanzaMemberRoleAccessLocked(voiceCh, guild, meta.ownerId)
      : await applyStanzaMemberRoleAccessPublic(voiceCh, guild);
    const updated =
      (await fetchStanzaVoiceChannel(guild, parsed.channelId).catch(() => null)) || voiceCh;
    if (!ok) {
      await interaction
        .reply({
          content:
            `${E.VC_Cross} Non è stato possibile aggiornare i permessi del canale.`,
          flags: 64,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .update({
        embeds: [buildStanzaManageSettingsEmbed(updated, meta)],
        components: buildStanzaManageRows(updated),
      })
      .catch(async () => {
        await interaction
          .reply({
            content: lock
              ? "🔒 Accesso bloccato per tutti."
              : "🌟 Accesso ripristinato per tutti.",
            flags: 64,
          })
          .catch(() => {});
      });
    return true;
  }

  if (parsed.head === "stanza_vice") {
    if (String(interaction.user?.id || "") !== String(meta.ownerId || "")) {
      await interaction
        .reply({ content: `${E.VC_Cross} Solo il creatore della stanza può nominare o revocare il vice.`, flags: 64 })
        .catch(() => {});
      return true;
    }
    registerStanzaVicePending(guild.id, interaction.user.id, parsed.channelId);
    await interaction
      .reply({
        content:
          "🌙 Menziona l'utente da nominare Vice.\n" +
          "Scrivi `nessuno` o menziona il vice attuale per rimuoverlo.\n\n" +
          "Il vice ottiene sul canale gli stessi permessi del creatore (solo per questa stanza).",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_include") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "include", interaction);
    await interaction
      .reply({
        content: "✏️ Menziona l'utente da includere.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_exclude") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "exclude", interaction);
    await interaction
      .reply({
        content: "✏️ Menziona l'utente da escludere.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_silenzia") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "silenzia", interaction);
    await interaction
      .reply({
        content: "🛡️ Menziona l'utente da silenziare.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_smuta") {
    registerStanzaUsersMemberPending(guild.id, interaction.user.id, parsed.channelId, "smuta", interaction);
    await interaction
      .reply({
        content: "🔊 Menziona l'utente da smutare.",
        flags: 64,
      })
      .catch(() => {});
    return true;
  }

  if (parsed.head === "stanza_users_list") {
    await interaction
      .reply({ embeds: [buildStanzaPermissionsListEmbed(voiceCh, meta)], flags: 64 })
      .catch(() => {});
    return true;
  }

  await interaction.reply({ content: `${E.VC_Cross} Azione non disponibile.`, flags: 64 }).catch(() => {});
  return true;
}

export = { isStanzaRoomController, handleStanzaButton };
