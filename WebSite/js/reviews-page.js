(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var state = {
    payload: null,
    replyOpenId: null,
    draft: {
      server: { rating: 5, content: "" },
    },
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function getDiscordUserSync() {
    var u = typeof window !== "undefined" ? window.__VC_DISCORD_PROFILE : null;
    if (!u || typeof u !== "object") return null;
    if (u.id || u.username) return u;
    return null;
  }

  function hideReviewsGate() {
    var g = byId("vc-reviews-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "true");
  }

  function showReviewsLoginGate() {
    var g = byId("vc-reviews-gate");
    if (!g) return;
    g.removeAttribute("hidden");
    g.classList.remove("vc-reviews-gate--dismissed");
    g.setAttribute("aria-hidden", "false");
  }

  function wireGateLoginCta() {
    var gateBtn = byId("vc-reviews-gate-login-cta");
    var headerBtn = byId("discord-login-btn");
    if (gateBtn && headerBtn) {
      gateBtn.addEventListener("click", function () {
        headerBtn.click();
      });
    }
  }

  function clearReviewsContent() {
    state.payload = null;
    state.replyOpenId = null;
    var serverWrap = byId("vc-reviews-server-list");
    var formsWrap = byId("vc-reviews-forms");
    if (serverWrap) serverWrap.innerHTML = "";
    if (formsWrap) formsWrap.innerHTML = "";
  }

  function shouldUnlockReviewsPage() {
    return Boolean(getDiscordUserSync());
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_REVIEWS) || {};
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
    if ((host === "localhost" || host === "127.0.0.1") && local) return local;
    return remote || local;
  }

  function starsMarkup(value) {
    var safe = Math.max(1, Math.min(5, Math.round(Number(value) || 0)));
    var out = "";
    for (var i = 1; i <= 5; i += 1) {
      out += '<i class="fa ' + (i <= safe ? "fa-star" : "fa-star-o") + '" aria-hidden="true"></i>';
    }
    return out;
  }

  function formatDateIt(value) {
    var date = value ? new Date(value) : null;
    if (!date || !Number.isFinite(date.getTime())) return "";
    try {
      return date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch (e) {
      return date.toISOString().slice(0, 10);
    }
  }

  function setStatus(text, isError) {
    var node = byId("vc-reviews-status");
    if (!node) return;
    if (!text) {
      node.hidden = true;
      node.textContent = "";
      node.className = "vc-reviews-status";
      return;
    }
    node.hidden = false;
    node.textContent = text;
    node.className = "vc-reviews-status" + (isError ? " is-error" : "");
  }

  function reviewCardMarkup(review) {
    var viewer = state.payload && state.payload.viewer;
    var tokenOk = Boolean(getToken());
    var canReply = Boolean(viewer && viewer.canReplyAsServer);
    var likeCount = Math.max(0, Math.round(Number(review.likeCount || 0)));
    var liked = Boolean(review.likedByViewer);
    var sr = review.serverReply && review.serverReply.content ? review.serverReply : null;
    var rid = esc(review.id);
    var out =
      '<article class="vc-reviews-card" data-review-id="' +
      rid +
      '">' +
      '<div class="vc-reviews-card__head">' +
      '<div class="vc-reviews-card__author">' +
      (review.authorAvatarUrl
        ? '<img class="vc-reviews-card__avatar" src="' + esc(review.authorAvatarUrl) + '" alt="" loading="lazy" decoding="async" />'
        : '<span class="vc-reviews-card__avatar vc-reviews-card__avatar--fallback"><i class="fa fa-user"></i></span>') +
      '<div><strong>' +
      esc(review.authorName || "Utente") +
      "</strong>" +
      '<span>' +
      esc(formatDateIt(review.updatedAt || review.createdAt)) +
      "</span></div></div>" +
      '<span class="vc-reviews-card__stars">' +
      starsMarkup(review.rating) +
      "</span></div>" +
      '<p class="vc-reviews-card__text">' +
      esc(review.content) +
      "</p>";
    if (sr) {
      out +=
        '<div class="vc-reviews-card__reply">' +
        '<span class="vc-reviews-card__reply-label">Risposta del server</span>' +
        '<p class="vc-reviews-card__reply-text">' +
        esc(sr.content) +
        "</p>" +
        (sr.updatedAt
          ? '<span class="vc-reviews-card__reply-meta">' + esc(formatDateIt(sr.updatedAt)) + "</span>"
          : "") +
        "</div>";
    }
    out +=
      '<div class="vc-reviews-card__foot">' +
      '<button type="button" class="vc-reviews-like' +
      (liked ? " is-liked" : "") +
      '" data-review-like="' +
      rid +
      '"' +
      (tokenOk ? "" : ' disabled title="Accedi con Discord per mettere like"') +
      '><i class="fa ' +
      (liked ? "fa-heart" : "fa-heart-o") +
      '" aria-hidden="true"></i><span class="vc-reviews-like__n">' +
      esc(String(likeCount)) +
      "</span></button>";
    if (canReply) {
      out +=
        '<button type="button" class="vc-reviews-reply-toggle" data-review-reply-toggle="' +
        rid +
        '"><i class="fa fa-reply" aria-hidden="true"></i> Rispondi</button>';
    }
    out += "</div>";
    if (state.replyOpenId === review.id && canReply) {
      out +=
        '<div class="vc-reviews-reply-form">' +
        '<label class="vc-reviews-reply-form__label" for="vc-reviews-reply-' +
        rid +
        '">Messaggio ufficiale (visibile a tutti)</label>' +
        '<textarea id="vc-reviews-reply-' +
        rid +
        '" class="vc-reviews-textarea vc-reviews-reply-form__ta" rows="3" placeholder="Rispondi a nome del server...">' +
        esc(sr ? sr.content : "") +
        "</textarea>" +
        '<div class="vc-reviews-reply-form__actions"><button type="button" class="vc-reviews-submit" data-review-reply-submit="' +
        rid +
        '">Pubblica risposta</button></div></div>';
    }
    out += "</article>";
    return out;
  }

  function emptyMarkup(icon, title, text) {
    return (
      '<article class="vc-reviews-empty">' +
      '<span class="vc-reviews-empty__icon"><i class="fa ' + esc(icon) + '" aria-hidden="true"></i></span>' +
      "<strong>" + esc(title) + "</strong>" +
      "<p>" + esc(text) + "</p>" +
      "</article>"
    );
  }

  function ratingInputMarkup(kind, rating) {
    var out = '<div class="vc-reviews-rating" data-review-rating="' + esc(kind) + '">';
    for (var i = 1; i <= 5; i += 1) {
      out +=
        '<button type="button" class="vc-reviews-rating__btn' +
        (i <= rating ? " is-active" : "") +
        '" data-review-set-rating="' +
        esc(kind) +
        '" data-rating-value="' +
        esc(String(i)) +
        '">' +
        '<i class="fa ' +
        (i <= rating ? "fa-star" : "fa-star-o") +
        '" aria-hidden="true"></i><span>' +
        esc(String(i)) +
        "</span></button>";
    }
    return out + "</div>";
  }

  function syncDraftFromPayload() {
    var viewer = state.payload && state.payload.viewer;
    var serverReview = viewer && viewer.serverReview ? viewer.serverReview : null;
    if (serverReview) {
      state.draft.server.rating = Math.max(1, Math.min(5, Math.round(Number(serverReview.rating) || 5)));
      state.draft.server.content = String(serverReview.content || "");
    }
  }

  function formsMarkup() {
    var viewer = state.payload && state.payload.viewer;
    var isLogged = Boolean(viewer && viewer.id);
    var serverExisting = viewer && viewer.serverReview ? viewer.serverReview : null;

    return (
      '<article class="vc-reviews-formcard">' +
      '<div class="vc-reviews-formcard__head"><span class="vc-reviews-formcard__icon"><i class="fa fa-globe" aria-hidden="true"></i></span><div><strong>' +
      esc(serverExisting ? "Modifica la tua recensione" : "Recensisci il server") +
      '</strong></div></div>' +
      '<div class="vc-reviews-field"><label>Valutazione</label>' + ratingInputMarkup("server", state.draft.server.rating) + "</div>" +
      '<div class="vc-reviews-field"><label for="vc-review-server-content">Recensione</label><textarea id="vc-review-server-content" class="vc-reviews-textarea" rows="4" placeholder="Scrivi cosa ti piace del server, dell&apos;ambiente o delle attività...">' +
      esc(state.draft.server.content) +
      '</textarea></div><div class="vc-reviews-formcard__actions"><button type="button" class="vc-reviews-submit" data-review-submit="server"' +
      (isLogged ? "" : " disabled") +
      ">" +
      (serverExisting ? "Aggiorna recensione" : "Invia recensione") +
      "</button>" +
      (isLogged && serverExisting && serverExisting.id
        ? '<button type="button" class="vc-reviews-submit vc-reviews-delete" data-review-delete="' + esc(serverExisting.id) + '">Elimina recensione</button>'
        : "") +
      "</div></article>"
    );
  }

  function render() {
    var payload = state.payload || { reviews: { server: [], staff: [] }, staffers: [], viewer: null };
    var serverWrap = byId("vc-reviews-server-list");
    var formsWrap = byId("vc-reviews-forms");
    if (!serverWrap || !formsWrap) return;

    var serverReviews = Array.isArray(payload.reviews && payload.reviews.server) ? payload.reviews.server : [];
    serverWrap.innerHTML = serverReviews.length
      ? serverReviews.map(function (review) { return reviewCardMarkup(review); }).join("")
      : emptyMarkup("fa-commenting-o", "Ancora nessuna recensione", "Sarai tu a inaugurare questa sezione.");
    formsWrap.innerHTML = formsMarkup();
    bind();
  }

  function bind() {
    var serverTextarea = byId("vc-review-server-content");

    if (serverTextarea) {
      serverTextarea.addEventListener("input", function () {
        state.draft.server.content = serverTextarea.value;
      });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-review-set-rating]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var value = Math.max(1, Math.min(5, Math.round(Number(button.getAttribute("data-rating-value") || 0) || 0)));
        state.draft.server.rating = value;
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-review-submit]")).forEach(function (button) {
      button.addEventListener("click", function () {
        submitReview();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-review-delete]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var reviewId = String(button.getAttribute("data-review-delete") || "").trim();
        if (!reviewId) return;
        deleteReview(reviewId);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-review-like]")).forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.disabled) return;
        var reviewId = String(button.getAttribute("data-review-like") || "").trim();
        if (!reviewId) return;
        toggleReviewLike(reviewId, button);
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-review-reply-toggle]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var reviewId = String(button.getAttribute("data-review-reply-toggle") || "").trim();
        if (!reviewId) return;
        state.replyOpenId = state.replyOpenId === reviewId ? null : reviewId;
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-review-reply-submit]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var reviewId = String(button.getAttribute("data-review-reply-submit") || "").trim();
        if (!reviewId) return;
        submitServerReply(reviewId, button);
      });
    });
  }

  function authHeaders() {
    var token = getToken();
    return token ? { Authorization: "Bearer " + token } : {};
  }

  function fetchPayload() {
    setStatus("", false);
    return fetch(apiUrl(), {
      method: "GET",
      headers: authHeaders(),
      cache: "no-store",
    })
      .then(function (response) { return response.json(); })
      .then(function (body) {
        if (!body || body.ok !== true) throw new Error((body && body.message) || "Impossibile caricare le recensioni.");
        state.payload = body;
        syncDraftFromPayload();
        render();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Impossibile caricare le recensioni.", true);
      });
  }

  function submitReview() {
    var token = getToken();
    if (!token) {
      setStatus("Devi effettuare il login con Discord per inviare una recensione.", true);
      return;
    }
    var payload = {
      kind: "server",
      rating: state.draft.server.rating,
      content: state.draft.server.content,
    };
    setStatus("Invio recensione in corso...", false);
    fetch(apiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(payload),
    })
      .then(function (response) { return response.json(); })
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Non sono riuscito a salvare la recensione.");
        }
        setStatus(body.message || "Recensione salvata.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore durante il salvataggio.", true);
      });
  }

  function toggleReviewLike(reviewId, buttonEl) {
    var token = getToken();
    if (!token) {
      setStatus("Accedi con Discord per mettere like.", true);
      return;
    }
    if (buttonEl) buttonEl.disabled = true;
    setStatus("", false);
    fetch(apiUrl() + "/" + encodeURIComponent(reviewId) + "/like", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
      },
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Operazione like non riuscita.");
        }
        setStatus(body.message || "Ok.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore like.", true);
      })
      .then(function () {
        if (buttonEl) buttonEl.disabled = false;
      });
  }

  function submitServerReply(reviewId, buttonEl) {
    var token = getToken();
    if (!token) {
      setStatus("Sessione Discord richiesta.", true);
      return;
    }
    var ta = byId("vc-reviews-reply-" + reviewId);
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 8) {
      setStatus("La risposta deve avere almeno 8 caratteri.", true);
      return;
    }
    if (buttonEl) buttonEl.disabled = true;
    setStatus("Pubblicazione risposta...", false);
    fetch(apiUrl() + "/" + encodeURIComponent(reviewId) + "/server-reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify({ content: content }),
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Impossibile pubblicare la risposta.");
        }
        state.replyOpenId = null;
        setStatus(body.message || "Risposta pubblicata.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore risposta.", true);
      })
      .then(function () {
        if (buttonEl) buttonEl.disabled = false;
      });
  }

  function deleteReview(reviewId) {
    var token = getToken();
    if (!token) {
      setStatus("Devi effettuare il login con Discord per eliminare una recensione.", true);
      return;
    }
    if (!window.confirm("Vuoi davvero eliminare la tua recensione?")) return;
    setStatus("Eliminazione recensione in corso...", false);
    fetch(apiUrl() + "/" + encodeURIComponent(reviewId), {
      method: "DELETE",
      headers: {
        Authorization: "Bearer " + token,
      },
    })
      .then(function (response) { return response.json(); })
      .then(function (body) {
        if (!body || body.ok !== true) {
          throw new Error((body && body.message) || "Non sono riuscito a eliminare la recensione.");
        }
        setStatus(body.message || "Recensione eliminata.", false);
        return fetchPayload();
      })
      .catch(function (err) {
        setStatus(err && err.message ? err.message : "Errore durante l'eliminazione.", true);
      });
  }

  function main() {
    wireGateLoginCta();
    if (shouldUnlockReviewsPage()) {
      hideReviewsGate();
      fetchPayload();
      return;
    }
    if (!getToken()) {
      showReviewsLoginGate();
      return;
    }
    hideReviewsGate();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      hideReviewsGate();
      fetchPayload();
      return;
    }
    clearReviewsContent();
    showReviewsLoginGate();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();