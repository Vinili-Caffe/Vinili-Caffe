/** Boost: gli embed escono insieme ai messaggi di Discord ("ha appena potenziato il server").
 *  Chi compra 2 boost insieme li ha subito contati tutti e due, ma Discord scrive il secondo messaggio
 *  anche un minuto dopo: il secondo embed aspetta quel messaggio (al massimo FALLBACK_MS, poi esce lo stesso). */

const WINDOW_MS = 4 * 60 * 1000;
const FALLBACK_MS = 3 * 60 * 1000;
/* piccolo ritardo: l'embed arriva subito sotto il messaggio di Discord, non prima */
const AFTER_NATIVE_MS = 1500;

const nativeMessages = new Map<string, { at: number; slots: number }[]>();
const embedsSent = new Map<string, number[]>();
/* run(true) = attesa massima finita, manda senza controllare; run(false) = è arrivato un messaggio, ricontrolla */
const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; run: (timedOut: boolean) => void }>();

function recent<T extends { at: number } | number>(list: T[] | undefined, now: number) {
  return (list || []).filter((x) => now - (typeof x === "number" ? x : x.at) <= WINDOW_MS);
}

/** Un messaggio di boost di Discord (non quello del livello del server). */
function noteNativeBoostMessage(key: string, slots = 1) {
  const now = Date.now();
  const list = recent(nativeMessages.get(key), now);
  list.push({ at: now, slots: Math.max(1, Math.min(2, Number(slots) || 1)) });
  nativeMessages.set(key, list);
  const wait = pending.get(key);
  if (wait) {
    clearTimeout(wait.timer);
    pending.delete(key);
    setTimeout(() => wait.run(false), AFTER_NATIVE_MS).unref?.();
  }
}

function noteBoostEmbedsSentAligned(key: string, count: number) {
  const now = Date.now();
  const list = recent(embedsSent.get(key), now);
  for (let i = 0; i < count; i += 1) list.push(now);
  embedsSent.set(key, list);
}

/** Quanti embed si possono mandare adesso: il primo sempre, gli altri solo dopo il loro messaggio di Discord. */
function boostEmbedsAllowedNow(key: string, wanted: number) {
  const now = Date.now();
  const natives = recent(nativeMessages.get(key), now).reduce((s, x) => s + x.slots, 0);
  const sent = recent(embedsSent.get(key), now).length;
  const allowed = sent === 0 ? Math.max(1, natives) : Math.max(0, natives - sent);
  return Math.max(0, Math.min(wanted, allowed));
}

/** Rimanda il resto: parte al prossimo messaggio di Discord o dopo FALLBACK_MS. */
function deferBoostEmbeds(key: string, run: (timedOut: boolean) => void) {
  if (pending.has(key)) return;
  const timer = setTimeout(() => {
    pending.delete(key);
    run(true);
  }, FALLBACK_MS);
  timer.unref?.();
  pending.set(key, { timer, run });
}

export = { noteNativeBoostMessage, noteBoostEmbedsSentAligned, boostEmbedsAllowedNow, deferBoostEmbeds };
