/** Dopo un deploy i chunk vecchi 404ano: serve hard reload, NON unregister del SW (uccide le push iOS). */

export const STALE_CHUNK =
  /ChunkLoadError|Failed to load chunk|Loading chunk [\w.-]+ failed|Importing a module script failed|error loading dynamically imported module/i;

const STALE_RELOAD_KEY = "vc_stale_chunk_reload_at";

/** Cache del SW da non toccare (offline + pending click notifica iOS). */
const KEEP_CACHES = new Set(["vc-offline-v3", "vc-notif-pending-v1"]);

export function isStaleChunkMessage(text: string) {
  return STALE_CHUNK.test(String(text || ""));
}

/** Una volta al minuto: evita loop se il problema non è un chunk stale. */
export function canAutoRecoverStaleChunk(cooldownMs = 60_000) {
  try {
    const last = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || 0);
    if (Date.now() - last < cooldownMs) return false;
    sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
  } catch {
    /* senza sessionStorage si tenta comunque */
  }
  return true;
}

/**
 * Bust navigazione + pulizia cache HTML/asset.
 * Mai unregister del service worker: su iOS perde la push subscription.
 */
export async function hardReload(path?: string) {
  try {
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP_CACHES.has(k)).map((k) => caches.delete(k).catch(() => false)));
    }
  } catch {
    /* ignore */
  }
  const raw = path ?? `${location.pathname}${location.search}`;
  try {
    const u = new URL(raw, location.origin);
    u.searchParams.set("_vc", String(Date.now()));
    /* segnale a PushSync: ri-iscrivi push dopo un recovery (subscription potenzialmente rotta) */
    try {
      sessionStorage.setItem("vc_push_resync", "1");
    } catch {
      /* ignore */
    }
    location.replace(`${u.pathname}${u.search}${location.hash || ""}`);
  } catch {
    location.reload();
  }
}

export function recoverFromStaleChunk(message: string) {
  if (!isStaleChunkMessage(message)) return;
  if (!canAutoRecoverStaleChunk()) return;
  void hardReload();
}
