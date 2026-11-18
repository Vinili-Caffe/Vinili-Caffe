/**
 * Avvio condiviso del load backup (Discord + dashboard HTTP).
 * Ritorna subito; il lavoro pesante gira in background via `run`.
 */
const { createGuildBackup } = require("./serverBackupService") as typeof import("./serverBackupService");
const {
  startActiveLoadIfIdle,
  finishActiveLoad,
  updateActiveLoad,
} = require("./backupLoadActive") as typeof import("./backupLoadActive");
const { applyBackupToGuild } = require("./backupLoadApply") as typeof import("./backupLoadApply");

type ConfirmArgs = {
  guild: any;
  userId?: string;
  backupId?: string;
  actions?: string[] | Set<string>;
  messagesLimit?: number | null;
  sourceGuildId?: string | null;
  /** Dopo il checkpoint (prima di apply). */
  onCheckpoint?: (checkpointId: string | null) => void | Promise<void>;
};

async function confirmBackupLoad(args: ConfirmArgs) {
  const guild = args?.guild;
  const guildId = String(guild?.id || "");
  if (!guild || !guildId) {
    return { ok: false as const, busy: false, error: "missing_guild" };
  }

  const backupId = String(args.backupId || "").trim().toUpperCase();
  const actions = Array.isArray(args.actions)
    ? [...args.actions]
    : args.actions instanceof Set
      ? [...args.actions]
      : [];

  const activeLoad = startActiveLoadIfIdle({
    guildId,
    userId: args.userId,
    backupId,
    actions,
    messagesLimit: args.messagesLimit,
  });
  if (!activeLoad) {
    return { ok: false as const, busy: true as const };
  }

  const run = (async () => {
    let checkpointId: string | null = null;
    try {
      try {
        const checkpoint = await createGuildBackup(guild, { source: "automatic" });
        checkpointId = String(checkpoint?.backupId || "").toUpperCase() || null;
        updateActiveLoad(guildId, { checkpointId });
        if (typeof args.onCheckpoint === "function") {
          await args.onCheckpoint(checkpointId);
        }
      } catch (checkpointError) {
        global.logger?.warn?.("[backup.load] checkpoint failed:", checkpointError);
        if (typeof args.onCheckpoint === "function") {
          await args.onCheckpoint(null);
        }
      }

      const stats = await applyBackupToGuild(
        guild,
        backupId,
        actions,
        args.sourceGuildId || null,
        args.messagesLimit,
      );
      return { ok: true as const, stats, checkpointId, cancelled: false as const };
    } catch (error: any) {
      global.logger?.error?.("[backup.load] failed:", error);
      return {
        ok: false as const,
        cancelled: error?.code === "BACKUP_LOAD_CANCELLED",
        error,
        checkpointId,
      };
    } finally {
      finishActiveLoad(guildId);
    }
  })();

  return { ok: true as const, started: true as const, run };
}

export = { confirmBackupLoad };
