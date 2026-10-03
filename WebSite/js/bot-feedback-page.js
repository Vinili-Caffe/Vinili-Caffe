(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var state = {
    payload: null,
    modalOpen: false,
    draftImages: [],
    draftKind: "suggestion",
    pollTimer: null,
    renderFingerprint: "",
    fetchGen: 0,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return window.__VC_BOT_FEEDBACK || {};
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;");
  }

  function getToken() {
    var token = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!token || !exp || Date.now() >= exp) return "";
    return token;
  }

  function apiUrl() {
    var conf = cfg();
    var host = String(window.location.hostname || "").toLowerCase();
    var local = String(conf.apiUrlLocal || "").trim();
    var remote = String(conf.apiUrl || "").trim();
    if (remote === "#" || remote === "about:blank") remote = "";
    if (local === "#" || local === "about:blank") local = "";
    /* phoneApiSoft429Kill1: mai apiUrlLocal fuori da localhost */
    if ((host === "localhost" || host === "127.0.0.1") && local) return local;
    return remote || "/webhooks/site-bot-feedback";
  }

  function maxImages() {
    var n = Number(cfg().maxImages);
    return Number.isFinite(n) && n >= 1 && n <= 8 ? Math.floor(n) : 4;
  }

  function authHeaders() {
    var h = { Accept: "application/json" };
    var t = getToken();
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  function parseJson(response) {
    return response.text().then(function (text) {
      var s = String(text || "").trim();
      if (!s) throw new Error("Risposta vuota dall'API.");
      if (s.charAt(0) === "<") throw new Error("L'API feedback ha risposto HTML invece di JSON.");
      return JSON.parse(s);
    });
  }

  var statusTimer = null;
  var STATUS_AUTO_MS = 6000;

  function clearStatusTimer() {
    if (statusTimer) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
  }

  function setStatus(msg, isError, opts) {
    var el = byId("vc-bot-feedback-status");
    if (el) {
      el.hidden = true;
      el.textContent = "";
      el.className = "vc-reviews-status vc-reviews-status--global";
    }
    clearStatusTimer();
    var text = String(msg || "").trim();
    if (window.VcSiteToast) {
      if (!text) {
        window.VcSiteToast.hide();
        return;
      }
      window.VcSiteToast.show(text, Boolean(isError), {
        pending: Boolean(opts && opts.sticky) || undefined,
        sticky: Boolean(opts && opts.sticky) || undefined,
      });
      return;
    }
    if (!el) return;
    if (!text) return;
    el.hidden = false;
    el.textContent = text;
    el.className = "vc-reviews-status vc-reviews-status--global" + (isError ? " is-error" : "");
    if (!(opts && opts.sticky)) {
      statusTimer = setTimeout(function () {
        statusTimer = null;
        setStatus("");
      }, STATUS_AUTO_MS);
    }
  }

  function hideGate() {
    var g = byId("vc-bot-feedback-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
  }

  function showGate() {
    /* gateKill1: soft page — mai overlay fullscreen; login solo sui CTA */
    hideGate();
  }

  function kindLabel(kind) {
    return String(kind) === "bug" ? "Problema" : "Idea";
  }

  function statusLabel(st) {
    if (st === "accepted") return "Accettato";
    if (st === "rejected") return "Rifiutato";
    return "In valutazione";
  }

  function formatDate(value) {
    var date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "";
    try {
      return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  function closeModal() {
    state.modalOpen = false;
    state.draftImages = [];
    var root = byId("vc-bot-feedback-edit-modal");
    if (root) {
      root.innerHTML = "";
      root.className = "vc-reviews-modal";
      root.hidden = true;
    }
    try {
      if (typeof window.__vcReleaseModalScrollLock === "function") {
        window.__vcReleaseModalScrollLock({
          htmlClass: "vc-reviews-modal-open",
          datasetKey: "vcReviewsScrollY",
        });
      } else {
        document.documentElement.classList.remove("vc-reviews-modal-open");
        var y = Number(document.documentElement.dataset.vcReviewsScrollY || "0") || 0;
        delete document.documentElement.dataset.vcReviewsScrollY;
        if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
        window.scrollTo(0, y);
        if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(280, y);
      }
    } catch (eUnpin) {}
  }

  function persistBotFeedbackDraft() {
    if (!window.VcFormDrafts) return;
    var ta = byId("vc-bf-content");
    var content = ta ? String(ta.value || "") : "";
    if (!content.trim()) {
      window.VcFormDrafts.clear("bot_feedback:new");
      return;
    }
    window.VcFormDrafts.save(
      "bot_feedback:new",
      {
        content: content,
        kind: state.draftKind === "bug" ? "bug" : "suggestion",
      },
      { notify: true },
    );
  }

  function openModal() {
    var root = byId("vc-bot-feedback-edit-modal");
    if (!root) return;
    state.modalOpen = true;
    state.draftImages = [];
    state.draftKind = "suggestion";
    var saved = window.VcFormDrafts ? window.VcFormDrafts.load("bot_feedback:new") : null;
    var savedContent = "";
    if (saved && typeof saved === "object") {
      if (saved.kind === "bug") state.draftKind = "bug";
      if (typeof saved.content === "string") savedContent = saved.content;
    }
    root.hidden = false;
    root.className = "vc-reviews-modal vc-reviews-modal--open";
    try {
      if (typeof window.__vcArmModalScrollLock === "function") {
        window.__vcArmModalScrollLock({
          htmlClass: "vc-reviews-modal-open",
          datasetKey: "vcReviewsScrollY",
        });
      } else {
        var y =
          window.scrollY ||
          (document.documentElement && document.documentElement.scrollTop) ||
          0;
        document.documentElement.dataset.vcReviewsScrollY = String(y);
        if (typeof window.__vcResetPinnedPageScrollY === "function") {
          window.__vcResetPinnedPageScrollY(y);
        }
        document.documentElement.classList.add("vc-reviews-modal-open");
        if (typeof window.__vcPinPageScroll === "function") {
          window.__vcPinPageScroll({ soft: true, forcePhoneLock: true });
        }
        if (typeof window.__vcHoldPageScroll === "function") {
          window.__vcHoldPageScroll(280, y);
        }
      }
    } catch (ePin) {}
    root.innerHTML =
      '<div class="vc-reviews-modal__backdrop" data-bf-dismiss tabindex="-1"></div>' +
      '<div class="vc-reviews-modal__panel" role="dialog" aria-modal="true" aria-labelledby="vc-bf-modal-title">' +
      '<div class="vc-reviews-modal__toolbar">' +
      '<h2 id="vc-bf-modal-title" class="vc-reviews-modal__title">Nuovo feedback</h2>' +
      '<button type="button" class="vc-reviews-modal__close" data-bf-dismiss aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-reviews-modal__body">' +
      '<div class="vc-reviews-field">' +
      '<span class="vc-bot-feedback-label" id="vc-bf-kind-label">Tipo</span>' +
      '<div class="vc-dash-seg vc-bot-feedback-kind" role="group" aria-labelledby="vc-bf-kind-label">' +
      '<button type="button" class="vc-dash-seg__btn' +
      (state.draftKind === "suggestion" ? " is-active" : "") +
      '" data-bf-kind="suggestion">' +
      '<i class="fa fa-lightbulb-o" aria-hidden="true"></i> Idea</button>' +
      '<button type="button" class="vc-dash-seg__btn' +
      (state.draftKind === "bug" ? " is-active" : "") +
      '" data-bf-kind="bug">' +
      '<i class="fa fa-bug" aria-hidden="true"></i> Problema</button>' +
      "</div></div>" +
      '<div class="vc-reviews-field"><label for="vc-bf-content">Testo (minimo 12 caratteri)</label>' +
      '<textarea id="vc-bf-content" class="vc-reviews-textarea" rows="6" placeholder="Descrivi l’idea o il problema in modo chiaro...">' +
      esc(savedContent) +
      "</textarea></div>" +
      '<div class="vc-reviews-field">' +
      '<span class="vc-bot-feedback-label" id="vc-bf-images-label">Foto <span class="vc-bot-feedback-label__opt">(opzionale, max ' +
      maxImages() +
      ")</span></span>" +
      '<div class="vc-bot-feedback-upload">' +
      '<input type="file" id="vc-bf-images" class="vc-bot-feedback-upload__input" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden />' +
      '<label class="vc-bot-feedback-upload__btn" for="vc-bf-images">' +
      '<i class="fa fa-camera" aria-hidden="true"></i> Aggiungi foto</label>' +
      '<p class="vc-bot-feedback-upload__hint">PNG, JPG, WEBP o GIF</p>' +
      "</div>" +
      '<p id="vc-bf-images-hint" class="vc-bot-feedback-upload__status">Nessuna foto selezionata</p>' +
      '<div id="vc-bf-images-preview" class="vc-bot-feedback-preview" aria-live="polite"></div>' +
      "</div>" +
      '<div class="vc-reviews-formcard__actions">' +
      '<button type="button" class="vc-reviews-submit" id="vc-bf-submit">Invia feedback</button>' +
      "</div></div></div>";

    Array.prototype.slice.call(root.querySelectorAll("[data-bf-dismiss]")).forEach(function (el) {
      el.addEventListener("click", closeModal);
    });
    Array.prototype.slice.call(root.querySelectorAll("[data-bf-kind]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var kind = btn.getAttribute("data-bf-kind") === "bug" ? "bug" : "suggestion";
        state.draftKind = kind;
        Array.prototype.slice.call(root.querySelectorAll("[data-bf-kind]")).forEach(function (b) {
          b.classList.toggle("is-active", b.getAttribute("data-bf-kind") === kind);
        });
        persistBotFeedbackDraft();
      });
    });
    var fileInput = byId("vc-bf-images");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        readSelectedImages(fileInput.files);
        try {
          fileInput.value = "";
        } catch (e0) {}
      });
    }
    var preview = byId("vc-bf-images-preview");
    if (preview) {
      preview.addEventListener("click", function (ev) {
        var t = ev.target;
        var btn = t && t.closest ? t.closest("[data-bf-remove]") : null;
        if (!btn) return;
        var idx = Number(btn.getAttribute("data-bf-remove"));
        if (!isFinite(idx) || idx < 0 || idx >= state.draftImages.length) return;
        state.draftImages.splice(idx, 1);
        renderImagePreview();
      });
    }
    var submit = byId("vc-bf-submit");
    if (submit) submit.addEventListener("click", submitFeedback);
    var ta = byId("vc-bf-content");
    if (ta) {
      ta.addEventListener("input", persistBotFeedbackDraft);
      window.requestAnimationFrame(function () {
        try {
          ta.focus();
        } catch (e1) {}
      });
    }
  }

  function renderImagePreview() {
    var hint = byId("vc-bf-images-hint");
    var preview = byId("vc-bf-images-preview");
    if (preview) {
      preview.innerHTML = "";
      state.draftImages.forEach(function (dataUrl, idx) {
        var fig = document.createElement("figure");
        fig.className = "vc-bot-feedback-preview__item";
        var img = document.createElement("img");
        img.src = dataUrl;
        img.alt = "Anteprima " + (idx + 1);
        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "vc-bot-feedback-preview__remove";
        rm.setAttribute("data-bf-remove", String(idx));
        rm.setAttribute("aria-label", "Rimuovi foto " + (idx + 1));
        rm.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        fig.appendChild(img);
        fig.appendChild(rm);
        preview.appendChild(fig);
      });
    }
    if (hint) {
      hint.textContent = state.draftImages.length
        ? state.draftImages.length + " / " + maxImages() + " foto"
        : "Nessuna foto selezionata";
    }
  }

  function readSelectedImages(fileList) {
    var room = Math.max(0, maxImages() - state.draftImages.length);
    var files = Array.prototype.slice.call(fileList || [])
      .filter(function (f) {
        return f && String(f.type || "").indexOf("image/") === 0;
      })
      .slice(0, room);
    var hint = byId("vc-bf-images-hint");
    if (!files.length) {
      if (hint && !state.draftImages.length) hint.textContent = "Nessuna foto selezionata";
      else if (hint && room <= 0) hint.textContent = "Hai già raggiunto il massimo di " + maxImages() + " foto";
      return;
    }
    if (hint) hint.textContent = "Caricamento anteprime…";
    var pending = files.length;
    files.forEach(function (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = String(reader.result || "");
        if (dataUrl.indexOf("data:image/") === 0 && state.draftImages.length < maxImages()) {
          state.draftImages.push(dataUrl);
        }
        pending -= 1;
        if (pending <= 0) renderImagePreview();
      };
      reader.onerror = function () {
        pending -= 1;
        if (pending <= 0) renderImagePreview();
      };
      reader.readAsDataURL(file);
    });
  }

  function submitFeedback() {
    var token = getToken();
    if (!token) {
      setStatus("Devi effettuare il login con Discord.", true);
      return;
    }
    var ta = byId("vc-bf-content");
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 12) {
      setStatus("Scrivi almeno 12 caratteri.", true);
      return;
    }
    var kind = state.draftKind === "bug" ? "bug" : "suggestion";
    setStatus("Invio in corso…", false, { sticky: true });
    fetch(apiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({
        content: content,
        kind: kind,
        images: state.draftImages.slice(0, maxImages()),
      }),
    })
      .then(parseJson)
      .then(function (body) {
        if (!body || body.ok !== true) throw new Error((body && body.message) || "Invio non riuscito.");
        if (window.VcFormDrafts) window.VcFormDrafts.clear("bot_feedback:new");
        closeModal();
        setStatus(body.message || "Feedback inviato.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore durante l'invio.", true);
      });
  }

  function cardHtml(item) {
    var viewer = state.payload && state.payload.viewer;
    var canMod = Boolean(viewer && viewer.canModerate);
    var isOwner = Boolean(viewer && String(viewer.id) === String(item.userId));
    var pending = String(item.status) === "pending";
    var images = Array.isArray(item.imageUrls) ? item.imageUrls : [];
    var comments = Array.isArray(item.comments) ? item.comments : [];
    var html =
      '<article class="vc-reviews-card" id="vc-bot-feedback-' +
      esc(item.id) +
      '">' +
      '<div class="vc-reviews-card__head">' +
      (item.authorAvatarUrl
        ? '<img class="vc-reviews-card__avatar" src="' + esc(item.authorAvatarUrl) + '" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" />'
        : '<span class="vc-reviews-card__avatar" aria-hidden="true"></span>') +
      '<div class="vc-reviews-card__meta">' +
      '<p class="vc-reviews-card__author">' +
      esc(item.authorName || "Utente") +
      "</p>" +
      '<p class="vc-reviews-card__date">' +
      esc(formatDate(item.createdAt)) +
      " · " +
      esc(kindLabel(item.kind)) +
      " · " +
      esc(statusLabel(item.status)) +
      "</p>" +
      "</div></div>" +
      '<p class="vc-reviews-card__body" style="white-space:pre-wrap">' +
      esc(item.content) +
      "</p>";
    if (images.length) {
      html +=
        '<div class="vc-bot-feedback-images" style="display:flex;flex-wrap:wrap;gap:.5rem;margin:.75rem 0">' +
        images
          .map(function (url) {
            return (
              '<a href="' +
              esc(url) +
              '" target="_blank" rel="noopener noreferrer"><img src="' +
              esc(url) +
              '" alt="Allegato" style="width:96px;height:96px;object-fit:cover;border-radius:.75rem;border:1px solid rgba(255,255,255,.12)" /></a>'
            );
          })
          .join("") +
        "</div>";
    }
    if (item.staffReason) {
      html +=
        '<p class="vc-reviews-card__reply"><strong>Staff:</strong> ' + esc(item.staffReason) + "</p>";
    }
    html +=
      '<div class="vc-reviews-card__actions" style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">' +
      '<button type="button" class="vc-reviews-vote' +
      (item.upvotedByViewer ? " is-on" : "") +
      '" data-bf-vote="' +
      esc(item.id) +
      '" data-dir="up"' +
      (pending ? "" : " disabled") +
      '><i class="fa fa-thumbs-o-up" aria-hidden="true"></i> ' +
      Number(item.upvoteCount || 0) +
      "</button>" +
      '<button type="button" class="vc-reviews-vote' +
      (item.downvotedByViewer ? " is-on" : "") +
      '" data-bf-vote="' +
      esc(item.id) +
      '" data-dir="down"' +
      (pending ? "" : " disabled") +
      '><i class="fa fa-thumbs-o-down" aria-hidden="true"></i> ' +
      Number(item.downvoteCount || 0) +
      "</button>" +
      "</div>";

    if (comments.length) {
      html += '<div class="vc-suggestions-comments" style="margin-top:.75rem">';
      comments.forEach(function (c) {
        html +=
          '<div class="vc-suggestions-comment" style="margin:.4rem 0;padding:.5rem .65rem;border-radius:.75rem;background:rgba(255,255,255,.04)">' +
          "<strong>" +
          esc(c.authorName || "Utente") +
          "</strong>: " +
          esc(c.content) +
          "</div>";
      });
      html += "</div>";
    }

    if (pending && getToken()) {
      html +=
        '<div class="vc-reviews-field" style="margin-top:.75rem"><label for="vc-bf-c-' +
        esc(item.id) +
        '">Commento</label>' +
        '<textarea id="vc-bf-c-' +
        esc(item.id) +
        '" class="vc-reviews-textarea" rows="2" enterkeyhint="send"></textarea>' +
        '<button type="button" class="vc-reviews-submit" style="margin-top:.5rem" data-bf-comment="' +
        esc(item.id) +
        '">Invia commento</button></div>';
    }

    if (canMod) {
      html +=
        '<div class="vc-sug-mod" role="group" aria-label="Azioni High Staff">' +
        '<input id="vc-bf-r-' +
        esc(item.id) +
        '" class="vc-sug-mod__reason" type="text" maxlength="1000" placeholder="Motivo (min. 3)" value="' +
        esc(item.staffReason || "") +
        '" />' +
        '<div class="vc-sug-mod__actions">' +
        '<button type="button" class="vc-sug-mod__btn vc-sug-mod__btn--ok" data-bf-decision="' +
        esc(item.id) +
        '" data-status="accepted">Accetta</button>' +
        '<button type="button" class="vc-sug-mod__btn vc-sug-mod__btn--no" data-bf-decision="' +
        esc(item.id) +
        '" data-status="rejected">Rifiuta</button>' +
        '<button type="button" class="vc-sug-mod__btn" data-bf-decision="' +
        esc(item.id) +
        '" data-status="pending">Valuta</button>' +
        '<button type="button" class="vc-sug-mod__btn vc-sug-mod__btn--del" data-bf-staff-delete="' +
        esc(item.id) +
        '">Elimina</button>' +
        "</div></div>";
    } else if (isOwner && pending) {
      html +=
        '<button type="button" class="vc-reviews-submit vc-suggestions-btn-muted" style="margin-top:.75rem" data-bf-own-delete="' +
        esc(item.id) +
        '">Elimina il mio feedback</button>';
    }

    html += "</article>";
    return html;
  }

  function render() {
    var list = byId("vc-bot-feedback-list");
    var openBtn = byId("vc-bot-feedback-open-form-btn");
    if (!list) return;
    list.removeAttribute("aria-busy");
    if (window.VcListSkeleton && typeof window.VcListSkeleton.clearBusy === "function") {
      window.VcListSkeleton.clearBusy(list);
    }
    var items = state.payload && Array.isArray(state.payload.items) ? state.payload.items : [];
    if (!items.length) {
      list.innerHTML =
        '<div class="vc-reviews-empty"><p class="vc-reviews-empty__title">Nessun feedback</p><p class="vc-reviews-empty__text">Sii il primo a proporre un miglioramento o segnalare un problema.</p></div>';
    } else {
      list.innerHTML = items.map(cardHtml).join("");
    }
    try {
      state.renderFingerprint = JSON.stringify({
        items: (state.payload && state.payload.items) || [],
        viewer: (state.payload && state.payload.viewer) || null,
      });
    } catch (e) {
      state.renderFingerprint = "";
    }
    if (openBtn) openBtn.hidden = !getToken();
    bindListEvents();
  }

  function fetchPayload(opts) {
    var force = Boolean(opts && opts.force);
    var url = apiUrl();
    var list = byId("vc-bot-feedback-list");
    var fetchGen = (state.fetchGen = Number(state.fetchGen || 0) + 1);
    if (list && !state.payload) {
      if (window.VcListSkeleton && typeof window.VcListSkeleton.fill === "function") {
        window.VcListSkeleton.fill(list, { count: 4 });
      } else {
        list.setAttribute("aria-busy", "true");
      }
    }
    function clearFeedbackListFail(msg) {
      var host = byId("vc-bot-feedback-list");
      if (!host) return;
      if (window.VcListSkeleton && typeof window.VcListSkeleton.paintFail === "function") {
        window.VcListSkeleton.paintFail(host, {
          title: "Impossibile caricare i feedback",
          text: msg || "Ricarica la pagina o riprova tra poco.",
        });
      } else {
        host.removeAttribute("aria-busy");
        host.innerHTML =
          '<div class="vc-reviews-empty"><p class="vc-reviews-empty__title">Impossibile caricare i feedback</p><p class="vc-reviews-empty__text">' +
          String(msg || "Ricarica la pagina o riprova tra poco.") +
          "</p></div>";
      }
    }
    function applyBody(body) {
      if (!body || body.ok !== true) throw new Error((body && body.message) || "Caricamento non riuscito.");
      var fp = "";
      try {
        fp = JSON.stringify({ items: body.items || [], viewer: body.viewer || null });
      } catch (e) {
        fp = "";
      }
      if (!force && fp && fp === state.renderFingerprint && !state.modalOpen) {
        state.payload = body;
        if (list && window.VcListSkeleton && typeof window.VcListSkeleton.clearBusy === "function") {
          window.VcListSkeleton.clearBusy(list);
        } else if (list) {
          list.removeAttribute("aria-busy");
        }
        if (list && list.querySelector(".vc-list-skel")) render();
        return;
      }
      state.payload = body;
      render();
    }
    /* feedbackNotifColdOpen1: soft first-load retries (push/cold open). */
    function isSoftLoadErr(err, body) {
      var code = body && body.error ? String(body.error) : err && err.code ? String(err.code) : "";
      if (
        code === "timeout" ||
        code === "network_error" ||
        code === "invalid_json" ||
        code === "empty_body" ||
        code === "rate_limited" ||
        code === "rate_limited_client"
      ) {
        return true;
      }
      var msg = err && err.message ? String(err.message) : "";
      if (/timeout|connessione|instabile|troppe|network|rate.?limit|caricamento non riuscito/i.test(msg)) return true;
      if (!state.payload && /impossibile caricare/i.test(msg)) return true;
      return false;
    }
    function failOrRetry(err, attempt) {
      if (fetchGen !== state.fetchGen) return null;
      var delays = [500, 1200, 2400];
      if (isSoftLoadErr(err, err && err.body) && attempt < delays.length) {
        if (list && !state.payload) {
          if (window.VcListSkeleton && typeof window.VcListSkeleton.fill === "function") {
            window.VcListSkeleton.fill(list, { count: 4 });
          }
        }
        return new Promise(function (resolve) {
          window.setTimeout(function () {
            if (fetchGen !== state.fetchGen) {
              resolve(null);
              return;
            }
            resolve(doFetch(attempt + 1));
          }, delays[attempt]);
        });
      }
      return onFail(err);
    }
    function onFail(err) {
      if (state.payload) {
        if (list && list.querySelector(".vc-list-skel")) render();
        return state.payload;
      }
      clearFeedbackListFail(err && err.message ? err.message : "Caricamento non riuscito.");
      setStatus(err && err.message ? err.message : "Impossibile caricare i feedback.", true);
      return null;
    }
    function doFetch(attempt) {
      attempt = Math.max(0, Math.floor(Number(attempt) || 0));
      var retried = attempt > 0;
      if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
        var token = getToken();
        var cacheKey = window.VcApiCache.keyFor(url, { scope: "feedback", auth: token, v: "feedbackNotifColdOpen1" });
        if (force || retried) {
          try {
            window.VcApiCache.invalidate(cacheKey);
            if (typeof window.VcApiCache.clearWebhookBlock === "function") {
              window.VcApiCache.clearWebhookBlock(url);
            }
          } catch (eInvBf) {}
        }
        return window.VcApiCache
          .fetchWithCache(cacheKey, url, {
            ttlMs: 25000,
            staleMs: 120000,
            timeoutMs: 24000,
            useCache: !(force || retried),
            forceNetwork: force || retried,
            fetchInit: { method: "GET", headers: authHeaders(), cache: "no-store" },
          })
          .then(function (payload) {
            if (fetchGen !== state.fetchGen) return null;
            var body = payload && payload.body ? payload.body : null;
            if (!body || body.ok !== true) {
              var softErr = new Error((body && (body.message || body.error)) || "Caricamento non riuscito.");
              softErr.code = body && body.error ? String(body.error) : "";
              softErr.body = body;
              softErr.soft = isSoftLoadErr(softErr, body);
              throw softErr;
            }
            applyBody(body);
            return body;
          })
          .catch(function (err) {
            return failOrRetry(err, attempt);
          });
      }
      return fetch(url, { method: "GET", headers: authHeaders(), cache: "no-store" })
        .then(parseJson)
        .then(function (body) {
          if (fetchGen !== state.fetchGen) return null;
          applyBody(body);
          return body;
        })
        .catch(function (err) {
          return failOrRetry(err, attempt);
        });
    }
    return doFetch(0);
  }

  function startPoll() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    var ms = Number(cfg().livePollMs);
    if (!Number.isFinite(ms) || ms < 3000) ms = 6000;
    state.pollTimer = setInterval(function () {
      if (document.visibilityState === "hidden" || state.modalOpen) return;
      fetchPayload().catch(function () {});
    }, ms);
  }

  function bindListEvents() {
    Array.prototype.slice.call(document.querySelectorAll("[data-bf-vote]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-bf-vote");
        var dir = btn.getAttribute("data-dir");
        var token = getToken();
        if (!token) return setStatus("Accedi per votare.", true);
        if (btn.disabled) return;
        btn.disabled = true;
        fetch(apiUrl() + "/" + encodeURIComponent(id) + "/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ direction: dir }),
        })
          .then(parseJson)
          .then(function (body) {
            if (!body || body.ok !== true) throw new Error((body && body.message) || "Voto non riuscito.");
            /* voteStaleFix1 */
            try {
              if (window.VcApiCache) {
                var cacheKey = window.VcApiCache.keyFor(apiUrl(), { scope: "feedback", auth: token });
                window.VcApiCache.invalidate(cacheKey);
                if (typeof window.VcApiCache.clearWebhookBlock === "function") {
                  window.VcApiCache.clearWebhookBlock(apiUrl());
                }
              }
            } catch (eInvB) {}
            if (body.item && state.payload && Array.isArray(state.payload.items)) {
              var list = state.payload.items;
              for (var i = 0; i < list.length; i += 1) {
                if (String((list[i] && list[i].id) || "") === String(id)) {
                  list[i] = Object.assign({}, list[i], body.item);
                  break;
                }
              }
              /* voteLikeStale1 */
              state.fetchGen = Number(state.fetchGen || 0) + 1;
              render();
              return;
            }
            return fetchPayload({ force: true });
          })
          .catch(function (err) {
            setStatus(err.message || "Errore voto.", true);
          })
          .then(function () {
            btn.disabled = false;
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-bf-comment]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-bf-comment");
        var ta = byId("vc-bf-c-" + id);
        var content = ta ? String(ta.value || "").trim() : "";
        var token = getToken();
        if (!token) return setStatus("Accedi per commentare.", true);
        if (content.length < 2) return setStatus("Commento troppo breve.", true);
        fetch(apiUrl() + "/" + encodeURIComponent(id) + "/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ content: content }),
        })
          .then(parseJson)
          .then(function (body) {
            if (!body || body.ok !== true) throw new Error((body && body.message) || "Commento non riuscito.");
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err.message || "Errore commento.", true);
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-bf-decision]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-bf-decision");
        var status = btn.getAttribute("data-status");
        var ta = byId("vc-bf-r-" + id);
        var reason = ta ? String(ta.value || "").trim() : "";
        var token = getToken();
        if (!token) return;
        fetch(apiUrl() + "/" + encodeURIComponent(id) + "/decision", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
          body: JSON.stringify({ status: status, reason: reason }),
        })
          .then(parseJson)
          .then(function (body) {
            if (!body || body.ok !== true) throw new Error((body && body.message) || "Aggiornamento non riuscito.");
            setStatus(body.message || "Aggiornato.", false);
            return fetchPayload();
          })
          .catch(function (err) {
            setStatus(err.message || "Errore decisione.", true);
          });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-bf-staff-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-bf-staff-delete");
        var token = getToken();
        var run = function () {
          fetch(apiUrl() + "/" + encodeURIComponent(id) + "/delete", {
            method: "POST",
            headers: authHeaders(),
          })
            .then(parseJson)
            .then(function (body) {
              if (!body || body.ok !== true) throw new Error((body && body.message) || "Eliminazione non riuscita.");
              return fetchPayload();
            })
            .catch(function (err) {
              setStatus(err.message || "Errore eliminazione.", true);
            });
        };
        var confirmP = (typeof window.__vcEnsureDialog === "function"
          ? window.__vcEnsureDialog()
          : Promise.resolve(window.VcDialog)
        ).then(function (D) {
          if (!D || typeof D.confirm !== "function") return false;
          return D.confirm({
              title: "Eliminare il feedback?",
              message: "Eliminare definitivamente questo feedback?",
              confirmLabel: "Elimina",
              cancelLabel: "Annulla",
              danger: true,
              icon: "fa-trash-o",
            });
        });
        confirmP.then(function (ok) {
          if (ok) run();
        });
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-bf-own-delete]")).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-bf-own-delete");
        var token = getToken();
        var run = function () {
          fetch(apiUrl() + "/" + encodeURIComponent(id), {
            method: "DELETE",
            headers: authHeaders(),
          })
            .then(parseJson)
            .then(function (body) {
              if (!body || body.ok !== true) throw new Error((body && body.message) || "Eliminazione non riuscita.");
              return fetchPayload();
            })
            .catch(function (err) {
              setStatus(err.message || "Errore eliminazione.", true);
            });
        };
        var confirmP = (typeof window.__vcEnsureDialog === "function"
          ? window.__vcEnsureDialog()
          : Promise.resolve(window.VcDialog)
        ).then(function (D) {
          if (!D || typeof D.confirm !== "function") return false;
          return D.confirm({
              title: "Eliminare il feedback?",
              message: "Eliminare il tuo feedback?",
              confirmLabel: "Elimina",
              cancelLabel: "Annulla",
              danger: true,
              icon: "fa-trash-o",
            });
        });
        confirmP.then(function (ok) {
          if (ok) run();
        });
      });
    });
  }

  function main() {
    var gateBtn = byId("vc-bot-feedback-gate-login-cta");
    var headerBtn = byId("discord-login-btn");
    if (gateBtn) {
      gateBtn.addEventListener("click", function () {
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(gateBtn);
          return;
        }
        if (headerBtn) headerBtn.click();
      });
    }
    var openBtn = byId("vc-bot-feedback-open-form-btn");
    if (openBtn) openBtn.addEventListener("click", openModal);

    if (getToken()) {
      hideGate();
      fetchPayload()
        .then(startPoll)
        .catch(function (err) {
          setStatus(err.message || "Impossibile caricare i feedback.", true);
        });
    } else {
      showGate();
      state.payload = null;
      var list = byId("vc-bot-feedback-list");
      if (list && window.VcListSkeleton && typeof window.VcListSkeleton.paintFail === "function") {
        window.VcListSkeleton.paintFail(list, {
          title: "Accedi per i feedback",
          text: "Collega Discord per leggere e scrivere feedback.",
        });
      } else if (list) {
        list.removeAttribute("aria-busy");
        list.innerHTML = "";
      }
    }
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      hideGate();
      fetchPayload().then(startPoll).catch(function () {});
      return;
    }
    showGate();
    state.payload = null;
    render();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!byId("vc-bot-feedback-list")) return;
    if (state.payload) return;
    if (!getToken()) return;
    fetchPayload({ force: true }).then(startPoll).catch(function () {});
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
