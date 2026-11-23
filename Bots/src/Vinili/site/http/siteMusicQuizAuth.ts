/** Accesso al Music Quiz: basta essere nel server Discord (prima era solo per l'high staff). */
const { normalizeHeaderSecret } =
  require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { resolveWebsiteGuildMember } =
  require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");

const cache = new Map<string, { ok: boolean; at: number; user?: any }>();
const CACHE_MS = 60_000;
const NOT_MEMBER = "Per giocare al Music Quiz devi essere nel server Discord di Vinili & Caffè.";

type MusicQuizAuth =
  | { ok: true; userId: string; displayName: string; avatarUrl: string; member: any }
  | { ok: false; status: number; error: string; message: string };

/* il nome resta quello vecchio per non toccare tutte le rotte: ora fa entrare ogni membro del server */
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
      return { ok: false, status: 403, error: "forbidden", message: NOT_MEMBER };
    }
    return { ok: true, ...hit.user, member: hit.user.member };
  }

  let out: any = null;
  try {
    out = await resolveWebsiteGuildMember(client, token);
  } catch {
    out = null;
  }
  if (!out?.ok || !out.member) {
    const status = Number(out?.status) || 503;
    const notInGuild = String(out?.error || "") === "not_in_guild";
    /* in memoria solo chi non è nel server: un intoppo di Discord non deve chiudere fuori per un minuto */
    if (notInGuild) {
      if (cache.size > 400) cache.clear();
      cache.set(token, { ok: false, at: Date.now() });
    }
    return {
      ok: false,
      status: notInGuild ? 403 : status,
      error: notInGuild ? "forbidden" : String(out?.error || "unavailable"),
      message: notInGuild ? NOT_MEMBER : String(out?.message || "Discord non risponde: riprova tra pochi secondi."),
    };
  }

  const m = out.member;
  const u = out.discordUser || m?.user || {};
  const userId = String(out.userId || m?.id || u?.id || "").trim();
  const displayName = String(m?.displayName || m?.nick || u?.global_name || u?.globalName || u?.username || "Ospite").trim();
  let avatarUrl = "";
  try {
    avatarUrl = typeof m?.displayAvatarURL === "function" ? String(m.displayAvatarURL({ size: 128 })) : "";
  } catch {
    avatarUrl = "";
  }
  if (!avatarUrl && u?.avatar && userId) avatarUrl = `https://cdn.discordapp.com/avatars/${userId}/${u.avatar}.png?size=128`;
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
