const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { readBackupByIdGlobal, deleteBackupByIdGlobal } = require("../../services/serverBackupService") as typeof import("../../services/serverBackupService");
const { createLoadSession, buildLoadWarningEmbed, buildLoadComponents } = require("../../services/backupLoadService") as typeof import("../../services/backupLoadService");
const { safeEditReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const PREFIX_LOAD = "backup_info_load:";
const PREFIX_DELETE = "backup_info_delete:";
const PREFIX_CONFIRM = "backup_delete_confirm:";
const PREFIX_CANCEL = "backup_delete_cancel:";

function match(interaction?) {
  const id = interaction?.customId || "";
  return (
    interaction.isButton() &&
    (id.startsWith(PREFIX_LOAD) || id.startsWith(PREFIX_DELETE) || id.startsWith(PREFIX_CONFIRM) || id.startsWith(PREFIX_CANCEL))
  );
}

async function execute(interaction?) {
  const customId = interaction.customId || "";
  const EPHEMERAL = 1 << 6;

  if (customId.startsWith(PREFIX_LOAD)) {
    const parts = customId.slice(PREFIX_LOAD.length).split(":");
    const [backupId, userId, guildId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: `${E.VC_Alert} Questo controllo non è tuo.`, flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    try {
      const globalRef = await readBackupByIdGlobal(guildId ? `${guildId}:${backupId}` : backupId);
      const bid = String(globalRef?.payload?.backupId || backupId).toUpperCase();
      const sessionId = createLoadSession({
        guildId: interaction.guild?.id,
        userId: interaction.user?.id,
        backupId: bid,
        sourceGuildId: globalRef?.guildId ?? null,
        messagesLimit: null,
      });
      await safeEditReply(interaction, {
        embeds: [buildLoadWarningEmbed(bid, null)],
        components: buildLoadComponents(sessionId, null, null),
      });
    } catch (err) {
      global.logger?.error?.("[Buttons/backupInfo] load", err);
      await safeEditReply(interaction, {
        content: `${E.vegax} ${String(err?.message || err).slice(0, 300)}`,
      });
    }
    return true;
  }

  if (customId.startsWith(PREFIX_DELETE)) {
    const parts = customId.slice(PREFIX_DELETE.length).split(":");
    const [backupId, userId, guildId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: `${E.VC_Alert} Questo controllo non è tuo.`, flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    await safeEditReply(interaction, {
      embeds: [buildDeleteWarningEmbed()],
      components: [buildDeleteConfirmButtons(backupId, userId, guildId)],
      flags: EPHEMERAL,
    });
    return true;
  }

  if (customId.startsWith(PREFIX_CANCEL)) {
    const rest = customId.slice(PREFIX_CANCEL.length);
    const parts = rest.split(":");
    const [backupId, userId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: `${E.VC_Alert} Questo controllo non è tuo.`, flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    await safeEditReply(interaction, {
      embeds: [new EmbedBuilder().setColor("#3498db").setDescription(`${E.VC_InactiveStatus} Eliminazione annullata.`)],
      components: [],
    });
    return true;
  }

  if (customId.startsWith(PREFIX_CONFIRM)) {
    const rest = customId.slice(PREFIX_CONFIRM.length);
    const parts = rest.split(":");
    const [backupId, userId, guildId] = parts;
    if (!backupId || interaction.user?.id !== userId) {
      await interaction.reply({ content: `${E.VC_Alert} Questo controllo non è tuo.`, flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    if (!interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild)) {
      await interaction.reply({ content: `${E.VC_Alert} Non hai il permesso di gestire questo server.`, flags: EPHEMERAL }).catch(() => { });
      return true;
    }
    try {
      const currentGuildId = String(interaction.guild?.id || "").trim();
      if (guildId && String(guildId).trim() !== currentGuildId) {
        await interaction.reply({
          content: `${E.VC_Alert} Puoi eliminare solo backup di questo server.`,
          flags: EPHEMERAL,
        }).catch(() => {});
        return true;
      }
      const backupRef = currentGuildId ? `${currentGuildId}:${backupId}` : backupId;
      await deleteBackupByIdGlobal(backupRef);
      await safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("#2ecc71")
            .setTitle(`${E.success} Backup eliminato`)
            .setDescription(`${E.success} Il backup \`${backupId}\` è stato eliminato.`),
        ],
        components: [],
        flags: EPHEMERAL,
      });
    } catch (err) {
      global.logger?.error?.("[Buttons/backupInfo] delete", err);
      await safeEditReply(interaction, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`${E.vegax} ${String(err?.message || err).slice(0, 300)}`),
        ],
        components: [],
      });
    }
    return true;
  }

  return false;
}

function buildInfoButtons(backupId?, userId?, guildId?) {
  const loadId = `${PREFIX_LOAD}${backupId}:${userId}:${guildId || ""}`;
  const deleteId = `${PREFIX_DELETE}${backupId}:${userId}:${guildId || ""}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(loadId)
      .setStyle(ButtonStyle.Primary)
      .setEmoji(E.VC_Loading__969578),
    new ButtonBuilder()
      .setCustomId(deleteId)
      .setStyle(ButtonStyle.Danger)
      .setEmoji(E.VC_purge)
  );
}

function buildDeleteConfirmButtons(backupId?, userId?, guildId?) {
  const confirmId = `${PREFIX_CONFIRM}${backupId}:${userId}:${guildId || ""}`;
  const cancelId = `${PREFIX_CANCEL}${backupId}:${userId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setStyle(ButtonStyle.Danger)
      .setEmoji(E.success),
    new ButtonBuilder()
      .setCustomId(cancelId)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(E.cancel)
  );
}

function buildDeleteWarningEmbed() {
  return new EmbedBuilder()
    .setColor("#e74c3c")
    .setTitle(`${E.VC_Alert} Conferma eliminazione`)
    .setDescription(
      `${E.VC_PinkQuestionMark} Sei sicuro di voler **eliminare** questo backup? L'operazione è **irreversibile** e non potrai recuperare i dati.`
    );
}

export = { name: "backupInfo", order: 8, match, execute, buildInfoButtons, buildDeleteConfirmButtons, buildDeleteWarningEmbed };