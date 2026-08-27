/**
 * Titoli pagina unificati: "Vinili & Caffè | <Pagina>"
 * Usare sempre questo modulo (mai "Brand - …" / solo pagina).
 */
(function (global) {
  "use strict";

  var DEFAULT_BRAND = "Vinili & Caffè";
  var SEP = " | ";

  function siteBrandName() {
    try {
      var auth = global.__VC_AUTH;
      var fromAuth = String((auth && auth.siteName) || "").trim();
      if (fromAuth) return fromAuth;
    } catch (e0) {}
    try {
      var cfg = global.__VC_SITE;
      var fromSite = String((cfg && (cfg.siteName || cfg.name)) || "").trim();
      if (fromSite) return fromSite;
    } catch (e1) {}
    return DEFAULT_BRAND;
  }

  /** Canonicalizza etichette pagina (es. "Profilo staff" → "Profilo Staff"). */
  function polishPageLabel(label) {
    var s = String(label || "").trim().replace(/\s+/g, " ");
    if (!s) return "";
    s = s.replace(/\bstaff\b/gi, "Staff");
    return s;
  }

  function stripDecorations(raw) {
    return String(raw || "")
      .trim()
      .replace(/\{\{\s*SITE_NAME\s*\}\}/gi, siteBrandName())
      .replace(/\{\{[A-Z0-9_]+\}\}/g, "")
      .replace(/^\(\d+\+?(?:\s+notifich[ea])?\)\s+/i, "")
      .replace(/^●\s+/, "")
      .replace(/^Vinili(?:\s*&\s*Caff[eè])?\s*[-–—]\s+/i, "")
      .trim();
  }

  /** Sempre: "Brand | Pagina" (pipe, mai trattino). */
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
      if (!right) return brand;
      if (!left || /^vinili$/i.test(left) || /^vinili\s*&\s*caff[eè]$/i.test(left)) {
        return brand + SEP + right;
      }
      return left + SEP + right;
    }

    // "Brand - Pagina" / "Brand – Pagina" → pipe
    var dash = cleaned.search(/\s+[-–—]\s+/);
    if (dash > 0) {
      left = cleaned.slice(0, dash).trim();
      right = polishPageLabel(cleaned.slice(dash).replace(/^\s+[-–—]\s+/, ""));
      if (right && (/^vinili$/i.test(left) || /^vinili\s*&\s*caff[eè]$/i.test(left) || left === brand)) {
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
      var want = format(fullTitle || (global.document && global.document.title) || "");
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

  // Applica subito (script sync in <head> o prima di altri title writer).
  try {
    if (global.document && global.document.title) {
      applyFromDocument();
      syncOgTitle();
    }
  } catch (eBoot) {}

  // Se lo script è in head prima del <title>, ritenta a DOM ready.
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
