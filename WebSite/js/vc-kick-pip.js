(function initKickLivePip() {
  var cfg = typeof window !== "undefined" ? window.__VC_KICK_PIP : null;
  if (!cfg || cfg.enabled !== true) return;

  function isHomePage() {
    try {
      if (document.body && document.body.classList.contains("vc-body--home")) return true;
      var p = String(window.location.pathname || "/").replace(/\/+$/, "") || "/";
      return p === "/" || p === "/index.html";
    } catch (eHome) {
      return false;
    }
  }
  if (!isHomePage()) return;
  if (document.body && document.body.classList.contains("vc-dashboard-page")) return;
  if (document.body && document.body.classList.contains("vc-seratafilm-page")) return;

  var DISMISS_KEY = "vc_kick_pip_dismiss_v2";
  var USER_CLOSED_KEY = "vc_kick_pip_user_closed_v1";
    var DISMISS_TTL_MS = 18 * 60 * 60 * 1000;
  var POS_KEY = "vc_kick_pip_pos_v2";
  var WATCH_KEY = "vc_kick_pip_watch_v2";
  var pollMs = Math.max(30000, Math.min(180000, Number(cfg.pollIntervalMs) || 90000));
  var previewLimitMs = Math.max(
    60_000,
    Math.min(60 * 60_000, Number(cfg.previewLimitMs) || 10 * 60_000),
  );
  var lastPayload = null;
  var lastStreamId = "";
  var lastPlaybackUrl = "";
  var playerMuted = true;
  var previewLocked = false;
  var hlsInstance = null;
  var hlsLoading = null;
  var playerLoadTimer = 0;
  var thumbRefreshTimer = 0;
  var previewLimitTimer = 0;
  var dragState = null;
  var docPipWindow = null;
  var homeParent = null;
  var homeNext = null;
  var preconnectDone = false;
  var metaDragMoved = false;
  var mp4ObjectUrl = "";
  var mp4FetchPromise = null;
  var playbackResumeAt = 0;
  var pollMisses = 0;
  var POLL_HIDE_AFTER_MISSES = 3;

  function resumeStorageKey(streamId) {
    return "vc_kick_pip_t_" + String(streamId || "").trim();
  }

  function rememberPlaybackTime() {
    try {
      var t = Number(videoEl && videoEl.currentTime) || 0;
      if (t > 0.2) playbackResumeAt = t;
      if (lastStreamId && t > 0.2) {
        localStorage.setItem(resumeStorageKey(lastStreamId), String(t));
        try {
          if (window.__VC_CHROME_SYNC) {
            window.__VC_CHROME_SYNC.publish({
              kickPip: {
                resume: { id: lastStreamId, t: t, at: Date.now() },
              },
            });
          }
        } catch (eSy) {}
      }
    } catch (eMem) {}
  }

  function loadRememberedTime(streamId) {
    playbackResumeAt = 0;
    try {
      var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
      if (
        sync &&
        sync.kickPip &&
        sync.kickPip.resume &&
        String(sync.kickPip.resume.id || "") === String(streamId || "") &&
        Number(sync.kickPip.resume.t) > 0.2
      ) {
        playbackResumeAt = Number(sync.kickPip.resume.t);
        return;
      }
    } catch (eSy) {}
    try {
      var t = Number(localStorage.getItem(resumeStorageKey(streamId)) || sessionStorage.getItem(resumeStorageKey(streamId)) || "0") || 0;
      if (t > 0.2) playbackResumeAt = t;
    } catch (eLoad) {}
  }

  function applyResumeTime() {
    var target = Number(playbackResumeAt) || 0;
    if (target <= 0.2) return;
    try {
      var dur = Number(videoEl.duration) || 0;
      if (dur > 1) target = Math.min(target, Math.max(0, dur - 0.35));
      if (Math.abs((Number(videoEl.currentTime) || 0) - target) > 0.35) {
        videoEl.currentTime = target;
      }
    } catch (eSeek) {}
  }

  function scheduleResumeRestore() {
    applyResumeTime();
    var tries = 0;
    var tick = function () {
      tries += 1;
      applyResumeTime();
      if (tries < 8 && (Number(playbackResumeAt) || 0) > 0.2) {
        setTimeout(tick, 120);
      }
    };
    setTimeout(tick, 60);
    videoEl.addEventListener(
      "loadedmetadata",
      function () {
        applyResumeTime();
      },
      { once: true },
    );
    videoEl.addEventListener(
      "loadeddata",
      function () {
        applyResumeTime();
      },
      { once: true },
    );
  }

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v != null && String(v) !== "" && String(v) !== key) return String(v);
      }
    } catch (e) {}
    return fallback;
  }

  function showPipAlert(opts) {
    opts = opts || {};
    var title = String(opts.title || t("kickPip.alertTitle", "Kick Sub")).trim();
    var message = String(opts.message || "").trim();
    var okLabel = String(opts.okLabel || t("kickPip.alertOk", "OK")).trim();
    var icon = String(opts.icon || "fa-info-circle").trim();
    var danger = opts.danger === true;
    try {
      if (window.VcDialog && typeof window.VcDialog.alert === "function") {
        return window.VcDialog.alert({
          title: title,
          message: message,
          okLabel: okLabel,
          icon: icon,
          danger: danger,
        });
      }
    } catch (eDlg) {}
    if (typeof window.__vcEnsureDialog === "function") {
      return window.__vcEnsureDialog().then(function (D) {
        if (D && typeof D.alert === "function") {
          return D.alert({
            title: title,
            message: message,
            okLabel: okLabel,
            icon: icon,
            danger: danger,
          });
        }
      });
    }
    return Promise.resolve();
  }

  function channelSlugFromStream(stream) {
    return String((stream && stream.slug) || (lastPayload && lastPayload.slug) || "")
      .trim()
      .toLowerCase();
  }

  function isUserClosedPip() {
    try {
      if (localStorage.getItem(USER_CLOSED_KEY) === "1") return true;
    } catch (e0) {}
    try {
      var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
      if (sync && sync.kickPip && sync.kickPip.userClosed === true) return true;
    } catch (e1) {}
    return false;
  }

  function setUserClosedPip(on, opts) {
    opts = opts || {};
    try {
      if (on) localStorage.setItem(USER_CLOSED_KEY, "1");
      else localStorage.removeItem(USER_CLOSED_KEY);
    } catch (eLs) {}
    if (opts.skipPublish) return;
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({
          kickPip: { userClosed: on === true },
        });
      }
    } catch (eSy) {}
  }

  function readDismissState() {
    try {
      var raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) {
                var legacy = String(localStorage.getItem("vc_kick_pip_dismiss_v1") || "").trim();
        if (!legacy) return null;
        return { ids: [legacy], slug: "", at: Date.now() };
      }
      if (raw.charAt(0) !== "{") {
        return { ids: [String(raw).trim()].filter(Boolean), slug: "", at: Date.now() };
      }
      var j = JSON.parse(raw);
      if (!j || typeof j !== "object") return null;
      var ids = Array.isArray(j.ids)
        ? j.ids.map(function (x) {
            return String(x || "").trim();
          }).filter(Boolean)
        : [];
      if (j.id) ids.push(String(j.id).trim());
      return {
        ids: ids,
        slug: String(j.slug || "").trim().toLowerCase(),
        at: Number(j.at) || Date.now(),
      };
    } catch (e) {
      return null;
    }
  }

  function writeDismissState(state) {
    try {
      if (!state) {
        localStorage.removeItem(DISMISS_KEY);
        localStorage.removeItem("vc_kick_pip_dismiss_v1");
      } else {
        localStorage.setItem(
          DISMISS_KEY,
          JSON.stringify({
            ids: Array.isArray(state.ids) ? state.ids : [],
            slug: String(state.slug || "").trim().toLowerCase(),
            at: Number(state.at) || Date.now(),
          }),
        );
      }
    } catch (e) {}
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({
          kickPip: { dismiss: state || null },
        });
      }
    } catch (eSy) {}
  }

  function getDismissedStreamId() {
    var st = readDismissState();
    return st && st.ids && st.ids[0] ? String(st.ids[0]) : "";
  }

  function isStreamDismissed(stream) {
    if (isUserClosedPip()) return true;
    var st = readDismissState();
    if (!st) return false;
    if (Number(st.at) && Date.now() - Number(st.at) > DISMISS_TTL_MS) {
      writeDismissState(null);
      return false;
    }
    var sid = String((stream && stream.id) || "").trim();
    var slug = String((stream && stream.slug) || "")
      .trim()
      .toLowerCase();
    if (sid && st.ids && st.ids.indexOf(sid) >= 0) return true;
        if (slug && st.slug && slug === st.slug) return true;
    return false;
  }

  function setDismissedStream(stream) {
    var sid = String((stream && stream.id) || lastStreamId || "").trim();
    var slug = channelSlugFromStream(stream);
    setUserClosedPip(true);
    if (!sid && !slug) return;
    var prev = readDismissState() || { ids: [], slug: "", at: Date.now() };
    var ids = Array.isArray(prev.ids) ? prev.ids.slice() : [];
    if (sid && ids.indexOf(sid) < 0) ids.push(sid);
    writeDismissState({
      ids: ids.slice(-8),
      slug: slug || prev.slug || "",
      at: Date.now(),
    });
  }

  function setDismissedStreamId(id) {
    setDismissedStream({ id: id, slug: (lastPayload && lastPayload.slug) || "" });
  }

  function clearDismissedStreamId() {
    writeDismissState(null);
    setUserClosedPip(false);
  }

  function loadPos() {
    try {
      var raw = localStorage.getItem(POS_KEY);
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || typeof j !== "object") return null;
      if (j.corner && /^(tl|tr|bl|br)$/.test(j.corner)) return { corner: j.corner };
      if (typeof j.left === "number" && typeof j.top === "number") return { left: j.left, top: j.top };
    } catch (e) {}
    return null;
  }

  function savePos(pos) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos || { corner: "bl" }));
    } catch (e) {}
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({ kickPip: { pos: pos || { corner: "bl" } } });
      }
    } catch (eSy) {}
  }

  function safeInset(side) {
    try {
      var style = getComputedStyle(document.documentElement);
      var v = parseFloat(style.getPropertyValue("env(safe-area-inset-" + side + ")")) || 0;
      return Math.max(0, v);
    } catch (e) {
      return 0;
    }
  }

  function margin() {
    return 12 + Math.max(safeInset("left"), safeInset("right"), safeInset("bottom"), safeInset("top")) * 0.15;
  }

    function headerClearTop() {
    var m = margin();
    try {
      var hdr = document.querySelector("body.vc-body > header, body.vc-body header.fixed, header.fixed");
      if (hdr) {
        var r = hdr.getBoundingClientRect();
        if (r && r.bottom > 0) return Math.max(m, Math.ceil(r.bottom + 10));
      }
    } catch (eHdr) {}
    return Math.max(m, Math.ceil(safeInset("top") + 84));
  }

  function resolvedApiUrl() {
    var local = String(cfg.apiUrlLocal || "").trim();
    var prod = String(cfg.apiUrl || "/webhooks/site-kick-live").trim() || "/webhooks/site-kick-live";
    try {
      var host = String(window.location.hostname || "").toLowerCase();
      if (local && (host === "localhost" || host === "127.0.0.1")) return local;
    } catch (e0) {}
    if (/^https?:\/\//i.test(prod)) return prod;
    try {
      return new URL(prod, window.location.origin).toString();
    } catch (e1) {
      return prod;
    }
  }

  function supportsDocPip() {
    try {
      return !!(window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === "function");
    } catch (e) {
      return false;
    }
  }

  function ensureKickPreconnect() {
    if (preconnectDone) return;
    preconnectDone = true;
    [
      "https://kick.com",
      "https://images.kick.com",
      "https://fa723fc1b171.us-west-2.playback.live-video.net",
    ].forEach(function (href) {
      try {
        var l = document.createElement("link");
        l.rel = "preconnect";
        l.href = href;
        l.crossOrigin = "anonymous";
        document.head.appendChild(l);
      } catch (e) {}
    });
  }

  function ensureRoot() {
    var n = document.getElementById("vc-kick-pip");
    if (n) {
            if (
        !n.querySelector(".vc-kick-pip__footer") ||
        n.querySelector(".vc-kick-pip__media [data-vc-kick-pip-sub]") ||
        !n.querySelector("[data-vc-kick-pip-play]")
      ) {
        try {
          n.remove();
        } catch (eRm) {}
        n = null;
      } else {
        return n;
      }
    }
    n = document.createElement("aside");
    n.id = "vc-kick-pip";
    n.className = "vc-kick-pip vc-kick-pip--corner-bl";
    n.hidden = true;
    n.setAttribute("role", "complementary");
    n.setAttribute("aria-label", t("kickPip.aria", "Anteprima live Kick"));
    n.innerHTML =
      '<div class="vc-kick-pip__chrome">' +
      '<button type="button" class="vc-kick-pip__drag" data-vc-kick-pip-drag aria-label="' +
      t("kickPip.drag", "Trascina anteprima") +
      '" title="' +
      t("kickPip.drag", "Trascina anteprima") +
      '"><i class="fa fa-arrows" aria-hidden="true"></i></button>' +
      '<a class="vc-kick-pip__open" id="vc-kick-pip-open" href="https://kick.com/" target="_blank" rel="noopener noreferrer" aria-label="' +
      t("kickPip.open", "Apri live su Kick") +
      '" title="' +
      t("kickPip.open", "Apri live su Kick") +
      '"><i class="fa fa-external-link" aria-hidden="true"></i></a>' +
      '<button type="button" class="vc-kick-pip__float" data-vc-kick-pip-float hidden aria-label="' +
      t("kickPip.float", "Apri in Picture-in-Picture") +
      '" title="' +
      t("kickPip.float", "Apri in Picture-in-Picture") +
      '"><i class="fa fa-clone" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-kick-pip__close" data-vc-kick-pip-dismiss aria-label="' +
      t("kickPip.hide", "Nascondi anteprima live") +
      '"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-kick-pip__media" id="vc-kick-pip-media">' +
      '<img class="vc-kick-pip__thumb" id="vc-kick-pip-thumb" alt="" decoding="async" fetchpriority="high" />' +
      '<video class="vc-kick-pip__video" id="vc-kick-pip-video" playsinline webkit-playsinline muted disablePictureInPicture></video>' +
      '<iframe class="vc-kick-pip__player" id="vc-kick-pip-player" title="' +
      t("kickPip.playerTitle", "Player live Kick") +
      '" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="origin-when-cross-origin" hidden></iframe>' +
      '<button type="button" class="vc-kick-pip__sound" data-vc-kick-pip-sound aria-label="' +
      t("kickPip.unmute", "Attiva audio") +
      '" title="' +
      t("kickPip.unmute", "Attiva audio") +
      '"><i class="fa fa-volume-off" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-kick-pip__play" data-vc-kick-pip-play hidden aria-label="' +
      t("kickPip.play", "Riproduci anteprima") +
      '" title="' +
      t("kickPip.play", "Riproduci anteprima") +
      '"><i class="fa fa-play" aria-hidden="true"></i></button>' +
      '<a class="vc-kick-pip__gate" id="vc-kick-pip-gate" href="https://kick.com/" target="_blank" rel="noopener noreferrer" hidden>' +
      '<span class="vc-kick-pip__gate-title">' +
      t("kickPip.limitTitle", "Anteprima terminata") +
      "</span>" +
      '<span class="vc-kick-pip__gate-text">' +
      t("kickPip.limitText", "Continua la live su Kick") +
      "</span>" +
      '<span class="vc-kick-pip__gate-cta">' +
      t("kickPip.limitCta", "Apri su Kick") +
      "</span>" +
      "</a>" +
      '<span class="vc-kick-pip__live" id="vc-kick-pip-badge"><span class="vc-kick-pip__live-dot" aria-hidden="true"></span> <span class="vc-kick-pip__live-text">LIVE</span></span>' +
      "</div>" +
      '<div class="vc-kick-pip__footer">' +
      '<a class="vc-kick-pip__meta" id="vc-kick-pip-link" href="https://kick.com/" target="_blank" rel="noopener noreferrer">' +
      '<span class="vc-kick-pip__name" id="vc-kick-pip-name"></span>' +
      '<span class="vc-kick-pip__title" id="vc-kick-pip-title"></span>' +
      '<span class="vc-kick-pip__category" id="vc-kick-pip-category" hidden></span>' +
      '<span class="vc-kick-pip__viewers" id="vc-kick-pip-viewers"></span>' +
      "</a>" +
      '<button type="button" class="vc-kick-pip__sub" data-vc-kick-pip-sub aria-label="' +
      t("kickPip.sub", "Collega Kick Sub") +
      '" title="' +
      t("kickPip.sub", "Collega Kick Sub") +
      '"><span class="vc-kick-pip__sub-label">SUB</span></button>' +
      "</div>";
    document.body.appendChild(n);
    return n;
  }

  function ensureReopen() {
    var btn = document.getElementById("vc-kick-pip-reopen");
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "vc-kick-pip-reopen";
    btn.className = "vc-kick-pip-reopen";
    btn.hidden = true;
    btn.setAttribute("aria-controls", "vc-kick-pip");
    btn.setAttribute("aria-label", t("kickPip.reopenAria", "Mostra anteprima live Kick"));
    btn.innerHTML =
      '<span class="vc-kick-pip-reopen__dot" aria-hidden="true"></span><span>' +
      t("kickPip.reopen", "Live Kick") +
      "</span>";
    document.body.appendChild(btn);
    return btn;
  }

  var root = ensureRoot();
  var reopenBtn = ensureReopen();
  var linkEl = document.getElementById("vc-kick-pip-link");
  var thumbEl = document.getElementById("vc-kick-pip-thumb");
  var videoEl = document.getElementById("vc-kick-pip-video");
  var playerEl = document.getElementById("vc-kick-pip-player");
  var nameEl = document.getElementById("vc-kick-pip-name");
  var titleEl = document.getElementById("vc-kick-pip-title");
  var categoryEl = document.getElementById("vc-kick-pip-category");
  var viewersEl = document.getElementById("vc-kick-pip-viewers");
  var badgeEl = document.getElementById("vc-kick-pip-badge");
  var badgeTextEl = badgeEl ? badgeEl.querySelector(".vc-kick-pip__live-text") : null;
  var floatBtn = root.querySelector("[data-vc-kick-pip-float]");
  var openKickEl = document.getElementById("vc-kick-pip-open");
  var gateEl = document.getElementById("vc-kick-pip-gate");
  var soundBtn = root.querySelector("[data-vc-kick-pip-sound]");
  var playBtn = root.querySelector("[data-vc-kick-pip-play]");
  var subBtn = root.querySelector("[data-vc-kick-pip-sub]");
  var subStatus = null;
  var subBusy = false;
  if (!root || !reopenBtn || !linkEl || !thumbEl || !videoEl || !nameEl || !titleEl || !categoryEl || !viewersEl || !gateEl) return;

  if (supportsDocPip() && floatBtn) floatBtn.hidden = false;

  function getDiscordAccessToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var t = window.__vcDiscordGetAccessToken();
        if (t) return String(t).trim();
      }
    } catch (eTok) {}
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (eLs) {
      return "";
    }
  }

  function kickSubApiBase() {
    return String(cfg.subApiUrl || "/webhooks/site-kick-sub").trim() || "/webhooks/site-kick-sub";
  }

  function syncSubButton() {
    if (!subBtn) return;
    subBtn.hidden = false;
    var labelEl = subBtn.querySelector(".vc-kick-pip__sub-label");
    var label = "SUB";
    var title = t("kickPip.sub", "Collega Kick Sub");
    root.classList.remove("vc-kick-pip--sub-linked", "vc-kick-pip--sub-active", "vc-kick-pip--sub-need-login");
    if (!getDiscordAccessToken() && !(window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id)) {
      root.classList.add("vc-kick-pip--sub-need-login");
      label = t("kickPip.subLogin", "LOGIN");
      title = t("kickPip.subLoginHint", "Accedi con Discord per collegare Kick Sub");
    } else if (subStatus && subStatus.linked && subStatus.subActive) {
      root.classList.add("vc-kick-pip--sub-active");
      label = t("kickPip.subActive", "SUB ✓");
      title = t("kickPip.subActiveHint", "Sub attivo — ruolo Discord sincronizzato");
    } else if (subStatus && subStatus.linked) {
      root.classList.add("vc-kick-pip--sub-linked");
      label = t("kickPip.subLinked", "LINK");
      title = t(
        "kickPip.subLinkedHint",
        "Kick collegato — per il ruolo scrivi un messaggio in chat dello streamer su Kick",
      );
    }
    if (labelEl) labelEl.textContent = label;
    else subBtn.textContent = label;
        subBtn.setAttribute("aria-label", label);
    subBtn.title = title;
    subBtn.disabled = subBusy;
  }

  function refreshSubStatus() {
    var token = getDiscordAccessToken();
    if (!token) {
      subStatus = null;
      syncSubButton();
      return Promise.resolve(null);
    }
    return fetch(kickSubApiBase() + "/status", {
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      credentials: "omit",
    })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (j && j.ok) subStatus = j;
        else subStatus = null;
        syncSubButton();
        return subStatus;
      })
      .catch(function () {
        syncSubButton();
        return null;
      });
  }

  function startDiscordLoginForSub() {
    try {
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(subBtn);
        return true;
      }
    } catch (eStart) {}
    var loginBtn =
      document.querySelector("[data-vc-discord-login]") ||
      document.querySelector(".vc-discord-login") ||
      document.querySelector('a[href*="discord.com/oauth2"]');
    if (loginBtn && typeof loginBtn.click === "function") {
      loginBtn.click();
      return true;
    }
    return false;
  }

  function handleSubClick() {
    if (subBusy || previewLocked) return;
    var token = getDiscordAccessToken();
    if (!token) {
      if (!startDiscordLoginForSub()) {
        void showPipAlert({
          title: t("kickPip.subNeedLoginTitle", "Accesso richiesto"),
          message: t(
            "kickPip.subNeedLogin",
            "Accedi con Discord (pulsante LOGIN in alto) e riprova SUB.",
          ),
          okLabel: t("kickPip.alertOk", "OK"),
          icon: "fa-sign-in",
        });
      }
      return;
    }

        if (subStatus && subStatus.linked && subStatus.subActive) {
      var openUrl =
        String((subStatus && subStatus.subscribeUrl) || "").trim() ||
        String((lastPayload && lastPayload.url) || "").trim() ||
        "https://kick.com/";
      try {
        window.open(openUrl, "_blank", "noopener,noreferrer");
      } catch (eO) {}
      return;
    }

        if (subStatus && subStatus.linked && !subStatus.subActive) {
      var subUrl = String(subStatus.subscribeUrl || "").trim() || "https://kick.com/diunk17";
      void showPipAlert({
        title: t("kickPip.subLinkedTitle", "Quasi fatto"),
        message: t(
          "kickPip.subLinkedAlert",
          "Kick è collegato, ma il ruolo non è ancora assegnato.\n\nPer riceverlo: scrivi almeno un messaggio nella chat dello streamer su Kick (devi essere sub).\n\nIl solo link non assegna il ruolo.",
        ),
        okLabel: t("kickPip.subLinkedOk", "Apri Kick"),
        icon: "fa-comments",
      }).then(function () {
        try {
          window.open(subUrl, "_blank", "noopener,noreferrer");
        } catch (eS) {}
      });
      return;
    }

        subBusy = true;
    syncSubButton();
    fetch(kickSubApiBase() + "/oauth-start", {
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      credentials: "omit",
    })
      .then(function (r) {
        return r.json().then(function (j) {
          return { status: r.status, j: j };
        });
      })
      .then(function (pack) {
        if (pack.status === 401) {
          startDiscordLoginForSub();
          return;
        }
        var url = pack.j && pack.j.url ? String(pack.j.url).trim() : "";
        if (!url) throw new Error("missing_url");
        window.location.assign(url);
      })
      .catch(function () {
        void showPipAlert({
          title: t("kickPip.subErrorTitle", "Collegamento Kick"),
          message: t("kickPip.subError", "Non riesco ad aprire il collegamento Kick. Riprova."),
          okLabel: t("kickPip.alertOk", "OK"),
          icon: "fa-exclamation-triangle",
          danger: true,
        });
      })
      .finally(function () {
        subBusy = false;
        syncSubButton();
      });
  }

  function loadWatchState() {
    try {
      var raw = localStorage.getItem(WATCH_KEY);
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || typeof j !== "object") return null;
      return {
        streamId: String(j.streamId || "").trim(),
        watchedMs: Math.max(0, Number(j.watchedMs) || 0),
        sessionStart: Number(j.sessionStart) || 0,
        locked: j.locked === true,
      };
    } catch (e) {
      return null;
    }
  }

  function saveWatchState(state) {
    try {
      if (!state || !state.streamId) {
        localStorage.removeItem(WATCH_KEY);
        return;
      }
      localStorage.setItem(
        WATCH_KEY,
        JSON.stringify({
          streamId: String(state.streamId),
          watchedMs: Math.max(0, Number(state.watchedMs) || 0),
          sessionStart: Number(state.sessionStart) || 0,
          locked: state.locked === true,
        }),
      );
    } catch (e) {}
  }

  function ensureWatchTracking(streamId) {
    var sid = String(streamId || "").trim();
    if (!sid) return null;
    var cur = loadWatchState();
    if (!cur || cur.streamId !== sid) {
      cur = { streamId: sid, watchedMs: 0, sessionStart: 0, locked: false };
      saveWatchState(cur);
    }
    return cur;
  }

    function flushWatchSession() {
    var cur = loadWatchState();
    if (!cur || !cur.sessionStart) return cur;
    cur.watchedMs = Math.max(0, Number(cur.watchedMs) || 0) + Math.max(0, Date.now() - cur.sessionStart);
    cur.sessionStart = 0;
    saveWatchState(cur);
    return cur;
  }

  function resumeWatchSession(streamId) {
    var cur = ensureWatchTracking(streamId);
    if (!cur || cur.locked) return cur;
    if (document.hidden || root.hidden) return cur;
    if (!cur.sessionStart) {
      cur.sessionStart = Date.now();
      saveWatchState(cur);
    }
    return cur;
  }

  function getWatchedMs(cur) {
    if (!cur) return 0;
    var n = Math.max(0, Number(cur.watchedMs) || 0);
    if (cur.sessionStart) n += Math.max(0, Date.now() - cur.sessionStart);
    return n;
  }

  function isPreviewExpired(streamId) {
    var cur = ensureWatchTracking(streamId);
    if (!cur) return false;
    if (cur.locked) return true;
    if (getWatchedMs(cur) >= previewLimitMs) {
      flushWatchSession();
      cur = loadWatchState() || cur;
      cur.locked = true;
      cur.sessionStart = 0;
      saveWatchState(cur);
      return true;
    }
    return false;
  }

  function stopPreviewMedia() {
    playerMuted = true;
    try {
      videoEl.muted = true;
      videoEl.pause();
    } catch (e) {}
    destroyHls();
    try {
      videoEl.removeAttribute("src");
      videoEl.load();
    } catch (e2) {}
    if (playerEl) {
      try {
        playerEl.hidden = true;
        playerEl.removeAttribute("src");
        playerEl.src = "about:blank";
      } catch (e3) {}
    }
    lastPlaybackUrl = "";
    root.classList.remove("vc-kick-pip--iframe");
  }

  function applyPreviewLock(locked) {
    previewLocked = locked === true;
    root.classList.toggle("vc-kick-pip--locked", previewLocked);
    if (gateEl) {
      gateEl.hidden = !previewLocked;
      if (lastPayload && lastPayload.url) gateEl.setAttribute("href", String(lastPayload.url));
    }
    if (soundBtn) soundBtn.hidden = previewLocked || root.classList.contains("vc-kick-pip--iframe");
    if (playBtn) playBtn.hidden = previewLocked || root.classList.contains("vc-kick-pip--ready");
    if (previewLocked) {
      stopPreviewMedia();
      root.classList.remove("vc-kick-pip--playing", "vc-kick-pip--ready", "vc-kick-pip--sound-on", "vc-kick-pip--iframe", "vc-kick-pip--awaiting-play");
            if (lastPayload && lastPayload.thumbnailUrl) setThumbUrl(String(lastPayload.thumbnailUrl));
      thumbEl.hidden = false;
    }
    syncSoundButton();
    syncSubButton();
    syncPlayButton(!previewLocked && !root.classList.contains("vc-kick-pip--ready"));
  }

  function tickPreviewLimit() {
    if (!lastStreamId) return;
    if (root.hidden || document.hidden) {
      flushWatchSession();
      return;
    }
    resumeWatchSession(lastStreamId);
    if (isPreviewExpired(lastStreamId)) applyPreviewLock(true);
  }

  function startPreviewLimitWatcher() {
    if (previewLimitTimer) clearInterval(previewLimitTimer);
    previewLimitTimer = setInterval(tickPreviewLimit, 5000);
    tickPreviewLimit();
  }

  function formatViewers(n) {
    var v = Math.max(0, Math.floor(Number(n) || 0));
    if (v <= 0) return "";
    try {
      return v.toLocaleString("it-IT") + " " + t("kickPip.viewers", "spettatori");
    } catch (e) {
      return String(v) + " " + t("kickPip.viewers", "spettatori");
    }
  }

  function formatViews(n) {
    var v = Math.max(0, Math.floor(Number(n) || 0));
    if (v <= 0) return "";
    try {
      return v.toLocaleString("it-IT") + " " + t("kickPip.views", "visualizzazioni");
    } catch (e) {
      return String(v) + " " + t("kickPip.views", "visualizzazioni");
    }
  }

  function formatDuration(ms) {
    var total = Math.max(0, Math.floor(Number(ms) || 0) / 1000);
    if (total < 1) return "";
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    var s = Math.floor(total % 60);
    if (h > 0) return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    return m + ":" + String(s).padStart(2, "0");
  }

  function isVod(stream) {
    return String((stream && stream.kind) || "").toLowerCase() === "vod";
  }

  function syncKindUi(stream) {
    var vod = isVod(stream);
    root.classList.toggle("vc-kick-pip--vod", vod);
    root.classList.toggle("vc-kick-pip--live", !vod);
    if (badgeTextEl) badgeTextEl.textContent = vod ? t("kickPip.badgeVod", "VOD") : "LIVE";
    var openLabel = vod
      ? t("kickPip.openVod", "Apri VOD su Kick")
      : t("kickPip.open", "Apri live su Kick");
    var reopenLabel = vod ? t("kickPip.reopenVod", "VOD Kick") : t("kickPip.reopen", "Live Kick");
    reopenBtn.setAttribute(
      "aria-label",
      vod ? t("kickPip.reopenVodAria", "Mostra ultimo VOD Kick") : t("kickPip.reopenAria", "Mostra anteprima live Kick"),
    );
    var reopenSpan = reopenBtn.querySelector("span:last-child");
    if (reopenSpan) reopenSpan.textContent = reopenLabel;
    return { vod: vod, openLabel: openLabel };
  }

  function clearCornerClasses() {
    root.classList.remove(
      "vc-kick-pip--corner-tl",
      "vc-kick-pip--corner-tr",
      "vc-kick-pip--corner-bl",
      "vc-kick-pip--corner-br",
      "vc-kick-pip--free",
    );
  }

  function clampPos(left, top) {
    var m = margin();
    var minTop = headerClearTop();
    var w = root.offsetWidth || 280;
    var h = root.offsetHeight || 220;
    return {
      left: Math.min(Math.max(m, window.innerWidth - w - m), Math.max(m, left)),
      top: Math.min(Math.max(minTop, window.innerHeight - h - m), Math.max(minTop, top)),
    };
  }

  function applyCorner(corner) {
    clearCornerClasses();
    root.style.left = "";
    root.style.right = "";
    root.style.top = "";
    root.style.bottom = "";
    root.classList.add("vc-kick-pip--corner-" + corner);
    savePos({ corner: corner });
  }

  function applyFree(left, top) {
    var p = clampPos(left, top);
    clearCornerClasses();
    root.classList.add("vc-kick-pip--free");
    root.style.left = Math.round(p.left) + "px";
    root.style.top = Math.round(p.top) + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
    savePos({ left: p.left, top: p.top });
  }

  function nearestCorner(left, top) {
    var w = root.offsetWidth || 280;
    var h = root.offsetHeight || 220;
    var cx = left + w / 2;
    var cy = top + h / 2;
    if (cy < window.innerHeight / 2) return cx < window.innerWidth / 2 ? "tl" : "tr";
    return cx < window.innerWidth / 2 ? "bl" : "br";
  }

  function restorePos() {
    if (docPipWindow) return;
    var pos = loadPos();
    if (!pos) return applyCorner("bl");
    if (pos.corner) return applyCorner(pos.corner);
    applyFree(Number(pos.left) || margin(), Number(pos.top) || margin());
  }

  function setThumbUrl(url) {
    var raw = String(url || "").trim();
    if (!raw) {
      thumbEl.removeAttribute("src");
      thumbEl.onerror = null;
      thumbEl.hidden = true;
      return;
    }
    var base = raw;
        if (!/\/video_thumbnails\//i.test(base) && base.indexOf("/webhooks/site-kick-live/thumb") < 0) {
      base = base.replace(/\/(\d{3,4})\.webp(\?|$)/i, "/160.webp$2");
    }
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    var finalUrl = base + sep + "vc_t=" + encodeURIComponent(String(Date.now()));
    thumbEl.onerror = function onThumbErr() {
      thumbEl.onerror = null;
      if (raw && finalUrl !== raw) {
        var sep2 = raw.indexOf("?") >= 0 ? "&" : "?";
        thumbEl.src = raw + sep2 + "vc_t=" + encodeURIComponent(String(Date.now()));
        thumbEl.hidden = false;
      }
    };
    thumbEl.src = finalUrl;
    thumbEl.hidden = false;
  }

  function isVodPayload(payload) {
    payload = payload || lastPayload;
    return payload && String(payload.kind || "").toLowerCase() === "vod";
  }

  function startThumbRefresh(baseUrl) {
    if (thumbRefreshTimer) clearInterval(thumbRefreshTimer);
    thumbRefreshTimer = 0;
    var base = String(baseUrl || "").trim();
    if (!base) return;
    thumbRefreshTimer = setInterval(function () {
      if (root.hidden || root.classList.contains("vc-kick-pip--ready")) return;
      setThumbUrl(base);
    }, 10000);
  }

  function markPlayerReady() {
    root.classList.add("vc-kick-pip--ready");
    if (thumbRefreshTimer) {
      clearInterval(thumbRefreshTimer);
      thumbRefreshTimer = 0;
    }
  }

  function syncSoundButton() {
    var btn = soundBtn || root.querySelector("[data-vc-kick-pip-sound]");
    if (!btn) return;
    if (
      previewLocked ||
      root.classList.contains("vc-kick-pip--iframe") ||
      !root.classList.contains("vc-kick-pip--ready")
    ) {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    var on = !playerMuted;
    root.classList.toggle("vc-kick-pip--sound-on", on);
    btn.setAttribute("aria-label", on ? t("kickPip.mute", "Disattiva audio") : t("kickPip.unmute", "Attiva audio"));
    btn.title = on ? t("kickPip.mute", "Disattiva audio") : t("kickPip.unmute", "Attiva audio");
    var icon = btn.querySelector("i");
    if (icon) icon.className = on ? "fa fa-volume-up" : "fa fa-volume-off";
  }

  function revokeMp4ObjectUrl() {
    if (mp4ObjectUrl) {
      try {
        URL.revokeObjectURL(mp4ObjectUrl);
      } catch (eRev) {}
    }
    mp4ObjectUrl = "";
    mp4FetchPromise = null;
  }

  function destroyHls() {
    if (hlsInstance) {
      try {
        hlsInstance.destroy();
      } catch (e) {}
      hlsInstance = null;
    }
  }

  function clearPlayer() {
    lastPlaybackUrl = "";
    if (playerLoadTimer) {
      clearTimeout(playerLoadTimer);
      playerLoadTimer = 0;
    }
    if (thumbRefreshTimer) {
      clearInterval(thumbRefreshTimer);
      thumbRefreshTimer = 0;
    }
    destroyHls();
    revokeMp4ObjectUrl();
    try {
      videoEl.removeAttribute("src");
      videoEl.load();
    } catch (e) {}
    if (playerEl) {
      try {
        playerEl.hidden = true;
        playerEl.removeAttribute("src");
        playerEl.src = "about:blank";
      } catch (e2) {}
    }
    root.classList.remove("vc-kick-pip--playing", "vc-kick-pip--ready", "vc-kick-pip--iframe", "vc-kick-pip--awaiting-play");
    syncPlayButton(false);
  }

  function mountIframeFallback(embedUrl) {
    var src = String(embedUrl || "").trim();
    if (!src || !playerEl) return false;
    destroyHls();
    try {
      videoEl.removeAttribute("src");
      videoEl.load();
    } catch (e) {}
    playerEl.hidden = false;
    playerEl.src = src;
    root.classList.add("vc-kick-pip--playing", "vc-kick-pip--iframe", "vc-kick-pip--ready");
    if (soundBtn) soundBtn.hidden = true;
    if (thumbRefreshTimer) {
      clearInterval(thumbRefreshTimer);
      thumbRefreshTimer = 0;
    }
    return true;
  }

  function loadHlsLib() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "/js/hls.light.min.js?v=1.5.20";
      s.async = true;
      s.onload = function () {
        if (window.Hls) resolve(window.Hls);
        else reject(new Error("hls_missing"));
      };
      s.onerror = function () {
        reject(new Error("hls_load_failed"));
      };
      document.head.appendChild(s);
    }).catch(function (err) {
      hlsLoading = null;
      throw err;
    });
    return hlsLoading;
  }

  function tryPlay() {
    if (previewLocked) return Promise.resolve(false);
    var p = videoEl.play();
    if (p && typeof p.then === "function") {
      return p.then(function () { return true; }).catch(function () { return false; });
    }
    return Promise.resolve(true);
  }

  function syncPlayButton(show) {
    if (!playBtn) return;
    var visible = show !== false && !previewLocked && !root.classList.contains("vc-kick-pip--ready");
    playBtn.hidden = !visible;
    root.classList.toggle("vc-kick-pip--awaiting-play", visible);
  }

  function withBust(u) {
    try {
      var sep = String(u || "").indexOf("?") >= 0 ? "&" : "?";
      return String(u || "") + sep + "_vc=" + encodeURIComponent(String(Date.now()));
    } catch (eQ) {
      return String(u || "");
    }
  }

  function prefetchMp4Blob(mp4Url) {
    var u = String(mp4Url || "").trim();
    if (!u) return Promise.reject(new Error("no_mp4"));
    if (mp4ObjectUrl) return Promise.resolve(mp4ObjectUrl);
    if (mp4FetchPromise) return mp4FetchPromise;
    mp4FetchPromise = fetch(withBust(u), { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("mp4_http_" + r.status);
        return r.blob();
      })
      .then(function (blob) {
        if (!blob || blob.size < 1000) throw new Error("mp4_empty");
        revokeMp4ObjectUrl();
        mp4ObjectUrl = URL.createObjectURL(blob);
        return mp4ObjectUrl;
      })
      .catch(function (err) {
        mp4FetchPromise = null;
        throw err;
      });
    return mp4FetchPromise;
  }

  function kickstartVideoDecode() {
    try {
            if ((Number(playbackResumeAt) || 0) > 0.2 || (Number(videoEl.currentTime) || 0) > 0.2) {
        applyResumeTime();
        return;
      }
      if (videoEl.readyState >= 1 && Number(videoEl.duration) > 0.2) {
        var t = Math.min(0.15, Math.max(0.05, Number(videoEl.duration) * 0.02));
        videoEl.currentTime = t;
      }
    } catch (eSeek) {}
  }

  function isAppleSafariLike() {
    try {
      var ua = String(navigator.userAgent || "");
      return /iP(hone|ad|od)|Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome|CriOS|Edg|Firefox|Android/.test(ua);
    } catch (e) {
      return false;
    }
  }

  function sampleVideoHasPicture() {
    try {
      var w = Number(videoEl.videoWidth) || 0;
      var h = Number(videoEl.videoHeight) || 0;
      if (w < 2 || h < 2) return false;
      var c = document.createElement("canvas");
      c.width = 24;
      c.height = 14;
      var ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return true;
      ctx.drawImage(videoEl, 0, 0, c.width, c.height);
      var data = ctx.getImageData(0, 0, c.width, c.height).data;
      var lit = 0;
      for (var i = 0; i < data.length; i += 16) {
        if (data[i] + data[i + 1] + data[i + 2] > 36) lit += 1;
      }
      return lit >= 3;
    } catch (eSample) {
            return (Number(videoEl.videoWidth) || 0) >= 2 && (Number(videoEl.currentTime) || 0) > 0.02;
    }
  }

  function waitForPaintedFrame(timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      var finish = function (ok) {
        if (done) return;
        done = true;
        resolve(ok === true);
      };
      var deadline = Date.now() + Math.max(1200, Number(timeoutMs) || 5000);
      var tick = function () {
        if (done) return;
        if (sampleVideoHasPicture()) {
          finish(true);
          return;
        }
        if (Date.now() >= deadline) {
          finish(false);
          return;
        }
        setTimeout(tick, 180);
      };
      try {
        if (typeof videoEl.requestVideoFrameCallback === "function") {
          videoEl.requestVideoFrameCallback(function () {
            if (sampleVideoHasPicture()) finish(true);
          });
        }
      } catch (eRvf) {}
      videoEl.addEventListener(
        "playing",
        function () {
          kickstartVideoDecode();
          setTimeout(tick, 80);
        },
        { once: true },
      );
      videoEl.addEventListener("timeupdate", tick, { once: true });
      setTimeout(tick, 200);
    });
  }

  function abortPreviewToThumb() {
    try {
      videoEl.pause();
    } catch (eP) {}
    try {
      videoEl.removeAttribute("src");
      videoEl.load();
    } catch (eL) {}
    if (hlsInstance) {
      try {
        hlsInstance.destroy();
      } catch (eH) {}
      hlsInstance = null;
    }
    root.classList.remove("vc-kick-pip--playing", "vc-kick-pip--ready", "vc-kick-pip--iframe");
    if (lastPayload && lastPayload.thumbnailUrl) setThumbUrl(String(lastPayload.thumbnailUrl));
    thumbEl.hidden = false;
    syncPlayButton(true);
    syncSoundButton();
  }

  function markVideoVisible() {
    root.classList.add("vc-kick-pip--playing", "vc-kick-pip--ready");
    syncPlayButton(false);
    syncSoundButton();
    if (thumbRefreshTimer) {
      clearInterval(thumbRefreshTimer);
      thumbRefreshTimer = 0;
    }
  }

  function startPreviewFromGesture() {
    if (previewLocked || !lastPayload) return;
    var mp4Url = String(lastPayload.previewMp4Url || "").trim();
    var hlsUrl = String(lastPayload.playbackUrl || "").trim();
    var kickOpen =
      String(lastPayload.url || "").trim() ||
      String((subStatus && subStatus.subscribeUrl) || "").trim() ||
      "https://kick.com/diunk17";
    loadRememberedTime(lastStreamId || (lastPayload && lastPayload.id));
    if (playBtn) {
      playBtn.disabled = true;
      playBtn.classList.add("is-loading");
    }
    function doneLoading() {
      if (playBtn) {
        playBtn.disabled = false;
        playBtn.classList.remove("is-loading");
      }
    }
    function failSoft() {
      abortPreviewToThumb();
      doneLoading();
      return false;
    }
    function failOpenKick() {
      failSoft();
      try {
        window.open(kickOpen, "_blank", "noopener,noreferrer");
      } catch (eO) {}
      return false;
    }
    function afterPainted(okPlay) {
      return waitForPaintedFrame(5500).then(function (painted) {
        if (painted) {
          applyResumeTime();
          markVideoVisible();
          rememberPlaybackTime();
          doneLoading();
          return true;
        }
        return false;
      });
    }
    function wireCommon() {
      videoEl.muted = true;
      playerMuted = true;
      syncSoundButton();
      try {
        videoEl.playsInline = true;
        videoEl.loop = true;
        videoEl.preload = "auto";
        videoEl.removeAttribute("crossorigin");
        videoEl.setAttribute("playsinline", "");
        videoEl.setAttribute("webkit-playsinline", "");
      } catch (eA) {}
      try {
        if (lastPayload && lastPayload.thumbnailUrl) {
          videoEl.setAttribute("poster", String(lastPayload.thumbnailUrl));
          setThumbUrl(String(lastPayload.thumbnailUrl));
          thumbEl.hidden = false;
        }
      } catch (eP) {}
      root.classList.add("vc-kick-pip--playing");
      root.classList.remove("vc-kick-pip--ready", "vc-kick-pip--iframe");
    }
    function playDirectMp4(url) {
      if (hlsInstance) {
        try {
          hlsInstance.destroy();
        } catch (e) {}
        hlsInstance = null;
      }
      wireCommon();
      lastPlaybackUrl = url;
      videoEl.src = withBust(url);
      try {
        videoEl.load();
      } catch (eLoad) {}
      videoEl.addEventListener(
        "loadedmetadata",
        function () {
          applyResumeTime();
        },
        { once: true },
      );
      return tryPlay().then(function () {
        kickstartVideoDecode();
        return tryPlay().then(afterPainted);
      });
    }
    function playBlobMp4(url) {
      return prefetchMp4Blob(url).then(function (objUrl) {
        if (hlsInstance) {
          try {
            hlsInstance.destroy();
          } catch (e) {}
          hlsInstance = null;
        }
        wireCommon();
        videoEl.src = objUrl;
        lastPlaybackUrl = objUrl;
        videoEl.addEventListener(
          "loadedmetadata",
          function () {
            applyResumeTime();
          },
          { once: true },
        );
        return tryPlay().then(function () {
          kickstartVideoDecode();
          return tryPlay().then(afterPainted);
        });
      });
    }
    function playHls() {
      if (!hlsUrl) return Promise.resolve(false);
      return loadHlsLib()
        .then(function (Hls) {
          var native =
            isAppleSafariLike() && !!videoEl.canPlayType("application/vnd.apple.mpegurl");
          wireCommon();
          if (native) {
            if (hlsInstance) {
              try {
                hlsInstance.destroy();
              } catch (e) {}
              hlsInstance = null;
            }
            videoEl.src = withBust(hlsUrl);
            lastPlaybackUrl = hlsUrl;
            videoEl.addEventListener(
              "loadedmetadata",
              function () {
                applyResumeTime();
              },
              { once: true },
            );
            return tryPlay().then(function () {
              kickstartVideoDecode();
              return tryPlay().then(afterPainted);
            });
          }
          if (!Hls.isSupported()) throw new Error("hls_unsupported");
          if (hlsInstance) {
            try {
              hlsInstance.destroy();
            } catch (e) {}
            hlsInstance = null;
          }
          hlsInstance = new Hls({
            enableWorker: false,
            lowLatencyMode: false,
            startLevel: 0,
            startPosition: Math.max(0, Number(playbackResumeAt) || 0),
            maxBufferLength: 24,
          });
          hlsInstance.attachMedia(videoEl);
          hlsInstance.on(Hls.Events.MEDIA_ATTACHED, function () {
            hlsInstance.loadSource(withBust(hlsUrl));
          });
          hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
            applyResumeTime();
            tryPlay();
          });
          lastPlaybackUrl = hlsUrl;
          return tryPlay().then(afterPainted);
        })
        .catch(function () {
          return false;
        });
    }

    var preferHlsFirst = isAppleSafariLike();
    var chain = Promise.resolve(false);
    if (preferHlsFirst && hlsUrl) chain = chain.then(function (ok) { return ok || playHls(); });
    if (mp4Url) {
      chain = chain
        .then(function (ok) { return ok || playDirectMp4(mp4Url); })
        .then(function (ok) { return ok || playBlobMp4(mp4Url); });
    }
    if (!preferHlsFirst && hlsUrl) chain = chain.then(function (ok) { return ok || playHls(); });
    chain
      .then(function (ok) {
        if (!ok) failSoft();
      })
      .catch(function () {
        failSoft();
      });
  }

  function mountPlayback(playbackUrl, forceReload, embedUrl) {
    void embedUrl;
    if (previewLocked) { applyPreviewLock(true); return; }
    var url = String(playbackUrl || "").trim();
    var mp4Url = String((lastPayload && lastPayload.previewMp4Url) || "").trim();
    if (!url && !mp4Url) {
      clearPlayer();
      root.classList.remove("vc-kick-pip--playing", "vc-kick-pip--ready", "vc-kick-pip--iframe", "vc-kick-pip--awaiting-play");
      if (lastPayload && lastPayload.thumbnailUrl) setThumbUrl(String(lastPayload.thumbnailUrl));
      syncPlayButton(false);
      return;
    }
    if (!forceReload && root.classList.contains("vc-kick-pip--ready") && lastPlaybackUrl) {
      syncPlayButton(false);
      tryPlay();
      return;
    }
        if (!forceReload && root.classList.contains("vc-kick-pip--playing") && lastPlaybackUrl) {
      rememberPlaybackTime();
      syncPlayButton(!root.classList.contains("vc-kick-pip--ready"));
      return;
    }
    rememberPlaybackTime();
    ensureKickPreconnect();
    if (playerLoadTimer) { clearTimeout(playerLoadTimer); playerLoadTimer = 0; }
    if (forceReload) revokeMp4ObjectUrl();
    destroyHls();
    try { videoEl.removeAttribute("src"); videoEl.load(); } catch (eClr) {}
    if (playerEl) { playerEl.hidden = true; try { playerEl.src = "about:blank"; } catch (eBlank) {} }
    root.classList.remove("vc-kick-pip--playing", "vc-kick-pip--ready", "vc-kick-pip--iframe");
    lastPlaybackUrl = mp4Url || url;
    videoEl.muted = true;
    playerMuted = true;
    syncSoundButton();
    if (lastPayload && lastPayload.thumbnailUrl) setThumbUrl(String(lastPayload.thumbnailUrl));
    thumbEl.hidden = false;
    root.classList.add("vc-kick-pip--playing");
    syncPlayButton(!isVodPayload());
    if (isVodPayload()) {
      var startVod = function () {
        startPreviewFromGesture();
      };
      if (mp4Url) prefetchMp4Blob(mp4Url).then(startVod).catch(startVod);
      else playerLoadTimer = window.setTimeout(startVod, 80);
    } else if (mp4Url) {
      prefetchMp4Blob(mp4Url).catch(function () {});
    }
  }

  function hideAll() {
    closeDocPip(true);
    clearPlayer();
    applyPreviewLock(false);
    previewLocked = false;
    root.classList.remove("vc-kick-pip--locked");
    if (gateEl) gateEl.hidden = true;
        try {
      localStorage.removeItem(WATCH_KEY);
    } catch (eW) {}
    root.hidden = true;
    reopenBtn.hidden = true;
    document.body.classList.remove("vc-kick-pip-visible");
  }

  function showStream(stream, opts) {
    opts = opts || {};
    if (!stream || !stream.id) {
      hideAll();
      return;
    }
    var sid = String(stream.id).trim();
    lastStreamId = sid;
    loadRememberedTime(sid);
    var dismissed = isStreamDismissed(stream);

    var url = String(stream.url || "").trim() || "https://kick.com/";
    var name = String(stream.displayName || stream.slug || "Kick").trim() || "Kick";
    var kindUi = syncKindUi(stream);
    var title = String(
      stream.title ||
        (kindUi.vod ? t("kickPip.defaultVodTitle", "Ultimo VOD") : t("kickPip.defaultTitle", "Diretta in corso")),
    )
      .trim()
      .replace(/\s+/g, " ");
    var category = String(stream.category || "").trim();
    var thumb = String(stream.thumbnailUrl || "").trim();
    var playback = String(stream.playbackUrl || "").trim();
    var previewMp4 = String(stream.previewMp4Url || "").trim();

    linkEl.setAttribute("href", url);
        linkEl.removeAttribute("aria-label");
    if (openKickEl) {
      openKickEl.setAttribute("href", url);
      openKickEl.setAttribute("aria-label", kindUi.openLabel + ": " + name);
      openKickEl.setAttribute("title", kindUi.openLabel);
    }
    nameEl.textContent = name;
    titleEl.textContent = title;
    if (kindUi.vod) {
      var dur = formatDuration(stream.durationMs);
      var views = formatViews(stream.viewerCount);
      viewersEl.textContent = [dur, views].filter(Boolean).join(" · ");
    } else {
    viewersEl.textContent = formatViewers(stream.viewerCount);
    }
    if (category) {
      categoryEl.textContent = category;
      categoryEl.hidden = false;
    } else {
      categoryEl.textContent = "";
      categoryEl.hidden = true;
    }

    if (thumb) {
      thumbEl.alt = name + " — " + title;
      setThumbUrl(thumb);
      if (kindUi.vod) {
        if (thumbRefreshTimer) {
          clearInterval(thumbRefreshTimer);
          thumbRefreshTimer = 0;
        }
      } else startThumbRefresh(thumb);
    } else setThumbUrl("");

    lastPayload = stream;
    ensureWatchTracking(sid);
    gateEl.setAttribute("href", url);

    if (dismissed) {
      flushWatchSession();
      closeDocPip(true);
      clearPlayer();
      root.hidden = true;
      reopenBtn.hidden = false;
      document.body.classList.remove("vc-kick-pip-visible");
      return;
    }

    root.hidden = false;
    reopenBtn.hidden = true;
    document.body.classList.add("vc-kick-pip-visible");
    restorePos();
    startPreviewLimitWatcher();
    resumeWatchSession(sid);

    if (isPreviewExpired(sid)) {
      applyPreviewLock(true);
      return;
    }
    applyPreviewLock(false);
    var embed = String(stream.embedUrl || "").trim();
    if (playback || previewMp4) mountPlayback(playback, opts.forceReload === true, embed);
    else if (embed) mountIframeFallback(embed);
    else clearPlayer();
    refreshSubStatus();
  }

  function toggleSoundFromGesture() {
    if (previewLocked) return;
    playerMuted = !playerMuted;
    videoEl.muted = playerMuted;
    syncSoundButton();
    if (!playerMuted) tryPlay();
  }

  function endDrag(ev) {
    if (!dragState) return;
    var pointerId = dragState.pointerId;
    var moved = dragState.moved;
    var left = dragState.left;
    var top = dragState.top;
    dragState = null;
    root.classList.remove("vc-kick-pip--dragging");
    try {
      if (ev && root.releasePointerCapture) root.releasePointerCapture(pointerId);
    } catch (eRel) {}
    if (!moved) return;
    var w = root.offsetWidth || 280;
    var h = root.offsetHeight || 220;
    var edgeX = Math.min(left, window.innerWidth - left - w) / window.innerWidth;
    var edgeY = Math.min(top, window.innerHeight - top - h) / window.innerHeight;
    if (edgeX < 0.08 || edgeY < 0.08) applyCorner(nearestCorner(left, top));
    else applyFree(left, top);
  }

  function onDragMove(ev) {
    if (!dragState || ev.pointerId !== dragState.pointerId) return;
    var dx = ev.clientX - dragState.startX;
    var dy = ev.clientY - dragState.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) dragState.moved = true;
    if (!dragState.moved) return;
    ev.preventDefault();
    var next = clampPos(dragState.originLeft + dx, dragState.originTop + dy);
    dragState.left = next.left;
    dragState.top = next.top;
    clearCornerClasses();
    root.classList.add("vc-kick-pip--free", "vc-kick-pip--dragging");
    root.style.left = Math.round(next.left) + "px";
    root.style.top = Math.round(next.top) + "px";
    root.style.right = "auto";
    root.style.bottom = "auto";
  }

  function isCoarsePointer() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 639.98px)").matches) return true;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return true;
      if (window.matchMedia && window.matchMedia("(hover: none)").matches) return true;
      if (Number(navigator.maxTouchPoints || 0) > 0) return true;
    } catch (eCoarse) {}
    return false;
  }

  function startDrag(ev, opts) {
    if (docPipWindow) return;
    if (!ev || (ev.button != null && ev.button !== 0)) return;
    opts = opts || {};
    var rect = root.getBoundingClientRect();
    dragState = {
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      originLeft: rect.left,
      originTop: rect.top,
      left: rect.left,
      top: rect.top,
      moved: false,
      captureOnMove: opts.captureOnMove === true,
      captured: false,
    };
    root.classList.add("vc-kick-pip--dragging");
    if (!dragState.captureOnMove) {
      try {
        root.setPointerCapture(ev.pointerId);
        dragState.captured = true;
      } catch (eCap) {}
      try {
        ev.preventDefault();
      } catch (ePrev) {}
    }
  }

  root.addEventListener("pointerdown", function (ev) {
    var tEl = ev && ev.target;
    if (!tEl || !tEl.closest) return;
    if (tEl.closest("[data-vc-kick-pip-dismiss], [data-vc-kick-pip-float], [data-vc-kick-pip-sound], [data-vc-kick-pip-play], [data-vc-kick-pip-sub], .vc-kick-pip__gate, .vc-kick-pip__open")) return;
    if (tEl.closest("video")) return;
    var coarse = isCoarsePointer();
    /* kickPhoneOn1: su telefono trascina solo dal handle, non da tutta la card */
    var canDrag = coarse
      ? !!tEl.closest("[data-vc-kick-pip-drag]")
      : !!(tEl.closest("[data-vc-kick-pip-drag]") || tEl.closest(".vc-kick-pip__chrome") || tEl.closest(".vc-kick-pip__meta"));
    if (canDrag) {
      metaDragMoved = false;
      startDrag(ev, { captureOnMove: coarse });
    }
  });
  root.addEventListener("pointermove", function (ev) {
    if (dragState && dragState.captureOnMove && !dragState.captured) {
      var dx0 = Math.abs(ev.clientX - dragState.startX);
      var dy0 = Math.abs(ev.clientY - dragState.startY);
      if (dx0 + dy0 > 6) {
        try {
          root.setPointerCapture(ev.pointerId);
          dragState.captured = true;
        } catch (eCap2) {}
        try {
          ev.preventDefault();
        } catch (ePrev2) {}
      }
    }
    if (dragState && dragState.moved) metaDragMoved = true;
    onDragMove(ev);
  });
  root.addEventListener("pointerup", endDrag);
  root.addEventListener("pointercancel", endDrag);

  linkEl.addEventListener("click", function (ev) {
    if (metaDragMoved) {
      ev.preventDefault();
      ev.stopPropagation();
      metaDragMoved = false;
    }
  });

  function copyStylesToPip(pipDoc) {
    try {
      var nodes = document.querySelectorAll('link[rel="stylesheet"], style');
      for (var i = 0; i < nodes.length; i += 1) pipDoc.head.appendChild(nodes[i].cloneNode(true));
      var base = pipDoc.createElement("style");
      base.textContent =
        "html,body{margin:0;padding:0;background:#050605;overflow:hidden;height:100%;}" +
        "#vc-kick-pip{position:static!important;inset:auto!important;width:100%!important;max-width:none!important;height:100%!important;border-radius:0!important;box-shadow:none!important;}" +
        "#vc-kick-pip .vc-kick-pip__media{aspect-ratio:auto;height:calc(100% - 4.6rem);}" +
        "#vc-kick-pip .vc-kick-pip__video{opacity:1!important;}";
      pipDoc.head.appendChild(base);
    } catch (eStyle) {}
  }

  function returnFromDocPip() {
    rememberPlaybackTime();
    var wasPlaying = false;
    try {
      wasPlaying = !videoEl.paused;
    } catch (eW) {}
    if (!homeParent) {
      try {
        document.body.appendChild(root);
      } catch (e0) {}
    } else if (homeNext && homeNext.parentNode === homeParent) homeParent.insertBefore(root, homeNext);
    else homeParent.appendChild(root);
    homeParent = null;
    homeNext = null;
    docPipWindow = null;
    root.classList.remove("vc-kick-pip--docpip");
    if (floatBtn) {
      floatBtn.setAttribute("aria-label", t("kickPip.float", "Apri in Picture-in-Picture"));
      floatBtn.title = t("kickPip.float", "Apri in Picture-in-Picture");
    }
    restorePos();
    scheduleResumeRestore();
    if (wasPlaying || root.classList.contains("vc-kick-pip--ready")) {
      tryPlay().then(function () {
        scheduleResumeRestore();
      });
    }
  }

  function closeDocPip(silent) {
    if (!docPipWindow) return;
    rememberPlaybackTime();
    try {
      docPipWindow.close();
    } catch (eClose) {}
    if (!silent) returnFromDocPip();
    docPipWindow = null;
  }

  async function openDocPip() {
    if (!supportsDocPip()) return;
    if (docPipWindow) {
      try {
        docPipWindow.focus();
      } catch (eF) {}
      return;
    }
    rememberPlaybackTime();
    var wasPlaying = false;
    try {
      wasPlaying = !videoEl.paused && root.classList.contains("vc-kick-pip--ready");
    } catch (eWas) {}
    var w = Math.max(280, Math.round(root.offsetWidth || 300));
    var h = Math.max(220, Math.round(root.offsetHeight || 240));
    var pipWin = await window.documentPictureInPicture.requestWindow({ width: w, height: h });
    docPipWindow = pipWin;
    homeParent = root.parentNode;
    homeNext = root.nextSibling;
    copyStylesToPip(pipWin.document);
    pipWin.document.body.appendChild(root);
    root.classList.add("vc-kick-pip--docpip");
    root.style.left = "";
    root.style.top = "";
    root.style.right = "";
    root.style.bottom = "";
    clearCornerClasses();
    if (floatBtn) {
      floatBtn.setAttribute("aria-label", t("kickPip.floatClose", "Chiudi Picture-in-Picture"));
      floatBtn.title = t("kickPip.floatClose", "Chiudi Picture-in-Picture");
    }
    pipWin.addEventListener("pagehide", function () {
      returnFromDocPip();
    });
        scheduleResumeRestore();
    if (wasPlaying) {
      tryPlay().then(function () {
        scheduleResumeRestore();
      });
    } else if (root.classList.contains("vc-kick-pip--ready")) {
      tryPlay().then(function () {
        scheduleResumeRestore();
      });
    }
  }

  root.addEventListener("click", function (e) {
    var tEl = e && e.target;
    if (!tEl || !tEl.closest) return;
    if (tEl.closest("[data-vc-kick-pip-dismiss]")) {
      e.preventDefault();
      e.stopPropagation();
      flushWatchSession();
      if (lastPayload) setDismissedStream(lastPayload);
      else if (lastStreamId) setDismissedStreamId(lastStreamId);
      closeDocPip(true);
      clearPlayer();
      root.hidden = true;
      reopenBtn.hidden = false;
      document.body.classList.remove("vc-kick-pip-visible");
      returnFromDocPip();
      return;
    }
    if (tEl.closest("[data-vc-kick-pip-sound]")) {
      e.preventDefault();
      e.stopPropagation();
      toggleSoundFromGesture();
      return;
    }
    if (tEl.closest("[data-vc-kick-pip-play]") || (root.classList.contains("vc-kick-pip--awaiting-play") && tEl.closest(".vc-kick-pip__media") && !tEl.closest(".vc-kick-pip__gate") && !tEl.closest(".vc-kick-pip__chrome"))) {
      e.preventDefault();
      e.stopPropagation();
      startPreviewFromGesture();
      return;
    }
    if (tEl.closest("[data-vc-kick-pip-sub]")) {
      e.preventDefault();
      e.stopPropagation();
      handleSubClick();
      return;
    }
    if (tEl.closest("[data-vc-kick-pip-float]")) {
      e.preventDefault();
      e.stopPropagation();
      if (docPipWindow) {
        closeDocPip(false);
        return;
      }
      openDocPip().catch(function () {});
      return;
    }
    if (tEl.closest("[data-vc-kick-pip-drag]")) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  reopenBtn.addEventListener("click", function () {
    clearDismissedStreamId();
    reopenBtn.hidden = true;
    if (lastPayload) showStream(lastPayload, { forceReload: true });
    else poll();
  });

  window.addEventListener("pagehide", function () {
    try {
      if (root.hidden && reopenBtn && !reopenBtn.hidden) {
        setUserClosedPip(true, { skipPublish: false });
        if (lastPayload) setDismissedStream(lastPayload);
      }
    } catch (eHide) {}
  });

  videoEl.addEventListener("timeupdate", function () {
    if (root.classList.contains("vc-kick-pip--ready")) rememberPlaybackTime();
  });
  videoEl.addEventListener("pause", function () {
    rememberPlaybackTime();
  });

  window.addEventListener("resize", function () {
    if (docPipWindow || root.hidden) return;
    if (root.classList.contains("vc-kick-pip--free")) {
      applyFree(parseFloat(root.style.left) || margin(), parseFloat(root.style.top) || margin());
    }
  });

  function poll() {
    var u = resolvedApiUrl();
    if (!u) return;
    var sep = u.indexOf("?") >= 0 ? "&" : "?";
    fetch(u + sep + "_vck=" + encodeURIComponent(String(Date.now())), {
      credentials: "omit",
      cache: "no-store",
    })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || j.ok !== true) {
                    return;
        }
        if (j.active && j.primary && j.primary.id) {
          pollMisses = 0;
          showStream(j.primary);
          return;
        }
                pollMisses += 1;
        var sticky =
          lastPayload &&
          lastPayload.id &&
          (root.classList.contains("vc-kick-pip--ready") ||
            root.classList.contains("vc-kick-pip--playing") ||
            root.classList.contains("vc-kick-pip--locked") ||
            !root.hidden ||
            !reopenBtn.hidden);
        if (sticky && pollMisses < POLL_HIDE_AFTER_MISSES) {
          return;
        }
                lastPayload = null;
        lastStreamId = "";
        pollMisses = 0;
        hideAll();
      })
      .catch(function () {
              });
  }

  ensureKickPreconnect();
  restorePos();
  syncSoundButton();
  syncSubButton();
  refreshSubStatus();
  startPreviewLimitWatcher();

  window.addEventListener("vc-discord-profile", function () {
    refreshSubStatus();
  });
  window.addEventListener("focus", function () {
    refreshSubStatus();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      flushWatchSession();
      return;
    }
    if (lastStreamId && !root.hidden) resumeWatchSession(lastStreamId);
    refreshSubStatus();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(poll, 350);
    });
  } else setTimeout(poll, 350);
  setInterval(poll, pollMs);

  try {
    if (window.__VC_CHROME_SYNC) {
      window.__VC_CHROME_SYNC.subscribe(function (prefs) {
        if (!prefs || !prefs.kickPip) return;
        if (prefs.kickPip.pos) {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(prefs.kickPip.pos));
            restorePos();
          } catch (eP) {}
        }
        if (prefs.kickPip.dismiss === null) {
          try {
            localStorage.removeItem(DISMISS_KEY);
          } catch (eC) {}
          setUserClosedPip(false, { skipPublish: true });
          if (reopenBtn) reopenBtn.hidden = true;
          return;
        }
        if (prefs.kickPip.userClosed === true) {
          setUserClosedPip(true, { skipPublish: true });
        } else if (prefs.kickPip.userClosed === false) {
          setUserClosedPip(false, { skipPublish: true });
        }
        if (prefs.kickPip.dismiss && typeof prefs.kickPip.dismiss === "object") {
          try {
            localStorage.setItem(DISMISS_KEY, JSON.stringify(prefs.kickPip.dismiss));
          } catch (eD) {}
          if (lastPayload && isStreamDismissed(lastPayload)) {
            hideAll();
            if (reopenBtn) reopenBtn.hidden = false;
          }
        }
        if (prefs.kickPip.resume && prefs.kickPip.resume.id && Number(prefs.kickPip.resume.t) > 0.2) {
          try {
            localStorage.setItem(
              resumeStorageKey(prefs.kickPip.resume.id),
              String(prefs.kickPip.resume.t),
            );
          } catch (eR) {}
        }
      });
    }
  } catch (eSub) {}
})();
