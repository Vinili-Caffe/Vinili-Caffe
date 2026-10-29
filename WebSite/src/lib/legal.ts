// Tipi e helper per le pagine legali (privacy, cookie, terms, copyright).

export type LegalKv = { k: string; v: string };

export type LegalBlock =
  | { type: "p"; text: string }
  | { type: "label"; text: string }
  | { type: "h3"; text: string }
  | { type: "h4"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "fact"; title: string; badge: string; items: LegalKv[] }
  | { type: "kvlist"; items: LegalKv[] }
  | { type: "pre"; text: string }
  | { type: "cta"; href: string; label: string };

export type LegalSection = {
  id: string;
  title: string;
  blocks: LegalBlock[];
};

export type LegalDoc = {
  slug: string;
  h1: string;
  updatedIso: string | null;
  updatedLabel: string | null;
  updatedPrefix: string;
  subtitle: string | null;
  sections: LegalSection[];
};

/** Altre policy collegate (footer/aside del sito vecchio). */
export const LEGAL_SIBLINGS: { slug: string; label: string; href: string }[] = [
  { slug: "privacy", label: "Privacy Policy", href: "/privacy/" },
  { slug: "cookie", label: "Cookie Policy", href: "/cookie/" },
  { slug: "terms", label: "Termini di Servizio", href: "/terms/" },
  { slug: "copyright", label: "Copyright", href: "/copyright/" },
  { slug: "dati", label: "I tuoi dati", href: "/dati/" },
];
