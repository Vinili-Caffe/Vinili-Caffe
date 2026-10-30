// Area staff: gate GET /webhooks/site-staff-access (+ flag permessi per nav e pagine).
// Handler: Vinili/Utils/Web/siteStaffAccessApi.js

export type StaffIdentity = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
};

export type StaffAccess = {
  ok: true;
  canManage: boolean;
  isHighStaff: boolean;
  isPm: boolean;
  isPmGestore: boolean;
  canManagePm: boolean;
  canCompiti: boolean;
  canConfessionale: boolean;
  canViewResoconti: boolean;
  canViewPmPointsRemoved: boolean;
  canReviewPmPointsRemoved: boolean;
  candidatureReview: boolean;
  appelliReview: boolean;
  director: boolean;
  isFounder?: boolean;
  viewAsAllowed?: boolean;
  identity: StaffIdentity;
  permissions?: Record<string, boolean>;
};

export type StaffNavItem = {
  href: string;
  label: string;
  hint: string;
  /** Se impostato, il link compare solo con quel flag true su StaffAccess. */
  need?: keyof StaffAccess;
  /** Compare se almeno uno dei flag è true. */
  needAny?: (keyof StaffAccess)[];
};

/** Nav area staff (senza duplicati: profilo / notifiche / confessionale restano sulle loro pagine). */
export const STAFF_NAV: StaffNavItem[] = [
  { href: "/staff/guida/", label: "Guida", hint: "Manualistica staff" },
  { href: "/staff/gestione/", label: "Gestione", hint: "Pex / depex staff", needAny: ["canManage", "canManagePm"] },
  { href: "/staff/compiti/", label: "Compiti", hint: "Compiti settimanali", need: "canCompiti" },
  { href: "/staff/pause/", label: "Pause", hint: "Calendario pause" },
];

export function canAccessGestione(access: StaffAccess): boolean {
  return Boolean(access.canManage || access.canManagePm);
}

export function canAccessPmShop(access: StaffAccess): boolean {
  return Boolean(access.isPm || access.isHighStaff);
}

export function canAccessPuntiTolti(access: StaffAccess): boolean {
  return Boolean(access.canViewPmPointsRemoved || access.isPm || access.isHighStaff);
}

export function canAccessInbox(access: StaffAccess): boolean {
  return Boolean(
    access.candidatureReview || access.appelliReview || access.isHighStaff || access.canViewResoconti,
  );
}

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number; error?: string };

export async function loadStaffAccess(token: string): Promise<Res<StaffAccess>> {
  try {
    const r = await fetch("/webhooks/site-staff-access", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await r.json().catch(() => null)) as Partial<StaffAccess> & {
      ok?: boolean;
      message?: string;
      error?: string;
      staff?: boolean;
      highStaff?: boolean;
    } | null;
    if (!r.ok || !data?.ok) {
      return {
        ok: false,
        status: r.status,
        error: String(data?.error || ""),
        message:
          String(data?.message || "").trim() ||
          (r.status === 401
            ? "Accedi con Discord per continuare."
            : r.status === 403
              ? "Questa area è riservata allo staff del server Vinili & Caffè."
              : "Accesso staff non disponibile."),
      };
    }
    const perms = (data.permissions || {}) as Record<string, boolean>;
    const isHighStaff = Boolean(data.isHighStaff ?? data.highStaff ?? perms.highStaff);
    const canManage = Boolean(data.canManage ?? perms.canManage ?? isHighStaff);
    const canCompiti = Boolean(
      Object.prototype.hasOwnProperty.call(data, "canCompiti")
        ? data.canCompiti
        : Object.prototype.hasOwnProperty.call(perms, "canCompiti")
          ? perms.canCompiti
          : false,
    );
    const identity = data.identity || {
      userId: "",
      displayName: "Staff",
      username: "",
      avatarUrl: "",
    };
    return {
      ok: true,
      data: {
        ok: true,
        canManage,
        isHighStaff,
        isPm: Boolean(data.isPm ?? perms.isPm),
        isPmGestore: Boolean(data.isPmGestore ?? perms.isPmGestore),
        canManagePm: Boolean(data.canManagePm ?? perms.canManagePm),
        canCompiti,
        canConfessionale: Boolean(data.canConfessionale ?? perms.canConfessionale),
        canViewResoconti: Boolean(data.canViewResoconti ?? perms.canViewResoconti),
        canViewPmPointsRemoved: Boolean(data.canViewPmPointsRemoved ?? perms.canViewPmPointsRemoved),
        canReviewPmPointsRemoved: Boolean(data.canReviewPmPointsRemoved ?? perms.canReviewPmPointsRemoved),
        candidatureReview: Boolean(data.candidatureReview ?? perms.candidatureReview),
        appelliReview: Boolean(data.appelliReview ?? perms.appelliReview),
        director: Boolean(data.director ?? perms.director),
        isFounder: Boolean(data.isFounder),
        viewAsAllowed: Boolean(data.viewAsAllowed),
        identity: {
          userId: String(identity.userId || ""),
          displayName: String(identity.displayName || "Staff").trim() || "Staff",
          username: String(identity.username || ""),
          avatarUrl: String(identity.avatarUrl || ""),
        },
        permissions: perms,
      },
    };
  } catch {
    return { ok: false, message: "Rete non disponibile. Riprova." };
  }
}

export function staffNavFor(access: StaffAccess): StaffNavItem[] {
  return STAFF_NAV.filter((item) => {
    if (item.needAny?.length) return item.needAny.some((k) => Boolean(access[k]));
    if (!item.need) return true;
    return Boolean(access[item.need]);
  });
}

export type ApiRes<T> = Res<T>;

export async function staffFetch<T>(
  path: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method: init.method || "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(init.body != null ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body != null ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await r.json().catch(() => null)) as (T & { ok?: boolean; message?: string; error?: string }) | null;
    if (!r.ok || data?.ok === false) {
      return {
        ok: false,
        status: r.status,
        error: String(data?.error || ""),
        message: String(data?.message || "").trim() || `Errore ${r.status}`,
      };
    }
    return { ok: true, data: data as T };
  } catch {
    return { ok: false, message: "Rete non disponibile. Riprova." };
  }
}
