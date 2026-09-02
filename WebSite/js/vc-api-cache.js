(function () {
  "use strict";
  
  var PREFIX = "vc:apicache:";
  var LOCAL_PREFIX = "vc:apicache:local:";
  var memory = Object.create(null);
  var inFlight = Object.create(null);
  var webhookBlockedUntil = 0;
  var DEFAULT_429_BLOCK_MS = 90000;
  var DEFAULT_429_BLOCK_MS_TOUCH = 35000;

  function isTouchDevice() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (Number(navigator.maxTouchPoints || 0) > 0) return true;
    } catch (eT) {}
    return false;
  }

  function webhook429BlockMs(retryAfterSec) {
    var sec = Number(retryAfterSec);
    if (Number.isFinite(sec) && sec > 0) return sec * 1000;
    return isTouchDevice() ? DEFAULT_429_BLOCK_MS_TOUCH : DEFAULT_429_BLOCK_MS;
  }

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
    var ver = opts.v != null ? String(opts.v) : opts.version != null ? String(opts.version) : "";
    if (ver) return scope + ":" + auth + ":" + ver + ":" + String(url || "");
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

  function isWebhookUrl(url) {
    try {
      var base =
        typeof location !== "undefined" && location.origin ? location.origin : "https://localhost";
      var u = new URL(String(url || ""), base);
      return String(u.pathname || "").indexOf("/webhooks/") === 0;
    } catch (e) {
      return false;
    }
  }

  function flightKey(url, init) {
    var method = String((init && init.method) || "GET").toUpperCase();
    var auth = "";
    try {
      var h = (init && init.headers) || {};
      auth = authSlice(String(h.Authorization || h.authorization || ""));
    } catch (eA) {}
    return method + " " + auth + " " + String(url || "");
  }

  function noteWebhook429(retryAfterSec) {
    var blockMs = webhook429BlockMs(retryAfterSec);
    webhookBlockedUntil = Math.max(webhookBlockedUntil, now() + blockMs);
    try {
      window.dispatchEvent(
        new CustomEvent("vc:webhook-rate-limited", { detail: { until: webhookBlockedUntil } }),
      );
    } catch (eEv) {}
  }

  function isWebhookBlocked() {
    return now() < webhookBlockedUntil;
  }

  function stalePayloadFromCache(key, ttlMs, staleMs, persistMs) {
    var hit = getFresh(key, ttlMs, staleMs, persistMs);
    return hit && hit.value ? hit.value : null;
  }

  function fetchJson(url, init, timeoutMs) {
    var ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) {
            var touch = false;
      try {
        touch =
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
          Number(navigator.maxTouchPoints || 0) > 0;
      } catch (eT) {}
      ms = touch ? 22000 : 15000;
    }
    var webhook = isWebhookUrl(url);
    var fk = flightKey(url, init);
    if (webhook && inFlight[fk]) return inFlight[fk];
    if (webhook && isWebhookBlocked()) {
      return Promise.resolve({
        ok: false,
        status: 429,
        body: { ok: false, error: "rate_limited_client" },
        blocked: true,
      });
    }
    var ctrl = new AbortController();
    var tid = window.setTimeout(function () {
      try {
        ctrl.abort();
      } catch (eA) {}
    }, ms);
    var headers = Object.assign({ Accept: "application/json" }, (init && init.headers) || {});
    try {
      if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
        headers = window.VcPerf.apiHeaders(headers, url);
      }
    } catch (eH) {}
    var req = fetch(url, Object.assign({}, init || {}, { headers: headers, signal: ctrl.signal }))
      .then(function (r) {
        if (webhook && r && r.status === 429) {
          var ra = 0;
          try {
            ra = Number(r.headers.get("Retry-After") || "0");
          } catch (eRa) {}
          noteWebhook429(ra);
        }
        return r.json().then(function (body) {
          return { ok: r.ok, status: r.status, body: body };
        });
      })
      .finally(function () {
        window.clearTimeout(tid);
        if (webhook) delete inFlight[fk];
      });
    if (webhook) inFlight[fk] = req;
    return req;
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
    var timeoutMs = opts.timeoutMs || 0;

    function network() {
      if (isWebhookUrl(url) && isWebhookBlocked()) {
        var blockedStale = stalePayloadFromCache(key, ttlMs, staleMs, persistMs);
        if (blockedStale) return Promise.resolve(blockedStale);
      }
      return fetchJson(url, init, timeoutMs)
        .then(function (payload) {
          if (payload && (payload.status === 429 || payload.blocked)) {
            var stale429 = stalePayloadFromCache(key, ttlMs, staleMs, persistMs);
            if (stale429) return stale429;
          }
          if (payload && payload.ok && payload.body && payload.body.ok === true) {
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
      if (isWebhookBlocked()) return;
      prefetch(key, url, opts);
    };
    var idleTimeout = isTouchDevice() ? 6500 : 3500;
    var fallbackMs = isTouchDevice() ? 3200 : 1200;
    try {
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: idleTimeout });
        return;
      }
    } catch (eI) {}
    window.setTimeout(run, fallbackMs);
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
    isWebhookBlocked: isWebhookBlocked,
    noteWebhook429: noteWebhook429,
    fetchJson: fetchJson,
  };
})();
