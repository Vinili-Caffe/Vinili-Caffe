/** High-staff gate condiviso per Music Quiz webhooks. */
const { assertWebsiteStaffAccess, normalizeHeaderSecret } =
  require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { STAFF_HIGH_STAFF_ELIGIBLE_KEYS, memberHasAnyRoleKey } =
  require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");

const cache = new Map<string, { ok: boolean; at: number; user?: any }>();
const CACHE_MS = 60_000;

type MusicQuizAuth =
  | { ok: true; userId: string; displayName: string; avatarUrl: string; member: any }
  | { ok: false; status: number; error: string; message: string };

async function requireMusicQuizHighStaff(client?, req?): Promise<MusicQuizAuth> {
  const token = normalizeHeaderSecret(req?.headers?.authorization);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Accedi con Discord per continuare.",
    };
  }
  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    if (!hit.ok || !hit.user) {
      return {
        ok: false,
        status: 403,
        error: "forbidden",
        message: "Music Quiz è riservato all'high staff.",
      };
    }
    return { ok: true, ...hit.user, member: hit.user.member };
  }

  let out: any = null;
  try {
    out = await assertWebsiteStaffAccess(client, token);
  } catch {
    out = null;
  }
  const hs = Boolean(out?.ok && out.member && memberHasAnyRoleKey(out.member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS));
  if (!hs) {
    if (cache.size > 400) cache.clear();
    cache.set(token, { ok: false, at: Date.now() });
    return {
      ok: false,
      status: out?.ok === false && String(out?.error || "") === "missing_token" ? 401 : 403,
      error: "forbidden",
      message: "Music Quiz è riservato all'high staff.",
    };
  }

  const m = out.member;
  const u = out.user || m?.user || {};
  const userId = String(m?.id || u?.id || "").trim();
  const displayName = String(m?.displayName || u?.globalName || u?.username || "Staff").trim();
  let avatarUrl = "";
  try {
    avatarUrl = typeof m?.displayAvatarURL === "function" ? String(m.displayAvatarURL({ size: 128 })) : "";
  } catch {
    avatarUrl = "";
  }
  const user = { userId, displayName, avatarUrl, member: m };
  if (cache.size > 400) cache.clear();
  cache.set(token, { ok: true, at: Date.now(), user });
  return { ok: true, ...user };
}

function sendAuthError(res?, auth?: MusicQuizAuth) {
  if (!auth || auth.ok) return false;
  /* senza strictNullChecks TypeScript non restringe l'unione su `ok`: il caso è per forza quello d'errore */
  const err = auth as { status: number; error: string; message: string };
  res.status(err.status).json({ ok: false, error: err.error, message: err.message });
  return true;
}

export = { requireMusicQuizHighStaff, sendAuthError, normalizeHeaderSecret };
