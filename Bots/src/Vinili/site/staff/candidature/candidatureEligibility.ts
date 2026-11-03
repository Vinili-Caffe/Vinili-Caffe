/** Candidature: chi può candidarsi (ruoli, attese). */
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getBotState, setBotState } = require("../../../../shared/botState/botStateStore") as typeof import("../../../../shared/botState/botStateStore");

const NOMODULI_ROLE_ID = IDs.roles.blacklistModuli;
const MEMBER_ROLE_ID = IDs.roles.Member;
const HELPER_ROLE_ID = IDs.roles.Helper;
const PARTNER_MANAGER_ROLE_ID = IDs.roles.PartnerManager;
const BLOGGER_ROLE_ID = String(IDs.roles.Blogger || "1557507157899878533");
/** Tipi di candidatura: Helper e Partner Manager (anche da Discord), Blogger (dal sito). */
const APPLICATION_TYPES = ["helper", "partnermanager", "blogger"];
function normalizeApplicationType(type?) {
  const t = String(type || "").trim().toLowerCase();
  return APPLICATION_TYPES.includes(t) ? t : "helper";
}
const HELPER_REAPPLY_BLOCK_ROLE_IDS = [IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.HighStaff, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.Founder].filter(Boolean);
/** Priorità (alto → basso) per messaggio “Sei già un …” quando manca position Discord. */
const HELPER_BLOCK_ROLE_PRIORITY_IDS = [
  IDs.roles.Founder,
  IDs.roles.Manager,
  IDs.roles.Admin,
  IDs.roles.Director,
  IDs.roles.SeniorModerator,
  IDs.roles.HighStaff,
  IDs.roles.Mod,
  IDs.roles.Helper,
  IDs.roles.Staff,
].filter(Boolean);
const HELPER_BLOCK_ROLE_FALLBACK_LABEL = {
  [String(IDs.roles.Founder || "")]: "Founder",
  [String(IDs.roles.Manager || "")]: "Manager",
  [String(IDs.roles.Admin || "")]: "Admin",
  [String(IDs.roles.Director || "")]: "Director",
  [String(IDs.roles.SeniorModerator || "")]: "Senior Moderator",
  [String(IDs.roles.HighStaff || "")]: "High Staff",
  [String(IDs.roles.Mod || "")]: "Mod",
  [String(IDs.roles.Helper || "")]: "Helper",
  [String(IDs.roles.Staff || "")]: "Staff",
  [String(IDs.roles.PartnerManager || "")]: "Partner Manager",
  [BLOGGER_ROLE_ID]: "Blogger",
};
const cooldownByUserAndType = new Map();
let cooldownLoaded = false;

function cooldownTypeKey(type?) {
  return normalizeApplicationType(type);
}
function cooldownStorageKey(userId?, type?) {
  return `${String(userId || "")}:${cooldownTypeKey(type)}`;
}

async function loadCooldownMap() {
  if (cooldownLoaded) return;
  cooldownLoaded = true;
  try {
    const parsed = await getBotState("applicationCooldowns", null);
    if (!parsed || typeof parsed !== "object") return;
    const now = Date.now();
    for (const [userId, entry] of Object.entries(parsed)) {
      const uid = String(userId || "");
      if (!uid) continue;
      if (typeof entry === "number") {
        const ts = Number(entry || 0);
        if (Number.isFinite(ts) && ts > now) {
          cooldownByUserAndType.set(`${uid}:helper`, ts);
          cooldownByUserAndType.set(`${uid}:partnermanager`, ts);
        }
        continue;
      }
      if (entry && typeof entry === "object") {
        for (const t of APPLICATION_TYPES) {
          const ts = Number(entry[t] || 0);
          if (Number.isFinite(ts) && ts > now) {
            cooldownByUserAndType.set(`${uid}:${t}`, ts);
          }
        }
      }
    }
  } catch (err) {
    global.logger?.warn?.("[candidature] load cooldowns:", err?.message || err);
  }
}

async function persistCooldownMap() {
  const now = Date.now();
  const out: Record<string, any> = {};
  for (const [key, until] of cooldownByUserAndType.entries()) {
    const ts = Number(until || 0);
    if (!(ts > now)) continue;
    const idx = key.lastIndexOf(":");
    if (idx <= 0) continue;
    const uid = key.slice(0, idx);
    const typ = key.slice(idx + 1);
    if (!out[uid]) out[uid] = {};
    out[uid][typ] = ts;
  }
  await setBotState("applicationCooldowns", out);
}

function memberHasRoleId(member?, roleId?) {
  const id = String(roleId || "").trim();
  if (!id) return false;
  const cache = member?.roles?.cache;
  if (!cache || typeof cache.has !== "function") return false;
  return cache.has(id);
}

