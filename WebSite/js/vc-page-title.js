(function (global) {
  "use strict";

  var DEFAULT_BRAND = "Vinili & Caffè";
  var SEP = " | ";

  function siteBrandName() {
    try {
      var auth = global.__VC_AUTH;
      var fromAuth = String((auth && auth.siteName) || "").trim();
      if (fromAuth) return decodeHtmlEntities(fromAuth);
    } catch (e0) {}
    try {
      var cfg = global.__VC_SITE;
      var fromSite = String((cfg && (cfg.siteName || cfg.name)) || "").trim();
      if (fromSite) return decodeHtmlEntities(fromSite);
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
      .replace(/^Vinili(?:\s*&\s*Caff[eè])?\s*[-–—]\s+/i, "")
      .trim();
  }

  function isBrandLabel(label, brand) {
    var t = decodeHtmlEntities(String(label || "")).trim();
    if (!t) return true;
    if (t === brand) return true;
    return /^vinili(?:\s*&\s*caff[eè])?$/i.test(t);
  }

    function format(pageOrFull, brandOpt) {
    var brand = String(brandOpt || siteBrandName()).trim() || DEFAULT_BRAND;
    var cleaned = stripDecorations(pageOrFull);
    if (!cleaned) return brand;

    var pipe = cleaned.indexOf("|");
    var left;
    var right;
    if (pipe >= 0) {
      left = cleaned.slice(0, pipe).trim();
      right = polishPageLabel(cleaned.slice(pipe + 1));
      if (!right && !left) return brand;
      if (isBrandLabel(right, brand) && !isBrandLabel(left, brand)) {
        return brand + SEP + polishPageLabel(left);
      }
      if (!right) return brand;
      if (isBrandLabel(left, brand)) {
        return brand + SEP + right;
      }
            return brand + SEP + polishPageLabel(isBrandLabel(left, brand) ? right : left || right);
    }

        var dash = cleaned.search(/\s+[-–—]\s+/);
    if (dash > 0) {
      left = cleaned.slice(0, dash).trim();
      right = polishPageLabel(cleaned.slice(dash).replace(/^\s+[-–—]\s+/, ""));
      if (right && isBrandLabel(left, brand)) {
        return brand + SEP + right;
      }
    }

    return brand + SEP + polishPageLabel(cleaned);
  }

  function pageOnly(raw) {
    var full = format(raw);
    var pipe = full.indexOf("|");
    if (pipe < 0) return full;
    return full.slice(pipe + 1).trim() || full;
  }

  function formatWithUnread(unread, base) {
    var n = Math.max(0, Math.floor(Number(unread) || 0));
    var rest = format(base || (global.document && global.document.title) || siteBrandName());
    if (n <= 0) return rest;
    var count = n > 99 ? "99+" : String(n);
    return "(" + count + ") " + rest;
  }

  function setTitle(pageOrFull, brandOpt) {
    var want = format(pageOrFull, brandOpt);
    try {
      if (global.document && String(global.document.title || "") !== want) {
        global.document.title = want;
      }
    } catch (eSet) {}
    syncOgTitle(want);
    return want;
  }

  function applyFromDocument() {
    try {
      if (!global.document) return "";
      return setTitle(global.document.title || siteBrandName());
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
      var want = format(fullTitle || (global.document && global.document.title) || "");
            if (rawOg && /^\s*vinili/i.test(rawOg) && rawOg.indexOf("|") >= 0 && rawOg.length > want.length + 2) {
        var ogFmt = format(rawOg);
        if (ogFmt.length > want.length) want = ogFmt;
      }
      if (el.getAttribute("content") !== want) el.setAttribute("content", want);
    } catch (eOg) {}
  }

  var api = {
    brand: siteBrandName,
    polishPageLabel: polishPageLabel,
    format: format,
    pageOnly: pageOnly,
    formatWithUnread: formatWithUnread,
    set: setTitle,
    apply: applyFromDocument,
    syncOgTitle: syncOgTitle,
    SEP: SEP,
    DEFAULT_BRAND: DEFAULT_BRAND,
  };

  global.VcPageTitle = api;

    try {
    if (global.document && global.document.title) {
      applyFromDocument();
      syncOgTitle();
    }
  } catch (eBoot) {}

    try {
    if (global.document && global.document.readyState === "loading") {
      global.document.addEventListener(
        "DOMContentLoaded",
        function () {
          applyFromDocument();
          syncOgTitle();
        },
        { once: true },
      );
    }
  } catch (eReady) {}
})(typeof window !== "undefined" ? window : globalThis);
