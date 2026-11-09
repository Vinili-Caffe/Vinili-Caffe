/**
 * Anteprima "visualizza come ruolo" (come su Discord) per tutto il sito.
 * Il sito manda l'header X-VC-View-As:
 *   - "roles:<id>,<id>,…"  → ruoli scelti del server principale ("roles:" = solo @everyone)
 *   - preset vecchi (member, helper, mod, …) → convertiti nei ruoli corrispondenti
 * Un middleware mette la scelta nel contesto della richiesta (AsyncLocalStorage); i punti che
 * risolvono "chi sei" dal token (resolveWebsiteGuildMember, candidature, accessi staff) sostituiscono
 * i ruoli veri con questi — solo se il vero utente è il Founder (o in VC_VIEW_AS_USER_IDS).
 */
const { AsyncLocalStorage } = require("node:async_hooks") as typeof import("node:async_hooks");

type ViewAsStore = { roleIds: string[] | null; raw: string };

const als: import("node:async_hooks").AsyncLocalStorage<ViewAsStore> = new AsyncLocalStorage();

function parseViewAsHeader(raw?): ViewAsStore {
  const v = String(raw || "").trim();
  if (!v) return { roleIds: null, raw: "" };
  const m = v.match(/^roles:([\d,\s]*)$/i);
  if (m) {
    const ids = [...new Set(m[1].split(",").map((s) => s.trim()).filter((s) => /^\d{16,22}$/.test(s)))].slice(0, 50);
    return { roleIds: ids, raw: `roles:${ids.join(",")}` };
  }
  try {
    const { normalizeViewAs, roleIdsForViewAsPreset } = require("../../Vinili/site/http/siteViewAsPreview") as typeof import("../../Vinili/site/http/siteViewAsPreview");
    const preset = normalizeViewAs(v);
    if (!preset) return { roleIds: null, raw: "" };
    const ids = roleIdsForViewAsPreset(preset);
    return Array.isArray(ids) ? { roleIds: ids.map(String), raw: preset } : { roleIds: null, raw: "" };
  } catch {
    return { roleIds: null, raw: "" };
  }
}

/** Va montato dopo express.json(), prima delle rotte /webhooks/. */
function mountViewAsContext(app?) {
  app.use((req?, _res?, next?) => {
    const h = req?.headers || {};
    const raw = h["x-vc-view-as"] || "";
    if (!raw) return next();
    const store = parseViewAsHeader(Array.isArray(raw) ? raw[0] : raw);
    if (!store.roleIds) return next();
    als.run(store, () => next());
  });
}

/** Ruoli da simulare nella richiesta corrente (null = nessuna anteprima). */
function getViewAsRoleIds(): string[] | null {
  return als.getStore()?.roleIds ?? null;
}

/** Firma per le cache che dipendono dai ruoli ("" = reale). */
function viewAsCacheSuffix(): string {
  return als.getStore()?.raw || "";
}

/** Esegue fn senza anteprima (es. per verificare i permessi veri del Founder). */
function withoutViewAs<T>(fn: () => T): T {
  return als.exit(fn);
}

export = { mountViewAsContext, getViewAsRoleIds, viewAsCacheSuffix, withoutViewAs, parseViewAsHeader };
