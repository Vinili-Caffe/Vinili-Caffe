/**
 * Traduttore all'invio: prima che un messaggio parta verso Discord, se il server usa una lingua
 * diversa dall'italiano ne traduce testo, embed e componenti con i dizionari in ./bot/<lingua>.json
 * (chiave = frase italiana del codice, generati da Scripts/i18n/traduci.mjs).
 *
 * Si aggancia a MessagePayload.resolveBody di discord.js, da cui passano send, reply, edit,
 * risposte alle interazioni e webhook. I server ufficiali restano sempre in italiano.
 * Quello che non è nel dizionario resta com'è: la traduzione non blocca mai un messaggio.
 */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");

type Dict = Record<string, string>;
type Template = { re: RegExp; hint: string; out: string };
type Pack = { exact: Dict; templates: Template[] };

const DIR = path.join(__dirname, "bot");
const packs = new Map<string, Pack | null>();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* segnaposto: {0}, {1}… dell'estrattore e {user}, {count}… che il bot riempie prima di inviare */
const SLOT = /\{([A-Za-z0-9_]{1,30})\}/;
const SLOT_G = /\{([A-Za-z0-9_]{1,30})\}/g;

/** Frase con segnaposto → espressione che riconosce la frase con i valori veri al loro posto. */
function compile(key: string, out: string): Template | null {
  const parts = key.split(SLOT);
  if (parts.length < 3) return null;
  let src = "^";
  let hint = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      src += escapeRe(parts[i]);
      if (parts[i].trim().length > hint.length) hint = parts[i].trim();
    } else src += `(?<p${parts[i]}_${i}>[\\s\\S]+?)`;
  }
  src += "$";
  if (hint.length < 3) return null; /* solo segnaposto: troppo generico */
  try {
    return { re: new RegExp(src), hint, out };
  } catch {
    return null;
  }
}

function loadPack(lang: string): Pack | null {
  if (packs.has(lang)) return packs.get(lang) || null;
  let pack: Pack | null = null;
  try {
    const file = path.join(DIR, `${lang}.json`);
    if (fs.existsSync(file)) {
      const dict = JSON.parse(fs.readFileSync(file, "utf8")) as Dict;
      const templates: Template[] = [];
      for (const [k, v] of Object.entries(dict)) {
        const t = compile(k, v);
        if (t) templates.push(t);
      }
      /* prima le frasi più lunghe: sono le più precise */
      templates.sort((a, b) => b.hint.length - a.hint.length);
      pack = Object.keys(dict).length ? { exact: dict, templates } : null;
    }
  } catch {
    pack = null;
  }
  packs.set(lang, pack);
  return pack;
}

function translateLine(pack: Pack, line: string): string | null {
  const lead = line.match(/^\s*/)?.[0] || "";
  const trail = line.match(/\s*$/)?.[0] || "";
  const core = line.slice(lead.length, line.length - trail.length);
  if (!core || !/[A-Za-zÀ-ÿ]/.test(core)) return null;
  const direct = pack.exact[core];
  if (direct != null) return lead + direct + trail;
  for (const t of pack.templates) {
    if (!core.includes(t.hint)) continue;
    const m = core.match(t.re);
    if (!m?.groups) continue;
    const vals: Record<string, string> = {};
    for (const [name, val] of Object.entries(m.groups)) vals[name.slice(1).replace(/_\d+$/, "")] = val;
    return lead + t.out.replace(SLOT_G, (s, i: string) => vals[i] ?? s) + trail;
  }
  return null;
}

/** Traduce un testo intero; se non c'è, riga per riga. Ciò che non conosce resta uguale. */
export function translateBotText(lang: string, text: unknown): unknown {
  if (typeof text !== "string" || !text.trim()) return text;
  const pack = loadPack(lang);
  if (!pack) return text;
  const whole = translateLine(pack, text);
  if (whole != null) return whole;
  if (!text.includes("\n")) return text;
  return text
    .split("\n")
    .map((l) => translateLine(pack, l) ?? l)
    .join("\n");
}

const toJson = (v: any) => (v && typeof v.toJSON === "function" ? v.toJSON() : v);

function translateEmbed(lang: string, e: any): any {
  const d = toJson(e);
  if (!d || typeof d !== "object") return e;
  const t = (v: unknown) => translateBotText(lang, v);
  return {
    ...d,
    ...(d.title != null && { title: t(d.title) }),
    ...(d.description != null && { description: t(d.description) }),
    ...(d.footer?.text != null && { footer: { ...d.footer, text: t(d.footer.text) } }),
    ...(d.author?.name != null && { author: { ...d.author, name: t(d.author.name) } }),
    ...(Array.isArray(d.fields) && { fields: d.fields.map((f: any) => ({ ...f, name: t(f.name), value: t(f.value) })) }),
  };
}

