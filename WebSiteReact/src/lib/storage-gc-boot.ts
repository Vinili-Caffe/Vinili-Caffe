/**
 * Sweep localStorage/sessionStorage di chiavi morte (Hogwarts, cache legacy, v0…).
 * Gira al boot (inline) + da StorageGc dopo hydrate.
 */

export const STORAGE_GC_FLAG = "vc_storage_gc_v3";

/** Exact keys da cancellare. */
export const DEAD_KEYS_EXACT = [
  // Hogwarts / libri proibiti (evento finito)
  "vc:forbidden-books:gone",
  "vc:forbidden-books",
  // Legacy auth / menu / cache
  "vc_discord_user",
  "vc-discord-uid",
  "vc_menu_staff_local_v0",
  "vc_menu_staff_local_v1",
  "vc_menu_dash_local_v1",
  "vc_inbox_summary_local_v0",
  "vc_inbox_summary_local_v1",
  "vc_profile_cache_v1",
  "vc_users_cache_v1",
  "vc_staff_access_ok_v2_local",
  "vc_dash_access_ok_v1",
  "vc_discord_me_cache_local_v1",
  "vc_cookie_banner_ack_v3",
  // Hogwarts BGM / event leftovers come chiavi flat
  "vc_hogwarts_bgm",
  "vc_hogwarts_bgm_vol",
  "vc_hw_music",
] as const;

/** Prefissi: qualunque chiave che inizia così. */
export const DEAD_KEY_PREFIXES = [
  "vc:forbidden-books",
  "vc:hogwarts",
  "vc_hogwarts",
  "vc:profilecache:",
  "vc:profilecache-local:",
  "vc:userscache:",
  "vc:apicache:",
  "vc_inbox_summary",
  "vc_rank_customize",
  "vc_notif_toasted",
  "vc_staff_prof_cache",
  "vc.mobileNav.",
  "vc:evento",
  "vc_evento",
] as const;

export function scrubChromePrefsMirror(): boolean {
  try {
    const raw = localStorage.getItem("vc_chrome_prefs_mirror_v1");
    if (!raw) return false;
    const j = JSON.parse(raw) as Record<string, unknown>;
    if (!j || typeof j !== "object") return false;
    let changed = false;
    if ("hogwartsBgm" in j) {
      delete j.hogwartsBgm;
      changed = true;
    }
    if ("hogwartsEvent" in j) {
      delete j.hogwartsEvent;
      changed = true;
    }
    if (!changed) return false;
    localStorage.setItem("vc_chrome_prefs_mirror_v1", JSON.stringify(j));
    return true;
  } catch {
    return false;
  }
}

export function sweepDeadStorage(store: Storage): number {
  let removed = 0;
  const keys: string[] = [];
  try {
    for (let i = 0; i < store.length; i += 1) {
      const k = store.key(i);
      if (k) keys.push(k);
    }
  } catch {
    return 0;
  }

  for (const k of keys) {
    let dead = (DEAD_KEYS_EXACT as readonly string[]).includes(k);
    if (!dead) {
      for (const p of DEAD_KEY_PREFIXES) {
        if (k === p || k.startsWith(p)) {
          dead = true;
          break;
        }
      }
    }
    if (!dead) continue;
    try {
      store.removeItem(k);
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

export function runStorageGc(force = false): { ls: number; ss: number; chrome: boolean } {
  try {
    if (!force && typeof sessionStorage !== "undefined" && sessionStorage.getItem(STORAGE_GC_FLAG) === "1") {
      return { ls: 0, ss: 0, chrome: false };
    }
  } catch {
    /* ignore */
  }

  const ls = typeof localStorage !== "undefined" ? sweepDeadStorage(localStorage) : 0;
  const ss = typeof sessionStorage !== "undefined" ? sweepDeadStorage(sessionStorage) : 0;
  const chrome = scrubChromePrefsMirror();

  try {
    sessionStorage.setItem(STORAGE_GC_FLAG, "1");
  } catch {
    /* ignore */
  }

  return { ls, ss, chrome };
}

/** Inline boot: prima di React, stessa logica (minified-ish). */
export const STORAGE_GC_BOOT = `(function(){try{
if(window.__vcStorageGc)return;window.__vcStorageGc=1;
var FLAG=${JSON.stringify(STORAGE_GC_FLAG)};
try{if(sessionStorage.getItem(FLAG)==="1")return;}catch(e0){}
var EXACT=${JSON.stringify(DEAD_KEYS_EXACT)};
var PREFIX=${JSON.stringify(DEAD_KEY_PREFIXES)};
function dead(k){if(EXACT.indexOf(k)>=0)return true;for(var i=0;i<PREFIX.length;i++){var p=PREFIX[i];if(k===p||k.indexOf(p)===0)return true;}return false;}
function sweep(store){var n=0,keys=[],i,k;try{for(i=0;i<store.length;i++){k=store.key(i);if(k)keys.push(k);}}catch(e1){return 0;}for(i=0;i<keys.length;i++){k=keys[i];if(!dead(k))continue;try{store.removeItem(k);n++;}catch(e2){}}return n;}
try{sweep(localStorage);}catch(e3){}
try{sweep(sessionStorage);}catch(e4){}
try{var raw=localStorage.getItem("vc_chrome_prefs_mirror_v1");if(raw){var j=JSON.parse(raw);if(j&&typeof j==="object"&&("hogwartsBgm" in j||"hogwartsEvent" in j)){delete j.hogwartsBgm;delete j.hogwartsEvent;localStorage.setItem("vc_chrome_prefs_mirror_v1",JSON.stringify(j));}}}catch(e5){}
try{sessionStorage.setItem(FLAG,"1");}catch(e6){}
}catch(e){}})();`;
