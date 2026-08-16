(function () {
  "use strict";

  var state = { busy: false, preview: null, confirmToken: "" };

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

  function i18n(key, fallback, vars) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var out = window.VcI18n.t(key, vars);
        if (out && out !== key) return out;
      }
    } catch (e0) {}
    var text = fallback || key;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach(function (k) {
        text = String(text).split("{" + k + "}").join(String(vars[k]));
      });
    }
    return text;
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e1) {
      return "";
    }
  }

  function apiBase() {
    var d = window.__VC_SITE_DASHBOARD || {};
    var local = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String(local && d.apiUrlLocal ? d.apiUrlLocal : d.apiUrl || "").trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function setStatus(msg, isError, opts) {
    var el = byId("vc-gdpr-status");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error", "is-ok");
      return;
    }
    el.hidden = false;
    el.textContent = msg;
    el.classList.toggle("is-error", Boolean(isError));
    el.classList.toggle("is-ok", Boolean(opts && opts.ok) && !isError);
  }

  var COUNT_LABELS = {
    guildReposts: "Repost pubblicati",
    hogwartsJsonlRows: "Registri evento Hogwarts",
    hogwartsJsonRows: "Registri evento Hogwarts",
    activityUserProfiles: "Profili attività",
    siteDocuments: "Documenti e richieste sul sito",
    userLeaveBackups: "Backup uscita dal server",
    communicationTimeoutRoleSnapshots: "Snapshot timeout comunicazione",
    customPerksDiscordCleanupQueue: "Coda pulizia perk Discord",
    countingRestoreTokens: "Token ripristino counting",
    legacyCollections: "Dati legacy",
    guildFeatureBucket: "Dati community",
    suggestionsRemoved: "Suggerimenti",
    ticketsRedacted: "Ticket (resi anonimi)",
    giveawayParticipationsRemoved: "Partecipazioni giveaway",
    moderationProfiles: "Profili moderazione",
    staffProfiles: "Profili staff",
    hogwartsProfiles: "Profili Hogwarts",
    hogwartsSortingDoc: "Smistamento Hogwarts",
    payments: "Pagamenti / crediti",
    moderationCasesAsSubject: "Casi di moderazione",
  };

  function labelFor(key) {
    return i18n("dashGdpr.count." + key, COUNT_LABELS[key] || key);
  }

  function countValue(v) {
    if (v == null) return 0;
    if (typeof v === "object") {
      return Object.keys(v).reduce(function (sum, nk) {
        return sum + countValue(v[nk]);
      }, 0);
    }
    var n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** HTML leggibile per utente (niente chiavi tecniche). */
  function summarizeCountsHtml(obj) {
    if (!obj || typeof obj !== "object") {
      return "<p class=\"vc-gdpr-count-empty\">" + esc(i18n("dashGdpr.noneCounted", "Nessuna voce.")) + "</p>";
    }
    var items = [];
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      if (v == null) return;
      if (typeof v === "object" && !Array.isArray(v)) {
        var nestedItems = [];
        Object.keys(v).forEach(function (nk) {
          var nn = countValue(v[nk]);
          if (nn > 0) nestedItems.push({ key: nk, n: nn });
        });
        if (!nestedItems.length) return;
        var total = nestedItems.reduce(function (s, it) {
          return s + it.n;
        }, 0);
        items.push({
          key: k,
          n: total,
          detail: nestedItems
            .map(function (it) {
              return esc(labelFor(it.key)) + ": " + it.n;
            })
            .join(" · "),
        });
        return;
      }
      var n = countValue(v);
      if (n > 0) items.push({ key: k, n: n, detail: "" });
    });
    if (!items.length) {
      return "<p class=\"vc-gdpr-count-empty\">" + esc(i18n("dashGdpr.noneCounted", "Nessuna voce.")) + "</p>";
    }
    return (
      '<ul class="vc-gdpr-count-list">' +
      items
        .map(function (it) {
          return (
            "<li><span class=\"vc-gdpr-count-list__label\">" +
            esc(labelFor(it.key)) +
            '</span><span class="vc-gdpr-count-list__n">' +
            it.n +
            "</span>" +
            (it.detail
              ? '<span class="vc-gdpr-count-list__detail">' + it.detail + "</span>"
              : "") +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function needLoginMsg() {
    return i18n("dashGdpr.needLogin", "Accedi con Discord per esportare o cancellare i tuoi dati.");
  }

  function renderLoginPrompt() {
    var root = byId("vc-gdpr-root");
    if (!root) return;
    root.innerHTML =
      '<section class="vc-acc-card">' +
      '<h2 class="vc-acc-card__title" data-i18n="dashGdpr.needLoginTitle">Accesso richiesto</h2>' +
      '<p class="vc-acc-card__text" data-i18n="dashGdpr.needLogin">' +
      esc(needLoginMsg()) +
      "</p>" +
      '<div class="vc-acc-card__actions">' +
      '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--primary" data-vc-discord-login id="vc-gdpr-login">' +
      '<i class="fa fa-discord" aria-hidden="true"></i> <span data-i18n="auth.login">Login</span></button>' +
      "</div></section>";
    root.hidden = false;
    try {
      if (window.VcI18n && typeof window.VcI18n.apply === "function") window.VcI18n.apply(root);
    } catch (eApply) {}
    setStatus(needLoginMsg(), false);
  }

  function render() {
    var root = byId("vc-gdpr-root");
    if (!root) return;
    if (!getToken()) {
      renderLoginPrompt();
      return;
    }
    var previewHtml = "";
    if (state.preview) {
      previewHtml =
        '<section class="vc-acc-card">' +
        '<h2 class="vc-acc-card__title" data-i18n="dashGdpr.previewTitle">Anteprima cancellazione</h2>' +
        '<p class="vc-acc-card__text">' +
        esc(
          state.preview.message ||
            i18n(
              "dashGdpr.previewHint",
              "Anteprima: nessun dato è stato cancellato. Controlla cosa verrebbe eliminato e cosa resterebbe.",
            ),
        ) +
        "</p>" +
        '<div class="vc-gdpr-count-block">' +
        "<h3 class=\"vc-gdpr-count-block__title\">" +
        esc(i18n("dashGdpr.deletedLabel", "Cosa verrebbe eliminato")) +
        "</h3>" +
        summarizeCountsHtml(state.preview.deleted) +
        "</div>" +
        '<div class="vc-gdpr-count-block">' +
        "<h3 class=\"vc-gdpr-count-block__title\">" +
        esc(i18n("dashGdpr.retainedLabel", "Cosa resterebbe (obblighi / sicurezza)")) +
        "</h3>" +
        summarizeCountsHtml(state.preview.retained) +
        "</div>" +
        "</section>";
    }

    root.innerHTML =
      '<section class="vc-acc-card">' +
      '<h2 class="vc-acc-card__title" data-i18n="dashGdpr.exportTitle">Esporta i tuoi dati</h2>' +
      '<p class="vc-acc-card__text" data-i18n="dashGdpr.exportLead">Scarica un file JSON con i dati trattati da sito e bot per il tuo account Discord.</p>' +
      '<div class="vc-acc-card__actions">' +
      '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--primary" id="vc-gdpr-export"' +
      (state.busy ? " disabled" : "") +
      '><i class="fa fa-download" aria-hidden="true"></i> <span data-i18n="dashGdpr.exportBtn">Scarica i miei dati</span></button>' +
      "</div></section>" +
      previewHtml +
      '<section class="vc-acc-card">' +
      '<h2 class="vc-acc-card__title" data-i18n="dashGdpr.eraseTitle">Cancella i tuoi dati</h2>' +
      '<p class="vc-acc-card__text" data-i18n="dashGdpr.eraseLead">Alcuni dati (moderazione, pagamenti, obblighi legali) possono essere conservati. L’operazione è irreversibile per i dati eliminabili.</p>' +
      '<div class="vc-acc-card__actions">' +
      '<button type="button" class="vc-dashboard-btn" id="vc-gdpr-preview"' +
      (state.busy ? " disabled" : "") +
      '><i class="fa fa-eye" aria-hidden="true"></i> <span data-i18n="dashGdpr.previewBtn">Anteprima cancellazione</span></button>' +
      "</div>" +
      '<label class="vc-dashboard-field vc-gdpr-confirm-field" for="vc-gdpr-confirm-token">' +
      '<span data-i18n="dashGdpr.confirmLabel">Per confermare, digita il tuo username Discord o ID</span>' +
      '<input type="text" id="vc-gdpr-confirm-token" name="gdpr-confirm" autocomplete="off" spellcheck="false" ' +
      (state.busy ? "disabled " : "") +
      'placeholder="username o ID" value="' +
      esc(state.confirmToken) +
      '" />' +
      "</label>" +
      '<div class="vc-acc-card__actions">' +
      '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" id="vc-gdpr-erase"' +
      (state.busy ? " disabled" : "") +
      '><i class="fa fa-trash" aria-hidden="true"></i> <span data-i18n="dashGdpr.eraseBtn">Cancella i miei dati</span></button>' +
      "</div></section>";

    root.hidden = false;
    try {
      if (window.VcI18n && typeof window.VcI18n.apply === "function") window.VcI18n.apply(root);
    } catch (eApply) {}

    var confirmEl = byId("vc-gdpr-confirm-token");
    if (confirmEl) {
      confirmEl.addEventListener("input", function () {
        state.confirmToken = String(confirmEl.value || "");
      });
    }
    var exportBtn = byId("vc-gdpr-export");
    var previewBtn = byId("vc-gdpr-preview");
    var eraseBtn = byId("vc-gdpr-erase");
    if (exportBtn) exportBtn.addEventListener("click", onExport);
    if (previewBtn) previewBtn.addEventListener("click", onPreview);
    if (eraseBtn) eraseBtn.addEventListener("click", onErase);
  }

  async function onExport() {
    if (state.busy) return;
    var token = getToken();
    if (!token) {
      setStatus(needLoginMsg(), true);
      renderLoginPrompt();
      return;
    }
    state.busy = true;
    render();
    setStatus(i18n("dashGdpr.exporting", "Preparazione export…"), false);
    try {
      var res = await fetch(apiBase() + "/account/gdpr/export", {
        method: "GET",
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        cache: "no-store",
      });
      var disp = String(res.headers.get("content-disposition") || "");
      var isAttachment = /attachment/i.test(disp);
      if (!isAttachment) {
        var data = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !data || data.ok === false) {
          setStatus((data && data.message) || i18n("dashGdpr.exportFail", "Export non riuscito."), true);
          return;
        }
        if (data.tooLarge) {
          setStatus(data.message || i18n("dashGdpr.tooLarge", "Export troppo grande per il download diretto."), true);
          return;
        }
        setStatus(i18n("dashGdpr.exportFail", "Export non riuscito."), true);
        return;
      }
      if (!res.ok) {
        setStatus(i18n("dashGdpr.exportFail", "Export non riuscito."), true);
        return;
      }
      var blob = await res.blob();
      var match = /filename=\"?([^\";]+)\"?/i.exec(disp);
      var filename = (match && match[1]) || "gdpr-export.json";
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      setStatus(i18n("dashGdpr.exportOk", "Export scaricato."), false, { ok: true });
    } catch (e) {
      setStatus(i18n("dashGdpr.networkError", "Errore di rete. Riprova tra poco."), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function onPreview() {
    if (state.busy) return;
    var token = getToken();
    if (!token) {
      setStatus(needLoginMsg(), true);
      renderLoginPrompt();
      return;
    }
    state.busy = true;
    render();
    setStatus(i18n("dashGdpr.previewing", "Calcolo anteprima…"), false);
    try {
      var res = await fetch(apiBase() + "/account/gdpr/erase", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: false }),
        cache: "no-store",
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !data || data.ok === false) {
        setStatus((data && data.message) || i18n("dashGdpr.previewFail", "Anteprima non riuscita."), true);
        return;
      }
      state.preview = data;
      setStatus(i18n("dashGdpr.previewOk", "Anteprima pronta. Nessun dato cancellato."), false, { ok: true });
    } catch (e) {
      setStatus(i18n("dashGdpr.networkError", "Errore di rete. Riprova tra poco."), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  async function onErase() {
    if (state.busy) return;
    var token = getToken();
    if (!token) {
      setStatus(needLoginMsg(), true);
      renderLoginPrompt();
      return;
    }
    var confirmEl = byId("vc-gdpr-confirm-token");
    var confirmToken = confirmEl ? String(confirmEl.value || "").trim() : String(state.confirmToken || "").trim();
    state.confirmToken = confirmToken;
    if (!confirmToken) {
      setStatus(i18n("dashGdpr.needConfirm", "Digita username o ID Discord per confermare."), true);
      return;
    }
    if (
      !window.confirm(
        i18n(
          "dashGdpr.eraseConfirmDialog",
          "Confermi la cancellazione dei tuoi dati eliminabili? L’operazione non si può annullare.",
        ),
      )
    ) {
      return;
    }
    state.busy = true;
    render();
    setStatus(i18n("dashGdpr.erasing", "Cancellazione in corso…"), false);
    try {
      var res = await fetch(apiBase() + "/account/gdpr/erase", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirm: true, confirmToken: confirmToken }),
        cache: "no-store",
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !data || data.ok === false) {
        setStatus((data && data.message) || i18n("dashGdpr.eraseFail", "Cancellazione non riuscita."), true);
        return;
      }
      state.preview = data;
      state.confirmToken = "";
      setStatus(data.message || i18n("dashGdpr.eraseOk", "Cancellazione completata."), false, { ok: true });
    } catch (e) {
      setStatus(i18n("dashGdpr.networkError", "Errore di rete. Riprova tra poco."), true);
    } finally {
      state.busy = false;
      render();
    }
  }

  function boot() {
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  window.addEventListener("vc-discord-profile", function () {
    render();
  });
})();
