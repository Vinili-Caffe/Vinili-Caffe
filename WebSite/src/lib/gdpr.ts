// GDPR self-service: /webhooks/site-dashboard/account/gdpr/*
// Handler: Vinili/Utils/Web/siteDashboardGdprApi.js (+ siteWebhookRoutes.js).
// UI vecchia: WebSite/js/gdpr-data-page.js — solo export, anteprima erase, erase con confirmToken.

export type CountTree = { [key: string]: number | CountTree };

export type EraseResult = {
  ok: true;
  preview: boolean;
  message?: string;
  deleted: CountTree;
  retained: CountTree;
  user?: { id: string; username: string | null };
  trimmedProfiles?: unknown;
};

type Fail = { ok: false; message: string; error?: string; status?: number; retryAfterMs?: number };

const BASE = "/webhooks/site-dashboard/account/gdpr";

/** Etichette IT come in gdpr-data-page.js (COUNT_LABELS). */
export const COUNT_LABELS: Record<string, string> = {
  guildReposts: "Repost pubblicati",
  hogwartsJsonlRows: "Registri evento Hogwarts",
  hogwartsJsonRows: "Registri evento Hogwarts",
  activityUserProfiles: "Profili attività",
  siteDocuments: "Documenti e richieste sul sito",
  userLeaveBackups: "Backup uscita dal server",
  userFullDiscordStateHistories: "Cronologia stato Discord",
  muteRoleSnapshotProfiles: "Snapshot ruoli mute/timeout",
  customPerksDiscordCleanupProfiles: "Pulizia perk Discord in coda",
  communicationTimeoutRoleSnapshots: "Snapshot timeout comunicazione",
  customPerksDiscordCleanupQueue: "Coda pulizia perk Discord",
  countingRestoreTokens: "Token ripristino counting",
  legacyCollections: "Dati storici",
  guildFeatureBucket: "Dati community",
  suggestionsRemoved: "Feedback",
  ticketsRedacted: "Ticket (resi anonimi)",
  giveawayParticipationsRemoved: "Partecipazioni giveaway",
  moderationProfiles: "Profili moderazione",
  staffProfiles: "Profili staff",
  hogwartsProfiles: "Profili Hogwarts",
  hogwartsSortingDoc: "Smistamento Hogwarts",
  tenantPartnershipProfiles: "Profili partnership",
  payments: "Pagamenti / crediti",
  moderationCasesAsSubject: "Casi di moderazione",
  activityusers: "Profili attività (storico)",
  expusers: "Esperienza e livelli (storico)",
  activitydailies: "Attività giornaliera (storico)",
  activityhourlies: "Attività oraria (storico)",
  activitydailycompacts: "Attività giornaliera compatta",
  activityhourlycompacts: "Attività oraria compatta",
  levelhistories: "Storico livelli",
  levelhistoryusers: "Storico livelli utente",
  mentionreactions: "Reazioni alle menzioni",
  mentionresponses: "Risposte alle menzioni",
  birthdayprofiles: "Profili compleanno",
};

function humanizeKey(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function labelFor(key: string) {
  const k = String(key || "").trim();
  return COUNT_LABELS[k] || humanizeKey(k) || k;
}

export function countValue(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "object" && !Array.isArray(v)) {
    let sum = 0;
    for (const n of Object.values(v as CountTree)) sum += countValue(n);
    return sum;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export type CountItem = { key: string; n: number; detail?: string };

/** Appiattisce deleted/retained come il JS vecchio (solo voci > 0). */
export function summarizeCounts(obj: CountTree | null | undefined): CountItem[] {
  if (!obj || typeof obj !== "object") return [];
  const items: CountItem[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      const nested: CountItem[] = [];
      for (const [nk, nv] of Object.entries(v as CountTree)) {
        const nn = countValue(nv);
        if (nn > 0) nested.push({ key: nk, n: nn });
      }
      if (!nested.length) continue;
      items.push({
        key: k,
        n: nested.reduce((s, it) => s + it.n, 0),
        detail: nested.map((it) => `${labelFor(it.key)}: ${it.n}`).join(" · "),
      });
      continue;
    }
    const n = countValue(v);
    if (n > 0) items.push({ key: k, n });
  }
  return items;
}

async function parseFail(r: Response): Promise<Fail> {
  const j = await r.json().catch(() => null);
  return {
    ok: false,
    status: r.status,
    error: j?.error,
    message: j?.message || (r.status === 429 ? "Troppe richieste: attendi un momento." : "Operazione non riuscita."),
    retryAfterMs: typeof j?.retryAfterMs === "number" ? j.retryAfterMs : undefined,
  };
}

/** GET export: allegato JSON oppure messaggio tooLarge / errore. */
export async function exportGdprData(
  token: string,
): Promise<{ ok: true; filename: string } | { ok: true; tooLarge: true; message: string } | Fail> {
  try {
    const r = await fetch(`${BASE}/export`, {
      method: "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const disp = String(r.headers.get("content-disposition") || "");
    const isAttachment = /attachment/i.test(disp);

    if (!isAttachment) {
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || data.ok === false) {
        return {
          ok: false,
          status: r.status,
          error: data?.error,
          message: data?.message || "Export non riuscito.",
          retryAfterMs: typeof data?.retryAfterMs === "number" ? data.retryAfterMs : undefined,
        };
      }
      if (data.tooLarge) {
        return {
          ok: true,
          tooLarge: true,
          message:
            data.message ||
            "Export troppo grande per il download diretto. Contatta il supporto per un export manuale.",
        };
      }
      return { ok: false, message: "Export non riuscito." };
    }

    if (!r.ok) return parseFail(r);

    const blob = await r.blob();
    const match = /filename="?([^";]+)"?/i.exec(disp);
    const filename = (match && match[1]) || "gdpr-export.json";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { ok: true, filename };
  } catch {
    return { ok: false, message: "Errore di rete. Riprova tra poco." };
  }
}

/** POST erase con confirm:false → anteprima; confirm:true + confirmToken → cancellazione. */
export async function eraseGdprData(
  token: string,
  body: { confirm: false } | { confirm: true; confirmToken: string },
): Promise<{ ok: true; data: EraseResult } | Fail> {
  try {
    const r = await fetch(`${BASE}/erase`, {
      method: "POST",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.ok === false) {
      return {
        ok: false,
        status: r.status,
        error: j?.error,
        message: j?.message || (body.confirm ? "Cancellazione non riuscita." : "Anteprima non riuscita."),
        retryAfterMs: typeof j?.retryAfterMs === "number" ? j.retryAfterMs : undefined,
      };
    }
    return {
      ok: true,
      data: {
        ok: true,
        preview: Boolean(j.preview),
        message: j.message,
        deleted: (j.deleted || {}) as CountTree,
        retained: (j.retained || {}) as CountTree,
        user: j.user,
        trimmedProfiles: j.trimmedProfiles,
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete. Riprova tra poco." };
  }
}
