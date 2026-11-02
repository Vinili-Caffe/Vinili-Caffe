const { EmbedBuilder, PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { readBackupByIdGlobal, createGuildBackup } = require("./serverBackupService") as typeof import("./serverBackupService");
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
const {
  startActiveLoadIfIdle,
  finishActiveLoad,
  updateActiveLoad,
  getGuildBackupLoadStatus,
} = require("./backupLoadActive") as typeof import("./backupLoadActive");
const { applyBackupToGuild } = require("./backupLoadApply") as typeof import("./backupLoadApply");

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
        content: "<a:VC_Alert:1482706673176150077> Sessione backup scaduta. Riesegui **+backup** → **Carica backup**.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (String(session.userId) !== String(interaction.user?.id || "")) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo pannello non è tuo.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (String(session.guildId) !== String(interaction.guildId || "")) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo pannello appartiene a un altro server.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (!ensureManageGuild(interaction)) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Ti serve il permesso Manage Server per usare il backup load.",
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
    const activeLoad = startActiveLoadIfIdle({
      guildId: interaction.guildId,
      userId: session.userId,
      backupId: session.backupId,
      actions: [...session.actions],
      messagesLimit: session.messagesLimit,
    });
    if (!activeLoad) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1482706673176150077> C'è già un backup load in corso in questo server.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
    if (!deferred) {
      finishActiveLoad(interaction.guildId);
      return true;
    }
    await interaction.message
      .edit({
        embeds: [buildLoadInProgressEmbed(session.backupId)],
        components: buildLoadStartComponents(session.id),
      })
      .catch(() => { });

    void (async () => {
      try {
        let checkpointId = null;
        try {
          const checkpoint = await createGuildBackup(interaction.guild, { source: "automatic", });
          checkpointId = String(checkpoint?.backupId || "").toUpperCase() || null;
          updateActiveLoad(interaction.guildId, { checkpointId });
          if (checkpointId) {
            await interaction.message
              .edit({
                embeds: [buildLoadInProgressEmbed(session.backupId, checkpointId)],
                components: buildLoadStartComponents(session.id),
              })
              .catch(() => { });
          }
        } catch (checkpointError) {
          global.logger?.warn?.("[backup.load] checkpoint failed:", checkpointError);
        }

        const stats = await applyBackupToGuild(interaction.guild, session.backupId, [...session.actions], session.sourceGuildId, session.messagesLimit,);
        await interaction.message
          .edit({
            embeds: [buildLoadDoneEmbed(session.backupId, stats)],
            components: [],
          })
          .catch(() => { });
      } catch (error) {
        global.logger?.error?.("[backup.load] failed:", error);
        await interaction.message
          .edit({
            embeds: [
              error?.code === "BACKUP_LOAD_CANCELLED"
                ? buildLoadCancelledEmbed(session.backupId)
                : buildLoadErrorEmbed(error),
            ],
            components: [],
          })
          .catch(() => { });
      } finally {
        finishActiveLoad(interaction.guildId);
        deleteLoadSession(sessionId);
      }
    })();

    return true;
  }

  if (isButton && customId.startsWith("backup_load_status:")) {
    const status = getGuildBackupLoadStatus(interaction.guildId);
    if (!status) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1482706673176150077> Nessun backup load in corso.",
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
            .setTitle("<:VC_update:1478721333096349817> Backup Load Status")
            .setDescription(
              [
                `<:VC_id:1478517313618575419> Backup ID: \`${status.backupId}\``,
                `<:VC_Clock:1473359204189474886> Started: <t:${startedAt}:R>`,
                `<:VC_update:1478721333096349817> Phase: \`${status.phase}\``,
                `<:VC_update:1478721333096349817> Processed items: **${status.processed}**`,
                `<:VC_update:1478721333096349817> Cancel requested: **${status.cancelRequested ? "yes" : "no"}**`,
                `<:VC_update:1478721333096349817> Messages limit: \`${formatMessagesLimit(status.messagesLimit)}\``,
                status.checkpointId ? `<:VC_id:1478517313618575419> Checkpoint: \`${status.checkpointId}\`` : null,
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
