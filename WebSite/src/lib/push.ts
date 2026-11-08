// Notifiche push del sito: un solo service worker (/sw.js, registrato da SwRegister) e le API del bot
// /webhooks/site-notifications/push/{vapid-public-key,subscribe,unsubscribe,test} (siteInAppNotificationsApi.ts).
// L'iscrizione si ripara da sola: a ogni apertura (PushSync) si controlla che esista, che usi la chiave
// del server e la si ri-registra sul server (che così sa che il dispositivo è vivo).
// I ticket le richiedono agli utenti (non allo staff) per aprirne uno.

// UN solo indirizzo per il service worker, usato anche da SwRegister: con due versioni diverse il browser
// sostituiva il SW a ogni visita (uno lo registrava la pagina, l'altro le notifiche) e le iscrizioni push ne soffrivano.
// Da cambiare solo qui quando serve forzare l'aggiornamento di sw.js.
export const SW_URL = "/sw.js?v=20261108pushClickNavIos5";
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

const sameBytes = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

let vapidKeyCache: Uint8Array<ArrayBuffer> | null = null;
async function serverKey(): Promise<Uint8Array<ArrayBuffer> | null> {
  if (vapidKeyCache) return vapidKeyCache;
  const r = await fetch("/webhooks/site-notifications/push/vapid-public-key", { cache: "no-store" })
    .then((x) => x.json())
    .catch(() => null);
  if (!r?.publicKey) return null;
  vapidKeyCache = b64ToBytes(String(r.publicKey));
  return vapidKeyCache;
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
  }).catch(() => null);
  return Boolean(r?.ok);
}

async function postUnsubscribe(token: string, endpoint: string) {
  await fetch("/webhooks/site-notifications/push/unsubscribe", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  }).catch(() => null);
}

async function registration() {
  const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
  await navigator.serviceWorker.ready;
  return reg;
}

export async function pushIsOn(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return !!(await reg?.pushManager.getSubscription());
}

/**
 * Controlla l'iscrizione di questo dispositivo e la registra sul server. Ne crea una nuova solo se manca
 * (revocata dal browser) o usa un'altra chiave del server: rifarla a ogni giro cambierebbe indirizzo per niente.
 */
export async function syncPushSubscription(token: string): Promise<{ ok: boolean; message?: string }> {
  if (!token || !pushSupported()) return { ok: false, message: "Push non supportate." };
  if (Notification.permission !== "granted") return { ok: false, message: "Permesso notifiche assente." };
  if (navigator.onLine === false) return { ok: false, message: "Sei offline: le push si sincronizzano al ritorno online." };
  try {
    const key = await serverKey();
    if (!key) return { ok: false, message: "Notifiche push non configurate sul server." };
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameBytes(sub.options?.applicationServerKey, key)) {
      await postUnsubscribe(token, sub.endpoint);
      await sub.unsubscribe().catch(() => false);
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    if (!(await postSubscribe(token, sub))) return { ok: false, message: "Salvataggio dell'iscrizione non riuscito." };
    return { ok: true };
  } catch {
    return { ok: false, message: "Sincronizzazione delle notifiche non riuscita." };
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
  const r = await syncPushSubscription(token);
  if (!r.ok) return { ok: false, message: r.message || "Non sono riuscito ad attivare le notifiche. Riprova, o usa Chrome o Edge." };
  return { ok: true };
}

/** Spegne le push su questo dispositivo (e lo toglie dal server). */
export async function disablePush(token: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return { ok: true };
    await postUnsubscribe(token, sub.endpoint);
    await sub.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, message: "Non sono riuscito a disattivare le notifiche. Riprova." };
  }
}

/** Notifica di prova a questo dispositivo: dimostra che tutta la catena (server → servizio push → telefono) funziona. */
export async function testPush(token: string): Promise<{ ok: boolean; message: string }> {
  const synced = await syncPushSubscription(token);
  if (!synced.ok) return { ok: false, message: synced.message || "Notifiche non attive su questo dispositivo." };
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return { ok: false, message: "Notifiche non attive su questo dispositivo." };
  const r = await fetch("/webhooks/site-notifications/push/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  })
    .then(async (x) => ({ status: x.status, data: (await x.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string } }))
    .catch(() => null);
  if (!r) return { ok: false, message: "Server non raggiungibile. Riprova tra poco." };
  if (r.data?.ok) return { ok: true, message: "Inviata! Se non la vedi entro qualche secondo, controlla le notifiche del sito nelle impostazioni del dispositivo (e la modalità Full immersion)." };
  if (r.status === 429) return { ok: false, message: r.data?.message || "Aspetta qualche secondo e riprova." };
  if (r.data?.error === "endpoint_gone") return { ok: false, message: "Il servizio push ha rifiutato questo dispositivo: disattiva e riattiva le notifiche." };
  return { ok: false, message: "Invio non riuscito. Riprova tra poco." };
}
