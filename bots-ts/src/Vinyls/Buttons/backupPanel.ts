const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { safeMessageEdit } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
const { parseBackupPanelSelectCustomId, buildBackupPanelNavRow, SECTION_HOME } = require("../Utils/Backup/backupPanelNav") as typeof import("../Utils/Backup/backupPanelNav");
const {
  buildBackupPanelPayload,
  buildBackupPanelModal,
  parseBackupPanelModalCustomId,
  parseBackupPanelOpenButtonId,
} = require("../Utils/Backup/backupPanelRuntime") as typeof import("../Utils/Backup/backupPanelRuntime");
const { createGuildBackup, readBackupByIdGlobal } = require("../Services/Backup/serverBackupService") as typeof import("../Services/Backup/serverBackupService");
const {
  createLoadSession,
  buildLoadWarningEmbed,
  buildLoadComponents,
  getGuildBackupLoadStatus,
  cancelGuildBackupLoad,
} = require("../Services/Backup/backupLoadService") as typeof import("../Services/Backup/backupLoadService");
const { buildInfoButtons, buildDeleteConfirmButtons, buildDeleteWarningEmbed } = require("./backupInfo") as typeof import("./backupInfo");
const {
  buildSuccessEmbed,
  buildErrorEmbed,
  buildCreatingEmbed,
  buildInfoEmbed,
  buildLoadStatusEmbed,
  buildLoadCancelResultEmbed,
} = require("../Utils/Backup/backupUi") as typeof import("../Utils/Backup/backupUi");

const PRIVATE = 1 << 6;

async function applyPanelUpdate(interaction?, payload?) {
  const { safeInteractionUpdate, safeMessageEdit } = require("../../shared/discord/replyRuntime") as typeof import("../../shared/discord/replyRuntime");
  if (interaction.deferred && interaction.message?.edit) {
    await safeMessageEdit(interaction.message, payload, interaction);
    return;
  }
  const updated = await safeInteractionUpdate(interaction, payload);
  if (!updated) throw new Error("interaction_update_failed");
}

function match(interaction?) {
  const id = String(interaction?.customId || "");
  const ok =
    interaction?.isStringSelectMenu?.() ||
    interaction?.isButton?.() ||
    interaction?.isModalSubmit?.();
  if (!ok) return false;
  return id.startsWith("backup_panel:") || id.startsWith("backup_panel_modal:");
}

function denyNotOwner(interaction?) {
  return interaction.reply({
    embeds: [new EmbedBuilder().setColor("#e74c3c").setDescription("<:vegax:1443934876440068179> Questo pannello non è tuo.")],
    flags: PRIVATE,
  }).catch(() => {});
}

