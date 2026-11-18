/**
 * Moduli accendibili/spegnibili dalla dashboard (pagina "Moduli").
 * - "feature": gruppi di comandi del registro (moderazione, partnership, giveaway…):
 *   spenti = i loro comandi non partono. Utility/minigiochi/musica/TTS si regolano solo da Comandi.
 * - "dash": moduli della dashboard (annunci, risposte, contatori, bump…): spenti = il bot non fa più niente per quel modulo.
 * - "boards": la bacheca, che ha già il suo interruttore nelle impostazioni.
 * Sui server protetti (principale) gli interruttori stanno in un salvataggio a parte ("moduleSwitches.v1"),
 * perché lì il registro dei server non vale: i blocchi sono nei comandi e negli automatismi classici.
 * I ticket del principale si gestiscono dal sito: lì restano bloccati.
 */
const { resolveGuildAccess } = require("./guildRegistry") as typeof import("./guildRegistry");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

type ModuleKind = "feature" | "dash" | "boards";
/* mainOnly: per ora esiste solo sul server principale (sugli altri non si vede e non si accende) */
/* defaultOn: se manca il salvataggio; feature di solito false, dash true — livelli opt-in */
type ModuleDef = { id: string; kind: ModuleKind; feature?: string; mainOnly?: boolean; defaultOn?: boolean };

const MODULES: ModuleDef[] = [
  { id: "bacheca", kind: "boards" },
  /* tenant: off di default (registry.defaults.features.ticket = false); principale bloccato (sito) */
  { id: "tickets", kind: "feature", feature: "ticket", defaultOn: false },
  { id: "moderation", kind: "feature", feature: "moderation" },
  { id: "partnership", kind: "feature", feature: "partnership" },
  { id: "messaggi", kind: "dash" },
  { id: "comandipers", kind: "dash" },
  { id: "ruoli", kind: "dash" },
  { id: "benvenuto", kind: "dash" },
  { id: "risposte", kind: "dash" },
  { id: "contatori", kind: "dash" },
  { id: "bump", kind: "dash" },
  { id: "voti", kind: "dash" },
  { id: "giveaway", kind: "feature", feature: "giveaway" },
  { id: "sondaggi", kind: "dash" },
  { id: "live", kind: "dash" },
  { id: "compleanni", kind: "dash" },
  /* EXP: opt-in (default off) su tutti i server; sul principale senza salvataggio resta acceso */
  { id: "livelli", kind: "dash", defaultOn: false },
  /* snapshot Discord (+backup): opt-in sui tenant; sul principale resta acceso senza salvataggio */
  { id: "backup", kind: "dash", defaultOn: false },
  /* Musica + TTS (impostazioni dashboard); i singoli comandi restano in Comandi */
  { id: "vocale", kind: "dash", defaultOn: true },
  /* utility / minigiochi: niente scheda Moduli — solo tab Comandi */
];

function moduleDefaultOn(def: ModuleDef, protectedGuild: boolean): boolean {
  if (typeof def.defaultOn === "boolean") {
    /* sul principale i livelli c'erano già: senza salvataggio restano accesi */
    if (def.id === "livelli" && protectedGuild) return true;
    if (def.id === "backup" && protectedGuild) return true;
    if (def.id === "vocale" && protectedGuild) return true;
    return def.defaultOn;
  }
  if (def.kind === "feature") return false;
  return true;
}

const dashKey = (id: string) => `mod_${id}`;

/* principale (e altri server protetti): interruttori salvati qui, default acceso */
const PROTECTED_KEY = "moduleSwitches.v1";
const PROTECTED_LOCKED = new Set(["tickets"]);
let protectedMap: Record<string, Record<string, boolean>> = {};
async function loadProtectedMap() {
  try {
    const { getBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");
    const raw: any = await getBotState(PROTECTED_KEY, {});
    protectedMap = raw && typeof raw === "object" ? raw : {};
  } catch (_) {}
}
void loadProtectedMap();

/* i moduli si cambiano dal sito (altro processo): ogni minuto il bot rilegge il registro dei server */
let refreshTimer: ReturnType<typeof setInterval> | null = null;
function ensureRefreshLoop() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    try {
      const { refreshDynamicGuildRowsCache } = require("./tenantRegistryStore") as typeof import("./tenantRegistryStore");
      void refreshDynamicGuildRowsCache().catch(() => null);
    } catch (_) {}
    void loadProtectedMap();
  }, 15_000);
  (refreshTimer as any)?.unref?.();
}
ensureRefreshLoop();

function featuresOf(guildId?: string): Record<string, any> {
  try {
    const access: any = resolveGuildAccess(String(guildId || ""));
    return access?.entry?.features && typeof access.entry.features === "object" ? access.entry.features : {};
  } catch (_) {
    return {};
  }
}

