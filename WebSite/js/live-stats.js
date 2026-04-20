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

  function wireIntroObserver() {
    var root = document.getElementById("stats");
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
    var obs = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          if (entries[i].isIntersecting) {
            obs.disconnect();
            if (ioFallbackTimer) {
              clearTimeout(ioFallbackTimer);
              ioFallbackTimer = null;
            }
            startIntroThenPoll();
            return;
          }
        }
      },
      { root: null, rootMargin: "0px 0px -8% 0px", threshold: 0.15 },
    );
    obs.observe(root);
    ioFallbackTimer = setTimeout(function () {
      obs.disconnect();
      if (!introHasStarted) startIntroThenPoll();
    }, 5000);
  }

  wireIntroObserver();
})();