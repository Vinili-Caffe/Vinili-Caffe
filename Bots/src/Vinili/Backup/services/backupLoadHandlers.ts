const { EmbedBuilder, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { readBackupByIdGlobal } = require("./serverBackupService") as typeof import("./serverBackupService");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  formatMessagesLimit,
  getLoadSession,
  updateLoadSessionActions,
  updateLoadSessionMessagesLimit,
  deleteLoadSession,
} = require("./backupLoadSessions") as typeof import("./backupLoadSessions");
const {
  buildLoadWarningEmbed,
  buildLoadInProgressEmbed,
  buildLoadStartComponents,
  buildPreflightWarningEmbed,
  buildPreflightButtons,
  buildLoadDoneEmbed,
  buildLoadErrorEmbed,
  buildLoadCancelledEmbed,
  buildLoadComponents,
} = require("./backupLoadEmbeds") as typeof import("./backupLoadEmbeds");
const { getGuildBackupLoadStatus } = require("./backupLoadActive") as typeof import("./backupLoadActive");
const { confirmBackupLoad } = require("./backupLoadConfirm") as typeof import("./backupLoadConfirm");

function ensureManageGuild(interaction?) {
  return Boolean(interaction?.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild));
}

async function handleBackupLoadInteraction(interaction?) {
  const customId = String(interaction?.customId || "");
  const isSelect = interaction?.isStringSelectMenu?.();
  const isButton = interaction?.isButton?.();

  const isTarget = customId.startsWith("backup_load_actions:") || customId.startsWith("backup_load_messages_limit:") || customId.startsWith("backup_load_confirm:") || customId.startsWith("backup_load_continue:") || customId.startsWith("backup_load_cancel:") || customId.startsWith("backup_load_status:");
  if (!isTarget) return false;

  const sessionId = String(customId || "").split(":")[1] || "";
  const session = getLoadSession(sessionId);
  if (!session) {
    await interaction
      .reply({
        content: `${E.VC_Alert} Sessione backup scaduta. Riesegui **+backup** → **Carica backup**.`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (String(session.userId) !== String(interaction.user?.id || "")) {
    await interaction
      .reply({
        content: `${E.VC_Alert} Questo pannello non è tuo.`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (String(session.guildId) !== String(interaction.guildId || "")) {
    await interaction
      .reply({
        content: `${E.VC_Alert} Questo pannello appartiene a un altro server.`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (!ensureManageGuild(interaction)) {
    await interaction
      .reply({
        content: `${E.VC_Alert} Ti serve il permesso Manage Server per usare il backup load.`,
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (isSelect && customId.startsWith("backup_load_actions:")) {
    const next = updateLoadSessionActions(sessionId, interaction.values || []);
    await interaction
      .update({
        embeds: [buildLoadWarningEmbed(next.backupId, next.messagesLimit)],
        components: buildLoadComponents(next.id, next.actions, next.messagesLimit),
      })
      .catch(() => { });
    return true;
  }

  if (isSelect && customId.startsWith("backup_load_messages_limit:")) {
    const selected = String(interaction.values?.[0] || "").trim();
    const next = updateLoadSessionMessagesLimit(sessionId, selected);
    await interaction
      .update({
        embeds: [buildLoadWarningEmbed(next.backupId, next.messagesLimit)],
        components: buildLoadComponents(next.id, next.actions, next.messagesLimit),
      })
      .catch(() => { });
    return true;
  }

  if (isButton && customId.startsWith("backup_load_cancel:")) {
    deleteLoadSession(sessionId);
    await interaction
      .update({
        embeds: [buildLoadCancelledEmbed(session.backupId)],
        components: [],
      })
      .catch(() => { });
    return true;
  }

  if (isButton && customId.startsWith("backup_load_continue:")) {
    try {
      const ref = session.sourceGuildId ? `${session.sourceGuildId}:${session.backupId}`
        : session.backupId;
      const { payload } = await readBackupByIdGlobal(ref);
      await interaction
        .update({
          embeds: [
            buildPreflightWarningEmbed({
              guild: interaction.guild,
              payload,
              actions: [...session.actions],
              backupId: session.backupId,
              messagesLimit: session.messagesLimit,
            }),
          ],
          components: [buildPreflightButtons(session.id)],
        })
        .catch(() => { });
    } catch (error) {
      global.logger?.error?.("[backup.load] failed:", error);
      await interaction
        .update({
          embeds: [buildLoadErrorEmbed(error)],
          components: [],
        })
        .catch(() => { });
    }

    return true;
  }

  if (isButton && customId.startsWith("backup_load_confirm:")) {
    const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
    if (!deferred) return true;

    const started = await confirmBackupLoad({
      guild: interaction.guild,
      userId: session.userId,
      backupId: session.backupId,
      actions: [...session.actions],
      messagesLimit: session.messagesLimit,
      sourceGuildId: session.sourceGuildId,
      onCheckpoint: async (checkpointId) => {
        await interaction.message
          .edit({
            embeds: [buildLoadInProgressEmbed(session.backupId, checkpointId)],
            components: buildLoadStartComponents(session.id),
          })
          .catch(() => { });
      },
    });

    if (!started.ok) {
      if (started.busy) {
        await interaction
          .followUp({
            content: `${E.VC_Alert} C'è già un backup load in corso in questo server.`,
            flags: 1 << 6,
          })
          .catch(() => { });
      }
      return true;
    }

    await interaction.message
      .edit({
        embeds: [buildLoadInProgressEmbed(session.backupId)],
        components: buildLoadStartComponents(session.id),
      })
      .catch(() => { });

    void started.run.then(async (result) => {
      try {
        if (result.ok) {
          await interaction.message
            .edit({
              embeds: [buildLoadDoneEmbed(session.backupId, result.stats)],
              components: [],
            })
            .catch(() => { });
          return;
        }
        await interaction.message
          .edit({
            embeds: [
              result.cancelled
                ? buildLoadCancelledEmbed(session.backupId)
                : buildLoadErrorEmbed(result.error),
            ],
            components: [],
          })
          .catch(() => { });
      } finally {
        deleteLoadSession(sessionId);
      }
    });

    return true;
  }

  if (isButton && customId.startsWith("backup_load_status:")) {
    const status = getGuildBackupLoadStatus(interaction.guildId);
    if (!status) {
      await interaction
        .reply({
          content: `${E.VC_Alert} Nessun backup load in corso.`,
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const startedAt = Math.floor(Number(status.startedAtMs || Date.now()) / 1000);
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#3498db")
            .setTitle(`${E.VC_update} Backup Load Status`)
            .setDescription(
              [
                `${E.VC_id} Backup ID: \`${status.backupId}\``,
                `${E.VC_Clock} Started: <t:${startedAt}:R>`,
                `${E.VC_update} Phase: \`${status.phase}\``,
                `${E.VC_update} Processed items: **${status.processed}**`,
                `${E.VC_update} Cancel requested: **${status.cancelRequested ? "yes" : "no"}**`,
                `${E.VC_update} Messages limit: \`${formatMessagesLimit(status.messagesLimit)}\``,
                status.checkpointId ? `${E.VC_id} Checkpoint: \`${status.checkpointId}\`` : null,
              ].filter(Boolean).join("\n"),
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  return false;
}

export = { handleBackupLoadInteraction };
