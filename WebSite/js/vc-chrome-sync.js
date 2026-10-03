(function (global) {
  "use strict";
  var VER = "20260928consoleErrFix1";
  if (global.__VC_CHROME_SYNC && global.__VC_CHROME_SYNC.ver === VER) {
    global.VcChromeSync = global.__VC_CHROME_SYNC;
    return;
  }
  /* navBadgeSyncAll5: bundle CDN con ?v= vecchia non deve downgradare */
  try {
    var prevSync = global.__VC_CHROME_SYNC && global.__VC_CHROME_SYNC.ver;
    if (prevSync && String(prevSync) > String(VER)) {
      global.VcChromeSync = global.__VC_CHROME_SYNC;
      return;
    }
  } catch (ePrev) {}

  var CHANNEL = "vc_chrome_widgets_v1";
  var LS_MIRROR = "vc_chrome_prefs_mirror_v1";
  var API = "/webhooks/site-chrome-prefs";
  var TAB_ID = "t" + Math.random().toString(36).slice(2, 10);
  var bc = null;
  var listeners = [];
  var serverTimer = 0;
  var serverPending = null;
  var applyingRemote = false;
  var hydratedServer = false;
  var pullInFlight = null;
  var pushInFlight = null;
  var lastPushAt = 0;
  /* lsGetStorm1: mirror in RAM — nav-badges chiamava get() a ogni MO (~20/s → Storage Service) */
  var mirrorMem = null;
  var mirrorMemReady = false;

  try {
    if (typeof BroadcastChannel === "function") bc = new BroadcastChannel(CHANNEL);
  } catch (eBc) {}

  function getToken() {
    try {
      if (typeof global.__vcDiscordGetAccessToken === "function") {
        return String(global.__vcDiscordGetAccessToken() || "").trim();
      }
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function readMirror() {
    if (mirrorMemReady) return mirrorMem || {};
    try {
      var raw = localStorage.getItem(LS_MIRROR);
      mirrorMem = raw ? JSON.parse(raw) : {};
      if (!mirrorMem || typeof mirrorMem !== "object") mirrorMem = {};
    } catch (e) {
      mirrorMem = {};
    }
    mirrorMemReady = true;
    return mirrorMem;
  }

  function writeMirror(prefs) {
    mirrorMem = prefs && typeof prefs === "object" ? prefs : {};
    mirrorMemReady = true;
    try {
      localStorage.setItem(LS_MIRROR, JSON.stringify(mirrorMem));
    } catch (e) {}
  }

  function notify(prefs, source) {
    applyingRemote = true;
    try {
      for (var i = 0; i < listeners.length; i += 1) {
        try {
          listeners[i](prefs, source || "remote");
        } catch (eL) {}
      }
    } finally {
      applyingRemote = false;
    }
  }

  function mergePrefs(base, incoming) {
    var out = Object.assign({}, base || {});
    var inc = incoming || {};
    var nested = ["kickPip", "twitchPip", "hogwartsBgm", "seratafilmBgm", "confessionaleBgm", "typeSfx", "navFeatSeen"];
    Object.keys(inc).forEach(function (key) {
      if (key === "navFeatSeen" && inc[key] && typeof inc[key] === "object") {
        var baseMap = out[key] && typeof out[key] === "object" ? out[key] : {};
        var nextMap = Object.assign({}, baseMap);
        Object.keys(inc[key]).forEach(function (p) {
          nextMap[p] = Math.max(Number(nextMap[p]) || 0, Number(inc[key][p]) || 0);
        });
        out[key] = nextMap;
      } else if (nested.indexOf(key) >= 0 && inc[key] && typeof inc[key] === "object") {
        out[key] = Object.assign({}, out[key] || {}, inc[key]);
      } else {
        out[key] = inc[key];
      }
    });
    return out;
  }

  function publish(partial, opts) {
    if (applyingRemote) return;
    var next = mergePrefs(readMirror(), partial || {});
    next.updatedAt = Date.now();
    next.tabId = TAB_ID;
    writeMirror(next);
    try {
      if (bc) bc.postMessage({ type: "chrome-prefs", prefs: next, tabId: TAB_ID });
    } catch (eP) {}
    if (!opts || opts.server !== false) scheduleServerPush(next);
    return next;
  }

  function scheduleServerPush(prefs) {
    serverPending = prefs;
    if (serverTimer) return;
    serverTimer = global.setTimeout(function () {
      serverTimer = 0;
      var payload = serverPending;
      serverPending = null;
      pushServer(payload);
    }, 700);
  }

  function invalidateChromeCache() {
    try {
      if (global.VcApiCache && typeof global.VcApiCache.invalidateContains === "function") {
        global.VcApiCache.invalidateContains("site-chrome-prefs");
        global.VcApiCache.invalidateContains("chrome");
      }
    } catch (eInv) {}
  }

  function pushServer(prefs) {
    var token = getToken();
    if (!token || !prefs) return;
    if (global.VcApiCache && typeof global.VcApiCache.isWebhookBlocked === "function") {
      if (global.VcApiCache.isWebhookBlocked(API)) return;
    }
    try {
      if (typeof global.__vcWebhookGlobalBlockedUntil === "function") {
        if (Date.now() < Number(global.__vcWebhookGlobalBlockedUntil() || 0)) return;
      }
    } catch (eBlk) {}
    /* rateLimitCalm1: un POST alla volta; skip se push freschissimo */
    if (pushInFlight) {
      serverPending = prefs;
      return pushInFlight;
    }
    if (Date.now() - lastPushAt < 900) {
      scheduleServerPush(prefs);
      return;
    }
    pushInFlight = fetch(API, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ prefs: prefs }),
    })
      .then(function (r) {
        lastPushAt = Date.now();
        if (r && r.status === 429) {
          try {
            if (global.VcApiCache && typeof global.VcApiCache.noteWebhook429 === "function") {
              global.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "20"), API);
            }
          } catch (e429p) {}
          return;
        }
        /* rateLimitCalm1: invalida solo se OK (evita storm pull subito dopo POST fallito) */
        if (r && r.ok) invalidateChromeCache();
      })
      .catch(function () {})
      .finally(function () {
        pushInFlight = null;
        if (serverPending) {
          var again = serverPending;
          serverPending = null;
          scheduleServerPush(again);
        }
      });
    return pushInFlight;
  }

  function pullServer(force) {
    var token = getToken();
    if (!token) return;
    /* rateLimitCalm1: force = preferisci rete se idle, NON ignora cool-down / singleflight */
    if (pullInFlight) return pullInFlight;
    if (hydratedServer && !force) return;
    var blocked = false;
    try {
      if (global.VcApiCache && typeof global.VcApiCache.isWebhookBlocked === "function") {
        blocked = global.VcApiCache.isWebhookBlocked(API);
      }
    } catch (eB1) {}
    try {
      if (!blocked && typeof global.__vcWebhookGlobalBlockedUntil === "function") {
        blocked = Date.now() < Number(global.__vcWebhookGlobalBlockedUntil() || 0);
      }
    } catch (eB2) {}
    if (blocked) {
      /* usa mirror locale; non battere rete in 429 */
      try {
        notify(readMirror(), "blocked");
      } catch (eN) {}
      return;
    }
    if (force) {
      hydratedServer = false;
      /* non invalidate subito: lascia cache finché non arriva risposta fresca */
    }
    var cacheKey =
      global.VcApiCache && typeof global.VcApiCache.keyFor === "function"
        ? global.VcApiCache.keyFor(API, { scope: "chrome", auth: token })
        : "";
    function applyData(data) {
      if (!data || data.ok !== true || !data.prefs) return false;
      var local = readMirror();
      var remote = data.prefs || {};
      var remoteAt = Number(remote.updatedAt) || 0;
      var localAt = Number(local.updatedAt) || 0;
      var navUnion = mergePrefs(
        { navFeatSeen: (local && local.navFeatSeen) || {} },
        { navFeatSeen: (remote && remote.navFeatSeen) || {} }
      ).navFeatSeen;
      var merged = remoteAt >= localAt ? mergePrefs(local, remote) : mergePrefs(remote, local);
      if (navUnion && typeof navUnion === "object") merged.navFeatSeen = navUnion;
      writeMirror(merged);
      notify(merged, "server");
      if (localAt > remoteAt) pushServer(merged);
      return true;
    }
    function markHydratedOk() {
      hydratedServer = true;
    }
    if (global.VcApiCache && typeof global.VcApiCache.fetchWithCache === "function" && cacheKey) {
      pullInFlight = global.VcApiCache
        .fetchWithCache(cacheKey, API, {
          ttlMs: force ? 4000 : 30000,
          staleMs: force ? 8000 : 5 * 60 * 1000,
          auth: token,
          forceNetwork: !!force,
          useCache: true,
          fetchInit: {
            headers: { Authorization: "Bearer " + token },
            credentials: "omit",
            cache: "no-store",
          },
        })
        .then(function (payload) {
          if (payload && payload.status === 429) {
            try {
              if (global.VcApiCache && typeof global.VcApiCache.noteWebhook429 === "function") {
                global.VcApiCache.noteWebhook429(20, API);
              }
            } catch (e429c) {}
            return;
          }
          if (applyData(payload && payload.body ? payload.body : null)) markHydratedOk();
        })
        .catch(function () {})
        .finally(function () {
          pullInFlight = null;
        });
      return pullInFlight;
    }
    /* rateLimitCalm1: niente ?_=timestamp (rompeva singleflight del fetch gate) */
    pullInFlight = fetch(API, {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        if (r && r.status === 429) {
          try {
            if (global.VcApiCache && typeof global.VcApiCache.noteWebhook429 === "function") {
              global.VcApiCache.noteWebhook429(Number(r.headers.get("Retry-After") || "20"), API);
            }
          } catch (e429) {}
          return null;
        }
        return r.text().then(function (raw) {
          try {
            return raw && String(raw).trim() ? JSON.parse(raw) : null;
          } catch (eJ) {
            return null;
          }
        });
      })
      .then(function (data) {
        if (data && applyData(data)) markHydratedOk();
      })
      .catch(function () {})
      .finally(function () {
        pullInFlight = null;
      });
    return pullInFlight;
  }

  if (bc) {
    bc.onmessage = function (ev) {
      var msg = ev && ev.data;
      if (!msg || msg.type !== "chrome-prefs" || msg.tabId === TAB_ID) return;
      if (msg.prefs) {
        writeMirror(msg.prefs);
        notify(msg.prefs, "broadcast");
      }
    };
  }

  global.addEventListener("storage", function (ev) {
    if (!ev || ev.key !== LS_MIRROR || !ev.newValue) return;
    try {
      var prefs = JSON.parse(ev.newValue);
      mirrorMem = prefs && typeof prefs === "object" ? prefs : {};
      mirrorMemReady = true;
      notify(prefs, "storage");
    } catch (eS) {}
  });

  global.addEventListener("vc-discord-profile", function () {
    hydratedServer = false;
    pullServer();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", pullServer);
  } else {
    pullServer();
  }

  global.__VC_CHROME_SYNC = {
    ver: VER,
    tabId: TAB_ID,
    get: readMirror,
    publish: publish,
    subscribe: function (fn) {
      if (typeof fn === "function") listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (x) {
          return x !== fn;
        });
      };
    },
    pullServer: pullServer,
        bindExpandablePlayer: function (shell, toggleBtn) {
      if (!shell || shell.__vcExpandBound) return;
      shell.__vcExpandBound = true;
      function close() {
        shell.classList.remove("is-open");
      }
      function open() {
        shell.classList.add("is-open");
      }
      function isCoarseUi() {
        try {
          return window.matchMedia("(hover: none), (pointer: coarse)").matches;
        } catch (eM) {
          return false;
        }
      }
      if (shell.classList.contains("vc-bgm-player--confessionale")) return;
      if (toggleBtn) {
        toggleBtn.addEventListener(
          "click",
          function (ev) {
                        if (!isCoarseUi()) return;
            if (!shell.classList.contains("is-open")) {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              open();
              return;
            }
            if (shell.classList.contains("vc-type-sfx-player") || shell.classList.contains("vc-bgm-player")) {
              ev.preventDefault();
              ev.stopImmediatePropagation();
              close();
            }
          },
          true,
        );
      }
            function stopRangeBubble(ev) {
        if (ev.target && ev.target.closest && ev.target.closest(".vc-bgm-player__range")) {
          try {
            ev.stopPropagation();
          } catch (eS) {}
        }
      }
      shell.addEventListener("pointerdown", stopRangeBubble, true);
      shell.addEventListener("touchstart", stopRangeBubble, { capture: true, passive: true });
      shell.addEventListener("touchmove", stopRangeBubble, { capture: true, passive: true });
      /* confBgmHoverClose1: desktop leave = close (focus sullo slider non tiene aperto) */
      shell.addEventListener("pointerleave", function () {
        if (isCoarseUi()) return;
        close();
        try {
          var ae = document.activeElement;
          if (ae && shell.contains(ae) && typeof ae.blur === "function") ae.blur();
        } catch (eBlur) {}
      });
      document.addEventListener(
        "pointerdown",
        function (ev) {
          if (!shell.classList.contains("is-open")) return;
          if (shell.contains(ev.target)) return;
          close();
        },
        true,
      );
    },
    setMediaSession: function (opts) {
      try {
        if (!("mediaSession" in navigator)) return;
        var o = opts || {};
        navigator.mediaSession.metadata = new MediaMetadata({
          title: String(o.title || "Vinili & Caffè"),
          artist: String(o.artist || "Vinili & Caffè"),
          album: String(o.album || "Musica"),
          artwork: Array.isArray(o.artwork) ? o.artwork : [],
        });
        function setHandler(name, fn) {
          try {
            navigator.mediaSession.setActionHandler(name, typeof fn === "function" ? fn : null);
          } catch (eH) {}
        }
        setHandler("play", o.onPlay);
        setHandler("pause", o.onPause);
        setHandler("stop", o.onPause);
        function bump(delta) {
          if (typeof o.onVolumeDelta === "function") {
            o.onVolumeDelta(delta);
            return;
          }
          if (delta > 0 && typeof o.onPlay === "function") o.onPlay();
          if (delta < 0 && typeof o.onPause === "function") o.onPause();
        }
        setHandler("seekforward", function (details) {
          if (typeof o.onSeekForward === "function") {
            var off = details && Number(details.seekOffset);
            o.onSeekForward(Number.isFinite(off) && off > 0 ? off : 10);
            return;
          }
          bump(0.1);
        });
        setHandler("seekbackward", function (details) {
          if (typeof o.onSeekBackward === "function") {
            var offB = details && Number(details.seekOffset);
            o.onSeekBackward(Number.isFinite(offB) && offB > 0 ? offB : 10);
            return;
          }
          bump(-0.1);
        });
        setHandler("nexttrack", function () {
          if (typeof o.onSeekForward === "function") {
            o.onSeekForward(10);
            return;
          }
          bump(0.1);
        });
        setHandler("previoustrack", function () {
          if (typeof o.onSeekBackward === "function") {
            o.onSeekBackward(10);
            return;
          }
          bump(-0.1);
        });
        if (typeof o.onSeekTo === "function") {
          setHandler("seekto", function (details) {
            try {
              o.onSeekTo(details || {});
            } catch (eSeek) {}
          });
        }
        try {
          navigator.mediaSession.playbackState = o.playing ? "playing" : "paused";
        } catch (ePs) {}
      } catch (eMs) {}
    },
        applyYtVolume: function (player, vol01) {
      if (!player) return;
      var v = Math.round(Math.min(1, Math.max(0, Number(vol01) || 0)) * 100);
      try {
        if (v <= 0) {
          if (typeof player.mute === "function") player.mute();
          if (typeof player.setVolume === "function") player.setVolume(0);
        } else {
          if (typeof player.unMute === "function") player.unMute();
          if (typeof player.setVolume === "function") player.setVolume(v);
        }
      } catch (eV) {}
    },
  };
  /* hamBadgeSync3: alias usato da vc-nav-badges / widget */
  global.VcChromeSync = global.__VC_CHROME_SYNC;
})(typeof window !== "undefined" ? window : this);

/* navBadgeSyncAll5 */
