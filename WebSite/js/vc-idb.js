/**
 * pushIdb1: IndexedDB kv per cache grosse (profili/classifiche).
 * Sync mirror in RAM; LS resta solo per boot/flag piccoli.
 */
(function (global) {
  "use strict";
  var VER = "20261015pushIdb1";
  if (global.VcIdb && global.VcIdb.ver === VER) return;

  var DB_NAME = "vc_idb_v1";
  var STORE = "kv";
  var DB_VER = 1;
  var mem = Object.create(null);
  var dbPromise = null;
  var migrateOnce = false;

  function nowMs() {
    return Date.now();
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      try {
        if (!global.indexedDB) {
          reject(new Error("no-idb"));
          return;
        }
        var req = global.indexedDB.open(DB_NAME, DB_VER);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) {
            db.createObjectStore(STORE, { keyPath: "k" });
          }
        };
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error || new Error("idb-open"));
        };
      } catch (e) {
        reject(e);
      }
    }).catch(function (err) {
      dbPromise = null;
      throw err;
    });
    return dbPromise;
  }

  function rowOk(row) {
    if (!row || typeof row !== "object") return false;
    var exp = Number(row.exp || 0);
    if (exp && nowMs() >= exp) return false;
    return Object.prototype.hasOwnProperty.call(row, "v");
  }

  function getSync(key) {
    var k = String(key || "");
    if (!k) return null;
    var hit = mem[k];
    if (!rowOk(hit)) {
      if (hit) {
        try {
          delete mem[k];
        } catch (e) {}
      }
      return null;
    }
    return hit.v;
  }

  function get(key) {
    var k = String(key || "");
    if (!k) return Promise.resolve(null);
    var sync = getSync(k);
    if (sync != null) return Promise.resolve(sync);
    return openDb()
      .then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, "readonly");
          var req = tx.objectStore(STORE).get(k);
          req.onsuccess = function () {
            resolve(req.result || null);
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      })
      .then(function (row) {
        if (!rowOk(row)) {
          if (row) remove(k);
          return null;
        }
        mem[k] = row;
        return row.v;
      })
      .catch(function () {
        return null;
      });
  }

  function set(key, value, ttlMs) {
    var k = String(key || "");
    if (!k) return Promise.resolve(false);
    var ttl = Math.max(0, Number(ttlMs) || 0);
    var row = {
      k: k,
      v: value,
      exp: ttl ? nowMs() + ttl : 0,
      at: nowMs(),
    };
    mem[k] = row;
    return openDb()
      .then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put(row);
          tx.oncomplete = function () {
            resolve(true);
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      })
      .catch(function () {
        return false;
      });
  }

  function remove(key) {
    var k = String(key || "");
    if (!k) return Promise.resolve(false);
    try {
      delete mem[k];
    } catch (e) {}
    return openDb()
      .then(function (db) {
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete(k);
          tx.oncomplete = function () {
            resolve(true);
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      })
      .catch(function () {
        return false;
      });
  }

  function warm(prefix, limit) {
    var p = String(prefix || "");
    var max = Math.max(1, Number(limit) || 40);
    return openDb()
      .then(function (db) {
        return new Promise(function (resolve) {
          var out = [];
          var tx = db.transaction(STORE, "readonly");
          var store = tx.objectStore(STORE);
          var req = store.openCursor();
          req.onsuccess = function () {
            var cursor = req.result;
            if (!cursor || out.length >= max) {
              resolve(out);
              return;
            }
            var row = cursor.value;
            var k = String((row && row.k) || "");
            if ((!p || k.indexOf(p) === 0) && rowOk(row)) {
              mem[k] = row;
              out.push(k);
            } else if (row && Number(row.exp || 0) && nowMs() >= Number(row.exp)) {
              remove(k);
            }
            cursor.continue();
          };
          req.onerror = function () {
            resolve(out);
          };
        });
      })
      .catch(function () {
        return [];
      });
  }

  function migrateFromLocalStorage() {
    if (migrateOnce) return Promise.resolve(0);
    migrateOnce = true;
    var moved = 0;
    var prefixes = ["vc:profilecache-local:", "vc:userscache:", "vc:profilecache:"];
    try {
      var ls = global.localStorage;
      var keys = [];
      var i;
      for (i = 0; i < ls.length; i += 1) {
        var k = ls.key(i);
        if (!k) continue;
        var ok = false;
        var pi;
        for (pi = 0; pi < prefixes.length; pi += 1) {
          if (k.indexOf(prefixes[pi]) === 0) {
            ok = true;
            break;
          }
        }
        if (ok) keys.push(k);
      }
      var chain = Promise.resolve();
      keys.forEach(function (k) {
        chain = chain.then(function () {
          var raw = null;
          try {
            raw = ls.getItem(k);
          } catch (eG) {
            return null;
          }
          if (!raw || raw.length < 800) return null;
          var exp = 0;
          var value = raw;
          try {
            var parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object") {
              if (Number(parsed.expireAt) > 0) exp = Number(parsed.expireAt);
              if (Object.prototype.hasOwnProperty.call(parsed, "value")) value = parsed.value;
              else if (Object.prototype.hasOwnProperty.call(parsed, "v")) value = parsed.v;
            }
          } catch (eP) {}
          var ttl = exp ? Math.max(0, exp - nowMs()) : 7 * 24 * 60 * 60 * 1000;
          if (ttl <= 0) {
            try {
              ls.removeItem(k);
            } catch (eR) {}
            return null;
          }
          return set(k, value, ttl).then(function (okSet) {
            if (okSet) {
              moved += 1;
              try {
                ls.removeItem(k);
              } catch (eRm) {}
              try {
                if (global.VcStorage && typeof global.VcStorage.remove === "function") {
                  global.VcStorage.remove(k, { scope: "ls", immediate: true, broadcast: false });
                }
              } catch (eVs) {}
            }
            return null;
          });
        });
      });
      return chain.then(function () {
        return moved;
      });
    } catch (e) {
      return Promise.resolve(0);
    }
  }

  try {
    global.setTimeout(function () {
      migrateFromLocalStorage().catch(function () {});
      warm("vc:profilecache-local:", 30).catch(function () {});
      warm("vc:userscache:", 20).catch(function () {});
    }, 80);
  } catch (eBoot) {}

  global.VcIdb = {
    ver: VER,
    get: get,
    getSync: getSync,
    set: set,
    remove: remove,
    warm: warm,
    migrateFromLocalStorage: migrateFromLocalStorage,
  };
  global.__VC_IDB = global.VcIdb;
})(typeof window !== "undefined" ? window : this);
