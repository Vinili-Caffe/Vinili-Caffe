(function () {
  var cfg = typeof window !== "undefined" ? window.__VC_LIVE : null;
  if (!cfg || cfg.enabled !== true) return;

  var introHasStarted = false;
  var pollStarted = false;
  var ioFallbackTimer = null;
  var staffHoverGroups = [];

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

  function escText(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isGenericStaffGroupRole(roleLabel) {
    var norm = String(roleLabel || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return norm === "staff" || norm === "high staff" || norm === "highstaff";
  }

  function ensureStaffHoverUi() {
    var staffNode = el("staff");
    if (!staffNode) return;
    var cell = staffNode.closest(".vc-stat-cell");
    if (!cell) return;
    cell.classList.add("vc-stat-cell--staff");
    if (cell.querySelector(".vc-stat-staff-popover")) return;
    var pop = document.createElement("div");
    pop.className = "vc-stat-staff-popover";
    pop.setAttribute("role", "tooltip");
    pop.innerHTML =
      '<p class="vc-stat-staff-popover__title">Staff List</p>' +
      '<div class="vc-stat-staff-popover__body">Caricamento...</div>';
    cell.appendChild(pop);
    cell.setAttribute("tabindex", "0");
    var closeTimer = null;
    function clearCloseTimer() {
      if (closeTimer) {
        clearTimeout(closeTimer);
        closeTimer = null;
      }
    }
    function open() {
      clearCloseTimer();
      if (!staffHoverGroups.length) return;
      cell.classList.add("vc-stat-cell--staff-open");
    }
    function closeWithDelay() {
      clearCloseTimer();
      closeTimer = setTimeout(function () {
        cell.classList.remove("vc-stat-cell--staff-open");
      }, 180);
    }
    cell.addEventListener("mouseenter", open);
    cell.addEventListener("mouseleave", closeWithDelay);
    pop.addEventListener("mouseenter", open);
    pop.addEventListener("mouseleave", closeWithDelay);
    cell.addEventListener("focus", open);
    cell.addEventListener("blur", closeWithDelay);
    cell.addEventListener("click", function () {
      if (!staffHoverGroups.length) return;
      cell.classList.toggle("vc-stat-cell--staff-open");
    });
    document.addEventListener("click", function (ev) {
      var t = ev && ev.target;
      if (!t || !t.closest) return;
      if (t.closest(".vc-stat-cell--staff")) return;
      cell.classList.remove("vc-stat-cell--staff-open");
    });
    document.addEventListener("keydown", function (ev) {
      if (String(ev && ev.key || "") === "Escape") {
        cell.classList.remove("vc-stat-cell--staff-open");
      }
    });
  }

  function updateStaffHoverUi() {
    ensureStaffHoverUi();
    var staffNode = el("staff");
    if (!staffNode) return;
    var cell = staffNode.closest(".vc-stat-cell");
    if (!cell) return;
    var body = cell.querySelector(".vc-stat-staff-popover__body");
    if (!body) return;
    if (!staffHoverGroups.length) {
      body.textContent = "Nessun membro staff disponibile.";
      cell.classList.remove("vc-stat-cell--staff");
      cell.classList.remove("vc-stat-cell--staff-open");
      cell.removeAttribute("tabindex");
      return;
    }
    cell.classList.add("vc-stat-cell--staff");
    cell.setAttribute("tabindex", "0");
    body.innerHTML =
      staffHoverGroups.map(function (group) {
        if (isGenericStaffGroupRole(group && group.role)) return "";
        var members = Array.isArray(group && group.members) ? group.members : [];
        if (!members.length) return "";
        return (
          '<section class="vc-stat-staff-popover__group">' +
          '<p class="vc-stat-staff-popover__group-title">' + escText(group.role || "Staff") + "</p>" +
          '<ul class="vc-stat-staff-popover__list">' +
          members.map(function (name) {
            return "<li>" + escText(name) + "</li>";
          }).join("") +
          "</ul>" +
          "</section>"
        );
      }).join("");
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

    return tryOne(0);
  }

  function fetchExtraStatsJson() {
    var p = cfg.extraStatsPath;
    if (p == null || String(p).trim() === "") return Promise.resolve(null);
    var url;
    try {
      url = new URL(String(p).trim(), location.origin).toString();
    } catch (e) {
      return Promise.resolve(null);
    }
    return fetchNoStore(url).catch(function () {
      return null;
    });
  }

  /**
   * Membri/boost: stessi valori della classifica (guild dal bot). Priorità a live-stats-extra.json
   * (guildMemberCount / guildBoostCount); fallback invite Discord se mancano nel JSON.
   */
  function tick() {
    Promise.all([fetchExtraStatsJson(), refreshInvite().catch(function () {
      return null;
    })]).then(function (pair) {
      var extra = pair[0];
      var inv = pair[1];
      if (extra && extra.staffNoPm != null) setText("staff", extra.staffNoPm);
      if (extra && Array.isArray(extra.staffHoverGroups)) {
        staffHoverGroups = extra.staffHoverGroups
          .map(function (g) {
            return {
              role: String((g && g.role) || "Staff"),
              members: Array.isArray(g && g.members) ? g.members.slice(0, 200) : [],
            };
          })
          .filter(function (g) {
            return g.members.length > 0 && !isGenericStaffGroupRole(g.role);
          });
        updateStaffHoverUi();
      }
      var guildMem =
        extra && extra.guildMemberCount != null && Number.isFinite(Number(extra.guildMemberCount))
          ? Number(extra.guildMemberCount)
          : null;
      if (guildMem != null) {
        setText("members", guildMem);
      } else if (inv && inv.approximate_member_count != null) {
        setText("members", inv.approximate_member_count);
      }
      var guildBoost =
        extra && extra.guildBoostCount != null && Number.isFinite(Number(extra.guildBoostCount))
          ? Number(extra.guildBoostCount)
          : null;
      if (guildBoost != null) {
        setText("boosts", guildBoost);
      } else if (inv && inv.guild && inv.guild.premium_subscription_count != null) {
        setText("boosts", inv.guild.premium_subscription_count);
      }
    });
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
  updateStaffHoverUi();
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

  function ensureLiveEventRoot() {
    var n = document.getElementById("vc-live-event-home");
    if (!n) {
      n = document.createElement("section");
      n.id = "vc-live-event-home";
      n.className = "vc-live-event-home";
      n.hidden = true;
      n.setAttribute("aria-live", "polite");
      n.setAttribute("role", "region");
      n.setAttribute("aria-label", "Evento Discord in corso");
    }

    if (n.parentNode !== document.body) {
      document.body.appendChild(n);
    }

    n.innerHTML =
      '<div class="vc-live-event-inline">' +
      '<button type="button" class="vc-live-event-inline__x" data-vc-live-event-dismiss aria-label="Nascondi evento live">' +
      '<i class="fa fa-times" aria-hidden="true"></i>' +
      "</button>" +
      '<p class="vc-live-event-inline__badge"><i class="fa fa-bolt" aria-hidden="true"></i> Evento live su Discord</p>' +
      '<h2 id="vc-live-event-title" class="vc-live-event-inline__title">Evento in corso</h2>' +
      '<p id="vc-live-event-desc" class="vc-live-event-inline__desc"></p>' +
      '<div class="vc-live-event-inline__actions">' +
      '<a id="vc-live-event-primary" class="vc-live-event-inline__btn" href="#" target="_blank" rel="noopener noreferrer">Partecipa</a>' +
      "</div>" +
      "</div>";
    return n;
  }

  function ensureReopenButton() {
    var btn = document.getElementById("vc-live-event-reopen");
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "vc-live-event-reopen";
    btn.className = "vc-live-event-reopen";
    btn.hidden = true;
    btn.setAttribute("aria-controls", "vc-live-event-home");
    btn.setAttribute("aria-label", "Riapri evento live");
    btn.innerHTML = '<i class="fa fa-bolt" aria-hidden="true"></i><span>Evento live</span>';
    document.body.appendChild(btn);
    return btn;
  }

  var root = ensureLiveEventRoot();
  var reopenBtn = ensureReopenButton();
  var titleEl = document.getElementById("vc-live-event-title");
  var descEl = document.getElementById("vc-live-event-desc");
  var prim = document.getElementById("vc-live-event-primary");
  if (!root || !reopenBtn || !titleEl || !descEl || !prim) return;

  var pollMs = Math.max(20000, Math.min(600000, Number(cfg.liveEventPollMs) || 90000));
  var isManuallyHidden = false;
  var lastEventPayload = null;

  function hideStrip(manual) {
    if (manual === true) isManuallyHidden = true;
    if (manual === false) isManuallyHidden = false;
    root.hidden = true;
    reopenBtn.hidden = !isManuallyHidden;
  }

  function showStrip(data) {
    var ev = data && data.event ? data.event : null;
    var eid = ev && ev.id != null ? String(ev.id).trim() : "";
    if (!ev || !eid) return;

    titleEl.textContent = ev.name || "Evento in corso";
    descEl.textContent =
      "In questo momento sul server Discord c’è un evento attivo. Unisciti dalla app o dal browser.";
    if (ev.description && String(ev.description).trim()) {
      descEl.textContent = String(ev.description).trim();
    }
    var invite = String(data.inviteUrl || prim.getAttribute("href") || cfg.inviteUrl || "").trim();
    var url = String(ev.buttonUrl || ev.eventUrl || invite).trim();
    var label = String(ev.buttonLabel || "Partecipa").trim() || "Partecipa";
    prim.setAttribute("href", url || invite);
    prim.textContent = label;

    lastEventPayload = data;
    if (isManuallyHidden) {
      root.hidden = true;
      reopenBtn.hidden = false;
      return;
    }

    root.hidden = false;
    reopenBtn.hidden = true;
  }

  root.addEventListener("click", function (e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-vc-live-event-dismiss]")) {
      hideStrip(true);
    }
  });

  reopenBtn.addEventListener("click", function () {
    isManuallyHidden = false;
    reopenBtn.hidden = true;
    if (lastEventPayload) {
      showStrip(lastEventPayload);
      return;
    }
    poll();
  });

  function poll() {
    var u = resolvedLiveEventUrl();
    if (!u) return;
    var sep = u.indexOf("?") >= 0 ? "&" : "?";
    u = u + sep + "_vct=" + encodeURIComponent(String(Date.now()));
    fetch(u, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || j.ok !== true) return;
        var jid = j.event && j.event.id != null ? String(j.event.id).trim() : "";
        if (j.active && j.event && jid) {
          showStrip(j);
        } else {
          lastEventPayload = null;
          hideStrip(false);
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(poll, 500);
    });
  } else {
    setTimeout(poll, 500);
  }
  setInterval(poll, pollMs);
})();