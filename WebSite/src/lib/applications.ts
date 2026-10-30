// Candidature (Helper / Partner Manager / Blogger) e appelli (unban / unmute).
// Domande: copia di Vinili/Utils/Community/candidatureApplicationsCatalog.js (il bot rifiuta campi mancanti).
// Handler: Vinili/Events/interaction/candidatureApplicationHandlers.js, unbanWebsiteHandlers.js, unmuteWebsiteHandlers.js
// Se l'API è spenta nel .env del bot risponde 503 "candidature_http_disabled": va mostrato come "chiuso", non come errore.

export type RoleType = "helper" | "partnermanager" | "blogger";
export type Question = {
  id: string;
  text: string;
  placeholder?: string;
  kind: "short" | "paragraph" | "choice" | "multi_choice";
  hint?: string;
  options?: { value: string; label: string }[];
};

const opts = (...v: string[]) => v.map((x) => ({ value: x, label: x }));

export const ROLES: { id: RoleType; label: string; questions: Question[] }[] = [
  {
    id: "helper",
    label: "Helper",
    questions: [
      { id: "id_discord", text: "ID Discord", kind: "short" },
      { id: "eta", text: "Età", placeholder: "Scrivi la tua età", kind: "short" },
      { id: "tos_linee_guida", text: "Cosa sono i ToS e le Linee Guida di Discord?", kind: "paragraph" },
      {
        id: "motivo_candidatura",
        text: "Seleziona una o più opzioni che sei disposto a intraprendere per sostenere il server",
        kind: "multi_choice",
        hint: "Puoi selezionare più di un'opzione.",
        options: opts("Facendo attività vocale", "Scrivendo nei canali", "Pensando a eventi per il server", "Giveaway di nitro, decorazioni o altro", "Boostando il server", "Aiutando economicamente il server"),
      },
      { id: "gestione_community", text: "Se hai già gestito delle community Discord, su quale tema si basavano (esempio: anime, giochi, musica, sport, ecc.)?", kind: "paragraph" },
      { id: "staff_altri_server", text: "Attualmente ricopri qualche carica da staffer in altri server? Se si, indica quali", kind: "paragraph" },
      { id: "comandi_dyno", text: "Elenca i comandi di moderazioni più importanti", kind: "paragraph" },
      { id: "gestione_discussione", text: "Che comportamento assumi nel caso due utenti discutessero in un canale testuale o vocale?", kind: "paragraph" },
      { id: "vocale", text: "Potrai stare in vocale? In caso di risposta positiva, potrai parlare?", kind: "choice", options: opts("Sì", "No") },
      { id: "definizione_caps_wall_of_text", text: "Definisci 'caps' e 'wall of text'.", kind: "paragraph" },
      { id: "definizione_flood_spam", text: "Definisci e scrivi la differenza sostanziale tra flood e spam.", kind: "paragraph" },
      { id: "compito_staffer", text: "Secondo te, qual è il compito di uno Staffer?", kind: "paragraph" },
      { id: "caratteristiche_vinili_caffe", text: "Su cosa si basa Vinili & Caffè e quali sono le sue caratteristiche principali e punti di forza?", kind: "paragraph" },
      { id: "valutazione_abilita_staffer", text: "Quanto valuti le tue abilità da Staffer?", kind: "choice", options: opts("Pessime", "Scarse", "Buone", "Eccellenti") },
      { id: "motivi_candidatura", text: "Perchè dovremmo scegliere te? Indica due motivi per il quale la tua candidatura dovrebbe essere presa in considerazione più delle altre.", kind: "paragraph" },
      {
        id: "fascia_oraria_disponibilita",
        text: "In quale fascia oraria sei solitamente disponibile su discord?",
        kind: "multi_choice",
        hint: "Puoi selezionare più di un'opzione.",
        options: opts("Mattino (07:00 - 12:30)", "Pomeriggio (12:30 - 18:30)", "Sera (18:30 - 00:00)", "Notte (00:00 - 07:00)"),
      },
      { id: "tempo_dedicato_server", text: "Quanto tempo riesci a dedicare giornalmente al server?", kind: "choice", options: opts("Da 1 a 3 ore", "Da 3 a 5 ore", "Da 5 a 8 ore", "8+ ore") },
    ],
  },
  {
    id: "partnermanager",
    label: "Partner Manager",
    questions: [
      { id: "id_discord", text: "ID Discord", kind: "short" },
      { id: "partnership_tra_server", text: "Descrivi brevemente come si effettua una partnership tra server", kind: "paragraph" },
      { id: "partner_giorno", text: "Quante partner fai al giorno?", kind: "choice", options: [{ value: "-15", label: "15-" }, { value: "15+", label: "15+" }] },
      { id: "staff_altri_server", text: "Attualmente ricopri questo ruolo anche in altri server? Se si, indica quali", placeholder: "Indica quali server", kind: "paragraph" },
    ],
  },
  {
    id: "blogger",
    label: "Blogger",
    questions: [
      { id: "id_discord", text: "ID Discord", kind: "short" },
      { id: "eta", text: "Età", placeholder: "Scrivi la tua età", kind: "short" },
      {
        id: "topic_blog",
        text: "Per quale topic blog ti stai candidando?",
        kind: "multi_choice",
        hint: "Puoi selezionare più di un'opzione.",
        options: opts("Anime & Manga", "Lettura", "Scrittura", "Film & Serie TV", "Sport", "Musica", "Gaming", "Disegno", "Cucina", "Fotografia"),
      },
      { id: "scelta_argomento", text: "Su cosa ti basi per scegliere l'argomento di un articolo?", kind: "paragraph" },
      { id: "flusso_lavoro", text: "Che flusso di lavoro segui per scriverlo?", kind: "paragraph" },
      { id: "fonti", text: "Quante e quali tipi di fonti prendi come riferimento?", kind: "paragraph" },
      { id: "info_poco_chiare", text: "Come ti comporti quando trovi informazioni ridotte, contrastanti o poco chiare?", kind: "paragraph" },
      { id: "articolo_corretto_mediocre", text: "Da cosa distingui un articolo redatto correttamente da uno mediocre?", kind: "paragraph" },
      { id: "esempio_articolo", text: "Fai un esempio di articolo riguardante il topic per cui ti candidi.", kind: "paragraph" },
      { id: "notizia_popolare", text: "Se una notizia è molto popolare ma poco rilevante, la sceglieresti comunque? Motiva la risposta.", kind: "paragraph" },
    ],
  },
];

