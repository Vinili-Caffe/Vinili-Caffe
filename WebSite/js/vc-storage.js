/**
 * vcStorage2: safe LS/SS + RAM memo + TTL + multi-tab bus + pagehide flush
 * + quota pressure (evict cache TTL) + GC allowlist/prefix sweep.
 * Non proxy-a localStorage (rompe view-as / raw getItem in discord-auth).
 */
(function (global) {
  "use strict";
  var VER = "20261015vcStorage2";
  if (global.VcStorage && global.VcStorage.ver === VER) return;

  var BUS = "vc_storage_bus_v1";
  var GC_FLAG = "vc_storage_gc_v2";
  var TAB_ID = "t" + Math.random().toString(36).slice(2, 10);
  var memo = Object.create(null);
  var memOnly = Object.create(null);
  var pending = Object.create(null);
  var flushTimer = 0;
  var listeners = [];
  var bc = null;
  var flushCbs = [];

  var PROTECTED_KEYS = {
    vc_discord_access_token: 1,
    vc_discord_expires_at: 1,
    vc_discord_oauth_scopes_v1: 1,
    vc_view_as: 1,
    "vc-theme-pref": 1,
    vc_cookie_consent: 1,
    "vc-pwa-shell": 1,
    vc_discord_uid_v1: 1,
    vc_nav_feat_seen_v1: 1,
    vc_chrome_prefs_mirror_v1: 1,
    vc_pwa_view_state_v1: 1,
    vc_pwa_ui_pending_v1: 1,
    vc_server_identity_sticky_v1: 1,
  };

  var DEAD_KEYS = [
    "vc_discord_user",
    "vc-discord-uid",
    "vc_menu_staff_local_v0",
    "vc_inbox_summary_local_v0",
    "vc_profile_cache_v1",
    "vc_users_cache_v1",
    "vc:profilecache-local:v1:",
    "vc:profilecache-local:v2:",
  ];

  var EVICT_PREFIXES = [
    "vc:profilecache:",
    "vc:profilecache-local:",
    "vc:userscache:",
    "vc_inbox_summary",
    "vc_rank_customize",
    "vc_notif_toasted",
    "vc_staff_prof_cache",
    "vc:forbidden-books",
  ];

  try {
    if (typeof BroadcastChannel === "function") bc = new BroadcastChannel(BUS);
  } catch (eBc) {}

  function storeFor(scope) {
    if (scope === "ss") return global.sessionStorage;
    return global.localStorage;
  }

  function memoKey(scope, key) {
    return String(scope || "ls") + "::" + String(key || "");
  }

  function isProtected(key) {
    return !!PROTECTED_KEYS[String(key || "")];
  }

  function isEvictableKey(key) {
    var k = String(key || "");
    if (!k || isProtected(k)) return false;
    var i;
    for (i = 0; i < EVICT_PREFIXES.length; i += 1) {
      if (k.indexOf(EVICT_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function rawGet(store, key) {
    try {
      return store.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function rawRemove(store, key) {
    try {
      store.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  function parseExpiry(raw) {
    if (raw == null || raw === "") return 0;
    try {
      var o = JSON.parse(raw);
      if (!o || typeof o !== "object") return 0;
      if (Number(o.exp) > 0) return Number(o.exp);
      if (Number(o.expireAt) > 0) return Number(o.expireAt);
      if (Number(o.staleUntil) > 0) return Number(o.staleUntil);
    } catch (e) {}
    return 0;
  }

  function listStoreKeys(store) {
    var out = [];
    try {
      var n = store.length;
      var i;
      for (i = 0; i < n; i += 1) {
        var k = store.key(i);
        if (k) out.push(k);
      }
    } catch (e) {}
    return out;
  }

  function evictExpiredAndCaches(store, desperately) {
    var now = Date.now();
    var keys = listStoreKeys(store);
    var candidates = [];
    var i;
    for (i = 0; i < keys.length; i += 1) {
      var k = keys[i];
      if (isProtected(k)) continue;
      var raw = rawGet(store, k);
      var exp = parseExpiry(raw);
      var size = raw ? raw.length : 0;
      if (exp && exp <= now) {
        candidates.push({ key: k, score: 1e12 + size, expired: true });
      } else if (isEvictableKey(k)) {
        candidates.push({ key: k, score: size + (desperately ? 0 : exp ? Math.max(0, 1e9 - exp) : 0), expired: false });
      }
    }
    candidates.sort(function (a, b) {
      return b.score - a.score;
    });
    var removed = 0;
    var limit = desperately ? 24 : 12;
    for (i = 0; i < candidates.length && removed < limit; i += 1) {
      var c = candidates[i];
      if (!desperately && !c.expired && removed >= 6) break;
      if (rawRemove(store, c.key)) {
        removed += 1;
        memo[memoKey(store === global.sessionStorage ? "ss" : "ls", c.key)] = null;
      }
    }
    return removed;
  }

  function rawSet(store, key, value) {
    try {
      store.setItem(key, value);
      return true;
    } catch (e1) {
      try {
        evictExpiredAndCaches(store, false);
        store.setItem(key, value);
        return true;
      } catch (e2) {
        try {
          evictExpiredAndCaches(store, true);
          store.setItem(key, value);
          return true;
        } catch (e3) {
          return false;
        }
      }
    }
  }

  function readNow(scope, key) {
    var mk = memoKey(scope, key);
    if (Object.prototype.hasOwnProperty.call(pending, mk)) {
      return pending[mk].value;
    }
    if (Object.prototype.hasOwnProperty.call(memo, mk)) {
      return memo[mk];
    }
    if (Object.prototype.hasOwnProperty.call(memOnly, mk)) {
      return memOnly[mk];
    }
    var store = storeFor(scope);
    var v = rawGet(store, key);
    if (v == null && scope === "both") {
      v = rawGet(storeFor("ss"), key);
      if (v == null) v = rawGet(storeFor("ls"), key);
    }
    memo[mk] = v == null ? null : String(v);
    return memo[mk];
  }

  function notify(key, value, source, scope) {
    var i;
    for (i = 0; i < listeners.length; i += 1) {
      var L = listeners[i];
      if (!L) continue;
      try {
        if (L.prefix) {
          if (String(key).indexOf(L.prefix) !== 0) continue;
        } else if (L.key && L.key !== key) {
          continue;
        }
        L.cb({ key: key, value: value, source: source || "local", scope: scope || "ls", tabId: TAB_ID });
      } catch (eL) {}
    }
  }

  function busPost(msg) {
    if (!bc) return;
    try {
      bc.postMessage(msg);
    } catch (eP) {}
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = global.setTimeout(function () {
      flushTimer = 0;
      flushPending();
    }, 32);
  }

  function flushPending() {
    var keys = Object.keys(pending);
    if (!keys.length) return;
    var i;
    for (i = 0; i < keys.length; i += 1) {
      var mk = keys[i];
      var job = pending[mk];
      if (!job) continue;
      delete pending[mk];
      var ok = false;
      if (job.op === "remove") {
        ok = rawRemove(storeFor(job.scope), job.key);
        if (job.scope === "both") {
          rawRemove(storeFor("ls"), job.key);
          rawRemove(storeFor("ss"), job.key);
          ok = true;
        }
      } else {
        ok = rawSet(storeFor(job.scope === "both" ? "ls" : job.scope), job.key, job.value);
        if (job.scope === "both") {
          rawSet(storeFor("ss"), job.key, job.value);
        }
        if (!ok) {
          memOnly[mk] = job.value;
        } else {
          try {
            delete memOnly[mk];
          } catch (eDel) {}
        }
      }
      memo[mk] = job.op === "remove" ? null : job.value;
      if (job.broadcast) {
        busPost({
          type: "vc-storage",
          op: job.op,
          key: job.key,
          value: job.op === "remove" ? null : job.value,
          scope: job.scope,
          tabId: TAB_ID,
          at: Date.now(),
        });
      }
    }
    for (i = 0; i < flushCbs.length; i += 1) {
      try {
        flushCbs[i]();
      } catch (eF) {}
    }
  }

  function get(key, opts) {
    opts = opts || {};
    var scope = opts.scope || "ls";
    if (scope === "both") {
      var ss = readNow("ss", key);
      if (ss != null && ss !== "") return ss;
      return readNow("ls", key);
    }
    return readNow(scope, key);
  }

  function set(key, value, opts) {
    opts = opts || {};
    var scope = opts.scope || "ls";
    var broadcast = opts.broadcast !== false;
    var immediate = opts.immediate === true;
    var str = value == null ? "" : String(value);
    var scopes = scope === "both" ? ["ls", "ss"] : [scope];
    var si;
    for (si = 0; si < scopes.length; si += 1) {
      var sc = scopes[si];
      var mk = memoKey(sc, key);
      memo[mk] = str;
      pending[mk] = {
        op: "set",
        key: key,
        value: str,
        scope: sc,
        broadcast: broadcast && si === 0,
      };
    }
    if (scope === "both") {
      pending[memoKey("ls", key)].broadcast = broadcast;
      pending[memoKey("ss", key)].broadcast = false;
    }
    notify(key, str, "local", scope);
    if (immediate) flushPending();
    else scheduleFlush();
    return true;
  }

  function remove(key, opts) {
    opts = opts || {};
    var scope = opts.scope || "ls";
    var broadcast = opts.broadcast !== false;
    var immediate = opts.immediate === true;
    var scopes = scope === "both" ? ["ls", "ss"] : [scope];
    var si;
    for (si = 0; si < scopes.length; si += 1) {
      var sc = scopes[si];
      var mk = memoKey(sc, key);
      memo[mk] = null;
      try {
        delete memOnly[mk];
      } catch (eM) {}
      pending[mk] = {
        op: "remove",
        key: key,
        value: null,
        scope: sc,
        broadcast: broadcast && si === 0,
      };
    }
    notify(key, null, "local", scope);
    if (immediate) flushPending();
    else scheduleFlush();
    return true;
  }

  function getJSON(key, opts) {
    var raw = get(key, opts);
    if (raw == null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function setJSON(key, value, opts) {
    var raw = "";
    try {
      raw = JSON.stringify(value);
    } catch (e) {
      return false;
    }
    return set(key, raw, opts);
  }

  function setTTL(key, value, ttlMs, opts) {
    opts = opts || {};
    var exp = Date.now() + Math.max(0, Number(ttlMs) || 0);
    return setJSON(key, { v: value, exp: exp }, opts);
  }

  function getTTL(key, opts) {
    var obj = getJSON(key, opts);
    if (!obj || typeof obj !== "object") return null;
    var exp = Number(obj.exp || 0);
    if (exp && Date.now() >= exp) {
      remove(key, opts);
      return null;
    }
    return Object.prototype.hasOwnProperty.call(obj, "v") ? obj.v : null;
  }

  function subscribe(keyOrPrefix, cb) {
    if (typeof cb !== "function") return function () {};
    var entry = { cb: cb, key: null, prefix: null };
    if (typeof keyOrPrefix === "string" && keyOrPrefix.slice(-1) === "*") {
      entry.prefix = keyOrPrefix.slice(0, -1);
    } else if (typeof keyOrPrefix === "string") {
      entry.key = keyOrPrefix;
    }
    listeners.push(entry);
    return function unsubscribe() {
      var i = listeners.indexOf(entry);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  function broadcast(type, payload) {
    busPost({
      type: type || "vc-storage-signal",
      payload: payload || null,
      tabId: TAB_ID,
      at: Date.now(),
    });
  }

  function onFlushed(cb) {
    if (typeof cb === "function") flushCbs.push(cb);
  }

  function sweepExpiredPrefix(store, scopeLabel) {
    var now = Date.now();
    var keys = listStoreKeys(store);
    var removed = 0;
    var i;
    for (i = 0; i < keys.length; i += 1) {
      var k = keys[i];
      if (isProtected(k)) continue;
      if (!isEvictableKey(k) && k.indexOf("vc:") !== 0 && k.indexOf("vc_") !== 0) continue;
      var raw = rawGet(store, k);
      var exp = parseExpiry(raw);
      if (exp && exp <= now) {
        if (rawRemove(store, k)) {
          removed += 1;
          memo[memoKey(scopeLabel, k)] = null;
        }
      }
    }
    return removed;
  }

  function gcOnce(force) {
    try {
      if (!force && rawGet(global.sessionStorage, GC_FLAG) === "1") return false;
    } catch (eF) {}
    var i;
    for (i = 0; i < DEAD_KEYS.length; i += 1) {
      var k = DEAD_KEYS[i];
      /* exact + prefix-style dead stems ending with : */
      if (k.charAt(k.length - 1) === ":") {
        var storeLs = global.localStorage;
        var keys = listStoreKeys(storeLs);
        var ki;
        for (ki = 0; ki < keys.length; ki += 1) {
          if (String(keys[ki]).indexOf(k) === 0) rawRemove(storeLs, keys[ki]);
        }
      } else {
        rawRemove(global.localStorage, k);
        rawRemove(global.sessionStorage, k);
      }
      memo[memoKey("ls", k)] = null;
      memo[memoKey("ss", k)] = null;
    }
    sweepExpiredPrefix(global.localStorage, "ls");
    sweepExpiredPrefix(global.sessionStorage, "ss");
    try {
      rawSet(global.sessionStorage, GC_FLAG, "1");
    } catch (eS) {}
    return true;
  }

  function onBusMessage(ev) {
    var data = ev && ev.data;
    if (!data || typeof data !== "object") return;
    if (data.tabId && data.tabId === TAB_ID) return;
    if (data.type === "vc-storage") {
      var scope = data.scope || "ls";
      var mk = memoKey(scope, data.key);
      memo[mk] = data.op === "remove" ? null : data.value == null ? null : String(data.value);
      notify(data.key, memo[mk], "broadcast", scope);
      return;
    }
    notify(String(data.type || "signal"), data.payload == null ? null : String(data.payload), "broadcast", "ls");
  }

  function onStorageEvent(ev) {
    if (!ev || !ev.key) return;
    var mk = memoKey("ls", ev.key);
    memo[mk] = ev.newValue == null ? null : String(ev.newValue);
    try {
      delete pending[mk];
    } catch (eP) {}
    notify(ev.key, memo[mk], "storage", "ls");
  }

  function onPageHide() {
    flushPending();
  }

  function onVisibility() {
    try {
      if (document.visibilityState === "hidden") flushPending();
    } catch (eV) {}
  }

  try {
    if (bc) bc.addEventListener("message", onBusMessage);
  } catch (eBm) {}
  try {
    global.addEventListener("storage", onStorageEvent);
  } catch (eSt) {}
  try {
    global.addEventListener("pagehide", onPageHide);
  } catch (ePh) {}
  try {
    document.addEventListener("visibilitychange", onVisibility);
  } catch (eVi) {}

  try {
    gcOnce(false);
  } catch (eGc) {}

  var api = {
    ver: VER,
    tabId: TAB_ID,
    get: get,
    set: set,
    remove: remove,
    getJSON: getJSON,
    setJSON: setJSON,
    getTTL: getTTL,
    setTTL: setTTL,
    subscribe: subscribe,
    broadcast: broadcast,
    flushPending: flushPending,
    onFlushed: onFlushed,
    gcOnce: gcOnce,
    evictPressure: function (scope) {
      return evictExpiredAndCaches(storeFor(scope || "ls"), true);
    },
  };

  global.VcStorage = api;
  global.__VC_STORAGE = api;
})(typeof window !== "undefined" ? window : this);
