(function () {
  var cfg = typeof window !== "undefined" ? window.__VC_LIVE : null;
  if (!cfg || cfg.enabled !== true) return;

  var introHasStarted = false;
  var pollStarted = false;
  var ioFallbackTimer = null;

  function el(key) {
    return document.querySelector('[data-live-stat="' + key + '"]');
  }

  function statInnerNode(node) {
    if (!node) return null;
    var inner = node.querySelector(".vc-stat-num-inner");
    if (inner) return inner;
    return node;
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function readTargetFromDom(node) {
    var raw = node.getAttribute("data-stat-target");
    if (raw != null && String(raw).trim() !== "") {
      var n = parseInt(String(raw).trim(), 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    var inner = statInnerNode(node);
    var v = parseInt(String(inner.textContent || "").replace(/\D/g, ""), 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  function durationIntro(to) {
    var t = Math.max(0, Math.floor(Number(to) || 0));
    return Math.min(1500, 420 + Math.log(t + 1) * 200);
  }

  function durationUpdate(from, to) {
    var d = Math.abs(Math.floor(to) - Math.floor(from));
    return Math.min(900, 280 + d * 18);
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function animateNumber(inner, from, to, durationMs, onDone) {
    if (!inner) {
      if (onDone) onDone();
      return;
    }
    from = Math.floor(Number(from) || 0);
    to = Math.floor(Number(to) || 0);
    if (prefersReducedMotion()) {
      inner.textContent = String(to);
      if (onDone) onDone();
      return;
    }
    if (from === to) {
      inner.textContent = String(to);
      if (onDone) onDone();
      return;
    }
    if (inner._vcStatRaf) {
      cancelAnimationFrame(inner._vcStatRaf);
      inner._vcStatRaf = null;
    }
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / durationMs);
      var eased = easeOutQuart(t);
      var v = Math.round(from + (to - from) * eased);
      inner.textContent = String(v);
      if (t < 1) {
        inner._vcStatRaf = requestAnimationFrame(frame);
      } else {
        inner.textContent = String(to);
        inner._vcStatRaf = null;
        if (onDone) onDone();
      }
    }
    inner._vcStatRaf = requestAnimationFrame(frame);
  }

  function setText(key, value) {
    var node = el(key);
    if (!node || value === undefined || value === null) return;
    var n = Number(value);
    if (!Number.isFinite(n)) return;
    n = Math.floor(n);
    var inner = statInnerNode(node);
    var cur = parseInt(String(inner.textContent || "").replace(/\D/g, ""), 10) || 0;
    if (cur === n) return;
    animateNumber(inner, cur, n, durationUpdate(cur, n), null);
  }

  function fetchNoStore(url) {
    return fetch(url, { cache: "no-store", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  function inviteUrls() {
    var code = String(cfg.inviteCode || "").trim();
    if (!code) return [];
    var list = [];
    var proxy = cfg.inviteProxyPath;
    if (proxy && String(proxy).trim()) {
      try {
        list.push(new URL(String(proxy).trim(), location.origin).toString());
      } catch (e) {
        /* ignore */
      }
    }
    list.push(
      "https://discord.com/api/v10/invites/" + encodeURIComponent(code) + "?with_counts=true",
    );
    return list;
  }

  function refreshInvite() {
    var urls = inviteUrls();
    if (!urls.length) return Promise.resolve();

    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(new Error("invite_exhausted"));
      return fetchNoStore(urls[i]).then(function (data) {
        return data;
      }).catch(function () {
        return tryOne(i + 1);
      });
    }

    return tryOne(0).then(function (data) {
      setText("members", data.approximate_member_count);
      var boosts = data.guild && data.guild.premium_subscription_count;
      setText("boosts", boosts);
    });
  }

  function refreshExtraStaff() {
    var p = cfg.extraStatsPath;
    if (p == null || String(p).trim() === "") return Promise.resolve();
    var url;
    try {
      url = new URL(String(p).trim(), location.origin).toString();
    } catch (e) {
      return Promise.resolve();
    }
    return fetchNoStore(url).then(function (j) {
      setText("staff", j.staffNoPm);
    }).catch(function () {
      /* file opzionale */
    });
  }

  function tick() {
    refreshInvite().catch(function () {});
    refreshExtraStaff().catch(function () {});
  }

  function reveal247() {
    var n = document.querySelector(".vc-stat-247");
    if (!n) return;
    n.classList.add("vc-stat-247--in");
  }

  function startIntroThenPoll() {
    if (introHasStarted) return;
    introHasStarted = true;
    if (ioFallbackTimer) {
      clearTimeout(ioFallbackTimer);
      ioFallbackTimer = null;
    }
    var keys = ["members", "boosts", "staff"];
    var pending = 0;
    var maxDur = 0;
    function doneOne() {
      pending -= 1;
      if (pending <= 0) {
        setTimeout(reveal247, Math.min(520, maxDur * 0.45));
        tick();
        var ms = Number(cfg.pollIntervalMs) || 45000;
        if (!pollStarted && ms >= 5000 && !isLocalDevHost()) {
          pollStarted = true;
          setInterval(tick, ms);
        }
      }
    }
    keys.forEach(function (k) {
      var node = el(k);
      if (!node) return;
      var inner = statInnerNode(node);
      var target = readTargetFromDom(node);
      inner.textContent = "0";
      var dur = durationIntro(target);
      maxDur = Math.max(maxDur, dur);
      pending += 1;
      animateNumber(inner, 0, target, dur, doneOne);
    });
    if (pending === 0) doneOne();
  }

  function isLocalDevHost() {
    var h = String(location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function statsIntroTargetEl() {
    var sec = document.getElementById("stats");
    if (!sec) return null;
    var strip = sec.querySelector(".vc-stat-strip");
    return strip || sec;
  }

  function wireIntroObserver() {
    var root = statsIntroTargetEl();
    if (!root) {
      startIntroThenPoll();
      return;
    }
    if (prefersReducedMotion()) {
      startIntroThenPoll();
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      startIntroThenPoll();
      return;
    }
    var introThreshold = 0.38;
    var obs = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          var e = entries[i];
          if (!e.isIntersecting) continue;
          var ratio = typeof e.intersectionRatio === "number" ? e.intersectionRatio : 0;
          if (ratio < introThreshold) continue;
          obs.disconnect();
          if (ioFallbackTimer) {
            clearTimeout(ioFallbackTimer);
            ioFallbackTimer = null;
          }
          startIntroThenPoll();
          return;
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -18% 0px",
        threshold: [0, 0.12, 0.25, introThreshold, 0.5, 0.75, 1],
      },
    );
    obs.observe(root);
    var fallbackMs = Math.max(12000, Math.min(120000, Number(cfg.introFallbackMs) || 45000));
    ioFallbackTimer = setTimeout(function () {
      obs.disconnect();
      if (!introHasStarted) startIntroThenPoll();
    }, fallbackMs);
  }

  wireIntroObserver();
})();
(function () {
  var cfg = typeof window !== "undefined" ? window.__VC_LIVE : null;
  if (!cfg || cfg.enabled !== true) return;
  var apiProd = String(cfg.liveEventApiUrl || "").trim();
  if (!apiProd) return;

  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedLiveEventUrl() {
    var local = String(cfg.liveEventApiUrlLocal || "").trim();
    if (isLocalOrigin() && local) return local;
    return apiProd;
  }

  function isHomePath() {
    try {
      var raw = String(location.pathname || "/");
      var p = raw.replace(/\/+$/, "") || "/";
      if (p === "/" || p === "") return true;
      return /^\/index\.html$/i.test(raw);
    } catch (e2) {
      return true;
    }
  }

  if (!isHomePath()) return;

  var DISMISS_KEY = "vc_live_event_hide_sess_v1";
  var root = document.getElementById("vc-live-event-modal");
  if (!root) return;
  var titleEl = document.getElementById("vc-live-event-title");
  var descEl = document.getElementById("vc-live-event-desc");
  var prim = document.getElementById("vc-live-event-primary");
  var inv = document.getElementById("vc-live-event-invite");
  if (!titleEl || !descEl || !prim || !inv) return;

  var pollMs = Math.max(20000, Math.min(600000, Number(cfg.liveEventPollMs) || 90000));
  var escBound = false;
  var lastShownId = "";

  function isDismissedSession(eid) {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === String(eid);
    } catch (e3) {
      return false;
    }
  }

  function dismissSession(eid) {
    try {
      sessionStorage.setItem(DISMISS_KEY, String(eid));
    } catch (e4) {}
  }

  function hideModal() {
    root.hidden = true;
    root.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (escBound) {
      document.removeEventListener("keydown", onKey);
      escBound = false;
    }
  }

  function onKey(ev) {
    if (ev.key === "Escape") hideModal();
  }

  function showModal(data) {
    var ev = data && data.event ? data.event : null;
    if (!ev || !ev.id) return;
    if (isDismissedSession(ev.id)) return;
    if (lastShownId === ev.id && !root.hidden) return;

    lastShownId = String(ev.id);
    titleEl.textContent = ev.name || "Evento in corso";
    descEl.textContent =
      "In questo momento sul server Discord c’è un evento attivo. Unisciti dalla app o dal browser.";
    if (ev.description && String(ev.description).trim()) {
      descEl.textContent = String(ev.description).trim();
    }
    var invite = String(data.inviteUrl || inv.getAttribute("href") || "").trim();
    if (invite) inv.setAttribute("href", invite);
    var url = String(ev.buttonUrl || ev.eventUrl || invite).trim();
    var label = String(ev.buttonLabel || "Partecipa").trim() || "Partecipa";
    prim.setAttribute("href", url || invite);
    prim.textContent = label;

    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    if (!escBound) {
      document.addEventListener("keydown", onKey);
      escBound = true;
    }
    try {
      prim.focus();
    } catch (e5) {}
  }

  root.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-vc-live-event-close]")) {
      if (lastShownId) dismissSession(lastShownId);
      hideModal();
    }
  });

  function poll() {
    var u = resolvedLiveEventUrl();
    if (!u) return;
    fetch(u, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || j.ok !== true) return;
        if (j.active && j.event && j.event.id) {
          showModal(j);
        } else {
          if (!root.hidden) hideModal();
          lastShownId = "";
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(poll, 1800);
    });
  } else {
    setTimeout(poll, 1800);
  }
  setInterval(poll, pollMs);
})();