(function (global) {
  "use strict";

  /* titlePwaDingbat3: SEMPRE brand ǀ pagina (tab + PWA).
     Page-only in PWA → Win "name - page" col trattino. SEP U+01C0. */
  var DEFAULT_BRAND = "🎃 Vinili & Caffè 🍂 • Italia • Social • Gaming";
  var SHORT_BRAND = "Vinili & Caffè";
  /* SEP = U+01C0 ǀ — Win converte |/│/｜/❘ → "-" */
  var SEP = " \u01C0 ";
  var PIPE_RE = /\s*[|\u2502\uFF5C\u2758\u01C0]\s*/;
  var VER = "20261011consoleClean1";
  /* brand guild anche senza 🎃/🍂 (il pezzo storto nello screenshot) */
  var GUILD_BRAND_RE =
    /^🎃?\s*Vinili\s*&\s*Caff[eè]\s*🍂?(?:\s*[•·]\s*(?:Italia|Social|Gaming))+$/i;

  /* path → i18n key (fallback IT label) */
  var PATH_PAGE_KEYS = {
    "/": "",
    "/vote": "nav.voteServer",
    "/faq": "nav.faq",
    "/wiki": "nav.wiki",
    "/regole": "nav.rules",
    "/donazioni": "nav.donations",
    "/ruoli": "nav.roles",
    "/sponsor": "nav.sponsor",
    "/recensioni": "nav.reviews",
    "/feedback": "nav.suggestions",
    "/candidature": "nav.applications",
    "/appelli": "nav.appeals",
    "/tickets": "nav.tickets",
    "/perks": "nav.perks",
    "/notifications": "nav.notifications",
    "/privacy": "nav.privacy",
    "/terms": "nav.terms",
    "/cookie": "nav.cookie",
    "/copyright": "nav.copyright",
    "/dati": "nav.yourData",
    "/personalizza": "nav.customize",
    "/classifiche": "nav.users",
    "/user": "nav.profile",
    "/bacheca": "nav.bacheca",
    "/bacheca/server": "boards.serversTitle",
    "/bacheca/bot": "boards.botsTitle",
    "/bacheca/scheda": "boards.detailTitle",
    "/bacheca/invia": "boards.submitTitle",
    "/bacheca/le-mie": "boards.manageTitle",
    "/bacheca/mod": "boards.modTitle",
    "/bacheca/vota": "boards.voteTitle",
    "/confessionale": "nav.confessionale",
    "/puzzle": "nav.puzzle",
    "/seratafilm": "nav.movieNight",
    "/staff": "nav.staff",
    "/staff/compiti": "staff.compiti",
    "/staff/inbox": "nav.staff",
    "/staff/pause": "nav.staff",
    "/dashboard": "nav.dashboard",
    "/dashboard/premium": "nav.premium",
    "/status": "nav.status",
  };

  var PATH_PAGE_FALLBACK_IT = {
    "/": "",
    "/vote": "Vota",
    "/faq": "FAQ",
    "/wiki": "Wiki",
    "/regole": "Regole",
    "/donazioni": "Donazioni",
    "/ruoli": "Ruoli",
    "/sponsor": "Sponsor",
    "/recensioni": "Recensioni",
    "/feedback": "Feedback",
    "/candidature": "Candidature",
    "/appelli": "Appelli",
    "/tickets": "Tickets",
    "/perks": "Perks",
    "/notifications": "Notifiche",
    "/privacy": "Privacy",
    "/terms": "Termini",
    "/cookie": "Cookie",
    "/copyright": "Copyright",
    "/dati": "I tuoi dati",
    "/personalizza": "Personalizza",
    "/classifiche": "Classifiche",
    "/user": "Profilo",
    "/bacheca": "Bacheca",
    "/bacheca/server": "Server",
    "/bacheca/bot": "Bot",
    "/bacheca/scheda": "Scheda",
    "/bacheca/invia": "Pubblica",
    "/bacheca/le-mie": "Le mie schede",
    "/bacheca/mod": "Moderazione",
    "/bacheca/vota": "Vota",
    "/confessionale": "Confessionale",
    "/puzzle": "Puzzle",
    "/seratafilm": "Serata film",
    "/staff": "Staff",
    "/staff/compiti": "Compiti",
    "/staff/inbox": "Inbox",
    "/staff/pause": "Pause",
    "/dashboard": "Dashboard",
    "/dashboard/premium": "Premium",
    "/status": "Status",
  };

  function t(key, fallback) {
    try {
      if (global.VcI18n && typeof global.VcI18n.t === "function") {
        var v = global.VcI18n.t(key);
        if (v != null && String(v) !== "" && String(v) !== key) return String(v);
      }
    } catch (e) {}
    return fallback;
  }

  function stripLangPrefix(pathname) {
    try {
      if (global.VcI18n && typeof global.VcI18n.stripLangPrefix === "function") {
        return String(global.VcI18n.stripLangPrefix(pathname) || pathname);
      }
    } catch (e) {}
    return String(pathname || "/")
      .replace(
        /^\/(it|en|es|fr|de|pt|ru|zh|ja|ko|ar|nl|pl|tr|hi|id|uk|vi|ro|sv)(?=\/|$)/i,
        "",
      ) || "/";
  }

  function currentPath() {
    try {
      var raw = String((global.location && global.location.pathname) || "/");
      return stripLangPrefix(raw)
        .replace(/\/index\.html$/i, "")
        .replace(/\/+$/, "") || "/";
    } catch (ePath) {
      return "/";
    }
  }

  function labelFromPath(pathname) {
    var p = String(pathname || currentPath() || "/");
    function resolve(keyPath) {
      var i18nKey = PATH_PAGE_KEYS[keyPath];
      var fb = PATH_PAGE_FALLBACK_IT[keyPath] || "";
      if (!i18nKey) return fb;
      return t(i18nKey, fb);
    }
    if (Object.prototype.hasOwnProperty.call(PATH_PAGE_KEYS, p)) {
      return resolve(p);
    }
    var bestKey = "";
    var bestLen = -1;
    for (var key in PATH_PAGE_KEYS) {
      if (!Object.prototype.hasOwnProperty.call(PATH_PAGE_KEYS, key)) continue;
      if (key === "/") continue;
      if (p === key || p.indexOf(key + "/") === 0) {
        if (key.length > bestLen) {
          bestKey = key;
          bestLen = key.length;
        }
      }
    }
    return bestKey ? resolve(bestKey) : "";
  }

  function canonicalizeBrand(raw) {
    var s = decodeHtmlEntities(String(raw || "")).trim().replace(/\s+/g, " ");
    if (!s) return DEFAULT_BRAND;
    if (GUILD_BRAND_RE.test(s)) return DEFAULT_BRAND;
    if (/Vinili\s*&\s*Caff[eè]/i.test(s) && /Italia/i.test(s) && /Social/i.test(s) && /Gaming/i.test(s)) {
      return DEFAULT_BRAND;
    }
    if (/^Vinili\s*&\s*Caff[eè]$/i.test(s)) return DEFAULT_BRAND;
    return s;
  }

  function siteBrandName() {
    try {
      var br = global.__VC_SITE_BRAND;
      var fromTitle = String((br && (br.titleName || br.siteName)) || "").trim();
      if (fromTitle) return canonicalizeBrand(fromTitle);
    } catch (eBrand) {}
    try {
      var auth = global.__VC_AUTH;
      var fromAuth = String((auth && auth.siteName) || "").trim();
      if (fromAuth) return canonicalizeBrand(fromAuth);
    } catch (e0) {}
    try {
      var cfg = global.__VC_SITE;
      var fromSite = String((cfg && (cfg.siteName || cfg.name)) || "").trim();
      if (fromSite) return canonicalizeBrand(fromSite);
    } catch (e1) {}
    return DEFAULT_BRAND;
  }

  function polishPageLabel(label) {
    var s = String(label || "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    s = s.replace(/\bstaff\b/gi, "Staff");
    return s;
  }

  function decodeHtmlEntities(raw) {
    return String(raw || "")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">");
  }

  function stripDecorations(raw) {
    return decodeHtmlEntities(String(raw || ""))
      .trim()
      .replace(/\{\{\s*SITE_NAME\s*\}\}/gi, siteBrandName())
      .replace(/\{\{[A-Z0-9_]+\}\}/g, "")
      .replace(/^\(\d+\+?(?:\s+notifich[ea])?\)\s+/i, "")
      .replace(/^●\s+/, "")
      /* solo prefisso Discord "Vinili & Caffè - …", NON togliere il nome in mezzo alle emoji */
      .replace(/^Vinili\s*&\s*Caff[eè]\s*[-–—|\u2502\uFF5C\u2758\u01C0:]\s+/i, "")
      .trim();
  }

  function hasTitlePipe(s) {
    return /[|\u2502\uFF5C\u2758\u01C0]/.test(String(s || ""));
  }

  /* Se Windows/HTML ha già trasformato il sep in " - " o resta |/❘, ripristina ǀ */
  function repairWinDashSep(s) {
    var raw = String(s || "");
    if (!raw) return raw;
    /* pwaOgDashKill3: |/│/｜/❘ e dash Win → ǀ */
    raw = raw.replace(/\s*[|\u2502\uFF5C\u2758]\s*/g, SEP);
    raw = raw.replace(/(\bGaming)\s+[-–—−]\s+(?=\S)/g, "$1" + SEP);
    /* homepage corta / PWA short: "Vinili & Caffè - Community…" */
    raw = raw.replace(
      /(Vinili\s*&\s*Caff[eè])\s+[-–—−]\s+(?=\S)/gi,
      "$1" + SEP,
    );
    if (!hasTitlePipe(raw) && /\s+[-–—−]\s+/.test(raw)) {
      raw = raw.replace(/\s+[-–—−]\s+(?=[^\s-–—−]+(?:\s+[^\s-–—−]+)*$)/, SEP);
    }
    return raw;
  }

  function ogTitleHasBadSep(s) {
    var t = String(s || "");
    if (!t) return false;
    if (/[|\u2502\uFF5C\u2758]/.test(t)) return true;
    /* doppio nome / short dopo Gaming (il bug dello screenshot) */
    if (/(Vinili\s*&\s*Caff[eè]).+\1/i.test(t)) return true;
    if (/Gaming\s+[-–—−|\u01C0]\s*Vinili\s*&\s*Caff[eè]/i.test(t)) return true;
    if (/^Vinili\s*&\s*Caff[eè]\s*[-–—−|\u01C0]/i.test(t) && !/🎃/.test(t)) return true;
    if (/Gaming\s+[-–—−]\s+/.test(t) && !/\u01C0/.test(t)) return true;
    if (/Social\s*[•·]\s*Gaming\s+[-–—−]\s+/.test(t) && !/\u01C0/.test(t)) return true;
    /* titleBrandMatch1 / titleDupKill1: brand - brand… (Win PWA name + title) */
    if (
      /🎃?\s*Vinili\s*&\s*Caff[eè]\s*🍂?.+Gaming\s+[-–—−]\s*Vinili\s*&\s*Caff[eè]/i.test(t)
    ) {
      return true;
    }
    /* brand storto senza 🍂 dopo il nome giusto */
    if (/🍂.+Gaming\s+[-–—−]\s*Vinili\s*&\s*Caff[eè]\s*[•·]\s*Italia/i.test(t)) {
      return true;
    }
    return false;
  }

  function forceDingbatSep(s) {
    return repairWinDashSep(String(s || ""));
  }

  function splitTitlePipes(s) {
    return String(s || "")
      .split(PIPE_RE)
      .map(function (p) {
        return String(p || "").trim();
      })
      .filter(Boolean);
  }

  function isBrandLabel(label, brand) {
    var tLab = decodeHtmlEntities(String(label || "")).trim();
    if (!tLab) return true;
    /* un titolo con pipe (ASCII o │) non è "solo brand" */
    if (hasTitlePipe(tLab)) return false;
    var b = decodeHtmlEntities(String(brand || "")).trim();
    if (b && tLab === b) return true;
    if (b && canonicalizeBrand(tLab) === canonicalizeBrand(b) && GUILD_BRAND_RE.test(tLab.replace(/\s+/g, " "))) {
      return true;
    }
    if (/^vinili(?:\s*&\s*caff[eè])?$/i.test(tLab)) return true;
    /* segmento guild: emoji + Italia/Social/Gaming (anche senza 🎃/🍂) */
    if (/Vinili\s*&\s*Caff[eè]/i.test(tLab) && /Italia/i.test(tLab) && /Social/i.test(tLab) && /Gaming/i.test(tLab)) {
      return true;
    }
    if (/Italia/i.test(tLab) && /Social/i.test(tLab) && /Gaming/i.test(tLab) && !/Community|membri|Discord/i.test(tLab)) {
      return true;
    }
    if (/🎃/.test(tLab) && /🍂/.test(tLab) && /•/.test(tLab)) return true;
    return false;
  }

  /** Toglie brand lungo/corto ripetuti finché resta solo la pagina. */
  function unwrapPageLabel(raw) {
    var s = forceDingbatSep(stripDecorations(raw));
    if (!s) return "";
    var guard = 0;
    while (guard++ < 10 && s) {
      var next = s
        /* full guild brand + sep (con/senza 🎃🍂) */
        .replace(
          /^🎃?\s*Vinili\s*&\s*Caff[eè]\s*🍂?(?:\s*[•·]\s*(?:Italia|Social|Gaming))+\s*[-–—−|\u2502\uFF5C\u2758\u01C0]+\s*/gi,
          "",
        )
        .replace(
          /^🎃\s*Vinili\s*&\s*Caff[eè]\s*🍂\s*[•·]\s*Italia\s*[•·]\s*Social\s*[•·]\s*Gaming\s*[-–—−|\u2502\uFF5C\u2758\u01C0]+\s*/gi,
          "",
        )
        /* brand storto: Vinili & Caffè • Italia • Social • Gaming | … */
        .replace(
          /^Vinili\s*&\s*Caff[eè]\s*[•·]\s*Italia\s*[•·]\s*Social\s*[•·]\s*Gaming\s*[-–—−|\u2502\uFF5C\u2758\u01C0]+\s*/gi,
          "",
        )
        /* short brand + sep */
        .replace(/^Vinili\s*&\s*Caff[eè]\s*[-–—−|\u2502\uFF5C\u2758\u01C0]+\s*/gi, "")
        .trim();
      if (next === s) break;
      s = next;
    }
    var parts = splitTitlePipes(s);
    var i;
    for (i = parts.length - 1; i >= 0; i--) {
      if (!isBrandLabel(parts[i], DEFAULT_BRAND) && !isBrandLabel(parts[i], SHORT_BRAND)) {
        return polishPageLabel(parts[i]);
      }
    }
    if (isBrandLabel(s, DEFAULT_BRAND) || isBrandLabel(s, SHORT_BRAND)) return "";
    return polishPageLabel(s);
  }

  /** Sempre: brand LUNGO ǀ <pagina> (mai short in mezzo, mai doppio). */
  function formatAppTitle(pageOrFull) {
    var brand = String(siteBrandName() || DEFAULT_BRAND).trim() || DEFAULT_BRAND;
    var page = unwrapPageLabel(pageOrFull);
    if (!page) {
      var lab = labelFromPath(currentPath());
      page = lab ? polishPageLabel(lab) : "";
    }
    if (!page) return brand;
    return brand + SEP + page;
  }

  function format(pageOrFull, brandOpt) {
    void brandOpt;
    return formatAppTitle(pageOrFull);
  }

  function pageOnly(raw) {
    var page = unwrapPageLabel(raw);
    if (page) return page;
    var lab = labelFromPath(currentPath());
    return lab ? polishPageLabel(lab) : "";
  }

  function isStandaloneDisplay() {
    try {
      if (global.matchMedia) {
        if (global.matchMedia("(display-mode: standalone)").matches) return true;
        if (global.matchMedia("(display-mode: minimal-ui)").matches) return true;
        if (global.matchMedia("(display-mode: window-controls-overlay)").matches) return true;
      }
      if (global.navigator && global.navigator.standalone === true) return true;
      if (global.location && /(?:^|[?&])app=/i.test(String(global.location.search || ""))) {
        return true;
      }
    } catch (eStand) {}
    return false;
  }

  /** Tab + PWA: sempre brand ǀ pagina (mai page-only → Win "name - page"). */
  function displayTitle(fullFormatted) {
    return forceDingbatSep(formatAppTitle(fullFormatted));
  }

  function readOgTitleRaw() {
    try {
      if (!global.document) return "";
      var el =
        global.document.querySelector('meta[property="og:title"]') ||
        global.document.querySelector('meta[name="og:title"]');
      return decodeHtmlEntities((el && el.getAttribute("content")) || "").trim();
    } catch (eOg) {
      return "";
    }
  }

  /* titleNoCount1: base title pulito (strip (n)) — count solo su badge OS */
  function resolveUnreadBaseTitle(base) {
    var candidates = [
      base,
      global.document && global.document.title,
      readOgTitleRaw(),
      labelFromPath(currentPath()),
    ];
    var i;
    for (i = 0; i < candidates.length; i++) {
      var page = unwrapPageLabel(candidates[i]);
      if (page) return formatAppTitle(page);
    }
    return String(siteBrandName() || DEFAULT_BRAND).trim() || DEFAULT_BRAND;
  }

  function formatWithUnread(unread, base) {
    /* titleNoCount1 / titlePwaDingbat3: niente (n); sempre brand ǀ pagina */
    void unread;
    return forceDingbatSep(displayTitle(resolveUnreadBaseTitle(base)));
  }

  function writeDocumentTitle(want) {
    try {
      if (!global.document) return;
      want = forceDingbatSep(want);
      var el = global.document.querySelector("title");
      if (el) {
        try {
          el.setAttribute("data-vc-emoji-skip", "1");
        } catch (eSkip) {}
        /* titleBrandMatch1: niente span/img dentro <title> (rompe document.title) */
        while (el.firstChild) el.removeChild(el.firstChild);
        el.appendChild(global.document.createTextNode(want));
      }
      if (String(global.document.title || "") !== want) {
        global.document.title = want;
      }
      try {
        if (global.VcEmojiColor && typeof global.VcEmojiColor.unwrapTitle === "function") {
          global.VcEmojiColor.unwrapTitle();
        }
      } catch (eUn) {}
    } catch (eWrite) {}
  }

  function syncApplicationName(full) {
    /* titlePwaDingbat3: application-name = stesso title → Win non fa "name - title" */
    try {
      if (!global.document) return;
      var want = forceDingbatSep(full || "");
      if (!want) return;
      var el = global.document.querySelector('meta[name="application-name"]');
      if (!el) {
        el = global.document.createElement("meta");
        el.setAttribute("name", "application-name");
        (global.document.head || global.document.documentElement).appendChild(el);
      }
      if (String(el.getAttribute("content") || "") !== want) {
        el.setAttribute("content", want);
      }
    } catch (eApp) {}
  }

  function setTitle(pageOrFull, brandOpt) {
    void brandOpt;
    var full = formatAppTitle(pageOrFull);
    var shown = displayTitle(full);
    writeDocumentTitle(shown);
    syncOgTitle(full);
    syncApplicationName(shown);
    return shown;
  }

  /* titleOgDingbat1 + titlePwaDupKill2: ripara |/- e doppio brand (anche dopo notif blink) */
  function armTitleSepGuard() {
    try {
      if (global.__vcTitleSepGuard) return;
      global.__vcTitleSepGuard = 1;
      var n = 0;
      var maxN = isStandaloneDisplay() ? 120 : 30;
      var ogElCache = null;
      var lastCur = "";
      var lastOg = "";
      var timer = global.setInterval(function () {
        n += 1;
        try {
          var cur = String(global.document.title || "");
          if (!ogElCache || !ogElCache.isConnected) {
            ogElCache =
              global.document.querySelector('meta[property="og:title"]') ||
              global.document.querySelector('meta[name="og:title"]');
          }
          var ogCur = String((ogElCache && ogElCache.getAttribute("content")) || "");
          if (cur === lastCur && ogCur === lastOg) {
            if (n >= maxN) global.clearInterval(timer);
            return;
          }
          lastCur = cur;
          lastOg = ogCur;
          var pwaDup =
            isStandaloneDisplay() &&
            (/Vinili\s*&\s*Caff[eè]/i.test(cur) ||
              ogTitleHasBadSep(cur) ||
              (hasTitlePipe(cur) && /Italia/i.test(cur)));
          if (pwaDup || ogTitleHasBadSep(cur) || ogTitleHasBadSep(ogCur)) {
            applyFromDocument();
            syncOgTitle();
          } else if (
            !isStandaloneDisplay() &&
            (/[|\u2502\uFF5C\u2758]/.test(cur) ||
              /\s+[-–—−]\s+/.test(cur) ||
              (/Gaming\s+[-–—−]\s+/.test(cur) && !/\u01C0/.test(cur)))
          ) {
            /* titleSepFix1: Win/deploy ha messo - al posto di ǀ → ripristina + sync app-name */
            var fixed = forceDingbatSep(cur);
            writeDocumentTitle(fixed);
            syncApplicationName(fixed);
            if (ogTitleHasBadSep(ogCur)) syncOgTitle();
          }
        } catch (eG) {}
        if (n >= maxN) global.clearInterval(timer);
      }, 200);
      /* notif attention può riscrivere il title dopo i primi secondi */
      global.setTimeout(function () {
        try {
          if (!isStandaloneDisplay()) return;
          var cur2 = String(global.document.title || "");
          if (/Vinili\s*&\s*Caff[eè]/i.test(cur2) || ogTitleHasBadSep(cur2)) {
            applyFromDocument();
            syncOgTitle();
          }
        } catch (eLate) {}
      }, 2500);
    } catch (eArm) {}
  }

  function applyFromDocument() {
    try {
      if (!global.document) return "";
      var pathNow = currentPath();
      /* classificheRename1: path board batte title/og stale “Community” */
      if (pathNow === "/classifiche") {
        var boardLabel = labelFromPath(pathNow) || "Classifiche";
        return setTitle(boardLabel);
      }
      var raw = String(global.document.title || "").trim();
      if (!raw || isBrandLabel(raw, siteBrandName())) {
        var fromPath = labelFromPath(pathNow);
        if (fromPath) return setTitle(fromPath);
      }
      return setTitle(raw || siteBrandName());
    } catch (eApply) {
      return "";
    }
  }

  function syncOgTitle(fullTitle) {
    try {
      var el =
        global.document.querySelector('meta[property="og:title"]') ||
        global.document.querySelector('meta[name="og:title"]');
      if (!el) return;
      var rawOg = decodeHtmlEntities(el.getAttribute("content") || "");
      var want = formatAppTitle(fullTitle || rawOg || (global.document && global.document.title) || "");
      if (el.getAttribute("content") !== want) el.setAttribute("content", want);
      try {
        var tw = global.document.querySelector('meta[name="twitter:title"]');
        if (tw) {
          var twWant = formatAppTitle(tw.getAttribute("content") || want);
          if (tw.getAttribute("content") !== twWant) tw.setAttribute("content", twWant);
        }
      } catch (eTw) {}
    } catch (eOg) {}
  }

  var api = {
    __vcVer: VER,
    brand: siteBrandName,
    polishPageLabel: polishPageLabel,
    format: format,
    formatAppTitle: formatAppTitle,
    unwrapPageLabel: unwrapPageLabel,
    pageOnly: pageOnly,
    displayTitle: displayTitle,
    isStandaloneDisplay: isStandaloneDisplay,
    formatWithUnread: formatWithUnread,
    set: setTitle,
    apply: applyFromDocument,
    syncOgTitle: syncOgTitle,
    labelFromPath: labelFromPath,
    SEP: SEP,
    SHORT_BRAND: SHORT_BRAND,
    DEFAULT_BRAND: DEFAULT_BRAND,
  };

  global.VcPageTitle = api;

  try {
    if (global.document && global.document.title) {
      applyFromDocument();
      syncOgTitle();
    }
    armTitleSepGuard();
  } catch (eBoot) {}

  try {
    if (global.document && global.document.readyState === "loading") {
      global.document.addEventListener(
        "DOMContentLoaded",
        function () {
          applyFromDocument();
          syncOgTitle();
          armTitleSepGuard();
        },
        { once: true },
      );
    }
  } catch (eReady) {}

  try {
    global.document.addEventListener("vc:langchange", function () {
      applyFromDocument();
    });
  } catch (eLang) {}
})(typeof window !== "undefined" ? window : this);
