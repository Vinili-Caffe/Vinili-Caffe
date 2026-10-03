(function () {
 var __vcRawStorageGetItem = null;
 try {
 if (!window.__vcViewAsLsTokenPatched) {
 window.__vcViewAsLsTokenPatched = true;
 __vcRawStorageGetItem = Storage.prototype.getItem;
 /* swLsStorm2: cache RAM view_as � ogni get token rileggeva sessionStorage */
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
 window.__VC_VIEW_AS_ALLOWED = false;
 } catch (eExpClr) {}
 t = "";
 }
 if (t && !viewAsLogout) {
 var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
 if (!exp || Date.now() < exp) {
 document.documentElement.classList.add("vc-auth-session-pending");
 document.documentElement.classList.remove("vc-auth-logged-out");
 }
 } else if (!viewAsLogout) {
 document.documentElement.classList.add("vc-auth-logged-out");
 document.documentElement.classList.remove("vc-auth-session-pending");
 } else {
 document.documentElement.classList.add("vc-view-as-guest");
 document.documentElement.classList.remove("vc-auth-logged-out");
 }
 } catch (eBootCls) {}
 (function ensureSiteHelperScripts() {
 try {
 function appendScript(path, forceVer) {
 var file = String(path || "").split("/").pop().replace(/\?.*$/, "");
 if (!file) return;
 path = String(path || "").split("?")[0];
 var authEl = document.querySelector('script[src*="discord-auth.js"]');
 var ver = null;
 try {
 var m = authEl && authEl.getAttribute("src") && authEl.getAttribute("src").match(/[?&]v=([^&]+)/);
 ver = forceVer || (m && m[1]) || String(Date.now());
 } catch (eVer) {
 ver = forceVer || String(Date.now());
 }
 var src = path + "?v=" + ver;
 var forceReplace =
 forceVer &&
 (file === "vc-nav-badges.js" || file === "vc-chrome-sync.js");
 if (forceReplace) {
 try {
 var stale = document.querySelectorAll('script[src*="' + file + '"]');
 var si;
 for (si = 0; si < stale.length; si += 1) {
 var curStale = String(stale[si].getAttribute("src") || "");
 if (curStale.indexOf("?v=" + ver) !== -1 || curStale.indexOf("&v=" + ver) !== -1) {
 continue;
 }
 if (stale[si].parentNode) stale[si].parentNode.removeChild(stale[si]);
 }
 } catch (eRmAll) {}
 }
 var existing = document.querySelector('script[src*="' + file + '"]');
 if (existing) {
 try {
 var cur = String(existing.getAttribute("src") || "");
 if (cur === src || cur.indexOf(path + "?v=" + ver) !== -1) return;
 if (forceVer) {
 if (
 (file === "vc-nav-badges.js" || file === "vc-chrome-sync.js") &&
 existing.parentNode
 ) {
 existing.parentNode.removeChild(existing);
 } else {
 existing.setAttribute("src", src);
 return;
 }
 } else {
 return;
 }
 } catch (eUp) {
 return;
 }
 }
 var s = document.createElement("script");
 s.src = src;
 if (file === "vc-dialog.js") s.setAttribute("data-vc-dialog", "1");
 if (file === "vc-image-lightbox.js") s.setAttribute("data-vc-img-lightbox", "1");
 if (file === "vc-view-as.js") s.async = false;
 else s.defer = true;
 (document.head || document.documentElement).appendChild(s);
 }
 function ensureI18nScripts() {
 try {
 if (document.querySelector('script[src*="vc-i18n.js"]')) return;
 var need =
 document.getElementById("vc-lang-toggle") ||
 document.getElementById("vc-lang-dropdown") ||
 document.querySelector("[data-i18n],[data-i18n-html],[data-i18n-title],[data-i18n-attr]");
 if (!need) return;
 appendScript("/js/vc-i18n.js", I18N_VER);
 appendScript("/js/vc-i18n-pages.js", I18N_VER);
 } catch (eI18nEnsure) {}
 }
 function scheduleEnsureI18nScripts() {
 try {
 ensureI18nScripts();
 if (document.readyState === "loading") {
 document.addEventListener("DOMContentLoaded", ensureI18nScripts, { once: true });
 }
 } catch (eI18nSched) {}
 }
 function appendStylesheet(path, forceVer) {
 var file = String(path || "").split("/").pop().replace(/\?.*$/, "");
 if (!file) return;
 path = String(path || "").split("?")[0];
 var existingById = null;
 try {
 if (file === "vc-site-chrome-ui.css") existingById = document.getElementById("vc-site-chrome-ui-css");
 else if (file === "vc-soft-fx.css") existingById = document.getElementById("vc-soft-fx-css");
 else if (file === "vc-nav-chrome-fix.css") existingById = document.getElementById("vc-nav-chrome-fix-css");
 else if (file === "vc-glow-fix.css") existingById = document.getElementById("vc-glow-fix-css");
 else if (file === "vc-nav-menu-solid.css") existingById = document.getElementById("vc-nav-menu-solid-css");
 } catch (eId) {
 existingById = null;
 }
 var existing = existingById || document.querySelector('link[href*="' + file + '"]');
 var ver = null;
 try {
 var existingAuth = document.querySelector('script[src*="discord-auth.js"]');
 var m = existingAuth && existingAuth.getAttribute("src") && existingAuth.getAttribute("src").match(/[?&]v=([^&]+)/);
 ver = forceVer || (m && m[1]) || String(Date.now());
 } catch (eVer) {
 ver = forceVer || String(Date.now());
 }
 var href = path + "?v=" + ver;
 var stableChrome =
 file === "vc-soft-fx.css" ||
 file === "vc-glow-fix.css" ||
 file === "vc-nav-menu-solid.css" ||
 file === "vc-site-chrome-ui.css" ||
 file === "vc-nav-chrome-fix.css";
 if (existing && stableChrome) {
 try {
 existing.media = "all";
 existing.removeAttribute("onload");
 if (file === "vc-soft-fx.css" && !existing.id) existing.id = "vc-soft-fx-css";
 if (file === "vc-glow-fix.css" && !existing.id) existing.id = "vc-glow-fix-css";
 if (file === "vc-nav-menu-solid.css" && !existing.id) existing.id = "vc-nav-menu-solid-css";
 if (file === "vc-site-chrome-ui.css" && !existing.id) existing.id = "vc-site-chrome-ui-css";
 if (file === "vc-nav-chrome-fix.css" && !existing.id) existing.id = "vc-nav-chrome-fix-css";
 var curStable = String(existing.getAttribute("href") || "");
 var verMismatch =
 forceVer &&
 curStable.indexOf("?v=" + forceVer) === -1 &&
 curStable.indexOf("&v=" + forceVer) === -1;
 /* avatarGlowFresh1: upgrade SEMPRE su mismatch (soft-fx + glow-form + chrome).
    Prima: se sheetOk restava ?v=softFxNoFouc2 in cache CDN ? anello avatar sparito. */
 if (verMismatch) {
 if (file === "vc-soft-fx.css") {
 /* pwaCpuNuke4: MAI togliere vc-soft-fx-ready su upgrade ?
    opacity:0 + pe:none = freeze totale (soprattutto PWA) finch? load non arriva. */
 window.__vcSoftFxHrefLocked = true;
 try {
 existing.addEventListener(
 "load",
 function () {
 try {
 existing.setAttribute("data-vc-sheet-loaded", "1");
 markSoftFxReady(existing);
 } catch (eLdUp) {}
 },
 { once: true }
 );
 } catch (eLdBind) {}
 }
 existing.setAttribute("href", href);
 }
 } catch (eStable) {}
 return;
 }
 if (existing) {
 try {
 var curHref = String(existing.getAttribute("href") || "");
 if (curHref === href || curHref.indexOf(path + "?v=" + ver) !== -1) {
 return;
 }
 existing.setAttribute("href", href);
 return;
 } catch (eUp) {}
 }
 var link = document.createElement("link");
 link.rel = "stylesheet";
 link.href = href;
 if (file === "vc-image-lightbox.css") link.id = "vc-image-lightbox-css";
 if (file === "vc-site-chrome-ui.css") link.id = "vc-site-chrome-ui-css";
 if (file === "vc-soft-fx.css") link.id = "vc-soft-fx-css";
 if (file === "vc-glow-fix.css") link.id = "vc-glow-fix-css";
 if (file === "vc-nav-menu-solid.css") link.id = "vc-nav-menu-solid-css";
 if (file === "vc-nav-chrome-fix.css") link.id = "vc-nav-chrome-fix-css";
 if (
 file === "vc-soft-fx.css" ||
 file === "vc-glow-form.css" ||
 file === "vc-nav-menu-solid.css" ||
 file === "vc-site-chrome-ui.css" ||
 file === "vc-nav-chrome-fix.css"
 ) {
 link.media = "all";
 }
 (document.head || document.documentElement).appendChild(link);
 }
 function softFxSheetReady(link) {
 if (!link) return false;
 try {
 var n =
 (link.sheet && link.sheet.cssRules && link.sheet.cssRules.length) ||
 (link.sheet && link.sheet.rules && link.sheet.rules.length) ||
 0;
 if (n > 0) return true;
 } catch (eSh) {
 if (link.getAttribute("data-vc-sheet-loaded") === "1") return true;
 }
 return false;
 }
 function markSoftFxReady(link) {
 try {
 if (!softFxSheetReady(link)) return false;
 var alreadyReady = false;
 try {
 alreadyReady = document.documentElement.classList.contains("vc-soft-fx-ready");
 } catch (eAr) {}
 document.documentElement.classList.add("vc-soft-fx-ready");
 /* lightPerf1: pin light solo al primo ready (evita loop head?pin?head) */
 if (!alreadyReady) {
 try {
 if (window.__vcTheme && typeof window.__vcTheme.pinLast === "function") {
 window.__vcTheme.pinLast();
 } else {
 document.dispatchEvent(new CustomEvent("vc:soft-fx-ready"));
 }
 } catch (ePinLight) {}
 }
 try {
 pinNavChromeFixLast(typeof NAV_CHROME_FIX_VER !== "undefined" ? NAV_CHROME_FIX_VER : null);
 } catch (ePinChrome) {}
 return true;
 } catch (eMk) {
 return false;
 }
 }

 function pinNavChromeFixLast(ver) {
 try {
 var fix = document.getElementById("vc-nav-chrome-fix-css");
 if (!fix) fix = document.querySelector('link[href*="vc-nav-chrome-fix.css"]');
 if (!fix) {
 appendStylesheet("/css/vc-nav-chrome-fix.css", ver || NAV_CHROME_FIX_VER);
 fix = document.getElementById("vc-nav-chrome-fix-css") || document.querySelector('link[href*="vc-nav-chrome-fix.css"]');
 }
 if (!fix || !fix.parentNode) return;
 fix.id = "vc-nav-chrome-fix-css";
 fix.media = "all";
 var verOkFix = true;
 if (ver) {
 var want = "/css/vc-nav-chrome-fix.css?v=" + String(ver);
 var cur = String(fix.getAttribute("href") || "");
 verOkFix = cur.indexOf("?v=" + ver) !== -1 || cur.indexOf("&v=" + ver) !== -1;
 if (!verOkFix) {
 fix.setAttribute("href", want);
 }
 }
 /* navBootTrim1: move solo se non � gi� ultimo (appendChild = style recalc full) */
 try {
 if (fix.parentNode.lastElementChild !== fix) {
 fix.parentNode.appendChild(fix);
 }
 } catch (eMove) {}
 /* navChromeFix6: riscrivi vc-nav-noflash (1px+shadow) ? 2px transparent */
 try {
 var nf = document.getElementById("vc-nav-noflash");
 if (nf && nf.textContent && nf.textContent.indexOf("border:1px solid") !== -1) {
 nf.textContent = nf.textContent
 .replace(/border:1px solid rgba\(255,255,255,\.1\)!important/g, "border:2px solid transparent!important")
 .replace(/box-shadow:0 4px 24px rgba\(0,0,0,\.55\),inset 0 1px 0 rgba\(255,255,255,\.06\)!important/g, "box-shadow:none!important")
 .replace(/background-image:none!important/g, "background-image:none!important");
 }
 } catch (eNf) {}
 } catch (ePinFix) {}
 } function pinSoftFxLast(ver) {
 try {
 var softPin = document.getElementById("vc-soft-fx-css");
 if (!softPin) softPin = document.querySelector('link[href*="vc-soft-fx.css"]');
 if (!softPin || !softPin.parentNode) return;
 softPin.id = "vc-soft-fx-css";
 softPin.media = "all";
 softPin.removeAttribute("onload");
 document.querySelectorAll('link[href*="vc-soft-fx.css"]').forEach(function (l) {
 if (l !== softPin && l.parentNode) l.parentNode.removeChild(l);
 });
 var verOk = true;
 if (ver) {
 var want = "/css/vc-soft-fx.css?v=" + String(ver);
 var curPin = String(softPin.getAttribute("href") || "");
 verOk = curPin.indexOf("?v=" + ver) !== -1 || curPin.indexOf("&v=" + ver) !== -1;
 /* acctNameAvFresh2: se la ver non matcha, upgrade SEMPRE (il lock early-return
    lasciava soft-fx vecchio ? nome account bianco senza gradient) */
 if (!verOk) {
 softPin.setAttribute("href", want);
 window.__vcSoftFxHrefLocked = true;
 softPin.addEventListener(
 "load",
 function () {
 try {
 softPin.setAttribute("data-vc-sheet-loaded", "1");
 } catch (eLd) {}
 markSoftFxReady(softPin);
 },
 { once: true }
 );
 } else {
 window.__vcSoftFxHrefLocked = true;
 if (!(softFxSheetReady(softPin) && markSoftFxReady(softPin))) {
 if (!markSoftFxReady(softPin)) {
 softPin.addEventListener(
 "load",
 function () {
 try {
 softPin.setAttribute("data-vc-sheet-loaded", "1");
 } catch (eLd2) {}
 markSoftFxReady(softPin);
 },
 { once: true }
 );
 }
 }
 }
 } else {
 /* navBootTrim1: gi� pronto ? stop (niente re-pin / load storm) */
 if (!(softFxSheetReady(softPin) && markSoftFxReady(softPin))) {
 if (!markSoftFxReady(softPin)) {
 softPin.addEventListener(
 "load",
 function () {
 try {
 softPin.setAttribute("data-vc-sheet-loaded", "1");
 } catch (eLd3) {}
 markSoftFxReady(softPin);
 },
 { once: true }
 );
 }
 }
 }
 } catch (ePin) {}
 /* pwaIdleCpu1: dopo pin soft-fx, nuke-css deve restare ULTIMO + re-arm PWA */
 try {
 if (window.VcPerf && typeof window.VcPerf.armPwaCpuNuke === "function") {
 window.VcPerf.armPwaCpuNuke();
 }
 var nukeCss = document.getElementById("vc-pwa-cpu-nuke-css");
 if (nukeCss) {
 var mountNuke = document.body || document.documentElement;
 if (mountNuke) mountNuke.appendChild(nukeCss);
 }
 try {
 if (window.VcPerf && typeof window.VcPerf.armSiteCpuSoft === "function") {
 window.VcPerf.armSiteCpuSoft();
 }
 var softCss = document.getElementById("vc-site-cpu-soft-css");
 if (softCss) {
 var mountSoft = document.body || document.documentElement;
 if (mountSoft) mountSoft.appendChild(softCss);
 }
 } catch (eSoftPin) {}
 } catch (eNukePin) {}
 try {
 pinEmojiColorLast(EMOJI_COLOR_VER);
 } catch (eEmojiPin) {}
 }
 function pinEmojiColorLast(ver) {
 try {
 var link = document.getElementById("vc-emoji-color-css");
 if (!link) link = document.querySelector('link[href*="vc-emoji-color.css"]');
 if (!link) {
 link = document.createElement("link");
 link.rel = "stylesheet";
 link.id = "vc-emoji-color-css";
 link.href = "/css/vc-emoji-color.css?v=" + String(ver || EMOJI_COLOR_VER);
 (document.body || document.documentElement).appendChild(link);
 } else {
 link.id = "vc-emoji-color-css";
 if (ver) {
 var want = "/css/vc-emoji-color.css?v=" + String(ver);
 var cur = String(link.getAttribute("href") || "");
 if (cur.indexOf("?v=" + ver) === -1 && cur.indexOf("&v=" + ver) === -1) {
 link.setAttribute("href", want);
 }
 }
 var mount = document.body || document.documentElement;
 if (mount) mount.appendChild(link);
 }
 } catch (ePinEmoji) {}
 }
 function watchSoftFxLast() {
 try {
 if (window.__vcSoftFxPinDone) return;
 window.__vcSoftFxPinDone = 1;
 /* cpuPagesIdle1: one-shot pin sitewide (MO head = CPU storm su inject/nav/reload) */
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 window.setTimeout(function () {
 try {
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 if (window.VcPerf && typeof window.VcPerf.armSiteCpuSoft === "function") {
 window.VcPerf.armSiteCpuSoft();
 }
 } catch (ePin2) {}
 }, 400);
 try {
 if (window.__vcSoftFxPinObs) {
 window.__vcSoftFxPinObs.disconnect();
 window.__vcSoftFxPinObs = null;
 }
 } catch (eDiscOld) {}
 } catch (eObs) {}
 }
 if (!window.VcFormDrafts) appendScript("/js/vc-form-drafts.js", "20261003draftToast1");
 if (!window.VcDialog) appendScript("/js/vc-dialog.js", "20261002compitiScrollUnlock2");
 appendStylesheet("/css/vc-image-lightbox.css", "20260908imgLightbox2");
 if (!window.VcImageLightbox) appendScript("/js/vc-image-lightbox.js", "20260908imgLightbox2");
var SOFT_FX_VER = "20261003boardsFormCleanPrefix1";
var EMOJI_COLOR_VER = "20261003boardsTagsPick1";
var EMOJI_RENDER_VER = "20261003bakeEmoji1";
var NAV_CHROME_VER = "20261002violPass12";
var NAV_CHROME_FIX_VER = "20260930navMarqueeConfStaff1";
 var KICKER_HACK_VER = "20261002violPass12";
 /* violPass12 */
 var CHROME_SYNC_VER = "20260928lsGetStorm1";
 var NAV_BADGES_VER = "20260928lsGetStorm1";
 var NOTIF_CHROME_VER = "20261002notifSheetUnifyGuard1";
 var LANDING_NOTIF_VER = "20261002violPass12";
 var API_CACHE_VER = "20261002violPass10";
 var TYPE_SFX_VER = "20260930typeSfxFocusOnly1";
 var LANDING_EXT_VER = "20261003candLabelScale1";
 var I18N_VER = "20261002langMenuBind1";
 var WT_LAYOUT_VER = "20260929loadScrollLockAll2";
 var PERF_VER = "20260930pushOpenCold2";
 var USER_LEADER_VER = "20260929ulCountStick1";
 /* loadScrollLockAll2: CSS lock su TUTTE le pagine (anche senza vc-landing / dashboard skip) */
 try {
 (function injectGlobalLoadScrollLockCss() {
 var ID = "vc-global-load-scroll-lock-css";
 var css =
 "html.vc-page-cine-boot:not(.vc-page-cine-ready)," +
 "html.vc-page-cine-boot:not(.vc-page-cine-ready) body," +
 "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready)," +
 "html.vc-site-polish.vc-page-cine-boot:not(.vc-page-cine-ready) body," +
 "html.vc-user-leader-pending,html.vc-user-leader-pending body," +
 "html.vc-user-profile-pending,html.vc-user-profile-pending body," +
 "html.vc-loading-scroll-lock,html.vc-loading-scroll-lock body," +
 "html.vc-loading-scroll-lock body.vc-body," +
 "html.vc-loader-blocking-live,html.vc-loader-blocking-live body," +
 "html.vc-loader-blocking-live body.vc-body," +
 "html.vc-interaction-hold,html.vc-interaction-hold body," +
 "html.vc-rank-customize-pending,html.vc-rank-customize-pending body," +
 "html.vc-custom-profile-pending,html.vc-custom-profile-pending body," +
 "html.vc-session-verify-pending,html.vc-session-verify-pending body," +
 "html.vc-staff-access-pending:not(.vc-staff-app-revealed)," +
 "html.vc-staff-access-pending:not(.vc-staff-app-revealed) body," +
 "html.vc-dash-access-pending:not(.vc-dash-access-ready)," +
 "html.vc-dash-access-pending:not(.vc-dash-access-ready) body," +
 "html.vc-chrome-bar-loading,html.vc-chrome-bar-loading body," +
 "html.vc-chrome-bar-loading body.vc-body," +
 "html:has(#vc-site-progress.is-loading)," +
 "html:has(#vc-site-progress.is-loading) body," +
 "html.vc-site-polish.vc-loading-scroll-lock body.vc-body," +
 "html.vc-site-polish.vc-loader-blocking-live body.vc-body," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loading-scroll-lock body.vc-body," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loader-blocking-live body.vc-body," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loading-scroll-lock body.vc-web-tickets-page," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loader-blocking-live body.vc-web-tickets-page," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loading-scroll-lock body.vc-users-page," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loader-blocking-live body.vc-users-page," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loading-scroll-lock body.vc-roles-page," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loader-blocking-live body.vc-roles-page," +
 "html:has(#vc-shared-boot-overlay:not([hidden]))," +
 "html:has(#vc-shared-boot-overlay:not([hidden])) body," +
 "html:has(.vc-ul-loading:not([hidden]))," +
 "html:has(.vc-ul-loading:not([hidden])) body," +
 "html:has(#vc-roles-loading:not([hidden]))," +
 "html:has(#vc-roles-loading:not([hidden])) body," +
 "html:has(#vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden))," +
 "html:has(#vc-staff-loading:not([hidden]):not(.vc-staff-loading--hidden)) body," +
 "html:has(.vc-session-verify-overlay:not(.vc-session-verify-overlay--hidden))," +
 "html:has(.vc-session-verify-overlay:not(.vc-session-verify-overlay--hidden)) body," +
 "html:has(#vc-cine-boot-curtain:not([hidden]))," +
 "html:has(#vc-cine-boot-curtain:not([hidden])) body," +
 "html:has(.vc-page-transition--on)," +
 "html:has(.vc-page-transition--on) body{" +
 "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
 "overscroll-behavior:none!important;touch-action:none!important;" +
 "height:100%!important;max-height:100dvh!important;" +
 "scrollbar-width:none!important}" +
 "html.vc-chrome-bar-loading::-webkit-scrollbar," +
 "html.vc-loading-scroll-lock::-webkit-scrollbar," +
 "html.vc-interaction-hold::-webkit-scrollbar," +
 "html:has(#vc-site-progress.is-loading)::-webkit-scrollbar{width:0!important;height:0!important;display:none!important}" +
 "html.vc-page-cine-ready.vc-loading-scroll-lock," +
 "html.vc-page-cine-ready.vc-loading-scroll-lock body," +
 "html.vc-page-cine-ready.vc-loader-blocking-live," +
 "html.vc-page-cine-ready.vc-loader-blocking-live body," +
 "html.vc-page-cine-ready.vc-interaction-hold," +
 "html.vc-page-cine-ready.vc-interaction-hold body," +
 "html.vc-page-cine-ready.vc-chrome-bar-loading," +
 "html.vc-page-cine-ready.vc-chrome-bar-loading body," +
 "html.vc-page-cine-ready:has(#vc-site-progress.is-loading)," +
 "html.vc-page-cine-ready:has(#vc-site-progress.is-loading) body," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loading-scroll-lock body.vc-body," +
 "html.vc-site-polish.vc-page-cine-ready.vc-loader-blocking-live body.vc-body{" +
 "overflow:hidden!important;overflow-x:hidden!important;overflow-y:hidden!important;" +
 "overscroll-behavior:none!important;touch-action:none!important;" +
 "scrollbar-width:none!important}";
 var el = document.getElementById(ID);
 if (!el) {
 el = document.createElement("style");
 el.id = ID;
 el.setAttribute("data-vc", "hamScrollBarGate1");
 }
 el.textContent = css;
 var host = document.head || document.documentElement;
 if (el.parentNode !== host) host.appendChild(el);
 else if (host.lastChild !== el) host.appendChild(el);
 })();
 } catch (eLoadLockCss) {}
 try {
 (function armGlobalLoadScrollLockFallback() {
 if (window.__vcGlobalLoadScrollArmed) return;
 window.__vcGlobalLoadScrollArmed = 1;
 function loaderAlive(el) {
 if (!el) return false;
 try {
 if (el.hidden || el.hasAttribute("hidden")) return false;
 if (el.classList && el.classList.contains("vc-staff-loading--hidden")) return false;
 if (el.classList && el.classList.contains("vc-session-verify-overlay--hidden")) return false;
 /* violPass6: niente getComputedStyle (Forced reflow in tick loader) */
 return (el.offsetWidth || 0) > 0 || (el.offsetHeight || 0) > 0;
 } catch (e) {
 return true;
 }
 }
 function tick() {
 try {
 if (typeof window.__vcSyncLoaderScrollLock === "function") {
 window.__vcSyncLoaderScrollLock();
 return;
 }
 var root = document.documentElement;
 var live = false;
 if (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) live = true;
 if (root.classList.contains("vc-interaction-hold")) live = true;
 if (root.classList.contains("vc-user-leader-pending") || root.classList.contains("vc-user-profile-pending")) live = true;
 if (root.classList.contains("vc-rank-customize-pending") || root.classList.contains("vc-custom-profile-pending")) live = true;
 if (root.classList.contains("vc-session-verify-pending")) live = true;
 if (root.classList.contains("vc-staff-access-pending") && !root.classList.contains("vc-staff-app-revealed")) live = true;
 if (root.classList.contains("vc-dash-access-pending") && !root.classList.contains("vc-dash-access-ready")) live = true;
 if (root.classList.contains("vc-chrome-bar-loading")) live = true;
 /* bootBarScrollPre1: gap pre-barra � chrome non ancora bootato */
 if (!live && !window.__vcChromeUiBooted && window.__vcChromeLoadDone !== true) {
 try {
 var age = Date.now() - Number(window.__vcCineBootStartedAt || 0);
 if (!window.__vcCineBootStartedAt || age < 4500) live = true;
 } catch (eAge) {
 live = true;
 }
 }
 if (!live && window.__vcChromeUiBooted && !window.__vcChromeLoadDone) live = true;
 /* hamScrollBarGate1: LoadDone ma barra top ancora in fill ? tieni lock */
 if (!live && window.__vcChromeLoadDone && !window.__vcChromeScrollArmed) live = true;
 var progEl = document.getElementById("vc-site-progress");
 if (!live && progEl && progEl.classList.contains("is-loading")) live = true;
 if (!live && loaderAlive(document.getElementById("vc-shared-boot-overlay"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-cine-boot-curtain"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-roles-loading"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-staff-loading"))) live = true;
 if (!live && loaderAlive(document.getElementById("vc-ul-loading"))) live = true;
 if (!live && loaderAlive(document.querySelector(".vc-session-verify-overlay"))) live = true;
 root.classList.toggle("vc-loader-blocking-live", live);
 if (live) root.classList.add("vc-loading-scroll-lock");
 else if (
 !root.classList.contains("vc-interaction-hold") &&
 !root.classList.contains("vc-chrome-bar-loading") &&
 !(window.__vcChromeLoadDone && !window.__vcChromeScrollArmed)
 ) {
 root.classList.remove("vc-loading-scroll-lock");
 }
 } catch (eTick) {}
 }
 window.__vcSyncLoaderScrollLock = tick;
 tick();
 window.setTimeout(tick, 200);
 window.setTimeout(tick, 800);
 window.setTimeout(tick, 2000);
 document.addEventListener("DOMContentLoaded", tick, { once: true });
 window.addEventListener("pageshow", tick);
 document.addEventListener("visibilitychange", function () {
 if (document.visibilityState === "visible") tick();
 });
 try {
 if (typeof MutationObserver !== "undefined") {
 var moT = 0;
 var mo = new MutationObserver(function () {
 if (moT) return;
 /* extCspNoiseKill1 / loadScrollMoLite1: debounce pi� lungo, niente getComputedStyle storm */
 moT = window.setTimeout(function () {
 moT = 0;
 tick();
 }, 180);
 });
 mo.observe(document.documentElement, {
 attributes: true,
 attributeFilter: ["class", "hidden"],
 subtree: false,
 });
 window.setTimeout(function () {
 try {
 if (document.body) {
 /* solo childList body (no subtree+attributes ? Violation setTimeout) */
 mo.observe(document.body, { childList: true, subtree: false, attributes: false });
 }
 var ids = ["vc-shared-boot-overlay", "vc-cine-boot-curtain", "vc-roles-loading", "vc-staff-loading", "vc-ul-loading"];
 for (var ii = 0; ii < ids.length; ii += 1) {
 var el = document.getElementById(ids[ii]);
 if (el) mo.observe(el, { attributes: true, attributeFilter: ["hidden", "class"] });
 }
 } catch (eBody) {}
 }, 0);
 }
 } catch (eMo) {}
 })();
 } catch (eLoadLockArm) {}
 appendStylesheet("/css/vc-glow-fix.css", NAV_CHROME_VER);
 appendStylesheet("/css/vc-site-chrome-ui.css", NAV_CHROME_VER);
 appendStylesheet("/css/vc-nav-menu-solid.css", NAV_CHROME_VER);
 appendStylesheet("/css/vc-soft-fx.css", SOFT_FX_VER);
 appendStylesheet("/css/vc-nav-chrome-fix.css", NAV_CHROME_FIX_VER);
 appendStylesheet("/css/vc-emoji-color.css", EMOJI_COLOR_VER);
 try {
 if (!window.VcEmojiColor) appendScript("/js/vc-emoji-color.js", EMOJI_COLOR_VER);
 } catch (eEmojiColor) {
 appendScript("/js/vc-emoji-color.js", EMOJI_COLOR_VER);
 }
 /* bakeEmoji1: Twemoji img bake sitewide (beats soft-fx monochrome glyphs) */
 try {
 if (!window.VcEmojiRender) appendScript("/js/vc-emoji-render.js", EMOJI_RENDER_VER);
 } catch (eEmojiRender) {
 appendScript("/js/vc-emoji-render.js", EMOJI_RENDER_VER);
 }
 try {
 if (!window.VcApiCache || !window.VcApiCache.__siteApiW4) {
 appendScript("/js/vc-api-cache.js", API_CACHE_VER);
 }
 } catch (eApiCache) {
 appendScript("/js/vc-api-cache.js", API_CACHE_VER);
 }
 appendScript("/js/vc-site-chrome-ui.js", NAV_CHROME_VER);
 try {
 if (!window.__VC_SITE_NOTIFS || typeof window.__VC_SITE_NOTIFS !== "object") {
 window.__VC_SITE_NOTIFS = {
 apiUrl: "/webhooks/site-notifications",
 apiUrlLocal: "",
 wsEnabled: true,
 };
 } else if (!window.__VC_SITE_NOTIFS.apiUrl) {
 window.__VC_SITE_NOTIFS.apiUrl = "/webhooks/site-notifications";
 }
 } catch (eNotifCfg) {}
 try {
 /* notifSheetUnifyDash1: anche dashboard usa lo stesso sheet/chunk (niente skip) */
 var skipLandingNotif = false;
 /* notifUnifyFix1: forza landing/notif chunk allineati su tutte le pagine */
 var needLanding = !skipLandingNotif;
 try {
 if (window.__VC_LANDING_NOTIF_CLIENT_VER !== LANDING_NOTIF_VER) {
 needLanding = !skipLandingNotif;
 window.__VC_LANDING_NOTIF_CLIENT = false;
 window.__vcLandingNotifReady = 0;
 window.__vcLandingNotifLoading = 0;
 }
 } catch (eVer) {}
 if (needLanding && !window.__VC_LANDING_NOTIF_CLIENT) {
 window.__VC_LANDING_NOTIF_CLIENT = true;
 window.__VC_LANDING_NOTIF_CLIENT_VER = LANDING_NOTIF_VER;
 appendScript("/js/vc-landing.js", LANDING_NOTIF_VER);
 }
 } catch (eLandingNotif) {}
 /* langMenuBind1: pagine con toggle lingua ma senza vc-i18n.js in HTML (confessionale, dashboard, staff, puzzle) */
 scheduleEnsureI18nScripts();
 try {
 if (window.VcNotifChrome && window.VcNotifChrome.ver !== NOTIF_CHROME_VER) {
 window.VcNotifChrome = null;
 }
 } catch (eNotifClr) {}
 if (!window.VcNotifChrome || window.VcNotifChrome.ver !== NOTIF_CHROME_VER) {
 appendScript("/js/vc-notif-chrome.js", NOTIF_CHROME_VER);
 }
 try {
 if (window.VcChromeSync && window.VcChromeSync.ver !== CHROME_SYNC_VER) {
 window.VcChromeSync = null;
 window.__VC_CHROME_SYNC = null;
 }
 } catch (eSyncClr) {}
 if (!window.VcChromeSync || window.VcChromeSync.ver !== CHROME_SYNC_VER) {
 appendScript("/js/vc-chrome-sync.js", CHROME_SYNC_VER);
 }
 /* typeSfxAllPages1: chip suono tastiera su tutte le pagine (anche senza tag HTML dedicato) */
 try {
 var skipTypeSfx = false;
 try {
 if (document.body && document.body.classList.contains("vc-dashboard-page")) skipTypeSfx = true;
 if (document.documentElement.classList.contains("vc-perf-lite")) skipTypeSfx = true;
 if (document.documentElement.classList.contains("vc-perf-touch")) skipTypeSfx = true;
 if (document.documentElement.classList.contains("vc-type-sfx-off")) skipTypeSfx = true;
 if (window.VcPerf && typeof window.VcPerf.isPhoneOrPwa === "function" && window.VcPerf.isPhoneOrPwa()) {
 skipTypeSfx = true;
 }
 } catch (eSkipTs) {}
 if (!skipTypeSfx && !window.__VC_TYPE_SFX_INIT) {
 appendScript("/js/vc-type-sfx.js", TYPE_SFX_VER);
 }
 } catch (eTypeSfx) {}
 try {
 if (window.VcKickerHack && window.VcKickerHack.ver !== KICKER_HACK_VER) {
 window.VcKickerHack = null;
 }
 } catch (eKickClr) {}
 if (!window.VcKickerHack || window.VcKickerHack.ver !== KICKER_HACK_VER) {
 appendScript("/js/vc-kicker-hack.js", KICKER_HACK_VER);
 }
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 watchSoftFxLast();
 try {
 if (window.VcNavBadges && window.VcNavBadges.ver !== NAV_BADGES_VER) {
 window.VcNavBadges = null;
 }
 } catch (eBadgeClr) {}
 if (!window.VcNavBadges || window.VcNavBadges.ver !== NAV_BADGES_VER) {
 appendScript("/js/vc-nav-badges.js", NAV_BADGES_VER);
 }
 window.setTimeout(function () {
 try {
 if (!window.VcNavBadges || window.VcNavBadges.ver !== NAV_BADGES_VER) {
 window.VcNavBadges = null;
 appendScript("/js/vc-nav-badges.js", NAV_BADGES_VER);
 } else if (typeof window.VcNavBadges.schedule === "function") {
 window.VcNavBadges.schedule();
 }
 } catch (eBadgeRetry) {}
 }, 900);
 try {
 var injectSolidInline = function () {
 try {
 var id = "vc-nav-menu-solid-inline";
 var existing = document.getElementById(id);
 if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
 var st = document.createElement("style");
 st.id = id;
 st.setAttribute("data-vc-nav-select-bar", "1");
 /* lightNavDrawerFix1: #100c09 solo in dark; in light cream (prima batteva vc-theme-light) */
 st.textContent =
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-snav-panel," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-lang-panel," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-notif-panel," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .vc-mobile-nav-drawer__panel," +
 "html:not([data-vc-theme=\"light\"]) body.vc-body header .vc-snav-panel{" +
 "background:#100c09!important;background-color:#100c09!important;background-image:none!important;" +
 "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body .discord-account-popover," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body header .discord-account-popover," +
 "html.vc-site-polish:not([data-vc-theme=\"light\"]) body.vc-body#top header .discord-account-popover," +
 "html:not([data-vc-theme=\"light\"]) body.vc-body header .discord-account-popover{" +
 "overflow:visible!important;" +
 "border:1.5px solid transparent!important;border-color:transparent!important;" +
 "background-color:#100c09!important;" +
 "background-image:" +
 "radial-gradient(120% 90% at 0% 0%,rgba(236,205,176,.14),transparent 52%)," +
 "radial-gradient(90% 70% at 100% 0%,rgba(111,78,55,.18),transparent 48%)," +
 "linear-gradient(175deg,#17130f 0%,#100c09 55%,#0b0807 100%)," +
 "linear-gradient(135deg,rgba(255,247,236,.95),rgba(236,205,176,.88) 28%,rgba(212,168,136,.78) 52%,rgba(180,130,90,.82) 72%,rgba(236,205,176,.9))!important;" +
 "background-origin:padding-box,padding-box,padding-box,border-box!important;" +
 "background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "-webkit-background-clip:padding-box,padding-box,padding-box,border-box!important;" +
 "box-shadow:0 0 0 1px rgba(255,247,236,.24),0 0 16px rgba(212,168,136,.32),0 14px 36px rgba(0,0,0,.48)!important;" +
 "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
 "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body#top header .discord-account-popover__name," +
 "html.vc-site-polish:not(.vc-soft-fx-off) body.vc-body header .discord-account-popover__name," +
 "html.vc-site-polish body.vc-body .discord-account-popover__name," +
 "html.vc-site-polish body.vc-body--home .discord-account-popover__name," +
 "html body.vc-body header .discord-account-popover__name," +
 "html body.vc-body .discord-account-popover__name{" +
 "background-image:linear-gradient(135deg,#f5d6b7,#e8c9a8 45%,#d4a888)!important;" +
 "background-color:transparent!important;-webkit-background-clip:text!important;background-clip:text!important;" +
 "color:transparent!important;-webkit-text-fill-color:transparent!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>span," +
 "html body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>span{" +
 "background-image:linear-gradient(180deg,rgba(247,236,223,.98),rgba(236,214,188,.92) 48%,rgba(212,168,136,.88))!important;" +
 "background-color:transparent!important;-webkit-background-clip:text!important;background-clip:text!important;" +
 "color:transparent!important;-webkit-text-fill-color:transparent!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>i," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item:not(.discord-account-popover__item--danger):not(.is-soon)>.fa{" +
 "color:rgba(236,205,176,.92)!important;-webkit-text-fill-color:rgba(236,205,176,.92)!important;" +
 "background:none!important;text-shadow:0 0 10px rgba(212,168,136,.35)!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-badge," +
 "html body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-badge{" +
 "background-image:none!important;background:rgba(22,16,12,.82)!important;color:#f3dfc6!important;" +
 "-webkit-text-fill-color:#f3dfc6!important;-webkit-background-clip:border-box!important;background-clip:border-box!important}" +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-inner," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-inner span," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item.is-soon .discord-account-popover__soon-inner i{" +
 "background-image:none!important;color:rgba(247,236,223,.88)!important;-webkit-text-fill-color:rgba(247,236,223,.88)!important;" +
 "-webkit-background-clip:border-box!important;background-clip:border-box!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-row," +
 "html body.vc-body header .vc-header-snav .vc-snav-item," +
 "html body.vc-body header .vc-header-snav .vc-snav-summary," +
 "html body.vc-body header .vc-header-snav .vc-snav-row{position:relative!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item--active," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item[aria-current=page]," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row:hover," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row.vc-snav-row--active," +
 "html body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover," +
 "html body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover," +
 "html body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary," +
 "html body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary:hover{" +
 "background:transparent!important;background-color:transparent!important;background-image:none!important;box-shadow:none!important;border-color:transparent!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item--active::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item[aria-current=page]::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-item--active::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-item[aria-current=page]::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.7rem!important;right:.7rem!important;bottom:.32rem!important;height:1.5px!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.12),rgba(255,247,236,.98) 18%,rgba(236,205,176,.98) 50%,rgba(212,168,136,.95) 82%,rgba(255,247,236,.12))!important;" +
 "box-shadow:0 0 6px rgba(236,205,176,.62),0 0 12px rgba(168,118,82,.38)!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-item:not(.vc-snav-item--active):not([aria-current=page]):hover::after," +
 "html body.vc-body header .vc-header-snav .vc-snav-details:not([open]):not(.vc-snav-details--current)>.vc-snav-summary:hover::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.7rem!important;right:.7rem!important;bottom:.32rem!important;height:1.5px!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.08),rgba(255,247,236,.82) 18%,rgba(236,205,176,.88) 50%,rgba(212,168,136,.78) 82%,rgba(255,247,236,.08))!important;" +
 "box-shadow:0 0 5px rgba(236,205,176,.48),0 0 10px rgba(168,118,82,.28)!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-item--active:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details.vc-snav-details--current>.vc-snav-summary:hover::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary:hover::after{" +
 "background:linear-gradient(90deg,rgba(255,247,236,.18),rgba(255,247,236,1) 18%,rgba(236,205,176,1) 50%,rgba(212,168,136,.98) 82%,rgba(255,247,236,.18))!important;" +
 "box-shadow:0 0 7px rgba(236,205,176,.72),0 0 14px rgba(168,118,82,.45)!important}" +
 "html body.vc-body .vc-snav-panel>.vc-snav-row," +
 "html body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row," +
 "html.vc-site-polish body.vc-body .vc-snav-panel a.vc-snav-row," +
 "html body.vc-body .discord-account-popover__item," +
 "html.vc-site-polish body.vc-body .discord-account-popover__item," +
 "html body.vc-body .vc-lang-panel:not(.vc-lang-panel--seg) .vc-lang-option," +
 "html body.vc-body .vc-lang-panel:not(.vc-lang-panel--seg) button{" +
 "width:fit-content!important;max-width:100%!important;min-width:0!important;" +
 "box-sizing:border-box!important;white-space:nowrap!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row:hover::after," +
 "html.vc-site-polish body.vc-body .vc-snav-panel a.vc-snav-row:hover::after," +
 "html.vc-site-polish body.vc-body header .discord-account-popover__item:not(.discord-account-popover__item--danger):hover::after," +
 "html.vc-site-polish body.vc-body .vc-lang-option:hover::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.55rem!important;right:.55rem!important;bottom:.28rem!important;height:1.5px!important;width:auto!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.08),rgba(255,247,236,.82) 18%,rgba(236,205,176,.88) 50%,rgba(212,168,136,.78) 82%,rgba(255,247,236,.08))!important;" +
 "box-shadow:0 0 5px rgba(236,205,176,.48),0 0 10px rgba(168,118,82,.28)!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row.vc-snav-row--active::after," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-panel .vc-snav-row[aria-current=page]::after," +
 "html.vc-site-polish body.vc-body .vc-snav-panel a.vc-snav-row.vc-snav-row--active::after," +
 "html.vc-site-polish body.vc-body header .discord-account-popover__item.is-current::after," +
 "html.vc-site-polish body.vc-body .vc-lang-option.is-active::after{" +
 "content:\"\"!important;display:block!important;position:absolute!important;" +
 "left:.55rem!important;right:.55rem!important;bottom:.28rem!important;height:1.5px!important;width:auto!important;" +
 "border-radius:999px!important;pointer-events:none!important;" +
 "background:linear-gradient(90deg,rgba(255,247,236,.12),rgba(255,247,236,.98) 18%,rgba(236,205,176,.98) 50%,rgba(212,168,136,.95) 82%,rgba(255,247,236,.12))!important;" +
 "box-shadow:0 0 6px rgba(236,205,176,.62),0 0 12px rgba(168,118,82,.38)!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary{" +
 "display:inline-flex!important;align-items:center!important;gap:.22rem!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.fa-chevron-down," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.fa-chevron-down{" +
 "display:inline-flex!important;align-items:center!important;justify-content:center!important;" +
 "width:.72em!important;height:.72em!important;margin:0 0 0 .12rem!important;padding:0!important;" +
 "line-height:1!important;font-size:.62rem!important;top:0!important;position:relative!important;" +
 "transform:none!important;transform-origin:50% 50%!important;" +
 "color:rgba(245,214,183,.92)!important;-webkit-text-fill-color:rgba(245,214,183,.92)!important;" +
 "background:none!important;opacity:.9!important;visibility:visible!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-summary>i.fa-chevron-down::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-summary>i.fa-chevron-down::before{" +
 "display:block!important;content:\"\\f078\"!important;transform:none!important;" +
 "line-height:1!important;width:1em!important;height:1em!important;margin:0!important;border:0!important;-webkit-mask-image:none!important;mask-image:none!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down{" +
 "transform:rotate(180deg)!important;transform-origin:50% 50%!important;top:0!important;" +
 "color:rgba(247,236,223,.98)!important;-webkit-text-fill-color:rgba(247,236,223,.98)!important;opacity:.95!important}" +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.vc-snav-chev::before," +
 "html.vc-site-polish body.vc-body#top header .vc-header-snav .vc-snav-details[open]>.vc-snav-summary>i.fa-chevron-down::before{" +
 "content:\"\\f078\"!important;transform:none!important}" +
 "html.vc-site-polish body.vc-body #vc-site-back-top>i.fa::before," +
 "html.vc-site-polish body.vc-body #vc-site-back-top>i.fa-caret-up::before," +
 "html.vc-site-polish body.vc-body #vc-site-back-top>i.fa-chevron-up::before{" +
 "content:\"\\f077\"!important}" +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-snav-panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-lang-panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-notif-panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body .vc-mobile-nav-drawer__panel," +
 "html.vc-site-polish[data-vc-theme=\"light\"] body.vc-body #vc-mobile-nav-drawer .vc-mobile-nav-drawer__panel," +
 "html[data-vc-theme=\"light\"] body.vc-body header .vc-snav-panel{" +
 "background:#faf6f0!important;background-color:#faf6f0!important;" +
 "background-image:radial-gradient(120% 90% at 0% 0%,rgba(255,248,238,.9),transparent 52%),linear-gradient(175deg,#fffaf4 0%,#f7f1ea 55%,#efe6dc 100%)!important;" +
 "border:1px solid rgba(111,78,55,.2)!important;border-color:rgba(111,78,55,.2)!important;color:#2a1c14!important;" +
 "box-shadow:0 14px 36px rgba(60,40,24,.14)!important;" +
 "backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link span," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link i," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-section__title," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer__brand a.vc-header-site-name," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer__brand a.vc-header-site-name .vc-header-site-name__text," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile span," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile i{" +
 "color:#2a1c14!important;-webkit-text-fill-color:#2a1c14!important}" +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-tile," +
 "html[data-vc-theme=\"light\"] body .vc-mobile-nav-drawer .vc-mobile-nav-link{" +
 "background-color:rgba(255,250,244,.92)!important;border-color:rgba(111,78,55,.18)!important}";
 (document.body || document.documentElement).appendChild(st);
 } catch (eInline) {}
 };
 var reinjectSolid = function () {
 /* navBootTrim1: una sola volta � DOMContentLoaded+load duplicavano pin/recalc */
 if (window.__vcSolidReinjected) return;
 window.__vcSolidReinjected = 1;
 try {
 appendStylesheet("/css/vc-nav-menu-solid.css", NAV_CHROME_VER);
 pinSoftFxLast(SOFT_FX_VER);
 pinNavChromeFixLast(NAV_CHROME_FIX_VER);
 injectSolidInline();
 } catch (eR) {}
 };
 if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", reinjectSolid);
 else window.setTimeout(reinjectSolid, 0);
 } catch (eRe) {}
 appendScript("/js/vc-view-as.js", "20260929swLsStorm2");
 } catch (eHelper) {}
 })();
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
 var OAUTH_STATE_NONCE_KEY = "vc_oauth_state_nonce_v1";
 var SITE_SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
 var OAUTH_PENDING_RETURN_KEY = "vc_oauth_pending_return_v1";
 var ME_CACHE_KEY = "vc_discord_me_cache_v1";
 var ME_LOCAL_CACHE_KEY = "vc_discord_me_cache_local_v1";
 var ME_SESSION_TTL_MS = 180000;
 var ME_LOCAL_TTL_MS = 30 * 60 * 1000;
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
 /* violPass3: skip se già unlock — evita lavoro 200ms+ a ogni pageshow */
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
 function closeVcNotifDropdown() {
 try {
 /* notifAutoCloseFix1: non chiudere durante grace post-open (click/pointer spurio). */
 if (Date.now() < Number(window.__vcNotifOpenGraceUntil || 0)) return;
 try {
 if (window.VcNotifChrome && typeof window.VcNotifChrome.inOpenGrace === "function" && window.VcNotifChrome.inOpenGrace()) {
 return;
 }
 } catch (eGrace) {}
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
 var menu = t.closest(".discord-account-menu");
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
 closeVcNotifDropdown();
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
 if (isUserProfileDetail && (p === "/user" || p === "/users")) return;
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
 if (isUserProfileDetail && (p === "/user" || p === "/users")) return;
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
 if (det) det.classList.add("vc-snav-details--current");
 } catch (eDet) {}
 }
 }
 try {
 window.__vcMarkHeaderSnavCurrent = markHeaderSnavCurrentFromLocation;
 } catch (eEx) {}
 markHeaderSnavCurrentFromLocation();
 document.addEventListener("vc:langchange", function () {
 try {
 markHeaderSnavCurrentFromLocation();
 } catch (eL) {}
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
 closeVcNotifDropdown();
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
 closeVcNotifDropdown();
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
 closeVcNotifDropdown();
 closed = true;
 }
 if (closed) closeVcAccountMenu();
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
 '<p class="vc-session-verify-text">Caricamento�</p>' +
 '<p class="vc-session-verify-sub">Un momento�</p>' +
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
 return encodeURIComponent(payload);
 } catch (e2) {
 return encodeURIComponent(JSON.stringify({ r: returnPath }));
 }
 }
 function parseOAuthState(stateRaw) {
 var out = { returnPath: "", validNonce: false };
 var s = String(stateRaw == null ? "" : stateRaw).trim();
 if (!s) return out;
 try {
 var decoded = decodeURIComponent(s);
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
 out.validNonce = Boolean(expected) && Boolean(n) && n === expected;
 if (!out.validNonce && !expected && out.returnPath && Number.isFinite(ts) && Math.abs(Date.now() - ts) <= 30 * 60 * 1000) {
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
 var h = window.location.hash || "";
 if (!h || h.indexOf("access_token=") === -1) {
 return { token: "", freshLogin: false, returnPath: "" };
 }
 var p = new URLSearchParams(h.slice(1));
 var t = p.get("access_token");
 var stateParsed = parseOAuthState(p.get("state"));
 var returnPath = stateParsed.returnPath;
 if (!returnPath && t) {
 try {
 returnPath = normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY));
 } catch (eS) {}
 }
 if (!t) return { token: "", freshLogin: false, returnPath: "" };
 if (!stateParsed.validNonce) {
 var pendingReturn = "";
 try {
 pendingReturn = normalizeReturnPath(sessionStorage.getItem(OAUTH_PENDING_RETURN_KEY));
 } catch (ePr) {}
 if (pendingReturn) {
 if (!returnPath) returnPath = pendingReturn;
 stateParsed.validNonce = true;
 }
 }
 if (!stateParsed.validNonce) return { token: "", freshLogin: false, returnPath: "", stateMismatch: true };
 try {
 sessionStorage.removeItem(OAUTH_PENDING_RETURN_KEY);
 sessionStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 } catch (eR) {}
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
 } catch (eIdClr) {}
 sessionStorage.removeItem("vc_staff_access_ok_v2");
 localStorage.removeItem("vc_staff_access_ok_v2_local");
 sessionStorage.removeItem("vc_dash_access_ok_v1");
 localStorage.removeItem("vc_dash_access_ok_v1");
 try {
 window.__VC_STAFF_MENU_ALLOWED = false;
 window.__VC_STAFF_PERMS = null;
 window.__VC_HOGWARTS_STAFF_PREVIEW = false;
 } catch (eClrStaff) {}
 if (window.VcApiCache && typeof window.VcApiCache.invalidatePrefix === "function") {
 ["profile:", "chrome:", "avatar:", "feedback:", "suggestions:", "staff:"].forEach(function (prefix) {
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
 /* oauthGuildsScope1 exports after fn defs — see boot exports below */
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
 var q = new URLSearchParams({
 client_id: clientId,
 redirect_uri: redirect,
 response_type: "token",
 scope: String(opts.scopes || resolveOAuthScopes()).trim() || "identify",
 prompt: prompt,
 });
 q.set("state", buildOAuthState(currentPathPlusQuery() || "/"));
 try {
 if (prompt === "none") sessionStorage.setItem(OAUTH_ATTEMPTED_NONE_KEY, "1");
 else sessionStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 } catch (ePromptFlag) {}
 return "https://discord.com/oauth2/authorize?" + q.toString();
 }
 function parseOAuthCallbackError() {
 var h = String(window.location.hash || "");
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
 var attemptedNone = false;
 try {
 attemptedNone = sessionStorage.getItem(OAUTH_ATTEMPTED_NONE_KEY) === "1";
 sessionStorage.removeItem(OAUTH_ATTEMPTED_NONE_KEY);
 sessionStorage.removeItem(OAUTH_FORCE_CONSENT_KEY);
 } catch (eAtt) {}
 var soft =
 info.error === "login_required" ||
 info.error === "consent_required" ||
 info.error === "interaction_required";
 if (!attemptedNone || !soft) return false;
 try {
 if (info.returnPath) sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, info.returnPath);
 } catch (eSet) {}
 startDiscordOAuthFromUserGesture(null, authUrl({ prompt: "consent" }));
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
 var px = Math.max(16, Math.floor(Number(size) || 38));
 var img = avatarUrl(user);
 var labelEsc = escAttr(label);
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.imgHtml === "function") {
 return window.VcDiscordAvatar.imgHtml({
 url: img,
 userId: user && user.id,
 avatarHash: user && user.avatar,
 size: px,
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
 var hasCdn = out !== coffee;
 return (
 '<img class="discord-avatar-img vc-avatar ' +
 (hasCdn ? "vc-avatar--pending" : "vc-avatar--ready vc-avatar-fallback-img") +
 '" data-vc-avatar="1"' +
 (hasCdn ? "" : ' data-vc-avatar-fallback="1"') +
 (hash ? ' data-avatar-hash="' + hash + '"' : "") +
 (user && user.id ? ' data-user-id="' + escAttr(String(user.id)) + '"' : "") +
 ' src="' +
 escAttr(out) +
 '" alt="" width="' +
 px +
 '" height="' +
 px +
 '" decoding="async" aria-label="' +
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
 var menu = document.querySelector(".discord-account-menu");
 var user = null;
 try {
 user = window.__VC_ACCOUNT_MENU_USER || null;
 } catch (eUser) {}
 refreshAccountMenuAvatars(user, { onlyPopover: true });
 if (!menu) return;
 syncAccountPopoverCaret(menu);
 window.requestAnimationFrame(function () {
 refreshAccountMenuAvatars(user, { onlyPopover: true });
 syncAccountPopoverCaret(menu);
 window.requestAnimationFrame(function () {
 syncAccountPopoverCaret(menu);
 });
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
 } catch (eGateW) {}
 }
 function readGateDashAllowed(token) {
 try {
 var raw = sessionStorage.getItem("vc_dash_access_ok_v1");
 if (!raw) return null;
 var data = JSON.parse(raw);
 if (!data || !(data.ok === true || data.allowed === true)) return null;
 if (Number(data.exp || 0) <= Date.now()) return null;
 return { allowed: true, blacklisted: Boolean(data.blacklisted) };
 } catch (e) {
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
 if (identity.avatarUrl) writeMenuCache("vc_server_avatar_v1", token, { url: identity.avatarUrl });
 return identity;
 } catch (e) {
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
 async function fetchDashboardMenuAccess(token) {
 var t = String(token || "").trim();
 if (!t) return { allowed: false, blacklisted: false, unchecked: true };
 var cached = readMenuCacheWithLocal("vc_menu_dash_v1", "vc_menu_dash_local_v1", t, 180000, 604800000);
 if (cached) {
 return { allowed: Boolean(cached.allowed), blacklisted: Boolean(cached.blacklisted), unchecked: false };
 }
 var fromGate = readGateDashAllowed(t);
 if (fromGate) {
 writeMenuCache("vc_menu_dash_v1", t, fromGate);
 return Object.assign({ unchecked: false }, fromGate);
 }
 try {
 var res = await fetch(dashboardApiBase() + "/access", {
 headers: { Authorization: "Bearer " + t },
 cache: "no-store",
 });
 if (!res.ok) return { allowed: false, blacklisted: false, unchecked: true };
 var data = await res.json().catch(function () {
 return {};
 });
 if (!data || data.ok !== true) return { allowed: false, blacklisted: false, unchecked: true };
 var out = {
 allowed: Boolean(data.allowed),
 blacklisted: Boolean(data.blacklisted),
 unchecked: false,
 };
 writeMenuCache("vc_menu_dash_v1", t, out);
 return out;
 } catch (e) {
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
 try {
 window.__VC_STAFF_MENU_ALLOWED = true;
 } catch (eAllow) {}
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
 window.__VC_STAFF_MENU_ALLOWED = false;
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
 window.__VC_STAFF_MENU_ALLOWED = menuOn;
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
 try {
 window.__VC_STAFF_MENU_ALLOWED = false;
 writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
 sessionStorage.removeItem("vc_staff_access_ok_v2");
 localStorage.removeItem("vc_staff_access_ok_v2_local");
 } catch (eDeny) {}
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
 window.__VC_STAFF_MENU_ALLOWED = false;
 writeMenuCache("vc_menu_staff_v1", t, { allowed: false, payload: null });
 sessionStorage.removeItem("vc_staff_access_ok_v2");
 localStorage.removeItem("vc_staff_access_ok_v2_local");
 } catch (eDeny2) {}
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
 if (gateBlob || window.__VC_STAFF_MENU_ALLOWED === true) {
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
 try {
 if (
 document.querySelector('script[data-vc-staff-site-nav="1"]') ||
 document.querySelector('script[src*="staff-site-nav.js"]')
 ) {
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
 } catch (eQ) {}
 if (window.__vcStaffSiteNavRequested) return;
 window.__vcStaffSiteNavRequested = true;
 try {
 var s = document.createElement("script");
 s.src = "/js/staff-site-nav.js?v=20261002violPass5";
 s.async = false;
 s.setAttribute("data-vc-staff-site-nav", "1");
 (document.head || document.documentElement).appendChild(s);
 } catch (eNav) {}
 }
 function warmDashboardNavEarly() {
 try {
 var t = getToken();
 if (!t) return false;
 if (window.__VC_DASHBOARD_MENU_BLACKLISTED === true) return false;
 if (window.__VC_DASHBOARD_MENU_ALLOWED === true || window.__VC_DASHBOARD_ACCESS_OK === true) return true;
 var cached = readMenuCacheWithLocal("vc_menu_dash_v1", "vc_menu_dash_local_v1", t, 180000, 604800000);
 var gate = readGateDashAllowed(t);
 var access = null;
 if (cached) {
 access = { allowed: Boolean(cached.allowed), blacklisted: Boolean(cached.blacklisted) };
 } else if (gate) {
 access = gate;
 }
 if (!access) return false;
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
 var already = window.__VC_STAFF_MENU_ALLOWED === true;
 if (!(cached && cached.allowed) && !gate && !already) return false;
 var payload =
 (cached && cached.payload) ||
 (gate && typeof gate === "object" ? gate : null) ||
 window.__VC_STAFF_PERMS ||
 null;
 if (payload) {
 try {
 window.__VC_STAFF_PERMS = payload;
 } catch (eP) {}
 }
 window.__VC_STAFF_MENU_ALLOWED = true;
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
 return id ? "/user/?id=" + encodeURIComponent(id) : "/user/";
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
 var link = byId("discord-staff-link");
 if (link) {
 try {
 if (link.parentNode) link.parentNode.removeChild(link);
 } catch (eRm) {
 link.setAttribute("hidden", "");
 }
 }
 try {
 var nav = document.querySelector(".discord-account-popover__nav");
 if (nav) {
 var stale = nav.querySelectorAll(
 '#discord-staff-link, a[href="/staff/"], a[href="/staff"], a[href*="tab=staff"]',
 );
 for (var i = 0; i < stale.length; i += 1) {
 var a = stale[i];
 var label = String((a.textContent || "")).replace(/\s+/g, " ").trim().toLowerCase();
 if (
 a.id === "discord-staff-link" ||
 label.indexOf("area staff") >= 0 ||
 label === "staff"
 ) {
 try {
 a.parentNode && a.parentNode.removeChild(a);
 } catch (e2) {}
 }
 }
 }
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
 sessionStorage.setItem(OAUTH_PENDING_RETURN_KEY, currentPathPlusQuery() || "/");
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
 if (isOwnProfileCurrent()) return "/user/";
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
 window.__VC_STAFF_MENU_ALLOWED = false;
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
 if (isOwnProfileCurrent()) dest = "/user/";
 else dest = logoutRedirectTarget();
 } catch (eDest) {
 try {
 dest = logoutRedirectTarget();
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
 if (
 state.querySelector(".discord-login-row:not(.vc-auth-pending-shell):not(.vc-auth-early-shell)") ||
 state.querySelector(".vc-auth-early-shell img.discord-avatar-img")
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
 }
 var coffeePending = "";
 try {
 if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
 coffeePending = window.VcDiscordAvatar.siteFallbackAvatarUrl();
 }
 } catch (eCp) {}
 if (!coffeePending) {
 coffeePending =
 "data:image/svg+xml;charset=utf-8," +
 encodeURIComponent(
 '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="vcCoffeePend" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#vcCoffeePend)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>',
 );
 }
 state.innerHTML =
 '<div class="discord-login-row vc-auth-pending-shell" aria-busy="true" title="' +
 escAttr(i18n("auth.sessionChecking", "Caricamento�")) +
 '">' +
 '<span class="discord-profile-link" aria-hidden="true">' +
 '<span class="discord-avatar-clip">' +
 '<img class="discord-avatar-img vc-avatar vc-avatar--ready vc-avatar-fallback-img" data-vc-avatar="1" data-vc-avatar-fallback="1" src="' +
 escAttr(coffeePending) +
 '" alt="" width="38" height="38" decoding="async" aria-hidden="true" />' +
 "</span></span></div>";
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
 if (sessionStorage.getItem("vc_staff_oauth_invalid") === "1") return "";
 var qsStaff = new URLSearchParams(window.location.search || "");
 if (qsStaff.get("reason") === "denied" || qsStaff.get("stay") === "1") return "";
 } catch (eGuardStaff) {}
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
 try {
 if (sessionStorage.getItem("vc_staff_oauth_invalid") === "1") {
 sessionStorage.removeItem("vc_staff_oauth_invalid");
 completeLogout({ reason: "staff-oauth-invalid" });
 return;
 }
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
 var name = profileDisplayName(user);
 var label = escAttr(name);
 try {
 window.__VC_ACCOUNT_MENU_USER = user;
 } catch (eStoreUser) {}
 var href = escAttr(profileHref(user && user.id));
 var isProfileCurrent = isOwnProfileCurrent(user && user.id);
 var avatarVisual = buildMenuAvatarVisual(user, name, 34);
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
 '<span class="discord-profile-link__name">' +
 label +
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
 fetchDashboardMenuAccess(token).then(function (allowed) {
 revealDashboardMenuItem(allowed);
 });
 fetchStaffMenuAccess(token).then(function (allowed) {
 revealStaffMenuItem(allowed);
 });
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
 nameEls[ni].textContent = serverName;
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
 var runAvatar = function () {
 /* accountAvatarFresh2: bypass cache identity ? foto guild aggiornata */
 /* avatarHubIdle1: non fare lavoro DOM pesante dentro idle � solo kick della fetch */
 window.setTimeout(function () {
 fetchServerIdentity(token, { force: true }).then(applyServerIdentity);
 }, 0);
 };
 if (typeof window.requestIdleCallback === "function") {
 window.requestIdleCallback(runAvatar, { timeout: 4000 });
 } else {
 window.setTimeout(runAvatar, 600);
 }
 try {
 document.documentElement.classList.remove("vc-auth-session-pending");
 } catch (eClsDone) {}
 emitProfile(user);
 }
 function discordSessionFingerprint(token) {
 var exp = "";
 try {
 exp = String(localStorage.getItem(EXPIRES_AT_KEY) || "");
 } catch (eFp) {}
 return exp + "|" + String(token || "").slice(0, 32);
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
 if (o && o.v === 1 && o.user && String(o.fp || "") === fp && isFinite(age) && age >= 0 && age <= ME_SESSION_TTL_MS) {
 return o.user;
 }
 }
 } catch (eR) {}
 try {
 var rawLocal = localStorage.getItem(ME_LOCAL_CACHE_KEY);
 if (rawLocal) {
 var ol = JSON.parse(rawLocal);
 var ageL = now - Number(ol.at || 0);
 if (ol && ol.v === 1 && ol.user && String(ol.fp || "") === fp && isFinite(ageL) && ageL >= 0 && ageL <= ME_LOCAL_TTL_MS) {
 return ol.user;
 }
 }
 } catch (eRl) {}
 return null;
 }
 function writeCachedDiscordMe(token, user) {
 var fp = discordSessionFingerprint(token);
 var payload = { v: 1, fp: fp, at: Date.now(), user: user };
 try {
 sessionStorage.setItem(ME_CACHE_KEY, JSON.stringify(payload));
 } catch (eW) {}
 try {
 localStorage.setItem(ME_LOCAL_CACHE_KEY, JSON.stringify(payload));
 } catch (eWl) {}
 try {
 var uid = String(user && user.id || "").trim();
 if (/^\d{17,22}$/.test(uid)) {
 localStorage.setItem(
 UID_CACHE_KEY,
 JSON.stringify({ v: 1, fp: fp, at: Date.now(), uid: uid }),
 );
 }
 } catch (eUid) {}
 }
 function fetchMe(token, timeoutMs) {
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
 var ac = new AbortController();
 var tid = setTimeout(function () {
 try {
 ac.abort();
 } catch (eAb) {}
 }, ms);
 return fetch("/webhooks/site-discord-me", {
 headers: { Authorization: "Bearer " + String(token || "") },
 signal: ac.signal,
 credentials: "same-origin",
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
 var SITE_VERIFY_DONE_PREFIX = "vc_site_verify_done_v1_";
 function readSiteVerifyGuildFromQuery() {
 try {
 var p = new URLSearchParams(window.location.search || "");
 /* siteVerifyOnlyParam1: solo siteVerifyGuild — guildId è usato da bacheca/wizard */
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
 return maybeCompleteSiteVerify(token).then(function () {
 return maybeJoinMainGuild(token);
 });
 }
 function main() {
 if (maybeFallbackOAuthConsentFromError()) return;
 var parsed = parseHashToken();
 if (parsed && parsed.stateMismatch) {
 try {
 clearToken();
 } catch (eSm) {}
 try {
 history.replaceState({}, document.title, window.location.pathname + window.location.search);
 } catch (eSm2) {}
 }
 var here = currentPathPlusQuery();
 var bounce =
 Boolean(parsed && parsed.token && parsed.returnPath) && parsed.returnPath !== here;
 if (bounce) {
 try {
 if (parsed.freshLogin) {
 sessionStorage.setItem(OAUTH_FRESH_AFTER_BOUNCE_KEY, "1");
 }
 } catch (e0) {}
 try {
 window.location.replace(window.location.origin + parsed.returnPath);
 } catch (e1) {
 window.location.href = window.location.origin + parsed.returnPath;
 }
 return;
 }
 var freshFromBounce = false;
 try {
 if (sessionStorage.getItem(OAUTH_FRESH_AFTER_BOUNCE_KEY) === "1") {
 freshFromBounce = true;
 sessionStorage.removeItem(OAUTH_FRESH_AFTER_BOUNCE_KEY);
 }
 } catch (e2) {}
 var freshLogin = Boolean(parsed && parsed.freshLogin) || freshFromBounce;
 var loginBtns = queryDiscordLoginButtons();
 ensureAllNavbarDiscordLoginMarkup();
 loginBtns = queryDiscordLoginButtons();
 for (var lk = 0; lk < loginBtns.length; lk += 1) {
 (function (btn) {
 btn.addEventListener("click", function () {
 startDiscordOAuthFromUserGesture(btn, authUrl({ prompt: "none" }));
 });
 })(loginBtns[lk]);
 }
 window.addEventListener(
 "pageshow",
 function (ev) {
 /* violPass3: pageshow body più tardi — forceUnlock era ~244ms Violation */
 var persisted = !!(ev && ev.persisted);
 window.setTimeout(function () {
 try {
 if (!isBlockingSessionVerifyPage()) forceUnlockSessionVerifyUi();
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
 return;
 }
 warmStaffNavEarly();
 warmDashboardNavEarly();
 var cached = readCachedDiscordMe(t);
 if (cached) {
 hideSessionVerifyOverlay();
 try {
 if (String(sessionStorage.getItem("vc_view_as") || "").trim().toLowerCase() === "logout") {
 renderLoggedOut({ skipRedirect: true, viewAsPreview: true });
 } else {
 renderLoggedIn(cached);
 }
 } catch (eVaCache) {
 renderLoggedIn(cached);
 }
 fetchMe(t)
 .then(function (user) {
 return afterAuthSideEffects(t).then(function () {
 return user;
 });
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
 return afterAuthSideEffects(t).then(function () {
 return user;
 });
 })
 .catch(function (err) {
 var st = err && err.status;
 if (st === 401) {
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
 })
 .catch(function (err2) {
 if (err2 && err2.status === 401) {
 completeLogout({ reason: "fetchMe-401-retry" });
 return;
 }
 forceUnlockSessionVerifyUi();
 });
 }, 400);
 });
 }
 document.addEventListener("visibilitychange", function () {
 if (document.visibilityState !== "visible") return;
 try {
 if (getToken()) return;
 if (window.__VC_DISCORD_PROFILE) renderLoggedOut();
 } catch (eVis) {}
 });
 document.addEventListener("vc:langchange", function () {
 try {
 var profile = window.__VC_DISCORD_PROFILE;
 if (profile && profile.id) renderLoggedIn(profile);
 } catch (eLang) {}
 });
 window.addEventListener("vc:staff-access-ok", function () {
 try {
 applyAccountMenuDashBacheca(window.__VC_DASHBOARD_MENU_BLACKLISTED === true);
 } catch (eStaffSoon) {}
 });
 window.addEventListener("vc:view-as-allowed", function () {
 try {
 applyAccountMenuDashBacheca(window.__VC_DASHBOARD_MENU_BLACKLISTED === true);
 } catch (eVaSoon) {}
 });
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
 s.src = "/js/vc-access-gate.js?v=20260928inboxNoDirector1";
 (document.head || document.documentElement).appendChild(s);
 } catch (eBoot) {}
 })();
})();/* violKill1 */
/* violPass7 */
/* snavDropUnify1 */
