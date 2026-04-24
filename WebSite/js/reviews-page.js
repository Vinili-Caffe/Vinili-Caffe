(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var state = {
    payload: null,
    draft: {
      server: { rating: 5, content: "" },
      staff: { staffUserId: "", rating: 5, content: "" },
    },
  };

  function byId(id) {
    return document.getElementById(id);
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

  function reviewCardMarkup(review, kind) {
    var target = kind === "staff" ? String(review.staffName || "Staff") : "Server";
    return (
      '<article class="vc-reviews-card">' +
      '<div class="vc-reviews-card__head">' +
      '<div class="vc-reviews-card__author">' +
      (review.authorAvatarUrl
        ? '<img class="vc-reviews-card__avatar" src="' + esc(review.authorAvatarUrl) + '" alt="" loading="lazy" decoding="async" />'
        : '<span class="vc-reviews-card__avatar vc-reviews-card__avatar--fallback"><i class="fa fa-user"></i></span>') +
      '<div><strong>' + esc(review.authorName || "Utente") + "</strong>" +
      '<span>' + esc(formatDateIt(review.updatedAt || review.createdAt)) + "</span></div></div>" +
      '<span class="vc-reviews-card__stars">' + starsMarkup(review.rating) + "</span></div>" +
      (kind === "staff"
        ? '<div class="vc-reviews-card__target"><i class="fa fa-shield" aria-hidden="true"></i> Staff recensito: <strong>' + esc(target) + "</strong></div>"
        : "") +
      '<p class="vc-reviews-card__text">' + esc(review.content) + "</p>" +
      "</article>"
    );
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

  function findStaffDraftReview() {
    var staffId = String(state.draft.staff.staffUserId || "");
    var viewer = state.payload && state.payload.viewer;
    var list = Array.isArray(viewer && viewer.staffReviews) ? viewer.staffReviews : [];
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].staffUserId || "") === staffId) return list[i];
    }
    return null;
  }

  function syncDraftFromPayload() {
    var viewer = state.payload && state.payload.viewer;
    var serverReview = viewer && viewer.serverReview ? viewer.serverReview : null;
    if (serverReview) {
      state.draft.server.rating = Math.max(1, Math.min(5, Math.round(Number(serverReview.rating) || 5)));
      state.draft.server.content = String(serverReview.content || "");
    }
    var staffers = Array.isArray(state.payload && state.payload.staffers) ? state.payload.staffers : [];
    if (!state.draft.staff.staffUserId && staffers.length) {
      state.draft.staff.staffUserId = String(staffers[0].id || "");
    }
    var existingStaff = findStaffDraftReview();
    if (existingStaff) {
      state.draft.staff.rating = Math.max(1, Math.min(5, Math.round(Number(existingStaff.rating) || 5)));
      state.draft.staff.content = String(existingStaff.content || "");
    }
  }

  function formsMarkup() {
    var viewer = state.payload && state.payload.viewer;
    var isLogged = Boolean(viewer && viewer.id);
    var serverExisting = viewer && viewer.serverReview ? viewer.serverReview : null;
    var staffers = Array.isArray(state.payload && state.payload.staffers) ? state.payload.staffers : [];
    var existingStaff = findStaffDraftReview();

    return (
      '<article class="vc-reviews-formcard">' +
      '<div class="vc-reviews-formcard__head"><span class="vc-reviews-formcard__icon"><i class="fa fa-globe" aria-hidden="true"></i></span><div><strong>' +
      esc(serverExisting ? "Modifica la tua recensione server" : "Recensisci il server") +
      '</strong></div></div>' +
      '<div class="vc-reviews-field"><label for="vc-review-server-target">Oggetto</label><select id="vc-review-server-target" class="vc-reviews-select vc-reviews-select--static" disabled><option>Server</option></select></div>' +
      '<div class="vc-reviews-field"><label>Valutazione</label>' + ratingInputMarkup("server", state.draft.server.rating) + "</div>" +
      '<div class="vc-reviews-field"><label for="vc-review-server-content">Recensione</label><textarea id="vc-review-server-content" class="vc-reviews-textarea" rows="6" placeholder="Scrivi cosa ti piace del server, dell&apos;ambiente o delle attività...">' +
      esc(state.draft.server.content) +
      '</textarea></div><button type="button" class="vc-reviews-submit" data-review-submit="server"' +
      (isLogged ? "" : " disabled") +
      ">" +
      (serverExisting ? "Aggiorna recensione server" : "Invia recensione server") +
      "</button></article>" +
      '<article class="vc-reviews-formcard">' +
      '<div class="vc-reviews-formcard__head"><span class="vc-reviews-formcard__icon vc-reviews-formcard__icon--staff"><i class="fa fa-shield" aria-hidden="true"></i></span><div><strong>Recensisci uno staffer</strong></div></div>' +
      '<div class="vc-reviews-field"><label for="vc-review-staff-target">Staffer</label><select id="vc-review-staff-target" class="vc-reviews-select vc-reviews-select--staff"' +
      (staffers.length ? "" : " disabled") +
      ">" +
      (staffers.length
        ? staffers
            .map(function (staffer) {
              return '<option value="' + esc(staffer.id) + '"' + (String(staffer.id) === String(state.draft.staff.staffUserId) ? " selected" : "") + ">" + esc(staffer.name) + "</option>";
            })
            .join("")
        : '<option value="">Nessuno staffer disponibile</option>') +
      '</select></div>' +
      (existingStaff
        ? '<p class="vc-reviews-helper">Stai modificando la tua recensione per <strong>' + esc(existingStaff.staffName || "") + "</strong>.</p>"
        : "") +
      '<div class="vc-reviews-field"><label>Valutazione</label>' + ratingInputMarkup("staff", state.draft.staff.rating) + "</div>" +
      '<div class="vc-reviews-field"><label for="vc-review-staff-content">Recensione</label><textarea id="vc-review-staff-content" class="vc-reviews-textarea" rows="6" placeholder="Scrivi un feedback sul supporto, sulla disponibilità o sulla qualità dello staffer...">' +
      esc(state.draft.staff.content) +
      '</textarea></div><button type="button" class="vc-reviews-submit vc-reviews-submit--staff" data-review-submit="staff"' +
      (isLogged && staffers.length ? "" : " disabled") +
      ">" +
      (existingStaff ? "Aggiorna recensione staff" : "Invia recensione staff") +
      "</button></article>"
    );
  }

  function render() {
    var payload = state.payload || { reviews: { server: [], staff: [] }, staffers: [], viewer: null };
    var serverWrap = byId("vc-reviews-server-list");
    var staffWrap = byId("vc-reviews-staff-list");
    var formsWrap = byId("vc-reviews-forms");
    var authHint = byId("vc-reviews-auth-hint");
    if (!serverWrap || !staffWrap || !formsWrap) return;

    var serverReviews = Array.isArray(payload.reviews && payload.reviews.server) ? payload.reviews.server : [];
    var staffReviews = Array.isArray(payload.reviews && payload.reviews.staff) ? payload.reviews.staff : [];
    serverWrap.innerHTML = serverReviews.length
      ? serverReviews.map(function (review) { return reviewCardMarkup(review, "server"); }).join("")
      : emptyMarkup("fa-commenting-o", "Ancora nessuna recensione server", "Sarai tu a inaugurare questa sezione.");
    staffWrap.innerHTML = staffReviews.length
      ? staffReviews.map(function (review) { return reviewCardMarkup(review, "staff"); }).join("")
      : emptyMarkup("fa-shield", "Nessuna recensione staff", "Quando arriveranno feedback sugli staffer compariranno qui.");
    formsWrap.innerHTML = formsMarkup();
    authHint.textContent = payload.viewer && payload.viewer.id
      ? "Puoi modificare le tue recensioni quando vuoi."
      : "Accedi con Discord per inviare o modificare la tua recensione.";
    bind();
  }

  function bind() {
    var serverTextarea = byId("vc-review-server-content");
    var staffTextarea = byId("vc-review-staff-content");
    var staffSelect = byId("vc-review-staff-target");

    if (serverTextarea) {
      serverTextarea.addEventListener("input", function () {
        state.draft.server.content = serverTextarea.value;
      });
    }
    if (staffTextarea) {
      staffTextarea.addEventListener("input", function () {
        state.draft.staff.content = staffTextarea.value;
      });
    }
    if (staffSelect) {
      staffSelect.addEventListener("change", function () {
        state.draft.staff.staffUserId = String(staffSelect.value || "");
        var existing = findStaffDraftReview();
        state.draft.staff.rating = existing ? existing.rating : 5;
        state.draft.staff.content = existing ? String(existing.content || "") : "";
        render();
      });
    }

    Array.prototype.slice.call(document.querySelectorAll("[data-review-set-rating]")).forEach(function (button) {
      button.addEventListener("click", function () {
        var kind = String(button.getAttribute("data-review-set-rating") || "");
        var value = Math.max(1, Math.min(5, Math.round(Number(button.getAttribute("data-rating-value") || 0) || 0)));
        if (kind === "staff") state.draft.staff.rating = value;
        else state.draft.server.rating = value;
        render();
      });
    });

    Array.prototype.slice.call(document.querySelectorAll("[data-review-submit]")).forEach(function (button) {
      button.addEventListener("click", function () {
        submitReview(String(button.getAttribute("data-review-submit") || ""));
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

  function submitReview(kind) {
    var token = getToken();
    if (!token) {
      setStatus("Devi effettuare il login con Discord per inviare una recensione.", true);
      return;
    }
    var payload =
      kind === "staff"
        ? {
            kind: "staff",
            staffUserId: state.draft.staff.staffUserId,
            rating: state.draft.staff.rating,
            content: state.draft.staff.content,
          }
        : {
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

  function main() {
    fetchPayload();
  }

  window.addEventListener("vc-discord-profile", function () {
    fetchPayload();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();