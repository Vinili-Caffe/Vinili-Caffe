/**
 * Chi ha i ruoli staff sul server principale, salvato in BotState dal processo del bot (che ha
 * tutti i membri dal gateway) e letto dagli altri processi (API del sito), dove scaricare l'elenco
 * dei membri via REST può fallire e far perdere destinatari alle notifiche dell'inbox.
 */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");

const STATE_KEY = "vinili_staff_role_members_v1";
const REFRESH_MS = 5 * 60_000;
/* oltre questo tempo l'elenco salvato non si usa più (bot fermo) */
const MAX_AGE_MS = 60 * 60_000;
const READ_CACHE_MS = 60_000;

const ROLE_KEYS = [
  "Founder",
  "Manager",
  "Admin",
  "Director",
  "HighStaff",
  "SeniorModerator",
  "Mod",
  "Helper",
  "PartnerManager",
  "CommunityManager",
];

function expandIds(roleId: string): string[] {
  try {
    const { expandRemappedRoleIds } = require("../../Config/emergencyRoleIdRemap") as typeof import("../../Config/emergencyRoleIdRemap");
    return (expandRemappedRoleIds(roleId) as string[]).map(String);
  } catch {
    return [roleId];
  }
}

function trackedRoleIds(): string[] {
  const ids = new Set<string>();
  for (const key of ROLE_KEYS) {
    const raw = String((IDs.roles as Record<string, unknown>)?.[key] || "").trim();
    if (!/^\d{16,22}$/.test(raw)) continue;
    for (const id of expandIds(raw)) if (/^\d{16,22}$/.test(id)) ids.add(id);
  }
  try {
    const { getResocontoReviewerRoleIds } = require("../../Staff/utils/resocontoAccess") as any;
    for (const raw of getResocontoReviewerRoleIds?.() || []) {
      for (const id of expandIds(String(raw))) if (/^\d{16,22}$/.test(id)) ids.add(id);
    }
  } catch (_) {}
  return [...ids];
}

async function writeSnapshot(client?) {
  const gid = String(IDs.guilds?.main || "").trim();
  const guild = gid ? client?.guilds?.cache?.get?.(gid) : null;
  if (!guild) return;
  const { collectHumanMemberIdsWithRole } = require("../../Community/utils/threadRoleMembers") as typeof import("../../Community/utils/threadRoleMembers");
  const roles: Record<string, string[]> = {};
  for (const rid of trackedRoleIds()) {
    const ids = await collectHumanMemberIdsWithRole(guild, rid, { logTag: "[staffRoleMembersSnapshot]" }).catch(() => null);
    if (Array.isArray(ids)) roles[rid] = ids.map(String);
  }
  if (!Object.keys(roles).length) return;
  await setBotState(STATE_KEY, { guildId: gid, at: Date.now(), roles }).catch(() => null);
}

let started = false;
/** Solo nel processo col gateway (bot principale). */
function startStaffRoleMembersSnapshot(client?) {
  if (started || !client) return;
  started = true;
  const run = () => void writeSnapshot(client).catch(() => null);
  const first = setTimeout(run, 60_000);
  first.unref?.();
  const timer = setInterval(run, REFRESH_MS);
  timer.unref?.();
}

let readCache: { at: number; data: any } | null = null;
/** Membri salvati per un ruolo (vuoto se non c'è un elenco recente). */
async function getSnapshotMemberIds(guildId: string, roleId: string): Promise<string[]> {
  if (!readCache || Date.now() - readCache.at > READ_CACHE_MS) {
    const data = await getBotState(STATE_KEY, null).catch(() => null);
    readCache = { at: Date.now(), data };
  }
  const d = readCache.data;
  if (!d || String(d.guildId) !== String(guildId) || Date.now() - Number(d.at || 0) > MAX_AGE_MS) return [];
  const list = d.roles?.[String(roleId)];
  return Array.isArray(list) ? list.map(String) : [];
}

export = { startStaffRoleMembersSnapshot, getSnapshotMemberIds };
