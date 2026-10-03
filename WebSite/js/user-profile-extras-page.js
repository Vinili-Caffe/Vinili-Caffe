(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXTRAS_TABS = {
    birthday: true,
    privacy: true,
    roles: true,
    reactions: true,
    response: true,
  };
  var MONTHS = [
    "",
    "Gennaio",
    "Febbraio",
    "Marzo",
    "Aprile",
    "Maggio",
    "Giugno",
    "Luglio",
    "Agosto",
    "Settembre",
    "Ottobre",
    "Novembre",
    "Dicembre",
  ];
  var state = { data: null, busy: false, roleCat: "pronouns" };
  var toastTimer = null;
  var guildEmojis = [];
  var guildEmojisLoaded = false;
  var guildEmojisLoading = false;
  var emojiPickerToken = 0;

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parseTab() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var t = String(q.get("target") || q.get("tab") || "")
        .trim()
        .toLowerCase();
      if (t === "ruoli" || t === "rolepanel" || t === "colors" || t === "colori") return "roles";
      if (t === "mention" || t === "mention_reaction") return "reactions";
      if (t === "mention_response") return "response";
      if (EXTRAS_TABS[t]) return t;
    } catch (e) {}
    return "";
  }

  function isExtrasTab() {
    return Boolean(EXTRAS_TABS[parseTab()]);
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
    try {
      var t = localStorage.getItem(ACCESS_TOKEN_KEY);
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return String(t).trim();
    } catch (e) {
      return "";
    }
  }

  function apiUrl() {
    var c = (window.__VC_PROFILE_EXTRAS && window.__VC_PROFILE_EXTRAS.apiUrl) || "/webhooks/site-profile-extras";
    return String(c || "").trim() || "/webhooks/site-profile-extras";
  }

  function showToast(message, isError) {
    var msg = String(message || "").trim();
    if (window.VcSiteToast) {
      if (!msg) window.VcSiteToast.hide();
      else window.VcSiteToast.show(msg, Boolean(isError));
      return;
    }
    var host = byId("vc-custom-profile-toast-host") || byId("vc-profile-extras-toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "vc-profile-extras-toast-host";
      host.className = "vc-dash-save-toast-host vc-site-toast-host vc-cpf-toast-host";
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
    }, 3200);
  }

  function fetchOpts(extra) {
    var opts = Object.assign({ headers: {} }, extra || {});
    try {
      if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
        opts.signal = AbortSignal.timeout(25000);
      }
    } catch (eTimeout) {}
    return opts;
  }

  function mapExtrasGetPayload(status, httpOk, data) {
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
    if (!token) return { ok: false, error: "missing_token", message: "Accedi con Discord." };
    var url = apiUrl();
    if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
      try {
        var cacheKey = window.VcApiCache.keyFor(url, { scope: "profileExtras", auth: token, v: "extrasFull1" });
        var payload = await window.VcApiCache.fetchWithCache(cacheKey, url, {
          ttlMs: 120000,
          staleMs: 900000,
          persistMs: 30 * 60 * 1000,
          timeoutMs: 22000,
          fetchInit: fetchOpts({ headers: { Accept: "application/json", Authorization: "Bearer " + token } }),
        });
        if (payload && payload.blocked) {
          var blockedBody = payload.body && typeof payload.body === "object" ? payload.body : { ok: false, error: "rate_limited" };
          return mapExtrasGetPayload(429, false, blockedBody);
        }
        return mapExtrasGetPayload(
          Number((payload && payload.status) || 0),
          Boolean(payload && payload.ok),
          payload && payload.body,
        );
      } catch (eCache) {
              }
    }
    var res;
    try {
      res = await fetch(
        url,
        fetchOpts({ headers: { Accept: "application/json", Authorization: "Bearer " + token } }),
      );
    } catch (eNet) {
      var timedOut =
        eNet &&
        (eNet.name === "TimeoutError" ||
          eNet.name === "AbortError" ||
          String(eNet.message || "").toLowerCase().indexOf("timeout") >= 0);
      return {
        ok: false,
        error: timedOut ? "timeout" : "network",
        message: timedOut
          ? "Timeout: il server sta impiegando troppo tempo. Riprovo…"
          : "Errore di rete. Controlla la connessione e riprova.",
      };
    }
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    return mapExtrasGetPayload(res.status, res.ok, data);
  }

  async function apiPost(body) {
    var token = getToken();
    if (!token) return { ok: false, error: "missing_token", message: "Accedi con Discord." };
    var res = await fetch(
      apiUrl(),
      fetchOpts({
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: "Bearer " + token,
        },
        body: JSON.stringify(body || {}),
      }),
    );
    var data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (data && typeof data === "object") data.status = res.status;
    if (data && data.ok && window.VcApiCache && typeof window.VcApiCache.invalidate === "function") {
      try {
        window.VcApiCache.invalidate(
          window.VcApiCache.keyFor(apiUrl(), { scope: "profileExtras", auth: token, v: "extrasFull1" }),
        );
      } catch (eInv) {}
    }
    return data || { ok: false, status: res.status, message: "Risposta non valida." };
  }

  function emojisApiUrl() {
    var base =
      (window.__VC_CUSTOM_PROFILE && window.__VC_CUSTOM_PROFILE.apiUrl) ||
      "/webhooks/site-custom-profile";
    return String(base || "/webhooks/site-custom-profile").replace(/\/?$/, "") + "/emojis";
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
    var emojiUrl = emojisApiUrl();
    var fetchEmojis = function () {
      return fetch(emojiUrl, {
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
        });
    };
    if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
      var emojiKey = window.VcApiCache.keyFor(emojiUrl, { scope: "profileEmojis", auth: token, v: "1" });
      return window.VcApiCache
        .fetchWithCache(emojiKey, emojiUrl, {
          ttlMs: 300000,
          staleMs: 3600000,
          persistMs: 24 * 60 * 60 * 1000,
          timeoutMs: 18000,
          fetchInit: {
            method: "GET",
            headers: { Accept: "application/json", Authorization: "Bearer " + token },
            credentials: "omit",
          },
        })
        .then(function (payload) {
          guildEmojisLoading = false;
          guildEmojisLoaded = true;
          var body = payload && payload.body;
          guildEmojis = body && body.ok && Array.isArray(body.emojis) ? body.emojis : [];
          return guildEmojis;
        })
        .catch(function () {
          return fetchEmojis().catch(function () {
            guildEmojisLoading = false;
            guildEmojisLoaded = true;
            guildEmojis = [];
            return guildEmojis;
          });
        });
    }
    return fetchEmojis().catch(function () {
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
    var openWith = function (emojis) {
      if (token !== emojiPickerToken) return;
      window.VcEmojiPicker.open({
        anchor: anchor,
        guildEmojis: unicodeOnly ? [] : emojis || [],
        unicodeOnly: unicodeOnly,
        preferCustom: !unicodeOnly && preferCustom && emojis && emojis.length > 0,
        onPick: onPick,
        focusTarget: opts.focusTarget || null,
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

  function customEmojiImgUrl(id, animated, size) {
    if (window.VcEmojiPicker && typeof window.VcEmojiPicker.customUrl === "function") {
      return window.VcEmojiPicker.customUrl(String(id), animated === true, size || 32);
    }
    var n = Math.min(128, Math.max(16, Number(size) || 32));
    if (animated === true) {
      return (
        "https://cdn.discordapp.com/emojis/" +
        encodeURIComponent(String(id)) +
        ".webp?size=" +
        n +
        "&animated=true"
      );
    }
    return (
      "https://cdn.discordapp.com/emojis/" + encodeURIComponent(String(id)) + ".webp?size=" + n + "&quality=lossless"
    );
  }

  function guildEmojiMeta(id) {
    var needle = String(id || "");
    for (var i = 0; i < guildEmojis.length; i++) {
      if (String(guildEmojis[i].id) === needle) return guildEmojis[i];
    }
    return null;
  }

  function pickToReactionToken(pick) {
    if (!pick) return "";
    if (pick.type === "custom" && pick.id) return "custom:" + String(pick.id);
    var ch = String(pick.text || pick.markup || "").trim();
    return ch ? "unicode:" + ch : "";
  }

  function tokenToPreviewHtml(token, displayHint) {
    var hint = String(displayHint || "").trim();
    if (hint && hint.indexOf("<") >= 0) return renderDiscordContentHtml(hint);
    var raw = String(token || "");
    if (raw.startsWith("custom:")) {
      var id = raw.slice(7);
      var meta = guildEmojiMeta(id);
      var url = customEmojiImgUrl(id, meta && meta.animated === true, 48);
      return (
        '<img class="vc-px-emoji-img" src="' +
        esc(url) +
        '" alt="" draggable="false" loading="eager" decoding="async" />'
      );
    }
    if (raw.startsWith("unicode:")) {
      return '<span class="vc-px-emoji-uni">' + esc(raw.slice(8)) + "</span>";
    }
    return esc(raw);
  }

  function reactionTokensToHtml(tokens, displays) {
    if (!tokens || !tokens.length) return "";
    return tokens
      .map(function (t, i) {
        return tokenToPreviewHtml(t, displays && displays[i]);
      })
      .join("");
  }

  function renderDiscordContentHtml(text) {
    var s = String(text || "");
    if (!s) return "";
    var re = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{16,20})>/g;
    var parts = [];
    var last = 0;
    var m;
    while ((m = re.exec(s))) {
      if (m.index > last) parts.push(esc(s.slice(last, m.index)));
      parts.push(
        '<img class="vc-px-emoji-img vc-px-emoji-img--inline" src="' +
          esc(customEmojiImgUrl(m[3], m[1] === "a", 32)) +
          '" alt="" draggable="false" loading="eager" decoding="async" />',
      );
      last = m.index + m[0].length;
    }
    if (last < s.length) parts.push(esc(s.slice(last)));
    return parts.join("");
  }

  var PX_RESPONSE_MAX = 500;

  function isPxRichInput(el) {
    return Boolean(el && el.isContentEditable);
  }

  function makePxEmojiTokenEl(markup, name, id, animated) {
    var img = document.createElement("img");
    img.className = "vc-px-emoji-img vc-px-emoji-img--inline vc-px-composer__emoji-token";
    img.src = customEmojiImgUrl(id, animated === true, 32);
    img.alt = ":" + (name || "emoji") + ":";
    img.draggable = false;
    img.contentEditable = "false";
    img.setAttribute("data-emoji-markup", String(markup || ""));
    return img;
  }

  function serializePxRichInput(el) {
    if (!el) return "";
    if (!isPxRichInput(el)) return String(el.value || "");
    var out = "";
    function walk(node) {
      if (!node) return;
      if (node.nodeType === 3) {
        out += String(node.nodeValue || "");
        return;
      }
      if (node.nodeType !== 1) return;
      var markup = node.getAttribute && node.getAttribute("data-emoji-markup");
      if (markup) {
        out += markup;
        return;
      }
      var tag = String(node.tagName || "").toUpperCase();
      if (tag === "BR") {
        out += "\n";
        return;
      }
      var kids = node.childNodes;
      for (var i = 0; i < kids.length; i += 1) walk(kids[i]);
      if ((tag === "DIV" || tag === "P") && node !== el) out += "\n";
    }
    walk(el);
    return out.replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").replace(/\s+$/g, "");
  }

  function fillPxRichInput(el, text) {
    if (!el) return;
    el.innerHTML = "";
    var s = String(text || "");
    if (!s) {
      el.classList.add("is-empty");
      el._vcPxLastGood = "";
      return;
    }
    var re = /<(a?):([a-zA-Z0-9_]{2,32}):(\d{16,20})>/g;
    var last = 0;
    var m;
    var frag = document.createDocumentFragment();
    while ((m = re.exec(s))) {
      if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
      frag.appendChild(makePxEmojiTokenEl(m[0], m[2], m[3], m[1] === "a"));
      last = m.index + m[0].length;
    }
    if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
    el.appendChild(frag);
    el.classList.remove("is-empty");
    el._vcPxLastGood = serializePxRichInput(el);
  }

  function placeCaretAtEndPx(el) {
    if (!el) return;
    try {
      el.focus();
      var range = document.createRange();
      if (!el.childNodes.length) {
        range.setStart(el, 0);
        range.collapse(true);
      } else {
        range.selectNodeContents(el);
        range.collapse(false);
      }
      var sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(range);
    } catch (e) {}
  }

  function insertAtPxRichInput(el, text, pick) {
    if (!el) return;
    var insert = String(text || "");
    if (!isPxRichInput(el)) {
      insertAtInput(el, insert);
      return;
    }
    el.focus();
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount) placeCaretAtEndPx(el);
    sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer) && range.commonAncestorContainer !== el) {
      placeCaretAtEndPx(el);
      sel = window.getSelection();
      range = sel.getRangeAt(0);
    }
    range.deleteContents();
    var node = null;
    if (pick && pick.type === "custom" && pick.markup) {
      var cm = String(pick.markup).match(/^<(a?):([a-zA-Z0-9_]{2,32}):(\d{16,20})>$/);
      if (cm) node = makePxEmojiTokenEl(pick.markup, cm[2] || pick.name, cm[3] || pick.id, cm[1] === "a" || pick.animated);
    }
    if (!node && insert) {
      var custom = insert.match(/^<(a?):([a-zA-Z0-9_]{2,32}):(\d{16,20})>$/);
      if (custom) node = makePxEmojiTokenEl(insert, custom[2], custom[3], custom[1] === "a");
      else node = document.createTextNode(insert);
    }
    if (!node) return;
    var piece =
      (node.getAttribute && node.getAttribute("data-emoji-markup")) || String(node.nodeValue || "");
    if (serializePxRichInput(el).length + String(piece).length > PX_RESPONSE_MAX) return;
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    el.classList.remove("is-empty");
    onPxRichInput(el);
  }

  function syncPxRichEmpty(el) {
    if (!el || !isPxRichInput(el)) return;
    var text = serializePxRichInput(el);
    var empty = !String(text || "").trim() && !(el.querySelector && el.querySelector("img[data-emoji-markup]"));
    if (empty) {
      if (el.childNodes.length) el.innerHTML = "";
      el.classList.add("is-empty");
    } else {
      el.classList.remove("is-empty");
    }
  }

  function onPxRichInput(el) {
    if (!el) el = byId("vc-px-response");
    if (!el) return "";
    var text = serializePxRichInput(el);
    if (text.length > PX_RESPONSE_MAX) {
      fillPxRichInput(el, el._vcPxLastGood || text.slice(0, PX_RESPONSE_MAX));
      placeCaretAtEndPx(el);
      text = serializePxRichInput(el);
    } else {
      el._vcPxLastGood = text;
    }
    syncPxRichEmpty(el);
    syncResponseComposer(el, text);
    return text;
  }

  function syncResponseComposer(el, text) {
    if (!el) el = byId("vc-px-response");
    if (!el) return;
    if (typeof text !== "string") text = serializePxRichInput(el);
    var live = byId("vc-px-stage-meta");
    if (live) {
      live.innerHTML = text.trim()
        ? renderDiscordContentHtml(text.slice(0, 160))
        : '<span class="vc-px-muted">Nessun testo attivo</span>';
    }
  }

  function reactionSlotHtml(index, token, displayHint, isAdd) {
    return (
      '<div class="vc-px-reaction-slot">' +
      '<div class="vc-px-reaction-slot__preview">' +
      (token ? tokenToPreviewHtml(token, displayHint) : '<span class="vc-px-reaction-slot__empty">—</span>') +
      "</div>" +
      '<button type="button" class="vc-cpf-btn vc-cpf-btn--ghost vc-px-reaction-slot__pick" data-px="reactions-pick" data-index="' +
      esc(String(index)) +
      '">' +
      esc(isAdd ? "Aggiungi" : "Cambia") +
      "</button>" +
      (token
        ? '<button type="button" class="vc-cpf-btn vc-cpf-btn--ghost vc-px-reaction-slot__clear" data-px="reactions-slot-clear" data-index="' +
          esc(String(index)) +
          '" aria-label="Rimuovi slot">×</button>'
        : "") +
      "</div>"
    );
  }

  function setExtrasLoaderCopy(title, sub) {
    var loading = byId("vc-custom-profile-loading");
    if (!loading) return;
    try {
      var t = loading.querySelector(".vc-user-profile-loader__title");
      var s = loading.querySelector(".vc-user-profile-loader__sub");
      if (t && title) t.textContent = title;
      if (s && sub) s.textContent = sub;
      if (title) loading.setAttribute("aria-label", title);
    } catch (e) {}
  }

  function showExtrasFatal(message) {
    var app = byId("vc-custom-profile-app");
    if (!app) {
      killLoaders();
      return;
    }
    app.hidden = false;
    app.dataset.vcCpfReady = "1";
    app.innerHTML = shell(
      layout(
        stageCard("fa-exclamation-circle", "Errore", message || "Impossibile caricare."),
        blockBody('<p class="vc-cpf-empty">' + esc(message || "Impossibile caricare.") + "</p>"),
      ),
    );
    killLoaders();
  }

  function killLoaders() {
    try {
      window.__VC_CPF_BOOT = window.__VC_CPF_BOOT || { done: false, timer: 0 };
      window.__VC_CPF_BOOT.done = true;
      if (window.__VC_CPF_BOOT.timer) {
        clearTimeout(window.__VC_CPF_BOOT.timer);
        window.__VC_CPF_BOOT.timer = 0;
      }
    } catch (eBoot) {}
    try {
      document.documentElement.classList.remove("vc-custom-profile-pending");
      document.documentElement.classList.remove("vc-rank-customize-pending");
      document.documentElement.classList.remove("vc-loading-scroll-lock");
      document.documentElement.classList.remove("vc-page-cine-boot");
      document.documentElement.classList.add("vc-page-cine-ready");
      document.documentElement.classList.add("vc-styles-ready");
      document.documentElement.classList.add("vc-core-styles-ready");
      document.documentElement.classList.add("vc-pers-extras-ready");
      document.body.classList.add("vc-custom-profile-page");
    } catch (e) {}
    try {
      var persMain = byId("vc-personalizza-root");
      if (persMain) {
        persMain.style.removeProperty("visibility");
        persMain.style.removeProperty("opacity");
        persMain.style.removeProperty("pointer-events");
        persMain.style.removeProperty("display");
      }
    } catch (eMain) {}
    try {
      var page = byId("vc-custom-profile-page");
      if (page) page.hidden = false;
    } catch (ePage) {}
    try {
      var nodes = document.querySelectorAll(
        '#vc-custom-profile-loading, #vc-rank-customize-loading, [data-vc-profile-boot], .vc-user-profile-loader.vc-user-profile-boot',
      );
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        el.hidden = true;
        el.setAttribute("hidden", "");
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("pointer-events", "none", "important");
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (e2) {}
  }

  function shell(inner) {
    return '<div class="vc-cpf vc-profile-extras">' + inner + "</div>";
  }

  function stageCard(icon, title, meta, opts) {
    opts = opts || {};
    var metaHtml = opts.rich ? String(meta || "") : esc(meta || "");
    var metaClass = "vc-cpf-stage__meta" + (opts.rich ? " vc-cpf-stage__meta--rich" : "");
    var metaId = opts.metaId ? ' id="' + esc(opts.metaId) + '"' : "";
    return (
      '<aside class="vc-cpf-stage" aria-label="Anteprima">' +
      '<div class="vc-cpf-stage__card">' +
      '<span class="vc-cpf-stage__mark"><i class="fa ' +
      esc(icon || "fa-sliders") +
      '" aria-hidden="true"></i></span>' +
      '<p class="vc-cpf-stage__title">' +
      esc(title || "") +
      "</p>" +
      '<p class="' +
      metaClass +
      '"' +
      metaId +
      ">" +
      metaHtml +
      "</p>" +
      "</div></aside>"
    );
  }

  function editor(blocksHtml) {
    return '<div class="vc-cpf-editor">' + blocksHtml + "</div>";
  }

  function blockBody(inner) {
    return '<section class="vc-cpf-block"><div class="vc-cpf-block__body">' + inner + "</div></section>";
  }

  function actions(html) {
    return '<div class="vc-cpf-actions">' + html + "</div>";
  }

  function layout(stage, blocks) {
    return '<div class="vc-cpf-layout vc-px-layout">' + stage + editor(blocks) + "</div>";
  }

  function btn(primary, ghost, danger, label, px) {
    var cls = "vc-cpf-btn";
    if (primary) cls += " vc-cpf-btn--primary";
    else if (danger) cls += " vc-cpf-btn--danger";
    else if (ghost) cls += " vc-cpf-btn--ghost";
    return (
      '<button type="button" class="' +
      cls +
      '" data-px="' +
      esc(px) +
      '">' +
      esc(label) +
      "</button>"
    );
  }

  function titleFor(tab) {
    if (tab === "birthday") return "Compleanno";
    if (tab === "privacy") return "Privacy";
    if (tab === "roles") return "Ruoli";
    if (tab === "reactions") return "Reactions";
    if (tab === "response") return "Response";
    return "Personalizza";
  }

  function computeAgeFromBirthday(day, month, birthYear) {
    var d = Number(day);
    var m = Number(month);
    var y = Number(birthYear);
    if (!Number.isFinite(d) || d < 1 || d > 31) return 0;
    if (!Number.isFinite(m) || m < 1 || m > 12) return 0;
    if (!Number.isFinite(y) || y < 1900) return 0;
    try {
      var fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      var parts = fmt.formatToParts(new Date());
      var map = {};
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type !== "literal") map[parts[i].type] = Number(parts[i].value);
      }
      var ty = Number(map.year);
      var tm = Number(map.month);
      var td = Number(map.day);
      if (!Number.isFinite(ty) || y > ty) return 0;
      var passed = tm > m || (tm === m && td >= d);
      return Math.max(1, ty - y - (passed ? 0 : 1));
    } catch (e) {
      return 0;
    }
  }

  function daysInMonth(month, year) {
    var m = Number(month) || 0;
    var y = Number(year) || 0;
    if (m < 1 || m > 12) return 31;
    if (y > 0) return new Date(y, m, 0).getDate();
    return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 31;
  }

  function birthdayYearOptions(selectedYear) {
    var nowY = new Date().getFullYear();
    var minY = nowY - 120;
    var maxY = nowY;
    var ySel = Number(selectedYear) || 0;
    if (ySel > 0 && ySel < minY) minY = ySel;
    if (ySel > maxY) maxY = ySel;
    var out = [];
    for (var y = maxY; y >= minY; y--) out.push({ value: String(y), label: String(y) });
    return out;
  }

  function birthdayDayOptions(month, year, selectedDay) {
    var max = daysInMonth(month, year);
    var dSel = Number(selectedDay) || 0;
    if (dSel > max) max = dSel;
    var out = [];
    for (var d = 1; d <= max; d++) out.push({ value: String(d), label: String(d) });
    return out;
  }

  function pxSelectHtml(id, options, selectedValue, meta) {
    meta = meta || {};
    var sel = String(selectedValue == null ? "" : selectedValue);
    var placeholder = String(meta.placeholder || "Seleziona…");
    var title = String(meta.title || "");
    var label = placeholder;
    for (var i = 0; i < options.length; i++) {
      if (String(options[i].value) === sel && sel !== "") {
        label = options[i].label;
        break;
      }
    }
    var optsHtml = options
      .map(function (o) {
        var v = String(o.value == null ? "" : o.value);
        if (!v) return "";
        var isSel = v === sel;
        return (
          '<button type="button" class="vc-px-select__option' +
          (isSel ? " is-selected" : "") +
          '" role="option" aria-selected="' +
          (isSel ? "true" : "false") +
          '" data-px="select-pick" data-px-select-value="' +
          esc(v) +
          '">' +
          esc(o.label) +
          "</button>"
        );
      })
      .join("");
    return (
      '<div class="vc-px-select" data-vc-px-select>' +
      '<button type="button" class="vc-px-select__trigger" data-px="select-toggle" aria-haspopup="listbox" aria-expanded="false">' +
      '<span class="vc-px-select__value' +
      (sel ? "" : " is-placeholder") +
      '">' +
      esc(label) +
      "</span>" +
      '<span class="vc-px-select__caret" aria-hidden="true"></span>' +
      "</button>" +
      '<div class="vc-px-select__panel" role="listbox" hidden data-px-select-panel="1">' +
      (title ? '<div class="vc-px-select__title">' + esc(title) + "</div>" : "") +
      optsHtml +
      "</div>" +
      '<input type="hidden" id="' +
      esc(id) +
      '" value="' +
      esc(sel) +
      '" autocomplete="off" /></div>'
    );
  }

  function findPxSelectPanel(selectRoot) {
    if (!selectRoot) return null;
    var local = selectRoot.querySelector(".vc-px-select__panel");
    if (local) return local;
    var portaled = document.querySelectorAll(".vc-px-select__panel.is-portaled");
    for (var i = 0; i < portaled.length; i++) {
      if (portaled[i]._vcPxRoot === selectRoot) return portaled[i];
    }
    return null;
  }

  function clearPxSelectPanelPos(panel) {
    if (!panel) return;
    try {
      if (panel._vcPxPortaled && panel._vcPxHome && panel._vcPxHome.isConnected) {
        panel._vcPxHome.appendChild(panel);
      }
      panel._vcPxPortaled = false;
      panel._vcPxHome = null;
      panel._vcPxRoot = null;
      panel.classList.remove("is-portaled", "is-drop-up");
      panel.style.position = "";
      panel.style.top = "";
      panel.style.bottom = "";
      panel.style.left = "";
      panel.style.right = "";
      panel.style.width = "";
      panel.style.maxHeight = "";
      panel.style.zIndex = "";
      panel.style.display = "";
      panel.style.visibility = "";
      panel.style.opacity = "";
      panel.style.pointerEvents = "";
    } catch (eClear) {}
  }

  function positionPxSelectPanel(selectRoot, selectPanel, selectTrigger) {
    if (!selectRoot || !selectPanel || !selectTrigger) return;
    try {
      if (!selectPanel._vcPxPortaled) {
        selectPanel._vcPxHome = selectPanel.parentNode;
        selectPanel._vcPxRoot = selectRoot;
        document.body.appendChild(selectPanel);
        selectPanel._vcPxPortaled = true;
        selectPanel.classList.add("is-portaled");
      }
    } catch (ePortal) {}
    var trigRect = selectTrigger.getBoundingClientRect();
    var gap = 6;
    var pad = 12;
    var spaceBelow = Math.max(0, window.innerHeight - trigRect.bottom - pad);
    var spaceAbove = Math.max(0, trigRect.top - pad);
    var preferUp = spaceBelow < 168 && spaceAbove >= spaceBelow;
    var avail = preferUp ? spaceAbove : spaceBelow;
    var maxH = Math.max(160, Math.min(280, (avail || 180) - gap));
    selectRoot.classList.toggle("is-drop-up", preferUp);
    selectPanel.classList.toggle("is-drop-up", preferUp);
    selectPanel.hidden = false;
    selectPanel.style.display = "block";
    selectPanel.style.visibility = "visible";
    selectPanel.style.opacity = "1";
    selectPanel.style.pointerEvents = "auto";
    selectPanel.style.position = "fixed";
    selectPanel.style.left = Math.round(trigRect.left) + "px";
    selectPanel.style.width = Math.max(132, Math.round(trigRect.width)) + "px";
    selectPanel.style.right = "auto";
    selectPanel.style.maxHeight = maxH + "px";
    selectPanel.style.zIndex = "2147483000";
    if (preferUp) {
      selectPanel.style.top = "auto";
      selectPanel.style.bottom = Math.round(window.innerHeight - trigRect.top + gap) + "px";
    } else {
      selectPanel.style.bottom = "auto";
      selectPanel.style.top = Math.round(trigRect.bottom + gap) + "px";
    }
  }

  function closePxSelects(except) {
    var nodes = document.querySelectorAll("[data-vc-px-select].is-open");
    for (var i = 0; i < nodes.length; i++) {
      if (except && nodes[i] === except) continue;
      nodes[i].classList.remove("is-open");
      nodes[i].classList.remove("is-drop-up");
      var tr = nodes[i].querySelector(".vc-px-select__trigger");
      var panel = findPxSelectPanel(nodes[i]);
      if (tr) tr.setAttribute("aria-expanded", "false");
      if (panel) {
        panel.hidden = true;
        clearPxSelectPanelPos(panel);
      }
    }
  }

  function setPxSelectValue(root, value) {
    if (!root) return;
    var hidden = root.querySelector('input[type="hidden"]');
    if (hidden) hidden.value = String(value == null ? "" : value);
    var labelEl = root.querySelector(".vc-px-select__value");
    var panel = findPxSelectPanel(root);
    var opts = panel
      ? panel.querySelectorAll(".vc-px-select__option")
      : root.querySelectorAll(".vc-px-select__option");
    var placeholder = "Seleziona…";
    var hiddenId = hidden && hidden.id ? String(hidden.id) : "";
    if (hiddenId === "vc-px-bday-day") placeholder = "Giorno";
    else if (hiddenId === "vc-px-bday-month") placeholder = "Mese";
    else if (hiddenId === "vc-px-bday-year") placeholder = "Anno";
    else {
      var titleEl = panel
        ? panel.querySelector(".vc-px-select__title")
        : root.querySelector(".vc-px-select__title");
      if (titleEl) {
        var t = String(titleEl.textContent || "").trim().toLowerCase();
        if (t.indexOf("giorno") >= 0) placeholder = "Giorno";
        else if (t.indexOf("mese") >= 0) placeholder = "Mese";
        else if (t.indexOf("anno") >= 0) placeholder = "Anno";
      }
    }
    var text = placeholder;
    var needle = String(value == null ? "" : value);
    var found = false;
    for (var i = 0; i < opts.length; i++) {
      var ov = String(opts[i].getAttribute("data-px-select-value") || "");
      var isSel = ov === needle && needle !== "";
      opts[i].classList.toggle("is-selected", isSel);
      opts[i].setAttribute("aria-selected", isSel ? "true" : "false");
      if (isSel) {
        text = String(opts[i].textContent || "").trim() || text;
        found = true;
      }
    }
    if (labelEl) {
      labelEl.textContent = text;
      labelEl.classList.toggle("is-placeholder", !found);
    }
  }

  function syncBirthdayDayOptions() {
    var dayRoot = document.querySelector("#vc-px-bday-day")
      ? document.querySelector("#vc-px-bday-day").closest("[data-vc-px-select]")
      : null;
    if (!dayRoot) return;
    var month = Number((byId("vc-px-bday-month") || {}).value) || 0;
    var year = Number((byId("vc-px-bday-year") || {}).value) || 0;
    var day = Number((byId("vc-px-bday-day") || {}).value) || 0;
    var max = daysInMonth(month, year);
    if (day > max) day = max;
    var opts = birthdayDayOptions(month, year, day);
    var panel = findPxSelectPanel(dayRoot);
    if (!panel) return;
    panel.innerHTML = opts
      .map(function (o) {
        var isSel = String(o.value) === String(day) && day > 0;
        return (
          '<button type="button" class="vc-px-select__option' +
          (isSel ? " is-selected" : "") +
          '" role="option" aria-selected="' +
          (isSel ? "true" : "false") +
          '" data-px="select-pick" data-px-select-value="' +
          esc(o.value) +
          '">' +
          esc(o.label) +
          "</button>"
        );
      })
      .join("");
    setPxSelectValue(dayRoot, day > 0 ? String(day) : "");
  }

  function renderBirthday() {
    var b = (state.data && state.data.birthday) || {};
    var day = Number(b.day) || 0;
    var month = Number(b.month) || 0;
    var birthYear = Number(b.birthYear) || 0;
    var maxDay = daysInMonth(month, birthYear);
    if (day > maxDay) day = maxDay;
    var age = computeAgeFromBirthday(day, month, birthYear);
    var summary =
      day && month ? day + " " + (MONTHS[month] || month) : "Nessuna data impostata";
    if (day && month && birthYear > 0) summary += " · " + birthYear;
    if (day && month && age > 0) summary += " · " + age + " anni";
    var ageMeta = b.showAge === false ? "Età nascosta sul profilo" : "Età visibile sul profilo";
    var monthOptions = [];
    for (var m = 1; m <= 12; m++) monthOptions.push({ value: String(m), label: MONTHS[m] });
    return layout(
      stageCard("fa-birthday-cake", summary, ageMeta),
      blockBody(
        '<div class="vc-cpf-grid vc-cpf-grid--bday">' +
          '<div class="vc-cpf-field"><span>Giorno</span>' +
          pxSelectHtml("vc-px-bday-day", birthdayDayOptions(month, birthYear, day), day ? String(day) : "", {
            placeholder: "Giorno",
          }) +
          "</div>" +
          '<div class="vc-cpf-field"><span>Mese</span>' +
          pxSelectHtml("vc-px-bday-month", monthOptions, month ? String(month) : "", {
            placeholder: "Mese",
          }) +
          "</div>" +
          '<div class="vc-cpf-field"><span>Anno</span>' +
          pxSelectHtml(
            "vc-px-bday-year",
            birthdayYearOptions(birthYear),
            birthYear > 0 ? String(birthYear) : "",
            { placeholder: "Anno" },
          ) +
          "</div>" +
          "</div>" +
          '<p class="vc-px-bday-hint">L\'et\u00e0 la calcola il bot dall\'anno. Puoi comunque tenerla privata sul profilo.</p>' +
          actions(
            btn(true, false, false, "Salva", "birthday-save") +
              btn(false, true, false, b.showAge === false ? "Mostra età" : "Nascondi età", "birthday-privacy") +
              btn(false, false, true, "Rimuovi", "birthday-clear"),
          ),
      ),
    );
  }

  function privacySwitchHtml(kind) {
    var on = !kind.blocked;
    return (
      '<div class="vc-profile-extras__row">' +
      '<span class="vc-profile-extras__row-label">' +
      esc(kind.label) +
      "</span>" +
      '<button type="button" class="vc-profile-extras__switch' +
      (on ? " is-on" : "") +
      '" role="switch" aria-checked="' +
      (on ? "true" : "false") +
      '" data-px="privacy-toggle" data-key="' +
      esc(kind.key) +
      '" aria-label="' +
      esc(kind.label) +
      '"><span class="vc-profile-extras__knob" aria-hidden="true"></span></button>' +
      "</div>"
    );
  }

  function renderPrivacy() {
    var kinds = (state.data && state.data.privacy && state.data.privacy.kinds) || [];
    var visible = 0;
    for (var i = 0; i < kinds.length; i++) if (!kinds[i].blocked) visible += 1;
    var rows = kinds.map(privacySwitchHtml).join("");
    return layout(
      stageCard("fa-lock", "Privacy profilo", visible + "/" + kinds.length + " elementi visibili"),
      blockBody(
        '<div class="vc-profile-extras__toggles">' +
          (rows || '<p class="vc-cpf-empty">Nessuna opzione privacy.</p>') +
          "</div>" +
          actions(
            btn(true, false, false, "Tutto visibile", "privacy-all-on") +
              btn(false, true, false, "Tutto bloccato", "privacy-all-off"),
          ),
      ),
    );
  }

  function renderRoles() {
    var panelData = (state.data && state.data.rolePanel) || {};
    var cats = panelData.categories || [];
    var byKey = panelData.byKey || {};
    var cat = state.roleCat || "pronouns";
    if (!byKey[cat] && cats[0]) cat = cats[0].key;
    state.roleCat = cat;
    var current = byKey[cat] || { options: [] };
    var selected = String(current.selected || "");
    var selectedIds = Array.isArray(current.selectedIds)
      ? current.selectedIds.map(function (x) {
          return String(x || "");
        }).filter(Boolean)
      : selected && selected !== "remove"
        ? [selected]
        : [];
    var multi = Boolean(current.multi) || cat === "mentions" || cat === "hobby" || cat === "gaming";
    var catLabel = current.label || (cats.find(function (c) { return c.key === cat; }) || {}).label || "Ruoli";
    var selectedLabel = "Nessuna selezione";
    var options = Array.isArray(current.options) ? current.options : [];
    if (multi && selectedIds.length) {
      var labels = [];
      for (var si = 0; si < selectedIds.length; si++) {
        for (var oi = 0; oi < options.length; oi++) {
          if (String(options[oi].value) === selectedIds[si]) {
            labels.push(options[oi].label || selectedIds[si]);
            break;
          }
        }
      }
      selectedLabel = labels.length ? labels.join(", ") : selectedIds.length + " selezionati";
    } else {
      for (var i = 0; i < options.length; i++) {
        if (String(options[i].value) === selected && selected && selected !== "remove") {
          selectedLabel = options[i].label || selected;
          break;
        }
      }
    }
    var catBtns = cats
      .map(function (c) {
        return (
          '<button type="button" class="vc-profile-extras__chip' +
          (c.key === cat ? " is-active" : "") +
          '" data-px="role-cat" data-key="' +
          esc(c.key) +
          '">' +
          esc(c.label) +
          "</button>"
        );
      })
      .join("");
    var rows = options
      .map(function (o) {
        var val = String(o.value || "");
        var isSel = val !== "remove" && selectedIds.indexOf(val) >= 0;
        return (
          '<button type="button" class="vc-profile-extras__option' +
          (isSel ? " is-selected" : "") +
          (val === "remove" ? " is-remove" : "") +
          '" data-px="role-pick" data-value="' +
          esc(val) +
          '"><span class="vc-profile-extras__option-label">' +
          esc(o.label || val) +
          '</span><span class="vc-profile-extras__option-mark" aria-hidden="true">' +
          (isSel ? '<i class="fa fa-check"></i>' : "") +
          "</span></button>"
        );
      })
      .join("");
    var hint = multi
      ? "Tocca per aggiungere o togliere. Ping, Hobby e Gaming: puoi sceglierne più di uno."
      : cat.indexOf("colors") === 0
        ? "Un solo colore tra Base, Livelli e Plus. Il tocco lo applica subito."
        : "Il tocco applica subito il ruolo su Discord.";
    return layout(
      stageCard("fa-tags", selectedLabel, catLabel),
      blockBody(
        '<label class="vc-cpf-field vc-cpf-field--roles-cat"><span>Categoria</span>' +
          '<div class="vc-profile-extras__chips">' +
          catBtns +
          "</div></label>" +
          '<div class="vc-cpf-field vc-cpf-field--roles-pick"><span>Opzione</span>' +
          '<div class="vc-profile-extras__options vc-profile-extras__options--compact" role="listbox">' +
          (rows || '<p class="vc-cpf-empty">Nessuna opzione in questa categoria.</p>') +
          "</div></div>" +
          '<p class="vc-profile-extras__hint">' +
          hint +
          "</p>",
      ),
    );
  }

  function renderReactions() {
    var r = (state.data && state.data.mentionReaction) || {};
    if (!r.access) {
      return layout(
        stageCard("fa-smile-o", "Reactions", "Accesso mancante"),
        blockBody('<p class="vc-cpf-empty">Serve VIP, Booster, Double Booster, VIP+ o Level 70.</p>'),
      );
    }
    var tokens = Array.isArray(r.reactions) ? r.reactions : [];
    var displays = Array.isArray(r.display) ? r.display : [];
    var max = Number(r.max) || 3;
    var previewHtml = tokens.length
      ? reactionTokensToHtml(tokens, displays)
      : '<span class="vc-px-muted">Nessuna reaction attiva</span>';
    var slotsHtml = "";
    for (var si = 0; si < tokens.length; si++) slotsHtml += reactionSlotHtml(si, tokens[si], displays[si], false);
    if (tokens.length < max) slotsHtml += reactionSlotHtml(tokens.length, null, "", true);
    return layout(
      stageCard("fa-smile-o", "Mention Reactions", previewHtml, { rich: true }),
      blockBody(
        '<div class="vc-px-reaction-slots">' +
          (slotsHtml || "") +
          "</div>" +
          '<p class="vc-profile-extras__hint">Scegli emoji base o del server: ogni slot si salva subito (max ' +
          esc(String(max)) +
          ").</p>" +
          actions(btn(false, true, false, "Azzera tutto", "reactions-clear")),
      ),
    );
  }

  function renderResponse() {
    var r = (state.data && state.data.mentionResponse) || {};
    if (!r.access) {
      return layout(
        stageCard("fa-commenting-o", "Response", "Accesso mancante"),
        blockBody('<p class="vc-cpf-empty">' + esc(r.accessHint || "Funzione riservata.") + "</p>"),
      );
    }
    var text = String(r.text || "").trim();
    var previewHtml = text
      ? renderDiscordContentHtml(text.slice(0, 120))
      : '<span class="vc-px-muted">Nessun testo attivo</span>';
    return layout(
      stageCard("fa-commenting-o", "Mention Response", previewHtml, { rich: true, metaId: "vc-px-stage-meta" }),
      blockBody(
        '<div class="vc-cpf-field vc-cpf-field--response"><span>Messaggio (max 500)</span>' +
          '<div class="vc-cpf-inputrow vc-cpf-inputrow--textarea">' +
          '<div class="vc-px-composer vc-px-composer--rich">' +
          '<div id="vc-px-response" class="vc-px-composer__input" contenteditable="true" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="Testo ed emoji…"></div>' +
          "</div>" +
          '<button type="button" class="vc-cpf-emojibtn" data-px-emoji-pick="response" title="Scegli emoji" aria-label="Scegli emoji">' +
          '<i class="fa fa-smile-o" aria-hidden="true"></i></button>' +
          "</div></div>" +
          actions(
            btn(true, false, false, "Salva", "response-save") +
              btn(false, true, false, "Rimuovi", "response-clear"),
          ),
      ),
    );
  }

  function render() {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    var tab = parseTab();
    var body = "";
    if (tab === "birthday") body = renderBirthday();
    else if (tab === "privacy") body = renderPrivacy();
    else if (tab === "roles") body = renderRoles();
    else if (tab === "reactions") body = renderReactions();
    else if (tab === "response") body = renderResponse();
    app.hidden = false;
    app.dataset.vcCpfReady = "1";
    app.classList.toggle("is-busy", Boolean(state.busy));
    app.innerHTML = shell(body);
    try {
      if (window.VcPageTitle) window.VcPageTitle.set(titleFor(tab));
      else document.title = "Vinili & Caffè | " + titleFor(tab);
    } catch (e) {}
    wire();
    wireExtrasUi();
    killLoaders();
  }

  async function run(section, extra) {
    if (state.busy) return;
    state.busy = true;
    var app = byId("vc-custom-profile-app");
    if (app) app.classList.add("is-busy");
    try {
      var out = await apiPost(Object.assign({ section: section }, extra || {}));
      if (!out || !out.ok) {
        showToast((out && out.message) || "Operazione non riuscita.", true);
        return;
      }
      if (out.dm) state.data.dm = out.dm;
      if (out.privacy) state.data.privacy = out.privacy;
      if (out.birthday) state.data.birthday = out.birthday;
      if (out.mentionReaction) state.data.mentionReaction = out.mentionReaction;
      if (out.mentionResponse) {
        state.data.mentionResponse = Object.assign({}, state.data.mentionResponse || {}, out.mentionResponse);
      }
      if (out.rolePanelCategory && state.data.rolePanel && state.data.rolePanel.byKey) {
        state.data.rolePanel.byKey[out.rolePanelCategory.key] = out.rolePanelCategory;
      }
      showToast(out.message || "Salvato.");
      render();
    } catch (e) {
      showToast("Errore di rete.", true);
    } finally {
      state.busy = false;
      if (app) app.classList.remove("is-busy");
    }
  }

  function wire() {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    app.onclick = function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-px]") : null;
      if (!btn) return;
      ev.preventDefault();
      var act = String(btn.getAttribute("data-px") || "");
      if (act === "birthday-save") {
        var curBday = (state.data && state.data.birthday) || {};
        return run("birthday", {
          action: "set",
          day: Number((byId("vc-px-bday-day") || {}).value),
          month: Number((byId("vc-px-bday-month") || {}).value),
          birthYear: Number((byId("vc-px-bday-year") || {}).value),
          showAge: curBday.showAge !== false,
        });
      }
      if (act === "birthday-clear") return run("birthday", { action: "clear" });
      if (act === "birthday-privacy") {
        var cur = state.data && state.data.birthday;
        return run("birthday", { action: "privacy", showAge: Boolean(cur && cur.showAge === false) });
      }
      if (act === "privacy-toggle") return run("privacy", { action: "toggle", key: btn.getAttribute("data-key") });
      if (act === "privacy-all-on") return run("privacy", { action: "all_on" });
      if (act === "privacy-all-off") return run("privacy", { action: "all_off" });
      if (act === "role-cat") {
        state.roleCat = String(btn.getAttribute("data-key") || "pronouns");
        render();
        return;
      }
      if (act === "role-pick") {
        return run("roles", {
          category: state.roleCat,
          value: String(btn.getAttribute("data-value") || ""),
        });
      }
      if (act === "reactions-pick") {
        var pickIdx = Number(btn.getAttribute("data-index"));
        openEmojiPicker(
          btn,
          function (pick) {
            var token = pickToReactionToken(pick);
            if (!token) return;
            var cur = (state.data && state.data.mentionReaction && state.data.mentionReaction.reactions) || [];
            var next = Array.isArray(cur) ? cur.slice() : [];
            if (pickIdx >= next.length) next.push(token);
            else next[pickIdx] = token;
            run("mention_reaction", { action: "set", reactions: next });
          },
          { preferCustom: true },
        );
        return;
      }
      if (act === "reactions-slot-clear") {
        var clearIdx = Number(btn.getAttribute("data-index"));
        var curTokens = (state.data && state.data.mentionReaction && state.data.mentionReaction.reactions) || [];
        var trimmed = Array.isArray(curTokens) ? curTokens.slice() : [];
        if (clearIdx >= 0 && clearIdx < trimmed.length) trimmed.splice(clearIdx, 1);
        if (trimmed.length) return run("mention_reaction", { action: "set", reactions: trimmed });
        return run("mention_reaction", { action: "clear" });
      }
      if (act === "reactions-clear") return run("mention_reaction", { action: "clear" });
      if (act === "response-save") {
        var ta = byId("vc-px-response");
        return run("mention_response", { action: "set", text: ta ? serializePxRichInput(ta) : "" });
      }
      if (act === "response-clear") return run("mention_response", { action: "clear" });
      if (act === "select-toggle") {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (eStop) {}
        var selectRoot = btn.closest ? btn.closest("[data-vc-px-select]") : null;
        if (!selectRoot) return;
        var willOpen = !selectRoot.classList.contains("is-open");
        closePxSelects(willOpen ? selectRoot : null);
        selectRoot.classList.toggle("is-open", willOpen);
        selectRoot.classList.remove("is-drop-up");
        var selectPanel = findPxSelectPanel(selectRoot) || selectRoot.querySelector(".vc-px-select__panel");
        var selectTrigger = selectRoot.querySelector(".vc-px-select__trigger");
        if (selectPanel) selectPanel.hidden = !willOpen;
        if (selectTrigger) selectTrigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
        if (willOpen && selectPanel && selectTrigger) {
          try {
            positionPxSelectPanel(selectRoot, selectPanel, selectTrigger);
            requestAnimationFrame(function () {
              if (selectRoot.classList.contains("is-open")) {
                positionPxSelectPanel(selectRoot, selectPanel, selectTrigger);
              }
            });
          } catch (ePos) {}
          try {
            if (typeof window.VcWakeDeferredMedia === "function") {
              window.VcWakeDeferredMedia(selectPanel);
            }
          } catch (eWake) {}
        } else if (selectPanel) {
          clearPxSelectPanelPos(selectPanel);
        }
        return;
      }
      if (act === "select-pick") {
        var pickRoot =
          (btn.closest && btn.closest("[data-vc-px-select]")) ||
          (btn.closest && btn.closest(".vc-px-select__panel.is-portaled") && btn.closest(".vc-px-select__panel.is-portaled")._vcPxRoot) ||
          null;
        if (!pickRoot) return;
        setPxSelectValue(pickRoot, btn.getAttribute("data-px-select-value") || "");
        var pickId = ((pickRoot.querySelector('input[type="hidden"]') || {}).id) || "";
        if (pickId === "vc-px-bday-month" || pickId === "vc-px-bday-year") {
          try {
            syncBirthdayDayOptions();
          } catch (eSyncDay) {}
        }
        closePxSelects();
        return;
      }
    };
  }

  function wireExtrasUi() {
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    var emojiBtn = app.querySelector('[data-px-emoji-pick="response"]');
    if (emojiBtn && !emojiBtn._vcPxEmojiWired) {
      emojiBtn._vcPxEmojiWired = true;
      emojiBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var ta = byId("vc-px-response");
        openEmojiPicker(
          emojiBtn,
          function (pick) {
            if (!pick) return;
            var value = pick.type === "custom" ? String(pick.markup || "") : String(pick.text || pick.markup || "");
            if (!value) return;
            insertAtPxRichInput(ta, value, pick);
          },
          { preferCustom: true, focusTarget: ta },
        );
      });
    }
    var ta = byId("vc-px-response");
    if (ta && !ta._vcPxPreviewWired) {
      ta._vcPxPreviewWired = true;
      var initial = String((((state.data || {}).mentionResponse || {}).text) || "");
      fillPxRichInput(ta, initial);
      syncResponseComposer(ta, initial);
      ta.addEventListener("input", function () {
        onPxRichInput(ta);
      });
      ta.addEventListener("paste", function (ev) {
        var cd = ev.clipboardData || window.clipboardData || null;
        var clip = (cd && cd.getData && cd.getData("text/plain")) || "";
        if (!clip) return;
        ev.preventDefault();
        if (/<(a?):([a-zA-Z0-9_]{2,32}):(\d{16,20})>/.test(clip)) {
          clip.split(/(<(?:a?):[a-zA-Z0-9_]{2,32}:\d{16,20}>)/g).forEach(function (part) {
            if (part) insertAtPxRichInput(ta, part);
          });
        } else {
          insertAtPxRichInput(ta, clip);
        }
      });
      ta.addEventListener("keydown", function (ev) {
        if (ev.key === "Backspace" || ev.key === "Delete") {
          setTimeout(function () {
            onPxRichInput(ta);
          }, 0);
        }
      });
    }
    if (parseTab() === "reactions" || parseTab() === "response") void ensureGuildEmojis();
    if (!window._vcPxSelectDocWired) {
      window._vcPxSelectDocWired = true;
      document.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest("[data-vc-px-select]")) return;
        if (t.closest(".vc-px-select__panel.is-portaled")) {
                    var pickBtn = t.closest("[data-px='select-pick']");
          if (pickBtn) {
            var panel = pickBtn.closest(".vc-px-select__panel.is-portaled");
            var root = panel && panel._vcPxRoot;
            if (root) {
              setPxSelectValue(root, pickBtn.getAttribute("data-px-select-value") || "");
              var pickId = ((root.querySelector('input[type="hidden"]') || {}).id) || "";
              if (pickId === "vc-px-bday-month" || pickId === "vc-px-bday-year") {
                try {
                  syncBirthdayDayOptions();
                } catch (eSyncDay2) {}
              }
              closePxSelects();
            }
          }
          return;
        }
        closePxSelects();
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") closePxSelects();
      });
      window.addEventListener(
        "scroll",
        function (ev) {
          var t = ev && ev.target;
          if (t && t !== document && t !== document.documentElement && t !== document.body && t !== window) {
            if (t.classList && t.classList.contains("vc-px-select__panel")) return;
            if (t.closest && t.closest(".vc-px-select__panel")) return;
            return;
          }
          closePxSelects();
        },
        true,
      );
      window.addEventListener("resize", function () {
        closePxSelects();
      });
    }
  }

  function readCachedExtrasPayload(token) {
    if (!window.VcApiCache || typeof window.VcApiCache.keyFor !== "function") return null;
    try {
      var keys = ["extrasFull1", "429fix4"];
      for (var i = 0; i < keys.length; i += 1) {
        var cacheKey = window.VcApiCache.keyFor(apiUrl(), { scope: "profileExtras", auth: token, v: keys[i] });
        var raw = sessionStorage.getItem("vc:apicache:" + cacheKey);
        if (!raw) continue;
        var parsed = JSON.parse(raw);
        if (parsed && parsed.value && parsed.value.body && parsed.value.body.ok) return parsed.value.body;
      }
    } catch (eCacheRead) {}
    return null;
  }

  function isRetryableExtrasError(data) {
    if (!data || data.ok === true) return false;
    if (data.error === "rate_limited" || data.status === 429) return false;
    if (data.error === "timeout" || data.error === "network") return true;
    var msg = String((data && data.message) || "").toLowerCase();
    return msg.indexOf("timeout") >= 0 || msg.indexOf("rete") >= 0 || msg.indexOf("riprova") >= 0;
  }

  async function boot(attempt) {
    if (!isExtrasTab()) return;
    attempt = Number(attempt) || 0;
    var app = byId("vc-custom-profile-app");
    if (!app) return;
    setExtrasLoaderCopy("Caricamento…", "Un momento…");
    app.hidden = true;
    if (!getToken()) {
      showExtrasFatal("Accedi con Discord per gestire queste impostazioni.");
      return;
    }
    try {
      var data = await apiGet();
      if ((!data || !data.ok) && isRetryableExtrasError(data) && attempt < 3) {
        setExtrasLoaderCopy(
          "Caricamento…",
          (data && data.message) || "Un momento…",
        );
        await new Promise(function (resolve) {
          setTimeout(resolve, 500 + attempt * 400);
        });
        return boot(attempt + 1);
      }
      if (!data || !data.ok) {
        var cachedExtras = readCachedExtrasPayload(getToken());
        if (cachedExtras) {
          state.data = cachedExtras;
          render();
          return;
        }
        showExtrasFatal((data && data.message) || "Impossibile caricare.");
        return;
      }
      state.data = data;
            if (parseTab() === "reactions" || parseTab() === "response") {
        void ensureGuildEmojis().then(function () {
          try {
            if (parseTab() === "reactions" || parseTab() === "response") render();
          } catch (eRe) {}
        });
      }
      render();
    } catch (e) {
      if (attempt < 2) {
        await new Promise(function (resolve) {
          setTimeout(resolve, 500);
        });
        return boot(attempt + 1);
      }
      showExtrasFatal("Errore di rete o timeout. Ricarica la pagina.");
    }
  }

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

  window.__VC_PROFILE_EXTRAS_API = { isExtrasTab: isExtrasTab, boot: boot, parseTab: parseTab };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleBoot);
  else scheduleBoot();
})();
