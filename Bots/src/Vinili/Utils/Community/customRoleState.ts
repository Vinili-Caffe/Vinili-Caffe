const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { runExpiredCustomRolesSweep } = require("../../Services/Community/customRoleExpiryService") as typeof import("../../Services/Community/customRoleExpiryService");

function remapRoleId(roleId?) {
  try {
    const { remapRoleIdForward } = require("../Config/emergencyRoleIdRemap") as typeof import("../Config/emergencyRoleIdRemap");
    return remapRoleIdForward(roleId) || String(roleId || "").trim();
  } catch {
    return String(roleId || "").trim();
  }
}

function isExpired(doc?) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) return false;
  return expiresAt.getTime() <= Date.now();
}

function isUnknownRoleError(err?) {
  const code = err?.code ?? err?.rawError?.code;
  return Number(code) === 10011;
}

async function fetchRoleStrict(guild?, roleId?) {
  const id = String(roleId || "").trim();
  if (!guild || !id) return { role: null, gone: false };
  const cached = guild.roles?.cache?.get(id) || null;
  if (cached) return { role: cached, gone: false };
  try {
    const role = await guild.roles.fetch(id);
    return { role: role || null, gone: false };
  } catch (err) {
    if (isUnknownRoleError(err)) return { role: null, gone: true };
    return { role: null, gone: false };
  }
}

async function resolveCustomRoleState({ guild, userId, client = null, cleanupExpired = true }) {
  if (!guild || !userId) {
    return { status: "invalid", doc: null, role: null };
  }

  const doc = await CustomRole.findOne({ guildId: guild.id, userId: String(userId) }).lean().catch(() => null);
  if (!doc?.roleId && !doc?.secondaryRoleId) {
    return { status: "none", doc: null, role: null };
  }

  if (isExpired(doc)) {
    if (cleanupExpired && client) {
      runExpiredCustomRolesSweep(client).catch(() => {});
    }
    return { status: "expired", doc, role: null };
  }

  let role = null;
  let secondaryRole = null;
  let primaryGone = false;
  let secondaryGone = false;

  if (doc?.roleId) {
    const primary = await fetchRoleStrict(guild, remapRoleId(doc.roleId));
    role = primary.role;
    primaryGone = primary.gone;
  }
  if (doc?.secondaryRoleId) {
    const secondary = await fetchRoleStrict(guild, remapRoleId(doc.secondaryRoleId));
    secondaryRole = secondary.role;
    secondaryGone = secondary.gone;
  }

    if (doc?.roleId && !role && primaryGone && doc?.secondaryRoleId && secondaryRole) {
    await CustomRole.updateOne(
      { guildId: guild.id, userId: String(userId) },
      { $set: { roleId: secondaryRole.id, secondaryRoleId: null } },
    ).catch(() => {});
    role = secondaryRole;
    secondaryRole = null;
    primaryGone = false;
    secondaryGone = false;
  }

    const softClear: Record<string, any> = {};
  if (doc?.roleId && !role && primaryGone) softClear.roleId = null;
  if (doc?.secondaryRoleId && !secondaryRole && secondaryGone) softClear.secondaryRoleId = null;
  if (Object.keys(softClear).length) {
    await CustomRole.updateOne({ guildId: guild.id, userId: String(userId) }, { $set: softClear }).catch(() => {});
  }

  if (!role && !secondaryRole) {
        return {
      status: primaryGone && secondaryGone ? "missing_role" : "unavailable",
      doc,
      role: null,
      secondaryRole: null,
    };
  }

  return { status: "active", doc, role: role || null, secondaryRole: secondaryRole || null };
}

function buildExpiryText(doc?) {
  if (!doc?.expiresAt) return "Permanente";
  const ts = Math.floor(new Date(doc.expiresAt).getTime() / 1000);
  if (!Number.isFinite(ts) || ts <= 0) return "Permanente";
  return `<t:${ts}:F> (<t:${ts}:R>)`;
}

export = { resolveCustomRoleState, buildExpiryText, fetchRoleStrict };
