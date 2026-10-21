/* postCurtainLazy1 */
/* 20261021siteOptAll1: yield soft su refresh access post-chrome (INP; look invariato) */
/* 20261021apiPageFilter2: per-path — staff API solo staff/tickets/notif;
   dash API solo dashboard/bacheca; altre pagine = sticky + refresh al menu */
/* 20261021apiPageFilter1: staff/dash access net solo su path che li usano;
   home/legal/cine → sticky subito, refresh dopo chrome-load-done */
(function () {
 /* oauthHashKill1 + oauthHashResumeKill1: cattura subito #access_token
    (anche da session se pwa-resume/view-state l'hanno salvato prima) */
 try {
  var __h0 = String(window.location.hash || "");
  if (!__h0 || (__h0.indexOf("access_token=") === -1 && __h0.indexOf("error=") === -1)) {
   try {
    __h0 = String(sessionStorage.getItem("vc_oauth_hash_capture_v1") || "");
   } catch (eSsCap0) {
    __h0 = "";
   }
  }
  if (__h0 && (__h0.indexOf("access_token=") !== -1 || __h0.indexOf("error=") !== -1)) {
   window.__vcOauthHashCapture = __h0;
   window.__vcOauthCallbackPending = 1;
  }
 } catch (eOauthCap0) {}
 /* oauthPhoneBfcache1: strip cache-bust + se Safari ripristina bfcache post-login → hard reload */
 try {
  var __oaU = new URL(window.location.href);
  if (__oaU.searchParams.has("_vc_oa")) {
   __oaU.searchParams.delete("_vc_oa");
   history.replaceState(
    {},
    document.title,
    __oaU.pathname + (__oaU.search || "") + (__oaU.hash || ""),
   );
  }
 } catch (eOauthStrip) {}
 try {
  window.addEventListener(
   "pageshow",
   function (ev) {
    try {
     if (!(ev && ev.persisted)) return;
     var bust = false;
     try {
      bust =
       sessionStorage.getItem("vc_oauth_bfcache_bust_v1") === "1" ||
       sessionStorage.getItem("vc_oauth_fresh_after_bounce_v1") === "1";
     } catch (eBust) {
      bust = false;
     }
     if (!bust) {
      try {
       var tok =
        typeof window.__vcDiscordRawLocalStorageGetItem === "function"
         ? window.__vcDiscordRawLocalStorageGetItem("vc_discord_access_token")
         : localStorage.getItem("vc_discord_access_token");
       var loggedOutUi = document.documentElement.classList.contains("vc-auth-logged-out");
       var loginBtn = document.getElementById("discord-login-btn");
       var loginVisible =
        loginBtn &&
        !loginBtn.hidden &&
        loginBtn.getAttribute("hidden") == null &&
        loginBtn.offsetParent !== null;
       if (tok && (loggedOutUi || loginVisible) && !document.documentElement.classList.contains("vc-view-as-guest")) {
        bust = true;
       }
      } catch (eTok) {}
     }
     if (!bust) return;
     try {
      sessionStorage.removeItem("vc_oauth_bfcache_bust_v1");
     } catch (eRm) {}
     /* tienifresh_after_bounce per welcome toast sul cold load */
     window.location.reload();
    } catch (ePsOauth) {}
   },
   true,
  );
 } catch (eOauthPs) {}
 var __vcRawStorageGetItem = null;
 try {
 if (!window.__vcViewAsLsTokenPatched) {
 window.__vcViewAsLsTokenPatched = true;
 __vcRawStorageGetItem = Storage.prototype.getItem;
 /* swLsStorm2: cache RAM view_as … ogni get token rileggeva sessionStorage */
 var __vcViewAsMem = { v: "", at: 0 };
 Storage.prototype.getItem = function (key) {
 try {
 if (String(key || "") === "vc_discord_access_token") {
 var now = Date.now();
 var va = __vcViewAsMem.v;
 if (!__vcViewAsMem.at || now - __vcViewAsMem.at > 1500) {
 va = String(__vcRawStorageGetItem.call(sessionStorage, "vc_view_as") || "")
 .trim()
 .toLowerCase();
 __vcViewAsMem.v = va;
 __vcViewAsMem.at = now;
 }
 if (va === "logout") return null;
 } else if (String(key || "") === "vc_view_as") {
 __vcViewAsMem.at = 0;
 }
 } catch (eMask) {}
 return __vcRawStorageGetItem.apply(this, arguments);
 };
 window.__vcDiscordRawLocalStorageGetItem = function (key) {
 return __vcRawStorageGetItem.call(localStorage, key);
 };
 window.__vcInvalidateViewAsMem = function () {
 __vcViewAsMem.at = 0;
 __vcViewAsMem.v = "";
 };
 } else if (typeof window.__vcDiscordRawLocalStorageGetItem === "function") {
 __vcRawStorageGetItem = function (key) {
 return window.__vcDiscordRawLocalStorageGetItem(key);
 };
 }
 } catch (eLsBoot) {}
 try {
 var va = String(sessionStorage.getItem("vc_view_as") || "")
 .trim()
 .toLowerCase();
 if (va && va !== "real" && va !== "none" && va !== "off") {
 document.documentElement.classList.add("vc-view-as-active", "vc-view-as-bar-on");
 document.documentElement.style.setProperty("--vc-view-as-bar-h", "3.1rem");
 if (va === "logout") {
 document.documentElement.classList.add("vc-view-as-guest");
 } else if (va === "member") {
 document.documentElement.classList.add("vc-view-as-member");
 }
 }
 } catch (eVaBoot) {}
 try {
 if (!document.getElementById("vc-view-as-early-css")) {
 var st = document.createElement("style");
 st.id = "vc-view-as-early-css";
 st.textContent =
 "html.vc-view-as-bar-on{--vc-view-as-bar-h:3.1rem}" +
 "html.vc-view-as-bar-on body,html.vc-view-as-bar-on body.vc-body{padding-top:var(--vc-view-as-bar-h)!important;box-sizing:border-box}" +
 "html.vc-view-as-bar-on body>header,html.vc-view-as-bar-on body>header.fixed," +
 "html.vc-view-as-bar-on body>header.top-0,html.vc-view-as-bar-on body>header.fixed.top-0," +
 "html.vc-view-as-bar-on body.vc-body>header,html.vc-view-as-bar-on body.vc-body header.fixed{" +
 "top:var(--vc-view-as-bar-h)!important}" +
 "#vc-view-as-launch{position:relative!important;left:auto!important;right:auto!important;" +
 "top:auto!important;bottom:auto!important;z-index:1!important;flex:0 0 auto;" +
 "display:inline-flex!important;align-items:center;gap:.38rem;border-radius:9999px;" +
 "padding:.32rem .55rem;font:700 .7rem/1 ui-sans-serif,system-ui,Segoe UI,sans-serif;" +
 "letter-spacing:.08em;text-transform:uppercase;color:#f6eadc;" +
 "background:rgba(16,11,8,.42);border:1px solid rgba(212,168,136,.34)}" +
 "#vc-view-as-launch>span{background-image:linear-gradient(115deg,#f7ecdf 0%,#e8c9a8 38%,#d4a888 62%,#c9a07a 100%)!important;" +
 "background-color:transparent!important;-webkit-background-clip:text!important;background-clip:text!important;" +
 "color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}" +
 "#header-quick-actions > #vc-header-promo-btn,#header-quick-actions > .vc-header-promo-btn{order:0!important}" +
 "#header-quick-actions #vc-lang-dropdown,#header-quick-actions .vc-lang-dropdown{order:1!important}" +
 "#header-quick-actions #vc-view-as-launch{order:2!important}" +
 "#header-quick-actions > #vc-notif-dropdown,#header-quick-actions > .vc-notif-dropdown{order:3!important}" +
 "#header-quick-actions > #vc-mobile-nav-toggle{order:4!important}" +
 "#header-quick-actions > #discord-login-btn,#header-quick-actions > #discord-login-state," +
 "#header-quick-actions > .discord-account-menu,#header-quick-actions > .header-login-state{order:5!important}" +
 "html.vc-view-as-guest #discord-login-state,html.vc-view-as-guest .header-login-state," +
 "html.vc-view-as-guest .discord-account-menu,html.vc-view-as-guest .discord-login-row," +
 "html.vc-view-as-guest .discord-profile-link,html.vc-view-as-guest .vc-auth-pending-shell," +
 "html.vc-view-as-guest .vc-auth-early-shell," +
 "html.vc-view-as-guest #vc-notif-dropdown,html.vc-view-as-guest .vc-notif-dropdown," +
 "html.vc-view-as-guest .vc-notif-summary,html.vc-view-as-guest #vc-notif-bell," +
 "html.vc-view-as-guest #vc-notif-bell-inbox,html.vc-view-as-guest .vc-notif-bell" +
 "{display:none!important;visibility:hidden!important}" +
 "html.vc-view-as-guest #discord-login-btn,html.vc-view-as-guest button[data-vc-discord-login]," +
 "html.vc-view-as-guest .vc-discord-login-btn{visibility:visible!important;display:inline-flex!important;pointer-events:auto!important}" +
 "html.vc-view-as-guest.vc-auth-session-pending #discord-login-btn," +
 "html.vc-view-as-guest.vc-auth-session-pending button[data-vc-discord-login]{visibility:visible!important;display:inline-flex!important}" +
 "html.vc-auth-logged-out #vc-notif-dropdown,html.vc-auth-logged-out .vc-notif-dropdown," +
 "html.vc-auth-logged-out .vc-notif-summary,html.vc-auth-logged-out #vc-view-as-launch," +
 "html.vc-auth-logged-out body #header-quick-actions > #vc-notif-dropdown," +
 "html.vc-auth-logged-out body #header-quick-actions > .vc-notif-dropdown," +
 "html.vc-auth-logged-out body #header-quick-actions .vc-notif-summary" +
 "{display:none!important;visibility:hidden!important;pointer-events:none!important;" +
 "width:0!important;height:0!important;min-width:0!important;min-height:0!important;" +
 "opacity:0!important;overflow:hidden!important;flex:0 0 0!important}";
 (document.head || document.documentElement).appendChild(st);
 }
 } catch (eEarlyCss) {}
 try {
 var t = localStorage.getItem("vc_discord_access_token");
 var viewAsLogout = false;
 try {
 viewAsLogout = String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout";
 } catch (eVaLo) {}
 var expBoot = Number(localStorage.getItem("vc_discord_expires_at") || "0");
 if (t && expBoot && Date.now() >= expBoot) {
 try {
 localStorage.removeItem("vc_discord_access_token");
 localStorage.removeItem("vc_discord_expires_at");
 sessionStorage.removeItem("vc_view_as_allowed");
 sessionStorage.removeItem("vc_staff_menu_allowed");
 sessionStorage.removeItem("vc_dash_menu_allowed");
 sessionStorage.removeItem("vc_staff_perms_sticky_v1");
 window.__VC_VIEW_AS_ALLOWED = false;
 window.__VC_STAFF_MENU_ALLOWED = false;
 window.__VC_DASHBOARD_MENU_ALLOWED = false;
 } catch (eExpClr) {}
 t = "";
 }
 if (t && !viewAsLogout) {
 var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
 if (!exp || Date.now() < exp) {
 document.documentElement.classList.add("vc-auth-session-pending");
 document.documentElement.classList.remove("vc-auth-logged-out");
 /* chromeStickyAll1: sticky Staff/Dash/ViewAs subito, prima della rete */
 try {
 if (sessionStorage.getItem("vc_staff_menu_allowed") === "1") {
 window.__VC_STAFF_MENU_ALLOWED = true;
 }
 if (sessionStorage.getItem("vc_dash_menu_allowed") === "1") {
 window.__VC_DASHBOARD_MENU_ALLOWED = true;
 }
 if (sessionStorage.getItem("vc_view_as_allowed") === "1") {
 window.__VC_VIEW_AS_ALLOWED = true;
 }
 } catch (eStickyBoot) {}
 }
 } else if (!viewAsLogout) {
 document.documentElement.classList.add("vc-auth-logged-out");
 document.documentElement.classList.remove("vc-auth-session-pending");
 } else {
 document.documentElement.classList.add("vc-view-as-guest");
 document.documentElement.classList.remove("vc-auth-logged-out");
 }
 } catch (eBootCls) {}
 /* navUserNoFlash1: chip nome+foto da sticky/me-cache subito … mai shell caff… / bordo rotto */
 (function earlyNavUserChip() {
  function esc(s) {
   return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  }
  function paint() {
   try {
    if (String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout") {
     return false;
    }
    var token = String(localStorage.getItem("vc_discord_access_token") || "").trim();
    if (!token) return false;
    var state = document.getElementById("discord-login-state");
    if (!state) return false;
    if (
     state.querySelector(
      ".discord-account-menu .discord-profile-link--chip, .discord-login-row--profile .discord-profile-link--chip",
     )
    ) {
     return true;
    }
    var name = "";
    var av = "";
    var uid = "";
    try {
     var sticky = JSON.parse(localStorage.getItem("vc_server_identity_sticky_v1") || "null");
     if (sticky && String(sticky.fp || "") === token.slice(0, 24)) {
      name = String(sticky.displayName || "").trim();
      av = String(sticky.url || "").trim();
      uid = String(sticky.userId || "").trim();
     }
    } catch (eSt) {}
    try {
     var meRaw =
      sessionStorage.getItem("vc_discord_me_cache_v1") ||
      localStorage.getItem("vc_discord_me_cache_local_v1");
     var me = meRaw ? JSON.parse(meRaw) : null;
     var tokHead = token.slice(0, 32);
     var fp = String((me && me.fp) || "");
     var age = me ? Date.now() - Number(me.at || 0) : Infinity;
     var fpOk =
      me &&
      me.user &&
      isFinite(age) &&
      age >= 0 &&
      age <= 86400000 &&
      (fp.indexOf(tokHead) !== -1 || fp.slice(-24) === token.slice(0, 24) || !fp);
     if (fpOk) {
      if (!uid) uid = String(me.user.id || "").trim();
      if (!name) {
       name = String(
        me.user.global_name || me.user.globalName || me.user.displayName || me.user.username || "",
       ).trim();
      }
      if (!av && me.user.id && me.user.avatar) {
       var ext = String(me.user.avatar).indexOf("a_") === 0 ? "gif" : "png";
       av =
        "https://cdn.discordapp.com/avatars/" +
        me.user.id +
        "/" +
        me.user.avatar +
        "." +
        ext +
        "?size=64";
      }
     }
    } catch (eMe) {}
    if (!name && !av) return false;
    if (!name) name = "Utente";
    try {
     if (av) {
      var warm = new Image();
      warm.decoding = "async";
      try {
       warm.fetchPriority = "high";
      } catch (eFp) {}
      warm.src = av;
     }
    } catch (eWarm) {}
    var label = esc(name);
    state.hidden = false;
    state.innerHTML =
     '<div class="discord-login-row discord-login-row--profile vc-auth-early-shell" data-vc-nav-user-early="1" aria-busy="true">' +
     '<div class="discord-account-menu">' +
     '<button type="button" class="discord-profile-link discord-profile-link--chip" aria-label="Menu account ' +
     label +
     '" aria-haspopup="true">' +
     '<span class="discord-avatar-clip">' +
     '<img class="discord-avatar-img vc-avatar vc-avatar--ready" data-vc-avatar="1" data-vc-nav-early="1"' +
     (uid ? ' data-user-id="' + esc(uid) + '"' : "") +
     (av ? ' src="' + esc(av) + '"' : "") +
     ' alt="" width="34" height="34" decoding="async" fetchpriority="high" aria-label="' +
     label +
     '">' +
     "</span>" +
     '<span class="discord-profile-link__name vc-marquee" data-vc-nav-user-marquee>' +
     '<span class="vc-marquee__track"><span class="vc-marquee__text">' +
     label +
     "</span></span></span></button></div></div>";
    try {
     document.documentElement.classList.add("vc-auth-session-pending");
     document.documentElement.classList.remove("vc-auth-logged-out");
     var loginBtn = document.getElementById("discord-login-btn");
     if (loginBtn) {
      loginBtn.hidden = true;
      loginBtn.style.visibility = "hidden";
      loginBtn.style.pointerEvents = "none";
     }
    } catch (eCls) {}
    return true;
   } catch (ePaint) {
    return false;
   }
  }
  if (paint()) return;
  if (document.readyState === "loading") {
   document.addEventListener(
    "DOMContentLoaded",
    function () {
     paint();
    },
    { once: true },
   );
  } else {
   window.setTimeout(paint, 0);
  }
  try {
   var mo = new MutationObserver(function () {
    if (paint()) {
     try {
      mo.disconnect();
     } catch (eD) {}
    }
   });
   mo.observe(document.documentElement, { childList: true, subtree: true });
   window.setTimeout(function () {
    try {
     mo.disconnect();
    } catch (eD2) {}
   }, 8000);
  } catch (eMo) {}
 })();
 /* megaSplit1: ensureSiteHelperScripts → js/vc-auth-inject.js (before this file) */
 if (!window.__VC_AUTH_INJECT_BOOT) {
  try {
   console.warn("[vc] vc-auth-inject.js missing — load it before discord-auth");
  } catch (eMiss) {}
 }
 (function installVcEnsureDialog() {
 var DIALOG_SRC = "/js/vc-dialog.js?v=20261002compitiScrollUnlock2";
 function ensure() {
 if (window.VcDialog && typeof window.VcDialog.confirm === "function") {
 return Promise.resolve(window.VcDialog);
 }
 if (window.__vcDialogLoading) return window.__vcDialogLoading;
 window.__vcDialogLoading = new Promise(function (resolve, reject) {
 function doneOk() {
 if (window.VcDialog && typeof window.VcDialog.confirm === "function") {
 resolve(window.VcDialog);
 return;
 }
 reject(new Error("VcDialog unavailable"));
 }
 var existing = document.querySelector('script[src*="vc-dialog.js"],script[data-vc-dialog="1"]');
 if (existing) {
 var n = 0;
 (function poll() {
 if (window.VcDialog && typeof window.VcDialog.confirm === "function") return doneOk();
 if (n++ > 120) return reject(new Error("VcDialog timeout"));
 setTimeout(poll, 40);
 })();
 return;
 }
 var s = document.createElement("script");
 s.src = DIALOG_SRC;
 s.setAttribute("data-vc-dialog", "1");
 s.onload = doneOk;
 s.onerror = function () {
 reject(new Error("vc-dialog load failed"));
 };
 (document.head || document.documentElement).appendChild(s);
 }).then(
 function (D) {
 return D;
 },
 function (err) {
 window.__vcDialogLoading = null;
 throw err;
 },
 );
 return window.__vcDialogLoading;
 }
 if (typeof window.__vcEnsureDialog !== "function") {
 window.__vcEnsureDialog = ensure;
 }
 })();
 var ACCESS_TOKEN_KEY = "vc_discord_access_token";
 var EXPIRES_AT_KEY = "vc_discord_expires_at";
 var PENDING_LOGIN_NOTIF_KEY = "vc_pending_login_notification_v1";
 var OAUTH_LOGIN_COUNT_KEY = "vc_discord_oauth_login_count_v1";
 var OAUTH_FRESH_AFTER_BOUNCE_KEY = "vc_oauth_fresh_after_bounce_v1";
 var OAUTH_BFCACHE_BUST_KEY = "vc_oauth_bfcache_bust_v1";
 var OAUTH_STATE_NONCE_KEY = "vc_oauth_state_nonce_v1";
 var SITE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
 var OAUTH_PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";
 var ME_CACHE_KEY = "vc_discord_me_cache_v1";
 var ME_LOCAL_CACHE_KEY = "vc_discord_me_cache_local_v1";
 /* emojiDiscordFast1: session cache pi… lunga = paint istantaneo da cache */
 var ME_SESSION_TTL_MS = 15 * 60 * 1000;
 var ME_LOCAL_TTL_MS = 24 * 60 * 60 * 1000;
 var ME_FRESH_SKIP_FETCH_MS = 90 * 1000;
 var UID_CACHE_KEY = "vc_discord_uid_v1";
 var OAUTH_SCOPES_KEY = "vc_discord_oauth_scopes_v1";
 var OAUTH_ATTEMPTED_NONE_KEY = "vc_oauth_attempted_none_v1";
 var OAUTH_FORCE_CONSENT_KEY = "vc_oauth_force_consent_v1";
 try {
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 } catch (eClrForceBoot) {}
 function cfg() {
 return (typeof window !== "undefined" && window.__VC_AUTH) || {};
 }
 function i18n(key, fallback) {
 try {
 if (window.VcI18n && typeof window.VcI18n.t === "function") {
 var v = window.VcI18n.t(key);
 if (v && v !== key) return v;
 }
 } catch (e) {}
 return fallback;
 }
 var SESSION_OVERLAY_ID = "vc-session-verify-overlay";
 var SESSION_VERIFY_HARD_MS = (function () {
 try {
 if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return 350;
 if (document.documentElement.classList.contains("vc-perf-lite")) return 350;
 } catch (eMs) {}
 return 500;
 })();
 var sessionVerifyWatchdog = null;
 function byId(id) {
 return document.getElementById(id);
 }
 function clearSessionVerifyWatchdog() {
 if (!sessionVerifyWatchdog) return;
 try {
 clearTimeout(sessionVerifyWatchdog);
 } catch (eW) {}
 sessionVerifyWatchdog = null;
 }
 function resetScrollAfterSessionOverlay() {
 try {
 var h = String(location.hash || "").replace(/^#/, "");
 if (h && h.indexOf("access_token=") !== 0) return;
 var y =
 window.pageYOffset ||
 (document.documentElement && document.documentElement.scrollTop) ||
 (document.body && document.body.scrollTop) ||
 0;
 /* scrollStayAll1: non azzerare se l'utente ha gi? scrollato */
 if (y > 8) return;
 window.scrollTo(0, 0);
 if (document.documentElement) document.documentElement.scrollTop = 0;
 if (document.body) document.body.scrollTop = 0;
 } catch (eScr) {}
 }
 function forceUnlockSessionVerifyUi() {
 clearSessionVerifyWatchdog();
 try {
 /* violPass3: skip se gi… unlock … evita lavoro 200ms+ a ogni pageshow */
 if (!document.documentElement.classList.contains("vc-session-verify-pending") && !byId(SESSION_OVERLAY_ID)) {
 return;
 }
 } catch (eSkip) {}
 try {
 document.documentElement.classList.remove("vc-session-verify-pending");
 } catch (e0) {}
 try {
 var el = byId(SESSION_OVERLAY_ID);
 if (el) {
 el.classList.add("vc-session-verify-overlay--hidden");
 el.setAttribute("aria-busy", "false");
 if (el.parentNode) el.parentNode.removeChild(el);
 }
 } catch (e1) {}
 resetScrollAfterSessionOverlay();
 function hideAllLoginBtns() {
 try {
 var nodes = queryDiscordLoginButtons();
 for (var hi = 0; hi < nodes.length; hi += 1) {
 setDiscordLoginBtnVisible(nodes[hi], false);
 }
 } catch (eHide) {}
 }
 if (window.__VC_DISCORD_PROFILE) {
 hideAllLoginBtns();
 return;
 }
 var token = getToken();
 if (token) {
 try {
 var cachedUser = readCachedDiscordMe(token);
 if (cachedUser) {
 renderLoggedIn(cachedUser);
 return;
 }
 renderAuthPendingShell();
 } catch (eTok) {
 renderAuthPendingShell();
 }
 return;
 }
 try {
 var state = byId("discord-login-state");
 if (
 state &&
 (state.querySelector(".vc-auth-pending-shell") ||
 state.querySelector(".vc-auth-early-shell") ||
 state.querySelector(".discord-login-row--profile"))
 ) {
 state.hidden = true;
 state.innerHTML = "";
 }
 var loginBtns = queryDiscordLoginButtons();
 for (var i = 0; i < loginBtns.length; i += 1) {
 setDiscordLoginBtnVisible(loginBtns[i], true);
 }
 } catch (e2) {}
 }
 function armSessionVerifyWatchdog() {
 clearSessionVerifyWatchdog();
 sessionVerifyWatchdog = setTimeout(function () {
 sessionVerifyWatchdog = null;
 forceUnlockSessionVerifyUi();
 }, SESSION_VERIFY_HARD_MS);
 }
 function closeVcNotifDropdown(opts) {
 try {
 opts = opts || {};
 var force = opts.force === true;
 /* notifAutoCloseFix1: non chiudere durante grace post-open (click/pointer spurio). */
 if (!force && Date.now() < Number(window.__vcNotifOpenGraceUntil || 0)) return;
 try {
 if (
 !force &&
 window.VcNotifChrome &&
 typeof window.VcNotifChrome.inOpenGrace === "function" &&
 window.VcNotifChrome.inOpenGrace()
 ) {
 return;
 }
 } catch (eGrace) {}
 /* notifSheetStayOpen1: outside pointer spurio non abbattere sheet/drawer …
    (reclaim portalGuard ? close = loop). force:true per snav/account intenzionali. */
 if (!force) {
 try {
 if (Date.now() < Number(window.__vcNotifPortalGuardUntil || 0)) return;
 } catch (eGuard) {}
 try {
 var rootNotif = document.documentElement;
 if (
 rootNotif &&
 (rootNotif.classList.contains("vc-notif-sheet-open") ||
 rootNotif.classList.contains("vc-notif-drawer-open"))
 ) {
 return;
 }
 } catch (eSheet) {}
 }
 try {
 if (window.VcNotifChrome && typeof window.VcNotifChrome.close === "function") {
 window.VcNotifChrome.close(document.getElementById("vc-notif-dropdown"));
 return;
 }
 } catch (eChrome) {}
 var yKeep =
 typeof window.__vcGetPinnedPageScrollY === "function"
 ? window.__vcGetPinnedPageScrollY()
 : window.pageYOffset || 0;
 var n = document.getElementById("vc-notif-dropdown");
 if (n && n.open) n.open = false;
 document.documentElement.classList.remove(
 "vc-notif-dropdown-open",
 "vc-notif-sheet-open",
 "vc-notif-drawer-open",
 "vc-notif-overlay-active",
 );
 if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
 if (typeof window.__vcHoldPageScroll === "function") window.__vcHoldPageScroll(240);
 else {
 try {
 window.scrollTo(0, yKeep);
 } catch (eScr) {}
 }
 } catch (eN) {}
 }
 function closeVcAccountMenu() {
 try {
 document.documentElement.classList.remove("vc-header-account-open");
 var menu = document.querySelector(".discord-account-menu");
 if (!menu) return;
 var active = document.activeElement;
 if (active && menu.contains(active) && typeof active.blur === "function") active.blur();
 } catch (eA) {}
 }
 function closeVcHeaderSnavDetails() {
 try {
 var list = document.querySelectorAll("header details.vc-snav-details[open], .vc-header-bar details.vc-snav-details[open]");
 for (var i = 0; i < list.length; i += 1) list[i].open = false;
 } catch (eS) {}
 }
 var headerMenusMutexWired = false;
 function ensureHeaderMenusMutex() {
 if (headerMenusMutexWired) return;
 headerMenusMutexWired = true;
 function notifDropdownIsOpen() {
 try {
 var n = document.getElementById("vc-notif-dropdown");
 return Boolean(n && n.open);
 } catch (e) {
 return false;
 }
 }
 document.addEventListener(
 "toggle",
 function (ev) {
 var t = ev.target;
 if (!t || t.id !== "vc-notif-dropdown") return;
 if (t.open) {
 closeVcAccountMenu();
 closeVcHeaderSnavDetails();
 try {
 document.documentElement.classList.add("vc-notif-dropdown-open");
 } catch (e1) {}
 } else {
 try {
 document.documentElement.classList.remove("vc-notif-dropdown-open");
 } catch (e2) {}
 }
 },
 true,
 );
 document.addEventListener(
 "pointerover",
 function (ev) {
 var t = ev.target;
 if (!t || !t.closest) return;
 /* acctTriggerOnly1: apri SOLO dal chip — non da hitbox ghost popover/voci */
 if (t.closest(".discord-account-popover")) return;
 var chip = t.closest(".discord-profile-link");
 if (!chip) return;
 var menu = chip.closest(".discord-account-menu");
 if (!menu) return;
 var related = ev.relatedTarget;
 if (related && menu.contains(related)) return;
 if (notifDropdownIsOpen()) return;
 closeVcHeaderSnavDetails();
 try {
 document.documentElement.classList.add("vc-header-account-open");
 } catch (e3) {}
 kickAccountMenuPopoverAvatar();
 },
 true,
 );
 document.addEventListener(
 "pointerout",
 function (ev) {
 var t = ev.target;
 if (!t || !t.closest) return;
 var menu = t.closest(".discord-account-menu");
 if (!menu) return;
 var related = ev.relatedTarget;
 if (related && menu.contains(related)) return;
 try {
 document.documentElement.classList.remove("vc-header-account-open");
 } catch (e4) {}
 },
 true,
 );
 document.addEventListener(
 "focusin",
 function (ev) {
 var t = ev.target;
 if (!t || !t.closest) return;
 if (!t.closest(".discord-account-menu")) return;
 if (notifDropdownIsOpen()) return;
 closeVcHeaderSnavDetails();
 try {
 document.documentElement.classList.add("vc-header-account-open");
 } catch (e5) {}
 kickAccountMenuPopoverAvatar();
 },
 true,
 );
 document.addEventListener(
 "click",
 function (ev) {
 var t = ev.target;
 if (!t || !t.closest) return;
 var profile = t.closest(".discord-profile-link, .discord-account-menu");
 if (!profile || !profile.closest || !profile.closest(".discord-account-menu")) return;
 if (!notifDropdownIsOpen()) return;
 closeVcNotifDropdown({ force: true });
 try {
 document.documentElement.classList.add("vc-header-account-open");
 } catch (e6) {}
 kickAccountMenuPopoverAvatar();
 },
 true,
 );
 function getHeaderSnavDetails() {
 return document.querySelectorAll(
 "header details.vc-snav-details, .vc-header-bar details.vc-snav-details, nav.vc-header-snav details.vc-snav-details",
 );
 }
 function isHeaderSnavDetails(el) {
 if (!el || String(el.tagName || "").toUpperCase() !== "DETAILS") return false;
 if (!el.classList || !el.classList.contains("vc-snav-details")) return false;
 try {
 if (el.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer, details.vc-mobile-nav-section")) {
 return false;
 }
 } catch (eM) {}
 try {
 return Boolean(el.closest("header, .vc-header-bar, nav.vc-header-snav"));
 } catch (eH) {
 return false;
 }
 }
 function closeOtherHeaderSnav(except) {
 getHeaderSnavDetails().forEach(function (other) {
 if (!isHeaderSnavDetails(other)) return;
 if (other !== except) other.open = false;
 });
 }
 function stampHeaderSnavExclusiveName() {
 getHeaderSnavDetails().forEach(function (d) {
 if (!isHeaderSnavDetails(d)) return;
 try {
 d.setAttribute("name", "vc-header-snav");
 } catch (eN) {}
 });
 }
 stampHeaderSnavExclusiveName();
 try {
 window.__VC_SNAV_EXCLUSIVE = "20260914snavExclusive2";
 var barEl = document.querySelector(".vc-header-bar");
 if (barEl) barEl.setAttribute("data-vc-snav-accordion", "20260914snavExclusive2");
 } catch (eFlag) {}
 function vcNormalizeSnavPath(path) {
 var p = String(path || "/").trim() || "/";
 p = p.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
 if (p.charAt(0) !== "/") p = "/" + p;
 p = p.replace(/\/index\.html$/i, "");
 if (p.length > 1) p = p.replace(/\/+$/, "");
 return p || "/";
 }
 function vcSameSiteHost(hostname) {
 try {
 var a = String(window.location.hostname || "")
 .replace(/^www\./i, "")
 .toLowerCase();
 var b = String(hostname || "")
 .replace(/^www\./i, "")
 .toLowerCase();
 return Boolean(a && b && a === b);
 } catch (eH) {
 return false;
 }
 }
 function vcPathnameFromSnavHref(href) {
 var raw = String(href || "").trim();
 if (!raw || raw.charAt(0) === "#") return "";
 try {
 var u = new URL(raw, window.location.href);
 if (!vcSameSiteHost(u.hostname)) return "";
 return vcNormalizeSnavPath(u.pathname);
 } catch (eP) {
 return "";
 }
 }
 function vcSnavPathScore(hrefPath, cur) {
 if (!hrefPath) return -1;
 if (hrefPath === "/") return cur === "/" ? 10000 : -1;
 if (cur === hrefPath) return 1000 + hrefPath.length;
 if (cur.indexOf(hrefPath + "/") === 0) return 500 + hrefPath.length;
 return -1;
 }
 function markHeaderSnavCurrentFromLocation() {
 var bar = document.querySelector(".vc-header-bar");
 if (!bar) return;
 var cur = vcNormalizeSnavPath(window.location.pathname);
 var isUserProfileDetail = false;
 try {
 if (/^\/users?\/\d{17,22}$/.test(cur)) {
 isUserProfileDetail = true;
 } else if (cur === "/user" || cur === "/users") {
 var q = new URLSearchParams(window.location.search || "");
 isUserProfileDetail = /^\d{17,22}$/.test(
 String(q.get("id") || q.get("userId") || q.get("uid") || "").trim(),
 );
 }
 } catch (e0) {}
 var allRows = bar.querySelectorAll("a.vc-snav-row");
 var allItems = bar.querySelectorAll("a.vc-snav-item");
 allRows.forEach(function (a) {
 a.classList.remove("vc-snav-row--active");
 a.removeAttribute("aria-current");
 });
 allItems.forEach(function (a) {
 a.classList.remove("vc-snav-item--active");
 a.removeAttribute("aria-current");
 });
 bar.querySelectorAll("details.vc-snav-details").forEach(function (d) {
 d.classList.remove("vc-snav-details--current");
 });
 var bestItem = null;
 var bestItemScore = -1;
 allItems.forEach(function (a) {
 var p = vcPathnameFromSnavHref(a.getAttribute("href"));
 if (!p) return;
 if (isUserProfileDetail && (p === "/user" || p === "/users" || p === "/classifiche")) return;
 var score = vcSnavPathScore(p, cur);
 if (score > bestItemScore) {
 bestItemScore = score;
 bestItem = a;
 }
 });
 if (bestItem) {
 bestItem.classList.add("vc-snav-item--active");
 bestItem.setAttribute("aria-current", "page");
 }
 var bestRow = null;
 var bestRowScore = -1;
 allRows.forEach(function (a) {
 var p = vcPathnameFromSnavHref(a.getAttribute("href"));
 if (!p) return;
 if (isUserProfileDetail && (p === "/user" || p === "/users" || p === "/classifiche")) return;
 var score = vcSnavPathScore(p, cur);
 if (score > bestRowScore) {
 bestRowScore = score;
 bestRow = a;
 }
 });
 if (bestRow) {
 bestRow.classList.add("vc-snav-row--active");
 bestRow.setAttribute("aria-current", "page");
 try {
 var det = bestRow.closest("details.vc-snav-details");
 /* feedbackLayout1: /feedback|tickets|recensioni — no parent Richieste --current */
 var rowPath = vcPathnameFromSnavHref(bestRow.getAttribute("href"));
 var skipParent =
 rowPath === "/feedback" ||
 rowPath === "/suggerimenti" ||
 rowPath === "/tickets" ||
 rowPath === "/recensioni";
 if (det && !skipParent) det.classList.add("vc-snav-details--current");
 } catch (eDet) {}
 }
 }
 try {
 window.__vcMarkHeaderSnavCurrent = markHeaderSnavCurrentFromLocation;
 } catch (eEx) {}
 markHeaderSnavCurrentFromLocation();
 document.addEventListener("vc:langchange", function () {
 window.setTimeout(function () {
 try {
 markHeaderSnavCurrentFromLocation();
 } catch (eL) {}
 }, 32);
 });
 window.setTimeout(markHeaderSnavCurrentFromLocation, 0);
 window.setTimeout(markHeaderSnavCurrentFromLocation, 400);
 document.addEventListener(
 "click",
 function (ev) {
 var t = ev.target;
 if (!t || !t.closest) return;
 var sum = t.closest("summary.vc-snav-summary");
 if (!sum) return;
 try {
 if (sum.closest("#vc-mobile-nav-drawer, .vc-mobile-nav-drawer, details.vc-mobile-nav-section")) {
 return;
 }
 } catch (eSkip) {}
 var det = sum.closest("details.vc-snav-details");
 if (!isHeaderSnavDetails(det)) return;
 ev.preventDefault();
 var willOpen = !det.open;
 getHeaderSnavDetails().forEach(function (other) {
 if (!isHeaderSnavDetails(other)) return;
 other.open = willOpen && other === det;
 });
 if (willOpen) {
 closeVcNotifDropdown({ force: true });
 closeVcAccountMenu();
 try {
 if (window.VcI18n && typeof window.VcI18n.closeLangMenu === "function") {
 window.VcI18n.closeLangMenu();
 }
 } catch (eLang) {}
 }
 },
 true,
 );
 document.addEventListener(
 "toggle",
 function (ev) {
 var d = ev.target;
 if (!isHeaderSnavDetails(d) || !d.open) return;
 stampHeaderSnavExclusiveName();
 closeOtherHeaderSnav(d);
 closeVcNotifDropdown({ force: true });
 closeVcAccountMenu();
 },
 true,
 );
 document.addEventListener(
 "pointerdown",
 function (ev) {
 if (typeof ev.button === "number" && ev.button !== 0) return;
 var t = ev.target;
 if (!t || !t.closest) return;
 try {
 if (
 t.closest(
 "#vc-notif-dropdown, .vc-notif-dropdown, .vc-notif-mobile-backdrop, summary.vc-snav-summary, .vc-snav-panel, summary.vc-notif-summary, .vc-notif-panel, .vc-notif-summary, .discord-account-menu, .vc-lang-dropdown, #vc-mobile-nav-drawer, .vc-mobile-nav-drawer, #vc-mobile-nav-toggle, .vc-mobile-nav-toggle",
 )
 ) {
 return;
 }
 } catch (eIn) {
 return;
 }
 var closed = false;
 getHeaderSnavDetails().forEach(function (d) {
 if (!isHeaderSnavDetails(d) || !d.open) return;
 d.open = false;
 closed = true;
 });
 if (notifDropdownIsOpen()) {
 /* notifSheetSync1: outside deve chiudere lo sheet (force) — stayOpen bloccava Esc/vuoto */
 try {
 if (typeof window.requestCloseNotifDropdown === "function") {
 window.requestCloseNotifDropdown(document.getElementById("vc-notif-dropdown"));
 } else if (window.VcNotifChrome && typeof window.VcNotifChrome.close === "function") {
 window.VcNotifChrome.close(document.getElementById("vc-notif-dropdown"));
 } else {
 closeVcNotifDropdown({ force: true });
 }
 } catch (eCloseNotif) {
 closeVcNotifDropdown({ force: true });
 }
 closed = true;
 }
 /* ticketUiPack2: fuori dal menu account → chiudi sempre (prima solo se snav/notif).
    vc-header-account-open sticky faceva apparire il popover “fantasma” lontano dal nome. */
 closeVcAccountMenu();
 },
 true,
 );
 }
 var DISCORD_LOGIN_BTN_SELECTOR = "#discord-login-btn, button[data-vc-discord-login]";
 function queryDiscordLoginButtons() {
 try {
 return document.querySelectorAll(DISCORD_LOGIN_BTN_SELECTOR);
 } catch (e) {
 return [];
 }
 }
 /* persGateOauth1: CTA login dinamici (gate personalizza) … delegation, non solo bind a boot */
 function ensureDiscordLoginClickDelegation() {
 try {
 if (document.documentElement.getAttribute("data-vc-discord-login-delegated") === "1") return;
 document.documentElement.setAttribute("data-vc-discord-login-delegated", "1");
 } catch (eFlag) {
 if (window.__vcDiscordLoginDelegated) return;
 window.__vcDiscordLoginDelegated = true;
 }
 document.addEventListener(
 "click",
 function (ev) {
 try {
 var t = ev && ev.target;
 if (!t || typeof t.closest !== "function") return;
 var btn = t.closest(DISCORD_LOGIN_BTN_SELECTOR);
 if (!btn || btn.disabled) return;
 if (btn.getAttribute("aria-busy") === "true") return;
 if (btn.classList && btn.classList.contains("discord-login-btn--loading")) return;
 if (ev.button != null && ev.button !== 0) return;
 if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
 try {
 ev.preventDefault();
 } catch (ePrev) {}
 /* oauthPromptNone1: click ? prompt=none (silenzioso); se Discord chiede interazione ? consent con return path */
 startDiscordOAuthFromUserGesture(btn, authUrl({ prompt: "none" }));
 } catch (eDel) {}
 },
 true,
 );
 }
 var DISCORD_LOGIN_ICON_HTML =
 '<img class="vc-discord-login-emoji" src="/images/discord-still.png?v=20260929killBrandGifCpu1" width="18" height="18" alt="" decoding="async" aria-hidden="true" />';
 function setDiscordLoginBtnVisible(btn, visible) {
 if (!btn) return;
 try {
 if (visible) {
 btn.hidden = false;
 btn.removeAttribute("hidden");
 btn.classList.remove("vc-discord-login-btn--gone");
 btn.removeAttribute("aria-hidden");
 try {
 btn.style.removeProperty("display");
 } catch (eDispOn) {}
 } else {
 btn.hidden = true;
 btn.setAttribute("hidden", "");
 btn.classList.add("vc-discord-login-btn--gone");
 btn.setAttribute("aria-hidden", "true");
 try {
 btn.style.setProperty("display", "none", "important");
 } catch (eDispOff) {}
 }
 } catch (eVis) {}
 }
 function restoreDiscordLoginButtonVisual(btn) {
 if (!btn) return;
 try {
 btn.classList.remove("discord-login-btn--loading");
 btn.removeAttribute("aria-busy");
 var def = btn.getAttribute("data-vc-login-default-html");
 if (def != null) btn.innerHTML = def;
 } catch (e) {}
 }
 function isNavbarDiscordLoginBtn(btn) {
 if (!btn || !btn.closest) return false;
 try {
 if (btn.classList && btn.classList.contains("vc-auth-required-login")) return false;
 if (btn.closest("#header-quick-actions") || btn.closest("header .vc-nav-shell") || btn.closest("header")) {
 if (btn.id === "discord-login-btn" || btn.hasAttribute("data-vc-discord-login")) {
 if (btn.closest("main") || btn.closest(".vc-auth-required-card")) return false;
 return true;
 }
 }
 if (btn.classList && btn.classList.contains("vc-mobile-nav-footer__login")) return true;
 } catch (e) {}
 return false;
 }
 function ensureNavbarDiscordLoginMarkup(btn) {
 if (!isNavbarDiscordLoginBtn(btn)) return;
 try {
 btn.classList.add("vc-discord-login-btn");
 btn.classList.remove("vc-header-pill");
 var label =
 (window.VcI18n && typeof window.VcI18n.t === "function" && window.VcI18n.t("auth.loginDiscord")) ||
 "Login con Discord";
 if (!label || label === "auth.loginDiscord") label = "Login con Discord";
 var html =
 DISCORD_LOGIN_ICON_HTML +
 '<span data-i18n="auth.loginDiscord">' +
 String(label).replace(/</g, "&lt;") +
 "</span>";
 if (
 !btn.querySelector(".vc-discord-login-emoji") ||
 btn.querySelector(".fa-discord, .vc-discord-login-icon, svg") ||
 !/login con discord|sign in with discord|accedi con discord/i.test(String(btn.textContent || ""))
 ) {
 btn.innerHTML = html;
 } else {
 var emoji = btn.querySelector(".vc-discord-login-emoji");
 if (emoji && String(emoji.getAttribute("src") || "").indexOf("20260908loginGif1") === -1) {
  emoji.setAttribute("src", "/images/discord.gif?v=20260908loginGif1");
 }
}
 btn.setAttribute("data-vc-login-default-html", btn.innerHTML);
 btn.setAttribute("data-vc-discord-login", "");
 btn.removeAttribute("data-i18n");
 } catch (eEns) {}
 }
 function ensureAllNavbarDiscordLoginMarkup() {
 var nodes = queryDiscordLoginButtons();
 for (var i = 0; i < nodes.length; i++) ensureNavbarDiscordLoginMarkup(nodes[i]);
 }
 function sessionPath() {
 return String(location.pathname || "").replace(/\/+$/, "") || "/";
 }
 function isStandalonePwa() {
 try {
 if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
 } catch (e) {}
 try {
 if (window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches) return true;
 } catch (e2) {}
 return Boolean(navigator.standalone);
 }
 function isBlockingSessionVerifyPage() {
 try {
 if (isStandalonePwa()) return false;
 try {
 if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return false;
 } catch (eCoarse) {}
 if (Number(navigator.maxTouchPoints || 0) > 0 && window.innerWidth && window.innerWidth <= 920) return false;
 try {
 if (
 String(sessionStorage.getItem("vc_view_as") || "")
 .trim()
 .toLowerCase() === "logout"
 ) {
 return false;
 }
 } catch (eVa) {}
 if (!window.__VC_REQUIRE_BLOCKING_SESSION_VERIFY) return false;
 var p = sessionPath();
 if (p.indexOf("/dashboard") === 0) return true;
 if (p.indexOf("/staff") === 0) return true;
 /* ticketsBootHang1: tickets non blocking ? evita overlay nero stuck su fetchMe lento */
 if (p === "/tickets" || p.indexOf("/tickets/") === 0) return false;
 if (p.indexOf("/accesso-richiesto") !== -1) return true;
 return false;
 } catch (e) {
 return false;
 }
 }
 function ensureSessionVerifyOverlay() {
 var el = byId(SESSION_OVERLAY_ID);
 if (el) return el;
 el = document.createElement("div");
 el.id = SESSION_OVERLAY_ID;
 el.className = "vc-session-verify-overlay";
 el.setAttribute("role", "status");
 el.setAttribute("aria-live", "polite");
 el.setAttribute("aria-busy", "true");
 el.innerHTML =
 '<div class="vc-session-verify-inner">' +
 '<span class="vc-ul-loading-spinner vc-session-verify-spinner" aria-hidden="true"></span>' +
 '<p class="vc-session-verify-text">Caricamento…</p>' +
 '<p class="vc-session-verify-sub">Un momento…</p>' +
 "</div>";
 document.body.appendChild(el);
 return el;
 }
 function showSessionVerifyOverlay() {
 if (!isBlockingSessionVerifyPage()) {
 forceUnlockSessionVerifyUi();
 return;
 }
 var el = ensureSessionVerifyOverlay();
 try {
 document.documentElement.classList.remove("vc-session-verify-pending");
 } catch (e) {}
 el.classList.remove("vc-session-verify-overlay--hidden");
 el.setAttribute("aria-busy", "true");
 armSessionVerifyWatchdog();
 }
 function hideSessionVerifyOverlay() {
 clearSessionVerifyWatchdog();
 try {
 document.documentElement.classList.remove("vc-session-verify-pending");
 } catch (e0) {}
 var el = byId(SESSION_OVERLAY_ID);
 if (!el) {
 resetScrollAfterSessionOverlay();
 return;
 }
 el.classList.add("vc-session-verify-overlay--hidden");
 el.setAttribute("aria-busy", "false");
 try {
 if (el.parentNode) el.parentNode.removeChild(el);
 } catch (eRm) {}
 resetScrollAfterSessionOverlay();
 }
 function escAttr(s) {
 return String(s || "")
 .replace(/&/g, "&amp;")
 .replace(/"/g, "&quot;")
 .replace(/</g, "&lt;");
 }
 function normalizeReturnPath(stateRaw) {
 var s = String(stateRaw == null ? "" : stateRaw).trim();
 if (!s) return "";
 try {
 s = decodeURIComponent(s);
 } catch (e) {
 return "";
 }
 if (s.indexOf("://") !== -1) return "";
 if (!s.startsWith("/")) return "";
 if (s.startsWith("//")) return "";
 if (s.indexOf("\0") !== -1) return "";
 return s;
 }
 function randomHex(bytes) {
 var b = Math.max(8, Number(bytes) || 16);
 var arr = new Uint8Array(b);
 try {
 if (window.crypto && typeof window.crypto.getRandomValues === "function") {
 window.crypto.getRandomValues(arr);
 } else {
 throw new Error("no_crypto");
 }
 } catch (e) {
 for (var i = 0; i < b; i += 1) arr[i] = Math.floor(Math.random() * 256);
 }
 var out = "";
 for (var j = 0; j < arr.length; j += 1) {
 out += arr[j].toString(16).padStart(2, "0");
 }
 return out;
 }
 function buildOAuthState(path) {
 var returnPath = normalizeReturnPath(path) || "/";
 var nonce = randomHex(16);
 var payload = JSON.stringify({ r: returnPath, n: nonce, t: Date.now() });
 try {
 sessionStorage.setItem(OAUTH_STATE_NONCE_KEY, nonce);
 } catch (e) {}
 try {
 localStorage.setItem(OAUTH_STATE_NONCE_KEY, nonce);
 localStorage.setItem(OAUTH_PENDING_RETURN_KEY, returnPath);
 } catch (eLs) {}
 /* oauthHashKill1: NO encodeURIComponent qui … URLSearchParams.set gi… encoda (evita double-encode) */
 return payload;
 }
 function parseOAuthState(stateRaw) {
 var out = { returnPath: "", validNonce: false };
 var s = String(stateRaw == null ? "" : stateRaw).trim();
 if (!s) return out;
 try {
 var decoded = s;
 try {
 if (/%[0-9A-Fa-f]{2}/.test(s)) decoded = decodeURIComponent(s);
 } catch (eDec) {
 decoded = s;
 }
 /* second decode se ancora percent-encoded (state double-encoded legacy) */
 try {
 if (/%[0-9A-Fa-f]{2}/.test(decoded)) decoded = decodeURIComponent(decoded);
 } catch (eDec2) {}
 var obj = JSON.parse(decoded);
 var rp = normalizeReturnPath(obj && obj.r);
 if (rp) out.returnPath = rp;
 var n = String(obj && obj.n || "").trim();
 var ts = Number(obj && obj.t || 0);
 var expected = "";
 try {
 expected = String(sessionStorage.getItem(OAUTH_STATE_NONCE_KEY) || "").trim();
 sessionStorage.removeItem(OAUTH_STATE_NONCE_KEY);
 } catch (e0) {}
 if (!expected) {
 try {
 expected = String(localStorage.getItem(OAUTH_STATE_NONCE_KEY) || "").trim();
 localStorage.removeItem(OAUTH_STATE_NONCE_KEY);
 } catch (eLsN) {}
 }
 out.validNonce = Boolean(expected) && Boolean(n) && n === expected;
 if (!out.validNonce && !expected && out.returnPath && Number.isFinite(ts) && Math.abs(Date.now() - ts) <= 30 * 60 * 1000) {
 out.validNonce = true;
 }
 /* oauthHashKill1: state con returnPath+ts fresco = ok anche se nonce perso (Safari/ITP) */
 if (!out.validNonce && out.returnPath && Number.isFinite(ts) && Math.abs(Date.now() - ts) <= 30 * 60 * 1000) {
 out.validNonce = true;
 }
 return out;
 } catch (e) {
 out.returnPath = normalizeReturnPath(s);
 return out;
 }
 }
 function currentPathPlusQuery() {
 try {
 var path = String(window.location.pathname || "");
 if (!path) path = "/";
 var q = String(window.location.search || "");
 return path + q;
 } catch (e2) {
 return "/";
 }
 }
 function parseHashToken() {
 var h = "";
 try {
 h = String(window.__vcOauthHashCapture || window.location.hash || "");
 } catch (eH) {
 h = String(window.location.hash || "");
 }
 if (!h || h.indexOf("access_token=") === -1) {
 try {
 h = String(sessionStorage.getItem("vc_oauth_hash_capture_v1") || "");
 } catch (eSsH) {
 h = "";
 }
 }
 if (!h || h.indexOf("access_token=") === -1) {
 return { token: "", freshLogin: false, returnPath: "" };
 }
 var p = new URLSearchParams(h.charAt(0) === "#" ? h.slice(1) : h);
 var t = p.get("access_token");
 var stateParsed = parseOAuthState(p.get("state"));
 var returnPath = stateParsed.returnPath;
 if (!returnPath && t) {
 try {
 returnPath = normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY));
 } catch (eS) {}
 }
 if (!returnPath && t) {
 try {
 returnPath = normalizeReturnPath(localStorage.getItem(OAUTH_PENDING_RETURN_KEY));
 } catch (eS2) {}
 }
 if (!t) return { token: "", freshLogin: false, returnPath: "" };
 if (!stateParsed.validNonce) {
 var pendingReturn = "";
 try {
 pendingReturn = normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY));
 } catch (ePr) {}
 if (!pendingReturn) {
 try {
 pendingReturn = normalizeReturnPath(localStorage.getItem(OAUTH_PENDING_RETURN_KEY));
 } catch (ePr2) {}
 }
 if (pendingReturn) {
 if (!returnPath) returnPath = pendingReturn;
 stateParsed.validNonce = true;
 }
 }
 /* oauthHashKill1: token Discord sul nostro redirect_uri = accetta (state mismatch non butta il login) */
 if (!stateParsed.validNonce && String(t).length >= 16) {
 stateParsed.validNonce = true;
 if (!returnPath) returnPath = "/";
 }
 if (!stateParsed.validNonce) return { token: "", freshLogin: false, returnPath: "", stateMismatch: true };
 try {
 sessionStorage.removeItem(OAUTH_PENDING_RETURN_KEY);
 sessionStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 localStorage.removeItem(OAUTH_PENDING_RETURN_KEY);
 localStorage.removeItem(OAUTH_STATE_NONCE_KEY);
 localStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 /* chromeUiOauthFix1: login reale azzera anteprima View As logout + force-gate */
 sessionStorage.removeItem("vc_view_as");
 sessionStorage.removeItem("vc_force_logged_out_v1");
 /* oauthHashResumeKill1: annulla launch PWA pendente (altrimenti ruba bounce → altra pagina) */
 sessionStorage.removeItem("vc-pwa-launch-pending");
 if (typeof window.__vcInvalidateViewAsMem === "function") window.__vcInvalidateViewAsMem();
 } catch (eR) {}
 try {
 window.__vcOauthHashCapture = "";
 window.__vcOauthCallbackPending = 0;
 } catch (eCapClr) {}
 try {
 sessionStorage.removeItem("vc_oauth_hash_capture_v1");
 } catch (eSsClr) {}
 var expiresInSec = Number(p.get("expires_in") || "0");
 var exp =
 expiresInSec > 0
 ? Date.now() + Math.min(SITE_SESSION_TTL_MS, Math.max(60_000, expiresInSec * 1000))
 : Date.now() + SITE_SESSION_TTL_MS;
 localStorage.setItem(ACCESS_TOKEN_KEY, t);
 localStorage.setItem(EXPIRES_AT_KEY, String(exp));
 syncTokenToServiceWorker(t);
 try {
 var scopeRaw = String(p.get("scope") || "").trim();
 if (scopeRaw) localStorage.setItem(OAUTH_SCOPES_KEY, scopeRaw);
 } catch (eSc) {}
 if (history && history.replaceState) {
 history.replaceState({}, document.title, window.location.pathname + window.location.search);
 }
 return { token: t, freshLogin: true, returnPath: returnPath };
 }
 function isViewAsLogoutPreview() {
 try {
 return String(sessionStorage.getItem("vc_view_as") || "")
 .trim()
 .toLowerCase() === "logout";
 } catch (eVaLo) {
 return false;
 }
 }
 function rawStorageGet(key) {
 try {
 if (typeof window.__vcDiscordRawLocalStorageGetItem === "function") {
 return window.__vcDiscordRawLocalStorageGetItem(key);
 }
 } catch (eR0) {}
 try {
 return localStorage.getItem(key);
 } catch (eR1) {
 return null;
 }
 }
 function getRawToken() {
 var t = "";
 try {
 t = String(rawStorageGet(ACCESS_TOKEN_KEY) || "");
 } catch (eRaw) {
 return "";
 }
 var exp = Number(rawStorageGet(EXPIRES_AT_KEY) || "0");
 if (!t) return "";
 if (exp && Date.now() >= exp) return "";
 return t;
 }
 function getToken() {
 if (isViewAsLogoutPreview()) return "";
 return getRawToken();
 }
 function clearToken() {
 localStorage.removeItem(ACCESS_TOKEN_KEY);
 localStorage.removeItem(EXPIRES_AT_KEY);
 try {
 localStorage.removeItem(OAUTH_SCOPES_KEY);
 sessionStorage.removeItem(ME_CACHE_KEY);
 localStorage.removeItem(ME_LOCAL_CACHE_KEY);
 localStorage.removeItem(UID_CACHE_KEY);
 sessionStorage.removeItem("vc_menu_staff_v1");
 localStorage.removeItem("vc_menu_staff_local_v1");
 sessionStorage.removeItem("vc_menu_dash_v1");
 localStorage.removeItem("vc_menu_dash_local_v1");
 sessionStorage.removeItem("vc_server_avatar_v1");
 sessionStorage.removeItem("vc_server_identity_v1");
 try {
 window.__VC_SERVER_IDENTITY = null;
 window.__VC_DISCORD_PROFILE = null;
 window.__VC_ACCOUNT_MENU_USER = null;
 } catch (eIdClr) {}
 sessionStorage.removeItem("vc_staff_access_ok_v2");
 localStorage.removeItem("vc_staff_access_ok_v2_local");
 sessionStorage.removeItem("vc_staff_menu_allowed");
 sessionStorage.removeItem("vc_staff_perms_sticky_v1");
 sessionStorage.removeItem("vc_dash_menu_allowed");
 sessionStorage.removeItem("vc_dash_access_ok_v1");
 localStorage.removeItem("vc_dash_access_ok_v1");
 sessionStorage.removeItem("vc_view_as_allowed");
 try {
 localStorage.removeItem("vc_server_identity_sticky_v1");
 } catch (eIdSt) {}
 /* logoutGate1: cache pagine gated (rank/personalizza) non devono sopravvivere al logout */
 try {
 localStorage.removeItem("vc_rank_customize_payload_v1");
 localStorage.removeItem("vc_rank_customize_preview_cache_v5");
 sessionStorage.removeItem("vc_rank_customize_preview_cache_v5");
 sessionStorage.setItem("vc_force_logged_out_v1", String(Date.now()));
 } catch (eRankClr) {}
 /* vcStorage1: flush + signal altre tab/PWA */
 try {
  if (window.VcStorage) {
   if (typeof window.VcStorage.flushPending === "function") window.VcStorage.flushPending();
   if (typeof window.VcStorage.broadcast === "function") {
    window.VcStorage.broadcast("vc:auth-cleared", String(Date.now()));
   }
   if (typeof window.VcStorage.remove === "function") {
    window.VcStorage.remove(ME_LOCAL_CACHE_KEY, { scope: "ls", immediate: true });
    window.VcStorage.remove(UID_CACHE_KEY, { scope: "ls", immediate: true });
    window.VcStorage.remove("vc_server_identity_sticky_v1", { scope: "ls", immediate: true });
   }
  }
 } catch (eVsClr) {}
 try {
 window.__VC_STAFF_MENU_ALLOWED = false;
 window.__VC_STAFF_PERMS = null;
 window.__VC_DASHBOARD_MENU_ALLOWED = false;
 window.__VC_HOGWARTS_STAFF_PREVIEW = false;
 window.__VC_VIEW_AS_ALLOWED = false;
 } catch (eClrStaff) {}
 if (window.VcApiCache && typeof window.VcApiCache.invalidatePrefix === "function") {
 ["profile:", "chrome:", "avatar:", "feedback:", "suggestions:", "staff:", "rankPers"].forEach(function (prefix) {
 window.VcApiCache.invalidatePrefix(prefix);
 });
 }
 } catch (eCt) {}
 syncTokenToServiceWorker("");
 }
 try {
 window.__vcDiscordGetAccessToken = getToken;
 window.__vcDiscordGetRealAccessToken = getRawToken;
 window.__vcDiscordIsViewAsLogout = isViewAsLogoutPreview;
 window.__vcDiscordClearToken = clearToken;
 window.__vcDiscordCompleteLogout = completeLogout;
 window.__vcNotifyAuthFailure = notifyAuthFailure;
 window.__vcNotifySessionExpiredToast = notifySessionExpiredToast;
 window.__vcDiscordTokenHasScope = tokenHasOAuthScope;
 window.__vcDiscordGetStoredScopes = getStoredOAuthScopes;
 window.__vcDiscordHasCommandPermissionsScope = hasCommandPermissionsScope;
 window.__vcDiscordReauthorizeForCommandPermissions = reauthorizeForCommandPermissions;
 } catch (eGt) {}
 /* oauthGuildsScope1 exports after fn defs … see boot exports below */
 var __vcLastSwAuthToken = null;
 function syncTokenToServiceWorker(token) {
 try {
 if (!("serviceWorker" in navigator)) return;
 /* swStorageCpu3: in PWA no auth?SW (Cache/Storage CPU) */
 try {
 if (
 window.__VC_PWA_CPU_NUKE ||
 document.documentElement.classList.contains("vc-pwa-cpu-nuke") ||
 (window.VcPerf && typeof window.VcPerf.isStandalonePwa === "function" && window.VcPerf.isStandalonePwa())
 ) {
 return;
 }
 } catch (ePwaAuth) {}
 var t = String(token || "");
 /* swStorageCpu1: no postMessage spam se token uguale */
 if (__vcLastSwAuthToken === t && navigator.serviceWorker.controller) return;
 __vcLastSwAuthToken = t;
 var payload = { type: "vc:sw-auth", token: t };
 if (navigator.serviceWorker.controller) {
 navigator.serviceWorker.controller.postMessage(payload);
 return;
 }
 navigator.serviceWorker.ready
 .then(function () {
 if (navigator.serviceWorker.controller) {
 navigator.serviceWorker.controller.postMessage(payload);
 }
 })
 .catch(function () {});
 } catch (eSw) {}
 }
 try {
 syncTokenToServiceWorker(getToken());
 if ("serviceWorker" in navigator) {
 navigator.serviceWorker.addEventListener("controllerchange", function () {
 syncTokenToServiceWorker(getToken());
 });
 }
 } catch (eBootSw) {}
 function ensureGuildJoinScope(scopeStr) {
 /* oauthGuildsScope1: serve anche "guilds" (lista server), non solo guilds.join */
 var parts = String(scopeStr || "")
 .trim()
 .split(/\s+/)
 .filter(Boolean);
 if (!parts.length) parts = ["identify"];
 var lower = parts.map(function (s) {
 return s.toLowerCase();
 });
 if (lower.indexOf("identify") === -1) parts.unshift("identify");
 if (lower.indexOf("guilds") === -1) parts.push("guilds");
 if (lower.indexOf("guilds.join") === -1) parts.push("guilds.join");
 return parts.join(" ");
 }
 function resolveOAuthScopes() {
 var c = cfg();
 var fromCfg = String(c.scopes || c.oauthScopes || "").trim();
 return ensureGuildJoinScope(fromCfg || "identify guilds");
 }
 function getStoredOAuthScopes() {
 try {
 return String(localStorage.getItem(OAUTH_SCOPES_KEY) || "").trim();
 } catch (e) {
 return "";
 }
 }
 function tokenHasOAuthScope(scopeName) {
 var need = String(scopeName || "").trim().toLowerCase();
 if (!need) return true;
 var stored = getStoredOAuthScopes().toLowerCase();
 if (!stored) return need === "identify";
 return stored.split(/\s+/).indexOf(need) !== -1;
 }
 function resolveOAuthRedirectUri() {
 var c = cfg();
 var fromCfg = String(c.redirectUri || "").trim();
 if (fromCfg) return fromCfg;
 var home = String(c.homeUrl || "").trim();
 if (/^https?:\/\//i.test(home)) return home.endsWith("/") ? home : home + "/";
 try {
 return new URL("/", window.location.origin).href;
 } catch (e) {
 return window.location.origin + "/";
 }
 }
 function resolveOAuthPrompt(options) {
 var opts = options && typeof options === "object" ? options : {};
 var explicit = String(opts.prompt || "").trim().toLowerCase();
 if (explicit === "consent" || explicit === "none" || explicit === "login") return explicit;
 return "none";
 }
 function authUrl(options) {
 var opts = options && typeof options === "object" ? options : {};
 var c = cfg();
 var clientId = String(c.clientId || "").trim();
 if (!clientId) return "";
 var redirect = resolveOAuthRedirectUri();
 var prompt = resolveOAuthPrompt(opts);
 /* oauthPromptNone1: state.r = returnPath esplicito o pending (fallback consent non deve tornare a /) */
 var pathForState = "";
 try {
 pathForState = normalizeReturnPath(opts.returnPath);
 } catch (eRp0) {
 pathForState = "";
 }
 if (!pathForState) {
 try {
 pathForState =
 normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY)) ||
 normalizeReturnPath(localStorage.getItem(OAUTH_PENDING_RETURN_KEY)) ||
 "";
 } catch (eRp1) {
 pathForState = "";
 }
 }
 if (!pathForState) pathForState = currentPathPlusQuery() || "/";
 var q = new URLSearchParams({
 client_id: clientId,
 redirect_uri: redirect,
 response_type: "token",
 scope: String(opts.scopes || resolveOAuthScopes()).trim() || "identify",
 prompt: prompt,
 });
 q.set("state", buildOAuthState(pathForState));
 try {
 if (prompt === "none") {
 sessionStorage.setItem(OAUTH_ATTEMPTED_NONE_KEY, "1");
 localStorage.setItem(OAUTH_ATTEMPTED_NONE_KEY, "1");
 } else {
 sessionStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 localStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 }
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 } catch (ePromptFlag) {}
 return "https://discord.com/oauth2/authorize?" + q.toString();
 }
 function parseOAuthCallbackError() {
 var h = "";
 try {
 h = String(window.__vcOauthHashCapture || window.location.hash || "");
 } catch (eH) {
 h = String(window.location.hash || "");
 }
 if (!h || h.indexOf("error=") === -1) {
 try {
 h = String(sessionStorage.getItem("vc_oauth_hash_capture_v1") || "");
 } catch (eSsErr) {}
 }
 var search = String(window.location.search || "");
 var raw = "";
 if (h.indexOf("error=") !== -1) raw = h.replace(/^#/, "");
 else if (search.indexOf("error=") !== -1) raw = search.replace(/^\?/, "");
 if (!raw) return null;
 var p = new URLSearchParams(raw);
 var err = String(p.get("error") || "").trim().toLowerCase();
 if (!err) return null;
 var stateParsed = parseOAuthState(p.get("state"));
 return {
 error: err,
 description: String(p.get("error_description") || "").trim(),
 returnPath: stateParsed.returnPath || "",
 };
 }
 function clearOAuthCallbackFragment() {
 try {
 if (!(history && history.replaceState)) return;
 var path = String(window.location.pathname || "/");
 var search = String(window.location.search || "");
 if (search && /(?:^|[?&])error=/.test(search)) {
 var sp = new URLSearchParams(search.replace(/^\?/, ""));
 sp.delete("error");
 sp.delete("error_description");
 sp.delete("state");
 var next = sp.toString();
 search = next ? "?" + next : "";
 }
 history.replaceState({}, document.title, path + search);
 } catch (eClr) {}
 }
 function maybeFallbackOAuthConsentFromError() {
 var info = parseOAuthCallbackError();
 if (!info) return false;
 clearOAuthCallbackFragment();
 try {
 window.__vcOauthHashCapture = "";
 } catch (eCapErr) {}
 var attemptedNone = false;
 try {
 attemptedNone =
 sessionStorage.getItem(OAUTH_ATTEMPTED_NONE_KEY) === "1" ||
 localStorage.getItem(OAUTH_ATTEMPTED_NONE_KEY) === "1";
 sessionStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 localStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 } catch (eAtt) {}
 var soft =
 info.error === "login_required" ||
 info.error === "consent_required" ||
 info.error === "interaction_required";
 if (!attemptedNone || !soft) return false;
 var ret =
 normalizeReturnPath(info.returnPath) ||
 normalizeReturnPath(
 (function () {
 try {
 return sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY) || localStorage.getItem(OAUTH_PENDING_RETURN_KEY);
 } catch (eP) {
 return "";
 }
 })(),
 ) ||
 "/";
 try {
 sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, ret);
 localStorage.setItem(OAUTH_PENDING_RETURN_KEY, ret);
 } catch (eSet) {}
 /* oauthPromptNone1: consent con stesso returnPath (niente state.r=/) */
 startDiscordOAuthFromUserGesture(null, authUrl({ prompt: "consent", returnPath: ret }));
 return true;
 }
 var CMD_PERMS_SCOPE = "applications.commands.permissions.update";
 function hasCommandPermissionsScope() {
 return tokenHasOAuthScope(CMD_PERMS_SCOPE);
 }
 function reauthorizeForCommandPermissions(visualBtn) {
 clearToken();
 startDiscordOAuthFromUserGesture(
 visualBtn || null,
 authUrl({
 prompt: "consent",
 scopes: ensureGuildJoinScope("identify guilds " + CMD_PERMS_SCOPE),
 }),
 );
 }
 function reauthorizeForGuildsScope(visualBtn) {
 /* oauthGuildsScope1: force consent con guilds (lista server bacheca/dashboard) */
 clearToken();
 startDiscordOAuthFromUserGesture(
 visualBtn || null,
 authUrl({
 prompt: "consent",
 scopes: ensureGuildJoinScope("identify guilds"),
 }),
 );
 }
 function profileDisplayName(u) {
 try {
 if (window.VcDiscordIdentity && typeof window.VcDiscordIdentity.pickDisplayName === "function") {
 return window.VcDiscordIdentity.pickDisplayName(u, "Utente");
 }
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.pickDisplayName === "function") {
 return window.VcDiscordAvatar.pickDisplayName(u, "Utente");
 }
 } catch (ePick) {}
 return (
 String((u && (u.global_name || u.globalName || u.displayName || u.username)) || "Utente").trim() ||
 "Utente"
 );
 }
 function avatarUrl(u) {
 if (!u || !u.id) return "";
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.buildFromUser === "function") {
 var built = window.VcDiscordAvatar.buildFromUser(u, 64);
 if (built) return built;
 }
 } catch (eBuild) {}
 if (!u.avatar) {
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.defaultEmbedAvatarUrl === "function") {
 return window.VcDiscordAvatar.defaultEmbedAvatarUrl(u.id, 64);
 }
 } catch (eDef) {}
 return "";
 }
 var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
 return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
 }
 function isGuildAvatarSrc(url) {
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.isGuildMemberAvatarPath === "function") {
 return window.VcDiscordAvatar.isGuildMemberAvatarPath(url);
 }
 } catch (eG) {}
 return /\/guilds\/\d+\/users\/\d+\/avatars\//i.test(String(url || ""));
 }
 function hashFromAvatarSrc(url) {
 try {
 var path = String(new URL(String(url || "").trim()).pathname || "");
 var base = path.split("/").pop() || "";
 return base.replace(/\.[a-z0-9]+$/i, "");
 } catch (eH) {
 var m = String(url || "").match(/\/avatars\/([^/?#.]+)/i);
 return m ? m[1] : "";
 }
 }
 function normalizeMenuAvatarSrc(url, user) {
 var raw = String(url || "").trim();
 if (!raw) return avatarUrl(user);
 var guild = isGuildAvatarSrc(raw);
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.resolveUrl === "function") {
 return (
 window.VcDiscordAvatar.resolveUrl(
 raw,
 64,
 guild ? "" : user && user.avatar,
 user && user.id,
 ) || raw
 );
 }
 } catch (eNorm) {}
 return raw;
 }
 function buildMenuAvatarVisual(user, label, size) {
 /* violKill4: display px pu… essere 34/38; CDN size SOLO potenza di 2 */
 var displayPx = Math.max(16, Math.floor(Number(size) || 38));
 var cdnPx = 64;
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.cdnSize === "function") {
 cdnPx = window.VcDiscordAvatar.cdnSize(displayPx);
 }
 } catch (eSz) {
 cdnPx = displayPx <= 32 ? 32 : 64;
 }
 var img = avatarUrl(user);
 var labelEsc = escAttr(label);
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.imgHtml === "function") {
 return window.VcDiscordAvatar.imgHtml({
 url: img,
 userId: user && user.id,
 avatarHash: user && user.avatar,
 size: cdnPx,
 width: displayPx,
 height: displayPx,
 className: "discord-avatar-img vc-avatar",
 loading: "eager",
 fetchPriority: "high",
 alt: "",
 }).replace(' alt=""', ' alt="" aria-label="' + labelEsc + '"');
 }
 } catch (eHub) {}
 var hash = user && user.avatar ? escAttr(String(user.avatar)) : "";
 var coffee = "";
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
 coffee = window.VcDiscordAvatar.siteFallbackAvatarUrl();
 }
 } catch (eC) {}
 if (!coffee) {
 coffee =
 "data:image/svg+xml;charset=utf-8," +
 encodeURIComponent(
 '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="vcCoffeeAvAuth" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#vcCoffeeAvAuth)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>',
 );
 }
 var out = img && !/embed\/avatars/i.test(img) ? img : coffee;
 try {
 if (out && window.VcDiscordAvatar && typeof window.VcDiscordAvatar.normalizeDiscordCdnSize === "function") {
 out = window.VcDiscordAvatar.normalizeDiscordCdnSize(out, cdnPx) || out;
 } else if (out && /[?&]size=\d+/i.test(out)) {
 out = out.replace(/([?&]size=)\d+/i, "$1" + cdnPx);
 }
 } catch (eNormOut) {}
 var hasCdn = out !== coffee;
 /* navUserNoFlash1: in nav usa --ready subito (pending = bg silhouette flash) */
 return (
 '<img class="discord-avatar-img vc-avatar ' +
 (hasCdn ? "vc-avatar--ready" : "vc-avatar--ready vc-avatar-fallback-img") +
 '" data-vc-avatar="1"' +
 (hasCdn ? "" : ' data-vc-avatar-fallback="1"') +
 (hash ? ' data-avatar-hash="' + hash + '"' : "") +
 (user && user.id ? ' data-user-id="' + escAttr(String(user.id)) + '"' : "") +
 ' src="' +
 escAttr(out) +
 '" alt="" width="' +
 displayPx +
 '" height="' +
 displayPx +
 '" decoding="async" fetchpriority="high" aria-label="' +
 labelEsc +
 '">'
 );
 }
 function applyAnimatedAvatarToImg(img, user) {
 if (!img || img.tagName !== "IMG") return;
 try {
 var src = String(img.getAttribute("src") || img.src || "").trim();
 var guild = isGuildAvatarSrc(src) || img.getAttribute("data-vc-guild-avatar") === "1";
 if (!guild) {
 var hash = String((user && user.avatar) || img.getAttribute("data-avatar-hash") || "").trim();
 if (hash && !img.getAttribute("data-avatar-hash")) img.setAttribute("data-avatar-hash", hash);
 } else {
 img.setAttribute("data-vc-guild-avatar", "1");
 }
 try {
 img.removeAttribute("data-vc-avatar-static");
 } catch (eSt) {}
 /* avatarGlowFresh1: se e' gia' guild, non riscrivere con global Discord (revert cache). */
 if (guild && src) {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.applyToImage === "function") {
 window.VcDiscordAvatar.applyToImage(img, { force: false });
 }
 return;
 }
 var next = normalizeMenuAvatarSrc(src, user);
 if (
 img.naturalWidth > 0 &&
 img.dataset.vcAvatarOk === "1" &&
 /\.gif(?:$|[?#])/i.test(String(img.currentSrc || img.src || ""))
 ) {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.applyToImage === "function") {
 window.VcDiscordAvatar.applyToImage(img, { force: false });
 }
 return;
 }
 if (next && next !== img.src) img.src = next;
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.applyToImage === "function") {
 window.VcDiscordAvatar.applyToImage(img, { force: false });
 }
 } catch (eApply) {}
 }
 function refreshAccountMenuAvatars(user, opts) {
 var onlyPopover = opts && opts.onlyPopover;
 var selector = onlyPopover
 ? ".discord-account-popover__avatar img.discord-avatar-img"
 : ".discord-account-menu img.discord-avatar-img";
 var imgs;
 try {
 imgs = document.querySelectorAll(selector);
 } catch (eSel) {
 return;
 }
 for (var i = 0; i < imgs.length; i += 1) {
 applyAnimatedAvatarToImg(imgs[i], user);
 if (
 onlyPopover &&
 window.VcDiscordAvatar &&
 typeof window.VcDiscordAvatar.restartAnimation === "function"
 ) {
 window.VcDiscordAvatar.restartAnimation(imgs[i]);
 }
 }
 }
 function syncAccountPopoverCaret(menuEl) {
 try {
 var menu = menuEl || document.querySelector(".discord-account-menu");
 if (!menu) return;
 var pop = menu.querySelector(".discord-account-popover");
 if (!pop) return;
 var trigger =
 menu.querySelector(".discord-avatar-clip") ||
 menu.querySelector(".discord-account-trigger img, button img, summary img, a img") ||
 menu.querySelector("button, summary, .discord-profile-link, .discord-account-trigger");
 if (!trigger) return;
 var tr = trigger.getBoundingClientRect();
 var pr = pop.getBoundingClientRect();
 if (!(pr.width > 8) || !(tr.width > 0)) return;
 var ox = tr.left + tr.width / 2 - pr.left;
 ox = Math.max(14, Math.min(pr.width - 14, ox));
 pop.style.setProperty("--vc-acct-caret-x", Math.round(ox) + "px");
 } catch (eCaret) {}
 }
 function kickAccountMenuPopoverAvatar() {
  /* violKillVis1: rAF leggero … avatar + caret spezzati (era Violation rAF 200…350ms) */
 if (window.__vcKickAvatarRaf) return;
 window.__vcKickAvatarRaf = window.requestAnimationFrame(function () {
 window.__vcKickAvatarRaf = 0;
 try {
 if (document.hidden) return;
 } catch (eHid) {}
 var user = null;
 try {
 user = window.__VC_ACCOUNT_MENU_USER || null;
 } catch (eUser) {}
 try {
 refreshAccountMenuAvatars(user, { onlyPopover: true });
 } catch (eAv) {}
 window.setTimeout(function () {
 try {
 if (document.hidden) return;
 var menu = document.querySelector(".discord-account-menu");
 if (!menu) return;
 syncAccountPopoverCaret(menu);
 } catch (eC) {}
 }, 0);
 });
 }
 function resolveRankCardApiUrl() {
 var cfgRank = (typeof window !== "undefined" && window.__VC_SITE_RANK_CARD) || {};
 var isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
 var raw = String((isLocal && cfgRank.apiUrlLocal) ? cfgRank.apiUrlLocal : (cfgRank.apiUrl || "")).trim();
 if (raw) return raw;
 return "/webhooks/site-rank-card";
 }
 function menuTokenFp(token) {
 return String(token || "").slice(0, 24);
 }
 function readMenuCache(key, token, maxAgeMs) {
 try {
 var raw = sessionStorage.getItem(key);
 if (!raw) return null;
 var data = JSON.parse(raw);
 if (!data || data.fp !== menuTokenFp(token)) return null;
 if (Date.now() - Number(data.at || 0) > (maxAgeMs || 300000)) return null;
 return data;
 } catch (e) {
 return null;
 }
 }
 function writeMenuCache(key, token, payload) {
 try {
 sessionStorage.setItem(
 key,
 JSON.stringify(Object.assign({}, payload, { fp: menuTokenFp(token), at: Date.now() })),
 );
 } catch (e) {}
 if (key === "vc_menu_dash_v1") {
 try {
 localStorage.setItem(
 "vc_menu_dash_local_v1",
 JSON.stringify(Object.assign({}, payload, { fp: menuTokenFp(token), at: Date.now() })),
 );
 } catch (eLocal) {}
 }
 if (key === "vc_menu_staff_v1") {
 try {
 localStorage.setItem(
 "vc_menu_staff_local_v1",
 JSON.stringify(Object.assign({}, payload, { fp: menuTokenFp(token), at: Date.now() })),
 );
 } catch (eStaffLocal) {}
 }
 }
 function readMenuCacheWithLocal(key, localKey, token, sessionTtlMs, localTtlMs) {
 var fromSession = readMenuCache(key, token, sessionTtlMs);
 if (fromSession) return fromSession;
 try {
 var raw = localStorage.getItem(localKey);
 if (!raw) return null;
 var data = JSON.parse(raw);
 if (!data || data.fp !== menuTokenFp(token)) return null;
 if (Date.now() - Number(data.at || 0) > (localTtlMs || 604800000)) return null;
 return data;
 } catch (eLocal) {
 return null;
 }
 }
 function readGateStaffAllowed(token) {
 try {
 var t = String(token || "").trim();
 if (!t) return null;
 var raw = sessionStorage.getItem("vc_staff_access_ok_v2") || localStorage.getItem("vc_staff_access_ok_v2_local");
 if (!raw) return null;
 var data = JSON.parse(raw);
 if (!data || data.ok !== true) return null;
 var fp = String(data.fp || "");
 if (fp && fp !== menuTokenFp(t) && fp !== discordSessionFingerprint(t)) return null;
 if (Number(data.exp || 0) <= Date.now()) return null;
 return data;
 } catch (e) {
 return null;
 }
 }
 function writeStaffMenuSticky(on) {
 try {
 if (on) sessionStorage.setItem("vc_staff_menu_allowed", "1");
 else sessionStorage.removeItem("vc_staff_menu_allowed");
 } catch (eSt) {}
 try {
 window.__VC_STAFF_MENU_ALLOWED = Boolean(on);
 } catch (eFl) {}
 if (!on) {
 try {
 sessionStorage.removeItem("vc_staff_perms_sticky_v1");
 } catch (ePs) {}
 }
 }
 function readStaffMenuSticky() {
 try {
 if (window.__VC_STAFF_MENU_ALLOWED === true) return true;
 return sessionStorage.getItem("vc_staff_menu_allowed") === "1";
 } catch (eR) {
 return false;
 }
 }
 function writeStaffPermsSticky(perms) {
 try {
 if (!perms || typeof perms !== "object") return;
 sessionStorage.setItem(
 "vc_staff_perms_sticky_v1",
 JSON.stringify({ at: Date.now(), perms: perms }),
 );
 } catch (eW) {}
 }
 function readStaffPermsSticky() {
 try {
 var raw = sessionStorage.getItem("vc_staff_perms_sticky_v1");
 if (!raw) return null;
 var o = JSON.parse(raw);
 if (!o || !o.perms || typeof o.perms !== "object") return null;
 if (Date.now() - Number(o.at || 0) > 86400000) return null;
 return o.perms;
 } catch (eR) {
 return null;
 }
 }
 function writeGateStaffAllowed(token, perms) {
 try {
 var t = String(token || "").trim();
 if (!t) return;
 var now = Date.now();
 var entry = Object.assign({}, perms && typeof perms === "object" ? perms : {}, {
 ok: true,
 allowed: true,
 fp: discordSessionFingerprint(t) || menuTokenFp(t),
 savedAt: now,
 exp: now + 600000,
 });
 sessionStorage.setItem("vc_staff_access_ok_v2", JSON.stringify(entry));
 localStorage.setItem(
 "vc_staff_access_ok_v2_local",
 JSON.stringify(Object.assign({}, entry, { exp: now + 86400000 })),
 );
 writeStaffMenuSticky(true);
 if (perms && typeof perms === "object") writeStaffPermsSticky(perms);
 } catch (eGateW) {}
 }
 function writeDashMenuSticky(on) {
 try {
 if (on) sessionStorage.setItem("vc_dash_menu_allowed", "1");
 else sessionStorage.removeItem("vc_dash_menu_allowed");
 } catch (eD) {}
 try {
 window.__VC_DASHBOARD_MENU_ALLOWED = Boolean(on);
 } catch (eDf) {}
 }
 function readDashMenuSticky() {
 try {
 if (window.__VC_DASHBOARD_MENU_ALLOWED === true) return true;
 return sessionStorage.getItem("vc_dash_menu_allowed") === "1";
 } catch (eR) {
 return false;
 }
 }
 function writeGateDashAllowed(token, access) {
 try {
 var t = String(token || "").trim();
 if (!t) return;
 var now = Date.now();
 var allowed = Boolean(access && access.allowed);
 var entry = {
 ok: allowed,
 allowed: allowed,
 blacklisted: Boolean(access && access.blacklisted),
 fp: discordSessionFingerprint(t) || menuTokenFp(t),
 savedAt: now,
 exp: now + 600000,
 };
 sessionStorage.setItem("vc_dash_access_ok_v1", JSON.stringify(entry));
 localStorage.setItem(
 "vc_dash_access_ok_v1",
 JSON.stringify(Object.assign({}, entry, { exp: now + 86400000 })),
 );
 writeDashMenuSticky(allowed);
 } catch (eGateD) {}
 }
 function readGateDashAllowed(token) {
 try {
 var t = String(token || "").trim();
 if (!t) return null;
 var raw = sessionStorage.getItem("vc_dash_access_ok_v1") || localStorage.getItem("vc_dash_access_ok_v1");
 if (!raw) return null;
 var data = JSON.parse(raw);
 if (!data || !(data.ok === true || data.allowed === true)) return null;
 var fp = String(data.fp || "");
 if (fp && fp !== menuTokenFp(t) && fp !== discordSessionFingerprint(t)) return null;
 if (Number(data.exp || 0) <= Date.now()) return null;
 return { allowed: true, blacklisted: Boolean(data.blacklisted) };
 } catch (e) {
 return null;
 }
 }
 function writeIdentitySticky(token, identity) {
 try {
 var t = String(token || "").trim();
 if (!t || !identity) return;
 if (!identity.avatarUrl && !identity.displayName) return;
 var stickyJson = JSON.stringify({
 fp: menuTokenFp(t),
 at: Date.now(),
 url: String(identity.avatarUrl || "").trim(),
 displayName: String(identity.displayName || "").trim(),
 memberAvatar: String(identity.memberAvatar || "").trim(),
 userId: String(identity.userId || "").trim(),
 });
 if (window.VcStorage && typeof window.VcStorage.set === "function") {
  window.VcStorage.set("vc_server_identity_sticky_v1", stickyJson, {
   scope: "ls",
   immediate: true,
  });
 } else {
  localStorage.setItem("vc_server_identity_sticky_v1", stickyJson);
 }
 } catch (eW) {}
 }
 function readIdentitySticky(token) {
 try {
 var t = String(token || "").trim();
 if (!t) return null;
 var raw =
  window.VcStorage && typeof window.VcStorage.get === "function"
   ? window.VcStorage.get("vc_server_identity_sticky_v1", { scope: "ls" })
   : localStorage.getItem("vc_server_identity_sticky_v1");
 if (!raw) return null;
 var data = JSON.parse(raw);
 if (!data || data.fp !== menuTokenFp(t)) return null;
 if (Date.now() - Number(data.at || 0) > 604800000) return null;
 if (!data.url && !data.displayName) return null;
 return {
 avatarUrl: String(data.url || "").trim(),
 displayName: String(data.displayName || "").trim(),
 memberAvatar: String(data.memberAvatar || "").trim(),
 userId: String(data.userId || "").trim(),
 };
 } catch (eR) {
 return null;
 }
 }
 async function fetchServerIdentity(accessToken, opts) {
 if (window.__VC_DISABLE_RANK_CARD_FETCH === true) return null;
 var token = String(accessToken || "").trim();
 if (!token) return null;
 var force = opts && opts.force === true;
 /* acctNameAvFresh2: identity corta ? avatar guild cambia spesso */
 var idTtl = 20000;
 if (!force) {
 var cached = readMenuCache("vc_server_identity_v1", token, idTtl);
 if (cached && (cached.url || cached.displayName)) {
 return {
 avatarUrl: String(cached.url || "").trim(),
 displayName: String(cached.displayName || "").trim(),
 memberAvatar: String(cached.memberAvatar || "").trim(),
 userId: String(cached.userId || "").trim(),
 };
 }
 /* chromeStickyAll1: sticky 7g se cache corta scaduta */
 var stickyId = readIdentitySticky(token);
 if (stickyId) return stickyId;
 }
 var legacy = force ? null : readMenuCache("vc_server_avatar_v1", token, idTtl);
 var apiUrl =
 resolveRankCardApiUrl() + (resolveRankCardApiUrl().indexOf("?") >= 0 ? "&" : "?") + "avatarOnly=1";
 try {
 var data = {};
 if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
 var cacheKey = window.VcApiCache.keyFor(apiUrl, { scope: "serverIdentity", auth: token });
 if (force) {
 try {
 if (typeof window.VcApiCache.invalidate === "function") window.VcApiCache.invalidate(cacheKey);
 else if (typeof window.VcApiCache.clearKey === "function") window.VcApiCache.clearKey(cacheKey);
 } catch (eInv) {}
 }
 var payload = await window.VcApiCache.fetchWithCache(cacheKey, apiUrl, {
 ttlMs: idTtl,
 staleMs: force ? 0 : 15000,
 persistMs: force ? 0 : 60000,
 forceNetwork: force === true,
 fetchInit: {
 headers: { Authorization: "Bearer " + token },
 cache: "no-store",
 },
 });
 data = (payload && payload.body) || {};
 } else {
 var res = await fetch(apiUrl, {
 headers: { Authorization: "Bearer " + token },
 cache: "no-store",
 });
 if (!res.ok) return legacy && legacy.url ? { avatarUrl: String(legacy.url || "").trim() } : null;
 data = await res.json().catch(function () {
 return {};
 });
 }
 var u = String((data && data.avatarUrl) || "").trim();
 if (!/^https?:\/\//i.test(u)) u = String((legacy && legacy.url) || "").trim();
 var identity = {
 avatarUrl: /^https?:\/\//i.test(u) ? u : "",
 displayName: String((data && data.displayName) || "").trim(),
 memberAvatar: String((data && data.memberAvatar) || "").trim(),
 userId: String((data && data.userId) || "").trim(),
 };
 if (!identity.avatarUrl && !identity.displayName) return null;
 writeMenuCache("vc_server_identity_v1", token, {
 url: identity.avatarUrl,
 displayName: identity.displayName,
 memberAvatar: identity.memberAvatar,
 userId: identity.userId,
 });
 writeIdentitySticky(token, identity);
 if (identity.avatarUrl) writeMenuCache("vc_server_avatar_v1", token, { url: identity.avatarUrl });
 return identity;
 } catch (e) {
 var stickyFail = readIdentitySticky(token);
 if (stickyFail) return stickyFail;
 return legacy && legacy.url ? { avatarUrl: String(legacy.url || "").trim() } : null;
 }
 }
 async function fetchServerAvatarUrl(accessToken) {
 var identity = await fetchServerIdentity(accessToken);
 return identity && identity.avatarUrl ? String(identity.avatarUrl || "") : "";
 }
 function emitServerIdentity(identity) {
 try {
 window.__VC_SERVER_IDENTITY = identity || null;
 window.dispatchEvent(
 new CustomEvent("vc-server-identity", { detail: { identity: identity || null } }),
 );
 } catch (eEmit) {}
 try {
 if (typeof window.__vcMobileNavSyncFooter === "function") window.__vcMobileNavSyncFooter();
 else if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
 } catch (eNav) {}
 }
 function refreshDashInBackground(token) {
 var t = String(token || "").trim();
 if (!t) return;
 /* apiPageFilter2: refresh dash solo path dash/bacheca (o tap menu) */
 if (!pathNeedsDashAccessNet() && !window.__vcMenuAccessForceNet) return;
 if (window.__vcDashPermsRefreshing) return;
 window.__vcDashPermsRefreshing = true;
 var dashUrl = dashboardApiBase() + "/access";
 var finish = function () {
 window.__vcDashPermsRefreshing = false;
 };
 var apply = function (data) {
 if (!data || data.ok !== true) return;
 var out = {
 allowed: Boolean(data.allowed),
 blacklisted: Boolean(data.blacklisted),
 unchecked: false,
 };
 writeMenuCache("vc_menu_dash_v1", t, out);
 writeGateDashAllowed(t, out);
 revealDashboardMenuItem(out);
 };
 try {
 if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
 var dashKey = window.VcApiCache.keyFor(dashUrl, { scope: "dashAccess", auth: t });
 window.VcApiCache
 .fetchWithCache(dashKey, dashUrl, {
 ttlMs: 180000,
 staleMs: 600000,
 persistMs: 604800000,
 forceNetwork: true,
 fetchInit: {
 headers: { Authorization: "Bearer " + t },
 credentials: "same-origin",
 cache: "no-store",
 },
 })
 .then(function (payload) {
 finish();
 apply(payload && payload.body);
 })
 .catch(function () {
 finish();
 });
 return;
 }
 fetch(dashUrl, {
 headers: { Authorization: "Bearer " + t },
 cache: "no-store",
 })
 .then(function (res) {
 return res.ok
 ? res.json().catch(function () {
 return null;
 })
 : null;
 })
 .then(function (data) {
 finish();
 apply(data);
 })
 .catch(function () {
 finish();
 });
 } catch (eBg) {
 finish();
 }
 }
 async function fetchDashboardMenuAccess(token) {
 var t = String(token || "").trim();
 if (!t) return { allowed: false, blacklisted: false, unchecked: true };
 var cached = readMenuCacheWithLocal("vc_menu_dash_v1", "vc_menu_dash_local_v1", t, 180000, 604800000);
 if (cached) {
 var fromCache = {
 allowed: Boolean(cached.allowed),
 blacklisted: Boolean(cached.blacklisted),
 unchecked: false,
 };
 if (fromCache.allowed) writeDashMenuSticky(true);
 writeGateDashAllowed(t, fromCache);
 refreshDashInBackground(t);
 return fromCache;
 }
 var fromGate = readGateDashAllowed(t);
 if (fromGate) {
 writeMenuCache("vc_menu_dash_v1", t, fromGate);
 writeDashMenuSticky(true);
 refreshDashInBackground(t);
 return Object.assign({ unchecked: false }, fromGate);
 }
 if (readDashMenuSticky()) {
 refreshDashInBackground(t);
 return { allowed: true, blacklisted: false, unchecked: false, sticky: true };
 }
 try {
 var dashUrl = dashboardApiBase() + "/access";
 var data = null;
 if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
 var dashKey = window.VcApiCache.keyFor(dashUrl, { scope: "dashAccess", auth: t });
 var payload = await window.VcApiCache.fetchWithCache(dashKey, dashUrl, {
 ttlMs: 180000,
 staleMs: 600000,
 persistMs: 604800000,
 fetchInit: {
 headers: { Authorization: "Bearer " + t },
 credentials: "same-origin",
 cache: "default",
 },
 });
 if (!payload || !payload.ok || !payload.body) {
 if (readDashMenuSticky()) return { allowed: true, blacklisted: false, unchecked: true, sticky: true };
 return { allowed: false, blacklisted: false, unchecked: true };
 }
 data = payload.body;
 } else {
 var res = await fetch(dashUrl, {
 headers: { Authorization: "Bearer " + t },
 cache: "default",
 });
 if (!res.ok) {
 if (readDashMenuSticky()) return { allowed: true, blacklisted: false, unchecked: true, sticky: true };
 return { allowed: false, blacklisted: false, unchecked: true };
 }
 data = await res.json().catch(function () {
 return {};
 });
 }
 if (!data || data.ok !== true) {
 if (readDashMenuSticky()) return { allowed: true, blacklisted: false, unchecked: true, sticky: true };
 return { allowed: false, blacklisted: false, unchecked: true };
 }
 var out = {
 allowed: Boolean(data.allowed),
 blacklisted: Boolean(data.blacklisted),
 unchecked: false,
 };
 writeMenuCache("vc_menu_dash_v1", t, out);
 writeGateDashAllowed(t, out);
 return out;
 } catch (e) {
 if (readDashMenuSticky()) return { allowed: true, blacklisted: false, unchecked: true, sticky: true };
 return { allowed: false, blacklisted: false, unchecked: true };
 }
 }
 async function fetchStaffMenuAccess(token) {
 var t = String(token || "").trim();
 if (!t) {
 try {
 if (sessionStorage.getItem("vc_view_as") || sessionStorage.getItem("vc_view_as_allowed") === "1") {
 t = getRawToken();
 }
 } catch (eVaTok) {}
 }
 if (!t) return false;
 function applyAllowed(payload, writeCache) {
 if (payload && typeof payload === "object") {
 try {
 window.__VC_STAFF_PERMS = payload;
 writeStaffPermsSticky(payload);
 } catch (ePerm) {}
 }
 try {
 if (payload && (payload.viewAsAllowed || payload.isFounder)) {
 window.__VC_VIEW_AS_ALLOWED = true;
 try {
 sessionStorage.setItem("vc_view_as_allowed", "1");
 } catch (eAllowStore) {}
 window.dispatchEvent(new CustomEvent("vc:view-as-allowed"));
 }
 } catch (eVa) {}
 writeStaffMenuSticky(true);
 ensureStaffSiteNavScript();
 if (writeCache) {
 writeMenuCache("vc_menu_staff_v1", t, {
 allowed: true,
 payload: payload && payload.ok && !payload.viewAsActive ? payload : null,
 });
 writeGateStaffAllowed(t, payload && payload.ok && !payload.viewAsActive ? payload : null);
 }
 try {
 if (payload && payload.ok) {
 window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: payload } }));
 } else {
 window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: window.__VC_STAFF_PERMS || {} } }));
 }
 } catch (eEv) {}
 }
 function applyViewAsGuest(payload) {
 try {
 window.__VC_STAFF_PERMS = payload || {};
 writeStaffMenuSticky(false);
 window.__VC_VIEW_AS_ALLOWED = true;
 try {
 sessionStorage.setItem("vc_view_as_allowed", "1");
 } catch (eAllowStore2) {}
 window.dispatchEvent(new CustomEvent("vc:view-as-allowed"));
 window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: payload || {} } }));
 } catch (eG) {}
 try {
 revealStaffMenuItem(false);
 } catch (eHide) {}
 try {
 if (payload && payload.viewAs === "logout" && typeof window.__vcDiscordRenderLoggedOut === "function") {
 window.__vcDiscordRenderLoggedOut();
 }
 } catch (eLo) {}
 try {
 if (payload && payload.viewAs === "logout") {
 if (typeof window.__vcPushDetachForLogout === "function") {
 window.__vcPushDetachForLogout();
 } else {
 window.dispatchEvent(new CustomEvent("vc:push-detach", { detail: { reason: "view-as-logout" } }));
 }
 window.dispatchEvent(new CustomEvent("vc:view-as-changed", { detail: { viewAs: "logout" } }));
 }
 } catch (ePushVa) {}
 }
 function applyViewAsRole(payload) {
 try {
 window.__VC_STAFF_PERMS = payload || {};
 window.__VC_VIEW_AS_ALLOWED = true;
 try {
 sessionStorage.setItem("vc_view_as_allowed", "1");
 } catch (eA) {}
 var menuOn = Boolean(payload && payload.ok && payload.staffMenu !== false);
 writeStaffMenuSticky(menuOn);
 if (menuOn) ensureStaffSiteNavScript();
 revealStaffMenuItem(menuOn);
 window.dispatchEvent(new CustomEvent("vc:view-as-allowed"));
 window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: payload || {} } }));
 if (window.VcViewAs && typeof window.VcViewAs.show === "function") {
 window.VcViewAs.show(payload);
 }
 } catch (eRole) {}
 }
 function refreshPermsInBackground() {
 /* apiPageFilter2: refresh staff solo path staff/tickets/notif (o tap menu) */
 if (!pathNeedsStaffAccessNet() && !window.__vcMenuAccessForceNet) return;
 var refreshNow = Date.now();
 if (window.__vcStaffPermsBlockedUntil && refreshNow < window.__vcStaffPermsBlockedUntil) return;
 if (
 window.__vcStaffPermsRefreshAt &&
 refreshNow - window.__vcStaffPermsRefreshAt < 60000 &&
 window.__vcStaffPermsRefreshing
 ) {
 return;
 }
 if (window.__vcStaffPermsRefreshing) return;
 window.__vcStaffPermsRefreshing = true;
 window.__vcStaffPermsRefreshAt = refreshNow;
 var apiUrl = staffApiBase();
 var headers = { Authorization: "Bearer " + t };
 try {
 if (window.VcViewAs && typeof window.VcViewAs.applyHeader === "function") {
 headers = window.VcViewAs.applyHeader({ headers: headers }).headers;
 if (headers && typeof headers.forEach === "function") {
 var plain = {};
 headers.forEach(function (v, k) {
 plain[k] = v;
 });
 headers = plain;
 }
 } else if (sessionStorage.getItem("vc_view_as")) {
 headers["X-VC-View-As"] = String(sessionStorage.getItem("vc_view_as") || "");
 }
 } catch (eHdr) {}
 function finishStaffRefresh() {
 window.__vcStaffPermsRefreshing = false;
 }
 function handleStaffPayload(data, fromNetwork) {
 if (data && data.viewAsActive && (data.viewAs === "logout" || data.viewAs === "member")) {
 applyViewAsGuest(data);
 return;
 }
 if (data && data.viewAsActive && data.viewAs) {
 applyViewAsRole(data);
 return;
 }
 if (data && data.ok === true) {
 applyAllowed(data, !(data && data.viewAsActive));
 return;
 }
 if (data && data.ok === false) {
 /* authDiscordSticky1: deny transient Discord (timeout/member_fetch) NON deve
    azzerare Staff mentre View As resta sticky ? Staff sparisce, Anteprima no */
 var denyErr = String((data && data.error) || "")
 .trim()
 .toLowerCase();
 var denySt = Number((data && data.status) || 0) || 0;
 var transientDeny =
 denySt === 429 ||
 denySt === 408 ||
 denySt >= 500 ||
 /^(discord_timeout|discord_unreachable|guild_unavailable|member_fetch_failed|member_unavailable|misconfigured|upstream|timeout|internal)$/.test(
 denyErr,
 );
 if (transientDeny) {
 try {
 var gateKeep = readGateStaffAllowed(t);
 if (gateKeep || window.__VC_STAFF_MENU_ALLOWED === true) {
 applyAllowed(
 (gateKeep && typeof gateKeep === "object" ? gateKeep : null) ||
 window.__VC_STAFF_PERMS ||
 null,
 false,
 );
 }
 } catch (eKeep) {}
 return;
 }
 try {
 writeStaffMenuSticky(false);
 writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
 sessionStorage.removeItem("vc_staff_access_ok_v2");
 localStorage.removeItem("vc_staff_access_ok_v2_local");
 /* deny definitivo: togli anche sticky View As (altrimenti Anteprima senza Staff) */
 sessionStorage.removeItem("vc_view_as_allowed");
 window.__VC_VIEW_AS_ALLOWED = false;
 } catch (eDeny) {}
 try {
 revealStaffMenuItem(false);
 } catch (eHideStaff) {}
 try {
 if (typeof window.__vcTeardownStaffSiteNav === "function") {
 window.__vcTeardownStaffSiteNav();
 }
 } catch (eTear) {}
 }
 }
 function onStaffHttp(res, body) {
 if (res && res.status === 429) {
 window.__vcStaffPermsBlockedUntil = Date.now() + 90000;
 try {
 if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
 window.VcApiCache.noteWebhook429(0, apiUrl);
 }
 } catch (e429) {}
 return null;
 }
 if (res && res.ok && body && (body.ok || body.viewAsActive)) return body;
 if (res && (res.status === 401 || res.status === 403)) {
 try {
 writeStaffMenuSticky(false);
 writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
 sessionStorage.removeItem("vc_staff_access_ok_v2");
 localStorage.removeItem("vc_staff_access_ok_v2_local");
 sessionStorage.removeItem("vc_view_as_allowed");
 window.__VC_VIEW_AS_ALLOWED = false;
 } catch (eDeny2) {}
 try {
 revealStaffMenuItem(false);
 } catch (eHide2) {}
 try {
 if (typeof window.__vcTeardownStaffSiteNav === "function") {
 window.__vcTeardownStaffSiteNav();
 }
 } catch (eTear2) {}
 }
 return null;
 }
 if (window.VcApiCache && typeof window.VcApiCache.fetchStaffJson === "function") {
 window.VcApiCache
 .fetchStaffJson(apiUrl, { headers: headers, ttlMs: 45000, staleMs: 600000 })
 .then(function (out) {
 finishStaffRefresh();
 if (out && out.res && out.res.status === 429) {
 window.__vcStaffPermsBlockedUntil = Date.now() + 90000;
 return;
 }
 handleStaffPayload(out && out.data ? out.data : null, true);
 })
 .catch(function () {
 finishStaffRefresh();
 });
 return;
 }
 var pref = window.__VC_STAFF_ACCESS_PREFETCH;
 var req =
 pref && typeof pref.then === "function"
 ? Promise.resolve(pref)
 : fetch(apiUrl, {
 headers: headers,
 cache: "no-store",
 }).then(function (res) {
 return res
 .json()
 .catch(function () {
 return {};
 })
 .then(function (body) {
 return onStaffHttp(res, body);
 });
 });
 Promise.resolve(req)
 .then(function (data) {
 finishStaffRefresh();
 handleStaffPayload(data, true);
 })
 .catch(function () {
 finishStaffRefresh();
 });
 }
 var viewAsModeClient = "";
 try {
 viewAsModeClient = String(sessionStorage.getItem("vc_view_as") || "").trim();
 } catch (eVaMode) {}
 if (!viewAsModeClient) {
 var cached = readMenuCacheWithLocal("vc_menu_staff_v1", "vc_menu_staff_local_v1", t, 600000, 86400000);
 if (cached && cached.allowed) {
 applyAllowed(cached.payload || null, false);
 refreshPermsInBackground();
 return true;
 }
 var gateBlob = readGateStaffAllowed(t);
 if (gateBlob || window.__VC_STAFF_MENU_ALLOWED === true || readStaffMenuSticky()) {
 applyAllowed(
 (gateBlob && typeof gateBlob === "object" ? gateBlob : null) || window.__VC_STAFF_PERMS || null,
 false,
 );
 refreshPermsInBackground();
 return true;
 }
 }
 var pref = window.__VC_STAFF_ACCESS_PREFETCH;
 if (pref && typeof pref.then === "function") {
 try {
 var preData = await Promise.resolve(pref);
 if (preData && preData.viewAsActive && (preData.viewAs === "logout" || preData.viewAs === "member")) {
 applyViewAsGuest(preData);
 return false;
 }
 if (preData && preData.viewAsActive && preData.viewAs) {
 applyViewAsRole(preData);
 return Boolean(preData.ok);
 }
 if (preData && preData.ok === true) {
 applyAllowed(preData, !(preData && preData.viewAsActive));
 return true;
 }
 } catch (ePref) {}
 }
 try {
 var staffHeaders = { Authorization: "Bearer " + t };
 try {
 if (window.VcViewAs && typeof window.VcViewAs.applyHeader === "function") {
 var patched = window.VcViewAs.applyHeader({ headers: staffHeaders });
 staffHeaders = patched.headers;
 if (staffHeaders && typeof staffHeaders.forEach === "function") {
 var plainH = {};
 staffHeaders.forEach(function (v, k) {
 plainH[k] = v;
 });
 staffHeaders = plainH;
 }
 } else if (sessionStorage.getItem("vc_view_as")) {
 staffHeaders["X-VC-View-As"] = String(sessionStorage.getItem("vc_view_as") || "");
 }
 } catch (eSh) {}
 var res = await fetch(staffApiBase(), {
 headers: staffHeaders,
 cache: "no-store",
 });
 if (!res.ok) return false;
 var data = await res.json().catch(function () {
 return {};
 });
 if (data && data.viewAsActive && (data.viewAs === "logout" || data.viewAs === "member")) {
 applyViewAsGuest(data);
 return false;
 }
 if (data && data.viewAsActive && data.viewAs) {
 applyViewAsRole(data);
 return Boolean(data.ok);
 }
 var allowed = Boolean(data && data.ok === true);
 if (allowed) applyAllowed(data, !(data && data.viewAsActive));
 else writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
 return allowed;
 } catch (e) {
 return false;
 }
 }
 function ensureStaffSiteNavScript() {
 /* staffNavKill1: mai caricare stamp vecchi che reiniettano Staff in nav/footer */
 var STAFF_NAV_VER = "20261017staffNavKill1";
 var STAFF_NAV_SRC = "/js/staff-site-nav." + STAFF_NAV_VER + ".js?v=" + STAFF_NAV_VER;
 try {
 var existing =
 document.querySelector('script[data-vc-staff-site-nav="1"]') ||
 document.querySelector('script[src*="staff-site-nav.js"]');
 if (existing) {
 var src = String(existing.getAttribute("src") || "");
 var stale =
 src.indexOf(STAFF_NAV_VER) < 0 ||
 /footerStaffPhoneGap|navStaffFirstStamp|staffStickyFast/i.test(src);
 if (!stale) {
 window.__vcStaffSiteNavRequested = true;
 if (window.__VC_STAFF_MENU_ALLOWED && !window.__vcStaffNavWarmEvented) {
 window.__vcStaffNavWarmEvented = true;
 try {
 window.dispatchEvent(
 new CustomEvent("vc:staff-access-ok", { detail: { perms: window.__VC_STAFF_PERMS || {} } }),
 );
 } catch (eBoot) {}
 }
 return;
 }
 try {
 if (existing.parentNode) existing.parentNode.removeChild(existing);
 } catch (eRmOld) {}
 window.__vcStaffSiteNavRequested = false;
 }
 } catch (eQ) {}
 if (window.__vcStaffSiteNavRequested) return;
 window.__vcStaffSiteNavRequested = true;
 try {
 var s = document.createElement("script");
 s.src = STAFF_NAV_SRC;
 s.async = false;
 s.setAttribute("data-vc-staff-site-nav", "1");
 s.setAttribute("data-vc", "staffNavKill1");
 (document.head || document.documentElement).appendChild(s);
 } catch (eNav) {}
 }
 function warmDashboardNavEarly() {
 try {
 var t = getToken();
 if (!t) return false;
 if (window.__VC_DASHBOARD_MENU_BLACKLISTED === true) return false;
 if (window.__VC_DASHBOARD_MENU_ALLOWED === true || window.__VC_DASHBOARD_ACCESS_OK === true) {
 if (readDashMenuSticky()) writeDashMenuSticky(true);
 return true;
 }
 var cached = readMenuCacheWithLocal("vc_menu_dash_v1", "vc_menu_dash_local_v1", t, 180000, 604800000);
 var gate = readGateDashAllowed(t);
 var sticky = readDashMenuSticky();
 var access = null;
 if (cached) {
 access = { allowed: Boolean(cached.allowed), blacklisted: Boolean(cached.blacklisted) };
 } else if (gate) {
 access = gate;
 } else if (sticky) {
 access = { allowed: true, blacklisted: false };
 }
 if (!access) return false;
 if (access.allowed) writeDashMenuSticky(true);
 revealDashboardMenuItem(access);
 return Boolean(access.allowed);
 } catch (eWarmDash) {
 return false;
 }
 }
 function warmStaffNavEarly() {
 try {
 try {
 if (sessionStorage.getItem("vc_view_as")) return false;
 } catch (eVaEarly) {}
 var t = getToken();
 if (!t) return false;
 var cached = readMenuCacheWithLocal("vc_menu_staff_v1", "vc_menu_staff_local_v1", t, 600000, 86400000);
 var gate = readGateStaffAllowed(t);
 var sticky = readStaffMenuSticky();
 var already = window.__VC_STAFF_MENU_ALLOWED === true;
 /* staffStickyFast1: sticky semplice basta per montare Staff subito (ruoli via refresh) */
 if (!(cached && cached.allowed) && !gate && !already && !sticky) return false;
 var payload =
 (cached && cached.payload) ||
 (gate && typeof gate === "object" ? gate : null) ||
 window.__VC_STAFF_PERMS ||
 readStaffPermsSticky() ||
 null;
 if (payload) {
 try {
 window.__VC_STAFF_PERMS = payload;
 writeStaffPermsSticky(payload);
 } catch (eP) {}
 }
 writeStaffMenuSticky(true);
 ensureStaffSiteNavScript();
 try {
 window.dispatchEvent(new CustomEvent("vc:staff-access-ok", { detail: { perms: payload || {} } }));
 } catch (eEv) {}
 return true;
 } catch (eWarm) {
 return false;
 }
 }
 function readCachedDiscordUid(token) {
 var fp = discordSessionFingerprint(token);
 if (!String(token || "").trim() || fp.length < 3) return "";
 try {
 var raw = localStorage.getItem(UID_CACHE_KEY);
 if (!raw) return "";
 var o = JSON.parse(raw);
 if (!o || o.v !== 1 || String(o.fp || "") !== fp) return "";
 var uid = String(o.uid || "").trim();
 return /^\d{17,22}$/.test(uid) ? uid : "";
 } catch (eUid) {
 return "";
 }
 }
 function resolveAccountUserId(userId) {
 var id = String(userId || "").trim();
 if (/^\d{17,22}$/.test(id)) return id;
 try {
 var profile = window.__VC_DISCORD_PROFILE;
 var fromProfile = String(profile && profile.id || "").trim();
 if (/^\d{17,22}$/.test(fromProfile)) return fromProfile;
 } catch (eP) {}
 try {
 var menuUser = window.__VC_ACCOUNT_MENU_USER;
 var fromMenu = String(menuUser && menuUser.id || "").trim();
 if (/^\d{17,22}$/.test(fromMenu)) return fromMenu;
 } catch (eMenu) {}
 try {
 var cached = readCachedDiscordMe(getToken());
 var fromCache = String(cached && cached.id || "").trim();
 if (/^\d{17,22}$/.test(fromCache)) return fromCache;
 } catch (eCache) {}
 try {
 var fromUid = readCachedDiscordUid(getToken());
 if (/^\d{17,22}$/.test(fromUid)) return fromUid;
 } catch (eUid) {}
 try {
 var rawUid = localStorage.getItem(UID_CACHE_KEY);
 if (rawUid) {
 var uo = JSON.parse(rawUid);
 var loose = String(uo && uo.uid || "").trim();
 if (/^\d{17,22}$/.test(loose)) return loose;
 }
 } catch (eLoose) {}
 return "";
 }
 function profileHref(userId) {
 try {
 if (isDashboardContextPath()) {
 var siteDash = {};
 try {
 siteDash = window.__VC_SITE_DASHBOARD || {};
 } catch (eDashCfg) {}
 var dashProf = String(siteDash.profilePageUrl || "/dashboard/profilo/").trim() || "/dashboard/profilo/";
 if (!dashProf.endsWith("/")) dashProf += "/";
 return dashProf;
 }
 } catch (eDashProf) {}
 var id = resolveAccountUserId(userId);
 /* profileHrefNoLeaderboard1: mai classifica /user senza id */
 return id ? "/user/?id=" + encodeURIComponent(id) : "#";
 }
 function isOwnProfileCurrent(userId) {
 var id = resolveAccountUserId(userId);
 if (!id) return false;
 try {
 var path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
 if (path === "/personalizza" || path === "/user/personalizza" || path === "/user/customize" || path === "/user/custom") return false;
 var q = new URLSearchParams(window.location.search || "");
 var qid = String(q.get("id") || q.get("userId") || q.get("uid") || "").trim();
 if (qid === id && (path === "/user" || path === "/users")) return true;
 var m = String(window.location.pathname || "").match(/^\/users?\/(\d{17,22})(?:\/|$)/i);
 if (m && String(m[1]) === id) return true;
 } catch (e) {}
 return false;
 }
 function dashboardPageHref() {
 var raw = String(cfg().dashboardUrl || "/dashboard/").trim() || "/dashboard/";
 if (!raw.endsWith("/")) raw += "/";
 return raw;
 }
 function staffPageHref(userId) {
 var id = resolveAccountUserId(userId);
 /* classificheRename1: senza id non mandare alla board /user bare */
 return id ? "/user/?id=" + encodeURIComponent(id) : "#";
 }
 function staffApiBase() {
 var isLocal = false;
 try {
 isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
 } catch (e) {}
 var staffCfg = {};
 try {
 staffCfg = window.__VC_STAFF_ACCESS || {};
 } catch (e2) {}
 var raw = String(
 isLocal && staffCfg.apiUrlLocal ? staffCfg.apiUrlLocal : staffCfg.apiUrl || "",
 ).trim();
 return raw.replace(/\/+$/, "") || "/webhooks/site-staff-access";
 }
 function dashboardApiBase() {
 var c = cfg();
 var isLocal = false;
 try {
 isLocal = /^(localhost|127\.0\.0\.1)$/i.test(String(window.location.hostname || ""));
 } catch (e) {}
 var siteDash = {};
 try {
 siteDash = window.__VC_SITE_DASHBOARD || {};
 } catch (e2) {}
 var raw = String(
 isLocal && (c.dashboardApiUrlLocal || siteDash.apiUrlLocal)
 ? c.dashboardApiUrlLocal || siteDash.apiUrlLocal
 : c.dashboardApiUrl || siteDash.apiUrl || "",
 ).trim();
 return raw.replace(/\/+$/, "") || "/webhooks/site-dashboard";
 }
 function isStaffContextPath() {
 try {
 var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
 return p === "/staff" || p.indexOf("/staff/") === 0;
 } catch (e) {
 return false;
 }
 }
 function isStaffAreaContextPath() {
 try {
 var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
 if (p === "/staff/profilo" || p.indexOf("/staff/profilo/") === 0) return false;
 if (p === "/staff/accesso-richiesto" || p.indexOf("/staff/accesso-richiesto/") === 0) return false;
 return p === "/staff" || p.indexOf("/staff/") === 0;
 } catch (e) {
 return false;
 }
 }
 function isDashboardContextPath() {
 try {
 var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
 if (p === "/dashboard/profilo" || p.indexOf("/dashboard/profilo/") === 0) return false;
 if (p === "/dashboard/transcript" || p.indexOf("/dashboard/transcript/") === 0) return false;
 return p === "/dashboard" || p.indexOf("/dashboard/") === 0;
 } catch (e) {
 return false;
 }
 }
 /* apiPageFilter2: famiglie path → API dedicate (ogni pagina solo le sue). */
 function pathNeedsStaffAccessNet() {
 try {
 var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
 if (p === "/staff" || p.indexOf("/staff/") === 0) return true;
 if (p === "/tickets" || p.indexOf("/tickets/") === 0) return true;
 if (p === "/notifications") return true;
 if (p === "/candidature" || p.indexOf("/candidature/") === 0) return true;
 if (p === "/appelli" || p.indexOf("/appelli/") === 0) return true;
 return false;
 } catch (eSt) {
 return false;
 }
 }
 function pathNeedsDashAccessNet() {
 try {
 var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
 if (p === "/dashboard" || p.indexOf("/dashboard/") === 0) return true;
 if (p === "/bacheca" || p.indexOf("/bacheca/") === 0) return true;
 return false;
 } catch (eDa) {
 return false;
 }
 }
 function runDashAccessNet(token) {
 var t = String(token || "").trim();
 if (!t) return;
 fetchDashboardMenuAccess(t).then(function (allowed) {
 /* chromeStickyAll1: rete ko ? non togliere Dashboard se sticky */
 if (allowed && allowed.unchecked && !allowed.allowed && !readDashMenuSticky()) {
 return;
 }
 if ((!allowed || !allowed.allowed) && readDashMenuSticky() && allowed && allowed.unchecked) {
 revealDashboardMenuItem({ allowed: true, blacklisted: false, unchecked: true });
 return;
 }
 if (allowed && allowed.allowed === false && allowed.unchecked === false) {
 writeDashMenuSticky(false);
 }
 revealDashboardMenuItem(allowed);
 });
 }
 function runStaffAccessNet(token) {
 var t = String(token || "").trim();
 if (!t) return;
 fetchStaffMenuAccess(t).then(function (allowed) {
 /* staffStickyFast1: rete ko / transient ? non smontare se sticky ancora valida */
 if (allowed || readStaffMenuSticky()) {
 revealStaffMenuItem(true);
 try {
 ensureStaffSiteNavScript();
 } catch (eEns) {}
 } else {
 revealStaffMenuItem(false);
 }
 });
 }
 function runMenuAccessNet(token) {
 runDashAccessNet(token);
 runStaffAccessNet(token);
 }
 function armMenuAccessNetOnAccountOpen(token) {
 var t = String(token || "").trim();
 if (!t || window.__vcMenuAccessOpenArmed) return;
 window.__vcMenuAccessOpenArmed = 1;
 function kick() {
 if (window.__vcMenuAccessOpenDone) return;
 window.__vcMenuAccessOpenDone = 1;
 try {
 window.__vcMenuAccessForceNet = 1;
 /* refresh entrambe: voci menu devono essere vere al tap */
 runMenuAccessNet(t);
 } catch (eKick) {}
 }
 try {
 document.addEventListener(
 "pointerover",
 function (ev) {
 try {
 var el = ev && ev.target;
 if (!el || !el.closest) return;
 if (el.closest(".discord-profile-link")) kick();
 } catch (ePo) {}
 },
 true,
 );
 document.addEventListener(
 "focusin",
 function (ev) {
 try {
 var el = ev && ev.target;
 if (!el || !el.closest) return;
 if (el.closest(".discord-account-menu")) kick();
 } catch (eFi) {}
 },
 true,
 );
 document.addEventListener(
 "click",
 function (ev) {
 try {
 var el = ev && ev.target;
 if (!el || !el.closest) return;
 if (el.closest(".discord-profile-link")) kick();
 } catch (eCl) {}
 },
 true,
 );
 } catch (eArm) {}
 }
 function scheduleMenuAccessNet(token) {
 var t = String(token || "").trim();
 if (!t) return;
 /* sticky già via warm* — rete solo se QUESTA pagina la usa */
 function goNet() {
  if (pathNeedsStaffAccessNet()) runStaffAccessNet(t);
  if (pathNeedsDashAccessNet()) runDashAccessNet(t);
 }
 try {
  if (typeof window.__vcYield === "function") window.__vcYield(goNet);
  else goNet();
 } catch (eY) {
  goNet();
 }
 /* wiki/home/legal/vote/…: niente staff/dash net a boot; al menu sì */
 armMenuAccessNetOnAccountOpen(t);
 }
 function isProfileContextPath() {
 try {
 var p = String(window.location.pathname || "").toLowerCase().replace(/\/+$/, "") || "/";
 if (p === "/staff/profilo" || p.indexOf("/staff/profilo/") === 0) return true;
 if (p === "/dashboard/profilo" || p.indexOf("/dashboard/profilo/") === 0) return true;
 if (p === "/dashboard/transcript" || p.indexOf("/dashboard/transcript/") === 0) return true;
 if (p === "/user" || p === "/personalizza" || p === "/user/customize" || p === "/user/personalizza" || p === "/user/custom") return true;
 return /^\/users\/\d{17,22}$/.test(p);
 } catch (e) {
 return false;
 }
 }
 function revealDashboardMenuItem(access) {
 var allowed = Boolean(access && access.allowed);
 var blacklisted = Boolean(access && access.blacklisted);
 var unchecked = Boolean(access && access.unchecked);
 if (!unchecked) {
 window.__VC_DASHBOARD_MENU_ALLOWED = allowed;
 window.__VC_DASHBOARD_MENU_BLACKLISTED = blacklisted;
 window.__VC_DASHBOARD_MENU_CHECKED = true;
 }
 applyAccountMenuDashBacheca(blacklisted);
 try {
 window.dispatchEvent(
 new CustomEvent("vc-dashboard-access", { detail: { allowed: allowed, blacklisted: blacklisted } }),
 );
 } catch (eEv) {}
 try {
 if (typeof window.__vcMobileNavRebuild === "function") {
 window.__vcMobileNavRebuild();
 }
 } catch (eRebuild) {}
 }
 function accountSoonBadgeHtml() {
 return (
 '<span class="discord-account-popover__soon-badge" data-i18n="dash.comingSoon">' +
 escAttr(i18n("dash.comingSoon", "coming soon")) +
 "</span>"
 );
 }
 function isAccountFounder() {
 try {
 if (window.__VC_VIEW_AS_ALLOWED === true) return true;
 var p = window.__VC_STAFF_PERMS || {};
 if (p && (p.isFounder === true || p.viewAsAllowed === true)) return true;
 try {
 if (sessionStorage.getItem("vc_view_as_allowed") === "1") return true;
 } catch (eSs) {}
 } catch (e) {}
 return false;
 }
 function applyAccountMenuDashBacheca(blacklisted) {
 var dash = byId("discord-dashboard-link");
 var bach = byId("discord-bacheca-link");
 var founder = isAccountFounder();
 var bl = blacklisted === true || window.__VC_DASHBOARD_MENU_BLACKLISTED === true;
 function bindSoonBlock(el) {
 if (!el || el.__vcSoonBound) return;
 el.__vcSoonBound = true;
 el.addEventListener("click", function (ev) {
 if (!el.classList.contains("is-soon") && !el.classList.contains("is-blacklisted")) return;
 ev.preventDefault();
 ev.stopPropagation();
 });
 }
 function unlockLive(el, href, iconClass, labelKey, labelFb, current) {
 if (!el) return;
 el.classList.remove("is-soon", "is-blacklisted");
 el.removeAttribute("hidden");
 el.removeAttribute("aria-disabled");
 el.removeAttribute("tabindex");
 el.setAttribute("role", "menuitem");
 el.setAttribute("href", href);
 if (current) {
 el.classList.add("is-current");
 el.setAttribute("aria-current", "page");
 } else {
 el.classList.remove("is-current");
 el.removeAttribute("aria-current");
 }
 el.innerHTML =
 '<i class="fa ' +
 iconClass +
 '" aria-hidden="true"></i><span>' +
 escAttr(i18n(labelKey, labelFb)) +
 "</span>";
 bindSoonBlock(el);
 }
 function lockSoon(el, iconClass, labelKey, labelFb) {
 if (!el) return;
 el.classList.add("is-soon");
 el.classList.remove("is-current");
 el.removeAttribute("hidden");
 el.removeAttribute("href");
 el.removeAttribute("aria-current");
 el.setAttribute("aria-disabled", "true");
 el.setAttribute("tabindex", "-1");
 el.setAttribute("role", "menuitem");
 var label = i18n(labelKey, labelFb);
 if (bl && el.id === "discord-dashboard-link") {
 label = i18n("auth.dashboardBlacklisted", "Blacklistato");
 el.classList.add("is-blacklisted");
 } else {
 el.classList.remove("is-blacklisted");
 }
 el.innerHTML =
 '<span class="discord-account-popover__soon-inner" aria-hidden="true">' +
 '<i class="fa ' +
 iconClass +
 '" aria-hidden="true"></i><span>' +
 escAttr(label) +
 "</span></span>" +
 accountSoonBadgeHtml();
 bindSoonBlock(el);
 }
 if (founder && !bl) {
 unlockLive(
 dash,
 dashboardPageHref(),
 "fa-server",
 "auth.dashboard",
 "Dashboard",
 isDashboardContextPath(),
 );
 unlockLive(bach, "/bacheca/", "fa-th-large", "nav.bacheca", "Bacheca", false);
 try {
 var path = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
 if (path === "/bacheca" || path.indexOf("/bacheca/") === 0) {
 if (bach) {
 bach.classList.add("is-current");
 bach.setAttribute("aria-current", "page");
 }
 }
 } catch (ePath) {}
 return;
 }
 /* hamFootSoon1: non-founder ? entrambi soon (come PC) */
 lockSoon(dash, "fa-server", "auth.dashboard", "Dashboard");
 lockSoon(bach, "fa-th-large", "nav.bacheca", "Bacheca");
 }
 function applyAccountSoonItems(blacklisted) {
 applyAccountMenuDashBacheca(blacklisted);
 }
 function revealStaffMenuItem(allowed) {
 window.__VC_STAFF_MENU_ALLOWED = Boolean(allowed);
 /* staffInProfileOnly2: NESSUNA voce Staff nel menu account — solo card/strumenti nel profilo */
 try {
 var nav = document.querySelector(".discord-account-popover__nav");
 if (nav) {
 var stale = nav.querySelectorAll(
 '#discord-staff-link, a[href="/staff/"], a[href="/staff"], a[href*="tab=staff"], a[data-i18n="auth.staffArea"]',
 );
 for (var i = 0; i < stale.length; i += 1) {
 try {
 stale[i].parentNode && stale[i].parentNode.removeChild(stale[i]);
 } catch (e2) {}
 }
 }
 /* strip anche fuori popover (drawer/footer residui) */
 try {
 var extra = document.querySelectorAll(
 '#discord-staff-link, a[data-vc-mobile-staff], a.discord-account-popover__item[data-i18n="auth.staffArea"]',
 );
 for (var j = 0; j < extra.length; j += 1) {
 try {
 extra[j].parentNode && extra[j].parentNode.removeChild(extra[j]);
 } catch (e3) {}
 }
 } catch (eEx) {}
 } catch (eClean) {}
 if (allowed) ensureStaffSiteNavScript();
 try {
 applyAccountMenuDashBacheca(window.__VC_DASHBOARD_MENU_BLACKLISTED === true);
 } catch (eSoon) {}
 try {
 if (typeof window.__vcMobileNavRebuild === "function") {
 window.__vcMobileNavRebuild();
 }
 } catch (eRebuild2) {}
 }
 function startDiscordOAuthFromUserGesture(visualBtn, url) {
 try {
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 /* staffOauthLoop1: nuovo login = nuovo token, azzera il flag 401 staff */
 sessionStorage.removeItem("vc_staff_oauth_invalid");
 } catch (eClrLogin) {}
 var u = url || authUrl({ prompt: "none" });
 if (!u) {
 var missingCfg = {
 title: "Configurazione mancante",
 message: "Configura discordOauth.clientId in site.config.json",
 danger: true,
 icon: "fa-exclamation-triangle",
 };
 if (typeof window.__vcEnsureDialog === "function") {
 void window.__vcEnsureDialog().then(function (D) {
 if (D && typeof D.alert === "function") return D.alert(missingCfg);
 });
 } else if (window.VcDialog && typeof window.VcDialog.alert === "function") {
 void window.VcDialog.alert(missingCfg);
 }
 return;
 }
 try {
 var retNow = currentPathPlusQuery() || "/";
 sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, retNow);
 localStorage.setItem(OAUTH_PENDING_RETURN_KEY, retNow);
 } catch (e0) {}
 if (visualBtn) {
 if (visualBtn.getAttribute("data-vc-login-default-html") == null) {
 visualBtn.setAttribute("data-vc-login-default-html", visualBtn.innerHTML);
 }
 visualBtn.classList.add("discord-login-btn--loading");
 visualBtn.setAttribute("aria-busy", "true");
 visualBtn.innerHTML =
 '<span class="discord-login-btn__spin" aria-hidden="true"></span>' +
 "<span>Accesso in corso...</span>";
 }
 try {
 if (typeof window.vcShowPageTransition === "function") {
 window.vcShowPageTransition("login");
 }
 } catch (e) {}
 var navigated = false;
 try {
 window.location.assign(u);
 navigated = true;
 } catch (e2) {
 try {
 window.location.href = u;
 navigated = true;
 } catch (e3) {}
 }
 if (!navigated && visualBtn) {
 restoreDiscordLoginButtonVisual(visualBtn);
 }
 }
 function startLoginTransition(loginBtn, url) {
 startDiscordOAuthFromUserGesture(loginBtn, url);
 }
 function syncProfileMenuHref(user) {
 try {
 var link = byId("discord-profile-menu-link");
 if (!link) return;
 var href = profileHref(user && user.id);
 if (href) link.setAttribute("href", href);
 bindProfileMenuNav(link);
 } catch (eHref) {}
 }
 function bindProfileMenuNav(link) {
 if (!link || link.__vcProfileNavBound) return;
 link.__vcProfileNavBound = true;
 link.addEventListener("click", function (ev) {
 try {
 if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) return;
 if (ev && typeof ev.button === "number" && ev.button !== 0) return;
 var id = resolveAccountUserId(
 (window.__VC_ACCOUNT_MENU_USER && window.__VC_ACCOUNT_MENU_USER.id) ||
 (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) ||
 ""
 );
 if (!id) return;
 if (isDashboardContextPath()) return;
 var want = "/user/?id=" + encodeURIComponent(id);
 var cur = String(link.getAttribute("href") || "");
 if (cur.indexOf("id=" + id) !== -1 || cur.indexOf("id=" + encodeURIComponent(id)) !== -1) return;
 if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
 link.setAttribute("href", want);
 try {
 window.location.assign(want);
 } catch (eAssign) {
 window.location.href = want;
 }
 } catch (eClick) {}
 });
 }
 function emitProfile(user) {
 try {
 window.__VC_DISCORD_PROFILE = user || null;
 window.dispatchEvent(new CustomEvent("vc-discord-profile", { detail: { user: user || null } }));
 } catch (e) {}
 syncProfileMenuHref(user);
 try {
 if (typeof window.__vcMobileNavRebuild === "function") {
 window.__vcMobileNavRebuild();
 }
 } catch (eRebuild) {}
 }
 function readOAuthLoginCount() {
 try {
 var n = parseInt(localStorage.getItem(OAUTH_LOGIN_COUNT_KEY) || "0", 10);
 return isFinite(n) && n >= 0 ? n : 0;
 } catch (e) {
 return 0;
 }
 }
 function bumpOAuthLoginCount() {
 var next = readOAuthLoginCount() + 1;
 try {
 localStorage.setItem(OAUTH_LOGIN_COUNT_KEY, String(next));
 } catch (e) {}
 return next;
 }
 function siteDisplayName() {
 try {
 var c = cfg();
 var n = String((c && c.siteName) || "").trim();
 if (n) return n;
 } catch (e) {}
 try {
 var t = String(document.title || "").trim();
 if (!t) return "il sito";
 var pipe = t.indexOf("|");
 if (pipe > 0) return t.slice(0, pipe).trim();
 var dash = t.indexOf(" - ");
 if (dash > 0) return t.slice(0, dash).trim();
 return t;
 } catch (e2) {
 return "il sito";
 }
 }
 function resolveHomeUrl() {
 try {
 var c = cfg();
 var u = String((c && c.homeUrl) || "").trim();
 if (u) {
 if (u.charAt(0) === "/" && u.indexOf("//") === -1) {
 try {
 return new URL(u, window.location.origin).href;
 } catch (e0) {
 return u;
 }
 }
 return u;
 }
 } catch (e) {}
 try {
 return new URL("/", window.location.origin).href;
 } catch (e2) {
 return "/";
 }
 }
 function queueLoginWelcomeNotification(user) {
 var countBefore = readOAuthLoginCount();
 var displayName = profileDisplayName(user);
 if (!displayName || displayName === "Utente") displayName = "utente";
 var site = siteDisplayName();
 var home = resolveHomeUrl();
 var notifId = countBefore >= 1 ? "sys:login_return" : "sys:login_welcome";
 var payload =
 countBefore >= 1
 ? {
 id: notifId,
 title: i18n("notif.loginOk", "Login effettuato con successo!"),
 body: "Bentornato " + displayName + "! Sei ora connesso a " + site + ".",
 kind: "success",
 at: Date.now(),
 openUrl: home,
 userId: String((user && user.id) || ""),
 }
 : {
 id: notifId,
 title: "Benvenuti",
 body:
 "Ciao " +
 displayName +
 "! Benvenuti su " +
 site +
 ": il login con Discord ? andato a buon fine. Da qui puoi esplorare il sito e le funzioni riservate agli utenti collegati.",
 kind: "success",
 at: Date.now(),
 openUrl: home,
 userId: String((user && user.id) || ""),
 };
 bumpOAuthLoginCount();
 if (window.vcNotify && typeof window.vcNotify.add === "function") {
 window.vcNotify.add(payload);
 return;
 }
 try {
 localStorage.setItem(PENDING_LOGIN_NOTIF_KEY, JSON.stringify(payload));
 } catch (e) {}
 }
 function isStaffSitePath() {
 try {
 var p = String(location.pathname || "/").replace(/\/+$/, "") || "/";
 if (p.indexOf("/accesso-richiesto") >= 0) return false;
 return p === "/staff" || p.indexOf("/staff/") === 0;
 } catch (e) {
 return false;
 }
 }
 function logoutRedirectTarget() {
 try {
 var path = String(location.pathname || "/");
 if (/\/accesso-richiesto(?:\/|$)/i.test(path)) return "";
 if (/^\/dashboard\/(?:transcript|profilo)(?:\/|$)/i.test(path)) return "";
 var norm = path.replace(/\/+$/, "") || "/";
 if (norm === "/staff") return "";
 if (/^\/staff(?:\/|$)/i.test(path)) return "/";
 if (/^\/dashboard(?:\/|$)/i.test(path)) return "/";
 if (/^\/seratafilm(?:\/|$)/i.test(path)) return "/";
 if (/^\/candidature(?:\/|$)/i.test(path)) return "";
 if (/^\/appelli(?:\/|$)/i.test(path)) return "";
 if (/^\/(?:unban|unmute)(?:\/|$)/i.test(path)) return "";
 if (/^\/(?:tickets|recensioni|feedback|suggerimenti)(?:\/|$)/i.test(path)) return "";
 if (/^\/user\/(?:personalizza|customize|custom)(?:\/|$)/i.test(path)) return "";
 if (/^\/personalizza(?:\/|$)/i.test(path)) return "";
 if (/^\/notifications(?:\/|$)/i.test(path)) return "/";
 if (/^\/dati(?:\/|$)/i.test(path)) return "";
 if (isOwnProfileCurrent()) return "/classifiche/";
 if (/^\/evento(?:\/|$)/i.test(path)) {
 try {
 var nav = window.__VC_HOGWARTS_EVENT_NAV;
 var cal = window.__VC_HOGWARTS_EVENT_CALENDAR;
 var preview =
 (nav && nav.previewMode === true) ||
 (cal && cal.previewMode === true) ||
 window.__VC_HOGWARTS_STAFF_PREVIEW === true;
 if (preview) return "/";
 } catch (eHw) {}
 }
 return "";
 } catch (e) {
 return "";
 }
 }
 function navigateAfterLogout(target) {
 var dest = String(target || "").trim();
 if (!dest) return;
 try {
 location.replace(dest);
 } catch (eLoc) {
 location.href = dest;
 }
 }
 function teardownStaffChromeAfterLogout() {
 try {
 writeStaffMenuSticky(false);
 writeDashMenuSticky(false);
 window.__VC_STAFF_PERMS = null;
 window.__VC_HOGWARTS_STAFF_PREVIEW = false;
 } catch (e0) {}
 try {
 if (typeof window.__vcTeardownStaffSiteNav === "function") {
 window.__vcTeardownStaffSiteNav();
 }
 } catch (e1) {}
 try {
 revealStaffMenuItem(false);
 } catch (e2) {}
 try {
 revealDashboardMenuItem({ allowed: false, blacklisted: false, unchecked: false });
 } catch (e3) {}
 try {
 var promo = document.getElementById("vc-header-promo-btn");
 if (promo) promo.classList.remove("vc-header-promo-btn--staff-hidden");
 } catch (e4) {}
 try {
 if (typeof window.__vcMobileNavRebuild === "function") window.__vcMobileNavRebuild();
 } catch (e5) {}
 try {
 if (typeof window.__vcCloseStaffManageSheet === "function") window.__vcCloseStaffManageSheet();
 } catch (e6) {}
 }

 /* sessionBrowserToast1: toast sessione scaduta su TUTTE le pagine (non solo compiti) */
 function shouldToastSessionExpired(reason) {
 var r = String(reason || "");
 if (!r || r === "user" || r === "manual" || r === "logout") return false;
 return (
   r.indexOf("401") >= 0 ||
   r.indexOf("invalid") >= 0 ||
   r.indexOf("expired") >= 0 ||
   r.indexOf("missing_token") >= 0 ||
   r.indexOf("unauthorized") >= 0 ||
   r.indexOf("oauth-invalid") >= 0 ||
   r.indexOf("session") >= 0
 );
 }

 function notifySessionExpiredToast(reason, opts) {
 opts = opts || {};
 if (opts.silent) return;
 if (!shouldToastSessionExpired(reason) && !opts.force) return;
 try {
   if (window.__vcSessionExpiredToastAt && Date.now() - window.__vcSessionExpiredToastAt < 4500) {
     return;
   }
   window.__vcSessionExpiredToastAt = Date.now();
 } catch (eAt) {}
 var msg =
   opts.message ||
   "Sessione Discord scaduta in questo browser. Riaccedi qui (ogni browser ha login separato).";
 try {
   if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
     window.VcSiteToast.show(msg, true);
   }
 } catch (eToast) {}
 }

 function notifyAuthFailure(status, data, opts) {
 opts = opts || {};
 var st = Number(status) || 0;
 var err = String((data && (data.error || data.code)) || "");
 if (
   st !== 401 &&
   err !== "missing_token" &&
   err !== "invalid_token" &&
   err !== "unauthorized"
 ) {
   return false;
 }
 var reason = opts.reason || ("auth-fail-" + (err || st || "401"));
 try {
   completeLogout({
     reason: reason,
     skipRedirect: !!opts.skipRedirect,
     silent: false,
     forceToast: true,
     message: opts.message,
   });
 } catch (eLo) {
   notifySessionExpiredToast(reason, { force: true, message: opts.message });
 }
 return true;
 }

