(function () {
  "use strict";
  
  var PREFIX = "vc:apicache:";
  var LOCAL_PREFIX = "vc:apicache:local:";
  var memory = Object.create(null);
  var inFlight = Object.create(null);
  /* phoneApiBlockFix1: per-endpoint cool-down (was global — one 429 froze the whole phone site) */
  var webhookBlockedUntilByKey = Object.create(null);
  var DEFAULT_429_BLOCK_MS = 25000;
  var DEFAULT_429_BLOCK_MS_TOUCH = 12000;

  function isTouchDevice() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (Number(navigator.maxTouchPoints || 0) > 0) return true;
    } catch (eT) {}
    return false;
  }

  function webhook429BlockMs(retryAfterSec) {
    var sec = Number(retryAfterSec);
    if (Number.isFinite(sec) && sec > 0) return Math.min(60000, sec * 1000);
    return isTouchDevice() ? DEFAULT_429_BLOCK_MS_TOUCH : DEFAULT_429_BLOCK_MS;
  }

  function now() {
    return Date.now();
  }

  function normalizeWebhookBlockKey(url) {
    try {
      var base =
        typeof location !== "undefined" && location.origin ? location.origin : "https://localhost";
      var path = String(new URL(String(url || ""), base).pathname || "");
      if (path.indexOf("/webhooks/") !== 0) return "";
      var parts = path.split("/").filter(Boolean);
      // webhooks / site-xxx / ... → /webhooks/site-xxx
      if (parts.length >= 2) return "/" + parts[0] + "/" + parts[1];
      return path;
    } catch (e) {
      return "";
    }
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

  function noteWebhook429(retryAfterSec, url) {
    var blockMs = webhook429BlockMs(retryAfterSec);
    var key = normalizeWebhookBlockKey(url);
    /* No URL → do NOT freeze every webhook (legacy callers used to kill the phone UI). */
    if (!key) return;
    webhookBlockedUntilByKey[key] = Math.max(Number(webhookBlockedUntilByKey[key]) || 0, now() + blockMs);
    try {
      window.dispatchEvent(
        new CustomEvent("vc:webhook-rate-limited", {
          detail: { until: webhookBlockedUntilByKey[key], key: key, url: String(url || "") },
        }),
      );
    } catch (eEv) {}
  }

  /* phoneApiReloadFix1: never client-block public/site APIs after first paint/reload */
  function isCriticalSiteWebhook(url) {
    try {
      var base =
        typeof location !== "undefined" && location.origin ? location.origin : "https://localhost";
      var path = String(new URL(String(url || ""), base).pathname || "");
      if (path.indexOf("/webhooks/") !== 0) return false;
      return (
        path.indexOf("/webhooks/site-") === 0 ||
        path.indexOf("/webhooks/health") === 0 ||
        path.indexOf("/webhooks/site-api/health") === 0
      );
    } catch (e) {
      return false;
    }
  }

  function clearWebhookBlocks() {
    for (var k in webhookBlockedUntilByKey) {
      if (Object.prototype.hasOwnProperty.call(webhookBlockedUntilByKey, k)) {
        delete webhookBlockedUntilByKey[k];
      }
    }
  }

  function isReloadNavigation() {
    try {
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation");
      if (nav && nav[0] && String(nav[0].type || "") === "reload") return true;
    } catch (e1) {}
    try {
      if (performance.navigation && Number(performance.navigation.type) === 1) return true;
    } catch (e2) {}
    return false;
  }

  function isWebhookBlocked(url) {
    if (!url) return false;
    if (isCriticalSiteWebhook(url)) return false;
    var key = normalizeWebhookBlockKey(url);
    if (!key) return false;
    return Number(webhookBlockedUntilByKey[key] || 0) > now();
  }

  function stalePayloadFromCache(key, ttlMs, staleMs, persistMs) {
    var hit = getFresh(key, ttlMs, staleMs, persistMs);
    return hit && hit.value ? hit.value : null;
  }

  function delayMs(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, Math.max(0, Number(ms) || 0));
    });
  }

  function softFailPayload(status, error, extra) {
    var out = {
      ok: false,
      status: Number(status) || 0,
      body: { ok: false, error: String(error || "network_error") },
      soft: true,
    };
    if (extra && typeof extra === "object") {
      for (var k in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, k)) out[k] = extra[k];
      }
    }
    return out;
  }

  /* phoneApiGlobalFix1: timeout default più lunghi su touch + allineati a VcPerf */
  function defaultFetchTimeoutMs(explicit) {
    var ms = Number(explicit);
    if (Number.isFinite(ms) && ms > 0) return ms;
    var touch = isTouchDevice();
    try {
      if (window.VcPerf && typeof window.VcPerf.fetchTimeouts === "function") {
        var t = window.VcPerf.fetchTimeouts({
          fetchTimeoutMs: touch ? 30000 : 18000,
          failsafeMs: touch ? 52000 : 42000,
        });
        return Math.max(touch ? 28000 : 16000, Number(t.fetchTimeoutMs) || (touch ? 30000 : 18000));
      }
    } catch (ePerf) {}
    return touch ? 32000 : 18000;
  }

  function parseResponseBody(r) {
    return r
      .text()
      .then(function (text) {
        var raw = String(text == null ? "" : text);
        if (!raw) return { ok: r.ok, status: r.status, body: r.ok ? {} : { ok: false, error: "empty_body" } };
        try {
          return { ok: r.ok, status: r.status, body: JSON.parse(raw) };
        } catch (eJson) {
          /* HTML/proxy → soft fail, non “offline” grezzo */
          return softFailPayload(r.status || 0, "invalid_json", { invalidJson: true });
        }
      })
      .catch(function () {
        return softFailPayload(r.status || 0, "invalid_json", { invalidJson: true });
      });
  }

  function fetchJsonOnce(url, init, timeoutMs) {
    var ms = defaultFetchTimeoutMs(timeoutMs);
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
    return fetch(url, Object.assign({}, init || {}, { headers: headers, signal: ctrl.signal }))
      .then(function (r) {
        if (isWebhookUrl(url) && r && r.status === 429) {
          var ra = 0;
          try {
            ra = Number(r.headers.get("Retry-After") || "0");
          } catch (eRa) {}
          noteWebhook429(ra, url);
        }
        return parseResponseBody(r);
      })
      .catch(function (err) {
        var name = err && err.name ? String(err.name) : "";
        if (name === "AbortError") {
          return softFailPayload(408, "timeout", { timedOut: true });
        }
        return softFailPayload(0, "network_error", { networkError: true });
      })
      .finally(function () {
        window.clearTimeout(tid);
      });
  }

  function shouldRetryFetch(payload) {
    if (!payload || payload.blocked) return false;
    if (payload.timedOut || payload.networkError) return true;
    var st = Number(payload.status) || 0;
    if (st === 408 || st === 502 || st === 503 || st === 504) return true;
    var err = payload.body && payload.body.error ? String(payload.body.error) : "";
    return err === "timeout" || err === "network_error" || err === "invalid_json";
  }

  function fetchJson(url, init, timeoutMs) {
    var ms = defaultFetchTimeoutMs(timeoutMs);
    var webhook = isWebhookUrl(url);
    var fk = flightKey(url, init);
    if (webhook && inFlight[fk]) return inFlight[fk];
    if (webhook && isWebhookBlocked(url)) {
      return Promise.resolve({
        ok: false,
        status: 429,
        body: { ok: false, error: "rate_limited_client" },
        blocked: true,
        soft: true,
      });
    }

    /* phoneApiGlobalFix1: 1 retry automatico su timeout/rete (touch backoff più lungo) */
    var req = fetchJsonOnce(url, init, ms).then(function (payload) {
      if (!shouldRetryFetch(payload)) return payload;
      var nextMs = Math.min(56000, Math.max(ms + (isTouchDevice() ? 14000 : 10000), Math.round(ms * 1.45)));
      var wait = isTouchDevice() ? 750 : 420;
      return delayMs(wait).then(function () {
        return fetchJsonOnce(url, init, nextMs);
      });
    });

    if (webhook) {
      inFlight[fk] = req.finally(function () {
        delete inFlight[fk];
      });
      return inFlight[fk];
    }
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
    /* phoneApiReloadFix1: hard reload must hit network (stale OK as placeholder) */
    var forceNetwork =
      opts.forceNetwork === true ||
      (opts.forceNetwork !== false && isWebhookUrl(url) && isReloadNavigation());

    function network() {
      if (isWebhookUrl(url) && isWebhookBlocked(url)) {
        var blockedStale = stalePayloadFromCache(key, ttlMs, staleMs, persistMs);
        if (blockedStale) return Promise.resolve(blockedStale);
      }
      return fetchJson(url, init, timeoutMs)
        .then(function (payload) {
          if (
            payload &&
            (payload.status === 429 ||
              payload.blocked ||
              payload.timedOut ||
              payload.networkError ||
              payload.invalidJson)
          ) {
            var softStale = stalePayloadFromCache(key, ttlMs, staleMs, persistMs);
            if (softStale) return softStale;
          }
          if (payload && payload.ok && payload.body && payload.body.ok === true) {
            store(key, payload, ttlMs, persistMs);
          }
          return payload;
        })
        .catch(function (err) {
          var hit = getFresh(key, ttlMs, staleMs, persistMs);
          if (hit && hit.value) return hit.value;
          /* phoneApiGlobalFix1: non propagare throw grezzi — soft payload */
          return softFailPayload(0, "network_error", { networkError: true, err: String((err && err.message) || err || "") });
        });
    }

    if (!useCache) return network();

    var hit = getFresh(key, ttlMs, staleMs, persistMs);
    if (forceNetwork) {
      if (hit && hit.value && onStale) {
        try {
          onStale(hit.value);
        } catch (eFn) {}
      }
      return network();
    }
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
      if (isWebhookBlocked(url)) return;
      prefetch(key, url, opts);
    };
    /* phoneApiGlobalFix1: su telefono ritarda il warm per non pestare il first-paint */
    var idleTimeout = isTouchDevice() ? 14000 : 3500;
    var fallbackMs = isTouchDevice() ? 9000 : 1200;
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

  function invalidateContains(needle) {
    var n = String(needle || "");
    if (!n) return;
    Object.keys(memory).forEach(function (k) {
      if (k.indexOf(n) >= 0) delete memory[k];
    });
    try {
      var keys = [];
      for (var i = 0; i < sessionStorage.length; i += 1) {
        var sk = sessionStorage.key(i);
        if (sk && sk.indexOf(PREFIX) === 0 && sk.indexOf(n) >= 0) keys.push(sk);
      }
      keys.forEach(function (k) {
        sessionStorage.removeItem(k);
      });
    } catch (eS) {}
    try {
      var lkeys = [];
      for (var j = 0; j < localStorage.length; j += 1) {
        var lk = localStorage.key(j);
        if (lk && lk.indexOf(LOCAL_PREFIX) === 0 && lk.indexOf(n) >= 0) lkeys.push(lk);
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

  /* notifApiErr1: preserve soft/timeout/network so UI does not toast fake hard errors */
  function toStaffPayload(payload) {
    if (!payload) {
      return {
        res: { ok: false, status: 0 },
        data: { ok: false, error: "network_error", soft: true },
        soft: true,
      };
    }
    var data =
      payload.body && typeof payload.body === "object" ? Object.assign({}, payload.body) : {};
    var soft = Boolean(
      payload.soft || payload.timedOut || payload.networkError || payload.invalidJson || payload.blocked,
    );
    if (payload.timedOut && !data.error) data.error = "timeout";
    if (payload.networkError && !data.error) data.error = "network_error";
    if (payload.invalidJson && !data.error) data.error = "invalid_json";
    if (payload.blocked && !data.error) data.error = "rate_limited_client";
    if (soft) data.soft = true;
    return {
      res: { ok: Boolean(payload.ok), status: Number(payload.status) || 0 },
      data: data,
      soft: soft,
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
    invalidateContains: invalidateContains,
    isWebhookBlocked: isWebhookBlocked,
    noteWebhook429: noteWebhook429,
    clearWebhookBlocks: clearWebhookBlocks,
    fetchJson: fetchJson,
  };

  try {
    window.addEventListener("pageshow", function (ev) {
      clearWebhookBlocks();
      if (ev && (ev.persisted || isReloadNavigation())) {
        try {
          window.dispatchEvent(new CustomEvent("vc:site-api-refetch", { detail: { persisted: Boolean(ev.persisted) } }));
        } catch (eEv) {}
      }
    });
  } catch (ePs) {}
})();
