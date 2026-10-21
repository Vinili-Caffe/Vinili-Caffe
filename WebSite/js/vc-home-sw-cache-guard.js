(function () {
      try {
        /* swBackPwa1: SW di nuovo OK in PWA (push /sw-m1.js). Kill solo Cache thrash lato pagina. */
        if ("scrollRestoration" in history) history.scrollRestoration = "manual";
      } catch (e0) {}
      try {
        /* fgRevertBgOnly1: niente nuke in-app; solo marca shell PWA per resume */
        try {
          document.documentElement.classList.remove(
            "vc-pwa-cpu-nuke",
            "vc-cpu-settle",
            "vc-soft-fx-off",
          );
        } catch (eClrNuke) {}
        try {
          window.__VC_FORCE_PHOTO_STILL = 0;
          window.__VC_PWA_FREEZE_ALL_GIF = 0;
          window.__VC_PWA_CPU_NUKE = 0;
        } catch (eClrFlag) {}
      } catch (eStillBoot) {}
      try {
        /* pwaResumeWin1: Windows Edge/Chrome — minimal-ui + no wipe resume */
        function vcMq(mode) {
          try {
            return Boolean(window.matchMedia && window.matchMedia("(display-mode: " + mode + ")").matches);
          } catch (eM) {
            return false;
          }
        }
        var standalone2 =
          vcMq("standalone") ||
          vcMq("fullscreen") ||
          vcMq("minimal-ui") ||
          vcMq("window-controls-overlay") ||
          Boolean(navigator.standalone);
        try {
          if (standalone2) localStorage.setItem("vc-pwa-shell", "1");
        } catch (eShell) {}
        if (!standalone2) {
          try {
            if (localStorage.getItem("vc-pwa-shell") === "1") standalone2 = true;
          } catch (eShell2) {}
        }
        if (!standalone2) return;
        var search = String(window.location.search || "");
        var pathNow = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
        if (/[?&]code=/.test(search) || /[?&]state=/.test(search)) return;
        if (pathNow !== "/") return;
        /* pushOpenCold1: pending push (notificationclick) batte resume icona */
        /* pushOpenCold2: poll pending ~2s — Android apre start_url PRIMA che lo SW scriva la cache */
        (function resumeAfterPendingPush() {
          var PENDING_CACHE = "vc-pending-nav-v1";
          var PENDING_URL = "/__vc/pending-nav";
          var RETRIES = [0, 80, 200, 450, 900, 1600];
          function isColdStartHome() {
            try {
              if (window.__vcPwaColdApp) return true;
              var coldAt = Number(sessionStorage.getItem("vc-pwa-cold-app") || "0") || 0;
              if (coldAt > 0 && Date.now() - coldAt < 20000) return true;
            } catch (eCold) {}
            if (/[?&]app=/.test(search)) return true;
            try {
              var nav = performance.getEntriesByType && performance.getEntriesByType("navigation");
              if (nav && nav[0] && nav[0].type === "reload") return false;
            } catch (eN) {}
            try {
              if (document.referrer) {
                var rh = String(new URL(document.referrer).hostname || "").toLowerCase();
                var hereH = String(window.location.hostname || "").toLowerCase();
                if (rh && (rh === hereH || rh.indexOf("viniliecaffe.") !== -1)) return false;
              }
            } catch (eR) {}
            /* Icona PWA Windows a volte apre / senza ?app= */
            return true;
          }
          function runResume() {
            try {
              var wantHome = false;
              try {
                if (sessionStorage.getItem("vc-pwa-want-home") === "1") {
                  sessionStorage.removeItem("vc-pwa-want-home");
                  wantHome = true;
                }
              } catch (eS) {}
              try {
                var wantRaw = localStorage.getItem("vc-pwa-want-home");
                if (wantRaw) {
                  localStorage.removeItem("vc-pwa-want-home");
                  var wantData = null;
                  try {
                    wantData = JSON.parse(wantRaw);
                  } catch (eP) {
                    wantData = null;
                  }
                  var wantAt = Number(wantData && wantData.t) || 0;
                  if (!wantAt || Date.now() - wantAt < 60000) wantHome = true;
                }
              } catch (eL) {}
              if (wantHome) {
                localStorage.setItem("vc-pwa-resume", JSON.stringify({ p: "/", t: Date.now() }));
                return;
              }
              /* pwaResumeWin1: NON azzerare resume se manca ?app= */
              if (!isColdStartHome()) return;
              var data = JSON.parse(localStorage.getItem("vc-pwa-resume") || "null");
              var path = String((data && data.p) || "");
              var at = Number(data && data.t) || 0;
              if (!path || path === "/" || path.charAt(0) !== "/") return;
              if (/^\/\//.test(path) || path.indexOf("://") !== -1 || path.indexOf("\\") !== -1) return;
              if (path.length > 240 || Date.now() - at > 2 * 60 * 60 * 1000) return;
              var go = path;
              try {
                var pu = new URL(path, window.location.origin);
                if (pu.origin !== window.location.origin) return;
                var pn = String(pu.pathname || "/").replace(/\/+$/, "") || "/";
                if (pn === "/vote" || pn === "/faq" || /\/accesso-richiesto$/i.test(pn)) return;
                go = pu.pathname + pu.search + pu.hash;
                var here = window.location.pathname + window.location.search + window.location.hash;
                if (here === go) return;
              } catch (ePu) {
                return;
              }
              try {
                document.documentElement.style.background = "#100c09";
                document.documentElement.style.colorScheme = "dark";
              } catch (ePaint) {}
              window.location.replace(go);
            } catch (eResume) {}
          }
          function pendingPathFrom(data) {
            /* pushOpenDestFix1 */
            var url = String((data && data.url) || "").trim();
            var tid = String((data && data.ticketId) || "").trim();
            var pathOnly = "";
            try {
              if (url) {
                var probe = new URL(url, window.location.origin);
                pathOnly = String(probe.pathname || "/").replace(/\/+$/, "") || "/";
              }
            } catch (eP) {}
            if (/^[a-f0-9]{24}$/i.test(tid) && (!url || pathOnly === "/")) {
              var staff = /[?&]view=staff\b/i.test(url);
              return (
                "/tickets/" +
                (staff ? "?view=staff&" : "?") +
                "ticketId=" +
                encodeURIComponent(tid) +
                "#" +
                tid
              );
            }
            if (!url) return "";
            try {
              var u = new URL(url, window.location.origin);
              var host = String(u.hostname || "").toLowerCase();
              var hereHost = String(window.location.hostname || "").toLowerCase();
              var sameVinili =
                u.origin === window.location.origin ||
                (/^(?:www\.)?viniliecaffe\.(?:it|gg)$/.test(host) &&
                  /^(?:www\.)?viniliecaffe\.(?:it|gg)$/.test(hereHost));
              if (!sameVinili) return "";
              return u.pathname + u.search + u.hash;
            } catch (eU) {
              return "";
            }
          }
          function alreadyOnPending(ppath) {
            if (!ppath) return true;
            try {
              var here = window.location.pathname + window.location.search + window.location.hash;
              if (here === ppath) return true;
              /* pushOpenCold2: NON bastare il solo pathname (ticketId/query contano) */
              var hu = new URL(here, window.location.origin);
              var pu = new URL(ppath, window.location.origin);
              return (
                hu.pathname.replace(/\/+$/, "") === pu.pathname.replace(/\/+$/, "") &&
                hu.search === pu.search &&
                hu.hash === pu.hash
              );
            } catch (eA) {
              return false;
            }
          }
          function readPendingOnce() {
            if (!("caches" in window)) return Promise.resolve(null);
            return caches
              .open(PENDING_CACHE)
              .then(function (cache) {
                return cache.match(PENDING_URL).then(function (res) {
                  if (!res) return null;
                  return res.json().then(function (pdata) {
                    var pat = Number(pdata && pdata.at) || 0;
                    if (pat && Date.now() - pat > 120000) {
                      return cache.delete(PENDING_URL).then(function () {
                        return null;
                      });
                    }
                    var ppath = pendingPathFrom(pdata);
                    if (!ppath || ppath === "/" || ppath.charAt(0) !== "/") {
                      return cache.delete(PENDING_URL).then(function () {
                        return null;
                      });
                    }
                    if (alreadyOnPending(ppath)) {
                      return cache.delete(PENDING_URL).then(function () {
                        return "";
                      });
                    }
                    return cache.delete(PENDING_URL).then(function () {
                      return ppath;
                    });
                  });
                });
              })
              .catch(function () {
                return null;
              });
          }
          function goPending(ppath) {
            try {
              document.documentElement.style.background = "#100c09";
              document.documentElement.style.colorScheme = "dark";
            } catch (ePaint2) {}
            window.location.replace(ppath);
          }
          if (!("caches" in window)) {
            runResume();
            return;
          }
          var done = false;
          var i = 0;
          /* pwaResumeWin1: non aspettare 2s su Windows — resume presto, push può ancora vincere prima */
          var resumeTimer = window.setTimeout(function () {
            if (done) return;
            done = true;
            runResume();
          }, 350);
          function tick() {
            if (done) return;
            readPendingOnce().then(function (ppath) {
              if (done) return;
              if (ppath) {
                done = true;
                try {
                  window.clearTimeout(resumeTimer);
                } catch (eT) {}
                goPending(ppath);
                return;
              }
              if (ppath === "") {
                done = true;
                try {
                  window.clearTimeout(resumeTimer);
                } catch (eT2) {}
                return;
              }
              i += 1;
              if (i >= RETRIES.length) {
                done = true;
                try {
                  window.clearTimeout(resumeTimer);
                } catch (eT3) {}
                runResume();
                return;
              }
              window.setTimeout(tick, RETRIES[i]);
            });
          }
          tick();
        })();
      } catch (e1) {}
    })();
