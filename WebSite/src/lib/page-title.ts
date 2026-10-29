/** Titoli browser / OG come sul sito vecchio. */

/** Nome server normale (og:title / <title>) — il wordmark UI resta in maiuscolo via CSS. */
export const SITE_TITLE_BRAND = "Vinili & Caffè • Italia • Social • Gaming";

/** Separatore storico (U+01C0 LATIN LETTER DENTAL CLICK), non la pipe ASCII. */
export const SITE_TITLE_SEP = " ǀ ";

/** Home (senza suffisso pagina). */
export const SITE_TITLE_HOME = SITE_TITLE_BRAND;

/** Template Next.js metadata: `Vinili & Caffè • … ǀ %s` */
export const SITE_TITLE_TEMPLATE = `${SITE_TITLE_BRAND}${SITE_TITLE_SEP}%s`;

export function pageTitle(page: string): string {
  const p = String(page || "").trim();
  if (!p) return SITE_TITLE_BRAND;
  return `${SITE_TITLE_BRAND}${SITE_TITLE_SEP}${p}`;
}