async function execute(interaction?) {
  const id = String(interaction.customId || "");

  if (interaction.isModalSubmit() && id.startsWith("backup_panel_modal:")) {
    const parsed = parseBackupPanelModalCustomId(id);
    if (!parsed || String(interaction.user?.id || "") !== parsed.ownerId) {
      await denyNotOwner(interaction);
      return true;
    }
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Disponibile solo in server.", flags: PRIVATE }).catch(() => {});
      return true;
    }
    const rawRef = String(interaction.fields.getTextInputValue("backup_id") || "").trim();
    if (!rawRef) {
      await interaction.reply({ content: "ID backup mancante.", flags: PRIVATE }).catch(() => {});
      return true;
    }

    await interaction.deferReply({ flags: PRIVATE }).catch(() => {});

    if (parsed.scope === "info") {
      try {
        const result = await readBackupByIdGlobal(rawRef);
        if (String(result.guildId || "") !== String(guild.id)) {
          await interaction.editReply({
            content: "<a:VC_Alert:1482706673176150077> Quel backup appartiene a un altro server.",
          }).catch(() => {});
          return true;
        }
        const backupId = String(result?.payload?.backupId || "").toUpperCase();
        const nav = buildBackupPanelNavRow(parsed.ownerId, "info");
        await safeMessageEdit(
          interaction.message,
          {
            embeds: [buildInfoEmbed(guild, backupId, result.payload, result.sizeBytes, result.checksum)],
            components: [nav, buildInfoButtons(backupId, parsed.ownerId, result.guildId)],
          },
          interaction,
        ).catch(() => {});
        await interaction.editReply({ content: "<:success:1461731530333229226> Dettagli aggiornati nel messaggio del pannello." }).catch(() => {});
      } catch (error) {
        global.logger?.error?.("[backupPanel] info modal", error);
        const notFound =
          error?.code === "ENOENT"
            ? `<:cancel:1461730653677551691> Backup \`${rawRef}\` non trovato.`
            : String(error?.message || error);
        await interaction.editReply({ content: notFound.slice(0, 1900) }).catch(() => {});
      }
      return true;
    }

    if (parsed.scope === "load") {
      const rawLimit = String(interaction.fields.getTextInputValue("messages_limit") || "").trim();
      let messagesLimit;
      if (rawLimit === "") {
        messagesLimit = undefined;
      } else {
        const n = Number.parseInt(rawLimit, 10);
        messagesLimit = Number.isFinite(n) ? n : undefined;
      }
      try {
        const globalRef = await readBackupByIdGlobal(rawRef);
        if (String(globalRef.guildId || "") !== String(guild.id)) {
          await interaction.editReply({
            content: "<a:VC_Alert:1482706673176150077> Non puoi caricare backup di un altro server.",
          }).catch(() => {});
          return true;
        }
        const backupId = String(globalRef?.payload?.backupId || "").toUpperCase();
        const sessionId = createLoadSession({
          guildId: guild.id,
          userId: parsed.ownerId,
          backupId,
          sourceGuildId: guild.id,
          messagesLimit,
        });
        await safeMessageEdit(
          interaction.message,
          {
            embeds: [buildLoadWarningEmbed(backupId, messagesLimit)],
            components: buildLoadComponents(sessionId, null, messagesLimit),
          },
          interaction,
        ).catch(() => {});
        await interaction.editReply({ content: "<:success:1461731530333229226> Wizard di caricamento mostrato nel messaggio del pannello." }).catch(() => {});
      } catch (error) {
        global.logger?.error?.("[backupPanel] load modal", error);
        const notFound =
          error?.code === "ENOENT"
            ? `<:cancel:1461730653677551691> Backup \`${rawRef}\` non trovato.`
            : String(error?.message || error);
        await interaction.editReply({ content: notFound.slice(0, 1900) }).catch(() => {});
      }
      return true;
    }

    if (parsed.scope === "delete") {
      try {
        const globalRef = await readBackupByIdGlobal(rawRef);
        if (String(globalRef.guildId || "") !== String(guild.id)) {
          await interaction.editReply({
            content: "<a:VC_Alert:1482706673176150077> Non puoi eliminare backup di un altro server.",
          }).catch(() => {});
          return true;
        }
        const backupId = String(globalRef?.payload?.backupId || "").toUpperCase();
        const nav = buildBackupPanelNavRow(parsed.ownerId, "delete");
        await safeMessageEdit(
          interaction.message,
          {
            embeds: [buildDeleteWarningEmbed()],
            components: [nav, buildDeleteConfirmButtons(backupId, parsed.ownerId, guild.id)],
          },
          interaction,
        ).catch(() => {});
        await interaction.editReply({ content: "<:success:1461731530333229226> Conferma l’eliminazione nel messaggio del pannello." }).catch(() => {});
      } catch (error) {
        global.logger?.error?.("[backupPanel] delete modal", error);
        const notFound =
          error?.code === "ENOENT"
            ? `<:cancel:1461730653677551691> Backup \`${rawRef}\` non trovato.`
            : String(error?.message || error);
        await interaction.editReply({ content: notFound.slice(0, 1900) }).catch(() => {});
      }
      return true;
    }

    return true;
  }

  if (interaction.isButton() && id.startsWith("backup_panel:open:")) {
    const parsed = parseBackupPanelOpenButtonId(id);
    if (!parsed || String(interaction.user?.id || "") !== parsed.ownerId) {
      await denyNotOwner(interaction);
      return true;
    }
    const modal = buildBackupPanelModal(parsed.action, parsed.ownerId);
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isStringSelectMenu()) {
    const parsed = parseBackupPanelSelectCustomId(id);
    if (!parsed || String(interaction.user?.id || "") !== parsed.ownerId) {
      await denyNotOwner(interaction);
      return true;
    }
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "Disponibile solo in server.", flags: PRIVATE }).catch(() => {});
      return true;
    }

    const section = String(interaction.values?.[0] || SECTION_HOME).toLowerCase();

    if (section === "create") {
      await interaction
        .update({
          embeds: [buildCreatingEmbed()],
          components: [buildBackupPanelNavRow(parsed.ownerId, "create")],
        })
        .catch(async () => {
          await interaction.reply({ embeds: [buildCreatingEmbed()], flags: PRIVATE }).catch(() => {});
        });
      void (async () => {
        try {
          const result = await createGuildBackup(guild);
          await safeMessageEdit(
            interaction.message,
            {
              embeds: [buildSuccessEmbed(guild, result)],
              components: [buildBackupPanelNavRow(parsed.ownerId, "create")],
            },
            interaction,
          ).catch(() => {});
        } catch (error) {
          global.logger?.error?.("[backupPanel] create", error);
          await safeMessageEdit(
            interaction.message,
            {
              embeds: [buildErrorEmbed(error)],
              components: [buildBackupPanelNavRow(parsed.ownerId, "create")],
            },
            interaction,
          ).catch(() => {});
        }
      })();
      return true;
    }

    if (section === "status") {
      const status = getGuildBackupLoadStatus(guild.id);
      const payload = {
        embeds: [buildLoadStatusEmbed(status)],
        components: [buildBackupPanelNavRow(parsed.ownerId, "status")],
      };
      await interaction.update(payload).catch(async () => {
        await interaction.reply({ ...payload, flags: PRIVATE }).catch(() => {});
      });
      return true;
    }

    if (section === "cancel") {
      const cancelled = cancelGuildBackupLoad(guild.id);
      const payload = {
        embeds: [buildLoadCancelResultEmbed(cancelled)],
        components: [buildBackupPanelNavRow(parsed.ownerId, "cancel")],
      };
      await interaction.update(payload).catch(async () => {
        await interaction.reply({ ...payload, flags: PRIVATE }).catch(() => {});
      });
      return true;
    }

    if (section === "list") {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      const payload = await buildBackupPanelPayload(guild, parsed.ownerId, section);
      await applyPanelUpdate(interaction, payload).catch(async () => {
        await interaction.reply({ ...payload, flags: PRIVATE }).catch(() => {});
      });
      return true;
    }

    const payload = await buildBackupPanelPayload(guild, parsed.ownerId, section);
    await applyPanelUpdate(interaction, payload).catch(async () => {
      await interaction.reply({ ...payload, flags: PRIVATE }).catch(() => {});
    });
    return true;
  }

  return false;
}

export = { name: "backupPanel", order: 6, match, execute };