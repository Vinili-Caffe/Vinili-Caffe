/* siteApiW7 + apiJankCut1 */
(function () {
  "use strict";
  /* consoleErrors1 / console429Kill1: per-endpoint 429/502 cool-down also for /webhooks/site-* */
  /* multiDeviceApi1: 5xx cool-down corto + retry x3; health/status mai bloccati */
  /* apiJankCut1: isCacheableBody — cache anche body senza ok:true (es. discord-me) */

  var PREFIX = "vc:apicache:";
  var LOCAL_PREFIX = "vc:apicache:local:";
  var memory = Object.create(null);
  var inFlight = Object.create(null);
  /* phoneApiBlockFix1: per-endpoint cool-down (was global — one 429 froze the whole phone site) */
  var webhookBlockedUntilByKey = Object.create(null);
  /* phoneUser429Fix1: cool-down più corti; GET site-users aspetta invece di “Troppe richieste” */
  var DEFAULT_429_BLOCK_MS = 12000;
  var DEFAULT_429_BLOCK_MS_TOUCH = 8000;
  var READ_429_BLOCK_MS = 6000;
  var READ_429_BLOCK_MS_TOUCH = 4500;
  var warmQueueGapMs = 0;

  function isTouchDevice() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (Number(navigator.maxTouchPoints || 0) > 0) return true;
    } catch (eT) {}
    return false;
  }

  function isReadHeavyWebhook(url) {
    var key = normalizeWebhookBlockKey(url);
    return (
      key === "/webhooks/site-users" ||
      key === "/webhooks/site-chrome-prefs" ||
      key === "/webhooks/site-profile-extras" ||
      key === "/webhooks/site-custom-profile" ||
      key === "/webhooks/site-rank-card" ||
      key === "/webhooks/site-rank-card-public" ||
      key === "/webhooks/site-notifications" ||
      key === "/webhooks/site-roles" ||
      key === "/webhooks/site-boards" ||
      key === "/webhooks/site-vote" ||
      key === "/webhooks/site-wiki-help" ||
      key === "/webhooks/site-confessionale" ||
      key === "/webhooks/site-web-tickets" ||
      key === "/webhooks/site-staff-compiti" ||
      key === "/webhooks/site-staff-organico" ||
      key === "/webhooks/site-staff-dashboard"
    );
  }

  /* inAppNotifSync1: inbox in-app critica — cool-down cortissimi (push arriva, campanella resta vuota) */
  function isSiteNotificationsWebhook(url) {
    return normalizeWebhookBlockKey(url) === "/webhooks/site-notifications";
  }

  /* reviewsSoft429Fix1 + phoneApiSoft429Kill1: pagine API bot — no freeze globale */
  function isBoardReadWebhook(url) {
    var key = normalizeWebhookBlockKey(url);
    return (
      key === "/webhooks/site-reviews" ||
      key === "/webhooks/site-suggestions" ||
      key === "/webhooks/site-bot-feedback" ||
      key === "/webhooks/site-feedback" ||
      key === "/webhooks/site-vote" ||
      key === "/webhooks/site-roles" ||
      key === "/webhooks/site-boards" ||
      key === "/webhooks/site-users" ||
      key === "/webhooks/site-wiki-help" ||
      key === "/webhooks/site-confessionale" ||
      key === "/webhooks/site-profile-extras" ||
      key === "/webhooks/site-custom-profile" ||
      key === "/webhooks/site-web-tickets" ||
      key === "/webhooks/site-staff-compiti" ||
      key === "/webhooks/site-staff-organico" ||
      key === "/webhooks/site-staff-pause" ||
      key === "/webhooks/site-staff-profile" ||
      key === "/webhooks/site-candidature"
    );
  }

  function webhook429BlockMs(retryAfterSec, url) {
    var sec = Number(retryAfterSec);
    /* inAppNotifSync1: campanella non può restare bloccata 20–90s dopo un 429 */
    if (isSiteNotificationsWebhook(url)) {
      if (Number.isFinite(sec) && sec > 0) return Math.min(8000, Math.max(2500, sec * 1000));
      return isTouchDevice() ? 3500 : 4500;
    }
    /* console429Kill1: CF IP-wide — cool-down più lunghi */
    if (Number.isFinite(sec) && sec > 0) return Math.min(90000, Math.max(12000, sec * 1000));
    if (isReadHeavyWebhook(url)) {
      return isTouchDevice() ? 20000 : 28000;
    }
    return isTouchDevice() ? 25000 : 40000;
  }

  function webhookBlockRemainingMs(url) {
    var left = 0;
    try {
      if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
        left = Math.max(left, Number(window.__vcWebhookGlobalBlockedUntil() || 0) - now());
      }
    } catch (eG) {}
    var key = normalizeWebhookBlockKey(url);
    if (key) left = Math.max(left, Number(webhookBlockedUntilByKey[key] || 0) - now());
    return Math.max(0, left);
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

  function noteWebhook429(retryAfterSec, url, meta) {
    var blockMs = webhook429BlockMs(retryAfterSec, url);
    var key = normalizeWebhookBlockKey(url);
    /* phoneApiSoft429Kill1: NEVER arm global from app/soft 429 — only CF HTML via armFrom429.
       Soft429 responses re-entering here used to freeze every phone API page. */
    try {
      if (meta && meta.soft429) return;
    } catch (eSoftMeta) {}
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

  /* multiDeviceApi1: 502/503 durante boot/restart ≠ CF 429 — cool-down corto così i retry funzionano su phone/tablet */
  function noteWebhook5xx(url) {
    var key = normalizeWebhookBlockKey(url);
    if (!key) return;
    if (isHealthWebhook(url)) return;
    /* inAppNotifSync1: 502 breve su inbox — altrimenti push ok / campanella morta */
    var blockMs = isSiteNotificationsWebhook(url)
      ? isTouchDevice()
        ? 1200
        : 1600
      : isTouchDevice()
        ? 2200
        : 2800;
    webhookBlockedUntilByKey[key] = Math.max(Number(webhookBlockedUntilByKey[key]) || 0, now() + blockMs);
  }

  /* consoleErrors1: block per-endpoint anche su site-* (prima isCritical bypassava TUTTI → storm 429).
     Solo health resta sempre sbloccato. */
  function isHealthWebhook(url) {
    try {
      var base =
        typeof location !== "undefined" && location.origin ? location.origin : "https://localhost";
      var path = String(new URL(String(url || ""), base).pathname || "");
      return (
        path === "/webhooks/health" ||
        path === "/webhooks/status" ||
        path === "/webhooks/site-api/health" ||
        path === "/webhooks/coffee/health" ||
        path.indexOf("/webhooks/health/") === 0
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
    if (isHealthWebhook(url)) return false;
    /* reviewsSoft429Fix1: GET board non eredita il freeze globale */
    if (isBoardReadWebhook(url)) {
      var bkey = normalizeWebhookBlockKey(url);
      return bkey ? Number(webhookBlockedUntilByKey[bkey] || 0) > now() : false;
    }
    try {
      if (typeof window.__vcWebhookGlobalBlockedUntil === "function") {
        if (Date.now() < Number(window.__vcWebhookGlobalBlockedUntil() || 0)) return true;
      }
    } catch (eGb) {}
    if (!url) return false;
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
        var etag = "";
        try {
          etag = String((r && r.headers && r.headers.get("ETag")) || "").trim();
        } catch (eEt) {
          etag = "";
        }
        if (!raw) {
          return {
            ok: r.ok,
            status: r.status,
            body: r.ok ? {} : { ok: false, error: "empty_body" },
            etag: etag,
          };
        }
        try {
          return { ok: r.ok, status: r.status, body: JSON.parse(raw), etag: etag };
        } catch (eJson) {
          /* HTML/proxy → soft fail, non “offline” grezzo */
          return softFailPayload(r.status || 0, "invalid_json", { invalidJson: true });
        }
      })
      .catch(function () {
        return softFailPayload(r.status || 0, "invalid_json", { invalidJson: true });
      });
  }

  /* siteApiW4: conditional GET via If-None-Match for staff/notif validators */
  var httpValidators = Object.create(null);

  function validatorKey(url, init) {
    var auth = "";
    try {
      var src = (init && init.headers) || {};
      if (typeof src.forEach === "function") {
        src.forEach(function (value, key) {
          if (String(key).toLowerCase() === "authorization") auth = String(value || "");
        });
      } else if (src && typeof src === "object") {
        auth = String(src.Authorization || src.authorization || "");
      }
    } catch (eVk) {}
    return String(url || "") + "|" + auth.slice(0, 40);
  }

  function fetchJsonOnce(url, init, timeoutMs) {
    var ms = defaultFetchTimeoutMs(timeoutMs);
    var ctrl = new AbortController();
    var tid = 0;
    var headers = { Accept: "application/json" };
    try {
      var src = (init && init.headers) || {};
      if (typeof src.forEach === "function") {
        src.forEach(function (value, key) {
          headers[String(key)] = String(value);
        });
      } else if (src && typeof src === "object") {
        Object.keys(src).forEach(function (key) {
          headers[key] = src[key];
        });
      }
    } catch (eHdrCopy) {
      headers = Object.assign({ Accept: "application/json" }, (init && init.headers) || {});
    }
    try {
      if (window.VcPerf && typeof window.VcPerf.apiHeaders === "function") {
        headers = window.VcPerf.apiHeaders(headers, url);
      }
    } catch (eH) {}
    var vk = validatorKey(url, { headers: headers });
    try {
      var prev = httpValidators[vk];
      if (prev && prev.etag && !headers["If-None-Match"] && !headers["if-none-match"]) {
        headers["If-None-Match"] = prev.etag;
      }
    } catch (eInm) {}
    /* phoneApiSoft429Kill1: start abort timer only when fetch actually begins
       (queue delay must not eat the timeout budget). */
    tid = window.setTimeout(function () {
      try {
        ctrl.abort();
      } catch (eA) {}
    }, ms);
    return fetch(url, Object.assign({}, init || {}, { headers: headers, signal: ctrl.signal }))
      .then(function (r) {
        var soft429 = false;
        try {
          soft429 = Boolean(r && r.headers && r.headers.get("X-VC-Soft429"));
        } catch (eSoft) {
          soft429 = false;
        }
        if (isWebhookUrl(url) && r && r.status === 429) {
          if (!soft429) {
            var ra = 0;
            try {
              ra = Number(r.headers.get("Retry-After") || "0");
            } catch (eRa) {}
            noteWebhook429(ra, url, { soft429: false });
          }
        }
        /* multiDeviceApi1: 502/503 → cool-down CORTO (non 429-length) + retry in shouldRetryFetch */
        if (!soft429 && isWebhookUrl(url) && r && (r.status === 502 || r.status === 503 || r.status === 504)) {
          noteWebhook5xx(url);
        }
        if (r && r.status === 304) {
          var hit = httpValidators[vk];
          if (hit && hit.body) {
            return { ok: true, status: 304, body: hit.body, etag: hit.etag, notModified: true };
          }
        }
        return parseResponseBody(r).then(function (payload) {
          try {
            if (
              payload &&
              payload.etag &&
              payload.body &&
              (payload.body.ok === true || payload.body.viewAsActive)
            ) {
              httpValidators[vk] = { etag: payload.etag, body: payload.body };
            }
          } catch (eStore) {}
          return payload;
        });
      })
      .catch(function (err) {
        var name = err && err.name ? String(err.name) : "";
        if (name === "AbortError") {
          return softFailPayload(408, "timeout", { timedOut: true });
        }
        return softFailPayload(0, "network_error", { networkError: true });
      })
      .finally(function () {
        if (tid) window.clearTimeout(tid);
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
      var left = webhookBlockRemainingMs(url);
      /* phoneUser429Fix1 + reviewsSoft429Fix2: board/classifica aspettano e riprovano (no flash Troppe richieste) */
      if ((isReadHeavyWebhook(url) || isBoardReadWebhook(url)) && left > 0 && left < 14000) {
        var waited = delayMs(left + 80).then(function () {
          if (isWebhookBlocked(url)) {
            return {
              ok: false,
              status: 429,
              body: { ok: false, error: "rate_limited_client" },
              blocked: true,
              soft: true,
            };
          }
          return fetchJsonOnce(url, init, ms);
        });
        inFlight[fk] = waited.finally(function () {
          delete inFlight[fk];
        });
        return inFlight[fk];
      }
      return Promise.resolve({
        ok: false,
        status: 429,
        body: { ok: false, error: "rate_limited_client" },
        blocked: true,
        soft: true,
      });
    }

    /* phoneApiGlobalFix1 + phoneApiSoft429Kill1: retry timeout/rete + soft429 touch */
    var req = fetchJsonOnce(url, init, ms).then(function (payload) {
      var soft429Body =
        payload &&
        Number(payload.status) === 429 &&
        payload.body &&
        (payload.body.soft === true ||
          payload.body.error === "rate_limited" ||
          payload.body.error === "rate_limited_client");
      if (soft429Body && isTouchDevice() && (isReadHeavyWebhook(url) || isBoardReadWebhook(url))) {
        return delayMs(1100).then(function () {
          if (isWebhookBlocked(url)) {
            return delayMs(Math.min(4000, webhookBlockRemainingMs(url) + 60)).then(function () {
              return fetchJsonOnce(url, init, ms);
            });
          }
          return fetchJsonOnce(url, init, ms);
        });
      }
      if (!shouldRetryFetch(payload)) return payload;
      var nextMs = Math.min(56000, Math.max(ms + (isTouchDevice() ? 14000 : 10000), Math.round(ms * 1.45)));
      var wait = isTouchDevice() ? 750 : 420;
      var st0 = Number(payload && payload.status) || 0;
      if (st0 === 502 || st0 === 503 || st0 === 504) {
        /* multiDeviceApi1: secondo retry dopo boot flap (watchdog/restart) */
        wait = isTouchDevice() ? 1100 : 850;
        return delayMs(wait).then(function () {
          return fetchJsonOnce(url, init, nextMs).then(function (payload2) {
            if (!shouldRetryFetch(payload2)) return payload2;
            return delayMs(isTouchDevice() ? 1600 : 1200).then(function () {
              return fetchJsonOnce(url, init, nextMs);
            });
          });
        });
      }
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
      /* voteStaleFix1: forceNetwork must hit origin even during 429 cool-down */
      if (isWebhookUrl(url) && isWebhookBlocked(url) && !forceNetwork) {
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
          if (
            payload &&
            payload.ok &&
            payload.body &&
            (payload.body.ok === true ||
              (typeof opts.isCacheableBody === "function" && opts.isCacheableBody(payload.body)))
          ) {
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

  /* apiStaleFirst1: lettura sync da session/local senza aspettare fetch */
  function peek(key, opts) {
    opts = opts || {};
    var ttlMs = Math.max(1000, Number(opts.ttlMs) || 60000);
    var staleMs = Math.max(ttlMs, Number(opts.staleMs) || ttlMs * 10);
    var persistMs = Math.max(0, Number(opts.persistMs) || 0);
    return getFresh(key, ttlMs, staleMs, persistMs);
  }

  function peekBody(key, opts) {
    var hit = peek(key, opts);
    if (!hit || !hit.value) return null;
    var v = hit.value;
    if (v && v.body && typeof v.body === "object") return { body: v.body, stale: !!hit.stale, raw: v };
    if (v && v.ok === true) return { body: v, stale: !!hit.stale, raw: v };
    return null;
  }

  function prefetchIdle(key, url, opts) {
    var run = function () {
      if (isWebhookBlocked(url)) return;
      /* violPass7: handler corto — prefetch (storage+fetch) in macrotask separato */
      window.setTimeout(function () {
        try {
          prefetch(key, url, opts);
        } catch (ePf) {}
      }, 0);
    };
    /* consoleStorm2 + violPass4: niente requestIdleCallback({timeout}) → Violation idle */
    /* violPass7: stagger più largo — evita burst setTimeout 1s+ */
    warmQueueGapMs += isTouchDevice() ? 4200 : 3400;
    var stagger = warmQueueGapMs;
    var fallbackMs = (isTouchDevice() ? 14000 : 11000) + stagger;
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
    var raw = "";
    try {
      if (typeof h.get === "function") raw = String(h.get("Authorization") || h.get("authorization") || "").trim();
      else raw = String(h.Authorization || h.authorization || "").trim();
    } catch (eB) {
      raw = String(h.Authorization || h.authorization || "").trim();
    }
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

  function clearWebhookBlock(url) {
    var key = normalizeWebhookBlockKey(url);
    if (!key) return;
    try {
      delete webhookBlockedUntilByKey[key];
    } catch (eC) {}
  }

  window.VcApiCache = {
    keyFor: keyFor,
    peek: peek,
    peekBody: peekBody,
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
    webhookBlockRemainingMs: webhookBlockRemainingMs,
    clearWebhookBlocks: clearWebhookBlocks,
    clearWebhookBlock: clearWebhookBlock,
    fetchJson: fetchJson,
    __siteApiW4: true,
  };

  /* apiStaleFirst2: warm boards+ruoli presto (non dopo 11–14s idle) */
  function prefetchSoon(key, url, opts, delayMs) {
    window.setTimeout(function () {
      try {
        if (isWebhookBlocked(url)) return;
        prefetch(key, url, opts);
      } catch (ePf) {}
    }, Math.max(0, Number(delayMs) || 0));
  }

  function warmBoardsRolesPrefetch() {
    try {
      if (isTouchDevice() && document.visibilityState === "hidden") return;
      var boardsBase = "/webhooks/site-boards";
      try {
        if (window.__VC_BOARDS && window.__VC_BOARDS.apiUrl) {
          boardsBase = String(window.__VC_BOARDS.apiUrl).replace(/\/+$/, "") || boardsBase;
        }
      } catch (eB) {}
      var listingsUrl = boardsBase + "/listings?kind=server&sort=new";
      var configUrl = boardsBase + "/config";
      var rolesUrl = "/webhooks/site-roles";
      var listingsOpts = {
        ttlMs: 45000,
        staleMs: 600000,
        persistMs: 45 * 60 * 1000,
        timeoutMs: 12000,
      };
      var configOpts = {
        ttlMs: 120000,
        staleMs: 900000,
        persistMs: 60 * 60 * 1000,
        timeoutMs: 8000,
      };
      var rolesOpts = {
        ttlMs: 90000,
        staleMs: 600000,
        persistMs: 20 * 60 * 1000,
        timeoutMs: 15000,
      };
      prefetchSoon(keyFor(listingsUrl, { scope: "boards", v: "b2" }), listingsUrl, listingsOpts, 350);
      prefetchSoon(keyFor(configUrl, { scope: "boards", v: "b2" }), configUrl, configOpts, 650);
      prefetchSoon(keyFor(rolesUrl, { scope: "roles", v: "roles5" }), rolesUrl, rolesOpts, 950);
    } catch (eWarm) {}
  }

  function armNavPrefetch() {
    try {
      if (window.__vcApiNavPrefetchArm) return;
      window.__vcApiNavPrefetchArm = 1;
      function kick(path) {
        try {
          if (/\/(?:bacheca|boards)(?:\/|$)/i.test(path)) warmBoardsRolesPrefetch();
          else if (/\/ruoli(?:\/|$)/i.test(path)) warmBoardsRolesPrefetch();
        } catch (eK) {}
      }
      document.addEventListener(
        "pointerdown",
        function (ev) {
          try {
            var a = ev.target && ev.target.closest && ev.target.closest("a[href]");
            if (!a) return;
            kick(String(a.getAttribute("href") || a.pathname || ""));
          } catch (ePd) {}
        },
        { capture: true, passive: true },
      );
    } catch (eArm) {}
  }

  try {
    window.addEventListener("pageshow", function (ev) {
      /* consoleStorm2: do NOT clear 429 cool-downs on every pageshow (CF 1015) */
      if (ev && (ev.persisted || isReloadNavigation())) {
        try {
          window.dispatchEvent(new CustomEvent("vc:site-api-refetch", { detail: { persisted: Boolean(ev.persisted) } }));
        } catch (eEv) {}
      }
    });
  } catch (ePs) {}

  try {
    if (document.readyState === "complete") {
      window.setTimeout(warmBoardsRolesPrefetch, 400);
      armNavPrefetch();
    } else {
      window.addEventListener(
        "load",
        function () {
          window.setTimeout(warmBoardsRolesPrefetch, 400);
          armNavPrefetch();
        },
        { once: true },
      );
    }
  } catch (eWarmArm) {}
})();
/* apiStaleFirst2 */

/* consoleNoise2 */


/* console429Kill1 */
/* violPass4 */
/* violPass5 */
/* violPass7 */
/* violPass10 */

