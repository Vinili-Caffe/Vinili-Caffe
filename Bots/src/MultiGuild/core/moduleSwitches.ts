/**
 * Moduli accendibili/spegnibili dalla dashboard (pagina "Moduli").
 * - "feature": gruppi di comandi già gestiti dal registro dei server (musica, TTS, moderazione…):
 *   spenti = i loro comandi non partono e spariscono dall'elenco dei comandi.
 * - "dash": moduli della dashboard (annunci, risposte, contatori, bump…): spenti = il bot non fa più niente per quel modulo.
 * - "boards": la bacheca, che ha già il suo interruttore nelle impostazioni.
 * Sui server protetti (principale) gli interruttori stanno in un salvataggio a parte ("moduleSwitches.v1"),
 * perché lì il registro dei server non vale: i blocchi sono nei comandi e negli automatismi classici.
 * I ticket del principale si gestiscono dal sito: lì restano bloccati.
 */
const { resolveGuildAccess } = require("./guildRegistry") as typeof import("./guildRegistry");
const { isViniliProtectedGuild } = require("./viniliProtectedGuilds") as typeof import("./viniliProtectedGuilds");

type ModuleKind = "feature" | "dash" | "boards";
type ModuleDef = { id: string; kind: ModuleKind; feature?: string };

const MODULES: ModuleDef[] = [
  { id: "bacheca", kind: "boards" },
  { id: "tickets", kind: "feature", feature: "ticket" },
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
  { id: "utility", kind: "feature", feature: "utility" },
  { id: "music", kind: "feature", feature: "music" },
  { id: "tts", kind: "feature", feature: "tts" },
  { id: "minigames", kind: "feature", feature: "minigames" },
];

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
  }, 60_000);
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

/** Il modulo è acceso su questo server? (default: acceso per i moduli della dashboard) */
function isModuleOn(guildId?: string, id?: string): boolean {
  const gid = String(guildId || "");
  if (!gid) return true;
  const def = MODULES.find((m) => m.id === id);
  if (!def) return true;
  if (isProtected(gid)) {
    if (PROTECTED_LOCKED.has(def.id)) return true;
    return protectedMap[gid]?.[def.id] !== false;
  }
  const f = featuresOf(gid);
  if (def.kind === "feature") return f[def.feature as string] === true;
  if (def.kind === "dash") return f[dashKey(def.id)] !== false;
  try {
    const { getTenantBoardsSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
    return getTenantBoardsSync(gid)?.enabled === true;
  } catch (_) {
    return true;
  }
}

function listModules(guildId?: string) {
  const prot = isProtected(guildId);
  return MODULES.map((m) => ({ id: m.id, on: isModuleOn(guildId, m.id), locked: prot && PROTECTED_LOCKED.has(m.id) }));
}

/** Accende/spegne un modulo. Ritorna false se non si può (server protetto, modulo sconosciuto, errore). */
async function setModuleOn(guildId?: string, id?: string, on?: boolean): Promise<boolean> {
  const gid = String(guildId || "");
  const def = MODULES.find((m) => m.id === id);
  if (!gid || !def) return false;
  const next = on === true;
  if (isProtected(gid)) {
    if (PROTECTED_LOCKED.has(def.id)) return false;
    try {
      const { getBotState, setBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");
      const raw: any = (await getBotState(PROTECTED_KEY, {})) || {};
      raw[gid] = { ...(raw[gid] || {}), [def.id]: next };
      await setBotState(PROTECTED_KEY, raw);
      protectedMap = raw;
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
  utility: "utility",
  bacheca: "bacheca",
  music: "music",
  tts: "tts",
  minigames: "minigames",
  moderation: "moderation",
  partnership: "partnership",
};
function moduleForCommand(name?: string): string | null {
  const n = String(name || "").trim().toLowerCase().replace(/^[+/!.]/, "");
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
    } catch (_) {}
  }
  if (commandModuleMap.has(n)) return commandModuleMap.get(n) as string;
  if (n === "giveaway" || n.startsWith("giveaway") || n === "gstart" || n === "gend" || n === "greroll") return "giveaway";
  if (n === "partnership") return "partnership";
  return null;
}

const MODULE_LABEL: Record<string, string> = {
  utility: "Utility",
  bacheca: "Bacheca",
  music: "Musica",
  tts: "TTS",
  minigames: "Minigiochi",
  moderation: "Moderazione",
  partnership: "Partnership",
  giveaway: "Giveaway",
};

/** Se il comando appartiene a un modulo spento: il messaggio da mostrare; altrimenti null. */
function blockedCommandMessage(guildId?: string, commandName?: string): string | null {
  const mod = moduleForCommand(commandName);
  if (!mod || isModuleOn(guildId, mod)) return null;
  return `Questo comando è disattivato: il modulo ${MODULE_LABEL[mod] || mod} è spento su questo server.`;
}

export = { MODULES, isModuleOn, listModules, setModuleOn, moduleForCommand, blockedCommandMessage };
