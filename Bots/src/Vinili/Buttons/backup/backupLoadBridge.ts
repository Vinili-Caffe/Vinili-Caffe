const { handleBackupLoadInteraction } = require("../../Services/Backup/backupLoadService") as typeof import("../../Services/Backup/backupLoadService");

function match(interaction?) {
  const id = String(interaction?.customId || "");
  const ok =
    interaction?.isButton?.() ||
    interaction?.isStringSelectMenu?.();
  if (!ok) return false;
  return (
    id.startsWith("backup_load_actions:") ||
    id.startsWith("backup_load_messages_limit:") ||
    id.startsWith("backup_load_confirm:") ||
    id.startsWith("backup_load_continue:") ||
    id.startsWith("backup_load_cancel:") ||
    id.startsWith("backup_load_status:")
  );
}

async function execute(interaction?) {
  const handled = await handleBackupLoadInteraction(interaction);
  return Boolean(handled);
}

export = { name: "backupLoadBridge", order: 5, match, execute };