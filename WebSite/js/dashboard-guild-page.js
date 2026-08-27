(function () {
  "use strict";
  window.__VC_DASH_SWITCHER_OWNED = true;

  function i18n(key, fallback, vars) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    var out = fallback != null ? fallback : key;
    if (vars && typeof out === "string") {
      out = out.replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] != null ? String(vars[k]) : "{" + k + "}";
      });
    }
    return out;
  }

  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var ACCESS_EXPIRES_KEY = "vc_discord_expires_at";
  var state = {
    guildId: "",
    overview: null,
    partnership: null,
    settings: null,
    settingsPickers: null,
    settingsBaseline: "",
    settingsSaving: false,
    settingsSaveSeq: 0,
    settingsAutosaveTimer: null,
    settingsAutosavePending: false,
    bachecaAutosaveTimer: null,
    bachecaAutosavePending: false,
    bachecaFeaturesAutosaveTimer: null,
    bachecaFeaturesAutosavePending: false,
    bachecaSaveSeq: 0,
    bachecaStyleAutosaveTimer: null,
    bachecaStyleAutosavePending: false,
    bachecaStyleSaveSeq: 0,
    pendingBotAvatar: undefined,
    pendingBotBanner: undefined,
    settingsNickLoaded: null,
    settingsIdentityPollTimer: null,
    dashboardRoleIds: [],
    settingsProtectedGuild: false,
    settingsPrefixLocked: false,
    settingsRolesLocked: false,
    premium: { active: false, plan: null, until: null },
    tickets: null,
    ticketsPickers: null,
    ticketsOverview: null,
    transcriptsList: null,
    transcriptsFilters: null,
    transcriptsTotal: 0,
    transcriptsOffset: 0,
    transcriptViewerBlobUrl: null,
    transcriptViewerTicketId: null,
    transcriptsPageSize: 25,
    transcriptsLoading: false,
    transcriptsRequestId: 0,
    transcriptsFilterTimer: null,
    transcriptsPollTimer: null,
    openTicketsList: null,
    openTicketsTotal: 0,
    openTicketsOffset: 0,
    openTicketsPageSize: 30,
    openTicketsLoading: false,
    openTicketsRequestId: 0,
    openTicketsFilterTimer: null,
    openTicketsPollTimer: null,
    openTicketsViewerId: null,
    openTicketsPanels: null,
    ticketPanels: null,
    ticketPanelsLoading: false,
    ticketPanelsSaving: false,
    ticketTeams: null,
    ticketTeamsLoading: false,
    ticketTeamsSaving: false,
    ticketTeamsSelectedId: null,
    ticketBlacklist: null,
    ticketBlacklistLoading: false,
    ticketBlacklistSaving: false,
    ticketBlacklistUserSearchTimer: null,
    ticketBlacklistUserSearchSeq: 0,
    ticketForms: null,
    ticketFormsLoading: false,
    ticketFormsSaving: false,
    ticketFormsSelectedId: null,
    ticketFormsDraftFields: null,
    ticketFormsDraftFormId: null,
    ticketFormsDraftDirty: false,
    ticketsSaving: false,
    ticketsLoadSeq: 0,
    commandsCatalog: null,
    commandsMap: null,
    commandsPrefix: "+",
    commandsIntegrations: null,
    commandsDiscordWarning: "",
    commandsProtectedGuild: false,
    commandsCategoryFilter: "",
    commandsSettingsName: null,
    commandsSettingsCategoryId: null,
    commandsSettingsDraft: null,
    commandsSettingsInitialDraft: null,
    commandsPickers: null,
    commandsLoading: false,
    commandsSaving: false,
    commandsSaveSeq: 0,
    commandsAutosaveTimer: null,
    commandsPendingSave: null,
    pickers: null,
    pickersRefreshing: false,
    pickersPollTimer: null,
    pickersLastFreshAt: 0,
    psZoneIds: [],
    embedPhLastField: null,
    embedPhLastFieldId: "",
    embedPhLastStart: 0,
    embedPhLastEnd: 0,
    saving: false,
    loadSeq: 0,
    loadBusy: false,
    view: "overview",
    successTimer: null,
    successView: "",
    errorTimer: null,
    errorView: "",
    baselinePatch: "",
    autosaveTimer: null,
    saveToastTimer: null,
    autosavePending: false,
    saveSeq: 0,
    migrationPollTimer: null,
    migrationMode: "configured",
    migrationShowSetup: false,
    migrationStatusKnown: false,
    lastMigrationPayload: null,
    headerGuildName: "",
    headerGuildIcon: "",
    partnershipSheetIgnoreUntil: 0,
    blacklistEntries: null,
    blacklistLoading: false,
    blacklistBusy: false,
    blacklistModalArmed: false,
    blacklistModalArmTimer: null,
    managersList: null,
    managersLoading: false,
    managersBusy: false,
    canManagePmPoints: false,
    historyEntries: null,
    historyLoading: false,
    historyDays: "all",
    historyPage: 1,
    historyPageSize: 10,
    historyTotalPages: 1,
    historyUniqueServers: 0,
    historyTotalPartnerships: 0,
    lbCategory: "servers",
    lbPeriod: "total",
    lbPage: 1,
    lbLoading: false,
    lbSeq: 0,
    lbLastPayload: null,
    blacklistModalPendingGid: "",
    dashConfirmKind: "",
    leaveBusy: false,
    wizardStep: 1,
    botWaitTimer: null,
    botWaitUntil: 0,
    botWaitBusy: false,
    switcherGuilds: null,
    switcherLoadPromise: null,
    switcherRetryTimer: null,
    switcherFailCount: 0,
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function isPremiumActive() {
    return Boolean(state.premium && state.premium.active);
  }

  function setPremiumFromApi(data) {
    state.premium =
      data && data.premium && typeof data.premium === "object"
        ? {
            active: data.premium.active === true,
            plan: data.premium.plan || null,
            until: data.premium.until || null,
          }
        : { active: false, plan: null, until: null };
    applyPremiumUi();
  }

  function premiumPageUrl() {
    var c = cfg();
    var raw = String((c && c.premiumPageUrl) || "/dashboard/premium/").trim();
    return raw || "/dashboard/premium/";
  }

  function applyEmbedPremiumTease(active) {
    var feat = byId("ps-embedFeat");
    if (!feat) return;
    feat.classList.toggle("is-premium-locked", !active);
    setFeatEnabled(feat, true, { keepValues: true });
    var sw = feat.querySelector("[data-feat-switch]");
    var swLabel = sw && sw.closest ? sw.closest(".vc-dash-switch") : null;
    if (sw) {
      sw.checked = true;
      sw.disabled = true;
    }
    if (swLabel) swLabel.classList.add("vc-dash-switch--locked");
    if (!active) restoreEmbedFieldsFromSaved();
    var lock = feat.querySelector("[data-premium-tease-lock]");
    if (lock) {
      if (active) lock.setAttribute("hidden", "");
      else lock.removeAttribute("hidden");
    }
    var cta = feat.querySelector("[data-premium-tease-cta]");
    if (cta) cta.setAttribute("href", premiumPageUrl());
    Array.prototype.forEach.call(
      feat.querySelectorAll("[data-premium-tease-body] input, [data-premium-tease-body] textarea, [data-premium-tease-body] select, [data-premium-tease-body] button"),
      function (ctrl) {
        ctrl.disabled = !active;
      },
    );
    var resetBtn = byId("ps-embedReset");
    if (resetBtn) resetBtn.disabled = !active;
    var tease = feat.querySelector("[data-premium-tease]");
    if (tease) tease.classList.toggle("is-locked", !active);
  }

  function resetEmbedFieldsToDefaults() {
    if (!isPremiumActive()) return;
    var defaults = (state.partnership && state.partnership.thankYouEmbedDefaults) || null;
    applyEmbedFieldsToForm(resolveEmbedEditorValues(null, defaults));
    scheduleAutosave(0);
    showSaveToast(i18n("dash.ps.embedResetOk", "Embed ripristinato ai valori predefiniti."), false);
  }

  function applyQuoteStylePremiumTease(active) {
    var zone = document.querySelector(".vc-dash-quote-style[data-premium-lock]");
    if (!zone) return;
    zone.classList.toggle("is-premium-locked", !active);
    var lock = zone.querySelector("[data-premium-tease-lock]");
    if (lock) {
      if (active) lock.setAttribute("hidden", "");
      else lock.removeAttribute("hidden");
    }
    var cta = zone.querySelector("[data-premium-tease-cta]");
    if (cta) cta.setAttribute("href", premiumPageUrl());
    Array.prototype.forEach.call(
      zone.querySelectorAll(
        "[data-premium-tease-body] input, [data-premium-tease-body] textarea, [data-premium-tease-body] select, [data-premium-tease-body] button",
      ),
      function (ctrl) {
        ctrl.disabled = !active;
      },
    );
    var tease = zone.querySelector("[data-premium-tease]");
    if (tease) tease.classList.toggle("is-locked", !active);
  }

  function applyPremiumUi() {
    var active = isPremiumActive();

    Array.prototype.forEach.call(document.querySelectorAll("[data-premium-badge]"), function (el) {
      el.hidden = false;
      el.classList.toggle("is-on", active);
      el.classList.toggle("is-locked", !active);
      var ico = el.querySelector("[data-premium-lock-ico]");
      if (ico) {
        if (active) ico.setAttribute("hidden", "");
        else ico.removeAttribute("hidden");
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-premium-note]"), function (el) {
      el.hidden = true;
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-premium-gate]"), function (feat) {
      if (feat.id === "ps-embedFeat") {
        applyEmbedPremiumTease(active);
        return;
      }
      feat.classList.toggle("is-premium-locked", !active);
      var sw = feat.querySelector("[data-feat-switch]");
      if (!active) {
        if (typeof setFeatEnabled === "function") {
          setFeatEnabled(feat, false, { keepValues: true });
        } else {
          feat.classList.remove("is-on");
          var panel = feat.querySelector("[data-feat-panel]");
          if (panel) panel.setAttribute("hidden", "");
          if (sw) sw.checked = false;
        }
        if (sw) sw.disabled = true;
      } else if (sw) {
        sw.disabled = false;
      }
    });

    applyQuoteStylePremiumTease(active);

    Array.prototype.forEach.call(document.querySelectorAll("[data-premium-lock]"), function (zone) {
      if (zone.classList.contains("vc-dash-quote-style")) return;
      zone.classList.toggle("is-premium-locked", !active);
      Array.prototype.forEach.call(
        zone.querySelectorAll("input, textarea, select, button"),
        function (ctrl) {
          if (ctrl.closest("[data-premium-free]") || ctrl.hasAttribute("data-premium-free")) return;
          if (ctrl.matches("[data-feat-switch]")) return;
          ctrl.disabled = !active;
        },
      );
      Array.prototype.forEach.call(
        zone.querySelectorAll(".vc-dash-bot-identity__banner-hit, .vc-dash-bot-identity__avatar-hit"),
        function (hit) {
          if (active) {
            if (hit.dataset.premiumTitleUnlocked) {
              hit.setAttribute("title", hit.dataset.premiumTitleUnlocked);
            }
          } else {
            if (!hit.dataset.premiumTitleUnlocked) {
              hit.dataset.premiumTitleUnlocked = hit.getAttribute("title") || "";
            }
            hit.setAttribute(
              "title",
              typeof i18n === "function"
                ? i18n("dash.cfg.lockedPremium", "Bloccato")
                : "Bloccato",
            );
          }
        },
      );
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-premium-nav]"), function (link) {
      // Navigabile anche senza Premium: badge locked/unlocked, niente blocco click.
      link.classList.remove("is-premium-locked");
      link.removeAttribute("aria-disabled");
      var badge = link.querySelector("[data-premium-nav-badge]");
      if (badge) {
        badge.hidden = false;
        badge.classList.toggle("is-on", active);
        badge.classList.toggle("is-locked", !active);
      }
    });

    Array.prototype.forEach.call(document.querySelectorAll("[data-premium-quote-cta]"), function (el) {
      el.setAttribute("hidden", "");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-premium-quote-cta-link]"), function (a) {
      a.setAttribute("href", premiumPageUrl());
    });

    var prefixEl = byId("gs-prefix");
    if (prefixEl) {
      prefixEl.disabled = false;
      prefixEl.readOnly = false;
    }
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_SITE_DASHBOARD) || {};
  }

  function resolveApiBase() {
    var c = cfg();
    var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
    var raw = String((isLocal && c.apiUrlLocal) ? c.apiUrlLocal : (c.apiUrl || "")).trim();
    return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
  }

  function getToken() {
    if (typeof window.__vcDiscordGetAccessToken === "function") {
      var t = window.__vcDiscordGetAccessToken();
      if (t) return t;
    }
    var t2 = localStorage.getItem(ACCESS_TOKEN_KEY);
    var exp = Number(localStorage.getItem(ACCESS_EXPIRES_KEY) || "0");
    if (!t2 || !exp || Date.now() >= exp) return "";
    return t2;
  }

  function resolveGuildId() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var id = String(q.get("id") || "").trim();
      if (/^\d{17,22}$/.test(id)) return id;
    } catch (e) {}
    return "";
  }

  function guildPageUrl(guildId) {
    var c = cfg();
    var base = String(c.guildPageUrl || "/dashboard/guild/").trim();
    if (!base.endsWith("/")) base += "/";
    return base + "?id=" + encodeURIComponent(String(guildId || ""));
  }

  function switcherGuildHref(guildId) {
    var href = guildPageUrl(guildId);
    var view = "";
    try {
      view = normalizeView(window.location.hash || state.view || "overview");
    } catch (e) {
      view = String(state.view || "overview").replace(/^#/, "").trim() || "overview";
    }
    if (!view) view = "overview";
    return href + "#" + view;
  }

  function refreshServerSwitcherHrefs() {
    var list = byId("vc-dash-server-switcher-list");
    if (!list) return;
    Array.prototype.forEach.call(list.querySelectorAll("a.vc-dash-server-switcher__item"), function (a) {
      try {
        var raw = String(a.getAttribute("href") || "");
        var u = new URL(raw, window.location.href);
        var id = String(u.searchParams.get("id") || "").trim();
        if (/^\d{17,22}$/.test(id)) a.setAttribute("href", switcherGuildHref(id));
      } catch (e) {}
    });
  }

  function dashboardListUrl() {
    var c = cfg();
    var u = String(c.pageUrl || "/dashboard/").trim();
    return u || "/dashboard/";
  }

  function hideServerSwitcherTip() {
    var tip = byId("vc-dash-server-switcher-tip");
    if (!tip) return;
    tip.hidden = true;
    tip.textContent = "";
    tip.style.left = "";
  }

  function showServerSwitcherTip(anchorEl) {
    var tip = byId("vc-dash-server-switcher-tip");
    var inner = tip && tip.parentElement;
    if (!tip || !inner || !anchorEl) return;
    var label = String(anchorEl.getAttribute("data-server-name") || anchorEl.getAttribute("aria-label") || "").trim();
    if (!label) {
      hideServerSwitcherTip();
      return;
    }
    tip.textContent = label;
    tip.hidden = false;
    var innerRect = inner.getBoundingClientRect();
    var anchorRect = anchorEl.getBoundingClientRect();
    var x = anchorRect.left + anchorRect.width / 2 - innerRect.left;
    tip.style.left = Math.max(12, Math.min(innerRect.width - 12, x)) + "px";
  }

  function resetServerSwitcherDock(list) {
    if (!list) return;
    var items = list.querySelectorAll(".vc-dash-server-switcher__item");
    for (var i = 0; i < items.length; i++) {
      items[i].style.setProperty("--dock-scale", "1");
      items[i].classList.remove("is-dock-active");
    }
    hideServerSwitcherTip();
  }

  function bindServerSwitcherDock(list) {
    if (!list || list.dataset.dockBound === "1") return;
    list.dataset.dockBound = "1";
    var root = byId("vc-dash-server-switcher");
    var maxScale = 1.38;
    var range = 78;
    var finePointer = false;
    try {
      finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    } catch (eMq) {}

    list.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a.vc-dash-server-switcher__item") : null;
      if (!a || !list.contains(a)) return;
      if (a.classList.contains("is-current")) {
        e.preventDefault();
        return;
      }
      try {
        var u = new URL(String(a.getAttribute("href") || ""), window.location.href);
        var id = String(u.searchParams.get("id") || "").trim();
        if (!/^\d{17,22}$/.test(id)) return;
        e.preventDefault();
        window.location.assign(switcherGuildHref(id));
      } catch (errNav) {}
    });

    function applyDock(clientX) {
      var items = list.querySelectorAll(".vc-dash-server-switcher__item");
      if (!items.length) return;
      var closest = null;
      var closestDist = Infinity;
      for (var i = 0; i < items.length; i++) {
        var el = items[i];
        var rect = el.getBoundingClientRect();
        var cx = rect.left + rect.width / 2;
        var dist = Math.abs(clientX - cx);
        var t = Math.max(0, 1 - dist / range);
        var scale = 1 + (maxScale - 1) * (t * t * (3 - 2 * t));
        el.style.setProperty("--dock-scale", String(scale));
        if (dist < closestDist) {
          closestDist = dist;
          closest = el;
        }
      }
      var active = closest && closestDist < range * 0.72 ? closest : null;
      for (var j = 0; j < items.length; j++) {
        items[j].classList.toggle("is-dock-active", items[j] === active);
      }
      if (active) showServerSwitcherTip(active);
      else hideServerSwitcherTip();
    }

    if (finePointer) {
      list.addEventListener("pointermove", function (e) {
        if (e.pointerType === "touch") return;
        applyDock(e.clientX);
      });
      list.addEventListener("pointerleave", function () {
        resetServerSwitcherDock(list);
      });
      list.addEventListener("pointercancel", function () {
        resetServerSwitcherDock(list);
      });
    }

    if (root && root.dataset.tipBound !== "1") {
      root.dataset.tipBound = "1";
      root.addEventListener("pointerover", function (e) {
        if (!finePointer) return;
        var allBtn = e.target && e.target.closest ? e.target.closest(".vc-dash-server-switcher__all") : null;
        if (!allBtn || !root.contains(allBtn)) return;
        resetServerSwitcherDock(list);
        showServerSwitcherTip(allBtn);
      });
      root.addEventListener("pointerout", function (e) {
        var allBtn = e.target && e.target.closest ? e.target.closest(".vc-dash-server-switcher__all") : null;
        if (!allBtn) return;
        var to = e.relatedTarget;
        if (to && allBtn.contains(to)) return;
        hideServerSwitcherTip();
      });
    }
  }

  function switcherCacheKey() {
    return "vc_dash_switcher_guilds_v1";
  }

  function readSwitcherCache() {
    try {
      var raw = sessionStorage.getItem(switcherCacheKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function writeSwitcherCache(guilds) {
    try {
      if (!Array.isArray(guilds) || !guilds.length) return;
      sessionStorage.setItem(switcherCacheKey(), JSON.stringify(guilds));
    } catch (e) {}
  }

  function ensureCurrentGuildInSwitcherRows(guilds) {
    var rows = Array.isArray(guilds) ? guilds.slice() : [];
    var current = String(state.guildId || "").trim();
    if (!/^\d{17,22}$/.test(current)) return rows;
    for (var i = 0; i < rows.length; i++) {
      if (String((rows[i] && rows[i].id) || "") === current) return rows;
    }
    var g = state.overview && state.overview.guild;
    rows.unshift({
      id: current,
      name: String((g && g.name) || state.headerGuildName || "Server").trim() || "Server",
      iconUrl: String((g && g.iconUrl) || state.headerGuildIcon || "").trim() || null,
      botPresent: !(g && g.botPresent === false),
    });
    return rows;
  }

  function renderServerSwitcher(guilds) {
    var root = byId("vc-dash-server-switcher");
    var list = byId("vc-dash-server-switcher-list");
    if (!root || !list) return;
    var rows = ensureCurrentGuildInSwitcherRows(guilds);
    if (rows.length < 2) {
      root.setAttribute("hidden", "");
      list.innerHTML = "";
      resetServerSwitcherDock(list);
      return;
    }
    var current = String(state.guildId || "");
    list.innerHTML = rows
      .map(function (row) {
        var id = String((row && row.id) || "").trim();
        if (!id) return "";
        var name = String((row && row.name) || "Server");
        var icon = String((row && row.iconUrl) || "").trim();
        var botPresent = row && row.botPresent === true;
        var isCurrent = id === current;
        var href = switcherGuildHref(id);
        var initial = (name.trim().charAt(0) || "?").toUpperCase();
        var media = icon
          ? '<img src="' +
            esc(icon) +
            '" alt="" width="40" height="40" loading="lazy" decoding="async" />'
          : '<span class="vc-dash-server-switcher__fallback" aria-hidden="true">' + esc(initial) + "</span>";
        return (
          '<a class="vc-dash-server-switcher__item' +
          (isCurrent ? " is-current" : "") +
          (botPresent ? "" : " is-missing") +
          '" href="' +
          esc(href) +
          '" role="listitem"' +
          (isCurrent ? ' aria-current="page"' : "") +
          ' aria-label="' +
          esc(name) +
          '" data-server-name="' +
          esc(name) +
          '" style="--dock-scale: 1">' +
          '<span class="vc-dash-server-switcher__icon">' +
          media +
          "</span>" +
          "</a>"
        );
      })
      .join("");
    root.removeAttribute("hidden");
    var allBtn = root.querySelector(".vc-dash-server-switcher__all");
    if (allBtn) {
      allBtn.setAttribute("href", dashboardListUrl());
      if (!allBtn.getAttribute("data-server-name")) {
        allBtn.setAttribute("data-server-name", i18n("dash.switcherAll", "Tutti i server"));
      }
    }
    bindServerSwitcherDock(list);
    resetServerSwitcherDock(list);
    // Sempre dal primo server (niente jump sull’ultimo / corrente).
    list.scrollLeft = 0;
    requestAnimationFrame(function () {
      list.scrollLeft = 0;
    });
  }

  function scheduleServerSwitcherRetry(delayMs) {
    if (state.switcherRetryTimer) return;
    state.switcherRetryTimer = setTimeout(function () {
      state.switcherRetryTimer = null;
      void loadServerSwitcher({ force: true });
    }, Math.max(1500, Number(delayMs) || 4000));
  }

  async function loadServerSwitcher(opts) {
    opts = opts || {};
    var token = getToken();
    var root = byId("vc-dash-server-switcher");
    if (!token || !root) return;
    if (state.switcherLoadPromise && !opts.force) return state.switcherLoadPromise;

    // Cache in-memory o sessionStorage: mostra subito, aggiorna dopo.
    if (!Array.isArray(state.switcherGuilds) || state.switcherGuilds.length < 2) {
      var cached = readSwitcherCache();
      if (cached && cached.length >= 2) state.switcherGuilds = cached;
    }
    if (Array.isArray(state.switcherGuilds) && state.switcherGuilds.length >= 2) {
      renderServerSwitcher(state.switcherGuilds);
    }

    if (state.switcherLoadPromise && opts.force) {
      // Lascia finire il fetch in corso; riprogramma un retry breve.
      scheduleServerSwitcherRetry(2500);
      return state.switcherLoadPromise;
    }

    state.switcherLoadPromise = (async function () {
      try {
        var out = await fetchDashboardJson(resolveApiBase() + "/guilds", token, { attempts: 4 });
        var res = out.res;
        var data = out.data;
        if (!res || !res.ok || !data || data.ok === false || !Array.isArray(data.guilds)) {
          if (Array.isArray(state.switcherGuilds) && state.switcherGuilds.length >= 2) {
            renderServerSwitcher(state.switcherGuilds);
          } else if (root) {
            root.setAttribute("hidden", "");
          }
          scheduleServerSwitcherRetry(state.switcherFailCount > 1 ? 12000 : 4000);
          state.switcherFailCount = (Number(state.switcherFailCount) || 0) + 1;
          return;
        }
        state.switcherFailCount = 0;
        state.switcherGuilds = data.guilds;
        writeSwitcherCache(data.guilds);
        renderServerSwitcher(data.guilds);
        // Se ancora nascosto (es. 1 solo server in risposta), riprova più tardi:
        // la lista bot può arrivare incompleta subito dopo un restart API.
        if (root && root.hasAttribute("hidden") && data.guilds.length < 2) {
          scheduleServerSwitcherRetry(8000);
        }
      } catch (e) {
        if (Array.isArray(state.switcherGuilds) && state.switcherGuilds.length >= 2) {
          renderServerSwitcher(state.switcherGuilds);
        } else if (root) {
          root.setAttribute("hidden", "");
        }
        scheduleServerSwitcherRetry(5000);
      } finally {
        state.switcherLoadPromise = null;
      }
    })();
    return state.switcherLoadPromise;
  }


  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }

  function fmtNum(n) {
    if (n == null || n === "") return "—";
    var v = Number(n);
    if (!Number.isFinite(v)) return "—";
    try {
      return v.toLocaleString("it-IT");
    } catch (e) {
      return String(v);
    }
  }

  function homeUrl() {
    try {
      var a = window.__VC_AUTH || {};
      var u = String(a.homeUrl || "/").trim();
      if (u) return u;
    } catch (e) {}
    return "/";
  }

  function obscureDashboard() {
    if (typeof window.__vcDashboardObscureIfUnauthorized === "function") {
      window.__vcDashboardObscureIfUnauthorized();
      return;
    }
    try {
      window.location.replace(homeUrl());
    } catch (e2) {
      window.location.href = homeUrl();
    }
  }

  function hideGate() {
    var g = byId("vc-dashboard-gate");
    if (!g) return;
    g.setAttribute("hidden", "");
    g.classList.add("vc-reviews-gate--dismissed");
  }

  function showGate() {
    obscureDashboard();
  }

  function hideLocked() {
    var el = byId("vc-dashboard-locked");
    if (!el) return;
    el.setAttribute("hidden", "");
    el.classList.add("vc-reviews-gate--dismissed");
  }

  function showLocked() {
    obscureDashboard();
  }

  function revealGuildMain() {
    var main = byId("vc-dashboard-guild-main");
    if (!main) return;
    main.removeAttribute("hidden");
    main.style.display = "";
    main.style.opacity = "";
    main.hidden = false;
    setSidebarVisible(true);
    document.body.classList.remove("vc-dashboard-guild-loading-active");
  }

  /** Evita UI “solo footer”: main nascosto, oppure overview spenta + form partnership ancora hidden. */
  function ensureVisibleDashboardContent() {
    try {
      revealGuildMain();
      var main = byId("vc-dashboard-guild-main");
      if (!main) return;
      var hashView = normalizeView(window.location.hash || "overview");
      var form = byId("vc-dashboard-partnership-form");
      var wantPartnership =
        state.partnership &&
        (String(hashView).indexOf("partnership/") === 0 || hashView === "classifiche");

      if (wantPartnership) {
        var panelVisible = false;
        if (form && !form.hasAttribute("hidden")) {
          Array.prototype.forEach.call(form.querySelectorAll("[data-view-panel]"), function (panel) {
            if (panel && !panel.hasAttribute("hidden")) panelVisible = true;
          });
        }
        if (!form || form.hasAttribute("hidden") || !panelVisible) {
          applyView(gatePartnershipView(hashView === "classifiche" ? "partnership/generale" : hashView), {
            skipHash: true,
          });
        }
        return;
      }

      var anyVisible = false;
      var panels = main.querySelectorAll("[data-view-panel]");
      Array.prototype.forEach.call(panels, function (panel) {
        if (!panel || panel.hasAttribute("hidden")) return;
        var parentForm = panel.closest ? panel.closest("form") : null;
        if (parentForm && parentForm.hasAttribute("hidden")) return;
        anyVisible = true;
      });
      if (!anyVisible) {
        applyView("overview", { skipHash: true });
      }
    } catch (_) {}
  }

  function setLoading(on) {
    var el = byId("vc-dashboard-guild-loading");
    var main = byId("vc-dashboard-guild-main");
    document.body.classList.toggle("vc-dashboard-guild-loading-active", Boolean(on));
    if (el) {
      if (on) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    }
    // Non nascondere MAI #vc-dashboard-guild-main: con [hidden] + CSS loader
    // il contenuto appare solo in trasparenza e a fine load resta il solo footer.
    if (main) {
      main.removeAttribute("hidden");
      main.hidden = false;
      if (main.style.display === "none") main.style.display = "";
      if (!on) main.style.opacity = "";
    }
    setSidebarVisible(true);
    if (!on) ensureVisibleDashboardContent();
  }

  function clearErrorTimer() {
    if (state.errorTimer) {
      clearTimeout(state.errorTimer);
      state.errorTimer = null;
    }
  }

  function setError(msg) {
    var el = byId("vc-dashboard-guild-error");
    if (!el) return;
    clearErrorTimer();
    if (!msg) {
      el.setAttribute("hidden", "");
      el.textContent = "";
      state.errorView = "";
      return;
    }
    el.removeAttribute("hidden");
    el.textContent = msg;
    state.errorView = state.view || currentView();
    setSuccess("");
    // Banner globale (fuori dai pannelli): non deve restare su altre sezioni.
    state.errorTimer = setTimeout(function () {
      state.errorTimer = null;
      setError("");
    }, 6000);
  }

  function clearSuccessTimer() {
    if (state.successTimer) {
      clearTimeout(state.successTimer);
      state.successTimer = null;
    }
  }

  function setSuccess(msg) {
    var el = byId("vc-dashboard-guild-success");
    if (!el) return;
    clearSuccessTimer();
    if (!msg) {
      el.setAttribute("hidden", "");
      el.textContent = "";
      state.successView = "";
      return;
    }
    el.removeAttribute("hidden");
    el.textContent = msg;
    state.successView = state.view || currentView();
    setError("");
    state.successTimer = setTimeout(function () {
      state.successTimer = null;
      setSuccess("");
    }, 6000);
  }

  function captureBaseline() {
    try {
      state.baselinePatch = JSON.stringify(buildPatchFromForm());
    } catch (e) {
      state.baselinePatch = "";
    }
  }

  function isFormDirty() {
    if (!state.baselinePatch) return false;
    try {
      return JSON.stringify(buildPatchFromForm()) !== state.baselinePatch;
    } catch (e) {
      return true;
    }
  }

  function clearAutosaveTimer() {
    if (state.autosaveTimer) {
      clearTimeout(state.autosaveTimer);
      state.autosaveTimer = null;
    }
  }

  function clearSaveToastTimer() {
    if (state.saveToastTimer) {
      clearTimeout(state.saveToastTimer);
      state.saveToastTimer = null;
    }
  }

  function showSaveToast(msg, isError, opts) {
    if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
      setSuccess("");
      setError("");
      if (!String(msg || "").trim() && !(opts && opts.pending)) {
        window.VcSiteToast.hide();
        return;
      }
      window.VcSiteToast.show(
        msg ||
          (isError
            ? i18n("dash.errorShort", "Errore")
            : opts && opts.pending
              ? i18n("dash.savingShort", "Salvataggio…")
              : i18n("dash.savedShort", "Salvato")),
        Boolean(isError),
        opts || null,
      );
      return;
    }
    var host = byId("vc-dash-save-toast-host");
    if (!host) return;
    // Evita il banner verde/rosso in alto quando usiamo il toast in basso.
    setSuccess("");
    setError("");
    clearSaveToastTimer();
    host.innerHTML = "";
    var toast = document.createElement("div");
    var pending = opts && opts.pending === true;
    toast.className =
      "vc-dash-save-toast" +
      (isError ? " is-error" : "") +
      (pending ? " is-pending" : "");
    toast.setAttribute("role", "status");
    var ico = document.createElement("span");
    ico.className = "vc-dash-save-toast__icon";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = isError
      ? '<i class="fa fa-times" aria-hidden="true"></i>'
      : pending
        ? '<span class="vc-ui-spinner vc-ui-spinner--on-dark" aria-hidden="true"></span>'
        : '<i class="fa fa-check" aria-hidden="true"></i>';
    var text = document.createElement("p");
    text.className = "vc-dash-save-toast__text";
    text.textContent =
      msg ||
      (isError
        ? i18n("dash.errorShort", "Errore")
        : pending
          ? i18n("dash.savingShort", "Salvataggio…")
          : i18n("dash.savedShort", "Salvato"));
    toast.appendChild(ico);
    toast.appendChild(text);
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    if (pending) return;
    state.saveToastTimer = setTimeout(function () {
      toast.classList.add("is-leaving");
      toast.classList.remove("is-visible");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
      state.saveToastTimer = null;
    }, isError ? 2200 : 900);
  }

  function featHasPrimaryValue(feat) {
    if (!feat) return false;
    if (feat.hasAttribute("data-feat-bool")) return true;
    if (feat.hasAttribute("data-feat-required")) return true;
    if (feat.id === "ps-partnerDescFeat") {
      var mode = String((byId("ps-partnerDescMode") || {}).value || "channel");
      if (mode === "static") {
        // Vuoto = disattivata: salva; con testo = attiva.
        return true;
      }
      // Canale: vuoto (Nessuno) = già disattivata, oppure canale scelto.
      return true;
    }
    if (feat.id === "ps-embedFeat") {
      return !embedFieldsAreEmpty();
    }
    if (feat.id === "ps-herePingFeat") {
      return Boolean(String((byId("ps-hereMembers") || {}).value || "").trim());
    }
    if (feat.id === "ps-everyonePingFeat") {
      return Boolean(String((byId("ps-everyoneMembers") || {}).value || "").trim());
    }
    if (feat.id === "ps-customPingFeat") {
      return (
        Boolean(String((byId("ps-customRoleId") || {}).value || "").trim()) &&
        Boolean(String((byId("ps-customRoleMembers") || {}).value || "").trim())
      );
    }
    if (feat.id === "ps-managerLeaveFeat") {
      var leaveAct = String((byId("ps-managerLeaveAction") || {}).value || "").trim();
      return leaveAct === "warn" || leaveAct === "delete";
    }
    var panel = feat.querySelector("[data-feat-panel]");
    if (!panel) return false;
    var hasValue = false;
    Array.prototype.forEach.call(panel.querySelectorAll("select, input, textarea"), function (el) {
      if (el.type === "checkbox" || el.type === "hidden") return;
      if (el.tagName === "SELECT" && el.multiple) {
        if (collectSelectedMulti(el).length) hasValue = true;
        return;
      }
      if (String(el.value || "").trim()) hasValue = true;
    });
    return hasValue;
  }

  var TYPING_AUTOSAVE_MS = 1000;
  var NICK_AUTOSAVE_MS = 350;
  var BACHECA_AUTOSAVE_MS = 700;
  var BACHECA_STYLE_AUTOSAVE_MS = 850;

  function isTypingField(el) {
    if (!el || !el.tagName) return false;
    var tag = String(el.tagName || "").toUpperCase();
    if (tag === "TEXTAREA") return true;
    if (tag !== "INPUT") return false;
    var type = String(el.type || "text").toLowerCase();
    if (
      type === "checkbox" ||
      type === "radio" ||
      type === "file" ||
      type === "button" ||
      type === "submit" ||
      type === "reset" ||
      type === "hidden" ||
      type === "color" ||
      type === "range"
    ) {
      return false;
    }
    return true;
  }

  function scheduleAutosave(delayMs) {
    if (state.view === "partnership/dati") return;
    if (String(state.view || "").indexOf("partnership/") !== 0) return;
    if (state.view === "partnership/embed" && !isPremiumActive()) return;
    if (state.saving) {
      state.autosavePending = true;
      return;
    }
    clearAutosaveTimer();
    // 0 = prossimo tick (toggle/select); >0 = aspetta che l'utente smetta di scrivere.
    var wait = typeof delayMs === "number" ? Math.max(0, delayMs) : 0;
    if (wait === 0) {
      state.autosaveTimer = null;
      savePartnership(false, { silent: true });
      return;
    }
    state.autosaveTimer = setTimeout(function () {
      state.autosaveTimer = null;
      savePartnership(false, { silent: true });
    }, wait);
  }

  function clearSettingsAutosaveTimer() {
    if (state.settingsAutosaveTimer) {
      clearTimeout(state.settingsAutosaveTimer);
      state.settingsAutosaveTimer = null;
    }
  }

  function scheduleSettingsAutosave(delayMs) {
    if (state.view !== "settings") return;
    if (state.settingsSaving) {
      state.settingsAutosavePending = true;
      return;
    }
    clearSettingsAutosaveTimer();
    var wait = typeof delayMs === "number" ? Math.max(0, delayMs) : TYPING_AUTOSAVE_MS;
    if (wait === 0) {
      state.settingsAutosaveTimer = null;
      saveSettings({ silent: true });
      return;
    }
    state.settingsAutosaveTimer = setTimeout(function () {
      state.settingsAutosaveTimer = null;
      saveSettings({ silent: true });
    }, wait);
  }

  function fillSelect(select, options, selectedId, emptyLabel) {
    if (!select) return;
    var rows = Array.isArray(options) ? options : [];
    var selected = selectedId ? String(selectedId) : "";
    var inheritDetail = null;
    var emptyText = emptyLabel;
    if (emptyLabel && typeof emptyLabel === "object") {
      inheritDetail =
        emptyLabel.inherit === false
          ? null
          : String(emptyLabel.detail != null ? emptyLabel.detail : emptyLabel.label || "").trim() ||
            "Usa impostazione globale";
      emptyText = inheritDetail;
    }
    var emptyAttrs =
      inheritDetail != null
        ? ' data-inherit="1" data-inherit-detail="' + esc(inheritDetail) + '"'
        : "";
    var html =
      '<option value=""' + emptyAttrs + ">" + esc(emptyText || i18n("dash.none", "— Nessuno —")) + "</option>";
    html += rows
      .map(function (row) {
        var id = String(row.id || "");
        var sel = id === selected ? " selected" : "";
        return '<option value="' + esc(id) + '"' + sel + ">" + esc(row.name || id) + "</option>";
      })
      .join("");
    select.innerHTML = html;
    if (!selected) select.value = "";
    refreshDashFancySelect(select);
  }

  function fillTicketCategorySelect(select, categories, selectedId) {
    if (!select) return;
    var rows = Array.isArray(categories) ? categories : [];
    var selected = selectedId ? String(selectedId) : "";
    var html = '<option value="">' + esc(i18n("dash.disabled", "Disabilitato")) + "</option>";
    html +=
      '<option value="__custom__"' +
      (selected === "__custom__" ? " selected" : "") +
      ">Custom</option>";
    html += rows
      .map(function (row) {
        var id = String(row.id || "");
        if (!id) return "";
        var sel = id === selected ? " selected" : "";
        return '<option value="' + esc(id) + '"' + sel + ">" + esc(row.name || id) + "</option>";
      })
      .join("");
    select.innerHTML = html;
    refreshDashFancySelect(select);
  }

  function scoreLiveTicketCategoryName(name, fancyFallback) {
    var n = String(name || "");
    var nl = n.toLowerCase();
    var fancy = String(fancyFallback || "");
    if (!n) return 0;
    if (fancy && n === fancy) return 100;
    if (fancy && nl === fancy.toLowerCase()) return 95;
    if (nl === "tickets") return 15;
    if (nl.indexOf("tickets") !== -1) return 80 + Math.min(10, Math.floor(n.length / 8));
    if (nl.indexOf("ticket") !== -1) return 40;
    return 0;
  }

  function findLiveTicketCategoryName(categories, preferredName, fancyFallback) {
    var rows = Array.isArray(categories) ? categories : [];
    var pref = String(preferredName || "").trim();
    var fancy = String(fancyFallback || (state.tickets && state.tickets.defaultDiscordCategoryName) || "").trim();
    var i;
    if (pref && pref.toLowerCase() !== "tickets") {
      for (i = 0; i < rows.length; i += 1) {
        if (String(rows[i].name || "") === pref) return String(rows[i].name);
      }
    }
    var best = "";
    var bestScore = 0;
    for (i = 0; i < rows.length; i += 1) {
      var n = String(rows[i].name || "");
      var score = scoreLiveTicketCategoryName(n, fancy);
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }
    if (best) return best;
    if (fancy) return fancy;
    return pref || "Tickets";
  }

  function fitTicketCategoryNameInput() {
    var el = byId("tk-categoryName");
    var wrap = byId("tk-categoryName-wrap");
    if (!el || !wrap || wrap.hidden) return;
    var val = String(el.value || "");
    var probe = document.createElement("span");
    probe.textContent = val || el.placeholder || "Tickets";
    var cs = window.getComputedStyle(el);
    probe.style.cssText =
      "position:absolute;visibility:hidden;white-space:pre;pointer-events:none;" +
      "font:" +
      cs.font +
      ";letter-spacing:" +
      cs.letterSpacing +
      ";padding:" +
      cs.padding +
      ";border:" +
      cs.border +
      ";box-sizing:border-box;";
    document.body.appendChild(probe);
    var w = Math.ceil(probe.getBoundingClientRect().width + 18);
    probe.remove();
    var minW = 22 * 16;
    var maxW = Math.max(minW, Math.floor((wrap.parentElement || wrap).getBoundingClientRect().width || minW));
    var finalW = Math.min(Math.max(w, minW), maxW);
    el.style.setProperty("--tk-cat-name-width", finalW + "px");
    el.style.width = finalW + "px";
  }

  function syncTicketCategoryNameVisibility() {
    var sel = byId("tk-ticketCategoryId");
    var wrap = byId("tk-categoryName-wrap");
    var combo = byId("tk-cat-combo");
    if (!wrap) return;
    var isCustom = sel && String(sel.value || "") === "__custom__";
    wrap.hidden = !isCustom;
    if (combo) {
      if (isCustom) combo.classList.add("is-custom");
      else combo.classList.remove("is-custom");
    }
    if (isCustom) {
      var pickers = state.ticketsPickers || state.pickers || state.settingsPickers || {};
      var current = String((byId("tk-categoryName") && byId("tk-categoryName").value) || "").trim();
      var fancy = (state.tickets && (state.tickets.categoryNameLive || state.tickets.defaultDiscordCategoryName)) || "";
      var live = findLiveTicketCategoryName(
        pickers.categories || [],
        current || (state.tickets && state.tickets.categoryName),
        fancy,
      );
      // Sovrascrivi sempre il placeholder "Tickets" col nome Discord reale.
      if (live && (current === "Tickets" || current.toLowerCase() === "tickets" || !current || current !== live)) {
        if (current === "Tickets" || current.toLowerCase() === "tickets" || !current || scoreLiveTicketCategoryName(live, fancy) > scoreLiveTicketCategoryName(current, fancy)) {
          setValue("tk-categoryName", live);
        }
      }
      var nameInput = byId("tk-categoryName");
      if (nameInput && !nameInput._tkCatNameFitBound) {
        nameInput._tkCatNameFitBound = true;
        nameInput.addEventListener("input", fitTicketCategoryNameInput);
      }
      window.requestAnimationFrame(fitTicketCategoryNameInput);
    }
  }

  function pickersFingerprint(pickers) {
    try {
      var p = pickers || {};
      var ids = []
        .concat((p.textChannels || []).map(function (r) { return "c:" + r.id; }))
        .concat((p.voiceChannels || []).map(function (r) { return "v:" + r.id; }))
        .concat((p.categories || []).map(function (r) { return "k:" + r.id; }))
        .concat((p.roles || []).map(function (r) { return "r:" + r.id; }));
      return ids.join("|");
    } catch (e) {
      return "";
    }
  }

  function applyPartnershipPickers(pickers) {
    if (!pickers || typeof pickers !== "object") return;
    state.pickers = pickers;
    var text = pickers.textChannels || [];
    var roles = pickers.roles || [];
    var keep = function (id, options, emptyLabel) {
      var el = byId(id);
      if (!el) return;
      fillSelect(el, options, String(el.value || ""), emptyLabel);
    };
    keep("ps-partnershipsChannelId", text, i18n("dash.selectChannelOpt", "— Seleziona canale —"));
    keep("ps-logsChannelId", text);
    keep("ps-partnerManagerRoleId", roles, i18n("dash.selectRoleOpt", "— Seleziona ruolo —"));
    keep("ps-managerBadgeRoleId", roles);
    keep("ps-customRoleId", roles);
    keep("ps-partnerDescChannelId", text);
    keep("ps-mig-channelId", text, i18n("dash.selectChannelOpt", "— Seleziona canale —"));
    keep("ps-mig-logsChannelId", text);
    keep("ps-mig-roleId", roles, i18n("dash.selectRoleOpt", "— Seleziona ruolo —"));
    keep("ps-wz-partnershipsChannelId", text, i18n("dash.selectChannelOpt", "— Seleziona canale —"));
    keep("ps-wz-logsChannelId", text);
    keep("ps-wz-partnerManagerRoleId", roles, i18n("dash.selectRoleOpt", "— Seleziona ruolo —"));
    keep("ps-wz-customRoleId", roles);
    syncPsZoneHiddenSelects();
    renderPsZoneTokenField();
    syncWizardNavEnabled();
  }

  async function refreshPartnershipPickers(opts) {
    opts = opts || {};
    if (!state.guildId || !state.partnership) return false;
    if (state.pickersRefreshing) return false;
    var minGap = opts.force === true ? 0 : 2500;
    if (minGap && Date.now() - Number(state.pickersLastFreshAt || 0) < minGap) return false;
    var token = getToken();
    if (!token) return false;
    state.pickersRefreshing = true;
    try {
      var url =
        resolveApiBase() +
        "/guilds/" +
        encodeURIComponent(state.guildId) +
        "/partnership?fresh=1";
      var res = await fetch(url, {
        method: "GET",
        headers: { Authorization: "Bearer " + token },
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false || !data.pickers) return false;
      state.pickersLastFreshAt = Date.now();
      var before = pickersFingerprint(state.pickers);
      var after = pickersFingerprint(data.pickers);
      if (before !== after || opts.force === true) {
        applyPartnershipPickers(data.pickers);
      } else {
        state.pickers = data.pickers;
      }
      return true;
    } catch (e) {
      return false;
    } finally {
      state.pickersRefreshing = false;
    }
  }

  function stopPartnershipPickersPoll() {
    if (state.pickersPollTimer) {
      clearInterval(state.pickersPollTimer);
      state.pickersPollTimer = null;
    }
  }

  function startPartnershipPickersPoll() {
    if (state.pickersPollTimer) return;
    state.pickersPollTimer = setInterval(function () {
      if (String(state.view || "").indexOf("partnership/") !== 0) {
        stopPartnershipPickersPoll();
        return;
      }
      if (document.visibilityState === "hidden") return;
      refreshPartnershipPickers({ force: false });
    }, 8000);
  }

  function clearDashSelectMenuPosition(menu) {
    if (!menu) return;
    menu.classList.remove("is-fixed-pos");
    menu.style.position = "";
    menu.style.left = "";
    menu.style.right = "";
    menu.style.top = "";
    menu.style.bottom = "";
    menu.style.width = "";
    menu.style.maxHeight = "";
    menu.style.zIndex = "";
  }

  function restoreDashSelectMenu(menu) {
    if (!menu) return;
    clearDashSelectMenuPosition(menu);
    var home = menu.__vcHomeParent;
    if (home && home.isConnected && menu.parentElement !== home) {
      home.appendChild(menu);
      return;
    }
    // Home distrutto (es. re-render campi form): togli il portale orfano dal body.
    if ((!home || !home.isConnected) && menu.parentNode) {
      menu.parentNode.removeChild(menu);
    }
  }

  function portalDashSelectMenu(root, menu) {
    if (!menu || !root) return;
    if (!menu.__vcHomeParent) menu.__vcHomeParent = root;
    if (menu.parentElement !== document.body) {
      document.body.appendChild(menu);
    }
  }

  function scrollDashSelectMenuToSelected(menu) {
    if (!menu) return;
    var selected = menu.querySelector(".vc-dash-select__option.is-selected");
    if (!selected) return;
    try {
      selected.scrollIntoView({ block: "nearest", inline: "nearest" });
    } catch (_) {
      try {
        var menuRect = menu.getBoundingClientRect();
        var optRect = selected.getBoundingClientRect();
        if (optRect.top < menuRect.top || optRect.bottom > menuRect.bottom) {
          menu.scrollTop += optRect.top - menuRect.top - menuRect.height / 2 + optRect.height / 2;
        }
      } catch (__) {}
    }
  }

  function positionDashSelectMenu(root, menu, trigger) {
    if (!menu || !trigger) return;
    portalDashSelectMenu(root, menu);
    var rect = trigger.getBoundingClientRect();
    var gap = 6;
    var spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - 8);
    var spaceAbove = Math.max(0, rect.top - gap - 8);
    var preferUp = spaceBelow < 200 && spaceAbove > spaceBelow;
    var available = preferUp ? spaceAbove : spaceBelow;
    var maxH = Math.max(140, Math.min(320, available));

    menu.classList.add("is-fixed-pos");
    menu.style.position = "fixed";
    menu.style.left = Math.max(8, Math.min(window.innerWidth - 8 - Math.round(rect.width), Math.round(rect.left))) + "px";
    menu.style.width = Math.max(120, Math.round(rect.width)) + "px";
    menu.style.right = "auto";
    menu.style.zIndex = "10350";
    menu.style.maxHeight = maxH + "px";
    if (preferUp) {
      menu.style.top = "auto";
      menu.style.bottom = Math.max(8, Math.round(window.innerHeight - rect.top + gap)) + "px";
    } else {
      menu.style.bottom = "auto";
      menu.style.top = Math.round(rect.bottom + gap) + "px";
    }
  }

  function closeAllDashFancySelects(exceptRoot) {
    var open = document.querySelectorAll(".vc-dash-select.is-open");
    Array.prototype.forEach.call(open, function (root) {
      if (exceptRoot && root === exceptRoot) return;
      root.classList.remove("is-open");
      var btn = root.querySelector(".vc-dash-select__trigger");
      var menu = root.__vcDashMenu || root.querySelector(".vc-dash-select__menu");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (menu) {
        menu.setAttribute("hidden", "");
        restoreDashSelectMenu(menu);
      }
    });
    // Menu portati su body restati aperti dopo un wipe del DOM.
    Array.prototype.forEach.call(document.querySelectorAll("body > .vc-dash-select__menu"), function (menu) {
      var home = menu.__vcHomeParent;
      if (exceptRoot && home === exceptRoot) return;
      if (home && home.isConnected && home.classList.contains("is-open")) return;
      menu.setAttribute("hidden", "");
      restoreDashSelectMenu(menu);
    });
  }

  function dashFancySelectIsClearable(select) {
    if (!select || !select.options || !select.options.length) return false;
    if (select.getAttribute("data-clearable") === "1" || select.dataset.clearable === "1") return true;
    var empty = null;
    for (var i = 0; i < select.options.length; i++) {
      if (!String(select.options[i].value || "")) {
        empty = select.options[i];
        break;
      }
    }
    if (!empty) return false;
    if (empty.getAttribute("data-inherit") === "1") return true;
    var label = String(empty.textContent || "").trim().toLowerCase();
    // Placeholder obbligatori ("— Seleziona …") non devono essere riselezionabili.
    if (/seleziona|select\b/.test(label)) return false;
    return true;
  }

  function dashFancySelectInheritDetail(opt) {
    if (!opt || opt.getAttribute("data-inherit") !== "1") return null;
    var detail = String(opt.getAttribute("data-inherit-detail") || "").trim();
    if (detail) return detail;
    return String(opt.textContent || "").trim() || null;
  }

  function dashFancySelectInheritHtml(detail) {
    var d = String(detail || "").trim();
    return (
      '<span class="vc-dash-select__inherit">' +
      '<span class="vc-dash-select__badge">Globale</span>' +
      (d
        ? '<span class="vc-dash-select__option-text">' + esc(d) + "</span>"
        : '<span class="vc-dash-select__option-text">Usa impostazione globale</span>') +
      "</span>"
    );
  }

  function dashFancySelectValueLabel(select) {
    if (!select || !select.options || !select.options.length) {
      return i18n("dash.selectPlaceholder", "Seleziona…");
    }
    var opt = select.options[select.selectedIndex];
    if (!opt) return i18n("dash.selectPlaceholder", "Seleziona…");
    var inheritDetail = dashFancySelectInheritDetail(opt);
    if (inheritDetail != null && !String(opt.value || "")) {
      return inheritDetail;
    }
    var label = String(opt.textContent || "").trim();
    if (!label) return i18n("dash.selectPlaceholder", "Seleziona…");
    return label;
  }

  function refreshDashFancySelect(select) {
    if (!select || select.multiple || select.hasAttribute("hidden")) return;
    if (!select.closest || !select.closest(".vc-dash-picker")) return;
    ensureDashFancySelect(select);
    var root = select.closest(".vc-dash-select");
    if (!root) return;
    var valueEl = root.querySelector(".vc-dash-select__value");
    var menu = root.__vcDashMenu || root.querySelector(".vc-dash-select__menu");
    if (!valueEl || !menu) return;

    var selectedOpt = select.options[select.selectedIndex] || null;
    var selectedInherit = dashFancySelectInheritDetail(selectedOpt);
    var isInheritSelected = Boolean(selectedInherit != null && !String(select.value || ""));
    if (isInheritSelected) {
      valueEl.innerHTML = dashFancySelectInheritHtml(selectedInherit);
      valueEl.classList.remove("is-placeholder");
      valueEl.classList.add("is-inherit");
    } else {
      valueEl.textContent = dashFancySelectValueLabel(select);
      valueEl.classList.toggle("is-placeholder", !select.value);
      valueEl.classList.remove("is-inherit");
    }

    var clearable = dashFancySelectIsClearable(select);
    var realCount = 0;
    Array.prototype.forEach.call(select.options || [], function (opt) {
      if (String(opt.value || "")) realCount += 1;
    });
    var html = "";
    Array.prototype.forEach.call(select.options, function (opt) {
      var val = String(opt.value || "");
      // Placeholder obbligatori: solo sul trigger se ci sono voci reali.
      // Lista vuota → mostra il placeholder anche nel menu (come TicketsBot / foto empty).
      if (!val && !clearable && realCount > 0) return;
      var inheritDetail = dashFancySelectInheritDetail(opt);
      var text = String(opt.textContent || "").trim() || (val ? val : i18n("dash.none", "— Nessuno —"));
      var selected = !val
        ? !String(select.value || "")
        : opt.selected || String(select.value || "") === val;
      var emptyOnly = !val && realCount === 0;
      var inner =
        inheritDetail != null && !val
          ? dashFancySelectInheritHtml(inheritDetail)
          : '<span class="vc-dash-select__option-text">' + esc(text) + "</span>";
      html +=
        '<button type="button" class="vc-dash-select__option' +
        (selected ? " is-selected" : "") +
        (!val ? " is-empty" : "") +
        (emptyOnly ? " is-empty-only" : "") +
        (inheritDetail != null && !val ? " is-inherit" : "") +
        '" role="option" data-value="' +
        esc(val) +
        '"' +
        (!val ? ' data-clear="1"' : "") +
        (emptyOnly ? " disabled aria-disabled=\"true\"" : "") +
        ' aria-selected="' +
        (selected ? "true" : "false") +
        '">' +
        inner +
        "</button>";
    });
    // Fallback: nessun option renderizzato → comunque placeholder selezionato.
    if (!html) {
      var ph = dashFancySelectValueLabel(select);
      html =
        '<button type="button" class="vc-dash-select__option is-selected is-empty is-empty-only" role="option" data-value="" data-clear="1" disabled aria-disabled="true" aria-selected="true">' +
        '<span class="vc-dash-select__option-text">' +
        esc(ph) +
        "</span></button>";
    }
    menu.innerHTML = html;
    root.classList.toggle("is-empty-list", realCount === 0);
  }

  function enhanceAllDashFancySelects(root) {
    var scope = root && root.querySelectorAll ? root : document;
    Array.prototype.forEach.call(scope.querySelectorAll(".vc-dash-picker select"), function (select) {
      if (!select || select.multiple || select.hasAttribute("hidden")) return;
      if (select.getAttribute("aria-hidden") === "true" && select.id && select.id.indexOf("pmCommands") >= 0) {
        return;
      }
      refreshDashFancySelect(select);
    });
  }

  function ensureDashFancySelect(select) {
    if (!select || select.__vcDashFancy) return;
    if (select.multiple || select.hasAttribute("hidden")) return;
    if (!select.closest || !select.closest(".vc-dash-picker")) return;

    var picker = select.closest(".vc-dash-picker");
    // Evita che <label> riapra il select nativo / focus fantasma sul control nascosto.
    if (picker && picker.tagName === "LABEL") {
      var divPicker = document.createElement("div");
      divPicker.className = picker.className;
      if (picker.id) divPicker.id = picker.id;
      Array.prototype.forEach.call(picker.attributes, function (attr) {
        if (!attr || !attr.name) return;
        if (attr.name === "class" || attr.name === "id" || attr.name === "for") return;
        divPicker.setAttribute(attr.name, attr.value);
      });
      while (picker.firstChild) divPicker.appendChild(picker.firstChild);
      picker.parentNode.replaceChild(divPicker, picker);
      picker = divPicker;
    }

    var root = document.createElement("div");
    root.className = "vc-dash-select";
    select.parentNode.insertBefore(root, select);
    root.appendChild(select);
    select.classList.add("vc-dash-select__native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");
    try {
      select.style.setProperty("pointer-events", "none", "important");
    } catch (ePe) {}

    var trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "vc-dash-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML =
      '<span class="vc-dash-select__value is-placeholder"></span>' +
      '<span class="vc-dash-select__chev" aria-hidden="true"><i class="fa fa-chevron-down"></i></span>';

    var menu = document.createElement("div");
    menu.className = "vc-dash-select__menu";
    menu.setAttribute("role", "listbox");
    menu.setAttribute("hidden", "");

    root.appendChild(trigger);
    root.appendChild(menu);
    root.__vcDashMenu = menu;
    menu.__vcHomeParent = root;
    select.__vcDashFancy = true;

    trigger.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var open = root.classList.contains("is-open");
      closeAllDashFancySelects(open ? null : root);
      if (open) {
        root.classList.remove("is-open");
        trigger.setAttribute("aria-expanded", "false");
        menu.setAttribute("hidden", "");
        restoreDashSelectMenu(menu);
        return;
      }

      function openMenu() {
        refreshDashFancySelect(select);
        root.classList.add("is-open");
        trigger.setAttribute("aria-expanded", "true");
        menu.removeAttribute("hidden");
        positionDashSelectMenu(root, menu, trigger);
        requestAnimationFrame(function () {
          positionDashSelectMenu(root, menu, trigger);
          scrollDashSelectMenuToSelected(menu);
          requestAnimationFrame(function () {
            scrollDashSelectMenuToSelected(menu);
          });
        });
      }

      function onReposition() {
        if (!root.classList.contains("is-open")) return;
        positionDashSelectMenu(root, menu, trigger);
      }
      if (!root.__vcDashSelectPosWired) {
        root.__vcDashSelectPosWired = true;
        window.addEventListener("resize", onReposition, { passive: true });
        window.addEventListener("scroll", onReposition, true);
      }

      // Prima di aprire canali/ruoli partnership: rileggi da Discord (canali appena creati).
      var sid = String(select.id || "");
      var needsFresh =
        sid.indexOf("ps-") === 0 &&
        (sid.indexOf("Channel") !== -1 ||
          sid.indexOf("Role") !== -1 ||
          sid === "ps-customRoleId" ||
          sid.indexOf("ps-wz-") === 0 ||
          sid.indexOf("ps-mig-") === 0);
      if (needsFresh && state.partnership) {
        trigger.classList.add("is-loading");
        refreshPartnershipPickers({ force: true })
          .catch(function () {})
          .finally(function () {
            trigger.classList.remove("is-loading");
            openMenu();
          });
        return;
      }
      openMenu();
    });

    menu.addEventListener("click", function (ev) {
      var opt = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-select__option") : null;
      if (!opt || !menu.contains(opt)) return;
      ev.preventDefault();
      ev.stopPropagation();
      var clear = opt.getAttribute("data-clear") === "1";
      var next = String(opt.getAttribute("data-value") || "");
      if (!next && !clear) return;
      var changed = String(select.value || "") !== next;
      // Chiudi prima del change: un handler che fa re-render non deve lasciare il menu orfano su body.
      closeAllDashFancySelects();
      if (changed) {
        select.value = next;
        try {
          select.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (e) {
          var legacy = document.createEvent("HTMLEvents");
          legacy.initEvent("change", true, false);
          select.dispatchEvent(legacy);
        }
      }
      // Aggiorna il trigger se il select è ancora nel DOM (change può averlo distrutto).
      if (select.isConnected) refreshDashFancySelect(select);
    });
  }

  function wireDashFancySelects() {
    if (document.documentElement.__vcDashFancySelectWired) return;
    document.documentElement.__vcDashFancySelectWired = true;
    document.addEventListener(
      "mousedown",
      function (ev) {
        var t = ev.target;
        if (!t || t.tagName !== "SELECT") return;
        if (!t.closest || !t.closest(".vc-dash-picker")) return;
        if (t.multiple || t.hasAttribute("hidden")) return;
        // Se ancora non è stato wrappato, promuovi subito al fancy e apri quello.
        if (!t.__vcDashFancy) {
          ev.preventDefault();
          refreshDashFancySelect(t);
          var root = t.closest(".vc-dash-select");
          var trigger = root && root.querySelector(".vc-dash-select__trigger");
          if (trigger) {
            requestAnimationFrame(function () {
              if (root && !root.classList.contains("is-open")) trigger.click();
            });
          }
          return;
        }
        // Già fancy: non lasciare aprire il menù nativo.
        ev.preventDefault();
      },
      true,
    );
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (t && t.tagName === "SELECT" && t.classList.contains("vc-dash-select__native")) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        if (
          t &&
          t.closest &&
          (t.closest(".vc-dash-select") || t.closest(".vc-dash-select__menu"))
        ) {
          return;
        }
        closeAllDashFancySelects();
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closeAllDashFancySelects();
    });
    enhanceAllDashFancySelects(document);
  }

  function isPsZoneCategoryId(id) {
    var pickers = state.pickers || {};
    var sid = String(id || "");
    if (!sid) return false;
    return cmdPickerLabel(pickers.categories || [], sid) !== sid;
  }

  function countTextChannelsInCategory(catId) {
    var cid = String(catId || "");
    if (!cid) return 0;
    var channels = (state.pickers && state.pickers.textChannels) || [];
    var n = 0;
    for (var i = 0; i < channels.length; i++) {
      if (String(channels[i].parentId || "") === cid) n += 1;
    }
    return n;
  }

  function psZoneCategoryChannelCount(id) {
    if (!isPsZoneCategoryId(id)) return 0;
    return countTextChannelsInCategory(id);
  }

  function updatePsZoneCount() {
    /* Contatore rimosso: nessun limite sul numero di canali/categorie. */
  }

  function fillMultiSelect(select, options, selectedIds) {
    if (!select) return;
    var want = {};
    (Array.isArray(selectedIds) ? selectedIds : []).forEach(function (id) {
      want[String(id)] = true;
    });
    var rows = Array.isArray(options) ? options : [];
    select.innerHTML = rows
      .map(function (row) {
        var id = String(row.id || "");
        var sel = want[id] ? " selected" : "";
        return '<option value="' + esc(id) + '"' + sel + ">" + esc(row.name || id) + "</option>";
      })
      .join("");
  }

  function psZoneTokenLabel(id) {
    var pickers = state.pickers || {};
    var sid = String(id || "");
    var catName = cmdPickerLabel(pickers.categories || [], sid);
    if (catName !== sid) {
      return i18n("dash.cmds.categoryChip", "Categoria: {name}").replace("{name}", catName);
    }
    var chName = cmdPickerLabel(pickers.textChannels || [], sid);
    return chName !== sid ? "#" + chName : sid;
  }

  function collectPsZonePayload() {
    var ids = Array.isArray(state.psZoneIds) ? state.psZoneIds : [];
    var textSet = {};
    ((state.pickers && state.pickers.textChannels) || []).forEach(function (row) {
      if (row && row.id) textSet[String(row.id)] = true;
    });
    var channelId = null;
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i] || "").trim();
      if (id && textSet[id]) {
        channelId = id;
        break;
      }
    }
    var categoryIds = ids.filter(function (raw) {
      var id = String(raw || "").trim();
      return id && id !== channelId;
    });
    return { pmCommandsChannelId: channelId, pmCommandsCategoryIds: categoryIds };
  }

  function syncPsZoneHiddenSelects() {
    var payload = collectPsZonePayload();
    var pickers = state.pickers || {};
    var text = pickers.textChannels || [];
    var cats = pickers.categories || [];
    fillSelect(byId("ps-pmCommandsChannelId"), text, payload.pmCommandsChannelId || "");
    fillMultiSelect(
      byId("ps-pmCommandsCategoryIds"),
      cats.concat(text),
      payload.pmCommandsCategoryIds,
    );
    updatePsZoneCount();
  }

  function setPsZoneIds(ids) {
    var seen = {};
    var out = [];
    (Array.isArray(ids) ? ids : []).forEach(function (raw) {
      var id = String(raw || "").trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    state.psZoneIds = out;
    syncPsZoneHiddenSelects();
    renderPsZoneTokenField();
  }

  function closePsZoneMenus(exceptField) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-ps-zone-token]"), function (field) {
      if (exceptField && field === exceptField) return;
      var menu = field.querySelector("[data-ps-zone-menu]");
      var search = field.querySelector("[data-ps-zone-search]");
      if (menu) menu.setAttribute("hidden", "");
      field.classList.remove("is-open");
      if (search) search.value = "";
    });
  }

  function renderPsZoneTokenField() {
    var field = document.querySelector("[data-ps-zone-token]");
    if (!field) return;
    var chipsHost = field.querySelector("[data-ps-zone-chips]");
    var menu = field.querySelector("[data-ps-zone-menu]");
    var search = field.querySelector("[data-ps-zone-search]");
    var ids = Array.isArray(state.psZoneIds) ? state.psZoneIds : [];
    var pickers = state.pickers || {};
    var chipsHtml = "";
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i]);
      var isCategoryChip = cmdPickerLabel(pickers.categories || [], id) !== id;
      var catChCount = isCategoryChip ? psZoneCategoryChannelCount(id) : 0;
      var chipExtra =
        isCategoryChip && catChCount > 0
          ? " · " + i18n("dash.ps.pmZoneCatChannels", "{n} canali").replace("{n}", String(catChCount))
          : "";
      chipsHtml +=
        '<button type="button" class="vc-dash-token-chip' +
        (isCategoryChip ? " vc-dash-token-chip--category" : "") +
        '" data-ps-zone-remove="' +
        esc(id) +
        '">' +
        esc(psZoneTokenLabel(id)) +
        esc(chipExtra) +
        ' <span aria-hidden="true">×</span></button>';
    }
    if (chipsHost) chipsHost.innerHTML = chipsHtml;
    updatePsZoneCount();
    if (!menu) return;
    var q = search ? search.value : "";
    var grouped = buildGroupedChannelOptions(ids, q, pickers);
    var menuHtml = "";
    if (!grouped.order.length) {
      menuHtml =
        '<p class="vc-dash-token-field__empty">' +
        esc(i18n("dash.cmds.noOptions", "Nessuna opzione disponibile.")) +
        "</p>";
    } else {
      for (var g = 0; g < grouped.order.length; g++) {
        var groupKey = grouped.order[g];
        var group = grouped.groups[groupKey] || { name: groupKey, channels: [] };
        var catId = group.id ? String(group.id) : "";
        var catSelected = Boolean(catId && grouped.selected[catId]);
        var catChCount = catId ? psZoneCategoryChannelCount(catId) : 0;
        if (catId && !catSelected) {
          menuHtml +=
            '<button type="button" class="vc-dash-token-field__group vc-dash-token-field__group--btn" data-ps-zone-add="' +
            esc(catId) +
            '" title="' +
            esc(i18n("dash.cmds.selectCategory", "Seleziona tutta la categoria")) +
            '">' +
            esc(group.name) +
            (catChCount > 0
              ? " · " +
                i18n("dash.ps.pmZoneCatChannels", "{n} canali").replace("{n}", String(catChCount))
              : "") +
            "</button>";
        } else {
          menuHtml +=
            '<p class="vc-dash-token-field__group' +
            (catSelected ? " is-selected" : "") +
            '">' +
            esc(group.name) +
            (catSelected ? " ✓" : "") +
            (catSelected && catChCount > 0
              ? " · " +
                i18n("dash.ps.pmZoneCatChannels", "{n} canali").replace("{n}", String(catChCount))
              : "") +
            "</p>";
        }
        var items = group.channels || [];
        for (var j = 0; j < items.length; j++) {
          if (catSelected) continue;
          menuHtml +=
            '<button type="button" class="vc-dash-token-field__option" data-ps-zone-add="' +
            esc(items[j].id) +
            '">#' +
            esc(items[j].name) +
            "</button>";
        }
      }
    }
    menu.innerHTML = menuHtml;
  }

  function addPsZoneId(id) {
    var sid = String(id || "").trim();
    if (!sid) return;
    var ids = Array.isArray(state.psZoneIds) ? state.psZoneIds.slice() : [];
    if (ids.indexOf(sid) >= 0) return;
    ids.push(sid);
    setPsZoneIds(ids);
  }

  function removePsZoneId(id) {
    var sid = String(id || "").trim();
    setPsZoneIds(
      (Array.isArray(state.psZoneIds) ? state.psZoneIds : []).filter(function (x) {
        return String(x) !== sid;
      }),
    );
  }

  function wirePsZoneTokenField() {
    var form = byId("vc-dashboard-partnership-form");
    if (!form || form.__vcPsZoneWired) return;
    form.__vcPsZoneWired = true;

    form.addEventListener("click", function (ev) {
      var field = ev.target && ev.target.closest ? ev.target.closest("[data-ps-zone-token]") : null;
      var removeBtn = ev.target && ev.target.closest ? ev.target.closest("[data-ps-zone-remove]") : null;
      if (removeBtn && field) {
        ev.preventDefault();
        removePsZoneId(String(removeBtn.getAttribute("data-ps-zone-remove") || ""));
        scheduleAutosave(0);
        return;
      }
      var addBtn = ev.target && ev.target.closest ? ev.target.closest("[data-ps-zone-add]") : null;
      if (addBtn && field) {
        ev.preventDefault();
        addPsZoneId(String(addBtn.getAttribute("data-ps-zone-add") || ""));
        var searchEl = field.querySelector("[data-ps-zone-search]");
        if (searchEl) searchEl.value = "";
        renderPsZoneTokenField();
        scheduleAutosave(0);
        return;
      }
      var onMenu = ev.target && ev.target.closest ? ev.target.closest("[data-ps-zone-menu]") : null;
      if (onMenu) return;
      var onBox = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-token-field__box") : null;
      if (onBox && field) {
        var onSearch =
          ev.target && ev.target.closest ? ev.target.closest("[data-ps-zone-search]") : null;
        if (!onSearch) {
          var searchFocus = field.querySelector("[data-ps-zone-search]");
          if (searchFocus) searchFocus.focus();
        }
        closePsZoneMenus(field);
        var menu = field.querySelector("[data-ps-zone-menu]");
        var search = field.querySelector("[data-ps-zone-search]");
        if (menu) menu.removeAttribute("hidden");
        field.classList.add("is-open");
        if (search) search.focus();
        renderPsZoneTokenField();
        return;
      }
      if (!field) closePsZoneMenus();
    });

    form.addEventListener("input", function (ev) {
      var search = ev.target && ev.target.closest ? ev.target.closest("[data-ps-zone-search]") : null;
      if (!search) return;
      var field = search.closest("[data-ps-zone-token]");
      if (!field) return;
      var menu = field.querySelector("[data-ps-zone-menu]");
      if (menu) menu.removeAttribute("hidden");
      field.classList.add("is-open");
      renderPsZoneTokenField();
    });

    document.addEventListener(
      "click",
      function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest("[data-ps-zone-token]")) return;
        closePsZoneMenus();
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") closePsZoneMenus();
    });
  }

  function clearFeatControls(panel) {
    if (!panel) return;
    Array.prototype.forEach.call(panel.querySelectorAll("select, input, textarea"), function (el) {
      if (el.type === "checkbox") {
        if (el.closest(".vc-dash-chip")) {
          el.checked = false;
          var chip = el.closest(".vc-dash-chip");
          if (chip) chip.classList.remove("is-selected");
        }
        return;
      }
      if (el.type === "hidden") return;
      if (el.tagName === "SELECT" && el.multiple) {
        Array.prototype.forEach.call(el.options, function (opt) {
          opt.selected = false;
        });
        return;
      }
      if (el.tagName === "SELECT") {
        el.value = "";
        return;
      }
      el.value = "";
    });
    if (panel.querySelector("[data-ps-zone-token]")) {
      state.psZoneIds = [];
      syncPsZoneHiddenSelects();
      renderPsZoneTokenField();
    }
  }

  var EMBED_PLACEHOLDER_GROUPS = [
    {
      titleKey: "dash.ps.embedPhGroupServer",
      titleFallback: "Server",
      tokens: [
        "{guild}",
        "{server}",
        "{guild.name}",
        "{server.name}",
        "{guild.id}",
        "{server.id}",
        "{guild.link}",
        "{server.link}",
      ],
    },
    {
      titleKey: "dash.ps.embedPhGroupPartner",
      titleFallback: "Server partner",
      tokens: ["{partner}", "{partner.name}"],
    },
    {
      titleKey: "dash.ps.embedPhGroupUser",
      titleFallback: "Utente",
      tokens: [
        "{user}",
        "{user.id}",
        "{user.username}",
        "{user.tag}",
        "{user.points}",
        "{user.partnerships.count}",
        "{user.partnerships.week}",
        "{user.partnerships.day}",
      ],
    },
    {
      titleKey: "dash.ps.embedPhGroupManager",
      titleFallback: "Manager",
      tokens: ["{manager}", "{manager.id}", "{manager.username}", "{manager.tag}"],
    },
    {
      titleKey: "dash.ps.embedPhGroupMedia",
      titleFallback: "Immagini e icone",
      tokens: [
        "{user.avatar}",
        "{guild.icon}",
        "{server.icon}",
        "{partner.icon}",
        "{manager.avatar}",
      ],
    },
    {
      titleKey: "dash.ps.embedPhGroupMore",
      titleFallback: "Ping e altro",
      tokens: ["{ping}", "{pings}", "{timestamp}", "{points}"],
    },
  ];

  var EMBED_TEXT_FIELD_IDS = [
    "ps-embedTitle",
    "ps-embedAuthorName",
    "ps-embedAuthorIconUrl",
    "ps-embedThumbnailUrl",
    "ps-embedImageUrl",
    "ps-embedFooterText",
    "ps-embedFooterIconUrl",
    "ps-embedDescription",
  ];

  function isEmbedTextField(el) {
    if (!el) return false;
    if (el.getAttribute && el.getAttribute("data-ps-embed-field") != null) return true;
    return Boolean(el.id && EMBED_TEXT_FIELD_IDS.indexOf(el.id) >= 0);
  }

  function isEmbedUrlField(el) {
    return Boolean(el && el.getAttribute && el.getAttribute("data-ps-embed-url") != null);
  }

  function rememberEmbedTextField(el) {
    if (!isEmbedTextField(el)) return;
    state.embedPhLastFieldId = el.id;
    state.embedPhLastField = el;
    try {
      state.embedPhLastStart =
        typeof el.selectionStart === "number" ? el.selectionStart : String(el.value || "").length;
      state.embedPhLastEnd =
        typeof el.selectionEnd === "number" ? el.selectionEnd : state.embedPhLastStart;
    } catch (e) {
      var len = String(el.value || "").length;
      state.embedPhLastStart = len;
      state.embedPhLastEnd = len;
    }
  }

  function resolveEmbedTextField() {
    var active = document.activeElement;
    if (isEmbedTextField(active)) {
      rememberEmbedTextField(active);
      return active;
    }
    if (state.embedPhLastField && state.embedPhLastField.isConnected && isEmbedTextField(state.embedPhLastField)) {
      return state.embedPhLastField;
    }
    var id = String(state.embedPhLastFieldId || "").trim();
    if (id) {
      var byIdEl = byId(id);
      if (isEmbedTextField(byIdEl)) return byIdEl;
    }
    var marked = document.querySelector("[data-ps-embed-field].is-ph-target");
    if (isEmbedTextField(marked)) return marked;
    return null;
  }

  function markEmbedPhTarget(el) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-ps-embed-field].is-ph-target"), function (node) {
      node.classList.remove("is-ph-target");
    });
    if (el && el.classList) el.classList.add("is-ph-target");
  }

  function embedPlaceholderHint(token) {
    var key = "dash.ps.embedPh." + String(token || "").replace(/^\{|\}$/g, "");
    return i18n(key, token);
  }

  function renderEmbedPlaceholders() {
    var body = document.querySelector("[data-ps-ph-body]");
    if (!body) return;
    // Rirender se i gruppi cambiano dopo un deploy (evita lista stale).
    var sig = EMBED_PLACEHOLDER_GROUPS.map(function (g) {
      return g.titleKey + ":" + g.tokens.join(",");
    }).join("|");
    if (body.__vcPhSig === sig && body.__vcPhRendered) return;
    body.__vcPhSig = sig;
    body.__vcPhRendered = true;
    var html = "";
    for (var g = 0; g < EMBED_PLACEHOLDER_GROUPS.length; g++) {
      var group = EMBED_PLACEHOLDER_GROUPS[g];
      html +=
        '<div class="vc-dash-ph__group">' +
        '<span class="vc-dash-ph__group-title">' +
        esc(i18n(group.titleKey, group.titleFallback)) +
        "</span>" +
        '<div class="vc-dash-ph__chips">';
      for (var t = 0; t < group.tokens.length; t++) {
        var token = group.tokens[t];
        html +=
          '<button type="button" class="vc-dash-ph__chip" data-ps-ph="' +
          esc(token) +
          '" title="' +
          esc(embedPlaceholderHint(token)) +
          '">' +
          esc(token) +
          "</button>";
      }
      html += "</div></div>";
    }
    body.innerHTML = html;
  }

  function insertEmbedPlaceholder(token) {
    var tok = String(token || "");
    if (!tok) return false;
    var el = resolveEmbedTextField();
    if (!el) {
      setError(
        i18n(
          "dash.ps.embedPhNoField",
          "Seleziona prima un campo (titolo, autore, URL immagini, footer o descrizione).",
        ),
      );
      return false;
    }
    var value = String(el.value || "");
    var replaceAll = isEmbedUrlField(el);
    var start;
    var end;
    if (replaceAll) {
      start = 0;
      end = value.length;
    } else if (document.activeElement === el && typeof el.selectionStart === "number") {
      start = el.selectionStart;
      end = typeof el.selectionEnd === "number" ? el.selectionEnd : start;
    } else {
      start = Number.isFinite(state.embedPhLastStart) ? state.embedPhLastStart : value.length;
      end = Number.isFinite(state.embedPhLastEnd) ? state.embedPhLastEnd : start;
    }
    start = Math.max(0, Math.min(value.length, Number(start) || 0));
    end = Math.max(start, Math.min(value.length, Number(end) || start));
    var max = Number(el.maxLength) > 0 ? Number(el.maxLength) : 0;
    var next = value.slice(0, start) + tok + value.slice(end);
    if (max && next.length > max) next = next.slice(0, max);
    el.value = next;
    var caret = Math.min(start + tok.length, next.length);
    try {
      el.focus({ preventScroll: true });
      el.setSelectionRange(caret, caret);
    } catch (e) {
      try {
        el.focus();
      } catch (e2) {}
    }
    rememberEmbedTextField(el);
    markEmbedPhTarget(el);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  function wireEmbedPlaceholders() {
    var root = byId("ps-embed-placeholders");
    if (!root) return;
    renderEmbedPlaceholders();
    if (root.__vcEmbedPhWired) return;
    root.__vcEmbedPhWired = true;

    var form = byId("vc-dashboard-partnership-form") || document;
    if (!form.__vcEmbedPhFocusWired) {
      form.__vcEmbedPhFocusWired = true;
      var rememberFromEvent = function (ev) {
        var t = ev && ev.target;
        if (!isEmbedTextField(t)) return;
        rememberEmbedTextField(t);
        markEmbedPhTarget(t);
      };
      form.addEventListener("focusin", rememberFromEvent, true);
      form.addEventListener("keyup", rememberFromEvent, true);
      form.addEventListener("click", rememberFromEvent, true);
      form.addEventListener("mouseup", rememberFromEvent, true);
      form.addEventListener("select", rememberFromEvent, true);
      form.addEventListener(
        "focusout",
        function (ev) {
          // Non perdere il target quando si clicca un chip placeholder.
          var next = ev.relatedTarget;
          if (next && next.closest && next.closest("[data-ps-ph]")) return;
          rememberFromEvent(ev);
        },
        true,
      );
    }

    root.addEventListener("pointerdown", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-ps-ph]") : null;
      if (!btn || !root.contains(btn)) return;
      // Evita che il focus salti sul bottone e perda selezione/caret.
      ev.preventDefault();
    });

    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-ps-ph]") : null;
      if (!btn || !root.contains(btn)) return;
      ev.preventDefault();
      if (insertEmbedPlaceholder(btn.getAttribute("data-ps-ph"))) {
        scheduleAutosave(0);
      }
    });
  }

  function embedFieldsAreEmpty() {
    // Il solo colore di default non conta come “contenuto” (dopo un wipe restava #d4a888).
    var ids = [
      "ps-embedTitle",
      "ps-embedAuthorName",
      "ps-embedAuthorIconUrl",
      "ps-embedThumbnailUrl",
      "ps-embedImageUrl",
      "ps-embedFooterText",
      "ps-embedFooterIconUrl",
      "ps-embedDescription",
    ];
    return !ids.some(function (id) {
      var el = byId(id);
      return el && String(el.value || "").trim();
    });
  }

  /** Allinea alla logica bot: campi vuoti → default embed. */
  function fallbackThankYouEmbedDefaults() {
    return {
      color: "",
      authorIconUrl: "",
      authorName: "{user.username}",
      title: "**<:partneredserverowner:1443651871125409812> __PARTNER EFFETTUATA__**",
      thumbnailUrl: "",
      description:
        "<a:ThankYou:1329504268369002507> Grazie per aver _effettuato_ una **partner** con `{guild}`\n<:mariolevelup:1443679595084910634> Ora sei a **`{points}`** partner!",
      imageUrl: "",
      footerText: "{partner.name}",
      footerIconUrl: "",
      timestampEnabled: true,
    };
  }

  function resolveEmbedEditorValues(emb, defaults) {
    var d =
      defaults && typeof defaults === "object" && Object.keys(defaults).length
        ? defaults
        : fallbackThankYouEmbedDefaults();
    var s = emb && typeof emb === "object" ? emb : {};
    function pick(key) {
      var value = s[key];
      if (value == null || value === undefined) {
        return d[key] != null ? d[key] : "";
      }
      if (typeof value === "string" && !String(value).trim() && key !== "color") {
        return d[key] != null ? d[key] : "";
      }
      return value;
    }
    return {
      color: pick("color"),
      authorIconUrl: pick("authorIconUrl"),
      authorName: pick("authorName"),
      title: pick("title"),
      thumbnailUrl: pick("thumbnailUrl"),
      description: pick("description"),
      imageUrl: pick("imageUrl"),
      footerText: pick("footerText"),
      footerIconUrl: pick("footerIconUrl"),
      timestampEnabled: s.timestampEnabled === false ? false : true,
    };
  }

  function applyEmbedFieldsToForm(src) {
    if (!src || typeof src !== "object") return;
    var setVal = function (id, v) {
      var el = byId(id);
      if (el) el.value = v == null ? "" : String(v);
    };
    setVal("ps-embedColor", src.color);
    setVal("ps-embedTitle", src.title);
    setVal("ps-embedAuthorName", src.authorName);
    setVal("ps-embedAuthorIconUrl", src.authorIconUrl);
    setVal("ps-embedThumbnailUrl", src.thumbnailUrl);
    setVal("ps-embedImageUrl", src.imageUrl);
    setVal("ps-embedFooterText", src.footerText);
    setVal("ps-embedFooterIconUrl", src.footerIconUrl);
    setVal("ps-embedDescription", src.description);
    var ts = byId("ps-embedTimestampEnabled");
    if (ts) ts.checked = src.timestampEnabled !== false;
  }

  function restoreEmbedFieldsFromSaved() {
    var emb = (state.partnership && state.partnership.thankYouEmbed) || null;
    var defaults = (state.partnership && state.partnership.thankYouEmbedDefaults) || null;
    applyEmbedFieldsToForm(resolveEmbedEditorValues(emb, defaults));
  }

  function setFeatEnabled(feat, enabled, opts) {
    if (!feat) return;
    var options = opts || {};
    var sw = feat.querySelector("[data-feat-switch]");
    var panel =
      feat.querySelector("[data-feat-panel]") ||
      feat.querySelector(".vc-dash-settings-row__extra[data-feat-panel]");
    var required = feat.hasAttribute("data-feat-required");
    var menuOnly = feat.hasAttribute("data-feat-menu");
    var on = required || menuOnly ? true : Boolean(enabled);
    if (sw) sw.checked = on;
    if (required && sw) sw.checked = true;
    if (on) {
      feat.classList.add("is-on");
      if (panel) panel.removeAttribute("hidden");
    } else {
      feat.classList.remove("is-on");
      if (panel) {
        panel.setAttribute("hidden", "");
        if (!options.keepValues) clearFeatControls(panel);
      }
    }
  }

  function syncFeatCardsFromValues(opts) {
    var fromServer = opts && opts.fromServer === true;
    var form = byId("vc-dashboard-partnership-form");
    if (!form) return;
    Array.prototype.forEach.call(form.querySelectorAll("[data-feat]"), function (feat) {
      if (feat.hasAttribute("data-feat-required") || feat.hasAttribute("data-feat-menu")) {
        setFeatEnabled(feat, true, { keepValues: true });
        if (feat.id === "ps-partnerDescFeat") {
          var modeMenu = String((byId("ps-partnerDescMode") || {}).value || "clear");
          syncDescModeUi(modeMenu);
        }
        return;
      }
      if (feat.hasAttribute("data-feat-bool")) {
        var swBool = feat.querySelector("[data-feat-switch]");
        feat.classList.toggle("is-on", Boolean(swBool && swBool.checked));
        return;
      }

      var sw = feat.querySelector("[data-feat-switch]");
      if (!fromServer && sw) {
        setFeatEnabled(feat, Boolean(sw.checked), { keepValues: true });
        return;
      }

      if (feat.id === "ps-embedFeat") {
        var embEnabled = Boolean(
          state.partnership &&
            state.partnership.thankYouEmbed &&
            state.partnership.thankYouEmbed.enabled === true,
        );
        setFeatEnabled(feat, embEnabled, { keepValues: true });
        return;
      }
      if (feat.id === "ps-herePingFeat") {
        var hereMembersEl = byId("ps-hereMembers");
        setFeatEnabled(
          feat,
          Boolean(hereMembersEl && String(hereMembersEl.value || "").trim()),
          { keepValues: true },
        );
        return;
      }
      if (feat.id === "ps-everyonePingFeat") {
        var everyoneMembersEl = byId("ps-everyoneMembers");
        setFeatEnabled(
          feat,
          Boolean(everyoneMembersEl && String(everyoneMembersEl.value || "").trim()),
          { keepValues: true },
        );
        return;
      }
      if (feat.id === "ps-managerLeaveFeat") {
        var leaveEl = byId("ps-managerLeaveAction");
        var leaveVal = String((leaveEl && leaveEl.value) || "").trim();
        setFeatEnabled(feat, leaveVal === "warn" || leaveVal === "delete", { keepValues: true });
        return;
      }
      if (feat.id === "ps-customPingFeat") {
        var customRoleEl = byId("ps-customRoleId");
        var customMembersEl = byId("ps-customRoleMembers");
        setFeatEnabled(
          feat,
          Boolean(
            (customRoleEl && String(customRoleEl.value || "").trim()) ||
              (customMembersEl && String(customMembersEl.value || "").trim()),
          ),
          { keepValues: true },
        );
        return;
      }
      if (feat.id === "ps-sameServerCooldownFeat") {
        var cdEl = byId("ps-sameServerCooldownInput");
        setFeatEnabled(feat, Boolean(cdEl && String(cdEl.value || "").trim()), { keepValues: true });
        return;
      }
      var panel = feat.querySelector("[data-feat-panel]");
      var hasValue = false;
      if (panel) {
        Array.prototype.forEach.call(panel.querySelectorAll("select, input, textarea"), function (el) {
          if (el.type === "checkbox" || el.type === "hidden") return;
          if (el.tagName === "SELECT" && el.multiple) {
            if (collectSelectedMulti(el).length) hasValue = true;
            return;
          }
          if (String(el.value || "").trim()) hasValue = true;
        });
      }
      setFeatEnabled(feat, hasValue, { keepValues: true });
    });
  }

  function syncDescModeUi(mode) {
    // Niente "Disattiva": senza canale/testo la descrizione è già spenta.
    var m = mode === "static" ? "static" : "channel";
    var modeInput = byId("ps-partnerDescMode");
    if (modeInput) modeInput.value = m;
    var chWrap = byId("ps-partnerDescChannelWrap");
    var stWrap = byId("ps-partnerDescStaticWrap");
    if (chWrap) {
      if (m === "channel") chWrap.removeAttribute("hidden");
      else chWrap.setAttribute("hidden", "");
    }
    if (stWrap) {
      if (m === "static") stWrap.removeAttribute("hidden");
      else stWrap.setAttribute("hidden", "");
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-desc-mode]"), function (btn) {
      btn.classList.toggle("is-active", btn.getAttribute("data-desc-mode") === m);
    });
  }

  function updateDescModeVisibility() {
    var mode = String((byId("ps-partnerDescMode") || {}).value || "clear");
    syncDescModeUi(mode);
  }

  function shouldAutosaveFeatField(target) {
    if (!target || !target.closest) return true;
    var feat = target.closest("[data-feat]");
    if (!feat) return true;
    if (feat.hasAttribute("data-feat-required") || feat.hasAttribute("data-feat-bool")) return true;
    if (feat.id === "ps-partnerDescFeat") return featHasPrimaryValue(feat);
    // Toggle + pannello: non salvare finché manca il valore principale.
    if (feat.querySelector("[data-feat-switch]") && feat.classList.contains("is-on")) {
      return featHasPrimaryValue(feat);
    }
    return true;
  }

  function wireFeatCards() {
    var form = byId("vc-dashboard-partnership-form");
    if (!form || form.__vcFeatWired) return;
    form.__vcFeatWired = true;

    form.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t || !t.matches) return;

      if (!t.matches("[data-feat-switch]")) {
        if (shouldAutosaveFeatField(t)) scheduleAutosave(0);
        return;
      }
      var feat = t.closest("[data-feat]");
      if (!feat || feat.hasAttribute("data-feat-required")) return;
      if (feat.hasAttribute("data-feat-bool")) {
        feat.classList.toggle("is-on", t.checked);
        scheduleAutosave(0);
        return;
      }
      // Spegnere nasconde il pannello ma non cancella i valori: così riattivando
      // restano com’erano; con feat off il prossimo autosave li azzera lato server.
      setFeatEnabled(feat, t.checked, { keepValues: true });
      if (feat.id === "ps-herePingFeat" && t.checked) {
        var hereDelayOn = byId("ps-hereDelayInput");
        if (hereDelayOn && !String(hereDelayOn.value || "").trim()) hereDelayOn.value = "5m";
      }
      if (feat.id === "ps-everyonePingFeat" && t.checked) {
        var everyoneDelayOn = byId("ps-everyoneDelayInput");
        if (everyoneDelayOn && !String(everyoneDelayOn.value || "").trim()) everyoneDelayOn.value = "5m";
      }
      if (feat.id === "ps-customPingFeat" && t.checked) {
        var customDelayOn = byId("ps-customRoleDelayInput");
        if (customDelayOn && !String(customDelayOn.value || "").trim()) customDelayOn.value = "5m";
      }
      if (feat.id === "ps-managerLeaveFeat" && t.checked) {
        var leaveOn = byId("ps-managerLeaveAction");
        if (leaveOn) {
          var curLeave = String(leaveOn.value || "").trim();
          if (curLeave !== "warn" && curLeave !== "delete") {
            leaveOn.value = "warn";
            refreshDashFancySelect(leaveOn);
          }
        }
      }
      if (feat.id === "ps-sameServerCooldownFeat" && t.checked) {
        var cooldownOn = byId("ps-sameServerCooldownInput");
        if (cooldownOn && !String(cooldownOn.value || "").trim()) cooldownOn.value = "12h";
      }
      if (feat.id === "ps-embedFeat" && t.checked) {
        restoreEmbedFieldsFromSaved();
      }
      // Accensione senza valore: aspetta che l'utente compili (niente PATCH a vuoto).
      // Per l’embed, dopo il prefill default/saved il valore primario c’è già.
      if (!t.checked || featHasPrimaryValue(feat)) {
        scheduleAutosave(0);
      }
    });

    Array.prototype.forEach.call(form.querySelectorAll("[data-desc-mode]"), function (btn) {
      btn.addEventListener("click", function () {
        var raw = String(btn.getAttribute("data-desc-mode") || "channel");
        var mode = raw === "static" ? "static" : "channel";
        var modeInput = byId("ps-partnerDescMode");
        if (modeInput) modeInput.value = mode;
        syncDescModeUi(mode);
        if (mode === "channel") {
          // Canale vuoto = off: salva subito lo stato corrente.
          scheduleAutosave(0);
          return;
        }
        // Testo statico: aspetta che l'utente scriva (o svuoti) prima di salvare.
        var staticEl = byId("ps-partnerDescStaticText");
        if (staticEl && String(staticEl.value || "").trim()) scheduleAutosave(0);
      });
    });

    var embedReset = byId("ps-embedReset");
    if (embedReset && !embedReset.__vcWired) {
      embedReset.__vcWired = true;
      embedReset.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (embedReset.disabled) return;
        resetEmbedFieldsToDefaults();
      });
    }
  }

  function isManagedPartnershipSetup(setup) {
    // Main e tenant: entrambi usano il form partnership in dashboard.
    return Boolean(setup);
  }

  var VALID_VIEWS = {
    overview: true,
    settings: true,
    "settings/comandi": true,
    "bacheca/funzioni": true,
    "bacheca/personalizza": true,
    // Legacy hash (alias in normalizeView).
    bacheca: true,
    "bacheca/stile": true,
    "tickets/impostazioni": true,
    "tickets/aperti": true,
    "tickets/pannelli": true,
    "tickets/teams": true,
    "tickets/forms": true,
    "tickets/blacklist": true,
    "tickets/transcripts": true,
    tickets: true,
    classifiche: true,
    "partnership/setup": true,
    "partnership/generale": true,
    "partnership/dati": true,
    "partnership/options": true,
    "partnership/description": true,
    "partnership/embed": true,
    "partnership/filtri": true,
    "partnership/blacklist": true,
    "partnership/managers": true,
    "partnership/cronologia": true,
    // Legacy hash (redirect in gatePartnershipView).
    "partnership/channels": true,
    "partnership/roles": true,
    "partnership/pings": true,
    "partnership/migration": true,
    "partnership/leave": true,
  };

  function isPartnershipSetupComplete() {
    return Boolean(state.partnership && state.partnership.setupCompleted === true);
  }

  function partnershipDefaultView() {
    return isPartnershipSetupComplete() ? "partnership/generale" : "partnership/setup";
  }

  function gatePartnershipView(view) {
    var v = String(view || "");
    if (v.indexOf("partnership/") !== 0) return v;
    if (!state.partnership) return v;
    // Alias legacy → route nuove.
    if (
      v === "partnership/channels" ||
      v === "partnership/roles" ||
      v === "partnership/pings" ||
      v === "partnership/options" ||
      v === "partnership/description"
    ) {
      v = "partnership/generale";
    }
    if (v === "partnership/migration" || v === "partnership/leave") {
      v = "partnership/dati";
    }
    if (!isPartnershipSetupComplete()) {
      return "partnership/setup";
    }
    if (v === "partnership/setup") return "partnership/generale";
    return v;
  }

  function setPartnershipSetupLocked(locked) {
    var group = byId("vc-dashboard-sidebar-partnership");
    if (!group) return;
    if (locked) {
      group.classList.add("is-setup-locked");
      setPartnershipNavOpen(false);
    } else {
      group.classList.remove("is-setup-locked");
    }
  }

  function normalizeView(raw) {
    var v = String(raw || "")
      .replace(/^#/, "")
      .trim();
    if (!v || v === "home") return "overview";
    // Legacy bacheca routes (canali unito in funzioni).
    if (v === "bacheca" || v === "bacheca/impostazioni" || v === "bacheca/canali") return "bacheca/funzioni";
    if (v === "bacheca/stile") return "bacheca/personalizza";
    if (v === "tickets" || v === "tickets/settings" || v === "tickets/overview" || v === "tickets/lista") {
      return "tickets/aperti";
    }
    if (v === "tickets/pannelli" || v.indexOf("tickets/pannelli/") === 0) return "tickets/pannelli";
    if (VALID_VIEWS[v]) return v;
    return "overview";
  }

  function currentView() {
    return normalizeView(window.location.hash || "overview");
  }

  function isMobileDashboardNav() {
    return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 720px)").matches;
  }

  /** Nav wizard resta inline nel card (come PC); ripristina se un vecchio portal l’aveva messa su body. */
  function ensureWizardNavInPlace() {
    var nav = byId("ps-wz-nav");
    if (!nav) return;
    var home = byId("ps-setup-wizard");
    if (!home) return;
    if (nav.parentElement === home) return;
    try {
      home.appendChild(nav);
    } catch (_) {}
    nav.__vcOriginalParent = null;
  }

  function ensurePartnershipSheetBackdrop() {
    var el = byId("vc-dashboard-partnership-sheet-backdrop");
    if (el) {
      if (!el.__vcNavSheetCloseWired) {
        el.__vcNavSheetCloseWired = true;
        el.setAttribute("aria-label", "Chiudi menu");
      }
      return el;
    }
    el = document.createElement("button");
    el.type = "button";
    el.id = "vc-dashboard-partnership-sheet-backdrop";
    el.className = "vc-dashboard-partnership-sheet-backdrop";
    el.setAttribute("aria-label", "Chiudi menu");
    el.hidden = true;
    el.__vcNavSheetCloseWired = true;
    function closeFromBackdrop(ev) {
      // Stesso gesture di apertura: non chiudere subito (bordo / ghost click).
      if (Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
      closeAllMobileNavSheets();
      // Evita ghost-click sul toggle sotto (iOS) che riapre subito il menu.
      state.partnershipSheetIgnoreUntil = Date.now() + 400;
    }
    el.addEventListener("pointerdown", closeFromBackdrop);
    el.addEventListener("click", closeFromBackdrop);
    document.body.appendChild(el);
    return el;
  }

  function restoreNavSheetSubParent(sub) {
    if (!sub || !sub.__vcOriginalParent) return;
    // Su mobile lasciamo il foglio su <body>: rimetterlo nel dock sposta le icone.
    if (isMobileDashboardNav()) return;
    if (sub.parentElement === document.body || (sub.parentElement && sub.parentElement.id === "vc-dashboard-partnership-sheet-root")) {
      sub.__vcOriginalParent.appendChild(sub);
    }
    sub.__vcOriginalParent = null;
  }

  function restorePartnershipSubParent(sub) {
    restoreNavSheetSubParent(sub);
  }

  function closeAllMobileNavSheetsExcept(keepKey) {
    var silent = { skipOthers: true, keepChrome: true, silent: true };
    if (keepKey !== "partnership") setPartnershipNavOpen(false, silent);
    if (keepKey !== "bacheca") setBachecaNavOpen(false, silent);
    if (keepKey !== "tickets") setTicketsNavOpen(false, silent);
  }

  function closeAllMobileNavSheets() {
    closeAllMobileNavSheetsExcept(null);
  }

  function setSidebarNavSheetOpen(opts) {
    var key = String((opts && opts.key) || "");
    var group = byId(opts && opts.groupId);
    var toggle = byId(opts && opts.toggleId);
    var sub = byId(opts && opts.subId);
    var open = Boolean(opts && opts.open);
    var skipOthers = Boolean(opts && opts.skipOthers);
    var keepChrome = Boolean(opts && opts.keepChrome);
    var silent = Boolean(opts && opts.silent);
    if (!group || !toggle || !sub) return;
    var mobile = isMobileDashboardNav();
    var backdrop = ensurePartnershipSheetBackdrop();
    var nav = document.querySelector("#vc-dashboard-sidebar .vc-dashboard-sidebar__nav");
    var navScrollLeft = nav ? nav.scrollLeft : 0;
    function restoreNavScroll() {
      if (!nav || silent) return;
      nav.scrollLeft = navScrollLeft;
      requestAnimationFrame(function () {
        if (nav) nav.scrollLeft = navScrollLeft;
      });
    }
    function clearTogglePressState() {
      if (silent) return;
      toggle.classList.add("is-press-reset");
      if (typeof toggle.blur === "function") {
        try {
          toggle.blur();
        } catch (eBlur) {}
      }
      window.setTimeout(function () {
        toggle.classList.remove("is-press-reset");
      }, 320);
    }
    if (open) {
      if (!skipOthers) closeAllMobileNavSheetsExcept(key);
      group.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
      // Su mobile: porta il foglio su <body> PRIMA dell’animazione.
      if (mobile && sub.parentElement !== document.body) {
        if (!sub.__vcOriginalParent) sub.__vcOriginalParent = group;
        document.body.appendChild(sub);
      }
      sub.removeAttribute("hidden");
      sub.classList.remove("is-sheet-open");
      if (mobile) {
        try {
          void sub.offsetWidth;
        } catch (eReflow) {}
      }
      sub.classList.add("is-sheet-open");
      if (mobile) {
        backdrop.hidden = false;
        document.body.classList.add("vc-dash-partnership-sheet-open");
      } else {
        backdrop.hidden = true;
        var pOpen = byId("vc-dashboard-sidebar-partnership");
        var bOpen = byId("vc-dashboard-sidebar-bacheca");
        var tOpen = byId("vc-dashboard-sidebar-tickets");
        if (
          !(pOpen && pOpen.classList.contains("is-open")) &&
          !(bOpen && bOpen.classList.contains("is-open")) &&
          !(tOpen && tOpen.classList.contains("is-open"))
        ) {
          document.body.classList.remove("vc-dash-partnership-sheet-open");
        }
      }
      state.partnershipSheetIgnoreUntil = Date.now() + 400;
      restoreNavScroll();
    } else {
      var wasOpen = group.classList.contains("is-open") || sub.classList.contains("is-sheet-open");
      group.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      sub.classList.remove("is-sheet-open");
      sub.setAttribute("hidden", "");
      restoreNavSheetSubParent(sub);
      if (!keepChrome) {
        var anyOpen =
          (byId("vc-dashboard-sidebar-partnership") &&
            byId("vc-dashboard-sidebar-partnership").classList.contains("is-open")) ||
          (byId("vc-dashboard-sidebar-bacheca") &&
            byId("vc-dashboard-sidebar-bacheca").classList.contains("is-open")) ||
          (byId("vc-dashboard-sidebar-tickets") &&
            byId("vc-dashboard-sidebar-tickets").classList.contains("is-open"));
        if (!anyOpen) {
          backdrop.hidden = true;
          document.body.classList.remove("vc-dash-partnership-sheet-open");
        }
      }
      // Solo se il foglio era davvero aperto: evita flash sul toggle della pagina corrente.
      if (wasOpen) clearTogglePressState();
      restoreNavScroll();
    }
  }

  function setPartnershipNavOpen(open, opts) {
    setSidebarNavSheetOpen({
      key: "partnership",
      groupId: "vc-dashboard-sidebar-partnership",
      toggleId: "vc-dashboard-sidebar-partnership-toggle",
      subId: "vc-dashboard-sidebar-partnership-sub",
      open: open,
      skipOthers: opts && opts.skipOthers,
      keepChrome: opts && opts.keepChrome,
      silent: opts && opts.silent,
    });
  }

  function setPartnershipNavVisible(visible) {
    var group = byId("vc-dashboard-sidebar-partnership");
    if (!group) return;
    if (visible) group.removeAttribute("hidden");
    else {
      group.setAttribute("hidden", "");
      setPartnershipNavOpen(false, { skipOthers: true, silent: true });
    }
  }

  function setBachecaNavOpen(open, opts) {
    setSidebarNavSheetOpen({
      key: "bacheca",
      groupId: "vc-dashboard-sidebar-bacheca",
      toggleId: "vc-dashboard-sidebar-bacheca-toggle",
      subId: "vc-dashboard-sidebar-bacheca-sub",
      open: open,
      skipOthers: opts && opts.skipOthers,
      keepChrome: opts && opts.keepChrome,
      silent: opts && opts.silent,
    });
  }

  function setTicketsNavVisible(visible) {
    var group = byId("vc-dashboard-sidebar-tickets");
    if (!group) return;
    if (visible) group.removeAttribute("hidden");
    else {
      group.setAttribute("hidden", "");
      setTicketsNavOpen(false, { skipOthers: true, silent: true });
    }
  }

  function setTicketsNavOpen(open, opts) {
    setSidebarNavSheetOpen({
      key: "tickets",
      groupId: "vc-dashboard-sidebar-tickets",
      toggleId: "vc-dashboard-sidebar-tickets-toggle",
      subId: "vc-dashboard-sidebar-tickets-sub",
      open: open,
      skipOthers: opts && opts.skipOthers,
      keepChrome: opts && opts.keepChrome,
      silent: opts && opts.silent,
    });
  }

  function canUseTickets() {
    var guild = state.overview && state.overview.guild;
    return Boolean(guild && guild.botPresent);
  }

  function setSettingsNavVisible(visible) {
    var settings = byId("vc-dashboard-sidebar-settings");
    var comandi = byId("vc-dashboard-sidebar-settings-comandi");
    var bacheca = byId("vc-dashboard-sidebar-bacheca");
    [settings, comandi, bacheca].forEach(function (el) {
      if (!el) return;
      if (visible) el.removeAttribute("hidden");
      else {
        el.setAttribute("hidden", "");
        el.classList.remove("is-active");
      }
    });
    if (!visible) setBachecaNavOpen(false);
  }

  function setClassificheNavVisible(visible) {
    var side = byId("vc-dashboard-sidebar-classifiche");
    if (!side) return;
    if (visible) side.removeAttribute("hidden");
    else {
      side.setAttribute("hidden", "");
      side.classList.remove("is-active");
      side.removeAttribute("aria-current");
    }
  }

  function canUseClassifiche() {
    var guild = state.overview && state.overview.guild;
    return Boolean(guild && guild.botPresent);
  }

  function canUseGuildSettings() {
    var guild = state.overview && state.overview.guild;
    return Boolean(guild && guild.botPresent);
  }

  function collapseSidebarAfterNav() {
    var sidebar = byId("vc-dashboard-sidebar");
    if (!sidebar || sidebar.hasAttribute("hidden")) return;
    var active = document.activeElement;
    if (active && sidebar.contains(active) && typeof active.blur === "function") {
      active.blur();
    }
    sidebar.classList.add("is-force-collapsed");
  }

  function clearSidebarForceCollapse() {
    var sidebar = byId("vc-dashboard-sidebar");
    if (sidebar) sidebar.classList.remove("is-force-collapsed");
  }

  function applyView(viewId, options) {
    var view = normalizeView(viewId);
    var opts = options || {};
    if (state.headerGuildName || state.headerGuildIcon) {
      applyHeaderGuildBrand(state.headerGuildName, state.headerGuildIcon);
    }
    var partnershipReady = Boolean(state.partnership);
    var settingsReady = Boolean(state.settings) && canUseGuildSettings();
    var requestedPartnership = String(view).indexOf("partnership/") === 0;
    if (requestedPartnership && !partnershipReady) {
      // Partnership ancora in caricamento: mostra overview senza toccare l'hash,
      // così un refresh su #partnership/... resta lì e viene ripristinato dopo il load.
      view = "overview";
      opts = Object.assign({}, opts, { skipHash: true });
    }
    if (
      (view === "settings" ||
        view === "settings/comandi" ||
        view === "bacheca/funzioni" ||
        view === "bacheca/personalizza") &&
      !settingsReady
    ) {
      view = "overview";
      opts = Object.assign({}, opts, { skipHash: true });
    }
    if (String(view).indexOf("tickets/") === 0 && !canUseTickets()) {
      view = "overview";
      opts = Object.assign({}, opts, { skipHash: true });
    }
    if (view === "classifiche" && !canUseClassifiche()) {
      view = "overview";
      opts = Object.assign({}, opts, { skipHash: true });
    }
    if (partnershipReady && String(view).indexOf("partnership/") === 0) {
      view = gatePartnershipView(view);
    }

    if (state.successView && state.successView !== view) {
      setSuccess("");
    }
    if (state.errorView && state.errorView !== view) {
      setError("");
    }

    if (!opts.skipHash) {
      var wantHash = "#" + view;
      if (view === "tickets/pannelli") {
        var rawRequested = String(viewId || "")
          .replace(/^#/, "")
          .trim();
        // Se la richiesta è già un deep-link editor, conservalo.
        // Se è solo "tickets/pannelli" (voce sidebar), forza la lista anche se
        // location.hash è ancora su /p/... o /m/... (preventDefault non ha ancora cambiato l'URL).
        if (rawRequested.indexOf("tickets/pannelli/") === 0) {
          wantHash = "#" + rawRequested;
        } else {
          wantHash = "#tickets/pannelli";
          if (state.ticketPanelsEditor && state.ticketPanelsEditor.mode !== "list") {
            try {
              persistTicketPanelsDraftNow();
            } catch (_) {}
            state.ticketPanelsEditor = { mode: "list", id: null };
          }
        }
      }
      if ((window.location.hash || "#overview") !== wantHash) {
        var nextUrl = window.location.pathname + window.location.search + wantHash;
        if (history.replaceState) {
          history.replaceState(null, "", nextUrl);
        } else {
          window.location.hash = wantHash.replace(/^#/, "");
        }
      }
    }

    if (view !== "tickets/pannelli") {
      if (state.ticketPanelsEditor && state.ticketPanelsEditor.mode !== "list") {
        try {
          persistTicketPanelsDraftNow();
        } catch (_) {}
        state.ticketPanelsEditor = { mode: "list", id: null };
      }
      try {
        closeOptcustEmojiMenu();
      } catch (_) {}
      try {
        closeTicketPanelButtonEmojiMenu();
      } catch (_) {}
    }

    var isBachecaView =
      view === "bacheca/funzioni" || view === "bacheca/personalizza";
    var isTicketsView = String(view).indexOf("tickets/") === 0;
    var isPartnershipView = String(view).indexOf("partnership/") === 0;

    // Chiudi subito il viewer transcript: altrimenti resta sopra le altre sezioni
    // (iframe “Accedi per vedere il transcript”) anche con Partnership attiva.
    if (view !== "tickets/transcripts") {
      try {
        closeTranscriptViewer();
      } catch (_) {}
    }

    // IMPORTANTE: sblocca i form PRIMA di nascondere i pannelli overview.
    // Altrimenti (nav partnership attiva + overview hidden + form ancora hidden)
    // resta la UI “solo footer” tipica sul main con pickers enormi / throw a metà applyView.
    var form = byId("vc-dashboard-partnership-form");
    if (form) {
      if (partnershipReady && isPartnershipView) form.removeAttribute("hidden");
      else form.setAttribute("hidden", "");
    }

    var settingsForm = byId("vc-dashboard-settings-form");
    if (settingsForm) {
      if (settingsReady && view === "settings") settingsForm.removeAttribute("hidden");
      else settingsForm.setAttribute("hidden", "");
    }

    var bachecaForm = byId("vc-dashboard-bacheca-form");
    if (bachecaForm) bachecaForm.setAttribute("hidden", "");

    var bachecaFeaturesForm = byId("vc-dashboard-bacheca-features-form");
    if (bachecaFeaturesForm) {
      if (settingsReady && view === "bacheca/funzioni") bachecaFeaturesForm.removeAttribute("hidden");
      else bachecaFeaturesForm.setAttribute("hidden", "");
    }

    var bachecaStyleForm = byId("vc-dashboard-bacheca-style-form");
    if (bachecaStyleForm) {
      if (settingsReady && view === "bacheca/personalizza") bachecaStyleForm.removeAttribute("hidden");
      else bachecaStyleForm.setAttribute("hidden", "");
    }

    var ticketsForm = byId("vc-dashboard-tickets-form");
    if (ticketsForm) {
      if (isTicketsView && canUseTickets()) ticketsForm.removeAttribute("hidden");
      else ticketsForm.setAttribute("hidden", "");
    }

    var panels = document.querySelectorAll("[data-view-panel]");
    Array.prototype.forEach.call(panels, function (panel) {
      var id = panel.getAttribute("data-view-panel");
      if (id === view) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });

    // Cintura: se non siamo sui transcript, il viewer non deve mai restare visibile.
    if (view !== "tickets/transcripts") {
      var txViewer = byId("tk-tx-viewer");
      var txPanel = byId("vc-dashboard-view-tickets-transcripts");
      if (txViewer) {
        txViewer.setAttribute("hidden", "");
        txViewer.style.display = "none";
      }
      if (txPanel && view.indexOf("tickets/") !== 0) txPanel.setAttribute("hidden", "");
    } else {
      var txViewerOn = byId("tk-tx-viewer");
      if (txViewerOn && txViewerOn.style.display === "none") txViewerOn.style.display = "";
    }

    // Include i fogli mobile portati su <body> (non sono più dentro #vc-dashboard-sidebar).
    var links = document.querySelectorAll(
      "#vc-dashboard-sidebar [data-view], #vc-dashboard-sidebar-tickets-sub [data-view], #vc-dashboard-sidebar-bacheca-sub [data-view], #vc-dashboard-sidebar-partnership-sub [data-view]",
    );
    Array.prototype.forEach.call(links, function (link) {
      if (link.getAttribute("data-view") === view) link.classList.add("is-active");
      else link.classList.remove("is-active");
    });

    var setupIncomplete = partnershipReady && !isPartnershipSetupComplete();
    setPartnershipSetupLocked(setupIncomplete);

    var toggle = byId("vc-dashboard-sidebar-partnership-toggle");
    if (toggle) {
      if (isPartnershipView || view === "classifiche") toggle.classList.add("is-active");
      else toggle.classList.remove("is-active");
    }

    var bachecaToggle = byId("vc-dashboard-sidebar-bacheca-toggle");
    if (bachecaToggle) {
      if (isBachecaView) bachecaToggle.classList.add("is-active");
      else bachecaToggle.classList.remove("is-active");
    }

    var ticketsToggle = byId("vc-dashboard-sidebar-tickets-toggle");
    if (ticketsToggle) {
      if (isTicketsView) ticketsToggle.classList.add("is-active");
      else ticketsToggle.classList.remove("is-active");
    }
    if (view === "bacheca/personalizza") {
      applyPremiumUi();
      try {
        syncQuoteStylePreview(readQuoteStyleFromForm());
      } catch (eQs) {}
    }

    var isMobileNav = isMobileDashboardNav();
    if (isPartnershipView || view === "classifiche") {
      if (setupIncomplete || view === "partnership/setup") {
        setPartnershipNavOpen(false);
      } else if (isMobileNav) {
        setPartnershipNavOpen(false);
      } else {
        setPartnershipNavOpen(true);
      }
      if (!isMobileNav) {
        setBachecaNavOpen(false);
        setTicketsNavOpen(false);
      }
    } else if (isBachecaView) {
      if (isMobileNav) setBachecaNavOpen(false);
      else setBachecaNavOpen(true);
      if (!isMobileNav) {
        setPartnershipNavOpen(false);
        setTicketsNavOpen(false);
      }
    } else if (isTicketsView) {
      if (isMobileNav) setTicketsNavOpen(false);
      else setTicketsNavOpen(true);
      if (!isMobileNav) {
        setPartnershipNavOpen(false);
        setBachecaNavOpen(false);
      }
    } else if (isMobileNav) {
      setPartnershipNavOpen(false);
      setBachecaNavOpen(false);
      setTicketsNavOpen(false);
    }

    state.view = view;
    try {
      var wizardActive = view === "partnership/setup";
      document.body.classList.toggle("is-ps-wizard-active", wizardActive);
      ensureWizardNavInPlace();
    } catch (_) {}
    // Riallinea ON/OFF ai valori reali (es. 0 categorie → OFF) senza triggerare autosave.
    syncFeatCardsFromValues();
    if (opts.collapseSidebar) collapseSidebarAfterNav();

    if (view === "partnership/setup") {
      setWizardStep(state.wizardStep || 1);
    }

    if (String(view).indexOf("partnership/") === 0 && partnershipReady) {
      var wasPolling = Boolean(state.pickersPollTimer);
      startPartnershipPickersPoll();
      // Evita ?fresh=1 immediato ad ogni click: sul main (centinaia di canali) congela l’UI.
      // Il poll periodico e l’apertura dei select fanno già il refresh forzato quando serve.
      if (!wasPolling && !state.pickers) {
        refreshPartnershipPickers({ force: true }).catch(function () {});
      }
    } else {
      stopPartnershipPickersPoll();
    }

    if (view === "partnership/dati") {
      prepareMigrationView();
      refreshMigrationStatus();
      startMigrationPolling();
    } else {
      stopMigrationPolling();
    }

    if (view === "partnership/blacklist") {
      refreshBlacklistList({ silent: Boolean(state.blacklistEntries) });
    }

    if (view === "partnership/managers") {
      refreshManagersList({ silent: Boolean(state.managersList) });
    }

    if (view === "tickets/impostazioni") {
      if (state.tickets) fillTicketsForm();
      else loadTickets({ silent: true });
    }

    if (view === "tickets/transcripts") {
      refreshTranscriptsList({ silent: Boolean(state.transcriptsList) });
      startTranscriptsPoll();
    } else {
      stopTranscriptsPoll();
      closeTranscriptViewer();
    }
    if (view === "tickets/aperti") {
      refreshOpenTicketsList({ silent: Boolean(state.openTicketsList) });
      startOpenTicketsPoll();
    } else {
      stopOpenTicketsPoll();
    }
    if (view === "tickets/pannelli") {
      refreshTicketPanels({ silent: Boolean(state.ticketPanels) }).then(function () {
        restoreTicketPanelsEditorFromRoute({ applyDraft: true });
      });
      refreshTicketForms({ silent: true });
    }
    if (view === "tickets/teams") {
      refreshTicketTeams({ silent: Boolean(state.ticketTeams) });
    }
    if (view === "tickets/forms") {
      refreshTicketForms({ silent: Boolean(state.ticketForms) });
    }
    if (view === "tickets/blacklist") {
      refreshTicketBlacklist({ silent: Boolean(state.ticketBlacklist) });
    }

    if (view === "partnership/cronologia") {
      refreshHistoryList({ silent: Boolean(state.historyEntries) });
    }

    if (view === "classifiche") {
      refreshLeaderboard({ silent: Boolean(state.lbLastPayload) });
    }

    if (view === "settings/comandi") {
      refreshCommandsPage({ silent: Boolean(state.commandsCatalog) });
    }

    if (view === "settings" && settingsReady) {
      refreshSettingsIdentityFromDiscord().catch(function () {});
      startSettingsIdentityPoll();
    } else {
      stopSettingsIdentityPoll();
    }

    refreshServerSwitcherHrefs();
  }

  function showMigrationLoadingShell() {
    var setup = byId("ps-migration-setup");
    var progress = byId("ps-migration-progress");
    var actions = byId("ps-migration-actions");
    var retryWrap = byId("ps-migration-retry-wrap");
    var label = byId("ps-migration-status-label");
    var msg = byId("ps-migration-message");
    var queuePos = byId("ps-migration-queue-pos");
    var stats = byId("ps-migration-stats");
    var card = byId("ps-migration-card");
    if (setup) setup.setAttribute("hidden", "");
    if (actions) actions.setAttribute("hidden", "");
    if (retryWrap) retryWrap.setAttribute("hidden", "");
    if (progress) progress.removeAttribute("hidden");
    if (card) {
      card.classList.remove("is-failed", "is-completed", "is-running");
    }
    if (label) label.textContent = i18n("dash.mig.statusLoading", "Caricamento…");
    if (msg) msg.textContent = i18n("dash.mig.loadingStatus", "Recupero stato migrazione…");
    if (queuePos) queuePos.setAttribute("hidden", "");
    if (stats) stats.setAttribute("hidden", "");
  }

  function prepareMigrationView() {
    // Evita il flash dei pannelli "Avvia migrazione" se c’è già un job completato/in corso.
    if (state.lastMigrationPayload) {
      renderMigrationJob(state.lastMigrationPayload);
      return;
    }
    if (state.migrationStatusKnown) {
      renderMigrationJob({ job: null });
      return;
    }
    showMigrationLoadingShell();
  }

  function stopMigrationPolling() {
    if (state.migrationPollTimer) {
      clearInterval(state.migrationPollTimer);
      state.migrationPollTimer = null;
    }
  }

  function escHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatBlacklistDate(iso) {
    if (!iso) return "";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleString();
    } catch (e) {
      return "";
    }
  }

  function renderBlacklistList(entries) {
    var list = byId("ps-bl-list");
    var empty = byId("ps-bl-empty");
    var count = byId("ps-bl-count");
    var rows = Array.isArray(entries) ? entries : [];
    state.blacklistEntries = rows;
    if (count) {
      count.textContent = rows.length
        ? i18n("dash.bl.count", "{n} server in blacklist").replace("{n}", String(rows.length))
        : i18n("dash.bl.listHintEmpty", "Nessun server bloccato");
    }
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = "";
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    list.innerHTML = rows
      .map(function (row) {
        var name = row.guildName || i18n("dash.bl.unknownServer", "Server sconosciuto");
        var gid = String(row.guildId || "");
        var note = String(row.note || "").trim();
        var invite = String(row.invite || "").trim();
        var icon = String(row.iconUrl || "").trim();
        var when = formatBlacklistDate(row.addedAt);
        var iconHtml = icon
          ? '<img class="vc-dash-bl__icon" src="' + escHtml(icon) + '" alt="" width="40" height="40" loading="lazy" />'
          : '<span class="vc-dash-bl__icon vc-dash-bl__icon--fallback" aria-hidden="true"><i class="fa fa-server"></i></span>';
        var metaParts = [];
        metaParts.push('<code class="vc-dash-bl__id">' + escHtml(gid) + "</code>");
        if (when) metaParts.push(escHtml(when));
        if (invite) {
          metaParts.push(
            '<a class="vc-dash-bl__invite" href="' +
              escHtml(invite) +
              '" target="_blank" rel="noopener noreferrer">' +
              escHtml(i18n("dash.bl.openInvite", "Invite")) +
              "</a>",
          );
        }
        return (
          '<article class="vc-dash-bl__row" data-bl-guild="' +
          escHtml(gid) +
          '">' +
          '<div class="vc-dash-bl__main">' +
          iconHtml +
          '<div class="vc-dash-bl__text">' +
          "<strong>" +
          escHtml(name) +
          "</strong>" +
          '<p class="vc-dash-bl__meta">' +
          metaParts.join(" · ") +
          "</p>" +
          (note ? '<p class="vc-dash-bl__note">' + escHtml(note) + "</p>" : "") +
          "</div></div>" +
          '<button type="button" class="vc-dashboard-btn vc-dash-bl__remove" data-bl-remove="' +
          escHtml(gid) +
          '" data-bl-name="' +
          escHtml(name) +
          '" title="' +
          escHtml(i18n("dash.bl.remove", "Rimuovi")) +
          '">' +
          '<i class="fa fa-trash-o" aria-hidden="true"></i> <span>' +
          escHtml(i18n("dash.bl.remove", "Rimuovi")) +
          "</span></button>" +
          "</article>"
        );
      })
      .join("");
  }

  async function refreshBlacklistList(opts) {
    opts = opts || {};
    var token = getToken();
    if (!token || !state.guildId) return;
    if (state.blacklistLoading) return;
    state.blacklistLoading = true;
    if (!opts.silent) {
      var count = byId("ps-bl-count");
      if (count) count.textContent = i18n("dash.bl.listHint", "Caricamento…");
    }
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership/blacklist",
        {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        showSaveToast(
          (data && data.message) || i18n("dash.bl.errLoad", "Impossibile caricare la blacklist."),
          true,
        );
        return;
      }
      renderBlacklistList(data.entries || []);
    } catch (e) {
      showSaveToast(i18n("dash.bl.errNetwork", "Errore di rete durante il caricamento blacklist."), true);
    } finally {
      state.blacklistLoading = false;
    }
  }

  async function addBlacklistEntry() {
    var token = getToken();
    if (!token || !state.guildId || state.blacklistBusy) return;
    var targetEl = byId("ps-bl-target");
    var noteEl = byId("ps-bl-note");
    var target = targetEl ? String(targetEl.value || "").trim() : "";
    var note = noteEl ? String(noteEl.value || "").trim() : "";
    if (!target) {
      showSaveToast(i18n("dash.bl.errTarget", "Inserisci un invite o un ID server."), true);
      if (targetEl) targetEl.focus();
      return;
    }
    state.blacklistBusy = true;
    var addBtn = byId("ps-bl-add-btn");
    if (addBtn) addBtn.disabled = true;
    showSaveToast(i18n("dash.bl.adding", "Aggiunta in corso…"), false, { pending: true });
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership/blacklist",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ target: target, note: note }),
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        showSaveToast(
          (data && data.message) || i18n("dash.bl.errAdd", "Aggiunta non riuscita."),
          true,
        );
        return;
      }
      if (targetEl) targetEl.value = "";
      if (noteEl) noteEl.value = "";
      showSaveToast(data.message || i18n("dash.bl.added", "Server aggiunto alla blacklist."), false);
      await refreshBlacklistList({ silent: true });
    } catch (e) {
      showSaveToast(i18n("dash.bl.errNetwork", "Errore di rete durante il caricamento blacklist."), true);
    } finally {
      state.blacklistBusy = false;
      if (addBtn) addBtn.disabled = false;
    }
  }

  function resetBlacklistModalOkButton() {
    if (state.blacklistModalArmTimer) {
      clearTimeout(state.blacklistModalArmTimer);
      state.blacklistModalArmTimer = null;
    }
    state.blacklistModalArmed = false;
    var root = byId("vc-dash-confirm");
    if (!root) return;
    var okBtn = root.querySelector('[data-dash-confirm="ok"]');
    if (!okBtn) return;
    okBtn.classList.remove("is-confirm");
    var okLabel =
      state.dashConfirmKind === "leave"
        ? i18n("dash.leave.confirmOk", "Elimina tutto")
        : i18n("dash.bl.remove", "Rimuovi");
    okBtn.innerHTML =
      '<i class="fa fa-trash-o" aria-hidden="true"></i> <span>' + escHtml(okLabel) + "</span>";
  }

  function closeBlacklistModal() {
    resetBlacklistModalOkButton();
    state.blacklistModalPendingGid = "";
    state.dashConfirmKind = "";
    var root = byId("vc-dash-confirm");
    if (!root) return;
    root.classList.remove("is-open");
    root.setAttribute("hidden", "");
    document.removeEventListener("keydown", onBlacklistModalKey, true);
  }

  function onBlacklistModalKey(ev) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeBlacklistModal();
    }
  }

  function ensureDashConfirmModal() {
    var existing = byId("vc-dash-confirm");
    if (existing) return existing;
    var root = document.createElement("div");
    root.id = "vc-dash-confirm";
    root.className = "vc-dash-confirm";
    root.setAttribute("hidden", "");
    root.innerHTML =
      '<button type="button" class="vc-dash-confirm__backdrop" data-dash-confirm="cancel" aria-label="Chiudi"></button>' +
      '<div class="vc-dash-confirm__panel" role="dialog" aria-modal="true" aria-labelledby="vc-dash-confirm-title">' +
      '<div class="vc-dash-confirm__icon" aria-hidden="true"><i class="fa fa-trash-o"></i></div>' +
      '<h3 class="vc-dash-confirm__title" id="vc-dash-confirm-title"></h3>' +
      '<p class="vc-dash-confirm__text" id="vc-dash-confirm-text"></p>' +
      '<div class="vc-dash-confirm__actions">' +
      '<button type="button" class="vc-dashboard-btn" data-dash-confirm="cancel"></button>' +
      '<button type="button" class="vc-dashboard-btn vc-dash-confirm__btn-danger" data-dash-confirm="ok"></button>' +
      "</div></div>";
    document.body.appendChild(root);
    root.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-dash-confirm]") : null;
      if (!btn) return;
      var action = btn.getAttribute("data-dash-confirm");
      if (action === "cancel") {
        closeBlacklistModal();
        return;
      }
      if (action !== "ok") return;
      ev.preventDefault();
      if (!state.blacklistModalArmed) {
        state.blacklistModalArmed = true;
        btn.classList.add("is-confirm");
        btn.innerHTML =
          '<i class="fa fa-check" aria-hidden="true"></i> <span>' +
          escHtml(i18n("dash.bl.confirmClickAgain", "Clicca di nuovo")) +
          "</span>";
        if (state.blacklistModalArmTimer) clearTimeout(state.blacklistModalArmTimer);
        state.blacklistModalArmTimer = setTimeout(function () {
          resetBlacklistModalOkButton();
        }, 4000);
        return;
      }
      var kind = String(state.dashConfirmKind || "");
      var gid = String(state.blacklistModalPendingGid || "").trim();
      closeBlacklistModal();
      if (kind === "leave") {
        executeLeavePartnership();
        return;
      }
      if (gid) executeBlacklistRemove(gid);
    });
    return root;
  }

  function openBlacklistRemoveModal(guildId, serverName) {
    var gid = String(guildId || "").trim();
    if (!gid || state.blacklistBusy) return;
    var label = String(serverName || "").trim() || gid;
    var root = ensureDashConfirmModal();
    var titleEl = byId("vc-dash-confirm-title");
    var textEl = byId("vc-dash-confirm-text");
    var cancelBtn = root.querySelector('[data-dash-confirm="cancel"].vc-dashboard-btn');
    state.dashConfirmKind = "blacklist";
    state.blacklistModalPendingGid = gid;
    resetBlacklistModalOkButton();
    if (titleEl) titleEl.textContent = i18n("dash.bl.confirmTitle", "Rimuovere dalla blacklist?");
    if (textEl) {
      textEl.innerHTML = i18n(
        "dash.bl.confirmRemoveNamed",
        "Vuoi togliere <strong>{name}</strong> dalla blacklist partnership?",
      ).replace("{name}", escHtml(label));
    }
    if (cancelBtn) cancelBtn.textContent = i18n("dash.bl.cancel", "Annulla");
    document.addEventListener("keydown", onBlacklistModalKey, true);
    root.removeAttribute("hidden");
    requestAnimationFrame(function () {
      root.classList.add("is-open");
      var okBtn = root.querySelector('[data-dash-confirm="ok"]');
      if (okBtn && typeof okBtn.focus === "function") okBtn.focus();
    });
  }

  function openLeavePartnershipModal() {
    if (state.leaveBusy || state.saving) return;
    var root = ensureDashConfirmModal();
    var titleEl = byId("vc-dash-confirm-title");
    var textEl = byId("vc-dash-confirm-text");
    var cancelBtn = root.querySelector('[data-dash-confirm="cancel"].vc-dashboard-btn');
    state.dashConfirmKind = "leave";
    state.blacklistModalPendingGid = "";
    resetBlacklistModalOkButton();
    if (titleEl) titleEl.textContent = i18n("dash.leave.confirmTitle", "Eliminare tutti i dati partnership?");
    if (textEl) {
      textEl.textContent = i18n(
        "dash.leave.confirmText",
        "La configurazione partnership di questo server verrà azzerata. Clicca di nuovo per confermare: non si può annullare.",
      );
    }
    if (cancelBtn) cancelBtn.textContent = i18n("dash.bl.cancel", "Annulla");
    document.addEventListener("keydown", onBlacklistModalKey, true);
    root.removeAttribute("hidden");
    requestAnimationFrame(function () {
      root.classList.add("is-open");
      var okBtn = root.querySelector('[data-dash-confirm="ok"]');
      if (okBtn && typeof okBtn.focus === "function") okBtn.focus();
    });
  }

  async function executeLeavePartnership() {
    var token = getToken();
    if (!token || !state.guildId || state.leaveBusy) return;
    state.leaveBusy = true;
    var leaveBtn = byId("ps-leave-btn");
    if (leaveBtn) leaveBtn.disabled = true;
    showSaveToast(i18n("dash.leave.working", "Eliminazione in corso…"), false, { pending: true });
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token },
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        if (res.status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
          showSaveToast(i18n("dash.leave.err", "Impossibile eliminare i dati partnership."), true);
          showLocked();
          return;
        }
        showSaveToast(
          (data && data.message) || i18n("dash.leave.err", "Impossibile eliminare i dati partnership."),
          true,
        );
        return;
      }
      state.partnership = data.partnership || state.partnership;
      state.pickers = data.pickers || state.pickers;
      state.wizardStep = 1;
      state.blacklistEntries = null;
      if (data.partnership) {
        fillPartnershipForm(data.partnership, state.pickers || {});
      }
      if (state.overview && state.overview.setup && isManagedPartnershipSetup(state.overview.setup)) {
        state.overview.setup.complete = false;
        renderOverview(state.overview);
      }
      showSaveToast(
        (data && data.message) ||
          i18n("dash.leave.done", "Configurazione partnership azzerata. Puoi rifare il setup."),
        false,
      );
      applyView("partnership/setup", { collapseSidebar: true });
    } catch (e) {
      showSaveToast(i18n("dash.leave.errNetwork", "Errore di rete durante l’eliminazione."), true);
    } finally {
      state.leaveBusy = false;
      if (leaveBtn) leaveBtn.disabled = false;
    }
  }

  async function executeBlacklistRemove(targetGuildId) {
    var gid = String(targetGuildId || "").trim();
    var token = getToken();
    if (!gid || !token || !state.guildId || state.blacklistBusy) return;
    state.blacklistBusy = true;
    showSaveToast(i18n("dash.bl.removing", "Rimozione in corso…"), false, { pending: true });
    try {
      var res = await fetch(
        resolveApiBase() +
          "/guilds/" +
          encodeURIComponent(state.guildId) +
          "/partnership/blacklist/" +
          encodeURIComponent(gid),
        {
          method: "DELETE",
          headers: { Authorization: "Bearer " + token },
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        showSaveToast(
          (data && data.message) || i18n("dash.bl.errRemove", "Rimozione non riuscita."),
          true,
        );
        return;
      }
      showSaveToast(data.message || i18n("dash.bl.removed", "Server rimosso dalla blacklist."), false);
      await refreshBlacklistList({ silent: true });
    } catch (e) {
      showSaveToast(i18n("dash.bl.errNetwork", "Errore di rete durante il caricamento blacklist."), true);
    } finally {
      state.blacklistBusy = false;
    }
  }

  function wireBlacklistUi() {
    var addBtn = byId("ps-bl-add-btn");
    if (addBtn && !addBtn.__vcWired) {
      addBtn.__vcWired = true;
      addBtn.addEventListener("click", function () {
        addBlacklistEntry();
      });
    }
    var refreshBtn = byId("ps-bl-refresh-btn");
    if (refreshBtn && !refreshBtn.__vcWired) {
      refreshBtn.__vcWired = true;
      refreshBtn.addEventListener("click", function () {
        refreshBlacklistList();
      });
    }
    var list = byId("ps-bl-list");
    if (list && !list.__vcWired) {
      list.__vcWired = true;
      list.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-bl-remove]") : null;
        if (!btn) return;
        ev.preventDefault();
        openBlacklistRemoveModal(btn.getAttribute("data-bl-remove"), btn.getAttribute("data-bl-name") || "");
      });
    }
    var targetEl = byId("ps-bl-target");
    if (targetEl && !targetEl.__vcWired) {
      targetEl.__vcWired = true;
      targetEl.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          addBlacklistEntry();
        }
      });
    }
  }

  function renderManagersList(payload) {
    var list = byId("ps-pm-list");
    var empty = byId("ps-pm-empty");
    var count = byId("ps-pm-count");
    var readonly = byId("ps-pm-readonly");
    var data = payload && typeof payload === "object" ? payload : {};
    var rows = Array.isArray(data.managers) ? data.managers : [];
    var canManage = data.canManagePoints === true;
    state.managersList = rows;
    state.canManagePmPoints = canManage;
    if (readonly) {
      if (canManage) readonly.setAttribute("hidden", "");
      else readonly.removeAttribute("hidden");
    }
    if (count) {
      count.textContent = rows.length
        ? i18n("dash.pm.count", "{n} Partner Manager").replace("{n}", String(rows.length))
        : i18n("dash.pm.listHintEmpty", "Nessun Partner Manager");
    }
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = "";
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    list.innerHTML = rows
      .map(function (row) {
        var uid = String(row.userId || "");
        var name = String(row.displayName || row.username || uid).trim() || uid;
        var avatar = String(row.avatarUrl || "").trim();
        var points = Math.max(0, Math.floor(Number(row.points) || 0));
        var total = Math.max(0, Math.floor(Number(row.total) || 0));
        var daily = Math.max(0, Math.floor(Number(row.daily) || 0));
        var weekly = Math.max(0, Math.floor(Number(row.weekly) || 0));
        var avatarHtml = avatar
          ? '<img class="vc-dash-pm__avatar" src="' +
            escHtml(avatar) +
            '" alt="" width="44" height="44" loading="lazy" />'
          : '<span class="vc-dash-pm__avatar vc-dash-pm__avatar--fallback" aria-hidden="true"><i class="fa fa-user"></i></span>';
        var controls =
          '<div class="vc-dash-pm__controls">' +
          '<label class="vc-dash-pm__amount">' +
          '<input type="number" min="1" max="10000" step="1" value="1" inputmode="numeric" ' +
          'aria-label="' +
          escHtml(i18n("dash.pm.amountLabel", "Importo")) +
          '" ' +
          (canManage ? "" : "disabled ") +
          'data-pm-amount="' +
          escHtml(uid) +
          '" placeholder="' +
          escHtml(i18n("dash.pm.amountPlaceholder", "1–10000")) +
          '" />' +
          "</label>" +
          '<button type="button" class="vc-dashboard-btn vc-dash-pm__btn vc-dash-pm__btn--add" data-pm-add="' +
          escHtml(uid) +
          '"' +
          (canManage ? "" : " disabled") +
          ">" +
          '<i class="fa fa-plus" aria-hidden="true"></i> <span>' +
          escHtml(i18n("dash.pm.add", "Aggiungi")) +
          "</span></button>" +
          '<button type="button" class="vc-dashboard-btn vc-dash-pm__btn vc-dash-pm__btn--remove" data-pm-remove="' +
          escHtml(uid) +
          '"' +
          (canManage ? "" : " disabled") +
          ">" +
          '<i class="fa fa-minus" aria-hidden="true"></i> <span>' +
          escHtml(i18n("dash.pm.remove", "Rimuovi")) +
          "</span></button>" +
          "</div>";
        return (
          '<article class="vc-dash-pm__row" data-pm-user="' +
          escHtml(uid) +
          '">' +
          '<div class="vc-dash-pm__main">' +
          avatarHtml +
          '<div class="vc-dash-pm__text">' +
          "<strong>" +
          escHtml(name) +
          "</strong>" +
          '<p class="vc-dash-pm__points" data-pm-points-label>' +
          escHtml(i18n("dash.pm.points", "{n} punti spendibili").replace("{n}", String(points))) +
          "</p>" +
          '<p class="vc-dash-pm__stats">' +
          escHtml(
            i18n("dash.pm.stats", "Totale {total} · Giorno {daily} · Settimana {weekly}")
              .replace("{total}", String(total))
              .replace("{daily}", String(daily))
              .replace("{weekly}", String(weekly)),
          ) +
          "</p>" +
          "</div></div>" +
          controls +
          "</article>"
        );
      })
      .join("");
  }

  async function refreshManagersList(opts) {
    opts = opts || {};
    var token = getToken();
    if (!token || !state.guildId) return;
    if (state.managersLoading) return;
    state.managersLoading = true;
    if (!opts.silent) {
      var count = byId("ps-pm-count");
      if (count) count.textContent = i18n("dash.pm.listHint", "Caricamento…");
    }
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership/managers",
        {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        showSaveToast(
          (data && data.message) || i18n("dash.pm.errLoad", "Impossibile caricare i Partner Manager."),
          true,
        );
        return;
      }
      renderManagersList(data);
    } catch (e) {
      showSaveToast(
        i18n("dash.pm.errNetwork", "Errore di rete durante il caricamento Partner Manager."),
        true,
      );
    } finally {
      state.managersLoading = false;
    }
  }

  function readManagerAmount(userId) {
    var input = document.querySelector('[data-pm-amount="' + String(userId || "") + '"]');
    if (!input) return null;
    var amount = Number.parseInt(String(input.value || "").trim(), 10);
    if (!Number.isInteger(amount) || amount < 1 || amount > 10000) return null;
    return amount;
  }

  async function adjustManagerPoints(userId, action) {
    var token = getToken();
    if (!token || !state.guildId || state.managersBusy) return;
    if (!state.canManagePmPoints) {
      showSaveToast(i18n("dash.pm.readonlyHint", "Stai visualizzando l’elenco in sola lettura."), true);
      return;
    }
    var uid = String(userId || "").trim();
    if (!uid) return;
    var amount = readManagerAmount(uid);
    if (amount == null) {
      showSaveToast(i18n("dash.pm.errAmount", "Inserisci un numero valido tra 1 e 10000."), true);
      return;
    }
    state.managersBusy = true;
    showSaveToast(i18n("dash.pm.working", "Aggiornamento punti…"), false, { pending: true });
    try {
      var res = await fetch(
        resolveApiBase() +
          "/guilds/" +
          encodeURIComponent(state.guildId) +
          "/partnership/managers/" +
          encodeURIComponent(uid) +
          "/points",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: action, amount: amount }),
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        showSaveToast(
          (data && data.message) || i18n("dash.pm.errAdjust", "Modifica punti non riuscita."),
          true,
        );
        return;
      }
      showSaveToast(data.message || i18n("dash.pm.working", "Aggiornamento punti…"), false);
      if (data.manager && Array.isArray(state.managersList)) {
        var next = state.managersList.slice();
        var found = false;
        for (var i = 0; i < next.length; i++) {
          if (String(next[i].userId) === uid) {
            next[i] = data.manager;
            found = true;
            break;
          }
        }
        if (!found) next.push(data.manager);
        next.sort(function (a, b) {
          return (
            (Number(b.points) || 0) - (Number(a.points) || 0) ||
            (Number(b.total) || 0) - (Number(a.total) || 0) ||
            String(a.displayName || "").localeCompare(String(b.displayName || ""), "it")
          );
        });
        renderManagersList({ canManagePoints: state.canManagePmPoints, managers: next });
      } else {
        await refreshManagersList({ silent: true });
      }
    } catch (e) {
      showSaveToast(
        i18n("dash.pm.errNetwork", "Errore di rete durante il caricamento Partner Manager."),
        true,
      );
    } finally {
      state.managersBusy = false;
    }
  }

  function wireManagersUi() {
    var refreshBtn = byId("ps-pm-refresh-btn");
    if (refreshBtn && !refreshBtn.__vcWired) {
      refreshBtn.__vcWired = true;
      refreshBtn.addEventListener("click", function () {
        refreshManagersList();
      });
    }
    var list = byId("ps-pm-list");
    if (list && !list.__vcWired) {
      list.__vcWired = true;
      list.addEventListener("click", function (ev) {
        var addBtn = ev.target && ev.target.closest ? ev.target.closest("[data-pm-add]") : null;
        if (addBtn) {
          ev.preventDefault();
          adjustManagerPoints(addBtn.getAttribute("data-pm-add"), "add");
          return;
        }
        var removeBtn = ev.target && ev.target.closest ? ev.target.closest("[data-pm-remove]") : null;
        if (removeBtn) {
          ev.preventDefault();
          adjustManagerPoints(removeBtn.getAttribute("data-pm-remove"), "remove");
        }
      });
    }
  }

  function syncHistoryFilterChips() {
    var root = byId("ps-history-root");
    if (!root) return;
    var days = String(state.historyDays || "all");
    root.querySelectorAll("[data-hist-days]").forEach(function (btn) {
      var active = String(btn.getAttribute("data-hist-days") || "") === days;
      if (active) btn.classList.add("is-active");
      else btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncHistoryPager() {
    var pager = byId("ps-hist-pager");
    var prev = byId("ps-hist-prev");
    var next = byId("ps-hist-next");
    var pageEl = byId("ps-hist-page");
    var page = Math.max(1, Number(state.historyPage) || 1);
    var totalPages = Math.max(1, Number(state.historyTotalPages) || 1);
    if (pageEl) pageEl.textContent = page + " / " + totalPages;
    if (prev) prev.disabled = page <= 1 || state.historyLoading;
    if (next) next.disabled = page >= totalPages || state.historyLoading;
    if (pager) {
      if (totalPages > 1) pager.removeAttribute("hidden");
      else pager.setAttribute("hidden", "");
      var mp = window.__vcMiniPager;
      if (mp && typeof mp.fill === "function" && totalPages > 1) {
        mp.fill(pager, page, totalPages, { aria: "Paginazione storico" }, {
          go: function (p) {
            if (state.historyLoading) return;
            state.historyPage = Math.max(1, Number(p) || 1);
            state.historyEntries = null;
            refreshHistoryList();
          },
        });
      }
    }
  }

  function renderHistoryList(payload) {
    var list = byId("ps-hist-list");
    var empty = byId("ps-hist-empty");
    var count = byId("ps-hist-count");
    var data = payload && typeof payload === "object" ? payload : {};
    var rows = Array.isArray(data.entries) ? data.entries : [];
    state.historyEntries = rows;
    state.historyUniqueServers = Math.max(0, Math.floor(Number(data.uniqueServers) || 0));
    state.historyTotalPartnerships = Math.max(0, Math.floor(Number(data.totalPartnerships) || 0));
    state.historyPage = Math.max(1, Math.floor(Number(data.page) || state.historyPage || 1));
    state.historyPageSize = Math.max(1, Math.floor(Number(data.pageSize) || state.historyPageSize || 10));
    state.historyTotalPages = Math.max(1, Math.floor(Number(data.totalPages) || 1));
    if (data.days == null || data.days === "" || String(data.days).toLowerCase() === "all") {
      state.historyDays = "all";
    } else {
      state.historyDays = String(data.days);
    }
    syncHistoryFilterChips();
    syncHistoryPager();
    if (count) {
      count.textContent = state.historyUniqueServers
        ? i18n("dash.history.count", "{servers} server · {total} partnership")
            .replace("{servers}", String(state.historyUniqueServers))
            .replace("{total}", String(state.historyTotalPartnerships))
        : i18n("dash.history.listHintEmpty", "Nessuna partnership");
    }
    if (!list) return;
    if (!rows.length) {
      list.innerHTML = "";
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    list.innerHTML = rows
      .map(function (row) {
        var name = row.guildName || i18n("dash.history.unknownServer", "Server sconosciuto");
        var gid = String(row.guildId || "");
        var icon = String(row.iconUrl || "").trim();
        var invite = String(row.invite || "").trim();
        var times = Math.max(0, Math.floor(Number(row.count) || 0));
        var timesLabel =
          times === 1
            ? i18n("dash.history.countOne", "1 volta")
            : i18n("dash.history.countMany", "{n} volte").replace("{n}", String(times));
        var when = formatBlacklistDate(row.lastAt);
        var lastLabel = when
          ? i18n("dash.history.last", "Ultima {when}").replace("{when}", when)
          : "";
        var iconHtml = icon
          ? '<img class="vc-dash-hist__icon" src="' +
            escHtml(icon) +
            '" alt="" width="42" height="42" loading="lazy" />'
          : '<span class="vc-dash-hist__icon vc-dash-hist__icon--fallback" aria-hidden="true"><i class="fa fa-server"></i></span>';
        var metaParts = [];
        if (gid) metaParts.push('<code class="vc-dash-hist__id">' + escHtml(gid) + "</code>");
        if (lastLabel) metaParts.push(escHtml(lastLabel));
        if (invite) {
          metaParts.push(
            '<a class="vc-dash-hist__invite" href="' +
              escHtml(invite) +
              '" target="_blank" rel="noopener noreferrer">' +
              escHtml(i18n("dash.history.openInvite", "Invite")) +
              "</a>",
          );
        }
        return (
          '<article class="vc-dash-hist__row" data-hist-guild="' +
          escHtml(gid) +
          '">' +
          '<div class="vc-dash-hist__main">' +
          iconHtml +
          '<div class="vc-dash-hist__text">' +
          "<strong>" +
          escHtml(name) +
          "</strong>" +
          '<p class="vc-dash-hist__meta">' +
          metaParts.join(" · ") +
          "</p>" +
          "</div></div>" +
          '<span class="vc-dash-hist__badge" title="' +
          escHtml(timesLabel) +
          '">' +
          escHtml(timesLabel) +
          "</span>" +
          "</article>"
        );
      })
      .join("");
  }

  async function refreshHistoryList(opts) {
    opts = opts || {};
    var token = getToken();
    if (!token || !state.guildId) return;
    if (state.historyLoading) return;
    state.historyLoading = true;
    syncHistoryFilterChips();
    syncHistoryPager();
    if (!opts.silent) {
      var count = byId("ps-hist-count");
      if (count) count.textContent = i18n("dash.history.listHint", "Caricamento…");
    }
    try {
      var qs = [];
      if (state.historyDays && state.historyDays !== "all") {
        qs.push("days=" + encodeURIComponent(state.historyDays));
      }
      qs.push("page=" + encodeURIComponent(String(Math.max(1, state.historyPage || 1))));
      qs.push("pageSize=" + encodeURIComponent(String(Math.max(1, state.historyPageSize || 10))));
      var url =
        resolveApiBase() +
        "/guilds/" +
        encodeURIComponent(state.guildId) +
        "/partnership/history?" +
        qs.join("&");
      var res = null;
      var data = {};
      var attempt = 0;
      while (attempt < 3) {
        attempt += 1;
        res = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: "Bearer " + token,
            Accept: "application/json",
            "Cache-Control": "no-cache",
          },
          cache: "no-store",
        });
        // 502/503 tipici durante restart site-api: ritenta.
        if (res.status === 502 || res.status === 503 || res.status === 504) {
          if (attempt < 3) {
            await new Promise(function (resolve) {
              setTimeout(resolve, 350 * attempt);
            });
            continue;
          }
        }
        data = await res.json().catch(function () {
          return {};
        });
        break;
      }
      if (!res || !res.ok || !data || data.ok === false) {
        var list = byId("ps-hist-list");
        var empty = byId("ps-hist-empty");
        var countErr = byId("ps-hist-count");
        if (list) list.innerHTML = "";
        if (empty) empty.removeAttribute("hidden");
        if (countErr) {
          countErr.textContent = i18n("dash.history.listHintEmpty", "Nessuna partnership");
        }
        showSaveToast(
          (data && data.message) || i18n("dash.history.errLoad", "Impossibile caricare la cronologia."),
          true,
        );
        return;
      }
      renderHistoryList(data);
    } catch (e) {
      var listNet = byId("ps-hist-list");
      var emptyNet = byId("ps-hist-empty");
      var countNet = byId("ps-hist-count");
      if (listNet) listNet.innerHTML = "";
      if (emptyNet) emptyNet.removeAttribute("hidden");
      if (countNet) {
        countNet.textContent = i18n("dash.history.listHintEmpty", "Nessuna partnership");
      }
      showSaveToast(
        i18n("dash.history.errNetwork", "Errore di rete durante il caricamento cronologia."),
        true,
      );
    } finally {
      state.historyLoading = false;
      syncHistoryPager();
    }
  }

  function wireHistoryUi() {
    var refreshBtn = byId("ps-hist-refresh-btn");
    if (refreshBtn && !refreshBtn.__vcWired) {
      refreshBtn.__vcWired = true;
      refreshBtn.addEventListener("click", function () {
        refreshHistoryList();
      });
    }
    var prev = byId("ps-hist-prev");
    if (prev && !prev.__vcWired) {
      prev.__vcWired = true;
      prev.addEventListener("click", function () {
        if (state.historyLoading || state.historyPage <= 1) return;
        state.historyPage -= 1;
        state.historyEntries = null;
        refreshHistoryList();
      });
    }
    var next = byId("ps-hist-next");
    if (next && !next.__vcWired) {
      next.__vcWired = true;
      next.addEventListener("click", function () {
        if (state.historyLoading || state.historyPage >= state.historyTotalPages) return;
        state.historyPage += 1;
        state.historyEntries = null;
        refreshHistoryList();
      });
    }
    var root = byId("ps-history-root");
    if (root && !root.__vcWired) {
      root.__vcWired = true;
      root.addEventListener("click", function (ev) {
        var chip = ev.target && ev.target.closest ? ev.target.closest("[data-hist-days]") : null;
        if (!chip) return;
        ev.preventDefault();
        var nextDays = String(chip.getAttribute("data-hist-days") || "all");
        if (nextDays === String(state.historyDays || "all")) return;
        state.historyDays = nextDays;
        state.historyPage = 1;
        state.historyEntries = null;
        refreshHistoryList();
      });
    }
  }

  function startMigrationPolling() {
    stopMigrationPolling();
    state.migrationPollTimer = setInterval(function () {
      if (state.view !== "partnership/dati") {
        stopMigrationPolling();
        return;
      }
      refreshMigrationStatus();
    }, 2500);
  }

  function lbHintText(category) {
    if (category === "partners") {
      return i18n("dash.lb.hintPartners", "Partner Manager di questo server, ordinati per partnership.");
    }
    if (category === "join") {
      return i18n("dash.lb.hintJoin", "Server ordinati per join arrivati dall’invite partnership.");
    }
    return i18n("dash.lb.hintServers", "Classifica globale dei server per partnership completate.");
  }

  function formatInt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
    }
  }

  function lbUnitLabel(unit, n) {
    var count = Math.max(0, Number(n) || 0);
    if (unit === "joins") {
      return count === 1
        ? i18n("dash.lb.unitJoinOne", "1 join")
        : i18n("dash.lb.unitJoinMany", "{n} join").replace("{n}", formatInt(count));
    }
    return count === 1
      ? i18n("dash.lb.unitPartnerOne", "1 partnership")
      : i18n("dash.lb.unitPartnerMany", "{n} partnership").replace("{n}", formatInt(count));
  }

  function syncLeaderboardControls() {
    var cats = document.querySelectorAll("[data-lb-cat]");
    Array.prototype.forEach.call(cats, function (btn) {
      var on = btn.getAttribute("data-lb-cat") === state.lbCategory;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    var periods = document.querySelectorAll("[data-lb-period]");
    Array.prototype.forEach.call(periods, function (btn) {
      var on = btn.getAttribute("data-lb-period") === state.lbPeriod;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderLeaderboardSelf(self, category, unit) {
    var host = byId("vc-dash-lb-self");
    if (!host) return;
    if (!self) {
      host.setAttribute("hidden", "");
      host.innerHTML = "";
      return;
    }
    var title =
      category === "partners"
        ? esc(self.displayName || self.username || self.userId || "—")
        : esc(self.name || self.guildId || "—");
    var sub =
      category === "partners"
        ? "@" + esc(self.username || self.userId || "")
        : esc(self.guildId || "");
    var img = String(self.avatarUrl || self.iconUrl || "").trim();
    host.innerHTML =
      '<div class="vc-dash-lb-self__card">' +
      (img
        ? '<img class="vc-dash-lb-self__avatar" src="' + esc(img) + '" alt="" width="44" height="44" loading="lazy" />'
        : '<span class="vc-dash-lb-self__avatar vc-dash-lb-self__avatar--empty" aria-hidden="true"></span>') +
      '<div class="vc-dash-lb-self__body">' +
      '<p class="vc-dash-lb-self__kicker">' +
      esc(i18n("dash.lb.yourRank", "La tua posizione")) +
      "</p>" +
      '<p class="vc-dash-lb-self__title">#' +
      esc(String(self.rank || "—")) +
      " · " +
      title +
      "</p>" +
      '<p class="vc-dash-lb-self__sub">' +
      sub +
      " · " +
      esc(lbUnitLabel(unit, self.score)) +
      "</p>" +
      "</div></div>";
    host.removeAttribute("hidden");
  }

  function renderLeaderboardRows(data) {
    var grid = byId("vc-dash-lb-grid");
    var status = byId("vc-dash-lb-status");
    var pager = byId("vc-dash-lb-pager");
    var prev = byId("vc-dash-lb-prev");
    var next = byId("vc-dash-lb-next");
    var pageEl = byId("vc-dash-lb-page");
    if (!grid) return;

    var category = String((data && data.category) || state.lbCategory);
    var unit = String((data && data.unit) || (category === "join" ? "joins" : "partnerships"));
    var rows = (data && data.rows) || [];
    var total = Number((data && data.total) || 0);
    var page = Number((data && data.page) || state.lbPage) || 1;
    var totalPages = Number((data && data.totalPages) || 1) || 1;

    renderLeaderboardSelf(data && data.self, category, unit);

    if (!rows.length) {
      grid.innerHTML = "";
      grid.setAttribute("hidden", "");
      if (status) {
        status.removeAttribute("hidden");
        status.innerHTML = "<span>" + esc(i18n("dash.lb.empty", "Nessun risultato per questa classifica.")) + "</span>";
      }
    } else {
      if (status) {
        status.setAttribute("hidden", "");
        status.innerHTML = "";
      }
      var html = "";
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var rank = Number(row.rank) || i + 1;
        var isSelf = row.isSelf === true;
        var medal = rank === 1 ? "is-gold" : rank === 2 ? "is-silver" : rank === 3 ? "is-bronze" : "";
        if (category === "partners") {
          var av = String(row.avatarUrl || "").trim();
          html +=
            '<article class="vc-dash-lb-card' +
            (isSelf ? " is-self" : "") +
            '" role="listitem">' +
            '<div class="vc-dash-lb-card__rank ' +
            medal +
            '">#' +
            esc(String(rank)) +
            "</div>" +
            (av
              ? '<img class="vc-dash-lb-card__avatar" src="' + esc(av) + '" alt="" width="48" height="48" loading="lazy" />'
              : '<span class="vc-dash-lb-card__avatar vc-dash-lb-card__avatar--empty" aria-hidden="true"></span>') +
            '<div class="vc-dash-lb-card__body">' +
            '<strong class="vc-dash-lb-card__name">' +
            esc(row.displayName || row.username || row.userId || "—") +
            "</strong>" +
            '<span class="vc-dash-lb-card__sub">@' +
            esc(row.username || row.userId || "") +
            "</span>" +
            "</div>" +
            '<div class="vc-dash-lb-card__score">' +
            esc(lbUnitLabel(unit, row.score)) +
            "</div></article>";
        } else {
          var icon = String(row.iconUrl || "").trim();
          var name = esc(row.name || row.guildId || "—");
          var nameHtml = row.inviteUrl
            ? '<a class="vc-dash-lb-card__name" href="' +
              esc(row.inviteUrl) +
              '" target="_blank" rel="noopener noreferrer">' +
              name +
              "</a>"
            : '<strong class="vc-dash-lb-card__name">' + name + "</strong>";
          html +=
            '<article class="vc-dash-lb-card' +
            (isSelf ? " is-self" : "") +
            '" role="listitem">' +
            '<div class="vc-dash-lb-card__rank ' +
            medal +
            '">#' +
            esc(String(rank)) +
            "</div>" +
            (icon
              ? '<img class="vc-dash-lb-card__avatar" src="' + esc(icon) + '" alt="" width="48" height="48" loading="lazy" />'
              : '<span class="vc-dash-lb-card__avatar vc-dash-lb-card__avatar--empty" aria-hidden="true"></span>') +
            '<div class="vc-dash-lb-card__body">' +
            nameHtml +
            '<span class="vc-dash-lb-card__sub">' +
            esc(row.guildId || "") +
            "</span>" +
            "</div>" +
            '<div class="vc-dash-lb-card__score">' +
            esc(lbUnitLabel(unit, row.score)) +
            "</div></article>";
        }
      }
      grid.innerHTML = html;
      grid.removeAttribute("hidden");
    }

    if (pager) {
      if (totalPages > 1) pager.removeAttribute("hidden");
      else pager.setAttribute("hidden", "");
      var mp = window.__vcMiniPager;
      if (mp && typeof mp.fill === "function" && totalPages > 1) {
        mp.fill(pager, page, totalPages, { aria: "Paginazione classifica" }, {
          go: function (p) {
            state.lbPage = Math.max(1, Number(p) || 1);
            refreshLeaderboard();
          },
        });
      } else {
        if (pageEl) pageEl.textContent = String(page) + " / " + String(totalPages);
        if (prev) prev.disabled = page <= 1;
        if (next) next.disabled = page >= totalPages;
      }
    }

  async function refreshLeaderboard(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseClassifiche()) return;
    syncLeaderboardControls();
    var seq = ++state.lbSeq;
    state.lbLoading = true;
    var status = byId("vc-dash-lb-status");
    var grid = byId("vc-dash-lb-grid");
    if (!options.silent) {
      if (grid) grid.setAttribute("hidden", "");
      if (status) {
        status.removeAttribute("hidden");
        status.innerHTML =
          '<span class="vc-dashboard-loading__spinner" aria-hidden="true"></span><span>' +
          esc(i18n("dash.lb.loading", "Caricamento classifica…")) +
          "</span>";
      }
    }
    try {
      var url =
        resolveApiBase() +
        "/guilds/" +
        encodeURIComponent(state.guildId) +
        "/leaderboard?category=" +
        encodeURIComponent(state.lbCategory) +
        "&period=" +
        encodeURIComponent(state.lbPeriod) +
        "&page=" +
        encodeURIComponent(String(state.lbPage || 1));
      var res = await fetch(url, {
        headers: { Authorization: "Bearer " + token },
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (seq !== state.lbSeq) return;
      if (!res.ok || !data || data.ok === false) {
        if (status) {
          status.removeAttribute("hidden");
          status.innerHTML =
            "<span>" +
            esc((data && data.message) || i18n("dash.lb.loadFailed", "Impossibile caricare la classifica.")) +
            "</span>";
        }
        if (grid) {
          grid.innerHTML = "";
          grid.setAttribute("hidden", "");
        }
        renderLeaderboardSelf(null, state.lbCategory, state.lbCategory === "join" ? "joins" : "partnerships");
        return;
      }
      state.lbLastPayload = data;
      state.lbPage = Number(data.page) || 1;
      renderLeaderboardRows(data);
    } catch (e) {
      if (seq !== state.lbSeq) return;
      if (status) {
        status.removeAttribute("hidden");
        status.innerHTML = "<span>" + esc(i18n("dash.lb.network", "Errore di rete durante il caricamento.")) + "</span>";
      }
    } finally {
      if (seq === state.lbSeq) state.lbLoading = false;
    }
  }

  function emptyCommandAcl() {
    return { enabled: true, roleMode: null, roleIds: [], channelMode: null, channelIds: [] };
  }

  function ensureCommandAcl(name) {
    if (!state.commandsMap) state.commandsMap = {};
    if (!state.commandsMap[name]) state.commandsMap[name] = emptyCommandAcl();
    var acl = state.commandsMap[name];
    if (typeof acl.enabled !== "boolean") acl.enabled = true;
    if (!Array.isArray(acl.roleIds)) acl.roleIds = [];
    if (!Array.isArray(acl.channelIds)) acl.channelIds = [];
    return acl;
  }

  function isCommandEnabled(name) {
    var acl = state.commandsMap && state.commandsMap[name];
    return !acl || acl.enabled !== false;
  }

  function isCommandBoardFeatureLocked(name) {
    var acl = state.commandsMap && state.commandsMap[name];
    return Boolean(acl && acl.boardFeatureLocked);
  }

  function findCatalogCommand(name) {
    var catalog = state.commandsCatalog || [];
    for (var c = 0; c < catalog.length; c++) {
      var cmds = catalog[c].commands || [];
      for (var i = 0; i < cmds.length; i++) {
        if (cmds[i].name === name) return cmds[i];
      }
    }
    return null;
  }

  function findCatalogCategory(catId) {
    var id = String(catId || "").trim();
    if (!id) return null;
    var catalog = state.commandsCatalog || [];
    for (var c = 0; c < catalog.length; c++) {
      if (String(catalog[c].id || "") === id) return catalog[c];
    }
    return null;
  }

  function categoryCommandNames(cat) {
    var cmds = (cat && cat.commands) || [];
    var names = [];
    for (var i = 0; i < cmds.length; i++) {
      var name = String((cmds[i] && cmds[i].name) || "").trim();
      if (name) names.push(name);
    }
    return names;
  }

  function categoryToggleableNames(cat) {
    return categoryCommandNames(cat).filter(function (name) {
      return !isCommandBoardFeatureLocked(name);
    });
  }

  function categoryToggleState(cat) {
    var names = categoryToggleableNames(cat);
    if (!names.length) {
      return { enabled: false, mixed: false, disabled: true };
    }
    var on = 0;
    for (var i = 0; i < names.length; i++) {
      if (isCommandEnabled(names[i])) on += 1;
    }
    return {
      enabled: on === names.length,
      mixed: on > 0 && on < names.length,
      disabled: false,
    };
  }

  function setCategoryCommandsEnabled(catId, enabled) {
    var cat = findCatalogCategory(catId);
    var names = categoryToggleableNames(cat);
    if (!names.length) return [];
    var on = Boolean(enabled);
    for (var i = 0; i < names.length; i++) {
      var acl = ensureCommandAcl(names[i]);
      acl.enabled = on;
      if (!on) {
        acl.roleMode = null;
        acl.roleIds = [];
        acl.channelMode = null;
        acl.channelIds = [];
      }
    }
    return names;
  }

  function setCommandsSettingsHint(isCategory, opts) {
    var modal = byId("vc-dash-cmds-settings-modal");
    if (!modal) return;
    var hint = modal.querySelector(".vc-dash-cmds-modal__hint");
    if (!hint) return;
    var options = opts || {};
    if (!isCategory) {
      hint.textContent = i18n(
        "dash.cmds.permHint",
        "Consentiti e ignorati sono alternativi: se imposti gli uni, gli altri vengono azzerati.",
      );
      return;
    }
    if (options.mixed) {
      hint.textContent = i18n(
        "dash.cmds.categoryPermHintMixed",
        "I comandi di questa sezione hanno permessi diversi. Imposta qui le regole comuni da applicare a tutti: Salva senza selezioni non cancella quelle già presenti.",
      );
      return;
    }
    hint.textContent = i18n(
      "dash.cmds.categoryPermHint",
      "Le stesse regole di canali e ruoli verranno applicate a tutti i comandi di questa sezione. Per azzerarle, rimuovi i chip e salva.",
    );
  }

  function isSettingsDraftEmpty(draft) {
    var d = draft || {};
    return (
      !(d.allowedChannels || []).length &&
      !(d.ignoredChannels || []).length &&
      !(d.allowedRoles || []).length &&
      !(d.ignoredRoles || []).length
    );
  }

  function cloneSettingsDraft(draft) {
    var d = draft || {};
    return {
      allowedChannels: (d.allowedChannels || []).slice(),
      ignoredChannels: (d.ignoredChannels || []).slice(),
      allowedRoles: (d.allowedRoles || []).slice(),
      ignoredRoles: (d.ignoredRoles || []).slice(),
    };
  }

  function settingsDraftKey(draft) {
    var d = draft || {};
    function key(arr) {
      return (arr || [])
        .map(String)
        .slice()
        .sort()
        .join(",");
    }
    return [key(d.allowedChannels), key(d.ignoredChannels), key(d.allowedRoles), key(d.ignoredRoles)].join("|");
  }

  function aclToSettingsDraft(acl) {
    var row = acl || {};
    return {
      allowedChannels: row.channelMode === "include" ? (row.channelIds || []).slice() : [],
      ignoredChannels: row.channelMode === "exclude" ? (row.channelIds || []).slice() : [],
      allowedRoles: row.roleMode === "include" ? (row.roleIds || []).slice() : [],
      ignoredRoles: row.roleMode === "exclude" ? (row.roleIds || []).slice() : [],
    };
  }

  function sharedCategorySettingsDraft(names) {
    var empty = {
      allowedChannels: [],
      ignoredChannels: [],
      allowedRoles: [],
      ignoredRoles: [],
    };
    var list = Array.isArray(names) ? names : [];
    if (!list.length) return { draft: empty, mixed: false, hasAny: false };
    var first = aclToSettingsDraft(ensureCommandAcl(list[0]));
    var firstKey = settingsDraftKey(first);
    var hasAny = !isSettingsDraftEmpty(first);
    for (var i = 1; i < list.length; i++) {
      var next = aclToSettingsDraft(ensureCommandAcl(list[i]));
      if (!isSettingsDraftEmpty(next)) hasAny = true;
      if (settingsDraftKey(next) !== firstKey) {
        return { draft: empty, mixed: true, hasAny: hasAny };
      }
    }
    return { draft: first, mixed: false, hasAny: hasAny };
  }

  function isSlashCommand(cmd) {
    if (!cmd) return false;
    if (cmd.kind === "slash" || cmd.syncsToDiscord) return true;
    return /^s:[123]:/i.test(String(cmd.name || ""));
  }

  function commandDisplayLabel(cmd) {
    if (!cmd) return "";
    if (cmd.displayName) return String(cmd.displayName);
    if (isSlashCommand(cmd)) return String(cmd.discordName || cmd.name || "");
    return commandPrefix() + String(cmd.name || "");
  }

  function commandPrefix() {
    return String(state.commandsPrefix || "+") || "+";
  }

  function cmdPickerLabel(list, id) {
    var sid = String(id || "");
    for (var i = 0; i < (list || []).length; i++) {
      if (String(list[i].id) === sid) return String(list[i].name || sid);
    }
    return sid;
  }

  function cmdChannelPosition(row) {
    var n = Number(row && row.position);
    return Number.isFinite(n) ? n : 0;
  }

  function cmdAllSelectableChannels(pickers) {
    var p = pickers || {};
    return [].concat(p.textChannels || [], p.voiceChannels || []).sort(function (a, b) {
      var dp = cmdChannelPosition(a) - cmdChannelPosition(b);
      if (dp) return dp;
      return String((a && a.name) || "").localeCompare(String((b && b.name) || ""), "it", {
        sensitivity: "base",
      });
    });
  }

  function cmdChannelTokenLabel(id) {
    var pickers = state.commandsPickers || {};
    var sid = String(id || "");
    var catName = cmdPickerLabel(pickers.categories || [], sid);
    if (catName !== sid) {
      return i18n("dash.cmds.categoryChip", "Categoria: {name}").replace("{name}", catName);
    }
    var chName = cmdPickerLabel(pickers.textChannels || [], sid);
    if (chName !== sid) return "#" + chName;
    var voiceName = cmdPickerLabel(pickers.voiceChannels || [], sid);
    if (voiceName !== sid) {
      return i18n("dash.cmds.voiceChip", "Vocale: {name}").replace("{name}", voiceName);
    }
    return sid;
  }

  function channelCategoryMeta(channel, pickersOverride) {
    var pickers = pickersOverride || state.commandsPickers || {};
    var cats = pickers.categories || [];
    var parentId = channel && channel.parentId ? String(channel.parentId) : "";
    if (!parentId) {
      return {
        key: "__none__",
        id: null,
        name: i18n("dash.cmds.uncategorized", "Senza categoria"),
      };
    }
    return {
      key: parentId,
      id: parentId,
      name: cmdPickerLabel(cats, parentId) || i18n("dash.cmds.uncategorized", "Senza categoria"),
    };
  }

  function buildGroupedChannelOptions(selectedIds, query, pickersOverride) {
    var pickers = pickersOverride || state.commandsPickers || {};
    var channels = cmdAllSelectableChannels(pickers);
    var cats = pickers.categories || [];
    var catPos = {};
    for (var ci = 0; ci < cats.length; ci++) {
      var crow = cats[ci];
      var cid0 = String((crow && crow.id) || "");
      if (cid0) catPos[cid0] = cmdChannelPosition(crow);
    }
    var selected = {};
    (selectedIds || []).forEach(function (id) {
      selected[String(id)] = true;
    });
    var q = String(query || "").trim().toLowerCase();
    var groups = {};
    var order = [];

    function ensureGroup(meta) {
      var key = String(meta.key || "");
      if (!key || groups[key]) return groups[key];
      groups[key] = {
        key: key,
        id: meta.id || null,
        name: meta.name || key,
        channels: [],
      };
      order.push(key);
      return groups[key];
    }

    for (var c = 0; c < cats.length; c++) {
      var cat = cats[c];
      var cid = String(cat.id || "");
      if (!cid) continue;
      var catName = String(cat.name || cid);
      if (q && catName.toLowerCase().indexOf(q) < 0) continue;
      ensureGroup({ key: cid, id: cid, name: catName });
    }

    for (var i = 0; i < channels.length; i++) {
      var ch = channels[i];
      var id = String(ch.id || "");
      if (!id || selected[id]) continue;
      var name = String(ch.name || id);
      if (String(ch.kind || "") === "voice") {
        name = i18n("dash.cmds.voiceChip", "Vocale: {name}").replace("{name}", name);
      }
      var meta = channelCategoryMeta(ch, pickers);
      var catMatch = q && String(meta.name || "").toLowerCase().indexOf(q) >= 0;
      var chMatch = !q || name.toLowerCase().indexOf(q) >= 0;
      if (q && !catMatch && !chMatch) continue;
      var group = ensureGroup(meta);
      if (!q || chMatch || catMatch) {
        if (!q || chMatch) {
          group.channels.push({ id: id, name: name, position: cmdChannelPosition(ch) });
        } else if (catMatch) {
          group.channels.push({ id: id, name: name, position: cmdChannelPosition(ch) });
        }
      }
    }

    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      if (!g || !Array.isArray(g.channels)) return;
      g.channels.sort(function (a, b) {
        var dp = cmdChannelPosition(a) - cmdChannelPosition(b);
        if (dp) return dp;
        return String(a.name || "").localeCompare(String(b.name || ""), "it", { sensitivity: "base" });
      });
    });

    // Keep uncategorized only if it has channels.
    order = order.filter(function (key) {
      var g = groups[key];
      if (!g) return false;
      if (key === "__none__") return g.channels.length > 0;
      if (q) {
        var nameHit = String(g.name || "").toLowerCase().indexOf(q) >= 0;
        return nameHit || g.channels.length > 0;
      }
      return true;
    });
    order.sort(function (a, b) {
      if (a === "__none__") return 1;
      if (b === "__none__") return -1;
      var dp = (catPos[a] || 0) - (catPos[b] || 0);
      if (dp) return dp;
      return String(groups[a].name || a).localeCompare(String(groups[b].name || b), "it");
    });
    return { order: order, groups: groups, selected: selected };
  }

  function buildRoleOptions(selectedIds, query) {
    var pickers = state.commandsPickers || {};
    var roles = pickers.roles || [];
    var selected = {};
    (selectedIds || []).forEach(function (id) {
      selected[String(id)] = true;
    });
    var q = String(query || "").trim().toLowerCase();
    var out = [];
    for (var i = 0; i < roles.length; i++) {
      var role = roles[i];
      var id = String(role.id || "");
      if (!id || selected[id]) continue;
      var name = String(role.name || id);
      if (q && name.toLowerCase().indexOf(q) < 0) continue;
      out.push({ id: id, name: name });
    }
    return out;
  }

  function ensureSettingsDraft() {
    if (!state.commandsSettingsDraft) {
      state.commandsSettingsDraft = {
        allowedChannels: [],
        ignoredChannels: [],
        allowedRoles: [],
        ignoredRoles: [],
      };
    }
    return state.commandsSettingsDraft;
  }

  function closeAllTokenMenus(exceptField) {
    var modal = byId("vc-dash-cmds-settings-modal");
    if (!modal) return;
    Array.prototype.forEach.call(modal.querySelectorAll("[data-cmd-token-field]"), function (field) {
      if (exceptField && field === exceptField) return;
      var menu = field.querySelector("[data-cmd-token-menu]");
      var search = field.querySelector("[data-cmd-token-search]");
      if (menu) menu.setAttribute("hidden", "");
      field.classList.remove("is-open");
      if (search) search.value = "";
    });
  }

  function renderTokenField(fieldKey) {
    var draft = ensureSettingsDraft();
    var field = document.querySelector('[data-cmd-token-field="' + fieldKey + '"]');
    if (!field) return;
    var chipsHost = field.querySelector("[data-cmd-token-chips]");
    var menu = field.querySelector("[data-cmd-token-menu]");
    var search = field.querySelector("[data-cmd-token-search]");
    var ids = Array.isArray(draft[fieldKey]) ? draft[fieldKey] : [];
    var isChannel = fieldKey.indexOf("Channels") >= 0;
    var pickers = state.commandsPickers || {};
    var options = isChannel ? cmdAllSelectableChannels(pickers) : pickers.roles || [];
    var chipsHtml = "";
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i]);
      var chipLabel = isChannel ? cmdChannelTokenLabel(id) : cmdPickerLabel(options, id);
      var isCategoryChip =
        isChannel && cmdPickerLabel((pickers.categories || []), id) !== id;
      chipsHtml +=
        '<button type="button" class="vc-dash-token-chip' +
        (isCategoryChip ? " vc-dash-token-chip--category" : "") +
        '" data-cmd-token-remove="' +
        esc(id) +
        '">' +
        esc(chipLabel) +
        ' <span aria-hidden="true">×</span></button>';
    }
    if (chipsHost) chipsHost.innerHTML = chipsHtml;
    if (!menu) return;
    var q = search ? search.value : "";
    var menuHtml = "";
    if (isChannel) {
      var grouped = buildGroupedChannelOptions(ids, q);
      if (!grouped.order.length) {
        menuHtml =
          '<p class="vc-dash-token-field__empty">' +
          esc(i18n("dash.cmds.noOptions", "Nessuna opzione disponibile.")) +
          "</p>";
      } else {
        for (var g = 0; g < grouped.order.length; g++) {
          var groupKey = grouped.order[g];
          var group = grouped.groups[groupKey] || { name: groupKey, channels: [] };
          var catId = group.id ? String(group.id) : "";
          var catSelected = Boolean(catId && grouped.selected[catId]);
          if (catId && !catSelected) {
            menuHtml +=
              '<button type="button" class="vc-dash-token-field__group vc-dash-token-field__group--btn" data-cmd-token-add="' +
              esc(catId) +
              '" title="' +
              esc(i18n("dash.cmds.selectCategory", "Seleziona tutta la categoria")) +
              '">' +
              esc(group.name) +
              "</button>";
          } else {
            menuHtml +=
              '<p class="vc-dash-token-field__group' +
              (catSelected ? " is-selected" : "") +
              '">' +
              esc(group.name) +
              (catSelected ? " ✓" : "") +
              "</p>";
          }
          var items = group.channels || [];
          for (var j = 0; j < items.length; j++) {
            menuHtml +=
              '<button type="button" class="vc-dash-token-field__option" data-cmd-token-add="' +
              esc(items[j].id) +
              '">#' +
              esc(items[j].name) +
              "</button>";
          }
        }
      }
    } else {
      var roles = buildRoleOptions(ids, q);
      if (!roles.length) {
        menuHtml =
          '<p class="vc-dash-token-field__empty">' +
          esc(i18n("dash.cmds.noOptions", "Nessuna opzione disponibile.")) +
          "</p>";
      } else {
        for (var r = 0; r < roles.length; r++) {
          menuHtml +=
            '<button type="button" class="vc-dash-token-field__option" data-cmd-token-add="' +
            esc(roles[r].id) +
            '">' +
            esc(roles[r].name) +
            "</button>";
        }
      }
    }
    menu.innerHTML = menuHtml;
  }

  function refreshAllTokenFields() {
    ["allowedChannels", "ignoredChannels", "allowedRoles", "ignoredRoles"].forEach(renderTokenField);
  }

  function addTokenToField(fieldKey, id) {
    var draft = ensureSettingsDraft();
    var sid = String(id || "").trim();
    if (!sid) return;
    if ((draft[fieldKey] || []).indexOf(sid) >= 0) return;
    if (fieldKey === "allowedChannels") draft.ignoredChannels = [];
    if (fieldKey === "ignoredChannels") draft.allowedChannels = [];
    if (fieldKey === "allowedRoles") draft.ignoredRoles = [];
    if (fieldKey === "ignoredRoles") draft.allowedRoles = [];
    draft[fieldKey] = (draft[fieldKey] || []).concat([sid]);
    refreshAllTokenFields();
  }

  function removeTokenFromField(fieldKey, id) {
    var draft = ensureSettingsDraft();
    var sid = String(id || "");
    draft[fieldKey] = (draft[fieldKey] || []).filter(function (x) {
      return String(x) !== sid;
    });
    renderTokenField(fieldKey);
  }

  function mountCommandsModal(modal) {
    if (!modal) return;
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    document.documentElement.classList.add("vc-dash-cmds-modal-open");
    document.body.classList.add("vc-dash-cmds-modal-open");
    modal.removeAttribute("hidden");
  }

  function closeCommandsModals() {
    var help = byId("vc-dash-cmds-help-modal");
    var settings = byId("vc-dash-cmds-settings-modal");
    closeAllTokenMenus();
    if (help) help.setAttribute("hidden", "");
    if (settings) settings.setAttribute("hidden", "");
    document.documentElement.classList.remove("vc-dash-cmds-modal-open");
    document.body.classList.remove("vc-dash-cmds-modal-open");
    state.commandsSettingsName = null;
    state.commandsSettingsCategoryId = null;
    state.commandsSettingsDraft = null;
    state.commandsSettingsInitialDraft = null;
  }

  function openCommandHelp(name) {
    var cmd = findCatalogCommand(name);
    if (!cmd) return;
    var modal = byId("vc-dash-cmds-help-modal");
    var title = byId("vc-dash-cmds-help-title");
    var body = byId("vc-dash-cmds-help-body");
    if (!modal || !body) return;
    closeCommandsModals();
    var label = commandDisplayLabel(cmd);
    if (title) title.textContent = i18n("dash.cmds.helpTitle", "Comando: {cmd}").replace("{cmd}", label);
    var slash = isSlashCommand(cmd);
    var cooldown =
      !slash && cmd.cooldownSeconds && cmd.cooldownSeconds > 0
        ? i18n("dash.cmds.cooldownSeconds", "{n} secondi").replace("{n}", String(cmd.cooldownSeconds))
        : i18n("dash.cmds.cooldownNone", "Nessuno");
    var usage = cmd.usage || (slash ? label : commandPrefix() + cmd.name);
    var examples = Array.isArray(cmd.examples) && cmd.examples.length ? cmd.examples : [usage];
    var desc =
      cmd.description ||
      i18n("dash.cmds.noDescription", "Nessuna descrizione disponibile.");
    var aliases = Array.isArray(cmd.aliases) ? cmd.aliases.filter(Boolean) : [];
    var aliasesHtml = "";
    if (!slash && aliases.length) {
      var pfx = commandPrefix();
      aliasesHtml =
        "<div><dt>" +
        esc(i18n("dash.cmds.aliases", "Alias")) +
        "</dt><dd><code>" +
        esc(
          aliases
            .map(function (a) {
              return pfx + a;
            })
            .join(", "),
        ) +
        "</code></dd></div>";
    }
    var typeHtml =
      "<div><dt>" +
      esc(i18n("dash.cmds.slashType", "Tipo")) +
      "</dt><dd>" +
      esc(
        slash
          ? cmd.typeLabel || i18n("dash.cmds.slash", "Slash")
          : cmd.typeLabel || i18n("dash.cmds.prefix", "Prefix"),
      ) +
      "</dd></div>";
    var discordNote = "";
    if (slash) {
      discordNote =
        '<p class="vc-dash-cmds-help__note">' +
        esc(
          i18n(
            "dash.cmds.slashHelpNote",
            "I permessi di canali e ruoli di questo comando vengono scritti sull’integrazione Discord del server.",
          ),
        ) +
        "</p>";
    } else {
      discordNote =
        '<p class="vc-dash-cmds-help__note">' +
        esc(
          i18n(
            "dash.cmds.prefixHelpNote",
            "I prefix restano sul bot. Se salvi una whitelist di ruoli qui, quella sostituisce permissions.json per questo comando (anche sul main).",
          ),
        ) +
        "</p>";
    }
    body.innerHTML =
      discordNote +
      '<dl class="vc-dash-cmds-help">' +
      typeHtml +
      (slash
        ? ""
        : "<div><dt>" +
          esc(i18n("dash.cmds.cooldown", "Tempo di attesa")) +
          "</dt><dd>" +
          esc(cooldown) +
          "</dd></div>") +
      "<div><dt>" +
      esc(i18n("dash.cmds.description", "Descrizione")) +
      "</dt><dd>" +
      esc(desc) +
      "</dd></div>" +
      aliasesHtml +
      "<div><dt>" +
      esc(i18n("dash.cmds.usage", "Utilizzo")) +
      "</dt><dd><code>" +
      esc(usage) +
      "</code></dd></div>" +
      "<div><dt>" +
      esc(i18n("dash.cmds.example", "Esempio")) +
      "</dt><dd><code>" +
      esc(examples[0]) +
      "</code></dd></div>" +
      "</dl>";
    mountCommandsModal(modal);
  }

  function openCommandSettings(name) {
    var cmdMeta = findCatalogCommand(name);
    var acl = ensureCommandAcl(name);
    var modal = byId("vc-dash-cmds-settings-modal");
    var title = byId("vc-dash-cmds-settings-title");
    if (!modal) return;
    closeCommandsModals();
    state.commandsSettingsName = name;
    state.commandsSettingsCategoryId = null;
    state.commandsSettingsDraft = aclToSettingsDraft(acl);
    state.commandsSettingsInitialDraft = cloneSettingsDraft(state.commandsSettingsDraft);
    if (title) {
      title.textContent = i18n("dash.cmds.settingsTitle", "Permessi comando ({cmd})").replace(
        "{cmd}",
        commandDisplayLabel(cmdMeta) || name,
      );
    }
    setCommandsSettingsHint(false);
    refreshAllTokenFields();
    mountCommandsModal(modal);
  }

  function openCategoryCommandSettings(catId) {
    var cat = findCatalogCategory(catId);
    var modal = byId("vc-dash-cmds-settings-modal");
    var title = byId("vc-dash-cmds-settings-title");
    if (!modal || !cat) return;
    var names = categoryCommandNames(cat);
    if (!names.length) return;
    closeCommandsModals();
    var shared = sharedCategorySettingsDraft(names);
    state.commandsSettingsName = null;
    state.commandsSettingsCategoryId = String(cat.id);
    state.commandsSettingsDraft = cloneSettingsDraft(shared.draft);
    state.commandsSettingsInitialDraft = cloneSettingsDraft(shared.draft);
    if (title) {
      title.textContent = i18n(
        "dash.cmds.categorySettingsTitle",
        "Permessi per tutti i comandi ({cat})",
      ).replace("{cat}", cat.label || cat.id);
    }
    setCommandsSettingsHint(true, { mixed: shared.mixed });
    refreshAllTokenFields();
    mountCommandsModal(modal);
  }

  function applySettingsModalToAcl(name) {
    var acl = ensureCommandAcl(name);
    var draft = ensureSettingsDraft();
    var allowedChannels = draft.allowedChannels || [];
    var ignoredChannels = draft.ignoredChannels || [];
    var allowedRoles = draft.allowedRoles || [];
    var ignoredRoles = draft.ignoredRoles || [];
    if (allowedChannels.length) {
      acl.channelMode = "include";
      acl.channelIds = allowedChannels.slice();
    } else if (ignoredChannels.length) {
      acl.channelMode = "exclude";
      acl.channelIds = ignoredChannels.slice();
    } else {
      acl.channelMode = null;
      acl.channelIds = [];
    }
    if (allowedRoles.length) {
      acl.roleMode = "include";
      acl.roleIds = allowedRoles.slice();
    } else if (ignoredRoles.length) {
      acl.roleMode = "exclude";
      acl.roleIds = ignoredRoles.slice();
    } else {
      acl.roleMode = null;
      acl.roleIds = [];
    }
    return acl;
  }

  function setCommandsFeedback(kind, msg) {
    var status = byId("vc-dash-cmds-status");
    if (status) {
      status.setAttribute("hidden", "");
      status.innerHTML = "";
      status.classList.remove("is-ok", "is-err", "is-busy");
    }
    if (!msg) return;
    if (kind === "busy") {
      showSaveToast(msg, false, { pending: true });
      return;
    }
    showSaveToast(msg, kind === "err");
  }

  function buildCommandAclPayload(cmdName) {
    var acl = ensureCommandAcl(cmdName);
    var payload = {
      enabled: acl.enabled !== false,
      roleMode: acl.roleMode || null,
      roleIds: acl.roleMode ? acl.roleIds || [] : [],
      channelMode: acl.channelMode || null,
      channelIds: acl.channelMode ? acl.channelIds || [] : [],
    };
    if (payload.enabled === false) {
      payload.roleMode = null;
      payload.roleIds = [];
      payload.channelMode = null;
      payload.channelIds = [];
      acl.roleMode = null;
      acl.roleIds = [];
      acl.channelMode = null;
      acl.channelIds = [];
    }
    if (payload.enabled && !payload.roleMode && !payload.channelMode) return null;
    return payload;
  }

  function scheduleCommandsSave(cmdName) {
    var name = String(cmdName || "").trim();
    if (!name) return;
    if (!state.commandsPendingSave) state.commandsPendingSave = {};
    state.commandsPendingSave[name] = true;
    if (state.commandsAutosaveTimer) clearTimeout(state.commandsAutosaveTimer);
    state.commandsAutosaveTimer = setTimeout(function () {
      state.commandsAutosaveTimer = null;
      var names = Object.keys(state.commandsPendingSave || {});
      state.commandsPendingSave = {};
      if (!names.length) return;
      saveCommandAcls(names).catch(function () {});
    }, 450);
  }

  async function saveCommandAcl(cmdName) {
    return saveCommandAcls([cmdName]);
  }

  async function saveCommandAcls(cmdNames) {
    var token = getToken();
    if (!token || !state.guildId) return false;
    var names = (Array.isArray(cmdNames) ? cmdNames : [])
      .map(function (n) {
        return String(n || "").trim();
      })
      .filter(Boolean);
    if (!names.length) return false;

    var body = { commands: {} };
    for (var i = 0; i < names.length; i++) {
      body.commands[names[i]] = buildCommandAclPayload(names[i]);
    }

    var seq = ++state.commandsSaveSeq;
    state.commandsSaving = true;
    setCommandsFeedback("busy", i18n("dash.cmds.saving", "Salvataggio impostazioni…"));
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/commands",
        {
          method: "PATCH",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (seq !== state.commandsSaveSeq) return false;
      if (!res.ok || !data || data.ok === false) {
        var errMsg =
          (data && data.message) || i18n("dash.cmds.saveFailed", "Salvataggio comandi non riuscito.");
        setCommandsFeedback("err", errMsg);
        if (data && data.error === "missing_command_permissions_scope") {
          state.commandsDiscordWarning = errMsg;
          renderCommandsPage();
        }
        // Ricarica dallo stato server/Discord per non lasciare valori “fantasma” in UI.
        await refreshCommandsPage({ silent: true });
        return false;
      }
      if (data.commands) state.commandsMap = data.commands;
      if (data.prefix) state.commandsPrefix = data.prefix;
      if (data.discordSync && data.discordSync.ok === false) {
        state.commandsDiscordWarning = data.discordSync.warning || "";
      } else {
        state.commandsDiscordWarning = "";
      }
      setCommandsFeedback("ok", i18n("dash.cmds.saved", "Impostazioni comando salvate."));
      renderCommandsPage();
      return true;
    } catch (e) {
      if (seq !== state.commandsSaveSeq) return false;
      setCommandsFeedback("err", i18n("dash.cmds.network", "Errore di rete durante il salvataggio."));
      await refreshCommandsPage({ silent: true });
      return false;
    } finally {
      if (seq === state.commandsSaveSeq) state.commandsSaving = false;
    }
  }

  function resolveCommandsCategoryFilter(catalog) {
    var list = catalog || [];
    if (!list.length) {
      state.commandsCategoryFilter = "";
      return "";
    }
    var filter = String(state.commandsCategoryFilter || "").trim();
    if (filter && filter !== "all") {
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === filter) return filter;
      }
    }
    state.commandsCategoryFilter = list[0].id;
    return state.commandsCategoryFilter;
  }

  function renderCommandsTabs(catalog) {
    var tabs = byId("vc-dash-cmds-tabs");
    if (!tabs) return;
    if (!catalog.length) {
      tabs.setAttribute("hidden", "");
      tabs.innerHTML = "";
      return;
    }
    var filter = resolveCommandsCategoryFilter(catalog);
    var html = "";
    for (var c = 0; c < catalog.length; c++) {
      var cat = catalog[c];
      var active = filter === cat.id;
      html +=
        '<button type="button" class="vc-dash-cmds__tab' +
        (active ? " is-active" : "") +
        '" data-cmds-cat="' +
        esc(cat.id) +
        '" aria-selected="' +
        (active ? "true" : "false") +
        '">' +
        esc(cat.label || cat.id) +
        ' <span class="vc-dash-cmds__tab-count">' +
        esc(String((cat.commands || []).length)) +
        "</span></button>";
    }
    tabs.innerHTML = html;
    tabs.removeAttribute("hidden");
  }

  function renderCommandsPage() {
    var root = byId("vc-dash-cmds-root");
    if (!root) return;
    var catalog = state.commandsCatalog || [];
    renderCommandsTabs(catalog);
    if (!catalog.length) {
      root.innerHTML =
        '<p class="vc-dash-lb__meta">' +
        esc(i18n("dash.cmds.emptyCatalog", "Nessun comando disponibile per questo server.")) +
        "</p>";
      return;
    }
    var filter = resolveCommandsCategoryFilter(catalog);
    var html = "";
    if (state.commandsDiscordWarning) {
      html +=
        '<aside class="vc-dash-cmds__discord">' +
        '<div class="vc-dash-cmds__discord-copy">' +
        "<strong>" +
        esc(i18n("dash.cmds.scopeTitle", "Permesso Discord richiesto")) +
        "</strong>" +
        "<p>" +
        esc(state.commandsDiscordWarning) +
        "</p>" +
        '<button type="button" class="vc-dash-cmds__discord-btn" data-cmds-reauth-scope>' +
        esc(
          i18n(
            "dash.cmds.scopeRelogin",
            "Esci e autorizza di nuovo (consenti aggiornamento comandi)",
          ),
        ) +
        "</button>" +
        "</div></aside>";
    }
    for (var c = 0; c < catalog.length; c++) {
      var cat = catalog[c];
      if (cat.id !== filter) continue;
      var catToggle = categoryToggleState(cat);
      var catToggleTitle = catToggle.disabled
        ? i18n(
            "dash.cmds.boardFeatureLocked",
            "Disattivato dalle funzioni Bacheca. Riattivalo da Bacheca → Funzioni.",
          )
        : i18n("dash.cmds.categoryToggle", "Attiva / disattiva tutti i comandi");
      html +=
        '<section class="vc-dash-cmds__cat">' +
        '<header class="vc-dash-cmds__cat-head">' +
        '<div class="vc-dash-cmds__cat-head-main">' +
        '<h3 class="vc-dash-cmds__cat-title">' +
        esc(cat.label || cat.id) +
        '</h3><span class="vc-dash-cmds__cat-count">' +
        esc(String((cat.commands || []).length)) +
        "</span></div>" +
        '<div class="vc-dash-cmds__cat-actions">' +
        '<label class="vc-dash-cmds__toggle vc-dash-cmds__toggle--cat" title="' +
        esc(catToggleTitle) +
        '">' +
        '<input type="checkbox" data-cmd-cat-toggle="' +
        esc(cat.id) +
        '"' +
        (catToggle.enabled ? " checked" : "") +
        (catToggle.disabled ? " disabled" : "") +
        (catToggle.mixed ? ' data-indeterminate="1"' : "") +
        " />" +
        '<span class="vc-dash-cmds__toggle-ui" aria-hidden="true"></span>' +
        "</label>" +
        '<button type="button" class="vc-dash-cmds__cat-settings" data-cmd-cat-settings="' +
        esc(cat.id) +
        '">' +
        esc(i18n("dash.cmds.categorySettings", "Canali e ruoli per tutti")) +
        "</button></div></header>" +
        '<div class="vc-dash-cmds__grid">';
      for (var i = 0; i < (cat.commands || []).length; i++) {
        var cmd = cat.commands[i];
        var slash = isSlashCommand(cmd);
        var enabled = isCommandEnabled(cmd.name);
        var boardLocked = isCommandBoardFeatureLocked(cmd.name);
        var desc =
          cmd.description ||
          i18n("dash.cmds.noDescription", "Nessuna descrizione disponibile.");
        var label = commandDisplayLabel(cmd);
        var badgeLabel = slash
          ? cmd.typeLabel || i18n("dash.cmds.slash", "Slash")
          : cmd.typeLabel || i18n("dash.cmds.prefix", "Prefix");
        var toggleTitle = boardLocked
          ? i18n(
              "dash.cmds.boardFeatureLocked",
              "Disattivato dalle funzioni Bacheca. Riattivalo da Bacheca → Funzioni.",
            )
          : i18n("dash.cmds.toggle", "Attiva / disattiva");
        html +=
          '<article class="vc-dash-cmds__card' +
          (enabled ? "" : " is-off") +
          (slash ? " vc-dash-cmds__card--slash" : " vc-dash-cmds__card--prefix") +
          '" data-cmd="' +
          esc(cmd.name) +
          '"' +
          (slash ? ' data-cmd-kind="slash"' : ' data-cmd-kind="prefix"') +
          ">" +
          '<header class="vc-dash-cmds__card-head">' +
          '<div class="vc-dash-cmds__name-wrap">' +
          '<strong class="vc-dash-cmds__name">' +
          esc(label) +
          "</strong>" +
          '<span class="vc-dash-cmds__badge' +
          (slash ? "" : " vc-dash-cmds__badge--prefix") +
          '">' +
          esc(badgeLabel) +
          "</span>" +
          "</div>" +
          '<label class="vc-dash-cmds__toggle" title="' +
          esc(toggleTitle) +
          '">' +
          '<input type="checkbox" data-cmd-toggle="' +
          esc(cmd.name) +
          '"' +
          (enabled ? " checked" : "") +
          (boardLocked ? " disabled" : "") +
          " />" +
          '<span class="vc-dash-cmds__toggle-ui" aria-hidden="true"></span>' +
          "</label></header>" +
          '<p class="vc-dash-cmds__desc">' +
          esc(desc) +
          "</p>" +
          '<div class="vc-dash-cmds__actions">' +
          '<button type="button" class="vc-dash-cmds__action" data-cmd-settings="' +
          esc(cmd.name) +
          '"><span aria-hidden="true">⚙</span> ' +
          esc(i18n("dash.cmds.settings", "Impostazioni")) +
          "</button>" +
          '<button type="button" class="vc-dash-cmds__action" data-cmd-help="' +
          esc(cmd.name) +
          '"><span aria-hidden="true">?</span> ' +
          esc(i18n("dash.cmds.help", "Aiuto")) +
          "</button>" +
          "</div></article>";
      }
      html += "</div></section>";
    }
    root.innerHTML = html;
    Array.prototype.forEach.call(root.querySelectorAll("[data-cmd-cat-toggle][data-indeterminate]"), function (el) {
      el.indeterminate = true;
    });
  }

  async function refreshCommandsPage(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseGuildSettings()) return;
    var status = byId("vc-dash-cmds-status");
    if (status) {
      status.setAttribute("hidden", "");
      status.innerHTML = "";
    }
    if (!options.silent) {
      showSaveToast(i18n("dash.cmds.loading", "Caricamento comandi…"), false, { pending: true });
    }
    state.commandsLoading = true;
    try {
      if (
        typeof window.__vcDiscordHasCommandPermissionsScope === "function" &&
        !window.__vcDiscordHasCommandPermissionsScope()
      ) {
        state.commandsDiscordWarning = i18n(
          "dash.cmds.scopeBody",
          "Per sincronizzare i permessi slash serve un nuovo login Discord dalla dashboard.",
        );
      }
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/commands",
        { headers: { Authorization: "Bearer " + token } },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        if (!options.silent) {
          showSaveToast(
            (data && data.message) || i18n("dash.cmds.loadFailed", "Impossibile caricare i comandi."),
            true,
          );
        }
        return;
      }
      state.commandsCatalog = data.catalog || [];
      state.commandsMap = data.commands || {};
      state.commandsPickers = data.pickers || {};
      state.commandsPrefix = data.prefix || "+";
      state.commandsProtectedGuild = data.protectedGuild === true;
      state.commandsIntegrations = null;
      state.commandsDiscordWarning =
        data.discordSync && data.discordSync.ok === false
          ? data.discordSync.warning ||
            i18n(
              "dash.cmds.scopeBody",
              "Per sincronizzare i permessi slash serve un nuovo login Discord dalla dashboard.",
            )
          : "";
      if (!options.silent) {
        clearSaveToastTimer();
        var host = byId("vc-dash-save-toast-host");
        if (host) host.innerHTML = "";
      }
      renderCommandsPage();
    } catch (e) {
      if (!options.silent) {
        showSaveToast(i18n("dash.cmds.network", "Errore di rete durante il caricamento."), true);
      }
    } finally {
      state.commandsLoading = false;
    }
  }

  function wireCommandsUi() {
    var root = byId("vc-dash-cmds-root");
    if (root && !root.__vcCmdsWired) {
      root.__vcCmdsWired = true;
      root.addEventListener("click", function (ev) {
        var reauthBtn = ev.target && ev.target.closest ? ev.target.closest("[data-cmds-reauth-scope]") : null;
        if (reauthBtn) {
          if (typeof window.__vcDiscordReauthorizeForCommandPermissions === "function") {
            window.__vcDiscordReauthorizeForCommandPermissions(reauthBtn);
          }
          return;
        }
        var catSettingsBtn =
          ev.target && ev.target.closest ? ev.target.closest("[data-cmd-cat-settings]") : null;
        if (catSettingsBtn) {
          openCategoryCommandSettings(String(catSettingsBtn.getAttribute("data-cmd-cat-settings") || ""));
          return;
        }
        var settingsBtn = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-settings]") : null;
        if (settingsBtn) {
          openCommandSettings(String(settingsBtn.getAttribute("data-cmd-settings") || ""));
          return;
        }
        var helpBtn = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-help]") : null;
        if (helpBtn) {
          openCommandHelp(String(helpBtn.getAttribute("data-cmd-help") || ""));
        }
      });
      root.addEventListener("change", function (ev) {
        var catToggle =
          ev.target && ev.target.closest ? ev.target.closest("[data-cmd-cat-toggle]") : null;
        if (catToggle) {
          var catId = String(catToggle.getAttribute("data-cmd-cat-toggle") || "").trim();
          if (!catId || catToggle.disabled) return;
          var names = setCategoryCommandsEnabled(catId, catToggle.checked);
          if (!names.length) return;
          if (state.commandsAutosaveTimer) {
            clearTimeout(state.commandsAutosaveTimer);
            state.commandsAutosaveTimer = null;
          }
          renderCommandsPage();
          saveCommandAcls(names).catch(function () {});
          return;
        }
        var toggle = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-toggle]") : null;
        if (!toggle) return;
        var name = String(toggle.getAttribute("data-cmd-toggle") || "");
        if (!name) return;
        var acl = ensureCommandAcl(name);
        acl.enabled = Boolean(toggle.checked);
        if (!acl.enabled) {
          acl.roleMode = null;
          acl.roleIds = [];
          acl.channelMode = null;
          acl.channelIds = [];
        }
        renderCommandsPage();
        scheduleCommandsSave(name);
      });
    }

    var tabs = byId("vc-dash-cmds-tabs");
    if (tabs && !tabs.__vcCmdsTabsWired) {
      tabs.__vcCmdsTabsWired = true;
      tabs.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-cmds-cat]") : null;
        if (!btn) return;
        var cat = String(btn.getAttribute("data-cmds-cat") || "").trim();
        if (!cat || cat === "all" || cat === state.commandsCategoryFilter) return;
        state.commandsCategoryFilter = cat;
        renderCommandsPage();
      });
    }

    if (!document.__vcCmdsModalsWired) {
      document.__vcCmdsModalsWired = true;
      document.addEventListener("click", function (ev) {
        var closer = ev.target && ev.target.closest ? ev.target.closest("[data-cmds-modal-close]") : null;
        if (closer) {
          closeCommandsModals();
          return;
        }
        var saveBtn = ev.target && ev.target.closest ? ev.target.closest("#vc-cmds-settings-save") : null;
        if (saveBtn) {
          var catId = state.commandsSettingsCategoryId;
          var name = state.commandsSettingsName;
          if (state.commandsAutosaveTimer) {
            clearTimeout(state.commandsAutosaveTimer);
            state.commandsAutosaveTimer = null;
          }
          if (catId) {
            var cat = findCatalogCategory(catId);
            var names = categoryCommandNames(cat);
            if (!names.length) return;
            var draft = ensureSettingsDraft();
            var initial = state.commandsSettingsInitialDraft || {
              allowedChannels: [],
              ignoredChannels: [],
              allowedRoles: [],
              ignoredRoles: [],
            };
            // Evita wipe accidentale: Salva senza modifiche (es. modal aperto vuoto) non tocca i permessi.
            if (settingsDraftKey(draft) === settingsDraftKey(initial)) {
              closeCommandsModals();
              showSaveToast(
                i18n("dash.cmds.noChanges", "Nessuna modifica ai permessi."),
                false,
              );
              return;
            }
            for (var si = 0; si < names.length; si++) {
              applySettingsModalToAcl(names[si]);
            }
            closeCommandsModals();
            renderCommandsPage();
            saveCommandAcls(names).catch(function () {});
            return;
          }
          if (!name) return;
          applySettingsModalToAcl(name);
          closeCommandsModals();
          renderCommandsPage();
          saveCommandAcl(name).catch(function () {});
          return;
        }
        var settingsModal = byId("vc-dash-cmds-settings-modal");
        if (!settingsModal || settingsModal.hasAttribute("hidden")) return;
        var field = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-token-field]") : null;
        var removeBtn = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-token-remove]") : null;
        if (removeBtn && field) {
          removeTokenFromField(
            String(field.getAttribute("data-cmd-token-field") || ""),
            String(removeBtn.getAttribute("data-cmd-token-remove") || ""),
          );
          return;
        }
        var addBtn = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-token-add]") : null;
        if (addBtn && field) {
          addTokenToField(
            String(field.getAttribute("data-cmd-token-field") || ""),
            String(addBtn.getAttribute("data-cmd-token-add") || ""),
          );
          var searchEl = field.querySelector("[data-cmd-token-search]");
          if (searchEl) {
            searchEl.value = "";
            searchEl.focus();
          }
          renderTokenField(String(field.getAttribute("data-cmd-token-field") || ""));
          return;
        }
        var onMenu = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-token-menu]") : null;
        if (onMenu) return;
        var onBox = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-token-field__box") : null;
        if (field && onBox) {
          var alreadyOpen = field.classList.contains("is-open");
          var onSearch =
            ev.target && ev.target.closest ? ev.target.closest("[data-cmd-token-search]") : null;
          // Secondo click sul box (non sulla search) chiude il menu.
          if (alreadyOpen && !onSearch) {
            closeAllTokenMenus();
            return;
          }
          if (alreadyOpen && onSearch) return;
          closeAllTokenMenus(field);
          var menu = field.querySelector("[data-cmd-token-menu]");
          var search = field.querySelector("[data-cmd-token-search]");
          field.classList.add("is-open");
          if (menu) menu.removeAttribute("hidden");
          renderTokenField(String(field.getAttribute("data-cmd-token-field") || ""));
          if (search) search.focus();
          return;
        }
        // Label / area fuori dal box: chiudi sempre.
        closeAllTokenMenus();
      });
      document.addEventListener("keydown", function (ev) {
        if (ev.key !== "Escape" && ev.key !== "Esc") return;
        var settingsModal = byId("vc-dash-cmds-settings-modal");
        if (!settingsModal || settingsModal.hasAttribute("hidden")) return;
        var openField = settingsModal.querySelector("[data-cmd-token-field].is-open");
        if (openField) {
          closeAllTokenMenus();
          ev.preventDefault();
          ev.stopPropagation();
        }
      });
      document.addEventListener("input", function (ev) {
        var search = ev.target && ev.target.closest ? ev.target.closest("[data-cmd-token-search]") : null;
        if (!search) return;
        var field = search.closest("[data-cmd-token-field]");
        if (!field) return;
        field.classList.add("is-open");
        var menu = field.querySelector("[data-cmd-token-menu]");
        if (menu) menu.removeAttribute("hidden");
        renderTokenField(String(field.getAttribute("data-cmd-token-field") || ""));
      });
    }
  }

  function wireLeaderboardUi() {
    var root = byId("vc-dash-lb");
    if (!root || root.__vcLbWired) return;
    root.__vcLbWired = true;
    root.addEventListener("click", function (ev) {
      var catBtn = ev.target && ev.target.closest ? ev.target.closest("[data-lb-cat]") : null;
      if (catBtn) {
        var cat = String(catBtn.getAttribute("data-lb-cat") || "");
        if (!cat || cat === state.lbCategory) return;
        state.lbCategory = cat;
        state.lbPage = 1;
        refreshLeaderboard();
        return;
      }
      var periodBtn = ev.target && ev.target.closest ? ev.target.closest("[data-lb-period]") : null;
      if (periodBtn) {
        var period = String(periodBtn.getAttribute("data-lb-period") || "");
        if (!period || period === state.lbPeriod) return;
        state.lbPeriod = period;
        state.lbPage = 1;
        refreshLeaderboard();
      }
    });
    var prev = byId("vc-dash-lb-prev");
    var next = byId("vc-dash-lb-next");
    if (prev) {
      prev.addEventListener("click", function () {
        if (state.lbPage <= 1) return;
        state.lbPage -= 1;
        refreshLeaderboard();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        state.lbPage += 1;
        refreshLeaderboard();
      });
    }
  }

  function updateMigrationConfiguredSummary(partnership) {
    var el = byId("ps-mig-configured-summary");
    if (!el) return;
    var p = partnership || state.partnership || {};
    var notSet = i18n("dash.mig.notSet", "non impostato");
    var pickers = state.pickers || {};
    function labelOf(list, id, prefix) {
      if (!id) return notSet;
      var row = (list || []).find(function (x) {
        return String(x.id) === String(id);
      });
      return row && row.name ? prefix + row.name : prefix + id;
    }
    var ch = labelOf(pickers.textChannels, p.partnershipsChannelId, "#");
    var logs = labelOf(pickers.textChannels, p.logsChannelId, "#");
    var role = labelOf(pickers.roles, p.partnerManagerRoleId, "@");
    el.textContent = i18n(
      "dash.mig.summaryLine",
      "Canale partnership: {ch} · Log: {logs} · Ruolo PM: {role}",
    )
      .replace("{ch}", ch)
      .replace("{logs}", logs)
      .replace("{role}", role) + ".";
  }

  function setMigrationMode(mode) {
    state.migrationMode = mode === "custom" ? "custom" : "configured";
    var cfgBtn = byId("ps-mig-mode-configured");
    var customBtn = byId("ps-mig-mode-custom");
    var customFields = byId("ps-mig-custom-fields");
    var summary = byId("ps-mig-configured-summary");
    if (cfgBtn) cfgBtn.classList.toggle("is-active", state.migrationMode === "configured");
    if (customBtn) customBtn.classList.toggle("is-active", state.migrationMode === "custom");
    if (customFields) {
      if (state.migrationMode === "custom") customFields.removeAttribute("hidden");
      else customFields.setAttribute("hidden", "");
    }
    if (summary) {
      if (state.migrationMode === "configured") summary.removeAttribute("hidden");
      else summary.setAttribute("hidden", "");
    }
  }

  var MIGRATION_EXACT_MAP = {
    "Preparazione…": "dash.mig.preparing",
    "Preparazione...": "dash.mig.preparing",
    "Lettura cronologia canali…": "dash.mig.msgReading",
    "Lettura cronologia canali...": "dash.mig.msgReading",
    "Analisi messaggi…": "dash.mig.msgParsing",
    "Analisi messaggi...": "dash.mig.msgParsing",
    "In coda…": "dash.mig.msgQueued",
    "In coda...": "dash.mig.msgQueued",
    "Migrazione fallita.": "dash.mig.failed",
    "Migrazione completata.": "dash.mig.completed",
    "Il bot non può leggere la cronologia del canale partnership.": "dash.mig.errReadPartnership",
    "Il bot non può leggere la cronologia del canale log.": "dash.mig.errReadLogs",
    "Server non trovato o bot non presente.": "dash.mig.errGuildMissing",
    "Serve almeno un canale partnership o log da scansionare.": "dash.mig.errNeedChannel",
    "Seleziona un canale partnership (o assicurati che sia già impostato).": "dash.mig.errMissingChannel",
    "Serve il ruolo Partner Manager: solo chi ha quel ruolo riceve i dati importati.": "dash.mig.errNeedRole",
    "Il ruolo Partner Manager non esiste più su questo server.": "dash.mig.errRoleMissing",
    "Nessun membro ha il ruolo Partner Manager configurato: niente da importare.": "dash.mig.errNoManagers",
    "Database non disponibile.": "dash.mig.errMongo",
  };

  function translateMigrationApiMessage(text) {
    var s = String(text == null ? "" : text).trim();
    if (!s) return s;

    if (Object.prototype.hasOwnProperty.call(MIGRATION_EXACT_MAP, s)) {
      return i18n(MIGRATION_EXACT_MAP[s], s);
    }

    var normalized = s.replace(/['\u2019]/g, "\u2019");
    if (normalized.indexOf("gi\u00e0 una migrazione in coda o in corso") !== -1) {
      return i18n("dash.mig.errAlreadyQueued", s);
    }
    if (normalized.indexOf("Nessuna migrazione annullabile") !== -1) {
      return i18n(
        "dash.mig.errNothingToUndo",
        "Nessuna migrazione annullabile. Puoi cancellare solo i dati dell’ultima migrazione completata (non già annullata).",
      );
    }
    m = s.match(/^Rimossi\s*(\d+)\s*dati importati dall.ultima migrazione\.?$/i);
    if (m) {
      return i18n("dash.mig.undoRemoved", "Rimossi {n} dati importati dall’ultima migrazione.").replace("{n}", m[1]);
    }
    m = s.match(/^Migrazione annullata:\s*rimossi\s*(\d+)\s*record importati\.?$/i);
    if (m) {
      return i18n("dash.mig.undoProgressMsg", "Migrazione annullata: rimossi {n} record importati.").replace(
        "{n}",
        m[1],
      );
    }

    var m = s.match(/^Messaggi letti:\s*(\d+)\s*…?\.?$/i);
    if (m) return i18n("dash.mig.msgMessagesRead", "Messaggi letti: {n}…").replace("{n}", m[1]);

    m = s.match(/^Importazione di\s*(\d+)\s*partnership\s*…?\.?$/i);
    if (m) return i18n("dash.mig.msgImporting", "Importazione di {n} partnership…").replace("{n}", m[1]);

    m = s.match(
      /^Importate\s*(\d+)\s*\/\s*(\d+)\s*\(saltate\s*(\d+),\s*gi\u00e0 presenti\s*(\d+)\)\s*…?\.?$/i,
    );
    if (m) {
      return i18n(
        "dash.mig.msgImportedProgress",
        "Importate {imported}/{total} (saltate {skipped}, già presenti {duplicates})…",
      )
        .replace("{imported}", m[1])
        .replace("{total}", m[2])
        .replace("{skipped}", m[3])
        .replace("{duplicates}", m[4]);
    }

    m = s.match(/^Completata:\s*(\d+)\s*importate,\s*(\d+)\s*gi\u00e0 presenti,\s*(\d+)\s*saltate\.?$/i);
    if (m) {
      return i18n(
        "dash.mig.msgCompleted",
        "Completata: {imported} importate, {duplicates} già presenti, {skipped} saltate.",
      )
        .replace("{imported}", m[1])
        .replace("{duplicates}", m[2])
        .replace("{skipped}", m[3]);
    }

    return s;
  }

  function isMigrationSoftFail(job) {
    if (!job || String(job.status || "") !== "failed") return false;
    var err = String(job.error || (job.progress && job.progress.message) || "")
      .trim()
      .toLowerCase();
    if (!err) return false;
    return (
      err.indexOf("niente da importare") !== -1 ||
      err.indexOf("nessun membro ha il ruolo") !== -1 ||
      err.indexOf("serve il ruolo partner manager") !== -1 ||
      err.indexOf("non esiste pi") !== -1 ||
      err.indexOf("seleziona un canale") !== -1 ||
      err.indexOf("serve almeno un canale") !== -1
    );
  }

  function renderMigrationJob(payload) {
    if (payload) state.lastMigrationPayload = payload;
    state.migrationStatusKnown = true;
    var job = payload && payload.job;
    var setup = byId("ps-migration-setup");
    var progress = byId("ps-migration-progress");
    var actions = byId("ps-migration-actions");
    var startBtn = byId("ps-migration-start-btn");
    var retryWrap = byId("ps-migration-retry-wrap");
    var card = byId("ps-migration-card");
    var alreadyUndone = Boolean(
      (job && job.result && job.result.undoneAt) ||
        (job && job.progress && String(job.progress.phase || "") === "undone"),
    );
    // Annullata = come non fatta: form di avvio, niente barra/progress.
    if (alreadyUndone) {
      state.migrationShowSetup = true;
      setError("");
      job = null;
    }
    // Fallimenti di precondizione (es. nessun PM): solo sorgente + messaggio errore, niente card Fallita.
    // Non mostrare il banner globale se stiamo solo facendo prefetch fuori da «Dati».
    if (isMigrationSoftFail(job)) {
      state.migrationShowSetup = true;
      var softErr = job.error || (job.progress && job.progress.message) || "";
      if (softErr && state.view === "partnership/dati") {
        setError(translateMigrationApiMessage(softErr));
      }
    }
    var active = job && (job.status === "queued" || job.status === "running");
    var done = job && (job.status === "completed" || job.status === "failed");
    // Durante/dopo la migrazione: solo la card centrale (Riprova sblocca il form).
    if (active || (done && !state.migrationShowSetup)) {
      state.migrationShowSetup = false;
    }
    var showSetup = !job || (!active && (!done || state.migrationShowSetup));
    // Progress solo se in corso, oppure conclusa e l’utente non ha aperto «Riprova»/sorgente.
    var showProgress = Boolean(active || (done && !showSetup));

    if (showProgress) {
      if (progress) progress.removeAttribute("hidden");
    } else if (progress) {
      progress.setAttribute("hidden", "");
    }

    if (setup) {
      if (showSetup) setup.removeAttribute("hidden");
      else setup.setAttribute("hidden", "");
    }
    if (actions) {
      if (showSetup) actions.removeAttribute("hidden");
      else actions.setAttribute("hidden", "");
    }
    if (retryWrap) {
      if (done && !showSetup) retryWrap.removeAttribute("hidden");
      else retryWrap.setAttribute("hidden", "");
    }
    var undoBtn = byId("ps-migration-undo-btn");
    if (undoBtn) {
      var canUndo = Boolean(job && job.canUndo && done && !showSetup && !alreadyUndone);
      if (canUndo) {
        undoBtn.removeAttribute("hidden");
        undoBtn.style.display = "";
      } else {
        undoBtn.setAttribute("hidden", "");
        undoBtn.style.display = "none";
      }
      undoBtn.disabled = Boolean(state.saving || !canUndo);
    }

    if (startBtn) {
      startBtn.disabled = Boolean(active || state.saving);
      startBtn.innerHTML = active
        ? '<span class="vc-ui-spinner vc-ui-spinner--sm" aria-hidden="true"></span> ' + esc(i18n("dash.mig.inProgress", "Migrazione in corso…"))
        : '<i class="fa fa-play" aria-hidden="true"></i> ' + esc(i18n("dash.mig.start", "Avvia migrazione"));
    }

    if (card) {
      card.classList.toggle("is-failed", Boolean(job && job.status === "failed"));
      card.classList.toggle("is-completed", Boolean(job && job.status === "completed"));
      card.classList.toggle("is-running", Boolean(active));
    }

    if (!job || !showProgress) return;

    var pct = Math.max(0, Math.min(100, Math.floor(Number((job.progress && job.progress.percent) || 0))));
    if (job.status === "queued") pct = Math.max(pct, 0);
    if (job.status === "completed") pct = 100;

    var fill = byId("ps-migration-bar-fill");
    var wrap = byId("ps-migration-bar-wrap");
    var pctEl = byId("ps-migration-pct");
    var msg = byId("ps-migration-message");
    var label = byId("ps-migration-status-label");
    var queuePos = byId("ps-migration-queue-pos");
    var stats = byId("ps-migration-stats");

    if (fill) fill.style.width = pct + "%";
    if (wrap) wrap.setAttribute("aria-valuenow", String(pct));
    if (pctEl) pctEl.textContent = String(pct);
    if (msg) {
      if (job.status === "failed") {
        var rawErr = job.error || (job.progress && job.progress.message) || "Migrazione fallita.";
        msg.textContent = translateMigrationApiMessage(rawErr);
      } else if (job.progress && job.progress.message) {
        msg.textContent = translateMigrationApiMessage(job.progress.message);
      } else {
        msg.textContent =
          job.result && job.result.undoneAt
            ? i18n("dash.mig.undone", "Dati dell’ultima migrazione annullati.")
            : job.status === "completed"
              ? i18n("dash.mig.completed", "Migrazione completata.")
              : "…";
      }
    }
    if (label) {
      if (job.result && job.result.undoneAt) label.textContent = i18n("dash.mig.statusUndone", "Annullata");
      else if (job.status === "queued") label.textContent = i18n("dash.mig.statusQueued", "In coda");
      else if (job.status === "running") label.textContent = i18n("dash.mig.statusRunning", "In esecuzione");
      else if (job.status === "completed") label.textContent = i18n("dash.mig.statusCompleted", "Completata");
      else if (job.status === "failed") label.textContent = i18n("dash.mig.statusFailed", "Fallita");
      else label.textContent = String(job.status || i18n("dash.mig.statusGeneric", "Stato"));
    }
    if (queuePos) {
      if (job.status === "queued" && job.queuePosition != null) {
        queuePos.removeAttribute("hidden");
        var laneLabel =
          job.lane === "small"
            ? i18n("dash.mig.laneSmall", "coda rapida")
            : i18n("dash.mig.laneLarge", "coda lunga");
        queuePos.textContent = i18n("dash.mig.queuePosLane", "Posizione in {lane}: #{n}")
          .replace("{lane}", laneLabel)
          .replace("{n}", String(job.queuePosition));
      } else if (job.status === "running") {
        queuePos.removeAttribute("hidden");
        queuePos.textContent =
          job.lane === "small"
            ? i18n("dash.mig.processingSmall", "In elaborazione (coda rapida)")
            : i18n("dash.mig.processingLarge", "In elaborazione (coda lunga)");
      } else if (job.result && job.result.undoneAt) {
        queuePos.removeAttribute("hidden");
        queuePos.textContent = i18n("dash.mig.undoneBadge", "Dati migrazione annullati");
      } else {
        queuePos.setAttribute("hidden", "");
      }
    }

    var prog = job.progress || {};
    var res = job.result || {};
    if (stats && (prog.messagesScanned != null || res.messagesScanned != null || done)) {
      stats.removeAttribute("hidden");
      var set = function (id, v) {
        var el = byId(id);
        if (el) el.textContent = String(v != null ? v : 0);
      };
      set("ps-mig-stat-msgs", prog.messagesScanned != null ? prog.messagesScanned : res.messagesScanned);
      set("ps-mig-stat-found", prog.eventsFound != null ? prog.eventsFound : res.eventsFound);
      set("ps-mig-stat-imported", prog.eventsImported != null ? prog.eventsImported : res.imported);
      set(
        "ps-mig-stat-skipped",
        prog.eventsSkipped != null
          ? prog.eventsSkipped
          : (Number(res.skipped || 0) + Number(res.duplicates || 0)),
      );
    }
  }

  async function refreshMigrationStatus() {
    var token = getToken();
    if (!token || !state.guildId) return;
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership/migration",
        { headers: { Authorization: "Bearer " + token } },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        // Se lo status non arriva, non lasciare l’utente bloccato sullo shell di loading.
        if (!state.migrationStatusKnown && state.view === "partnership/dati") {
          renderMigrationJob({ job: null });
        }
        return;
      }
      renderMigrationJob(data);
      if (data.job && (data.job.status === "completed" || data.job.status === "failed")) {
        // keep polling lightly stopped once finished unless user stays on page with new job
        if (data.job.status !== "queued" && data.job.status !== "running") {
          // still allow one more render; interval continues but cheap
        }
      }
    } catch (e) {
      if (!state.migrationStatusKnown && state.view === "partnership/dati") {
        renderMigrationJob({ job: null });
      }
    }
  }

  async function undoMigration() {
    var token = getToken();
    if (!token || !state.guildId || state.saving) return;
    var ok = await (window.VcDialog
      ? window.VcDialog.confirm({
          title: i18n("dash.mig.undoTitle", "Annullare i dati migrazione?"),
          message: i18n(
            "dash.mig.undoConfirm",
            "Cancellare SOLO i dati importati dall’ultima migrazione? I punti/partnership fatti a mano dopo restano.",
          ),
          confirmLabel: i18n("dash.mig.undo", "Annulla dati migrazione"),
          cancelLabel: i18n("dash.bl.cancel", "Annulla"),
          danger: true,
          icon: "fa-trash-o",
        })
      : Promise.resolve(
          window.confirm(
            i18n(
              "dash.mig.undoConfirm",
              "Cancellare SOLO i dati importati dall’ultima migrazione? I punti/partnership fatti a mano dopo restano.",
            ),
          ),
        ));
    if (!ok) return;
    var undoBtn = byId("ps-migration-undo-btn");
    state.saving = true;
    if (undoBtn) undoBtn.disabled = true;
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership/migration/undo",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: "{}",
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        setError(
          translateMigrationApiMessage((data && (data.message || data.error)) || "") ||
            i18n("dash.mig.undoFailed", "Impossibile annullare la migrazione."),
        );
        return;
      }
      setSuccess(
        translateMigrationApiMessage(data.message) ||
          i18n("dash.mig.undoOk", "Dati dell’ultima migrazione rimossi."),
      );
      state.migrationShowSetup = true;
      renderMigrationJob(data);
      if (undoBtn) {
        undoBtn.setAttribute("hidden", "");
        undoBtn.style.display = "none";
        undoBtn.disabled = true;
      }
    } catch (err) {
      setError(i18n("dash.mig.networkUndo", "Errore di rete durante l’annullamento."));
    } finally {
      state.saving = false;
      refreshMigrationStatus();
    }
  }

  async function startMigration() {
    var token = getToken();
    if (!token || !state.guildId) return;
    var body = { mode: state.migrationMode || "configured" };
    var ch = byId("ps-mig-channelId");
    var logs = byId("ps-mig-logsChannelId");
    var role = byId("ps-mig-roleId");
    // Always send resolved IDs as fallback if server-side config cache is empty.
    body.channelId = ch && ch.value ? ch.value : null;
    body.logsChannelId = logs && logs.value ? logs.value : null;
    body.roleId = role && role.value ? role.value : null;
    var startBtn = byId("ps-migration-start-btn");
    if (startBtn) startBtn.disabled = true;
    setError("");
    state.migrationShowSetup = false;
    // Nasconde subito sorgente/banner/avvia; resta solo la card progresso.
    var setupEl = byId("ps-migration-setup");
    var actionsEl = byId("ps-migration-actions");
    var progressEl = byId("ps-migration-progress");
    var retryEl = byId("ps-migration-retry-wrap");
    if (setupEl) setupEl.setAttribute("hidden", "");
    if (actionsEl) actionsEl.setAttribute("hidden", "");
    if (progressEl) progressEl.removeAttribute("hidden");
    if (retryEl) retryEl.setAttribute("hidden", "");
    try {
      var res = await fetch(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership/migration",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
      );
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data || data.ok === false) {
        var fallback =
          res.status === 502 || res.status === 503 || res.status === 504
            ? i18n(
                "dash.mig.serviceUnavailable",
                "Servizio temporaneamente non disponibile ({n}). Riprova tra poco.",
                { n: res.status },
              )
            : res.status === 401
              ? i18n("dash.errSessionExpired", "Sessione scaduta: effettua di nuovo il login.")
              : i18n("dash.mig.startFailed", "Impossibile avviare la migrazione.");
        setError(translateMigrationApiMessage((data && data.message) || fallback));
        if (startBtn) startBtn.disabled = false;
        state.migrationShowSetup = true;
        if (data && data.job) {
          renderMigrationJob(data);
        } else {
          var setupFail = byId("ps-migration-setup");
          var actionsFail = byId("ps-migration-actions");
          var progressFail = byId("ps-migration-progress");
          if (setupFail) setupFail.removeAttribute("hidden");
          if (actionsFail) actionsFail.removeAttribute("hidden");
          if (progressFail) progressFail.setAttribute("hidden", "");
        }
        return;
      }
      renderMigrationJob(data);
      startMigrationPolling();
      setSuccess(data.message || i18n("dash.mig.queuedOk", "Migrazione messa in coda."));
    } catch (e) {
      setError(i18n("dash.mig.networkStart", "Errore di rete durante l’avvio migrazione."));
      state.migrationShowSetup = true;
      if (startBtn) startBtn.disabled = false;
      var setupCatch = byId("ps-migration-setup");
      var actionsCatch = byId("ps-migration-actions");
      var progressCatch = byId("ps-migration-progress");
      if (setupCatch) setupCatch.removeAttribute("hidden");
      if (actionsCatch) actionsCatch.removeAttribute("hidden");
      if (progressCatch) progressCatch.setAttribute("hidden", "");
    }
  }

  function copySelectValue(fromId, toId) {
    var from = byId(fromId);
    var to = byId(toId);
    if (!from || !to) return;
    to.value = String(from.value || "");
    refreshDashFancySelect(to);
  }

  function copyInputValue(fromId, toId) {
    var from = byId(fromId);
    var to = byId(toId);
    if (!from || !to) return;
    to.value = String(from.value || "");
  }

  function syncWizardFromMainForm() {
    copySelectValue("ps-partnershipsChannelId", "ps-wz-partnershipsChannelId");
    copySelectValue("ps-logsChannelId", "ps-wz-logsChannelId");
    copySelectValue("ps-partnerManagerRoleId", "ps-wz-partnerManagerRoleId");
    copySelectValue("ps-customRoleId", "ps-wz-customRoleId");
    copyInputValue("ps-hereMembers", "ps-wz-hereMembers");
    copyInputValue("ps-everyoneMembers", "ps-wz-everyoneMembers");
    copyInputValue("ps-customRoleMembers", "ps-wz-customRoleMembers");
  }

  function syncMainFormFromWizard() {
    copySelectValue("ps-wz-partnershipsChannelId", "ps-partnershipsChannelId");
    copySelectValue("ps-wz-logsChannelId", "ps-logsChannelId");
    copySelectValue("ps-wz-partnerManagerRoleId", "ps-partnerManagerRoleId");
    copySelectValue("ps-wz-customRoleId", "ps-customRoleId");
    copyInputValue("ps-wz-hereMembers", "ps-hereMembers");
    copyInputValue("ps-wz-everyoneMembers", "ps-everyoneMembers");
    copyInputValue("ps-wz-customRoleMembers", "ps-customRoleMembers");
    // Accendi i feat card correlati se valorizzati, così buildPatchFromForm li include.
    var here = byId("ps-hereMembers");
    var everyone = byId("ps-everyoneMembers");
    var hereFeat = byId("ps-herePingFeat");
    var everyoneFeat = byId("ps-everyonePingFeat");
    if (hereFeat && here && String(here.value || "").trim()) hereFeat.classList.add("is-on");
    if (everyoneFeat && everyone && String(everyone.value || "").trim()) everyoneFeat.classList.add("is-on");
    var customRole = byId("ps-customRoleId");
    var customMembers = byId("ps-customRoleMembers");
    var customFeat = byId("ps-customPingFeat");
    if (
      customFeat &&
      customRole &&
      customMembers &&
      String(customRole.value || "").trim() &&
      String(customMembers.value || "").trim()
    ) {
      customFeat.classList.add("is-on");
    }
    var logs = byId("ps-logsChannelId");
    var logsFeat = byId("ps-logsChannelFeat");
    if (logsFeat && logs && String(logs.value || "").trim()) logsFeat.classList.add("is-on");
    syncFeatCardsFromValues();
  }

  function selectOptionLabel(selectId) {
    var sel = byId(selectId);
    if (!sel || !sel.options || !sel.options.length) return "—";
    var opt = sel.options[sel.selectedIndex];
    var label = opt ? String(opt.textContent || "").trim() : "";
    var val = sel ? String(sel.value || "").trim() : "";
    if (!val) return i18n("dash.none", "— Nessuno —");
    return label || val;
  }

  function updateWizardSummary() {
    var ch = byId("ps-wz-sum-channel");
    var logs = byId("ps-wz-sum-logs");
    var role = byId("ps-wz-sum-role");
    var pings = byId("ps-wz-sum-pings");
    if (ch) ch.textContent = selectOptionLabel("ps-wz-partnershipsChannelId");
    if (logs) logs.textContent = selectOptionLabel("ps-wz-logsChannelId");
    if (role) role.textContent = selectOptionLabel("ps-wz-partnerManagerRoleId");
    if (pings) {
      var here = String((byId("ps-wz-hereMembers") || {}).value || "").trim();
      var everyone = String((byId("ps-wz-everyoneMembers") || {}).value || "").trim();
      var customRole = String((byId("ps-wz-customRoleId") || {}).value || "").trim();
      var customMembers = String((byId("ps-wz-customRoleMembers") || {}).value || "").trim();
      var parts = [];
      if (here) parts.push("@here ≥ " + here);
      if (everyone) parts.push("@everyone ≥ " + everyone);
      if (customRole && customMembers) {
        parts.push(selectOptionLabel("ps-wz-customRoleId") + " ≥ " + customMembers);
      }
      pings.textContent = parts.length ? parts.join(" · ") : i18n("dash.wz.pingsOff", "Disattivati");
    }
  }

  function isWizardStepReady(step) {
    if (step === 1) {
      return Boolean(String((byId("ps-wz-partnershipsChannelId") || {}).value || "").trim());
    }
    if (step === 2) {
      return Boolean(String((byId("ps-wz-partnerManagerRoleId") || {}).value || "").trim());
    }
    if (step === 3) {
      var customRole = String((byId("ps-wz-customRoleId") || {}).value || "").trim();
      var customMembers = String((byId("ps-wz-customRoleMembers") || {}).value || "").trim();
      return !((customRole && !customMembers) || (!customRole && customMembers));
    }
    if (step === 4) {
      return isWizardStepReady(1) && isWizardStepReady(2) && isWizardStepReady(3);
    }
    return true;
  }

  function syncWizardNavEnabled() {
    var step = state.wizardStep || 1;
    var next = byId("ps-wz-next");
    var finish = byId("ps-wz-finish");
    var ready = isWizardStepReady(step);
    if (next && !next.hasAttribute("hidden")) {
      next.disabled = !ready;
      next.setAttribute("aria-disabled", ready ? "false" : "true");
      next.title = ready
        ? ""
        : step === 1
          ? i18n("dash.wz.errChannel", "Seleziona il canale partnership per continuare.")
          : step === 2
            ? i18n("dash.wz.errRole", "Indica chi gestisce le partnership per continuare.")
            : i18n(
                "dash.wz.errCustomPing",
                "Per l’avviso personalizzato imposta sia il gruppo sia la soglia membri, oppure lascia entrambi vuoti.",
              );
    }
    if (finish && !finish.hasAttribute("hidden")) {
      var finishReady = isWizardStepReady(4);
      finish.disabled = !finishReady;
      finish.setAttribute("aria-disabled", finishReady ? "false" : "true");
      finish.title = finishReady
        ? ""
        : i18n(
          "dash.wz.errFinish",
          "Imposta il canale partnership e chi gestisce le partnership per continuare.",
        );
    }
  }

  function validateWizardStep(step) {
    if (step === 1) {
      var ch = byId("ps-wz-partnershipsChannelId");
      if (!ch || !String(ch.value || "").trim()) {
        setError(i18n("dash.wz.errChannel", "Seleziona il canale partnership per continuare."));
        syncWizardNavEnabled();
        return false;
      }
    }
    if (step === 2) {
      var role = byId("ps-wz-partnerManagerRoleId");
      if (!role || !String(role.value || "").trim()) {
        setError(i18n("dash.wz.errRole", "Indica chi gestisce le partnership per continuare."));
        syncWizardNavEnabled();
        return false;
      }
    }
    if (step === 3) {
      var customRole = String((byId("ps-wz-customRoleId") || {}).value || "").trim();
      var customMembers = String((byId("ps-wz-customRoleMembers") || {}).value || "").trim();
      if ((customRole && !customMembers) || (!customRole && customMembers)) {
        setError(
          i18n(
            "dash.wz.errCustomPing",
            "Per l’avviso personalizzato imposta sia il gruppo sia la soglia membri, oppure lascia entrambi vuoti.",
          ),
        );
        syncWizardNavEnabled();
        return false;
      }
    }
    setError("");
    syncWizardNavEnabled();
    return true;
  }

  function setWizardStep(step) {
    var n = Math.max(1, Math.min(4, Number(step) || 1));
    state.wizardStep = n;
    var panels = document.querySelectorAll("[data-wz-panel]");
    Array.prototype.forEach.call(panels, function (panel) {
      var id = Number(panel.getAttribute("data-wz-panel") || 0);
      if (id === n) {
        panel.removeAttribute("hidden");
        panel.classList.add("is-active");
      } else {
        panel.setAttribute("hidden", "");
        panel.classList.remove("is-active");
      }
    });
    var inds = document.querySelectorAll("[data-wz-step-ind]");
    Array.prototype.forEach.call(inds, function (el) {
      var id = Number(el.getAttribute("data-wz-step-ind") || 0);
      el.classList.toggle("is-active", id === n);
      el.classList.toggle("is-done", id < n);
    });
    var back = byId("ps-wz-back");
    var next = byId("ps-wz-next");
    var finish = byId("ps-wz-finish");
    if (back) {
      if (n <= 1) back.setAttribute("hidden", "");
      else back.removeAttribute("hidden");
    }
    if (next) {
      if (n >= 4) next.setAttribute("hidden", "");
      else next.removeAttribute("hidden");
    }
    if (finish) {
      if (n === 4) finish.removeAttribute("hidden");
      else finish.setAttribute("hidden", "");
    }
    if (n === 4) updateWizardSummary();
    syncWizardNavEnabled();
  }

  function wireWizardFieldGuards() {
    var wizard = byId("ps-setup-wizard");
    if (!wizard || wizard.__vcWzGuardWired) return;
    wizard.__vcWzGuardWired = true;
    function onWizardFieldChange() {
      syncWizardNavEnabled();
      if ((state.wizardStep || 1) === 4) updateWizardSummary();
    }
    wizard.addEventListener("input", onWizardFieldChange);
    wizard.addEventListener("change", onWizardFieldChange);
  }

  function fillPartnershipForm(partnership, pickers) {
    var form = byId("vc-dashboard-partnership-form");
    if (!form || !partnership) return;
    var safePickers = pickers && typeof pickers === "object" ? pickers : {};
    // Non togliere hidden qui: decide applyView (altrimenti flash form vuoto / race col loader).
    setPartnershipNavVisible(true);

    var text = safePickers.textChannels || [];
    var roles = safePickers.roles || [];
    var p = partnership;

    fillSelect(byId("ps-partnershipsChannelId"), text, p.partnershipsChannelId, i18n("dash.selectChannelOpt", "— Seleziona canale —"));
    fillSelect(byId("ps-logsChannelId"), text, p.logsChannelId, i18n("dash.none", "— Nessuno —"));
    (function fillTeamZone() {
      var zone = [];
      var seen = {};
      function pushId(raw) {
        var id = String(raw || "").trim();
        if (!id || seen[id]) return;
        seen[id] = true;
        zone.push(id);
      }
      pushId(p.pmCommandsChannelId);
      (Array.isArray(p.pmCommandsCategoryIds) ? p.pmCommandsCategoryIds : []).forEach(pushId);
      setPsZoneIds(zone);
    })();
    fillSelect(byId("ps-partnerManagerRoleId"), roles, p.partnerManagerRoleId, i18n("dash.selectRoleOpt", "— Seleziona ruolo —"));
    fillSelect(byId("ps-managerBadgeRoleId"), roles, p.managerBadgeRoleId, i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("ps-customRoleId"), roles, p.pings && p.pings.customRoleId, i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("ps-partnerDescChannelId"), text, p.partnerDesc && p.partnerDesc.channelId, i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("ps-mig-channelId"), text, p.partnershipsChannelId, i18n("dash.selectChannelOpt", "— Seleziona canale —"));
    fillSelect(byId("ps-mig-logsChannelId"), text, p.logsChannelId, i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("ps-mig-roleId"), roles, p.partnerManagerRoleId, i18n("dash.selectRoleOpt", "— Seleziona ruolo —"));
    fillSelect(byId("ps-wz-partnershipsChannelId"), text, p.partnershipsChannelId, i18n("dash.selectChannelOpt", "— Seleziona canale —"));
    fillSelect(byId("ps-wz-logsChannelId"), text, p.logsChannelId, i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("ps-wz-partnerManagerRoleId"), roles, p.partnerManagerRoleId, i18n("dash.selectRoleOpt", "— Seleziona ruolo —"));
    fillSelect(byId("ps-wz-customRoleId"), roles, p.pings && p.pings.customRoleId, i18n("dash.none", "— Nessuno —"));
    updateMigrationConfiguredSummary(p);

    var here = byId("ps-hereMembers");
    if (here) here.value = p.pings && p.pings.hereMembers != null ? String(p.pings.hereMembers) : "";
    var everyone = byId("ps-everyoneMembers");
    if (everyone) everyone.value = p.pings && p.pings.everyoneMembers != null ? String(p.pings.everyoneMembers) : "";
    var crm = byId("ps-customRoleMembers");
    if (crm) crm.value = p.pings && p.pings.customRoleMembers != null ? String(p.pings.customRoleMembers) : "";
    var wzHere = byId("ps-wz-hereMembers");
    if (wzHere) wzHere.value = p.pings && p.pings.hereMembers != null ? String(p.pings.hereMembers) : "";
    var wzEveryone = byId("ps-wz-everyoneMembers");
    if (wzEveryone) wzEveryone.value = p.pings && p.pings.everyoneMembers != null ? String(p.pings.everyoneMembers) : "";
    var wzCrm = byId("ps-wz-customRoleMembers");
    if (wzCrm) wzCrm.value = p.pings && p.pings.customRoleMembers != null ? String(p.pings.customRoleMembers) : "";

    var fillDelay = function (inputId, active, delayInput) {
      var el = byId(inputId);
      if (!el) return;
      el.value = active ? String(delayInput || "5m") : "";
    };
    fillDelay("ps-hereDelayInput", p.pings && p.pings.hereMembers != null, p.pings && p.pings.hereDelayInput);
    fillDelay(
      "ps-everyoneDelayInput",
      p.pings && p.pings.everyoneMembers != null,
      p.pings && p.pings.everyoneDelayInput,
    );
    var customActive =
      Boolean(p.pings && p.pings.customRoleId) ||
      (p.pings && p.pings.customRoleMembers != null);
    fillDelay("ps-customRoleDelayInput", customActive, p.pings && p.pings.customRoleDelayInput);

    var skip = byId("ps-skipManager");
    if (skip) skip.checked = p.skipManager === true;
    var manual = byId("ps-manualPartnershipEnabled");
    if (manual) manual.checked = p.manualPartnershipEnabled === true;
    var filters = p.contentFilters || {};
    var fMentions = byId("ps-filterStripMentions");
    if (fMentions) fMentions.checked = filters.stripMentions === true;
    var fMass = byId("ps-filterStripMassMentions");
    if (fMass) fMass.checked = filters.stripMassMentions === true;
    var fLinks = byId("ps-filterStripNonInviteLinks");
    if (fLinks) fLinks.checked = filters.stripNonInviteLinks === true;
    var fEmojis = byId("ps-filterStripCustomEmojis");
    if (fEmojis) fEmojis.checked = filters.stripCustomEmojis === true;
    var fInvisible = byId("ps-filterStripInvisibleChars");
    if (fInvisible) fInvisible.checked = filters.stripInvisibleChars === true;
    var fSpoilers = byId("ps-filterStripSpoilers");
    if (fSpoilers) fSpoilers.checked = filters.stripSpoilers === true;
    var fExtraInvites = byId("ps-filterStripExtraInvites");
    if (fExtraInvites) fExtraInvites.checked = filters.stripExtraInvites === true;
    var leave = byId("ps-managerLeaveAction");
    if (leave) {
      var leaveRaw = String(p.managerLeaveAction || "").trim();
      leave.value = leaveRaw === "warn" || leaveRaw === "delete" ? leaveRaw : "warn";
      refreshDashFancySelect(leave);
    }
    var cooldownInput = byId("ps-sameServerCooldownInput");
    if (cooldownInput) {
      cooldownInput.value = p.sameServerCooldownInput ? String(p.sameServerCooldownInput) : "";
    }

    var descMode = byId("ps-partnerDescMode");
    if (descMode) {
      var mode = (p.partnerDesc && p.partnerDesc.mode) || "clear";
      // Off lato server → UI su Canale con select vuoto (già disattivata).
      if (mode !== "channel" && mode !== "static") mode = "channel";
      descMode.value = mode;
    }
    var staticText = byId("ps-partnerDescStaticText");
    if (staticText) staticText.value = (p.partnerDesc && p.partnerDesc.staticText) || "";

    var emb = p.thankYouEmbed || {};
    var defaults = p.thankYouEmbedDefaults || null;
    applyEmbedFieldsToForm(resolveEmbedEditorValues(emb, defaults));

    var completeBtn = byId("ps-complete-btn");
    var setupBar = byId("vc-dashboard-setup-bar");
    // Wizard sostituisce la barra sticky: nascondila sempre.
    if (completeBtn) completeBtn.setAttribute("hidden", "");
    if (setupBar) setupBar.setAttribute("hidden", "");
    setPartnershipSetupLocked(p.setupCompleted !== true);
    if (p.setupCompleted !== true) {
      state.wizardStep = state.wizardStep || 1;
    }

    syncFeatCardsFromValues({ fromServer: true });
    updateDescModeVisibility();
    // Prima la view (così Filtri/Generale appaiono subito), poi i fancy-select:
    // sul main i picker Discord sono enormi e bloccavano il main thread → UI “solo footer”.
    try {
      applyView(gatePartnershipView(currentView()));
    } catch (eView) {
      try {
        console.warn("[dashboard] applyView after fill", eView);
      } catch (_) {}
    }
    try {
      captureBaseline();
    } catch (_) {}
    ensureVisibleDashboardContent();
    var formRoot = byId("vc-dashboard-partnership-form") || document;
    var enhanceFancy = function () {
      try {
        enhanceAllDashFancySelects(formRoot);
      } catch (eFancy) {}
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(function () {
        setTimeout(enhanceFancy, 0);
      });
    } else {
      setTimeout(enhanceFancy, 0);
    }
  }

  function collectSelectedMulti(select) {
    if (!select) return [];
    return Array.prototype.slice
      .call(select.selectedOptions || [])
      .map(function (o) {
        return String(o.value || "").trim();
      })
      .filter(Boolean);
  }

  function emptyToNull(value) {
    var s = String(value == null ? "" : value).trim();
    return s ? s : null;
  }

  function buildPatchFromForm() {
    var numOrEmpty = function (id) {
      var el = byId(id);
      var raw = el ? String(el.value || "").trim() : "";
      return raw === "" ? null : raw;
    };
    var selOrNull = function (id) {
      var el = byId(id);
      var v = el ? String(el.value || "").trim() : "";
      return v || null;
    };

    var descMode = selOrNull("ps-partnerDescMode") || "channel";
    if (descMode !== "channel" && descMode !== "static") descMode = "channel";
    var partnerDesc = { mode: "clear" };
    if (descMode === "channel") {
      var descChannelId = selOrNull("ps-partnerDescChannelId");
      if (descChannelId) partnerDesc = { mode: "channel", channelId: descChannelId };
    } else if (descMode === "static") {
      var descStatic = String((byId("ps-partnerDescStaticText") || {}).value || "");
      if (String(descStatic).trim()) {
        partnerDesc = { mode: "static", staticText: descStatic };
      }
    }

    var prevEmbed =
      (state.partnership && state.partnership.thankYouEmbed && typeof state.partnership.thankYouEmbed === "object")
        ? state.partnership.thankYouEmbed
        : null;
    var thankYouEmbed = isPremiumActive()
      ? {
          enabled: true,
          color: emptyToNull((byId("ps-embedColor") || {}).value),
          title: emptyToNull((byId("ps-embedTitle") || {}).value),
          authorName: emptyToNull((byId("ps-embedAuthorName") || {}).value),
          authorIconUrl: emptyToNull((byId("ps-embedAuthorIconUrl") || {}).value),
          thumbnailUrl: emptyToNull((byId("ps-embedThumbnailUrl") || {}).value),
          imageUrl: emptyToNull((byId("ps-embedImageUrl") || {}).value),
          footerText: emptyToNull((byId("ps-embedFooterText") || {}).value),
          footerIconUrl: emptyToNull((byId("ps-embedFooterIconUrl") || {}).value),
          description: emptyToNull((byId("ps-embedDescription") || {}).value),
          timestampEnabled: Boolean((byId("ps-embedTimestampEnabled") || {}).checked),
        }
      : {
          enabled: Boolean(prevEmbed && prevEmbed.enabled === true),
          color: prevEmbed ? emptyToNull(prevEmbed.color) : null,
          title: prevEmbed ? emptyToNull(prevEmbed.title) : null,
          authorName: prevEmbed ? emptyToNull(prevEmbed.authorName) : null,
          authorIconUrl: prevEmbed ? emptyToNull(prevEmbed.authorIconUrl) : null,
          thumbnailUrl: prevEmbed ? emptyToNull(prevEmbed.thumbnailUrl) : null,
          imageUrl: prevEmbed ? emptyToNull(prevEmbed.imageUrl) : null,
          footerText: prevEmbed ? emptyToNull(prevEmbed.footerText) : null,
          footerIconUrl: prevEmbed ? emptyToNull(prevEmbed.footerIconUrl) : null,
          description: prevEmbed ? emptyToNull(prevEmbed.description) : null,
          timestampEnabled: prevEmbed ? prevEmbed.timestampEnabled !== false : true,
        };

    var customFeat = byId("ps-customPingFeat");
    var customReady = customFeat && customFeat.classList.contains("is-on") && featHasPrimaryValue(customFeat);
    var customRoleId = customReady ? selOrNull("ps-customRoleId") : null;
    var customMembers = customReady ? numOrEmpty("ps-customRoleMembers") : null;
    var hereFeat = byId("ps-herePingFeat");
    var hereOn = hereFeat && hereFeat.classList.contains("is-on") && featHasPrimaryValue(hereFeat);
    var everyoneFeat = byId("ps-everyonePingFeat");
    var everyoneOn =
      everyoneFeat && everyoneFeat.classList.contains("is-on") && featHasPrimaryValue(everyoneFeat);
    var zonePayload = collectPsZonePayload();

    return {
      partnershipsChannelId: selOrNull("ps-partnershipsChannelId"),
      logsChannelId: selOrNull("ps-logsChannelId"),
      pmCommandsChannelId: zonePayload.pmCommandsChannelId,
      pmCommandsCategoryIds: zonePayload.pmCommandsCategoryIds,
      partnerManagerRoleId: selOrNull("ps-partnerManagerRoleId"),
      managerBadgeRoleId: selOrNull("ps-managerBadgeRoleId"),
      skipManager: Boolean((byId("ps-skipManager") || {}).checked),
      manualPartnershipEnabled: Boolean((byId("ps-manualPartnershipEnabled") || {}).checked),
      contentFilters: {
        stripMentions: Boolean((byId("ps-filterStripMentions") || {}).checked),
        stripMassMentions: Boolean((byId("ps-filterStripMassMentions") || {}).checked),
        stripNonInviteLinks: Boolean((byId("ps-filterStripNonInviteLinks") || {}).checked),
        stripCustomEmojis: Boolean((byId("ps-filterStripCustomEmojis") || {}).checked),
        stripInvisibleChars: Boolean((byId("ps-filterStripInvisibleChars") || {}).checked),
        stripSpoilers: Boolean((byId("ps-filterStripSpoilers") || {}).checked),
        stripExtraInvites: Boolean((byId("ps-filterStripExtraInvites") || {}).checked),
      },
      managerLeaveAction: (function () {
        var feat = byId("ps-managerLeaveFeat");
        var on = feat && feat.classList.contains("is-on") && featHasPrimaryValue(feat);
        if (!on) return null;
        var act = selOrNull("ps-managerLeaveAction");
        return act === "warn" || act === "delete" ? act : null;
      })(),
      sameServerCooldownInput: (function () {
        var feat = byId("ps-sameServerCooldownFeat");
        var on = feat && feat.classList.contains("is-on") && featHasPrimaryValue(feat);
        if (!on) return null;
        return emptyToNull((byId("ps-sameServerCooldownInput") || {}).value);
      })(),
      pings: {
        hereMembers: hereOn ? numOrEmpty("ps-hereMembers") : null,
        everyoneMembers: everyoneOn ? numOrEmpty("ps-everyoneMembers") : null,
        customRoleId: customRoleId,
        customRoleMembers: customMembers,
        hereDelayInput: hereOn
          ? emptyToNull((byId("ps-hereDelayInput") || {}).value) || "5m"
          : null,
        everyoneDelayInput: everyoneOn
          ? emptyToNull((byId("ps-everyoneDelayInput") || {}).value) || "5m"
          : null,
        customRoleDelayInput: customReady
          ? emptyToNull((byId("ps-customRoleDelayInput") || {}).value) || "5m"
          : null,
      },
      partnerDesc: partnerDesc,
      thankYouEmbed: thankYouEmbed,
    };
  }

  function syncHeaderGuildNameMarquee() {
    var nameEl = byId("vc-dashboard-header-guild-name");
    if (!nameEl) return;
    var trackEl = nameEl.querySelector(".vc-dashboard-header-guild-name__track");
    if (!trackEl) return;
    var textNodes = trackEl.querySelectorAll(".vc-dashboard-header-guild-name__text");
    var textEl = textNodes[0];
    if (!textEl) return;

    // Reset duplicates / animation before measuring.
    nameEl.classList.remove("is-marquee");
    nameEl.style.removeProperty("--vc-marquee-distance");
    nameEl.style.removeProperty("--vc-marquee-duration");
    for (var i = textNodes.length - 1; i >= 1; i--) {
      textNodes[i].parentNode.removeChild(textNodes[i]);
    }
    textEl.style.paddingInlineEnd = "";
    trackEl.style.transform = "";

    void nameEl.offsetWidth;
    var containerW = nameEl.clientWidth || 0;
    if (containerW <= 0) return;

    // Misura fuori layout: evita scrollWidth “compresso” dal parent overflow.
    var probe = document.createElement("span");
    probe.textContent = textEl.textContent || "";
    probe.setAttribute("aria-hidden", "true");
    try {
      var cs = window.getComputedStyle(textEl);
      probe.style.cssText =
        "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;display:inline-block;pointer-events:none;" +
        "font:" +
        cs.font +
        ";letter-spacing:" +
        cs.letterSpacing +
        ";text-transform:" +
        cs.textTransform +
        ";";
    } catch (eProbe) {
      probe.style.cssText =
        "position:absolute;left:-99999px;top:0;visibility:hidden;white-space:nowrap;display:inline-block;";
    }
    document.body.appendChild(probe);
    var textW = Math.ceil(probe.scrollWidth || probe.offsetWidth || 0);
    probe.parentNode.removeChild(probe);

    if (textW <= containerW + 2) return;

    var clone = textEl.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.classList.add("is-clone");
    trackEl.appendChild(clone);
    textEl.style.paddingInlineEnd = "2rem";

    // Larghezza di un segmento (testo + gap) per loop continuo a -100% segmento.
    var segmentW = Math.ceil(textEl.getBoundingClientRect().width || textEl.scrollWidth || textW);
    if (segmentW <= 0) segmentW = textW + 32;
    nameEl.style.setProperty("--vc-marquee-distance", segmentW + "px");
    var duration = Math.max(8, Math.min(30, segmentW / 26));
    nameEl.style.setProperty("--vc-marquee-duration", duration.toFixed(1) + "s");
    nameEl.classList.add("is-marquee");
  }

  function wireHeaderGuildNameMarquee() {
    if (typeof window === "undefined" || window.__vcHeaderGuildMarqueeWired) return;
    window.__vcHeaderGuildMarqueeWired = true;
    var timer = null;
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        syncHeaderGuildNameMarquee();
      }, 60);
    }
    window.addEventListener("resize", schedule, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", schedule, { passive: true });
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule();
    });
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
        document.fonts.ready.then(function () {
          schedule();
        });
      }
    } catch (eFonts) {}
    try {
      var nameEl = byId("vc-dashboard-header-guild-name");
      if (nameEl && typeof ResizeObserver === "function" && !nameEl.__vcMarqueeRo) {
        nameEl.__vcMarqueeRo = new ResizeObserver(function () {
          schedule();
        });
        nameEl.__vcMarqueeRo.observe(nameEl);
      }
    } catch (eRo) {}
    setTimeout(schedule, 120);
    setTimeout(schedule, 400);
    setTimeout(schedule, 1200);
  }

  function resolveBotAvatarFallback(src) {
    var url = String(src || "").trim();
    if (!url) return "";
    // Asset locale mai deployato / 404: usa l’avatar Discord del bot.
    if (/vinili-avatar\.png/i.test(url) || /\{\{\s*WIKI_BOT_VINILI_AVATAR_URL\s*\}\}/.test(url)) {
      return "https://cdn.discordapp.com/avatars/1329118940110127204/a_2f3825915a41d0f9bcbf9f2675e6d6f0.gif?size=128";
    }
    return url;
  }

  function applyHeaderGuildBrand(guildName, guildIcon) {
    var dashLabel = i18n("footer.dashboard", "Dashboard");
    var rawName = String(guildName || "").trim();
    // Placeholder "Server" (API/i18n) non deve sostituire Dashboard nell'header.
    var isPlaceholder = !rawName || /^server$/i.test(rawName);
    var name = isPlaceholder ? dashLabel : rawName;
    var nameUpper = name.toLocaleUpperCase("it-IT");
    var icon = String(guildIcon || "").trim();
    var nameEl = byId("vc-dashboard-header-guild-name");
    var iconEl = byId("vc-dashboard-header-guild-icon");
    var logoLink = byId("vc-dashboard-header-guild-logo-link");

    if (!isPlaceholder) {
      state.headerGuildName = name;
      state.headerGuildIcon = icon || state.headerGuildIcon || "";
    } else {
      state.headerGuildName = "";
      // Non tenere un'icona guild "fantasma" se il nome non è noto.
      if (!icon) state.headerGuildIcon = "";
    }

    if (nameEl) {
      var trackEl = nameEl.querySelector(".vc-dashboard-header-guild-name__track");
      var textEl = nameEl.querySelector(".vc-dashboard-header-guild-name__text");
      if (!trackEl || !textEl) {
        nameEl.textContent = "";
        trackEl = document.createElement("span");
        trackEl.className = "vc-dashboard-header-guild-name__track";
        textEl = document.createElement("span");
        textEl.className = "vc-dashboard-header-guild-name__text";
        trackEl.appendChild(textEl);
        nameEl.appendChild(trackEl);
      } else {
        var extras = trackEl.querySelectorAll(".vc-dashboard-header-guild-name__text");
        for (var xi = extras.length - 1; xi >= 1; xi--) {
          extras[xi].parentNode.removeChild(extras[xi]);
        }
        textEl = extras[0] || textEl;
      }
      nameEl.classList.remove("is-marquee");
      textEl.textContent = nameUpper;
      nameEl.setAttribute("title", name);
      if (isPlaceholder) nameEl.setAttribute("data-i18n", "footer.dashboard");
      else nameEl.removeAttribute("data-i18n");
      wireHeaderGuildNameMarquee();
      // Dopo layout (font/flex): misura overflow.
      requestAnimationFrame(function () {
        requestAnimationFrame(syncHeaderGuildNameMarquee);
      });
    }
    if (iconEl) {
      if (!iconEl.getAttribute("data-vc-bot-avatar")) {
        var initialSrc = resolveBotAvatarFallback(iconEl.getAttribute("src") || "");
        if (initialSrc) iconEl.setAttribute("data-vc-bot-avatar", initialSrc);
      } else {
        var storedBot = resolveBotAvatarFallback(iconEl.getAttribute("data-vc-bot-avatar") || "");
        if (storedBot) iconEl.setAttribute("data-vc-bot-avatar", storedBot);
      }
      if (!isPlaceholder && (icon || state.headerGuildIcon)) {
        // Sulla dashboard guild: icona del server corrente.
        var nextIcon = icon || state.headerGuildIcon;
        if (nextIcon && iconEl.getAttribute("src") !== nextIcon) {
          iconEl.src = nextIcon;
        }
        iconEl.setAttribute("data-vc-guild-brand", "1");
      } else {
        // Fuori da un server / nome non noto: avatar bot.
        var botAvatar = resolveBotAvatarFallback(iconEl.getAttribute("data-vc-bot-avatar") || "");
        if (botAvatar && iconEl.getAttribute("src") !== botAvatar) {
          iconEl.src = botAvatar;
        }
        iconEl.removeAttribute("data-vc-guild-brand");
      }
      iconEl.alt = nameUpper;
    }
    if (logoLink) {
      logoLink.setAttribute("aria-label", nameUpper);
      logoLink.setAttribute("title", nameUpper);
    }

    try {
      if (window.VcPageTitle && !isPlaceholder) window.VcPageTitle.set("Dashboard", nameUpper);
      else document.title = isPlaceholder ? nameUpper : nameUpper + " | Dashboard";
    } catch (e) {}

    try {
      syncDashboardFavicon(
        !isPlaceholder ? icon || state.headerGuildIcon || "" : "",
        iconEl ? String(iconEl.getAttribute("data-vc-bot-avatar") || "").trim() : "",
      );
    } catch (eFav) {}

    try {
      if (typeof window.__vcMobileNavRebuild === "function") {
        window.__vcMobileNavRebuild();
      }
    } catch (e3) {}
  }

  function syncDashboardFavicon(guildIconUrl, botAvatarUrl) {
    var href = String(guildIconUrl || "").trim() || String(botAvatarUrl || "").trim();
    if (!href) return;
    var links = document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]');
    if (!links.length) {
      var created = document.createElement("link");
      created.setAttribute("rel", "icon");
      document.head.appendChild(created);
      links = [created];
    }
    Array.prototype.forEach.call(links, function (link) {
      if (link.getAttribute("href") === href) return;
      link.setAttribute("href", href);
    });
  }

  function renderOverview(data) {
    var main = byId("vc-dashboard-guild-main");
    if (!main) return;
    main.removeAttribute("hidden");
    setSidebarVisible(true);

    var guild = (data && data.guild) || {};
    var setup = data && data.setup;
    var stats = data && data.stats;
    var rawGuildName = String(guild.name || "").trim();
    var guildName =
      rawGuildName && !/^server$/i.test(rawGuildName)
        ? rawGuildName
        : i18n("footer.dashboard", "Dashboard");
    var guildIcon = String(guild.iconUrl || "").trim();

    var title = byId("vc-dashboard-guild-title");
    if (title) title.textContent = guildName;

    var iconEl = byId("vc-dashboard-guild-icon");
    if (iconEl) {
      if (guildIcon) {
        iconEl.src = guildIcon;
        iconEl.removeAttribute("hidden");
      } else {
        iconEl.setAttribute("hidden", "");
      }
    }

    applyHeaderGuildBrand(
      rawGuildName && !/^server$/i.test(rawGuildName) ? rawGuildName : "",
      guildIcon,
    );

    var membersEl = byId("vc-dashboard-stat-members");
    if (membersEl) membersEl.textContent = fmtNum(stats && stats.memberCount);
    var onlineEl = byId("vc-dashboard-stat-online");
    if (onlineEl) onlineEl.textContent = fmtNum(stats && stats.onlineCount);

    var setupEl = byId("vc-dashboard-setup-status");
    var form = byId("vc-dashboard-partnership-form");
    var inviteBtn = byId("vc-dashboard-invite-btn");
    var modulesEl = byId("vc-dashboard-modules");
    // Partnership + impostazioni anche sul server principale (overlay Mongo / config legacy).
    var canUsePartnership = Boolean(guild.botPresent && setup);
    var canUseSettings = Boolean(guild.botPresent);
    var ticketsOk = Boolean(guild.botPresent);
    setTicketsNavVisible(ticketsOk);

    if (!canUsePartnership) {
      setPartnershipNavVisible(false);
      setClassificheNavVisible(false);
      state.partnership = null;
      if (form) form.setAttribute("hidden", "");
    } else {
      setPartnershipNavVisible(true);
      setClassificheNavVisible(true);
    }

    if (!canUseSettings) {
      setSettingsNavVisible(false);
      state.settings = null;
      var settingsFormHide = byId("vc-dashboard-settings-form");
      if (settingsFormHide) settingsFormHide.setAttribute("hidden", "");
    } else {
      setSettingsNavVisible(true);
    }

    if (modulesEl) {
      if (guild.botPresent) {
        modulesEl.removeAttribute("hidden");
      } else {
        modulesEl.setAttribute("hidden", "");
      }
    }
    Array.prototype.forEach.call(document.querySelectorAll('[data-module="partnership"]'), function (card) {
      if (!card) return;
      if (canUsePartnership) card.removeAttribute("hidden");
      else card.setAttribute("hidden", "");
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-module="bacheca"]'), function (card) {
      if (!card) return;
      if (canUseSettings) card.removeAttribute("hidden");
      else card.setAttribute("hidden", "");
    });
    var ticketsCard = document.querySelector('[data-module="tickets"]');
    if (ticketsCard) {
      if (ticketsOk) ticketsCard.removeAttribute("hidden");
      else ticketsCard.setAttribute("hidden", "");
    }
    syncTicketsModuleCard();

    var partnershipSettingsBtn = document.querySelector('[data-module-settings="partnership"]');
    if (partnershipSettingsBtn) {
      partnershipSettingsBtn.disabled = !canUsePartnership;
      partnershipSettingsBtn.title = canUsePartnership
        ? i18n("dash.metaOpen", "Apri impostazioni")
        : i18n("dash.metaUnavailable", "Partnership non disponibile su questo server");
    }

    if (setupEl) {
      if (guild.botUsageBlacklisted) {
        setupEl.innerHTML =
          '<div class="vc-dashboard-callout vc-dashboard-callout--warn">' +
          i18n(
            "dash.calloutBotBlacklistedHtml",
            "<strong>Server in blacklist.</strong> Vinili non può essere invitato qui.",
          ) +
          "</div>";
        if (inviteBtn) inviteBtn.setAttribute("hidden", "");
      } else if (!guild.botPresent) {
        setupEl.innerHTML =
          '<div class="vc-dashboard-callout vc-dashboard-callout--warn">' +
          i18n(
            "dash.calloutBotMissingHtml",
            "<strong>Vinili non è in questo server.</strong> Invitalo per iniziare la configurazione.",
          ) +
          "</div>";
        if (inviteBtn) {
          var url = String(guild.inviteUrl || "").trim();
          if (url) {
            inviteBtn.href = url;
            inviteBtn.removeAttribute("hidden");
          } else {
            inviteBtn.setAttribute("hidden", "");
          }
        }
      } else if (setup && setup.kind === "main") {
        setupEl.innerHTML = "";
        if (inviteBtn) inviteBtn.setAttribute("hidden", "");
      } else {
        setupEl.innerHTML = "";
        if (inviteBtn) inviteBtn.setAttribute("hidden", "");
      }
    }

    if (guild.botPresent) {
      stopBotPresenceWait();
    } else if (!guild.botUsageBlacklisted) {
      startBotPresenceWait({ extendMs: 90_000 });
    } else {
      stopBotPresenceWait();
    }

    applyView(canUsePartnership || canUseSettings ? currentView() : "overview");
  }

  async function loadSettings(seq) {
    var token = getToken();
    if (!token || !state.guildId) return false;
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/settings",
        token,
        { attempts: 3 },
      );
      if (seq !== state.loadSeq) return false;
      var res = out.res;
      var data = out.data;
      if (res.status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
        showLocked();
        return false;
      }
      if (!res.ok || !data || data.ok === false) {
        if (data && (data.error === "main_guild" || data.error === "bot_missing")) return false;
        setError((data && data.message) || i18n("dash.cfg.errLoad", "Impossibile caricare le impostazioni."));
        return false;
      }
      state.settings = data.settings;
      state.settingsPickers = data.pickers;
      state.settingsProtectedGuild = data.protectedGuild === true;
      setPremiumFromApi(data);
      fillSettingsForm(data.settings, data.pickers);
      fillBachecaForm(data.settings, data.pickers);
      applyPremiumUi();
      return true;
    } catch (e) {
      if (seq !== state.loadSeq) return false;
      setError(i18n("dash.cfg.errNetwork", "Errore di rete durante il caricamento impostazioni."));
      return false;
    }
  }

  function applySettingsTenantLocks(settings) {
    var s = settings || state.settings || {};
    var protectedGuild = state.settingsProtectedGuild === true;
    var prefixLocked = protectedGuild || s.prefixLocked === true;
    // Ruoli accesso: editabili anche sul principale (rolesLocked arriva dall’API).
    var rolesLocked = s.rolesLocked === true;
    // Canale aggiornamenti resta bloccato sul principale Vinili.
    var updatesLocked = protectedGuild || s.updatesLocked === true;
    state.settingsPrefixLocked = prefixLocked;
    state.settingsRolesLocked = rolesLocked;

    var prefixEl = byId("gs-prefix");
    if (prefixEl) {
      prefixEl.disabled = prefixLocked;
      prefixEl.readOnly = prefixLocked;
      prefixEl.setAttribute("aria-disabled", prefixLocked ? "true" : "false");
    }

    var updatesEl = byId("gs-updatesChannelId");
    if (updatesEl) {
      updatesEl.disabled = updatesLocked;
      updatesEl.setAttribute("aria-disabled", updatesLocked ? "true" : "false");
    }

    var rolesField = document.querySelector("[data-gs-dash-roles]");
    if (rolesField) {
      rolesField.classList.toggle("is-locked", rolesLocked);
      rolesField.setAttribute("aria-disabled", rolesLocked ? "true" : "false");
      var search = rolesField.querySelector("[data-gs-dash-roles-search]");
      if (search) {
        search.disabled = rolesLocked;
        search.readOnly = rolesLocked;
        if (rolesLocked) search.value = "";
      }
      if (rolesLocked) closeGsDashRolesMenus();
    }

    var roleHint = document.querySelector('[data-i18n="dash.cfg.dashRoleHint"], [data-i18n="dash.cfg.dashRoleHintLocked"]');
    if (roleHint) {
      if (rolesLocked) {
        roleHint.setAttribute("data-i18n", "dash.cfg.dashRoleHintLocked");
        roleHint.textContent = i18n(
          "dash.cfg.dashRoleHintLocked",
          "Sul server principale Vinili l’accesso dashboard è riservato all’High Staff: qui non si possono salvare ruoli extra.",
        );
      } else {
        roleHint.setAttribute("data-i18n", "dash.cfg.dashRoleHint");
        roleHint.textContent = i18n(
          "dash.cfg.dashRoleHint",
          "Ruoli con permesso Amministratore (non gestiti da bot) che possono aprire questa dashboard. Puoi selezionarne più di uno e rimuoverli con ×. Chi ha Manage Server può sempre entrare per configurarli.",
        );
      }
    }

    var updatesHint = document.querySelector('[data-i18n="dash.cfg.updatesHint"], [data-i18n="dash.cfg.updatesHintLocked"]');
    if (updatesHint) {
      if (updatesLocked) {
        updatesHint.setAttribute("data-i18n", "dash.cfg.updatesHintLocked");
        updatesHint.textContent = i18n(
          "dash.cfg.updatesHintLocked",
          "Sul server principale Vinili questo canale non si configura da dashboard.",
        );
      } else {
        updatesHint.setAttribute("data-i18n", "dash.cfg.updatesHint");
        updatesHint.textContent = i18n(
          "dash.cfg.updatesHint",
          "Canale di inoltro degli aggiornamenti dal canale news di Vinili.",
        );
      }
    }

    Array.prototype.forEach.call(document.querySelectorAll("[data-gs-tenant-lock-row]"), function (row) {
      var kind = String(row.getAttribute("data-gs-tenant-lock-row") || "");
      var locked =
        kind === "roles" ? rolesLocked : kind === "updates" ? updatesLocked : kind === "prefix" ? prefixLocked : false;
      row.classList.toggle("is-tenant-locked", locked);
    });
  }

  function normalizeDashboardRoleIds(ids) {
    var seen = {};
    var out = [];
    (Array.isArray(ids) ? ids : []).forEach(function (raw) {
      var id = String(raw || "").trim();
      if (!id || seen[id]) return;
      seen[id] = true;
      out.push(id);
    });
    return out;
  }

  function roleHasAdministrator(role) {
    if (!role) return false;
    if (role.administrator === true) return true;
    try {
      var perms = BigInt(String(role.permissions != null ? role.permissions : "0"));
      return (perms & 8n) === 8n;
    } catch (e) {
      return false;
    }
  }

  function isDashboardAssignableRole(role) {
    if (!role || role.managed === true) return false;
    return roleHasAdministrator(role);
  }

  function buildSettingsRoleOptions(selectedIds, query) {
    var roles = (state.pickers && state.pickers.roles) || (state.settingsPickers && state.settingsPickers.roles) || [];
    var selected = {};
    (selectedIds || []).forEach(function (id) {
      selected[String(id)] = true;
    });
    var q = String(query || "").trim().toLowerCase();
    var out = [];
    for (var i = 0; i < roles.length; i++) {
      var role = roles[i];
      var id = String(role.id || "");
      if (!id || selected[id]) continue;
      if (!isDashboardAssignableRole(role)) continue;
      var name = String(role.name || id);
      if (q && name.toLowerCase().indexOf(q) < 0) continue;
      out.push({ id: id, name: name });
    }
    return out;
  }

  function closeGsDashRolesMenus(exceptField) {
    Array.prototype.forEach.call(document.querySelectorAll("[data-gs-dash-roles]"), function (field) {
      if (exceptField && field === exceptField) return;
      var menu = field.querySelector("[data-gs-dash-roles-menu]");
      var search = field.querySelector("[data-gs-dash-roles-search]");
      if (menu) menu.setAttribute("hidden", "");
      field.classList.remove("is-open");
      if (search) search.value = "";
    });
  }

  function renderGsDashRolesField() {
    var field = document.querySelector("[data-gs-dash-roles]");
    if (!field) return;
    var chipsHost = field.querySelector("[data-gs-dash-roles-chips]");
    var menu = field.querySelector("[data-gs-dash-roles-menu]");
    var search = field.querySelector("[data-gs-dash-roles-search]");
    var ids = Array.isArray(state.dashboardRoleIds) ? state.dashboardRoleIds : [];
    var roles = (state.pickers && state.pickers.roles) || (state.settingsPickers && state.settingsPickers.roles) || [];
    var chipsHtml = "";
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i]);
      chipsHtml +=
        '<button type="button" class="vc-dash-token-chip" data-gs-dash-roles-remove="' +
        esc(id) +
        '">' +
        esc(cmdPickerLabel(roles, id)) +
        ' <span aria-hidden="true">×</span></button>';
    }
    if (chipsHost) chipsHost.innerHTML = chipsHtml;
    if (!menu) return;
    var options = buildSettingsRoleOptions(ids, search ? search.value : "");
    var menuHtml = "";
    if (!options.length) {
      menuHtml =
        '<p class="vc-dash-token-field__empty">' +
        esc(i18n("dash.cmds.noOptions", "Nessuna opzione disponibile.")) +
        "</p>";
    } else {
      for (var r = 0; r < options.length; r++) {
        menuHtml +=
          '<button type="button" class="vc-dash-token-field__option" data-gs-dash-roles-add="' +
          esc(options[r].id) +
          '">' +
          esc(options[r].name) +
          "</button>";
      }
    }
    menu.innerHTML = menuHtml;
  }

  function setDashboardRoleIds(ids, opts) {
    opts = opts || {};
    state.dashboardRoleIds = normalizeDashboardRoleIds(ids);
    renderGsDashRolesField();
    if (!opts.silent) {
      if (state.settingsRolesLocked) return;
      scheduleSettingsAutosave(0);
    }
  }

  function addDashboardRoleId(id) {
    if (state.settingsRolesLocked) return;
    var sid = String(id || "").trim();
    if (!sid) return;
    if ((state.dashboardRoleIds || []).indexOf(sid) >= 0) return;
    var roles = (state.pickers && state.pickers.roles) || (state.settingsPickers && state.settingsPickers.roles) || [];
    var role = null;
    for (var i = 0; i < roles.length; i++) {
      if (String(roles[i].id || "") === sid) {
        role = roles[i];
        break;
      }
    }
    if (role && !isDashboardAssignableRole(role)) return;
    setDashboardRoleIds((state.dashboardRoleIds || []).concat([sid]));
  }

  function removeDashboardRoleId(id) {
    if (state.settingsRolesLocked) return;
    var sid = String(id || "");
    setDashboardRoleIds(
      (state.dashboardRoleIds || []).filter(function (x) {
        return String(x) !== sid;
      }),
    );
  }

  function wireGsDashRoles() {
    var form = byId("vc-dashboard-settings-form");
    if (!form || form.__vcDashRolesWired) return;
    form.__vcDashRolesWired = true;
    form.addEventListener("click", function (ev) {
      var field = ev.target && ev.target.closest ? ev.target.closest("[data-gs-dash-roles]") : null;
      if (field && state.settingsRolesLocked) {
        ev.preventDefault();
        return;
      }
      var removeBtn = ev.target && ev.target.closest ? ev.target.closest("[data-gs-dash-roles-remove]") : null;
      if (removeBtn) {
        ev.preventDefault();
        removeDashboardRoleId(String(removeBtn.getAttribute("data-gs-dash-roles-remove") || ""));
        return;
      }
      var addBtn = ev.target && ev.target.closest ? ev.target.closest("[data-gs-dash-roles-add]") : null;
      if (addBtn && field) {
        ev.preventDefault();
        addDashboardRoleId(String(addBtn.getAttribute("data-gs-dash-roles-add") || ""));
        var searchEl = field.querySelector("[data-gs-dash-roles-search]");
        if (searchEl) searchEl.value = "";
        renderGsDashRolesField();
        return;
      }
      if (!field) return;
      var onMenu = ev.target && ev.target.closest ? ev.target.closest("[data-gs-dash-roles-menu]") : null;
      if (onMenu) return;
      var onBox = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-token-field__box") : null;
      if (onBox) {
        var onSearch =
          ev.target && ev.target.closest ? ev.target.closest("[data-gs-dash-roles-search]") : null;
        if (!onSearch) {
          var searchFocus = field.querySelector("[data-gs-dash-roles-search]");
          if (searchFocus) searchFocus.focus();
        }
        closeGsDashRolesMenus(field);
        var menu = field.querySelector("[data-gs-dash-roles-menu]");
        field.classList.add("is-open");
        if (menu) menu.removeAttribute("hidden");
        renderGsDashRolesField();
      }
    });
    form.addEventListener("input", function (ev) {
      var search = ev.target && ev.target.closest ? ev.target.closest("[data-gs-dash-roles-search]") : null;
      if (!search) return;
      var field = search.closest("[data-gs-dash-roles]");
      if (!field) return;
      field.classList.add("is-open");
      var menu = field.querySelector("[data-gs-dash-roles-menu]");
      if (menu) menu.removeAttribute("hidden");
      renderGsDashRolesField();
    });
    document.addEventListener("mousedown", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("[data-gs-dash-roles]")) return;
      closeGsDashRolesMenus();
    });
  }

  function normalizeBotNick(value) {
    var s = String(value == null ? "" : value).trim();
    return s || null;
  }

  function captureSettingsBaseline() {
    state.settingsBaseline = JSON.stringify(buildSettingsPatchFromForm({ forCompare: true }));
    state.pendingBotAvatar = undefined;
    state.pendingBotBanner = undefined;
  }

  function isSettingsFormDirty() {
    try {
      return JSON.stringify(buildSettingsPatchFromForm({ forCompare: true })) !== state.settingsBaseline;
    } catch (e) {
      return true;
    }
  }

  function buildSettingsPatchFromForm(opts) {
    opts = opts || {};
    var forCompare = opts.forCompare === true;
    var prefixEl = byId("gs-prefix");
    var nickEl = byId("gs-botNickname");
    var chEl = byId("gs-updatesChannelId");
    var nick = normalizeBotNick(nickEl && nickEl.value);
    var roleIds = Array.isArray(state.dashboardRoleIds) ? state.dashboardRoleIds.slice() : [];
    var patch = {};
    // Guild Vinili protetti: prefisso/ruoli/canale non persistono — esclusi anche dal dirty-check.
    if (!state.settingsPrefixLocked) {
      patch.prefix = String((prefixEl && prefixEl.value) || "").trim() || "+";
    }
    if (!state.settingsRolesLocked) {
      patch.dashboardRoleIds = roleIds;
      patch.dashboardRoleId = roleIds[0] || null;
    }
    if (!state.settingsProtectedGuild) {
      patch.updatesChannelId = String((chEl && chEl.value) || "").trim() || null;
    }
    // Solo se l’utente ha cambiato il nick in dashboard: altrimenti Discord resta source of truth
    // (un rename fatto sul server non viene riscritto dall’autosave di altri campi).
    if (forCompare || nick !== state.settingsNickLoaded) {
      patch.botNickname = nick;
    }
    if (state.pendingBotAvatar !== undefined) {
      patch.botAvatar = state.pendingBotAvatar;
    }
    if (state.pendingBotBanner !== undefined) {
      patch.botBanner = state.pendingBotBanner;
    }
    return patch;
  }

  function setBotBannerPreview(url) {
    var preview = byId("gs-botBannerPreview");
    var empty = byId("gs-botBannerEmpty");
    var src = String(url || "").trim();
    if (preview) {
      if (src) {
        preview.src = src;
        preview.removeAttribute("hidden");
      } else {
        preview.removeAttribute("src");
        preview.setAttribute("hidden", "");
      }
    }
    if (empty) {
      if (src) empty.setAttribute("hidden", "");
      else empty.removeAttribute("hidden");
    }
  }

  function setBotUsernameHint(username) {
    var hint = byId("gs-botUsernameHint");
    if (!hint) return;
    var u = String(username || "").trim();
    hint.textContent = u ? "@" + u : "";
    if (u) hint.removeAttribute("hidden");
    else hint.setAttribute("hidden", "");
  }

  function applyLiveBotIdentity(settings, opts) {
    opts = opts || {};
    if (!settings) return;
    var nickEl = byId("gs-botNickname");
    var nickDirty = normalizeBotNick(nickEl && nickEl.value) !== state.settingsNickLoaded;
    if (nickEl && (opts.forceNick || !nickDirty)) {
      nickEl.value = settings.botNickname || "";
      nickEl.placeholder = settings.botUsername || nickEl.placeholder || "—";
      state.settingsNickLoaded = normalizeBotNick(settings.botNickname);
    }
    setBotUsernameHint(settings.botUsername);
    if (state.pendingBotAvatar === undefined || opts.forceAvatar) {
      var preview = byId("gs-botAvatarPreview");
      if (preview) {
        var url = String(settings.botAvatarUrl || "").trim();
        if (url) {
          preview.src = url;
          preview.removeAttribute("hidden");
        }
      }
      var resetBtn = byId("gs-botAvatarReset");
      if (resetBtn) {
        if (settings.hasGuildAvatar) resetBtn.removeAttribute("hidden");
        else resetBtn.setAttribute("hidden", "");
      }
    }
    if (state.pendingBotBanner === undefined || opts.forceBanner) {
      setBotBannerPreview(settings.botBannerUrl);
      var resetBannerBtn = byId("gs-botBannerReset");
      if (resetBannerBtn) {
        if (settings.hasGuildBanner) resetBannerBtn.removeAttribute("hidden");
        else resetBannerBtn.setAttribute("hidden", "");
      }
    }
  }

  function syncBachecaModeUi() {
    // Modalità Unico/Separati rimossa dalla UI: i canali sono per-funzione.
    // Manteniamo mode=split lato salvataggio.
    var modeEl = byId("bc-boardsMode");
    if (modeEl) modeEl.value = "split";
    syncBachecaFeatureChannelVisibility();
  }

  function getBachecaFeaturesFromSettings(settings) {
    var boards = settings && settings.boards && typeof settings.boards === "object" ? settings.boards : null;
    var feats = boards && boards.features && typeof boards.features === "object" ? boards.features : {};
    return {
      quote: feats.quote !== false,
      repost: feats.repost !== false,
      clip: feats.clip !== false,
      skull: feats.skull !== false,
    };
  }

  function getBachecaFeaturesFromForm() {
    return {
      quote: Boolean(byId("bc-feat-quote") && byId("bc-feat-quote").checked),
      repost: Boolean(byId("bc-feat-repost") && byId("bc-feat-repost").checked),
      clip: Boolean(byId("bc-feat-clip") && byId("bc-feat-clip").checked),
      skull: Boolean(byId("bc-feat-skull") && byId("bc-feat-skull").checked),
    };
  }

  function syncBachecaFeatureChannelVisibility() {
    var feats = getBachecaFeaturesFromForm();
    // Se il form non è ancora popolato, fallback alle settings.
    if (!byId("bc-feat-quote") && !byId("bc-feat-repost") && !byId("bc-feat-clip") && !byId("bc-feat-skull")) {
      feats = getBachecaFeaturesFromSettings(state.settings);
    }
    Array.prototype.forEach.call(document.querySelectorAll("[data-bc-feature-channel]"), function (el) {
      var kind = String(el.getAttribute("data-bc-feature-channel") || "");
      var on = feats[kind] !== false;
      if (on) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-bc-feature-card]"), function (el) {
      var kind = String(el.getAttribute("data-bc-feature-card") || "");
      el.classList.toggle("is-feat-off", feats[kind] === false);
    });
  }

  function fillBachecaFeaturesForm(settings) {
    var feats = getBachecaFeaturesFromSettings(settings || state.settings);
    // Funzioni disattivabili anche sul server Vinili; i canali restano bloccati.
    ["quote", "repost", "clip", "skull"].forEach(function (kind) {
      var el = byId("bc-feat-" + kind);
      if (!el) return;
      el.checked = feats[kind] !== false;
      el.disabled = false;
      el.removeAttribute("aria-disabled");
      var sw = el.closest ? el.closest(".vc-dash-switch") : null;
      if (sw) sw.classList.remove("vc-dash-switch--locked");
    });
    var boards = (settings || state.settings || {}).boards || {};
    var clipTr = byId("bc-clip-transcription");
    if (clipTr) {
      clipTr.checked = boards.clipTranscription !== false;
      clipTr.disabled = false;
    }
    syncBachecaFeatureChannelVisibility();
  }

  function buildBachecaFeaturesPatchFromForm() {
    return {
      boards: {
        enabled: isBachecaEnabledFromSettings(state.settings),
        features: {
          quote: Boolean(byId("bc-feat-quote") && byId("bc-feat-quote").checked),
          repost: Boolean(byId("bc-feat-repost") && byId("bc-feat-repost").checked),
          clip: Boolean(byId("bc-feat-clip") && byId("bc-feat-clip").checked),
          skull: Boolean(byId("bc-feat-skull") && byId("bc-feat-skull").checked),
        },
        clipTranscription: Boolean(byId("bc-clip-transcription") && byId("bc-clip-transcription").checked),
      },
    };
  }

  async function saveBachecaFeatures(opts) {
    var options = opts || {};
    var silent = options.silent === true;
    if (!canUseGuildSettings() || !state.guildId) return;
    if (state.settingsSaving) {
      state.bachecaFeaturesAutosavePending = true;
      return;
    }
    var token = getToken();
    if (!token) return;
    state.settingsSaving = true;
    var seq = ++state.bachecaSaveSeq;
    if (silent) {
      showSaveToast(i18n("dash.savingShort", "Salvataggio…"), false, { pending: true });
    }
    try {
      var res = await fetch(resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/settings", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBachecaFeaturesPatchFromForm()),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (seq !== state.bachecaSaveSeq) return;
      if (!res.ok || !data || data.ok === false) {
        showSaveToast(
          (data && data.message) || i18n("dash.boards.errSave", "Salvataggio bacheca non riuscito."),
          true,
        );
        return;
      }
      state.settings = data.settings;
      state.settingsPickers = data.pickers || state.settingsPickers;
      fillBachecaFeaturesForm(state.settings);
      syncBachecaModuleUi(state.settings);
      // I toggle comandi devono riflettere subito le funzioni disattivate.
      if (state.commandsCatalog) {
        refreshCommandsPage({ silent: true }).catch(function () {});
      }
      showSaveToast(i18n("dash.boards.featuresSaved", "Funzioni bacheca salvate."), false);
    } catch (e) {
      if (seq !== state.bachecaSaveSeq) return;
      showSaveToast(i18n("dash.boards.errNetwork", "Errore di rete durante il salvataggio bacheca."), true);
    } finally {
      if (seq === state.bachecaSaveSeq) {
        state.settingsSaving = false;
        flushPendingSettingsSaves();
      }
    }
  }

  function scheduleBachecaFeaturesAutosave(delayMs) {
    if (!canUseGuildSettings()) return;
    if (state.settingsSaving) {
      state.bachecaFeaturesAutosavePending = true;
      return;
    }
    if (state.bachecaFeaturesAutosaveTimer) clearTimeout(state.bachecaFeaturesAutosaveTimer);
    var wait = typeof delayMs === "number" ? Math.max(0, delayMs) : BACHECA_AUTOSAVE_MS;
    if (wait < 200) wait = BACHECA_AUTOSAVE_MS;
    state.bachecaFeaturesAutosaveTimer = setTimeout(function () {
      state.bachecaFeaturesAutosaveTimer = null;
      saveBachecaFeatures({ silent: true });
    }, wait);
  }

  function wireBachecaFeaturesForm() {
    var form = byId("vc-dashboard-bacheca-features-form");
    if (!form || form.__vcWired) return;
    form.__vcWired = true;
    form.addEventListener("change", function (ev) {
      var t = ev.target;
      if (!t) return;
      var isFeature = t.getAttribute && t.getAttribute("data-bc-feature");
      var isChannel =
        t.id === "bc-quoteChannelId" ||
        t.id === "bc-repostChannelId" ||
        t.id === "bc-clipChannelId" ||
        t.id === "bc-skullChannelId";
      var isClipTranscription = t.id === "bc-clip-transcription";
      if (!isFeature && !isChannel && !isClipTranscription) return;
      if (isFeature || isClipTranscription) {
        if (!state.settings || typeof state.settings !== "object") state.settings = {};
        if (!state.settings.boards || typeof state.settings.boards !== "object") state.settings.boards = {};
        state.settings.boards.features = getBachecaFeaturesFromForm();
        if (isClipTranscription) {
          state.settings.boards.clipTranscription = Boolean(t.checked);
        }
        syncBachecaFeatureChannelVisibility();
        scheduleBachecaFeaturesAutosave(0);
        return;
      }
      scheduleBachecaAutosave(0);
    });
  }

  function isBachecaEnabledFromSettings(settings) {
    var boards = settings && settings.boards && typeof settings.boards === "object" ? settings.boards : null;
    if (!boards) return true;
    return boards.enabled !== false;
  }

  function syncBachecaModuleUi(settings) {
    var enabled = isBachecaEnabledFromSettings(settings || state.settings);
    var locked = state.settingsProtectedGuild === true;
    var card = document.querySelector('[data-module="bacheca"]');
    if (card) {
      card.classList.toggle("is-on", enabled);
      var sw = card.querySelector('[data-module-switch="bacheca"]');
      var swLabel = sw && sw.closest ? sw.closest(".vc-dash-switch") : null;
      if (sw) {
        sw.checked = enabled;
        sw.disabled = locked;
      }
      if (swLabel) {
        swLabel.classList.toggle("vc-dash-switch--locked", locked);
        swLabel.setAttribute(
          "title",
          locked
            ? i18n("dash.alwaysOn", "Sempre attivo")
            : i18n("dash.boards.toggleTitle", "Attiva o disattiva Bacheca"),
        );
      }
      var liveBadge = card.querySelector('[data-module-live-badge="bacheca"]');
      if (liveBadge) {
        liveBadge.textContent = enabled
          ? i18n("dash.active", "Attivo")
          : i18n("dash.inactive", "Disattivo");
        liveBadge.classList.toggle("vc-dash-module__badge--live", enabled);
        liveBadge.classList.toggle("vc-dash-module__badge--off", !enabled);
      }
    }
    var group = byId("vc-dashboard-sidebar-bacheca");
    var toggle = byId("vc-dashboard-sidebar-bacheca-toggle");
    var sideFunzioni = byId("vc-dashboard-sidebar-bacheca-funzioni");
    var sideStile = byId("vc-dashboard-sidebar-bacheca-stile");
    if (group) group.classList.toggle("is-module-off", !enabled);
    if (toggle) {
      toggle.classList.toggle("is-module-off", !enabled);
      if (enabled) {
        toggle.removeAttribute("aria-disabled");
        toggle.removeAttribute("tabindex");
        toggle.setAttribute("title", i18n("dash.boards.title", "Bacheca"));
      } else {
        toggle.setAttribute("aria-disabled", "true");
        toggle.setAttribute("tabindex", "-1");
        toggle.setAttribute("title", i18n("dash.boards.navDisabled", "Bacheca disattivata"));
        toggle.classList.remove("is-active");
        setBachecaNavOpen(false);
      }
    }
    [sideFunzioni, sideStile].forEach(function (el) {
      if (!el) return;
      el.classList.toggle("is-module-off", !enabled);
      if (enabled) {
        el.removeAttribute("aria-disabled");
        el.removeAttribute("tabindex");
        el.setAttribute(
          "title",
          el.id === "vc-dashboard-sidebar-bacheca-stile"
            ? i18n("dash.boards.customizeNav", "Personalizzazione")
            : i18n("dash.boards.featuresNav", "Funzioni"),
        );
      } else {
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("tabindex", "-1");
        el.setAttribute("title", i18n("dash.boards.navDisabled", "Bacheca disattivata"));
        el.classList.remove("is-active");
        el.removeAttribute("aria-current");
      }
    });
  }

  var QUOTE_STYLE_BG = {
    black: { bg: "#070707", fg: "#ffffff", muted: "rgba(255,255,255,0.7)" },
    charcoal: { bg: "#1a1a1a", fg: "#f5f5f5", muted: "rgba(245,245,245,0.72)" },
    navy: { bg: "#0b1220", fg: "#e8eef8", muted: "rgba(232,238,248,0.72)" },
    wine: { bg: "#1a0a0e", fg: "#f7e8ec", muted: "rgba(247,232,236,0.72)" },
    forest: { bg: "#0a1410", fg: "#e6f2ea", muted: "rgba(230,242,234,0.72)" },
    white: { bg: "#f4f4f4", fg: "#111111", muted: "rgba(17,17,17,0.62)" },
    cream: { bg: "#f7ecdf", fg: "#1a120e", muted: "rgba(26,18,14,0.62)" },
  };
  var QUOTE_STYLE_FONTS = {
    mplus: 1, dela: 1, dot: 1, pop: 1, rampart: 1, reggae: 1, rocknroll: 1,
    yuji: 1, yusei: 1, jiyu: 1, shippori: 1, bruno: 1, castoro: 1, poltawski: 1,
    vina: 1, exo2: 1, inconsolata: 1, script: 1,
    sans: 1, serif: 1, mono: 1, display: 1, arial: 1, verdana: 1, trebuchet: 1, tahoma: 1,
    helvetica: 1, roboto: 1, opensans: 1, lato: 1, montserrat: 1, poppins: 1, nunito: 1,
    rubik: 1, ubuntu: 1, inter: 1, georgia: 1, times: 1, playfair: 1, merriweather: 1,
    crimson: 1, libre: 1, courier: 1, sourcecode: 1, impact: 1, oswald: 1, bebas: 1,
    anton: 1, comic: 1, pacifico: 1, dancing: 1, greatvibes: 1,
  };
  var QUOTE_FONT_PREVIEW = {
    mplus: '"M PLUS Rounded 1c", "Noto Sans", sans-serif',
    dela: '"Dela Gothic One", Impact, sans-serif',
    dot: '"DotGothic16", monospace',
    pop: '"Hachi Maru Pop", "Comic Sans MS", cursive',
    rampart: '"Rampart One", Impact, sans-serif',
    reggae: '"Reggae One", Impact, sans-serif',
    rocknroll: '"RocknRoll One", Impact, sans-serif',
    yuji: '"Yuji Syuku", Georgia, serif',
    yusei: '"Yusei Magic", "Comic Sans MS", sans-serif',
    jiyu: '"JiyunoTsubasa", Impact, sans-serif',
    shippori: '"Shippori Mincho", Georgia, serif',
    bruno: '"Bruno Ace SC", Impact, sans-serif',
    castoro: '"Castoro Titling", Georgia, serif',
    poltawski: '"Poltawski Nowy", Georgia, serif',
    vina: '"Vina Sans", Impact, sans-serif',
    exo2: '"Exo 2", Arial, sans-serif',
    inconsolata: 'Inconsolata, Consolas, monospace',
    script: '"Dancing Script", cursive',
    sans: '"Noto Sans", "Segoe UI", sans-serif',
    serif: "Georgia, 'Times New Roman', serif",
    mono: 'Consolas, "Courier New", monospace',
    display: '"UnifrakturMaguntia", Georgia, serif',
    arial: "Arial, Helvetica, sans-serif",
    verdana: "Verdana, Geneva, sans-serif",
    trebuchet: '"Trebuchet MS", "Segoe UI", sans-serif',
    tahoma: 'Tahoma, "Segoe UI", sans-serif',
    helvetica: "Helvetica, Arial, sans-serif",
    roboto: '"Roboto", Arial, sans-serif',
    opensans: '"Open Sans", Arial, sans-serif',
    lato: '"Lato", Arial, sans-serif',
    montserrat: '"Montserrat", Arial, sans-serif',
    poppins: '"Poppins", Arial, sans-serif',
    nunito: '"Nunito", Arial, sans-serif',
    rubik: '"Rubik", Arial, sans-serif',
    ubuntu: '"Ubuntu", Arial, sans-serif',
    inter: '"Inter", Arial, sans-serif',
    georgia: "Georgia, serif",
    times: '"Times New Roman", Times, serif',
    playfair: '"Playfair Display", Georgia, serif',
    merriweather: '"Merriweather", Georgia, serif',
    crimson: '"Crimson Text", Georgia, serif',
    libre: '"Libre Baskerville", Georgia, serif',
    courier: '"Courier New", Courier, monospace',
    sourcecode: '"Source Code Pro", Consolas, monospace',
    impact: "Impact, Haettenschweiler, sans-serif",
    oswald: '"Oswald", Impact, sans-serif',
    bebas: '"Bebas Neue", Impact, sans-serif',
    anton: '"Anton", Impact, sans-serif',
    comic: '"Comic Sans MS", "Comic Sans", cursive',
    pacifico: '"Pacifico", cursive',
    dancing: '"Dancing Script", cursive',
    greatvibes: '"Great Vibes", cursive',
  };
  var QUOTE_DEFAULT_FOOTER = "discord.gg/viniliecaffe";

  function normalizeQuoteHex(raw) {
    var s = String(raw || "").trim();
    var m = s.match(/^#?([0-9a-fA-F]{6})$/);
    return m ? "#" + m[1].toLowerCase() : null;
  }

  function colorsFromQuoteHex(hex) {
    var h = normalizeQuoteHex(hex) || "#070707";
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    var lin = [r, g, b].map(function (c) {
      var v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    var light = lum > 0.55;
    return {
      bg: h,
      fg: light ? "#111111" : "#ffffff",
      muted: light ? "rgba(17,17,17,0.62)" : "rgba(255,255,255,0.7)",
    };
  }

  function mutedFromQuoteFg(hex) {
    var h = normalizeQuoteHex(hex);
    if (!h) return "rgba(255,255,255,0.7)";
    var r = parseInt(h.slice(1, 3), 16);
    var g = parseInt(h.slice(3, 5), 16);
    var b = parseInt(h.slice(5, 7), 16);
    return "rgba(" + r + "," + g + "," + b + ",0.68)";
  }

  function clampQuoteAngle(raw, fallback) {
    var n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return ((Math.round(n) % 360) + 360) % 360;
  }

  function cssQuoteLinearGradient(angleDeg, from, to) {
    var fromHex = normalizeQuoteHex(from) || "#070707";
    var toHex = normalizeQuoteHex(to);
    if (!toHex || toHex === fromHex) return fromHex;
    return "linear-gradient(" + clampQuoteAngle(angleDeg, 135) + "deg, " + fromHex + ", " + toHex + ")";
  }

  function lerpQuoteHex(a, b, t) {
    var A = normalizeQuoteHex(a);
    var B = normalizeQuoteHex(b);
    if (!A || !B) return A || B || "#070707";
    var u = Math.max(0, Math.min(1, Number(t) || 0));
    function ch(hex, i) {
      return parseInt(hex.slice(i, i + 2), 16);
    }
    function mix(x, y) {
      return Math.round(x + (y - x) * u);
    }
    function to(n) {
      return n.toString(16).padStart(2, "0");
    }
    return (
      "#" +
      to(mix(ch(A, 1), ch(B, 1))) +
      to(mix(ch(A, 3), ch(B, 3))) +
      to(mix(ch(A, 5), ch(B, 5)))
    );
  }

  /** Colore fade al bordo cover↔testo (stesso campionamento del canvas). */
  function resolveQuoteFadeEdgeUi(colors, style) {
    var bg = normalizeQuoteHex(colors && colors.bg) || "#070707";
    var to = normalizeQuoteHex(colors && colors.bgGradTo);
    if (!to || to === bg) return bg;
    var vertical = style && String(style.orientation || "") === "vertical";
    var flip = Boolean(style && style.flip);
    // Seam: cover 50% orizz / 42% vert.
    var x = 0.5;
    var y = vertical ? (flip ? 1 - 0.42 : 0.42) : 0.5;
    var angle = clampQuoteAngle(colors && colors.bgGradAngle, 135);
    var rad = ((angle - 90) * Math.PI) / 180;
    var cos = Math.cos(rad);
    var sin = Math.sin(rad);
    var length = Math.abs(cos) + Math.abs(sin);
    var half = Math.max(0.001, length / 2);
    var proj = ((x - 0.5) * cos + (y - 0.5) * sin) / (2 * half) + 0.5;
    return lerpQuoteHex(bg, to, Math.max(0, Math.min(1, proj)));
  }

  function resolveQuoteUiColors(style) {
    var s = normalizeQuoteStyleUi(style);
    var colors =
      s.bg === "custom"
        ? colorsFromQuoteHex(s.bgColor)
        : QUOTE_STYLE_BG[s.bg] || QUOTE_STYLE_BG.black;
    if (s.fgColor) {
      return {
        bg: colors.bg,
        fg: s.fgColor,
        muted: mutedFromQuoteFg(s.fgColor),
        bgGradTo: s.bgGradTo,
        bgGradAngle: s.bgGradAngle,
        fgGradTo: s.fgGradTo,
        fgGradAngle: s.fgGradAngle,
      };
    }
    return {
      bg: colors.bg,
      fg: colors.fg,
      muted: colors.muted,
      bgGradTo: s.bgGradTo,
      bgGradAngle: s.bgGradAngle,
      fgGradTo: s.fgGradTo,
      fgGradAngle: s.fgGradAngle,
    };
  }

  function normalizeQuoteStyleUi(raw) {
    var src = raw && typeof raw === "object" ? raw : {};
    var bg = String(src.bg || "black").toLowerCase();
    var bgColor = normalizeQuoteHex(src.bgColor || src.c || "");
    if (bg === "custom" || (bgColor && bg === "custom")) {
      bg = "custom";
      bgColor = bgColor || "#070707";
    } else if (!QUOTE_STYLE_BG[bg]) {
      bg = "black";
      bgColor = null;
    } else {
      bgColor = null;
    }
    var font = String(src.font || "sans").toLowerCase();
    if (!QUOTE_STYLE_FONTS[font]) font = "sans";
    var orientation =
      String(src.orientation || "horizontal").toLowerCase() === "vertical" ? "vertical" : "horizontal";
    var avatarMode =
      String(src.avatarMode || "dynamic").toLowerCase() === "static" ? "static" : "dynamic";
    var footer = Object.prototype.hasOwnProperty.call(src, "footer")
      ? String(src.footer || "").trim().slice(0, 64)
      : QUOTE_DEFAULT_FOOTER;
    var fadeDepth = Number(src.fadeDepth);
    if (!Number.isFinite(fadeDepth)) fadeDepth = 12;
    fadeDepth = Math.max(0, Math.min(100, Math.round(fadeDepth)));
    var fadeOpacity = Number(src.fadeOpacity);
    if (!Number.isFinite(fadeOpacity)) fadeOpacity = 100;
    fadeOpacity = Math.max(0, Math.min(100, Math.round(fadeOpacity)));
    var fgColor = null;
    if (Object.prototype.hasOwnProperty.call(src, "fgColor") || Object.prototype.hasOwnProperty.call(src, "tc")) {
      fgColor = normalizeQuoteHex(src.fgColor || src.tc || "");
    }
    var bgGradTo = null;
    if (
      Object.prototype.hasOwnProperty.call(src, "bgGradTo") ||
      Object.prototype.hasOwnProperty.call(src, "bg2")
    ) {
      bgGradTo = normalizeQuoteHex(src.bgGradTo || src.bg2 || "");
    }
    var fgGradTo = null;
    if (
      Object.prototype.hasOwnProperty.call(src, "fgGradTo") ||
      Object.prototype.hasOwnProperty.call(src, "fg2")
    ) {
      fgGradTo = normalizeQuoteHex(src.fgGradTo || src.fg2 || "");
    }
    return {
      bg: bg,
      bgColor: bgColor,
      fgColor: fgColor,
      bgGradTo: bgGradTo,
      bgGradAngle: clampQuoteAngle(
        Object.prototype.hasOwnProperty.call(src, "bgGradAngle")
          ? src.bgGradAngle
          : Object.prototype.hasOwnProperty.call(src, "bga")
            ? src.bga
            : 135,
        135
      ),
      fgGradTo: fgGradTo,
      fgGradAngle: clampQuoteAngle(
        Object.prototype.hasOwnProperty.call(src, "fgGradAngle")
          ? src.fgGradAngle
          : Object.prototype.hasOwnProperty.call(src, "fga")
            ? src.fga
            : 90,
        90
      ),
      font: font,
      bold: src.bold !== false,
      flip: src.flip === true,
      orientation: orientation,
      avatarMode: avatarMode,
      footer: footer,
      fadeDepth: fadeDepth,
      fadeOpacity: fadeOpacity,
    };
  }

  function toStaticDiscordMediaUrl(url) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    try {
      var parsed = new URL(raw);
      if (!/(^|\.)discordapp\.(com|net)$/i.test(parsed.hostname) && !/(^|\.)discord\.com$/i.test(parsed.hostname)) {
        return raw;
      }
      parsed.pathname = parsed.pathname.replace(/\.gif$/i, ".png").replace(/\.webp$/i, ".png");
      return parsed.toString();
    } catch (_) {
      return raw.replace(/\.gif(\?|#|$)/i, ".png$1").replace(/\.webp(\?|#|$)/i, ".png$1");
    }
  }

  /** Preferisci .gif per avatar Discord animati (`a_…`) così l’anteprima si muove. */
  function toAnimatedDiscordMediaUrl(url) {
    var raw = String(url || "").trim();
    if (!raw) return "";
    try {
      var parsed = new URL(raw);
      if (!/(^|\.)discordapp\.(com|net)$/i.test(parsed.hostname) && !/(^|\.)discord\.com$/i.test(parsed.hostname)) {
        return raw;
      }
      var path = String(parsed.pathname || "");
      var base = path.split("/").pop() || "";
      var hash = base.replace(/\.[a-z0-9]+$/i, "");
      if (!/^a_/i.test(hash)) return raw;
      parsed.pathname = path.replace(/\.(png|webp|jpg|jpeg)(\?|$)/i, ".gif$2");
      return parsed.toString();
    } catch (_) {
      if (!/\/a_[^/?#]+\./i.test(raw)) return raw;
      return raw.replace(/\.(png|webp|jpg|jpeg)(\?|#|$)/i, ".gif$2");
    }
  }

  function syncQuoteStylePreview(style) {
    var s = normalizeQuoteStyleUi(style);
    var preview = byId("qs-preview");
    if (!preview) return;
    preview.setAttribute("data-qs-bg", s.bg);
    preview.setAttribute("data-qs-font", s.font);
    preview.style.setProperty(
      "--qs-font-family",
      QUOTE_FONT_PREVIEW[s.font] || QUOTE_FONT_PREVIEW.sans
    );
    preview.setAttribute("data-qs-bold", s.bold ? "1" : "0");
    preview.setAttribute("data-qs-flip", s.flip ? "1" : "0");
    preview.setAttribute("data-qs-orient", s.orientation);
    preview.setAttribute("data-qs-avatar", s.avatarMode);
    var colors = resolveQuoteUiColors(s);
    preview.style.setProperty("--qs-bg", colors.bg);
    preview.style.setProperty(
      "--qs-bg-fill",
      colors.bgGradTo
        ? cssQuoteLinearGradient(colors.bgGradAngle, colors.bg, colors.bgGradTo)
        : colors.bg
    );
    preview.style.setProperty("--qs-fade-edge", resolveQuoteFadeEdgeUi(colors, s));
    preview.style.setProperty("--qs-fg", colors.fg);
    preview.style.setProperty(
      "--qs-fg-fill",
      colors.fgGradTo
        ? cssQuoteLinearGradient(colors.fgGradAngle, colors.fg, colors.fgGradTo)
        : colors.fg
    );
    preview.setAttribute("data-qs-fg-grad", colors.fgGradTo ? "1" : "0");
    preview.style.setProperty("--qs-muted", colors.muted);
    preview.style.setProperty("--qs-fade-depth", String(s.fadeDepth) + "%");
    preview.style.setProperty("--qs-fade-opacity", String(s.fadeOpacity / 100));

    var coverUrl =
      String((state.settings && state.settings.botAvatarUrl) || "").trim() ||
      String(state.headerGuildIcon || "").trim() ||
      String((state.overview && state.overview.guild && state.overview.guild.iconUrl) || "").trim();
    if (coverUrl && s.avatarMode === "dynamic") {
      coverUrl = toAnimatedDiscordMediaUrl(coverUrl) || coverUrl;
    } else if (coverUrl && s.avatarMode !== "dynamic") {
      coverUrl = toStaticDiscordMediaUrl(coverUrl);
    }
    if (coverUrl) {
      preview.style.setProperty("--qs-cover", "url(\"" + coverUrl.replace(/"/g, '\\"') + "\")");
    } else {
      preview.style.removeProperty("--qs-cover");
    }

    var userEl = byId("qs-preview-user");
    if (userEl) {
      var botName =
        String((state.settings && (state.settings.botNickname || state.settings.botUsername)) || "").trim() ||
        String(state.headerGuildName || "").trim() ||
        "username";
      userEl.textContent = "@" + botName.replace(/^@+/, "");
    }

    var bodyEl = preview.querySelector(".vc-dash-quote-style__preview-body");
    if (bodyEl) {
      bodyEl.textContent =
        s.orientation === "vertical"
          ? "Anteprima dello stile quote."
          : "Questa è un’anteprima dello stile quote.";
    }

    var wmEl = byId("qs-preview-wm");
    if (wmEl) {
      var ft = String(s.footer || "").trim();
      if (ft) {
        wmEl.textContent = ft;
        wmEl.removeAttribute("hidden");
      } else {
        wmEl.textContent = "";
        wmEl.setAttribute("hidden", "");
      }
    }
  }

  function syncQuoteStyleUiFromInputs() {
    var bgEl = byId("qs-bg");
    var fontEl = byId("qs-font");
    var boldEl = byId("qs-bold");
    var flipEl = byId("qs-flip");
    var vertEl = byId("qs-vertical");
    var dynEl = byId("qs-dynamic");
    var footerEl = byId("qs-footer");
    var depthEl = byId("qs-fade-depth");
    var opacityEl = byId("qs-fade-opacity");
    var depthVal = byId("qs-fade-depth-val");
    var opacityVal = byId("qs-fade-opacity-val");
    var fgColorEl = byId("qs-fg-color");
    var bgGradOn = byId("qs-bg-grad-on");
    var fgGradOn = byId("qs-fg-grad-on");
    var bgGradControls = byId("qs-bg-grad-controls");
    var fgGradControls = byId("qs-fg-grad-controls");
    var bgGradToEl = byId("qs-bg-grad-to");
    var fgGradToEl = byId("qs-fg-grad-to");
    var bgGradAngleEl = byId("qs-bg-grad-angle");
    var fgGradAngleEl = byId("qs-fg-grad-angle");
    var bgGradAngleVal = byId("qs-bg-grad-angle-val");
    var fgGradAngleVal = byId("qs-fg-grad-angle-val");
    var bg = bgEl ? String(bgEl.value || "black") : "black";
    var fgColor = fgColorEl ? normalizeQuoteHex(fgColorEl.value) : null;
    Array.prototype.forEach.call(document.querySelectorAll("button[data-qs-fg]"), function (btn) {
      var key = String(btn.getAttribute("data-qs-fg") || "");
      var active = key === "auto" ? !fgColor : Boolean(fgColor && key.toLowerCase() === fgColor);
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    var bgGradEnabled = Boolean(bgGradOn && bgGradOn.checked);
    var fgGradEnabled = Boolean(fgGradOn && fgGradOn.checked);
    if (bgGradControls) {
      if (bgGradEnabled) bgGradControls.removeAttribute("hidden");
      else bgGradControls.setAttribute("hidden", "");
    }
    if (fgGradControls) {
      if (fgGradEnabled) fgGradControls.removeAttribute("hidden");
      else fgGradControls.setAttribute("hidden", "");
    }
    var bgGradTo = bgGradEnabled
      ? normalizeQuoteHex((bgGradToEl && bgGradToEl.value) || "") ||
        normalizeQuoteHex((byId("qs-bg-grad-hex") && byId("qs-bg-grad-hex").value) || "") ||
        "#3d1f5c"
      : null;
    var fgGradTo = fgGradEnabled
      ? normalizeQuoteHex((fgGradToEl && fgGradToEl.value) || "") ||
        normalizeQuoteHex((byId("qs-fg-grad-hex") && byId("qs-fg-grad-hex").value) || "") ||
        "#f0c27b"
      : null;
    if (bgGradToEl) bgGradToEl.value = bgGradTo || "";
    if (fgGradToEl) fgGradToEl.value = fgGradTo || "";
    var bgGradAngle = clampQuoteAngle(bgGradAngleEl ? bgGradAngleEl.value : 135, 135);
    var fgGradAngle = clampQuoteAngle(fgGradAngleEl ? fgGradAngleEl.value : 90, 90);
    if (bgGradAngleVal) bgGradAngleVal.textContent = String(bgGradAngle) + "°";
    if (fgGradAngleVal) fgGradAngleVal.textContent = String(fgGradAngle) + "°";

    // Con gradiente attivo non evidenziare i solidi (niente “nero + viola” insieme).
    Array.prototype.forEach.call(document.querySelectorAll("button[data-qs-bg]"), function (btn) {
      var active =
        !bgGradTo &&
        bg !== "custom" &&
        String(btn.getAttribute("data-qs-bg") || "") === bg;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    var bgSolid =
      bg === "custom"
        ? normalizeQuoteHex(byId("qs-bg-color") ? byId("qs-bg-color").value : "") || "#070707"
        : (QUOTE_STYLE_BG[bg] && QUOTE_STYLE_BG[bg].bg) || "#070707";
    var bgFromPicker = byId("qs-bg-grad-from-picker");
    var bgFromHex = byId("qs-bg-grad-from-hex");
    if (bgFromPicker) bgFromPicker.value = bgSolid;
    if (bgFromHex && document.activeElement !== bgFromHex) bgFromHex.value = bgSolid;
    var fgSolidForGrad =
      fgColor ||
      resolveQuoteUiColors({
        bg: bg,
        bgColor: byId("qs-bg-color") ? byId("qs-bg-color").value : "",
        fgColor: null,
      }).fg;
    var fgFromPicker = byId("qs-fg-grad-from-picker");
    var fgFromHex = byId("qs-fg-grad-from-hex");
    if (fgFromPicker) fgFromPicker.value = fgSolidForGrad;
    if (fgFromHex && document.activeElement !== fgFromHex) fgFromHex.value = fgSolidForGrad;
    Array.prototype.forEach.call(document.querySelectorAll("button[data-qs-bg-grad]"), function (btn) {
      var raw = String(btn.getAttribute("data-qs-bg-grad") || "");
      var active = false;
      if (raw === "off") active = !bgGradTo;
      else {
        var p = parseQuoteGradPreset(raw);
        active = Boolean(
          p &&
            bgGradTo &&
            p.to === bgGradTo &&
            p.from === bgSolid &&
            p.angle === bgGradAngle
        );
      }
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll("button[data-qs-fg-grad]"), function (btn) {
      var raw = String(btn.getAttribute("data-qs-fg-grad") || "");
      var active = false;
      if (raw === "off") active = !fgGradTo;
      else {
        var p = parseQuoteGradPreset(raw);
        active = Boolean(
          p &&
            fgGradTo &&
            p.to === fgGradTo &&
            p.from === fgSolidForGrad &&
            p.angle === fgGradAngle
        );
      }
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });

    var fadeDepth = depthEl ? Number(depthEl.value) : 12;
    var fadeOpacity = opacityEl ? Number(opacityEl.value) : 100;
    if (depthVal) depthVal.textContent = String(Math.round(fadeDepth)) + "%";
    if (opacityVal) opacityVal.textContent = String(Math.round(fadeOpacity)) + "%";
    syncQuoteStylePreview({
      bg: bg,
      bgColor: byId("qs-bg-color") ? byId("qs-bg-color").value : "",
      fgColor: fgColor,
      bgGradTo: bgGradTo,
      bgGradAngle: bgGradAngle,
      fgGradTo: fgGradTo,
      fgGradAngle: fgGradAngle,
      font: fontEl ? fontEl.value : "sans",
      bold: !boldEl || boldEl.checked,
      flip: Boolean(flipEl && flipEl.checked),
      orientation: vertEl && vertEl.checked ? "vertical" : "horizontal",
      avatarMode: dynEl && dynEl.checked ? "dynamic" : "static",
      footer: footerEl ? footerEl.value : QUOTE_DEFAULT_FOOTER,
      fadeDepth: fadeDepth,
      fadeOpacity: fadeOpacity,
    });
  }

  function setQuoteStyleFgColor(hex, opts) {
    var colorEl = byId("qs-fg-color");
    var picker = byId("qs-fg-picker");
    var hexInput = byId("qs-fg-hex");
    var normalized = hex === null || hex === "" || hex === "auto" ? null : normalizeQuoteHex(hex);
    if (colorEl) colorEl.value = normalized || "";
    var display =
      normalized ||
      resolveQuoteUiColors({
        bg: byId("qs-bg") ? byId("qs-bg").value : "black",
        bgColor: byId("qs-bg-color") ? byId("qs-bg-color").value : "",
        fgColor: null,
      }).fg;
    if (picker) picker.value = display;
    if (hexInput && (!opts || !opts.skipHex)) hexInput.value = display;
    syncQuoteStyleUiFromInputs();
    if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
  }

  function setQuoteStyleCustomColor(hex, opts) {
    var normalized = normalizeQuoteHex(hex);
    if (!normalized) return;
    var bgEl = byId("qs-bg");
    var colorEl = byId("qs-bg-color");
    var picker = byId("qs-bg-picker");
    var hexInput = byId("qs-bg-hex");
    if (bgEl) bgEl.value = "custom";
    if (colorEl) colorEl.value = normalized;
    if (picker) picker.value = normalized;
    if (hexInput && (!opts || !opts.skipHex)) hexInput.value = normalized;
    Array.prototype.forEach.call(document.querySelectorAll("[data-qs-bg]"), function (btn) {
      btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", "false");
    });
    // Se il testo è in automatico, aggiorna il picker testo al fg calcolato
    var fgColorEl = byId("qs-fg-color");
    if (fgColorEl && !normalizeQuoteHex(fgColorEl.value)) {
      var autoFg = colorsFromQuoteHex(normalized).fg;
      var fgPicker = byId("qs-fg-picker");
      var fgHex = byId("qs-fg-hex");
      if (fgPicker) fgPicker.value = autoFg;
      if (fgHex) fgHex.value = autoFg;
    }
    syncQuoteStyleUiFromInputs();
    if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
  }

  function setQuoteGradColor(which, hex, opts) {
    var normalized = normalizeQuoteHex(hex);
    if (!normalized) return;
    var isBg = which === "bg";
    var toEl = byId(isBg ? "qs-bg-grad-to" : "qs-fg-grad-to");
    var picker = byId(isBg ? "qs-bg-grad-picker" : "qs-fg-grad-picker");
    var hexInput = byId(isBg ? "qs-bg-grad-hex" : "qs-fg-grad-hex");
    var onEl = byId(isBg ? "qs-bg-grad-on" : "qs-fg-grad-on");
    if (onEl) onEl.checked = true;
    if (toEl) toEl.value = normalized;
    if (picker) picker.value = normalized;
    if (hexInput && (!opts || !opts.skipHex)) hexInput.value = normalized;
    syncQuoteStyleUiFromInputs();
    if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
  }

  /** Cambia il colore di inizio del gradiente (senza spegnere il gradiente). */
  function setQuoteGradFromColor(which, hex, opts) {
    var normalized = normalizeQuoteHex(hex);
    if (!normalized) return;
    var isBg = which === "bg";
    var onEl = byId(isBg ? "qs-bg-grad-on" : "qs-fg-grad-on");
    if (onEl) onEl.checked = true;
    if (isBg) {
      setQuoteStyleCustomColor(normalized, { autosave: false, skipHex: false });
      var fromPicker = byId("qs-bg-grad-from-picker");
      var fromHex = byId("qs-bg-grad-from-hex");
      if (fromPicker) fromPicker.value = normalized;
      if (fromHex && (!opts || !opts.skipHex)) fromHex.value = normalized;
      // setQuoteStyleCustomColor spegneva i solidi: tieni il gradiente acceso.
      if (onEl) onEl.checked = true;
    } else {
      setQuoteStyleFgColor(normalized, { autosave: false, skipHex: false });
      var fgFromPicker = byId("qs-fg-grad-from-picker");
      var fgFromHex = byId("qs-fg-grad-from-hex");
      if (fgFromPicker) fgFromPicker.value = normalized;
      if (fgFromHex && (!opts || !opts.skipHex)) fgFromHex.value = normalized;
      if (onEl) onEl.checked = true;
    }
    syncQuoteStyleUiFromInputs();
    if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
  }

  function parseQuoteGradPreset(raw) {
    var parts = String(raw || "").split("|");
    if (parts.length < 2) return null;
    var from = normalizeQuoteHex(parts[0]);
    var to = normalizeQuoteHex(parts[1]);
    if (!from || !to) return null;
    return {
      from: from,
      to: to,
      angle: clampQuoteAngle(parts[2], 135),
    };
  }

  function applyQuoteBgGradPreset(spec, opts) {
    if (!spec || spec === "off") {
      var bgOn = byId("qs-bg-grad-on");
      var bgTo = byId("qs-bg-grad-to");
      if (bgOn) bgOn.checked = false;
      if (bgTo) bgTo.value = "";
      syncQuoteStyleUiFromInputs();
      if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
      return;
    }
    var parsed = typeof spec === "string" ? parseQuoteGradPreset(spec) : spec;
    if (!parsed) return;
    var matchedKey = null;
    Object.keys(QUOTE_STYLE_BG).forEach(function (key) {
      if (QUOTE_STYLE_BG[key] && QUOTE_STYLE_BG[key].bg === parsed.from) matchedKey = key;
    });
    if (matchedKey) {
      var bgEl = byId("qs-bg");
      var colorEl = byId("qs-bg-color");
      var picker = byId("qs-bg-picker");
      var hexInput = byId("qs-bg-hex");
      if (bgEl) bgEl.value = matchedKey;
      if (colorEl) colorEl.value = "";
      if (picker) picker.value = parsed.from;
      if (hexInput) hexInput.value = parsed.from;
    } else {
      setQuoteStyleCustomColor(parsed.from, { autosave: false });
    }
    var onEl = byId("qs-bg-grad-on");
    var toEl = byId("qs-bg-grad-to");
    var gPicker = byId("qs-bg-grad-picker");
    var gHex = byId("qs-bg-grad-hex");
    var angleEl = byId("qs-bg-grad-angle");
    if (onEl) onEl.checked = true;
    if (toEl) toEl.value = parsed.to;
    if (gPicker) gPicker.value = parsed.to;
    if (gHex) gHex.value = parsed.to;
    if (angleEl) angleEl.value = String(parsed.angle);
    var fromPicker = byId("qs-bg-grad-from-picker");
    var fromHex = byId("qs-bg-grad-from-hex");
    if (fromPicker) fromPicker.value = parsed.from;
    if (fromHex) fromHex.value = parsed.from;
    syncQuoteStyleUiFromInputs();
    if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
  }

  function applyQuoteFgGradPreset(spec, opts) {
    if (!spec || spec === "off") {
      var fgOn = byId("qs-fg-grad-on");
      var fgTo = byId("qs-fg-grad-to");
      if (fgOn) fgOn.checked = false;
      if (fgTo) fgTo.value = "";
      syncQuoteStyleUiFromInputs();
      if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
      return;
    }
    var parsed = typeof spec === "string" ? parseQuoteGradPreset(spec) : spec;
    if (!parsed) return;
    setQuoteStyleFgColor(parsed.from, { autosave: false });
    var onEl = byId("qs-fg-grad-on");
    var toEl = byId("qs-fg-grad-to");
    var gPicker = byId("qs-fg-grad-picker");
    var gHex = byId("qs-fg-grad-hex");
    var angleEl = byId("qs-fg-grad-angle");
    if (onEl) onEl.checked = true;
    if (toEl) toEl.value = parsed.to;
    if (gPicker) gPicker.value = parsed.to;
    if (gHex) gHex.value = parsed.to;
    if (angleEl) angleEl.value = String(parsed.angle);
    var fgFromPicker = byId("qs-fg-grad-from-picker");
    var fgFromHexEl = byId("qs-fg-grad-from-hex");
    if (fgFromPicker) fgFromPicker.value = parsed.from;
    if (fgFromHexEl) fgFromHexEl.value = parsed.from;
    syncQuoteStyleUiFromInputs();
    if (!opts || opts.autosave !== false) scheduleBachecaStyleAutosave(0);
  }

  function fillQuoteStyleForm(settings) {
    var boards = settings && settings.boards && typeof settings.boards === "object" ? settings.boards : {};
    var s = normalizeQuoteStyleUi(boards.quoteStyle);
    var bgEl = byId("qs-bg");
    var colorEl = byId("qs-bg-color");
    var picker = byId("qs-bg-picker");
    var hexInput = byId("qs-bg-hex");
    var fontEl = byId("qs-font");
    var boldEl = byId("qs-bold");
    var flipEl = byId("qs-flip");
    var vertEl = byId("qs-vertical");
    var dynEl = byId("qs-dynamic");
    var footerEl = byId("qs-footer");
    var depthEl = byId("qs-fade-depth");
    var opacityEl = byId("qs-fade-opacity");
    if (bgEl) bgEl.value = s.bg;
    if (colorEl) colorEl.value = s.bg === "custom" ? s.bgColor || "#070707" : "";
    var previewHex =
      s.bg === "custom"
        ? s.bgColor || "#070707"
        : (QUOTE_STYLE_BG[s.bg] && QUOTE_STYLE_BG[s.bg].bg) || "#070707";
    if (picker) picker.value = previewHex;
    if (hexInput) hexInput.value = previewHex;
    if (fontEl) {
      fontEl.value = s.font;
      refreshDashFancySelect(fontEl);
    }
    if (boldEl) boldEl.checked = s.bold;
    if (flipEl) flipEl.checked = s.flip;
    if (vertEl) vertEl.checked = s.orientation === "vertical";
    if (dynEl) dynEl.checked = s.avatarMode === "dynamic";
    if (footerEl) footerEl.value = s.footer;
    if (depthEl) depthEl.value = String(s.fadeDepth);
    if (opacityEl) opacityEl.value = String(s.fadeOpacity);
    var fgColorEl = byId("qs-fg-color");
    var fgPicker = byId("qs-fg-picker");
    var fgHex = byId("qs-fg-hex");
    if (fgColorEl) fgColorEl.value = s.fgColor || "";
    var fgDisplay =
      s.fgColor ||
      resolveQuoteUiColors({ bg: s.bg, bgColor: s.bgColor, fgColor: null }).fg;
    if (fgPicker) fgPicker.value = fgDisplay;
    if (fgHex) fgHex.value = fgDisplay;

    var bgGradOn = byId("qs-bg-grad-on");
    var fgGradOn = byId("qs-fg-grad-on");
    var bgGradToEl = byId("qs-bg-grad-to");
    var fgGradToEl = byId("qs-fg-grad-to");
    var bgGradPicker = byId("qs-bg-grad-picker");
    var bgGradHex = byId("qs-bg-grad-hex");
    var fgGradPicker = byId("qs-fg-grad-picker");
    var fgGradHex = byId("qs-fg-grad-hex");
    var bgGradAngleEl = byId("qs-bg-grad-angle");
    var fgGradAngleEl = byId("qs-fg-grad-angle");
    var bgGradTo = s.bgGradTo || null;
    var fgGradTo = s.fgGradTo || null;
    if (bgGradOn) bgGradOn.checked = Boolean(bgGradTo);
    if (fgGradOn) fgGradOn.checked = Boolean(fgGradTo);
    if (bgGradToEl) bgGradToEl.value = bgGradTo || "";
    if (fgGradToEl) fgGradToEl.value = fgGradTo || "";
    var bgGradDisplay = bgGradTo || "#3d1f5c";
    var fgGradDisplay = fgGradTo || "#f0c27b";
    if (bgGradPicker) bgGradPicker.value = bgGradDisplay;
    if (bgGradHex) bgGradHex.value = bgGradDisplay;
    if (fgGradPicker) fgGradPicker.value = fgGradDisplay;
    if (fgGradHex) fgGradHex.value = fgGradDisplay;
    var bgFromPicker = byId("qs-bg-grad-from-picker");
    var bgFromHex = byId("qs-bg-grad-from-hex");
    var fgFromPicker = byId("qs-fg-grad-from-picker");
    var fgFromHex = byId("qs-fg-grad-from-hex");
    var bgFromDisplay =
      s.bg === "custom"
        ? normalizeQuoteHex(s.bgColor) || "#070707"
        : (QUOTE_STYLE_BG[s.bg] && QUOTE_STYLE_BG[s.bg].bg) || "#070707";
    if (bgFromPicker) bgFromPicker.value = bgFromDisplay;
    if (bgFromHex) bgFromHex.value = bgFromDisplay;
    if (fgFromPicker) fgFromPicker.value = fgDisplay;
    if (fgFromHex) fgFromHex.value = fgDisplay;
    if (bgGradAngleEl) bgGradAngleEl.value = String(s.bgGradAngle);
    if (fgGradAngleEl) fgGradAngleEl.value = String(s.fgGradAngle);

    var locked = false;
    [
      "qs-font",
      "qs-bold",
      "qs-flip",
      "qs-vertical",
      "qs-dynamic",
      "qs-footer",
      "qs-bg-picker",
      "qs-bg-hex",
      "qs-fg-picker",
      "qs-fg-hex",
      "qs-fg-auto",
      "qs-fade-depth",
      "qs-fade-opacity",
      "qs-bg-grad-on",
      "qs-fg-grad-on",
      "qs-bg-grad-picker",
      "qs-bg-grad-hex",
      "qs-bg-grad-from-picker",
      "qs-bg-grad-from-hex",
      "qs-fg-grad-picker",
      "qs-fg-grad-hex",
      "qs-fg-grad-from-picker",
      "qs-fg-grad-from-hex",
      "qs-bg-grad-angle",
      "qs-fg-grad-angle",
    ].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.disabled = locked;
      el.setAttribute("aria-disabled", locked ? "true" : "false");
    });
    Array.prototype.forEach.call(document.querySelectorAll("[data-qs-bg], [data-qs-fg]"), function (btn) {
      btn.disabled = locked;
      btn.setAttribute("aria-disabled", locked ? "true" : "false");
    });
    syncQuoteStyleUiFromInputs();
  }

  function readQuoteStyleFromForm() {
    var bgEl = byId("qs-bg");
    var colorEl = byId("qs-bg-color");
    var fgColorEl = byId("qs-fg-color");
    var fontEl = byId("qs-font");
    var boldEl = byId("qs-bold");
    var flipEl = byId("qs-flip");
    var vertEl = byId("qs-vertical");
    var dynEl = byId("qs-dynamic");
    var footerEl = byId("qs-footer");
    var depthEl = byId("qs-fade-depth");
    var opacityEl = byId("qs-fade-opacity");
    var bgGradOn = byId("qs-bg-grad-on");
    var fgGradOn = byId("qs-fg-grad-on");
    var bgGradToEl = byId("qs-bg-grad-to");
    var fgGradToEl = byId("qs-fg-grad-to");
    var bgGradAngleEl = byId("qs-bg-grad-angle");
    var fgGradAngleEl = byId("qs-fg-grad-angle");
    return normalizeQuoteStyleUi({
      bg: bgEl ? bgEl.value : "black",
      bgColor: colorEl ? colorEl.value : "",
      fgColor: fgColorEl ? fgColorEl.value : "",
      bgGradTo: bgGradOn && bgGradOn.checked ? (bgGradToEl && bgGradToEl.value) || "" : null,
      bgGradAngle: bgGradAngleEl ? bgGradAngleEl.value : 135,
      fgGradTo: fgGradOn && fgGradOn.checked ? (fgGradToEl && fgGradToEl.value) || "" : null,
      fgGradAngle: fgGradAngleEl ? fgGradAngleEl.value : 90,
      font: fontEl ? fontEl.value : "sans",
      bold: !boldEl || boldEl.checked,
      flip: Boolean(flipEl && flipEl.checked),
      orientation: vertEl && vertEl.checked ? "vertical" : "horizontal",
      avatarMode: dynEl && dynEl.checked ? "dynamic" : "static",
      footer: footerEl ? footerEl.value : QUOTE_DEFAULT_FOOTER,
      fadeDepth: depthEl ? depthEl.value : 12,
      fadeOpacity: opacityEl ? opacityEl.value : 100,
    });
  }

  function setBachecaMode(mode, opts) {
    var next = String(mode || "shared") === "split" ? "split" : "shared";
    var modeEl = byId("bc-boardsMode");
    if (modeEl) modeEl.value = next;
    syncBachecaModeUi();
    if (!opts || opts.autosave !== false) scheduleBachecaAutosave(0);
  }

  function fillBachecaForm(settings, pickers, opts) {
    var options = opts || {};
    var s = settings || {};
    var boards = s.boards && typeof s.boards === "object" ? s.boards : {};
    var mode = String(boards.mode || "shared") === "split" ? "split" : "shared";
    var modeEl = byId("bc-boardsMode");
    if (modeEl) {
      // UI unificata: salviamo sempre in split; shared legacy → stesso canale su ogni select.
      modeEl.value = "split";
      refreshDashFancySelect(modeEl);
    }
    var text = (pickers && pickers.textChannels) || (state.settingsPickers && state.settingsPickers.textChannels) || [];
    var locked = state.settingsProtectedGuild === true;
    var sharedId = boards.sharedChannelId || "";
    var quoteId = boards.quoteChannelId || (mode === "shared" ? sharedId : "") || "";
    var repostId = boards.repostChannelId || (mode === "shared" ? sharedId : "") || "";
    var clipId = boards.clipChannelId || (mode === "shared" ? sharedId : "") || "";
    var skullId = boards.skullChannelId || (mode === "shared" ? sharedId : "") || "";
    fillSelect(byId("bc-sharedChannelId"), text, sharedId || quoteId || "", i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("bc-quoteChannelId"), text, quoteId || sharedId || "", i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("bc-repostChannelId"), text, repostId || sharedId || "", i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("bc-clipChannelId"), text, clipId || sharedId || "", i18n("dash.none", "— Nessuno —"));
    fillSelect(byId("bc-skullChannelId"), text, skullId || sharedId || "", i18n("dash.none", "— Nessuno —"));
    ["bc-boardsMode", "bc-sharedChannelId", "bc-quoteChannelId", "bc-repostChannelId", "bc-clipChannelId", "bc-skullChannelId"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.disabled = locked;
      el.setAttribute("aria-disabled", locked ? "true" : "false");
    });
    syncBachecaModeUi();
    syncBachecaModuleUi(s);
    fillBachecaFeaturesForm(s);
    if (options.skipStyle !== true) fillQuoteStyleForm(s);
  }

  function flushPendingSettingsSaves() {
    if (state.settingsSaving) return;
    if (state.bachecaAutosavePending) {
      state.bachecaAutosavePending = false;
      scheduleBachecaAutosave(BACHECA_AUTOSAVE_MS);
      return;
    }
    if (state.bachecaFeaturesAutosavePending) {
      state.bachecaFeaturesAutosavePending = false;
      scheduleBachecaFeaturesAutosave(BACHECA_AUTOSAVE_MS);
      return;
    }
    if (state.bachecaStyleAutosavePending) {
      state.bachecaStyleAutosavePending = false;
      scheduleBachecaStyleAutosave(BACHECA_STYLE_AUTOSAVE_MS);
      return;
    }
    if (state.settingsAutosavePending) {
      state.settingsAutosavePending = false;
      scheduleSettingsAutosave(0);
    }
  }

  function buildBachecaPatchFromForm() {
    var quoteEl = byId("bc-quoteChannelId");
    var repostEl = byId("bc-repostChannelId");
    var clipEl = byId("bc-clipChannelId");
    var skullEl = byId("bc-skullChannelId");
    var quoteId = quoteEl ? quoteEl.value || null : null;
    var repostId = repostEl ? repostEl.value || null : null;
    var clipId = clipEl ? clipEl.value || null : null;
    var skullId = skullEl ? skullEl.value || null : null;
    // Compatibilità: shared = primo canale valorizzato (quote → repost → clip → skull).
    var sharedId = quoteId || repostId || clipId || skullId || null;
    var sharedEl = byId("bc-sharedChannelId");
    if (sharedEl) sharedEl.value = sharedId || "";
    var modeEl = byId("bc-boardsMode");
    if (modeEl) modeEl.value = "split";
    return {
      boards: {
        enabled: isBachecaEnabledFromSettings(state.settings),
        mode: "split",
        sharedChannelId: sharedId,
        quoteChannelId: quoteId,
        repostChannelId: repostId,
        clipChannelId: clipId,
        skullChannelId: skullId,
      },
    };
  }

  async function saveBacheca(opts) {
    var options = opts || {};
    var silent = options.silent === true;
    if (!canUseGuildSettings() || !state.guildId) return;
    if (state.settingsProtectedGuild === true) return;
    if (state.settingsSaving) {
      state.bachecaAutosavePending = true;
      return;
    }
    var token = getToken();
    if (!token) return;
    state.settingsSaving = true;
    var seq = ++state.bachecaSaveSeq;
    if (silent) {
      showSaveToast(i18n("dash.savingShort", "Salvataggio…"), false, { pending: true });
    }
    try {
      var res = await fetch(resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/settings", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildBachecaPatchFromForm()),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (seq !== state.bachecaSaveSeq) return;
      if (!res.ok || !data || data.ok === false) {
        if (!silent) {
          showSaveToast((data && data.message) || i18n("dash.boards.errSave", "Salvataggio bacheca non riuscito."), true);
        } else {
          showSaveToast((data && data.message) || i18n("dash.boards.errSave", "Salvataggio bacheca non riuscito."), true);
        }
        return;
      }
      state.settings = data.settings;
      state.settingsPickers = data.pickers || state.settingsPickers;
      // Autosave: non rifare fill (riporta indietro canali/stile se l’utente sta ancora modificando).
      if (silent) {
        syncBachecaModuleUi(state.settings);
      } else if (data.settings && data.settings.boards && typeof data.settings.boards === "object") {
        fillBachecaForm(data.settings, data.pickers || state.settingsPickers, { skipStyle: true });
      } else {
        syncBachecaModuleUi(state.settings);
      }
      showSaveToast(i18n("dash.boards.saved", "Bacheca salvata."), false);
    } catch (e) {
      if (seq !== state.bachecaSaveSeq) return;
      showSaveToast(i18n("dash.boards.errNetwork", "Errore di rete durante il salvataggio bacheca."), true);
    } finally {
      if (seq === state.bachecaSaveSeq) {
        state.settingsSaving = false;
        flushPendingSettingsSaves();
      }
    }
  }

  function scheduleBachecaAutosave(delayMs) {
    if (!canUseGuildSettings() || state.settingsProtectedGuild === true) return;
    if (state.settingsSaving) {
      state.bachecaAutosavePending = true;
      return;
    }
    if (state.bachecaAutosaveTimer) clearTimeout(state.bachecaAutosaveTimer);
    var wait = typeof delayMs === "number" ? Math.max(0, delayMs) : BACHECA_AUTOSAVE_MS;
    if (wait < 200) wait = BACHECA_AUTOSAVE_MS;
    state.bachecaAutosaveTimer = setTimeout(function () {
      state.bachecaAutosaveTimer = null;
      saveBacheca({ silent: true });
    }, wait);
  }

  async function setBachecaEnabled(enabled, opts) {
    var options = opts || {};
    if (!canUseGuildSettings() || !state.guildId) return false;
    if (state.settingsProtectedGuild === true) return false;
    var next = enabled !== false;
    if (!state.settings || typeof state.settings !== "object") state.settings = {};
    if (!state.settings.boards || typeof state.settings.boards !== "object") {
      state.settings.boards = {};
    }
    var prev = state.settings.boards.enabled !== false;
    state.settings.boards.enabled = next;
    syncBachecaModuleUi(state.settings);

    var token = getToken();
    if (!token) {
      state.settings.boards.enabled = prev;
      syncBachecaModuleUi(state.settings);
      return false;
    }

    // Evita race col autosave canali.
    if (state.bachecaAutosaveTimer) {
      clearTimeout(state.bachecaAutosaveTimer);
      state.bachecaAutosaveTimer = null;
    }
    while (state.settingsSaving) {
      await new Promise(function (r) {
        setTimeout(r, 40);
      });
    }

    state.settingsSaving = true;
    try {
      var res = await fetch(resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/settings", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ boards: { enabled: next } }),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (!res.ok || !data || data.ok === false) {
        state.settings.boards.enabled = prev;
        syncBachecaModuleUi(state.settings);
        if (!options.silent) {
          showSaveToast((data && data.message) || i18n("dash.boards.errSave", "Salvataggio bacheca non riuscito."), true);
        }
        return false;
      }
      state.settings = data.settings;
      state.settingsPickers = data.pickers || state.settingsPickers;
      if (data.settings && data.settings.boards && typeof data.settings.boards === "object") {
        fillBachecaForm(data.settings, data.pickers || state.settingsPickers, { skipStyle: true });
      } else {
        syncBachecaModuleUi(state.settings);
      }
      if (!options.silent) {
        showSaveToast(
          next
            ? i18n("dash.boards.enabledOn", "Bacheca attivata.")
            : i18n("dash.boards.enabledOff", "Bacheca disattivata."),
          false,
        );
      }
      return true;
    } catch (e) {
      state.settings.boards.enabled = prev;
      syncBachecaModuleUi(state.settings);
      if (!options.silent) {
        showSaveToast(i18n("dash.boards.errNetwork", "Errore di rete durante il salvataggio bacheca."), true);
      }
      return false;
    } finally {
      state.settingsSaving = false;
      flushPendingSettingsSaves();
    }
  }

  function wireBachecaForm() {
    var form = byId("vc-dashboard-bacheca-form");
    if (!form || form.__vcBachecaWired) return;
    form.__vcBachecaWired = true;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
    });
    form.addEventListener("change", function (ev) {
      var t = ev && ev.target;
      if (!t) return;
      if (t.id === "bc-boardsMode") syncBachecaModeUi();
      scheduleBachecaAutosave(0);
    });
    form.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-bc-mode]") : null;
      if (!btn || !form.contains(btn)) return;
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
      ev.preventDefault();
      setBachecaMode(btn.getAttribute("data-bc-mode"));
    });
  }

  async function saveBachecaStyle(opts) {
    var options = opts || {};
    var silent = options.silent === true;
    if (!canUseGuildSettings() || !state.guildId) return;
    if (!isPremiumActive()) {
      if (!silent) {
        showSaveToast(
          i18n(
            "dash.premium.requiredQuoteStyle",
            "La personalizzazione quote richiede Vinili Premium.",
          ),
          true,
        );
      }
      return;
    }
    if (state.settingsSaving) {
      state.bachecaStyleAutosavePending = true;
      return;
    }
    var token = getToken();
    if (!token) return;
    state.settingsSaving = true;
    var seq = ++state.bachecaStyleSaveSeq;
    if (silent) {
      showSaveToast(i18n("dash.savingShort", "Salvataggio…"), false, { pending: true });
    }
    try {
      var res = await fetch(resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/settings", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ boards: { quoteStyle: readQuoteStyleFromForm() } }),
      });
      var data = await res.json().catch(function () {
        return null;
      });
      if (seq !== state.bachecaStyleSaveSeq) return;
      if (!res.ok || !data || data.ok === false) {
        if (data && data.error === "premium_required") {
          setPremiumFromApi({ premium: { active: false } });
          applyPremiumUi();
        }
        showSaveToast(
          (data && data.message) || i18n("dash.boards.styleErrSave", "Salvataggio stile quote non riuscito."),
          true,
        );
        return;
      }
      state.settings = data.settings;
      state.settingsPickers = data.pickers || state.settingsPickers;
      // Autosave: non rifare fillQuoteStyleForm (snap-back su slider/colori).
      if (silent) {
        syncBachecaModuleUi(data.settings);
      } else if (data.settings && data.settings.boards && typeof data.settings.boards === "object") {
        fillQuoteStyleForm(data.settings);
        syncBachecaModuleUi(data.settings);
      }
      showSaveToast(i18n("dash.boards.styleSaved", "Stile quote salvato."), false);
    } catch (e) {
      if (seq !== state.bachecaStyleSaveSeq) return;
      showSaveToast(
        i18n("dash.boards.styleErrNetwork", "Errore di rete durante il salvataggio stile quote."),
        true,
      );
    } finally {
      if (seq === state.bachecaStyleSaveSeq) {
        state.settingsSaving = false;
        flushPendingSettingsSaves();
      }
    }
  }

  function scheduleBachecaStyleAutosave(delayMs) {
    if (!canUseGuildSettings()) return;
    if (!isPremiumActive()) return;
    if (state.settingsSaving) {
      state.bachecaStyleAutosavePending = true;
      return;
    }
    if (state.bachecaStyleAutosaveTimer) clearTimeout(state.bachecaStyleAutosaveTimer);
    var wait = typeof delayMs === "number" ? Math.max(0, delayMs) : BACHECA_STYLE_AUTOSAVE_MS;
    if (wait < 300) wait = BACHECA_STYLE_AUTOSAVE_MS;
    state.bachecaStyleAutosaveTimer = setTimeout(function () {
      state.bachecaStyleAutosaveTimer = null;
      saveBachecaStyle({ silent: true });
    }, wait);
  }

  function setQuoteStyleTab(tabId) {
    var next =
      tabId === "font" ||
      tabId === "opzioni" ||
      tabId === "sfocatura" ||
      tabId === "footer" ||
      tabId === "colore"
        ? tabId
        : "colore";
    var root = byId("vc-dashboard-bacheca-style-form") || document;
    Array.prototype.forEach.call(root.querySelectorAll("[data-qs-tab]"), function (btn) {
      var active = String(btn.getAttribute("data-qs-tab") || "") === next;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
      btn.tabIndex = active ? 0 : -1;
    });
    Array.prototype.forEach.call(root.querySelectorAll("[data-qs-panel]"), function (panel) {
      var show = String(panel.getAttribute("data-qs-panel") || "") === next;
      if (show) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    });
  }

  function wireBachecaStyleForm() {
    var form = byId("vc-dashboard-bacheca-style-form");
    if (!form || form.__vcBachecaStyleWired) return;
    form.__vcBachecaStyleWired = true;
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
    });
    form.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t && (t.id === "qs-bg-picker" || t.id === "qs-bg-hex")) {
        setQuoteStyleCustomColor(t.value);
        return;
      }
      if (t && (t.id === "qs-fg-picker" || t.id === "qs-fg-hex")) {
        setQuoteStyleFgColor(t.value);
        return;
      }
      if (t && (t.id === "qs-bg-grad-on" || t.id === "qs-fg-grad-on")) {
        if (t.id === "qs-bg-grad-on" && t.checked) {
          var bgTo = byId("qs-bg-grad-to");
          var bgHex = byId("qs-bg-grad-hex");
          var bgPick = byId("qs-bg-grad-picker");
          var nextBg =
            normalizeQuoteHex((bgTo && bgTo.value) || "") ||
            normalizeQuoteHex((bgHex && bgHex.value) || "") ||
            "#3d1f5c";
          if (bgTo) bgTo.value = nextBg;
          if (bgHex) bgHex.value = nextBg;
          if (bgPick) bgPick.value = nextBg;
        }
        if (t.id === "qs-fg-grad-on" && t.checked) {
          var fgTo = byId("qs-fg-grad-to");
          var fgHex = byId("qs-fg-grad-hex");
          var fgPick = byId("qs-fg-grad-picker");
          var nextFg =
            normalizeQuoteHex((fgTo && fgTo.value) || "") ||
            normalizeQuoteHex((fgHex && fgHex.value) || "") ||
            "#f0c27b";
          if (fgTo) fgTo.value = nextFg;
          if (fgHex) fgHex.value = nextFg;
          if (fgPick) fgPick.value = nextFg;
        }
        syncQuoteStyleUiFromInputs();
        scheduleBachecaStyleAutosave(0);
        return;
      }
      if (
        t &&
        (t.id === "qs-bg-grad-picker" ||
          t.id === "qs-bg-grad-hex" ||
          t.id === "qs-fg-grad-picker" ||
          t.id === "qs-fg-grad-hex")
      ) {
        setQuoteGradColor(t.id.indexOf("bg-") >= 0 ? "bg" : "fg", t.value);
        return;
      }
      syncQuoteStyleUiFromInputs();
      scheduleBachecaStyleAutosave(BACHECA_STYLE_AUTOSAVE_MS);
    });
    form.addEventListener("input", function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.id === "qs-bg-picker") {
        setQuoteStyleCustomColor(t.value, { autosave: false });
        return;
      }
      if (t.id === "qs-bg-hex") {
        var hx = normalizeQuoteHex(t.value);
        if (hx) setQuoteStyleCustomColor(hx, { skipHex: true, autosave: false });
        return;
      }
      if (t.id === "qs-fg-picker") {
        setQuoteStyleFgColor(t.value, { autosave: false });
        return;
      }
      if (t.id === "qs-fg-hex") {
        var fghx = normalizeQuoteHex(t.value);
        if (fghx) setQuoteStyleFgColor(fghx, { skipHex: true, autosave: false });
        return;
      }
      if (t.id === "qs-bg-grad-picker" || t.id === "qs-fg-grad-picker") {
        setQuoteGradColor(t.id.indexOf("bg-") >= 0 ? "bg" : "fg", t.value, { autosave: false });
        return;
      }
      if (t.id === "qs-bg-grad-from-picker" || t.id === "qs-fg-grad-from-picker") {
        setQuoteGradFromColor(t.id.indexOf("bg-") >= 0 ? "bg" : "fg", t.value, { autosave: false });
        return;
      }
      if (t.id === "qs-bg-grad-hex" || t.id === "qs-fg-grad-hex") {
        var ghx = normalizeQuoteHex(t.value);
        if (ghx) {
          setQuoteGradColor(t.id.indexOf("bg-") >= 0 ? "bg" : "fg", ghx, {
            skipHex: true,
            autosave: false,
          });
        }
        return;
      }
      if (t.id === "qs-bg-grad-from-hex" || t.id === "qs-fg-grad-from-hex") {
        var gfhx = normalizeQuoteHex(t.value);
        if (gfhx) {
          setQuoteGradFromColor(t.id.indexOf("bg-") >= 0 ? "bg" : "fg", gfhx, {
            skipHex: true,
            autosave: false,
          });
        }
        return;
      }
      if (
        t.id === "qs-footer" ||
        t.id === "qs-fade-depth" ||
        t.id === "qs-fade-opacity" ||
        t.id === "qs-bg-grad-angle" ||
        t.id === "qs-fg-grad-angle"
      ) {
        syncQuoteStyleUiFromInputs();
        scheduleBachecaStyleAutosave(BACHECA_STYLE_AUTOSAVE_MS);
      }
    });
    form.addEventListener("click", function (ev) {
      var tabBtn = ev.target && ev.target.closest ? ev.target.closest("[data-qs-tab]") : null;
      if (tabBtn && form.contains(tabBtn)) {
        ev.preventDefault();
        setQuoteStyleTab(String(tabBtn.getAttribute("data-qs-tab") || "colore"));
        return;
      }
      var autoBtn = ev.target && ev.target.closest ? ev.target.closest("#qs-fg-auto") : null;
      if (autoBtn && form.contains(autoBtn)) {
        ev.preventDefault();
        setQuoteStyleFgColor("auto");
        return;
      }
      var fgBtn = ev.target && ev.target.closest ? ev.target.closest("[data-qs-fg]") : null;
      if (fgBtn && form.contains(fgBtn)) {
        if (fgBtn.disabled || fgBtn.getAttribute("aria-disabled") === "true") return;
        ev.preventDefault();
        setQuoteStyleFgColor(String(fgBtn.getAttribute("data-qs-fg") || "auto"));
        return;
      }
      var bgGradBtn = ev.target && ev.target.closest ? ev.target.closest("[data-qs-bg-grad]") : null;
      if (bgGradBtn && form.contains(bgGradBtn)) {
        ev.preventDefault();
        applyQuoteBgGradPreset(String(bgGradBtn.getAttribute("data-qs-bg-grad") || "off"));
        return;
      }
      var fgGradBtn = ev.target && ev.target.closest ? ev.target.closest("[data-qs-fg-grad]") : null;
      if (fgGradBtn && form.contains(fgGradBtn)) {
        ev.preventDefault();
        applyQuoteFgGradPreset(String(fgGradBtn.getAttribute("data-qs-fg-grad") || "off"));
        return;
      }
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-qs-bg]") : null;
      if (!btn || !form.contains(btn)) return;
      if (btn.disabled || btn.getAttribute("aria-disabled") === "true") return;
      ev.preventDefault();
      var bgKey = String(btn.getAttribute("data-qs-bg") || "black");
      var bgEl = byId("qs-bg");
      var colorEl = byId("qs-bg-color");
      var picker = byId("qs-bg-picker");
      var hexInput = byId("qs-bg-hex");
      if (bgEl) bgEl.value = bgKey;
      if (colorEl) colorEl.value = "";
      var presetHex = (QUOTE_STYLE_BG[bgKey] && QUOTE_STYLE_BG[bgKey].bg) || "#070707";
      if (picker) picker.value = presetHex;
      if (hexInput) hexInput.value = presetHex;
      // Scelta solida → spegne il gradiente (una sola selezione attiva).
      var bgGradOn = byId("qs-bg-grad-on");
      var bgGradTo = byId("qs-bg-grad-to");
      if (bgGradOn) bgGradOn.checked = false;
      if (bgGradTo) bgGradTo.value = "";
      var fgColorEl = byId("qs-fg-color");
      if (fgColorEl && !normalizeQuoteHex(fgColorEl.value)) {
        var autoFg = (QUOTE_STYLE_BG[bgKey] && QUOTE_STYLE_BG[bgKey].fg) || "#ffffff";
        var fgPicker = byId("qs-fg-picker");
        var fgHex = byId("qs-fg-hex");
        if (fgPicker) fgPicker.value = autoFg;
        if (fgHex) fgHex.value = autoFg;
      }
      syncQuoteStyleUiFromInputs();
      scheduleBachecaStyleAutosave(0);
    });
    form.addEventListener("keydown", function (ev) {
      var tabBtn = ev.target && ev.target.closest ? ev.target.closest("[data-qs-tab]") : null;
      if (!tabBtn || !form.contains(tabBtn)) return;
      var tabs = Array.prototype.slice.call(form.querySelectorAll("[data-qs-tab]"));
      if (!tabs.length) return;
      var idx = tabs.indexOf(tabBtn);
      if (idx < 0) return;
      var nextIdx = -1;
      if (ev.key === "ArrowRight" || ev.key === "ArrowDown") nextIdx = (idx + 1) % tabs.length;
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowUp") nextIdx = (idx - 1 + tabs.length) % tabs.length;
      else if (ev.key === "Home") nextIdx = 0;
      else if (ev.key === "End") nextIdx = tabs.length - 1;
      if (nextIdx < 0) return;
      ev.preventDefault();
      setQuoteStyleTab(String(tabs[nextIdx].getAttribute("data-qs-tab") || "colore"));
      tabs[nextIdx].focus();
    });
    setQuoteStyleTab("colore");
  }

  function fillSettingsForm(settings, pickers) {
    if (!settings) return;
    if (canUseGuildSettings()) setSettingsNavVisible(true);
    else setSettingsNavVisible(false);
    var prefixEl = byId("gs-prefix");
    if (prefixEl) prefixEl.value = String(settings.prefix || "+");
    state.settingsNickLoaded = normalizeBotNick(settings.botNickname);
    var nickEl = byId("gs-botNickname");
    if (nickEl) {
      nickEl.value = settings.botNickname || "";
      nickEl.placeholder = settings.botUsername || "—";
    }
    setBotUsernameHint(settings.botUsername);
    var preview = byId("gs-botAvatarPreview");
    if (preview) {
      var url = String(settings.botAvatarUrl || "").trim();
      if (url) {
        preview.src = url;
        preview.removeAttribute("hidden");
      } else {
        preview.removeAttribute("src");
      }
    }
    var resetBtn = byId("gs-botAvatarReset");
    if (resetBtn) {
      if (settings.hasGuildAvatar) resetBtn.removeAttribute("hidden");
      else resetBtn.setAttribute("hidden", "");
    }
    setBotBannerPreview(settings.botBannerUrl);
    var resetBannerBtn = byId("gs-botBannerReset");
    if (resetBannerBtn) {
      if (settings.hasGuildBanner) resetBannerBtn.removeAttribute("hidden");
      else resetBannerBtn.setAttribute("hidden", "");
    }
    var channels = (pickers && pickers.textChannels) || [];
    var roles = (pickers && pickers.roles) || [];
    var roleIds = [];
    if (Array.isArray(settings.dashboardRoleIds) && settings.dashboardRoleIds.length) {
      roleIds = settings.dashboardRoleIds.map(String);
    } else if (settings.dashboardRoleId) {
      roleIds = [String(settings.dashboardRoleId)];
    }
    if (pickers) {
      state.settingsPickers = pickers;
      state.pickers = pickers;
    }
    var rolesById = {};
    for (var ri = 0; ri < roles.length; ri++) {
      rolesById[String(roles[ri].id || "")] = roles[ri];
    }
    roleIds = roleIds.filter(function (id) {
      var role = rolesById[String(id)];
      return !role || isDashboardAssignableRole(role);
    });
    setDashboardRoleIds(roleIds, { silent: true });
    fillSelect(
      byId("gs-updatesChannelId"),
      channels,
      settings.updatesChannelId,
      i18n("dash.none", "— Nessuno —"),
    );
    enhanceAllDashFancySelects(byId("vc-dashboard-settings-form") || document);
    applySettingsTenantLocks(settings);
    state.pendingBotAvatar = undefined;
    state.pendingBotBanner = undefined;
    captureSettingsBaseline();
  }

  async function refreshSettingsIdentityFromDiscord() {
    if (!canUseGuildSettings() || !state.guildId || state.settingsSaving) return;
    var token = getToken();
    if (!token) return;
    var nickEl = byId("gs-botNickname");
    var prefixEl = byId("gs-prefix");
    var active = document.activeElement;
    // Non sovrascrivere mentre l’utente sta digitando nick/prefix.
    if (active && (active === nickEl || active === prefixEl)) return;
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/settings",
        token,
        { attempts: 2 },
      );
      var res = out.res;
      var data = out.data;
      if (!res.ok || !data || data.ok === false || !data.settings) return;
      state.settings = data.settings;
      if (data.pickers) state.settingsPickers = data.pickers;
      applyLiveBotIdentity(data.settings);
      if (prefixEl && active !== prefixEl && !isSettingsFormDirty()) {
        prefixEl.value = String(data.settings.prefix || "+");
      }
      if (!isSettingsFormDirty()) captureSettingsBaseline();
      else {
        try {
          var cur = JSON.parse(state.settingsBaseline || "{}");
          cur.botNickname = state.settingsNickLoaded;
          state.settingsBaseline = JSON.stringify(cur);
        } catch (_) {}
      }
    } catch (_) {}
  }

  function stopSettingsIdentityPoll() {
    if (state.settingsIdentityPollTimer) {
      clearInterval(state.settingsIdentityPollTimer);
      state.settingsIdentityPollTimer = null;
    }
  }

  function startSettingsIdentityPoll() {
    stopSettingsIdentityPoll();
    state.settingsIdentityPollTimer = setInterval(function () {
      if (state.view !== "settings") {
        stopSettingsIdentityPoll();
        return;
      }
      refreshSettingsIdentityFromDiscord().catch(function () {});
    }, 4000);
  }

  async function saveSettings(opts) {
    opts = opts || {};
    var silent = opts.silent === true;
    if (state.settingsSaving) return;
    var token = getToken();
    if (!token || !state.guildId) return;
    if (!isSettingsFormDirty()) return;
    state.settingsSaving = true;
    var seq = ++state.settingsSaveSeq;
    if (silent) {
      showSaveToast(i18n("dash.savingShort", "Salvataggio…"), false, { pending: true });
    } else {
      setError("");
      setSuccess("");
    }
    var body = buildSettingsPatchFromForm();
    try {
      var res = await fetch(resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/settings", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (seq !== state.settingsSaveSeq) return;
      if (!res.ok || !data || data.ok === false) {
        if (res.status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
          showLocked();
          return;
        }
        if (data && data.error === "premium_required") {
          setPremiumFromApi({ premium: { active: false } });
          showSaveToast(
            data.message ||
              i18n(
                "dash.premium.requiredIdentity",
                "Nickname, avatar e banner richiedono Vinili Premium.",
              ),
            true,
          );
          return;
        }
        var errMsg = (data && data.message) || i18n("dash.errSave", "Salvataggio non riuscito.");
        if (silent) showSaveToast(errMsg, true);
        else setError(errMsg);
        return;
      }
      state.settings = data.settings;
      state.settingsPickers = data.pickers || state.settingsPickers;
      if (Object.prototype.hasOwnProperty.call(data, "protectedGuild")) {
        state.settingsProtectedGuild = data.protectedGuild === true;
      }
      setPremiumFromApi(data);
      if (silent) {
        state.pendingBotAvatar = undefined;
        state.pendingBotBanner = undefined;
        if (Object.prototype.hasOwnProperty.call(body, "botNickname")) {
          state.settingsNickLoaded = normalizeBotNick(data.settings && data.settings.botNickname);
          var nickElAfter = byId("gs-botNickname");
          if (nickElAfter && data.settings) {
            nickElAfter.value = data.settings.botNickname || "";
          }
        } else {
          applyLiveBotIdentity(data.settings);
        }
        var preview = byId("gs-botAvatarPreview");
        var curSrc = preview ? String(preview.getAttribute("src") || preview.src || "") : "";
        var curIsLocal = /^data:image\//i.test(curSrc);
        if (preview && data.settings && data.settings.botAvatarUrl) {
          var nextUrl = String(data.settings.botAvatarUrl || "").trim();
          // Non sovrascrivere una preview locale con l’avatar globale se Discord non ha ancora
          // (o la cache non ha ancora) il guild avatar.
          if (!curIsLocal || data.settings.hasGuildAvatar) {
            preview.src = nextUrl;
          }
        }
        var resetBtn = byId("gs-botAvatarReset");
        if (resetBtn) {
          if (data.settings && data.settings.hasGuildAvatar) resetBtn.removeAttribute("hidden");
          else if (!curIsLocal) resetBtn.setAttribute("hidden", "");
        }
        var bannerPreview = byId("gs-botBannerPreview");
        var banSrc = bannerPreview ? String(bannerPreview.getAttribute("src") || bannerPreview.src || "") : "";
        var banIsLocal = /^data:image\//i.test(banSrc);
        if (data.settings) {
          if (!banIsLocal || data.settings.hasGuildBanner) {
            setBotBannerPreview(data.settings.botBannerUrl);
          }
        }
        var resetBannerBtn = byId("gs-botBannerReset");
        if (resetBannerBtn) {
          if (data.settings && data.settings.hasGuildBanner) resetBannerBtn.removeAttribute("hidden");
          else if (!banIsLocal) resetBannerBtn.setAttribute("hidden", "");
        }
        applySettingsTenantLocks(data.settings);
        captureSettingsBaseline();
      } else {
        fillSettingsForm(data.settings, state.settingsPickers);
      }
      showSaveToast(i18n("dash.savedShort", "Salvato"), false);
    } catch (e) {
      if (seq !== state.settingsSaveSeq) return;
      if (silent) showSaveToast(i18n("dash.errNetworkSave", "Errore di rete durante il salvataggio."), true);
      else setError(i18n("dash.errNetworkSave", "Errore di rete durante il salvataggio."));
    } finally {
      if (seq === state.settingsSaveSeq) {
        state.settingsSaving = false;
        flushPendingSettingsSaves();
      }
    }
  }

  function ticketTypeLabel(type) {
    var t = String(type || "").toLowerCase();
    if (t === "partnership") return "Partnership";
    if (t === "high" || t === "highstaff") return "High Staff";
    if (t === "perks") return "Perks";
    return "Supporto";
  }

  function syncTicketsModuleCard() {
    var enabled = Boolean(state.tickets && state.tickets.enabled);
    var card = document.querySelector('[data-module="tickets"]');
    if (card) {
      if (enabled) card.classList.add("is-on");
      else card.classList.remove("is-on");
    }
    var sw = document.querySelector('[data-module-switch="tickets"]');
    if (sw && sw.checked !== enabled) sw.checked = enabled;
    var badge = document.querySelector('[data-module-live-badge="tickets"]');
    if (badge) {
      if (enabled) badge.removeAttribute("hidden");
      else badge.setAttribute("hidden", "");
    }
  }

  function msToDhms(ms) {
    var total = Math.max(0, Math.floor(Number(ms) || 0));
    var minutesTotal = Math.floor(total / 60000);
    return {
      d: Math.floor(minutesTotal / (24 * 60)),
      h: Math.floor((minutesTotal % (24 * 60)) / 60),
      m: minutesTotal % 60,
    };
  }

  function dhmsToMs(prefix) {
    var d = Number((byId(prefix + "-d") && byId(prefix + "-d").value) || 0);
    var h = Number((byId(prefix + "-h") && byId(prefix + "-h").value) || 0);
    var m = Number((byId(prefix + "-m") && byId(prefix + "-m").value) || 0);
    if (!Number.isFinite(d)) d = 0;
    if (!Number.isFinite(h)) h = 0;
    if (!Number.isFinite(m)) m = 0;
    return ((Math.max(0, d) * 24 + Math.max(0, h)) * 60 + Math.max(0, m)) * 60 * 1000;
  }

  function setChecked(id, value) {
    var el = byId(id);
    if (el) el.checked = Boolean(value);
  }

  function setValue(id, value) {
    var el = byId(id);
    if (el) el.value = value == null ? "" : String(value);
  }

  function fillTicketsForm() {
    var s = state.tickets || {};
    var pickers = state.ticketsPickers || state.pickers || state.settingsPickers || {};
    var text = pickers.textChannels || [];
    var categories = pickers.categories || [];
    fillSelect(byId("tk-transcriptChannelId"), text, s.transcriptChannelId || s.logChannelId, i18n("dash.disabled", "Disabilitato"));
    var ticketCatId = s.ticketCategoryId || s.overflowCategoryId || "";
    fillTicketCategorySelect(byId("tk-ticketCategoryId"), categories, ticketCatId);
    var fancyFallback = s.categoryNameLive || s.defaultDiscordCategoryName || "";
    var liveCatName =
      s.categoryNameLive ||
      findLiveTicketCategoryName(categories, s.categoryName || "Tickets", fancyFallback);
    // Mai mostrare il placeholder plain "Tickets" se abbiamo il nome Discord fancy.
    var displayCatName = liveCatName || fancyFallback || s.categoryName || "Tickets";
    if (
      String(displayCatName).toLowerCase() === "tickets" &&
      fancyFallback &&
      String(fancyFallback).toLowerCase() !== "tickets"
    ) {
      displayCatName = fancyFallback;
    }
    setValue("tk-categoryName", displayCatName);
    syncTicketCategoryNameVisibility();
    var ticketCatSelect = byId("tk-ticketCategoryId");
    if (ticketCatSelect && !ticketCatSelect._tkCatBound) {
      ticketCatSelect._tkCatBound = true;
      ticketCatSelect.addEventListener("change", syncTicketCategoryNameVisibility);
    }
    setValue("tk-maxOpenTicketsPerUser", s.maxOpenTicketsPerUser != null ? s.maxOpenTicketsPerUser : 5);
    setChecked("tk-allowUserClose", s.allowUserClose === true);
    setChecked("tk-closeConfirmation", s.closeConfirmation === true);
    setChecked("tk-ratingEnabled", s.ratingEnabled === true);
    setChecked("tk-anonymiseDashboardResponses", s.anonymiseDashboardResponses === true);
    setChecked("tk-storeTranscripts", s.storeTranscripts !== false);
    setChecked("tk-hideCloseButton", s.hideCloseButton === true);
    setChecked("tk-hideCloseReasonButton", s.hideCloseReasonButton === true);
    setChecked("tk-hideClaimButton", s.hideClaimButton === true);
    setChecked("tk-claimedStaffCanView", s.claimedStaffCanView !== false);
    setChecked("tk-claimedStaffCanType", s.claimedStaffCanType === true);
    setValue(
      "tk-panelSwitchBehavior",
      s.panelSwitchBehavior === "keep_claim" ? "keep_access" : s.panelSwitchBehavior || "auto_unclaim",
    );
    setChecked("tk-autoCloseEnabled", s.autoCloseEnabled === true);
    setChecked("tk-autoCloseOnUserLeave", s.autoCloseOnUserLeave === true);
    var acso = msToDhms(s.autoCloseSinceOpenMs != null ? s.autoCloseSinceOpenMs : 0);
    var acslm = msToDhms(s.autoCloseSinceLastMessageMs != null ? s.autoCloseSinceLastMessageMs : 0);
    setValue("tk-acso-d", acso.d);
    setValue("tk-acso-h", acso.h);
    setValue("tk-acso-m", acso.m);
    setValue("tk-acslm-d", acslm.d);
    setValue("tk-acslm-h", acslm.h);
    setValue("tk-acslm-m", acslm.m);
    var perms = s.ticketPerms || {};
    setChecked("tk-perm-addReactions", perms.addReactions !== false);
    setChecked("tk-perm-sendTtsMessages", perms.sendTtsMessages === true);
    setChecked("tk-perm-embedLinks", perms.embedLinks !== false);
    setChecked("tk-perm-attachFiles", perms.attachFiles !== false);
    setChecked("tk-perm-useExternalEmojis", perms.useExternalEmojis !== false);
    setChecked("tk-perm-useExternalStickers", perms.useExternalStickers !== false);
    setChecked("tk-perm-sendVoiceMessages", perms.sendVoiceMessages === true);
    enhanceAllDashFancySelects(byId("vc-dashboard-tickets-form") || document);
    syncTicketsModuleCard();
  }

  function readTicketsFormPatch() {
    var prev = state.tickets || {};
    return {
      maxOpenTicketsPerUser: Number((byId("tk-maxOpenTicketsPerUser") && byId("tk-maxOpenTicketsPerUser").value) || 1),
      // Campi nascosti dalla UI: conserva i valori già salvati.
      language: String(prev.language || "server"),
      allowUserClose: Boolean(byId("tk-allowUserClose") && byId("tk-allowUserClose").checked),
      closeConfirmation: Boolean(byId("tk-closeConfirmation") && byId("tk-closeConfirmation").checked),
      ratingEnabled: Boolean(byId("tk-ratingEnabled") && byId("tk-ratingEnabled").checked),
      anonymiseDashboardResponses: Boolean(byId("tk-anonymiseDashboardResponses") && byId("tk-anonymiseDashboardResponses").checked),
      threadMode: Boolean(prev.threadMode),
      transcriptChannelId: String((byId("tk-transcriptChannelId") && byId("tk-transcriptChannelId").value) || "").trim() || null,
      overflowCategoryId: String((byId("tk-ticketCategoryId") && byId("tk-ticketCategoryId").value) || "").trim() || null,
      ticketCategoryId: String((byId("tk-ticketCategoryId") && byId("tk-ticketCategoryId").value) || "").trim() || null,
      categoryName: (function () {
        var typed = String((byId("tk-categoryName") && byId("tk-categoryName").value) || "").trim();
        var live = String((prev.categoryNameLive || prev.defaultDiscordCategoryName || "")).trim();
        // Se il campo è rimasto sul placeholder "Tickets", non sovrascrivere il nome Discord fancy.
        if ((!typed || typed.toLowerCase() === "tickets") && live && live.toLowerCase() !== "tickets") {
          return live;
        }
        return typed || "Tickets";
      })(),
      storeTranscripts: Boolean(byId("tk-storeTranscripts") && byId("tk-storeTranscripts").checked),
      hideCloseButton: Boolean(byId("tk-hideCloseButton") && byId("tk-hideCloseButton").checked),
      hideCloseReasonButton: Boolean(byId("tk-hideCloseReasonButton") && byId("tk-hideCloseReasonButton").checked),
      hideClaimButton: Boolean(byId("tk-hideClaimButton") && byId("tk-hideClaimButton").checked),
      openCommandEnabled: prev.openCommandEnabled !== false,
      contextMenuEnabled: Boolean(prev.contextMenuEnabled),
      claimedStaffCanView: Boolean(byId("tk-claimedStaffCanView") && byId("tk-claimedStaffCanView").checked),
      claimedStaffCanType: Boolean(byId("tk-claimedStaffCanType") && byId("tk-claimedStaffCanType").checked),
      panelSwitchBehavior: String((byId("tk-panelSwitchBehavior") && byId("tk-panelSwitchBehavior").value) || "auto_unclaim"),
      autoCloseEnabled: Boolean(byId("tk-autoCloseEnabled") && byId("tk-autoCloseEnabled").checked),
      autoCloseOnUserLeave: Boolean(byId("tk-autoCloseOnUserLeave") && byId("tk-autoCloseOnUserLeave").checked),
      autoCloseSinceOpen: { d: Number((byId("tk-acso-d") && byId("tk-acso-d").value) || 0), h: Number((byId("tk-acso-h") && byId("tk-acso-h").value) || 0), m: Number((byId("tk-acso-m") && byId("tk-acso-m").value) || 0) },
      autoCloseSinceLastMessage: { d: Number((byId("tk-acslm-d") && byId("tk-acslm-d").value) || 0), h: Number((byId("tk-acslm-h") && byId("tk-acslm-h").value) || 0), m: Number((byId("tk-acslm-m") && byId("tk-acslm-m").value) || 0) },
      autoCloseSinceOpenMs: dhmsToMs("tk-acso"),
      autoCloseSinceLastMessageMs: dhmsToMs("tk-acslm"),
      ticketPerms: {
        addReactions: Boolean(byId("tk-perm-addReactions") && byId("tk-perm-addReactions").checked),
        sendTtsMessages: Boolean(byId("tk-perm-sendTtsMessages") && byId("tk-perm-sendTtsMessages").checked),
        embedLinks: Boolean(byId("tk-perm-embedLinks") && byId("tk-perm-embedLinks").checked),
        attachFiles: Boolean(byId("tk-perm-attachFiles") && byId("tk-perm-attachFiles").checked),
        useExternalEmojis: Boolean(byId("tk-perm-useExternalEmojis") && byId("tk-perm-useExternalEmojis").checked),
        useExternalStickers: Boolean(byId("tk-perm-useExternalStickers") && byId("tk-perm-useExternalStickers").checked),
        sendVoiceMessages: Boolean(byId("tk-perm-sendVoiceMessages") && byId("tk-perm-sendVoiceMessages").checked),
      },
    };
  }

  async function loadTickets(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseTickets()) return false;
    var seq = ++state.ticketsLoadSeq;
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets",
        token,
        { attempts: options.silent ? 1 : 3 },
      );
      if (seq !== state.ticketsLoadSeq) return false;
      if (!out.res.ok || !out.data || out.data.ok === false) return false;
      state.tickets = out.data.settings || null;
      state.ticketsOverview = out.data.overview || null;
      state.ticketsPickers = out.data.pickers || null;
      fillTicketsForm();
      return true;
    } catch (_) {
      return false;
    }
  }

  async function saveTickets(patch) {
    var token = getToken();
    if (!token || !state.guildId || state.ticketsSaving) return false;
    state.ticketsSaving = true;
    showSaveToast(i18n("dash.savingShort", "Salvataggio…"), false, { pending: true });
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets",
        token,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch || readTicketsFormPatch()),
        },
      );
      if (!out.res.ok || !out.data || out.data.ok === false) {
        showSaveToast(
          (out.data && out.data.message) || i18n("dash.tickets.errSave", "Salvataggio tickets non riuscito."),
          true,
        );
        return false;
      }
      var prevTickets = state.tickets || {};
      var nextTickets = out.data.settings || prevTickets || null;
      // PATCH senza enrichment non deve ripristinare il placeholder "Tickets".
      if (nextTickets && prevTickets) {
        if (!nextTickets.categoryNameLive && prevTickets.categoryNameLive) {
          nextTickets.categoryNameLive = prevTickets.categoryNameLive;
        }
        if (!nextTickets.defaultDiscordCategoryName && prevTickets.defaultDiscordCategoryName) {
          nextTickets.defaultDiscordCategoryName = prevTickets.defaultDiscordCategoryName;
        }
        var nextCn = String(nextTickets.categoryName || "").trim();
        var liveCn = String(nextTickets.categoryNameLive || prevTickets.categoryNameLive || "").trim();
        if ((!nextCn || nextCn.toLowerCase() === "tickets") && liveCn && liveCn.toLowerCase() !== "tickets") {
          nextTickets.categoryName = liveCn;
        }
      }
      state.tickets = nextTickets;
      if (out.data.overview) state.ticketsOverview = out.data.overview;
      if (out.data.pickers) state.ticketsPickers = out.data.pickers;
      fillTicketsForm();
      showSaveToast(i18n("dash.tickets.saved", "Impostazioni tickets salvate."), false);
      return true;
    } catch (_) {
      showSaveToast(i18n("dash.tickets.errNetwork", "Errore di rete durante il salvataggio tickets."), true);
      return false;
    } finally {
      state.ticketsSaving = false;
    }
  }

  function readFancySelectValue(id) {
    var el = byId(id);
    if (!el) return "";
    var nativeVal = String(el.value || "").trim();
    if (nativeVal) return nativeVal;
    var root = el.closest ? el.closest(".vc-dash-select") : null;
    var selected = root && root.querySelector
      ? root.querySelector(".vc-dash-select__option.is-selected[data-value]")
      : null;
    if (selected) {
      var fromUi = String(selected.getAttribute("data-value") || "").trim();
      if (fromUi) {
        try {
          el.value = fromUi;
        } catch (_) {}
        return fromUi;
      }
    }
    return "";
  }

  function readTranscriptFilters() {
    var panel = readFancySelectValue("tk-tx-panel");
    var rating = readFancySelectValue("tk-tx-rating");
    return {
      ticketId: String((byId("tk-tx-ticketId") && byId("tk-tx-ticketId").value) || "").trim(),
      username: String((byId("tk-tx-username") && byId("tk-tx-username").value) || "").trim(),
      userId: String((byId("tk-tx-userId") && byId("tk-tx-userId").value) || "").trim(),
      closedBy: String((byId("tk-tx-closedBy") && byId("tk-tx-closedBy").value) || "").trim(),
      panel: panel,
      ticketType: panel,
      rating: rating,
      claimedBy: String((byId("tk-tx-claimedBy") && byId("tk-tx-claimedBy").value) || "").trim(),
      closeReason: String((byId("tk-tx-closeReason") && byId("tk-tx-closeReason").value) || "").trim(),
    };
  }

  function formatTranscriptRating(score) {
    var n = Number(score);
    if (!Number.isFinite(n) || n < 1) return '<span class="vc-dash-tk-tx-muted">—</span>';
    var stars = "";
    var i;
    for (i = 0; i < Math.min(5, Math.round(n)); i += 1) stars += "★";
    return '<span class="vc-dash-tk-tx-rating" title="' + escHtml(String(Math.round(n))) + '/5">' + stars + "</span>";
  }

  function renderTranscriptRows(rows) {
    var body = byId("tk-tx-body");
    if (!body) return;
    body.innerHTML = "";
    (rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      var num = row.ticketNumber != null ? String(row.ticketNumber) : String(row.id || "—");
      var userLabel = row.username
        ? escHtml(row.username)
        : row.userId
          ? "<code>" + escHtml(row.userId) + "</code>"
          : "—";
      var reason = row.closeReason ? escHtml(row.closeReason) : '<span class="vc-dash-tk-tx-muted">—</span>';
      var openBtn =
        '<button type="button" class="vc-dashboard-btn" data-tk-tx-open="' +
        escHtml(String(row.id || "")) +
        '"' +
        (row.canOpenTranscript === false ? " disabled" : "") +
        '><i class="fa fa-eye" aria-hidden="true"></i> <span>' +
        escHtml(i18n("dash.tickets.txOpen", "Apri")) +
        "</span></button>";
      tr.innerHTML =
        "<td><strong>#" +
        escHtml(num) +
        "</strong></td>" +
        "<td>" +
        userLabel +
        "</td>" +
        "<td>" +
        formatTranscriptRating(row.ratingScore) +
        "</td>" +
        "<td>" +
        reason +
        "</td>" +
        "<td>" +
        escHtml(ticketTypeLabel(row.ticketType)) +
        "</td>" +
        "<td>" +
        openBtn +
        "</td>";
      body.appendChild(tr);
    });
  }

  function revokeTranscriptViewerBlob() {
    if (state.transcriptViewerBlobUrl) {
      try {
        URL.revokeObjectURL(state.transcriptViewerBlobUrl);
      } catch (_) {}
      state.transcriptViewerBlobUrl = null;
    }
  }

  function closeTranscriptViewer() {
    var viewer = byId("tk-tx-viewer");
    var list = byId("tk-tx-list-wrap");
    var intro = byId("tk-tx-intro");
    var frame = byId("tk-tx-viewer-frame");
    var loading = byId("tk-tx-viewer-loading");
    if (viewer) {
      viewer.setAttribute("hidden", "");
      viewer.style.display = "";
    }
    if (list) list.removeAttribute("hidden");
    if (intro) intro.removeAttribute("hidden");
    if (loading) loading.setAttribute("hidden", "");
    if (frame) {
      try {
        frame.removeAttribute("src");
        frame.src = "about:blank";
      } catch (_) {}
    }
    revokeTranscriptViewerBlob();
    state.transcriptViewerTicketId = null;
  }

  function showTranscriptViewerShell(row) {
    var viewer = byId("tk-tx-viewer");
    var list = byId("tk-tx-list-wrap");
    var intro = byId("tk-tx-intro");
    var title = byId("tk-tx-viewer-title");
    var meta = byId("tk-tx-viewer-meta");
    var loading = byId("tk-tx-viewer-loading");
    var frame = byId("tk-tx-viewer-frame");
    if (!viewer) return;
    if (list) list.setAttribute("hidden", "");
    if (intro) intro.setAttribute("hidden", "");
    viewer.removeAttribute("hidden");
    if (loading) loading.removeAttribute("hidden");
    if (frame) {
      try {
        frame.src = "about:blank";
      } catch (_) {}
    }
    var num =
      row && row.ticketNumber != null
        ? String(row.ticketNumber)
        : row && row.id
          ? String(row.id)
          : "—";
    if (title) title.textContent = "ticket-" + num;
    if (meta) {
      var bits = [];
      if (row && row.username) bits.push(String(row.username));
      else if (row && row.userId) bits.push("ID " + String(row.userId));
      if (row && row.ticketType) bits.push(ticketTypeLabel(row.ticketType));
      meta.textContent = bits.join(" · ");
    }
  }

  function mountTranscriptViewerHtml(html) {
    var frame = byId("tk-tx-viewer-frame");
    var loading = byId("tk-tx-viewer-loading");
    if (!frame) return;
    revokeTranscriptViewerBlob();
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    state.transcriptViewerBlobUrl = URL.createObjectURL(blob);
    frame.onload = function () {
      if (loading) loading.setAttribute("hidden", "");
    };
    frame.src = state.transcriptViewerBlobUrl;
  }

  function mountTranscriptViewerUrl(url) {
    var frame = byId("tk-tx-viewer-frame");
    var loading = byId("tk-tx-viewer-loading");
    if (!frame) return;
    revokeTranscriptViewerBlob();
    frame.onload = function () {
      if (loading) loading.setAttribute("hidden", "");
    };
    frame.src = String(url || "");
  }

  function transcriptApiUrlFromPublicOrRow(urlOrRow) {
    if (urlOrRow && typeof urlOrRow === "object") {
      var rowUrl = String(urlOrRow.transcriptUrl || "").trim();
      if (rowUrl) return transcriptApiUrlFromPublicOrRow(rowUrl);
      return "";
    }
    var raw = String(urlOrRow || "").trim();
    if (!raw) return "";
    try {
      var u = new URL(raw, window.location.origin);
      var path = String(u.pathname || "");
      var mApi = path.match(/\/ticket[-_]transcript\/([a-f0-9]{64})\/?$/i);
      if (mApi) {
        return u.origin + "/ticket-transcript/" + mApi[1].toLowerCase();
      }
      if (/\/dashboard\/transcript\/?/i.test(path)) {
        var t = String(u.searchParams.get("t") || u.searchParams.get("token") || "")
          .trim()
          .toLowerCase();
        if (/^[a-f0-9]{64}$/.test(t)) {
          return u.origin + "/ticket-transcript/" + t;
        }
      }
    } catch (_) {}
    return "";
  }

  async function fetchTranscriptHtmlWithBearer(apiUrl, token) {
    var res = await fetch(String(apiUrl), {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "manual",
    });
    if (!res.ok) {
      var errMsg = i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript.");
      try {
        var ctype = String(res.headers.get("content-type") || "");
        if (ctype.indexOf("application/json") !== -1) {
          var data = await res.json();
          if (data && data.message) errMsg = String(data.message);
        }
      } catch (_) {}
      var err = new Error(errMsg);
      err.status = res.status;
      throw err;
    }
    return await res.text();
  }

  async function openTranscriptRow(ticketId) {
    var token = getToken();
    var tid = String(ticketId || "").trim();
    if (!token || !state.guildId || !tid) return;
    var row = (state.transcriptsList || []).find(function (r) {
      return String(r.id || "") === tid;
    }) || { id: tid };
    state.transcriptViewerTicketId = tid;
    showTranscriptViewerShell(row);
    try {
      var res = await fetch(
        resolveApiBase() +
          "/guilds/" +
          encodeURIComponent(state.guildId) +
          "/tickets/transcripts/" +
          encodeURIComponent(tid),
        {
          method: "GET",
          headers: { Authorization: "Bearer " + token },
          cache: "no-store",
          redirect: "manual",
        },
      );
      if (String(state.transcriptViewerTicketId || "") !== tid) return;
      if (res.status >= 300 && res.status < 400) {
        var loc = res.headers.get("Location") || res.headers.get("location") || "";
        var fromRedirect = transcriptApiUrlFromPublicOrRow(loc);
        if (fromRedirect) {
          var htmlRedirect = await fetchTranscriptHtmlWithBearer(fromRedirect, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(htmlRedirect);
          return;
        }
        closeTranscriptViewer();
        showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
        return;
      }
      if (!res.ok) {
        closeTranscriptViewer();
        showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
        return;
      }
      var ctype = String(res.headers.get("content-type") || "");
      if (ctype.indexOf("application/json") !== -1) {
        var data = await res.json().catch(function () {
          return {};
        });
        if (data && (data.apiUrl || data.redirectUrl)) {
          var apiUrl =
            String(data.apiUrl || "").trim() ||
            transcriptApiUrlFromPublicOrRow(data.redirectUrl);
          if (!apiUrl) {
            closeTranscriptViewer();
            showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
            return;
          }
          var htmlViaApi = await fetchTranscriptHtmlWithBearer(apiUrl, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(htmlViaApi);
          return;
        }
        closeTranscriptViewer();
        showSaveToast(
          (data && data.message) || i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."),
          true,
        );
        return;
      }
      var html = await res.text();
      if (String(state.transcriptViewerTicketId || "") !== tid) return;
      // Cintura: se l'HTML è la gate pubblica, non montarla nell'iframe.
      if (/vc-tx-gate|Accedi per vedere il transcript/i.test(html)) {
        var fallbackApi = transcriptApiUrlFromPublicOrRow(row);
        if (fallbackApi) {
          var html2 = await fetchTranscriptHtmlWithBearer(fallbackApi, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(html2);
          return;
        }
        closeTranscriptViewer();
        showSaveToast(i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."), true);
        return;
      }
      mountTranscriptViewerHtml(html);
    } catch (err) {
      if (String(state.transcriptViewerTicketId || "") !== tid) return;
      var fallback = transcriptApiUrlFromPublicOrRow(row);
      if (fallback) {
        try {
          var htmlFb = await fetchTranscriptHtmlWithBearer(fallback, token);
          if (String(state.transcriptViewerTicketId || "") !== tid) return;
          mountTranscriptViewerHtml(htmlFb);
          return;
        } catch (_) {}
      }
      closeTranscriptViewer();
      showSaveToast(
        (err && err.message) || i18n("dash.tickets.txOpenErr", "Impossibile aprire il transcript."),
        true,
      );
    }
  }

  function formatOpenTicketWhen(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (_) {
      return "—";
    }
  }

  function readOpenTicketsFilters() {
    return {
      ticketId: String((byId("tk-open-ticketId") && byId("tk-open-ticketId").value) || "").trim(),
      username: String((byId("tk-open-username") && byId("tk-open-username").value) || "").trim(),
      userId: String((byId("tk-open-userId") && byId("tk-open-userId").value) || "").trim(),
      claimedBy: String((byId("tk-open-claimedBy") && byId("tk-open-claimedBy").value) || "").trim(),
      panel: String((byId("tk-open-panel") && byId("tk-open-panel").value) || "").trim(),
      sort: String((byId("tk-open-sort") && byId("tk-open-sort").value) || "priority").trim() || "priority",
      mineOrUnclaimed: Boolean(byId("tk-open-mineOrUnclaimed") && byId("tk-open-mineOrUnclaimed").checked),
    };
  }

  function fillOpenTicketsPanelSelect(panels) {
    var sel = byId("tk-open-panel");
    if (!sel) return;
    var current = String(sel.value || "").trim();
    var types = {};
    (panels || []).forEach(function (p) {
      var t = String(p.ticketType || "").trim();
      if (t) types[t] = true;
    });
    var options = Object.keys(types)
      .sort()
      .map(function (t) {
        return { id: t, name: String(t).toUpperCase() };
      });
    fillSelect(sel, options, current, i18n("dash.tickets.openPanelAll", "Tutti i pannelli"));
    enhanceAllDashFancySelects(byId("tk-open-root") || document);
  }

  function renderOpenTicketRows(rows) {
    var body = byId("tk-open-body");
    if (!body) return;
    body.innerHTML = "";
    (rows || []).forEach(function (row) {
      var tr = document.createElement("tr");
      var num = row.ticketNumber != null ? String(row.ticketNumber) : String(row.id || "—");
      var userLabel = row.username
        ? escHtml(row.username)
        : row.userId
          ? "<code>" + escHtml(row.userId) + "</code>"
          : "—";
      var claimedLabel = row.claimedByUsername
        ? escHtml(row.claimedByUsername)
        : row.claimedBy
          ? "<code>" + escHtml(row.claimedBy) + "</code>"
          : '<span class="vc-dash-tk-tx-muted">' +
            escHtml(i18n("dash.tickets.openUnclaimed", "Non claimato")) +
            "</span>";
      var lastBits = [];
      if (row.lastMessageAt) lastBits.push(formatOpenTicketWhen(row.lastMessageAt));
      if (row.lastMessagePreview) lastBits.push(escHtml(row.lastMessagePreview));
      var lastHtml = lastBits.length
        ? lastBits.join(" · ")
        : '<span class="vc-dash-tk-tx-muted">—</span>';
      var awaiting = row.awaitingResponse === true;
      var awaitingHtml = awaiting
        ? '<span class="vc-dash-tk-open-awaiting"><i class="fa fa-clock-o" aria-hidden="true"></i> ' +
          escHtml(i18n("dash.yes", "Sì")) +
          "</span>"
        : '<span class="vc-dash-tk-open-awaiting is-no">' +
          escHtml(i18n("dash.no", "No")) +
          "</span>";
      var idCell = row.channelUrl
        ? '<a class="vc-dash-tk-open-link" href="' +
          escHtml(row.channelUrl) +
          '" target="_blank" rel="noopener noreferrer"><strong>#' +
          escHtml(num) +
          "</strong></a>"
        : "<strong>#" + escHtml(num) + "</strong>";
      tr.innerHTML =
        "<td>" +
        idCell +
        "</td>" +
        "<td>" +
        escHtml(row.panelTitle || String(row.ticketType || "").toUpperCase() || "—") +
        "</td>" +
        "<td>" +
        userLabel +
        "</td>" +
        "<td>" +
        claimedLabel +
        "</td>" +
        "<td>" +
        lastHtml +
        "</td>" +
        "<td>" +
        awaitingHtml +
        "</td>";
      body.appendChild(tr);
    });
  }

  function stopOpenTicketsPoll() {
    if (state.openTicketsPollTimer) {
      clearInterval(state.openTicketsPollTimer);
      state.openTicketsPollTimer = null;
    }
  }

  function startOpenTicketsPoll() {
    stopOpenTicketsPoll();
    state.openTicketsPollTimer = setInterval(function () {
      if (normalizeView(window.location.hash || "") !== "tickets/aperti") {
        stopOpenTicketsPoll();
        return;
      }
      refreshOpenTicketsList({ silent: true });
    }, 10000);
  }

  function scheduleOpenTicketsFilterRefresh() {
    if (state.openTicketsFilterTimer) clearTimeout(state.openTicketsFilterTimer);
    state.openTicketsFilterTimer = setTimeout(function () {
      state.openTicketsFilterTimer = null;
      state.openTicketsOffset = 0;
      refreshOpenTicketsList({ silent: true });
    }, 550);
  }

  function flushOpenTicketsFilterRefresh() {
    if (state.openTicketsFilterTimer) {
      clearTimeout(state.openTicketsFilterTimer);
      state.openTicketsFilterTimer = null;
    }
    state.openTicketsOffset = 0;
    refreshOpenTicketsList({ silent: true });
  }

  async function refreshOpenTicketsList(opts) {
    opts = opts || {};
    if (!state.guildId || !getToken()) return;
    var requestId = (state.openTicketsRequestId || 0) + 1;
    state.openTicketsRequestId = requestId;
    state.openTicketsLoading = true;
    var filters = readOpenTicketsFilters();
    var pageSize = Number(state.openTicketsPageSize || 30);
    var offset = Number(state.openTicketsOffset || 0);
    try {
      var params = new URLSearchParams();
      params.set("status", "open");
      params.set("limit", String(pageSize));
      params.set("offset", String(offset));
      params.set("sort", filters.sort || "priority");
      if (filters.ticketId) params.set("ticketId", filters.ticketId);
      if (filters.username) params.set("username", filters.username);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.claimedBy) params.set("claimedBy", filters.claimedBy);
      if (filters.panel) params.set("type", filters.panel);
      if (filters.mineOrUnclaimed) params.set("mineOrUnclaimed", "1");
      var res = await fetch(
        resolveApiBase() +
          "/guilds/" +
          encodeURIComponent(state.guildId) +
          "/tickets/list?" +
          params.toString(),
        {
          method: "GET",
          headers: { Authorization: "Bearer " + getToken(), Accept: "application/json" },
          cache: "no-store",
        },
      );
      var data = await res.json().catch(function () {
        return null;
      });
      if (requestId !== state.openTicketsRequestId) return;
      if (!res.ok || !data || !data.ok) {
        if (!opts.silent) {
          setError(
            (data && data.message) ||
              i18n("dash.tickets.openErrList", "Impossibile caricare i ticket aperti."),
          );
        }
        return;
      }
      setError("");
      state.openTicketsList = data.tickets || [];
      state.openTicketsTotal = Number(data.total || 0);
      state.openTicketsViewerId = data.viewerId || null;
      if (Array.isArray(data.panels)) {
        state.openTicketsPanels = data.panels;
        fillOpenTicketsPanelSelect(data.panels);
      }
      renderOpenTicketRows(state.openTicketsList);
      var empty = byId("tk-open-empty");
      var tableWrap = document.querySelector("#tk-open-root .vc-dash-tk-tx-table-wrap");
      if (empty) {
        if (state.openTicketsList.length) empty.setAttribute("hidden", "");
        else empty.removeAttribute("hidden");
      }
      if (tableWrap) {
        if (state.openTicketsList.length) tableWrap.removeAttribute("hidden");
        else tableWrap.setAttribute("hidden", "");
      }
      var countShown = byId("tk-open-count-shown");
      var countTotal = byId("tk-open-count-total");
      if (countShown) countShown.textContent = String(state.openTicketsList.length);
      if (countTotal) countTotal.textContent = String(state.openTicketsTotal);
      var pager = byId("tk-open-pager");
      var pageNum = Math.floor(offset / pageSize) + 1;
      var pageTotal = Math.max(1, Math.ceil(Number(state.openTicketsTotal || 0) / pageSize) || 1);
      var mp = window.__vcMiniPager;
      if (pager) {
        if (state.openTicketsTotal > pageSize && mp && typeof mp.fill === "function") {
          pager.removeAttribute("hidden");
          mp.fill(pager, pageNum, pageTotal, { aria: "Paginazione ticket aperti" }, {
            go: function (p) {
              var size = Number(state.openTicketsPageSize || 30);
              var tot = Math.max(1, Number(state.openTicketsTotal || 0));
              var pages = Math.max(1, Math.ceil(tot / size) || 1);
              var next = Math.max(1, Math.min(pages, Number(p) || 1));
              state.openTicketsOffset = (next - 1) * size;
              refreshOpenTicketsList({ silent: true });
            },
          });
        } else if (state.openTicketsTotal > pageSize) {
          pager.removeAttribute("hidden");
        } else {
          pager.setAttribute("hidden", "");
        }
      }
      if (!opts.silent) enhanceAllDashFancySelects(byId("tk-open-root") || document);
    } catch (_) {
      if (requestId !== state.openTicketsRequestId) return;
      if (!opts.silent) {
        setError(i18n("dash.tickets.openErrList", "Impossibile caricare i ticket aperti."));
      }
    } finally {
      if (requestId === state.openTicketsRequestId) state.openTicketsLoading = false;
    }
  }

  function stopTranscriptsPoll() {
    if (state.transcriptsPollTimer) {
      clearInterval(state.transcriptsPollTimer);
      state.transcriptsPollTimer = null;
    }
  }

  function startTranscriptsPoll() {
    if (state.transcriptsPollTimer) return;
    state.transcriptsPollTimer = setInterval(function () {
      if (String(state.view || "") !== "tickets/transcripts") {
        stopTranscriptsPoll();
        return;
      }
      if (document.visibilityState === "hidden") return;
      if (state.transcriptsLoading) return;
      if (state.transcriptsFilterTimer) return;
      refreshTranscriptsList({ silent: true });
    }, 8000);
  }

  function flushTranscriptsFilterRefresh() {
    if (state.transcriptsFilterTimer) {
      clearTimeout(state.transcriptsFilterTimer);
      state.transcriptsFilterTimer = null;
    }
    state.transcriptsOffset = 0;
    refreshTranscriptsList({ silent: true });
  }

  function scheduleTranscriptsFilterRefresh() {
    if (state.transcriptsFilterTimer) clearTimeout(state.transcriptsFilterTimer);
    // Aspetta che l'utente finisca di scrivere, poi cerca subito.
    state.transcriptsFilterTimer = setTimeout(function () {
      state.transcriptsFilterTimer = null;
      flushTranscriptsFilterRefresh();
    }, 550);
  }

  async function refreshTranscriptsList(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseTickets()) return;
    var requestId = (state.transcriptsRequestId = Number(state.transcriptsRequestId || 0) + 1);
    state.transcriptsLoading = true;
    var pageSize = Number(state.transcriptsPageSize || 25);
    var offset = Number(state.transcriptsOffset || 0);
    var filters = readTranscriptFilters();
    state.transcriptsFilters = filters;
    var payload = {
      limit: pageSize,
      offset: offset,
    };
    Object.keys(filters).forEach(function (key) {
      if (filters[key]) payload[key] = filters[key];
    });
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets/transcripts",
        token,
        {
          attempts: options.silent ? 1 : 3,
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      if (requestId !== state.transcriptsRequestId) return;
      if (!out.res.ok || !out.data || out.data.ok === false) {
        if (!options.silent) {
          setError(
            (out.data && out.data.message) ||
              i18n("dash.tickets.txErrList", "Impossibile caricare i transcript."),
          );
        }
        return;
      }
      var applied = (out.data && out.data.appliedFilters) || {};
      if (filters.panel && String(applied.panel || applied.ticketType || "") !== String(filters.panel)) {
        if (!options.silent) {
          showSaveToast(
            i18n(
              "dash.tickets.txFilterMismatch",
              "Il filtro pannello non è stato applicato. Riprova o fai hard refresh.",
            ),
            true,
          );
        }
      }
      state.transcriptsList = out.data.transcripts || [];
      state.transcriptsTotal = Number(out.data.total || 0);
      renderTranscriptRows(state.transcriptsList);
      var empty = byId("tk-tx-empty");
      var tableWrap = document.querySelector("#tk-tx-root .vc-dash-tk-tx-table-wrap");
      if (empty) {
        if (state.transcriptsList.length) empty.setAttribute("hidden", "");
        else empty.removeAttribute("hidden");
      }
      if (tableWrap) {
        if (state.transcriptsList.length) tableWrap.removeAttribute("hidden");
        else tableWrap.setAttribute("hidden", "");
      }
      var countShown = byId("tk-tx-count-shown");
      var countTotal = byId("tk-tx-count-total");
      if (countShown) countShown.textContent = String(state.transcriptsList.length);
      if (countTotal) countTotal.textContent = String(state.transcriptsTotal);
      var count = byId("tk-tx-count");
      if (count) {
        count.setAttribute(
          "title",
          i18n("dash.tickets.listCount", "{shown} di {total}", {
            shown: String(state.transcriptsList.length),
            total: String(state.transcriptsTotal),
          }),
        );
      }
      var pager = byId("tk-tx-pager");
      var pageNum = Math.floor(offset / pageSize) + 1;
      var pageTotal = Math.max(1, Math.ceil(Number(state.transcriptsTotal || 0) / pageSize) || 1);
      var mp = window.__vcMiniPager;
      if (pager) {
        if (state.transcriptsTotal > pageSize && mp && typeof mp.fill === "function") {
          pager.removeAttribute("hidden");
          mp.fill(pager, pageNum, pageTotal, { aria: "Paginazione transcript" }, {
            go: function (p) {
              var size = Number(state.transcriptsPageSize || 25);
              var tot = Math.max(1, Number(state.transcriptsTotal || 0));
              var pages = Math.max(1, Math.ceil(tot / size) || 1);
              var next = Math.max(1, Math.min(pages, Number(p) || 1));
              state.transcriptsOffset = (next - 1) * size;
              refreshTranscriptsList({ silent: true });
            },
          });
        } else if (state.transcriptsTotal > pageSize) {
          pager.removeAttribute("hidden");
        } else {
          pager.setAttribute("hidden", "");
        }
      }
      if (!options.silent) enhanceAllDashFancySelects(byId("tk-tx-root") || document);
    } catch (_) {
      if (requestId !== state.transcriptsRequestId) return;
      if (!options.silent) {
        setError(i18n("dash.tickets.txErrList", "Impossibile caricare i transcript."));
      }
    } finally {
      if (requestId === state.transcriptsRequestId) {
        state.transcriptsLoading = false;
      }
    }
  }

  function ticketPanelsApi(path, method, body) {
    var token = getToken();
    var opts = {
      method: method || "GET",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
      },
    };
    if (body != null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(
      resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets" + path,
      opts,
    ).then(function (res) {
      return res.json().catch(function () {
        return { ok: false, message: "Risposta non valida." };
      }).then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  var TEAM_PERM_LABELS = {
    addReactions: "Add Reactions",
    sendMessages: "Send Messages",
    sendTtsMessages: "Send TTS Messages",
    embedLinks: "Embed Links",
    attachFiles: "Attach Files",
    mentionEveryone: "Mention Everyone",
    useExternalEmojis: "Use External Emojis",
    useApplicationCommands: "Use Application Commands",
    useExternalStickers: "Use External Stickers",
    sendVoiceMessages: "Send Voice Messages",
  };

  function ticketTeamsApi(path, method, body) {
    return ticketPanelsApi(path, method, body);
  }

  function getSelectedTicketTeam() {
    var id = String(state.ticketTeamsSelectedId || "").trim();
    var teams = (state.ticketTeams && state.ticketTeams.teams) || [];
    if (!id) return teams[0] || null;
    return (
      teams.find(function (t) {
        return String(t.id) === id;
      }) ||
      teams[0] ||
      null
    );
  }

  function fillTicketTeamsSelect() {
    var sel = byId("tk-teams-select");
    if (!sel) return;
    var teams = (state.ticketTeams && state.ticketTeams.teams) || [];
    var selected = String(state.ticketTeamsSelectedId || (teams[0] && teams[0].id) || "");
    fillSelect(
      sel,
      teams.map(function (t) {
        var label = String(t.name || "").trim() || t.id;
        // Evita "Default (Default)" quando il nome è già quello del team di sistema.
        if (t.isDefault && label.toLowerCase() !== "default") {
          label = label + " (Default)";
        }
        return { id: t.id, name: label };
      }),
      selected,
      i18n("dash.tickets.teamsSelectEmpty", "Seleziona un team"),
    );
    state.ticketTeamsSelectedId = String(sel.value || selected || "").trim() || null;
    enhanceAllDashFancySelects(byId("tk-teams-root") || document);
  }

  function ticketTeamMembersPayload(team) {
    return ((team && (team.memberIds || team.members)) || []).map(function (m) {
      return { type: m.type === "user" ? "user" : "role", id: String(m.id) };
    });
  }

  function renderTicketTeamsMembers() {
    var list = byId("tk-teams-members");
    var empty = byId("tk-teams-members-empty");
    if (!list) return;
    list.innerHTML = "";
    var team = getSelectedTicketTeam();
    var members = (team && team.members) || [];
    if (!members.length) {
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    members.forEach(function (m) {
      var li = document.createElement("li");
      li.className = "vc-dash-tk-teams__member";
      var label = String(m.label || m.id || "");
      if (m.type === "user" && label && label.charAt(0) !== "@") label = "@" + label;
      li.innerHTML =
        '<span class="vc-dash-tk-teams__member-label">' +
        escHtml(label) +
        "</span>" +
        '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-team-member-remove="' +
        escHtml(String(m.type || "role") + ":" + String(m.id || "")) +
        '">' +
        escHtml(i18n("dash.tickets.teamsMemberRemove", "Elimina")) +
        "</button>";
      list.appendChild(li);
    });
  }

  function fillTicketTeamsAddRoleSelect() {
    var sel = byId("tk-teams-add-role");
    if (!sel) return;
    var roles = ((state.ticketTeams && state.ticketTeams.pickers) || {}).roles || [];
    var team = getSelectedTicketTeam();
    var taken = {};
    ticketTeamMembersPayload(team).forEach(function (m) {
      if (m.type === "role") taken[m.id] = true;
    });
    var options = roles
      .filter(function (r) {
        return !taken[String(r.id)];
      })
      .map(function (r) {
        return { id: r.id, name: "@" + String(r.name || r.id) };
      });
    fillSelect(sel, options, "", i18n("dash.tickets.teamsSearchRole", "Cerca ruolo…"));
    enhanceAllDashFancySelects(byId("tk-teams-root") || document);
  }

  function fillTicketTeamsAddUserSelect(members, selectedId) {
    var sel = byId("tk-teams-add-user");
    if (!sel) return;
    var team = getSelectedTicketTeam();
    var taken = {};
    ticketTeamMembersPayload(team).forEach(function (m) {
      if (m.type === "user") taken[m.id] = true;
    });
    var options = (members || [])
      .filter(function (m) {
        return m && m.id && !taken[String(m.id)];
      })
      .map(function (m) {
        return { id: m.id, name: "@" + String(m.username || m.label || m.id) };
      });
    fillSelect(
      sel,
      options,
      selectedId || "",
      options.length
        ? i18n("dash.tickets.teamsPickUser", "Seleziona utente…")
        : i18n("dash.tickets.teamsSearchUserEmpty", "Nessun utente trovato"),
    );
    enhanceAllDashFancySelects(byId("tk-teams-root") || document);
  }

  var ticketTeamsUserSearchTimer = null;
  var ticketTeamsUserSearchSeq = 0;

  async function searchTicketTeamUsers(query) {
    var q = String(query || "").trim();
    var sel = byId("tk-teams-add-user");
    if (!sel) return;
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
      fillTicketTeamsAddUserSelect([]);
      return;
    }
    var seq = ++ticketTeamsUserSearchSeq;
    try {
      var out = await ticketTeamsApi(
        "/teams/members/search?q=" + encodeURIComponent(q),
        "GET",
      );
      if (seq !== ticketTeamsUserSearchSeq) return;
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        fillTicketTeamsAddUserSelect([]);
        return;
      }
      var members = out.data.members || [];
      var selected = members.length === 1 ? String(members[0].id) : "";
      fillTicketTeamsAddUserSelect(members, selected);
    } catch (_) {
      if (seq === ticketTeamsUserSearchSeq) fillTicketTeamsAddUserSelect([]);
    }
  }

  function scheduleTicketTeamUserSearch() {
    var input = byId("tk-teams-add-user-q");
    var q = String((input && input.value) || "").trim();
    if (ticketTeamsUserSearchTimer) clearTimeout(ticketTeamsUserSearchTimer);
    ticketTeamsUserSearchTimer = setTimeout(function () {
      searchTicketTeamUsers(q);
    }, 320);
  }

  function renderTicketTeamsPerms() {
    var card = byId("tk-teams-perms-card");
    var root = byId("tk-teams-perms");
    if (!card || !root) return;
    var team = getSelectedTicketTeam();
    if (!team || team.isDefault) {
      card.setAttribute("hidden", "");
      root.innerHTML = "";
      return;
    }
    card.removeAttribute("hidden");
    var perms = team.perms || (state.ticketTeams && state.ticketTeams.defaultPerms) || {};
    var keys = (state.ticketTeams && state.ticketTeams.permKeys) || Object.keys(TEAM_PERM_LABELS);
    root.innerHTML = keys
      .map(function (key) {
        var on = perms[key] === true;
        return (
          '<label class="vc-dash-tk-teams__perm">' +
          '<span class="vc-dash-tk-teams__perm-label">' +
          escHtml(TEAM_PERM_LABELS[key] || key) +
          "</span>" +
          '<span class="vc-dash-switch">' +
          '<input type="checkbox" data-tk-team-perm="' +
          escHtml(key) +
          '"' +
          (on ? " checked" : "") +
          " />" +
          '<span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span>' +
          "</span></label>"
        );
      })
      .join("");
  }

  function renderTicketTeamsEditor() {
    fillTicketTeamsSelect();
    var team = getSelectedTicketTeam();
    var delBtn = byId("tk-teams-delete-btn");
    var renameBtn = byId("tk-teams-rename-btn");
    if (delBtn) {
      if (team && !team.isDefault) delBtn.removeAttribute("hidden");
      else delBtn.setAttribute("hidden", "");
    }
    if (renameBtn) {
      if (team && !team.isDefault) renameBtn.removeAttribute("hidden");
      else renameBtn.setAttribute("hidden", "");
    }
    renderTicketTeamsMembers();
    fillTicketTeamsAddRoleSelect();
    fillTicketTeamsAddUserSelect([]);
    renderTicketTeamsPerms();
  }

  async function refreshTicketTeams(options) {
    options = options || {};
    if (!state.guildId || !getToken()) return;
    if (state.ticketTeamsLoading) return;
    state.ticketTeamsLoading = true;
    try {
      var out = await ticketTeamsApi("/teams", "GET");
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        if (!options.silent) {
          var msg =
            (out.data && out.data.message) ||
            i18n("dash.tickets.teamsErrLoad", "Impossibile caricare i team.");
          if (out.res && out.res.status === 404) {
            msg = i18n(
              "dash.tickets.teamsErrApiMissing",
              "API Staff Teams non disponibile. Riprova tra poco.",
            );
          }
          setError(msg);
        }
        return;
      }
      state.ticketTeams = out.data;
      if (!state.ticketTeamsSelectedId && out.data.teams && out.data.teams[0]) {
        state.ticketTeamsSelectedId = String(out.data.teams[0].id);
      } else if (
        state.ticketTeamsSelectedId &&
        !(out.data.teams || []).some(function (t) {
          return String(t.id) === String(state.ticketTeamsSelectedId);
        })
      ) {
        state.ticketTeamsSelectedId =
          out.data.teams && out.data.teams[0] ? String(out.data.teams[0].id) : null;
      }
      renderTicketTeamsEditor();
    } catch (_) {
      if (!options.silent) {
        setError(i18n("dash.tickets.teamsErrLoad", "Impossibile caricare i team."));
      }
    } finally {
      state.ticketTeamsLoading = false;
    }
  }

  async function patchSelectedTicketTeam(patch) {
    var team = getSelectedTicketTeam();
    if (!team || state.ticketTeamsSaving) return null;
    state.ticketTeamsSaving = true;
    try {
      var out = await ticketTeamsApi("/teams/" + encodeURIComponent(team.id), "PATCH", patch);
      if (!out.res.ok || !out.data || !out.data.ok) {
        showSaveToast(
          (out.data && out.data.message) ||
            i18n("dash.tickets.teamsErrSave", "Salvataggio team non riuscito."),
          true,
        );
        return null;
      }
      state.ticketTeams = Object.assign({}, state.ticketTeams || {}, {
        teams: out.data.teams || [],
      });
      if (out.data.team) state.ticketTeamsSelectedId = String(out.data.team.id);
      renderTicketTeamsEditor();
      return out.data.team;
    } finally {
      state.ticketTeamsSaving = false;
    }
  }

  function wireTicketTeamsUi() {
    var createForm = byId("tk-teams-create-form");
    if (createForm && !createForm.__vcWired) {
      createForm.__vcWired = true;
      createForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (state.ticketTeamsSaving) return;
        var nameEl = byId("tk-teams-create-name");
        var name = String((nameEl && nameEl.value) || "").trim();
        if (!name) return;
        state.ticketTeamsSaving = true;
        try {
          var out = await ticketTeamsApi("/teams", "POST", { name: name });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.teamsErrCreate", "Creazione team non riuscita."),
              true,
            );
            return;
          }
          if (nameEl) nameEl.value = "";
          state.ticketTeams = Object.assign({}, state.ticketTeams || {}, {
            teams: out.data.teams || [],
          });
          if (out.data.team) state.ticketTeamsSelectedId = String(out.data.team.id);
          renderTicketTeamsEditor();
          showSaveToast(i18n("dash.tickets.teamsCreated", "Team creato."));
        } finally {
          state.ticketTeamsSaving = false;
        }
      });
    }

    var select = byId("tk-teams-select");
    if (select && !select.__vcWired) {
      select.__vcWired = true;
      select.addEventListener("change", function () {
        state.ticketTeamsSelectedId = String(select.value || "").trim() || null;
        renderTicketTeamsEditor();
      });
    }

    var addBtn = byId("tk-teams-add-role-btn");
    if (addBtn && !addBtn.__vcWired) {
      addBtn.__vcWired = true;
      addBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        var roleSel = byId("tk-teams-add-role");
        var roleId = String((roleSel && roleSel.value) || "").trim();
        if (!team || !roleId) return;
        var members = ticketTeamMembersPayload(team).concat([{ type: "role", id: roleId }]);
        await patchSelectedTicketTeam({ members: members });
      });
    }

    var userQ = byId("tk-teams-add-user-q");
    if (userQ && !userQ.__vcWired) {
      userQ.__vcWired = true;
      userQ.addEventListener("input", function () {
        scheduleTicketTeamUserSearch();
      });
      userQ.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (ticketTeamsUserSearchTimer) clearTimeout(ticketTeamsUserSearchTimer);
          searchTicketTeamUsers(String(userQ.value || "").trim());
        }
      });
    }

    var addUserBtn = byId("tk-teams-add-user-btn");
    if (addUserBtn && !addUserBtn.__vcWired) {
      addUserBtn.__vcWired = true;
      addUserBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        var userSel = byId("tk-teams-add-user");
        var userId = String((userSel && userSel.value) || "").trim();
        if (!team || !/^\d{16,22}$/.test(userId)) {
          showSaveToast(
            i18n("dash.tickets.teamsErrPickUser", "Seleziona un utente dalla ricerca."),
            true,
          );
          return;
        }
        var already = ticketTeamMembersPayload(team).some(function (m) {
          return m.type === "user" && m.id === userId;
        });
        if (already) return;
        var members = ticketTeamMembersPayload(team).concat([{ type: "user", id: userId }]);
        var saved = await patchSelectedTicketTeam({ members: members });
        if (saved) {
          var qEl = byId("tk-teams-add-user-q");
          if (qEl) qEl.value = "";
          fillTicketTeamsAddUserSelect([]);
        }
      });
    }

    var membersList = byId("tk-teams-members");
    if (membersList && !membersList.__vcWired) {
      membersList.__vcWired = true;
      membersList.addEventListener("click", async function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-tk-team-member-remove]") : null;
        if (!btn) return;
        var raw = String(btn.getAttribute("data-tk-team-member-remove") || "");
        var parts = raw.split(":");
        var type = parts[0] === "user" ? "user" : "role";
        var id = parts.slice(1).join(":");
        var team = getSelectedTicketTeam();
        if (!team || !id) return;
        var members = ticketTeamMembersPayload(team).filter(function (m) {
          return !(m.type === type && m.id === id);
        });
        await patchSelectedTicketTeam({ members: members });
      });
    }

    var permsRoot = byId("tk-teams-perms");
    if (permsRoot && !permsRoot.__vcWired) {
      permsRoot.__vcWired = true;
      permsRoot.addEventListener("change", async function (ev) {
        var input = ev.target && ev.target.closest ? ev.target.closest("[data-tk-team-perm]") : null;
        if (!input) return;
        var team = getSelectedTicketTeam();
        if (!team || team.isDefault) return;
        var perms = Object.assign({}, team.perms || {});
        perms[input.getAttribute("data-tk-team-perm")] = Boolean(input.checked);
        await patchSelectedTicketTeam({ perms: perms });
      });
    }

    var renameBtn = byId("tk-teams-rename-btn");
    if (renameBtn && !renameBtn.__vcWired) {
      renameBtn.__vcWired = true;
      renameBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        if (!team || team.isDefault) return;
        var next = window.prompt(i18n("dash.tickets.teamsRenamePrompt", "Nuovo nome team"), team.name);
        if (next == null) return;
        next = String(next).trim();
        if (!next || next === team.name) return;
        await patchSelectedTicketTeam({ name: next });
      });
    }

    var deleteBtn = byId("tk-teams-delete-btn");
    if (deleteBtn && !deleteBtn.__vcWired) {
      deleteBtn.__vcWired = true;
      deleteBtn.addEventListener("click", async function () {
        var team = getSelectedTicketTeam();
        if (!team || team.isDefault || state.ticketTeamsSaving) return;
        if (
          !window.confirm(
            i18n("dash.tickets.teamsDeleteConfirm", "Eliminare il team \"{name}\"?", {
              name: team.name,
            }),
          )
        ) {
          return;
        }
        state.ticketTeamsSaving = true;
        try {
          var out = await ticketTeamsApi("/teams/" + encodeURIComponent(team.id), "DELETE");
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.teamsErrDelete", "Eliminazione non riuscita."),
              true,
            );
            return;
          }
          state.ticketTeams = Object.assign({}, state.ticketTeams || {}, {
            teams: out.data.teams || [],
          });
          state.ticketTeamsSelectedId =
            out.data.teams && out.data.teams[0] ? String(out.data.teams[0].id) : null;
          renderTicketTeamsEditor();
          showSaveToast(i18n("dash.tickets.teamsDeleted", "Team eliminato."));
        } finally {
          state.ticketTeamsSaving = false;
        }
      });
    }
  }

  function ticketBlacklistApi(path, method, body) {
    return ticketPanelsApi(path, method, body);
  }

  function syncTicketBlacklistTypeUi() {
    var typeEl = byId("tk-bl-type");
    var type = String((typeEl && typeEl.value) || "user");
    var userWrap = byId("tk-bl-user-wrap");
    var userPick = byId("tk-bl-user-pick-wrap");
    var roleWrap = byId("tk-bl-role-wrap");
    var isUser = type !== "role";
    if (userWrap) userWrap.hidden = !isUser;
    if (userPick) userPick.hidden = !isUser;
    if (roleWrap) roleWrap.hidden = isUser;
  }

  function fillTicketBlacklistPanelSelect() {
    var sel = byId("tk-bl-panel");
    if (!sel) return;
    var panels = (state.ticketBlacklist && state.ticketBlacklist.panels) || [];
    var options = [{ id: "", name: i18n("dash.tickets.blacklistPanelAll", "Tutti i pannelli") }].concat(
      panels.map(function (p) {
        return { id: p.id, name: String(p.title || p.id) };
      }),
    );
    fillSelect(sel, options, String(sel.value || ""), i18n("dash.tickets.blacklistPanelAll", "Tutti i pannelli"));
    enhanceAllDashFancySelects(byId("tk-bl-root") || document);
  }

  function fillTicketBlacklistRoleSelect() {
    var sel = byId("tk-bl-role");
    if (!sel) return;
    var roles = ((state.ticketBlacklist && state.ticketBlacklist.pickers) || {}).roles || [];
    fillSelect(
      sel,
      roles.map(function (r) {
        return { id: r.id, name: "@" + String(r.name || r.id) };
      }),
      "",
      i18n("dash.tickets.blacklistSearchRole", "Cerca ruolo…"),
    );
    enhanceAllDashFancySelects(byId("tk-bl-root") || document);
  }

  function fillTicketBlacklistUserSelect(members, selectedId) {
    var sel = byId("tk-bl-user");
    if (!sel) return;
    var options = (members || []).map(function (m) {
      return { id: m.id, name: "@" + String(m.username || m.label || m.id) };
    });
    fillSelect(
      sel,
      options,
      selectedId || "",
      options.length
        ? i18n("dash.tickets.blacklistPickUser", "Seleziona utente…")
        : i18n("dash.tickets.blacklistSearchUserEmpty", "Nessun utente trovato"),
    );
    enhanceAllDashFancySelects(byId("tk-bl-root") || document);
  }

  async function searchTicketBlacklistUsers(query) {
    var q = String(query || "").trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) {
      fillTicketBlacklistUserSelect([]);
      return;
    }
    var seq = ++state.ticketBlacklistUserSearchSeq;
    try {
      var out = await ticketBlacklistApi(
        "/teams/members/search?q=" + encodeURIComponent(q),
        "GET",
      );
      if (seq !== state.ticketBlacklistUserSearchSeq) return;
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        fillTicketBlacklistUserSelect([]);
        return;
      }
      var members = out.data.members || [];
      fillTicketBlacklistUserSelect(members, members.length === 1 ? String(members[0].id) : "");
    } catch (_) {
      if (seq === state.ticketBlacklistUserSearchSeq) fillTicketBlacklistUserSelect([]);
    }
  }

  function scheduleTicketBlacklistUserSearch() {
    var input = byId("tk-bl-user-q");
    var q = String((input && input.value) || "").trim();
    if (state.ticketBlacklistUserSearchTimer) clearTimeout(state.ticketBlacklistUserSearchTimer);
    state.ticketBlacklistUserSearchTimer = setTimeout(function () {
      searchTicketBlacklistUsers(q);
    }, 320);
  }

  function renderTicketBlacklistList() {
    var list = byId("tk-bl-list");
    var empty = byId("tk-bl-empty");
    var count = byId("tk-bl-count");
    if (!list) return;
    list.innerHTML = "";
    var entries = (state.ticketBlacklist && state.ticketBlacklist.entries) || [];
    if (count) {
      count.textContent = entries.length
        ? i18n("dash.tickets.blacklistCount", "{n} in blacklist").replace("{n}", String(entries.length))
        : i18n("dash.tickets.blacklistCountEmpty", "Nessuna entry");
    }
    if (!entries.length) {
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    entries.forEach(function (e) {
      var li = document.createElement("li");
      li.className = "vc-dash-tk-bl__row";
      var kind =
        e.type === "role"
          ? i18n("dash.tickets.blacklistTypeRole", "Ruolo")
          : i18n("dash.tickets.blacklistTypeUser", "Utente");
      var panelLabel = e.panelTitle
        ? e.panelTitle
        : i18n("dash.tickets.blacklistPanelAll", "Tutti i pannelli");
      var reason = e.reason ? " · " + e.reason : "";
      li.innerHTML =
        '<div class="vc-dash-tk-bl__main">' +
        '<span class="vc-dash-tk-bl__label">' +
        escHtml(e.label || e.targetId) +
        "</span>" +
        '<span class="vc-dash-tk-bl__meta">' +
        escHtml(kind + reason) +
        "</span></div>" +
        '<span class="vc-dash-tk-bl__panel">' +
        escHtml(panelLabel) +
        "</span>" +
        '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-bl-remove="' +
        escHtml(String(e.id || "")) +
        '">' +
        escHtml(i18n("dash.tickets.blacklistRemove", "Rimuovi")) +
        "</button>";
      list.appendChild(li);
    });
  }

  function renderTicketBlacklistEditor() {
    syncTicketBlacklistTypeUi();
    fillTicketBlacklistPanelSelect();
    fillTicketBlacklistRoleSelect();
    renderTicketBlacklistList();
  }

  async function refreshTicketBlacklist(options) {
    options = options || {};
    if (!state.guildId || !getToken()) return;
    if (state.ticketBlacklistLoading) return;
    state.ticketBlacklistLoading = true;
    try {
      var out = await ticketBlacklistApi("/blacklist", "GET");
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        if (!options.silent) {
          setError(
            (out.data && out.data.message) ||
              i18n("dash.tickets.blacklistErrLoad", "Impossibile caricare la blacklist."),
          );
        }
        return;
      }
      state.ticketBlacklist = out.data;
      renderTicketBlacklistEditor();
      setError("");
    } catch (_) {
      if (!options.silent) {
        setError(i18n("dash.tickets.blacklistErrLoad", "Impossibile caricare la blacklist."));
      }
    } finally {
      state.ticketBlacklistLoading = false;
    }
  }

  function wireTicketBlacklistUi() {
    var typeEl = byId("tk-bl-type");
    if (typeEl && !typeEl.__vcWired) {
      typeEl.__vcWired = true;
      typeEl.addEventListener("change", function () {
        syncTicketBlacklistTypeUi();
        enhanceAllDashFancySelects(byId("tk-bl-root") || document);
      });
    }

    var userQ = byId("tk-bl-user-q");
    if (userQ && !userQ.__vcWired) {
      userQ.__vcWired = true;
      userQ.addEventListener("input", scheduleTicketBlacklistUserSearch);
      userQ.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          if (state.ticketBlacklistUserSearchTimer) clearTimeout(state.ticketBlacklistUserSearchTimer);
          searchTicketBlacklistUsers(String(userQ.value || "").trim());
        }
      });
    }

    var addBtn = byId("tk-bl-add-btn");
    if (addBtn && !addBtn.__vcWired) {
      addBtn.__vcWired = true;
      addBtn.addEventListener("click", async function () {
        if (state.ticketBlacklistSaving) return;
        var type = String((byId("tk-bl-type") && byId("tk-bl-type").value) || "user");
        var targetId = "";
        if (type === "role") {
          targetId = String((byId("tk-bl-role") && byId("tk-bl-role").value) || "").trim();
        } else {
          targetId = String((byId("tk-bl-user") && byId("tk-bl-user").value) || "").trim();
        }
        if (!/^\d{16,22}$/.test(targetId)) {
          showSaveToast(
            i18n("dash.tickets.blacklistErrTarget", "Seleziona un utente o un ruolo valido."),
            true,
          );
          return;
        }
        var panelId = String((byId("tk-bl-panel") && byId("tk-bl-panel").value) || "").trim() || null;
        var reason = String((byId("tk-bl-reason") && byId("tk-bl-reason").value) || "").trim();
        state.ticketBlacklistSaving = true;
        try {
          var out = await ticketBlacklistApi("/blacklist", "POST", {
            type: type === "role" ? "role" : "user",
            targetId: targetId,
            panelId: panelId,
            reason: reason || null,
          });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.blacklistErrAdd", "Aggiunta non riuscita."),
              true,
            );
            return;
          }
          state.ticketBlacklist = Object.assign({}, state.ticketBlacklist || {}, {
            entries: out.data.entries || [],
            panels: out.data.panels || (state.ticketBlacklist && state.ticketBlacklist.panels) || [],
          });
          if (byId("tk-bl-reason")) byId("tk-bl-reason").value = "";
          if (byId("tk-bl-user-q")) byId("tk-bl-user-q").value = "";
          fillTicketBlacklistUserSelect([]);
          renderTicketBlacklistEditor();
          showSaveToast(
            (out.data && out.data.message) || i18n("dash.tickets.blacklistAdded", "Aggiunto alla blacklist."),
          );
        } finally {
          state.ticketBlacklistSaving = false;
        }
      });
    }

    var list = byId("tk-bl-list");
    if (list && !list.__vcWired) {
      list.__vcWired = true;
      list.addEventListener("click", async function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-tk-bl-remove]") : null;
        if (!btn || state.ticketBlacklistSaving) return;
        var id = String(btn.getAttribute("data-tk-bl-remove") || "").trim();
        if (!id) return;
        if (
          !window.confirm(
            i18n("dash.tickets.blacklistConfirmRemove", "Rimuovere questa entry dalla blacklist?"),
          )
        ) {
          return;
        }
        state.ticketBlacklistSaving = true;
        try {
          var out = await ticketBlacklistApi("/blacklist/" + encodeURIComponent(id), "DELETE");
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.blacklistErrRemove", "Rimozione non riuscita."),
              true,
            );
            return;
          }
          state.ticketBlacklist = Object.assign({}, state.ticketBlacklist || {}, {
            entries: out.data.entries || [],
          });
          renderTicketBlacklistList();
          showSaveToast(
            (out.data && out.data.message) || i18n("dash.tickets.blacklistRemoved", "Rimossa dalla blacklist."),
          );
        } finally {
          state.ticketBlacklistSaving = false;
        }
      });
    }
  }

  var TICKET_FORM_TYPE_LABELS = {
    text_input: "Text Input",
    string_select: "String Select",
    user_select: "User Select",
    role_select: "Role Select",
    mentionable_select: "Mentionable Select",
    channel_select: "Channel Select",
    radio_group: "Radio Group",
    checkbox_group: "Checkbox Group",
  };

  var TICKET_FORM_TYPE_CONFIG_TITLES = {
    string_select: "String Select Options",
    user_select: "User Select Configuration",
    role_select: "Role Select Configuration",
    mentionable_select: "Mentionable Select Configuration",
    channel_select: "Channel Select Configuration",
    radio_group: "Radio Group Options",
    checkbox_group: "Checkbox Group Options",
  };

  function ticketFormsApi(path, method, body) {
    return ticketPanelsApi(path, method, body);
  }

  function getSelectedTicketForm() {
    var id = String(state.ticketFormsSelectedId || "").trim();
    var forms = (state.ticketForms && state.ticketForms.forms) || [];
    if (!id) return forms[0] || null;
    return (
      forms.find(function (f) {
        return String(f.id) === id;
      }) ||
      forms[0] ||
      null
    );
  }

  function ticketFormTypeNeedsOptions(type) {
    return type === "string_select" || type === "radio_group" || type === "checkbox_group";
  }

  function ticketFormTypeSupportsMinMax(type) {
    return (
      type === "string_select" ||
      type === "user_select" ||
      type === "role_select" ||
      type === "mentionable_select" ||
      type === "channel_select" ||
      type === "checkbox_group"
    );
  }

  function ticketFormMaxOptions(type) {
    if (type === "radio_group" || type === "checkbox_group") return 10;
    if (type === "string_select") return 25;
    return 0;
  }

  function ticketFormMinOptions(type) {
    if (type === "radio_group") return 2;
    if (type === "string_select" || type === "checkbox_group") return 1;
    return 0;
  }

  function newTicketFormFieldDraft() {
    return {
      id: "f" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4),
      type: "text_input",
      label: "",
      description: "",
      placeholder: "",
      required: true,
      style: "short",
      minLength: 0,
      maxLength: 255,
      minValues: 0,
      maxValues: 1,
      options: [],
    };
  }

  function newTicketFormOptionDraft() {
    return {
      id: "o" + Math.random().toString(36).slice(2, 10),
      label: "",
      value: "",
    };
  }

  function fillTicketFormsSelect() {
    var sel = byId("tk-forms-select");
    if (!sel) return;
    var forms = (state.ticketForms && state.ticketForms.forms) || [];
    var selected = String(state.ticketFormsSelectedId || (forms[0] && forms[0].id) || "");
    if (selected && !forms.some(function (f) { return String(f.id) === selected; })) {
      selected = forms[0] ? String(forms[0].id) : "";
    }
    fillSelect(
      sel,
      forms.map(function (f) {
        return { id: f.id, name: String(f.title || f.id) };
      }),
      selected,
      i18n("dash.tickets.formsSelectEmpty", "Seleziona un form…"),
    );
    state.ticketFormsSelectedId = String(sel.value || "").trim() || null;
    enhanceAllDashFancySelects(byId("tk-forms-root") || document);
  }

  function fillTicketPanelFormSelects(panel) {
    var forms = (state.ticketForms && state.ticketForms.forms) || [];
    if (!forms.length && state.ticketPanels && Array.isArray(state.ticketPanels.forms)) {
      forms = state.ticketPanels.forms;
    }
    var options = forms.map(function (f) {
      return { id: f.id, name: String(f.title || f.id) };
    });
    var emptyLabel = options.length
      ? i18n("dash.none", "Nessuno")
      : i18n("dash.tickets.formsSelectEmpty", "Seleziona un form…");
    fillSelect(
      byId("tk-panel-formId"),
      options,
      (panel && panel.formId) || "",
      emptyLabel,
    );
  }

  function collectTicketFormFieldsFromDom() {
    var root = byId("tk-forms-fields");
    if (!root) return [];
    var cards = root.querySelectorAll("[data-tk-form-field]");
    var out = [];
    Array.prototype.forEach.call(cards, function (card) {
      var type = String((card.querySelector("[data-field='type']") || {}).value || "text_input");
      var options = [];
      if (ticketFormTypeNeedsOptions(type)) {
        Array.prototype.forEach.call(card.querySelectorAll("[data-tk-form-option]"), function (row) {
          var label = String((row.querySelector("[data-opt='label']") || {}).value || "").trim();
          var value = String((row.querySelector("[data-opt='value']") || {}).value || "").trim() || label;
          if (!label && !value) return;
          options.push({
            id: String(row.getAttribute("data-tk-form-option") || "") || undefined,
            label: label || value,
            value: value || label,
          });
        });
      }
      var minValues = Number((card.querySelector("[data-field='minValues']") || {}).value);
      var maxValues = Number((card.querySelector("[data-field='maxValues']") || {}).value);
      var reqEl =
        type === "text_input"
          ? card.querySelector("[data-field='required']")
          : card.querySelector("[data-field='required-select']") ||
            card.querySelector("[data-field='required']");
      out.push({
        id: String(card.getAttribute("data-tk-form-field") || "") || undefined,
        type: type,
        label: String((card.querySelector("[data-field='label']") || {}).value || "").trim(),
        description: String((card.querySelector("[data-field='description']") || {}).value || "").trim(),
        placeholder: String((card.querySelector("[data-field='placeholder']") || {}).value || "").trim(),
        required: Boolean(reqEl && reqEl.checked),
        style: String((card.querySelector("[data-field='style']") || {}).value || "short"),
        minLength: Number((card.querySelector("[data-field='minLength']") || {}).value) || 0,
        maxLength: Number((card.querySelector("[data-field='maxLength']") || {}).value) || 255,
        minValues: Number.isFinite(minValues) ? minValues : 0,
        maxValues: Number.isFinite(maxValues) ? maxValues : 1,
        options: options,
      });
    });
    return out;
  }

  function ticketFormFieldValidationMessage(field) {
    if (!field) return "";
    if (!String(field.label || "").trim()) {
      return i18n("dash.tickets.formsFieldLabelRequired", "Label is required");
    }
    var type = String(field.type || "text_input");
    if (!ticketFormTypeNeedsOptions(type)) return "";
    var count = (field.options || []).filter(function (o) {
      return String((o && o.label) || "").trim();
    }).length;
    var minOpts = ticketFormMinOptions(type);
    var maxOpts = ticketFormMaxOptions(type);
    if (count < minOpts) {
      if (type === "radio_group") {
        return i18n(
          "dash.tickets.formsOptsRadioMin",
          'At least 2 options are required. Click "Add Option" to create up to 10 options.',
        );
      }
      if (type === "checkbox_group") {
        return i18n(
          "dash.tickets.formsOptsCheckboxMin",
          'At least 1 option is required. Click "Add Option" to create up to 10 options.',
        );
      }
      return i18n(
        "dash.tickets.formsOptsSelectMin",
        'At least 1 option is required. Click "Add Option" to create up to 25 options.',
      );
    }
    if (count > maxOpts) {
      return i18n("dash.tickets.formsOptsMax", "Massimo {n} opzioni.").replace("{n}", String(maxOpts));
    }
    return "";
  }

  function ticketFormTextLengthCap(style) {
    return String(style || "short") === "paragraph" ? 1024 : 255;
  }

  function syncTicketFormLengthSlider(card) {
    if (!card) return;
    var minEl = card.querySelector("[data-field='minLength']");
    var maxEl = card.querySelector("[data-field='maxLength']");
    if (!minEl || !maxEl) return;
    var styleEl = card.querySelector("[data-field='style']");
    var cap = ticketFormTextLengthCap(styleEl && styleEl.value);
    minEl.min = "0";
    maxEl.min = "0";
    minEl.max = String(cap);
    maxEl.max = String(cap);
    var minV = Math.max(0, Math.min(cap, Number(minEl.value) || 0));
    var maxV = Math.max(0, Math.min(cap, Number(maxEl.value) || 0));
    if (maxV < minV) {
      if (document.activeElement === minEl) maxV = minV;
      else minV = maxV;
    }
    minEl.value = String(minV);
    maxEl.value = String(maxV);
    var dual = card.querySelector(".vc-dash-tk-forms__dual");
    var fill = card.querySelector("[data-len-fill]");
    var minOut = card.querySelector("[data-len-min]");
    var maxOut = card.querySelector("[data-len-max]");
    var pad = 8;
    var trackW = dual ? Math.max(0, dual.clientWidth - pad * 2) : 0;
    var minPct = cap > 0 ? minV / cap : 0;
    var maxPct = cap > 0 ? maxV / cap : 0;
    if (fill) {
      if (trackW > 0) {
        fill.style.left = pad + minPct * trackW + "px";
        fill.style.width = Math.max(0, (maxPct - minPct) * trackW) + "px";
        fill.style.right = "auto";
      } else {
        fill.style.left = minPct * 100 + "%";
        fill.style.width = Math.max(0, (maxPct - minPct) * 100) + "%";
        fill.style.right = "auto";
      }
    }
    if (minOut) {
      minOut.textContent = String(minV);
      if (trackW > 0) minOut.style.left = pad + minPct * trackW + "px";
      else minOut.style.left = minPct * 100 + "%";
    }
    if (maxOut) {
      maxOut.textContent = String(maxV);
      if (trackW > 0) maxOut.style.left = pad + maxPct * trackW + "px";
      else maxOut.style.left = maxPct * 100 + "%";
    }
    // Pollice attivo sopra quando si sovrappongono.
    if (minEl && maxEl) {
      var minOnTop = document.activeElement === minEl;
      minEl.style.zIndex = minOnTop ? "4" : "2";
      maxEl.style.zIndex = minOnTop ? "3" : "4";
    }
  }

  function syncTicketFormTextStyleUi(card) {
    if (!card) return;
    var styleEl = card.querySelector("[data-field='style']");
    var ph = card.querySelector("[data-field='placeholder']");
    var multi = String((styleEl && styleEl.value) || "short") === "paragraph";
    if (ph) {
      ph.rows = multi ? 6 : 2;
      ph.classList.toggle("is-multiline", multi);
    }
    card.classList.toggle("is-text-multiline", multi);
    // Short = barra 0–255; Multi-line = 0–1024. Il valore selezionato resta (clamp solo se supera il nuovo cap).
    syncTicketFormLengthSlider(card);
  }

  function syncTicketFormFieldCardUi(card) {
    if (!card) return;
    var typeEl = card.querySelector("[data-field='type']");
    var type = String((typeEl && typeEl.value) || "text_input");
    Array.prototype.forEach.call(card.querySelectorAll("[data-tk-form-show]"), function (el) {
      var want = String(el.getAttribute("data-tk-form-show") || "");
      var show =
        want === "text_input"
          ? type === "text_input"
          : want === "options"
            ? ticketFormTypeNeedsOptions(type)
            : want === "minmax"
              ? ticketFormTypeSupportsMinMax(type)
              : want === "selectish"
                ? type !== "text_input"
                : false;
      el.hidden = !show;
    });
    var titleEl = card.querySelector("[data-tk-form-config-title]");
    if (titleEl) {
      titleEl.textContent =
        TICKET_FORM_TYPE_CONFIG_TITLES[type] ||
        i18n("dash.tickets.formsFieldConfig", "Configuration");
    }
    var labelEl = card.querySelector("[data-field='label']");
    var labelErr = card.querySelector("[data-tk-form-label-error]");
    if (labelErr) {
      labelErr.hidden = !!String((labelEl && labelEl.value) || "").trim();
    }
    if (type === "text_input") {
      syncTicketFormTextStyleUi(card);
      syncTicketFormLengthSlider(card);
    }
    var optErr = card.querySelector("[data-tk-form-options-error]");
    if (optErr) {
      var draft = {
        type: type,
        label: String((labelEl && labelEl.value) || "").trim() || "_",
        options: [],
      };
      Array.prototype.forEach.call(card.querySelectorAll("[data-tk-form-option]"), function (row) {
        var label = String((row.querySelector("[data-opt='label']") || {}).value || "").trim();
        if (label) draft.options.push({ label: label, value: label });
      });
      var msg = "";
      if (ticketFormTypeNeedsOptions(type)) {
        var count = draft.options.length;
        var minOpts = ticketFormMinOptions(type);
        if (count < minOpts) {
          msg =
            type === "radio_group"
              ? i18n(
                  "dash.tickets.formsOptsRadioMin",
                  'At least 2 options are required. Click "Add Option" to create up to 10 options.',
                )
              : type === "checkbox_group"
                ? i18n(
                    "dash.tickets.formsOptsCheckboxMin",
                    'At least 1 option is required. Click "Add Option" to create up to 10 options.',
                  )
                : i18n(
                    "dash.tickets.formsOptsSelectMin",
                    'At least 1 option is required. Click "Add Option" to create up to 25 options.',
                  );
        }
      }
      optErr.textContent = msg;
      optErr.hidden = !msg;
    }
  }

  function renderTicketFormOptionsHtml(field) {
    var options = Array.isArray(field.options) ? field.options : [];
    if (!options.length) return "";
    return options
      .map(function (o, i) {
        var oid = String(o.id || "opt" + i);
        return (
          '<div class="vc-dash-tk-forms__option" data-tk-form-option="' +
          escHtml(oid) +
          '">' +
          '<input type="text" data-opt="label" maxlength="100" placeholder="' +
          escHtml(i18n("dash.tickets.formsOptionPh", "Option label")) +
          '" value="' +
          escHtml(String(o.label || "")) +
          '" />' +
          '<input type="text" data-opt="value" maxlength="100" placeholder="' +
          escHtml(i18n("dash.tickets.formsOptionValuePh", "Value (optional)")) +
          '" value="' +
          escHtml(String(o.value && o.value !== o.label ? o.value : "")) +
          '" />' +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-form-option-remove="1" title="Elimina">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  function renderTicketFormsFields() {
    closeAllDashFancySelects();
    var root = byId("tk-forms-fields");
    var card = byId("tk-forms-editor-card");
    var empty = byId("tk-forms-empty");
    var renameBtn = byId("tk-forms-rename-btn");
    var deleteBtn = byId("tk-forms-delete-btn");
    var form = getSelectedTicketForm();
    if (!root) return;
    if (!form) {
      root.innerHTML = "";
      if (card) card.setAttribute("hidden", "");
      if (empty) empty.removeAttribute("hidden");
      if (renameBtn) {
        renameBtn.removeAttribute("hidden");
        renameBtn.disabled = true;
      }
      if (deleteBtn) {
        deleteBtn.removeAttribute("hidden");
        deleteBtn.disabled = true;
        var delLabelEmpty = deleteBtn.querySelector("span");
        if (delLabelEmpty) {
          delLabelEmpty.textContent = i18n("dash.tickets.formsDelete", "Elimina form");
        }
      }
      return;
    }
    if (empty) empty.setAttribute("hidden", "");
    if (card) card.removeAttribute("hidden");
    if (renameBtn) {
      renameBtn.removeAttribute("hidden");
      renameBtn.disabled = false;
    }
    if (deleteBtn) {
      deleteBtn.removeAttribute("hidden");
      deleteBtn.disabled = false;
      var delLabel = deleteBtn.querySelector("span");
      if (delLabel) {
        delLabel.textContent = i18n("dash.tickets.formsDeleteNamed", "Elimina {name}").replace(
          "{name}",
          String(form.title || ""),
        );
      }
    }
    var fields = Array.isArray(state.ticketFormsDraftFields)
      ? state.ticketFormsDraftFields
      : Array.isArray(form.fields)
        ? form.fields
        : [];
    state.ticketFormsDraftFields = fields.map(function (f) {
      return Object.assign({}, f, {
        options: Array.isArray(f.options)
          ? f.options.map(function (o, i) {
              return Object.assign({}, o, {
                id: o.id || "o" + i + String(f.id || "").slice(0, 6),
              });
            })
          : [],
      });
    });
    root.innerHTML = state.ticketFormsDraftFields
      .map(function (f, idx) {
        var type = String(f.type || "text_input");
        var fieldCount = state.ticketFormsDraftFields.length;
        var textStyle = f.style === "paragraph" ? "paragraph" : "short";
        var lenCap = ticketFormTextLengthCap(textStyle);
        var lenMin = Math.max(0, Math.min(lenCap, Number(f.minLength) || 0));
        var lenMaxRaw = f.maxLength != null ? Number(f.maxLength) : textStyle === "paragraph" ? 1024 : 255;
        var lenMax = Math.max(0, Math.min(lenCap, Number.isFinite(lenMaxRaw) ? lenMaxRaw : lenCap));
        if (lenMax < lenMin) lenMax = lenMin;
        var typeOptionsSelected = Object.keys(TICKET_FORM_TYPE_LABELS)
          .map(function (k) {
            return (
              '<option value="' +
              escHtml(k) +
              '"' +
              (k === type ? " selected" : "") +
              ">" +
              escHtml(TICKET_FORM_TYPE_LABELS[k]) +
              "</option>"
            );
          })
          .join("");
        var minValuesDefault =
          type === "string_select" ? 1 : type === "checkbox_group" ? 0 : 0;
        var maxValuesDefault =
          type === "string_select" ? 1 : 25;
        return (
          '<div class="vc-dash-tk-forms__field" data-tk-form-field="' +
          escHtml(String(f.id || idx)) +
          '">' +
          '<div class="vc-dash-tk-forms__field-top">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldLabel", "Label")) +
          '</span><input type="text" data-field="label" maxlength="45" placeholder="' +
          escHtml(i18n("dash.tickets.formsFieldLabelPh", "Name of the field")) +
          '" value="' +
          escHtml(String(f.label || "")) +
          '" /></label>' +
          '<div class="vc-dash-tk-forms__reorder" role="group" aria-label="' +
          escHtml(i18n("dash.tickets.formsReorder", "Ordine campo")) +
          '">' +
          '<button type="button" class="vc-dash-tk-forms__reorder-btn" data-tk-form-move="up"' +
          (idx === 0 ? " disabled" : "") +
          ' title="' +
          escHtml(i18n("dash.tickets.formsMoveUp", "Sposta su")) +
          '" aria-label="' +
          escHtml(i18n("dash.tickets.formsMoveUp", "Sposta su")) +
          '"><i class="fa fa-chevron-up" aria-hidden="true"></i></button>' +
          '<button type="button" class="vc-dash-tk-forms__reorder-btn" data-tk-form-move="down"' +
          (idx >= fieldCount - 1 ? " disabled" : "") +
          ' title="' +
          escHtml(i18n("dash.tickets.formsMoveDown", "Sposta giù")) +
          '" aria-label="' +
          escHtml(i18n("dash.tickets.formsMoveDown", "Sposta giù")) +
          '"><i class="fa fa-chevron-down" aria-hidden="true"></i></button>' +
          "</div>" +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldType", "Type")) +
          '</span><select data-field="type">' +
          typeOptionsSelected +
          "</select></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger" data-tk-form-field-remove="1"><i class="fa fa-trash"></i> ' +
          escHtml(i18n("dash.tickets.formsFieldDelete", "Delete")) +
          "</button>" +
          "</div>" +
          '<p class="vc-dash-tk-forms__field-error" data-tk-form-label-error hidden>' +
          escHtml(i18n("dash.tickets.formsFieldLabelRequired", "Label is required")) +
          "</p>" +
          '<div class="vc-dash-tk-forms__field-mid">' +
          '<label class="vc-dash-picker vc-dash-picker--full"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldDesc", "Description (optional)")) +
          '</span><input type="text" data-field="description" maxlength="100" placeholder="' +
          escHtml(i18n("dash.tickets.formsFieldDescPh", "Description for the field")) +
          '" value="' +
          escHtml(String(f.description || "")) +
          '" /></label>' +
          "</div>" +
          '<div class="vc-dash-tk-forms__type-body" data-tk-form-show="text_input">' +
          '<div class="vc-dash-tk-forms__field-bottom">' +
          '<label class="vc-dash-picker vc-dash-tk-forms__placeholder"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldPlaceholder", "Placeholder (optional)")) +
          '</span><textarea data-field="placeholder" rows="2" maxlength="100" placeholder="' +
          escHtml(
            i18n(
              "dash.tickets.formsFieldPlaceholderPh",
              "Placeholder text for the field, just like this text",
            ),
          ) +
          '">' +
          escHtml(String(f.placeholder || "")) +
          "</textarea></label>" +
          '<div class="vc-dash-tk-forms__side">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldStyle", "Style")) +
          '</span><select data-field="style">' +
          '<option value="short"' +
          (textStyle === "short" ? " selected" : "") +
          ">" +
          escHtml(i18n("dash.tickets.formsStyleShort", "Short")) +
          '</option><option value="paragraph"' +
          (textStyle === "paragraph" ? " selected" : "") +
          ">" +
          escHtml(i18n("dash.tickets.formsStyleMulti", "Multi-line")) +
          "</option></select></label>" +
          '<div class="vc-dash-tk-forms__side-meta">' +
          '<span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          "</span>" +
          '<span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldLength", "Answer length range")) +
          "</span>" +
          '<label class="vc-dash-switch vc-dash-switch--solo" aria-label="' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          '"><input type="checkbox" data-field="required"' +
          (f.required !== false ? " checked" : "") +
          ' /><span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span></label>' +
          '<div class="vc-dash-tk-forms__dual-wrap">' +
          '<span class="vc-dash-tk-forms__len-bubble" data-len-min>' +
          escHtml(String(lenMin)) +
          "</span>" +
          '<span class="vc-dash-tk-forms__len-bubble" data-len-max>' +
          escHtml(String(lenMax)) +
          "</span>" +
          '<div class="vc-dash-tk-forms__dual">' +
          '<div class="vc-dash-tk-forms__dual-rail" aria-hidden="true"></div>' +
          '<div class="vc-dash-tk-forms__dual-fill" data-len-fill aria-hidden="true"></div>' +
          '<input type="range" data-field="minLength" min="0" max="' +
          escHtml(String(lenCap)) +
          '" step="1" value="' +
          escHtml(String(lenMin)) +
          '" aria-label="Min length" />' +
          '<input type="range" data-field="maxLength" min="0" max="' +
          escHtml(String(lenCap)) +
          '" step="1" value="' +
          escHtml(String(lenMax)) +
          '" aria-label="Max length" />' +
          "</div></div>" +
          "</div></div></div></div>" +
          '<div class="vc-dash-tk-forms__type-body" data-tk-form-show="selectish" hidden>' +
          '<div class="vc-dash-tk-forms__config">' +
          '<div class="vc-dash-tk-forms__config-head">' +
          '<h4 class="vc-dash-tk-forms__config-title" data-tk-form-config-title>' +
          escHtml(TICKET_FORM_TYPE_CONFIG_TITLES[type] || "Configuration") +
          "</h4>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--primary" data-tk-form-add-option="1" data-tk-form-show="options" hidden>' +
          '<i class="fa fa-plus" aria-hidden="true"></i> ' +
          escHtml(i18n("dash.tickets.formsAddOption", "Add Option")) +
          "</button>" +
          "</div>" +
          '<div class="vc-dash-tk-forms__options-list" data-tk-form-show="options" hidden>' +
          renderTicketFormOptionsHtml(f) +
          "</div>" +
          '<p class="vc-dash-tk-forms__field-error" data-tk-form-options-error data-tk-form-show="options" hidden></p>' +
          '<div class="vc-dash-tk-forms__minmax" data-tk-form-show="minmax" hidden>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsMinSelections", "Minimum selections")) +
          '</span><input type="number" data-field="minValues" min="0" max="25" value="' +
          escHtml(String(f.minValues != null ? f.minValues : minValuesDefault)) +
          '" /></label>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsMaxSelections", "Maximum selections")) +
          '</span><input type="number" data-field="maxValues" min="1" max="25" value="' +
          escHtml(String(f.maxValues != null ? f.maxValues : maxValuesDefault)) +
          '" /></label>' +
          "</div>" +
          '<div class="vc-dash-tk-forms__req">' +
          '<span class="vc-dash-picker__label">' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          "</span>" +
          '<label class="vc-dash-switch vc-dash-switch--solo" aria-label="' +
          escHtml(i18n("dash.tickets.formsFieldRequired", "Required")) +
          '"><input type="checkbox" data-field="required-select"' +
          (f.required !== false ? " checked" : "") +
          ' /><span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span></label>' +
          "</div>" +
          "</div></div></div>"
        );
      })
      .join("");
    Array.prototype.forEach.call(root.querySelectorAll("[data-tk-form-field]"), function (el) {
      var typeEl = el.querySelector("[data-field='type']");
      var styleEl = el.querySelector("[data-field='style']");
      var reqText = el.querySelector('[data-field="required"]');
      var reqSelect = el.querySelector('[data-field="required-select"]');
      var fieldId = el.getAttribute("data-tk-form-field");
      var src = state.ticketFormsDraftFields.find(function (x) {
        return String(x.id) === String(fieldId);
      });
      if (typeEl && src) typeEl.value = src.type || "text_input";
      if (styleEl && src) styleEl.value = src.style === "paragraph" ? "paragraph" : "short";
      if (reqText && src) reqText.checked = src.required !== false;
      if (reqSelect && src) reqSelect.checked = src.required !== false;
      syncTicketFormFieldCardUi(el);
    });
    enhanceAllDashFancySelects(byId("tk-forms-root") || document);
    requestAnimationFrame(function () {
      Array.prototype.forEach.call(root.querySelectorAll("[data-tk-form-field]"), function (el) {
        syncTicketFormLengthSlider(el);
      });
    });
  }

  function renderTicketFormsEditor() {
    fillTicketFormsSelect();
    var form = getSelectedTicketForm();
    if (!form) {
      state.ticketFormsDraftFields = null;
      state.ticketFormsDraftFormId = null;
      state.ticketFormsDraftDirty = false;
    } else if (
      state.ticketFormsDraftDirty &&
      Array.isArray(state.ticketFormsDraftFields) &&
      String(state.ticketFormsDraftFormId || "") === String(form.id)
    ) {
      // mantieni bozza non salvata
    } else {
      state.ticketFormsDraftFields = (form.fields || []).map(function (f) {
        return Object.assign({}, f, { options: Array.isArray(f.options) ? f.options.slice() : [] });
      });
      // Form senza campi: mostra subito un campo editabile.
      if (!state.ticketFormsDraftFields.length) {
        state.ticketFormsDraftFields = [newTicketFormFieldDraft()];
        state.ticketFormsDraftDirty = true;
      } else {
        state.ticketFormsDraftDirty = false;
      }
      state.ticketFormsDraftFormId = form.id;
    }
    renderTicketFormsFields();
    updateTicketFormsDiscordHint(form);
  }

  function updateTicketFormsDiscordHint(form) {
    var hint = byId("tk-forms-discord-hint");
    if (!hint) return;
    var fields = Array.isArray(form && form.fields)
      ? form.fields
      : Array.isArray(state.ticketFormsDraftFields)
        ? state.ticketFormsDraftFields
        : [];
    var textCount = fields.filter(function (f) {
      return f && (f.type === "text_input" || !f.type);
    }).length;
    var otherCount = fields.length - textCount;
    if (!fields.length) {
      hint.hidden = true;
      return;
    }
    hint.hidden = false;
    if (textCount === 0) {
      hint.textContent = i18n(
        "dash.tickets.formsDiscordHintNone",
        "Attenzione: in Discord all'apertura ticket compaiono solo i campi Text Input. Questo form non ne ha — il modal non si aprirà.",
      );
      hint.classList.add("is-warn");
    } else if (otherCount > 0) {
      hint.textContent = i18n(
        "dash.tickets.formsDiscordHintPartial",
        "In Discord all'apertura ticket compaiono solo i campi Text Input ({n} di {total}). Gli altri tipi restano salvati ma non nel modal.",
      )
        .replace("{n}", String(textCount))
        .replace("{total}", String(fields.length));
      hint.classList.add("is-warn");
    } else {
      hint.textContent = i18n(
        "dash.tickets.formsDiscordHintOk",
        "All'apertura ticket in Discord verrà mostrato questo form (modal, max 5 Text Input).",
      );
      hint.classList.remove("is-warn");
    }
  }

  async function refreshTicketForms(options) {
    options = options || {};
    if (!state.guildId || !getToken()) return;
    if (state.ticketFormsLoading) return;
    state.ticketFormsLoading = true;
    try {
      var out = await ticketFormsApi("/forms", "GET");
      if (!out.res || !out.res.ok || !out.data || !out.data.ok) {
        if (!options.silent) {
          setError(
            (out.data && out.data.message) ||
              i18n("dash.tickets.formsErrLoad", "Impossibile caricare i form."),
          );
        }
        return;
      }
      state.ticketForms = out.data;
      if (!state.ticketFormsSelectedId && out.data.forms && out.data.forms[0]) {
        state.ticketFormsSelectedId = String(out.data.forms[0].id);
      } else if (
        state.ticketFormsSelectedId &&
        !(out.data.forms || []).some(function (f) {
          return String(f.id) === String(state.ticketFormsSelectedId);
        })
      ) {
        state.ticketFormsSelectedId =
          out.data.forms && out.data.forms[0] ? String(out.data.forms[0].id) : null;
        state.ticketFormsDraftFields = null;
        state.ticketFormsDraftFormId = null;
        state.ticketFormsDraftDirty = false;
      }
      renderTicketFormsEditor();
      fillTicketPanelFormSelects(
        (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
      );
    } catch (_) {
      if (!options.silent) {
        setError(i18n("dash.tickets.formsErrLoad", "Impossibile caricare i form."));
      }
    } finally {
      state.ticketFormsLoading = false;
    }
  }

  function wireTicketFormsUi() {
    var createForm = byId("tk-forms-create-form");
    if (createForm && !createForm.__vcWired) {
      createForm.__vcWired = true;
      createForm.addEventListener("submit", async function (ev) {
        ev.preventDefault();
        if (state.ticketFormsSaving) return;
        var titleEl = byId("tk-forms-create-title");
        var title = String((titleEl && titleEl.value) || "").trim();
        if (!title) return;
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms", "POST", { title: title });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrCreate", "Creazione form non riuscita."),
              true,
            );
            return;
          }
          if (titleEl) titleEl.value = "";
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          if (out.data.form) {
            state.ticketFormsSelectedId = String(out.data.form.id);
            // Apri subito l'editor con un campo vuoto (come TicketsBot).
            state.ticketFormsDraftFields = [newTicketFormFieldDraft()];
            state.ticketFormsDraftFormId = out.data.form.id;
            state.ticketFormsDraftDirty = true;
          }
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsCreated", "Form creato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var select = byId("tk-forms-select");
    if (select && !select.__vcWired) {
      select.__vcWired = true;
      select.addEventListener("change", function () {
        state.ticketFormsSelectedId = String(select.value || "").trim() || null;
        state.ticketFormsDraftFields = null;
        state.ticketFormsDraftFormId = null;
        state.ticketFormsDraftDirty = false;
        renderTicketFormsEditor();
      });
    }

    var renameBtn = byId("tk-forms-rename-btn");
    if (renameBtn && !renameBtn.__vcWired) {
      renameBtn.__vcWired = true;
      renameBtn.addEventListener("click", async function () {
        var form = getSelectedTicketForm();
        if (!form || state.ticketFormsSaving) return;
        var next = window.prompt(
          i18n("dash.tickets.formsRenamePrompt", "Nuovo titolo del form:"),
          String(form.title || ""),
        );
        if (next == null) return;
        next = String(next).trim();
        if (!next || next === form.title) return;
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms/" + encodeURIComponent(form.id), "PATCH", {
            title: next,
            fields: collectTicketFormFieldsFromDom(),
          });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrSave", "Salvataggio non riuscito."),
              true,
            );
            return;
          }
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          state.ticketFormsDraftFields = null;
          state.ticketFormsDraftFormId = null;
          state.ticketFormsDraftDirty = false;
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsSaved", "Form aggiornato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var deleteBtn = byId("tk-forms-delete-btn");
    if (deleteBtn && !deleteBtn.__vcWired) {
      deleteBtn.__vcWired = true;
      deleteBtn.addEventListener("click", async function () {
        var form = getSelectedTicketForm();
        if (!form || state.ticketFormsSaving) return;
        var formName = String(form.title || "").trim() || form.id;
        var ok = await (window.VcDialog
          ? window.VcDialog.confirm({
              title: i18n("dash.tickets.formsDeleteTitle", "Eliminare il form?"),
              message: i18n(
                "dash.tickets.formsConfirmDelete",
                "Eliminare il form «{name}»? L'operazione non si può annullare.",
              ).replace("{name}", formName),
              confirmLabel: i18n("dash.tickets.formsDeleteNamed", "Elimina {name}").replace(
                "{name}",
                formName,
              ),
              cancelLabel: i18n("dash.bl.cancel", "Annulla"),
              danger: true,
              icon: "fa-trash-o",
            })
          : Promise.resolve(
              window.confirm(
                i18n("dash.tickets.formsConfirmDelete", "Eliminare il form «{name}»?").replace(
                  "{name}",
                  formName,
                ),
              ),
            ));
        if (!ok) return;
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms/" + encodeURIComponent(form.id), "DELETE");
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrDelete", "Eliminazione non riuscita."),
              true,
            );
            return;
          }
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          state.ticketFormsSelectedId =
            out.data.forms && out.data.forms[0] ? String(out.data.forms[0].id) : null;
          state.ticketFormsDraftFields = null;
          state.ticketFormsDraftFormId = null;
          state.ticketFormsDraftDirty = false;
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsDeleted", "Form eliminato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var addBtn = byId("tk-forms-add-field-btn");
    if (addBtn && !addBtn.__vcWired) {
      addBtn.__vcWired = true;
      addBtn.addEventListener("click", function () {
        var max = (state.ticketForms && state.ticketForms.quotas && state.ticketForms.quotas.maxFields) || 5;
        state.ticketFormsDraftFields = collectTicketFormFieldsFromDom();
        if (state.ticketFormsDraftFields.length >= max) {
          showSaveToast(
            i18n("dash.tickets.formsMaxFields", "Massimo {n} campi per form.").replace("{n}", String(max)),
            true,
          );
          return;
        }
        state.ticketFormsDraftFields.push(newTicketFormFieldDraft());
        var form = getSelectedTicketForm();
        if (form) state.ticketFormsDraftFormId = form.id;
        state.ticketFormsDraftDirty = true;
        renderTicketFormsFields();
        updateTicketFormsDiscordHint(form);
      });
    }

    var saveBtn = byId("tk-forms-save-btn");
    if (saveBtn && !saveBtn.__vcWired) {
      saveBtn.__vcWired = true;
      saveBtn.addEventListener("click", async function () {
        var form = getSelectedTicketForm();
        if (!form || state.ticketFormsSaving) return;
        var fields = collectTicketFormFieldsFromDom();
        var invalidMsg = "";
        fields.some(function (f) {
          var msg = ticketFormFieldValidationMessage(f);
          if (msg) {
            invalidMsg = msg;
            return true;
          }
          return false;
        });
        if (invalidMsg) {
          state.ticketFormsDraftFields = fields;
          state.ticketFormsDraftFormId = form.id;
          state.ticketFormsDraftDirty = true;
          renderTicketFormsFields();
          updateTicketFormsDiscordHint(form);
          showSaveToast(invalidMsg, true);
          return;
        }
        state.ticketFormsSaving = true;
        try {
          var out = await ticketFormsApi("/forms/" + encodeURIComponent(form.id), "PATCH", {
            fields: fields,
          });
          if (!out.res.ok || !out.data || !out.data.ok) {
            showSaveToast(
              (out.data && out.data.message) ||
                i18n("dash.tickets.formsErrSave", "Salvataggio non riuscito."),
              true,
            );
            return;
          }
          state.ticketForms = Object.assign({}, state.ticketForms || {}, {
            forms: out.data.forms || [],
          });
          state.ticketFormsDraftFields = null;
          state.ticketFormsDraftFormId = null;
          state.ticketFormsDraftDirty = false;
          renderTicketFormsEditor();
          fillTicketPanelFormSelects(
            (state.ticketPanelsEditor && state.ticketPanelsEditor.panel) || null,
          );
          showSaveToast(i18n("dash.tickets.formsSaved", "Form salvato."));
        } finally {
          state.ticketFormsSaving = false;
        }
      });
    }

    var fieldsRoot = byId("tk-forms-fields");
    if (fieldsRoot && !fieldsRoot.__vcWired) {
      fieldsRoot.__vcWired = true;
      fieldsRoot.addEventListener("input", function (ev) {
        var t = ev.target;
        if (!t) return;
        state.ticketFormsDraftDirty = true;
        var card = t.closest ? t.closest("[data-tk-form-field]") : null;
        if (!card) return;
        var field = t.getAttribute && t.getAttribute("data-field");
        if (field === "minLength" || field === "maxLength") {
          syncTicketFormLengthSlider(card);
          return;
        }
        syncTicketFormFieldCardUi(card);
        updateTicketFormsDiscordHint(getSelectedTicketForm());
      });
      fieldsRoot.addEventListener("change", function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        state.ticketFormsDraftDirty = true;
        var field = t.getAttribute("data-field");
        var card = t.closest ? t.closest("[data-tk-form-field]") : null;
        if (!card) return;
        if (field === "style") {
          syncTicketFormTextStyleUi(card);
          return;
        }
        if (field !== "type") return;
        var nextType = String(t.value || "text_input");
        if (!ticketFormTypeNeedsOptions(nextType)) {
          var optsList = card.querySelector(".vc-dash-tk-forms__options-list");
          if (optsList) optsList.innerHTML = "";
        }
        var minEl = card.querySelector("[data-field='minValues']");
        var maxEl = card.querySelector("[data-field='maxValues']");
        if (!ticketFormTypeSupportsMinMax(nextType)) {
          if (minEl) minEl.value = nextType === "radio_group" ? "1" : "0";
          if (maxEl) maxEl.value = "1";
        } else {
          if (minEl && !String(minEl.value || "").trim()) {
            minEl.value = nextType === "string_select" ? "1" : "0";
          }
          if (maxEl && !String(maxEl.value || "").trim()) {
            maxEl.value = nextType === "string_select" ? "1" : "25";
          }
        }
        syncTicketFormFieldCardUi(card);
        updateTicketFormsDiscordHint(getSelectedTicketForm());
      });
      fieldsRoot.addEventListener("click", function (ev) {
        var addOpt = ev.target && ev.target.closest ? ev.target.closest("[data-tk-form-add-option]") : null;
        if (addOpt) {
          var addCard = addOpt.closest("[data-tk-form-field]");
          if (!addCard) return;
          var fieldsAdd = collectTicketFormFieldsFromDom();
          var addId = String(addCard.getAttribute("data-tk-form-field") || "");
          var addIdx = fieldsAdd.findIndex(function (f) {
            return String(f.id) === addId;
          });
          if (addIdx < 0) return;
          var maxOpts = ticketFormMaxOptions(fieldsAdd[addIdx].type);
          fieldsAdd[addIdx].options = fieldsAdd[addIdx].options || [];
          if (fieldsAdd[addIdx].options.length >= maxOpts) {
            showSaveToast(
              i18n("dash.tickets.formsOptsMax", "Massimo {n} opzioni.").replace("{n}", String(maxOpts)),
              true,
            );
            return;
          }
          fieldsAdd[addIdx].options.push(newTicketFormOptionDraft());
          state.ticketFormsDraftFields = fieldsAdd;
          var formAdd = getSelectedTicketForm();
          if (formAdd) state.ticketFormsDraftFormId = formAdd.id;
          state.ticketFormsDraftDirty = true;
          renderTicketFormsFields();
          updateTicketFormsDiscordHint(formAdd);
          return;
        }
        var remOpt =
          ev.target && ev.target.closest ? ev.target.closest("[data-tk-form-option-remove]") : null;
        if (remOpt) {
          var optRow = remOpt.closest("[data-tk-form-option]");
          var remCard = remOpt.closest("[data-tk-form-field]");
          if (!optRow || !remCard) return;
          var fieldsRem = collectTicketFormFieldsFromDom();
          var remId = String(remCard.getAttribute("data-tk-form-field") || "");
          var remIdx = fieldsRem.findIndex(function (f) {
            return String(f.id) === remId;
          });
          var optId = String(optRow.getAttribute("data-tk-form-option") || "");
          if (remIdx < 0) return;
          fieldsRem[remIdx].options = (fieldsRem[remIdx].options || []).filter(function (o) {
            return String(o.id) !== optId;
          });
          state.ticketFormsDraftFields = fieldsRem;
          var formRem = getSelectedTicketForm();
          if (formRem) state.ticketFormsDraftFormId = formRem.id;
          state.ticketFormsDraftDirty = true;
          renderTicketFormsFields();
          updateTicketFormsDiscordHint(formRem);
          return;
        }
        var btn =
          ev.target && ev.target.closest
            ? ev.target.closest("[data-tk-form-field-remove],[data-tk-form-move]")
            : null;
        if (!btn || btn.disabled) return;
        var card = btn.closest("[data-tk-form-field]");
        if (!card) return;
        var fields = collectTicketFormFieldsFromDom();
        var id = String(card.getAttribute("data-tk-form-field") || "");
        var idx = fields.findIndex(function (f) {
          return String(f.id) === id;
        });
        if (idx < 0) return;
        if (btn.hasAttribute("data-tk-form-field-remove")) {
          fields.splice(idx, 1);
        } else {
          var dir = btn.getAttribute("data-tk-form-move");
          var swap = dir === "up" ? idx - 1 : idx + 1;
          if (swap < 0 || swap >= fields.length) return;
          var tmp = fields[idx];
          fields[idx] = fields[swap];
          fields[swap] = tmp;
        }
        state.ticketFormsDraftFields = fields;
        var form = getSelectedTicketForm();
        if (form) state.ticketFormsDraftFormId = form.id;
        state.ticketFormsDraftDirty = true;
        renderTicketFormsFields();
        updateTicketFormsDiscordHint(form);
      });
    }
  }

  function scrollTicketPanelsViewTop() {
    try {
      var view = byId("vc-dashboard-view-tickets-pannelli");
      if (view && view.scrollIntoView) view.scrollIntoView({ block: "start" });
      window.scrollTo(0, 0);
    } catch (_) {}
  }

  function setTicketPanelsMode(mode) {
    var intro = byId("tk-panels-intro");
    var list = byId("tk-panels-root");
    var editor = byId("tk-panel-editor");
    var multiEditor = byId("tk-multipanel-editor");
    var grid = list ? list.querySelector(".vc-dash-tk-panels__grid") : null;
    var isList = mode === "list";
    if (intro) {
      if (isList) intro.removeAttribute("hidden");
      else intro.setAttribute("hidden", "");
    }
    if (grid) {
      if (isList) grid.removeAttribute("hidden");
      else grid.setAttribute("hidden", "");
    }
    if (editor) {
      if (mode === "single") editor.removeAttribute("hidden");
      else editor.setAttribute("hidden", "");
    }
    if (multiEditor) {
      if (mode === "multi") multiEditor.removeAttribute("hidden");
      else multiEditor.setAttribute("hidden", "");
    }
    if (!isList) scrollTicketPanelsViewTop();
  }

  function parseTicketPanelsRoute() {
    var v = String(window.location.hash || "")
      .replace(/^#/, "")
      .trim();
    if (!v || v === "tickets/pannelli") return { mode: "list", id: null };
    if (v === "tickets/pannelli/new") return { mode: "single", id: null };
    if (v === "tickets/pannelli/m/new") return { mode: "multi", id: null };
    var single = v.match(/^tickets\/pannelli\/p\/([^/?#]+)$/);
    if (single) return { mode: "single", id: decodeURIComponent(single[1]) };
    var multi = v.match(/^tickets\/pannelli\/m\/([^/?#]+)$/);
    if (multi) return { mode: "multi", id: decodeURIComponent(multi[1]) };
    if (v.indexOf("tickets/pannelli/") === 0) return { mode: "list", id: null };
    return null;
  }

  function ticketPanelsRouteHash(mode, id) {
    if (mode === "single") {
      return id ? "tickets/pannelli/p/" + encodeURIComponent(id) : "tickets/pannelli/new";
    }
    if (mode === "multi") {
      return id ? "tickets/pannelli/m/" + encodeURIComponent(id) : "tickets/pannelli/m/new";
    }
    return "tickets/pannelli";
  }

  function setTicketPanelsRoute(mode, id, options) {
    var opts = options || {};
    var next = ticketPanelsRouteHash(mode, id);
    var want = "#" + next;
    if ((window.location.hash || "") === want) return;
    var url = window.location.pathname + window.location.search + want;
    try {
      if (opts.replace === true) history.replaceState(null, "", url);
      else history.pushState(null, "", url);
    } catch (_) {
      window.location.hash = next;
    }
  }

  function ticketPanelsDraftKey() {
    return "vcDashTkPanelDraft:v1:" + String(state.guildId || "");
  }

  function readTicketPanelsDraft() {
    try {
      var raw = sessionStorage.getItem(ticketPanelsDraftKey());
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function writeTicketPanelsDraft(payload) {
    try {
      sessionStorage.setItem(ticketPanelsDraftKey(), JSON.stringify(payload));
    } catch (_) {}
  }

  function clearTicketPanelsDraft() {
    try {
      sessionStorage.removeItem(ticketPanelsDraftKey());
    } catch (_) {}
  }

  function scheduleTicketPanelsDraftSave() {
    if (state.ticketPanelsDraftTimer) clearTimeout(state.ticketPanelsDraftTimer);
    state.ticketPanelsDraftTimer = setTimeout(function () {
      state.ticketPanelsDraftTimer = null;
      persistTicketPanelsDraftNow();
    }, 250);
  }

  function persistTicketPanelsDraftNow() {
    var editor = byId("tk-panel-editor");
    var multiEditor = byId("tk-multipanel-editor");
    var singleOpen = editor && !editor.hasAttribute("hidden");
    var multiOpen = multiEditor && !multiEditor.hasAttribute("hidden");
    if (!singleOpen && !multiOpen) return;
    if (singleOpen) {
      var sid = String((byId("tk-panel-id") && byId("tk-panel-id").value) || "").trim() || null;
      var form = readSinglePanelForm();
      delete form.publish;
      writeTicketPanelsDraft({
        mode: "single",
        id: sid,
        form: form,
        updatedAt: Date.now(),
      });
      return;
    }
    var mid = String((byId("tk-multipanel-id") && byId("tk-multipanel-id").value) || "").trim() || null;
    var multiForm = readMultiPanelForm();
    delete multiForm.publish;
    writeTicketPanelsDraft({
      mode: "multi",
      id: mid,
      form: multiForm,
      updatedAt: Date.now(),
    });
  }

  function draftMatchesRoute(draft, route) {
    if (!draft || !route) return false;
    if (String(draft.mode || "") !== String(route.mode || "")) return false;
    return String(draft.id || "") === String(route.id || "");
  }

  function applySinglePanelFormData(data) {
    if (!data || typeof data !== "object") return;
    if (data.ticketType != null) setValue("tk-panel-ticketType", data.ticketType);
    if (data.channelId != null) setValue("tk-panel-channelId", data.channelId || "");
    if (data.title != null) setValue("tk-panel-title", data.title);
    if (data.color != null) setValue("tk-panel-color", data.color || "#6f4e37");
    if (data.content != null) setValue("tk-panel-content", data.content);
    if (data.buttonText != null) setValue("tk-panel-buttonText", data.buttonText);
    if (data.buttonStyle != null) setValue("tk-panel-buttonStyle", data.buttonStyle);
    if (data.buttonEmoji != null) {
      setValue(
        "tk-panel-buttonEmoji",
        typeof data.buttonEmoji === "string"
          ? data.buttonEmoji
          : data.buttonEmoji && data.buttonEmoji.id
            ? "<" +
              (data.buttonEmoji.animated ? "a" : "") +
              ":" +
              (data.buttonEmoji.name || "e") +
              ":" +
              data.buttonEmoji.id +
              ">"
            : data.buttonEmoji && data.buttonEmoji.name
              ? data.buttonEmoji.name
              : "",
      );
      syncTicketPanelButtonEmojiUi({ silent: true });
    }
    if (data.largeImageUrl != null) setValue("tk-panel-largeImageUrl", data.largeImageUrl || "");
    if (data.smallImageUrl != null) setValue("tk-panel-smallImageUrl", data.smallImageUrl || "");
    if (data.disabled != null) setChecked("tk-panel-disabled", Boolean(data.disabled));
    if (data.deleteMentionsOnOpen != null) {
      setChecked("tk-panel-deleteMentionsOnOpen", data.deleteMentionsOnOpen === true);
    }
    if (data.openCooldownSeconds != null) setValue("tk-panel-openCooldownSeconds", data.openCooldownSeconds || 0);
    if (Object.prototype.hasOwnProperty.call(data, "maxOpenTicketsPerUser")) {
      setValue(
        "tk-panel-maxOpenTicketsPerUser",
        data.maxOpenTicketsPerUser != null ? data.maxOpenTicketsPerUser : "",
      );
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseButton")) {
      setValue("tk-panel-hideCloseButton", triStateSelectValue(data.hideCloseButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseReasonButton")) {
      setValue("tk-panel-hideCloseReasonButton", triStateSelectValue(data.hideCloseReasonButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideClaimButton")) {
      setValue("tk-panel-hideClaimButton", triStateSelectValue(data.hideClaimButton));
    }
    if (data.formId != null) setValue("tk-panel-formId", data.formId || "");
    if (data.transcriptChannelId != null) {
      setValue("tk-panel-transcriptChannelId", data.transcriptChannelId || "");
    }
    if (data.categoryId != null) setValue("tk-panel-categoryId", data.categoryId || "");
    if (data.welcome) fillWelcomeForm(data.welcome);
    if (Object.prototype.hasOwnProperty.call(data, "ticketPerms")) fillTicketPermsForm(data.ticketPerms);
    if (data.accessRules) renderAccessRulesList(data.accessRules);
    if (data.supportHours) fillSupportHoursForm(data.supportHours);
    if (data.mentionOnOpen) {
      var pickers = (state.ticketPanels && state.ticketPanels.pickers) || state.ticketsPickers || {};
      renderMentionPillSelect(
        "tk-panel-mentionOnOpen-list",
        pickers.roles || [],
        data.mentionOnOpen,
        TICKET_PANEL_MENTION_EXTRA_ITEMS,
      );
    }
    if (data.supportTeamIds) {
      var teamExtrasDraft = ((state.ticketPanels && state.ticketPanels.teams) || []).map(function (t) {
        return { value: String(t.id), label: String(t.name || t.id) };
      });
      renderMentionPillSelect(
        "tk-panel-supportTeamIds-list",
        [],
        data.supportTeamIds,
        teamExtrasDraft,
        {
          placeholder: i18n("dash.tickets.teamsSearchPh", "Cerca team…"),
          emptyLabel: i18n("dash.tickets.teamsNone", "Nessun team"),
        },
      );
    }
    syncTicketPanelGlobalInheritedControls(data);
    // Ripristina override espliciti dopo rebuild delle option «Globale».
    if (Object.prototype.hasOwnProperty.call(data, "maxOpenTicketsPerUser")) {
      setValue(
        "tk-panel-maxOpenTicketsPerUser",
        data.maxOpenTicketsPerUser != null ? data.maxOpenTicketsPerUser : "",
      );
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseButton")) {
      setValue("tk-panel-hideCloseButton", triStateSelectValue(data.hideCloseButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideCloseReasonButton")) {
      setValue("tk-panel-hideCloseReasonButton", triStateSelectValue(data.hideCloseReasonButton));
    }
    if (Object.prototype.hasOwnProperty.call(data, "hideClaimButton")) {
      setValue("tk-panel-hideClaimButton", triStateSelectValue(data.hideClaimButton));
    }
    if (data.transcriptChannelId != null) {
      setValue("tk-panel-transcriptChannelId", data.transcriptChannelId || "");
    }
    if (data.categoryId != null) setValue("tk-panel-categoryId", data.categoryId || "");
    enhanceAllDashFancySelects(byId("tk-panel-editor") || document);
  }

  function syncMultiPanelDropdownPlaceholderUi() {
    var toggle = byId("tk-multipanel-useDropdown");
    var input = byId("tk-multipanel-dropdownPlaceholder");
    if (!input) return;
    var enabled = !toggle || toggle.checked;
    input.disabled = !enabled;
    input.setAttribute("aria-disabled", enabled ? "false" : "true");
    var wrap = input.closest(".vc-dash-picker");
    if (wrap) wrap.classList.toggle("is-disabled", !enabled);
    if (!String(input.value || "").trim()) {
      input.value = "";
      input.placeholder = "Seleziona un argomento...";
    }
  }

  function applyMultiPanelFormData(data) {
    if (!data || typeof data !== "object") return;
    if (data.channelId != null) setValue("tk-multipanel-channelId", data.channelId || "");
    if (data.useDropdown != null) setChecked("tk-multipanel-useDropdown", data.useDropdown !== false);
    if (data.dropdownPlaceholder != null) {
      setValue("tk-multipanel-dropdownPlaceholder", data.dropdownPlaceholder || "");
    }
    if (data.title != null) setValue("tk-multipanel-title", data.title || "");
    if (data.titleUrl != null) setValue("tk-multipanel-titleUrl", data.titleUrl || "");
    if (data.color != null) setValue("tk-multipanel-color", data.color || "#6f4e37");
    if (data.description != null) setValue("tk-multipanel-description", data.description || "");
    if (data.authorName != null) setValue("tk-multipanel-authorName", data.authorName || "");
    if (data.authorIconUrl != null) setValue("tk-multipanel-authorIconUrl", data.authorIconUrl || "");
    if (data.authorUrl != null) setValue("tk-multipanel-authorUrl", data.authorUrl || "");
    if (data.largeImageUrl != null) setValue("tk-multipanel-largeImageUrl", data.largeImageUrl || "");
    if (data.smallImageUrl != null) setValue("tk-multipanel-smallImageUrl", data.smallImageUrl || "");
    if (data.footerText != null) setValue("tk-multipanel-footerText", data.footerText || "");
    if (data.footerIconUrl != null) setValue("tk-multipanel-footerIconUrl", data.footerIconUrl || "");
    if (data.footerTimestamp != null) setChecked("tk-multipanel-footerTimestamp", Boolean(data.footerTimestamp));
    if (data.fields) renderMultiPanelFieldsList(data.fields);
    if (data.panelIds && data.panelIds.length) {
      fillMultiPanelSelectOptions(data.panelIds, data.optionOverrides || {});
    } else if (data.optionOverrides) {
      renderMultiPanelOptionCustomizations(data.optionOverrides);
    }
    syncMultiPanelDropdownPlaceholderUi();
    enhanceAllDashFancySelects(byId("tk-multipanel-editor") || document);
  }

  function restoreTicketPanelsEditorFromRoute(options) {
    var opts = options || {};
    var route = parseTicketPanelsRoute() || { mode: "list", id: null };
    var draft = opts.applyDraft ? readTicketPanelsDraft() : null;
    state.ticketPanelsEditor = { mode: route.mode, id: route.id };

    if (route.mode === "list") {
      setTicketPanelsMode("list");
      return;
    }

    if (route.mode === "single") {
      var panel = null;
      if (route.id) {
        panel =
          ((state.ticketPanels && state.ticketPanels.singles) || []).find(function (p) {
            return String(p.id) === String(route.id);
          }) || null;
        if (!panel) {
          setTicketPanelsRoute("list", null, { replace: true });
          setTicketPanelsMode("list");
          return;
        }
      }
      openSinglePanelEditor(panel, { skipRoute: true, skipDraft: true });
      if (draftMatchesRoute(draft, route) && draft.form) {
        applySinglePanelFormData(draft.form);
      }
      return;
    }

    if (route.mode === "multi") {
      var multi = null;
      if (route.id) {
        multi =
          ((state.ticketPanels && state.ticketPanels.multis) || []).find(function (m) {
            return String(m.id) === String(route.id);
          }) || null;
        if (!multi) {
          setTicketPanelsRoute("list", null, { replace: true });
          setTicketPanelsMode("list");
          return;
        }
      }
      openMultiPanelEditor(multi, { skipRoute: true, skipDraft: true });
      if (draftMatchesRoute(draft, route) && draft.form) applyMultiPanelFormData(draft.form);
    }
  }

  function showTicketPanelsList() {
    persistTicketPanelsDraftNow();
    state.ticketPanelsEditor = { mode: "list", id: null };
    setTicketPanelsRoute("list", null, { replace: true });
    setTicketPanelsMode("list");
  }

  var TICKET_PANEL_MENTION_EXTRA_ITEMS = [
    { value: "opener", label: "Ticket Opener" },
    { value: "everyone", label: "@everyone" },
    { value: "here", label: "@here" },
  ];
  var TICKET_PANEL_PERM_KEYS = [
    "addReactions",
    "sendTtsMessages",
    "embedLinks",
    "attachFiles",
    "useExternalEmojis",
    "useExternalStickers",
    "sendVoiceMessages",
  ];
  var TICKET_PANEL_SUPPORT_HOURS_DAYS = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  function triStateSelectValue(value) {
    if (value === true) return "1";
    if (value === false) return "0";
    return "";
  }

  function triStateFromSelectValue(value) {
    if (value === "1") return true;
    if (value === "0") return false;
    return null;
  }

  function mentionOptionLabel(value, roles, extraItems) {
    var v = String(value || "");
    var extras = extraItems || TICKET_PANEL_MENTION_EXTRA_ITEMS;
    for (var i = 0; i < extras.length; i += 1) {
      if (String(extras[i].value) === v) return extras[i].label;
    }
    var list = roles || [];
    for (var r = 0; r < list.length; r += 1) {
      if (String(list[r].id) === v) return "@" + String(list[r].name || v);
    }
    return v.indexOf("@") === 0 ? v : "@" + v;
  }

  function closeAllMentionPillSelects(exceptRoot) {
    Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-pillsel.is-open"), function (root) {
      if (exceptRoot && root === exceptRoot) return;
      root.classList.remove("is-open");
      var input = root.querySelector(".vc-dash-tk-pillsel__input");
      if (input) input.value = "";
      var menu = root.__vcPillMenu;
      if (menu) {
        menu.setAttribute("hidden", "");
        menu.classList.remove("is-fixed-pos");
        menu.style.cssText = "";
        if (menu.__vcHomeParent && menu.parentElement !== menu.__vcHomeParent) {
          menu.__vcHomeParent.appendChild(menu);
        }
      }
    });
  }

  function positionMentionPillMenu(root) {
    var menu = root && root.__vcPillMenu;
    var control = root && root.querySelector(".vc-dash-tk-pillsel__control");
    if (!menu || !control) return;
    if (!menu.__vcHomeParent) menu.__vcHomeParent = root;
    if (menu.parentElement !== document.body) document.body.appendChild(menu);
    var rect = control.getBoundingClientRect();
    var gap = 6;
    var spaceBelow = Math.max(0, window.innerHeight - rect.bottom - gap - 8);
    var spaceAbove = Math.max(0, rect.top - gap - 8);
    var preferUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    var available = preferUp ? spaceAbove : spaceBelow;
    var maxH = Math.max(140, Math.min(280, available));
    menu.classList.add("is-fixed-pos");
    menu.style.position = "fixed";
    menu.style.left =
      Math.max(8, Math.min(window.innerWidth - 8 - Math.round(rect.width), Math.round(rect.left))) + "px";
    menu.style.width = Math.max(160, Math.round(rect.width)) + "px";
    menu.style.right = "auto";
    menu.style.zIndex = "10360";
    menu.style.maxHeight = maxH + "px";
    if (preferUp) {
      menu.style.top = "auto";
      menu.style.bottom = Math.max(8, Math.round(window.innerHeight - rect.top + gap)) + "px";
    } else {
      menu.style.bottom = "auto";
      menu.style.top = Math.round(rect.bottom + gap) + "px";
    }
  }

  function renderMentionPillSelect(containerId, roles, selectedIds, extraItems, options) {
    var root = byId(containerId);
    if (!root) return;
    var opts = options && typeof options === "object" ? options : {};
    var extras = extraItems || TICKET_PANEL_MENTION_EXTRA_ITEMS;
    var roleList = Array.isArray(roles) ? roles : [];
    var values = [];
    var seen = {};
    (selectedIds || []).forEach(function (id) {
      var v = String(id || "").trim();
      if (!v || seen[v]) return;
      seen[v] = true;
      values.push(v);
    });
    root.className = "vc-dash-tk-pillsel";
    root.__vcPillValues = values.slice();
    root.__vcPillRoles = roleList;
    root.__vcPillExtras = extras;
    root.__vcPillPlaceholder = String(opts.placeholder || "Cerca ruolo…");
    root.__vcPillEmptyLabel = String(opts.emptyLabel || "");
    root.__vcPillNoResultsLabel = String(opts.noResultsLabel || "Nessun risultato");

    function allOptions() {
      return extras
        .map(function (it) {
          return { value: String(it.value), label: it.label };
        })
        .concat(
          roleList.map(function (r) {
            return { value: String(r.id), label: "@" + String(r.name || r.id) };
          }),
        );
    }

    function paintControl() {
      var selected = root.__vcPillValues || [];
      var pillsHtml = selected
        .map(function (v) {
          return (
            '<span class="vc-dash-tk-pillsel__pill" data-pill-value="' +
            escHtml(v) +
            '">' +
            '<span class="vc-dash-tk-pillsel__pill-label">' +
            escHtml(mentionOptionLabel(v, root.__vcPillRoles, root.__vcPillExtras)) +
            "</span>" +
            '<button type="button" class="vc-dash-tk-pillsel__pill-x" data-pill-remove="' +
            escHtml(v) +
            '" aria-label="Rimuovi">×</button></span>'
          );
        })
        .join("");
      var inputVal = root.querySelector(".vc-dash-tk-pillsel__input")
        ? root.querySelector(".vc-dash-tk-pillsel__input").value
        : "";
      var control = root.querySelector(".vc-dash-tk-pillsel__control");
      if (!control) {
        root.innerHTML =
          '<div class="vc-dash-tk-pillsel__control">' +
          '<div class="vc-dash-tk-pillsel__pills"></div>' +
          '<button type="button" class="vc-dash-tk-pillsel__clear" aria-label="Svuota" hidden>×</button>' +
          "</div>" +
          '<div class="vc-dash-tk-pillsel__menu" role="listbox" hidden></div>';
        control = root.querySelector(".vc-dash-tk-pillsel__control");
        root.__vcPillMenu = root.querySelector(".vc-dash-tk-pillsel__menu");
        if (root.__vcPillMenu) root.__vcPillMenu.__vcHomeParent = root;
      }
      var pills = root.querySelector(".vc-dash-tk-pillsel__pills");
      var clearBtn = root.querySelector(".vc-dash-tk-pillsel__clear");
      if (pills) {
        pills.innerHTML =
          pillsHtml +
          '<input type="text" class="vc-dash-tk-pillsel__input" autocomplete="off" spellcheck="false" placeholder="' +
          (selected.length ? "" : escHtml(root.__vcPillPlaceholder || "Cerca ruolo…")) +
          '" />';
        var input = pills.querySelector(".vc-dash-tk-pillsel__input");
        if (input) input.value = inputVal;
      }
      if (clearBtn) {
        if (selected.length) clearBtn.removeAttribute("hidden");
        else clearBtn.setAttribute("hidden", "");
      }
    }

    function paintMenu() {
      var menu = root.__vcPillMenu || root.querySelector(".vc-dash-tk-pillsel__menu");
      if (!menu) return;
      root.__vcPillMenu = menu;
      menu.__vcHomeParent = root;
      var selectedMap = {};
      (root.__vcPillValues || []).forEach(function (v) {
        selectedMap[v] = true;
      });
      var q = String((root.querySelector(".vc-dash-tk-pillsel__input") || {}).value || "")
        .trim()
        .toLowerCase();
      var opts = allOptions().filter(function (opt) {
        if (selectedMap[opt.value]) return false;
        if (!q) return true;
        return (
          String(opt.label || "")
            .toLowerCase()
            .indexOf(q) >= 0 || String(opt.value).toLowerCase().indexOf(q) >= 0
        );
      });
      if (!opts.length) {
        var emptyMsg =
          root.__vcPillEmptyLabel ||
          (roleList.length || (root.__vcPillExtras || []).length
            ? root.__vcPillNoResultsLabel || "Nessun risultato"
            : "Nessun ruolo disponibile");
        menu.innerHTML = '<div class="vc-dash-tk-pillsel__empty">' + escHtml(emptyMsg) + "</div>";
      } else {
        menu.innerHTML = opts
          .map(function (opt) {
            return (
              '<button type="button" class="vc-dash-tk-pillsel__option" role="option" data-pill-add="' +
              escHtml(opt.value) +
              '">' +
              escHtml(opt.label) +
              "</button>"
            );
          })
          .join("");
      }
    }

    function openMenu(focusInput) {
      closeAllMentionPillSelects(root);
      root.classList.add("is-open");
      paintControl();
      paintMenu();
      var menu = root.__vcPillMenu;
      if (menu) {
        menu.removeAttribute("hidden");
        positionMentionPillMenu(root);
        requestAnimationFrame(function () {
          positionMentionPillMenu(root);
        });
      }
      if (focusInput) {
        var input = root.querySelector(".vc-dash-tk-pillsel__input");
        if (input) input.focus();
      }
    }

    function addValue(v) {
      v = String(v || "").trim();
      if (!v) return;
      if ((root.__vcPillValues || []).indexOf(v) >= 0) return;
      root.__vcPillValues = (root.__vcPillValues || []).concat([v]);
      paintControl();
      openMenu(true);
      if (typeof root.__vcPillOnChange === "function") root.__vcPillOnChange(root.__vcPillValues.slice());
    }

    function removeValue(v) {
      v = String(v || "");
      root.__vcPillValues = (root.__vcPillValues || []).filter(function (x) {
        return x !== v;
      });
      paintControl();
      if (root.classList.contains("is-open")) openMenu(true);
      if (typeof root.__vcPillOnChange === "function") root.__vcPillOnChange(root.__vcPillValues.slice());
    }

    if (!root.__vcPillWired) {
      root.__vcPillWired = true;
      root.addEventListener("mousedown", function (ev) {
        // Evita che il document click chiuda prima del click sul control.
        if (ev.target && ev.target.closest && ev.target.closest(".vc-dash-tk-pillsel")) {
          ev.stopPropagation();
        }
      });
      root.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t) return;
        var removeBtn = t.closest ? t.closest("[data-pill-remove]") : null;
        if (removeBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          removeValue(removeBtn.getAttribute("data-pill-remove"));
          return;
        }
        if (t.closest && t.closest(".vc-dash-tk-pillsel__clear")) {
          ev.preventDefault();
          ev.stopPropagation();
          root.__vcPillValues = [];
          paintControl();
          openMenu(true);
          if (typeof root.__vcPillOnChange === "function") root.__vcPillOnChange([]);
          return;
        }
        if (t.closest && t.closest(".vc-dash-tk-pillsel__control")) {
          ev.preventDefault();
          openMenu(true);
        }
      });
      root.addEventListener("input", function (ev) {
        if (!ev.target || !ev.target.classList.contains("vc-dash-tk-pillsel__input")) return;
        if (!root.classList.contains("is-open")) openMenu(false);
        else {
          paintMenu();
          positionMentionPillMenu(root);
        }
      });
      root.addEventListener("focusin", function () {
        if (!root.classList.contains("is-open")) openMenu(false);
      });
      root.addEventListener("keydown", function (ev) {
        if (!ev.target || !ev.target.classList.contains("vc-dash-tk-pillsel__input")) return;
        if (ev.key === "Backspace" && !ev.target.value && (root.__vcPillValues || []).length) {
          ev.preventDefault();
          removeValue(root.__vcPillValues[root.__vcPillValues.length - 1]);
        } else if (ev.key === "Escape") {
          closeAllMentionPillSelects(null);
        } else if (ev.key === "Enter") {
          ev.preventDefault();
          var menu = root.__vcPillMenu;
          var first = menu && menu.querySelector(".vc-dash-tk-pillsel__option");
          if (first) addValue(first.getAttribute("data-pill-add"));
        }
      });
    }

    if (!document.__vcMentionPillDocWired) {
      document.__vcMentionPillDocWired = true;
      document.addEventListener("mousedown", function (ev) {
        var t = ev.target;
        if (t && t.closest && (t.closest(".vc-dash-tk-pillsel") || t.closest(".vc-dash-tk-pillsel__menu"))) {
          return;
        }
        closeAllMentionPillSelects(null);
      });
      document.addEventListener(
        "scroll",
        function () {
          Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-pillsel.is-open"), function (r) {
            positionMentionPillMenu(r);
          });
        },
        true,
      );
      window.addEventListener(
        "resize",
        function () {
          Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-pillsel.is-open"), function (r) {
            positionMentionPillMenu(r);
          });
        },
        { passive: true },
      );
    }

    // Delegazione click opzioni: il menu può stare su document.body
    if (!document.__vcMentionPillMenuWired) {
      document.__vcMentionPillMenuWired = true;
      document.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-pillsel__option[data-pill-add]") : null;
        if (!btn) return;
        var menu = btn.closest(".vc-dash-tk-pillsel__menu");
        if (!menu) return;
        var host = menu.__vcHomeParent;
        if (!host || typeof host.__vcPillAdd !== "function") {
          // fallback: find open pillsel
          host = document.querySelector(".vc-dash-tk-pillsel.is-open");
        }
        if (!host) return;
        ev.preventDefault();
        ev.stopPropagation();
        var v = btn.getAttribute("data-pill-add");
        if ((host.__vcPillValues || []).indexOf(v) >= 0) return;
        host.__vcPillValues = (host.__vcPillValues || []).concat([String(v)]);
        if (typeof host.__vcPillPaintControl === "function") host.__vcPillPaintControl();
        if (typeof host.__vcPillOpenMenu === "function") host.__vcPillOpenMenu(true);
        if (typeof host.__vcPillOnChange === "function") host.__vcPillOnChange(host.__vcPillValues.slice());
      });
    }

    root.__vcPillPaintControl = paintControl;
    root.__vcPillOpenMenu = openMenu;
    root.__vcPillAdd = addValue;
    root.__vcPillRemove = removeValue;
    if (typeof opts.onChange === "function") root.__vcPillOnChange = opts.onChange;

    paintControl();
    paintMenu();
    if (!root.__vcPillMenu) {
      root.__vcPillMenu = root.querySelector(".vc-dash-tk-pillsel__menu");
      if (root.__vcPillMenu) root.__vcPillMenu.__vcHomeParent = root;
    }
  }

  function readRoleCheckList(containerId) {
    var list = byId(containerId);
    if (!list) return [];
    if (Array.isArray(list.__vcPillValues)) return list.__vcPillValues.slice();
    var out = [];
    Array.prototype.forEach.call(list.querySelectorAll("input[data-role-check]:checked"), function (input) {
      if (input && input.value) out.push(String(input.value));
    });
    return out;
  }

  function renderWelcomeFieldsList(fields) {
    var list = byId("tk-panel-welcome-fields-list");
    if (!list) return;
    var rows = Array.isArray(fields) ? fields : [];
    list.innerHTML = rows
      .map(function (f) {
        return (
          '<div class="vc-dash-tk-field-row">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Nome campo</span>' +
          '<input type="text" class="vc-dash-tk-field-name" maxlength="256" value="' +
          escHtml((f && f.name) || "") +
          '" /></label>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Valore</span>' +
          '<input type="text" class="vc-dash-tk-field-value" maxlength="1024" value="' +
          escHtml((f && f.value) || "") +
          '" /></label>' +
          '<label class="vc-dash-tk-field-inline"><input type="checkbox" class="vc-dash-tk-field-inline-check"' +
          (f && f.inline ? " checked" : "") +
          " /><span>Inline</span></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger vc-dash-tk-field-remove" aria-label="Rimuovi campo">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  function readWelcomeFieldsList() {
    var list = byId("tk-panel-welcome-fields-list");
    var out = [];
    if (!list) return out;
    Array.prototype.forEach.call(list.querySelectorAll(".vc-dash-tk-field-row"), function (row) {
      var nameEl = row.querySelector(".vc-dash-tk-field-name");
      var valueEl = row.querySelector(".vc-dash-tk-field-value");
      var inlineEl = row.querySelector(".vc-dash-tk-field-inline-check");
      var name = nameEl ? String(nameEl.value || "").trim() : "";
      var value = valueEl ? String(valueEl.value || "").trim() : "";
      if (!name || !value) return;
      out.push({ name: name, value: value, inline: Boolean(inlineEl && inlineEl.checked) });
    });
    return out;
  }

  function fillWelcomeForm(welcome) {
    var w = welcome || {};
    setValue("tk-panel-welcome-color", w.color || "#6f4e37");
    setValue("tk-panel-welcome-title", w.title || "");
    setValue("tk-panel-welcome-titleUrl", w.titleUrl || "");
    setValue("tk-panel-welcome-description", w.description || "");
    setValue("tk-panel-welcome-authorName", w.authorName || "");
    setValue("tk-panel-welcome-authorIconUrl", w.authorIconUrl || "");
    setValue("tk-panel-welcome-authorUrl", w.authorUrl || "");
    setValue("tk-panel-welcome-largeImageUrl", w.largeImageUrl || "");
    setValue("tk-panel-welcome-smallImageUrl", w.smallImageUrl || "");
    setValue("tk-panel-welcome-footerText", w.footerText || "");
    setValue("tk-panel-welcome-footerIconUrl", w.footerIconUrl || "");
    setChecked("tk-panel-welcome-footerTimestamp", Boolean(w.footerTimestamp));
    renderWelcomeFieldsList(w.fields || []);
  }

  function isWelcomeFormEmpty(w) {
    if (!w || typeof w !== "object") return true;
    return !(
      String(w.title || "").trim() ||
      String(w.description || "").trim() ||
      String(w.authorName || "").trim() ||
      String(w.largeImageUrl || "").trim() ||
      String(w.smallImageUrl || "").trim() ||
      String(w.footerText || "").trim() ||
      (Array.isArray(w.fields) && w.fields.length)
    );
  }

  function welcomeDefaultsForType(ticketType) {
    var defaults = (state.ticketPanels && state.ticketPanels.welcomeDefaults) || {};
    var key = String(ticketType || "supporto").toLowerCase();
    if (key === "highstaff") key = "high";
    return defaults[key] || defaults.supporto || null;
  }

  function resolveWelcomeForEditor(panel) {
    if (panel && panel.welcome && !isWelcomeFormEmpty(panel.welcome)) return panel.welcome;
    var type = panel && panel.ticketType ? String(panel.ticketType) : "";
    if (!type) return null;
    return welcomeDefaultsForType(type);
  }

  function ticketPanelRoleOptions() {
    var pickers =
      (state.ticketPanels && state.ticketPanels.pickers) ||
      state.pickers ||
      state.settingsPickers ||
      {};
    return pickers.roles || [];
  }

  function rewriteWelcomeDescriptionMentions(description, roleIds) {
    var out = String(description || "");
    var byId = {};
    ticketPanelRoleOptions().forEach(function (r) {
      if (r && (r.id || r.value)) byId[String(r.id || r.value)] = r;
    });
    var preferred = (roleIds || [])
      .map(String)
      .filter(function (id) {
        return /^\d{16,22}$/.test(id);
      })
      .map(function (id) {
        var r = byId[id];
        return { id: id, name: String((r && (r.name || r.label)) || "").trim() };
      })
      .filter(function (r) {
        return r.name;
      })
      .sort(function (a, b) {
        return b.name.length - a.name.length;
      });
    preferred.forEach(function (role) {
      var mention = "<@&" + role.id + ">";
      if (out.indexOf(mention) !== -1) return;
      var escaped = role.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      var re = new RegExp("(?:\\*{1,2}|_{1,2})*" + escaped + "(?:\\*{1,2}|_{1,2})*", "gi");
      out = out.replace(re, mention);
    });
    return out;
  }

  function insertSelectedRoleMentionsIntoWelcome() {
    var ta = byId("tk-panel-welcome-description");
    if (!ta) return;
    var roleIds = readRoleCheckList("tk-panel-mentionOnOpen-list").filter(function (t) {
      return /^\d{16,22}$/.test(String(t));
    });
    if (!roleIds.length) return;
    var mentions = roleIds.map(function (id) {
      return "<@&" + id + ">";
    });
    var cur = String(ta.value || "");
    var missing = mentions.filter(function (m) {
      return cur.indexOf(m) === -1;
    });
    if (!missing.length) {
      ta.value = rewriteWelcomeDescriptionMentions(cur, roleIds);
      return;
    }
    var sep = cur && !/\s$/.test(cur) ? " " : "";
    ta.value = rewriteWelcomeDescriptionMentions(cur + sep + missing.join(" "), roleIds);
    try {
      ta.focus();
    } catch (_) {}
  }

  function readWelcomeForm() {
    var mentionRoleIds = readRoleCheckList("tk-panel-mentionOnOpen-list").filter(function (t) {
      return /^\d{16,22}$/.test(String(t));
    });
    var rawDesc = (byId("tk-panel-welcome-description") || {}).value || "";
    return {
      color: (byId("tk-panel-welcome-color") || {}).value || "#6f4e37",
      title: (byId("tk-panel-welcome-title") || {}).value || "",
      titleUrl: (byId("tk-panel-welcome-titleUrl") || {}).value || "",
      description: rewriteWelcomeDescriptionMentions(rawDesc, mentionRoleIds),
      authorName: (byId("tk-panel-welcome-authorName") || {}).value || "",
      authorIconUrl: (byId("tk-panel-welcome-authorIconUrl") || {}).value || "",
      authorUrl: (byId("tk-panel-welcome-authorUrl") || {}).value || "",
      largeImageUrl: (byId("tk-panel-welcome-largeImageUrl") || {}).value || "",
      smallImageUrl: (byId("tk-panel-welcome-smallImageUrl") || {}).value || "",
      footerText: (byId("tk-panel-welcome-footerText") || {}).value || "",
      footerIconUrl: (byId("tk-panel-welcome-footerIconUrl") || {}).value || "",
      footerTimestamp: Boolean(byId("tk-panel-welcome-footerTimestamp") && byId("tk-panel-welcome-footerTimestamp").checked),
      fields: readWelcomeFieldsList(),
    };
  }

  function getGlobalTicketPermsForPanel() {
    var fromPanels =
      state.ticketPanels &&
      state.ticketPanels.settings &&
      state.ticketPanels.settings.ticketPerms;
    if (fromPanels && typeof fromPanels === "object") return fromPanels;
    var fromTickets = state.tickets && state.tickets.ticketPerms;
    if (fromTickets && typeof fromTickets === "object") return fromTickets;
    return {
      addReactions: true,
      sendTtsMessages: false,
      embedLinks: true,
      attachFiles: true,
      useExternalEmojis: true,
      useExternalStickers: true,
      sendVoiceMessages: false,
    };
  }

  function isGlobalTicketPermOn(globalPerms, key) {
    var g = globalPerms || {};
    if (key === "sendTtsMessages" || key === "sendVoiceMessages") return g[key] === true;
    return g[key] !== false;
  }

  function fillTicketPermsForm(perms) {
    var global = getGlobalTicketPermsForPanel();
    var extras = perms && typeof perms === "object" ? perms : null;
    var replace = Boolean(extras && (extras.replace === true || extras.__replace === true));
    var grid = byId("tk-panel-ticketPerms-grid");
    if (grid) grid.classList.remove("is-disabled");
    TICKET_PANEL_PERM_KEYS.forEach(function (key) {
      var gOn = isGlobalTicketPermOn(global, key);
      var on = gOn;
      if (extras) {
        if (replace) on = extras[key] === true;
        else on = gOn || extras[key] === true;
      }
      setChecked("tk-panel-perm-" + key, on);
      var el = byId("tk-panel-perm-" + key);
      if (el) el.disabled = false;
      var row = el && el.closest ? el.closest(".vc-dash-settings-row") : null;
      if (row) {
        row.classList.toggle("is-global-perm", gOn && on);
        row.classList.toggle("is-perm-override", Boolean(extras) && on !== gOn);
        var hint = row.querySelector(".vc-dash-tk-perm-global-hint");
        if (hint) {
          if (on !== gOn) {
            hint.textContent = gOn ? "Disattivato rispetto al globale" : "Attivato rispetto al globale";
            hint.removeAttribute("hidden");
          } else if (gOn) {
            hint.textContent = "Attivo anche in globale";
            hint.removeAttribute("hidden");
          } else {
            hint.setAttribute("hidden", "");
          }
        }
      }
    });
  }

  function readTicketPermsForm() {
    var global = getGlobalTicketPermsForPanel();
    var out = { replace: true };
    var differs = false;
    TICKET_PANEL_PERM_KEYS.forEach(function (key) {
      var el = byId("tk-panel-perm-" + key);
      var on = Boolean(el && el.checked);
      out[key] = on;
      if (on !== isGlobalTicketPermOn(global, key)) differs = true;
    });
    // Se identico al globale, nessuna override sul pannello.
    return differs ? out : null;
  }

  function renderAccessRulesList(rules) {
    var list = byId("tk-panel-accessRules-list");
    if (!list) return;
    var pickers = (state.ticketPanels && state.ticketPanels.pickers) || state.ticketsPickers || {};
    var roles = pickers.roles || [];
    var rows = Array.isArray(rules) && rules.length ? rules : [{ roleId: "everyone", allow: true }];
    list.innerHTML = rows
      .map(function (rule) {
        var roleId = String((rule && rule.roleId) || "everyone");
        var options =
          '<option value="everyone"' +
          (roleId === "everyone" ? " selected" : "") +
          ">@everyone</option>" +
          roles
            .map(function (r) {
              var id = String(r.id);
              return (
                '<option value="' +
                escHtml(id) +
                '"' +
                (roleId === id ? " selected" : "") +
                ">" +
                escHtml(r.name || id) +
                "</option>"
              );
            })
            .join("");
        var allow = rule && rule.allow === false ? "0" : "1";
        return (
          '<div class="vc-dash-tk-rule-row">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Ruolo</span>' +
          '<select class="vc-dash-tk-rule-role">' +
          options +
          "</select></label>" +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Accesso</span>' +
          '<select class="vc-dash-tk-rule-allow">' +
          '<option value="1"' +
          (allow === "1" ? " selected" : "") +
          ">Consenti</option>" +
          '<option value="0"' +
          (allow === "0" ? " selected" : "") +
          ">Nega</option>" +
          "</select></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger vc-dash-tk-rule-remove" aria-label="Rimuovi regola">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
    enhanceAllDashFancySelects(list);
  }

  function readAccessRulesList() {
    var list = byId("tk-panel-accessRules-list");
    var out = [];
    if (!list) return out;
    Array.prototype.forEach.call(list.querySelectorAll(".vc-dash-tk-rule-row"), function (row) {
      var roleSel = row.querySelector(".vc-dash-tk-rule-role");
      var allowSel = row.querySelector(".vc-dash-tk-rule-allow");
      var roleId = roleSel ? String(roleSel.value || "") : "";
      if (!roleId) return;
      out.push({ roleId: roleId, allow: allowSel ? allowSel.value !== "0" : true });
    });
    return out;
  }

  function fillSupportHoursForm(hours) {
    var h = hours || {};
    setValue("tk-panel-supportHours-timezone", h.timezone || "Europe/Rome");
    TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
      var d = (h.days && h.days[day]) || {};
      var enabled = Boolean(d.enabled);
      var allDay = enabled ? d.allDay === true : true;
      setChecked("tk-panel-supportHours-" + day + "-enabled", enabled);
      setChecked("tk-panel-supportHours-" + day + "-allDay", allDay);
      setValue("tk-panel-supportHours-" + day + "-start", d.start || "09:00");
      setValue("tk-panel-supportHours-" + day + "-end", d.end || "17:00");
    });
    syncSupportHoursUi();
    enhanceAllDashFancySelects(byId("tk-panel-supportHours-timezone") ? byId("tk-panel-editor") : document);
  }

  function readSupportHoursForm() {
    var days = {};
    TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
      var enabledEl = byId("tk-panel-supportHours-" + day + "-enabled");
      var allDayEl = byId("tk-panel-supportHours-" + day + "-allDay");
      var startEl = byId("tk-panel-supportHours-" + day + "-start");
      var endEl = byId("tk-panel-supportHours-" + day + "-end");
      var enabled = Boolean(enabledEl && enabledEl.checked);
      days[day] = {
        enabled: enabled,
        allDay: enabled ? Boolean(allDayEl && allDayEl.checked) : true,
        start: (startEl && startEl.value) || "09:00",
        end: (endEl && endEl.value) || "17:00",
      };
    });
    return {
      timezone: (byId("tk-panel-supportHours-timezone") || {}).value || "Europe/Rome",
      days: days,
    };
  }

  function supportHoursDayLabels() {
    return {
      sunday: "domenica",
      monday: "lunedì",
      tuesday: "martedì",
      wednesday: "mercoledì",
      thursday: "giovedì",
      friday: "venerdì",
      saturday: "sabato",
    };
  }

  function formatSupportHoursNow(timezone) {
    var tz = String(timezone || "Europe/Rome");
    try {
      var now = new Date();
      var time = new Intl.DateTimeFormat("it-IT", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(now);
      var weekday = new Intl.DateTimeFormat("it-IT", {
        timeZone: tz,
        weekday: "long",
      }).format(now);
      var offsetParts = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        timeZoneName: "shortOffset",
        hour: "2-digit",
        minute: "2-digit",
      }).formatToParts(now);
      var offset = "";
      for (var i = 0; i < offsetParts.length; i++) {
        if (offsetParts[i].type === "timeZoneName") {
          offset = String(offsetParts[i].value || "").replace("GMT", "UTC");
          break;
        }
      }
      return (
        "Ora sono le " +
        time +
        " di " +
        weekday +
        " in " +
        tz +
        (offset ? " (" + offset + ")" : "")
      );
    } catch (_) {
      return "Fuso: " + tz;
    }
  }

  function syncSupportHoursUi() {
    var hours = readSupportHoursForm();
    var restricted = TICKET_PANEL_SUPPORT_HOURS_DAYS.some(function (day) {
      return hours.days[day] && hours.days[day].enabled;
    });
    var copyBtn = byId("tk-panel-supportHours-copyWeekdays");
    if (copyBtn) copyBtn.disabled = !(hours.days.monday && hours.days.monday.enabled);

    TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
      var row = document.querySelector('.vc-dash-tk-hours-day[data-day="' + day + '"]');
      if (!row) return;
      var d = hours.days[day] || {};
      var enabled = Boolean(d.enabled);
      var allDay = Boolean(d.allDay);
      var allDayEl = byId("tk-panel-supportHours-" + day + "-allDay");
      var badge = row.querySelector("[data-hours-badge]");
      var range = row.querySelector(".vc-dash-tk-hours-day__range");
      row.classList.toggle("is-enabled", enabled);

      if (enabled && !allDay) {
        if (allDayEl) allDayEl.checked = false;
        if (badge) badge.setAttribute("hidden", "");
        if (range) range.removeAttribute("hidden");
        return;
      }

      if (enabled && allDay) {
        if (allDayEl) allDayEl.checked = true;
        if (range) range.setAttribute("hidden", "");
        if (badge) {
          badge.removeAttribute("hidden");
          badge.textContent = "24/7";
          badge.classList.remove("is-closed");
        }
        return;
      }

      // disabled
      if (allDayEl) allDayEl.checked = true;
      if (range) range.setAttribute("hidden", "");
      if (badge) {
        badge.removeAttribute("hidden");
        if (restricted) {
          badge.textContent = "Chiuso";
          badge.classList.add("is-closed");
        } else {
          badge.textContent = "24/7";
          badge.classList.remove("is-closed");
        }
      }
    });

    var nowEl = byId("tk-panel-supportHours-now");
    var availEl = byId("tk-panel-supportHours-avail");
    if (nowEl) nowEl.textContent = formatSupportHoursNow(hours.timezone);
    if (availEl) {
      availEl.classList.remove("is-restricted", "is-closed");
      if (!restricted) {
        availEl.textContent = "Pannello disponibile 24/7 (nessuna restrizione)";
        return;
      }
      var labels = supportHoursDayLabels();
      try {
        var zoned = new Intl.DateTimeFormat("en-GB", {
          timeZone: hours.timezone || "Europe/Rome",
          weekday: "short",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }).formatToParts(new Date());
        var map = {};
        zoned.forEach(function (p) {
          map[p.type] = p.value;
        });
        var wd = String(map.weekday || "").toLowerCase();
        var dayKey =
          {
            sun: "sunday",
            mon: "monday",
            tue: "tuesday",
            wed: "wednesday",
            thu: "thursday",
            fri: "friday",
            sat: "saturday",
          }[wd] || "monday";
        var today = hours.days[dayKey] || {};
        var mins = Number(map.hour || 0) * 60 + Number(map.minute || 0);
        if (!today.enabled) {
          availEl.textContent = "Chiuso oggi (" + (labels[dayKey] || dayKey) + ")";
          availEl.classList.add("is-closed");
        } else if (today.allDay) {
          availEl.textContent = "Aperto oggi 24/7 (" + (labels[dayKey] || dayKey) + ")";
          availEl.classList.add("is-restricted");
        } else {
          var startParts = String(today.start || "09:00").split(":");
          var endParts = String(today.end || "17:00").split(":");
          var start = Number(startParts[0] || 0) * 60 + Number(startParts[1] || 0);
          var end = Number(endParts[0] || 0) * 60 + Number(endParts[1] || 0);
          var open = start <= end ? mins >= start && mins < end : mins >= start || mins < end;
          if (open) {
            availEl.textContent =
              "Aperto ora · " + (today.start || "09:00") + "–" + (today.end || "17:00");
            availEl.classList.add("is-restricted");
          } else {
            availEl.textContent =
              "Chiuso ora · orario " + (today.start || "09:00") + "–" + (today.end || "17:00");
            availEl.classList.add("is-closed");
          }
        }
      } catch (_) {
        availEl.textContent = "Orari personalizzati attivi";
        availEl.classList.add("is-restricted");
      }
    }
  }

  function applySupportHoursDay(day, cfg) {
    var enabled = Boolean(cfg && cfg.enabled);
    var allDay = enabled ? Boolean(cfg && cfg.allDay) : true;
    setChecked("tk-panel-supportHours-" + day + "-enabled", enabled);
    setChecked("tk-panel-supportHours-" + day + "-allDay", allDay);
    setValue("tk-panel-supportHours-" + day + "-start", (cfg && cfg.start) || "09:00");
    setValue("tk-panel-supportHours-" + day + "-end", (cfg && cfg.end) || "17:00");
  }

  function fillTicketPanelChannelSelects(panel) {
    var pickers = (state.ticketPanels && state.ticketPanels.pickers) || state.ticketsPickers || {};
    var text = pickers.textChannels || [];
    var categories = pickers.categories || [];
    var roles = pickers.roles || [];
    var globals = getTicketPanelGlobalSettings();
    fillSelect(
      byId("tk-panel-channelId"),
      text,
      (panel && panel.channelId) || "",
      i18n("dash.selectChannelOpt", "— Seleziona canale —"),
    );
    fillSelect(
      byId("tk-multipanel-channelId"),
      text,
      (byId("tk-multipanel-channelId") && byId("tk-multipanel-channelId").value) || "",
      i18n("dash.selectChannelOpt", "— Seleziona canale —"),
    );
    fillSelect(
      byId("tk-panel-transcriptChannelId"),
      text,
      (panel && panel.transcriptChannelId) || "",
      { inherit: true, detail: ticketPanelGlobalTranscriptDetail(globals, text) },
    );
    fillSelect(
      byId("tk-panel-categoryId"),
      categories,
      (panel && panel.categoryId) || "",
      { inherit: true, detail: ticketPanelGlobalCategoryDetail(globals, categories) },
    );
    syncTicketPanelGlobalInheritedControls(panel, globals);
    renderMentionPillSelect(
      "tk-panel-mentionOnOpen-list",
      roles,
      (panel && panel.mentionOnOpen) || [],
      TICKET_PANEL_MENTION_EXTRA_ITEMS,
    );
    var teamExtras = ((state.ticketPanels && state.ticketPanels.teams) || []).map(function (t) {
      return { value: String(t.id), label: String(t.name || t.id) };
    });
    renderMentionPillSelect(
      "tk-panel-supportTeamIds-list",
      [],
      (panel && panel.supportTeamIds) || [],
      teamExtras,
      {
        placeholder: i18n("dash.tickets.teamsSearchPh", "Cerca team…"),
        emptyLabel: i18n("dash.tickets.teamsNone", "Nessun team"),
      },
    );
    fillTicketPanelFormSelects(panel);
  }

  function getTicketPanelGlobalSettings() {
    var fromPanels = (state.ticketPanels && state.ticketPanels.settings) || {};
    var fromTickets = state.tickets || {};
    var overflow =
      fromPanels.overflowCategoryId ||
      fromTickets.overflowCategoryId ||
      fromTickets.ticketCategoryId ||
      null;
    if (String(overflow || "") === "__custom__") overflow = null;
    return {
      maxOpenTicketsPerUser: Math.max(
        1,
        Number(
          fromPanels.maxOpenTicketsPerUser != null
            ? fromPanels.maxOpenTicketsPerUser
            : fromTickets.maxOpenTicketsPerUser != null
              ? fromTickets.maxOpenTicketsPerUser
              : 1,
        ) || 1,
      ),
      hideCloseButton:
        fromPanels.hideCloseButton != null
          ? fromPanels.hideCloseButton === true
          : fromTickets.hideCloseButton === true,
      hideCloseReasonButton:
        fromPanels.hideCloseReasonButton != null
          ? fromPanels.hideCloseReasonButton === true
          : fromTickets.hideCloseReasonButton === true,
      hideClaimButton:
        fromPanels.hideClaimButton != null
          ? fromPanels.hideClaimButton === true
          : fromTickets.hideClaimButton === true,
      transcriptChannelId:
        fromPanels.transcriptChannelId || fromTickets.transcriptChannelId || null,
      overflowCategoryId: overflow ? String(overflow) : null,
    };
  }

  function pickerNameById(rows, id) {
    var want = String(id || "").trim();
    if (!want) return null;
    var list = Array.isArray(rows) ? rows : [];
    for (var i = 0; i < list.length; i += 1) {
      if (String(list[i].id) === want) {
        var name = String(list[i].name || "").trim();
        return name || want;
      }
    }
    return want;
  }

  function ticketPanelGlobalTranscriptDetail(globals, channels) {
    var id = globals && globals.transcriptChannelId;
    if (!id) return "Disabilitato";
    var name = pickerNameById(channels, id);
    if (name && name.charAt(0) !== "#") name = "#" + name;
    return name || String(id);
  }

  function ticketPanelGlobalCategoryDetail(globals, categories) {
    var id = globals && globals.overflowCategoryId;
    if (!id) return "Automatica";
    var name = pickerNameById(categories, id);
    return name || String(id);
  }

  function fillPanelTriStateSelect(selectId, currentValue, globalOn) {
    var select = byId(selectId);
    if (!select) return;
    var globalLabel = globalOn ? "Nascondi" : "Mostra";
    var selected = triStateSelectValue(currentValue);
    select.innerHTML =
      '<option value="" data-inherit="1" data-inherit-detail="' +
      esc(globalLabel) +
      '">' +
      esc(globalLabel) +
      "</option>" +
      '<option value="0">Mostra</option>' +
      '<option value="1">Nascondi</option>';
    select.value = selected;
    refreshDashFancySelect(select);
  }

  function fillPanelMaxOpenSelect(panel, globals) {
    var select = byId("tk-panel-maxOpenTicketsPerUser");
    if (!select) return;
    var g = globals || getTicketPanelGlobalSettings();
    var globalVal = String(g.maxOpenTicketsPerUser || 1);
    var current =
      panel && panel.maxOpenTicketsPerUser != null && panel.maxOpenTicketsPerUser !== ""
        ? String(panel.maxOpenTicketsPerUser)
        : "";
    var html =
      '<option value="" data-inherit="1" data-inherit-detail="' +
      esc(globalVal) +
      '">' +
      esc(globalVal) +
      "</option>";
    for (var n = 1; n <= 25; n += 1) {
      html += '<option value="' + n + '">' + n + "</option>";
    }
    select.innerHTML = html;
    select.value = current;
    if (current && select.value !== current) {
      // valore fuori range: aggiungi voce dedicata
      var extra = document.createElement("option");
      extra.value = current;
      extra.textContent = current;
      select.appendChild(extra);
      select.value = current;
    }
    refreshDashFancySelect(select);
  }

  function syncTicketPanelGlobalInheritedControls(panel, globals) {
    var g = globals || getTicketPanelGlobalSettings();
    fillPanelMaxOpenSelect(panel, g);
    fillPanelTriStateSelect(
      "tk-panel-hideCloseButton",
      panel ? panel.hideCloseButton : null,
      g.hideCloseButton,
    );
    fillPanelTriStateSelect(
      "tk-panel-hideCloseReasonButton",
      panel ? panel.hideCloseReasonButton : null,
      g.hideCloseReasonButton,
    );
    fillPanelTriStateSelect(
      "tk-panel-hideClaimButton",
      panel ? panel.hideClaimButton : null,
      g.hideClaimButton,
    );
  }

  function panelPickLabelParts(p) {
    var title = String((p && p.title) || "").trim();
    var type = String((p && (p.ticketTypeLabel || p.ticketType)) || "").trim();
    var same =
      title &&
      type &&
      title.toLocaleLowerCase("it") === type.toLocaleLowerCase("it");
    return {
      title: title || type || String((p && p.id) || "Pannello"),
      type: same || !type ? "" : type,
    };
  }

  var MULTI_OPTION_DEFAULT_META = {
    supporto: {
      description: "Supporto generale • Segnalazioni • Problemi",
      emoji: { id: "1443651872258003005", name: "discordstaff" },
    },
    partnership: {
      description: "Partnership",
      emoji: { id: "1443651871125409812", name: "partneredserverowner" },
    },
    high: {
      description: "Donazioni • Sponsor • Amministrazione",
      emoji: { id: "1443670575376765130", name: "reportmessage" },
    },
    highstaff: {
      description: "Donazioni • Sponsor • Amministrazione",
      emoji: { id: "1443670575376765130", name: "reportmessage" },
    },
    perks: {
      description: "Verifica Selfie • Supporter • Follower",
      emoji: { id: "1482534921472835895", name: "VC_Vip" },
    },
  };

  function emojiValueToInputString(emoji) {
    if (!emoji) return "";
    if (typeof emoji === "string") return String(emoji).trim();
    if (emoji.id) return formatCustomEmojiMarkup(emoji);
    return String(emoji.name || "").trim();
  }

  function resolveMultiOptionFormState(panel, ov) {
    var typeKey = String((panel && panel.ticketType) || "").toLowerCase();
    var meta = MULTI_OPTION_DEFAULT_META[typeKey] || {};
    var defaultLabel =
      String((panel && panel.buttonText) || "").trim() ||
      ticketTypeLabel(panel && panel.ticketType) ||
      "Open a ticket!";
    var defaultDesc = String(meta.description || "").trim();
    var defaultEmoji = (panel && panel.buttonEmoji) || meta.emoji || null;

    var label =
      ov && ov.label != null && String(ov.label).trim() !== ""
        ? String(ov.label).trim()
        : defaultLabel;
    var description =
      ov && ov.description != null && String(ov.description).trim() !== ""
        ? String(ov.description).trim()
        : defaultDesc;

    // Come pannello singolo: il valore in campo è l'emoji effettiva;
    // lo switch indica se stai usando catalogo custom (server) o unicode.
    var emojiVal = "";
    if (ov && ov.useCustomEmoji) {
      emojiVal = emojiValueToInputString(ov.emoji);
    } else {
      emojiVal = emojiValueToInputString(defaultEmoji);
    }
    var parsed = parseTicketButtonEmoji(emojiVal);
    return {
      label: label,
      description: description,
      catalogCustom: parsed.custom === true,
      emojiVal: emojiVal,
      defaultLabel: defaultLabel,
      defaultDesc: defaultDesc || "Optional description",
    };
  }

  function readMultiPanelOptionOverrides() {
    var host = byId("tk-multipanel-optionCustomizations");
    var out = {};
    if (!host) return out;
    var singles = (state.ticketPanels && state.ticketPanels.singles) || [];
    var byIdMap = {};
    singles.forEach(function (p) {
      if (p && p.id != null) byIdMap[String(p.id)] = p;
    });
    Array.prototype.forEach.call(host.querySelectorAll(".vc-dash-tk-optcust__block[data-panel-id]"), function (block) {
      var panelId = String(block.getAttribute("data-panel-id") || "").trim();
      if (!panelId) return;
      var emojiInput = block.querySelector('[data-optcust-field="emoji"]');
      var labelInput = block.querySelector('[data-optcust-field="label"]');
      var descInput = block.querySelector('[data-optcust-field="description"]');
      var label = String((labelInput && labelInput.value) || "").trim();
      var description = String((descInput && descInput.value) || "").trim();
      var emoji = String((emojiInput && emojiInput.value) || "").trim();
      var panel = byIdMap[panelId] || null;
      var typeKey = String((panel && panel.ticketType) || "").toLowerCase();
      var meta = MULTI_OPTION_DEFAULT_META[typeKey] || {};
      var defaultEmoji = emojiValueToInputString((panel && panel.buttonEmoji) || meta.emoji || null);
      var defaultLabel =
        String((panel && panel.buttonText) || "").trim() ||
        ticketTypeLabel(panel && panel.ticketType) ||
        "";
      var defaultDesc = String(meta.description || "").trim();
      var labelChanged = label && label !== defaultLabel;
      var descChanged = description && description !== defaultDesc;
      var emojiChanged = emoji !== defaultEmoji;
      // Solo se diverso dal default (o vuoto esplicito vs default pieno) salva override emoji.
      var useCustomEmoji = emojiChanged;
      if (!labelChanged && !descChanged && !useCustomEmoji) return;
      out[panelId] = {
        label: labelChanged ? label : label || null,
        description: descChanged ? description : description || null,
        useCustomEmoji: useCustomEmoji,
        emoji: useCustomEmoji ? emoji || null : null,
      };
      // Se label/desc sono ancora i default ma c'è override emoji, non forzare label/desc.
      if (!labelChanged) out[panelId].label = null;
      if (!descChanged) out[panelId].description = null;
      if (!out[panelId].label && !out[panelId].description && !out[panelId].useCustomEmoji) {
        delete out[panelId];
      }
    });
    return out;
  }

  function syncMultiPanelOptionCustEmojiRow(block, opts) {
    var options = opts || {};
    if (!block) return;
    var useToggle = block.querySelector('[data-optcust-field="catalogCustom"]');
    var emojiInput = block.querySelector('[data-optcust-field="emoji"]');
    var preview = block.querySelector("[data-optcust-preview]");
    if (!emojiInput || !preview) return;
    var parsed = parseTicketButtonEmoji(emojiInput.value);
    if (options.preferCustom === true && useToggle) useToggle.checked = true;
    else if (options.preferCustom === false && useToggle) useToggle.checked = false;
    else if (useToggle && !options.keepToggle) useToggle.checked = parsed.custom === true;

    preview.classList.toggle("is-empty", parsed.kind === "empty");
    if (parsed.kind === "custom" && parsed.url) {
      preview.innerHTML =
        '<img src="' +
        escHtml(parsed.url) +
        '" alt=":' +
        escHtml(parsed.name || "emoji") +
        ':" width="22" height="22" loading="lazy" decoding="async" />';
    } else if (parsed.kind === "unicode") {
      preview.textContent = parsed.text;
    } else {
      preview.textContent = "";
    }
  }

  function closeOptcustEmojiMenu() {
    var menu = byId("tk-multipanel-optcust-emoji-menu");
    var park = byId("tk-multipanel-optionCustomizations-empty");
    var parkParent = park && park.parentNode ? park.parentNode : null;
    if (menu && parkParent && menu.parentNode !== parkParent) {
      parkParent.appendChild(menu);
    }
    if (menu) menu.setAttribute("hidden", "");
    var host = byId("tk-multipanel-optionCustomizations");
    if (host) host.classList.remove("is-emoji-open");
    Array.prototype.forEach.call(document.querySelectorAll(".vc-dash-tk-optcust__block.is-emoji-open"), function (b) {
      b.classList.remove("is-emoji-open");
    });
    state.optcustEmojiBlock = null;
  }

  function renderOptcustEmojiGrid() {
    var grid = byId("tk-multipanel-optcust-emoji-grid");
    var search = byId("tk-multipanel-optcust-emoji-search");
    var block = state.optcustEmojiBlock;
    if (!grid) return;
    var q = String((search && search.value) || "")
      .trim()
      .toLowerCase();
    var useToggle = block && block.querySelector('[data-optcust-field="catalogCustom"]');
    var useCustom = Boolean(useToggle && useToggle.checked);

    if (useCustom) {
      var emojis = ((getTicketPanelEmojiPickers().emojis) || []).filter(function (e) {
        if (!e || !e.id) return false;
        if (!q) return true;
        return String(e.name || "")
          .toLowerCase()
          .indexOf(q) !== -1;
      });
      if (!emojis.length) {
        grid.innerHTML =
          '<div class="vc-dash-tk-emoji__empty">' +
          (q ? "Nessuna emoji trovata." : "Nessuna emoji custom in questo server.") +
          "</div>";
        return;
      }
      grid.innerHTML = emojis
        .slice(0, 240)
        .map(function (e) {
          return buildTicketPanelEmojiOptHtml(e, { eager: false });
        })
        .join("");
      return;
    }

    var unicode = (typeof TK_UNICODE_EMOJIS !== "undefined" ? TK_UNICODE_EMOJIS : []).filter(function (emoji) {
      if (!q) return true;
      return String(emoji).toLowerCase().indexOf(q) !== -1;
    });
    if (!unicode.length) {
      grid.innerHTML = '<div class="vc-dash-tk-emoji__empty">Nessuna emoji trovata.</div>';
      return;
    }
    grid.innerHTML = unicode
      .map(function (emoji) {
        return (
          '<button type="button" class="vc-dash-tk-emoji__opt" role="option" data-emoji="' +
          escHtml(emoji) +
          '" title="' +
          escHtml(emoji) +
          '">' +
          escHtml(emoji) +
          "</button>"
        );
      })
      .join("");
  }

  function openOptcustEmojiMenu(block) {
    var menu = byId("tk-multipanel-optcust-emoji-menu");
    var host = byId("tk-multipanel-optionCustomizations");
    var search = byId("tk-multipanel-optcust-emoji-search");
    if (!menu || !block) return;
    closeOptcustEmojiMenu();
    state.optcustEmojiBlock = block;
    block.classList.add("is-emoji-open");
    if (host) host.classList.add("is-emoji-open");
    block.appendChild(menu);
    menu.removeAttribute("hidden");
    if (search) search.value = "";
    renderOptcustEmojiGrid();
    var useToggle = block.querySelector('[data-optcust-field="catalogCustom"]');
    if (useToggle && useToggle.checked) {
      var have = ((getTicketPanelEmojiPickers().emojis) || []).length;
      if (!have && typeof refreshTicketPanels === "function") {
        refreshTicketPanels({ silent: true }).then(function () {
          if (state.optcustEmojiBlock === block) renderOptcustEmojiGrid();
        });
      }
    }
    if (search) {
      try {
        search.focus();
      } catch (_) {}
    }
  }

  function setOptcustEmojiValue(block, raw, opts) {
    var options = opts || {};
    if (!block) return;
    var input = block.querySelector('[data-optcust-field="emoji"]');
    var value = String(raw || "").trim();
    if (input) input.value = value;
    var parsed = parseTicketButtonEmoji(value);
    if (parsed.kind === "custom") block.__vcOptcustEmojiCustom = value;
    else if (parsed.kind === "unicode") block.__vcOptcustEmojiUnicode = value;
    syncMultiPanelOptionCustEmojiRow(block, {
      preferCustom: options.preferCustom,
      keepToggle: options.keepToggle,
    });
    if (!options.silent) scheduleTicketPanelsDraftSave();
  }

  function rememberOptcustEmojiSlot(block) {
    if (!block) return;
    var input = block.querySelector('[data-optcust-field="emoji"]');
    var value = String((input && input.value) || "").trim();
    if (!value) return;
    var parsed = parseTicketButtonEmoji(value);
    if (parsed.kind === "custom") block.__vcOptcustEmojiCustom = value;
    else if (parsed.kind === "unicode") block.__vcOptcustEmojiUnicode = value;
  }

  function wireMultiPanelOptcustEmojiUi() {
    if (document.__vcOptcustEmojiWired) return;
    document.__vcOptcustEmojiWired = true;
    var host = byId("tk-multipanel-optionCustomizations");
    var menu = byId("tk-multipanel-optcust-emoji-menu");
    var search = byId("tk-multipanel-optcust-emoji-search");
    var clearBtn = byId("tk-multipanel-optcust-emoji-clear");
    var grid = byId("tk-multipanel-optcust-emoji-grid");

    if (host) {
      host.addEventListener("click", function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        var block = t.closest(".vc-dash-tk-optcust__block");
        if (!block) return;
        if (t.closest("[data-optcust-emoji-pick]") || t.closest("[data-optcust-emoji-value]")) {
          ev.preventDefault();
          if (block.classList.contains("is-emoji-open") && menu && !menu.hasAttribute("hidden")) {
            closeOptcustEmojiMenu();
          } else {
            openOptcustEmojiMenu(block);
          }
        }
      });
      host.addEventListener("change", function (ev) {
        var t = ev.target;
        if (!t || !t.matches || !t.matches('[data-optcust-field="catalogCustom"]')) return;
        var block = t.closest(".vc-dash-tk-optcust__block");
        if (!block) return;
        rememberOptcustEmojiSlot(block);
        var nextValue = "";
        if (t.checked) {
          nextValue = String(block.__vcOptcustEmojiCustom || "").trim();
        } else {
          nextValue = String(block.__vcOptcustEmojiUnicode || "").trim();
        }
        setOptcustEmojiValue(block, nextValue, {
          preferCustom: t.checked,
          keepToggle: true,
        });
        // Non aprire il menu sullo switch: aggiorna solo se è già aperto.
        if (menu && !menu.hasAttribute("hidden") && state.optcustEmojiBlock === block) {
          renderOptcustEmojiGrid();
        }
        scheduleTicketPanelsDraftSave();
      });
    }
    if (search) {
      search.addEventListener("input", function () {
        renderOptcustEmojiGrid();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        var block = state.optcustEmojiBlock;
        var useToggle = block && block.querySelector('[data-optcust-field="catalogCustom"]');
        setOptcustEmojiValue(block, "", {
          preferCustom: Boolean(useToggle && useToggle.checked),
          keepToggle: true,
        });
        closeOptcustEmojiMenu();
      });
    }
    if (grid) {
      grid.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-emoji]") : null;
        if (!btn || btn.classList.contains("is-broken")) return;
        var block = state.optcustEmojiBlock;
        var useToggle = block && block.querySelector('[data-optcust-field="catalogCustom"]');
        setOptcustEmojiValue(block, btn.getAttribute("data-emoji") || "", {
          preferCustom: Boolean(useToggle && useToggle.checked),
        });
        closeOptcustEmojiMenu();
      });
      grid.addEventListener(
        "error",
        function (ev) {
          var img = ev.target;
          if (!img || img.tagName !== "IMG") return;
          var src = String(img.getAttribute("src") || img.src || "");
          if (!img.dataset.vcEmojiFallback && /\.gif(\?|$)/i.test(src)) {
            img.dataset.vcEmojiFallback = "1";
            img.src = src.replace(/\.gif(\?|$)/i, ".png$1");
            return;
          }
          var btn = img.closest ? img.closest(".vc-dash-tk-emoji__opt") : null;
          if (btn) {
            btn.classList.add("is-broken");
            btn.setAttribute("hidden", "");
          } else {
            img.remove();
          }
        },
        true,
      );
    }
    document.addEventListener(
      "pointerdown",
      function (ev) {
        if (!menu || menu.hasAttribute("hidden")) return;
        var t = ev.target;
        if (menu.contains(t)) return;
        if (t && t.closest && t.closest("[data-optcust-emoji-pick], [data-optcust-emoji-value]")) return;
        if (t && t.closest && t.closest('[data-optcust-field="catalogCustom"]')) return;
        closeOptcustEmojiMenu();
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      closeOptcustEmojiMenu();
    });
  }

  function renderMultiPanelOptionCustomizations(overridesMap) {
    var host = byId("tk-multipanel-optionCustomizations");
    var empty = byId("tk-multipanel-optionCustomizations-empty");
    if (!host) return;
    closeOptcustEmojiMenu();
    var selectedIds = readRoleCheckList("tk-multipanel-panelIds-list");
    var authoritative = arguments.length >= 1;
    var preserved = authoritative ? {} : readMultiPanelOptionOverrides();
    var incoming =
      authoritative && overridesMap && typeof overridesMap === "object" && !Array.isArray(overridesMap)
        ? overridesMap
        : {};
    var singles = (state.ticketPanels && state.ticketPanels.singles) || [];
    var byIdMap = {};
    singles.forEach(function (p) {
      if (p && p.id != null) byIdMap[String(p.id)] = p;
    });

    if (!selectedIds.length) {
      host.innerHTML = "";
      if (empty) empty.removeAttribute("hidden");
      return;
    }
    if (empty) empty.setAttribute("hidden", "");

    var pickSvg =
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7">' +
      '<circle cx="12" cy="12" r="9"></circle>' +
      '<path d="M8.5 10.2h.01M15.5 10.2h.01" stroke-linecap="round"></path>' +
      '<path d="M8.8 14.2c1.1 1.2 2.1 1.6 3.2 1.6s2.1-.4 3.2-1.6" stroke-linecap="round"></path>' +
      "</svg>";

    host.innerHTML = selectedIds
      .map(function (panelId) {
        var pid = String(panelId);
        var panel = byIdMap[pid] || null;
        var parts = panelPickLabelParts(panel || { id: pid, title: pid });
        var heading = parts.type ? parts.title + " · " + parts.type : parts.title;
        var ov = incoming[pid] || incoming[panelId] || preserved[pid] || null;
        var formState = resolveMultiOptionFormState(panel, ov);
        return (
          '<div class="vc-dash-tk-optcust__block" data-panel-id="' +
          escHtml(pid) +
          '">' +
          '<h4 class="vc-dash-tk-optcust__heading">' +
          escHtml(heading) +
          "</h4>" +
          '<div class="vc-dash-picker-grid">' +
          '<div class="vc-dash-picker vc-dash-picker--full vc-dash-tk-emoji">' +
          '<span class="vc-dash-picker__label">Emoji</span>' +
          '<span class="vc-dash-tk-emoji__sublabel">Emoji custom</span>' +
          '<div class="vc-dash-tk-emoji__controls">' +
          '<label class="vc-dash-switch" title="Emoji custom">' +
          '<input type="checkbox" data-optcust-field="catalogCustom"' +
          (formState.catalogCustom ? " checked" : "") +
          " />" +
          '<span class="vc-dash-switch__track" aria-hidden="true"><span class="vc-dash-switch__thumb"></span></span>' +
          "</label>" +
          '<div class="vc-dash-tk-emoji__field">' +
          '<input type="hidden" data-optcust-field="emoji" value="' +
          escHtml(formState.emojiVal) +
          '" />' +
          '<button type="button" class="vc-dash-tk-emoji__value" data-optcust-emoji-value aria-label="Emoji selezionata">' +
          '<span class="vc-dash-tk-emoji__preview" data-optcust-preview></span>' +
          "</button>" +
          '<button type="button" class="vc-dash-tk-emoji__pick" data-optcust-emoji-pick aria-label="Scegli emoji" title="Scegli emoji">' +
          pickSvg +
          "</button>" +
          "</div>" +
          "</div>" +
          "</div>" +
          '<label class="vc-dash-picker">' +
          '<span class="vc-dash-picker__label">Etichetta custom</span>' +
          '<input type="text" data-optcust-field="label" maxlength="100" placeholder="' +
          escHtml(formState.defaultLabel) +
          '" value="' +
          escHtml(formState.label) +
          '" />' +
          "</label>" +
          '<label class="vc-dash-picker vc-dash-picker--full">' +
          '<span class="vc-dash-picker__label">Descrizione</span>' +
          '<input type="text" data-optcust-field="description" maxlength="100" placeholder="' +
          escHtml(formState.defaultDesc) +
          '" value="' +
          escHtml(formState.description) +
          '" />' +
          "</label>" +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    Array.prototype.forEach.call(host.querySelectorAll(".vc-dash-tk-optcust__block"), function (block) {
      syncMultiPanelOptionCustEmojiRow(block);
      rememberOptcustEmojiSlot(block);
    });
    wireMultiPanelOptcustEmojiUi();
  }

  function fillMultiPanelSelectOptions(selectedIds, optionOverrides) {
    var empty = byId("tk-multipanel-panelIds-empty");
    var singles = (state.ticketPanels && state.ticketPanels.singles) || [];
    if (empty) {
      if (singles.length >= 2) empty.setAttribute("hidden", "");
      else empty.removeAttribute("hidden");
    }
    var extras = singles.map(function (p) {
      var parts = panelPickLabelParts(p);
      var label = parts.type ? parts.title + " · " + parts.type : parts.title;
      return { value: String(p.id), label: label };
    });
    renderMentionPillSelect("tk-multipanel-panelIds-list", [], selectedIds || [], extras, {
      placeholder: "Seleziona pannello…",
      emptyLabel: singles.length ? "" : "Nessun pannello disponibile",
      noResultsLabel: "Nessun pannello trovato",
      onChange: function () {
        renderMultiPanelOptionCustomizations();
        scheduleTicketPanelsDraftSave();
      },
    });
    renderMultiPanelOptionCustomizations(
      optionOverrides && typeof optionOverrides === "object" ? optionOverrides : {},
    );
  }

  function renderTicketPanelsTables() {
    var data = state.ticketPanels || {};
    var singles = data.singles || [];
    var multis = data.multis || [];
    var quota = data.quota || {};
    var qEl = byId("tk-panels-quota");
    if (qEl) {
      qEl.textContent =
        String(quota.singlesUsed != null ? quota.singlesUsed : singles.length) +
        " / " +
        String(quota.singlesMax != null ? quota.singlesMax : 25);
    }
    var mq = byId("tk-multipanels-quota");
    if (mq) {
      mq.textContent = String(quota.multisUsed != null ? quota.multisUsed : multis.length);
    }

    var settingsChannelId =
      (data.settings && data.settings.panelChannelId) || null;
    var pickerChannels =
      (data.pickers && data.pickers.textChannels) ||
      (state.ticketsPickers && state.ticketsPickers.textChannels) ||
      [];

    function panelChannelLabel(panel) {
      if (panel && panel.channelName) return panel.channelName;
      var cid =
        (panel && panel.channelId) ||
        settingsChannelId ||
        "";
      cid = String(cid || "").trim();
      if (!cid) return "—";
      var ch = pickerChannels.find(function (c) {
        return String(c.id) === cid;
      });
      if (ch && ch.name) {
        var n = String(ch.name);
        return n.charAt(0) === "#" ? n : "#" + n;
      }
      return "#" + cid;
    }

    var body = byId("tk-panels-body");
    var empty = byId("tk-panels-empty");
    if (body) {
      body.innerHTML = singles
        .map(function (p) {
          return (
            "<tr>" +
            "<td>" +
            escHtml(panelChannelLabel(p)) +
            "</td>" +
            "<td>" +
            escHtml(p.title || p.ticketTypeLabel || "—") +
            "</td>" +
            "<td>" +
            escHtml(p.supportHoursLabel || "24/7") +
            "</td>" +
            '<td class="vc-dash-tk-panels__actions"><div class="vc-dash-tk-panels__actions-inner">' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-panel-edit="' +
            escHtml(p.id) +
            '" title="Modifica" aria-label="Modifica"><i class="fa fa-pencil" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-panel-publish="' +
            escHtml(p.id) +
            '" title="Manda" aria-label="Manda"><i class="fa fa-paper-plane" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn is-danger" data-tk-panel-delete="' +
            escHtml(p.id) +
            '" title="Elimina" aria-label="Elimina"><i class="fa fa-trash-o" aria-hidden="true"></i></button>' +
            "</div></td></tr>"
          );
        })
        .join("");
    }
    if (empty) {
      if (singles.length) empty.setAttribute("hidden", "");
      else empty.removeAttribute("hidden");
    }

    var mbody = byId("tk-multipanels-body");
    var mempty = byId("tk-multipanels-empty");
    if (mbody) {
      mbody.innerHTML = multis
        .map(function (m) {
          var label = m.authorName || m.title || "Multi-panel";
          return (
            "<tr>" +
            "<td>" +
            escHtml(m.channelName || panelChannelLabel(m) || "—") +
            "</td>" +
            "<td>" +
            escHtml(label) +
            "</td>" +
            "<td>" +
            escHtml(String(m.panelCount || (m.panelIds && m.panelIds.length) || 0)) +
            "</td>" +
            '<td class="vc-dash-tk-panels__actions"><div class="vc-dash-tk-panels__actions-inner">' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-multi-edit="' +
            escHtml(m.id) +
            '" title="Modifica" aria-label="Modifica"><i class="fa fa-pencil" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn" data-tk-multi-publish="' +
            escHtml(m.id) +
            '" title="Manda" aria-label="Manda"><i class="fa fa-paper-plane" aria-hidden="true"></i></button>' +
            '<button type="button" class="vc-dashboard-btn vc-dash-tk-panels__btn is-danger" data-tk-multi-delete="' +
            escHtml(m.id) +
            '" title="Elimina" aria-label="Elimina"><i class="fa fa-trash-o" aria-hidden="true"></i></button>' +
            "</div></td></tr>"
          );
        })
        .join("");
    }
    if (mempty) {
      if (multis.length) mempty.setAttribute("hidden", "");
      else mempty.removeAttribute("hidden");
    }
  }

  var TK_UNICODE_EMOJIS = [
    "🎫", "📩", "✉️", "📧", "📥", "📤", "📨", "💌", "🗳️", "📋", "📝", "🖊️", "✏️", "📌", "📍",
    "🛠️", "🔧", "⚙️", "🧰", "🔑", "🔐", "🔒", "🔓", "🛡️", "⚔️", "🏹", "🎯", "💡", "🔥", "⭐",
    "🌟", "✨", "💫", "⚡", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💯", "✅",
    "☑️", "✔️", "❌", "❎", "⚠️", "🚫", "🛑", "ℹ️", "❓", "❗", "💬", "🗨️", "📢", "📣", "🔔",
    "🎵", "🎶", "🎧", "🎤", "🎬", "🎮", "🕹️", "🏆", "🥇", "🥈", "🥉", "🎁", "🎀", "🎉", "🎊",
    "☕", "🍵", "🧋", "🍺", "🍷", "🍕", "🍔", "🍩", "🍪", "🎂", "🏠", "🏡", "🏰", "🏛️", "🗺️",
    "🧭", "🚀", "✈️", "🌈", "☀️", "🌙", "🌸", "🍀", "🌿", "🌹", "🐶", "🐱", "🦊", "🐻", "🐼",
    "🦄", "🐲", "👋", "🤝", "👍", "👎", "👏", "🙏", "💪", "👀", "🧠", "👑", "💎", "🪄", "🧿",
  ];

  function parseTicketButtonEmoji(raw) {
    var s = String(raw || "").trim();
    if (!s) return { kind: "empty", text: "", custom: false };
    var m = s.match(/^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/);
    if (m) {
      var animated = m[1] === "a";
      var id = m[3];
      return {
        kind: "custom",
        text: s,
        custom: true,
        name: m[2],
        id: id,
        animated: animated,
        url: ticketPanelCustomEmojiPreviewUrl(id, animated),
      };
    }
    return { kind: "unicode", text: s, custom: false };
  }

  function ticketPanelCustomEmojiPreviewUrl(id, animated) {
    var ext = animated ? "gif" : "png";
    return (
      "https://cdn.discordapp.com/emojis/" +
      String(id || "").trim() +
      "." +
      ext +
      "?size=48"
    );
  }

  function formatCustomEmojiMarkup(emoji) {
    if (!emoji || !emoji.id) return "";
    return "<" + (emoji.animated ? "a" : "") + ":" + (emoji.name || "e") + ":" + emoji.id + ">";
  }

  function getTicketPanelEmojiPickers() {
    return (
      (state.ticketPanels && state.ticketPanels.pickers) ||
      state.ticketsPickers ||
      state.pickers ||
      state.settingsPickers ||
      {}
    );
  }

  function setTicketPanelButtonEmojiValue(raw, opts) {
    var options = opts || {};
    var input = byId("tk-panel-buttonEmoji");
    if (input) input.value = String(raw || "").trim();
    syncTicketPanelButtonEmojiUi({
      preferCustom: options.preferCustom,
      keepMenu: options.keepMenu,
    });
    if (!options.silent) scheduleTicketPanelsDraftSave();
  }

  function syncTicketPanelButtonEmojiUi(opts) {
    var options = opts || {};
    var input = byId("tk-panel-buttonEmoji");
    var preview = byId("tk-panel-buttonEmoji-preview");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    if (!input || !preview) return;
    var parsed = parseTicketButtonEmoji(input.value);
    if (options.preferCustom === true && customToggle) customToggle.checked = true;
    else if (options.preferCustom === false && customToggle) customToggle.checked = false;
    else if (customToggle && !options.keepToggle) customToggle.checked = parsed.custom === true;

    preview.classList.toggle("is-empty", parsed.kind === "empty");
    if (parsed.kind === "custom" && parsed.url) {
      preview.innerHTML =
        '<img src="' +
        escHtml(parsed.url) +
        '" alt=":' +
        escHtml(parsed.name || "emoji") +
        ':" width="22" height="22" loading="lazy" decoding="async" />';
    } else if (parsed.kind === "unicode") {
      preview.textContent = parsed.text;
    } else {
      preview.textContent = "";
    }

    if (!options.keepMenu) closeTicketPanelButtonEmojiMenu();
    else renderTicketPanelButtonEmojiGrid();
  }

  function closeTicketPanelButtonEmojiMenu() {
    var wrap = byId("tk-panel-buttonEmoji-wrap");
    var menu = byId("tk-panel-buttonEmoji-menu");
    if (wrap) wrap.classList.remove("is-open");
    if (menu) menu.setAttribute("hidden", "");
  }

  function openTicketPanelButtonEmojiMenu() {
    var wrap = byId("tk-panel-buttonEmoji-wrap");
    var menu = byId("tk-panel-buttonEmoji-menu");
    var search = byId("tk-panel-buttonEmoji-search");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    if (!menu) return;
    if (wrap) wrap.classList.add("is-open");
    menu.removeAttribute("hidden");
    if (search) search.value = "";
    renderTicketPanelButtonEmojiGrid();
    if (search) {
      try {
        search.focus();
      } catch (_) {}
    }
    // Se custom è on ma i pickers non hanno ancora le emoji (site-api), ricarica.
    if (customToggle && customToggle.checked) {
      var have = ((getTicketPanelEmojiPickers().emojis) || []).length;
      if (!have && typeof refreshTicketPanels === "function") {
        refreshTicketPanels({ silent: true }).then(function () {
          renderTicketPanelButtonEmojiGrid();
        });
      }
    }
  }

  function toggleTicketPanelButtonEmojiMenu() {
    var menu = byId("tk-panel-buttonEmoji-menu");
    if (!menu || !menu.hasAttribute("hidden")) closeTicketPanelButtonEmojiMenu();
    else openTicketPanelButtonEmojiMenu();
  }

  var TK_EMOJI_PAGE_SIZE = 72;
  var tkEmojiGridState = { items: [], shown: 0, useCustom: false, token: 0 };

  function buildTicketPanelEmojiOptHtml(e, opts) {
    var markup = formatCustomEmojiMarkup(e);
    var preview =
      (e && e.url) || ticketPanelCustomEmojiPreviewUrl(e.id, e && e.animated);
    var loading = opts && opts.eager ? "eager" : "lazy";
    return (
      '<button type="button" class="vc-dash-tk-emoji__opt" role="option" data-emoji="' +
      escHtml(markup) +
      '" title=":' +
      escHtml(e.name || "emoji") +
      ':"><img src="' +
      escHtml(preview) +
      '" alt=":' +
      escHtml(e.name || "emoji") +
      ':" width="28" height="28" loading="' +
      loading +
      '" decoding="async" /></button>'
    );
  }

  function scheduleTicketPanelEmojiGridFill() {
    var token = tkEmojiGridState.token;
    requestAnimationFrame(function () {
      if (token !== tkEmojiGridState.token || !tkEmojiGridState.useCustom) return;
      var grid = byId("tk-panel-buttonEmoji-grid");
      if (!grid) return;
      var items = tkEmojiGridState.items || [];
      if (tkEmojiGridState.shown >= items.length) return;
      // Se le emoji rotte/nascoste lasciano spazio, continua a paginare senza scroll.
      if (grid.scrollHeight <= grid.clientHeight + 12) {
        appendTicketPanelButtonEmojiPage();
      }
    });
  }

  function appendTicketPanelButtonEmojiPage() {
    var grid = byId("tk-panel-buttonEmoji-grid");
    if (!grid || !tkEmojiGridState.useCustom) return;
    var items = tkEmojiGridState.items || [];
    var start = tkEmojiGridState.shown || 0;
    if (start >= items.length) return;
    var slice = items.slice(start, start + TK_EMOJI_PAGE_SIZE);
    var eager = start === 0;
    tkEmojiGridState.shown = start + slice.length;
    var html = slice
      .map(function (e) {
        return buildTicketPanelEmojiOptHtml(e, { eager: eager });
      })
      .join("");
    if (!start) grid.innerHTML = html;
    else grid.insertAdjacentHTML("beforeend", html);
    scheduleTicketPanelEmojiGridFill();
  }

  function renderTicketPanelButtonEmojiGrid() {
    var grid = byId("tk-panel-buttonEmoji-grid");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    var search = byId("tk-panel-buttonEmoji-search");
    if (!grid) return;
    var q = String((search && search.value) || "")
      .trim()
      .toLowerCase();
    var useCustom = Boolean(customToggle && customToggle.checked);
    tkEmojiGridState.token += 1;
    if (useCustom) {
      var emojis = ((getTicketPanelEmojiPickers().emojis) || []).filter(function (e) {
        if (!e || !e.id) return false;
        if (!q) return true;
        return String(e.name || "")
          .toLowerCase()
          .indexOf(q) !== -1;
      });
      tkEmojiGridState = {
        items: emojis,
        shown: 0,
        useCustom: true,
        token: tkEmojiGridState.token,
      };
      if (!emojis.length) {
        grid.innerHTML =
          '<div class="vc-dash-tk-emoji__empty">' +
          (q ? "Nessuna emoji trovata." : "Nessuna emoji custom in questo server.") +
          "</div>";
        return;
      }
      grid.innerHTML = "";
      appendTicketPanelButtonEmojiPage();
      return;
    }

    tkEmojiGridState = { items: [], shown: 0, useCustom: false, token: tkEmojiGridState.token };
    var list = TK_UNICODE_EMOJIS.filter(function (emoji) {
      if (!q) return true;
      return String(emoji).toLowerCase().indexOf(q) !== -1;
    });
    if (!list.length) {
      grid.innerHTML = '<div class="vc-dash-tk-emoji__empty">Nessuna emoji trovata.</div>';
      return;
    }
    grid.innerHTML = list
      .map(function (emoji) {
        return (
          '<button type="button" class="vc-dash-tk-emoji__opt" role="option" data-emoji="' +
          escHtml(emoji) +
          '" title="' +
          escHtml(emoji) +
          '">' +
          escHtml(emoji) +
          "</button>"
        );
      })
      .join("");
  }

  function wireTicketPanelButtonEmojiUi() {
    if (document.__vcTkEmojiWired) return;
    document.__vcTkEmojiWired = true;

    var pick = byId("tk-panel-buttonEmoji-pick");
    var valueBtn = byId("tk-panel-buttonEmoji-value");
    var customToggle = byId("tk-panel-buttonEmoji-custom");
    var search = byId("tk-panel-buttonEmoji-search");
    var clearBtn = byId("tk-panel-buttonEmoji-clear");
    var grid = byId("tk-panel-buttonEmoji-grid");

    function openPick(ev) {
      if (ev) ev.preventDefault();
      toggleTicketPanelButtonEmojiMenu();
    }
    if (pick) pick.addEventListener("click", openPick);
    if (valueBtn) valueBtn.addEventListener("click", openPick);

    if (customToggle) {
      customToggle.addEventListener("change", function () {
        var input = byId("tk-panel-buttonEmoji");
        var parsed = parseTicketButtonEmoji(input && input.value);
        if (customToggle.checked && parsed.kind === "unicode") {
          setTicketPanelButtonEmojiValue("", { preferCustom: true, keepMenu: true, silent: false });
        } else if (!customToggle.checked && parsed.kind === "custom") {
          setTicketPanelButtonEmojiValue("", { preferCustom: false, keepMenu: true, silent: false });
        } else {
          syncTicketPanelButtonEmojiUi({ keepToggle: true, keepMenu: true });
        }
        var menu = byId("tk-panel-buttonEmoji-menu");
        if (menu && menu.hasAttribute("hidden")) openTicketPanelButtonEmojiMenu();
      });
    }

    if (search) {
      search.addEventListener("input", function () {
        renderTicketPanelButtonEmojiGrid();
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        setTicketPanelButtonEmojiValue("", {
          preferCustom: Boolean(customToggle && customToggle.checked),
          silent: false,
        });
      });
    }
    if (grid) {
      grid.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-emoji]") : null;
        if (!btn || btn.classList.contains("is-broken")) return;
        setTicketPanelButtonEmojiValue(btn.getAttribute("data-emoji") || "", {
          preferCustom: Boolean(customToggle && customToggle.checked),
          silent: false,
        });
      });
      grid.addEventListener(
        "error",
        function (ev) {
          var img = ev.target;
          if (!img || img.tagName !== "IMG") return;
          var src = String(img.getAttribute("src") || img.src || "");
          // GIF fallita → riprova PNG una volta (alcune animate hanno solo frame statico).
          if (!img.dataset.vcEmojiFallback && /\.gif(\?|$)/i.test(src)) {
            img.dataset.vcEmojiFallback = "1";
            img.src = src.replace(/\.gif(\?|$)/i, ".png$1");
            return;
          }
          var btn = img.closest ? img.closest(".vc-dash-tk-emoji__opt") : null;
          if (btn) {
            btn.classList.add("is-broken");
            btn.setAttribute("hidden", "");
            btn.setAttribute("aria-hidden", "true");
            scheduleTicketPanelEmojiGridFill();
          } else {
            img.remove();
          }
        },
        true,
      );
      grid.addEventListener("scroll", function () {
        if (!tkEmojiGridState.useCustom) return;
        if (tkEmojiGridState.shown >= (tkEmojiGridState.items || []).length) return;
        if (grid.scrollTop + grid.clientHeight < grid.scrollHeight - 48) return;
        appendTicketPanelButtonEmojiPage();
      });
    }

    document.addEventListener(
      "pointerdown",
      function (ev) {
        var wrap = byId("tk-panel-buttonEmoji-wrap");
        var menu = byId("tk-panel-buttonEmoji-menu");
        if (!wrap || !menu || menu.hasAttribute("hidden")) return;
        if (wrap.contains(ev.target)) return;
        closeTicketPanelButtonEmojiMenu();
      },
      true,
    );
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      closeTicketPanelButtonEmojiMenu();
    });
  }

  async function refreshTicketPanels(opts) {
    var options = opts || {};
    var token = getToken();
    if (!token || !state.guildId || !canUseTickets()) return;
    if (state.ticketPanelsLoading) return;
    state.ticketPanelsLoading = true;
    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/tickets/panels",
        token,
        { attempts: options.silent ? 1 : 3 },
      );
      if (!out.res.ok || !out.data || out.data.ok === false) {
        if (!options.silent) {
          setError((out.data && out.data.message) || "Impossibile caricare i pannelli ticket.");
        }
        return;
      }
      state.ticketPanels = out.data;
      if (out.data.pickers) state.ticketsPickers = out.data.pickers;
      renderTicketPanelsTables();
      fillTicketPanelChannelSelects();
      enhanceAllDashFancySelects(byId("tk-panels-root") || document);
    } catch (_) {
      if (!options.silent) setError("Impossibile caricare i pannelli ticket.");
    } finally {
      state.ticketPanelsLoading = false;
    }
  }

  function openSinglePanelEditor(panel, options) {
    var opts = options || {};
    var isEdit = Boolean(panel && panel.id);
    var createType = String(opts.ticketType || (panel && panel.ticketType) || "").trim().toLowerCase();
    if (createType === "highstaff") createType = "high";
    state.ticketPanelsEditor = { mode: "single", id: isEdit ? String(panel.id) : null };
    if (!opts.skipRoute) {
      setTicketPanelsRoute("single", state.ticketPanelsEditor.id, { replace: true });
    }
    setTicketPanelsMode("single");
    var editor = byId("tk-panel-editor");
    fillTicketPanelChannelSelects(panel);
    byId("tk-panel-editor-title").textContent = isEdit ? "Modifica pannello" : "Crea pannello";
    byId("tk-panel-save-btn").querySelector("span").textContent = isEdit
      ? "Salva e invia"
      : "Crea e invia";
    byId("tk-panel-id").value = isEdit ? String(panel.id) : "";
    var typeSelect = byId("tk-panel-ticketType");
    if (typeSelect) {
      // Editor sempre custom: niente UI tipo Supporto/Partnership/… (solo valore interno).
      typeSelect.value = isEdit
        ? String((panel && panel.ticketType) || "supporto")
        : createType || "supporto";
    }
    byId("tk-panel-channelId").value =
      (panel && panel.channelId) ||
      (state.ticketPanels && state.ticketPanels.settings && state.ticketPanels.settings.panelChannelId) ||
      "";
    byId("tk-panel-title").value = (panel && panel.title) || "";
    byId("tk-panel-color").value = (panel && panel.color) || "#6f4e37";
    byId("tk-panel-content").value = (panel && panel.content) || "";
    byId("tk-panel-buttonText").value = (panel && panel.buttonText) || "Open a ticket!";
    byId("tk-panel-buttonStyle").value = (panel && panel.buttonStyle) || "Primary";
    var emoji = panel && panel.buttonEmoji;
    byId("tk-panel-buttonEmoji").value = emoji
      ? emoji.id
        ? "<" + (emoji.animated ? "a" : "") + ":" + (emoji.name || "e") + ":" + emoji.id + ">"
        : emoji.name || ""
      : "";
    syncTicketPanelButtonEmojiUi({ silent: true });
    byId("tk-panel-largeImageUrl").value = (panel && panel.largeImageUrl) || "";
    byId("tk-panel-smallImageUrl").value = (panel && panel.smallImageUrl) || "";
    byId("tk-panel-disabled").checked = Boolean(panel && panel.disabled);

      setChecked("tk-panel-deleteMentionsOnOpen", panel ? panel.deleteMentionsOnOpen === true : false);
    setValue("tk-panel-openCooldownSeconds", (panel && panel.openCooldownSeconds) || 0);
    setValue(
      "tk-panel-maxOpenTicketsPerUser",
      panel && panel.maxOpenTicketsPerUser != null ? panel.maxOpenTicketsPerUser : "",
    );
    setValue("tk-panel-formId", (panel && panel.formId) || "");

    // Riallinea voci «Globale» dopo aver valorizzato i campi panel.
    syncTicketPanelGlobalInheritedControls(panel);

    var welcomePanel = panel;
    if (!isEdit && createType) {
      welcomePanel = { ticketType: createType };
    }
    fillWelcomeForm(resolveWelcomeForEditor(welcomePanel));
    fillTicketPermsForm(panel && panel.ticketPerms);
    renderAccessRulesList((panel && panel.accessRules) || [{ roleId: "everyone", allow: true }]);
    fillSupportHoursForm(panel && panel.supportHours);

    if (!opts.skipDraft) {
      var draft = readTicketPanelsDraft();
      if (draftMatchesRoute(draft, state.ticketPanelsEditor) && draft.form) {
        var draftForm = Object.assign({}, draft.form);
        // In creazione il tipo si sceglie nell'editor (non da un menu preset).
        if (!isEdit && createType) draftForm.ticketType = createType;
        applySinglePanelFormData(draftForm);
      } else {
        persistTicketPanelsDraftNow();
      }
    }

    if (!isEdit && typeSelect && createType) {
      typeSelect.value = createType;
    }
    // All'apertura: prime 2 sezioni aperte, le altre chiuse (ma apribili).
    Array.prototype.forEach.call(editor ? editor.querySelectorAll("details.vc-dash-tk-acc") : [], function (acc, idx) {
      if (idx < 2) acc.setAttribute("open", "");
      else acc.removeAttribute("open");
    });
    enhanceAllDashFancySelects(editor || document);
  }

  function renderMultiPanelFieldsList(fields) {
    var list = byId("tk-multipanel-fields-list");
    if (!list) return;
    var rows = Array.isArray(fields) ? fields : [];
    list.innerHTML = rows
      .map(function (f) {
        return (
          '<div class="vc-dash-tk-field-row">' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Nome campo</span>' +
          '<input type="text" class="vc-dash-tk-field-name" maxlength="256" value="' +
          escHtml((f && f.name) || "") +
          '" /></label>' +
          '<label class="vc-dash-picker"><span class="vc-dash-picker__label">Valore</span>' +
          '<input type="text" class="vc-dash-tk-field-value" maxlength="1024" value="' +
          escHtml((f && f.value) || "") +
          '" /></label>' +
          '<label class="vc-dash-tk-field-inline"><input type="checkbox" class="vc-dash-tk-field-inline-check"' +
          (f && f.inline ? " checked" : "") +
          " /><span>Inline</span></label>" +
          '<button type="button" class="vc-dashboard-btn vc-dashboard-btn--danger vc-dash-tk-field-remove" aria-label="Rimuovi campo">' +
          '<i class="fa fa-trash" aria-hidden="true"></i></button>' +
          "</div>"
        );
      })
      .join("");
  }

  function readMultiPanelFieldsList() {
    var list = byId("tk-multipanel-fields-list");
    var out = [];
    if (!list) return out;
    Array.prototype.forEach.call(list.querySelectorAll(".vc-dash-tk-field-row"), function (row) {
      var nameEl = row.querySelector(".vc-dash-tk-field-name");
      var valueEl = row.querySelector(".vc-dash-tk-field-value");
      var inlineEl = row.querySelector(".vc-dash-tk-field-inline-check");
      var name = nameEl ? String(nameEl.value || "").trim() : "";
      var value = valueEl ? String(valueEl.value || "").trim() : "";
      if (!name || !value) return;
      out.push({ name: name, value: value, inline: Boolean(inlineEl && inlineEl.checked) });
    });
    return out;
  }

  function openMultiPanelEditor(multi, options) {
    var opts = options || {};
    var isEdit = Boolean(multi && multi.id);
    state.ticketPanelsEditor = { mode: "multi", id: isEdit ? String(multi.id) : null };
    if (!opts.skipRoute) {
      setTicketPanelsRoute("multi", state.ticketPanelsEditor.id, { replace: true });
    }
    setTicketPanelsMode("multi");
    var multiEditor = byId("tk-multipanel-editor");
    fillTicketPanelChannelSelects();
    fillMultiPanelSelectOptions((multi && multi.panelIds) || [], (multi && multi.optionOverrides) || {});
    byId("tk-multipanel-save-btn").querySelector("span").textContent = isEdit
      ? "Salva e invia"
      : "Crea e invia";
    var multiTitle = byId("tk-multipanel-editor-title");
    if (multiTitle) multiTitle.textContent = isEdit ? "Modifica multi-panel" : "Crea multi-panel";
    byId("tk-multipanel-id").value = isEdit ? String(multi.id) : "";
    byId("tk-multipanel-channelId").value =
      (multi && multi.channelId) ||
      (state.ticketPanels && state.ticketPanels.settings && state.ticketPanels.settings.panelChannelId) ||
      "";
    byId("tk-multipanel-useDropdown").checked = !multi || multi.useDropdown !== false;
    byId("tk-multipanel-dropdownPlaceholder").value =
      (multi && multi.dropdownPlaceholder) || "Seleziona un argomento...";
    byId("tk-multipanel-title").value = (multi && multi.title) || "";
    byId("tk-multipanel-titleUrl").value = (multi && multi.titleUrl) || "";
    byId("tk-multipanel-color").value = (multi && multi.color) || "#6f4e37";
    byId("tk-multipanel-description").value = (multi && multi.description) || "";
    byId("tk-multipanel-authorName").value = (multi && multi.authorName) || "";
    byId("tk-multipanel-authorIconUrl").value = (multi && multi.authorIconUrl) || "";
    byId("tk-multipanel-authorUrl").value = (multi && multi.authorUrl) || "";
    byId("tk-multipanel-largeImageUrl").value = (multi && multi.largeImageUrl) || "";
    byId("tk-multipanel-smallImageUrl").value = (multi && multi.smallImageUrl) || "";
    byId("tk-multipanel-footerText").value = (multi && multi.footerText) || "";
    byId("tk-multipanel-footerIconUrl").value = (multi && multi.footerIconUrl) || "";
    byId("tk-multipanel-footerTimestamp").checked = Boolean(multi && multi.footerTimestamp);
    renderMultiPanelFieldsList((multi && multi.fields) || []);
    Array.prototype.forEach.call(multiEditor ? multiEditor.querySelectorAll("details.vc-dash-tk-acc") : [], function (acc) {
      acc.setAttribute("open", "");
    });
    syncMultiPanelDropdownPlaceholderUi();
    enhanceAllDashFancySelects(multiEditor || document);

    if (!opts.skipDraft) {
      var draft = readTicketPanelsDraft();
      if (draftMatchesRoute(draft, state.ticketPanelsEditor) && draft.form) {
        applyMultiPanelFormData(draft.form);
        // Non lasciare che una draft vuota cancelli i pannelli già salvati.
        if (
          multi &&
          Array.isArray(multi.panelIds) &&
          multi.panelIds.length &&
          !readRoleCheckList("tk-multipanel-panelIds-list").length
        ) {
          fillMultiPanelSelectOptions(multi.panelIds, multi.optionOverrides || {});
        }
        // Personalizzazione: se non c'è override salvato, ignora draft "emoji custom vuota"
        // che lascia la UI fuori sync rispetto a Discord.
        var savedOv =
          multi && multi.optionOverrides && typeof multi.optionOverrides === "object"
            ? multi.optionOverrides
            : {};
        if (Object.keys(savedOv).length) {
          renderMultiPanelOptionCustomizations(savedOv);
        } else {
          renderMultiPanelOptionCustomizations({});
        }
        if (
          multi &&
          multi.dropdownPlaceholder &&
          !String((byId("tk-multipanel-dropdownPlaceholder") && byId("tk-multipanel-dropdownPlaceholder").value) || "").trim()
        ) {
          byId("tk-multipanel-dropdownPlaceholder").value = multi.dropdownPlaceholder;
        }
        syncMultiPanelDropdownPlaceholderUi();
      } else {
        persistTicketPanelsDraftNow();
      }
    }
  }

  function readSinglePanelForm() {
    var emojiRaw = String((byId("tk-panel-buttonEmoji") && byId("tk-panel-buttonEmoji").value) || "").trim();
    var maxOpenRaw = String(
      (byId("tk-panel-maxOpenTicketsPerUser") && byId("tk-panel-maxOpenTicketsPerUser").value) || "",
    ).trim();
    return {
      ticketType: (function () {
        var el = byId("tk-panel-ticketType");
        if (!el) return "";
        // In modifica il select è disabilitato: va letto comunque (disabled non entra in FormData, ma .value sì).
        return String(el.value || "").trim();
      })(),
      channelId: byId("tk-panel-channelId").value,
      title: byId("tk-panel-title").value,
      color: byId("tk-panel-color").value,
      content: byId("tk-panel-content").value,
      buttonText: byId("tk-panel-buttonText").value,
      buttonStyle: byId("tk-panel-buttonStyle").value,
      buttonEmoji: emojiRaw || null,
      largeImageUrl: byId("tk-panel-largeImageUrl").value || null,
      smallImageUrl: byId("tk-panel-smallImageUrl").value || null,
      disabled: Boolean(byId("tk-panel-disabled").checked),
      mentionOnOpen: readRoleCheckList("tk-panel-mentionOnOpen-list"),
      supportTeamIds: readRoleCheckList("tk-panel-supportTeamIds-list"),
      transcriptChannelId: byId("tk-panel-transcriptChannelId").value || null,
      deleteMentionsOnOpen: Boolean(byId("tk-panel-deleteMentionsOnOpen").checked),
      threadMode: false,
      threadNotificationChannelId: null,
      openCooldownSeconds: Number(byId("tk-panel-openCooldownSeconds").value) || 0,
      categoryId: byId("tk-panel-categoryId").value || null,
      maxOpenTicketsPerUser: maxOpenRaw === "" ? null : Number(maxOpenRaw),
      hideCloseButton: triStateFromSelectValue(byId("tk-panel-hideCloseButton").value),
      hideCloseReasonButton: triStateFromSelectValue(byId("tk-panel-hideCloseReasonButton").value),
      hideClaimButton: triStateFromSelectValue(byId("tk-panel-hideClaimButton").value),
      formId: byId("tk-panel-formId").value || null,
      welcome: readWelcomeForm(),
      ticketPerms: readTicketPermsForm(),
      accessRules: readAccessRulesList(),
      supportHours: readSupportHoursForm(),
      // Salva config; backend aggiorna il messaggio Discord solo se già pubblicato.
      publish: false,
      syncExisting: true,
    };
  }

  function readMultiPanelForm() {
    return {
      channelId: byId("tk-multipanel-channelId").value,
      panelIds: readRoleCheckList("tk-multipanel-panelIds-list"),
      useDropdown: Boolean(byId("tk-multipanel-useDropdown").checked),
      dropdownPlaceholder: byId("tk-multipanel-dropdownPlaceholder").value,
      title: byId("tk-multipanel-title").value,
      titleUrl: byId("tk-multipanel-titleUrl").value || null,
      color: byId("tk-multipanel-color").value,
      description: byId("tk-multipanel-description").value,
      authorName: byId("tk-multipanel-authorName").value || null,
      authorIconUrl: byId("tk-multipanel-authorIconUrl").value || null,
      authorUrl: byId("tk-multipanel-authorUrl").value || null,
      largeImageUrl: byId("tk-multipanel-largeImageUrl").value || null,
      smallImageUrl: byId("tk-multipanel-smallImageUrl").value || null,
      footerText: byId("tk-multipanel-footerText").value || null,
      footerIconUrl: byId("tk-multipanel-footerIconUrl").value || null,
      footerTimestamp: Boolean(byId("tk-multipanel-footerTimestamp") && byId("tk-multipanel-footerTimestamp").checked),
      fields: readMultiPanelFieldsList(),
      optionOverrides: readMultiPanelOptionOverrides(),
      // Multi: salva + aggiorna messaggio Discord solo se già pubblicato.
      publish: false,
      syncExisting: true,
    };
  }

  async function saveSinglePanelForm(ev) {
    if (ev) ev.preventDefault();
    if (state.ticketPanelsSaving) return;
    state.ticketPanelsSaving = true;
    try {
      var id = String((byId("tk-panel-id") && byId("tk-panel-id").value) || "").trim();
      var body = readSinglePanelForm();
      if (!String(body.ticketType || "").trim()) body.ticketType = "supporto";
      var out = id
        ? await ticketPanelsApi("/panels/" + encodeURIComponent(id), "PATCH", body)
        : await ticketPanelsApi("/panels", "POST", body);
      if (!out.res.ok || !out.data || out.data.ok === false) {
        showSaveToast((out.data && out.data.message) || "Salvataggio fallito.", true);
        return;
      }
      if (out.data.publishWarning) showSaveToast(out.data.publishWarning, true);
      else showSaveToast(id ? "Pannello aggiornato." : "Pannello creato.");
      clearTicketPanelsDraft();
      await refreshTicketPanels({ silent: true });
      showTicketPanelsList();
    } catch (_) {
      showSaveToast("Salvataggio fallito.", true);
    } finally {
      state.ticketPanelsSaving = false;
    }
  }

  async function saveMultiPanelForm(ev) {
    if (ev) ev.preventDefault();
    if (state.ticketPanelsSaving) return;
    state.ticketPanelsSaving = true;
    try {
      var id = String((byId("tk-multipanel-id") && byId("tk-multipanel-id").value) || "").trim();
      var body = readMultiPanelForm();
      if (!body.panelIds || body.panelIds.length < 2) {
        showSaveToast("Seleziona almeno 2 pannelli.", true);
        return;
      }
      var out = id
        ? await ticketPanelsApi("/multipanels/" + encodeURIComponent(id), "PATCH", body)
        : await ticketPanelsApi("/multipanels", "POST", body);
      if (!out.res.ok || !out.data || out.data.ok === false) {
        showSaveToast((out.data && out.data.message) || "Salvataggio fallito.", true);
        return;
      }
      if (out.data.publishWarning) showSaveToast(out.data.publishWarning, true);
      else showSaveToast(id ? "Multi-panel aggiornato." : "Multi-panel creato.");
      clearTicketPanelsDraft();
      await refreshTicketPanels({ silent: true });
      showTicketPanelsList();
    } catch (_) {
      showSaveToast("Salvataggio fallito.", true);
    } finally {
      state.ticketPanelsSaving = false;
    }
  }

  function wireTicketsUi() {
    if (wireTicketsUi.__wired) return;
    wireTicketsUi.__wired = true;
    wireTicketTeamsUi();
    wireTicketFormsUi();
    wireTicketBlacklistUi();
    var saveBtn = byId("tk-save-btn");
    if (saveBtn) {
      saveBtn.addEventListener("click", function () {
        saveTickets();
      });
    }
    ["tk-tx-ticketId", "tk-tx-username", "tk-tx-userId", "tk-tx-closedBy", "tk-tx-closeReason", "tk-tx-claimedBy"].forEach(
      function (id) {
        var el = byId(id);
        if (!el) return;
        el.addEventListener("input", function () {
          scheduleTranscriptsFilterRefresh();
        });
        el.addEventListener("blur", function () {
          if (state.transcriptsFilterTimer) flushTranscriptsFilterRefresh();
        });
        el.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter") {
            ev.preventDefault();
            flushTranscriptsFilterRefresh();
          }
        });
      },
    );
    ["tk-tx-panel", "tk-tx-rating"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener("change", function () {
        flushTranscriptsFilterRefresh();
      });
    });
    var txFirst = byId("tk-tx-first");
    if (txFirst) {
      txFirst.addEventListener("click", function () {
        state.transcriptsOffset = 0;
        refreshTranscriptsList({ silent: true });
      });
    }
    var txPrev = byId("tk-tx-prev");
    if (txPrev) {
      txPrev.addEventListener("click", function () {
        state.transcriptsOffset = Math.max(
          0,
          Number(state.transcriptsOffset || 0) - Number(state.transcriptsPageSize || 25),
        );
        refreshTranscriptsList({ silent: true });
      });
    }
    var txNext = byId("tk-tx-next");
    if (txNext) {
      txNext.addEventListener("click", function () {
        state.transcriptsOffset =
          Number(state.transcriptsOffset || 0) + Number(state.transcriptsPageSize || 25);
        refreshTranscriptsList({ silent: true });
      });
    }
    var txLast = byId("tk-tx-last");
    if (txLast) {
      txLast.addEventListener("click", function () {
        var size = Number(state.transcriptsPageSize || 25);
        var total = Number(state.transcriptsTotal || 0);
        var lastPage = Math.max(1, Math.ceil(total / size) || 1);
        state.transcriptsOffset = Math.max(0, (lastPage - 1) * size);
        refreshTranscriptsList({ silent: true });
      });
    }

    ["tk-open-ticketId", "tk-open-username", "tk-open-userId", "tk-open-claimedBy"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener("input", function () {
        scheduleOpenTicketsFilterRefresh();
      });
      el.addEventListener("blur", function () {
        flushOpenTicketsFilterRefresh();
      });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          flushOpenTicketsFilterRefresh();
        }
      });
    });
    ["tk-open-sort", "tk-open-panel"].forEach(function (id) {
      var el = byId(id);
      if (!el) return;
      el.addEventListener("change", function () {
        flushOpenTicketsFilterRefresh();
      });
    });
    var mineToggle = byId("tk-open-mineOrUnclaimed");
    if (mineToggle) {
      mineToggle.addEventListener("change", function () {
        flushOpenTicketsFilterRefresh();
      });
    }
    var openFirst = byId("tk-open-first");
    if (openFirst) {
      openFirst.addEventListener("click", function () {
        state.openTicketsOffset = 0;
        refreshOpenTicketsList({ silent: true });
      });
    }
    var openPrev = byId("tk-open-prev");
    if (openPrev) {
      openPrev.addEventListener("click", function () {
        state.openTicketsOffset = Math.max(
          0,
          Number(state.openTicketsOffset || 0) - Number(state.openTicketsPageSize || 30),
        );
        refreshOpenTicketsList({ silent: true });
      });
    }
    var openNext = byId("tk-open-next");
    if (openNext) {
      openNext.addEventListener("click", function () {
        state.openTicketsOffset =
          Number(state.openTicketsOffset || 0) + Number(state.openTicketsPageSize || 30);
        refreshOpenTicketsList({ silent: true });
      });
    }
    var openLast = byId("tk-open-last");
    if (openLast) {
      openLast.addEventListener("click", function () {
        var size = Number(state.openTicketsPageSize || 30);
        var total = Number(state.openTicketsTotal || 0);
        var lastPage = Math.max(1, Math.ceil(total / size) || 1);
        state.openTicketsOffset = Math.max(0, (lastPage - 1) * size);
        refreshOpenTicketsList({ silent: true });
      });
    }

    var txBody = byId("tk-tx-body");
    if (txBody && !txBody.__vcTxOpenWired) {
      txBody.__vcTxOpenWired = true;
      txBody.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-tk-tx-open]") : null;
        if (!btn || btn.disabled) return;
        openTranscriptRow(btn.getAttribute("data-tk-tx-open"));
      });
    }
    var txBack = byId("tk-tx-viewer-back");
    if (txBack && !txBack.__vcWired) {
      txBack.__vcWired = true;
      txBack.addEventListener("click", function () {
        closeTranscriptViewer();
      });
    }
    var toggle = byId("vc-dashboard-sidebar-tickets-toggle");
    var group = byId("vc-dashboard-sidebar-tickets");
    if (toggle && group && !toggle.__vcTkWired) {
      // Wire principale: pointerdown in wireForm (come bacheca/partnership).
      toggle.__vcTkWired = true;
    }

    var newPanelBtn = byId("tk-panels-new-btn");
    if (newPanelBtn && !newPanelBtn.__vcNewPanelWired) {
      newPanelBtn.__vcNewPanelWired = true;
      newPanelBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        clearTicketPanelsDraft();
        openSinglePanelEditor(null);
      });
    }
    var newMultiBtn = byId("tk-multipanels-new-btn");
    if (newMultiBtn) {
      newMultiBtn.addEventListener("click", function () {
        openMultiPanelEditor(null);
      });
    }
    var backPanel = byId("tk-panel-editor-back");
    if (backPanel) backPanel.addEventListener("click", showTicketPanelsList);
    var backMulti = byId("tk-multipanel-editor-back");
    if (backMulti) backMulti.addEventListener("click", showTicketPanelsList);
    var panelForm = byId("tk-panel-form");
    if (panelForm) panelForm.addEventListener("submit", saveSinglePanelForm);
    wireTicketPanelButtonEmojiUi();
    wireMultiPanelOptcustEmojiUi();
    var multiForm = byId("tk-multipanel-form");
    if (multiForm) multiForm.addEventListener("submit", saveMultiPanelForm);
    var useDropdownToggle = byId("tk-multipanel-useDropdown");
    if (useDropdownToggle && !useDropdownToggle.__vcPlaceholderWired) {
      useDropdownToggle.__vcPlaceholderWired = true;
      useDropdownToggle.addEventListener("change", syncMultiPanelDropdownPlaceholderUi);
    }

    if (!document.__vcTkPanelDraftWired) {
      document.__vcTkPanelDraftWired = true;
      function onDraftEvent(ev) {
        var t = ev.target;
        if (!t) return;
        if (
          (t.closest && t.closest("#tk-panel-form")) ||
          (t.closest && t.closest("#tk-multipanel-form")) ||
          (t.closest && t.closest("#tk-panel-mentionOnOpen-list")) ||
          (t.closest && t.closest("#tk-panel-supportTeamIds-list")) ||
          (t.closest && t.closest("#tk-multipanel-panelIds-list"))
        ) {
          scheduleTicketPanelsDraftSave();
        }
      }
      document.addEventListener("input", onDraftEvent, true);
      document.addEventListener("change", onDraftEvent, true);
      window.addEventListener("beforeunload", function () {
        persistTicketPanelsDraftNow();
      });
      window.addEventListener("pagehide", function () {
        persistTicketPanelsDraftNow();
      });
    }

    var addFieldBtn = byId("tk-panel-welcome-fields-add");
    if (addFieldBtn) {
      addFieldBtn.addEventListener("click", function () {
        var current = readWelcomeFieldsList();
        if (current.length >= 25) return;
        current.push({ name: "", value: "", inline: false });
        renderWelcomeFieldsList(current);
      });
    }
    var insertMentionsBtn = byId("tk-panel-welcome-insert-mentions");
    if (insertMentionsBtn) {
      insertMentionsBtn.addEventListener("click", function (ev) {
        if (ev && ev.preventDefault) ev.preventDefault();
        insertSelectedRoleMentionsIntoWelcome();
      });
    }
    var fieldsList = byId("tk-panel-welcome-fields-list");
    if (fieldsList) {
      fieldsList.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-field-remove") : null;
        if (!btn) return;
        var row = btn.closest(".vc-dash-tk-field-row");
        if (row) row.remove();
      });
    }

    var addMultiFieldBtn = byId("tk-multipanel-fields-add");
    if (addMultiFieldBtn) {
      addMultiFieldBtn.addEventListener("click", function () {
        var current = readMultiPanelFieldsList();
        if (current.length >= 25) return;
        current.push({ name: "", value: "", inline: false });
        renderMultiPanelFieldsList(current);
      });
    }
    var multiFieldsList = byId("tk-multipanel-fields-list");
    if (multiFieldsList) {
      multiFieldsList.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-field-remove") : null;
        if (!btn) return;
        var row = btn.closest(".vc-dash-tk-field-row");
        if (row) row.remove();
      });
    }

    var addRuleBtn = byId("tk-panel-accessRules-add");
    if (addRuleBtn) {
      addRuleBtn.addEventListener("click", function () {
        var current = readAccessRulesList();
        if (current.length >= 25) return;
        current.push({ roleId: "everyone", allow: true });
        renderAccessRulesList(current);
      });
    }
    var rulesList = byId("tk-panel-accessRules-list");
    if (rulesList) {
      rulesList.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-dash-tk-rule-remove") : null;
        if (!btn) return;
        var row = btn.closest(".vc-dash-tk-rule-row");
        if (row) row.remove();
      });
    }

    var permsGrid = byId("tk-panel-ticketPerms-grid");
    if (permsGrid && !permsGrid.__vcPermsWired) {
      permsGrid.__vcPermsWired = true;
      permsGrid.addEventListener("change", function (ev) {
        var input = ev.target;
        if (!input || !input.matches || !input.matches('input[type="checkbox"][id^="tk-panel-perm-"]')) return;
        // Aggiorna hint override senza resettare i valori appena cambiati.
        var draft = { replace: true };
        TICKET_PANEL_PERM_KEYS.forEach(function (key) {
          var el = byId("tk-panel-perm-" + key);
          draft[key] = Boolean(el && el.checked);
        });
        fillTicketPermsForm(draft);
      });
    }

    var hoursDays = byId("tk-panel-supportHours-days");
    if (hoursDays && !hoursDays.__vcHoursWired) {
      hoursDays.__vcHoursWired = true;
      hoursDays.addEventListener("change", function (ev) {
        var input = ev.target;
        if (!input || !input.matches) return;
        var row = input.closest(".vc-dash-tk-hours-day");
        if (!row) return;
        var day = row.getAttribute("data-day");
        if (!day) return;
        if (input.matches('[id$="-enabled"]')) {
          var allDayEl = byId("tk-panel-supportHours-" + day + "-allDay");
          if (input.checked) {
            // Abilitato = fascia oraria (come Ticket Tool).
            if (allDayEl) allDayEl.checked = false;
            var startEl = byId("tk-panel-supportHours-" + day + "-start");
            var endEl = byId("tk-panel-supportHours-" + day + "-end");
            if (startEl && !startEl.value) startEl.value = "09:00";
            if (endEl && !endEl.value) endEl.value = "17:00";
          } else if (allDayEl) {
            allDayEl.checked = true;
          }
        }
        syncSupportHoursUi();
      });
    }
    var hoursTz = byId("tk-panel-supportHours-timezone");
    if (hoursTz && !hoursTz.__vcHoursTzWired) {
      hoursTz.__vcHoursTzWired = true;
      hoursTz.addEventListener("change", function () {
        syncSupportHoursUi();
      });
    }
    var hoursCopy = byId("tk-panel-supportHours-copyWeekdays");
    if (hoursCopy && !hoursCopy.__vcWired) {
      hoursCopy.__vcWired = true;
      hoursCopy.addEventListener("click", function () {
        var mon = {
          enabled: Boolean((byId("tk-panel-supportHours-monday-enabled") || {}).checked),
          allDay: Boolean((byId("tk-panel-supportHours-monday-allDay") || {}).checked),
          start: (byId("tk-panel-supportHours-monday-start") || {}).value || "09:00",
          end: (byId("tk-panel-supportHours-monday-end") || {}).value || "17:00",
        };
        ["tuesday", "wednesday", "thursday", "friday"].forEach(function (day) {
          applySupportHoursDay(day, mon);
        });
        syncSupportHoursUi();
      });
    }
    var hoursBusiness = byId("tk-panel-supportHours-business");
    if (hoursBusiness && !hoursBusiness.__vcWired) {
      hoursBusiness.__vcWired = true;
      hoursBusiness.addEventListener("click", function () {
        TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
          var isWeekday = day !== "saturday" && day !== "sunday";
          applySupportHoursDay(day, {
            enabled: isWeekday,
            allDay: false,
            start: "09:00",
            end: "17:00",
          });
        });
        syncSupportHoursUi();
      });
    }
    var hoursClear = byId("tk-panel-supportHours-clear");
    if (hoursClear && !hoursClear.__vcWired) {
      hoursClear.__vcWired = true;
      hoursClear.addEventListener("click", function () {
        TICKET_PANEL_SUPPORT_HOURS_DAYS.forEach(function (day) {
          applySupportHoursDay(day, { enabled: false, allDay: true, start: "09:00", end: "17:00" });
        });
        syncSupportHoursUi();
      });
    }
    if (!window.__vcSupportHoursClock) {
      window.__vcSupportHoursClock = setInterval(function () {
        if (!byId("tk-panel-supportHours-status")) return;
        syncSupportHoursUi();
      }, 30000);
    }
    var panelsBody = byId("tk-panels-body");
    if (panelsBody && !panelsBody.__vcPanelsWired) {
      panelsBody.__vcPanelsWired = true;
      panelsBody.addEventListener("click", async function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-tk-panel-edit],[data-tk-panel-publish],[data-tk-panel-delete]") : null;
        if (!t) return;
        var editId = t.getAttribute("data-tk-panel-edit");
        var pubId = t.getAttribute("data-tk-panel-publish");
        var delId = t.getAttribute("data-tk-panel-delete");
        if (editId) {
          var panel = ((state.ticketPanels && state.ticketPanels.singles) || []).find(function (p) {
            return String(p.id) === String(editId);
          });
          openSinglePanelEditor(panel || null);
          return;
        }
        if (pubId) {
          var pout = await ticketPanelsApi("/panels/" + encodeURIComponent(pubId) + "/publish", "POST", {
            forceNew: true,
          });
          if (!pout.res.ok || !pout.data || pout.data.ok === false) {
            showSaveToast((pout.data && pout.data.message) || "Invio fallito.", true);
            return;
          }
          showSaveToast("Pannello inviato.");
          refreshTicketPanels({ silent: true });
          return;
        }
        if (delId) {
          var delOk = await (window.VcDialog
            ? window.VcDialog.confirm({
                title: i18n("dash.tickets.panelDeleteTitle", "Eliminare il pannello?"),
                message: i18n(
                  "dash.tickets.panelConfirmDelete",
                  "Eliminare questo pannello? L'operazione non si può annullare.",
                ),
                confirmLabel: i18n("dash.tickets.panelDeleteOk", "Elimina pannello"),
                cancelLabel: i18n("dash.bl.cancel", "Annulla"),
                danger: true,
                icon: "fa-trash-o",
              })
            : Promise.resolve(window.confirm("Eliminare questo pannello?")));
          if (!delOk) return;
          var dout = await ticketPanelsApi("/panels/" + encodeURIComponent(delId), "DELETE");
          if (!dout.res.ok || !dout.data || dout.data.ok === false) {
            showSaveToast((dout.data && dout.data.message) || "Eliminazione fallita.", true);
            return;
          }
          showSaveToast("Pannello eliminato.");
          refreshTicketPanels({ silent: true });
        }
      });
    }
    var multiBody = byId("tk-multipanels-body");
    if (multiBody && !multiBody.__vcMultiWired) {
      multiBody.__vcMultiWired = true;
      multiBody.addEventListener("click", async function (ev) {
        var t = ev.target && ev.target.closest ? ev.target.closest("[data-tk-multi-edit],[data-tk-multi-publish],[data-tk-multi-delete]") : null;
        if (!t) return;
        var editId = t.getAttribute("data-tk-multi-edit");
        var pubId = t.getAttribute("data-tk-multi-publish");
        var delId = t.getAttribute("data-tk-multi-delete");
        if (editId) {
          var multi = ((state.ticketPanels && state.ticketPanels.multis) || []).find(function (m) {
            return String(m.id) === String(editId);
          });
          openMultiPanelEditor(multi || null);
          return;
        }
        if (pubId) {
          var pout = await ticketPanelsApi("/multipanels/" + encodeURIComponent(pubId) + "/publish", "POST", {
            forceNew: true,
          });
          if (!pout.res.ok || !pout.data || pout.data.ok === false) {
            showSaveToast((pout.data && pout.data.message) || "Invio fallito.", true);
            return;
          }
          showSaveToast("Multi-panel inviato.");
          refreshTicketPanels({ silent: true });
          return;
        }
        if (delId) {
          var delOk = await (window.VcDialog
            ? window.VcDialog.confirm({
                title: i18n("dash.tickets.multiDeleteTitle", "Eliminare il multi-panel?"),
                message: i18n(
                  "dash.tickets.multiConfirmDelete",
                  "Eliminare questo multi-panel? L'operazione non si può annullare.",
                ),
                confirmLabel: i18n("dash.tickets.multiDeleteOk", "Elimina multi-panel"),
                cancelLabel: i18n("dash.bl.cancel", "Annulla"),
                danger: true,
                icon: "fa-trash-o",
              })
            : Promise.resolve(window.confirm("Eliminare questo multi-panel?")));
          if (!delOk) return;
          var dout = await ticketPanelsApi("/multipanels/" + encodeURIComponent(delId), "DELETE");
          if (!dout.res.ok || !dout.data || dout.data.ok === false) {
            showSaveToast((dout.data && dout.data.message) || "Eliminazione fallita.", true);
            return;
          }
          showSaveToast("Multi-panel eliminato.");
          refreshTicketPanels({ silent: true });
        }
      });
    }
  }

  async function loadPartnership(seq) {
    var token = getToken();
    if (!token || !state.guildId) return false;
    try {
      // Niente ?fresh=1 qui: sul main (centinaia di canali/ruoli/emoji) blocca il loader a tempo indefinito.
      // Il refresh forzato resta in refreshPartnershipPickers quando serve.
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership",
        token,
        { attempts: 3 },
      );
      if (seq !== state.loadSeq) return false;
      var res = out.res;
      var data = out.data;
      if (res.status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
        showLocked();
        return false;
      }
      if (!res.ok || !data || data.ok === false) {
        if (data && (data.error === "main_guild" || data.error === "bot_missing")) return false;
        setError((data && data.message) || i18n("dash.errLoadPartnership", "Impossibile caricare la configurazione partnership."));
        return false;
      }
      state.partnership = data.partnership;
      state.pickers = data.pickers;
      setPremiumFromApi(data);
      fillPartnershipForm(data.partnership, data.pickers);
      applyPremiumUi();
      // Prefetch stato migrazione così aprendo la tab non flashano i pannelli setup.
      refreshMigrationStatus();
      setError("");
      return true;
    } catch (e) {
      if (seq !== state.loadSeq) return false;
      setError(i18n("dash.errNetworkPartnership", "Errore di rete durante il caricamento partnership."));
      return false;
    }
  }

  async function savePartnership(completeSetup, opts) {
    opts = opts || {};
    var silent = opts.silent === true;
    if (state.saving) return;
    var token = getToken();
    if (!token || !state.guildId) return;
    if (!completeSetup && !isFormDirty()) {
      return;
    }
    state.saving = true;
    var seq = ++state.saveSeq;
    var completeBtn = byId("ps-complete-btn");
    if (completeBtn) completeBtn.disabled = true;
    if (silent) {
      showSaveToast(i18n("dash.savingShort", "Salvataggio…"), false, { pending: true });
    } else {
      setError("");
      setSuccess("");
    }

    var body = buildPatchFromForm();
    if (completeSetup) body.completeSetup = true;

    try {
      var res = await fetch(resolveApiBase() + "/guilds/" + encodeURIComponent(state.guildId) + "/partnership", {
        method: "PATCH",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (seq !== state.saveSeq) return;
      if (!res.ok || !data || data.ok === false) {
        if (res.status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
          showLocked();
          return;
        }
        if (data && data.error === "premium_required") {
          setPremiumFromApi({ premium: { active: false } });
          showSaveToast(
            data.message ||
              i18n(
                "dash.premium.requiredEmbed",
                "Il messaggio personalizzato richiede Vinili Premium.",
              ),
            true,
          );
          return;
        }
        var errMsg = (data && data.message) || i18n("dash.errSave", "Salvataggio non riuscito.");
        if (silent) showSaveToast(errMsg, true);
        else setError(errMsg);
        return;
      }
      state.partnership = data.partnership;
      state.pickers = data.pickers || state.pickers;
      setPremiumFromApi(data);
      // Autosave silenzioso: non rifare fill+sync (riaccendeva i toggle spenti via valori residui
      // e faceva “lampeggiare” lo stato mentre l’utente cliccava ancora).
      if (silent) {
        captureBaseline();
        var completeBtnSilent = byId("ps-complete-btn");
        var setupBarSilent = byId("vc-dashboard-setup-bar");
        if (completeBtnSilent) completeBtnSilent.setAttribute("hidden", "");
        if (setupBarSilent) setupBarSilent.setAttribute("hidden", "");
        if (data.partnership && data.partnership.setupCompleted === true) {
          setPartnershipSetupLocked(false);
        }
      } else {
        fillPartnershipForm(data.partnership, state.pickers);
      }
      if (completeSetup) {
        setSuccess(data.message || i18n("dash.setupDone", "Setup completato."));
        setPartnershipSetupLocked(false);
        applyView("partnership/generale", { collapseSidebar: true });
      } else {
        showSaveToast(i18n("dash.savedShort", "Salvato"), false);
      }
      if (state.overview && state.overview.setup && isManagedPartnershipSetup(state.overview.setup)) {
        state.overview.setup.complete = Boolean(data.partnership && data.partnership.setupCompleted);
        renderOverview(state.overview);
      }
    } catch (e) {
      if (seq !== state.saveSeq) return;
      if (silent) showSaveToast(i18n("dash.errNetworkSave", "Errore di rete durante il salvataggio."), true);
      else setError(i18n("dash.errNetworkSave", "Errore di rete durante il salvataggio."));
    } finally {
      if (seq === state.saveSeq) {
        state.saving = false;
        if (completeBtn) completeBtn.disabled = false;
        if (state.autosavePending) {
          state.autosavePending = false;
          scheduleAutosave(0);
        }
      }
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function fetchDashboardJson(url, token, options) {
    var attempts = (options && options.attempts) || 3;
    var method = (options && options.method) || "GET";
    var body = options && options.body;
    var lastRes = null;
    var lastData = {};
    for (var i = 0; i < attempts; i += 1) {
      try {
        var headers = { Authorization: "Bearer " + token };
        if (body != null) headers["Content-Type"] = "application/json";
        lastRes = await fetch(url, {
          method: method,
          headers: headers,
          body: body != null ? body : undefined,
          cache: "no-store",
        });
        lastData = await lastRes.json().catch(function () {
          return {};
        });
        if (lastRes.status === 502 || lastRes.status === 503 || lastRes.status === 504) {
          if (i < attempts - 1) {
            await sleep(400 * (i + 1));
            continue;
          }
        }
        return { res: lastRes, data: lastData };
      } catch (e) {
        if (i < attempts - 1) {
          await sleep(400 * (i + 1));
          continue;
        }
        throw e;
      }
    }
    return { res: lastRes || { ok: false, status: 0 }, data: lastData };
  }

  function stopBotPresenceWait() {
    if (state.botWaitTimer) {
      clearInterval(state.botWaitTimer);
      state.botWaitTimer = null;
    }
    state.botWaitUntil = 0;
    state.botWaitBusy = false;
  }

  function startBotPresenceWait(opts) {
    opts = opts || {};
    var extendMs = Number(opts.extendMs) || 90_000;
    var now = Date.now();
    state.botWaitUntil = Math.max(Number(state.botWaitUntil) || 0, now + extendMs);
    if (state.botWaitTimer) return;
    state.botWaitTimer = setInterval(function () {
      if (Date.now() > Number(state.botWaitUntil || 0)) {
        stopBotPresenceWait();
        return;
      }
      if (state.botWaitBusy) return;
      if (state.overview && state.overview.guild && state.overview.guild.botPresent) {
        stopBotPresenceWait();
        return;
      }
      state.botWaitBusy = true;
      loadOverview({ silent: true })
        .catch(function () {})
        .finally(function () {
          state.botWaitBusy = false;
        });
    }, 4000);
  }

  async function loadOverview(opts) {
    opts = opts || {};
    var silent = opts.silent === true;
    var guildId = resolveGuildId();
    state.guildId = guildId;
    try {
      if (/^\d{17,22}$/.test(String(guildId || ""))) {
        sessionStorage.setItem("vc_dash_last_guild_id", String(guildId));
      }
    } catch (eLast) {}
    if (!guildId) {
      if (!silent) setError(i18n("dash.errNoGuild", "Server non specificato. Torna alla lista e seleziona un server."));
      return;
    }

    var token = getToken();
    if (!token) {
      obscureDashboard();
      return;
    }
    if (!silent && typeof window.__vcDashboardVerifyHighStaffAccess === "function") {
      var ok = await window.__vcDashboardVerifyHighStaffAccess();
      if (ok === false) return;
    }
    hideGate();
    // I poll silenziosi non devono abortire un load completo (altrimenti fill/applyView
    // restano a metà → sidebar partnership + solo footer).
    if (silent && state.loadBusy) return;
    var seq = ++state.loadSeq;
    if (!silent) {
      state.loadBusy = true;
      state.__loadStartedAt = Date.now();
      setLoading(true);
      setError("");
      setSuccess("");
    }
    // Barra server: solo al load “vero”, non ad ogni poll silenzioso (evita storm → 502).
    if (!silent) void loadServerSwitcher();

    try {
      var out = await fetchDashboardJson(
        resolveApiBase() + "/guilds/" + encodeURIComponent(guildId),
        token,
        { attempts: silent ? 1 : 3 },
      );
      if (seq !== state.loadSeq) return;
      var res = out.res;
      var data = out.data;
      if (res.status === 403 && data && (data.error === "high_staff_only" || data.error === "forbidden")) {
        showLocked();
        return;
      }
      if (res.status === 403 && data && data.error === "missing_guilds_scope") {
        if (!silent) {
          setError(i18n("dash.errMissingGuildsScope", "Permesso guilds mancante: effettua di nuovo il login dalla dashboard."));
        }
        return;
      }
      if (!res.ok || !data || data.ok === false) {
        if (!silent) {
          setError((data && data.message) || i18n("dash.errLoadGuild", "Impossibile caricare la dashboard del server."));
        }
        return;
      }
      state.overview = data;
      // Se lo switcher non è ancora uscito (race/API lenta), riprova dopo overview.
      if (!silent) {
        var sw = byId("vc-dash-server-switcher");
        if (sw && sw.hasAttribute("hidden")) void loadServerSwitcher({ force: true });
        else if (Array.isArray(state.switcherGuilds) && state.switcherGuilds.length) {
          renderServerSwitcher(state.switcherGuilds);
        }
      }
      // Sblocca subito overview: partnership/settings non devono tenere il loader infinito
      // (soprattutto sul server principale con picker Discord enormi).
      if (!silent) {
        setError("");
        renderOverview(data);
        setLoading(false);
        revealGuildMain();
        // Lascia dipingere overview prima dei moduli pesanti (pickers enormi sul main).
        await new Promise(function (resolve) {
          if (typeof requestAnimationFrame === "function") {
            requestAnimationFrame(function () {
              requestAnimationFrame(resolve);
            });
          } else {
            setTimeout(resolve, 0);
          }
        });
      }
      var shouldLoadPartnership = Boolean(
        data.guild && data.guild.botPresent && data.setup,
      );
      var shouldLoadSettings = Boolean(data.guild && data.guild.botPresent);
      var MODULE_LOAD_MS = 25000;
      function withTimeout(promise, ms) {
        return Promise.race([
          promise,
          new Promise(function (resolve) {
            setTimeout(function () {
              resolve("__timeout__");
            }, ms);
          }),
        ]);
      }
      if (shouldLoadPartnership && (!silent || !state.partnership)) {
        var loadedPs = await withTimeout(loadPartnership(seq), MODULE_LOAD_MS);
        if (seq !== state.loadSeq) return;
        if (loadedPs === "__timeout__") {
          if (!silent) {
            setError(
              i18n(
                "dash.errLoadPartnershipSlow",
                "Partnership lenta da caricare. La panoramica è comunque disponibile: riprova tra poco.",
              ),
            );
          }
        } else if (!silent && !loadedPs) {
          setError(
            (byId("vc-dashboard-guild-error") && byId("vc-dashboard-guild-error").textContent) ||
              i18n("dash.errLoadPartnershipForm", "Impossibile caricare il form partnership. Ricarica la pagina."),
          );
        }
      }
      if (shouldLoadSettings && (!silent || !state.settings)) {
        var loadedGs = await withTimeout(loadSettings(seq), MODULE_LOAD_MS);
        if (seq !== state.loadSeq) return;
        if (loadedGs === "__timeout__") {
          if (!silent) {
            setError(
              i18n(
                "dash.cfg.errLoadSlow",
                "Impostazioni lente da caricare. La panoramica è comunque disponibile: riprova tra poco.",
              ),
            );
          }
        } else if (!silent && !loadedGs) {
          setError(
            (byId("vc-dashboard-guild-error") && byId("vc-dashboard-guild-error").textContent) ||
              i18n("dash.cfg.errLoad", "Impossibile caricare le impostazioni."),
          );
        }
      }
      if (data.guild && data.guild.botPresent && (!silent || !state.tickets)) {
        await withTimeout(loadTickets({ silent: true }), MODULE_LOAD_MS);
        if (seq !== state.loadSeq) return;
      }
      if (seq !== state.loadSeq) return;
      if (!silent) {
        // Aggiorna nav/form dopo i moduli (es. ripristina #partnership/... dall’hash).
        renderOverview(state.overview);
        revealGuildMain();
        ensureVisibleDashboardContent();
      }
    } catch (e) {
      if (seq !== state.loadSeq) return;
      if (!silent) setError(i18n("dash.errNetworkGuild", "Errore di rete durante il caricamento della dashboard."));
    } finally {
      if (!silent && seq === state.loadSeq) {
        state.loadBusy = false;
        setLoading(false);
        revealGuildMain();
        ensureVisibleDashboardContent();
      }
    }
  }

  function setSidebarVisible(visible) {
    var sidebar = byId("vc-dashboard-sidebar");
    if (!sidebar) return;
    if (visible) {
      sidebar.removeAttribute("hidden");
      syncSidebarHeaderOffset();
    } else {
      sidebar.setAttribute("hidden", "");
    }
  }

  function syncSidebarHeaderOffset() {
    var header = document.querySelector("body.vc-dashboard-page > header.fixed, body.vc-dashboard-page header.fixed");
    if (!header) return;
    var shell = header.querySelector(".vc-nav-shell") || header;
    var bottom = Math.ceil(shell.getBoundingClientRect().bottom);
    if (!Number.isFinite(bottom) || bottom < 40) return;
    document.body.style.setProperty("--vc-dash-header-h", bottom + "px");
  }

  function wireSettingsForm() {
    var form = byId("vc-dashboard-settings-form");
    if (!form || form.__vcSettingsWired) return;
    form.__vcSettingsWired = true;
    wireGsDashRoles();
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
    });
    form.addEventListener("input", function (ev) {
      var t = ev && ev.target;
      if (isTypingField(t)) {
        var delay = t && t.id === "gs-botNickname" ? NICK_AUTOSAVE_MS : TYPING_AUTOSAVE_MS;
        scheduleSettingsAutosave(delay);
        return;
      }
      scheduleSettingsAutosave(0);
    });
    form.addEventListener("change", function (ev) {
      var t = ev && ev.target;
      if (t && t.id === "gs-updatesChannelId") {
        scheduleSettingsAutosave(0);
      }
    });
    form.addEventListener("focusout", function (ev) {
      var t = ev && ev.target;
      if (!isTypingField(t)) return;
      // Uscita dal campo: salva subito se c’è un debounce in corso.
      if (state.settingsAutosaveTimer) scheduleSettingsAutosave(0);
    });

    var fileInput = byId("gs-botAvatarFile");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          showSaveToast(i18n("dash.cfg.errAvatarSize", "Immagine troppo grande (max 8 MB)."), true);
          fileInput.value = "";
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = String(reader.result || "");
          if (!/^data:image\//i.test(dataUrl)) {
            showSaveToast(i18n("dash.cfg.errAvatarType", "Formato immagine non supportato."), true);
            return;
          }
          state.pendingBotAvatar = dataUrl;
          var preview = byId("gs-botAvatarPreview");
          if (preview) preview.src = dataUrl;
          var resetBtn = byId("gs-botAvatarReset");
          if (resetBtn) resetBtn.removeAttribute("hidden");
          scheduleSettingsAutosave(0);
        };
        reader.onerror = function () {
          showSaveToast(i18n("dash.cfg.errAvatarRead", "Impossibile leggere l’immagine."), true);
        };
        reader.readAsDataURL(file);
        fileInput.value = "";
      });
    }

    var resetAvatar = byId("gs-botAvatarReset");
    if (resetAvatar) {
      resetAvatar.addEventListener("click", function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (ev && ev.preventDefault) ev.preventDefault();
        state.pendingBotAvatar = null;
        scheduleSettingsAutosave(0);
      });
    }

    var bannerInput = byId("gs-botBannerFile");
    if (bannerInput) {
      bannerInput.addEventListener("change", function () {
        var file = bannerInput.files && bannerInput.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) {
          showSaveToast(i18n("dash.cfg.errAvatarSize", "Immagine troppo grande (max 8 MB)."), true);
          bannerInput.value = "";
          return;
        }
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = String(reader.result || "");
          if (!/^data:image\//i.test(dataUrl)) {
            showSaveToast(i18n("dash.cfg.errAvatarType", "Formato immagine non supportato."), true);
            return;
          }
          state.pendingBotBanner = dataUrl;
          setBotBannerPreview(dataUrl);
          var resetBtn = byId("gs-botBannerReset");
          if (resetBtn) resetBtn.removeAttribute("hidden");
          scheduleSettingsAutosave(0);
        };
        reader.onerror = function () {
          showSaveToast(i18n("dash.cfg.errAvatarRead", "Impossibile leggere l’immagine."), true);
        };
        reader.readAsDataURL(file);
        bannerInput.value = "";
      });
    }

    var resetBanner = byId("gs-botBannerReset");
    if (resetBanner) {
      resetBanner.addEventListener("click", function (ev) {
        if (ev && ev.stopPropagation) ev.stopPropagation();
        if (ev && ev.preventDefault) ev.preventDefault();
        state.pendingBotBanner = null;
        scheduleSettingsAutosave(0);
      });
    }
  }

  function wireForm() {
    wireFeatCards();
    wirePsZoneTokenField();
    wireEmbedPlaceholders();
    wireDashFancySelects();
    wireLeaderboardUi();
    var form = byId("vc-dashboard-partnership-form");
    if (form) {
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
      });
      form.addEventListener("input", function (ev) {
        var t = ev && ev.target;
        if (t && t.closest && t.closest("#ps-migration-setup, #ps-migration-actions, #ps-migration-progress, #ps-blacklist-root, #ps-setup-wizard")) return;
        if (!shouldAutosaveFeatField(t)) return;
        if (isTypingField(t)) {
          scheduleAutosave(TYPING_AUTOSAVE_MS);
          return;
        }
        scheduleAutosave(0);
      });
      form.addEventListener("change", function (ev) {
        var t = ev && ev.target;
        if (t && t.closest && t.closest("#ps-migration-setup, #ps-migration-actions, #ps-migration-progress, #ps-blacklist-root, #ps-setup-wizard")) return;
        // Feat switch / chip già gestiti in wireFeatCards.
        if (t && t.matches && (t.matches("[data-feat-switch]") || t.matches(".vc-dash-chip input"))) return;
        if (!shouldAutosaveFeatField(t)) return;
        scheduleAutosave(0);
      });
      form.addEventListener("focusout", function (ev) {
        var t = ev && ev.target;
        if (!isTypingField(t)) return;
        if (t.closest && t.closest("#ps-migration-setup, #ps-migration-actions, #ps-migration-progress, #ps-blacklist-root, #ps-setup-wizard")) return;
        if (!shouldAutosaveFeatField(t)) return;
        if (state.autosaveTimer) scheduleAutosave(0);
      });
    }
    var completeBtn = byId("ps-complete-btn");
    if (completeBtn) {
      completeBtn.addEventListener("click", function () {
        clearAutosaveTimer();
        savePartnership(true);
      });
    }
    var wzBack = byId("ps-wz-back");
    if (wzBack && !wzBack.__vcWzWired) {
      wzBack.__vcWzWired = true;
      wzBack.addEventListener("click", function () {
        setWizardStep((state.wizardStep || 1) - 1);
      });
    }
    wireWizardFieldGuards();
    var wzNext = byId("ps-wz-next");
    if (wzNext && !wzNext.__vcWzWired) {
      wzNext.__vcWzWired = true;
      wzNext.addEventListener("click", function () {
        if (wzNext.disabled) return;
        var step = state.wizardStep || 1;
        if (!validateWizardStep(step)) return;
        syncMainFormFromWizard();
        setWizardStep(step + 1);
      });
    }
    var wzFinish = byId("ps-wz-finish");
    if (wzFinish && !wzFinish.__vcWzWired) {
      wzFinish.__vcWzWired = true;
      wzFinish.addEventListener("click", function () {
        if (wzFinish.disabled) return;
        if (!validateWizardStep(1) || !validateWizardStep(2) || !validateWizardStep(3)) {
          if (!String((byId("ps-wz-partnershipsChannelId") || {}).value || "").trim()) setWizardStep(1);
          else if (!String((byId("ps-wz-partnerManagerRoleId") || {}).value || "").trim()) setWizardStep(2);
          else setWizardStep(3);
          return;
        }
        syncMainFormFromWizard();
        clearAutosaveTimer();
        savePartnership(true);
      });
    }
    syncWizardNavEnabled();
    var leaveBtn = byId("ps-leave-btn");
    if (leaveBtn && !leaveBtn.__vcLeaveWired) {
      leaveBtn.__vcLeaveWired = true;
      leaveBtn.addEventListener("click", function () {
        openLeavePartnershipModal();
      });
    }
    wireSettingsForm();
    wireBachecaForm();
    wireBachecaFeaturesForm();
    wireBachecaStyleForm();
    var descMode = byId("ps-partnerDescMode");
    if (descMode) descMode.addEventListener("change", updateDescModeVisibility);

    var migConfigured = byId("ps-mig-mode-configured");
    var migCustom = byId("ps-mig-mode-custom");
    if (migConfigured) {
      migConfigured.addEventListener("click", function () {
        setMigrationMode("configured");
      });
    }
    if (migCustom) {
      migCustom.addEventListener("click", function () {
        setMigrationMode("custom");
      });
    }
    setMigrationMode("configured");
    var migStart = byId("ps-migration-start-btn");
    if (migStart) {
      migStart.addEventListener("click", function () {
        startMigration();
      });
    }
    var migRetry = byId("ps-migration-retry-btn");
    if (migRetry) {
      migRetry.addEventListener("click", function () {
        state.migrationShowSetup = true;
        if (state.lastMigrationPayload) {
          renderMigrationJob(state.lastMigrationPayload);
        } else {
          var setup = byId("ps-migration-setup");
          var actions = byId("ps-migration-actions");
          var retryWrap = byId("ps-migration-retry-wrap");
          var progress = byId("ps-migration-progress");
          if (setup) setup.removeAttribute("hidden");
          if (actions) actions.removeAttribute("hidden");
          if (retryWrap) retryWrap.setAttribute("hidden", "");
          if (progress) progress.setAttribute("hidden", "");
        }
      });
    }
    var migUndo = byId("ps-migration-undo-btn");
    if (migUndo) {
      migUndo.addEventListener("click", function () {
        undoMigration();
      });
    }

    wireBlacklistUi();
    wireManagersUi();
    wireHistoryUi();
    wireCommandsUi();

    var toggle = byId("vc-dashboard-sidebar-partnership-toggle");
    if (toggle && !toggle.__vcPartnershipToggleWired) {
      toggle.__vcPartnershipToggleWired = true;
      function onPartnershipToggle(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        if (!isPartnershipSetupComplete()) {
          applyView("partnership/setup", { collapseSidebar: true });
          return;
        }
        var group = byId("vc-dashboard-sidebar-partnership");
        var isOpen = Boolean(group && group.classList.contains("is-open"));
        // Durante ignore anti-ghost: ignora solo i tap che riaprirebbero subito dopo una chiusura.
        if (!isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
        // Se già aperto e siamo ancora nella finestra anti-ghost dell’apertura,
        // non trattare il click successivo come chiusura (bordo / ghost click).
        if (isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
        setPartnershipNavOpen(!isOpen);
        if (isOpen) {
          // Chiusura intenzionale: blocca un eventuale click sintetico successivo.
          state.partnershipSheetIgnoreUntil = Date.now() + 400;
        }
      }
      // pointerdown = risposta immediata su telefono (il click arriva dopo e lagga).
      toggle.addEventListener("pointerdown", onPartnershipToggle, true);
      toggle.addEventListener(
        "click",
        function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        },
        true,
      );
    }

    var bachecaToggle = byId("vc-dashboard-sidebar-bacheca-toggle");
    if (bachecaToggle && !bachecaToggle.__vcBachecaToggleWired) {
      bachecaToggle.__vcBachecaToggleWired = true;
      function onBachecaToggle(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        if (
          bachecaToggle.getAttribute("aria-disabled") === "true" ||
          bachecaToggle.classList.contains("is-module-off")
        ) {
          return;
        }
        var group = byId("vc-dashboard-sidebar-bacheca");
        var isOpen = Boolean(group && group.classList.contains("is-open"));
        if (!isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
        if (isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
        setBachecaNavOpen(!isOpen);
        if (isOpen) state.partnershipSheetIgnoreUntil = Date.now() + 400;
      }
      bachecaToggle.addEventListener("pointerdown", onBachecaToggle, true);
      bachecaToggle.addEventListener(
        "click",
        function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        },
        true,
      );
    }

    var ticketsToggle = byId("vc-dashboard-sidebar-tickets-toggle");
    if (ticketsToggle && !ticketsToggle.__vcTicketsToggleWired) {
      ticketsToggle.__vcTicketsToggleWired = true;
      function onTicketsToggle(ev) {
        ev.preventDefault();
        ev.stopPropagation();
        if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        var group = byId("vc-dashboard-sidebar-tickets");
        var isOpen = Boolean(group && group.classList.contains("is-open"));
        if (!isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
        if (isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
        setTicketsNavOpen(!isOpen);
        if (isOpen) state.partnershipSheetIgnoreUntil = Date.now() + 400;
      }
      ticketsToggle.addEventListener("pointerdown", onTicketsToggle, true);
      ticketsToggle.addEventListener(
        "click",
        function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
        },
        true,
      );
    }

    var sidebar = byId("vc-dashboard-sidebar");
    if (sidebar && !sidebar.__vcNavWired) {
      sidebar.__vcNavWired = true;
      function handleNavLinkClick(ev, link) {
        if (link.getAttribute("aria-disabled") === "true" || link.classList.contains("is-module-off")) {
          ev.preventDefault();
          return;
        }
        var next = normalizeView(link.getAttribute("data-view"));
        if (state.successView && state.successView !== next) setSuccess("");
        if (state.errorView && state.errorView !== next) setError("");
        collapseSidebarAfterNav();
        applyView(next, { collapseSidebar: true });
        ev.preventDefault();
      }
      sidebar.addEventListener("click", function (ev) {
        var link = ev.target && ev.target.closest ? ev.target.closest("a[data-view]") : null;
        if (!link || !sidebar.contains(link)) return;
        handleNavLinkClick(ev, link);
      });
      sidebar.addEventListener("mouseleave", function () {
        clearSidebarForceCollapse();
      });
    }

    if (!document.documentElement.__vcPartnershipSheetWired) {
      document.documentElement.__vcPartnershipSheetWired = true;
      document.addEventListener(
        "click",
        function (ev) {
          if (Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;

          var sheetIds = [
            "vc-dashboard-sidebar-partnership-sub",
            "vc-dashboard-sidebar-bacheca-sub",
            "vc-dashboard-sidebar-tickets-sub",
          ];
          var link = null;
          for (var si = 0; si < sheetIds.length; si++) {
            var sid = sheetIds[si];
            link =
              ev.target && ev.target.closest
                ? ev.target.closest("#" + sid + " a[data-view]")
                : null;
            if (link) break;
          }
          if (link) {
            var next = normalizeView(link.getAttribute("data-view"));
            if (state.successView && state.successView !== next) setSuccess("");
            if (state.errorView && state.errorView !== next) setError("");
            collapseSidebarAfterNav();
            applyView(next, { collapseSidebar: true });
            ev.preventDefault();
            return;
          }

          if (!isMobileDashboardNav()) {
            var openGroup =
              (byId("vc-dashboard-sidebar-partnership") &&
                byId("vc-dashboard-sidebar-partnership").classList.contains("is-open") &&
                byId("vc-dashboard-sidebar-partnership")) ||
              (byId("vc-dashboard-sidebar-bacheca") &&
                byId("vc-dashboard-sidebar-bacheca").classList.contains("is-open") &&
                byId("vc-dashboard-sidebar-bacheca")) ||
              (byId("vc-dashboard-sidebar-tickets") &&
                byId("vc-dashboard-sidebar-tickets").classList.contains("is-open") &&
                byId("vc-dashboard-sidebar-tickets")) ||
              null;
            if (!openGroup) return;
            var openToggle = openGroup.querySelector(".vc-dashboard-sidebar__toggle");
            var openSub = openGroup.querySelector(".vc-dashboard-sidebar__sub");
            if (openToggle && (ev.target === openToggle || openToggle.contains(ev.target))) return;
            if (openGroup.contains(ev.target)) return;
            if (openSub && openSub.contains(ev.target)) return;
            closeAllMobileNavSheets();
          }
        },
        true,
      );
    }

    var modulesGrid = byId("vc-dashboard-modules-grid");
    if (modulesGrid && !modulesGrid.__vcModulesWired) {
      modulesGrid.__vcModulesWired = true;
      modulesGrid.addEventListener("change", function (ev) {
        var sw = ev.target && ev.target.closest ? ev.target.closest("[data-module-switch]") : null;
        if (!sw || !modulesGrid.contains(sw)) return;
        var mod = String(sw.getAttribute("data-module-switch") || "");
        if (mod === "bacheca") {
          setBachecaEnabled(Boolean(sw.checked));
        } else if (mod === "tickets") {
          saveTickets({ enabled: Boolean(sw.checked) });
        }
      });
      modulesGrid.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-module-settings]") : null;
        if (!btn || btn.disabled) return;
        var mod = String(btn.getAttribute("data-module-settings") || "");
        if (mod === "partnership") {
          applyView(partnershipDefaultView(), { collapseSidebar: true });
        } else if (mod === "bacheca") {
          applyView("bacheca/funzioni", { collapseSidebar: true });
        } else if (mod === "tickets") {
          applyView("tickets/impostazioni", { collapseSidebar: true });
        } else if (mod === "classifiche") {
          applyView("classifiche", { collapseSidebar: true });
        }
      });
    }

    wireTicketsUi();

    window.addEventListener("hashchange", function () {
      applyView(currentView(), { skipHash: true, collapseSidebar: true });
    });
    window.addEventListener("popstate", function () {
      if (normalizeView(window.location.hash || "") !== "tickets/pannelli") return;
      restoreTicketPanelsEditorFromRoute({ applyDraft: true });
    });
    window.addEventListener("resize", function () {
      syncSidebarHeaderOffset();
      try {
        ensureWizardNavInPlace();
      } catch (_) {}
    });
    window.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (state.overview && state.overview.guild && state.overview.guild.botPresent === false) {
        startBotPresenceWait({ extendMs: 60_000 });
        if (!state.botWaitBusy) {
          state.botWaitBusy = true;
          loadOverview({ silent: true })
            .catch(function () {})
            .finally(function () {
              state.botWaitBusy = false;
            });
        }
      }
      if (String(state.view || "").indexOf("partnership/") === 0 && state.partnership) {
        refreshPartnershipPickers({ force: true }).catch(function () {});
      }
    });
    window.addEventListener("focus", function () {
      if (state.overview && state.overview.guild && state.overview.guild.botPresent === false) {
        startBotPresenceWait({ extendMs: 60_000 });
      }
    });
    var inviteBtnWire = byId("vc-dashboard-invite-btn");
    if (inviteBtnWire && !inviteBtnWire.__vcInviteWaitWired) {
      inviteBtnWire.__vcInviteWaitWired = true;
      inviteBtnWire.addEventListener("click", function () {
        startBotPresenceWait({ extendMs: 180_000 });
      });
    }
    if (typeof ResizeObserver !== "undefined") {
      var header = document.querySelector("body.vc-dashboard-page > header.fixed, body.vc-dashboard-page header.fixed");
      if (header) {
        var ro = new ResizeObserver(function () {
          syncSidebarHeaderOffset();
        });
        ro.observe(header);
        var shell = header.querySelector(".vc-nav-shell");
        if (shell) ro.observe(shell);
      }
    }
    // Watchdog: ripristina main/sidebar/form se restano bloccati (UI “solo footer”).
    if (!window.__vcDashMainWatchdog) {
      window.__vcDashMainWatchdog = setInterval(function () {
        try {
          ensureVisibleDashboardContent();
          var loading = byId("vc-dashboard-guild-loading");
          if (loading && !loading.hasAttribute("hidden") && state.overview) {
            // Loader non deve restare appiccicato sopra una overview già pronta.
            var loadingAgeOk = Date.now() - Number(state.__loadStartedAt || 0) > 12000;
            if (loadingAgeOk && !state.loadBusy) {
              loading.setAttribute("hidden", "");
              document.body.classList.remove("vc-dashboard-guild-loading-active");
              ensureVisibleDashboardContent();
            }
          }
        } catch (_) {}
      }, 600);
    }
  }

  function wireGateLogin() {
    var gateBtn = byId("vc-dashboard-gate-login");
    if (!gateBtn) return;
    gateBtn.addEventListener("click", function () {
      if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
        window.__vcDiscordStartOAuthRedirect(gateBtn);
      }
    });
  }

  var bootedOnce = false;
  function boot() {
    wireGateLogin();
    wireForm();
    syncSidebarHeaderOffset();
    // Conserva l’avatar bot di default per quando il nome server non è ancora noto.
    try {
      var iconEl = byId("vc-dashboard-header-guild-icon");
      if (iconEl && !iconEl.getAttribute("data-vc-bot-avatar")) {
        var src = resolveBotAvatarFallback(iconEl.getAttribute("src") || "");
        if (src) iconEl.setAttribute("data-vc-bot-avatar", src);
      } else if (iconEl) {
        var fixed = resolveBotAvatarFallback(iconEl.getAttribute("data-vc-bot-avatar") || "");
        if (fixed) iconEl.setAttribute("data-vc-bot-avatar", fixed);
      }
    } catch (eBrand) {}
    if (getToken()) {
      // Mostra subito lo switcher da cache sessione, se disponibile.
      void loadServerSwitcher();
      loadOverview();
      return;
    }
    obscureDashboard();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
      // Evita doppio fetch se boot() ha già avviato il load con lo stesso token.
      if (!bootedOnce || !state.overview) loadOverview();
      else void loadServerSwitcher({ force: true });
      return;
    }
    obscureDashboard();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!getToken()) return;
    var sw = byId("vc-dash-server-switcher");
    if (sw && sw.hasAttribute("hidden")) void loadServerSwitcher({ force: true });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bootedOnce = true;
      boot();
    });
  } else {
    bootedOnce = true;
    boot();
  }
})();