/* componenti (pulsanti, menu, testi dei componenti V2) in profondità */
function translateComponent(lang: string, c: any): any {
  const d = toJson(c);
  if (!d || typeof d !== "object") return c;
  const t = (v: unknown) => translateBotText(lang, v);
  const out: any = { ...d };
  if (typeof d.label === "string") out.label = t(d.label);
  if (typeof d.placeholder === "string") out.placeholder = t(d.placeholder);
  if (typeof d.content === "string") out.content = t(d.content); /* TextDisplay */
  if (typeof d.description === "string") out.description = t(d.description);
  if (Array.isArray(d.options)) out.options = d.options.map((o: any) => ({ ...o, label: t(o.label), ...(o.description != null && { description: t(o.description) }) }));
  if (Array.isArray(d.components)) out.components = d.components.map((x: any) => translateComponent(lang, x));
  if (d.accessory) out.accessory = translateComponent(lang, d.accessory);
  return out;
}

export function translateBotPayload(lang: string, options: any): any {
  if (!options || typeof options !== "object") return options;
  const out: any = { ...options };
  if (typeof options.content === "string") out.content = translateBotText(lang, options.content);
  if (Array.isArray(options.embeds)) out.embeds = options.embeds.map((e: any) => translateEmbed(lang, e));
  if (Array.isArray(options.components)) out.components = options.components.map((c: any) => translateComponent(lang, c));
  return out;
}

/* ───────── lingua del server ───────── */

let officialIds: Set<string> | null = null;
function isOfficial(guildId: string): boolean {
  if (!officialIds) {
    officialIds = new Set<string>();
    try {
      const ids = require("../ids/officialGuildIds") as any;
      for (const v of Object.values(ids?.guilds || {})) if (v) officialIds.add(String(v));
    } catch {
      /* senza elenco: nessuna esclusione oltre all'italiano */
    }
    if (process.env.MAIN_GUILD_ID) officialIds.add(String(process.env.MAIN_GUILD_ID));
  }
  return officialIds.has(guildId);
}

function languageFor(target: any): string | null {
  const guild = target?.guild || target?.channel?.guild || target?.message?.guild || null;
  const guildId = String(target?.guildId || guild?.id || "");
  if (guildId) {
    if (isOfficial(guildId)) return null;
    let chosen: string | null = null;
    try {
      const { getTenantLanguageSync } = require("../../MultiGuild/core/tenantGuildSettings") as any;
      chosen = getTenantLanguageSync(guildId) || null;
    } catch {
      chosen = null;
    }
    if (!chosen) {
      try {
        const { mapDiscordLocaleToTenantLanguage } = require("../../Vinili/Partner/i18n/tenantPartnershipI18n/languages") as any;
        chosen = mapDiscordLocaleToTenantLanguage(guild?.preferredLocale) || null;
      } catch {
        chosen = null;
      }
    }
    return chosen && chosen !== "it" ? chosen : null;
  }
  /* messaggi privati: la lingua di Discord di chi ha usato il comando, se c'è */
  const locale = String(target?.locale || "").toLowerCase();
  if (!locale || locale.startsWith("it")) return null;
  try {
    const { mapDiscordLocaleToTenantLanguage } = require("../../Vinili/Partner/i18n/tenantPartnershipI18n/languages") as any;
    const l = mapDiscordLocaleToTenantLanguage(locale);
    return l && l !== "it" ? l : null;
  } catch {
    return null;
  }
}

/** Da chiamare una volta per processo, con il discord.js che usa il bot. */
export function installOutgoingTranslator(discord: any): void {
  const MP = discord?.MessagePayload;
  if (!MP?.prototype || MP.prototype.__vcTranslated) return;
  if (["0", "false", "off"].includes(String(process.env.BOT_TRANSLATE || "").toLowerCase())) return;
  const original = MP.prototype.resolveBody;
  MP.prototype.resolveBody = function patchedResolveBody(this: any, ...args: any[]) {
    if (!this.body) {
      try {
        const lang = languageFor(this.target);
        if (lang) this.options = translateBotPayload(lang, this.options);
      } catch {
        /* la traduzione non deve mai fermare un messaggio */
      }
    }
    return original.apply(this, args);
  };
  MP.prototype.__vcTranslated = true;
}
