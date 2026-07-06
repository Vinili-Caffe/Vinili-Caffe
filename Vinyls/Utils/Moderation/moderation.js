const IDs = require("../Config/ids");
const { GlobalSettings } = require("../../Schemas/Community/communitySchemas");
const { normalizeModConfigFromGlobal } = require("../Global/globalSettingsGuildStores");
const { sendStaffActionToModLogs } = require("../Logging/modAuditLogUtils");
const { createModCaseStore, closeCaseByRef } = require("./modCaseStore");

async function getModConfig(guildId) {
  const g = String(guildId || "");
  const doc = await GlobalSettings.findOneAndUpdate(
    { guildId: g },
    { $setOnInsert: { guildId: g } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return normalizeModConfigFromGlobal(doc);
}

const MODERATION_HIERARCHY_IGNORED_ROLE_IDS = new Set(
  [IDs?.roles?.Muted, IDs?.roles?.blackilistPartner, IDs?.roles?.blacklistTicket, IDs?.roles?.blacklistModuli]
    .map((id) => String(id || "").trim())
    .filter(Boolean),
);

function getHighestModerationRelevantRolePosition(member) {
  if (!member?.roles?.cache) return -1;
  let highest = -1;
  for (const role of member.roles.cache.values()) {
    if (role.id === member.guild?.id) continue;
    if (MODERATION_HIERARCHY_IGNORED_ROLE_IDS.has(role.id)) continue;
    if (role.position > highest) highest = role.position;
  }
  return highest;
}

function isExempt(member, config, channelId) {
  if (!member) return true;
  if (Array.isArray(config?.exemptRoles) && config.exemptRoles.length > 0) {
    if (member.roles.cache.some((r) => config.exemptRoles.includes(r.id)))
      return true;
  }
  if (
    Array.isArray(config?.exemptChannels) &&
    config.exemptChannels.length > 0
  ) {
    if (channelId && config.exemptChannels.includes(channelId)) return true;
  }
  return false;
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "N/A";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (!parts.length) parts.push(`${s}s`);
  return parts.join(" ");
}

function parseDuration(input) {
  if (!input) return null;
  const raw = String(input).trim().toLowerCase();
  const match = raw.match(/^(\d+)(s|m|h|d)$/);
  if (!match) return null;
  const val = Number(match[1]);
  const unit = match[2];
  if (!Number.isFinite(val) || val <= 0) return null;
  const mult = unit === "s" ? 1000 : unit === "m" ? 60000 : unit === "h" ? 3600000 : 86400000;
  return val * mult;
}

async function createModCase(opts) {
  return createModCaseStore(opts);
}

function normalizeEditValue(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function appendCaseEdit(modCase, field, previous, next, editedBy) {
  if (!modCase || !field) return;
  if (!Array.isArray(modCase.edits)) modCase.edits = [];
  modCase.edits.push({
    field: String(field),
    previous: normalizeEditValue(previous),
    next: normalizeEditValue(next),
    editedBy: editedBy ? String(editedBy) : null,
    editedAt: new Date(),
  });
}

function closeCase(modCase, closeReason = null) {
  if (!modCase) return;
  modCase.active = false;
  modCase.closedAt = new Date();
  modCase.closeReason = closeReason ? String(closeReason).slice(0, 300) : null;
}

async function closeCasePersist(modCase, closeReason = null) {
  if (!modCase) return;
  closeCase(modCase, closeReason);
  await closeCaseByRef(String(modCase.guildId), String(modCase.userId), Number(modCase.caseId), closeReason).catch(() => null);
}

async function logModCase({ guild, modCase }) {
  await sendStaffActionToModLogs(guild, modCase).catch(() => null);
}

async function tryDmUser(user, content) {
  if (!user) return false;
  try {
    if (typeof content === "string") {
      await user.send({ content });
    } else {
      await user.send(content);
    }
    return true;
  } catch {
    return false;
  }
}

module.exports = { getModConfig, isExempt, getHighestModerationRelevantRolePosition, createModCase, appendCaseEdit, closeCase, closeCasePersist, logModCase, formatDuration, parseDuration, tryDmUser };