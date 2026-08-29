/**
 * Sync chrome widgets (musica, kick pip, type-sfx) tra tab/pagine e, se loggato, PC↔telefono.
 */
(function (global) {
  "use strict";
  if (global.__VC_CHROME_SYNC) return;

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
    try {
      var raw = localStorage.getItem(LS_MIRROR);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function writeMirror(prefs) {
    try {
      localStorage.setItem(LS_MIRROR, JSON.stringify(prefs || {}));
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

  function publish(partial, opts) {
    if (applyingRemote) return;
    var next = Object.assign({}, readMirror(), partial || {}, { updatedAt: Date.now(), tabId: TAB_ID });
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

  function pushServer(prefs) {
    var token = getToken();
    if (!token || !prefs) return;
    fetch(API, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({ prefs: prefs }),
    }).catch(function () {});
  }

  function pullServer() {
    var token = getToken();
    if (!token || hydratedServer) return;
    hydratedServer = true;
    fetch(API, {
      headers: { Authorization: "Bearer " + token },
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().catch(function () {
          return {};
        });
      })
      .then(function (data) {
        if (!data || data.ok !== true || !data.prefs) return;
        var local = readMirror();
        var remoteAt = Number(data.prefs.updatedAt) || 0;
        var localAt = Number(local.updatedAt) || 0;
        if (remoteAt >= localAt) {
          writeMirror(Object.assign({}, local, data.prefs));
          notify(data.prefs, "server");
        } else {
          pushServer(local);
        }
      })
      .catch(function () {});
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
    /** FAB musica / type-sfx: PC = hover CSS; telefono = tap apre/chiude. */
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
      if (toggleBtn) {
        toggleBtn.addEventListener(
          "click",
          function (ev) {
            // Desktop fine-pointer: il popover si apre con :hover CSS, non serve toggle click.
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
      // Slider: non chiudere / non rubare i gesture mentre si regola il volume
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
    /** Applica volume 0–1 al player YT (unmute se > 0). */
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
})(typeof window !== "undefined" ? window : this);
