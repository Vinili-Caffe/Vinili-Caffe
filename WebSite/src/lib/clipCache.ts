/**
 * Music Quiz: i brani della partita vengono scaricati in anticipo nella memoria del browser.
 * Quando parte la domanda il file è già qui e suona subito, senza aspettare la rete di Deezer.
 */

const MAX_KEEP = 24;
const blobs = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
const order: string[] = [];

function remember(url: string, blobUrl: string) {
  blobs.set(url, blobUrl);
  order.push(url);
  while (order.length > MAX_KEEP) {
    const old = order.shift()!;
    const b = blobs.get(old);
    if (b) URL.revokeObjectURL(b);
    blobs.delete(old);
  }
}

/** Scarica un brano (una volta sola); risponde con il file locale o null se non riesce. */
export function fetchClip(url: string): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const have = blobs.get(url);
  if (have) return Promise.resolve(have);
  const running = inflight.get(url);
  if (running) return running;
  const p = fetch(url, { mode: "cors", credentials: "omit" })
    .then((r) => (r.ok ? r.blob() : null))
    .then((b) => {
      if (!b || !b.size) return null;
      const u = URL.createObjectURL(b);
      remember(url, u);
      return u;
    })
    .catch(() => null)
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Scarica i prossimi brani due alla volta, in ordine, senza rubare banda a quello che sta suonando. */
export function preloadClips(urls: Array<string | null | undefined>) {
  const list = [...new Set(urls.filter((u): u is string => Boolean(u)))].filter((u) => !blobs.has(u) && !inflight.has(u));
  let i = 0;
  const next = (): Promise<void> => {
    const u = list[i++];
    return u ? fetchClip(u).then(next) : Promise.resolve();
  };
  void next();
  void next();
}

/** Il file locale se c'è già, altrimenti aspetta il download al massimo `waitMs` e poi usa il link di Deezer. */
export async function clipSource(url: string, waitMs = 2500): Promise<string> {
  const have = blobs.get(url);
  if (have) return have;
  const got = await Promise.race([fetchClip(url), new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
  return got || url;
}