function resolveHighestBlockingRoleId(member?, roleIds?) {
  const ids = (Array.isArray(roleIds) ? roleIds : []).map((x?) => String(x || "").trim()).filter(Boolean);
  if (!ids.length || !member) return null;
  const owned = ids.filter((id?) => memberHasRoleId(member, id));
  if (!owned.length) return null;

  const guildRoles = member?.guild?.roles?.cache;
  if (guildRoles && typeof guildRoles.get === "function") {
    const ranked = owned
      .map((id?) => guildRoles.get(id))
      .filter(Boolean)
      .sort((a?, b?) => Number(b.position || 0) - Number(a.position || 0));
    if (ranked[0]?.id) return String(ranked[0].id);
  }

  const cache = member?.roles?.cache;
  if (cache && typeof cache.get === "function") {
    const ranked = owned
      .map((id?) => cache.get(id))
      .filter(Boolean)
      .sort((a?, b?) => Number(b.position || 0) - Number(a.position || 0));
    if (ranked[0]?.id) return String(ranked[0].id);
  }

  for (const id of HELPER_BLOCK_ROLE_PRIORITY_IDS) {
    if (owned.includes(String(id))) return String(id);
  }
  return owned[0] || null;
}

function labelForStaffRoleId(roleId?, member?) {
  const id = String(roleId || "").trim();
  if (!id) return "Staff";
  const fromGuild = member?.guild?.roles?.cache?.get?.(id);
  const fromMember = member?.roles?.cache?.get?.(id);
  const raw = String(fromGuild?.name || fromMember?.name || HELPER_BLOCK_ROLE_FALLBACK_LABEL[id] || "Staff").trim();
  return (
    raw
      .replace(/<a?:[\w~]+:\d+>/g, "")
      .replace(/<[@#&!]?\d+>/g, "")
      .replace(/[*_`~|]+/g, "")
      .replace(/\s+/g, " ")
      .trim() ||
    HELPER_BLOCK_ROLE_FALLBACK_LABEL[id] ||
    "Staff"
  );
}

function alreadyRoleMessage(label?) {
  const name = String(label || "").trim() || "Staff";
  return `Sei già un ${name}.`;
}

async function getCooldownUntil(userId?, type?) {
  await loadCooldownMap();
  const key = cooldownStorageKey(userId, type);
  const ts = Number(cooldownByUserAndType.get(key) || 0);
  if (!Number.isFinite(ts) || ts <= Date.now()) {
    cooldownByUserAndType.delete(key);
    await persistCooldownMap();
    return 0;
  }
  return ts;
}

function getTargetRoleIdByType(type?) {
  if (type === "partnermanager") return PARTNER_MANAGER_ROLE_ID;
  if (type === "blogger") return BLOGGER_ROLE_ID;
  if (type === "helper") return HELPER_ROLE_ID;
  return null;
}

function hasAnyRoleMember(member?, roleIds?) {
  const cache = member?.roles?.cache;
  if (!cache || typeof cache.has !== "function") return false;
  return roleIds.some((id?) => id && cache.has(id));
}

async function checkMemberCandidatureEligibility(member?, type?) {
  if (NOMODULI_ROLE_ID && hasAnyRoleMember(member, [NOMODULI_ROLE_ID])) {
    return { ok: false, code: "no_moduli", message: "Sei blacklistato dalle candidature." };
  }
  if (MEMBER_ROLE_ID && !hasAnyRoleMember(member, [MEMBER_ROLE_ID])) {
    return { ok: false, code: "no_member_role", message: "Le candidature sono disponibili solo agli utenti con ruolo Member." };
  }
  const targetRoleId = getTargetRoleIdByType(type);
  if (targetRoleId && hasAnyRoleMember(member, [targetRoleId])) {
    const label = labelForStaffRoleId(targetRoleId, member);
    return {
      ok: false,
      code: "already_role",
      roleId: String(targetRoleId),
      roleLabel: label,
      message: alreadyRoleMessage(label),
    };
  }
  if (type === "helper" && hasAnyRoleMember(member, HELPER_REAPPLY_BLOCK_ROLE_IDS)) {
    const blockingId =
      resolveHighestBlockingRoleId(member, HELPER_REAPPLY_BLOCK_ROLE_IDS) ||
      String(HELPER_ROLE_ID || IDs.roles.Staff || "").trim();
    const label = labelForStaffRoleId(blockingId, member);
    return {
      ok: false,
      code: "helper_blocked",
      roleId: blockingId || null,
      roleLabel: label,
      message: alreadyRoleMessage(label),
    };
  }
  const until = await getCooldownUntil(member.user.id, type);
  if (until) {
    return {
      ok: false,
      code: "cooldown",
      until,
      message: "Hai già inviato una candidatura di questo tipo di recente: attendi il cooldown.",
    };
  }
  return { ok: true };
}

export = { NOMODULI_ROLE_ID, HELPER_ROLE_ID, PARTNER_MANAGER_ROLE_ID, APPLICATION_TYPES, normalizeApplicationType, cooldownByUserAndType, cooldownStorageKey, loadCooldownMap, persistCooldownMap, getTargetRoleIdByType, hasAnyRoleMember, checkMemberCandidatureEligibility };
