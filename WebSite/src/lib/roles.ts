import { SITE_ORIGIN } from "./site";

// Ruoli personalizzati (creati dagli utenti con Personalizza):
// GET /webhooks/site-roles, GET /webhooks/site-roles/request-state (Bearer),
// POST /webhooks/site-roles/request {roleId, reason 10–500}, POST /webhooks/site-roles/leave {roleId}

export type RoleMember = { userId: string; displayName: string; avatarUrl?: string; isOwner?: boolean; staffBadges?: { label: string }[] };
export type CustomRole = {
  roleId: string;
  roleName: string;
  roleColor: string;
  roleEmoji?: string;
  roleIconUrl?: string;
  createdAt: string;
  expiresAt: string | null;
  isPermanent: boolean;
  memberCount: number;
  members: RoleMember[];
  ownerId: string;
  ownerDisplayName: string;
  ownerAvatarUrl?: string;
};
export type RolesData = { rows: CustomRole[]; summary: { totalRoles: number; permanentRoles: number; temporaryRoles: number; totalAssignments: number } };
export type RequestState = { status: "pending" | "cooldown"; cooldownUntil?: string };

export async function loadRoles(origin = ""): Promise<RolesData | null> {
  try {
    const r = await fetch(`${origin}/webhooks/site-roles`, { cache: "no-store" });
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.rows)) return null;
    return { rows: j.rows, summary: j.summary };
  } catch {
    return null;
  }
}
export const loadBuildRoles = () => loadRoles(SITE_ORIGIN);

const auth = (t: string) => ({ Authorization: `Bearer ${t}`, "Content-Type": "application/json" });

export async function loadRequestStates(token: string): Promise<Record<string, RequestState>> {
  try {
    const r = await fetch("/webhooks/site-roles/request-state", { headers: auth(token), cache: "no-store" });
    const j = await r.json();
    return j?.ok ? j.byRoleId ?? {} : {};
  } catch {
    return {};
  }
}

async function post(url: string, token: string, body: object): Promise<{ ok: boolean; message: string }> {
  try {
    const r = await fetch(url, { method: "POST", headers: auth(token), body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && j?.ok !== false, message: j?.message || (r.ok ? "Fatto!" : `Errore ${r.status}`) };
  } catch {
    return { ok: false, message: "Connessione non riuscita, riprova." };
  }
}

export const requestRole = (token: string, roleId: string, reason: string) => post("/webhooks/site-roles/request", token, { roleId, reason });
export const leaveRole = (token: string, roleId: string) => post("/webhooks/site-roles/leave", token, { roleId });

export const REASON_MIN = 10;
export const REASON_MAX = 500;

/** Nome senza il prefisso "༄ " dei ruoli del server. */
export const cleanRoleName = (n: string) => n.replace(/^༄\s*/, "").trim() || n;
