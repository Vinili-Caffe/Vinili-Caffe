/**
 * Traduttore dei testi dell'interfaccia scritti in italiano (dashboard, poi il resto del sito).
 * Il dizionario ha come chiave il testo italiano così com'è nel codice; numeri e parti variabili
 * diventano {0}, {1}… (stesso formato di scripts/extract-ui-texts.mjs).
 *
 *   translateUiText("Hai 3 ruoli", "en") → "You have 3 roles"   (con "Hai {0} ruoli" nel dizionario)
 *
 * Inglese e spagnolo sono curati a mano; le altre lingue escono da Scripts/i18n/traduci.mjs.
 * Se una frase manca nella lingua scelta si usa l'inglese.
 */
import type { Locale } from "@/lib/i18n";

type Dict = Record<string, string>;
export type UiLang = Exclude<Locale, "it">;

/* un file per lingua, scaricato solo quando serve */
const LOADERS: Record<UiLang, () => Promise<unknown>> = {
  en: () => import("@/lib/i18n/ui-en.json"),
  es: () => import("@/lib/i18n/ui-es.json"),
  fr: () => import("@/lib/i18n/ui-fr.json"),
  de: () => import("@/lib/i18n/ui-de.json"),
  pt: () => import("@/lib/i18n/ui-pt.json"),
  ru: () => import("@/lib/i18n/ui-ru.json"),
  zh: () => import("@/lib/i18n/ui-zh.json"),
  ja: () => import("@/lib/i18n/ui-ja.json"),
  ko: () => import("@/lib/i18n/ui-ko.json"),
  ar: () => import("@/lib/i18n/ui-ar.json"),
  nl: () => import("@/lib/i18n/ui-nl.json"),
  pl: () => import("@/lib/i18n/ui-pl.json"),
  tr: () => import("@/lib/i18n/ui-tr.json"),
  hi: () => import("@/lib/i18n/ui-hi.json"),
  id: () => import("@/lib/i18n/ui-id.json"),
  uk: () => import("@/lib/i18n/ui-uk.json"),
  vi: () => import("@/lib/i18n/ui-vi.json"),
  ro: () => import("@/lib/i18n/ui-ro.json"),
  sv: () => import("@/lib/i18n/ui-sv.json"),
};

const cache: Partial<Record<UiLang, Dict>> = {};
const loading: Partial<Record<UiLang, Promise<Dict>>> = {};

export function uiTextLang(locale: Locale): UiLang | null {
  if (locale === "it") return null;
  return locale in LOADERS ? (locale as UiLang) : "en";
}

const raw = (lang: UiLang): Promise<Dict> =>
  LOADERS[lang]().then((m) => ((m as { default?: unknown }).default ?? m) as Dict);

/** Carica il dizionario della lingua, con l'inglese sotto per le frasi che mancano. */
export function loadUiDict(lang: UiLang): Promise<Dict> {
  if (cache[lang]) return Promise.resolve(cache[lang] as Dict);
  if (!loading[lang]) {
    const p = (lang === "en" ? raw("en") : Promise.all([raw("en"), raw(lang)]).then(([en, own]) => ({ ...en, ...own }))).then((d) => {
      cache[lang] = d;
      return d;
    });
    loading[lang] = p;
  }
  return loading[lang] as Promise<Dict>;
}

export function uiDictSync(lang: UiLang): Dict | null {
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
