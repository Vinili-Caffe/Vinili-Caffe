(function () {
  var VER = "20260909confessionaleRealtime1";
  var MAX = 1500;
  /* Intro a ogni visita (niente skip session). Solo ?skipIntro=1 salta. */
  var CURTAIN_OPEN_MS = 2000;
  /* Anti ghost-click: smoke dismissibile solo dopo questo delay. Mai auto-close. */
  var SMOKE_ARM_MS = 650;
  var apiCfg = window.__VC_CONFESSIONALE || {};
  var canModerate = false;
  var loadedOnce = false;
  var listFingerprint = "";
  var confWs = null;
  var confWsReconnectTimer = null;
  var livePollTimer = null;
  var curtainDone = false;
  var smokeArmed = false;
  var smokeArmTimer = null;
  var curtainOpenTimer = null;
  var scrollLockBound = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function token() {
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function apiUrl() {
    var base = String(apiCfg.apiUrl || "/webhooks/site-confessionale").trim();
    if (!base || /\{\{/.test(base)) base = "/webhooks/site-confessionale";
    try {
      if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
        var loc = String(apiCfg.apiUrlLocal || "").trim();
        if (loc && !/\{\{/.test(loc)) return loc;
      }
    } catch (eL) {}
    return base;
  }

  function toast(msg, kind) {
    try {
      if (typeof window.vcSiteToast === "function") {
        window.vcSiteToast(msg, kind || "info");
        return;
      }
    } catch (e) {}
  }

  function clearInlineFeedback() {
    var fb = byId("vc-conf-feedback");
    if (!fb) return;
    fb.textContent = "";
    fb.classList.remove("is-error");
    fb.hidden = true;
  }

  function isReadTabActive() {
    var readPanel = byId("vc-conf-panel-read");
    return Boolean(readPanel && !readPanel.hidden);
  }

  function isTypingInCommentField() {
    var a = document.activeElement;
    if (!a || !a.id) return false;
    return String(a.id).indexOf("vc-conf-c-") === 0 || String(a.id) === "vc-conf-text";
  }

  function captureCommentDrafts() {
    var map = {};
    var root = byId("vc-conf-list");
    if (!root) return map;
    var nodes = root.querySelectorAll("textarea[id^='vc-conf-c-']");
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      var id = String(el.id || "");
      var val = String(el.value || "");
      if (id && val) map[id] = val;
    }
    return map;
  }

  function restoreCommentDrafts(map) {
    if (!map) return;
    for (var id in map) {
      if (!Object.prototype.hasOwnProperty.call(map, id)) continue;
      var el = byId(id);
      if (el) el.value = map[id];
    }
  }

  function itemsFingerprint(items) {
    try {
      return JSON.stringify(
        (Array.isArray(items) ? items : []).map(function (it) {
          return {
            id: it && it.id,
            comments: it && it.commentCount,
            body: it && it.content,
            mine: it && it.isMine,
          };
        }),
      );
    } catch (e) {
      return String(Date.now());
    }
  }

  function realtimeWsUrl() {
    var explicit = String(apiCfg.wsUrl || "").trim();
    if (explicit && !/\{\{/.test(explicit)) return explicit;
    var api = apiUrl();
    if (!api || typeof URL === "undefined") return "";
    try {
      var u = new URL(api, window.location.origin);
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      var path = String(u.pathname || "").replace(/\/$/, "");
      var dir = path.replace(/\/[^/]+$/, "");
      u.pathname = (dir || "") + "/site-realtime-ws";
      u.search = "";
      u.hash = "";
      return u.href;
    } catch (e) {
      return "";
    }
  }

  function stopLivePoll() {
    if (!livePollTimer) return;
    clearInterval(livePollTimer);
    livePollTimer = null;
  }

  function startLivePoll() {
    stopLivePoll();
    if (confWs && confWs.readyState === 1) return;
    livePollTimer = setInterval(function () {
      if (document.visibilityState === "hidden") return;
      if (!isReadTabActive()) return;
      void refreshListQuiet();
    }, 20000);
  }

  function disconnectConfWs() {
    if (confWsReconnectTimer) {
      clearTimeout(confWsReconnectTimer);
      confWsReconnectTimer = null;
    }
    try {
      if (confWs) {
        confWs.onclose = null;
        confWs.close();
      }
    } catch (e2) {}
    confWs = null;
  }

  function scheduleConfWsReconnect() {
    if (confWsReconnectTimer) return;
    confWsReconnectTimer = setTimeout(function () {
      confWsReconnectTimer = null;
      connectConfWs();
    }, 8000);
  }

  function connectConfWs() {
    if (typeof WebSocket === "undefined") {
      startLivePoll();
      return;
    }
    var url = realtimeWsUrl();
    if (!url) {
      startLivePoll();
      return;
    }
    disconnectConfWs();
    try {
      var ws = new WebSocket(url);
      confWs = ws;
      ws.onopen = function () {
        stopLivePoll();
      };
      ws.onmessage = function (ev) {
        try {
          var data = JSON.parse(String(ev.data || "{}"));
          if (data.type === "confessionale_changed" || data.type === "realtime_hello") {
            void refreshListQuiet();
          }
        } catch (e3) {}
      };
      ws.onclose = function () {
        confWs = null;
        startLivePoll();
        scheduleConfWsReconnect();
      };
      ws.onerror = function () {
        try {
          ws.close();
        } catch (e4) {}
      };
    } catch (e5) {
      confWs = null;
      startLivePoll();
    }
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    try {
      var d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return "";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function fetchJson(method, path, body, attempt) {
    var tryN = Number(attempt) || 0;
    var t = token();
    var opts = {
      method: method || "GET",
      headers: {
        Authorization: "Bearer " + t,
        Accept: "application/json",
      },
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
    };
    if (body != null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = null;
    if (ctrl) {
      opts.signal = ctrl.signal;
      timer = setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eA) {}
      }, 20000);
    }
    return fetch(path, opts)
      .then(function (res) {
        return res
          .text()
          .then(function (raw) {
            var data = {};
            try {
              data = raw && String(raw).trim() ? JSON.parse(raw) : {};
            } catch (eJ) {
              data = {};
            }
            var empty = !String(raw || "").trim();
            var shouldRetry =
              tryN < 2 &&
              (empty ||
                res.status === 0 ||
                res.status === 429 ||
                res.status >= 500 ||
                (res.ok && data && data.ok == null && !Object.keys(data).length));
            if (shouldRetry) {
              return new Promise(function (resolve) {
                setTimeout(resolve, 400 + tryN * 450);
              }).then(function () {
                return fetchJson(method, path, body, tryN + 1);
              });
            }
            return { res: res, data: data || {} };
          });
      })
      .catch(function (err) {
        if (tryN < 2) {
          return new Promise(function (resolve) {
            setTimeout(resolve, 450 + tryN * 500);
          }).then(function () {
            return fetchJson(method, path, body, tryN + 1);
          });
        }
        throw err;
      })
      .finally(function () {
        if (timer) clearTimeout(timer);
      });
  }

  function switchTab(name) {
    var writeTab = byId("vc-conf-tab-write");
    var readTab = byId("vc-conf-tab-read");
    var writePanel = byId("vc-conf-panel-write");
    var readPanel = byId("vc-conf-panel-read");
    var isRead = name === "read";
    if (writeTab) {
      writeTab.classList.toggle("is-active", !isRead);
      writeTab.classList.toggle("vc-confessionale-tab--on", !isRead);
      writeTab.setAttribute("aria-selected", String(!isRead));
    }
    if (readTab) {
      readTab.classList.toggle("is-active", isRead);
      readTab.classList.toggle("vc-confessionale-tab--on", isRead);
      readTab.setAttribute("aria-selected", String(isRead));
    }
    if (writePanel) writePanel.hidden = isRead;
    if (readPanel) readPanel.hidden = !isRead;
    if (isRead) loadList(false);
  }

  function cardHtml(it) {
    var id = String(it.id || "");
    var when = formatWhen(it.createdAt);
    var comments = Array.isArray(it.comments) ? it.comments : [];
    var html =
      '<article class="vc-reviews-card vc-confessionale-card" id="vc-conf-card-' +
      escapeHtml(id) +
      '" data-id="' +
      escapeHtml(id) +
      '">' +
      '<div class="vc-reviews-card__head">' +
      '<span class="vc-reviews-card__avatar vc-confessionale-card__avatar" aria-hidden="true"><i class="fa fa-user-secret"></i></span>' +
      '<div class="vc-reviews-card__meta">' +
      '<p class="vc-reviews-card__author">Anonimo</p>' +
      '<p class="vc-reviews-card__date">' +
      escapeHtml(when || "ora sconosciuta") +
      " · Confessione</p>" +
      "</div></div>" +
      '<p class="vc-reviews-card__body" style="white-space:pre-wrap">' +
      escapeHtml(it.content || "") +
      "</p>";

    html += '<div class="vc-confessionale-discuss">';
    html +=
      '<p class="vc-confessionale-discuss__title"><i class="fa fa-comments-o" aria-hidden="true"></i> Discussione' +
      (comments.length ? " · " + comments.length : "") +
      "</p>";
    if (comments.length) {
      html += '<div class="vc-suggestions-comments vc-confessionale-comments">';
      for (var c = 0; c < comments.length; c += 1) {
        var cm = comments[c] || {};
        html +=
          '<div class="vc-suggestions-comment vc-confessionale-comment">' +
          (cm.authorAvatarUrl
            ? '<img class="vc-confessionale-comment__avatar" src="' +
              escapeHtml(cm.authorAvatarUrl) +
              '" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" />'
            : '<span class="vc-confessionale-comment__avatar" aria-hidden="true"></span>') +
          '<div class="vc-confessionale-comment__body">' +
          "<strong>" +
          escapeHtml(cm.authorName || "Staff") +
          "</strong>" +
          (cm.createdAt
            ? '<span class="vc-confessionale-comment__when">' + escapeHtml(formatWhen(cm.createdAt)) + "</span>"
            : "") +
          '<p style="white-space:pre-wrap;margin:.25rem 0 0">' +
          escapeHtml(cm.content || "") +
          "</p></div></div>";
      }
      html += "</div>";
    } else {
      html += '<p class="vc-confessionale-discuss__empty">Nessun commento ancora. Apri la discussione.</p>';
    }

    html +=
      '<div class="vc-reviews-field vc-confessionale-comment-form">' +
      '<label class="sr-only" for="vc-conf-c-' +
      escapeHtml(id) +
      '">Commento</label>' +
      '<textarea id="vc-conf-c-' +
      escapeHtml(id) +
      '" class="vc-reviews-textarea vc-confessionale-comment-input" rows="2" maxlength="1200" placeholder="Scrivi un commento alla discussione&hellip;"></textarea>' +
      '<button type="button" class="vc-reviews-submit vc-confessionale-comment-btn" data-conf-comment="' +
      escapeHtml(id) +
      '">Invia commento</button></div>';
    html += "</div>";

    if (canModerate && !it.isMine) {
      html +=
        '<div class="vc-confessionale-card__mod">' +
        '<button type="button" class="vc-confessionale-item__del" data-conf-del="' +
        escapeHtml(id) +
        '">Archivia</button></div>';
    }

    html += "</article>";
    return html;
  }

  function renderList(items, opts) {
    var root = byId("vc-conf-list");
    if (!root) return;
    var list = Array.isArray(items) ? items : [];
    var drafts = opts && opts.preserveDrafts ? captureCommentDrafts() : {};
    var activeId = "";
    try {
      if (document.activeElement && document.activeElement.id) {
        activeId = String(document.activeElement.id || "");
      }
    } catch (eA) {}
    if (!list.length) {
      root.innerHTML =
        '<div class="vc-reviews-empty"><p class="vc-reviews-empty__title">Nessun messaggio</p><p class="vc-reviews-empty__text">Sii il primo a scrivere nel confessionale.</p></div>';
      listFingerprint = itemsFingerprint([]);
      return;
    }
    var html = "";
    for (var i = 0; i < list.length; i += 1) html += cardHtml(list[i] || {});
    root.innerHTML = html;
    restoreCommentDrafts(drafts);
    if (activeId) {
      var focusEl = byId(activeId);
      if (focusEl && typeof focusEl.focus === "function") {
        try {
          focusEl.focus({ preventScroll: true });
        } catch (eF) {
          try {
            focusEl.focus();
          } catch (eF2) {}
        }
      }
    }
    listFingerprint = itemsFingerprint(list);
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.scan === "function") {
        window.VcDiscordAvatar.scan(root);
      }
    } catch (eScan) {}
  }

  function applyListPayload(data, opts) {
    canModerate = Boolean(data && data.canModerate);
    loadedOnce = true;
    renderList((data && data.items) || [], opts || {});
  }

  function loadList(force) {
    if (loadedOnce && !force) return;
    var root = byId("vc-conf-list");
    if (root && !loadedOnce) {
      root.innerHTML =
        '<div class="vc-reviews-empty"><p class="vc-reviews-empty__title">Caricamento…</p></div>';
    }
    fetchJson("GET", apiUrl())
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          if (root && !loadedOnce) {
            root.innerHTML =
              '<div class="vc-reviews-empty"><p class="vc-reviews-empty__title">' +
              escapeHtml(out.data.message || "Impossibile caricare i messaggi.") +
              "</p></div>";
          }
          return;
        }
        applyListPayload(out.data, { preserveDrafts: Boolean(loadedOnce) });
      })
      .catch(function () {
        if (root && !loadedOnce) {
          root.innerHTML =
            '<div class="vc-reviews-empty"><p class="vc-reviews-empty__title">Errore di rete.</p></div>';
        }
      });
  }

  function refreshListQuiet(force) {
    if (!force && !isReadTabActive()) return Promise.resolve();
    if (!force && isTypingInCommentField()) return Promise.resolve();
    return fetchJson("GET", apiUrl())
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) return;
        var nextFp = itemsFingerprint(out.data.items);
        if (nextFp && nextFp === listFingerprint) {
          canModerate = Boolean(out.data.canModerate);
          loadedOnce = true;
          return;
        }
        applyListPayload(out.data, { preserveDrafts: true });
      })
      .catch(function () {});
  }

  function submitComment(id) {
    if (!id) return;
    var ta = byId("vc-conf-c-" + id);
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 2) {
      toast("Scrivi almeno 2 caratteri", "error");
      return;
    }
    var path = apiUrl().replace(/\/+$/, "") + "/" + encodeURIComponent(id) + "/comments";
    fetchJson("POST", path, { content: content })
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          var st = out.res && out.res.status ? Number(out.res.status) : 0;
          toast(
            out.data.message ||
              (st === 404
                ? "Endpoint commenti non trovato (riprova dopo aggiornamento)."
                : st
                  ? "Commento non inviato (" + st + ")"
                  : "Commento non inviato"),
            "error",
          );
          return;
        }
        toast(out.data.message || "Commento pubblicato", "success");
        if (ta) ta.value = "";
        void refreshListQuiet(true);
      })
      .catch(function () {
        toast("Errore di rete", "error");
      });
  }

  function submitMessage(e) {
    if (e && e.preventDefault) e.preventDefault();
    clearInlineFeedback();
    var ta = byId("vc-conf-text");
    var btn = byId("vc-conf-submit");
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 8) {
      toast("Scrivi almeno 8 caratteri.", "error");
      return;
    }
    if (btn) btn.disabled = true;
    toast("Invio in corso…", "info");
    fetchJson("POST", apiUrl(), { content: content })
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          toast(out.data.message || "Invio non riuscito.", "error");
          return;
        }
        if (ta) ta.value = "";
        syncCounter();
        toast(out.data.message || "Messaggio inviato in anonimo.", "success");
        void refreshListQuiet(true);
      })
      .catch(function () {
        toast("Errore di rete.", "error");
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function deleteItem(id) {
    if (!id || !canModerate) return;
    var card = byId("vc-conf-card-" + id);
    if (card && card.querySelector && !card.querySelector("[data-conf-del]")) {
      toast("Non puoi archiviare la tua stessa confessione.", "error");
      return;
    }
    var path = apiUrl().replace(/\/+$/, "") + "/" + encodeURIComponent(id) + "/delete";
    fetchJson("POST", path, {})
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          toast(out.data.message || "Archiviazione non riuscita", "error");
          return;
        }
        toast("Messaggio archiviato", "success");
        void refreshListQuiet(true);
      })
      .catch(function () {
        toast("Errore di rete", "error");
      });
  }

  function syncCounter() {
    var ta = byId("vc-conf-text");
    var c = byId("vc-conf-count");
    if (!c) return;
    var n = ta ? String(ta.value || "").length : 0;
    c.textContent = String(Math.min(n, MAX));
  }

  function hideCurtainEl() {
    var el = byId("vc-confessionale-curtain");
    if (!el) return;
    el.classList.add("is-done");
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  }

  function hideSmokeEl() {
    var smoke = byId("vc-confessionale-smoke");
    if (!smoke) return;
    smoke.classList.remove("is-visible");
    smoke.classList.add("is-done");
    smoke.hidden = true;
    smoke.setAttribute("aria-hidden", "true");
  }

  function clearSmokeArmTimer() {
    if (smokeArmTimer) {
      window.clearTimeout(smokeArmTimer);
      smokeArmTimer = null;
    }
  }

  function clearCurtainOpenTimer() {
    if (curtainOpenTimer) {
      window.clearTimeout(curtainOpenTimer);
      curtainOpenTimer = null;
    }
  }

  function onIntroScrollBlock(ev) {
    try {
      if (!document.documentElement.classList.contains("vc-confessionale-intro-active")) return;
      if (document.documentElement.classList.contains("vc-confessionale-curtain-done")) return;
      ev.preventDefault();
    } catch (eBlock) {}
  }

  function lockIntroScroll() {
    try {
      document.documentElement.classList.add("vc-confessionale-intro-active");
      document.documentElement.classList.remove("vc-confessionale-curtain-done");
      document.documentElement.style.overflow = "hidden";
      if (document.body) {
        document.body.style.overflow = "hidden";
        document.body.style.touchAction = "none";
      }
    } catch (eL) {}
    if (scrollLockBound) return;
    scrollLockBound = true;
    try {
      window.addEventListener("wheel", onIntroScrollBlock, { passive: false, capture: true });
      window.addEventListener("touchmove", onIntroScrollBlock, { passive: false, capture: true });
    } catch (eBind) {}
  }

  function unlockIntroScroll() {
    try {
      document.documentElement.style.overflow = "";
      if (document.body) {
        document.body.style.overflow = "";
        document.body.style.touchAction = "";
      }
    } catch (eU) {}
    if (!scrollLockBound) return;
    scrollLockBound = false;
    try {
      window.removeEventListener("wheel", onIntroScrollBlock, true);
      window.removeEventListener("touchmove", onIntroScrollBlock, true);
    } catch (eUn) {}
  }

  function kickBgmFromGesture() {
    try {
      if (typeof window.__vcConfessionaleBgmUnlock === "function") {
        window.__vcConfessionaleBgmUnlock();
      }
    } catch (eKick) {}
    try {
      if (typeof window.__vcConfessionaleBgmForcePlay === "function") {
        window.__vcConfessionaleBgmForcePlay();
      }
    } catch (eForce) {}
  }

  function ensureSmokeEmoji() {
    var face = document.querySelector("#vc-confessionale-smoke img.vc-confessionale-smoke__face, #vc-confessionale-smoke [data-vc-smoke-emoji]");
    if (!face || face.tagName !== "IMG") return;
    var src = "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/72x72/1f92b.png";
    face.addEventListener(
      "error",
      function () {
        try {
          if (face.dataset.vcSmokeEmojiRetry === "1") return;
          face.dataset.vcSmokeEmojiRetry = "1";
          face.src = "https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f92b.png";
        } catch (eR) {}
      },
      { once: true },
    );
    if (!String(face.getAttribute("src") || "").trim()) {
      face.src = src;
    }
  }

  function markSequenceDone() {
    if (curtainDone) return;
    curtainDone = true;
    smokeArmed = false;
    clearSmokeArmTimer();
    clearCurtainOpenTimer();
    hideCurtainEl();
    hideSmokeEl();
    unlockIntroScroll();
    try {
      document.documentElement.classList.remove("vc-confessionale-intro-active");
      document.documentElement.classList.add("vc-confessionale-curtain-done");
      document.body.classList.add("vc-confessionale-curtain-done");
    } catch (e2) {}
    kickBgmFromGesture();
    try {
      window.dispatchEvent(new CustomEvent("vc:confessionale-curtain-done"));
    } catch (e3) {}
  }

  function introAlreadyDone() {
    try {
      var sp = new URLSearchParams(location.search || "");
      if (sp.get("skipIntro") === "1" || sp.get("skip") === "1") return true;
    } catch (eQ) {}
    return false;
  }

  function primeIntroOverlay() {
    if (introAlreadyDone()) {
      markSequenceDone();
      return false;
    }
    lockIntroScroll();
    var el = byId("vc-confessionale-curtain");
    if (el) {
      el.hidden = false;
      el.removeAttribute("hidden");
      el.setAttribute("aria-hidden", "false");
      el.classList.remove("is-done", "is-open");
      try {
        if (el.parentNode !== document.body) document.body.appendChild(el);
      } catch (eMove) {}
    }
    var smoke = byId("vc-confessionale-smoke");
    if (smoke) {
      try {
        if (smoke.parentNode !== document.body) document.body.appendChild(smoke);
      } catch (eMove2) {}
    }
    return true;
  }

  function showSmokeBeat() {
    clearCurtainOpenTimer();
    hideCurtainEl();
    var smoke = byId("vc-confessionale-smoke");
    if (!smoke) {
      markSequenceDone();
      return;
    }
    ensureSmokeEmoji();
    smokeArmed = false;
    clearSmokeArmTimer();
    smoke.hidden = false;
    smoke.removeAttribute("hidden");
    smoke.setAttribute("aria-hidden", "false");
    smoke.classList.remove("is-done");
    /* Backdrop opaco subito: niente flash della pagina sotto. */
    smoke.classList.add("is-visible", "is-armed-pending");
    smokeArmTimer = window.setTimeout(function () {
      smokeArmed = true;
      smoke.classList.remove("is-armed-pending");
      smoke.classList.add("is-armed");
      smokeArmTimer = null;
    }, SMOKE_ARM_MS);
  }

  function openCurtain() {
    if (curtainDone || introAlreadyDone()) {
      markSequenceDone();
      return;
    }
    if (!primeIntroOverlay()) return;
    var el = byId("vc-confessionale-curtain");
    if (!el) {
      markSequenceDone();
      return;
    }

    void el.offsetWidth;
    requestAnimationFrame(function () {
      el.classList.add("is-open");
    });
    clearCurtainOpenTimer();
    curtainOpenTimer = window.setTimeout(function () {
      curtainOpenTimer = null;
      if (curtainDone) return;
      showSmokeBeat();
    }, CURTAIN_OPEN_MS);
  }

  function bootCurtainWhenReady() {
    if (introAlreadyDone()) {
      markSequenceDone();
      return;
    }
    primeIntroOverlay();
    openCurtain();
  }

  function bind() {
    ensureSmokeEmoji();
    var writeTab = byId("vc-conf-tab-write");
    var readTab = byId("vc-conf-tab-read");
    var form = byId("vc-conf-form");
    var ta = byId("vc-conf-text");
    var list = byId("vc-conf-list");
    var skip = byId("vc-confessionale-curtain-skip");
    var smokeContinue = byId("vc-confessionale-smoke-continue");
    var smokeRoot = byId("vc-confessionale-smoke");

    if (writeTab) writeTab.addEventListener("click", function () { switchTab("write"); });
    if (readTab) readTab.addEventListener("click", function () { switchTab("read"); });
    if (form) form.addEventListener("submit", submitMessage);
    if (ta) {
      ta.addEventListener("input", syncCounter);
      syncCounter();
    }
    if (list) {
      list.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var delBtn = t.closest("[data-conf-del]");
        if (delBtn) {
          deleteItem(String(delBtn.getAttribute("data-conf-del") || ""));
          return;
        }
        var cBtn = t.closest("[data-conf-comment]");
        if (cBtn) {
          submitComment(String(cBtn.getAttribute("data-conf-comment") || ""));
        }
      });
    }
    if (skip) {
      skip.addEventListener("click", function (ev) {
        if (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eSk) {}
        }
        kickBgmFromGesture();
        var el = byId("vc-confessionale-curtain");
        if (el) el.classList.add("is-open");
        showSmokeBeat();
      });
    }
    var curtainRoot = byId("vc-confessionale-curtain");
    if (curtainRoot) {
      curtainRoot.addEventListener(
        "pointerdown",
        function () {
          kickBgmFromGesture();
        },
        true,
      );
    }
    if (smokeRoot) {
      smokeRoot.addEventListener(
        "pointerdown",
        function () {
          kickBgmFromGesture();
        },
        true,
      );
    }
    function onSmokeContinue(ev) {
      if (!smokeArmed) {
        if (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eBlock) {}
        }
        kickBgmFromGesture();
        return;
      }
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      kickBgmFromGesture();
      markSequenceDone();
    }
    if (smokeContinue) smokeContinue.addEventListener("click", onSmokeContinue);
    /* Solo il bottone (non tutto lo smoke): evita dismiss accidentali / ghost-click. */
    if (smokeRoot) {
      smokeRoot.addEventListener("click", function (ev) {
        var t = ev && ev.target;
        if (t && t.closest && t.closest("#vc-confessionale-smoke-continue")) return;
        if (ev) {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch (eIgn) {}
        }
      });
    }

    if (!introAlreadyDone()) lockIntroScroll();
    bootCurtainWhenReady();
    clearInlineFeedback();
    connectConfWs();
  }

  if (!introAlreadyDone()) {
    lockIntroScroll();
    primeIntroOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.addEventListener("beforeunload", disconnectConfWs);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && isReadTabActive()) {
      void refreshListQuiet();
    }
  });
  window.addEventListener("vc:site-api-refetch", function () {
    if (!byId("vc-conf-list")) return;
    void refreshListQuiet();
  });

  window.__vcConfessionaleVer = VER;
})();
