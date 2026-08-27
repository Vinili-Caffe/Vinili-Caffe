(function () {
  "use strict";

  var state = {
    data: null,
    busy: false,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function i18n(key, fallback, vars) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    var out = fallback || key;
    if (vars && typeof vars === "object") {
      Object.keys(vars).forEach(function (k) {
        out = String(out).split("{" + k + "}").join(String(vars[k]));
      });
    }
    return out;
  }

  function apiBase() {
    var isLocal = false;
    try {
      isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    } catch (e0) {}
    var d = window.__VC_SITE_DASHBOARD || {};
    var raw = String(isLocal && d.apiUrlLocal ? d.apiUrlLocal : d.apiUrl || "").trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        return String(window.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (e) {}
    return "";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(msg, isError) {
    var el = byId("vc-profile-account-status");
    if (el) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error");
    }
    var text = String(msg || "").trim();
    if (window.VcSiteToast) {
      if (!text) window.VcSiteToast.hide();
      else window.VcSiteToast.show(text, Boolean(isError));
      return;
    }
    if (!el) return;
    if (!text) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("is-error", Boolean(isError));
  }

  function formatDate(ms) {
    var n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return i18n("dashAcc.lifetime", "A vita");
    try {
      return new Date(n).toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch (e) {
      return String(n);
    }
  }

  function formatDateOrDash(ms) {
    var n = Number(ms);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return formatDate(n);
  }

  function renewalLabel(plan) {
    if (!plan) return i18n("dashAcc.metaExpires", "Scade il");
    if (plan.kind === "guild_subscription" || plan.interval === "month" || plan.interval === "year") {
      if (plan.canceling === true) return i18n("dashAcc.metaExpires", "Scade il");
      return i18n("dashAcc.metaRenews", "Prossimo rinnovo");
    }
    if (plan.lifetime === true) return i18n("dashAcc.metaValidity", "Validità");
    if (plan.until == null && plan.renewsAt == null) {
      return i18n("dashAcc.metaValidity", "Validità");
    }
    return i18n("dashAcc.metaExpires", "Scade il");
  }

  function renewalValue(plan) {
    if (!plan) return "—";
    var when = plan.renewsAt != null ? plan.renewsAt : plan.until;
    if (Number.isFinite(Number(when)) && Number(when) > 0) {
      return formatDate(when);
    }
    if (plan.kind === "guild_subscription" || plan.interval === "month" || plan.interval === "year") {
      return i18n("dashAcc.renewsAuto", "Rinnovo automatico");
    }
    if (plan.lifetime === true) return i18n("dashAcc.lifetime", "A vita");
    return "—";
  }

  function intervalLabel(plan) {
    if (!plan) return "—";
    if (plan.kind === "guild_subscription") {
      if (plan.interval === "year") return i18n("dashAcc.intervalYear", "Annuale");
      return i18n("dashAcc.intervalMonth", "Mensile");
    }
    if (plan.kind === "credits" || plan.kind === "durable" || plan.lifetime === true) {
      return i18n("dashAcc.intervalOnce", "Una tantum");
    }
    if (plan.interval === "month") return i18n("dashAcc.intervalMonth", "Mensile");
    if (plan.interval === "year") return i18n("dashAcc.intervalYear", "Annuale");
    return i18n("dashAcc.intervalOnce", "Una tantum");
  }

  function planDisplayLabel(plan) {
    return String((plan && plan.label) || "").trim() || i18n("dashAcc.planPersonalization", "Personalizzazione");
  }

  function metaRow(dt, dd) {
    return (
      "<div><dt>" +
      esc(dt) +
      "</dt><dd>" +
      esc(dd) +
      "</dd></div>"
    );
  }

  function renderPlanCard(plan) {
    var manageUrl = plan.storeUrl || "";
    var guildName = String(plan.guildName || "").trim();
    var planLabel = planDisplayLabel(plan);
    var title = guildName || planLabel;
    var icon = plan.guildIconUrl
      ? '<img class="vc-acc-plan__guild-img" src="' +
        esc(plan.guildIconUrl) +
        '" alt="" width="40" height="40" loading="lazy" decoding="async" />'
      : '<span class="vc-acc-plan__ico" aria-hidden="true"><i class="fa fa-diamond"></i></span>';
    var actions = manageUrl
      ? '<a class="vc-dashboard-btn" href="' +
        esc(manageUrl) +
        '" target="_blank" rel="noopener noreferrer" data-i18n="dashAcc.manageStore">Gestisci su Discord</a>'
      : "";
    return (
      '<article class="vc-acc-plan">' +
      '<header class="vc-acc-plan__head">' +
      icon +
      "<div><h3 class=\"vc-acc-plan__title\" title=\"" +
      esc(title) +
      "\">" +
      esc(title) +
      "</h3></div>" +
      (actions ? '<div class="vc-acc-plan__actions">' + actions + "</div>" : "") +
      "</header>" +
      '<dl class="vc-acc-plan__meta vc-acc-plan__meta--sub">' +
      metaRow(
        i18n("dashAcc.metaStatus", "Stato"),
        plan.canceling
          ? i18n("dashAcc.statusEnding", "In scadenza")
          : i18n("dashAcc.statusActive", "Attivo"),
      ) +
      metaRow(i18n("dashAcc.metaBilling", "Ciclo"), intervalLabel(plan)) +
      metaRow(renewalLabel(plan), renewalValue(plan)) +
      metaRow(i18n("dashAcc.metaPlan", "Piano"), planLabel) +
      "</dl>" +
      "</article>"
    );
  }

  function marketingPremiumUrl() {
    var d = window.__VC_SITE_DASHBOARD || {};
    return String(d.premiumPageUrl || "/dashboard/premium/").trim() || "/dashboard/premium/";
  }

  function renderSubscription(data) {
    var root = byId("vc-profile-account-root");
    if (!root) return;
    var sub = data && data.subscription ? data.subscription : {};
    var plans = Array.isArray(sub.plans) ? sub.plans : [];
    var hasPlans = plans.length > 0;

    var plansHtml = hasPlans
      ? '<div class="vc-acc-plans">' +
        plans
          .map(function (p) {
            return renderPlanCard(p);
          })
          .join("") +
        "</div>"
      : "";

    var emptyHtml = !hasPlans
      ? '<section class="vc-acc-card">' +
        '<h2 class="vc-acc-card__title" data-i18n="dashAcc.subManageTitle">Premium sui tuoi server</h2>' +
        '<p class="vc-acc-card__text">' +
        esc(i18n("dashAcc.subInactiveBefore", "Nessun Premium attivo. Vai alla ")) +
        '<a href="' +
        esc(marketingPremiumUrl()) +
        '">' +
        esc(i18n("dashAcc.pricingPage", "pagina Premium")) +
        "</a>" +
        esc(i18n("dashAcc.subInactiveAfter", " per attivarlo con i crediti.")) +
        "</p>" +
        "</section>"
      : "";

    root.innerHTML = plansHtml + emptyHtml;

    try {
      if (window.VcI18n && typeof window.VcI18n.apply === "function") window.VcI18n.apply(root);
    } catch (eApply) {}
  }

  async function load() {
    if (state.busy) return;
    var token = getToken();
    var root = byId("vc-profile-account-root");
    if (!root) return;
    if (!token) {
      setStatus(i18n("dash.gateBody", "Per usare la dashboard accedi con Discord."), true);
      return;
    }
    state.busy = true;
    setStatus(i18n("dash.loading", "Caricamento…"), false);
    root.hidden = true;
    try {
      var res = await fetch(apiBase() + "/account", {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: "Bearer " + token,
        },
        credentials: "omit",
      });
      var data = null;
      try {
        data = await res.json();
      } catch (eJson) {
        data = null;
      }
      if (!res.ok || !data || data.ok === false) {
        setStatus(
          (data && data.message) || i18n("dash.errNetworkGuild", "Errore di rete durante il caricamento."),
          true,
        );
        return;
      }
      state.data = data;
      setStatus("", false);
      root.hidden = false;
      renderSubscription(data);
    } catch (e) {
      setStatus(i18n("dash.errNetworkGuild", "Errore di rete durante il caricamento."), true);
    } finally {
      state.busy = false;
    }
  }

  function boot() {
    load();
    window.addEventListener("vc-discord-profile", function () {
      load();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
