(function (G) {
  "use strict";
  var state = G.state;
  var applyPremiumUi = G.applyPremiumUi;
  var byId = G.byId;
  var canUseGuildSettings = G.canUseGuildSettings;
  var canUseTickets = G.canUseTickets;
  var closeAllDashFancySelects = G.closeAllDashFancySelects;
  var cmdPickerLabel = G.cmdPickerLabel;
  var enhanceAllDashFancySelects = G.enhanceAllDashFancySelects;
  var esc = G.esc;
  var escHtml = G.escHtml;
  var fetchDashboardJson = G.fetchDashboardJson;
  var fillSelect = G.fillSelect;
  var fillTicketCategorySelect = G.fillTicketCategorySelect;
  var findLiveTicketCategoryName = G.findLiveTicketCategoryName;
  var getToken = G.getToken;
  var i18n = G.i18n;
  var isPremiumActive = G.isPremiumActive;
  var normalizeView = G.normalizeView;
  var refreshCommandsPage = G.refreshCommandsPage;
  var refreshDashFancySelect = G.refreshDashFancySelect;
  var resolveApiBase = G.resolveApiBase;
  var scheduleSettingsAutosave = G.scheduleSettingsAutosave;
  var setBachecaNavOpen = G.setBachecaNavOpen;
  var setError = G.setError;
  var setPremiumFromApi = G.setPremiumFromApi;
  var setSettingsNavVisible = G.setSettingsNavVisible;
  var setSuccess = G.setSuccess;
  var showLocked = G.showLocked;
  var showSaveToast = G.showSaveToast;
  var syncTicketCategoryNameVisibility = G.syncTicketCategoryNameVisibility;
  var wireForm = G.wireForm;

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
        var rolesLocked = s.rolesLocked === true;
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

    function resolveQuoteFadeEdgeUi(colors, style) {
    var bg = normalizeQuoteHex(colors && colors.bg) || "#070707";
    var to = normalizeQuoteHex(colors && colors.bgGradTo);
    if (!to || to === bg) return bg;
    var vertical = style && String(style.orientation || "") === "vertical";
    var flip = Boolean(style && style.flip);
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
    try {
      if (window.VcColorPicker && typeof window.VcColorPicker.upgradeNatives === "function") {
        window.VcColorPicker.upgradeNatives(form);
      }
    } catch (eCpUp) {}
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

  G.loadSettings = loadSettings;
  G.wireGsDashRoles = wireGsDashRoles;
  G.wireBachecaForm = wireBachecaForm;
  G.wireBachecaFeaturesForm = wireBachecaFeaturesForm;
  G.wireBachecaStyleForm = wireBachecaStyleForm;
  G._extReady = true;
  if (typeof G._flushExtQueue === "function") G._flushExtQueue();
})(window.__VC_DG);