export const REQUIREMENTS = [
  "Avere almeno 14 anni (compiuti)",
  "Rispettare i [[ToS|https://discord.com/terms]] e le [[Linee Guida|https://discord.com/guidelines]] di Discord",
  "Essere maturi e attivi",
  "Non essere mai stato sanzionato nel server",
];

/** Le scelte multiple vanno al bot come elenco puntato, come sul sito attuale. */
export const encodeMulti = (vals: string[]) => vals.map((v) => `• ${v}`).join("\n");

export type RoleEligibility = { eligible: boolean; code?: string; message?: string; roleLabel?: string; cooldown_until_ms?: number };
// blogger facoltativo: finché il bot non è aggiornato non lo manda
export type Eligibility = { inGuild: boolean; noModuliBlocked?: boolean; helper: RoleEligibility; partnermanager: RoleEligibility; blogger?: RoleEligibility };

type Res<T> = { ok: true; data: T } | { ok: false; message: string; disabled?: boolean; status?: number };

async function call<T>(path: string, token: string, body?: unknown): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (j?.error === "candidature_http_disabled") return { ok: false, disabled: true, message: "Il modulo è chiuso in questo momento." };
    if (!j || !j.ok) return { ok: false, status: r.status, message: j?.message || "Invio non riuscito: riprova più tardi." };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Errore di rete: controlla la connessione e riprova." };
  }
}

export const loadEligibility = (token: string) => call<Eligibility>("/webhooks/site-candidature/eligibility", token);
export const submitApplication = (token: string, type: RoleType, answers: Record<string, string>) =>
  call<{ message: string; cooldown_until_ms?: number }>("/webhooks/site-candidature", token, { type, answers });

/* ── appelli ── */

export type AppealType = "unban" | "unmute";
export type AppealState = { active: boolean; can_submit: boolean; cooldown_until_ms: number; message: string };
export const APPEAL_MAX = 1600;

export async function loadAppealState(token: string, type: AppealType): Promise<Res<AppealState>> {
  const r = await call<{ is_banned?: boolean; is_muted?: boolean; can_submit: boolean; cooldown_until_ms: number; message: string }>(`/webhooks/site-${type}/eligibility`, token);
  if (!r.ok) return r;
  return { ok: true, data: { active: !!(type === "unban" ? r.data.is_banned : r.data.is_muted), can_submit: r.data.can_submit, cooldown_until_ms: r.data.cooldown_until_ms, message: r.data.message } };
}
export const submitAppeal = (token: string, type: AppealType, answers: { reason: string; apology: string; extra: string }) =>
  call<{ message: string }>(`/webhooks/site-${type}`, token, { answers, acceptedRules: true });

export const dateTimeIt = (ms: number) => new Date(ms).toLocaleString("it-IT", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
