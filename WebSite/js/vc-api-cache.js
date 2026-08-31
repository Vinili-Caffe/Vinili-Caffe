(function () {
  "use strict";
  /* siteSnappyApi2 */

  var PREFIX = "vc:apicache:";
  var LOCAL_PREFIX = "vc:apicache:local:";
  var memory = Object.create(null);

  function now() {
    return Date.now();
  }

  function authSlice(token) {
    var t = String(token || "").trim();
    if (!t) return "anon";
    return t.slice(0, 10) + ":" + t.slice(-6);
  }

  function keyFor(url, opts) {
    opts = opts || {};
    var scope = String(opts.scope || opts.cacheScope || "pub");
    var auth = opts.auth != null ? authSlice(opts.auth) : "anon";
    return scope + ":" + auth + ":" + String(url || "");
  }

  function readSession(key) {
    try {
      var raw = sessionStorage.getItem(PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function readLocal(key) {
    try {
      var raw = localStorage.getItem(LOCAL_PREFIX + key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e2) {
      return null;
    }
  }

  function writeSession(key, entry) {
    try {
      sessionStorage.setItem(PREFIX + key, JSON.stringify(entry));
    } catch (e) {}
  }

  function writeLocal(key, entry) {
    try {
      localStorage.setItem(LOCAL_PREFIX + key, JSON.stringify(entry));
    } catch (e2) {}
  }

  function fetchJson(url, init, timeoutMs) {
    var ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) ms = 12000;
    var ctrl = new AbortController();
    var tid = window.setTimeout(function () {
      try {
        ctrl.abort();
      } catch (eA) {}
    }, ms);
    var headers = Object.assign({ Accept: "application/json" }, (init && init.headers) || {});
    try {
      if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
        headers = window.VcPerf.apiHeaders(headers);
      }
    } catch (eH) {}
    return fetch(url, Object.assign({}, init || {}, { headers: headers, signal: ctrl.signal }))
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
      })
      .finally(function () {
        window.clearTimeout(tid);
      });
  }

  function getFresh(key, ttlMs, staleMs, persistMs) {
    var t = now();
    var mem = memory[key];
    if (mem && mem.expireAt > t) return { value: mem.value, stale: false };

    var sess = readSession(key);
    if (sess && sess.savedAt) {
      var age = t - Number(sess.savedAt);
      if (age <= ttlMs) {
        memory[key] = { expireAt: t + ttlMs, value: sess.value };
        return { value: sess.value, stale: false };
      }
      if (staleMs > 0 && age <= staleMs && sess.value) {
        return { value: sess.value, stale: true };
      }
    }

    if (persistMs > 0) {
      var loc = readLocal(key);
      if (loc && loc.savedAt && loc.value) {
        var ageL = t - Number(loc.savedAt);
        if (ageL <= persistMs) return { value: loc.value, stale: true };
      }
    }
    return null;
  }

  function store(key, value, ttlMs, persistMs) {
    var t = now();
    var entry = { savedAt: t, value: value };
    memory[key] = { expireAt: t + ttlMs, value: value };
    writeSession(key, entry);
    if (persistMs > 0) writeLocal(key, entry);
  }

  function fetchWithCache(key, url, opts) {
    opts = opts || {};
    var ttlMs = Math.max(1000, Number(opts.ttlMs) || 60000);
    var staleMs = Math.max(ttlMs, Number(opts.staleMs) || ttlMs * 10);
    var persistMs = Math.max(0, Number(opts.persistMs) || 0);
    var useCache = opts.useCache !== false;
    var onStale = typeof opts.onStale === "function" ? opts.onStale : null;
    var init = opts.fetchInit || { credentials: "omit", cache: "no-store" };
    var timeoutMs = opts.timeoutMs || 12000;

    function network() {
      return fetchJson(url, init, timeoutMs)
        .then(function (payload) {
          if (payload && payload.ok && payload.body && payload.body.ok !== false) {
            store(key, payload, ttlMs, persistMs);
          }
          return payload;
        })
        .catch(function (err) {
          var hit = getFresh(key, ttlMs, staleMs, persistMs);
          if (hit && hit.value) return hit.value;
          throw err;
        });
    }

    if (!useCache) return network();

    var hit = getFresh(key, ttlMs, staleMs, persistMs);
    if (hit && !hit.stale) return Promise.resolve(hit.value);
    if (hit && hit.stale) {
      if (onStale) {
        try {
          onStale(hit.value);
        } catch (eOs) {}
      }
      network().catch(function () {});
      return Promise.resolve(hit.value);
    }
    return network();
  }

  function prefetch(key, url, opts) {
    opts = Object.assign({ useCache: true }, opts || {});
    var ttlMs = opts.ttlMs || 60000;
    var staleMs = opts.staleMs || ttlMs * 10;
    var persistMs = opts.persistMs || 0;
    if (getFresh(key, ttlMs, staleMs, persistMs)) return Promise.resolve(null);
    return fetchWithCache(key, url, opts).catch(function () {
      return null;
    });
  }

  function prefetchIdle(key, url, opts) {
    var run = function () {
      prefetch(key, url, opts);
    };
    try {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 3500 });
        return;
      }
    } catch (eI) {}
    window.setTimeout(run, 1200);
  }

  function invalidate(key) {
    delete memory[key];
    try {
      sessionStorage.removeItem(PREFIX + key);
      localStorage.removeItem(LOCAL_PREFIX + key);
    } catch (e) {}
  }

  function invalidatePrefix(prefix) {
    var p = String(prefix || "");
    if (!p) return;
    Object.keys(memory).forEach(function (k) {
      if (k.indexOf(p) === 0) delete memory[k];
    });
    try {
      var keys = [];
      for (var i = 0; i < sessionStorage.length; i += 1) {
        var sk = sessionStorage.key(i);
        if (sk && sk.indexOf(PREFIX + p) === 0) keys.push(sk);
      }
      keys.forEach(function (k) {
        sessionStorage.removeItem(k);
      });
    } catch (eS) {}
    try {
      var lkeys = [];
      for (var j = 0; j < localStorage.length; j += 1) {
        var lk = localStorage.key(j);
        if (lk && lk.indexOf(LOCAL_PREFIX + p) === 0) lkeys.push(lk);
      }
      lkeys.forEach(function (k) {
        localStorage.removeItem(k);
      });
    } catch (eL) {}
  }

  function bearerFromHeaders(headers) {
    var h = headers || {};
    var raw = String(h.Authorization || h.authorization || "").trim();
    return raw.replace(/^Bearer\s+/i, "");
  }

  function toStaffPayload(payload) {
    if (!payload) return { res: { ok: false, status: 0 }, data: { ok: false } };
    return {
      res: { ok: Boolean(payload.ok), status: Number(payload.status) || 0 },
      data: payload.body && typeof payload.body === "object" ? payload.body : {},
    };
  }

  function fetchStaffJson(url, opts) {
    opts = opts || {};
    var token = bearerFromHeaders(opts.headers);
    var cacheKey = keyFor(url, { scope: opts.cacheScope || "staff", auth: token });
    return fetchWithCache(cacheKey, url, {
      ttlMs: opts.ttlMs || 45000,
      staleMs: opts.staleMs || 360000,
      persistMs: opts.persistMs || 0,
      timeoutMs: opts.timeoutMs,
      useCache: opts.cache !== false,
      fetchInit: {
        method: "GET",
        headers: opts.headers,
        credentials: "omit",
        cache: "no-store",
      },
      onStale: opts.onStale
        ? function (v) {
            opts.onStale(toStaffPayload(v));
          }
        : null,
    }).then(toStaffPayload);
  }

  function fetchHttpOk(url, opts) {
    opts = opts || {};
    var cacheKey = keyFor(url, { scope: opts.scope || "api", auth: opts.auth || "" });
    return fetchWithCache(cacheKey, url, opts).then(function (payload) {
      return {
        httpOk: Boolean(payload && payload.ok && payload.body && payload.body.ok === true),
        body: payload && payload.body ? payload.body : null,
        status: payload && payload.status ? payload.status : 0,
      };
    });
  }

  window.VcApiCache = {
    keyFor: keyFor,
    fetchWithCache: fetchWithCache,
    fetchStaffJson: fetchStaffJson,
    fetchHttpOk: fetchHttpOk,
    prefetch: prefetch,
    prefetchIdle: prefetchIdle,
    invalidate: invalidate,
    invalidatePrefix: invalidatePrefix,
  };
})();
