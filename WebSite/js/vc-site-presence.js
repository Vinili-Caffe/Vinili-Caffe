/**
 * siteUserPresence1 — presenza sul sito (online/idle/offline), non Discord.
 * Heartbeat se loggato + pallini SOLO su ticket / chat / discussioni.
 * presenceDotOut1: pallino fuori dal clip; presenceChatOnly1: niente altrove.
 * violKillVis1: visibilitychange → defer heartbeat
 * violKillReflow3: heartbeat idle/deferred (no force sync su vis)
 * bootCoherentFast1: HB solo post chrome-load-done + token; no HB se niente zone
 */
(function () {
  "use strict";
  if (window.__vcSitePresenceBooted === "bootCoherentFast1") return;
  try {
    if (window.__vcSitePresenceCtl && typeof window.__vcSitePresenceCtl.destroy === "function") {
      window.__vcSitePresenceCtl.destroy();
    }
  } catch (_) {}
  window.__vcSitePresenceBooted = "bootCoherentFast1";
  var moRef = null;

  /* apex→www 301 droppa i POST: forza www sull'API se serve */
  var API =
    (typeof location !== "undefined" &&
    String(location.hostname || "").toLowerCase() === "viniliecaffe.it"
      ? "https://www.viniliecaffe.it"
      : "") + "/webhooks/site-user-presence";
  /* apiJankCut1: meno stress oauth/me su ticket/inbox (prima 20s/28s) */
  var HB_MS = 50000;
  var QUERY_MS = 55000;
  var IDLE_MS = 3 * 60 * 1000;
  var statuses = Object.create(null);
  var wraps = typeof WeakMap !== "undefined" ? new WeakMap() : null;
  var hbTimer = 0;
  var queryTimer = 0;
  var lastActivity = Date.now();
  var lastHbKey = "";

  function token() {
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function myStatus() {
    if (document.hidden) return "idle";
    if (Date.now() - lastActivity > IDLE_MS) return "idle";
    return "online";
  }

  function markActivity() {
    lastActivity = Date.now();
  }

  ["pointerdown", "keydown", "touchstart", "scroll"].forEach(function (ev) {
    try {
      window.addEventListener(ev, markActivity, { passive: true, capture: true });
    } catch (_) {}
  });
  /* violKillReflow3: vis → idle heartbeat (setTimeout 0 ancora Violation 80ms+) */
  var visHbTimer = 0;
  document.addEventListener("visibilitychange", function () {
    if (visHbTimer) {
      try {
        window.clearTimeout(visHbTimer);
      } catch (_) {}
    }
    var go = function () {
      visHbTimer = 0;
      try {
        /* no force: se stato invariato skip (force=true faceva fetch inutile) */
        sendHeartbeat(false);
      } catch (_) {}
    };
    if (typeof window.__vcLight === "function") {
      window.__vcLight(go, 120);
    } else {
      visHbTimer = window.setTimeout(go, 120);
    }
  });

  function sendHeartbeat(force) {
    var t = token();
    if (!t) return;
    var st = myStatus();
    var path = "";
    try {
      path = String(location.pathname || "").slice(0, 160);
    } catch (_) {}
    var key = st + "|" + (document.hidden ? "0" : "1") + "|" + path;
    if (!force && key === lastHbKey) return;
    lastHbKey = key;
    var body = JSON.stringify({
      status: st,
      path: path,
      visible: !document.hidden,
    });
    try {
      fetch(API, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + t,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body,
        credentials: "omit",
        keepalive: true,
      }).catch(function () {});
    } catch (_) {}
  }

  function clearPresence() {
    var t = token();
    if (!t) return;
    lastHbKey = "";
    try {
      var body = JSON.stringify({ clear: true, status: "offline" });
      if (navigator.sendBeacon) {
        var blob = new Blob([body], { type: "application/json" });
        /* beacon can't set Authorization — fallback fetch keepalive */
      }
      fetch(API, {
        method: "POST",
        headers: {
          Authorization: "Bearer " + t,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: body,
        credentials: "omit",
        keepalive: true,
      }).catch(function () {});
    } catch (_) {}
  }

  window.addEventListener("pagehide", clearPresence);
  window.addEventListener("beforeunload", clearPresence);

  function collectIds() {
    var ids = [];
    var seen = Object.create(null);
    var nodes = document.querySelectorAll(
      ".vc-wfc-msg img[data-user-id], .vc-wfc-msg__av img[data-user-id], #vc-wfc-root img[data-user-id], " +
        ".vc-workflow-chat img[data-user-id], .vc-wt-msg img[data-user-id], .vc-wt-chat img[data-user-id], " +
        "[data-vc-presence-zone] img[data-user-id], [data-vc-presence-user], " +
        ".vc-presence-wrap[data-user-id]",
    );
    for (var i = 0; i < nodes.length && ids.length < 100; i += 1) {
      var el = nodes[i];
      if (!inPresenceZone(el) && !(el.getAttribute && el.getAttribute("data-vc-presence-user"))) {
        continue;
      }
      var id = String(
        el.getAttribute("data-user-id") || el.getAttribute("data-vc-presence-user") || "",
      ).trim();
      if (!/^\d{16,22}$/.test(id) || seen[id]) continue;
      seen[id] = 1;
      ids.push(id);
    }
    return ids;
  }

  function applyStatus(userId, status) {
    var st = status === "online" || status === "idle" ? status : "offline";
    statuses[userId] = st;
    var nodes = document.querySelectorAll(
      '.vc-presence-wrap[data-user-id="' +
        userId +
        '"], .vc-presence-dot[data-user-id="' +
        userId +
        '"]',
    );
    for (var i = 0; i < nodes.length; i += 1) {
      var n = nodes[i];
      if (n.classList.contains("vc-presence-dot")) {
        n.setAttribute("data-status", st);
        n.setAttribute("title", st === "online" ? "Online sul sito" : st === "idle" ? "Assente" : "Offline");
      } else {
        n.setAttribute("data-status", st);
        var dot = n.querySelector(".vc-presence-dot");
        if (dot) {
          dot.setAttribute("data-status", st);
          dot.setAttribute(
            "title",
            st === "online" ? "Online sul sito" : st === "idle" ? "Assente" : "Offline",
          );
        }
      }
    }
  }

  var CLIP_HOST_SEL = ".vc-wfc-msg__av";

  /* presenceChatOnly1: pallino solo ticket + chat/discussioni (wfc), mai profilo/nav/roster */
  var PRESENCE_ZONE_SEL =
    ".vc-wfc-msg, .vc-wfc-msg__av, #vc-wfc-root, .vc-wfc-root, .vc-workflow-chat, " +
    ".vc-wt-msg, .vc-wt-chat, .vc-wt-thread, [data-vc-presence-zone]";

  function inPresenceZone(el) {
    if (!el || !el.closest) return false;
    try {
      return !!el.closest(PRESENCE_ZONE_SEL);
    } catch (_) {
      return false;
    }
  }

  function stripPresenceWrap(wrap) {
    if (!wrap || !wrap.parentNode || !wrap.classList || !wrap.classList.contains("vc-presence-wrap")) {
      return;
    }
    var parent = wrap.parentNode;
    var move = [];
    for (var i = 0; i < wrap.childNodes.length; i += 1) move.push(wrap.childNodes[i]);
    for (var j = 0; j < move.length; j += 1) {
      var ch = move[j];
      if (ch.nodeType === 1 && ch.classList && ch.classList.contains("vc-presence-dot")) {
        try {
          wrap.removeChild(ch);
        } catch (_) {}
        continue;
      }
      parent.insertBefore(ch, wrap);
    }
    try {
      parent.removeChild(wrap);
    } catch (_) {}
  }

  function stripIfOutsideZone(img) {
    if (!img || !img.closest) return;
    var wrap = img.closest(".vc-presence-wrap");
    if (!wrap) return;
    if (inPresenceZone(wrap) || inPresenceZone(img)) return;
    if (wraps) {
      try {
        wraps.delete(img);
      } catch (_) {}
    }
    stripPresenceWrap(wrap);
  }

  function makeDot(uid) {
    var dot = document.createElement("span");
    dot.className = "vc-presence-dot";
    dot.setAttribute("data-user-id", uid);
    dot.setAttribute("data-status", statuses[uid] || "offline");
    dot.setAttribute(
      "title",
      statuses[uid] === "online"
        ? "Online sul sito"
        : statuses[uid] === "idle"
          ? "Assente"
          : "Offline",
    );
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  function ensureDotOnWrap(wrap, uid) {
    if (!wrap) return;
    var dot = wrap.querySelector(":scope > .vc-presence-dot");
    if (!dot) {
      /* :scope non ovunque — fallback */
      var kids = wrap.children;
      for (var i = 0; i < kids.length; i += 1) {
        if (kids[i].classList && kids[i].classList.contains("vc-presence-dot")) {
          dot = kids[i];
          break;
        }
      }
    }
    if (!dot) {
      wrap.appendChild(makeDot(uid));
    } else {
      dot.setAttribute("data-user-id", uid);
      dot.setAttribute("data-status", statuses[uid] || wrap.getAttribute("data-status") || "offline");
    }
  }

  /* presenceDotOut1: togli wrap sbagliato DENTRO il cerchio (pallino clipped + zoom) */
  function unwrapBadInner(wrap) {
    if (!wrap || !wrap.parentNode) return;
    var parent = wrap.parentNode;
    var move = [];
    for (var i = 0; i < wrap.childNodes.length; i += 1) move.push(wrap.childNodes[i]);
    for (var j = 0; j < move.length; j += 1) {
      var ch = move[j];
      if (ch.nodeType === 1 && ch.classList && ch.classList.contains("vc-presence-dot")) {
        try {
          wrap.removeChild(ch);
        } catch (_) {}
        continue;
      }
      parent.insertBefore(ch, wrap);
    }
    try {
      parent.removeChild(wrap);
    } catch (_) {}
  }

  function wrapClipOutside(clipHost, uid) {
    if (!clipHost || !clipHost.parentNode) return null;
    if (
      clipHost.parentNode.classList &&
      clipHost.parentNode.classList.contains("vc-presence-wrap")
    ) {
      var existing = clipHost.parentNode;
      existing.classList.add("vc-presence-wrap--clip");
      existing.setAttribute("data-user-id", uid);
      existing.setAttribute("data-status", statuses[uid] || "offline");
      ensureDotOnWrap(existing, uid);
      return existing;
    }
    var wrap = document.createElement("span");
    wrap.className = "vc-presence-wrap vc-presence-wrap--clip";
    wrap.setAttribute("data-user-id", uid);
    wrap.setAttribute("data-status", statuses[uid] || "offline");
    clipHost.parentNode.insertBefore(wrap, clipHost);
    wrap.appendChild(clipHost);
    wrap.appendChild(makeDot(uid));
    return wrap;
  }

  function ensureWrap(img) {
    if (!img || !img.getAttribute) return null;
    var uid = String(img.getAttribute("data-user-id") || "").trim();
    if (!/^\d{16,22}$/.test(uid)) return null;

    /* presenceChatOnly1: fuori da ticket/chat → togli pallino se c'era */
    if (!inPresenceZone(img)) {
      stripIfOutsideZone(img);
      return null;
    }

    try {
      var existing = img.closest ? img.closest(".vc-presence-wrap") : null;
      var clipHost = img.closest ? img.closest(CLIP_HOST_SEL) : null;

      /* Wrap DENTRO clipHost → migra fuori */
      if (existing && clipHost && clipHost.contains(existing)) {
        unwrapBadInner(existing);
        if (wraps) {
          try {
            wraps.delete(img);
          } catch (_) {}
        }
        existing = null;
        clipHost = img.closest ? img.closest(CLIP_HOST_SEL) : null;
      }

      /* Già corretto: --clip fuori che contiene il cerchio */
      if (
        existing &&
        existing.classList.contains("vc-presence-wrap--clip") &&
        clipHost &&
        existing.contains(clipHost)
      ) {
        ensureDotOnWrap(existing, uid);
        if (wraps) wraps.set(img, existing);
        return existing;
      }

      if (clipHost) {
        var out = wrapClipOutside(clipHost, uid);
        if (out && wraps) wraps.set(img, out);
        return out;
      }

      /* Nessun clip host: wrap sull'img ma sized (anti-zoom) */
      if (existing) {
        existing.classList.add("vc-presence-wrap--sized");
        ensureDotOnWrap(existing, uid);
        if (wraps) wraps.set(img, existing);
        return existing;
      }
      var parent = img.parentNode;
      if (!parent) return null;
      var wrap2 = document.createElement("span");
      wrap2.className = "vc-presence-wrap vc-presence-wrap--sized";
      wrap2.setAttribute("data-user-id", uid);
      wrap2.setAttribute("data-status", statuses[uid] || "offline");
      parent.insertBefore(wrap2, img);
      wrap2.appendChild(img);
      wrap2.appendChild(makeDot(uid));
      if (wraps) wraps.set(img, wrap2);
      return wrap2;
    } catch (_) {
      return null;
    }
  }

  var querySoonTimer = 0;
  function querySoon() {
    if (querySoonTimer) clearTimeout(querySoonTimer);
    querySoonTimer = setTimeout(function () {
      querySoonTimer = 0;
      queryVisible();
    }, 180);
  }

  var scanBusy = false;
  var scanQueued = null;
  var scanRaf = 0;
  function scan(root) {
    /* freezeKill1: coalesce — wrap avatar muta DOM → senza debounce = loop infinito */
    scanQueued = root && root.nodeType === 1 ? root : document;
    if (scanRaf) return;
    scanRaf = (window.requestAnimationFrame || function (cb) {
      return setTimeout(cb, 32);
    })(function () {
      scanRaf = 0;
      if (scanBusy) return;
      scanBusy = true;
      try {
        var scope = scanQueued && scanQueued.querySelectorAll ? scanQueued : document;
        scanQueued = null;
        /* Mai scan sull'intero documentElement da MO class churn */
        if (scope === document.documentElement) scope = document.body || document;
        /* presenceChatOnly1: pulisci wrap fuori zona (profilo/nav/roster…) */
        var orphans = scope.querySelectorAll
          ? scope.querySelectorAll(".vc-presence-wrap[data-user-id]")
          : [];
        for (var o = 0; o < orphans.length; o += 1) {
          if (!inPresenceZone(orphans[o])) stripPresenceWrap(orphans[o]);
        }
        var imgs = scope.querySelectorAll
          ? scope.querySelectorAll(
              ".vc-wfc-msg img[data-user-id], .vc-wfc-msg__av img[data-user-id], #vc-wfc-root img[data-user-id], " +
                ".vc-workflow-chat img[data-user-id], .vc-wt-msg img[data-user-id], .vc-wt-chat img[data-user-id], " +
                "[data-vc-presence-zone] img[data-user-id]",
            )
          : [];
        if (
          scope &&
          scope.matches &&
          scope.matches("img[data-user-id]") &&
          inPresenceZone(scope)
        ) {
          ensureWrap(scope);
        }
        var n = Math.min(imgs.length, 80);
        for (var i = 0; i < n; i += 1) ensureWrap(imgs[i]);
        if (n || (scope && scope.matches && scope.matches("img[data-user-id]") && inPresenceZone(scope))) {
          querySoon();
        }
      } catch (_) {
      } finally {
        scanBusy = false;
      }
    });
  }

  function queryVisible() {
    var ids = collectIds();
    if (!ids.length) return;
    try {
      /* GET: sopravvive a redirect apex→www (POST body perso) */
      var url = API + "/query?ids=" + encodeURIComponent(ids.join(","));
      fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "omit",
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (!data || !data.ok || !data.statuses) return;
          var map = data.statuses;
          Object.keys(map).forEach(function (id) {
            applyStatus(id, map[id]);
          });
        })
        .catch(function () {});
    } catch (_) {}
  }

  function onPresenceEvent(ev) {
    try {
      var d = ev && ev.detail ? ev.detail : ev;
      if (!d || !d.userId) return;
      applyStatus(String(d.userId), d.status || "offline");
    } catch (_) {}
  }

  window.addEventListener("vc:site-presence-changed", onPresenceEvent);

  function pageWantsPresenceNet() {
    try {
      if (!token()) return false;
      var path = String(location.pathname || "").toLowerCase();
      if (/\/tickets|\/staff\/inbox|\/confessionale|\/bacheca\//.test(path)) return true;
      if (document.querySelector(PRESENCE_ZONE_SEL)) return true;
    } catch (_) {}
    return false;
  }

  var presenceNetStarted = 0;
  function startPresenceNet() {
    if (presenceNetStarted) {
      scan(document.body || document);
      return;
    }
    presenceNetStarted = 1;
    if (!pageWantsPresenceNet()) {
      /* solo scan DOM locale, niente HB/API su faq/sponsor/… */
      scan(document.body || document);
      return;
    }
    scan(document.body || document);
    sendHeartbeat(true);
    queryVisible();
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = setInterval(function () {
      sendHeartbeat(false);
    }, HB_MS);
    if (queryTimer) clearInterval(queryTimer);
    queryTimer = setInterval(queryVisible, QUERY_MS);
  }

  function boot() {
    /* bootCoherentFast1: aspetta barra — niente contendere rete durante load */
    var start = function () {
      try {
        startPresenceNet();
      } catch (_) {}
    };
    if (window.__vcChromeLoadDone) {
      if (typeof window.__vcLight === "function") window.__vcLight(start, 80);
      else window.setTimeout(start, 80);
    } else {
      document.addEventListener("vc:chrome-load-done", start, { once: true });
      /* failsafe se chrome-ui non emette */
      window.setTimeout(function () {
        if (!presenceNetStarted) start();
      }, 4500);
    }

    try {
      /* freezeKill1: SOLO childList — MAI attributes/class (hangKill/soft-fx
         toggolano class su html → scan → wrap → MO → freeze totale). */
      var mo = new MutationObserver(function (muts) {
        if (scanBusy) return;
        var hit = null;
        for (var i = 0; i < muts.length && !hit; i += 1) {
          var added = muts[i].addedNodes;
          if (!added) continue;
          for (var j = 0; j < added.length; j += 1) {
            var node = added[j];
            if (!node || node.nodeType !== 1) continue;
            if (
              node.classList &&
              (node.classList.contains("vc-presence-wrap") ||
                node.classList.contains("vc-presence-dot"))
            ) {
              continue;
            }
            if (
              (node.matches &&
                node.matches("img[data-user-id]") &&
                inPresenceZone(node)) ||
              (node.querySelector &&
                node.querySelector(
                  ".vc-wfc-msg img[data-user-id], .vc-wt-msg img[data-user-id], #vc-wfc-root img[data-user-id], [data-vc-presence-zone] img[data-user-id]",
                ))
            ) {
              hit = node;
              break;
            }
          }
        }
        if (hit) scan(hit);
      });
      mo.observe(document.body || document.documentElement, {
        subtree: true,
        childList: true,
        attributes: false,
      });
      moRef = mo;
    } catch (_) {}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }

  window.__vcSitePresenceCtl = {
    destroy: function () {
      try {
        if (hbTimer) clearInterval(hbTimer);
        if (queryTimer) clearInterval(queryTimer);
        if (querySoonTimer) clearTimeout(querySoonTimer);
        if (scanRaf) {
          try {
            cancelAnimationFrame(scanRaf);
          } catch (_) {
            clearTimeout(scanRaf);
          }
        }
        if (moRef) moRef.disconnect();
      } catch (_) {}
      hbTimer = 0;
      queryTimer = 0;
      moRef = null;
    },
  };

  window.VcSitePresence = {
    refresh: queryVisible,
    scan: scan,
    heartbeat: function () {
      sendHeartbeat(true);
    },
    get: function (id) {
      return statuses[String(id || "")] || "offline";
    },
  };
})();
/* presenceChatOnly2 */
