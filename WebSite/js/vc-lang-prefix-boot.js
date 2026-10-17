/* langAutoRedirect1: 1 sola volta → /en/… se lingua preferita ≠ it (no loop / ↔ /en/) */
/* langLoopKill2b: paint early; niente restore continuo da localStorage */
(function () {
  if (window.__vcLangPrefixBoot) return;
  window.__vcLangPrefixBoot = 1;
  var STORAGE_KEY = "vc_site_lang";
  var JUMP_FLAG = "vc_lang_auto_jump";
  var SUPPORTED =
    "it|en|es|fr|de|pt|ru|zh|ja|ko|ar|nl|pl|tr|hi|id|uk|vi|ro|sv";
  var RE = new RegExp("^/(" + SUPPORTED + ")(?=/|$)", "i");
  var SKIP_RE =
    /^\/(js|css|images|img|fonts|assets|media|webhooks|api|sw\.js|manifest\.webmanifest|ads\.txt|robots\.txt|favicon\.ico)(\/|$)/i;

  function norm(raw) {
    var s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/_/g, "-");
    if (!s) return "";
    if (("|" + SUPPORTED + "|").indexOf("|" + s + "|") !== -1) return s;
    var base = s.split("-")[0];
    if (("|" + SUPPORTED + "|").indexOf("|" + base + "|") !== -1) return base;
    return "";
  }

  function fromPath() {
    try {
      var m = String(location.pathname || "/").match(RE);
      return m ? norm(m[1]) : "";
    } catch (e) {
      return "";
    }
  }

  function fromQuery() {
    try {
      var q = new URLSearchParams(location.search || "");
      return norm(q.get("lang") || q.get("locale") || "");
    } catch (e) {
      return "";
    }
  }

  function fromCookie() {
    try {
      var m = String(document.cookie || "").match(/(?:^|;\s*)vc_site_lang=([a-z]{2})/i);
      return m ? norm(m[1]) : "";
    } catch (e) {
      return "";
    }
  }

  function fromStorage() {
    try {
      return norm(localStorage.getItem(STORAGE_KEY) || "");
    } catch (e) {
      return "";
    }
  }

  function fromNavigator() {
    try {
      var list = navigator.languages && navigator.languages.length ? navigator.languages : null;
      if (list) {
        for (var i = 0; i < list.length; i += 1) {
          var n = norm(list[i]);
          if (n) return n;
        }
      }
      return norm(navigator.language || "");
    } catch (e) {
      return "";
    }
  }

  function persist(lang) {
    if (!lang) return;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch (e0) {}
    try {
      document.cookie =
        "vc_site_lang=" +
        lang +
        "; Path=/; Max-Age=31536000; SameSite=Lax" +
        (location.protocol === "https:" ? "; Secure" : "");
    } catch (e1) {}
    try {
      document.documentElement.lang = lang;
      document.documentElement.setAttribute("data-vc-lang", lang);
      document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    } catch (e2) {}
  }

  function paint(lang) {
    if (!lang) return;
    try {
      document.documentElement.lang = lang;
      document.documentElement.setAttribute("data-vc-lang", lang);
      document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    } catch (e) {}
  }

  function stripLangPrefix(pathname) {
    var path = String(pathname || "/");
    if (!path || path.charAt(0) !== "/") path = "/" + path;
    var m = path.match(RE);
    if (!m) return path;
    var rest = path.slice(m[0].length) || "/";
    if (rest.charAt(0) !== "/") rest = "/" + rest;
    return rest;
  }

  function buildLangPath(lang, pathname) {
    var code = norm(lang) || "it";
    var rest = stripLangPrefix(pathname || "/");
    if (SKIP_RE.test(rest)) return rest;
    if (code === "it") return rest === "/" ? "/" : rest;
    if (rest === "/") return "/" + code + "/";
    return "/" + code + rest;
  }

  function clearJumpFlag() {
    try {
      sessionStorage.removeItem(JUMP_FLAG);
    } catch (e) {}
  }

  function clearPrefixFlag() {
    try {
      sessionStorage.removeItem("vc_lang_prefix_pending");
      sessionStorage.removeItem("vc_lang_prefix_pending");
    } catch (eClr) {}
    try {
      window.__vcLangPrefixCleared = 1;
    } catch (eMark) {}
  }

  var pathLang = fromPath();
  var queryLang = fromQuery();
  var stored = fromStorage();
  var cookieLang = fromCookie();
  /* preferenza esplicita (path/query/cookie/storage); navigator solo al primo tocco */
  var preferred = pathLang || queryLang || stored || cookieLang || "";
  var firstVisit = !pathLang && !queryLang && !stored && !cookieLang;
  if (firstVisit) preferred = fromNavigator() || "it";

  if (pathLang || queryLang) {
    persist(pathLang || queryLang);
    clearJumpFlag();
  } else if (preferred) {
    paint(preferred);
  }

  clearPrefixFlag();

  /* langAutoRedirect1: se serve prefisso e non c’è → 1 replace. Se qualcosa
     ritaglia di nuovo a /, il flag JUMP evita il loop e resta paint+cookie. */
  try {
    if (pathLang) {
      clearJumpFlag();
    } else if (preferred && preferred !== "it") {
      var rest = stripLangPrefix(location.pathname || "/");
      if (!SKIP_RE.test(rest)) {
        var target = buildLangPath(preferred, rest);
        var cur = String(location.pathname || "/");
        if (target && target !== cur) {
          var jumping = "";
          try {
            jumping = String(sessionStorage.getItem(JUMP_FLAG) || "");
          } catch (eJ) {}
          if (jumping === "1") {
            /* già tentato in questo giro: stop (no loop) */
            clearJumpFlag();
            persist(preferred);
          } else {
            try {
              sessionStorage.setItem(JUMP_FLAG, "1");
            } catch (eSet) {}
            persist(preferred);
            location.replace(target + (location.search || "") + (location.hash || ""));
            return;
          }
        }
      }
    }
  } catch (eRedir) {}

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", clearPrefixFlag, { once: true });
    }
  } catch (eDom) {}
})();