function isUserInitiatedLogout(reason) {
 var r = String(reason || "").trim().toLowerCase();
 return !r || r === "user" || r === "manual" || r === "logout";
 }
 function logoutToOAuthAuthorizeUrl() {
 /* logoutToOAuth1: logout utente ? subito Discord authorize (consent) */
 try {
 return authUrl({ prompt: "consent" }) || "";
 } catch (eAuth) {
 return "";
 }
 }
 function completeLogout(opts) {
 opts = opts || {};
 /* sessionBrowserToast1 */
 try {
   if (opts.forceToast || shouldToastSessionExpired(opts.reason)) {
     notifySessionExpiredToast(opts.reason, {
       silent: !!opts.silent,
       force: !!opts.forceToast,
       message: opts.message,
     });
   }
 } catch (eToastLo) {}
 var dest = "";
 if (!opts.skipRedirect) {
 try {
 if (isUserInitiatedLogout(opts.reason)) {
 dest = logoutToOAuthAuthorizeUrl();
 }
 if (!dest) {
 if (isOwnProfileCurrent()) dest = "/classifiche/";
 else dest = logoutRedirectTarget();
 }
 } catch (eDest) {
 try {
 dest = isUserInitiatedLogout(opts.reason)
 ? logoutToOAuthAuthorizeUrl() || logoutRedirectTarget()
 : logoutRedirectTarget();
 } catch (eDest2) {
 dest = "";
 }
 }
 }
 try {
 if (typeof window.__vcPushDetachForLogout === "function") {
 window.__vcPushDetachForLogout();
 } else {
 window.dispatchEvent(new CustomEvent("vc:push-detach", { detail: { reason: "logout" } }));
 }
 } catch (ePushLo) {}
 clearToken();
 renderLoggedOut({ skipRedirect: true });
 teardownStaffChromeAfterLogout();
 try {
 window.dispatchEvent(new CustomEvent("vc:auth-logout", { detail: { reason: opts.reason || "logout" } }));
 } catch (eEv) {}
 if (opts.skipRedirect) return;
 navigateAfterLogout(dest);
 }
 function markDiscordAuthBootDone(why) {
 try {
 window.__vcDiscordAuthBootDone = 1;
 window.__vcDiscordAuthPainted = 1;
 document.dispatchEvent(
 new CustomEvent("vc-discord-auth-boot", { detail: { reason: String(why || "") } }),
 );
 } catch (eMark) {}
 }
 /* logoutToOAuth1 */
 function renderLoggedOut(opts) {
 opts = opts || {};
 try {
 document.documentElement.classList.remove("vc-session-verify-pending");
 document.documentElement.classList.remove("vc-auth-session-pending");
 } catch (e) {}
 hideSessionVerifyOverlay();
 var loginBtns = queryDiscordLoginButtons();
 for (var li = 0; li < loginBtns.length; li += 1) {
 setDiscordLoginBtnVisible(loginBtns[li], true);
 }
 var state = byId("discord-login-state");
 if (state) {
 state.hidden = true;
 state.innerHTML = "";
 }
 emitProfile(null);
 emitServerIdentity(null);
 try {
 if (opts.viewAsPreview) {
 document.documentElement.classList.add("vc-view-as-guest");
 document.documentElement.classList.remove("vc-auth-logged-out");
 } else {
 document.documentElement.classList.add("vc-auth-logged-out");
 document.documentElement.classList.remove("vc-view-as-guest");
 try {
 window.__VC_VIEW_AS_ALLOWED = false;
 sessionStorage.removeItem("vc_view_as_allowed");
 } catch (eAllow) {}
 try {
 if (window.VcViewAs && typeof window.VcViewAs.clearAllowed === "function") {
 window.VcViewAs.clearAllowed();
 }
 } catch (eVaClear) {}
 }
 } catch (eLoCls) {}
 try {
 if (!getToken() || opts.viewAsPreview) teardownStaffChromeAfterLogout();
 } catch (eTd) {}
 if (!opts.skipRedirect && !getToken()) {
 navigateAfterLogout(logoutRedirectTarget());
 }
 markDiscordAuthBootDone(opts.viewAsPreview ? "logged-out-preview" : "logged-out");
 }
 try {
 window.__vcDiscordRenderLoggedOut = function () {
 renderLoggedOut({ skipRedirect: true, viewAsPreview: true });
 };
 } catch (eRo) {}
 function renderAuthPendingShell() {
 try {
 if (String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout") {
 renderLoggedOut({ skipRedirect: true, viewAsPreview: true });
 return;
 }
 } catch (eVaPend) {}
 try {
 document.documentElement.classList.add("vc-auth-session-pending");
 } catch (eCls) {}
 var loginBtns = queryDiscordLoginButtons();
 for (var li = 0; li < loginBtns.length; li += 1) {
 setDiscordLoginBtnVisible(loginBtns[li], false);
 }
 var state = byId("discord-login-state");
 if (!state) return;
 state.hidden = false;
 /* navUserNoFlash1: se early/chip gi… ok, non toccare */
 if (
 state.querySelector(".discord-login-row--profile .discord-profile-link--chip") ||
 state.querySelector(".vc-auth-early-shell img.discord-avatar-img") ||
 state.querySelector(".discord-account-menu .discord-profile-link--chip")
 ) {
 return;
 }
 var token = getToken();
 if (token) {
 try {
 var cachedUser = readCachedDiscordMe(token);
 if (cachedUser) {
 renderLoggedIn(cachedUser);
 return;
 }
 } catch (eCache) {}
 try {
 var stickyPend = readIdentitySticky(token);
 if (stickyPend && (stickyPend.avatarUrl || stickyPend.displayName)) {
 var pendName = String(stickyPend.displayName || "Utente").trim() || "Utente";
 var pendAv = String(stickyPend.avatarUrl || "").trim();
 var pendUid = String(stickyPend.userId || "").trim();
 var pendLabel = escAttr(pendName);
 state.innerHTML =
 '<div class="discord-login-row discord-login-row--profile vc-auth-early-shell" data-vc-nav-user-early="1" aria-busy="true">' +
 '<div class="discord-account-menu">' +
 '<button type="button" class="discord-profile-link discord-profile-link--chip" aria-label="' +
 escAttr(i18n("auth.accountMenu", "Menu account")) +
 " " +
 pendLabel +
 '" aria-haspopup="true">' +
 '<span class="discord-avatar-clip">' +
 '<img class="discord-avatar-img vc-avatar vc-avatar--ready" data-vc-avatar="1" data-vc-nav-early="1"' +
 (pendUid ? ' data-user-id="' + escAttr(pendUid) + '"' : "") +
 (pendAv ? ' src="' + escAttr(pendAv) + '"' : "") +
 ' alt="" width="34" height="34" decoding="async" fetchpriority="high" aria-label="' +
 pendLabel +
 '">' +
 "</span>" +
 '<span class="discord-profile-link__name vc-marquee" data-vc-nav-user-marquee>' +
 '<span class="vc-marquee__track"><span class="vc-marquee__text">' +
 pendLabel +
 "</span></span></span></button></div></div>";
 return;
 }
 } catch (eStickyPend) {}
 }
 /* navUserNoFlash1: niente silhouette caff… … skeleton chip neutro stesso layout finale */
 state.innerHTML =
 '<div class="discord-login-row discord-login-row--profile vc-auth-pending-shell vc-auth-pending-shell--chip" aria-busy="true" title="' +
 escAttr(i18n("auth.sessionChecking", "Caricamento…")) +
 '">' +
 '<div class="discord-account-menu">' +
 '<span class="discord-profile-link discord-profile-link--chip" aria-hidden="true">' +
 '<span class="discord-avatar-clip"><span class="vc-nav-av-skel" aria-hidden="true"></span></span>' +
 '<span class="discord-profile-link__name"><span class="vc-nav-name-skel" aria-hidden="true"></span></span>' +
 "</span></div></div>";
 }
 function postOAuthAccessoRedirectPath() {
 try {
 var p = String(window.location.pathname || "").replace(/\/+$/, "") || "/";
 if (p.endsWith("/appelli/accesso-richiesto") || p.endsWith("/unban/accesso-richiesto")) {
 try {
 var fromUnban = String(new URLSearchParams(window.location.search || "").get("from") || "").trim();
 if (fromUnban) {
 fromUnban = fromUnban.replace(/^\/unban(\/|\?|$)/i, "/appelli$1");
 }
 if (
 fromUnban &&
 fromUnban.charAt(0) === "/" &&
 /^\/appelli(\/|$|\?)/i.test(fromUnban) &&
 fromUnban.indexOf("//") === -1 &&
 fromUnban.indexOf("/accesso-richiesto") === -1
 ) {
 return fromUnban;
 }
 } catch (eFromUnban) {}
 return "/appelli/";
 }
 if (p.endsWith("/candidature/accesso-richiesto")) return "/candidature/";
 if (p.endsWith("/seratafilm/accesso-richiesto")) {
 try {
 var from = String(new URLSearchParams(window.location.search || "").get("from") || "").trim();
 if (from && from.charAt(0) === "/" && /^\/seratafilm(\/|$)/i.test(from) && from.indexOf("//") === -1) {
 return from;
 }
 } catch (eFrom) {}
 return "/seratafilm/";
 }
 if (p.endsWith("/staff/accesso-richiesto")) {
 try {
 var qsStaff = new URLSearchParams(window.location.search || "");
 if (qsStaff.get("reason") === "denied" || qsStaff.get("stay") === "1") return "";
 } catch (eGuardStaff) {}
 /* staffOauthLoop1: flag stale 401 non blocca il salto post-login (token nuovo) */
 try {
 sessionStorage.removeItem("vc_staff_oauth_invalid");
 } catch (eClrStaffInv) {}
 try {
 var fromStaff = String(new URLSearchParams(window.location.search || "").get("from") || "").trim();
 if (
 fromStaff &&
 fromStaff.charAt(0) === "/" &&
 /^\/staff(\/|$|\?)/i.test(fromStaff) &&
 fromStaff.indexOf("//") === -1 &&
 fromStaff.indexOf("/accesso-richiesto") === -1
 ) {
 return fromStaff;
 }
 } catch (eFromStaff) {}
 return "/staff/";
 }
 } catch (e) {}
 return "";
 }
 function renderLoggedIn(user) {
 hideSessionVerifyOverlay();
 try {
 if (String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout") {
 renderLoggedOut({ skipRedirect: true, viewAsPreview: true });
 return;
 }
 } catch (eVaLi) {}
 try {
 document.documentElement.classList.add("vc-auth-session-pending");
 document.documentElement.classList.remove("vc-auth-logged-out");
 document.documentElement.classList.remove("vc-view-as-guest");
 } catch (eCls) {}
 /* staffOauthLoop1: dopo OAuth ok il token è nuovo — NON fare logout sul flag 401 vecchio
    (altrimenti loop: accesso-richiesto → login → logout → stessa card). */
 try {
 sessionStorage.removeItem("vc_staff_oauth_invalid");
 } catch (eInv) {}
 var jump = postOAuthAccessoRedirectPath();
 if (jump) {
 try {
 window.location.replace(jump);
 } catch (e2) {
 window.location.href = jump;
 }
 return;
 }
 var loginBtns = queryDiscordLoginButtons();
 for (var lj = 0; lj < loginBtns.length; lj += 1) {
 setDiscordLoginBtnVisible(loginBtns[lj], false);
 }
 var state = byId("discord-login-state");
 if (!state) return;
 var tokenForSticky = getToken();
 var stickyFirst = null;
 try {
 stickyFirst =
 readIdentitySticky(tokenForSticky) ||
 readMenuCache("vc_server_identity_v1", tokenForSticky, 604800000);
 } catch (eStickyFirst) {}
 var name = profileDisplayName(user);
 if (stickyFirst && stickyFirst.displayName) {
 name = String(stickyFirst.displayName || "").trim() || name;
 }
 var label = escAttr(name);
 try {
 window.__VC_ACCOUNT_MENU_USER = user;
 } catch (eStoreUser) {}
 var href = escAttr(profileHref(user && user.id));
 var isProfileCurrent = isOwnProfileCurrent(user && user.id);
 var stickyAv = stickyFirst ? String(stickyFirst.avatarUrl || stickyFirst.url || "").trim() : "";
 var avatarVisual;
 if (stickyAv) {
 var stickyHash = String((stickyFirst && stickyFirst.memberAvatar) || "").trim();
 avatarVisual =
 '<img class="discord-avatar-img vc-avatar vc-avatar--ready" data-vc-avatar="1" data-vc-guild-avatar="1" data-vc-guild-src="' +
 escAttr(stickyAv) +
 '"' +
 (stickyHash ? ' data-avatar-hash="' + escAttr(stickyHash) + '"' : "") +
 (user && user.id ? ' data-user-id="' + escAttr(String(user.id)) + '"' : "") +
 ' src="' +
 escAttr(stickyAv) +
 '" alt="" width="34" height="34" decoding="async" fetchpriority="high" aria-label="' +
 label +
 '">';
 } else {
 avatarVisual = buildMenuAvatarVisual(user, name, 34);
 }
 var keepLoadedAvatar = null;
 try {
 var earlyImg = state.querySelector(
 "img.discord-avatar-img[data-vc-nav-early], .vc-auth-early-shell img.discord-avatar-img, .discord-login-row--profile img.discord-avatar-img",
 );
 if (earlyImg && earlyImg.complete && earlyImg.naturalWidth > 0) {
 var earlySrc = String(earlyImg.getAttribute("src") || earlyImg.src || "").trim();
 var wantSrc = stickyAv || String(avatarUrl(user) || "").trim();
 if (earlySrc && (!wantSrc || earlySrc === wantSrc || (stickyAv && earlySrc === stickyAv))) {
 keepLoadedAvatar = earlyImg;
 }
 }
 } catch (eKeepEarly) {}
 var accountMenuBlock =
 '<div class="discord-account-menu">' +
 '<button type="button" class="discord-profile-link discord-profile-link--chip" aria-label="' +
 escAttr(i18n("auth.accountMenu", "Menu account")) +
 " " +
 label +
 '" aria-haspopup="true">' +
 '<span class="discord-avatar-clip">' +
 avatarVisual +
 "</span>" +
 '<span class="discord-profile-link__name vc-marquee" data-vc-nav-user-marquee>' +
 '<span class="vc-marquee__track">' +
 '<span class="vc-marquee__text">' +
 label +
 "</span>" +
 "</span>" +
 "</span>" +
 "</button>" +
 '<div class="discord-account-popover" role="menu">' +
 '<div class="discord-account-popover__nav" role="none">' +
 '<a id="discord-profile-menu-link" class="discord-account-popover__item' +
 (isProfileCurrent ? " is-current" : "") +
 '" role="menuitem" href="' +
 href +
 '"' +
 (isProfileCurrent ? ' aria-current="page"' : "") +
 '"><i class="fa fa-user-o" aria-hidden="true"></i><span>' +
 escAttr(i18n("auth.profile", "Vai al profilo")) +
 "</span></a>" +
 '<a id="discord-dashboard-link" class="discord-account-popover__item is-soon" role="menuitem" aria-disabled="true" tabindex="-1">' +
 '<span class="discord-account-popover__soon-inner" aria-hidden="true"><i class="fa fa-server" aria-hidden="true"></i><span>' +
 escAttr(i18n("auth.dashboard", "Dashboard")) +
 "</span></span>" +
 '<span class="discord-account-popover__soon-badge" data-i18n="dash.comingSoon">' +
 escAttr(i18n("dash.comingSoon", "coming soon")) +
 "</span></a>" +
 '<a id="discord-bacheca-link" class="discord-account-popover__item is-soon" role="menuitem" aria-disabled="true" tabindex="-1">' +
 '<span class="discord-account-popover__soon-inner" aria-hidden="true"><i class="fa fa-th-large" aria-hidden="true"></i><span>' +
 escAttr(i18n("nav.bacheca", "Bacheca")) +
 "</span></span>" +
 '<span class="discord-account-popover__soon-badge" data-i18n="dash.comingSoon">' +
 escAttr(i18n("dash.comingSoon", "coming soon")) +
 "</span></a>" +
 '<button type="button" class="discord-account-popover__item discord-account-popover__item--danger" role="menuitem" id="discord-logout-btn"><i class="fa fa-sign-out" aria-hidden="true"></i><span>' +
 escAttr(i18n("auth.logout", "Logout")) +
 "</span></button>" +
 "</div>" +
 "</div>" +
 "</div>";
 state.innerHTML =
 '<div class="discord-login-row discord-login-row--profile">' +
 accountMenuBlock +
 "</div>";
 state.hidden = false;
 /* navUserNoFlash1: riusa img gi… decodificata dall'early chip */
 try {
 if (keepLoadedAvatar) {
 var freshAv = state.querySelector(".discord-avatar-clip img.discord-avatar-img");
 if (freshAv && freshAv !== keepLoadedAvatar && freshAv.parentNode) {
 keepLoadedAvatar.className = freshAv.className;
 keepLoadedAvatar.removeAttribute("data-vc-nav-early");
 ["data-vc-avatar", "data-vc-guild-avatar", "data-vc-guild-src", "data-avatar-hash", "data-user-id", "aria-label", "width", "height"].forEach(
  function (attr) {
   var v = freshAv.getAttribute(attr);
   if (v != null) keepLoadedAvatar.setAttribute(attr, v);
   else keepLoadedAvatar.removeAttribute(attr);
  },
 );
 freshAv.parentNode.replaceChild(keepLoadedAvatar, freshAv);
 }
 }
 } catch (eSwapAv) {}
 try {
 revealStaffMenuItem(window.__VC_STAFF_MENU_ALLOWED === true);
 } catch (eStrip) {}
 try {
 applyAccountMenuDashBacheca(window.__VC_DASHBOARD_MENU_BLACKLISTED === true);
 } catch (eSoon) {}
 ensureHeaderMenusMutex();
 var out = byId("discord-logout-btn");
 if (out) {
 out.addEventListener("click", function () {
 completeLogout({ reason: "user" });
 });
 }
 try {
 bindProfileMenuNav(byId("discord-profile-menu-link"));
 } catch (eBindProf) {}
 var token = getToken();
 warmStaffNavEarly();
 warmDashboardNavEarly();
 scheduleMenuAccessNet(token);
 var applyServerIdentity = function (identity) {
 if (!identity) return;
 var serverName = String(identity.displayName || "").trim();
 var serverAvatar = String(identity.avatarUrl || "").trim();
 var memberHash = String(identity.memberAvatar || "").trim() || hashFromAvatarSrc(serverAvatar);
 if (serverName) {
 try {
 var nameEls = state.querySelectorAll(
 ".discord-profile-link__name, .discord-account-popover__name",
 );
 for (var ni = 0; ni < nameEls.length; ni += 1) {
 var nameHost = nameEls[ni];
 var marqueeTexts = nameHost.querySelectorAll
 ? nameHost.querySelectorAll(".vc-marquee__text")
 : [];
 if (marqueeTexts && marqueeTexts.length) {
 var curMq = String(marqueeTexts[0].textContent || "")
 .replace(/\s+/g, " ")
 .trim();
 /* wmMqStable1: stesso nome ? non toccare sig/t0 (evita restart marquee) */
 if (curMq === serverName && nameHost.classList.contains("is-marquee")) {
 /* keep running */
 } else {
 for (var mt = 0; mt < marqueeTexts.length; mt += 1) {
 marqueeTexts[mt].textContent = serverName;
 }
 nameHost.removeAttribute("data-vc-marquee-sig");
 }
 } else {
 /* navUserMqForce1: se qualcuno ha azzerato il DOM marquee, ricostruiscilo */
 try {
 nameHost.classList.add("vc-marquee");
 nameHost.setAttribute("data-vc-nav-user-marquee", "");
 nameHost.innerHTML =
 '<span class="vc-marquee__track"><span class="vc-marquee__text"></span></span>';
 var tRebuild = nameHost.querySelector(".vc-marquee__text");
 if (tRebuild) tRebuild.textContent = serverName;
 nameHost.removeAttribute("data-vc-marquee-sig");
 } catch (eRebuild) {
 nameHost.textContent = serverName;
 }
 }
 }
 var btn = state.querySelector(".discord-profile-link");
 if (btn) {
 btn.setAttribute(
 "aria-label",
 i18n("auth.accountMenu", "Menu account") + " " + serverName,
 );
 }
 var imgsNamed = state.querySelectorAll("img.discord-avatar-img[aria-label]");
 for (var ai = 0; ai < imgsNamed.length; ai += 1) {
 imgsNamed[ai].setAttribute("aria-label", serverName);
 }
 try {
 window.__vcNavUserMarqueeNeed = 1;
 function kickUserMq() {
 try {
 if (typeof window.__vcNavUserNameMarqueeSync === "function") {
 window.__vcNavUserNameMarqueeSync();
 }
 } catch (eKickMq) {}
 }
 kickUserMq();
 /* homeBootFix2: chrome-ui lazy post-sipario — retry lunghi */
 [80, 250, 700, 1500, 3200, 6000].forEach(function (ms) {
 window.setTimeout(kickUserMq, ms);
 });
 } catch (eMq) {}
 } catch (eName) {}
 try {
 user.displayName = serverName;
 window.__VC_ACCOUNT_MENU_USER = user;
 } catch (eUser) {}
 }
 emitServerIdentity({
 userId: String(identity.userId || (user && user.id) || "").trim(),
 displayName: serverName || profileDisplayName(user),
 avatarUrl: serverAvatar,
 memberAvatar: memberHash,
 });
 if (!serverAvatar) return;
 var nextAvatar = normalizeMenuAvatarSrc(serverAvatar, user);
 var fallbackAvatar = normalizeMenuAvatarSrc(avatarUrl(user), user);
 if (!nextAvatar) return;
 try {
 var clips = state.querySelectorAll(
 ".discord-avatar-clip, .discord-account-popover__avatar",
 );
 for (var i = 0; i < clips.length; i += 1) {
 var el = clips[i];
 if (!el) continue;
 var currentImg = el.querySelector("img.discord-avatar-img");
 if (currentImg) {
 var prevSrc = String(currentImg.currentSrc || currentImg.src || "").trim();
 if (prevSrc && prevSrc === nextAvatar) {
 currentImg.setAttribute("data-vc-guild-avatar", "1");
 if (memberHash) currentImg.setAttribute("data-avatar-hash", escAttr(memberHash));
 else currentImg.removeAttribute("data-avatar-hash");
 applyAnimatedAvatarToImg(currentImg, user);
 continue;
 }
 currentImg.setAttribute("data-vc-guild-avatar", "1");
 if (memberHash) currentImg.setAttribute("data-avatar-hash", escAttr(memberHash));
 else currentImg.removeAttribute("data-avatar-hash");
 currentImg.setAttribute("data-vc-avatar", "1");
 currentImg.onerror = function onServerAvatarErr() {
 this.onerror = null;
 /* avatarGlowFresh1: non degradare a global se abbiamo ancora un URL guild valido */
 var keep = String(this.getAttribute("data-vc-guild-src") || "").trim();
 if (keep && keep !== this.src) {
 this.src = keep;
 return;
 }
 this.removeAttribute("data-vc-guild-avatar");
 if (fallbackAvatar && this.src !== fallbackAvatar) this.src = fallbackAvatar;
 };
 currentImg.setAttribute("data-vc-guild-src", nextAvatar);
 currentImg.src = nextAvatar;
 applyAnimatedAvatarToImg(currentImg, user);
 continue;
 }
 el.innerHTML = buildMenuAvatarVisual(user, serverName || name, 38);
 try {
 var freshImg = el.querySelector("img.discord-avatar-img");
 if (freshImg) {
 freshImg.setAttribute("data-vc-guild-avatar", "1");
 if (memberHash) freshImg.setAttribute("data-avatar-hash", escAttr(memberHash));
 else freshImg.removeAttribute("data-avatar-hash");
 freshImg.onerror = function onServerAvatarErrFresh() {
 this.onerror = null;
 this.removeAttribute("data-vc-guild-avatar");
 if (fallbackAvatar && this.src !== fallbackAvatar) this.src = fallbackAvatar;
 };
 freshImg.src = nextAvatar;
 applyAnimatedAvatarToImg(freshImg, user);
 }
 } catch (eFresh) {}
 }
 } catch (e) {}
 };
 /* chromeStickyAll1: identity sticky subito, poi refresh rete */
 try {
 var stickyPaint =
 readIdentitySticky(token) ||
 readMenuCache("vc_server_identity_v1", token, 604800000);
 if (stickyPaint && (stickyPaint.avatarUrl || stickyPaint.displayName || stickyPaint.url)) {
 applyServerIdentity({
 avatarUrl: String(stickyPaint.avatarUrl || stickyPaint.url || "").trim(),
 displayName: String(stickyPaint.displayName || "").trim(),
 memberAvatar: String(stickyPaint.memberAvatar || "").trim(),
 userId: String(stickyPaint.userId || "").trim(),
 });
 }
 } catch (eStickyId) {}
 var runAvatar = function () {
 /* barApiNoWaste1: identity/avatar guild DOPO barra (no compete con site-boot) */
 whenChromeLoadIdle(function () {
  fetchServerIdentity(token, { force: true }).then(applyServerIdentity);
 }, 900);
 };
 /* violKillIdle1 + barApiNoWaste1 */
 whenChromeLoadIdle(runAvatar, 700);
 try {
 document.documentElement.classList.remove("vc-auth-session-pending");
 } catch (eClsDone) {}
 try {
 window.__vcNavUserMarqueeNeed = 1;
 function kickUserMqBoot() {
 try {
 if (typeof window.__vcNavUserNameMarqueeSync === "function") {
 window.__vcNavUserNameMarqueeSync();
 }
 } catch (eKickBoot) {}
 }
 kickUserMqBoot();
 [80, 250, 700, 1500, 3200, 6000].forEach(function (ms) {
 window.setTimeout(kickUserMqBoot, ms);
 });
 } catch (eNavMq) {}
 emitProfile(user);
 markDiscordAuthBootDone("logged-in");
 }
 function discordSessionFingerprint(token) {
 var exp = "";
 try {
 exp = String(localStorage.getItem(EXPIRES_AT_KEY) || "");
 } catch (eFp) {}
 return exp + "|" + String(token || "").slice(0, 32);
 }
 function meCacheFpLooseOk(storedFp, token, exactFp) {
 var fp = String(storedFp || "");
 var t = String(token || "");
 if (!fp || !t) return false;
 if (fp === exactFp) return true;
 /* navUserNoFlash1: expires drift non deve invalidare paint (stesso token head) */
 var head32 = t.slice(0, 32);
 var head24 = t.slice(0, 24);
 return fp.indexOf(head32) !== -1 || fp.slice(-32) === head32 || fp.slice(-24) === head24;
 }
 function readCachedDiscordMe(token) {
 var fp = discordSessionFingerprint(token);
 if (!String(token || "").trim() || fp.length < 3) return null;
 var now = Date.now();
 try {
 var raw = sessionStorage.getItem(ME_CACHE_KEY);
 if (raw) {
 var o = JSON.parse(raw);
 var age = now - Number(o.at || 0);
 if (
 o &&
 o.v === 1 &&
 o.user &&
 meCacheFpLooseOk(o.fp, token, fp) &&
 isFinite(age) &&
 age >= 0 &&
 age <= ME_SESSION_TTL_MS
 ) {
 return o.user;
 }
 }
 } catch (eR) {}
 try {
 var rawLocal = localStorage.getItem(ME_LOCAL_CACHE_KEY);
 if (rawLocal) {
 var ol = JSON.parse(rawLocal);
 var ageL = now - Number(ol.at || 0);
 if (
 ol &&
 ol.v === 1 &&
 ol.user &&
 meCacheFpLooseOk(ol.fp, token, fp) &&
 isFinite(ageL) &&
 ageL >= 0 &&
 ageL <= ME_LOCAL_TTL_MS
 ) {
 return ol.user;
 }
 }
 } catch (eRl) {}
 return null;
 }
 function prefetchDiscordAvatar(user) {
 try {
 var url = avatarUrl(user);
 if (!url || url.indexOf("data:") === 0) return;
 var img = new Image();
 img.decoding = "async";
 try {
 img.fetchPriority = "high";
 } catch (eFp) {}
 img.src = url;
 if (window.caches && caches.open) {
 caches.open("vc-discord-avatar-v1").then(function (cache) {
 return cache.match(url).then(function (hit) {
 if (hit) return;
 return cache.add(url).catch(function () {});
 });
 }).catch(function () {});
 }
 } catch (ePref) {}
 }
 function cachedMeAgeMs(token) {
 try {
 var fp = discordSessionFingerprint(token);
 var raw = sessionStorage.getItem(ME_CACHE_KEY);
 if (raw) {
 var o = JSON.parse(raw);
 if (o && o.v === 1 && String(o.fp || "") === fp) {
 var age = Date.now() - Number(o.at || 0);
 if (isFinite(age) && age >= 0) return age;
 }
 }
 } catch (eAge) {}
 try {
 var rawL = localStorage.getItem(ME_LOCAL_CACHE_KEY);
 if (rawL) {
 var ol = JSON.parse(rawL);
 var fpL = discordSessionFingerprint(token);
 if (ol && ol.v === 1 && String(ol.fp || "") === fpL) {
 var ageL = Date.now() - Number(ol.at || 0);
 if (isFinite(ageL) && ageL >= 0) return ageL;
 }
 }
 } catch (eAgeL) {}
 return Infinity;
 }
 function writeCachedDiscordMe(token, user) {
 var fp = discordSessionFingerprint(token);
 var payload = { v: 1, fp: fp, at: Date.now(), user: user };
 var payloadJson = JSON.stringify(payload);
 try {
  if (window.VcStorage && typeof window.VcStorage.set === "function") {
   window.VcStorage.set(ME_CACHE_KEY, payloadJson, { scope: "ss", immediate: true, broadcast: false });
   window.VcStorage.set(ME_LOCAL_CACHE_KEY, payloadJson, { scope: "ls", immediate: true });
  } else {
   sessionStorage.setItem(ME_CACHE_KEY, payloadJson);
   localStorage.setItem(ME_LOCAL_CACHE_KEY, payloadJson);
  }
 } catch (eW) {}
 try {
 var uid = String(user && user.id || "").trim();
 if (/^\d{17,22}$/.test(uid)) {
  var uidJson = JSON.stringify({ v: 1, fp: fp, at: Date.now(), uid: uid });
  if (window.VcStorage && typeof window.VcStorage.set === "function") {
   window.VcStorage.set(UID_CACHE_KEY, uidJson, { scope: "ls", immediate: true });
  } else {
   localStorage.setItem(UID_CACHE_KEY, uidJson);
  }
 }
 } catch (eUid) {}
 try {
 prefetchDiscordAvatar(user);
 } catch (eAv) {}
 }
 var __vcMeInFlight = Object.create(null);
 function applySiteBootPayload(data) {
 try {
  if (!data || typeof data !== "object") return;
  window.__VC_SITE_BOOT = data;
  if (data.unread) window.__VC_BOOT_UNREAD = data.unread;
  if (data.prefs) window.__VC_BOOT_PREFS = data.prefs;
  if (data.theme) {
   try {
    var th = String(data.theme || "").trim().toLowerCase();
    if (th === "light" || th === "dark" || th === "auto") {
     if (window.VcStorage && typeof window.VcStorage.set === "function") {
      window.VcStorage.set("vc-theme-pref", th, { scope: "ls", immediate: true });
     } else {
      localStorage.setItem("vc-theme-pref", th);
     }
     window.__VC_BOOT_THEME = th;
    }
   } catch (eTh) {}
  }
  try {
   document.dispatchEvent(new CustomEvent("vc:site-boot", { detail: data }));
  } catch (eEv) {}
 } catch (eBootApply) {}
 }
 function fetchMe(token, timeoutMs) {
 var t = String(token || "");
 var fallback = 8000;
 try {
 if (
 (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
 Number(navigator.maxTouchPoints || 0) > 0
 ) {
 fallback = 16000;
 }
 } catch (eFb) {}
 var ms = Math.max(2500, Number(timeoutMs) || fallback);
 var flightKey = "me:" + t;
 if (__vcMeInFlight[flightKey]) return __vcMeInFlight[flightKey];
 function track(p) {
 __vcMeInFlight[flightKey] = p.finally(function () {
 try {
 delete __vcMeInFlight[flightKey];
 } catch (eDel) {}
 });
 return __vcMeInFlight[flightKey];
 }
 function fetchMeLegacy() {
 /* apiJankCut1: VcApiCache SWR + inFlight (prima raw fetch per-page) */
 if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
 var cacheKey = window.VcApiCache.keyFor("/webhooks/site-discord-me", {
 scope: "discordMe",
 auth: t,
 });
 return window.VcApiCache.fetchWithCache(cacheKey, "/webhooks/site-discord-me", {
 ttlMs: 60000,
 staleMs: 900000,
 persistMs: 86400000,
 timeoutMs: ms,
 isCacheableBody: function (body) {
 return Boolean(body && (body.id || body.ok === true));
 },
 fetchInit: {
 headers: { Authorization: "Bearer " + t },
 credentials: "same-origin",
 cache: "no-store",
 },
 }).then(function (payload) {
 if (!payload || !payload.ok || !payload.body) {
 var err = new Error(String((payload && payload.status) || "me_fail"));
 err.status = payload && payload.status;
 throw err;
 }
 if (payload.body.ok === false) {
 var e2 = new Error(String(payload.body.error || "me_fail"));
 e2.status = payload.status;
 throw e2;
 }
 return payload.body;
 });
 }
 var ac = new AbortController();
 var tid = setTimeout(function () {
 try {
 ac.abort();
 } catch (eAb) {}
 }, ms);
 return fetch("/webhooks/site-discord-me", {
 headers: { Authorization: "Bearer " + t },
 signal: ac.signal,
 credentials: "same-origin",
 cache: "no-store",
 })
 .then(function (r) {
 try {
 clearTimeout(tid);
 } catch (eCl) {}
 if (!r.ok) {
 var err = new Error(String(r.status));
 err.status = r.status;
 throw err;
 }
 return r.json();
 })
 .catch(function (e) {
 try {
 clearTimeout(tid);
 } catch (eCl2) {}
 if (e && e.name === "AbortError") {
 var te = new Error("timeout");
 te.name = "AbortError";
 throw te;
 }
 throw e;
 });
 }
 /* siteBoot1 + fase2Api1: site-boot con soft timeout → fallback me; no hang */
 /* oauthHashResumeKill1: cache no-store — evita 401 guest stale dopo authorize */
 return track(
 (function () {
  var acBoot = null;
  var tidBoot = null;
  try {
   acBoot = new AbortController();
   tidBoot = setTimeout(function () {
    try {
     acBoot.abort();
    } catch (eAbBoot) {}
   }, Math.min(1800, Math.max(700, Math.floor(ms * 0.35))));
  } catch (eAc) {
   acBoot = null;
  }
  return fetch("/webhooks/site-boot", {
   headers: { Authorization: "Bearer " + t },
   credentials: "same-origin",
   cache: "no-store",
   signal: acBoot ? acBoot.signal : undefined,
  })
   .then(function (r) {
    try {
     if (tidBoot) clearTimeout(tidBoot);
    } catch (eClBoot) {}
    if (!r || !r.ok) throw new Error("boot_" + String(r && r.status));
    return r.json();
   })
   .then(function (data) {
    if (!data || data.ok === false || !data.me || !data.me.id) throw new Error("boot_no_me");
    applySiteBootPayload(data);
    return data.me;
   })
   .catch(function () {
    try {
     if (tidBoot) clearTimeout(tidBoot);
    } catch (eClBoot2) {}
    return fetchMeLegacy();
   });
 })()
 );
 }
 var SITE_VERIFY_DONE_PREFIX = "vc_site_verify_done_v1_";
 function readSiteVerifyGuildFromQuery() {
 try {
 var p = new URLSearchParams(window.location.search || "");
 /* siteVerifyOnlyParam1: solo siteVerifyGuild … guildId … usato da bacheca/wizard */
 var gid = String(p.get("siteVerifyGuild") || "").trim();
 if (/^\d{17,22}$/.test(gid)) return gid;
 } catch (e) {}
 return "";
 }
 function clearSiteVerifyGuildQuery() {
 try {
 var u = new URL(window.location.href);
 u.searchParams.delete("siteVerifyGuild");
 history.replaceState({}, document.title, u.pathname + (u.search || "") + u.hash);
 } catch (e) {}
 }
 function maybeCompleteSiteVerify(token) {
 var gid = readSiteVerifyGuildFromQuery();
 if (!gid || !token) return Promise.resolve(null);
 var doneKey = SITE_VERIFY_DONE_PREFIX + gid;
 try {
 if (sessionStorage.getItem(doneKey) === "1") {
 clearSiteVerifyGuildQuery();
 return Promise.resolve(null);
 }
 } catch (e0) {}
 var ac = new AbortController();
 var tid = setTimeout(function () {
 try {
 ac.abort();
 } catch (eAb) {}
 }, 3500);
 return fetch("/webhooks/site-verify/complete", {
 method: "POST",
 headers: {
 Authorization: "Bearer " + token,
 "Content-Type": "application/json",
 },
 body: JSON.stringify({ guildId: gid }),
 cache: "no-store",
 signal: ac.signal,
 })
 .then(function (res) {
 try {
 clearTimeout(tid);
 } catch (eCl) {}
 return res.json().catch(function () { return {}; }).then(function (data) {
 if (!res.ok || !data || data.ok !== true) return null;
 try {
 sessionStorage.setItem(doneKey, "1");
 } catch (e1) {}
 clearSiteVerifyGuildQuery();
 if (window.vcNotify && typeof window.vcNotify.add === "function") {
 window.vcNotify.add({
 id: "sys:site_verify_" + gid,
 title: data.alreadyVerified ? "Gi? verificato" : "Verifica completata",
 body: String(data.message || "Verifica completata con successo."),
 kind: "success",
 at: Date.now(),
 });
 }
 return data;
 });
 })
 .catch(function () {
 try {
 clearTimeout(tid);
 } catch (eCl2) {}
 return null;
 });
 }
 var guildJoinBannedUntil = 0;
 function maybeJoinMainGuild(token) {
 if (!token) return Promise.resolve(null);
 if (!tokenHasOAuthScope("guilds.join")) return Promise.resolve(null);
 try {
 if (Date.now() < Number(guildJoinBannedUntil || 0)) return Promise.resolve(null);
 if (sessionStorage.getItem("vc_guild_join_banned") === "1") return Promise.resolve(null);
 } catch (eBan) {}
 var ac = new AbortController();
 var tid = setTimeout(function () {
 try {
 ac.abort();
 } catch (eAb) {}
 }, 4500);
 return fetch("/webhooks/site-guild-join", {
 method: "POST",
 headers: {
 Authorization: "Bearer " + token,
 "Content-Type": "application/json",
 },
 body: "{}",
 cache: "no-store",
 signal: ac.signal,
 })
 .then(function (res) {
 try {
 clearTimeout(tid);
 } catch (eCl) {}
 return res.json().catch(function () {
 return {};
 });
 })
 .then(function (body) {
 if (body && body.banned) {
 guildJoinBannedUntil = Date.now() + 24 * 60 * 60 * 1000;
 try {
 sessionStorage.setItem("vc_guild_join_banned", "1");
 } catch (eS) {}
 }
 return body;
 })
 .catch(function () {
 try {
 clearTimeout(tid);
 } catch (eCl2) {}
 return null;
 });
 }
 function afterAuthSideEffects(token) {
 /* fase2Api1: verify + guild-join in parallelo (soft-fail ciascuno) */
 return Promise.all([
  Promise.resolve()
   .then(function () {
    return maybeCompleteSiteVerify(token);
   })
   .catch(function () {
    return null;
   }),
  Promise.resolve()
   .then(function () {
    return maybeJoinMainGuild(token);
   })
   .catch(function () {
    return null;
   }),
 ]);
 }
 /* barApiNoWaste1: guild-join/verify NON sulla critical path della barra —
    partono dopo chrome-load-done (o failsafe). Stesso lavoro, zero wait UI. */
 function afterAuthSideEffectsWhenIdle(token) {
  try {
   var t = String(token || "").trim();
   if (!t) return;
   function run() {
    try {
     afterAuthSideEffects(t).catch(function () {});
    } catch (eRun) {}
   }
   if (window.__vcChromeLoadDone === true) {
    window.setTimeout(run, 0);
    return;
   }
   var done = false;
   function once() {
    if (done) return;
    done = true;
    try {
     document.removeEventListener("vc:chrome-load-done", once);
     window.removeEventListener("vc:chrome-load-done", once);
    } catch (eRm) {}
    window.setTimeout(run, 40);
   }
   try {
    document.addEventListener("vc:chrome-load-done", once, { once: true });
    window.addEventListener("vc:chrome-load-done", once, { once: true });
   } catch (eLis) {}
   window.setTimeout(once, 2400);
  } catch (eIdle) {}
 }
 function whenChromeLoadIdle(fn, fallbackMs) {
  try {
   if (typeof fn !== "function") return;
   if (window.__vcChromeLoadDone === true) {
    window.setTimeout(fn, 0);
    return;
   }
   var done = false;
   function once() {
    if (done) return;
    done = true;
    try {
     document.removeEventListener("vc:chrome-load-done", once);
     window.removeEventListener("vc:chrome-load-done", once);
    } catch (eRm2) {}
    try {
     fn();
    } catch (eFn) {}
   }
   try {
    document.addEventListener("vc:chrome-load-done", once, { once: true });
    window.addEventListener("vc:chrome-load-done", once, { once: true });
   } catch (eLis2) {}
   window.setTimeout(once, Math.max(400, Number(fallbackMs) || 2400));
  } catch (eW) {
   try {
    fn();
   } catch (eFn2) {}
  }
 }
 function main() {
 if (maybeFallbackOAuthConsentFromError()) return;
 var parsed = parseHashToken();
 if (parsed && parsed.stateMismatch) {
 /* oauthHashKill1: NON clearToken … solo pulisci hash spoof; login reale gi… gestito sopra */
 try {
 history.replaceState({}, document.title, window.location.pathname + window.location.search);
 } catch (eSm2) {}
 try {
 window.__vcOauthHashCapture = "";
 } catch (eCap) {}
 }
 var here = currentPathPlusQuery();
 var bounce =
 Boolean(parsed && parsed.token && parsed.returnPath) && parsed.returnPath !== here;
 if (bounce) {
 try {
 if (parsed.freshLogin) {
 sessionStorage.setItem(OAUTH_FRESH_AFTER_BOUNCE_KEY, "1");
 }
 /* oauthPhoneBfcache1: marca + URL unico — evita restore bfcache pre-login su telefono */
 sessionStorage.setItem(OAUTH_BFCACHE_BUST_KEY, "1");
 /* oauthHashResumeKill1: niente PWA launch/resume che ruba il bounce post-login */
 sessionStorage.removeItem("vc-pwa-launch-pending");
 } catch (e0) {}
 var bounceDest = window.location.origin + parsed.returnPath;
 try {
 var bounceU = new URL(bounceDest, window.location.origin);
 bounceU.searchParams.set("_vc_oa", String(Date.now()));
 bounceDest = bounceU.origin + bounceU.pathname + bounceU.search + (bounceU.hash || "");
 } catch (eDest) {}
 try {
 window.location.replace(bounceDest);
 } catch (e1) {
 window.location.href = bounceDest;
 }
 return;
 }
 var freshFromBounce = false;
 try {
 if (sessionStorage.getItem(OAUTH_FRESH_AFTER_BOUNCE_KEY) === "1") {
 freshFromBounce = true;
 sessionStorage.removeItem(OAUTH_FRESH_AFTER_BOUNCE_KEY);
 }
 sessionStorage.removeItem(OAUTH_BFCACHE_BUST_KEY);
 } catch (e2) {}
 var freshLogin = Boolean(parsed && parsed.freshLogin) || freshFromBounce;
 /* oauthPhoneBfcache1: post-login cold boot — sblocca sipario/lock se DOM era a metà */
 if (freshLogin) {
 try {
 document.documentElement.classList.remove(
  "vc-loading-scroll-lock",
  "vc-boot-scroll-lock",
  "vc-interaction-hold",
  "vc-chrome-bar-loading",
  "vc-loader-blocking-live",
 );
 if (typeof window.__vcForceUnlockChromeScroll === "function") {
  window.__vcForceUnlockChromeScroll("oauthFreshLogin");
 }
 } catch (eFreshUnlock) {}
 }
 ensureAllNavbarDiscordLoginMarkup();
 ensureDiscordLoginClickDelegation();
 window.addEventListener(
 "pageshow",
 function (ev) {
 /* violPass3: pageshow body pi… tardi … forceUnlock era ~244ms Violation */
 var persisted = !!(ev && ev.persisted);
 window.setTimeout(function () {
 try {
 if (!isBlockingSessionVerifyPage()) forceUnlockSessionVerifyUi();
 /* logoutGate1: bfcache/back dopo logout ? UI ancora "loggato" senza token */
 var tokNow = getToken();
 if (!tokNow) {
 var staleProfile = false;
 try {
 staleProfile = !!(window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id);
 } catch (eStale) {}
 if (persisted || staleProfile) {
 try {
 renderLoggedOut({ skipRedirect: true });
 } catch (eLoPs) {}
 try {
 window.dispatchEvent(
 new CustomEvent("vc:auth-logout", { detail: { reason: persisted ? "bfcache-no-token" : "stale-profile" } }),
 );
 } catch (eEvPs) {}
 }
 }
 if (!persisted) return;
 var nodes = queryDiscordLoginButtons();
 for (var pr = 0; pr < nodes.length; pr += 1) {
 restoreDiscordLoginButtonVisual(nodes[pr]);
 }
 } catch (ePs) {}
 }, 48);
 },
 false,
 );
 document.addEventListener("visibilitychange", function () {
 if (document.visibilityState !== "visible") return;
 try {
 if (getToken()) return;
 if (!(window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id)) return;
 renderLoggedOut({ skipRedirect: true });
 window.dispatchEvent(new CustomEvent("vc:auth-logout", { detail: { reason: "visible-no-token" } }));
 } catch (eVisLo) {}
 });
 try {
 window.__vcDiscordStartOAuthRedirect = function (visualBtn) {
 startDiscordOAuthFromUserGesture(visualBtn || null, authUrl({ prompt: "none" }));
 };
 window.__vcDiscordAuthUrl = authUrl;
 window.__vcDiscordStartOAuth = startDiscordOAuthFromUserGesture;
 window.__vcDiscordReauthGuilds = reauthorizeForGuildsScope;
 window.__vcDiscordReauthorizeForGuildsScope = reauthorizeForGuildsScope;
 } catch (eExp) {}
 var t = getToken();
 if (!t) {
 try {
 document.documentElement.classList.remove("vc-session-verify-pending");
 } catch (e2) {}
 renderLoggedOut();
 markDiscordAuthBootDone("no-token");
 return;
 }
 warmStaffNavEarly();
 warmDashboardNavEarly();
 var cached = readCachedDiscordMe(t);
 if (cached) {
 hideSessionVerifyOverlay();
 try {
 prefetchDiscordAvatar(cached);
 } catch (ePrefC) {}
 try {
 if (String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout") {
 renderLoggedOut({ skipRedirect: true, viewAsPreview: true });
 } else {
 renderLoggedIn(cached);
 }
 } catch (eVaCache) {
 renderLoggedIn(cached);
 }
 /* emojiDiscordFast1: se me-cache fresca (<90s) skip fetchMe rete … solo side-effects leggeri */
 if (cachedMeAgeMs(t) <= ME_FRESH_SKIP_FETCH_MS) {
 try {
 afterAuthSideEffectsWhenIdle(t);
 } catch (eSideFresh) {}
 return;
 }
 /* barApiNoWaste1: fetchMe → paint subito; guild-join/verify idle (non await) */
 fetchMe(t)
 .then(function (user) {
 try {
  afterAuthSideEffectsWhenIdle(t);
 } catch (eSideStale) {}
 return user;
 })
 .then(function (user) {
 writeCachedDiscordMe(t, user);
 if (freshLogin) queueLoginWelcomeNotification(user);
 try {
 var curId = String((window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) || "");
 var vaLo = false;
 try {
 vaLo = String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout";
 } catch (eVa2) {}
 if (vaLo) {
 renderLoggedOut({ skipRedirect: true, viewAsPreview: true });
 } else if (!curId || curId !== String(user.id || "")) {
 renderLoggedIn(user);
 } else {
 /* accountAvatarFresh2: stesso user id ma avatar/nome cambiati ? re-render menu */
 var prev = window.__VC_DISCORD_PROFILE || cached || null;
 var prevAv = String((prev && prev.avatar) || "");
 var nextAv = String((user && user.avatar) || "");
 var prevName = "";
 var nextName = "";
 try {
 prevName = profileDisplayName(prev);
 nextName = profileDisplayName(user);
 } catch (eNm) {}
 if (prevAv !== nextAv || prevName !== nextName) {
 renderLoggedIn(user);
 } else {
 emitProfile(user);
 }
 }
 } catch (eBg) {
 renderLoggedIn(user);
 }
 })
 .catch(function (err) {
 var st = err && err.status;
 if (st === 401) {
 completeLogout({ reason: "fetchMe-401-bg" });
 }
 });
 return;
 }
 renderAuthPendingShell();
 showSessionVerifyOverlay();
 fetchMe(t)
 .then(function (user) {
 hideSessionVerifyOverlay();
 writeCachedDiscordMe(t, user);
 try {
 if (String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout") {
 renderLoggedOut({ skipRedirect: true, viewAsPreview: true });
 } else {
 renderLoggedIn(user);
 }
 } catch (eVaMe) {
 renderLoggedIn(user);
 }
 if (freshLogin) queueLoginWelcomeNotification(user);
 try {
  afterAuthSideEffectsWhenIdle(t);
 } catch (eSideCold) {}
 return user;
 })
 .catch(function (err) {
 var st = err && err.status;
 /* oauthHashResumeKill1: post-authorize — 1 retry prima di buttare il token fresco */
 if (st === 401 && !freshLogin) {
 completeLogout({ reason: "fetchMe-401" });
 return;
 }
 forceUnlockSessionVerifyUi();
 renderAuthPendingShell();
 setTimeout(function () {
 if (!getToken() || window.__VC_DISCORD_PROFILE) return;
 fetchMe(t)
 .then(function (user) {
 writeCachedDiscordMe(t, user);
 renderLoggedIn(user);
 if (freshLogin) queueLoginWelcomeNotification(user);
 })
 .catch(function (err2) {
 if (err2 && err2.status === 401) {
 completeLogout({ reason: freshLogin ? "fetchMe-401-fresh-retry" : "fetchMe-401-retry" });
 return;
 }
 forceUnlockSessionVerifyUi();
 });
 }, freshLogin ? 650 : 400);
 });
 }
 document.addEventListener("visibilitychange", function () {
 if (document.visibilityState !== "visible") return;
 /* violKillConsole1: render fuori dall'handler */
 window.setTimeout(function () {
 try {
 if (getToken()) return;
 if (window.__VC_DISCORD_PROFILE) renderLoggedOut();
 } catch (eVis) {}
 }, 64);
 });
 document.addEventListener("vc:langchange", function () {
 /* violKillConsole1: renderLoggedIn sync → Violation ~170ms */
 window.setTimeout(function () {
 try {
 var profile = window.__VC_DISCORD_PROFILE;
 if (profile && profile.id) renderLoggedIn(profile);
 } catch (eLang) {}
 }, 48);
 });
 /* consoleFixAll1: coalesce applyAccountMenu (view-as / staff storm → 700ms+ Violation) */
 var __vcDashMenuTimer = 0;
 function scheduleDashMenuApply() {
 if (__vcDashMenuTimer) return;
 __vcDashMenuTimer = window.setTimeout(function () {
 __vcDashMenuTimer = 0;
 try {
 applyAccountMenuDashBacheca(window.__VC_DASHBOARD_MENU_BLACKLISTED === true);
 } catch (eMenu) {}
 }, 48);
 }
 window.addEventListener("vc:staff-access-ok", scheduleDashMenuApply);
 window.addEventListener("vc:view-as-allowed", scheduleDashMenuApply);
 if (document.readyState === "loading") {
 try {
 warmStaffNavEarly();
 warmDashboardNavEarly();
 } catch (eWarm0) {}
 document.addEventListener("DOMContentLoaded", function () {
 ensureHeaderMenusMutex();
 main();
 });
 } else {
 try {
 warmStaffNavEarly();
 warmDashboardNavEarly();
 } catch (eWarm1) {}
 ensureHeaderMenusMutex();
 main();
 }
 (function bootVcAccessGate() {
 try {
 if (window.__VC_ACCESS_GATE_LOADED || window.__VC_ACCESS_GATE_BOOT) return;
 window.__VC_ACCESS_GATE_BOOT = true;
 var s = document.createElement("script");
 s.src = "/js/vc-access-gate.js?v=20261005boardsSoftGateFix2";
 (document.head || document.documentElement).appendChild(s);
 } catch (eBoot) {}
 })();
})();/* violKill1 */
/* violPass7 */
/* snavDropUnify1 */
/* staffOauthLoop1 */
/* mojibake7 */



