(function () {
  "use strict";

  var PLANS = {
    1: { credits: 15 },
    3: { credits: 35 },
    6: { credits: 65 },
    12: { credits: 115 },
  };

  var state = {
    months: 3,
    guilds: [],
    guildId: "",
    credits: null,
    busy: false,
  };

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

  function cfg() {
    return window.__VC_SITE_DASHBOARD || {};
  }

  function apiBase() {
    var c = cfg();
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String(isLocal && c.apiUrlLocal ? c.apiUrlLocal : c.apiUrl || "").trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function creditsShopUrl() {
    var c = cfg();
    return String(c.premiumCreditsPageUrl || "/dashboard/premium/crediti/").trim() || "/dashboard/premium/crediti/";
  }

  function formatCreditsAria(plan, months) {
    if (Number(months) === 1) {
      return i18n("dashPremium.creditsAriaOne", "{credits} crediti per 1 mese", {
        credits: plan.credits,
      });
    }
    return i18n("dashPremium.creditsAria", "{credits} crediti per {months} mesi", {
      credits: plan.credits,
      months: months,
    });
  }

  function setStatus(msg, isError, opts) {
    var el = byId("vc-dash-premium-status");
    if (el) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("is-error", "is-ok");
    }
    var text = String(msg || "").trim();
    if (window.VcSiteToast) {
      if (!text) window.VcSiteToast.hide();
      else window.VcSiteToast.show(text, Boolean(isError), opts || null);
      return;
    }
    if (!el) return;
    if (!text) return;
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("is-error", Boolean(isError));
    el.classList.toggle("is-ok", Boolean(opts && opts.ok) && !isError);
  }

  function spendErrorMessage(code, fallback) {
    var err = String(code || "");
    if (err === "insufficient") {
      return i18n("dashPremium.insufficient", "Crediti insufficienti. Compra un pacchetto e riprova.");
    }
    return fallback || i18n("dashPremium.errSpend", "Attivazione non riuscita.");
  }

  function guildById(id) {
    var want = String(id || "");
    return (Array.isArray(state.guilds) ? state.guilds : []).find(function (g) {
      return String(g.id || "") === want;
    }) || null;
  }

  function guildLabel(g) {
    if (!g) return i18n("dashPremium.pickGuild", "Scegli un server…");
    var name = String(g.name || g.id || "").trim() || String(g.id || "");
    if (g.isProtectedGuild || g.isMainGuild) name += " · Vinili";
    if (g.premiumActive) name += " · Premium";
    return name;
  }

  function guildIconHtml(g, cls) {
    var icon = g && String(g.iconUrl || "").trim();
    if (icon) {
      return (
        '<img class="' +
        cls +
        '" src="' +
        esc(icon) +
        '" alt="" width="28" height="28" loading="lazy" />'
      );
    }
    return (
      '<span class="' +
      cls +
      " " +
      cls +
      '--fallback" aria-hidden="true"><i class="fa fa-server"></i></span>'
    );
  }

  function closeGuildPicker(exceptRoot) {
    Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-premium-guild-select.is-open"), function (root) {
      if (exceptRoot && root === exceptRoot) return;
      root.classList.remove("is-open");
      var trigger = root.querySelector(".vc-dash-select__trigger");
      var menu = root.querySelector(".vc-dash-select__menu");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
      if (menu) menu.setAttribute("hidden", "");
    });
  }

  function refreshGuildPicker() {
    var select = byId("vc-dash-premium-guild");
    if (!select) return;
    ensureGuildPicker(select);
    var root = select.closest(".vc-dash-premium-guild-select");
    if (!root) return;
    var valueEl = root.querySelector(".vc-dash-select__value");
    var iconEl = root.querySelector(".vc-dash-premium-guild-select__current-ico");
    var menu = root.querySelector(".vc-dash-select__menu");
    if (!valueEl || !menu) return;

    var selected = guildById(select.value);
    var label = select.value ? guildLabel(selected || { id: select.value, name: select.value }) : i18n("dashPremium.pickGuild", "Scegli un server…");
    valueEl.textContent = label;
    valueEl.classList.toggle("is-placeholder", !select.value);
    if (iconEl) {
      iconEl.innerHTML = select.value
        ? guildIconHtml(selected || { id: select.value }, "vc-dash-premium-guild-select__ico")
        : '<span class="vc-dash-premium-guild-select__ico vc-dash-premium-guild-select__ico--placeholder" aria-hidden="true"><i class="fa fa-server"></i></span>';
    }

    var rows = Array.isArray(state.guilds) ? state.guilds : [];
    if (!rows.length) {
      menu.innerHTML =
        '<div class="vc-dash-select__option is-empty" role="option" aria-disabled="true">' +
        esc(i18n("dashPremium.noGuilds", "Nessun server gestibile trovato. Accedi e invita il bot.")) +
        "</div>";
      return;
    }

    menu.innerHTML = rows
      .map(function (g) {
        var id = String(g.id || "").trim();
        if (!id) return "";
        var selectedOpt = id === String(select.value || "");
        return (
          '<button type="button" class="vc-dash-select__option vc-dash-premium-guild-select__option' +
          (selectedOpt ? " is-selected" : "") +
          '" role="option" data-value="' +
          esc(id) +
          '" aria-selected="' +
          (selectedOpt ? "true" : "false") +
          '">' +
          guildIconHtml(g, "vc-dash-premium-guild-select__ico") +
          '<span class="vc-dash-select__option-text">' +
          esc(guildLabel(g)) +
          "</span></button>"
        );
      })
      .join("");
  }

  function ensureGuildPicker(select) {
    if (!select || select.__vcPremiumGuildFancy) return;
    var picker = select.closest(".vc-dash-picker") || select.parentNode;
    if (!picker) return;

    var root = document.createElement("div");
    root.className = "vc-dash-select vc-dash-premium-guild-select";
    picker.insertBefore(root, select);
    root.appendChild(select);
    select.classList.add("vc-dash-select__native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "vc-dash-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.disabled = Boolean(select.disabled);
    trigger.innerHTML =
      '<span class="vc-dash-premium-guild-select__current-ico" aria-hidden="true"></span>' +
      '<span class="vc-dash-select__value is-placeholder"></span>' +
      '<span class="vc-dash-select__chev" aria-hidden="true"><i class="fa fa-chevron-down"></i></span>';

    var menu = document.createElement("div");
    menu.className = "vc-dash-select__menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("hidden", "");

    root.appendChild(trigger);
    root.appendChild(menu);
    select.__vcPremiumGuildFancy = true;

    trigger.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      if (trigger.disabled) return;
      var open = root.classList.contains("is-open");
      closeGuildPicker(open ? null : root);
      if (open) {
        root.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        menu.setAttribute("hidden", "");
        return;
      }
      refreshGuildPicker();
      root.classList.add("is-open");
      trigger.setAttribute("aria-expanded", "true");
      menu.removeAttribute("hidden");
    });

    menu.addEventListener("click", function (ev) {
      var opt = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-select__option[data-value]") : null;
      if (!opt || !menu.contains(opt)) return;
      ev.preventDefault();
      ev.stopPropagation();
      var next = String(opt.getAttribute("data-value") || "");
      if (!next) return;
      if (String(select.value || "") !== next) {
        select.value = next;
        try {
          select.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {
          var legacy = document.createEvent("HTMLEvents");
          legacy.initEvent("change", true, false);
          select.dispatchEvent(legacy);
        }
      }
      refreshGuildPicker();
      closeGuildPicker();
    });

    if (!document.documentElement.__vcPremiumGuildPickerWired) {
      document.documentElement.__vcPremiumGuildPickerWired = true;
      document.addEventListener("mousedown", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest(".vc-dash-premium-guild-select")) return;
        closeGuildPicker();
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") closeGuildPicker();
      });
    }
  }

  function syncGuildPickerDisabled() {
    var select = byId("vc-dash-premium-guild");
    if (!select) return;
    ensureGuildPicker(select);
    var root = select.closest(".vc-dash-premium-guild-select");
    var trigger = root && root.querySelector(".vc-dash-select__trigger");
    if (trigger) trigger.disabled = Boolean(select.disabled);
  }

  function setPlan(root, months) {
    var plan = PLANS[months];
    if (!plan) return;
    state.months = months;

    var amountEl = byId("vc-dash-premium-credits-amount");
    var ctaEl = byId("vc-dash-premium-cta");
    var buttons = root.querySelectorAll(".vc-dash-premium-duration__btn");

    if (amountEl) amountEl.textContent = String(plan.credits);
    if (ctaEl) {
      var aria = formatCreditsAria(plan, months);
      ctaEl.setAttribute("aria-label", aria);
      ctaEl.removeAttribute("title");
    }

    for (var i = 0; i < buttons.length; i++) {
      var btn = buttons[i];
      var active = Number(btn.getAttribute("data-months")) === months;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-checked", active ? "true" : "false");
    }

    root.setAttribute("data-selected-months", String(months));
    refreshCtaEnabled();
  }

  function refreshCtaEnabled() {
    var cta = byId("vc-dash-premium-cta");
    if (!cta) return;
    var ok = Boolean(state.guildId) && !state.busy && getToken();
    cta.disabled = !ok;
  }

  function fillGuildSelect() {
    var sel = byId("vc-dash-premium-guild");
    if (!sel) return;
    var rows = Array.isArray(state.guilds) ? state.guilds : [];
    var html =
      '<option value="">' +
      esc(i18n("dashPremium.pickGuild", "Scegli un server…")) +
      "</option>";
    rows.forEach(function (g) {
      var id = String(g.id || "").trim();
      if (!id) return;
      html +=
        '<option value="' +
        esc(id) +
        '"' +
        (id === state.guildId ? " selected" : "") +
        ">" +
        esc(guildLabel(g)) +
        "</option>";
    });
    sel.innerHTML = html;
    if (state.guildId && !rows.some(function (g) { return String(g.id || "") === state.guildId; })) {
      state.guildId = "";
      sel.value = "";
    } else if (state.guildId) {
      sel.value = state.guildId;
    }
    if (!rows.length) {
      sel.disabled = true;
      setStatus(
        i18n(
          "dashPremium.noGuilds",
          "Nessun server gestibile trovato. Accedi e invita il bot.",
        ),
        true,
      );
    } else {
      sel.disabled = false;
    }
    syncGuildPickerDisabled();
    refreshGuildPicker();
    refreshCtaEnabled();
  }

  async function api(method, path, body, opts) {
    opts = opts || {};
    var attempts = Math.max(1, Math.floor(Number(opts.attempts) || 1));
    var lastErr = null;
    for (var attempt = 1; attempt <= attempts; attempt++) {
      try {
        var token = getToken();
        if (!token) throw new Error(i18n("dash.gateBody", "Per usare la dashboard accedi con Discord."));
        var res = await fetch(apiBase() + path, {
          method: method,
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
            ...(body ? { "Content-Type": "application/json" } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
          cache: "no-store",
        });
        var data = await res.json().catch(function () {
          return null;
        });
        if (!res.ok || !data || data.ok === false) {
          var msg =
            (data && (data.message || data.error)) ||
            (res.status === 502 || res.status === 503 || res.status === 504
              ? i18n("dashPremium.errUpstream", "Servizio temporaneamente non disponibile. Riprova.")
              : i18n("dashPremium.errLoad", "Impossibile caricare server e crediti."));
          var err = new Error(msg);
          err.code = data && data.error;
          err.status = res.status;
          err.payload = data;
          throw err;
        }
        return data;
      } catch (e) {
        lastErr = e;
        var retryable =
          attempt < attempts &&
          (!e.status || e.status === 502 || e.status === 503 || e.status === 504 || !e.payload);
        if (!retryable) throw e;
        await new Promise(function (resolve) {
          setTimeout(resolve, 250 * attempt);
        });
      }
    }
    throw lastErr || new Error(i18n("dashPremium.errLoad", "Impossibile caricare server e crediti."));
  }

  async function loadGuildsAndCredits() {
    if (!getToken()) {
      setStatus(i18n("dashPremium.needLogin", "Accedi con Discord per attivare Premium con i crediti."), true);
      refreshCtaEnabled();
      return;
    }
    try {
      var creditsOut = await api("GET", "/credits", null, { attempts: 2 });
      state.credits = creditsOut && creditsOut.credits != null ? Number(creditsOut.credits) : 0;
      try {
        if (window.VcDashCredits && typeof window.VcDashCredits.setCount === "function") {
          window.VcDashCredits.setCount(state.credits);
        }
      } catch (eChip) {}
    } catch (eCredits) {
      setStatus(eCredits.message || i18n("dashPremium.errLoad", "Impossibile caricare server e crediti."), true);
      return;
    }

    try {
      var guildsOut = await api("GET", "/guilds", null, { attempts: 3 });
      state.guilds = Array.isArray(guildsOut && guildsOut.guilds) ? guildsOut.guilds : [];
      fillGuildSelect();
      setStatus("");
    } catch (eGuilds) {
      state.guilds = [];
      fillGuildSelect();
      setStatus(
        eGuilds.message ||
          i18n("dashPremium.errLoadGuilds", "Impossibile caricare i server. Riprova tra poco."),
        true,
      );
    }
  }

  async function activatePremium() {
    if (state.busy) return;
    var plan = PLANS[state.months];
    if (!plan || !state.guildId) {
      setStatus(i18n("dashPremium.pickGuildFirst", "Seleziona un server."), true);
      return;
    }
    if (state.credits != null && state.credits < plan.credits) {
      setStatus(
        i18n("dashPremium.insufficient", "Crediti insufficienti. Compra un pacchetto e riprova."),
        true,
      );
      return;
    }
    state.busy = true;
    refreshCtaEnabled();
    setStatus(i18n("dashPremium.activating", "Attivazione in corso…"), false);
    try {
      var out = await api("POST", "/credits/spend", {
        guildId: state.guildId,
        months: state.months,
      });
      state.credits = out.credits;
      try {
        if (window.VcDashCredits && typeof window.VcDashCredits.setCount === "function") {
          window.VcDashCredits.setCount(state.credits);
        }
        window.dispatchEvent(
          new CustomEvent("vc:credits-changed", {
            detail: { credits: Math.max(0, Math.floor(Number(state.credits) || 0)) },
          }),
        );
      } catch (eChip) {}
      setStatus(i18n("dashPremium.activated", "Premium attivato sul server selezionato."), false, { ok: true });
      await loadGuildsAndCredits();
    } catch (e) {
      var code = e.code || (e.payload && e.payload.error);
      setStatus(spendErrorMessage(code, e.message), true);
    } finally {
      state.busy = false;
      refreshCtaEnabled();
    }
  }

  function init() {
    var root = document.querySelector("[data-vc-premium-credits]");
    if (!root) return;

    var duration = root.querySelector(".vc-dash-premium-duration");
    if (duration) {
      duration.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var btn = t.closest(".vc-dash-premium-duration__btn");
        if (!btn || !duration.contains(btn)) return;
        ev.preventDefault();
        var months = Number(btn.getAttribute("data-months"));
        if (!PLANS[months]) return;
        setPlan(root, months);
      });
    }

    var sel = byId("vc-dash-premium-guild");
    if (sel) {
      ensureGuildPicker(sel);
      sel.addEventListener("change", function () {
        state.guildId = String(sel.value || "").trim();
        refreshGuildPicker();
        refreshCtaEnabled();
      });
    }

    var cta = byId("vc-dash-premium-cta");
    if (cta) {
      cta.addEventListener("click", function (ev) {
        ev.preventDefault();
        activatePremium();
      });
    }

    var buy = byId("vc-dash-premium-buy-credits");
    if (buy && !buy.getAttribute("href")) buy.href = creditsShopUrl();

    setPlan(root, Number(root.getAttribute("data-selected-months")) || 3);
    loadGuildsAndCredits();

    window.addEventListener("vc-discord-profile", function () {
      loadGuildsAndCredits();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
