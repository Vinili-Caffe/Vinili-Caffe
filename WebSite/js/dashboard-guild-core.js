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

        if (!Array.isArray(state.switcherGuilds) || state.switcherGuilds.length < 2) {
      var cached = readSwitcherCache();
      if (cached && cached.length >= 2) state.switcherGuilds = cached;
    }
    if (Array.isArray(state.switcherGuilds) && state.switcherGuilds.length >= 2) {
      renderServerSwitcher(state.switcherGuilds);
    }

    if (state.switcherLoadPromise && opts.force) {
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
                return true;
      }
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
                    scheduleAutosave(0);
          return;
        }
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
        return Boolean(setup);
  }

  var VALID_VIEWS = {
    overview: true,
    settings: true,
    "settings/comandi": true,
    "bacheca/funzioni": true,
    "bacheca/personalizza": true,
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
            state.partnershipSheetIgnoreUntil = Date.now() + 400;
    }
    el.addEventListener("pointerdown", closeFromBackdrop);
    el.addEventListener("click", closeFromBackdrop);
    document.body.appendChild(el);
    return el;
  }

  function restoreNavSheetSubParent(sub) {
    if (!sub || !sub.__vcOriginalParent) return;
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

            if (view !== "tickets/transcripts") {
      try {
        closeTranscriptViewer();
      } catch (_) {}
    }

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
        syncFeatCardsFromValues();
    if (opts.collapseSidebar) collapseSidebarAfterNav();

    if (view === "partnership/setup") {
      setWizardStep(state.wizardStep || 1);
    }

    if (String(view).indexOf("partnership/") === 0 && partnershipReady) {
      var wasPolling = Boolean(state.pickersPollTimer);
      startPartnershipPickersPoll();
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
      try {
        refreshTranscriptsList({ silent: Boolean(state.transcriptsList) });
        startTranscriptsPoll();
      } catch (_) {}
    } else {
      try {
        stopTranscriptsPoll();
        closeTranscriptViewer();
      } catch (_) {}
    }
    if (view === "tickets/aperti") {
      try {
        refreshOpenTicketsList({ silent: Boolean(state.openTicketsList) });
        startOpenTicketsPoll();
      } catch (_) {}
    } else {
      try {
        stopOpenTicketsPoll();
      } catch (_) {}
    }
    if (view === "tickets/pannelli") {
      try {
        refreshTicketPanels({ silent: Boolean(state.ticketPanels) }).then(function () {
          restoreTicketPanelsEditorFromRoute({ applyDraft: true });
        });
        refreshTicketForms({ silent: true });
      } catch (_) {}
    }
    if (view === "tickets/teams") {
      try {
        refreshTicketTeams({ silent: Boolean(state.ticketTeams) });
      } catch (_) {}
    }
    if (view === "tickets/forms") {
      try {
        refreshTicketForms({ silent: Boolean(state.ticketForms) });
      } catch (_) {}
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
        if (alreadyUndone) {
      state.migrationShowSetup = true;
      setError("");
      job = null;
    }
            if (isMigrationSoftFail(job)) {
      state.migrationShowSetup = true;
      var softErr = job.error || (job.progress && job.progress.message) || "";
      if (softErr && state.view === "partnership/dati") {
        setError(translateMigrationApiMessage(softErr));
      }
    }
    var active = job && (job.status === "queued" || job.status === "running");
    var done = job && (job.status === "completed" || job.status === "failed");
        if (active || (done && !state.migrationShowSetup)) {
      state.migrationShowSetup = false;
    }
    var showSetup = !job || (!active && (!done || state.migrationShowSetup));
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
                if (!state.migrationStatusKnown && state.view === "partnership/dati") {
          renderMigrationJob({ job: null });
        }
        return;
      }
      renderMigrationJob(data);
      if (data.job && (data.job.status === "completed" || data.job.status === "failed")) {
                if (data.job.status !== "queued" && data.job.status !== "running") {
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
    var ok = await (typeof window.__vcEnsureDialog === "function"
      ? window.__vcEnsureDialog()
      : Promise.resolve(window.VcDialog)
    ).then(function (D) {
      if (!D || typeof D.confirm !== "function") return false;
      return D.confirm({
          title: i18n("dash.mig.undoTitle", "Annullare i dati migrazione?"),
          message: i18n(
            "dash.mig.undoConfirm",
            "Cancellare SOLO i dati importati dall’ultima migrazione? I punti/partnership fatti a mano dopo restano.",
          ),
          confirmLabel: i18n("dash.mig.undo", "Annulla dati migrazione"),
          cancelLabel: i18n("dash.bl.cancel", "Annulla"),
          danger: true,
          icon: "fa-trash-o",
        });
    });
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
        body.channelId = ch && ch.value ? ch.value : null;
    body.logsChannelId = logs && logs.value ? logs.value : null;
    body.roleId = role && role.value ? role.value : null;
    var startBtn = byId("ps-migration-start-btn");
    if (startBtn) startBtn.disabled = true;
    setError("");
    state.migrationShowSetup = false;
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
        if (completeBtn) completeBtn.setAttribute("hidden", "");
    if (setupBar) setupBar.setAttribute("hidden", "");
    setPartnershipSetupLocked(p.setupCompleted !== true);
    if (p.setupCompleted !== true) {
      state.wizardStep = state.wizardStep || 1;
    }

    syncFeatCardsFromValues({ fromServer: true });
    updateDescModeVisibility();
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
        if (/vinili-avatar\.png/i.test(url) || /\{\{\s*WIKI_BOT_VINILI_AVATAR_URL\s*\}\}/.test(url)) {
      return "https://cdn.discordapp.com/avatars/1329118940110127204/a_2f3825915a41d0f9bcbf9f2675e6d6f0.gif?size=128";
    }
    return url;
  }

  function applyHeaderGuildBrand(guildName, guildIcon) {
    var dashLabel = i18n("footer.dashboard", "Dashboard");
    var rawName = String(guildName || "").trim();
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
                var nextIcon = icon || state.headerGuildIcon;
        if (nextIcon && iconEl.getAttribute("src") !== nextIcon) {
          iconEl.src = nextIcon;
        }
        iconEl.setAttribute("data-vc-guild-brand", "1");
      } else {
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
  async function loadPartnership(seq) {
    var token = getToken();
    if (!token || !state.guildId) return false;
    try {
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

  var G = (window.__VC_DG = window.__VC_DG || {});
  G.state = state;
  G._extReady = false;
  G._extQueue = [];
  G._flushExtQueue = function () {
    var q = G._extQueue || [];
    G._extQueue = [];
    q.forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  };
  function exportCoreFnsToG() {
    G.state = state;
    G.applyPremiumUi = applyPremiumUi;
    G.byId = byId;
    G.canUseGuildSettings = canUseGuildSettings;
    G.canUseTickets = canUseTickets;
    G.closeAllDashFancySelects = closeAllDashFancySelects;
    G.cmdPickerLabel = cmdPickerLabel;
    G.enhanceAllDashFancySelects = enhanceAllDashFancySelects;
    G.esc = esc;
    G.escHtml = escHtml;
    G.fetchDashboardJson = fetchDashboardJson;
    G.fillSelect = fillSelect;
    G.fillTicketCategorySelect = fillTicketCategorySelect;
    G.findLiveTicketCategoryName = findLiveTicketCategoryName;
    G.getToken = getToken;
    G.i18n = i18n;
    G.isPremiumActive = isPremiumActive;
    G.normalizeView = normalizeView;
    G.refreshCommandsPage = refreshCommandsPage;
    G.refreshDashFancySelect = refreshDashFancySelect;
    G.resolveApiBase = resolveApiBase;
    G.scheduleSettingsAutosave = scheduleSettingsAutosave;
    G.setBachecaNavOpen = setBachecaNavOpen;
    G.setError = setError;
    G.setPremiumFromApi = setPremiumFromApi;
    G.setSettingsNavVisible = setSettingsNavVisible;
    G.setSuccess = setSuccess;
    G.showLocked = showLocked;
    G.showSaveToast = showSaveToast;
    G.syncTicketCategoryNameVisibility = syncTicketCategoryNameVisibility;
    G.wireForm = wireForm;
  }
  exportCoreFnsToG();

  function loadGuildExtScript() {
    return new Promise(function (resolve, reject) {
      if (G._extReady) { resolve(G); return; }
      if (G._extLoading) {
        G._extQueue.push(function () { resolve(G); });
        return;
      }
      G._extLoading = true;
      var s = document.createElement("script");
      s.src = (function () {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
          var src = String(scripts[i].getAttribute("src") || scripts[i].src || "");
          var m = src.match(/^(.*\/js\/)dashboard-guild-core\.js/);
          if (m) return m[1] + "dashboard-guild-ext.js?v=20260901guildSplitFix2";
        }
        return "/js/dashboard-guild-ext.js?v=20260901guildSplitFix2";
      })();
      s.defer = true;
      s.onload = function () { G._extLoading = false; resolve(G); };
      s.onerror = function () { G._extLoading = false; reject(new Error("guild_ext_load_failed")); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function ensureGuildExt() { return loadGuildExtScript(); }
  async function loadSettings(seq) {
    var g = await ensureGuildExt();
    return g.loadSettings(seq);
  }
  async function loadTickets(opts) {
    var g = await ensureGuildExt();
    return g.loadTickets(opts);
  }
  G.prefetchExtChunk = function () {
    return ensureGuildExt().catch(function () {});
  };

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
            if (silent && state.loadBusy) return;
    var seq = ++state.loadSeq;
    if (!silent) {
      state.loadBusy = true;
      state.__loadStartedAt = Date.now();
      setLoading(true);
      setError("");
      setSuccess("");
    }
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
            if (!silent) {
        var sw = byId("vc-dash-server-switcher");
        if (sw && sw.hasAttribute("hidden")) void loadServerSwitcher({ force: true });
        else if (Array.isArray(state.switcherGuilds) && state.switcherGuilds.length) {
          renderServerSwitcher(state.switcherGuilds);
        }
      }
                  if (!silent) {
        setError("");
        renderOverview(data);
        setLoading(false);
        revealGuildMain();
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
    ensureGuildExt().then(function (g) {
      if (g && typeof g.wireGsDashRoles === "function") g.wireGsDashRoles();
    }).catch(function () {});
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

  function wireSidebarNav() {
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
    wireSidebarNav();
    ensureGuildExt().then(function (g) {
      if (g.wireBachecaForm) g.wireBachecaForm();
      if (g.wireBachecaFeaturesForm) g.wireBachecaFeaturesForm();
      if (g.wireBachecaStyleForm) g.wireBachecaStyleForm();
      if (g.wireTicketsUi) g.wireTicketsUi();
    }).catch(function () {});
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
                if (!isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
                        if (isOpen && Date.now() < Number(state.partnershipSheetIgnoreUntil || 0)) return;
        setPartnershipNavOpen(!isOpen);
        if (isOpen) {
                    state.partnershipSheetIgnoreUntil = Date.now() + 400;
        }
      }
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
        if (!window.__vcDashMainWatchdog) {
      window.__vcDashMainWatchdog = setInterval(function () {
        try {
          ensureVisibleDashboardContent();
          var loading = byId("vc-dashboard-guild-loading");
          if (loading && !loading.hasAttribute("hidden") && state.overview) {
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
            void loadServerSwitcher();
      loadOverview();
      return;
    }
    obscureDashboard();
  }

  window.addEventListener("vc-discord-profile", function (ev) {
    var u = ev && ev.detail ? ev.detail.user : null;
    if (u) {
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
