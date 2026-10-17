/**
 * Founder-only "Vedi come…" — centered bar, auto-apply menu, icon exit.
 * Marker: vcViewAsBarToggle1 — bar off by default; X closes; launcher reopens
 * Marker: vcViewAsNoFlash2 — no stub/bar chrome unless preview active or bar open
 * Marker: authAnteprimaSticky2 — no Anteprima se token scaduto / UI Accedi senza preview
 * Marker: viewAsSyntaxFix1 — comment block must not nest slash-star openers
 */
(function (global) {
  var STORAGE_KEY = "vc_view_as";
  var ALLOWED_KEY = "vc_view_as_allowed";
  var BAR_OPEN_KEY = "vc_view_as_bar_open";
  var HEADER = "X-VC-View-As";
  var BAR_ID = "vc-view-as-bar";
  var LAUNCH_ID = "vc-view-as-launch";
  /* Real Discord role names + FA icons. Reale = default. */
  var PRESETS = [
    { id: "real", label: "Reale", icon: "fa-user", def: true },
    { id: "logout", label: "Logout", icon: "fa-sign-out" },
    { id: "member", label: "Membro", icon: "fa-coffee" },
    { id: "helper", label: "Helper", icon: "fa-life-ring" },
    { id: "mod", label: "Mod", icon: "fa-shield" },
    { id: "senior", label: "Senior Moderator", icon: "fa-shield" },
    { id: "director", label: "Director", icon: "fa-star" },
    { id: "highstaff", label: "High Staff", icon: "fa-diamond" },
    { id: "pm", label: "Partner Manager", icon: "fa-briefcase" },
  ];

  function readMode() {
    try {
      var v = String(sessionStorage.getItem(STORAGE_KEY) || "")
        .trim()
        .toLowerCase();
      if (!v || v === "real" || v === "none" || v === "off") return "";
      return v;
    } catch (e) {
      return "";
    }
  }

  function writeMode(mode) {
    var m = String(mode || "")
      .trim()
      .toLowerCase();
    if (!m || m === "real") {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (e0) {}
      global.__VC_VIEW_AS = "";
      return "";
    }
    try {
      sessionStorage.setItem(STORAGE_KEY, m);
    } catch (e1) {}
    global.__VC_VIEW_AS = m;
    return m;
  }

  function isBarOpen() {
    /* Active preview always keeps the bar (need X to exit). Otherwise default OFF. */
    if (readMode()) return true;
    try {
      return localStorage.getItem(BAR_OPEN_KEY) === "1";
    } catch (eB) {
      return false;
    }
  }

  function setBarOpen(on) {
    try {
      if (on) localStorage.setItem(BAR_OPEN_KEY, "1");
      else localStorage.removeItem(BAR_OPEN_KEY);
    } catch (eS) {}
  }

  function hasRealAuthToken() {
    var t = "";
    var exp = 0;
    try {
      if (typeof global.__vcDiscordGetRealAccessToken === "function") {
        t = String(global.__vcDiscordGetRealAccessToken() || "").trim();
        if (t) return true; /* already expiry-aware in discord-auth getRawToken */
      }
    } catch (eR) {}
    try {
      if (typeof global.__vcDiscordRawLocalStorageGetItem === "function") {
        t = String(global.__vcDiscordRawLocalStorageGetItem("vc_discord_access_token") || "").trim();
        exp = Number(global.__vcDiscordRawLocalStorageGetItem("vc_discord_expires_at") || "0");
      } else {
        t = String(localStorage.getItem("vc_discord_access_token") || "").trim();
        exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      }
    } catch (eLs) {
      return false;
    }
    if (!t) return false;
    if (exp && Date.now() >= exp) return false;
    return true;
  }

  function isAccountChromeVisible() {
    try {
      var avatar = document.querySelector(
        "#discord-login-state .discord-avatar-img, .discord-account-menu .discord-avatar-img, .discord-account-menu img.discord-avatar-img, header .discord-avatar-img",
      );
      if (!avatar) return false;
      var cs = global.getComputedStyle(avatar);
      return cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity || 1) > 0.05;
    } catch (eAv) {}
    return false;
  }

  function isLoginChromeVisible() {
    try {
      /* navAnteprimaRestore1: se c’è già l’avatar, non trattare Accedi come “logged out” */
      if (isAccountChromeVisible()) return false;
      if (document.documentElement.classList.contains("vc-auth-logged-out")) return true;
      if (document.documentElement.classList.contains("vc-view-as-guest")) return true;
      var btn = document.getElementById("discord-login-btn");
      if (!btn || btn.hidden) return false;
      var cs = global.getComputedStyle(btn);
      return cs.display !== "none" && cs.visibility !== "hidden";
    } catch (eVis) {}
    return false;
  }

  function markAllowed(on) {
    try {
      if (on) sessionStorage.setItem(ALLOWED_KEY, "1");
      else sessionStorage.removeItem(ALLOWED_KEY);
    } catch (eA) {}
    global.__VC_VIEW_AS_ALLOWED = Boolean(on);
  }

  function isAllowed() {
    var sticky = false;
    try {
      sticky = sessionStorage.getItem(ALLOWED_KEY) === "1";
    } catch (e) {}
    if (global.__VC_VIEW_AS_ALLOWED || sticky) {
      /* navAnteprimaRestore1: token ok, mode attiva, oppure UI già loggata (avatar) */
      if (hasRealAuthToken() || readMode() || isAccountChromeVisible()) return true;
      markAllowed(false);
      return false;
    }
    var p = global.__VC_STAFF_PERMS;
    return Boolean(p && (p.viewAsAllowed || p.isFounder) && (hasRealAuthToken() || isAccountChromeVisible()));
  }

  function clearAllowedChrome() {
    markAllowed(false);
    removeLauncher();
    if (!readMode()) {
      hideBarDom();
      applyChrome("");
    }
  }

  function presetFor(mode) {
    var id = mode || "real";
    for (var i = 0; i < PRESETS.length; i += 1) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return PRESETS[0];
  }

  function labelFor(mode) {
    return presetFor(mode).label;
  }

  function iconFor(mode) {
    return presetFor(mode).icon || "fa-user";
  }

  function iconHtml(mode) {
    return '<i class="fa ' + iconFor(mode) + '" aria-hidden="true"></i>';
  }

  function copyHeaders(src) {
    var out = {};
    if (!src) return out;
    try {
      if (typeof src.forEach === "function") {
        src.forEach(function (value, key) {
          out[String(key)] = String(value);
        });
        return out;
      }
    } catch (eForEach) {}
    if (typeof src === "object") {
      Object.keys(src).forEach(function (key) {
        try {
          out[key] = String(src[key]);
        } catch (eK) {}
      });
    }
    return out;
  }

  function applyHeaderToInit(init) {
    var mode = readMode();
    if (!mode) return init;
    var next = init ? Object.assign({}, init) : {};
    try {
      var h = copyHeaders(next.headers);
      h[HEADER] = mode;
      /* Keep founder Authorization even when UI token is masked (logout preview). */
      var authNow = String(h.Authorization || h.authorization || "").trim();
      if (!authNow || /^Bearer\s*$/i.test(authNow)) {
        var real = "";
        try {
          if (typeof global.__vcDiscordGetRealAccessToken === "function") {
            real = String(global.__vcDiscordGetRealAccessToken() || "").trim();
          } else if (typeof global.__vcDiscordRawLocalStorageGetItem === "function") {
            real = String(global.__vcDiscordRawLocalStorageGetItem("vc_discord_access_token") || "").trim();
          }
        } catch (eTok) {}
        if (real) h.Authorization = "Bearer " + real;
      }
      next.headers = h;
    } catch (eH) {
      next.headers = Object.assign({}, copyHeaders(next.headers));
      next.headers[HEADER] = mode;
    }
    return next;
  }

  function installFetchPatch() {
    if (global.__vcViewAsFetchPatched) return;
    global.__vcViewAsFetchPatched = true;
    var orig = global.fetch;
    if (typeof orig !== "function") return;
    global.fetch = function (input, init) {
      try {
        var url = typeof input === "string" ? input : input && input.url;
        var u = String(url || "");
        /* Only site webhooks — never stamp auth on CSS/JS/images (breaks cache / crashes callers). */
        if (/\/webhooks\//i.test(u) || u.indexOf("/webhooks/") === 0) {
          init = applyHeaderToInit(init);
        }
      } catch (eP) {}
      return orig.call(this, input, init);
    };
  }

  function syncBarHeight() {
    var bar = document.getElementById(BAR_ID);
    var root = document.documentElement;
    var body = document.body;
    if (!bar || bar.hidden) {
      root.style.removeProperty("--vc-view-as-bar-h");
      root.classList.remove("vc-view-as-bar-on");
      try {
        if (body) {
          body.style.removeProperty("padding-top");
          body.style.removeProperty("--vc-view-as-cut");
        }
      } catch (eClr) {}
      clearHeaderCutInline();
      return;
    }
    var h = Math.max(40, Math.ceil(bar.getBoundingClientRect().height || 50));
    root.style.setProperty("--vc-view-as-bar-h", h + "px");
    root.classList.add("vc-view-as-bar-on");
    try {
      if (body) {
        body.style.setProperty("padding-top", h + "px", "important");
        body.style.setProperty("--vc-view-as-cut", h + "px");
      }
    } catch (ePad) {}
    applyHeaderCutInline(h);
  }

  function headerCutNodes() {
    return document.querySelectorAll(
      "body > header, body.vc-body > header, body.vc-body header.fixed, header.fixed.top-0, header.fixed.inset-x-0",
    );
  }

  function clearHeaderCutInline() {
    try {
      headerCutNodes().forEach(function (el) {
        if (el && el.style) el.style.removeProperty("top");
      });
    } catch (eC) {}
  }

  function applyHeaderCutInline(hPx) {
    var top = String(hPx || 0) + "px";
    try {
      headerCutNodes().forEach(function (el) {
        if (!el || !el.style) return;
        el.style.setProperty("top", top, "important");
      });
    } catch (eA) {}
  }

  function applyChrome(mode) {
    var root = document.documentElement;
    root.classList.remove(
      "vc-view-as-active",
      "vc-view-as-guest",
      "vc-view-as-member",
      "vc-view-as-staff-preview",
    );
    PRESETS.forEach(function (p) {
      root.classList.remove("vc-view-as-" + p.id);
    });
    if (!mode) {
      root.classList.remove("vc-view-as-bar-on");
      return;
    }
    root.classList.add("vc-view-as-active", "vc-view-as-" + mode);
    if (mode === "logout") {
      root.classList.add("vc-view-as-guest");
      try {
        root.classList.remove("vc-auth-session-pending");
        root.classList.remove("vc-session-verify-pending");
        root.classList.remove("vc-loading-scroll-lock");
        root.classList.remove("vc-staff-access-pending");
        root.classList.remove("vc-dash-access-pending");
        root.style.removeProperty("overflow");
      } catch (ePend) {}
      try {
        var ov = document.getElementById("vc-session-verify-overlay");
        if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      } catch (eOv) {}
      try {
        if (document.body) {
          document.body.style.removeProperty("overflow");
          document.body.style.removeProperty("pointer-events");
        }
      } catch (eBody) {}
    }
    if (mode === "member") root.classList.add("vc-view-as-member");
    if (mode && mode !== "logout" && mode !== "member" && mode !== "real") {
      root.classList.add("vc-view-as-staff-preview");
    }
    try {
      if (mode === "logout" && typeof global.__vcDiscordRenderLoggedOut === "function") {
        global.__vcDiscordRenderLoggedOut();
      }
    } catch (eLo) {}
    try {
      if (mode === "member" || mode === "logout") {
        global.__VC_STAFF_MENU_ALLOWED = false;
        /* viewAsFreeze1: do NOT dispatch vc:staff-access-ok here — the view-as
           listener calls enforceGuestChrome → applyChrome again → stack overflow
           / multi-second main-thread freeze after every reload. */
        try {
          global.dispatchEvent(
            new CustomEvent("vc:view-as-chrome", {
              detail: { mode: mode, viewAsActive: true },
            }),
          );
        } catch (eVaChrome) {}
      }
    } catch (eStaff) {}
  }

  var __vcViewAsEnforceBusy = false;
  function enforceGuestChrome() {
    if (__vcViewAsEnforceBusy) return;
    __vcViewAsEnforceBusy = true;
    try {
      var mode = readMode();
      if (mode === "logout") {
        applyChrome("logout");
        try {
          global.__VC_DISCORD_PROFILE = null;
          global.__VC_SERVER_IDENTITY = null;
          global.__VC_ACCOUNT_MENU_USER = null;
        } catch (eProf) {}
        try {
          if (typeof global.__vcDiscordRenderLoggedOut === "function") {
            global.__vcDiscordRenderLoggedOut();
          }
        } catch (eLo2) {}
        return;
      }
      if (mode === "member") {
        applyChrome("member");
        try {
          global.__VC_STAFF_MENU_ALLOWED = false;
        } catch (eM) {}
      } else if (mode) {
        applyChrome(mode);
      }
    } finally {
      __vcViewAsEnforceBusy = false;
    }
  }

  function injectCss() {
    var existingCss = document.getElementById("vc-view-as-css");
    if (existingCss && existingCss.getAttribute("data-vc") === "vcViewAsEyeGif2") return;
    if (existingCss && existingCss.parentNode) existingCss.parentNode.removeChild(existingCss);
    var css = document.createElement("style");
    css.id = "vc-view-as-css";
    css.setAttribute("data-vc", "vcViewAsEyeGif2");
    css.textContent =
      "html.vc-view-as-bar-on{--vc-view-as-bar-h:3.1rem}" +
      "html.vc-view-as-bar-on body," +
      "html.vc-view-as-bar-on body.vc-body," +
      "html.vc-view-as-bar-on body.vc-dashboard-page," +
      "html.vc-view-as-bar-on body.vc-vote-page{" +
      "padding-top:var(--vc-view-as-bar-h)!important;box-sizing:border-box}" +
      "#vc-view-as-bar-stub{position:fixed;top:0;left:0;right:0;height:var(--vc-view-as-bar-h,3.1rem);" +
      "z-index:10040;pointer-events:none;box-sizing:border-box;background:#140f0c;" +
      "border-bottom:1px solid rgba(255,255,255,.1)}" +
      /* vcViewAsNoFlash2: never show stub/bar until explicitly ready */
      "#vc-view-as-bar-stub," +
      "html:not(.vc-view-as-bar-on) #vc-view-as-bar-stub," +
      "html.vc-view-as-bar-on:has(#vc-view-as-bar:not([hidden])) #vc-view-as-bar-stub," +
      "html:not(.vc-view-as-bar-ready) #vc-view-as-bar-stub," +
      "html.vc-session-verify-pending #vc-view-as-bar-stub," +
      "html.vc-page-cine-boot:not(.vc-page-cine-ready) #vc-view-as-bar-stub," +
      "html.vc-staff-access-pending:not(.vc-staff-app-revealed) #vc-view-as-bar-stub," +
      "html.vc-loader-blocking-live #vc-view-as-bar-stub," +
      "html.vc-dash-access-pending:not(.vc-dash-access-ready) #vc-view-as-bar-stub," +
      "html.vc-loading-scroll-lock #vc-view-as-bar-stub{display:none!important;visibility:hidden!important}" +
      "html:not(.vc-view-as-bar-ready) #vc-view-as-bar," +
      "#" +
      BAR_ID +
      "[hidden]{display:none!important;visibility:hidden!important;pointer-events:none!important;opacity:0!important}" +
      "html.vc-view-as-bar-on body>header," +
      "html.vc-view-as-bar-on body>header.fixed," +
      "html.vc-view-as-bar-on body>header.top-0," +
      "html.vc-view-as-bar-on body>header.fixed.top-0," +
      "html.vc-view-as-bar-on body>header.fixed.inset-x-0," +
      "html.vc-view-as-bar-on body.vc-body>header," +
      "html.vc-view-as-bar-on body.vc-body>header.fixed," +
      "html.vc-view-as-bar-on body.vc-body header.fixed," +
      "html.vc-view-as-bar-on body.vc-body--home>header," +
      "html.vc-view-as-bar-on body.vc-dashboard-page>header," +
      "html.vc-view-as-bar-on body.vc-dashboard-page>header.fixed," +
      "html.vc-view-as-bar-on body.vc-vote-page>header," +
      "html.vc-view-as-bar-on.vc-site-polish body.vc-body>header," +
      "html.vc-view-as-bar-on.vc-site-polish body.vc-body header.fixed{" +
      "top:var(--vc-view-as-bar-h)!important}" +
      "#" +
      BAR_ID +
      "{--vcva-sand:#e2c2a4;--vcva-ink:#f7efe4;position:fixed;top:0;left:0;right:0;z-index:2147483000;" +
      "box-sizing:border-box;pointer-events:auto;" +
      "padding:0;padding-top:env(safe-area-inset-top,0px);" +
      "font-family:ui-sans-serif,system-ui,Segoe UI,sans-serif;" +
      "background:#140f0c;border:0;border-bottom:1px solid rgba(255,255,255,.1);" +
      "box-shadow:0 8px 24px rgba(0,0,0,.35)}" +
      "#" +
      BAR_ID +
      " .vcva-shell{display:flex;align-items:center;justify-content:center;flex-wrap:wrap;" +
      "gap:.55rem .7rem;width:100%;max-width:none;margin:0;box-sizing:border-box;" +
      "min-height:2.65rem;padding:.4rem 1rem;" +
      "padding-left:max(1rem,env(safe-area-inset-left,0px));" +
      "padding-right:max(1rem,env(safe-area-inset-right,0px));" +
      "border-radius:0;background:transparent;border:0;box-shadow:none;color:var(--vcva-ink)}" +
      "#" +
      BAR_ID +
      " .vcva-title{font-size:.72rem;font-weight:750;letter-spacing:.14em;text-transform:uppercase;" +
      "color:rgba(226,194,164,.78);margin:0;white-space:nowrap}" +
      "#" +
      BAR_ID +
      " .vcva-menu{position:relative}" +
      "#" +
      BAR_ID +
      " .vcva-menu-btn{appearance:none;border:1px solid rgba(255,255,255,.14);" +
      "background:linear-gradient(180deg,rgba(255,255,255,.07),rgba(255,255,255,.03));" +
      "color:#f7efe4;border-radius:999px;" +
      "padding:.42rem 1.95rem .42rem .8rem;font:650 .8rem/1.1 inherit;min-width:11rem;" +
      "cursor:pointer;text-align:left;position:relative;display:inline-flex;align-items:center;gap:.55rem;" +
      "box-shadow:inset 0 1px 0 rgba(255,255,255,.06)}" +
      "#" +
      BAR_ID +
      " .vcva-menu-btn .fa{color:#e2c2a4;width:.95rem;text-align:center}" +
      "#" +
      BAR_ID +
      " .vcva-menu-btn::after{content:'';pointer-events:none;position:absolute;right:.78rem;top:50%;" +
      "width:.34rem;height:.34rem;border-right:1.5px solid #e2c2a4;border-bottom:1.5px solid #e2c2a4;" +
      "transform:translateY(-65%) rotate(45deg)}" +
      "#" +
      BAR_ID +
      " .vcva-menu-btn:hover,#" +
      BAR_ID +
      " .vcva-menu-btn[aria-expanded='true']{border-color:rgba(226,194,164,.42);background:rgba(226,194,164,.12)}" +
      "#" +
      BAR_ID +
      " .vcva-menu-list{position:absolute;top:calc(100% + .45rem);left:50%;transform:translateX(-50%);" +
      "min-width:16rem;margin:0;padding:.45rem;list-style:none;border-radius:1.05rem;" +
      "background:linear-gradient(180deg,#1a140f,#120e0b);border:1px solid rgba(226,194,164,.22);" +
      "box-shadow:0 18px 44px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.05);z-index:5;" +
      "max-height:18rem;overflow:auto}" +
      "#" +
      BAR_ID +
      " .vcva-menu-list[hidden]{display:none!important}" +
      "#" +
      BAR_ID +
      " .vcva-menu-item{display:flex;align-items:center;gap:.55rem;width:100%;appearance:none;border:0;" +
      "background:transparent;color:#f7efe4;text-align:left;padding:.55rem .7rem;border-radius:.8rem;" +
      "font:650 .82rem/1.2 inherit;cursor:pointer}" +
      "#" +
      BAR_ID +
      " .vcva-menu-item .fa{width:1rem;text-align:center;color:#e2c2a4}" +
      "#" +
      BAR_ID +
      " .vcva-menu-item .vcva-item-lab{flex:1;min-width:0}" +
      "#" +
      BAR_ID +
      " .vcva-menu-item .vcva-item-def{margin-left:auto;font-size:.62rem;font-weight:750;" +
      "letter-spacing:.04em;text-transform:uppercase;color:rgba(243,221,196,.9);" +
      "padding:.1rem .42rem;border-radius:999px;border:1px solid rgba(226,194,164,.28);" +
      "background:rgba(226,194,164,.12)}" +
      "#" +
      BAR_ID +
      " .vcva-menu-item:hover,#" +
      BAR_ID +
      " .vcva-menu-item:focus-visible{background:rgba(226,194,164,.14);outline:none}" +
      "#" +
      BAR_ID +
      " .vcva-menu-item[aria-selected='true']{background:rgba(226,194,164,.2);color:#fff8ee}" +
      "#" +
      BAR_ID +
      " button.vcva-exit{appearance:none;cursor:pointer;border-radius:999px;" +
      "width:2.15rem;height:2.15rem;padding:0;display:inline-flex;align-items:center;justify-content:center;" +
      "color:#f3ddc4;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);" +
      "transition:background .15s ease,border-color .15s ease,color .15s ease}" +
      "#" +
      BAR_ID +
      " button.vcva-exit .fa{font-size:.92rem;line-height:1}" +
      "#" +
      BAR_ID +
      " button.vcva-exit:hover{color:#fff8ee;border-color:rgba(226,194,164,.42);background:rgba(226,194,164,.12)}" +
      /* vcViewAsNavPill1: launcher in #header-quick-actions (promo-style pill) */
      /* viewAsOrderFix1: order esplicito — Anteprima prima di bell/avatar */
      "#header-quick-actions{display:flex!important}" +
      "#header-quick-actions > #vc-header-promo-btn," +
      "#header-quick-actions > .vc-header-promo-btn{order:0!important}" +
      "#header-quick-actions > #" +
      LAUNCH_ID +
      "{order:1!important}" +
      "#header-quick-actions > #vc-notif-dropdown," +
      "#header-quick-actions > .vc-notif-dropdown," +
      "#header-quick-actions > .vc-notif-dropdown-slot--hold{order:2!important}" +
      "#header-quick-actions > #vc-mobile-nav-toggle{order:3!important}" +
      "#header-quick-actions > #discord-login-btn," +
      "#header-quick-actions > #discord-login-state," +
      "#header-quick-actions > .discord-account-menu," +
      "#header-quick-actions > .discord-login-row," +
      "#header-quick-actions > .header-login-state{order:4!important}" +
      "#" +
      LAUNCH_ID +
      "{position:relative;z-index:1;left:auto;right:auto;top:auto;bottom:auto;" +
      "appearance:none;cursor:pointer;flex:0 0 auto;" +
      "display:inline-flex;align-items:center;gap:.38rem;border-radius:9999px;" +
      "padding:.32rem .55rem;font:700 .7rem/1 ui-sans-serif,system-ui,Segoe UI,sans-serif;" +
      "letter-spacing:.08em;text-transform:uppercase;color:#f6eadc;" +
      "background:rgba(16,11,8,.42);border:1px solid rgba(212,168,136,.34);" +
      "box-shadow:inset 0 1px 0 rgba(255,244,232,.08);" +
      "transition:border-color .2s ease,background .2s ease,box-shadow .2s ease,transform .2s ease}" +
      "#" +
      LAUNCH_ID +
      " .fa{color:#e8c9a8;font-size:.78rem}" +
      "#" +
      LAUNCH_ID +
      " .vcva-eye{width:1.05rem;height:1.05rem;display:block;flex:0 0 auto;object-fit:contain;" +
      "image-rendering:auto;pointer-events:none;user-select:none;-webkit-user-drag:none}" +
      "#" +
      LAUNCH_ID +
      ":hover,#" +
      LAUNCH_ID +
      ":focus-visible{border-color:rgba(232,201,168,.62);background:rgba(24,16,12,.62);" +
      "box-shadow:inset 0 1px 0 rgba(255,244,232,.12),0 8px 22px rgba(212,168,136,.16);" +
      "transform:translateY(-1px);color:#fff6ea;outline:none}" +
      "#" +
      LAUNCH_ID +
      "[hidden]{display:none!important}" +
      /* viewAsNoOrphan1: hide se fuori header (status/pagine senza quick-actions) */
      "body.vc-status-page #" +
      LAUNCH_ID +
      ",#" +
      LAUNCH_ID +
      ":not(header #" +
      LAUNCH_ID +
      "):not(#header-quick-actions #" +
      LAUNCH_ID +
      "){display:none!important;visibility:hidden!important;pointer-events:none!important}" +
      /* phoneNavCircles1 + navChromeCirclesAlign1: Anteprima = cerchio 44px anche su PC */
      "#" +
      LAUNCH_ID +
      " span{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;" +
      "clip:rect(0,0,0,0);white-space:nowrap;border:0}" +
      "#" +
      LAUNCH_ID +
      "{width:44px;height:44px;min-width:44px;min-height:44px;max-width:44px;max-height:44px;" +
      "padding:0;box-sizing:border-box;justify-content:center;border-radius:9999px;gap:0}" +

      "html.vc-view-as-guest .vc-staff-site-nav,html.vc-view-as-guest [data-vc-staff-nav]," +
      "html.vc-view-as-member .vc-staff-site-nav,html.vc-view-as-member [data-vc-staff-nav]," +
      "html.vc-view-as-member .vc-staff-only," +
      "html.vc-view-as-member #vc-staff-menu-item," +
      "html.vc-view-as-member [data-vc-nav-staff]," +
      "html.vc-view-as-member .vc-nav-staff," +
      "html.vc-view-as-member li.staff-only{display:none!important}" +
      "html.vc-view-as-guest a[href*='/staff/'],html.vc-view-as-member a[href*='/staff/']{display:none!important}" +
      "html.vc-view-as-guest #discord-login-state,html.vc-view-as-guest .header-login-state," +
      "html.vc-view-as-guest .discord-account-menu,html.vc-view-as-guest .discord-login-row," +
      "html.vc-view-as-guest .discord-profile-link,html.vc-view-as-guest .vc-auth-pending-shell," +
      "html.vc-view-as-guest .vc-auth-early-shell{display:none!important;visibility:hidden!important}" +
      "html.vc-view-as-guest #discord-login-btn,html.vc-view-as-guest button[data-vc-discord-login]," +
      "html.vc-view-as-guest .vc-discord-login-btn," +
      "html.vc-view-as-guest.vc-auth-session-pending #discord-login-btn," +
      "html.vc-view-as-guest.vc-auth-session-pending button[data-vc-discord-login]{" +
      "visibility:visible!important;pointer-events:auto!important;display:inline-flex!important}" +
      "html.vc-view-as-guest.vc-session-verify-pending," +
      "html.vc-view-as-guest.vc-session-verify-pending body{" +
      "overflow:auto!important;overflow-x:hidden!important;overflow-y:auto!important}" +
      "html.vc-view-as-guest.vc-session-verify-pending .vc-auth-required-card," +
      "html.vc-view-as-guest.vc-session-verify-pending .vc-reviews-gate," +
      "html.vc-view-as-guest .vc-auth-required-card{" +
      "visibility:visible!important;pointer-events:auto!important;opacity:1!important}" +
      "html.vc-view-as-guest #vc-session-verify-overlay{display:none!important;pointer-events:none!important}" +
      "html.vc-view-as-bar-ready.vc-view-as-active #vc-view-as-bar:not([hidden])," +
      "html.vc-view-as-bar-ready.vc-view-as-active.vc-staff-denied-open #vc-view-as-bar:not([hidden])," +
      "html.vc-view-as-bar-ready.vc-view-as-active.vc-staff-access-pending #vc-view-as-bar:not([hidden])," +
      "html.vc-view-as-bar-ready.vc-view-as-active.vc-dash-access-pending #vc-view-as-bar:not([hidden]){" +
      "display:flex!important;visibility:visible!important;pointer-events:auto!important;opacity:1!important;z-index:10060!important}" +
      "html.vc-view-as-active.vc-staff-denied-open," +
      "html.vc-view-as-active.vc-staff-denied-open body{" +
      "overflow:auto!important;position:static!important;inset:auto!important;height:auto!important;max-height:none!important}" +
      "html.vc-view-as-guest #vc-notif-dropdown," +
      "html.vc-view-as-guest .vc-notif-dropdown," +
      "html.vc-view-as-guest .vc-notif-dropdown-slot," +
      "html.vc-view-as-guest .vc-notif-dropdown-slot--hold," +
      "html.vc-view-as-guest .vc-notif-summary," +
      "html.vc-view-as-guest button.vc-notif-summary," +
      "html.vc-view-as-guest #vc-notif-bell," +
      "html.vc-view-as-guest #vc-notif-bell-inbox," +
      "html.vc-view-as-guest .vc-notif-bell," +
      "html.vc-view-as-guest .vc-notif-bell-inbox," +
      "html.vc-view-as-guest [data-vc-notif-bell]," +
      "html.vc-view-as-guest [data-vc-notif-open]," +
      "html.vc-view-as-guest .vc-header-account," +
      "html.vc-view-as-member .vc-notif-scope-staff{display:none!important;visibility:hidden!important;pointer-events:none!important}" +
      "@media (max-width:720px){" +
      "#" +
      BAR_ID +
      " .vcva-shell{padding:.35rem .7rem;gap:.4rem}" +
      "#" +
      BAR_ID +
      " .vcva-menu-btn{min-width:0;max-width:9.5rem}" +
      "#" +
      BAR_ID +
      " .vcva-menu-list{left:auto;right:0;transform:none}}";
    (document.head || document.documentElement).appendChild(css);
  }

  function removeBarStub() {
    try {
      var stub = document.getElementById("vc-view-as-bar-stub");
      if (stub && stub.parentNode) stub.parentNode.removeChild(stub);
    } catch (eStub) {}
  }

  function pendingMode(wrap) {
    return String((wrap && wrap.getAttribute("data-pending-mode")) || readMode() || "real");
  }

  function menuBtnHtml(mode) {
    var id = mode || "real";
    return iconHtml(id) + "<span>" + labelFor(id) + "</span>";
  }

  function setPendingMode(wrap, mode) {
    var m = String(mode || "real") || "real";
    wrap.setAttribute("data-pending-mode", m);
    var btn = wrap.querySelector(".vcva-menu-btn");
    if (btn) btn.innerHTML = menuBtnHtml(m);
    wrap.querySelectorAll(".vcva-menu-item").forEach(function (item) {
      item.setAttribute("aria-selected", item.getAttribute("data-mode") === m ? "true" : "false");
    });
  }

  function closeMenu(wrap) {
    var list = wrap.querySelector(".vcva-menu-list");
    var btn = wrap.querySelector(".vcva-menu-btn");
    if (list) {
      list.hidden = true;
      list.setAttribute("hidden", "");
    }
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function applyModeAndReload(mode) {
    var next = String(mode || "real") || "real";
    if (next !== "real") setBarOpen(true);
    writeMode(next === "real" ? "" : next);
    markAllowed(true);
    /* viewAsLogoutNav1: Logout/Membro su pagine gated → pagina accesso, no freeze pending */
    try {
      var path = String(global.location.pathname || "");
      var guest = next === "logout" || next === "member";
      if (guest) {
        if (/^\/staff(?:\/|$)/i.test(path) && path.indexOf("/accesso-richiesto") === -1) {
          global.location.replace("/staff/accesso-richiesto/?from=" + encodeURIComponent(path));
          return;
        }
        if (/^\/dashboard(?:\/|$)/i.test(path) && path.indexOf("/dashboard/profilo") !== 0 && path.indexOf("/dashboard/transcript") !== 0) {
          global.location.replace("/");
          return;
        }
        if (/^\/seratafilm(?:\/|$)/i.test(path) && path.indexOf("/accesso-richiesto") === -1) {
          global.location.replace("/seratafilm/accesso-richiesto/");
          return;
        }
      }
    } catch (eNav) {}
    global.location.reload();
  }

  function removeLauncher() {
    try {
      var el = document.getElementById(LAUNCH_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (eL) {}
  }

  function hideBarDom() {
    try {
      var bar = document.getElementById(BAR_ID);
      if (bar) {
        bar.hidden = true;
        bar.setAttribute("hidden", "");
      }
    } catch (eH) {}
    try {
      var root = document.documentElement;
      root.classList.remove("vc-view-as-bar-ready");
      if (!readMode()) {
        root.classList.remove("vc-view-as-bar-on");
        root.style.removeProperty("--vc-view-as-bar-h");
        if (document.body) document.body.style.removeProperty("--vc-view-as-cut");
      }
    } catch (eC) {}
    syncBarHeight();
  }

  function placeLauncherInNav(btn) {
    if (!btn) return;
    var actions = document.getElementById("header-quick-actions");
    if (actions) {
      /* viewAsOrderFix1: sempre prima di campanella/avatar (non in coda) */
      var notif = actions.querySelector("#vc-notif-dropdown, .vc-notif-dropdown");
      var toggle = actions.querySelector("#vc-mobile-nav-toggle");
      var loginBtn = actions.querySelector("#discord-login-btn, [data-vc-discord-login]");
      var loginState = actions.querySelector("#discord-login-state, .header-login-state");
      var promo = actions.querySelector("#vc-header-promo-btn, .vc-header-promo-btn");
      var before = notif || toggle || loginBtn || loginState;
      if (before && before.parentElement === actions) {
        actions.insertBefore(btn, before);
      } else if (promo && promo.parentElement === actions) {
        if (promo.nextSibling) actions.insertBefore(btn, promo.nextSibling);
        else actions.appendChild(btn);
      } else if (btn.parentElement !== actions) {
        actions.appendChild(btn);
      }
      try {
        if (typeof global.__vcNormalizeHeaderQuickActionsOrder === "function") {
          global.__vcNormalizeHeaderQuickActionsOrder(actions);
        }
      } catch (eOrd) {}
      return;
    }
    /* viewAsNoOrphan1: mai append su body (es. /status/ senza header → bottone a caso) */
    try {
      if (btn.parentNode && !btn.closest("#header-quick-actions, header")) {
        btn.parentNode.removeChild(btn);
      }
    } catch (eOrphan) {}
    try {
      global.__vcViewAsLaunchBtn = btn;
    } catch (eHold) {}
    if (!global.__vcViewAsLaunchNavWatch) {
      global.__vcViewAsLaunchNavWatch = true;
      var tries = 0;
      var timer = global.setInterval(function () {
        tries += 1;
        var slot = document.getElementById("header-quick-actions");
        var launch =
          global.__vcViewAsLaunchBtn || document.getElementById(LAUNCH_ID);
        if (slot && launch) {
          placeLauncherInNav(launch);
          global.clearInterval(timer);
          global.__vcViewAsLaunchNavWatch = false;
          try {
            global.__vcViewAsLaunchBtn = null;
          } catch (eClr) {}
        } else if (tries > 40) {
          global.clearInterval(timer);
          global.__vcViewAsLaunchNavWatch = false;
          try {
            global.__vcViewAsLaunchBtn = null;
          } catch (eClr2) {}
        }
      }, 120);
    }
  }

  /* Marker: vcEyeGifNav2 — eyedarkmoving GIF (transparent) on Anteprima pill */
  var EYE_GIF_SRC = "/images/eyedarkmoving-trans.gif?v=20260912eyeGifNav2";

  function eyeIconHtml() {
    return (
      '<img class="vcva-eye" data-vc-eye="gif1" src="' +
      EYE_GIF_SRC +
      '" width="17" height="17" alt="" aria-hidden="true" decoding="async" draggable="false"/>'
    );
  }

  function mountLauncher() {
    /* authAnteprimaSticky2 + navAnteprimaRestore1: no pill se Accedi vero; ok se avatar loggato */
    if (!isAllowed() || isBarOpen() || (isLoginChromeVisible() && !readMode() && !isAccountChromeVisible())) {
      removeLauncher();
      return null;
    }
    injectCss();
    removeBarStub();
    hideBarDom();
    markBarReady(false);
    var existing = document.getElementById(LAUNCH_ID);
    if (existing) {
      existing.hidden = false;
      existing.removeAttribute("hidden");
      if (!existing.querySelector('.vcva-eye[data-vc-eye="gif1"]')) {
        existing.innerHTML = eyeIconHtml() + "<span>Anteprima</span>";
      }
      placeLauncherInNav(existing);
      return existing;
    }
    var btn = document.createElement("button");
    btn.id = LAUNCH_ID;
    btn.type = "button";
    btn.setAttribute("aria-label", "Apri anteprima ruoli");
    btn.title = "Anteprima";
    btn.innerHTML = eyeIconHtml() + "<span>Anteprima</span>";
    btn.addEventListener("click", function () {
      setBarOpen(true);
      removeLauncher();
      mountBar();
    });
    placeLauncherInNav(btn);
    return btn;
  }

  function closeBarUi() {
    setBarOpen(false);
    var hadMode = Boolean(readMode());
    if (hadMode) {
      applyModeAndReload("real");
      return;
    }
    hideBarDom();
    try {
      var bar = document.getElementById(BAR_ID);
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    } catch (eR) {}
    removeBarStub();
    applyChrome("");
    mountLauncher();
  }

  function markBarReady(on) {
    try {
      var root = document.documentElement;
      if (on) root.classList.add("vc-view-as-bar-ready");
      else root.classList.remove("vc-view-as-bar-ready");
    } catch (eR) {}
  }

  function mountBar() {
    injectCss();
    removeBarStub();
    removeLauncher();
    var existing = document.getElementById(BAR_ID);
    if (existing) {
      var stale =
        !existing.querySelector(".vcva-title") ||
        existing.querySelector(".vcva-apply") ||
        existing.querySelector("#vcva-mode-strong") ||
        existing.querySelector(".vcva-def-chip") ||
        /Vista come/i.test(String(existing.textContent || "")) ||
        existing.getAttribute("data-vc-cut") !== "barToggle1";
      if (stale) {
        try {
          if (existing.parentNode) existing.parentNode.removeChild(existing);
        } catch (eKill) {}
      } else {
        existing.hidden = false;
        existing.removeAttribute("hidden");
        syncSelect(existing);
        applyChrome(readMode());
        syncBarHeight();
        markBarReady(true);
        return existing;
      }
    }
    var wrap = document.createElement("div");
    wrap.id = BAR_ID;
    wrap.setAttribute("data-vc-view-as", "1");
    wrap.setAttribute("data-vc-cut", "barToggle1");
    wrap.setAttribute("role", "status");
    wrap.setAttribute("aria-live", "polite");
    var cur = readMode() || "real";
    wrap.setAttribute("data-pending-mode", cur);
    var items = PRESETS.map(function (p) {
      var selected = p.id === cur;
      return (
        '<li role="none"><button type="button" role="option" class="vcva-menu-item" data-mode="' +
        p.id +
        '" aria-selected="' +
        (selected ? "true" : "false") +
        '">' +
        '<i class="fa ' +
        p.icon +
        '" aria-hidden="true"></i>' +
        '<span class="vcva-item-lab">' +
        p.label +
        "</span>" +
        (p.def ? '<span class="vcva-item-def">Default</span>' : "") +
        "</button></li>"
      );
    }).join("");
    wrap.innerHTML =
      '<div class="vcva-shell">' +
      '<span class="vcva-title">Anteprima</span>' +
      '<div class="vcva-menu">' +
      '<button type="button" class="vcva-menu-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Vedi come">' +
      menuBtnHtml(cur) +
      "</button>" +
      '<ul class="vcva-menu-list" role="listbox" hidden>' +
      items +
      "</ul></div>" +
      '<button type="button" class="vcva-exit" title="Chiudi anteprima" aria-label="Chiudi anteprima">' +
      '<i class="fa fa-times" aria-hidden="true"></i>' +
      "</button>" +
      "</div>";
    var host = document.body || document.documentElement;
    if (host.firstChild) host.insertBefore(wrap, host.firstChild);
    else host.appendChild(wrap);

    var menuBtn = wrap.querySelector(".vcva-menu-btn");
    var menuList = wrap.querySelector(".vcva-menu-list");
    menuBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var open = menuList.hasAttribute("hidden");
      if (open) {
        menuList.hidden = false;
        menuList.removeAttribute("hidden");
        menuBtn.setAttribute("aria-expanded", "true");
      } else {
        closeMenu(wrap);
      }
    });
    menuList.addEventListener("click", function (ev) {
      var item = ev.target && ev.target.closest ? ev.target.closest(".vcva-menu-item") : null;
      if (!item) return;
      var next = item.getAttribute("data-mode") || "real";
      setPendingMode(wrap, next);
      closeMenu(wrap);
      applyModeAndReload(next);
    });
    document.addEventListener(
      "click",
      function (ev) {
        if (!wrap.contains(ev.target)) closeMenu(wrap);
      },
      true,
    );
    wrap.querySelector(".vcva-exit").addEventListener("click", function () {
      closeBarUi();
    });
    applyChrome(readMode());
    syncBarHeight();
    markBarReady(true);
    try {
      global.addEventListener("resize", syncBarHeight, { passive: true });
    } catch (eR) {}
    return wrap;
  }

  function syncSelect(wrap) {
    setPendingMode(wrap, readMode() || "real");
  }

  function maybeShow(perms) {
    var p = perms && typeof perms === "object" ? perms : global.__VC_STAFF_PERMS || {};
    if ((p.viewAsAllowed || p.isFounder) && hasRealAuthToken()) markAllowed(true);
    if (!isAllowed() && !readMode()) {
      removeLauncher();
      hideBarDom();
      return;
    }
    if (!hasRealAuthToken() && !readMode()) {
      clearAllowedChrome();
      return;
    }
    if (hasRealAuthToken()) markAllowed(true);
    if (isBarOpen()) {
      mountBar();
    } else {
      mountLauncher();
    }
    if (p.viewAsActive && p.viewAs) applyChrome(String(p.viewAs));
    else applyChrome(readMode());
  }

  (function earlyChrome() {
    var mode = readMode();
    global.__VC_VIEW_AS = mode;
    if (!mode) return;
    try {
      var root = document.documentElement;
      root.classList.add("vc-view-as-active", "vc-view-as-bar-on");
      root.style.setProperty("--vc-view-as-bar-h", "3.1rem");
      if (mode === "logout") {
        root.classList.add("vc-view-as-guest");
        root.classList.remove("vc-auth-session-pending");
        try {
          if (typeof global.__vcDiscordRenderLoggedOut === "function") {
            global.__vcDiscordRenderLoggedOut();
          }
        } catch (eLoEarly) {}
      }
      if (mode === "member") root.classList.add("vc-view-as-member");
    } catch (eE) {}
  })();

  installFetchPatch();
  global.VcViewAs = {
    getMode: readMode,
    setMode: writeMode,
    applyHeader: applyHeaderToInit,
    headerName: HEADER,
    show: maybeShow,
    clearAllowed: clearAllowedChrome,
    openBar: function () {
      setBarOpen(true);
      if (isAllowed() || readMode()) mountBar();
    },
    closeBar: closeBarUi,
    isBarOpen: isBarOpen,
    presets: PRESETS,
    isGuestPreview: function () {
      return readMode() === "logout";
    },
    isMemberPreview: function () {
      return readMode() === "member";
    },
    isNonStaffPreview: function () {
      var m = readMode();
      return m === "logout" || m === "member";
    },
  };

  function boot() {
    injectCss();
    if (isAllowed() || readMode()) maybeShow(global.__VC_STAFF_PERMS);
    else applyChrome(readMode());
    enforceGuestChrome();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
  global.addEventListener("vc:staff-access-ok", function (ev) {
    /* violKillAll1: maybeShow fuori dal custom event (era Violation 150ms+) */
    var detail = (ev && ev.detail) || {};
    global.setTimeout(function () {
      try {
        maybeShow(detail.perms || detail || global.__VC_STAFF_PERMS);
      } catch (eShow) {}
      try {
        var m = readMode();
        if (m === "logout" || m === "member") {
          global.__VC_STAFF_MENU_ALLOWED = false;
        }
      } catch (eMenu) {}
    }, 48);
  });
  global.addEventListener("vc:view-as-allowed", function () {
    if (!hasRealAuthToken() && !readMode()) {
      clearAllowedChrome();
      return;
    }
    maybeShow({ viewAsAllowed: true });
    enforceGuestChrome();
  });
  ["vc-discord-login", "vc:access-ok", "vc:profile", "vc:discord-profile", "vc:auth-logout"].forEach(function (evName) {
    try {
      global.addEventListener(evName, function () {
        if (!hasRealAuthToken() && !readMode()) clearAllowedChrome();
        enforceGuestChrome();
      });
    } catch (eEv) {}
  });
  /* swLsStorm2: poll solo se preview/bar class attive — zero Storage a idle */
  try {
    if (!global.__vcViewAsEnforceInterval) {
      global.__vcViewAsEnforceInterval = global.setInterval(function () {
        try {
          var root = document.documentElement;
          if (
            !root.classList.contains("vc-view-as-active") &&
            !root.classList.contains("vc-view-as-bar-on") &&
            !root.classList.contains("vc-view-as-guest")
          ) {
            return;
          }
        } catch (eSkip) {
          return;
        }
        enforceGuestChrome();
      }, 8000);
    }
  } catch (eInt) {}
})(typeof window !== "undefined" ? window : globalThis);

/* violKillAll1 */

