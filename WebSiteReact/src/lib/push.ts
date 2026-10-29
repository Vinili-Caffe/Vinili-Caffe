// Notifiche push del sito: un solo service worker (/sw.js, registrato da SwRegister) e le API del bot
// /webhooks/site-notifications/push/{vapid-public-key,subscribe,unsubscribe} (siteInAppNotificationsApi.js).
// I ticket le richiedono agli utenti (non allo staff) per aprirne uno.

// UN solo indirizzo per il service worker, usato anche da SwRegister: con due versioni diverse il browser
// sostituiva il SW a ogni visita (uno lo registrava la pagina, l'altro le notifiche) e le iscrizioni push ne soffrivano.
// Da cambiare solo qui quando serve forzare l'aggiornamento di sw.js.
export const SW_URL = "/sw.js?v=20261029swUnico1";
const b64ToBytes = (b64: string) => {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function deviceClass(): "phone" | "desktop" {
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "phone" : "desktop";
}

async function postSubscribe(token: string, sub: PushSubscription) {
  const r = await fetch("/webhooks/site-notifications/push/subscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: sub.toJSON(),
      userAgent: navigator.userAgent,
      deviceClass: deviceClass(),
      standalone: window.matchMedia?.("(display-mode: standalone)")?.matches === true,
    }),
  });
  return r.ok;
}

export async function pushIsOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return !!(await reg?.pushManager.getSubscription());
}

/**
 * Ri-posta la subscription corrente sul server (endpoint zombie / SW aggiornato).
 * forceRefresh: unsubscribe+subscribe nuovo → usalo su nudge `vc:push-resubscribe`.
 */
export async function syncPushSubscription(
  token: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<{ ok: boolean; message?: string }> {
  if (!token || !pushSupported()) return { ok: false, message: "Push non supportate." };
  if (Notification.permission !== "granted") return { ok: false, message: "Permesso notifiche assente." };
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, message: "Sei offline: le push si sincronizzano al ritorno online." };
    }
  } catch {
    /* ignore */
  }
  try {
    const keyRes = await fetch("/webhooks/site-notifications/push/vapid-public-key", { cache: "no-store" }).then((r) =>
      r.json(),
    );
    if (!keyRes?.publicKey) return { ok: false, message: "Notifiche push non configurate sul server." };
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (opts.forceRefresh && sub) {
      try {
        await fetch("/webhooks/site-notifications/push/unsubscribe", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
      } catch {
        /* ignore */
      }
      try {
        await sub.unsubscribe();
      } catch {
        /* ignore */
      }
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToBytes(keyRes.publicKey),
      });
    }
    const ok = await postSubscribe(token, sub);
    if (!ok) return { ok: false, message: "Salvataggio subscription fallito." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Sync push fallita." };
  }
}

/** Va chiamata da un click (i browser chiedono il permesso solo dopo un gesto). */
export async function enablePush(token: string): Promise<{ ok: boolean; message?: string }> {
  if (!pushSupported())
    return {
      ok: false,
      message: "Questo browser non supporta le notifiche push. Su iPhone aggiungi il sito alla schermata Home.",
    };
  const perm = await Notification.requestPermission();
  if (perm !== "granted")
    return { ok: false, message: "Permesso negato: abilita le notifiche per questo sito dalle impostazioni del browser." };
  const r = await syncPushSubscription(token, { forceRefresh: true });
  if (!r.ok) return { ok: false, message: r.message || "Non sono riuscito ad attivare le notifiche. Riprova, o usa Chrome o Edge." };
  return { ok: true };
}

/** Spegne le push su questo dispositivo (e lo toglie dal server). */
export async function disablePush(token: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return { ok: true };
    await fetch("/webhooks/site-notifications/push/unsubscribe", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => null);
    await sub.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, message: "Non sono riuscito a disattivare le notifiche. Riprova." };
  }
}