function isProtected(guildId?: string) {
  try {
    return isViniliProtectedGuild(String(guildId || ""));
  } catch (_) {
    return false;
  }
}

/** Il modulo è acceso su questo server? */
function isModuleOn(guildId?: string, id?: string): boolean {
  const gid = String(guildId || "");
  if (!gid) return true;
  const def = MODULES.find((m) => m.id === id);
  if (!def) return true;
  const prot = isProtected(gid);
  const fallback = moduleDefaultOn(def, prot);
  if (prot) {
    if (PROTECTED_LOCKED.has(def.id)) return true;
    const v = protectedMap[gid]?.[def.id];
    if (typeof v === "boolean") return v;
    return fallback;
  }
  const f = featuresOf(gid);
  if (def.kind === "feature") {
    const v = f[def.feature as string];
    if (typeof v === "boolean") return v;
    return fallback;
  }
  if (def.kind === "dash") {
    const v = f[dashKey(def.id)];
    if (typeof v === "boolean") return v;
    return fallback;
  }
  try {
    const { getTenantBoardsSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
    return getTenantBoardsSync(gid)?.enabled === true;
  } catch (_) {
    return true;
  }
}

function listModules(guildId?: string) {
  const prot = isProtected(guildId);
  return MODULES.filter((m) => prot || !m.mainOnly).map((m) => ({ id: m.id, on: isModuleOn(guildId, m.id), locked: prot && PROTECTED_LOCKED.has(m.id) }));
}

/** Il modulo esiste su questo server? (quelli solo del principale no) */
function moduleExists(guildId?: string, id?: string) {
  const def = MODULES.find((m) => m.id === id);
  return Boolean(def) && (!def!.mainOnly || isProtected(guildId));
}

/** Accende/spegne un modulo. Ritorna false se non si può (server protetto, modulo sconosciuto, errore). */
async function setModuleOn(guildId?: string, id?: string, on?: boolean): Promise<boolean> {
  const gid = String(guildId || "");
  const def = MODULES.find((m) => m.id === id);
  if (!gid || !def || !moduleExists(gid, def.id)) return false;
  const next = on === true;
  if (isProtected(gid)) {
    if (PROTECTED_LOCKED.has(def.id)) return false;
    try {
      const { getBotState, setBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");
      const raw: any = (await getBotState(PROTECTED_KEY, {})) || {};
      raw[gid] = { ...(raw[gid] || {}), [def.id]: next };
      await setBotState(PROTECTED_KEY, raw);
      protectedMap = raw;
      /* bacheca: allinea anche boards.enabled (usato dalla tab Bacheca / comandi) */
      if (def.kind === "boards") {
        const { setTenantBoards } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
        await (setTenantBoards as any)(gid, { enabled: next }).catch(() => null);
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  if (def.id === "tickets") {
    /* i ticket hanno il loro interruttore: lo stesso salvataggio aggiorna anche il registro */
    const { saveTicketSettings } = require("../tickets/tenant/tenantTicketSettings") as typeof import("../tickets/tenant/tenantTicketSettings");
    const out: any = await saveTicketSettings(gid, { enabled: next });
    return out?.ok === true;
  }
  if (def.kind === "boards") {
    const { setTenantBoards } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
    const out: any = await (setTenantBoards as any)(gid, { enabled: next });
    return out?.ok !== false;
  }
  const { setTenantGuildFeature } = require("./tenantRegistryStore") as typeof import("./tenantRegistryStore");
  return setTenantGuildFeature(gid, def.kind === "feature" ? (def.feature as string) : dashKey(def.id), next);
}

/* comando → modulo (per bloccare i comandi dei moduli spenti, principale compreso) */
let commandModuleMap: Map<string, string> | null = null;
const CATEGORY_TO_MODULE: Record<string, string> = {
  bacheca: "bacheca",
  moderation: "moderation",
  partnership: "partnership",
  ticket: "tickets",
};
function normalizeCommandModuleKey(name?: string): string {
  let n = String(name || "").trim().toLowerCase();
  /* chiavi ACL slash dashboard: s:1:partnership / s:3:partner messaggio */
  const slash = /^s:[123]:(.+)$/i.exec(n);
  if (slash) n = String(slash[1] || "").trim();
  return n.replace(/^[+/!.]/, "");
}

function moduleForCommand(name?: string): string | null {
  const n = normalizeCommandModuleKey(name);
  if (!n) return null;
  if (!commandModuleMap) {
    commandModuleMap = new Map();
    try {
      const acl: any = require("./tenantCommandAcl");
      const seed = typeof acl.categoryCommandsSeed === "function" ? acl.categoryCommandsSeed() : {};
      for (const [cat, list] of Object.entries(seed || {})) {
        const mod = CATEGORY_TO_MODULE[cat];
        if (!mod) continue;
        for (const c of (list as any[]) || []) commandModuleMap.set(String(c).toLowerCase(), mod);
      }
      /* slash/menu tenant (es. /partnership, Partner messaggio) */
      if (typeof acl.listTenantSlashCatalogItems === "function") {
        for (const item of acl.listTenantSlashCatalogItems("") || []) {
          const mod = CATEGORY_TO_MODULE[String(item?.category || "").toLowerCase()] || null;
          if (!mod) continue;
          const rawName = String(item?.name || "").trim();
          const discordName = String(item?.discordName || item?.displayName || "").trim();
          if (rawName) commandModuleMap.set(normalizeCommandModuleKey(rawName), mod);
          if (discordName) commandModuleMap.set(normalizeCommandModuleKey(discordName), mod);
        }
      }
    } catch (_) {}
  }
  if (commandModuleMap.has(n)) return commandModuleMap.get(n) as string;
  if (n === "giveaway" || n.startsWith("giveaway") || n === "gstart" || n === "gend" || n === "greroll") return "giveaway";
  if (n === "partnership" || n === "partner messaggio" || n.startsWith("partner ")) return "partnership";
  return null;
}

const MODULE_LABEL: Record<string, string> = {
  bacheca: "Bacheca",
  moderation: "Moderazione",
  partnership: "Partnership",
  tickets: "Ticket",
  giveaway: "Giveaway",
  backup: "Backup",
};

/** Messaggio unico se si prova un comando spento / modulo non pronto / ACL off. */
const DISABLED_COMMAND_MESSAGE = "Questo comando è disattivato su questo server.";

function boardsHasDestination(boards?) {
  if (!boards || typeof boards !== "object") return false;
  return Boolean(
    boards.sharedChannelId ||
      boards.quoteChannelId ||
      boards.repostChannelId ||
      boards.clipChannelId ||
      boards.skullChannelId,
  );
}

/**
 * Il modulo ha le impostazioni minime per funzionare?
 * Acceso ma senza setup → i comandi restano disattivati finché non si completa.
 */
function isModuleConfigured(guildId?: string, id?: string): boolean {
  const gid = String(guildId || "");
  const mid = String(id || "");
  if (!gid || !mid) return true;
  if (isProtected(gid)) return true;
  try {
    if (mid === "tickets") {
      const { getTicketSettingsSync } = require("../tickets/tenant/tenantTicketSettings") as typeof import("../tickets/tenant/tenantTicketSettings");
      const { getGuildPanelsSync } = require("../tickets/tenant/tenantTicketPanels") as typeof import("../tickets/tenant/tenantTicketPanels");
      const t: any = getTicketSettingsSync(gid) || {};
      if (t.enabled !== true) return false;
      if (!String(t.overflowCategoryId || "").trim()) return false;
      const panels: any = getGuildPanelsSync(gid) || {};
      const singles = Array.isArray(panels.singles) ? panels.singles : [];
      return singles.some((p?) => String(p?.channelId || "").trim());
    }
    if (mid === "bacheca") {
      const { getTenantBoardsSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
      const b = getTenantBoardsSync(gid);
      return b?.enabled === true && boardsHasDestination(b);
    }
    if (mid === "partnership") {
      const { getPartnershipConfigSync } = require("../../Vinili/Partner/core/tenantPartnershipSettings") as typeof import("../../Vinili/Partner/core/tenantPartnershipSettings");
      const c: any = getPartnershipConfigSync(gid) || {};
      if (c.setupCompleted === true || c.legacy === true) return true;
      return Boolean(c.partnershipsChannelId && c.partnerManagerRoleId);
    }
  } catch (_) {
    return false;
  }
  /* moderazione / giveaway / livelli / dash: basta l'interruttore */
  return true;
}

/** Acceso in Moduli e pronto (setup minimo fatto). */
function isModuleEffectivelyOn(guildId?: string, id?: string): boolean {
  return isModuleOn(guildId, id) && isModuleConfigured(guildId, id);
}

/** Se il comando appartiene a un modulo spento o non configurato: il messaggio unico; altrimenti null. */
function blockedCommandMessage(guildId?: string, commandName?: string): string | null {
  const mod = moduleForCommand(commandName);
  if (!mod || isModuleEffectivelyOn(guildId, mod)) return null;
  return DISABLED_COMMAND_MESSAGE;
}

export = {
  MODULES,
  isModuleOn,
  isModuleConfigured,
  isModuleEffectivelyOn,
  listModules,
  setModuleOn,
  moduleExists,
  moduleForCommand,
  blockedCommandMessage,
  DISABLED_COMMAND_MESSAGE,
};
