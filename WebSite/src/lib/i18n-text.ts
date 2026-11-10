/**
 * Traduttore dei testi dell'interfaccia scritti in italiano (dashboard, poi il resto del sito).
 * Il dizionario ha come chiave il testo italiano così com'è nel codice; numeri e parti variabili
 * diventano {0}, {1}… (stesso formato di scripts/extract-ui-texts.mjs).
 *
 *   translateUiText("Hai 3 ruoli", "en") → "You have 3 roles"   (con "Hai {0} ruoli" nel dizionario)
 *
 * Inglese e spagnolo sono curati; le altre lingue usano l'inglese (come il resto del sito).
 */
import type { Locale } from "@/lib/i18n";

type Dict = Record<string, string>;

const cache: Partial<Record<"en" | "es", Dict>> = {};
const loading: Partial<Record<"en" | "es", Promise<Dict>>> = {};

export function uiTextLang(locale: Locale): "en" | "es" | null {
  if (locale === "it") return null;
  return locale === "es" ? "es" : "en";
}

/** Carica il dizionario (separato dal resto del codice, si scarica solo se serve). */
export function loadUiDict(lang: "en" | "es"): Promise<Dict> {
  if (cache[lang]) return Promise.resolve(cache[lang] as Dict);
  if (!loading[lang]) {
    const p = (lang === "es" ? import("@/lib/i18n/ui-es.json") : import("@/lib/i18n/ui-en.json")).then((m) => {
      const d = ((m as { default?: unknown }).default ?? m) as Dict;
      cache[lang] = d;
      return d;
    });
    loading[lang] = p;
  }
  return loading[lang] as Promise<Dict>;
}

export function uiDictSync(lang: "en" | "es"): Dict | null {
  return cache[lang] || null;
}

const NUM = /(?<![{\w])\d+(?:[.,]\d+)*(?![}\w])/g;

/**
 * Traduce un testo intero (spazi iniziali/finali conservati). null = nessuna traduzione.
 * I numeri del testo tornano al loro posto nella traduzione.
 */
export function translateWith(dict: Dict, raw: string): string | null {
  if (!raw) return null;
  const lead = raw.match(/^\s*/)?.[0] || "";
  const trail = raw.match(/\s*$/)?.[0] || "";
  const core = raw.slice(lead.length, raw.length - trail.length).replace(/\s+/g, " ");
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return null;
  const direct = dict[core];
  if (direct != null) return lead + direct + trail;
  const nums: string[] = [];
  const key = core.replace(NUM, (m) => {
    nums.push(m);
    return `{${nums.length - 1}}`;
  });
  if (!nums.length) return null;
  const tpl = dict[key];
  if (tpl == null) return null;
  return lead + tpl.replace(/\{(\d+)\}/g, (m, i: string) => nums[Number(i)] ?? m) + trail;
}
