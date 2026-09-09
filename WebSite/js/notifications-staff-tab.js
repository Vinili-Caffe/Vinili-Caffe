(function () {
  "use strict";

  var ASSET_V = "20260908notifApiErr1";
  var TOKEN_KEY = "vc_discord_access_token";
  var SCOPE_PREF_KEY = "vc_notif_scope_pref";
          var scope = (function initScope() {
    try {
      if (
        document.documentElement.classList.contains("vc-notif-early-staff") ||
        document.documentElement.classList.contains("vc-notif-staff-loading") ||
        window.__VC_NOTIF_EARLY_STAFF
      ) {
        return "staff";
      }
      var sp = new URLSearchParams(location.search || "");
      var view = String(sp.get("view") || "").trim().toLowerCase();
      if (view === "staff") return "staff";
      var tab = String(sp.get("tab") || "").trim().toLowerCase();
      if (tab === "staff") return "staff";
    } catch (eInit) {}
    return "personal";
  })();
  var staffAssetsPromise = null;
  var staffCriticalPromise = null;
  var staffDeferredPromise = null;
  var summaryPrefetchPromise = null;
  var staffBooted = false;
  var staffBooting = false;
  var placeTries = 0;
  var accessPromise = null;

  function hideInboxToast() {
    try {
      if (window.VCStaffTools && typeof window.VCStaffTools.hideStaffToast === "function") {
        window.VCStaffTools.hideStaffToast();
      }
    } catch (eToast) {}
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") {
        window.VcSiteToast.hide();
      }
    } catch (eSite) {}
    try {
      var nodes = document.querySelectorAll(
        ".vc-staff-toast, .vc-dash-save-toast, .vc-site-toast, [data-vc-staff-toast]",
      );
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
      }
    } catch (eRm) {}
  }

  function emitScope(next) {
    try {
      window.dispatchEvent(new CustomEvent("vc:notif-scope", { detail: { scope: next } }));
    } catch (eEmit) {}
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function readScopePref() {
    try {
      var v = String(localStorage.getItem(SCOPE_PREF_KEY) || "")
        .trim()
        .toLowerCase();
      if (v === "staff" || v === "personal") return v;
    } catch (ePref) {}
    return "";
  }

  function writeScopePref(next) {
    try {
      localStorage.setItem(SCOPE_PREF_KEY, next === "staff" ? "staff" : "personal");
    } catch (eWrite) {}
  }

  function warmStaffFromCache() {
    try {
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      var token = readToken();
      if (!token) return false;
      var fp = String(token).slice(0, 24);
      try {
        var rawMenu = sessionStorage.getItem("vc_menu_staff_v1");
        if (rawMenu) {
          var menu = JSON.parse(rawMenu);
          if (menu && menu.allowed && menu.fp === fp && Date.now() - Number(menu.at || 0) < 300000) {
            if (menu.payload && menu.payload.ok) window.__VC_STAFF_PERMS = menu.payload;
            window.__VC_STAFF_MENU_ALLOWED = true;
            return true;
          }
        }
      } catch (eMenu) {}
      try {
        var rawGate =
          sessionStorage.getItem("vc_staff_access_ok_v2") ||
          localStorage.getItem("vc_staff_access_ok_v2_local");
        if (rawGate) {
          var gate = JSON.parse(rawGate);
          if (gate && gate.ok === true && Number(gate.exp || 0) > Date.now()) {
            window.__VC_STAFF_MENU_ALLOWED = true;
            return true;
          }
        }
      } catch (eGate) {}
    } catch (eWarm) {}
    return false;
  }

  function canStaff() {
    try {
      if (warmStaffFromCache()) return true;
      if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
      var p = window.__VC_STAFF_PERMS;
      if (p && typeof p === "object" && p.ok) return true;
      var link = document.getElementById("discord-staff-link");
      /* notifMobileSwitch1: visibility via offsetParent fails on mobile (CSS-hidden header). */
      if (link && !link.hasAttribute("hidden")) return true;
      if (
        document.querySelector(
          "[data-vc-staff-tools-nav], .vc-snav-details--staff, .vc-header-snav [data-vc-staff-nav], .vc-snav-details[data-vc-staff-nav], #vc-staff-snav-details, #discord-staff-link:not([hidden])",
        )
      ) {
        return true;
      }
      var nodes = document.querySelectorAll(".vc-header-snav .vc-snav-summary, .vc-header-snav .vc-snav-item");
      for (var i = 0; i < nodes.length; i++) {
        var t = String((nodes[i].textContent || "")).replace(/\s+/g, " ").trim().toLowerCase();
        if (t.indexOf("area staff") >= 0) return true;
      }
    } catch (e) {}
    return false;
  }

  function preferInitialScope() {
        if (readTabFromUrl() === "staff") return "staff";
    return "personal";
  }

  function readTabFromUrl() {
    try {
      var sp = new URLSearchParams(location.search);
      var view = String(sp.get("view") || "")
        .trim()
        .toLowerCase();
      if (view === "staff") return "staff";
      var tab = String(sp.get("tab") || "")
        .trim()
        .toLowerCase();
      if (tab === "staff") return "staff";
    } catch (e) {}
    return "personal";
  }

  function writeTabToUrl(next) {
    try {
      var u = new URL(location.href);
      if (next === "staff") {
        u.searchParams.set("view", "staff");
        if (String(u.searchParams.get("tab") || "").toLowerCase() === "staff") {
          u.searchParams.delete("tab");
        }
      } else {
        u.searchParams.delete("view");
        u.searchParams.delete("inbox");
        u.searchParams.delete("scope");
        u.searchParams.delete("filter");
        u.searchParams.delete("week");
        u.searchParams.delete("page");
        if (String(u.searchParams.get("tab") || "").toLowerCase() === "staff") {
          u.searchParams.delete("tab");
        }
      }
      history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch (e) {}
  }

  function clearEarlyStaffClass() {
    try {
      document.documentElement.classList.remove("vc-notif-early-staff");
      window.__VC_NOTIF_EARLY_STAFF = false;
    } catch (eEarly) {}
  }

  function isPersonalBootPending() {
    try {
      return (
        document.documentElement.classList.contains("vc-notif-boot-personal") &&
        !document.documentElement.classList.contains("vc-notif-boot-ready")
      );
    } catch (ePending) {
      return false;
    }
  }

  function markPersonalBootReady() {
    try {
      var root = document.documentElement;
      if (!root.classList.contains("vc-notif-boot-personal")) return;
      if (scope !== "personal") {
        root.classList.remove("vc-notif-boot-personal", "vc-notif-boot-ready");
        return;
      }
      root.classList.add("vc-notif-boot-ready");
      requestAnimationFrame(function () {
        revealTabs();
        placeDockInContent();
      });
      prefetchStaffInboxForPersonal();
    } catch (eReady) {}
  }

  function prefetchStaffInboxForPersonal() {
    if (scope !== "personal") return;
    if (!canStaff() && window.__VC_STAFF_MENU_ALLOWED !== true) return;
    try {
      warmInboxPrefetch();
    } catch (eWarm) {}
    var runCritical = function () {
      try {
        ensureStaffConfig();
        ensureStaffAssetsCritical();
      } catch (eCrit) {}
    };
    window.setTimeout(runCritical, 60);
  }

  function preloadStaffInboxAssets() {
    if (!canStaff() && window.__VC_STAFF_MENU_ALLOWED !== true) return;
    try {
      ensureStaffConfig();
      ensureStaffAssetsCritical();
      warmInboxPrefetch();
    } catch (ePre) {}
  }

  function hideInboxBootOverlay(force) {
    try {
      if (!force && window.__VC_INBOX_FS_GATE_HOLD) return;
      if (
        !force &&
        (staffBooting ||
          (!staffBooted &&
            (document.documentElement.classList.contains("vc-notif-staff-loading") ||
              window.__VC_NOTIF_EARLY_STAFF)))
      ) {
        // Don't strip the gate mid-boot — staff-inbox-page owns release.
        return;
      }
    } catch (eHold) {}
    try {
      window.__VC_INBOX_FS_GATE_HOLD = false;
    } catch (eHoldOff) {}
    clearEarlyStaffClass();
    try {
      document.documentElement.classList.remove("vc-notif-staff-loading", "vc-notif-early-staff");
      window.__VC_NOTIF_EARLY_STAFF = false;
    } catch (eRm) {}
    try {
      var el = byId("vc-staff-inbox-loading");
      if (el) {
        el.hidden = true;
        el.setAttribute("hidden", "");
        el.classList.add("vc-staff-loading--hidden");
      }
    } catch (eEl) {}
    try {
      window.clearTimeout(window.__vcNotifStaffLoadWatch);
    } catch (eTo) {}
    try {
      window.clearTimeout(window.__vcInboxFsGateHardFailsafe);
    } catch (eHf) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eUnpin) {}
  }

  function applyPaneVisibility(next) {
    if (next === "staff") {
      if (!staffBooted) showInboxBootPlaceholder();
    } else {
      /* Personal pane is CSS-hidden under vc-notif-staff-loading — always lift gate. */
      hideInboxBootOverlay(true);
    }
    var personal = byId("vc-notif-pane-personal");
    var staff = byId("vc-notif-pane-staff");
    var tabP = byId("vc-notif-tab-personal");
    var tabS = byId("vc-notif-tab-staff");
    try {
      document.body.classList.toggle("vc-notif-scope-staff", next === "staff");
      document.body.classList.remove("vc-staff-cine-page");
      document.documentElement.classList.remove("vc-staff-cine-route");
    } catch (eBody) {}
    if (personal) {
      var hideP = next === "staff";
      personal.hidden = hideP;
      if (hideP) personal.setAttribute("hidden", "");
      else personal.removeAttribute("hidden");
    }
    if (staff) {
      var hideS = next !== "staff";
      staff.hidden = hideS;
      if (hideS) staff.setAttribute("hidden", "");
      else staff.removeAttribute("hidden");
    }
    if (tabP) {
      tabP.classList.toggle("is-active", next === "personal");
      tabP.classList.toggle("vc-notify-filter-btn--on", next === "personal");
      tabP.setAttribute("aria-selected", next === "personal" ? "true" : "false");
    }
    if (tabS) {
      tabS.classList.toggle("is-active", next === "staff");
      tabS.classList.toggle("vc-notify-filter-btn--on", next === "staff");
      tabS.setAttribute("aria-selected", next === "staff" ? "true" : "false");
    }
    if (next === "personal") hideInboxToast();
  }

  function showStaffDenied(msg) {
    var gate = byId("vc-notif-staff-gate");
    var inbox = byId("vc-staff-inbox");
    if (gate) {
      gate.hidden = false;
      var p = gate.querySelector(".vc-notif-staff-gate__msg");
      if (p) p.textContent = msg || "Accesso staff non disponibile.";
    }
    if (inbox) inbox.hidden = true;
  }

  function hideStaffDenied() {
    var gate = byId("vc-notif-staff-gate");
    var inbox = byId("vc-staff-inbox");
    if (gate) gate.hidden = true;
    if (inbox) inbox.hidden = false;
  }

  function loadCss(href) {
    return new Promise(function (resolve) {
      try {
        var existing = document.querySelector('link[data-vc-notif-staff-css="' + href + '"]');
        if (existing) {
          resolve();
          return;
        }
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = href;
        link.setAttribute("data-vc-notif-staff-css", href);
        link.onload = function () {
          resolve();
        };
        link.onerror = function () {
          resolve();
        };
        document.head.appendChild(link);
      } catch (e) {
        resolve();
      }
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      try {
        if (document.querySelector('script[data-vc-notif-staff-js="' + src + '"]')) {
          resolve();
          return;
        }
        var s = document.createElement("script");
        s.src = src;
        s.defer = true;
        s.setAttribute("data-vc-notif-staff-js", src);
        s.onload = function () {
          resolve();
        };
        s.onerror = function () {
          reject(new Error("load fail " + src));
        };
        document.body.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function ensureStaffConfig() {
    if (!window.__VC_STAFF_ACCESS || typeof window.__VC_STAFF_ACCESS !== "object") {
      window.__VC_STAFF_ACCESS = {
        apiUrl: "/webhooks/site-staff-access",
        apiUrlLocal: "",
      };
    }
    if (!window.__VC_STAFF_WORKFLOWS || typeof window.__VC_STAFF_WORKFLOWS !== "object") {
      window.__VC_STAFF_WORKFLOWS = {
        apiUrl: "/webhooks/site-staff-workflows",
        apiUrlLocal: "",
      };
    }
    if (!window.__VC_STAFF_WORKFLOW_CHAT || typeof window.__VC_STAFF_WORKFLOW_CHAT !== "object") {
      window.__VC_STAFF_WORKFLOW_CHAT = {
        apiUrl: "/webhooks/site-staff-workflow-chat",
        apiUrlLocal: "",
      };
    }
    window.__VC_STAFF_INBOX_EMBED = true;
  }

  function workflowApiUrl() {
    ensureStaffConfig();
    var api = "/webhooks/site-staff-workflows";
    try {
      var cfg = window.__VC_STAFF_WORKFLOWS || {};
      var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(location.hostname || ""));
      api =
        String((isLocal && cfg.apiUrlLocal ? cfg.apiUrlLocal : cfg.apiUrl) || api).trim() || api;
    } catch (eCfg) {}
    return api;
  }

  function prefetchInboxSummary() {
    if (summaryPrefetchPromise) return summaryPrefetchPromise;
    var token = readToken();
    if (!token) return Promise.resolve(null);
    summaryPrefetchPromise = fetch(
      workflowApiUrl() + (workflowApiUrl().indexOf("?") >= 0 ? "&" : "?") + "queue=summary",
      {
        method: "GET",
        credentials: "include",
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store",
      },
    )
      .then(function (res) {
        return res.json().then(function (body) {
          return { okHttp: res.ok, body: body };
        });
      })
      .then(function (out) {
        if (out && out.body && out.body.ok && out.body.summary) {
          window.__VC_INBOX_SUMMARY_PREFETCH = out.body;
          try {
            var cachePayload = {
              summary: out.body.summary,
              permissions: out.body.permissions,
              at: Date.now(),
            };
            sessionStorage.setItem("vc_inbox_summary_v1", JSON.stringify(cachePayload));
            localStorage.setItem("vc_inbox_summary_local_v1", JSON.stringify(cachePayload));
          } catch (eCache) {}
          try {
            window.dispatchEvent(new CustomEvent("vc:inbox-summary-ready", { detail: out.body }));
          } catch (eEv) {}
          return out.body;
        }
        return null;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        window.setTimeout(function () {
          summaryPrefetchPromise = null;
        }, 0);
      });
    return summaryPrefetchPromise;
  }

  function warmInboxPrefetch() {
    if (!readToken()) return;
    var tabOrder = ["pause", "candidature", "appelli", "resoconti"];
    prefetchInboxSummary()
      .then(function (body) {
        if (!body || !body.summary) return null;
        var targetTab = "";
        for (var i = 0; i < tabOrder.length; i += 1) {
          if (Number(body.summary[tabOrder[i]] || 0) > 0) {
            targetTab = tabOrder[i];
            break;
          }
        }
        if (!targetTab) return null;
        var token = readToken();
        if (!token) return null;
        var url =
          workflowApiUrl() +
          (workflowApiUrl().indexOf("?") >= 0 ? "&" : "?") +
          "queue=" +
          encodeURIComponent(targetTab) +
          "&scope=pending&page=1&pageSize=20";
                var prefetchCtrl =
          typeof AbortController !== "undefined" ? new AbortController() : null;
        var prefetchTimer = window.setTimeout(function () {
          try {
            if (prefetchCtrl) prefetchCtrl.abort();
          } catch (eAbortPf) {}
        }, 8000);
        var prefetchPromise = fetch(url, {
          method: "GET",
          credentials: "include",
          headers: { Authorization: "Bearer " + token, Accept: "application/json" },
          cache: "no-store",
          signal: prefetchCtrl ? prefetchCtrl.signal : undefined,
        })
          .then(function (res) {
            return res
              .json()
              .catch(function () {
                return null;
              })
              .then(function (data) {
                var out = { res: { ok: res.ok, status: res.status }, data: data };
                var items = data && Array.isArray(data.items) ? data.items : [];
                var pendingCount = Number(
                  (data && data.summary && data.summary[targetTab]) || body.summary[targetTab] || 0,
                );
                if (!items.length && pendingCount > 0) out._staleEmpty = true;
                return out;
              });
          })
          .catch(function () {
            return null;
          })
          .finally(function () {
            window.clearTimeout(prefetchTimer);
          });
        window.__VC_INBOX_QUEUE_PREFETCH = {
          tab: targetTab,
          scope: "pending",
          page: 1,
          at: Date.now(),
          promise: prefetchPromise,
        };
        return prefetchPromise;
      })
      .catch(function () {});
  }

  function readToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var shared = String(window.__vcDiscordGetAccessToken() || "").trim();
        if (shared) return shared;
      }
      var t = String(localStorage.getItem(TOKEN_KEY) || "").trim();
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function softStaffAccess() {
    if (accessPromise) return accessPromise;
    if (window.__VC_STAFF_PERMS && window.__VC_STAFF_PERMS.ok) {
      window.__VC_ACCESS_OK = true;
      window.__VC_STAFF_MENU_ALLOWED = true;
      try {
        window.dispatchEvent(
          new CustomEvent("vc:staff-access-ok", { detail: window.__VC_STAFF_PERMS }),
        );
      } catch (e0) {}
      return Promise.resolve(true);
    }
    if (warmStaffFromCache()) {
      window.__VC_ACCESS_OK = true;
      try {
        window.dispatchEvent(
          new CustomEvent("vc:staff-access-ok", {
            detail: window.__VC_STAFF_PERMS || { ok: true },
          }),
        );
      } catch (eWarmEv) {}
      warmInboxPrefetch();
      softStaffAccessNetwork().catch(function () {});
      return Promise.resolve(true);
    }
    accessPromise = softStaffAccessNetwork().finally(function () {
      window.setTimeout(function () {
        accessPromise = null;
      }, 0);
    });
    return accessPromise;
  }

  function softStaffAccessNetwork() {
    var token = readToken();
    if (!token) return Promise.resolve(false);
    var api = "/webhooks/site-staff-access";
    try {
      var cfg = window.__VC_STAFF_ACCESS || {};
      var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(location.hostname || ""));
      api =
        String((isLocal && cfg.apiUrlLocal ? cfg.apiUrlLocal : cfg.apiUrl) || api).trim() || api;
    } catch (eCfg) {}
    return fetch(api, {
      method: "GET",
      credentials: "include",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      cache: "no-store",
    })
      .then(function (res) {
        return res.json().then(function (body) {
          return { okHttp: res.ok, body: body };
        });
      })
      .then(function (out) {
        var body = out && out.body;
        if (body && body.ok) {
          window.__VC_STAFF_PERMS = body;
          window.__VC_STAFF_MENU_ALLOWED = true;
          window.__VC_ACCESS_OK = true;
          try {
            var fp = String(token).slice(0, 24);
            sessionStorage.setItem(
              "vc_menu_staff_v1",
              JSON.stringify({ allowed: true, payload: body, fp: fp, at: Date.now() }),
            );
            sessionStorage.setItem(
              "vc_staff_access_ok_v2",
              JSON.stringify({ ok: true, exp: Date.now() + 300000 }),
            );
          } catch (eCache) {}
          try {
            window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: body }));
          } catch (e1) {}
          warmInboxPrefetch();
          return true;
        }
        return false;
      })
      .catch(function () {
        return false;
      });
  }

  function ensureStaffAssetsDeferred() {
    if (staffDeferredPromise) return staffDeferredPromise;
    staffDeferredPromise = Promise.all([
      loadScript("/js/staff-punti-tolti-page.js?v=" + ASSET_V),
      loadScript("/js/vc-discord-avatar.js?v=" + ASSET_V),
      loadScript("/js/vc-avatar-fallback.js?v=" + ASSET_V),
      loadScript("/js/vc-emoji-render.js?v=20260824emoji1"),
      loadScript("/js/vc-site-toast.js?v=20260825siteToast1"),
      loadScript("/js/vc-dialog.js?v=20260826dialog1"),
      loadScript("/js/vc-emoji-picker.js?v=20260825subjChat1"),
    ]).catch(function () {});
    return staffDeferredPromise;
  }

  function ensureStaffAssetsCritical() {
    if (staffCriticalPromise) return staffCriticalPromise;
    ensureStaffConfig();
        var cssPromise = Promise.all([
      loadCss("/css/staff-pause.css?v=" + ASSET_V),
      loadCss("/css/notif-staff-embed.css?v=" + ASSET_V),
      loadCss("/css/vc-workflow-chat.css?v=" + ASSET_V),
    ]);
    var jsPromise = loadScript("/js/staff-tools-common.js?v=" + ASSET_V)
      .then(function () {
        return loadScript("/js/vc-chat-typing.js?v=" + ASSET_V);
      })
      .then(function () {
        return loadScript("/js/vc-workflow-chat.js?v=" + ASSET_V);
      })
      .then(function () {
        return loadScript("/js/staff-inbox-page.js?v=" + ASSET_V);
      });
    staffCriticalPromise = Promise.all([cssPromise, jsPromise]).then(function () {
      return true;
    });
    return staffCriticalPromise;
  }

  function ensureStaffAssets() {
    if (staffAssetsPromise) return staffAssetsPromise;
    staffAssetsPromise = ensureStaffAssetsCritical().then(function () {
      ensureStaffAssetsDeferred();
      return true;
    });
    return staffAssetsPromise;
  }

  function showInboxBootPlaceholder() {
    try {
                  if (staffBooted) {
        var panelDone = byId("vc-staff-inbox");
        if (panelDone) {
          panelDone.hidden = false;
          panelDone.removeAttribute("hidden");
        }
        return;
      }
    } catch (eKeep) {}
    try {
      var panel = byId("vc-staff-inbox");
      if (panel) {
        panel.classList.add("is-booting");
        panel.hidden = false;
      }
      var list = byId("vc-staff-inbox-list");
      if (list) {
        list.hidden = false;
        list.classList.add("is-loading");
        list.setAttribute("aria-busy", "true");
        list.innerHTML =
          '<div class="vc-staff-inbox-loading" role="status" aria-live="polite">' +
          '<div class="vc-staff-inbox-loading__head">' +
          '<span class="vc-staff-inbox-loading__spinner" aria-hidden="true"></span>' +
          "<p>Caricamento inbox staff\u2026</p></div>" +
          '<div class="vc-staff-inbox-loading__skel">' +
          '<div class="vc-staff-inbox-loading__card"></div>' +
          '<div class="vc-staff-inbox-loading__card"></div>' +
          '<div class="vc-staff-inbox-loading__card"></div>' +
          "</div></div>";
      }
      var el = byId("vc-staff-inbox-loading");
      if (!el) {
        el = document.createElement("div");
        el.id = "vc-staff-inbox-loading";
        el.className = "vc-staff-loading vc-staff-loading--hidden";
        el.setAttribute("role", "status");
        el.setAttribute("aria-live", "polite");
        el.innerHTML =
          '<div class="vc-staff-loading__card">' +
          '<p class="vc-staff-loading__text">Caricamento inbox staff\u2026</p>' +
          '<p class="vc-staff-loading__hint" id="vc-staff-inbox-loading-hint">Pause · Candidature · Appelli · Resoconti</p>' +
          "</div>";
        var host = byId("vc-notif-pane-staff") || document.body;
        host.insertBefore(el, host.firstChild);
      }
      el.hidden = false;
      el.removeAttribute("hidden");
      el.classList.remove("vc-staff-loading--hidden");
      try {
        window.__VC_INBOX_FS_GATE_HOLD = true;
        document.documentElement.classList.add("vc-notif-staff-loading");
      } catch (eCls) {}
      try {
        if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
      } catch (eSync) {}
      var boot = byId("vc-staff-inbox-boot");
      if (boot) boot.remove();
            try {
        window.clearTimeout(window.__vcNotifStaffLoadWatch);
        var watchMs =
          window.matchMedia && window.matchMedia("(max-width: 820px), (pointer: coarse)").matches
            ? 9000
            : 14000;
        window.__vcNotifStaffLoadWatch = window.setTimeout(function () {
          try {
            var still = byId("vc-staff-inbox-loading");
            var root = document.documentElement;
            var gateUp =
              (root && root.classList.contains("vc-notif-staff-loading")) ||
              window.__VC_INBOX_FS_GATE_HOLD ||
              (still && !still.hidden && !still.classList.contains("vc-staff-loading--hidden"));
            if (!gateUp) return;
            /* Always lift — staffBooted used to skip and leave mobile blank forever. */
            hideInboxBootOverlay(true);
            if (
              window.VCStaffInboxEmbed &&
              typeof window.VCStaffInboxEmbed.forceRelease === "function"
            ) {
              window.VCStaffInboxEmbed.forceRelease();
            } else if (
              window.VCStaffInboxEmbed &&
              typeof window.VCStaffInboxEmbed.boot === "function"
            ) {
              window.VCStaffInboxEmbed.boot();
            }
          } catch (eWatch) {}
        }, watchMs);
      } catch (eWatchArm) {}
    } catch (eBootPh) {}
  }

  function bootStaffInbox() {
    if (staffBooted) {
      try {
        if (window.VCStaffInboxEmbed && typeof window.VCStaffInboxEmbed.boot === "function") {
          window.VCStaffInboxEmbed.boot();
        }
      } catch (eReboot) {}
      return Promise.resolve(true);
    }
    staffBooting = true;
    try {
      document.body.classList.add("vc-notif-scope-staff");
    } catch (eEarlyClass) {}
    applyPaneVisibility("staff");
    showInboxBootPlaceholder();
        var assetsP = ensureStaffAssetsCritical();
    var accessP = softStaffAccess();
    return Promise.all([assetsP, accessP])
      .then(function (results) {
        var ok = results[1];
        if (!ok && !canStaff()) {
          showStaffDenied("Serve un account staff autenticato per vedere l'inbox.");
          return false;
        }
        hideStaffDenied();
        staffBooted = true;
        window.__VC_ACCESS_OK = true;
        try {
          document.body.classList.add("vc-notif-scope-staff");
        } catch (eClass) {}
        applyPaneVisibility("staff");
        hideStaffDenied();
        try {
          window.dispatchEvent(
            new CustomEvent("vc:staff-access-ok", {
              detail: window.__VC_STAFF_PERMS || { ok: true },
            }),
          );
        } catch (e2) {}
        emitScope("staff");
        try {
          if (window.VCStaffInboxEmbed && typeof window.VCStaffInboxEmbed.boot === "function") {
            window.VCStaffInboxEmbed.boot();
          }
        } catch (eBoot) {}
                try {
          ensureStaffAssetsDeferred();
        } catch (eDef) {}
        return true;
      })
      .finally(function () {
        staffBooting = false;
      });
  }

  function flattenNotifCineHero() {
    try {
      var body = document.body;
      if (!body || !body.classList.contains("vc-notifications-page")) return;
      body.classList.remove("vc-page-cine-layout");
      var cues = document.querySelectorAll(".vc-home-scrollcue");
      for (var c = 0; c < cues.length; c++) {
        cues[c].hidden = true;
        cues[c].classList.add("is-away");
        try {
          cues[c].remove();
        } catch (eRm) {}
      }
      var heroes = document.querySelectorAll(".vc-notify-hero, .vc-page-cine-hero, .vc-notif-page-head");
      for (var h = 0; h < heroes.length; h++) {
        var hero = heroes[h];
        hero.classList.remove(
          "vc-page-cine-hero",
          "vc-home-cine-hero",
          "is-collapsed",
          "vc-hero-scroll-clip",
          "vc-home-panel",
          "vc-fx-card",
          "vc-page-cine-card",
          "vc-home-rise",
          "is-in",
          "is-tilting",
        );
        var panels = hero.querySelectorAll(".vc-page-cine-hero-panel, .vc-hero-head");
        for (var p = 0; p < panels.length; p++) {
          panels[p].classList.remove("vc-page-cine-hero-panel", "vc-home-panel", "vc-fx-card", "vc-page-cine-card");
        }
      }
      var wrapIds = [
        "vc-notif-pane-personal",
        "vc-notif-pane-staff",
        "vc-notif-scope-dock",
        "vc-staff-inbox",
        "vc-page-content",
      ];
      for (var w = 0; w < wrapIds.length; w++) {
        var wrap = document.getElementById(wrapIds[w]);
        if (!wrap || !wrap.classList) continue;
        wrap.classList.remove(
          "vc-home-panel",
          "vc-fx-card",
          "vc-page-cine-card",
          "vc-home-rise",
          "is-in",
          "is-tilting",
          "vc-page-cine-body",
        );
        try {
          var sheens = wrap.querySelectorAll(":scope > .vc-fx-sheen");
          for (var s = 0; s < sheens.length; s++) sheens[s].remove();
        } catch (eSh) {}
      }
      var mains = document.querySelectorAll("main.vc-page-cine-main, main.vc-notifications-main");
      for (var m = 0; m < mains.length; m++) {
        mains[m].classList.remove("vc-page-cine-main");
        mains[m].classList.add("vc-notifications-main");
      }
    } catch (eFlat) {}
  }

  function placeDockInContent() {
    var dock = byId("vc-notif-scope-dock");
    if (!dock) return false;
    dock.classList.add("vc-notif-scope-dock--content");
    dock.classList.remove("vc-notif-scope-dock--fixed", "vc-notif-scope-dock--in-hero", "is-scrolled-away");
    flattenNotifCineHero();
    var main = document.querySelector("main.vc-notifications-main, main");
    var personal = byId("vc-notif-pane-personal");
    try {
      if (main) {
        var heading = byId("vc-notify-hero-heading");
        var anchor = heading && heading.parentElement === main ? heading.nextSibling : main.firstChild;
        if (personal && personal.parentElement === main) {
          main.insertBefore(dock, personal);
        } else if (anchor) {
          main.insertBefore(dock, anchor);
        } else {
          main.appendChild(dock);
        }
        return true;
      }
    } catch (eIns) {}
    return Boolean(dock.isConnected);
  }

  function schedulePlaceDock() {
    if (isPersonalBootPending()) return;
    placeDockInContent();
    if (placeTries >= 24) return;
    placeTries += 1;
    window.setTimeout(schedulePlaceDock, placeTries < 8 ? 120 : 350);
  }

  function setScope(next, opts) {
    var want = next === "staff" ? "staff" : "personal";
    if (want === "staff" && !canStaff()) {
            showInboxBootPlaceholder();
      applyPaneVisibility("staff");
      writeTabToUrl("staff");
      softStaffAccess().then(function (ok) {
        if (ok) {
          revealTabs();
          setScope("staff", { push: opts && opts.push === false ? false : true });
        } else {
          hideInboxBootOverlay();
          setScope("personal", { push: true });
        }
      });
      return;
    }
    scope = want;
        if (!opts || opts.push !== false) writeTabToUrl(scope);
    if (!opts || opts.remember !== false) writeScopePref(scope);
    applyPaneVisibility(scope);
    placeDockInContent();
    emitScope(scope);
    if (scope === "personal") {
      hideInboxToast();
      return;
    }
    if (scope === "staff") {
      bootStaffInbox().catch(function () {
        showStaffDenied("Impossibile caricare l'inbox staff.");
      });
    }
  }

  function revealTabs() {
    if (isPersonalBootPending()) return;
    var dock = byId("vc-notif-scope-dock");
    var tabs = byId("vc-notif-scope-tabs");
    placeDockInContent();
    if (!canStaff()) {
            var staffNav = document.querySelector(
        "[data-vc-staff-tools-nav], .vc-snav-details--staff, #discord-staff-link:not([hidden])",
      );
      if (!staffNav && window.__VC_STAFF_MENU_ALLOWED !== true) {
        if (dock) {
          dock.hidden = true;
          dock.setAttribute("hidden", "");
        }
        if (tabs) tabs.hidden = true;
        return;
      }
    }
    if (dock) {
      dock.hidden = false;
      dock.removeAttribute("hidden");
    }
    if (tabs) {
      tabs.hidden = false;
      tabs.removeAttribute("hidden");
    }
    placeDockInContent();
  }

  function bindTabs() {
    if (window.__vcNotifScopeTabsBound) return;
    window.__vcNotifScopeTabsBound = true;
    document.addEventListener(
      "click",
      function (ev) {
        var btn =
          ev.target && ev.target.closest
            ? ev.target.closest("#vc-notif-scope-tabs [data-scope]")
            : null;
        if (!btn) return;
        ev.preventDefault();
        ev.stopPropagation();
        var next = btn.getAttribute("data-scope");
        if (next === "staff" || next === "personal") setScope(next);
      },
      true,
    );
    document.addEventListener(
      "pointerenter",
      function (ev) {
        var tab =
          ev.target && ev.target.closest ? ev.target.closest("#vc-notif-tab-staff[data-scope]") : null;
        if (!tab) return;
        preloadStaffInboxAssets();
      },
      true,
    );
    document.addEventListener(
      "touchstart",
      function (ev) {
        var tab =
          ev.target && ev.target.closest ? ev.target.closest("#vc-notif-tab-staff[data-scope]") : null;
        if (!tab) return;
        preloadStaffInboxAssets();
      },
      { capture: true, passive: true },
    );
  }

  function boot() {
    var initial = preferInitialScope();
    if (scope === "staff") initial = "staff";
    try {
      if (initial === "staff") {
        scope = "staff";
        document.body.classList.add("vc-notif-scope-staff");
        document.documentElement.classList.add("vc-notif-early-staff", "vc-notif-staff-loading");
        window.__VC_NOTIF_EARLY_STAFF = true;
        showInboxBootPlaceholder();
        applyPaneVisibility("staff");
      } else {
        scope = "personal";
        document.body.classList.remove("vc-notif-scope-staff");
        document.documentElement.classList.remove("vc-notif-early-staff", "vc-notif-staff-loading");
        window.__VC_NOTIF_EARLY_STAFF = false;
      }
    } catch (eEarlyBody) {}
    flattenNotifCineHero();
    bindTabs();
    if (initial !== "staff") clearEarlyStaffClass();
    warmStaffFromCache();
    if (initial === "staff") {
      writeTabToUrl("staff");
      try {
        ensureStaffConfig();
        ensureStaffAssetsCritical();
        warmInboxPrefetch();
      } catch (ePrefetch) {}
      revealTabs();
      schedulePlaceDock();
            softStaffAccess()
        .then(function (ok) {
          revealTabs();
          if (ok || canStaff()) {
            return bootStaffInbox();
          }
          hideInboxBootOverlay(true);
          setScope("personal", { push: true });
          return null;
        })
        .catch(function () {
          hideInboxBootOverlay(true);
          showStaffDenied("Impossibile caricare l'inbox staff.");
        });
    } else {
      softStaffAccess().catch(function () {});
      prefetchStaffInboxForPersonal();
      setScope("personal", { push: false, remember: false });
      try {
        if (document.documentElement.classList.contains("vc-page-cine-ready")) {
          markPersonalBootReady();
        }
      } catch (ePersonalReady) {}
      var bootPoll = 0;
      var bootPollId = window.setInterval(function () {
        bootPoll += 1;
        try {
          if (document.documentElement.classList.contains("vc-page-cine-ready") || bootPoll > 50) {
            window.clearInterval(bootPollId);
            markPersonalBootReady();
          }
        } catch (ePoll) {
          window.clearInterval(bootPollId);
        }
      }, 80);
    }
    var poll = 0;
    var pollId = window.setInterval(function () {
      poll += 1;
      flattenNotifCineHero();
      if (canStaff()) {
        if (!isPersonalBootPending()) revealTabs();
        window.clearInterval(pollId);
      } else if (poll > 40) {
        window.clearInterval(pollId);
      }
    }, 120);
  }

  function teardownNotifStaffTabAfterLogout() {
    try {
      window.__VC_NOTIF_EARLY_STAFF = false;
      document.documentElement.classList.remove(
        "vc-notif-early-staff",
        "vc-notif-staff-loading",
        "vc-notif-boot-personal",
      );
    } catch (eEarly) {}
    scope = "personal";
    try {
      writeTabToUrl("personal");
      writeScopePref("personal");
    } catch (eUrl) {}
    applyPaneVisibility("personal");
    hideInboxBootOverlay(true);
    var dock = byId("vc-notif-scope-dock");
    var tabs = byId("vc-notif-scope-tabs");
    if (dock) {
      dock.hidden = true;
      dock.setAttribute("hidden", "");
    }
    if (tabs) {
      tabs.hidden = true;
      tabs.setAttribute("hidden", "");
    }
  }

  window.addEventListener("vc:staff-access-ok", function () {
    revealTabs();
    warmInboxPrefetch();
    if (readTabFromUrl() === "staff" && scope !== "staff") setScope("staff", { push: false });
  });
  window.addEventListener("vc:auth-logout", function () {
    teardownNotifStaffTabAfterLogout();
  });
  window.addEventListener("vc-discord-profile", function () {
    if (!readToken()) {
      teardownNotifStaffTabAfterLogout();
      return;
    }
    softStaffAccess().then(function () {
      revealTabs();
    });
    warmInboxPrefetch();
    if (scope === "staff" && staffBooted) {
      try {
        if (window.VCStaffInboxEmbed && typeof window.VCStaffInboxEmbed.boot === "function") {
          window.VCStaffInboxEmbed.boot();
        }
      } catch (eProfBoot) {}
    }
  });
  document.addEventListener("vc:page-cine-ready", function () {
    flattenNotifCineHero();
    placeTries = 0;
    var wantStaff = false;
    try {
      wantStaff =
        scope === "staff" ||
        readTabFromUrl() === "staff" ||
        document.documentElement.classList.contains("vc-notif-early-staff") ||
        document.documentElement.classList.contains("vc-notif-staff-loading") ||
        Boolean(window.__VC_NOTIF_EARLY_STAFF);
    } catch (eWant) {}
    if (wantStaff) {
      scope = "staff";
      applyPaneVisibility("staff");
            if (staffBooted) {
        var listPainted = byId("vc-staff-inbox-list");
        var hasPaint =
          listPainted &&
          listPainted.querySelector &&
          listPainted.querySelector(".vc-staff-inbox-items, .vc-staff-inbox-empty, .vc-staff-pt-inbox-host");
        if (hasPaint) hideInboxBootOverlay();
        try {
          if (window.VCStaffInboxEmbed && typeof window.VCStaffInboxEmbed.boot === "function") {
            window.VCStaffInboxEmbed.boot();
          }
        } catch (eCineBoot) {}
      } else {
        showInboxBootPlaceholder();
      }
      schedulePlaceDock();
      revealTabs();
      return;
    }
    applyPaneVisibility(scope);
    if (scope === "personal") {
      hideInboxToast();
      markPersonalBootReady();
      return;
    }
    schedulePlaceDock();
    revealTabs();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  try {
    window.VcNotifScope = {
      getScope: function () {
        return scope === "staff" ? "staff" : "personal";
      },
      setScope: setScope,
      canStaff: canStaff,
      revealTabs: revealTabs,
    };
  } catch (eExport) {}

    try {
    if (window.__VC_NOTIF_EARLY_STAFF || document.documentElement.classList.contains("vc-notif-early-staff")) {
      ensureStaffConfig();
      ensureStaffAssets();
      softStaffAccess().catch(function () {});
    }
  } catch (ePrefetchNow) {}
})();
