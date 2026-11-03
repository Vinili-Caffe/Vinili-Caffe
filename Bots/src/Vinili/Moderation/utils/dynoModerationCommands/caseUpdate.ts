const { resolveCaseByContextMessageId, appendCaseEditStore, setCaseReasonStore, setCaseDurationStore } = require("../modCaseStore") as typeof import("../modCaseStore");
const { appendCaseEdit } = require("../moderation") as typeof import("../moderation");
const { sendStaffActionToModLogs } = require("../modAuditLogUtils") as typeof import("../modAuditLogUtils");
const {
  reasonFrom,
  resolveCaseDurationChange,
  successReply,
  parseMaybeDuration,
  parseDynoMuteDuration,
  parseLockDuration,
} = require("./helpers") as typeof import("./helpers");

function parseModerationCaseUpdatePayload(commandName?, args?) {
  const cmd = String(commandName || "").toLowerCase();
  if (cmd === "ban") {
    const mode = String(args[0] || "").toLowerCase();
    const hasMode = mode === "save" || mode === "noappeal";
    const targetIndex = hasMode ? 1 : 0;
    const duration = parseMaybeDuration(args[targetIndex + 1]);
    const reason = reasonFrom(args, duration ? targetIndex + 2 : targetIndex + 1, "");
    return { action: "BAN", reason, durationMs: duration || null };
  }
  if (cmd === "kick") {
    return { action: "KICK", reason: reasonFrom(args, 1, ""), durationMs: null };
  }
  if (cmd === "mute") {
    return { action: "MUTE", reason: reasonFrom(args, 2, ""), durationMs: parseDynoMuteDuration(args[1]) || null };
  }
  if (cmd === "unmute") {
    return { action: "UNMUTE", reason: reasonFrom(args, 1), durationMs: null };
  }
  if (cmd === "unban") {
    return { action: "UNBAN", reason: reasonFrom(args, 1), durationMs: null };
  }
  if (cmd === "warn") {
    const reason = String(args.slice(1).join(" ") || "").trim().slice(0, 512);
    return { action: "WARN", reason, durationMs: null };
  }
  if (cmd === "lock" || cmd === "unlock") {
    const hasChannelMention = /^\s*<#\d{17,20}>\s*$/.test(String(args[0] || ""));
    const start = hasChannelMention || /^\d{17,20}$/.test(String(args[0] || "").replace(/[<#>]/g, "")) ? 1 : 0;
    const duration = cmd === "lock" ? parseLockDuration(args[start]) : null;
    const reasonStart = cmd === "lock" && duration ? start + 1 : start;
    const reason = reasonFrom(args, reasonStart, cmd === "lock" ? "Canale bloccato." : "Canale sbloccato.");
    return { action: cmd.toUpperCase(), reason, durationMs: duration || null };
  }
  return null;
}

async function updateCaseFromEditedModerationCommand(commandName?, message?, args?) {
  const resolved = await resolveCaseByContextMessageId(message.guild.id, message.id);
  if (!resolved?.row) return false;
  const row = resolved.row;
  const payload = parseModerationCaseUpdatePayload(commandName, Array.isArray(args) ? args : []);
  if (!payload) return false;

  const refGuildId = String(resolved.guildId || message.guild.id);
  const refUserId = String(resolved.userId || row.userId || "");
  const caseId = Number(row.caseId);
  const editedBy = message.author?.id || null;
  const nextReason = String(payload.reason || "").trim() || "Nessun motivo fornito";
  const prevReason = row.reason;

  if (String(prevReason || "") !== nextReason) {
    await appendCaseEditStore(refGuildId, refUserId, caseId, "reason", prevReason, nextReason, editedBy);
    await setCaseReasonStore(refGuildId, refUserId, caseId, nextReason);
    appendCaseEdit(row, "reason", prevReason, nextReason, editedBy);
    row.reason = nextReason;
  }

  const action = String(row.action || payload.action || "").toUpperCase();
  if (["BAN", "MUTE", "LOCK"].includes(action)) {
    const prevDuration = row.durationMs == null ? null : Number(row.durationMs);
    const nextDuration = payload.durationMs == null ? null : Number(payload.durationMs);
    if ((prevDuration || null) !== (nextDuration || null)) {
      const changed = nextDuration
        ? resolveCaseDurationChange(row, nextDuration)
        : { durationMs: null, expiresAt: null, remainingMs: 0 };
      await appendCaseEditStore(refGuildId, refUserId, caseId, "durationMs", prevDuration == null ? "" : prevDuration, changed.durationMs == null ? "" : changed.durationMs, editedBy);
      await setCaseDurationStore(refGuildId, refUserId, caseId, changed.durationMs, changed.expiresAt);
      appendCaseEdit(row, "durationMs", prevDuration == null ? "" : prevDuration, changed.durationMs == null ? "" : changed.durationMs, editedBy);
      row.durationMs = changed.durationMs;
      row.expiresAt = changed.expiresAt;
      if (action === "MUTE") {
        const member = await message.guild.members.fetch(String(row.userId || "")).catch(() => null);
        if (member) {
          if (changed.remainingMs > 0) {
            await member.timeout(changed.remainingMs, `Caso #${caseId} aggiornato`).catch(() => null);
          } else {
            await member.timeout(null, `Caso #${caseId}: durata scaduta dopo aggiornamento`).catch(() => null);
          }
        }
      }
    }
  }

  await sendStaffActionToModLogs(message.guild, row, {
    actionLabel: "Case Updated From Edited Command",
    moderatorId: editedBy,
    reasonOverride: row.reason,
    extraFields: [{ name: "Comando", value: `+${String(commandName || "").toLowerCase()}`, inline: true }],
  }).catch(() => null);
  await successReply(message, `case #${caseId}`, "was updated from the edited command");
  return true;
}

export = { parseModerationCaseUpdatePayload, updateCaseFromEditedModerationCommand };
