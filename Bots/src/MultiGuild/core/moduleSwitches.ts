/**
 * Moduli accendibili/spegnibili dalla dashboard (pagina "Moduli").
 * - "feature": gruppi di comandi già gestiti dal registro dei server (musica, TTS, moderazione…):
 *   spenti = i loro comandi non partono e spariscono dall'elenco dei comandi.
 * - "dash": moduli della dashboard (annunci, risposte, contatori, bump…): spenti = il bot non fa più niente per quel modulo.
 * - "boards": la bacheca, che ha già il suo interruttore nelle impostazioni.
 * Sui server protetti (principale) tutto resta acceso e non si cambia da qui.
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

/* i moduli si cambiano dal sito (altro processo): ogni minuto il bot rilegge il registro dei server */
let refreshTimer: ReturnType<typeof setInterval> | null = null;
function ensureRefreshLoop() {
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    try {
      const { refreshDynamicGuildRowsCache } = require("./tenantRegistryStore") as typeof import("./tenantRegistryStore");
      void refreshDynamicGuildRowsCache().catch(() => null);
    } catch (_) {}
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
  if (!gid || isProtected(gid)) return true;
  const def = MODULES.find((m) => m.id === id);
  if (!def) return true;
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
  const locked = isProtected(guildId);
  return MODULES.map((m) => ({ id: m.id, on: isModuleOn(guildId, m.id), locked }));
}

/** Accende/spegne un modulo. Ritorna false se non si può (server protetto, modulo sconosciuto, errore). */
async function setModuleOn(guildId?: string, id?: string, on?: boolean): Promise<boolean> {
  const gid = String(guildId || "");
  const def = MODULES.find((m) => m.id === id);
  if (!gid || !def || isProtected(gid)) return false;
  const next = on === true;

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

export = { MODULES, isModuleOn, listModules, setModuleOn };
