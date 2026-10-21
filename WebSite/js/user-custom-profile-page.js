(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var HOLO_PRIMARY = "#a9c0ff";
  var HOLO_SECONDARY = "#ffc0ec";
  var state = null;
  var busy = false;
  var toastTimer = null;
  var guildEmojis = [];
  var guildEmojisLoaded = false;
  var guildEmojisLoading = false;
  var emojiPickerToken = 0;
  /* persTabSwitchLoad1: sequenza soft-nav — ignora boot/render stale dopo cambio tab */
  var cpfNavSeq = 0;
    var colorDrafts = {
    solid: { hex: "", hex2: "" },
    gradient: { hex: "", hex2: "" },
    holo: { hex: HOLO_PRIMARY, hex2: HOLO_SECONDARY },
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_CUSTOM_PROFILE) || {};
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function getToken() {
    try {
      var hub = window.__VC_PERS_HUB_API;
      if (hub && typeof hub.getToken === "function") return hub.getToken();
    } catch (eHub) {}
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        return String(window.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (eDc) {}
    var t = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (!t) return "";
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (exp && Date.now() >= exp) return "";
    return t;
  }

  function normalizeHexClient(raw) {
    var s = String(raw || "")
      .trim()
      .replace(/[\s\u200b\u200c\u200d\ufeff]/g, "");
    if (!s) return "";
    if (s.charAt(0) === "#") s = s.slice(1);
    s = s.replace(/[^0-9a-fA-F]/g, "");
    if (s.length === 3) {
      s = s
        .split("")
        .map(function (c) {
          return c + c;
        })
        .join("");
    }
    if (s.length !== 6) return "";
    return "#" + s.toLowerCase();
  }

  // Discord: color 0 / #000000 = nessun colore → grigio default client (#99AAB5).
  var DISCORD_DEFAULT_ROLE_HEX = "#99aab5";

  function isDiscordUnsetRoleHex(hex) {
    var h = normalizeHexClient(hex);
    return h === "#000000";
  }

  function discordRoleDisplayHex(hex) {
    var h = normalizeHexClient(hex);
    if (!h || isDiscordUnsetRoleHex(h)) return DISCORD_DEFAULT_ROLE_HEX;
    return h;
  }

  function parseTarget() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var t = String(q.get("target") || q.get("slot") || "").trim().toLowerCase();
      if (t === "primary" || t === "secondary" || t === "voice" || t === "vocale") {
        return t === "vocale" ? "voice" : t;
      }
    } catch (e) {}
    return "primary";
  }

  function isCustomRoleTab(tabHint) {
    try {
      var t = String(tabHint || "").trim().toLowerCase();
      if (!t) {
        var q = new URLSearchParams(window.location.search || "");
        t = String(q.get("target") || q.get("slot") || "").trim().toLowerCase();
      }
      if (t === "vocale") t = "voice";
      if (!t || t === "rank" || t === "wallpaper") {
        try {
          if (window.__VC_PERS_HUB && window.__VC_PERS_HUB.isCustom === true) return true;
        } catch (eHub) {}
        return false;
      }
      if (t === "primary" || t === "secondary" || t === "voice") return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function showCustomTabBoot() {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    try {
      app.hidden = false;
      app.removeAttribute("hidden");
      app.innerHTML =
        '<div class="vc-cpf" data-vc-pers-layout="persAllStack1" data-vc-cpf-tab-boot="1">' +
        '<div class="vc-cpf-tab-boot" role="status" aria-live="polite">' +
        '<span class="vc-user-profile-loader__spin" aria-hidden="true"></span>' +
        "<p>Caricamento…</p></div></div>";
    } catch (eBootUi) {}
  }

  function isCpfNavCurrent(seq) {
    return Number(seq || 0) === Number(cpfNavSeq || 0);
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    var direct = String(c.apiUrl || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    if (direct) return direct;
    return "/webhooks/site-custom-profile";
  }

  function emojisApiUrl() {
    return String(resolvedApiUrl() || "/webhooks/site-custom-profile").replace(/\/?$/, "") + "/emojis";
  }

  function ensureGuildEmojis() {
    if (guildEmojisLoaded) return Promise.resolve(guildEmojis);
    if (guildEmojisLoading) {
      return new Promise(function (resolve) {
        var n = 0;
        var t = setInterval(function () {
          n += 1;
          if (guildEmojisLoaded || n > 50) {
            clearInterval(t);
            resolve(guildEmojis);
          }
        }, 100);
      });
    }
    var token = getToken();
    if (!token) {
      guildEmojisLoaded = true;
      guildEmojis = [];
      return Promise.resolve(guildEmojis);
    }
    guildEmojisLoading = true;
    return fetch(emojisApiUrl(), {
      method: "GET",
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      credentials: "omit",
    })
      .then(function (res) {
        return res.json().catch(function () {
          return null;
        });
      })
      .then(function (data) {
        guildEmojisLoading = false;
        guildEmojisLoaded = true;
        guildEmojis = data && data.ok && Array.isArray(data.emojis) ? data.emojis : [];
        return guildEmojis;
      })
      .catch(function () {
        guildEmojisLoading = false;
        guildEmojisLoaded = true;
        guildEmojis = [];
        return guildEmojis;
      });
  }

  function openEmojiPicker(anchor, onPick, opts) {
    opts = opts || {};
    if (!window.VcEmojiPicker || typeof window.VcEmojiPicker.open !== "function") {
      showToast("Picker emoji non disponibile.", true);
      return;
    }
    if (typeof window.VcEmojiPicker.isOpen === "function" && window.VcEmojiPicker.isOpen(anchor)) {
      window.VcEmojiPicker.close();
      return;
    }
    var token = (emojiPickerToken += 1);
    var unicodeOnly = opts.unicodeOnly === true;
    var preferCustom = opts.preferCustom === true;
    var anchorSelector = opts.anchorSelector ? String(opts.anchorSelector) : "";
    var anchorRect = null;
    try {
      if (anchor && anchor.getBoundingClientRect) {
        var r0 = anchor.getBoundingClientRect();
        if (r0 && (r0.width > 1 || r0.height > 1)) {
          anchorRect = {
            left: r0.left,
            top: r0.top,
            width: r0.width,
            height: r0.height,
            right: r0.right,
            bottom: r0.bottom,
          };
        }
      }
    } catch (eRect0) {}
    var openWith = function (emojis) {
      if (token !== emojiPickerToken) return;
      var live = anchor;
      if (anchorSelector) {
        try {
          var found = document.querySelector(anchorSelector);
          if (found) live = found;
        } catch (eFind) {}
      } else if (!live || !document.body.contains(live)) {
        try {
          live = document.querySelector("[data-cpf-emoji-pick]") || live;
        } catch (eFind2) {}
      }
      window.VcEmojiPicker.open({
        anchor: live,
        anchorSelector: anchorSelector,
        anchorRect: anchorRect,
        guildEmojis: unicodeOnly ? [] : emojis || [],
        unicodeOnly: unicodeOnly,
        preferCustom: !unicodeOnly && preferCustom && emojis && emojis.length > 0,
        onPick: onPick,
      });
    };
    if (unicodeOnly) {
      openWith([]);
      return;
    }
    ensureGuildEmojis().then(openWith);
  }

  function insertAtInput(el, text) {
    if (!el) return;
    var value = String(text || "");
    if (!value) return;
    try {
      el.focus();
      var start = typeof el.selectionStart === "number" ? el.selectionStart : el.value.length;
      var end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
      var before = String(el.value || "").slice(0, start);
      var after = String(el.value || "").slice(end);
      el.value = before + value + after;
      var pos = start + value.length;
      if (typeof el.setSelectionRange === "function") el.setSelectionRange(pos, pos);
    } catch (e) {
      el.value = String(el.value || "") + value;
    }
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (e2) {}
  }

  function setInputValue(el, text) {
    if (!el) return;
    el.value = String(text || "");
    try {
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } catch (e) {}
  }

  function wireEmojiPickers(target) {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    var buttons = app.querySelectorAll("[data-cpf-emoji-pick]");
    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        if (btn._vcCpfEmojiWired) return;
        btn._vcCpfEmojiWired = true;
        btn.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var mode = String(btn.getAttribute("data-cpf-emoji-pick") || "");
          var unicodeOnly = mode === "name" || mode === "voc-emoji";
          var inputId =
            mode === "icon" ? "vc-cpf-icon" : mode === "voc-emoji" ? "vc-cpf-emoji" : "vc-cpf-name";
          var input = byId(inputId);
          openEmojiPicker(
            btn,
            function (pick) {
              if (!pick) return;
              if (unicodeOnly && pick.type === "custom") {
                showToast("Qui puoi usare solo emoji normali (non quelle custom del server).", true);
                return;
              }
              var value = pick.type === "custom" ? String(pick.markup || "") : String(pick.text || pick.markup || "");
              if (!value) return;
              if (mode === "icon" || mode === "voc-emoji") {
                setInputValue(input, value);
                if (mode === "icon") {
                  var prevHost = app.querySelector(".vc-cpf-iconrow");
                  if (prevHost) {
                    var nextPrev;
                    if (pick.type === "custom" && pick.id) {
                      var url =
                        pick.url ||
                        (window.VcEmojiPicker && typeof window.VcEmojiPicker.customUrl === "function"
                          ? window.VcEmojiPicker.customUrl(pick.id, pick.animated, 64)
                          : "");
                      nextPrev =
                        '<img class="vc-cpf-iconprev" src="' +
                        esc(url) +
                        '" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer" />';
                    } else {
                      nextPrev =
                        '<span class="vc-cpf-iconprev is-emoji" aria-hidden="true">' + esc(value) + "</span>";
                    }
                    var oldPrev = prevHost.querySelector(".vc-cpf-iconprev");
                    if (oldPrev) {
                      var tmp = document.createElement("div");
                      tmp.innerHTML = nextPrev;
                      if (tmp.firstChild) oldPrev.replaceWith(tmp.firstChild);
                    }
                  }
                }
              } else {
                insertAtInput(input, value);
              }
            },
            {
              unicodeOnly: unicodeOnly,
              preferCustom: mode === "icon",
              anchorSelector: '[data-cpf-emoji-pick="' + mode + '"]',
            },
          );
        });
      })(buttons[i]);
    }
  }

  function profileBackUrl() {
    var uid = state && state.userId ? String(state.userId) : "";
    return uid && /^\d{17,20}$/.test(uid) ? "/user/?id=" + encodeURIComponent(uid) : "/user/";
  }

  function markCustomProfileBootDone() {
    try {
      window.__VC_CPF_BOOT = window.__VC_CPF_BOOT || { done: false, timer: 0 };
      window.__VC_CPF_BOOT.done = true;
      if (window.__VC_CPF_BOOT.timer) {
        clearTimeout(window.__VC_CPF_BOOT.timer);
        window.__VC_CPF_BOOT.timer = 0;
      }
    } catch (eBoot) {}
    try {
      var app = byId("vc-custom-profile-app");
      if (app) app.dataset.vcCpfReady = "1";
    } catch (eApp) {}
  }

  function clearPendingChrome() {
    markCustomProfileBootDone();
    try {
      document.documentElement.classList.remove("vc-rank-customize-pending");
      document.documentElement.classList.remove("vc-custom-profile-pending");
      document.documentElement.classList.remove("vc-loading-scroll-lock");
      document.documentElement.classList.remove("vc-page-cine-boot");
      document.documentElement.classList.add("vc-page-cine-ready");
      document.documentElement.classList.add("vc-styles-ready");
      document.documentElement.classList.add("vc-core-styles-ready");
    } catch (e) {}
    try {
      if (document.body) {
        /* persCineLayout2: tieni cine layout su /personalizza (hero baked) */
        var keepCine = false;
        try {
          keepCine =
            document.body.getAttribute("data-vc-cine-baked") === "1" ||
            Boolean(document.querySelector(".vc-page-cine-hero, #vc-page-intro"));
        } catch (eKeep) {}
        if (keepCine) {
          document.body.classList.add("vc-page-cine-layout");
          try {
            document.body.dataset.vcPageCineLayout = "1";
          } catch (eDsKeep) {}
          try {
            var mainKeep =
              document.getElementById("vc-personalizza-root") || document.querySelector("main");
            if (mainKeep) mainKeep.classList.add("vc-page-cine-main");
          } catch (eMainKeep) {}
        } else {
          document.body.classList.remove("vc-page-cine-layout");
          try {
            delete document.body.dataset.vcPageCineLayout;
          } catch (eDs) {}
        }
        document.body.style.position = "";
        document.body.style.inset = "";
        document.body.style.width = "";
        document.body.style.height = "";
        document.body.style.maxHeight = "";
        document.body.style.overflow = "";
        document.body.style.touchAction = "";
      }
      document.documentElement.style.overflow = "";
      document.documentElement.style.height = "";
      document.documentElement.style.maxHeight = "";
      document.documentElement.style.touchAction = "";
    } catch (e2) {}
    try {
      var loaders = document.querySelectorAll(
        '[id="vc-custom-profile-loading"], [id="vc-rank-customize-loading"]'
      );
      for (var li = 0; li < loaders.length; li++) {
        var loading = loaders[li];
        loading.hidden = true;
        loading.setAttribute("hidden", "");
        loading.style.display = "none";
        if (loading.parentNode) loading.parentNode.removeChild(loading);
      }
    } catch (e3) {}
  }

  function showToast(message, isError) {
    var msg = String(message || "").trim();
    if (window.VcSiteToast) {
      if (!msg) window.VcSiteToast.hide();
      else window.VcSiteToast.show(msg, Boolean(isError));
      return;
    }
    var host = byId("vc-custom-profile-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "vc-custom-profile-toast-host";
      host.className = "vc-dash-save-toast-host vc-site-toast-host vc-cpf-toast-host";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    } else if (host.parentElement !== document.body) {
      document.body.appendChild(host);
    }
    host.className = "vc-dash-save-toast-host vc-site-toast-host vc-cpf-toast-host";
    host.innerHTML =
      '<div class="vc-dash-save-toast' +
      (isError ? " is-error" : "") +
      ' is-visible" role="status">' +
      '<span class="vc-dash-save-toast__icon" aria-hidden="true"><i class="fa fa-' +
      (isError ? "times" : "check") +
      '"></i></span>' +
      '<p class="vc-dash-save-toast__text">' +
      esc(msg) +
      "</p></div>";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      host.innerHTML = "";
    }, 4200);
  }

  function setBusyUi(on) {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    app.classList.toggle("is-busy", Boolean(on));
    var buttons = app.querySelectorAll("[data-action]");
    for (var i = 0; i < buttons.length; i++) {
      if (on) buttons[i].setAttribute("disabled", "disabled");
      else buttons[i].removeAttribute("disabled");
    }
  }

  function targetLabel(target) {
    if (target === "secondary") return "Ruolo secondario";
    if (target === "voice") return "Vocale privata";
    return "Ruolo principale";
  }

  function targetIcon(target) {
    if (target === "voice") return "fa-microphone";
    if (target === "secondary") return "fa-star-o";
    return "fa-star";
  }

  function targetLead(target) {
    if (target === "voice") return "Nome, emoji e chi può entrare nel tuo canale.";
    if (target === "secondary") return "Nome, colore, icona e chi condivide il secondo ruolo.";
    return "Nome, colore, icona e chi condivide il ruolo.";
  }

  function entityFor(target) {
    if (!state) return null;
    if (target === "secondary") return state.secondary;
    if (target === "voice") return state.voice;
    return state.primary;
  }

  function canAccess(target) {
    var fa = (state && state.featureAccess) || {};
    if (target === "secondary") return Boolean(fa.customRoleSecondary);
    if (target === "voice") return Boolean(fa.customVoc);
    return Boolean(fa.customRolePrimary);
  }

  function mapCustomProfileGetPayload(status, httpOk, data) {
    if (data && typeof data === "object") {
      data.status = status;
      if (!data.message && !data.ok) {
        if (status === 401) data.message = "Sessione Discord scaduta in questo browser. Riaccedi qui (ogni browser ha login separato).";
        else if (status === 429) data.message = "Troppe richieste. Riprova tra poco.";
        else if (status >= 500) data.message = "Il server non risponde. Riprova tra poco.";
        else data.message = "Impossibile caricare (HTTP " + status + ").";
      }
      if (status === 429) data.error = data.error || "rate_limited";
      return data;
    }
    return {
      ok: false,
      status: status,
      message:
        status === 401
          ? "Sessione Discord scaduta in questo browser. Riaccedi qui (ogni browser ha login separato)."
          : status === 429
            ? "Troppe richieste. Riprova tra poco."
            : "Risposta non valida dal server (HTTP " + status + ").",
      error: status === 429 ? "rate_limited" : undefined,
    };
  }

  async function apiGet() {
    var token = getToken();
    if (!token) return { ok: false, error: "missing_token", message: "Effettua il login Discord." };
    var url = resolvedApiUrl();
    if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
      try {
        var cacheKey = window.VcApiCache.keyFor(url, { scope: "customProfile", auth: token, v: "429fix4" });
        var payload = await window.VcApiCache.fetchWithCache(cacheKey, url, {
          ttlMs: 90000,
          staleMs: 600000,
          persistMs: 20 * 60 * 1000,
          timeoutMs: 22000,
          fetchInit: {
            method: "GET",
            headers: { Accept: "application/json", Authorization: "Bearer " + token },
            credentials: "omit",
          },
        });
        if (payload && payload.blocked) {
          return mapCustomProfileGetPayload(429, false, { ok: false, error: "rate_limited" });
        }
        return mapCustomProfileGetPayload(
          Number((payload && payload.status) || 0),
          Boolean(payload && payload.ok),
          payload && payload.body,
        );
      } catch (eCache) {
              }
    }
    var res;
    try {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = null;
      if (ctrl) {
        timer = window.setTimeout(function () {
          try {
            ctrl.abort();
          } catch (eAb) {}
        }, 15000);
      }
      res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: "Bearer " + token },
        credentials: "omit",
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (timer) window.clearTimeout(timer);
    } catch (eNet) {
      var aborted = eNet && (eNet.name === "AbortError" || String(eNet.message || "").toLowerCase().indexOf("abort") >= 0);
      return {
        ok: false,
        error: aborted ? "timeout" : "network",
        message: aborted
          ? "Timeout: il server sta impiegando troppo tempo. Ricarica la pagina."
          : "Errore di rete. Controlla la connessione e riprova.",
      };
    }
    var data = await res.json().catch(function () {
      return null;
    });
    return mapCustomProfileGetPayload(res.status, res.ok, data);
  }

  async function apiPost(body) {
    var token = getToken();
    if (!token) return { ok: false, error: "missing_token", message: "Effettua il login Discord." };
    var res = await fetch(resolvedApiUrl(), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      credentials: "omit",
      body: JSON.stringify(body || {}),
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (data && data.ok && window.VcApiCache && typeof window.VcApiCache.invalidate === "function") {
      try {
        window.VcApiCache.invalidate(
          window.VcApiCache.keyFor(resolvedApiUrl(), { scope: "customProfile", auth: token, v: "429fix4" }),
        );
      } catch (eInv) {}
    }
    return data || { ok: false, status: res.status, message: "Risposta non valida." };
  }

  function applyStatePayload(data) {
    if (!data || !data.ok) return;
    var nested = data.state && typeof data.state === "object" ? data.state : null;
    var pick = function (key) {
      if (Object.prototype.hasOwnProperty.call(data, key)) return data[key];
      if (nested && Object.prototype.hasOwnProperty.call(nested, key)) return nested[key];
      return state ? state[key] : null;
    };
    state = {
      userId: String(data.userId || (state && state.userId) || ""),
      featureAccess: data.featureAccess || (state && state.featureAccess) || {},
      permissions: data.permissions || (state && state.permissions) || {},
      requirements: data.requirements || (state && state.requirements) || null,
      voiceActivity: data.voiceActivity != null ? data.voiceActivity : state && state.voiceActivity,
      primary: pick("primary"),
      secondary: pick("secondary"),
      voice: pick("voice"),
      expiresAt: data.expiresAt || (nested && nested.expiresAt) || (state && state.expiresAt) || "",
    };
  }

  function memberListHtml(members) {
    var list = Array.isArray(members) ? members.slice() : [];
    var ownerId = state && state.userId ? String(state.userId) : "";
    list.sort(function (a, b) {
      var aOwner = Boolean(a && (a.isOwner || String(a.id || "").trim() === ownerId));
      var bOwner = Boolean(b && (b.isOwner || String(b.id || "").trim() === ownerId));
      if (aOwner && !bOwner) return -1;
      if (!aOwner && bOwner) return 1;
      return String((a && (a.displayName || a.username)) || "").localeCompare(
        String((b && (b.displayName || b.username)) || ""),
        "it",
      );
    });
    if (!list.length && ownerId) {
      list = [{ id: ownerId, displayName: "Tu", isOwner: true }];
    }
    if (!list.length) {
      return '<div data-cpf-members class="vc-cpf-members-wrap"><p class="vc-cpf-empty">Nessun utente ancora.</p></div>';
    }
    return (
      '<div data-cpf-members class="vc-cpf-members-wrap"><ul class="vc-cpf-members">' +
      list
        .map(function (m) {
          var id = String(m.id || "").trim();
          var isOwner = Boolean(m.isOwner) || (ownerId && id === ownerId);
          var name = String(m.displayName || m.username || (isOwner ? "Tu" : "Utente")).trim() || "Utente";
          var av = String(m.avatarUrl || "").trim();
          return (
            '<li class="vc-cpf-members__row' +
            (isOwner ? " is-owner" : "") +
            '">' +
            (av
              ? '<img class="vc-cpf-members__av" src="' +
                esc(av) +
                '" alt="" width="36" height="36" loading="eager" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" data-vc-avatar-static="1" data-user-id="' +
                esc(id) +
                '" />'
              : '<span class="vc-cpf-members__av is-fallback"><i class="fa fa-user" aria-hidden="true"></i></span>') +
            '<span class="vc-cpf-members__meta">' +
            '<span class="vc-cpf-members__name">' +
            esc(name) +
            "</span>" +
            (isOwner ? '<span class="vc-cpf-members__badge">Proprietario</span>' : "") +
            "</span>" +
            (isOwner
              ? '<span class="vc-cpf-members__owner-note" aria-hidden="true">Tu</span>'
              : '<button type="button" class="vc-cpf-btn vc-cpf-btn--ghost vc-cpf-btn--sm" data-action="members_remove" data-member-id="' +
                esc(id) +
                '">Rimuovi</button>') +
            "</li>"
          );
        })
        .join("") +
      "</ul></div>"
    );
  }

  function refreshMembersUi(target) {
    var entity = entityFor(target);
    var host = document.querySelector("[data-cpf-members]");
    if (host) {
      var tmp = document.createElement("div");
      tmp.innerHTML = memberListHtml(entity && entity.sharedMembers);
      var next = tmp.firstChild;
      if (next) host.replaceWith(next);
    }
    var memEl = byId("vc-cpf-member");
    if (memEl) memEl.value = "";
  }

  function inferColorMode(entity) {
    if (!entity) return "solid";
    var mode = String(entity.colorMode || "").toLowerCase();
    if (mode === "gradient" || mode === "holo" || mode === "solid") return mode;
    var h1 = normalizeHexClient(entity.color || "");
    var h2 = normalizeHexClient(entity.color2 || "");
    if (h1 === HOLO_PRIMARY && h2 === HOLO_SECONDARY) return "holo";
    if (h2) return "gradient";
    return "solid";
  }

  function draftsStorageKey(target) {
    var uid = state && state.userId ? String(state.userId) : "anon";
    return "vc_cpf_color_drafts_v1:" + uid + ":" + String(target || "primary");
  }

  function persistColorDrafts(target) {
    try {
      localStorage.setItem(draftsStorageKey(target), JSON.stringify(colorDrafts));
    } catch (e) {}
  }

  function loadColorDrafts(target) {
    try {
      var raw = localStorage.getItem(draftsStorageKey(target));
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      ["solid", "gradient", "holo"].forEach(function (mode) {
        var row = parsed[mode];
        if (!row || typeof row !== "object") return;
        var hex = normalizeHexClient(row.hex || "");
        var hex2 = normalizeHexClient(row.hex2 || "");
        if (mode === "holo") {
          colorDrafts.holo = { hex: HOLO_PRIMARY, hex2: HOLO_SECONDARY };
          return;
        }
        if (hex) colorDrafts[mode] = { hex: hex, hex2: hex2 || "" };
      });
    } catch (e) {}
  }

  function readColorFields() {
    var hexEl = byId("vc-cpf-hex");
    var hex2El = byId("vc-cpf-hex2");
    return {
      hex: normalizeHexClient(hexEl ? hexEl.value : ""),
      hex2: normalizeHexClient(hex2El ? hex2El.value : ""),
    };
  }

  function writeColorFields(hex, hex2) {
    var hexEl = byId("vc-cpf-hex");
    var hex2El = byId("vc-cpf-hex2");
    var pick1 = byId("vc-cpf-hex-pick");
    var pick2 = byId("vc-cpf-hex2-pick");
    var h1 = normalizeHexClient(hex) || "";
    var h2 = normalizeHexClient(hex2) || "";
    if (hexEl && h1) hexEl.value = h1;
    if (hex2El) hex2El.value = h2 || "";
    if (pick1 && h1) pick1.value = h1;
    if (pick2 && h2) pick2.value = h2;
    var chip1 = document.querySelector('[data-cpf-chip="vc-cpf-hex"]');
    var chip2 = document.querySelector('[data-cpf-chip="vc-cpf-hex2"]');
    if (chip1 && h1) chip1.style.background = h1;
    if (chip2 && h2) chip2.style.background = h2;
  }

  function stashColorDraft(mode) {
    var m = String(mode || "solid").toLowerCase();
    if (m === "holo") {
      colorDrafts.holo = { hex: HOLO_PRIMARY, hex2: HOLO_SECONDARY };
      return;
    }
    var cur = readColorFields();
    if (m === "solid" && cur.hex) {
      colorDrafts.solid = { hex: cur.hex, hex2: cur.hex2 || colorDrafts.solid.hex2 || "" };
    }
    if (m === "gradient" && cur.hex && cur.hex2) {
      colorDrafts.gradient = { hex: cur.hex, hex2: cur.hex2 };
    }
  }

  function applyColorDraft(mode) {
    var m = String(mode || "solid").toLowerCase();
    if (m === "holo") {
      writeColorFields(HOLO_PRIMARY, HOLO_SECONDARY);
      return;
    }
    var d = colorDrafts[m] || {};
    if (m === "solid") {
      var solidHex = normalizeHexClient(d.hex) || readColorFields().hex || "#f4b6d7";
      writeColorFields(solidHex, normalizeHexClient(d.hex2) || "");
      return;
    }
    var g1 = normalizeHexClient(d.hex) || colorDrafts.solid.hex || readColorFields().hex || "#f4b6d7";
    var g2 = normalizeHexClient(d.hex2) || readColorFields().hex2 || "#6f4e37";
    if (g1 === g2) g2 = g2 === "#6f4e37" ? "#ff66cc" : "#6f4e37";
    writeColorFields(g1, g2);
  }

  function seedColorDraftsFromEntity(target, entity) {
    loadColorDrafts(target);
    colorDrafts.holo = { hex: HOLO_PRIMARY, hex2: HOLO_SECONDARY };
    if (!entity) {
      persistColorDrafts(target);
      return;
    }
    var mode = inferColorMode(entity);
    var hex = normalizeHexClient(entity.color || "");
    var hex2 = normalizeHexClient(entity.color2 || "");
    if (mode === "holo") {
      colorDrafts.holo = { hex: HOLO_PRIMARY, hex2: HOLO_SECONDARY };
    } else if (mode === "gradient" && hex && hex2) {
      colorDrafts.gradient = { hex: hex, hex2: hex2 };
      if (!colorDrafts.solid.hex) colorDrafts.solid = { hex: hex, hex2: "" };
    } else if (hex) {
      colorDrafts.solid = { hex: hex, hex2: colorDrafts.solid.hex2 || "" };
      if (!colorDrafts.gradient.hex) {
        colorDrafts.gradient = { hex: hex, hex2: hex2 || "#6f4e37" };
      }
    }
    persistColorDrafts(target);
  }

  function activeColorMode() {
    var modeBtn = document.querySelector(".vc-cpf-modebtn.is-active");
    if (modeBtn) return String(modeBtn.getAttribute("data-mode") || "solid");
    var stage = document.querySelector("[data-cpf-stage]");
    return stage ? String(stage.getAttribute("data-cpf-mode") || "solid") : "solid";
  }

  function previewHtml(target, entity) {
    if (!entity) {
      return (
        '<div class="vc-cpf-stage__card is-empty" data-cpf-stage data-cpf-mode="solid">' +
        '<span class="vc-cpf-stage__mark"><i class="fa ' +
        esc(targetIcon(target)) +
        '" aria-hidden="true"></i></span>' +
        '<p class="vc-cpf-stage__title">Niente di attivo</p>' +
        '<p class="vc-cpf-stage__meta">Creane uno per iniziare</p>' +
        "</div>"
      );
    }
    var titleHtml = formatDiscordEntityTitleHtml(target, entity);
    var hex = target === "voice" ? "" : normalizeHexClient(entity.color || "");
    var hex2 = target === "voice" ? "" : normalizeHexClient(entity.color2 || "");
    var mode = target === "voice" ? "solid" : inferColorMode(entity);
    var isUnsetColor = target !== "voice" && (!hex || isDiscordUnsetRoleHex(hex));
    var accent = target === "voice" ? "" : isUnsetColor ? DISCORD_DEFAULT_ROLE_HEX : discordRoleDisplayHex(hex);
    var accent2 =
      target === "voice"
        ? ""
        : hex2
          ? discordRoleDisplayHex(hex2)
          : accent;
    var meta =
      target === "voice"
        ? "ID " + String(entity.id || "—")
        : isUnsetColor
          ? "Default Discord"
          : mode === "solid"
            ? hex.toUpperCase()
            : hex.toUpperCase() + (hex2 ? " → " + hex2.toUpperCase() : "");
    /* discordRoleLook2: icona ruolo webp; animated se a_* */
    var roleIconUrl = String((entity && entity.iconUrl) || "").trim();
    var roleIconAnim =
      Boolean(entity && entity.iconAnimated) ||
      /[?&]animated=true\b/i.test(roleIconUrl) ||
      /\/a_[a-f0-9]+\.(webp|gif|png)/i.test(roleIconUrl);
    if (/cdn\.discordapp\.com\/role-icons\//i.test(roleIconUrl)) {
      roleIconUrl = roleIconUrl.replace(/\.(png|jpe?g|gif)(\?|$)/i, ".webp$2");
    } else if (roleIconAnim && /\.png(\?|$)/i.test(roleIconUrl)) {
      roleIconUrl = roleIconUrl.replace(/\.png(\?|$)/i, ".webp$1");
    }
    if (roleIconAnim && !/[?&]animated=/i.test(roleIconUrl)) {
      roleIconUrl += (roleIconUrl.indexOf("?") >= 0 ? "&" : "?") + "animated=true";
    }
    var icon =
      target === "voice"
        ? '<i class="fa fa-microphone" aria-hidden="true"></i>'
        : roleIconUrl
          ? '<img class="vc-cpf-stage__mark-img' +
            (roleIconAnim ? " is-animated" : "") +
            '" src="' +
            esc(roleIconUrl) +
            '" alt="" width="48" height="48" loading="lazy" decoding="async" referrerpolicy="no-referrer" />'
          : entity.emoji
            ? '<span class="vc-cpf-stage__mark-emoji">' + esc(entity.emoji) + "</span>"
            : '<i class="fa fa-star" aria-hidden="true"></i>';
    var styleBits = [];
    if (accent) styleBits.push("--vc-cpf-accent:" + accent);
    if (accent2) styleBits.push("--vc-cpf-accent2:" + accent2);
    else if (accent) styleBits.push("--vc-cpf-accent2:" + accent);
    var swatch =
      target === "voice" || !accent
        ? ""
        : '<div class="vc-cpf-stage__swatch" data-cpf-swatch aria-hidden="true"></div>';
    return (
      '<div class="vc-cpf-stage__card' +
      (accent ? " has-color" : "") +
      (mode !== "solid" ? " is-" + mode : "") +
      '" data-cpf-stage data-cpf-mode="' +
      esc(mode) +
      '"' +
      (styleBits.length ? ' style="' + esc(styleBits.join(";")) + '"' : "") +
      ">" +
      swatch +
      '<span class="vc-cpf-stage__mark' +
      (entity && entity.iconUrl ? " has-discord-icon" : "") +
      '">' +
      icon +
      "</span>" +
      '<p class="vc-cpf-stage__title vc-discord-entity-name" data-cpf-title>' +
      titleHtml +
      "</p>" +
      '<p class="vc-cpf-stage__meta" data-cpf-meta>' +
      esc(meta) +
      "</p>" +
      "</div>"
    );
  }

  function currentIconValue(entity) {
    if (!entity) return "";
    var emoji = String(entity.emoji || "").trim();
    if (emoji) return emoji;
    return String(entity.iconUrl || "").trim();
  }

  function iconFieldHtml(entity) {
    var current = currentIconValue(entity);
    var preview =
      entity && entity.iconUrl
        ? '<img class="vc-cpf-iconprev" src="' +
          esc(entity.iconUrl) +
          '" alt="" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer" />'
        : entity && entity.emoji
          ? '<span class="vc-cpf-iconprev is-emoji" aria-hidden="true">' + esc(entity.emoji) + "</span>"
          : '<span class="vc-cpf-iconprev is-empty" aria-hidden="true"><i class="fa fa-smile-o"></i></span>';
    return (
      '<div class="vc-cpf-iconrow">' +
      preview +
      '<label class="vc-cpf-field vc-cpf-field--grow"><span>Valore</span>' +
      '<div class="vc-cpf-inputrow">' +
      '<input type="text" id="vc-cpf-icon" value="' +
      esc(current) +
      '" placeholder="🌙  ·  <:nome:id>  ·  https://…" autocomplete="off" />' +
      '<button type="button" class="vc-cpf-emojibtn" data-cpf-emoji-pick="icon" title="Scegli emoji" aria-label="Scegli emoji">' +
      '<i class="fa fa-smile-o" aria-hidden="true"></i></button>' +
      "</div></label>" +
      "</div>"
    );
  }

  function colorFieldHtml(label, hexId, pickId, value, placeholder, fieldKey) {
    var hex = normalizeHexClient(value) || normalizeHexClient(placeholder) || "#d4a888";
    var chipHex = discordRoleDisplayHex(hex);
    var key = fieldKey ? ' data-cpf-color-field="' + esc(fieldKey) + '"' : "";
    var CP = window.VcColorPicker;
    var pickerHtml =
      CP && typeof CP.markup === "function"
        ? CP.markup({
            id: pickId,
            value: hex,
            defaultHex: hex,
            ariaLabel: label,
            showHexInput: false,
            showReset: false,
            allowEmpty: false,
            className: "vc-cp--swatch-only",
            wrapAttrs: 'data-cpf-cp="' + esc(hexId) + '"',
          })
        : '<input type="color" id="' +
          esc(pickId) +
          '" class="vc-cpf-colorpick__native" value="' +
          esc(hex) +
          '" aria-label="' +
          esc(label) +
          '" />' +
          '<span class="vc-cpf-colorpick__chip" data-cpf-chip="' +
          esc(hexId) +
          '" style="background:' +
          esc(chipHex) +
          '" aria-hidden="true"></span>';
    return (
      '<label class="vc-cpf-field"' +
      key +
      ">" +
      "<span>" +
      esc(label) +
      "</span>" +
      '<div class="vc-cpf-colorpick">' +
      pickerHtml +
      '<input type="text" id="' +
      esc(hexId) +
      '" value="' +
      esc(value || hex) +
      '" placeholder="' +
      esc(placeholder || "#ff66cc") +
      '" autocomplete="off" spellcheck="false" />' +
      "</div></label>"
    );
  }

  function applyLiveColorPreview() {
    var stage = document.querySelector("[data-cpf-stage]");
    if (!stage) return;
    var hexEl = byId("vc-cpf-hex");
    var hex2El = byId("vc-cpf-hex2");
    if (!hexEl) return;
    var hex = normalizeHexClient(hexEl.value);
    var hex2 = hex2El ? normalizeHexClient(hex2El.value) : "";
    var displayHex = hex ? discordRoleDisplayHex(hex) : "";
    var displayHex2 = hex2 ? discordRoleDisplayHex(hex2) : "";
    var modeBtn = document.querySelector(".vc-cpf-modebtn.is-active");
    var mode = modeBtn ? String(modeBtn.getAttribute("data-mode") || "solid") : String(stage.getAttribute("data-cpf-mode") || "solid");
    var chip1 = document.querySelector('[data-cpf-chip="vc-cpf-hex"]');
    var chip2 = document.querySelector('[data-cpf-chip="vc-cpf-hex2"]');
    var pick1 = byId("vc-cpf-hex-pick");
    var pick2 = byId("vc-cpf-hex2-pick");
    var face1 = document.querySelector('[data-cpf-cp="vc-cpf-hex"] .vc-cp__swatch-face');
    var face2 = document.querySelector('[data-cpf-cp="vc-cpf-hex2"] .vc-cp__swatch-face');
    var api1 = document.querySelector('[data-cpf-cp="vc-cpf-hex"]');
    var api2 = document.querySelector('[data-cpf-cp="vc-cpf-hex2"]');
    if (hex && displayHex) {
      stage.classList.add("has-color");
      stage.classList.toggle("is-gradient", mode === "gradient");
      stage.classList.toggle("is-holo", mode === "holo");
      stage.setAttribute("data-cpf-mode", mode);
      stage.style.setProperty("--vc-cpf-accent", displayHex);
      var accent2 = mode === "solid" ? displayHex : displayHex2 || displayHex;
      stage.style.setProperty("--vc-cpf-accent2", accent2);
      if (chip1) chip1.style.background = displayHex;
      if (face1) face1.style.background = displayHex;
      if (api1 && api1.__vcCp && typeof api1.__vcCp.setValue === "function") {
        try {
          if (api1.__vcCp.getValue() !== hex) api1.__vcCp.setValue(hex);
        } catch (eCp1) {}
      }
      if (pick1 && pick1.type === "color" && pick1.value.toLowerCase() !== hex) pick1.value = hex;
      var meta = stage.querySelector("[data-cpf-meta]");
      if (meta) {
        if (isDiscordUnsetRoleHex(hex) && (mode === "solid" || !hex2 || isDiscordUnsetRoleHex(hex2))) {
          meta.textContent = "Default Discord";
        } else {
          meta.textContent =
            mode === "solid" || !hex2 ? hex.toUpperCase() : hex.toUpperCase() + " → " + hex2.toUpperCase();
        }
      }
      var title = stage.querySelector("[data-cpf-title]");
      if (title) {
        if (mode === "solid" || !hex2) {
          title.style.color = displayHex;
          title.style.backgroundImage = "";
          title.classList.remove("is-gradient-text");
        } else {
          title.style.color = "transparent";
          title.style.backgroundImage =
            "linear-gradient(90deg," + displayHex + "," + (displayHex2 || displayHex) + ")";
          title.classList.add("is-gradient-text");
        }
      }
    }
    if (hex2) {
      if (chip2) chip2.style.background = displayHex2 || discordRoleDisplayHex(hex2);
      if (face2) face2.style.background = displayHex2 || discordRoleDisplayHex(hex2);
      if (api2 && api2.__vcCp && typeof api2.__vcCp.setValue === "function") {
        try {
          if (api2.__vcCp.getValue() !== hex2) api2.__vcCp.setValue(hex2);
        } catch (eCp2) {}
      }
      if (pick2 && pick2.type === "color" && pick2.value.toLowerCase() !== hex2) pick2.value = hex2;
    }
  }

  function setActiveColorMode(mode) {
    var next = String(mode || "solid").toLowerCase();
    var buttons = document.querySelectorAll(".vc-cpf-modebtn");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].classList.toggle("is-active", String(buttons[i].getAttribute("data-mode") || "") === next);
    }
    var stage = document.querySelector("[data-cpf-stage]");
    if (stage) stage.setAttribute("data-cpf-mode", next);
    syncColorFieldVisibility(next);
    applyLiveColorPreview();
  }

  function syncColorFieldVisibility(mode) {
    var m = String(mode || activeColorMode() || "solid").toLowerCase();
    var secondaryWrap = document.querySelector('[data-cpf-color-field="secondary"]');
    var primaryWrap = document.querySelector('[data-cpf-color-field="primary"]');
    var hexEl = byId("vc-cpf-hex");
    var hex2El = byId("vc-cpf-hex2");
    var pick1 = byId("vc-cpf-hex-pick");
    var pick2 = byId("vc-cpf-hex2-pick");
    if (secondaryWrap) {
      secondaryWrap.hidden = m === "solid";
      secondaryWrap.style.display = m === "solid" ? "none" : "";
    }
    var lock = m === "holo";
    [hexEl, hex2El, pick1, pick2].forEach(function (el) {
      if (!el) return;
      el.disabled = lock;
      el.readOnly = lock;
    });
    Array.prototype.slice.call(document.querySelectorAll("[data-cpf-cp] .vc-cp__swatch")).forEach(function (btn) {
      btn.disabled = lock;
    });
    if (primaryWrap) primaryWrap.classList.toggle("is-locked", lock);
    if (secondaryWrap) secondaryWrap.classList.toggle("is-locked", lock);
  }

  function wireLiveColorPreview() {
    var hexEl = byId("vc-cpf-hex");
    if (!hexEl) return;
    var hex2El = byId("vc-cpf-hex2");
    var pick1 = byId("vc-cpf-hex-pick");
    var pick2 = byId("vc-cpf-hex2-pick");

    function syncFromText() {
      applyLiveColorPreview();
    }
    function syncFromPick(pick, text) {
      if (!pick || !text) return;
      text.value = pick.value;
      applyLiveColorPreview();
    }

    hexEl.addEventListener("input", syncFromText);
    hexEl.addEventListener("change", syncFromText);
    if (hex2El) {
      hex2El.addEventListener("input", syncFromText);
      hex2El.addEventListener("change", syncFromText);
    }
    if (window.VcColorPicker && typeof window.VcColorPicker.bind === "function") {
      Array.prototype.slice.call(document.querySelectorAll("[data-cpf-cp]")).forEach(function (wrap) {
        var hid = String(wrap.getAttribute("data-cpf-cp") || "");
        var text = hid ? byId(hid) : null;
        wrap.__vcCp = window.VcColorPicker.bind(wrap, {
          hexInput: text || null,
          onChange: function () {
            applyLiveColorPreview();
          },
        });
      });
    }
    if (pick1 && pick1.type === "color") {
      pick1.addEventListener("input", function () {
        syncFromPick(pick1, hexEl);
      });
    }
    if (pick2 && pick2.type === "color" && hex2El) {
      pick2.addEventListener("input", function () {
        syncFromPick(pick2, hex2El);
      });
    }
    var modeBtns = document.querySelectorAll(".vc-cpf-modebtn");
    for (var i = 0; i < modeBtns.length; i++) {
      modeBtns[i].addEventListener("click", function (ev) {
        var btn = ev.currentTarget;
        var next = String(btn.getAttribute("data-mode") || "solid");
        var prev = activeColorMode();
        if (prev !== next) {
          stashColorDraft(prev);
          applyColorDraft(next);
          persistColorDrafts(parseTarget());
        }
        setActiveColorMode(next);
      });
    }
    applyLiveColorPreview();
  }

  function requirementsChips(labels) {
    var list = Array.isArray(labels) ? labels : [];
    if (!list.length) return "";
    return (
      '<ul class="vc-cpf-req__chips">' +
      list
        .map(function (label) {
          return '<li class="vc-cpf-req__chip">' + esc(label) + "</li>";
        })
        .join("") +
      "</ul>"
    );
  }

    function voiceRequirementsHtml(opts) {
    opts = opts || {};
    var req = (state && state.requirements && state.requirements.voice) || {};
    var activity = state && state.voiceActivity ? state.voiceActivity : null;
    var minH = Number(req.weeklyMinHours) || 5;
    var maxFail = Number(req.maxFailedWeeks) || 3;
    var deleteAt = String(req.deleteAtLabel || "domenica alle 21:00");
    var progressHtml = "";
    if (activity && activity.hasChannel) {
      var pct = Math.max(
        0,
        Math.min(100, Math.round((Number(activity.weekSeconds || 0) / (minH * 3600)) * 100)),
      );
      var statusLine = activity.meetsRequirement
        ? "Requisito settimanale raggiunto"
        : activity.remainingHoursLabel
          ? "Mancano ancora " + activity.remainingHoursLabel
          : "Sotto soglia";
      var streakLine =
        Number(activity.failedWeekStreak || 0) > 0
          ? '<p class="vc-cpf-req__warn">Settimane sotto soglia: <strong>' +
            esc(String(activity.failedWeekStreak)) +
            "/" +
            esc(String(maxFail)) +
            "</strong> — alla terza la vocale viene eliminata " +
            esc(deleteAt) +
            ".</p>"
          : "";
      progressHtml =
        '<div class="vc-cpf-req__progress" role="status">' +
        '<div class="vc-cpf-req__progress-top"><span>Ore questa settimana</span><strong>' +
        esc(String(activity.weekHoursLabel || "0h")) +
        " / " +
        esc(String(activity.minHoursLabel || minH + "h")) +
        "</strong></div>" +
        '<div class="vc-cpf-req__bar" aria-hidden="true"><span style="width:' +
        pct +
        '%"></span></div>' +
        '<p class="vc-cpf-req__status' +
        (activity.meetsRequirement ? " is-ok" : "") +
        '">' +
        esc(statusLine) +
        "</p>" +
        streakLine +
        "</div>";
    } else if (activity && activity.recreationBlocked) {
      progressHtml =
        '<p class="vc-cpf-req__warn">Ricreazione bloccata' +
        (activity.cooldownRemainingLabel ? " ancora per <strong>" + esc(activity.cooldownRemainingLabel) + "</strong>" : "") +
        (activity.recreationBlockedLabel ? " (fino al " + esc(activity.recreationBlockedLabel) + ")" : "") +
        ".</p>";
    }

    var body = progressHtml || '<div class="vc-cpf-req__progress" aria-hidden="true"></div>';
    if (opts.compact) return body;
    return block("Requisiti", "Attività settimanale", body);
  }

  function lockedRequirementsHtml(target) {
    var reqAll = (state && state.requirements) || {};
    var key = target === "voice" ? "voice" : target === "secondary" ? "roleSecondary" : "rolePrimary";
    var req = reqAll[key] || {};
    var labels = Array.isArray(req.anyOf) ? req.anyOf : [];
    var note = String(req.note || "Questa sezione non è ancora disponibile sul tuo account.");
    var extra =
      target === "voice"
        ? voiceRequirementsHtml({ compact: true })
        : requirementsChips(labels) + '<p class="vc-cpf-empty">' + esc(note) + "</p>";
    return stackLayout(
      '<div class="vc-cpf-stage__card is-empty" data-cpf-stage data-cpf-mode="solid">' +
        '<span class="vc-cpf-stage__mark"><i class="fa fa-lock" aria-hidden="true"></i></span>' +
        '<p class="vc-cpf-stage__title">Non sbloccato</p>' +
        '<p class="vc-cpf-stage__meta">Serve il perk giusto</p></div>',
      block("Requisiti", "Attività / perk", extra),
    );
  }

  function block(_title, _sub, bodyHtml) {
    return (
      '<section class="vc-cpf-block">' +
      '<div class="vc-cpf-block__body">' +
      bodyHtml +
      "</div></section>"
    );
  }

  function stripVoiceEmojiPrefix(name) {
    var raw = String(name || "").trim();
    if (!raw) return "";
    var parts = raw.split(/[\u01C0\uFE32\u2758︲|│｜⠂•·—–\-]/);
    if (parts.length >= 2) {
      var left = String(parts[0] || "")
        .replace(/^\u0F04/u, "")
        .replace(/^༄/u, "")
        .trim();
      if (left.length <= 8) return parts.slice(1).join(" ").trim();
    }
    return raw
      .replace(/^\u0F04/u, "")
      .replace(/^༄/u, "")
      .replace(/^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u200D\uFE0F\s]+/u, "")
      .trim();
  }

  function formatDiscordEntityTitleHtml(target, entity) {
    if (target === "voice") {
      var rawName = String((entity && entity.name) || "Vocale privata").trim();
      var emoji = String((entity && entity.emoji) || "").trim();
      var base = stripVoiceEmojiPrefix(rawName) || rawName;
      if (!emoji) {
        var m = rawName.match(/^[\u0F04༄]?\s*([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}](?:\uFE0F|\u200D[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]*)*)/u);
        if (m) emoji = m[1];
      }
      if (!emoji) return esc(base);
      return (
        '<span class="vc-user-profile-voice-title">' +
        '<span class="vc-user-profile-voice-title__emoji">' +
        esc(emoji) +
        "</span>" +
        '<span class="vc-user-profile-voice-title__sep" aria-hidden="true">\u01C0</span>' +
        '<span class="vc-user-profile-voice-title__name">' +
        esc(base) +
        "</span></span>"
      );
    }
    return esc(String((entity && entity.name) || "Ruolo"));
  }

  function shell(inner) {
    return '<div class="vc-cpf" data-vc-pers-layout="persAllStack1">' + inner + "</div>";
  }

  function stackLayout(stageInner, editorInner, dockInner) {
    return (
      '<div class="vc-cpf-layout" data-vc-pers-layout="persAllStack1">' +
      '<aside class="vc-cpf-stage" aria-label="Anteprima">' +
      stageInner +
      "</aside>" +
      (dockInner
        ? '<div class="vc-cpf-dock">' + dockInner + "</div>"
        : "") +
      '<div class="vc-cpf-editor">' +
      editorInner +
      "</div></div>"
    );
  }

  function colorModeDockHtml(entity, gradientOk) {
    var mode = inferColorMode(entity);
    return (
      '<nav class="vc-cpf-dock__modes" role="group" aria-label="Tipo colore">' +
      '<button type="button" class="vc-cpf-btn vc-cpf-modebtn' +
      (mode === "solid" ? " is-active" : "") +
      '" data-mode="solid">Solido</button>' +
      (gradientOk
        ? '<button type="button" class="vc-cpf-btn vc-cpf-modebtn' +
          (mode === "gradient" ? " is-active" : "") +
          '" data-mode="gradient">Gradiente</button>' +
          '<button type="button" class="vc-cpf-btn vc-cpf-modebtn' +
          (mode === "holo" ? " is-active" : "") +
          '" data-mode="holo">Olografico</button>'
        : "") +
      "</nav>" +
      '<p class="vc-cpf-dock__hint">Anteprima live · salva per Discord</p>'
    );
  }

  function editorBasePath() {
    return "/personalizza/";
  }

  function editorHref(target) {
    var t = String(target || "primary");
    var q = new URLSearchParams();
    try {
      var cur = new URLSearchParams(window.location.search || "");
      var uid = String(cur.get("id") || cur.get("userId") || "").trim();
      if (/^\d{17,20}$/.test(uid)) q.set("id", uid);
    } catch (e) {}
    q.set("target", t);
    return editorBasePath() + "?" + q.toString();
  }

  function isPersHub() {
    return Boolean(window.__VC_PERS_HUB && window.__VC_PERS_HUB.enabled);
  }

  function shouldBootCustom() {
    if (!isPersHub()) return true;
    if (window.__VC_PERS_HUB.isRank) return false;
    if (window.__VC_PERS_HUB.isExtras) return false;
    if (typeof window.__VC_PERS_HUB.isCustom === "boolean") return window.__VC_PERS_HUB.isCustom;
    return isCustomRoleTab();
  }

  function persGateMarkup(opts) {
    opts = opts || {};
    var login = opts.login === true;
    var kicker = opts.kicker || "Personalizza";
    var title = opts.title || (login ? "Accedi per continuare" : "Impossibile caricare");
    var body = opts.body || "";
    var perks = login
      ? '<ul class="vc-pers-gate__perks" aria-label="Cosa puoi personalizzare">' +
        '<li><i class="fa fa-id-card-o" aria-hidden="true"></i><span>Rank card</span></li>' +
        '<li><i class="fa fa-star" aria-hidden="true"></i><span>Ruoli</span></li>' +
        '<li><i class="fa fa-sliders" aria-hidden="true"></i><span>Privacy &amp; altro</span></li>' +
        "</ul>"
      : "";
    var actions = login
      ? '<button type="button" class="vc-pers-gate__cta" data-vc-discord-login>' +
        '<img class="vc-discord-login-emoji" src="/images/discord.gif?v=20260908loginGif1" width="20" height="20" alt="" decoding="async" aria-hidden="true" />' +
        "<span>Accedi con Discord</span></button>" +
        '<a class="vc-pers-gate__secondary" href="/"><i class="fa fa-chevron-left" aria-hidden="true"></i><span>Torna alla Home</span></a>'
      : '<button type="button" class="vc-pers-gate__cta vc-pers-gate__cta--ghost" data-vc-pers-reload="1">' +
        '<i class="fa fa-refresh" aria-hidden="true"></i><span>Ricarica la pagina</span></button>';
    return (
      '<div class="vc-pers-gate' +
      (login ? " is-login" : " is-error") +
      '" data-vc-pers-gate="persGateUi1">' +
      '<section class="vc-pers-gate__card">' +
      '<div class="vc-pers-gate__badge" aria-hidden="true"><i class="fa ' +
      (login ? "fa-lock" : "fa-exclamation-circle") +
      '"></i></div>' +
      '<p class="vc-pers-gate__kicker">' +
      esc(kicker) +
      "</p>" +
      '<h1 class="vc-pers-gate__title">' +
      esc(title) +
      "</h1>" +
      '<p class="vc-pers-gate__lead">' +
      esc(body) +
      "</p>" +
      perks +
      '<div class="vc-pers-gate__actions">' +
      actions +
      "</div></section></div>"
    );
  }

  function topChrome(target, opts) {
    opts = opts || {};
    var hubOn = isPersHub();
    var back = hubOn
      ? ""
      : '<a class="vc-cpf-back" href="' +
        esc(opts.backHref || profileBackUrl()) +
        '"><i class="fa fa-chevron-left" aria-hidden="true"></i><span>Profilo</span></a>';
    if (opts.lockedLogin) {
      return (
        back +
        persGateMarkup({
          login: true,
          kicker: "Personalizza",
          title: "Accedi per continuare",
          body: opts.errorBody || "Collega Discord per personalizzare ruoli, colori e impostazioni del profilo.",
        })
      );
    }
    if (opts.errorTitle) {
      return (
        back +
        persGateMarkup({
          login: false,
          kicker: "Personalizza",
          title: opts.errorTitle,
          body: opts.errorBody || "",
        })
      );
    }
    var tabs = "";
    if (!hubOn) {
      tabs =
        '<nav class="vc-cpf-switch" aria-label="Sezioni">' +
        [
          ["primary", "fa-star", "Principale"],
          ["secondary", "fa-star-o", "Secondario"],
          ["voice", "fa-microphone", "Vocale"],
        ]
          .map(function (row) {
            return (
              '<a class="vc-cpf-switch__item' +
              (target === row[0] ? " is-active" : "") +
              '" href="' +
              esc(editorHref(row[0])) +
              '"><i class="fa ' +
              esc(row[1]) +
              '" aria-hidden="true"></i><span>' +
              esc(row[2]) +
              "</span></a>"
            );
          })
          .join("") +
        "</nav>";
    }
    return (
      back +
      '<header class="vc-cpf-top">' +
      (hubOn ? "" : '<p class="vc-cpf-kicker">Personalizza</p>') +
      "<h1>" +
      esc(targetLabel(target)) +
      "</h1>" +
      tabs +
      "</header>"
    );
  }

  function render() {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    /* persTabSwitchLoad1: non dipingere editor custom su tab extras/rank */
    if (isPersHub() && !isCustomRoleTab()) return;

    if (!getToken()) {
      app.hidden = false;
      app.removeAttribute("hidden");
      app.innerHTML = shell(topChrome("primary", { lockedLogin: true, backHref: "/user/" }));
      wirePersGateOauth(app);
      clearPendingChrome();
      return;
    }

    var target = parseTarget();
    var entity = entityFor(target);
    var gradientOk = Boolean(state && state.permissions && state.permissions.gradientHolo);
    if (target !== "voice") seedColorDraftsFromEntity(target, entity);

    var editor = "";
    if (!canAccess(target) && !entity) {
      editor = lockedRequirementsHtml(target);
    } else if (!entity) {
      /* vocCreateCooldownGate1: niente Crea se cooldown post auto-delete */
      var voiceCooldown =
        target === "voice" &&
        state &&
        state.voiceActivity &&
        state.voiceActivity.recreationBlocked;
      var createBody = voiceCooldown
        ? '<p class="vc-cpf-empty">Non puoi ricreare la vocale finché il cooldown è attivo' +
          (state.voiceActivity.cooldownRemainingLabel
            ? " (ancora <strong>" + esc(state.voiceActivity.cooldownRemainingLabel) + "</strong>)"
            : "") +
          ".</p>"
        : '<p class="vc-cpf-empty">Non hai ancora ' +
          esc(targetLabel(target).toLowerCase()) +
          ".</p>" +
          '<div class="vc-cpf-actions">' +
          '<button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="create">Crea ' +
          esc(targetLabel(target)) +
          "</button></div>";
      editor = stackLayout(
        previewHtml(target, null),
        (target === "voice" ? voiceRequirementsHtml() : "") +
          block(
            voiceCooldown ? "Bloccato" : "Crea",
            voiceCooldown ? "Attendi la fine del cooldown" : "Parti da zero",
            createBody,
          ),
      );
    } else if (target === "voice") {
      editor = stackLayout(
        previewHtml(target, entity),
        voiceRequirementsHtml() +
          block(
            "Identità",
            "Come appare il canale — solo emoji normali (niente custom del server)",
            '<div class="vc-cpf-grid vc-cpf-grid--voice-id">' +
              '<label class="vc-cpf-field">' +
              "<span>Nome</span>" +
              '<div class="vc-cpf-inputrow">' +
              '<input type="text" id="vc-cpf-name" maxlength="80" value="' +
              esc(stripVoiceEmojiPrefix(entity.name)) +
              '" autocomplete="off" />' +
              '<button type="button" class="vc-cpf-emojibtn" data-cpf-emoji-pick="name" title="Emoji nel nome" aria-label="Emoji nel nome">' +
              '<i class="fa fa-smile-o" aria-hidden="true"></i></button></div>' +
              '<div class="vc-cpf-actions vc-cpf-actions--field">' +
              '<button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="rename">Salva nome</button></div></label>' +
              '<label class="vc-cpf-field vc-cpf-field--emoji">' +
              "<span>Emoji</span>" +
              '<div class="vc-cpf-inputrow">' +
              '<input type="text" id="vc-cpf-emoji" maxlength="8" value="' +
              esc(entity.emoji || "") +
              '" placeholder="🎧" autocomplete="off" />' +
              '<button type="button" class="vc-cpf-emojibtn" data-cpf-emoji-pick="voc-emoji" title="Scegli emoji" aria-label="Scegli emoji">' +
              '<i class="fa fa-smile-o" aria-hidden="true"></i></button></div>' +
              '<div class="vc-cpf-actions vc-cpf-actions--field">' +
              '<button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="emoji">Salva emoji</button></div></label>' +
              "</div>",
          ) +
          block(
            "Accesso",
            "Chi può entrare",
            memberListHtml(entity.sharedMembers) +
              '<div class="vc-cpf-inline">' +
              '<input type="text" id="vc-cpf-member" placeholder="ID Discord" inputmode="numeric" autocomplete="off" />' +
              '<button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="members_add">Aggiungi</button></div>',
          ) +
          '<div class="vc-cpf-dangerzone">' +
          '<button type="button" class="vc-cpf-btn vc-cpf-btn--danger" data-action="delete">Elimina vocale</button>' +
          "</div>",
        '<p class="vc-cpf-dock__hint">Vocale privata</p>',
      );
    } else {
      editor = stackLayout(
        previewHtml(target, entity),
        block(
          "Nome",
          "Come appare in server — solo emoji normali nel nome (le custom vanno nell’icona)",
          '<label class="vc-cpf-field"><span>Testo</span>' +
            '<div class="vc-cpf-inputrow">' +
            '<input type="text" id="vc-cpf-name" maxlength="100" value="' +
            esc(String(entity.name || "").replace(/^༄\s*/, "")) +
            '" autocomplete="off" />' +
            '<button type="button" class="vc-cpf-emojibtn" data-cpf-emoji-pick="name" title="Emoji nel nome" aria-label="Emoji nel nome">' +
            '<i class="fa fa-smile-o" aria-hidden="true"></i></button></div></label>' +
            '<div class="vc-cpf-actions"><button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="rename">Salva nome</button></div>',
        ) +
          block(
            "Colore",
            "Anteprima subito — su Discord solo dopo «Salva colore»",
            '<div class="vc-cpf-grid">' +
              colorFieldHtml("Primario", "vc-cpf-hex", "vc-cpf-hex-pick", entity.color || "#f4b6d7", "#ff66cc", "primary") +
              (gradientOk
                ? colorFieldHtml(
                    "Secondario",
                    "vc-cpf-hex2",
                    "vc-cpf-hex2-pick",
                    entity.color2 || "#6f4e37",
                    "#6f4e37",
                    "secondary",
                  )
                : "") +
              "</div>" +
              '<div class="vc-cpf-actions"><button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="color" data-mode-from-ui="1">Salva colore</button></div>',
          ) +
          block(
            "Icona",
            "Emoji normali, custom del server o link immagine",
            iconFieldHtml(entity) +
              '<div class="vc-cpf-actions">' +
              '<button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="icon">Salva icona</button>' +
              '<button type="button" class="vc-cpf-btn vc-cpf-btn--ghost" data-action="icon" data-clear="1">Rimuovi</button></div>',
          ) +
          block(
            "Condiviso con",
            "Invia una richiesta in DM: il ruolo si assegna solo se accettano",
            memberListHtml(entity.sharedMembers) +
              '<div class="vc-cpf-inline">' +
              '<input type="text" id="vc-cpf-member" placeholder="ID Discord" inputmode="numeric" autocomplete="off" />' +
              '<button type="button" class="vc-cpf-btn vc-cpf-btn--primary" data-action="members_add">Invia richiesta</button></div>',
          ) +
          '<div class="vc-cpf-dangerzone">' +
          '<button type="button" class="vc-cpf-btn vc-cpf-btn--danger" data-action="delete">Elimina ruolo</button>' +
          "</div>",
        colorModeDockHtml(entity, gradientOk),
      );
    }

    app.hidden = false;
    app.innerHTML = shell(topChrome(target) + editor);
    wireActions(target);
    wireLiveColorPreview();
    wireEmojiPickers(target);
    setActiveColorMode(inferColorMode(entity));
    if (busy) setBusyUi(true);
    clearPendingChrome();
  }

  async function runAction(target, action, extra) {
    if (busy) return;
    if (
      target === "voice" &&
      action === "create" &&
      state &&
      state.voiceActivity &&
      state.voiceActivity.recreationBlocked
    ) {
      showToast(
        "Ricreazione bloccata" +
          (state.voiceActivity.cooldownRemainingLabel
            ? " ancora per " + state.voiceActivity.cooldownRemainingLabel
            : "") +
          ".",
        true,
      );
      return;
    }
    busy = true;
    setBusyUi(true);
    try {
      var body = Object.assign({ target: target, action: action }, extra || {});
      var out = await apiPost(body);
      if (!out || !out.ok) {
        showToast((out && out.message) || "Operazione non riuscita.", true);
        return;
      }
      applyStatePayload(out);
      var fresh = await apiGet();
      if (fresh && fresh.ok) applyStatePayload(fresh);
      if (action === "members_remove" && extra && extra.memberId) {
        var dropId = String(extra.memberId || "").trim();
        var ent = entityFor(target);
        if (ent && Array.isArray(ent.sharedMembers) && dropId) {
          ent.sharedMembers = ent.sharedMembers.filter(function (m) {
            return String(m && m.id) !== dropId;
          });
          if (typeof ent.sharedMembersCount === "number") {
            ent.sharedMembersCount = Math.max(0, ent.sharedMembers.filter(function (m) { return !m.isOwner; }).length);
          }
        }
      }
      showToast(out.message || "Salvato.");
      if (action === "members_add" || action === "members_remove") {
        refreshMembersUi(target);
      } else {
        render();
      }
    } catch (e) {
      showToast("Errore di rete.", true);
    } finally {
      busy = false;
      setBusyUi(false);
    }
  }

  function wireActions(target) {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    app.onclick = function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-action]") : null;
      if (!btn || btn.disabled) return;
      ev.preventDefault();
      var action = String(btn.getAttribute("data-action") || "");
      if (action === "create") return runAction(target, "create");
      if (action === "delete") {
        (typeof window.__vcEnsureDialog === "function"
          ? window.__vcEnsureDialog()
          : Promise.resolve(window.VcDialog)
        ).then(function (D) {
          if (!D || typeof D.confirm !== "function") return;
          return D.confirm({
            title: "Eliminare?",
            message: "Confermi l'eliminazione?",
            confirmLabel: "Elimina",
            cancelLabel: "Annulla",
            danger: true,
            icon: "fa-trash-o",
          }).then(function (ok) {
            if (ok) runAction(target, "delete");
          });
        });
        return;
      }
      if (action === "rename") {
        var nameEl = byId("vc-cpf-name");
        return runAction(target, "rename", { name: nameEl ? nameEl.value : "" });
      }
      if (action === "emoji") {
        var emojiEl = byId("vc-cpf-emoji");
        return runAction(target, "emoji", { emoji: emojiEl ? emojiEl.value : "" });
      }
      if (action === "color") {
        var mode = String(btn.getAttribute("data-mode") || "");
        if (btn.getAttribute("data-mode-from-ui") === "1" || !mode) {
          mode = activeColorMode();
        }
        mode = String(mode || "solid").toLowerCase();
        if (mode === "holo") {
          writeColorFields(HOLO_PRIMARY, HOLO_SECONDARY);
        }
        var hexEl = byId("vc-cpf-hex");
        var hex2El = byId("vc-cpf-hex2");
        var hex = normalizeHexClient(hexEl ? hexEl.value : "");
        var hex2 = normalizeHexClient(hex2El ? hex2El.value : "");
        if (mode === "solid" && !hex) {
          showToast("Inserisci un colore HEX valido (es. #ff66cc).", true);
          return;
        }
        if (mode === "gradient" && (!hex || !hex2)) {
          showToast(
            !hex2
              ? "Per il gradiente seleziona Gradiente e scrivi anche il secondario."
              : "Per il gradiente servono primario e secondario HEX validi.",
            true,
          );
          return;
        }
        if (mode === "holo") {
          hex = HOLO_PRIMARY;
          hex2 = HOLO_SECONDARY;
        }
        if (hexEl && hex) hexEl.value = hex;
        if (hex2El && hex2) hex2El.value = hex2;
        stashColorDraft(mode);
        persistColorDrafts(target);
        return runAction(target, "color", {
          mode: mode,
          hex: hex,
          hex2: hex2,
        });
      }
      if (action === "icon") {
        var clear = btn.getAttribute("data-clear") === "1";
        var iconEl = byId("vc-cpf-icon");
        return runAction(target, "icon", { value: clear ? "nessuno" : iconEl ? iconEl.value : "" });
      }
      if (action === "members_add") {
        var memEl = byId("vc-cpf-member");
        var addId = String(memEl && memEl.value ? memEl.value : "").trim();
        var selfAddId = state && state.userId ? String(state.userId) : "";
        if (addId && selfAddId && addId === selfAddId) {
          showToast("Sei già in lista come proprietario.", true);
          return;
        }
        return runAction(target, "members_add", { memberId: addId });
      }
      if (action === "members_remove") {
        var mid = String(btn.getAttribute("data-member-id") || "").trim();
        var selfId = state && state.userId ? String(state.userId) : "";
        if (mid && selfId && mid === selfId) {
          showToast("Non puoi rimuovere te stesso: sei il proprietario.", true);
          return;
        }
        return runAction(target, "members_remove", {
          memberId: mid,
        });
      }
    };
  }

  async function boot(attempt, navSeq) {
    if (!shouldBootCustom() && !isCustomRoleTab()) {
      return;
    }
    attempt = Number(attempt) || 0;
    var seq = navSeq != null ? Number(navSeq) : Number(cpfNavSeq || 0);
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    if (!getToken()) {
      if (!isCpfNavCurrent(seq)) return;
      render();
      return;
    }
    try {
      if (!app.innerHTML || app.hidden || app.getAttribute("data-vc-cpf-tab-boot") || app.querySelector("[data-vc-cpf-tab-boot]")) {
        showCustomTabBoot();
      }
      var data = await apiGet();
      if (!isCpfNavCurrent(seq) || !isCustomRoleTab()) return;
      if (!data || !data.ok) {
        app.hidden = false;
        app.removeAttribute("hidden");
        app.innerHTML = shell(
          topChrome("primary", {
            errorTitle: "Errore",
            errorBody: (data && data.message) || "Impossibile caricare.",
            backHref: "/user/",
            lockedLogin: data && (data.error === "missing_token" || data.error === "invalid_token" || data.status === 401),
          }),
        );
        wirePersGateOauth(app);
        clearPendingChrome();
        return;
      }
      applyStatePayload(data);
      if (!isCpfNavCurrent(seq) || !isCustomRoleTab()) return;
      if (window.VcPageTitle) window.VcPageTitle.set(targetLabel(parseTarget()));
      else document.title = "Vinili & Caffè \u01C0 " + targetLabel(parseTarget());
      render();
    } catch (e) {
      if (!isCpfNavCurrent(seq)) return;
      if (attempt < 2) {
        await new Promise(function (resolve) {
          setTimeout(resolve, 1200);
        });
        if (!isCpfNavCurrent(seq) || !isCustomRoleTab()) return;
        return boot(attempt + 1, seq);
      }
      if (!isCustomRoleTab()) return;
      app.hidden = false;
      app.removeAttribute("hidden");
      app.innerHTML = shell(
        topChrome("primary", {
          errorTitle: "Errore di rete",
          errorBody: "Ricarica la pagina.",
          backHref: "/user/",
        }),
      );
      clearPendingChrome();
    }
  }

  if (!document.__vcPersGateReloadWired) {
    document.__vcPersGateReloadWired = true;
    document.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("[data-vc-pers-reload]") : null;
      if (!t) return;
      try {
        ev.preventDefault();
      } catch (e0) {}
      try {
        window.location.reload();
      } catch (e1) {}
    });
  }

  function wirePersGateOauth(root) {
    var scope = root && root.querySelectorAll ? root : document;
    Array.prototype.slice
      .call(scope.querySelectorAll(".vc-pers-gate__cta[data-vc-discord-login]"))
      .forEach(function (btn) {
        if (btn.__vcPersGateOauth) return;
        btn.__vcPersGateOauth = true;
        btn.addEventListener("click", function (ev) {
          try {
            if (ev && ev.preventDefault) ev.preventDefault();
          } catch (e0) {}
          if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
            window.__vcDiscordStartOAuthRedirect(btn);
            return;
          }
          if (typeof window.__vcDiscordStartOAuth === "function") {
            window.__vcDiscordStartOAuth(btn);
            return;
          }
          var hdr = byId("discord-login-btn");
          if (hdr) hdr.click();
        });
      });
  }

  function forceLoginGateAfterLogout() {
    try {
      state = null;
    } catch (eSt) {}
    /* persTabSwitchLoad1: non sovrascrivere extras/rank con gate custom */
    if (isPersHub() && !isCustomRoleTab()) return;
    try {
      render();
    } catch (eRen) {
      try {
        boot(0, cpfNavSeq);
      } catch (eBoot) {}
    }
  }
  try {
    window.__vcCpfForceLoginGate = forceLoginGateAfterLogout;
  } catch (eExp) {}
  window.addEventListener("vc:auth-logout", function () {
    forceLoginGateAfterLogout();
  });
  window.addEventListener("pageshow", function () {
    try {
      if (!getToken()) forceLoginGateAfterLogout();
    } catch (ePs) {}
  });
  function pingHubScroll() {
    try {
      var hub = window.__VC_PERS_HUB_API;
      if (hub && typeof hub.afterPanelScrollToTabs === "function") hub.afterPanelScrollToTabs();
      else if (hub && typeof hub.scheduleScrollToTabs === "function") hub.scheduleScrollToTabs();
    } catch (ePing) {}
  }

  /* persTabScroll2 / persTabSwitchLoad1: hub soft-nav → ri-render immediato (detail.tab + hub) */
  document.addEventListener("vc:pers-hub-navigate", function (ev) {
    try {
      var hint = String((ev && ev.detail && ev.detail.tab) || "").trim().toLowerCase();
      if (!isCustomRoleTab(hint)) return;
      cpfNavSeq += 1;
      var seq = cpfNavSeq;
      if (!getToken()) {
        render();
        pingHubScroll();
        return;
      }
      if (state) {
        render();
        pingHubScroll();
        return;
      }
      showCustomTabBoot();
      Promise.resolve(boot(0, seq)).then(pingHubScroll).catch(pingHubScroll);
    } catch (eNav) {
      try {
        console.warn("[vc-cpf] hub-nav", eNav);
      } catch (eW) {}
    }
  });

  function scheduleBoot() {
    try {
      var hub = window.__VC_PERS_HUB_API;
      if (hub && typeof hub.whenSessionReady === "function") {
        hub.whenSessionReady(function () {
          boot(0);
        });
        return;
      }
    } catch (eSch) {}
    boot(0);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleBoot);
  } else {
    scheduleBoot();
  }
})();
