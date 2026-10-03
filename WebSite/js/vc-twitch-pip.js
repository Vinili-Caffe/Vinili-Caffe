/**
 * Homepage Twitch live/VOD pill — same UX as Kick PIP, no link/sub buttons.
 * twitchPip5 — 400x300, no overlays on video, click-to-play (Twitch autoplay rules)
 * twitchPipKindFix1 — badge/reopen VOD subito anche se pill chiusa/dismissed
 * twitchPipPrefs1 — open/closed (+pos) synced via __VC_CHROME_SYNC across devices
 */
(function initTwitchLivePip() {
  var cfg = typeof window !== "undefined" ? window.__VC_TWITCH_PIP : null;
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
  /* pwaCpuNuke1: PWA desktop — niente poll Twitch */
  try {
    if (
      window.__VC_PWA_CPU_NUKE ||
      document.documentElement.classList.contains("vc-pwa-cpu-nuke") ||
      (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    ) {
      return;
    }
  } catch (eNukeTw) {}

  var DISMISS_KEY = "vc_twitch_pip_dismiss_v1";
  var USER_CLOSED_KEY = "vc_twitch_pip_user_closed_v1";
  var DISMISS_TTL_MS = 18 * 60 * 60 * 1000;
  var POS_KEY = "vc_twitch_pip_pos_v1";
  var pollMs = Math.max(30000, Math.min(180000, Number(cfg.pollIntervalMs) || 90000));
  var POLL_HIDE_AFTER_MISSES = 3;
  var lastPayload = null;
  var lastStreamId = "";
  var pollMisses = 0;
  var dragState = null;
  var preconnectDone = false;

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function safeInset(side) {
    try {
      var st = getComputedStyle(document.documentElement);
      var v = st.getPropertyValue("env(safe-area-inset-" + side + ")");
      var n = parseFloat(v);
      return Number.isFinite(n) ? n : 0;
    } catch (e) {
      return 0;
    }
  }

  function margin() {
    return Math.max(10, Math.ceil(safeInset("left") + 8));
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
    var prod = String(cfg.apiUrl || "/webhooks/site-twitch-live").trim() || "/webhooks/site-twitch-live";
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

  function ensurePreconnect() {
    if (preconnectDone) return;
    preconnectDone = true;
    ["https://player.twitch.tv", "https://static-cdn.jtvnw.net", "https://www.twitch.tv"].forEach(function (href) {
      try {
        var l = document.createElement("link");
        l.rel = "preconnect";
        l.href = href;
        l.crossOrigin = "anonymous";
        document.head.appendChild(l);
      } catch (e) {}
    });
  }

  function readDismiss() {
    try {
      var raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) {
        try {
          var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
          if (sync && sync.twitchPip && sync.twitchPip.dismiss && typeof sync.twitchPip.dismiss === "object") {
            raw = JSON.stringify(sync.twitchPip.dismiss);
          }
        } catch (eSy) {}
      }
      if (!raw) return null;
      var j = JSON.parse(raw);
      if (!j || !j.until || Date.now() > Number(j.until)) {
        localStorage.removeItem(DISMISS_KEY);
        return null;
      }
      return j;
    } catch (e) {
      return null;
    }
  }

  function writeDismiss(streamId, opts) {
    opts = opts || {};
    var state = null;
    if (streamId != null && String(streamId) !== "") {
      state = { id: String(streamId || ""), until: Date.now() + DISMISS_TTL_MS };
    }
    try {
      if (!state) localStorage.removeItem(DISMISS_KEY);
      else localStorage.setItem(DISMISS_KEY, JSON.stringify(state));
    } catch (e) {}
    if (opts.skipPublish) return;
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({
          twitchPip: { dismiss: state },
        });
      }
    } catch (eSy) {}
  }

  function isUserClosed() {
    try {
      if (localStorage.getItem(USER_CLOSED_KEY) === "1") return true;
    } catch (e0) {}
    try {
      var sync = window.__VC_CHROME_SYNC && window.__VC_CHROME_SYNC.get();
      if (sync && sync.twitchPip && sync.twitchPip.userClosed === true) return true;
    } catch (e1) {}
    return false;
  }

  function setUserClosed(on, opts) {
    opts = opts || {};
    try {
      if (on) localStorage.setItem(USER_CLOSED_KEY, "1");
      else localStorage.removeItem(USER_CLOSED_KEY);
    } catch (e) {}
    if (opts.skipPublish) return;
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({
          twitchPip: { userClosed: on === true },
        });
      }
    } catch (eSy) {}
  }

  function savePos(pos) {
    try {
      localStorage.setItem(POS_KEY, JSON.stringify(pos || {}));
    } catch (e) {}
    try {
      if (window.__VC_CHROME_SYNC) {
        window.__VC_CHROME_SYNC.publish({ twitchPip: { pos: pos || { corner: "bl" } } });
      }
    } catch (eSy) {}
  }

  function loadPos() {
    try {
      var j = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      return j && typeof j === "object" ? j : null;
    } catch (e) {
      return null;
    }
  }

  function ensureRoot() {
    var n = document.getElementById("vc-twitch-pip");
    if (n) return n;
    n = document.createElement("aside");
    n.id = "vc-twitch-pip";
    n.className = "vc-kick-pip vc-twitch-pip vc-kick-pip--corner-bl";
    n.hidden = true;
    n.setAttribute("role", "complementary");
    n.setAttribute("aria-label", t("twitchPip.aria", "Anteprima live Twitch"));
    n.innerHTML =
      '<div class="vc-kick-pip__chrome">' +
      '<button type="button" class="vc-kick-pip__drag" data-vc-twitch-pip-drag aria-label="' +
      t("twitchPip.drag", "Trascina anteprima") +
      '" title="' +
      t("twitchPip.drag", "Trascina anteprima") +
      '"><i class="fa fa-arrows" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-kick-pip__close" data-vc-twitch-pip-dismiss aria-label="' +
      t("twitchPip.hide", "Nascondi anteprima") +
      '"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-kick-pip__media" id="vc-twitch-pip-media">' +
      '<img class="vc-kick-pip__thumb" id="vc-twitch-pip-thumb" alt="" decoding="async" fetchpriority="low" loading="lazy" referrerpolicy="no-referrer" />' +
      '<div class="vc-kick-pip__player vc-twitch-pip__host" id="vc-twitch-pip-host" hidden></div>' +
      '<button type="button" class="vc-kick-pip__play" data-vc-twitch-pip-play hidden aria-label="' +
      t("twitchPip.play", "Riproduci anteprima") +
      '" title="' +
      t("twitchPip.play", "Riproduci anteprima") +
      '"><i class="fa fa-play" aria-hidden="true"></i></button>' +
      '<span class="vc-kick-pip__live" id="vc-twitch-pip-badge"><span class="vc-kick-pip__live-dot" aria-hidden="true"></span> <span class="vc-kick-pip__live-text">LIVE</span></span>' +
      "</div>" +
      '<div class="vc-kick-pip__footer">' +
      '<div class="vc-kick-pip__meta" id="vc-twitch-pip-meta">' +
      '<span class="vc-kick-pip__name" id="vc-twitch-pip-name"></span>' +
      '<span class="vc-kick-pip__title" id="vc-twitch-pip-title"></span>' +
      '<span class="vc-kick-pip__category" id="vc-twitch-pip-category" hidden></span>' +
      '<span class="vc-kick-pip__viewers" id="vc-twitch-pip-viewers"></span>' +
      "</div>" +
      "</div>";
    document.body.appendChild(n);
    ensurePlayerIframe(n);
    return n;
  }

  function ensurePlayerIframe(rootEl) {
    ensurePreconnect();
    var media = (rootEl || document).querySelector("#vc-twitch-pip-media");
    if (!media) return null;
    var existing = document.getElementById("vc-twitch-pip-player");
    if (existing) {
      try {
        existing.removeAttribute("allowfullscreen");
        existing.allowFullscreen = false;
        /* consoleRest1: no fullscreen feature — avoids allow vs allowfullscreen warn */
        existing.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
      } catch (eFix) {}
      return existing;
    }
    var iframe = document.createElement("iframe");
    iframe.id = "vc-twitch-pip-player";
    iframe.className = "vc-kick-pip__player";
    iframe.title = t("twitchPip.playerTitle", "Player Twitch");
    iframe.hidden = true;
    iframe.setAttribute("referrerpolicy", "origin-when-cross-origin");
    iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
    try {
      iframe.removeAttribute("allowfullscreen");
      iframe.allowFullscreen = false;
    } catch (eAf) {}
    var host = media.querySelector("#vc-twitch-pip-host");
    if (host && host.nextSibling) media.insertBefore(iframe, host.nextSibling);
    else if (host) media.appendChild(iframe);
    else media.insertBefore(iframe, media.firstChild);
    return iframe;
  }

  function ensureReopen() {
    var btn = document.getElementById("vc-twitch-pip-reopen");
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "vc-twitch-pip-reopen";
    btn.className = "vc-kick-pip-reopen vc-twitch-pip-reopen";
    btn.hidden = true;
    btn.setAttribute("aria-controls", "vc-twitch-pip");
    btn.setAttribute("aria-label", t("twitchPip.reopenAria", "Mostra anteprima Twitch"));
    btn.innerHTML =
      '<span class="vc-kick-pip-reopen__dot" aria-hidden="true"></span><span>' +
      t("twitchPip.reopen", "Live Twitch") +
      "</span>";
    document.body.appendChild(btn);
    return btn;
  }

  var root = ensureRoot();
  ensurePlayerIframe(root);
  var reopenBtn = ensureReopen();
  var metaEl = document.getElementById("vc-twitch-pip-meta");
  var thumbEl = document.getElementById("vc-twitch-pip-thumb");
  var playerEl = document.getElementById("vc-twitch-pip-player");
  var hostEl = document.getElementById("vc-twitch-pip-host");
  var nameEl = document.getElementById("vc-twitch-pip-name");
  var titleEl = document.getElementById("vc-twitch-pip-title");
  var categoryEl = document.getElementById("vc-twitch-pip-category");
  var viewersEl = document.getElementById("vc-twitch-pip-viewers");
  var badgeEl = document.getElementById("vc-twitch-pip-badge");
  var badgeTextEl = badgeEl ? badgeEl.querySelector(".vc-kick-pip__live-text") : null;
  var playBtn = root.querySelector("[data-vc-twitch-pip-play]");
  var twitchPlayer = null;
  var twitchSdkPromise = null;
  if (!root || !reopenBtn || !metaEl || !thumbEl || !playerEl || !hostEl || !nameEl || !titleEl || !categoryEl || !viewersEl) {
    return;
  }

  try {
    thumbEl.setAttribute("referrerpolicy", "no-referrer");
  } catch (eRef) {}

  function isVod(stream) {
    var kind = String((stream && stream.kind) || "").toLowerCase();
    if (kind === "vod") return true;
    if (kind === "live") return false;
    try {
      var embed = String((stream && stream.embedUrl) || "");
      if (/[?&]video=/i.test(embed)) return true;
      var url = String((stream && stream.url) || "");
      if (/twitch\.tv\/videos\//i.test(url)) return true;
    } catch (eDet) {}
    return false;
  }

  function syncKindUi(stream) {
    var vod = isVod(stream);
    root.classList.toggle("vc-kick-pip--vod", vod);
    root.classList.toggle("vc-kick-pip--live", !vod);
    root.classList.toggle("vc-twitch-pip--vod", vod);
    root.classList.toggle("vc-twitch-pip--live", !vod);
    reopenBtn.classList.toggle("vc-twitch-pip-reopen--vod", vod);
    reopenBtn.classList.toggle("vc-kick-pip-reopen--vod", vod);
    /* Re-query: i18n/DOM swap può staccare il nodo iniziale */
    var badgeText =
      (badgeEl && badgeEl.querySelector(".vc-kick-pip__live-text")) || badgeTextEl;
    if (badgeText) badgeText.textContent = vod ? t("twitchPip.badgeVod", "VOD") : "LIVE";
    if (badgeEl) badgeEl.setAttribute("data-vc-kind", vod ? "vod" : "live");
    var reopenLabel = vod ? t("twitchPip.reopenVod", "VOD Twitch") : t("twitchPip.reopen", "Live Twitch");
    reopenBtn.setAttribute(
      "aria-label",
      vod ? t("twitchPip.reopenVodAria", "Mostra ultimo VOD Twitch") : t("twitchPip.reopenAria", "Mostra anteprima live Twitch"),
    );
    var reopenSpan = reopenBtn.querySelector("span:last-child");
    if (reopenSpan) reopenSpan.textContent = reopenLabel;
    return { vod: vod };
  }

  function formatViewers(v) {
    var n = Math.max(0, Math.floor(Number(v) || 0));
    try {
      return n.toLocaleString("it-IT") + " " + t("twitchPip.viewers", "spettatori");
    } catch (e) {
      return String(n);
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
    var midX = window.innerWidth / 2;
    var midY = window.innerHeight / 2;
    if (cy < midY) return cx < midX ? "tl" : "tr";
    return cx < midX ? "bl" : "br";
  }

  function restorePos() {
    var pos = loadPos();
    if (pos && pos.corner) applyCorner(String(pos.corner));
    else if (pos && Number.isFinite(Number(pos.left)) && Number.isFinite(Number(pos.top))) {
      applyFree(Number(pos.left), Number(pos.top));
    } else applyCorner("bl");
  }

  var TWITCH_MIN_W = 400;

  function fitTwitchEmbed() {
    // Twitch autoplay usa getBoundingClientRect: niente scale CSS.
    // Assicura solo che il box PiP sia abbastanza largo e il player visibile.
    try {
      playerEl.style.opacity = "1";
      playerEl.style.visibility = "visible";
      playerEl.style.pointerEvents = "auto";
      playerEl.style.transform = "none";
      playerEl.style.width = "100%";
      playerEl.style.height = "100%";
      playerEl.style.inset = "0";
      playerEl.style.top = "0";
      playerEl.style.left = "0";
      playerEl.style.zIndex = "2";
    } catch (eFit) {}
    return root.clientWidth || TWITCH_MIN_W;
  }

  function stopPlayer() {
    try {
      playerEl.hidden = true;
      playerEl.removeAttribute("src");
      playerEl.src = "about:blank";
      playerEl.style.transform = "";
      playerEl.style.width = "";
      playerEl.style.height = "";
      playerEl.style.inset = "";
      if (hostEl) {
        hostEl.hidden = true;
        hostEl.innerHTML = "";
      }
    } catch (e) {}
    root.classList.remove("vc-kick-pip--playing", "vc-kick-pip--ready", "vc-kick-pip--iframe", "vc-kick-pip--awaiting-play");
    if (playBtn) playBtn.hidden = false;
    if (badgeEl) badgeEl.hidden = false;
  }

  function hideAll() {
    stopPlayer();
    root.hidden = true;
    reopenBtn.hidden = true;
  }

  function showPill() {
    root.hidden = false;
    reopenBtn.hidden = true;
  }

  function showReopenOnly() {
    stopPlayer();
    root.hidden = true;
    reopenBtn.hidden = false;
  }

  function resolveMediaUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return "";
    if (/^https?:\/\//i.test(u) || u.indexOf("data:") === 0) return u;
    try {
      return new URL(u, window.location.origin).toString();
    } catch (e) {
      return u;
    }
  }

  function setThumb(stream) {
    var primary = resolveMediaUrl(stream && stream.thumbnailUrl);
    var fallback = resolveMediaUrl(stream && stream.thumbnailUrlDirect);
    thumbEl.onerror = function () {
      if (fallback && thumbEl.getAttribute("data-vc-thumb-try") !== "2" && fallback !== primary) {
        thumbEl.setAttribute("data-vc-thumb-try", "2");
        thumbEl.src = fallback;
        return;
      }
      thumbEl.hidden = true;
    };
    thumbEl.onload = function () {
      thumbEl.hidden = false;
    };
    if (!primary && !fallback) {
      thumbEl.hidden = true;
      thumbEl.removeAttribute("src");
      return;
    }
    var next = primary || fallback;
    thumbEl.hidden = false;
    thumbEl.setAttribute("data-vc-thumb-try", "1");
    if (thumbEl.getAttribute("src") !== next) thumbEl.src = next;
  }

  function loadEmbed(stream) {
    var embed = String((stream && stream.embedUrl) || "").trim();
    if (!embed) return false;
    root.classList.add("vc-kick-pip--playing", "vc-kick-pip--iframe", "vc-kick-pip--ready");
    root.classList.remove("vc-kick-pip--awaiting-play");
    if (playBtn) playBtn.hidden = true;
    if (badgeEl) badgeEl.hidden = true;
    playerEl.hidden = false;
    playerEl.removeAttribute("hidden");
    fitTwitchEmbed();
    // Aspetta layout 400x300 + chrome fuori dal video prima del src
    window.requestAnimationFrame(function () {
      fitTwitchEmbed();
      window.setTimeout(function () {
        fitTwitchEmbed();
        try {
          if (playerEl.src !== embed) playerEl.src = embed;
        } catch (e) {
          playerEl.src = embed;
        }
      }, 50);
    });
    return true;
  }

  function showStream(stream) {
    if (!stream || !stream.id) return;
    /* twitchPipKindFix1: sync badge/reopen SUBITO (anche se dismissed/chiusa) */
    var kindUi = syncKindUi(stream);
    lastPayload = stream;

    var dismiss = readDismiss();
    if (dismiss && String(dismiss.id) === String(stream.id)) {
      lastStreamId = String(stream.id);
      showReopenOnly();
      return;
    }
    /* twitchPipPrefs1: closed stays closed across reload/devices until user reopens */
    if (isUserClosed()) {
      lastStreamId = String(stream.id);
      showReopenOnly();
      return;
    }

    var same = lastStreamId === String(stream.id);
    var wasPlaying = root.classList.contains("vc-kick-pip--playing");
    lastStreamId = String(stream.id);

    nameEl.textContent = String(stream.displayName || stream.login || "Twitch");
    titleEl.textContent =
      String(stream.title || "").trim() ||
      (kindUi.vod ? t("twitchPip.defaultVodTitle", "Ultimo VOD") : t("twitchPip.defaultTitle", "Diretta in corso"));

    var cat = String(stream.category || "").trim();
    if (cat) {
      categoryEl.hidden = false;
      categoryEl.textContent = cat;
    } else {
      categoryEl.hidden = true;
      categoryEl.textContent = "";
    }

    if (kindUi.vod) {
      var dur = formatDuration(stream.durationMs);
      viewersEl.textContent = dur
        ? dur + " · " + formatViewers(stream.viewerCount)
        : formatViewers(stream.viewerCount);
    } else {
      viewersEl.textContent = formatViewers(stream.viewerCount);
    }

    setThumb(stream);
    showPill();
    if (badgeEl) badgeEl.hidden = false;

    // Non auto-avviare l'embed: thumb + play (gesto utente). Se già in play sullo stesso id, resta.
    if (same && wasPlaying && root.classList.contains("vc-kick-pip--ready")) return;
    stopPlayer();
    if (playBtn) playBtn.hidden = false;
    root.classList.add("vc-kick-pip--awaiting-play");
  }

  function startPlayback() {
    if (!lastPayload) return;
    loadEmbed(lastPayload);
  }

  root.addEventListener("click", function (ev) {
    var tEl = ev.target;
    if (!tEl || !tEl.closest) return;
    if (tEl.closest("[data-vc-twitch-pip-dismiss]")) {
      ev.preventDefault();
      writeDismiss(lastStreamId);
      setUserClosed(true);
      showReopenOnly();
      return;
    }
    if (tEl.closest("[data-vc-twitch-pip-drag]")) return;
    if (tEl.closest("[data-vc-twitch-pip-play]") || tEl.closest("#vc-twitch-pip-media")) {
      if (root.classList.contains("vc-kick-pip--playing") && root.classList.contains("vc-kick-pip--ready")) return;
      ev.preventDefault();
      startPlayback();
    }
  });

  reopenBtn.addEventListener("click", function () {
    writeDismiss(null);
    setUserClosed(false);
    if (lastPayload) showStream(lastPayload);
    else poll();
  });

  root.querySelector("[data-vc-twitch-pip-drag]").addEventListener("pointerdown", function (ev) {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    var r = root.getBoundingClientRect();
    dragState = {
      ox: ev.clientX - r.left,
      oy: ev.clientY - r.top,
      pointerId: ev.pointerId,
    };
    root.classList.add("vc-kick-pip--dragging");
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch (eCap) {}
  });

  window.addEventListener("pointermove", function (ev) {
    if (!dragState) return;
    applyFree(ev.clientX - dragState.ox, ev.clientY - dragState.oy);
  });

  window.addEventListener("pointerup", function (ev) {
    if (!dragState) return;
    root.classList.remove("vc-kick-pip--dragging");
    var r = root.getBoundingClientRect();
    applyCorner(nearestCorner(r.left, r.top));
    dragState = null;
  });

  function pollJson(url) {
    /* siteApiW7: stable URL + ETag via VcApiCache when present */
    if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
      var cacheKey = window.VcApiCache.keyFor(url, { scope: "live" });
      return window.VcApiCache
        .fetchWithCache(cacheKey, url, {
          ttlMs: 30000,
          staleMs: 3 * 60 * 1000,
          timeoutMs: 12000,
          fetchInit: { cache: "default", credentials: "omit" },
        })
        .then(function (payload) {
          return payload && payload.body ? payload.body : null;
        });
    }
    return fetch(url, { credentials: "omit", cache: "default" }).then(function (r) {
      return r.json().catch(function () {
        return null;
      });
    });
  }

  function poll() {
    var u = resolvedApiUrl();
    if (!u) return;
    pollJson(u)
      .then(function (j) {
        if (!j || j.ok !== true) return;
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
            !root.hidden ||
            !reopenBtn.hidden);
        if (sticky && pollMisses < POLL_HIDE_AFTER_MISSES) return;
        lastPayload = null;
        lastStreamId = "";
        pollMisses = 0;
        hideAll();
      })
      .catch(function () {});
  }

  /* lighthouseLhPip1: preconnect solo a ensurePlayerIframe */
  restorePos();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(poll, 350);
    });
  } else setTimeout(poll, 350);
  setInterval(poll, pollMs);

  try {
    if (window.__VC_CHROME_SYNC) {
      window.__VC_CHROME_SYNC.subscribe(function (prefs) {
        if (!prefs || !prefs.twitchPip) return;
        if (prefs.twitchPip.pos) {
          try {
            localStorage.setItem(POS_KEY, JSON.stringify(prefs.twitchPip.pos));
            restorePos();
          } catch (eP) {}
        }
        if (prefs.twitchPip.dismiss === null) {
          writeDismiss(null, { skipPublish: true });
          setUserClosed(false, { skipPublish: true });
          if (lastPayload) showStream(lastPayload);
          else if (reopenBtn) reopenBtn.hidden = true;
          return;
        }
        if (prefs.twitchPip.userClosed === true) {
          setUserClosed(true, { skipPublish: true });
        } else if (prefs.twitchPip.userClosed === false) {
          setUserClosed(false, { skipPublish: true });
        }
        if (prefs.twitchPip.dismiss && typeof prefs.twitchPip.dismiss === "object") {
          try {
            localStorage.setItem(DISMISS_KEY, JSON.stringify(prefs.twitchPip.dismiss));
          } catch (eD) {}
          if (lastPayload) {
            var d = prefs.twitchPip.dismiss;
            if (d && String(d.id) === String(lastPayload.id) && Number(d.until) > Date.now()) {
              showReopenOnly();
              return;
            }
          }
        }
        if (prefs.twitchPip.userClosed === true) {
          if (lastPayload) showReopenOnly();
        } else if (prefs.twitchPip.userClosed === false && lastPayload && root.hidden) {
          showStream(lastPayload);
        }
      });
    }
  } catch (eSub) {}

  try {
    var mediaEl = document.getElementById("vc-twitch-pip-media");
    if (mediaEl && typeof ResizeObserver !== "undefined") {
      var ro = new ResizeObserver(function () {
        if (root.classList.contains("vc-kick-pip--iframe")) fitTwitchEmbed();
      });
      ro.observe(mediaEl);
    }
  } catch (eRo) {}
  window.addEventListener("resize", function () {
    if (root.classList.contains("vc-kick-pip--iframe")) fitTwitchEmbed();
  });

  window.__vcTwitchPip = { poll: poll, fit: fitTwitchEmbed, ver: "20260917siteApiW7a" };
})();

/* consoleRest1 */
