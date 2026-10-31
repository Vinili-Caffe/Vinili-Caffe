/** Ruoli personalizzati: moduli compilati dal pannello (nome, colore, icona…). */
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const axios = require("axios") as typeof import("axios").default;
const { canManageRole } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { MAX_ROLE_ICON_BYTES, getGuildMemberForOwner, memberHasCustomRoleGradientHoloAccess, isSafeRoleIconUrl, checkOwnership, ensureOwnerCustomRoleActive, fetchRole, updatePanelMessage } = require("./customRoleHelpers") as typeof import("./customRoleHelpers");
const { GRADIENT_HOLO_DENIED_MSG } = require("./customRoleProfilePrompt") as typeof import("./customRoleProfilePrompt");

async function handleRoleActionModal(interaction?) {
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

  let value = "";
  try {
    value = interaction.fields.getTextInputValue("value")?.trim() || "";
  } catch (err) {}

  async function confirmRoleState(checkFn?) {
    const refreshedRole = await fetchRole(interaction, roleId);
    const roleToCheck = refreshedRole || role;
    return Boolean(roleToCheck && checkFn(roleToCheck));
  }

  if (action === "name") {
    const cleaned = String(value).replace(/\s+/g, " ").trim();
    const name = (cleaned.startsWith("༄") ? cleaned : `༄ ${cleaned}`).slice(0, 100).trim();
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
    const renameApplied = edited || await confirmRoleState((liveRole?) => String(liveRole.name || "") === name);
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
      .edit(
        { colors: { primaryColor: hex, secondaryColor: null, tertiaryColor: null } },
        `Custom role color by ${interaction.user.tag}`,
      )
      .then(() => true)
      .catch(() => false);
    const colorApplied =
      edited &&
      (await confirmRoleState((liveRole?) => {
        const primaryOk = String(liveRole.hexColor || "").toUpperCase() === hex.toUpperCase();
        const secondary = liveRole.colors?.secondaryColor;
        const tertiary = liveRole.colors?.tertiaryColor;
        return primaryOk && (secondary == null || secondary === 0) && (tertiary == null || tertiary === 0);
      }));
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
    const member = await getGuildMemberForOwner(interaction, ownerId);
    if (!memberHasCustomRoleGradientHoloAccess(member)) {
      await interaction.reply({ content: GRADIENT_HOLO_DENIED_MSG, flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const raw1 = interaction.fields.getTextInputValue("value1")?.trim() || "";
    const raw2 = interaction.fields.getTextInputValue("value2")?.trim() || "";
    const hex1 = raw1.startsWith("#") ? raw1 : `#${raw1}`;
    const hex2 = raw2.startsWith("#") ? raw2 : `#${raw2}`;
    if (!/^#?[0-9a-fA-F]{6}$/.test(hex1) || !/^#?[0-9a-fA-F]{6}$/.test(hex2)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Colori HEX non validi. Esempio: `#ff66cc`.", flags: 1 << 6 }).catch(() => { });
      return true;
    }
    const edited = await role
      .edit(
        { colors: { primaryColor: hex1, secondaryColor: hex2, tertiaryColor: null } },
        `Custom role gradient by ${interaction.user.tag}`,
      )
      .then(() => true)
      .catch(() => false);
    const applied =
      edited &&
      (await confirmRoleState((liveRole?) => {
        const p = Number(liveRole.colors?.primaryColor ?? liveRole.color ?? NaN);
        const s = Number(liveRole.colors?.secondaryColor ?? NaN);
        const t = liveRole.colors?.tertiaryColor;
        const wantP = parseInt(hex1.replace(/^#/, ""), 16);
        const wantS = parseInt(hex2.replace(/^#/, ""), 16);
        return p === wantP && s === wantS && (t == null || t === 0);
      }));
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
      const clearApplied = cleared || await confirmRoleState((liveRole?) => !liveRole.icon && !liveRole.unicodeEmoji);
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
          validateStatus: (status?) => status >= 200 && status < 300,
        })
        .then((r?) => Buffer.from(r.data))
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
      const iconApplied = edited || await confirmRoleState((liveRole?) => Boolean(liveRole.icon));
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
      const found = interaction.guild?.emojis?.cache?.find?.((e?) => String(e?.name || "") === emojiName) || null;
      if (!found?.id) {
        await interaction.reply({ content: "<:VC_Attention:1482534443632558151> Non trovo questa custom emoji nel server. Incolla l'emoji completa `<:nome:id>` oppure usa un URL.", flags: 1 << 6 }).catch(() => { });
        return true;
      }
      const ext = found.animated ? "gif" : "png";
      const emojiUrl = `https://cdn.discordapp.com/emojis/${found.id}.${ext}?size=128&quality=lossless`;
      const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, }).then((r?) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null,).catch(() => null);
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
      const iconApplied = edited || await confirmRoleState((liveRole?) => Boolean(liveRole.icon));
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
      const iconBuffer = await axios.get(emojiUrl, { responseType: "arraybuffer", timeout: 15000, }).then((r?) => r?.status >= 200 && r?.status < 300 ? Buffer.from(r.data) : null,).catch(() => null);
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
      const iconApplied = edited || await confirmRoleState((liveRole?) => Boolean(liveRole.icon));
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
    const emojiApplied = edited || await confirmRoleState((liveRole?) => String(liveRole.unicodeEmoji || "") === value);
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

export = { handleRoleActionModal };
