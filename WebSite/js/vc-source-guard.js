/**
 * vc-source-guard6 / sourceGuardClassicKeys1:
 * deterrenza anti-devtools (non e' sicurezza reale).
 * Consenti a tutti le shortcut classiche: copia/incolla/taglia/annulla/ripeti/seleziona tutto.
 * Resta bloccato: F12, Ctrl+U, Ctrl+S, Ctrl+Shift+I/J/C/K, Ctrl+Shift+S, Ctrl+Alt+I.
 * Bypass SOLO owner Discord 295500038401163264:
 *  - Discord profile / uid persistito
 *  - ?vc-dev=1 (resta in localStorage)
 *  - Ctrl+Alt+Shift+D
 * Boot HTML DEVE rispettare __vcSourceGuardOff (altrimenti F12 resta bloccato).
 */
(function vcSourceGuard() {
  if (window.__vcSourceGuard) return;
  window.__vcSourceGuard = 1;

  var OFF_KEY = "vc-source-guard-off";
  var OWNER_UID_KEY = "vc-source-guard-owner-uid";
  var OWNER_IDS = {
    "295500038401163264": 1,
  };

  function isOwnerId(id) {
    return Boolean(OWNER_IDS[String(id || "").trim()]);
  }

  function readBypass() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var dev = String(q.get("vc-dev") || "").toLowerCase();
      var guard = String(q.get("vc-guard") || "").toLowerCase();
      if (dev === "1" || guard === "off") {
        localStorage.setItem(OFF_KEY, "1");
        return true;
      }
      if (dev === "0" || guard === "on") {
        localStorage.removeItem(OFF_KEY);
        return false;
      }
      if (localStorage.getItem(OFF_KEY) === "1") return true;
      var remembered = String(localStorage.getItem(OWNER_UID_KEY) || "").trim();
      if (isOwnerId(remembered)) {
        localStorage.setItem(OFF_KEY, "1");
        return true;
      }
      var live = window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id;
      if (isOwnerId(live)) {
        localStorage.setItem(OWNER_UID_KEY, String(live));
        localStorage.setItem(OFF_KEY, "1");
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  function enableBypass() {
    try {
      localStorage.setItem(OFF_KEY, "1");
    } catch (e) {}
    try {
      document.documentElement.classList.remove("vc-source-guard-on");
      var st = document.getElementById("vc-source-guard-css");
      if (st && st.parentNode) st.parentNode.removeChild(st);
    } catch (e2) {}
    window.__vcSourceGuardOff = 1;
  }

  function maybeOwnerFromProfile(user) {
    try {
      var id = String(
        (user && user.id) ||
          (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) ||
          "",
      ).trim();
      if (!isOwnerId(id)) return;
      try {
        localStorage.setItem(OWNER_UID_KEY, id);
      } catch (eSave) {}
      enableBypass();
    } catch (e) {}
  }

  if (readBypass()) {
    window.__vcSourceGuardOff = 1;
  }

  function block(ev) {
    try {
      ev.preventDefault();
      ev.stopPropagation();
      if (typeof ev.stopImmediatePropagation === "function") ev.stopImmediatePropagation();
    } catch (e) {}
    return false;
  }

  function isEditable(t) {
    if (!t) return false;
    var el = t.nodeType === 1 ? t : t.parentElement;
    if (!el || !el.closest) return false;
    return Boolean(
      el.closest(
        'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]',
      ),
    );
  }

  /* sourceGuardClassicKeys1: Ctrl/Cmd + C/V/X/Z/Y/A sempre consentiti */
  function isClassicEditShortcut(ev, k, key) {
    var ctrl = ev.ctrlKey || ev.metaKey;
    if (!ctrl || ev.altKey) return false;
    if (ev.shiftKey && !(k === 90 || key === "z")) return false;
    /* Ctrl+Shift+Z = redo (come Ctrl+Y) */
    if (ev.shiftKey && (k === 90 || key === "z")) return true;
    return (
      k === 65 ||
      k === 67 ||
      k === 86 ||
      k === 88 ||
      k === 89 ||
      k === 90 ||
      key === "a" ||
      key === "c" ||
      key === "v" ||
      key === "x" ||
      key === "y" ||
      key === "z"
    );
  }

  document.addEventListener(
    "contextmenu",
    function (ev) {
      if (window.__vcSourceGuardOff) return;
      if (isEditable(ev.target)) return;
      return block(ev);
    },
    true,
  );

  document.addEventListener(
    "dragstart",
    function (ev) {
      if (window.__vcSourceGuardOff) return;
      var t = ev.target;
      if (t && t.tagName === "IMG") return block(ev);
    },
    true,
  );

  document.addEventListener(
    "keydown",
    function (ev) {
      var k = ev.keyCode || ev.which || 0;
      var key = String(ev.key || "").toLowerCase();
      var ctrl = ev.ctrlKey || ev.metaKey;
      var shift = ev.shiftKey;
      var alt = ev.altKey;

      /* Owner unlock: Ctrl+Alt+Shift+D */
      if (ctrl && alt && shift && (k === 68 || key === "d")) {
        enableBypass();
        try {
          ev.preventDefault();
        } catch (eUnlock) {}
        return;
      }

      if (window.__vcSourceGuardOff) return;

      /* Classiche: non bloccare mai (anche fuori dagli input) */
      if (isClassicEditShortcut(ev, k, key)) return;

      /* Torna indietro / avanti cronologia browser */
      if (alt && !ctrl && (k === 37 || k === 39 || key === "arrowleft" || key === "arrowright")) {
        return;
      }

      if (isEditable(ev.target) && !(ctrl && (k === 83 || key === "s"))) return;

      /* Pericolose: salva, view-source, F12, DevTools */
      if (ctrl && !shift && (k === 83 || k === 85 || key === "s" || key === "u")) return block(ev);
      if (ctrl && shift && (k === 83 || key === "s")) return block(ev);
      if (k === 123 || key === "f12") return block(ev);
      if (
        ctrl &&
        shift &&
        (k === 73 || k === 74 || k === 67 || k === 75 || key === "i" || key === "j" || key === "c" || key === "k")
      )
        return block(ev);
      if (ctrl && alt && (k === 73 || key === "i")) return block(ev);
    },
    true,
  );

  if (!window.__vcSourceGuardOff) {
    try {
      var st = document.getElementById("vc-source-guard-css");
      if (st && st.parentNode) st.parentNode.removeChild(st);
      /* sourceGuardClassicKeys1: selezione testo OK (serve a Ctrl+C); niente user-select:none globale */
      document.documentElement.classList.remove("vc-source-guard-on");
      document.documentElement.classList.add("vc-source-guard-soft");
    } catch (eCss) {}
  }

  try {
    window.addEventListener("vc-discord-profile", function (ev) {
      maybeOwnerFromProfile(ev && ev.detail && ev.detail.user);
    });
    window.addEventListener("vc:discord-profile", function (ev) {
      maybeOwnerFromProfile(ev && ev.detail && ev.detail.user);
    });
    maybeOwnerFromProfile(window.__VC_DISCORD_PROFILE);
  } catch (eProf) {}

  window.__vcSourceGuardApi = {
    off: enableBypass,
    on: function () {
      try {
        localStorage.removeItem(OFF_KEY);
      } catch (e) {}
      window.location.reload();
    },
  };
})();
