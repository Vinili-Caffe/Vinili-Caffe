"use client";

/**
 * Traduzione al volo dei testi italiani che non sono nei dizionari (soprattutto quelli scritti dagli utenti:
 * recensioni, feedback, confessionale…). Li traduce site-api (/webhooks/site-translate) e qui restano
 * salvati nel browser, così la stessa frase non si chiede due volte.
 */
const ENDPOINT = "/webhooks/site-translate";
const STORE = (lang: string) => `vc_live_tr_v1:${lang}`;
const STORE_MAX = 3000;

const IT_WORDS = new Set(
  "il lo la gli le un una uno di del della dei degli delle da dal dalla nel nella nei sul sulla per con che non è sono ho hai ha abbiamo molto molta tutti tutto questo questa quello ogni anche più ma se come cosa chi perché sempre mai ancora già qui dove quando bene bello bella server staff gente persone ci si mi ti vi ne".split(" "),
);
const EN_WORDS = new Set("the and of to is are you your this that with for from not have has was were will can".split(" "));

/** Testo da tradurre al volo? Frasi italiane con almeno tre parole. */
export function wantsLiveTranslation(s: string): boolean {
  const t = s.trim();
  if (t.length < 12 || t.length > 1500) return false;
  const words = t.toLowerCase().match(/[a-zàèéìòù']+/g) || [];
  if (words.length < 3) return false;
  const it = words.filter((w) => IT_WORDS.has(w) || /[àèéìòù]/.test(w)).length;
  const en = words.filter((w) => EN_WORDS.has(w)).length;
  return it >= 1 && it > en;
}

const memo = new Map<string, Map<string, string>>();
function mem(lang: string): Map<string, string> {
  let m = memo.get(lang);
  if (m) return m;
  m = new Map();
  try {
    const raw = localStorage.getItem(STORE(lang));
    if (raw) for (const [k, v] of JSON.parse(raw) as [string, string][]) m.set(k, v);
  } catch {
    /* ignore */
  }
  memo.set(lang, m);
  return m;
}
let saveTimer = 0;
function persist(lang: string) {
  if (saveTimer) return;
  saveTimer = window.setTimeout(() => {
    saveTimer = 0;
    try {
      const entries = [...mem(lang).entries()].slice(-STORE_MAX);
      localStorage.setItem(STORE(lang), JSON.stringify(entries));
    } catch {
      /* spazio finito o storage bloccato: resta in memoria */
    }
  }, 1500);
}

/** Traduzione già nota (in memoria o nel browser). */
export function liveLookup(lang: string, text: string): string | null {
  return mem(lang).get(text.trim()) ?? null;
}

/* richieste raccolte per qualche centinaio di millisecondi e mandate insieme */
let queue = new Map<string, Set<(t: string) => void>>();
let queueLang = "";
let timer = 0;
const failed = new Set<string>();

async function send(lang: string, batch: Map<string, Set<(t: string) => void>>) {
  const texts = [...batch.keys()];
  for (let i = 0; i < texts.length; i += 40) {
    const part = texts.slice(i, i + 40);
    try {
      const r = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify({ lang, texts: part }),
      });
      const j = (await r.json().catch(() => null)) as { ok?: boolean; translations?: (string | null)[] } | null;
      if (!r.ok || !j?.ok || !Array.isArray(j.translations)) {
        part.forEach((t) => failed.add(`${lang}\u0001${t}`));
        continue;
      }
      part.forEach((t, k) => {
        const tr = j.translations?.[k];
        if (!tr || tr === t) return;
        mem(lang).set(t, tr);
        batch.get(t)?.forEach((cb) => cb(tr));
      });
      persist(lang);
    } catch {
      part.forEach((t) => failed.add(`${lang}\u0001${t}`));
    }
  }
}

/** Chiede la traduzione di un testo; `done` arriva quando c'è (anche dopo un po'). */
export function requestLive(lang: string, text: string, done: (t: string) => void) {
  const t = text.trim();
  if (!t || failed.has(`${lang}\u0001${t}`)) return;
  if (queueLang && queueLang !== lang) {
    queue = new Map();
  }
  queueLang = lang;
  const set = queue.get(t) || new Set();
  set.add(done);
  queue.set(t, set);
  if (!timer) {
    timer = window.setTimeout(() => {
      timer = 0;
      const batch = queue;
      queue = new Map();
      void send(queueLang, batch);
    }, 350);
  }
}
