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
    if (el) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error", "is-ok");
    }
    var text = String(msg || "").trim();
    // toastOnlyAlerts1: status → toast (niente banner sotto il titolo).
    if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      if (!text) {
        window.VcSiteToast.hide();
        return;
      }
      window.VcSiteToast.show(text, Boolean(isError), {
        pending: !isError && /[…]$|\.\.\.$|preparazione|calcolo|cancellazione/i.test(text),
        ms: isError ? 4200 : opts && opts.ok ? 2800 : 2200,
      });
      return;
    }
    if (!el || !text) return;
    el.hidden = false;
    el.textContent = text;
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
    userFullDiscordStateHistories: "Cronologia stato Discord",
    muteRoleSnapshotProfiles: "Snapshot ruoli mute/timeout",
    customPerksDiscordCleanupProfiles: "Pulizia perk Discord in coda",
    communicationTimeoutRoleSnapshots: "Snapshot timeout comunicazione",
    customPerksDiscordCleanupQueue: "Coda pulizia perk Discord",
    countingRestoreTokens: "Token ripristino counting",
    legacyCollections: "Dati storici",
    guildFeatureBucket: "Dati community",
    suggestionsRemoved: "Feedback",
    ticketsRedacted: "Ticket (resi anonimi)",
    giveawayParticipationsRemoved: "Partecipazioni giveaway",
    moderationProfiles: "Profili moderazione",
    staffProfiles: "Profili staff",
    hogwartsProfiles: "Profili Hogwarts",
    hogwartsSortingDoc: "Smistamento Hogwarts",
    tenantPartnershipProfiles: "Profili partnership",
    payments: "Pagamenti / crediti",
    moderationCasesAsSubject: "Casi di moderazione",
    /* legacy Mongo collection names */
    activityusers: "Profili attività (storico)",
    expusers: "Esperienza e livelli (storico)",
    activitydailies: "Attività giornaliera (storico)",
    activityhourlies: "Attività oraria (storico)",
    activitydailycompacts: "Attività giornaliera compatta",
    activityhourlycompacts: "Attività oraria compatta",
    levelhistories: "Storico livelli",
    levelhistoryusers: "Storico livelli utente",
    mentionreactions: "Reazioni alle menzioni",
    mentionresponses: "Risposte alle menzioni",
    birthdayprofiles: "Profili compleanno",
  };

  function humanizeKey(key) {
    var s = String(key || "").trim();
    if (!s) return s;
    return s
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_\-.]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function labelFor(key) {
    var k = String(key || "").trim();
    return i18n("dashGdpr.count." + k, COUNT_LABELS[k] || humanizeKey(k) || k);
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
    return i18n("dashGdpr.needLogin", "Per esportare o cancellare i tuoi dati devi accedere con Discord.");
  }

  function legalCard(opts) {
    var tone = opts.tone || "blue";
    var icon = opts.icon || "fa-shield";
    var title = opts.title || "";
    var titleKey = opts.titleKey || "";
    var body = opts.body || "";
    var titleAttr = titleKey ? ' data-i18n="' + esc(titleKey) + '"' : "";
    return (
      '<article class="vc-legal-card vc-legal-card--' +
      esc(tone) +
      '">' +
      '<div class="vc-legal-card__head">' +
      '<span class="vc-legal-card__icon" aria-hidden="true"><i class="fa ' +
      esc(icon) +
      '"></i></span>' +
      '<h2 class="vc-legal-card__title"' +
      titleAttr +
      ">" +
      esc(title) +
      "</h2>" +
      "</div>" +
      body +
      "</article>"
    );
  }

  function renderLoginPrompt() {
    var root = byId("vc-gdpr-root");
    if (!root) return;
    root.innerHTML = legalCard({
      tone: "indigo",
      icon: "fa-sign-in",
      titleKey: "dashGdpr.needLoginTitle",
      title: i18n("dashGdpr.needLoginTitle", "Accedi per continuare"),
      body:
        '<p class="vc-legal-card__text" data-i18n="dashGdpr.needLogin">' +
        esc(needLoginMsg()) +
        "</p>" +
        '<p class="vc-legal-cta">' +
        '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--primary" data-vc-discord-login id="vc-gdpr-login">' +
        '<i class="fa fa-discord" aria-hidden="true"></i> <span data-i18n="auth.loginDiscord">Login con Discord</span></button>' +
        "</p>",
    });
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
      previewHtml = legalCard({
        tone: "purple",
        icon: "fa-eye",
        titleKey: "dashGdpr.previewTitle",
        title: i18n("dashGdpr.previewTitle", "Anteprima cancellazione"),
        body:
          "<p>" +
          esc(
            state.preview.message ||
              i18n(
                "dashGdpr.previewHint",
                "Solo anteprima: non è stato cancellato nulla. Controlla cosa verrebbe eliminato e cosa resterebbe.",
              ),
          ) +
          "</p>" +
          '<div class="vc-gdpr-count-block">' +
          '<h3 class="vc-gdpr-count-block__title">' +
          esc(i18n("dashGdpr.deletedLabel", "Cosa verrebbe eliminato")) +
          "</h3>" +
          summarizeCountsHtml(state.preview.deleted) +
          "</div>" +
          '<div class="vc-gdpr-count-block">' +
          '<h3 class="vc-gdpr-count-block__title">' +
          esc(i18n("dashGdpr.retainedLabel", "Cosa resterebbe (obblighi / sicurezza)")) +
          "</h3>" +
          summarizeCountsHtml(state.preview.retained) +
          "</div>",
      });
    }

    root.innerHTML =
      legalCard({
        tone: "blue",
        icon: "fa-download",
        titleKey: "dashGdpr.exportTitle",
        title: i18n("dashGdpr.exportTitle", "Esporta i tuoi dati"),
        body:
          '<p data-i18n="dashGdpr.exportLead">' +
          esc(
            i18n(
              "dashGdpr.exportLead",
              "Scarica un file JSON con i dati di sito e bot collegati al tuo account Discord.",
            ),
          ) +
          "</p>" +
          '<p class="vc-legal-cta">' +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--primary" id="vc-gdpr-export"' +
          (state.busy ? " disabled" : "") +
          '><i class="fa fa-download" aria-hidden="true"></i> <span data-i18n="dashGdpr.exportBtn">Scarica i miei dati</span></button>' +
          "</p>",
      }) +
      previewHtml +
      legalCard({
        tone: "gold",
        icon: "fa-trash",
        titleKey: "dashGdpr.eraseTitle",
        title: i18n("dashGdpr.eraseTitle", "Cancella i tuoi dati"),
        body:
          '<p data-i18n="dashGdpr.eraseLead">' +
          esc(
            i18n(
              "dashGdpr.eraseLead",
              "Puoi richiedere la cancellazione dei dati eliminabili. Restano eventuali dati necessari a moderazione, pagamenti o obblighi di legge. L’operazione non si può annullare.",
            ),
          ) +
          "</p>" +
          '<p class="vc-legal-cta">' +
          '<button type="button" class="vc-dashboard-btn" id="vc-gdpr-preview"' +
          (state.busy ? " disabled" : "") +
          '><i class="fa fa-eye" aria-hidden="true"></i> <span data-i18n="dashGdpr.previewBtn">Anteprima cancellazione</span></button>' +
          "</p>" +
          '<label class="vc-dashboard-field vc-gdpr-confirm-field" for="vc-gdpr-confirm-token">' +
          '<span data-i18n="dashGdpr.confirmLabel">Per confermare, digita il tuo username Discord o il tuo ID</span>' +
          '<input type="text" id="vc-gdpr-confirm-token" name="gdpr-confirm" autocomplete="off" spellcheck="false" ' +
          (state.busy ? "disabled " : "") +
          'placeholder="username o ID" value="' +
          esc(state.confirmToken) +
          '" />' +
          "</label>" +
          '<p class="vc-legal-cta">' +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" id="vc-gdpr-erase"' +
          (state.busy ? " disabled" : "") +
          '><i class="fa fa-trash" aria-hidden="true"></i> <span data-i18n="dashGdpr.eraseBtn">Cancella i miei dati</span></button>' +
          "</p>",
      });

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
    var confirmed = await (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return false;
      return D.confirm({
        title: i18n("dashGdpr.eraseConfirmTitle", "Cancellare i dati?"),
        message: i18n(
          "dashGdpr.eraseConfirmDialog",
          "Confermi la cancellazione dei tuoi dati eliminabili? L’operazione non si può annullare.",
        ),
        confirmLabel: i18n("dashGdpr.eraseConfirmOk", "Cancella"),
        cancelLabel: i18n("dashGdpr.cancel", "Annulla"),
        danger: true,
        icon: "fa-trash-o",
      });
    });
    if (!confirmed) {
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
