const { SlashCommandBuilder } = require("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { createGuildBackup, readBackupByIdGlobal, listAllBackupMetas } = require("../../Services/Backup/serverBackupService");
const {
  createLoadSession,
  buildLoadWarningEmbed,
  buildLoadComponents,
  getGuildBackupLoadStatus,
  cancelGuildBackupLoad,
} = require("../../Services/Backup/backupLoadService");
const { renderList } = require("../../Services/Backup/backupListService");
const { buildInfoButtons, buildDeleteConfirmButtons, buildDeleteWarningEmbed } = require("../../Buttons").backupInfo;
const {
  buildCreatingEmbed,
  buildSuccessEmbed,
  buildErrorEmbed,
  buildInfoEmbed,
  buildLoadStatusEmbed,
  buildLoadCancelResultEmbed,
} = require("../../Utils/Backup/backupUi");
const EPHEMERAL_FLAG = 1 << 6;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Gestione backup server")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("create")
        .setDescription("Salva una snapshot completa del server"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("Mostra i dettagli di un backup")
        .addStringOption((option) =>
          option
            .setName("backup_id")
            .setDescription("ID del backup da visualizzare")
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("load")
        .setDescription("Carica un backup nel server")
        .addStringOption((option) =>
          option
            .setName("backup_id")
            .setDescription("ID del backup da caricare")
            .setAutocomplete(true)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("messages_limit")
            .setDescription("Quanti messaggi ripristinare (0 = tutti, max 50000)")
            .setMinValue(0)
            .setMaxValue(50000)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("list")
        .setDescription("Mostra tutti i backup disponibili"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("delete")
        .setDescription("Elimina un backup salvato")
        .addStringOption((option) =>
          option
            .setName("backup_id")
            .setDescription("ID del backup da eliminare")
            .setAutocomplete(true)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Mostra lo stato del backup load in corso"),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("cancel")
        .setDescription("Annulla il backup load attualmente in corso"),
    ),

  async autocomplete(interaction) {
    try {
      if (String(interaction.commandName || "").toLowerCase() !== "backup") {
        return;
      }
      const focused = interaction.options.getFocused(true);
      if (!focused || focused.name !== "backup_id") {
        return interaction.respond([]);
      }

      const query = String(focused.value || "").trim();
      const metas = await listAllBackupMetas({ search: query, limit: 25, });

      const choices = metas.slice(0, 25).map((meta) => {
        const name = String(meta.label || meta.backupId).slice(0, 100); const value = String(meta.guildId ? `${meta.guildId}:${meta.backupId}` : meta.backupId || "",
        ).slice(0, 100);
        return { name, value };
      });

      return interaction.respond(choices);
    } catch (error) {
      global.logger?.error?.("[backup.autocomplete] failed:", error);
      return interaction.respond([]).catch(() => { });
    }
  },

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    if (sub === "create") {
      await safeEditReply(interaction, {
        embeds: [buildCreatingEmbed()],
        flags: EPHEMERAL_FLAG,
      });

      void (async () => {
        try {
          const result = await createGuildBackup(interaction.guild);
          await safeEditReply(interaction, {
            embeds: [buildSuccessEmbed(interaction.guild, result)],
            flags: EPHEMERAL_FLAG,
          });
        } catch (error) {
          global.logger?.error?.("[backup.create] failed:", error);
          await safeEditReply(interaction, {
            embeds: [buildErrorEmbed(error)],
            flags: EPHEMERAL_FLAG,
          });
        }
      })();
      return;
    }

    if (sub === "info") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "<:VC_InactiveStatus:1482526984234860574> Backup info")],
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        const result = await readBackupByIdGlobal(backupRef);
        const backupId = String(result?.payload?.backupId || "").toUpperCase();
        await safeEditReply(interaction, {
          embeds: [
            buildInfoEmbed(interaction.guild, backupId, result.payload, result.sizeBytes, result.checksum),
          ],
          components: [buildInfoButtons(backupId, interaction.user.id, result.guildId)],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.info] failed:", error);
        const notFound = error?.code === "ENOENT" ? `<:cancel:1461730653677551691> Backup \`${backupRef}\` non trovato.` : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "<:vegax:1443934876440068179> Backup info non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "load") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      const messagesLimit = interaction.options.getInteger("messages_limit");
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "<a:VC_Loading:1482526818278969578> Backup load")],
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        const globalRef = await readBackupByIdGlobal(backupRef);
        const backupId = String(globalRef?.payload?.backupId || "").toUpperCase();
        const sessionId = createLoadSession({ guildId: interaction.guild.id, userId: interaction.user.id, backupId, sourceGuildId: globalRef.guildId, messagesLimit, });
        await safeEditReply(interaction, {
          embeds: [buildLoadWarningEmbed(backupId, messagesLimit)],
          components: buildLoadComponents(sessionId, null, messagesLimit),
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.load] failed:", error);
        const notFound = error?.code === "ENOENT" ? `<:cancel:1461730653677551691> Backup \`${backupRef}\` non trovato.` : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "<:vegax:1443934876440068179> Backup load non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "list") {
      try {
        const payload = await renderList(interaction.user.id, 1, false);
        await safeEditReply(interaction, {
          ...payload,
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.list] failed:", error);
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(error, "<:vegax:1443934876440068179> Backup list non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "delete") {
      const backupRef = String(interaction.options.getString("backup_id") || "").trim();
      if (!backupRef) {
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed("backup_id non valido.", "<:cancel:1461730653677551691> Backup delete")],
          flags: EPHEMERAL_FLAG,
        });
        return;
      }

      try {
        const globalRef = await readBackupByIdGlobal(backupRef);
        const backupId = String(globalRef?.payload?.backupId || "").toUpperCase();
        await safeEditReply(interaction, {
          embeds: [buildDeleteWarningEmbed()],
          components: [
            buildDeleteConfirmButtons(
              backupId,
              interaction.user.id,
              globalRef.guildId,
            ),
          ],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.delete] failed:", error);
        const notFound = error?.code === "ENOENT" ? `<:cancel:1461730653677551691> Backup \`${backupRef}\` non trovato.` : error;
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(notFound, "<:vegax:1443934876440068179> Backup delete non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "status") {
      try {
        const status = getGuildBackupLoadStatus(interaction.guild.id);
        await safeEditReply(interaction, {
          embeds: [buildLoadStatusEmbed(status)],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.status] failed:", error);
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(error, "<:vegax:1443934876440068179> Backup status non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }

    if (sub === "cancel") {
      try {
        const cancelled = cancelGuildBackupLoad(interaction.guild.id);
        await safeEditReply(interaction, {
          embeds: [buildLoadCancelResultEmbed(cancelled)],
          flags: EPHEMERAL_FLAG,
        });
      } catch (error) {
        global.logger?.error?.("[backup.cancel] failed:", error);
        await safeEditReply(interaction, {
          embeds: [buildErrorEmbed(error, "<:vegax:1443934876440068179> Backup cancel non riuscito")],
          flags: EPHEMERAL_FLAG,
        });
      }
      return;
    }
  },
};