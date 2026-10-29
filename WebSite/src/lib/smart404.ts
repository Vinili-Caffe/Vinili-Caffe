import { REACT_PAGES } from "@/lib/site";

/**
 * Alias e suggerimenti 404 — port lean di WebSite/js/vc-smart-404.js.
 * Solo percorsi già noti (REACT_PAGES + destinazioni alias). Niente inventati.
 */

/** Redirect esatti dal sito vecchio (path normalizzato senza slash finale, come là). */
export const SMART_404_ALIASES: Record<string, string> = {
  "/richieste": "/staff/pause/",
  "/richieste/stato": "/staff/pause/",
  "/staff/ticket": "/tickets/",
  "/staff/tickets": "/tickets/",
  "/staff/directory": "/staff/guida/",
  "/staff/organico": "/staff/gestione/",
  "/staff/gestione": "/staff/gestione/",
  "/staff/valutazioni": "/staff/",
  "/staff/moderazione": "/staff/guida/",
  "/notifiche": "/notifications/",
  "/messaggi": "/notifications/",
  "/inbox": "/staff/inbox/",
  "/profilo": "/user/",
  "/account": "/user/",
  "/premium": "/perks/",
};

export type Smart404Result =
  | { kind: "redirect"; href: string }
  | { kind: "suggest"; href: string; label: string; hint: string }
  | { kind: "none"; hint: string };

export function normPath(pathname: string): string {
  let p = String(pathname || "/").split("?")[0].split("#")[0];
  p = p.replace(/\/index\.html$/i, "");
  p = p.replace(/\/+$/, "");
  return p || "/";
}

/** Path con trailing slash per confronti col catalogo React. */
export function withSlash(path: string): string {
  if (!path || path === "/") return "/";
  const bare = path.replace(/\/+$/, "");
  return `${bare}/`;
}

function aliasDestPath(dest: string): string {
  return withSlash(normPath(dest));
}

/** Catalogo noto: pagine React + destinazioni alias (senza query). */
export function knownRoutes(): Set<string> {
  const set = new Set<string>(REACT_PAGES);
  for (const dest of Object.values(SMART_404_ALIASES)) {
    set.add(aliasDestPath(dest));
  }
  return set;
}

export function parentCandidates(pathname: string): string[] {
  const parts = normPath(pathname).split("/").filter(Boolean);
  const out: string[] = [];
  while (parts.length > 1) {
    parts.pop();
    out.push(`/${parts.join("/")}/`);
  }
  return out;
}

/** Risolve alias / genitore noto. */
export function resolveSmart404(pathname: string, _search = ""): Smart404Result {
  const path = normPath(pathname);
  const known = knownRoutes();

  const alias = SMART_404_ALIASES[path];
  if (alias) {
    return { kind: "redirect", href: alias };
  }

  const parents = parentCandidates(path);
  for (const cand of parents) {
    if (known.has(cand)) {
      return {
        kind: "suggest",
        href: cand,
        label: `Prova ${cand}`,
        hint: "Questa pagina non esiste più. Puoi tornare indietro, alla home, o alla sezione più vicina.",
      };
    }
  }

  if (parents.length) {
    // Genitore non in catalogo React: non inventiamo il link; solo hint.
    return {
      kind: "none",
      hint: "Questa pagina non esiste più. Torna indietro o alla home.",
    };
  }

  return {
    kind: "none",
    hint: "Questa pagina non esiste. Torna indietro o alla home.",
  };
}
