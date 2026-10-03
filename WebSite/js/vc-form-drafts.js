(function (global) {
  var PREFIX = "vc_form_draft_v1:";
  var MAX_CHARS = 400000;
  /* draftToast1: toast "Bozza salvata" dopo persist (throttled) */
  var lastNotifyAt = 0;
  var DEFAULT_TOAST_GAP_MS = 3200;

  function storage() {
    try {
      return global.sessionStorage;
    } catch (e) {
      return null;
    }
  }

  function fullKey(name) {
    return PREFIX + String(name || "").trim();
  }

  function notifySaved(opts) {
    opts = opts || {};
    var gap = Number(opts.minGapMs);
    if (!Number.isFinite(gap) || gap < 0) gap = DEFAULT_TOAST_GAP_MS;
    var now = Date.now();
    if (now - lastNotifyAt < gap) return false;
    lastNotifyAt = now;
    var msg = String(opts.message || "Bozza salvata.").trim() || "Bozza salvata.";
    try {
      if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
        global.VcSiteToast.show(msg, false, { ms: Number(opts.ms) > 0 ? Number(opts.ms) : 1400 });
        return true;
      }
    } catch (e1) {}
    try {
      if (typeof global.__vcShowSiteToast === "function") {
        global.__vcShowSiteToast(msg, false, { ms: Number(opts.ms) > 0 ? Number(opts.ms) : 1400 });
        return true;
      }
    } catch (e2) {}
    return false;
  }

  function save(name, data, opts) {
    opts = opts || {};
    var s = storage();
    var key = fullKey(name);
    if (!s || !key || key === PREFIX) return false;
    try {
      if (data == null || data === "") {
        s.removeItem(key);
        return true;
      }
      var payload = JSON.stringify({ at: Date.now(), data: data });
      if (payload.length > MAX_CHARS) return false;
      s.setItem(key, payload);
      if (opts.notify) notifySaved(opts);
      return true;
    } catch (e) {
      return false;
    }
  }

  function load(name) {
    var s = storage();
    var key = fullKey(name);
    if (!s || !key || key === PREFIX) return null;
    try {
      var raw = s.getItem(key);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function clear(name) {
    var s = storage();
    var key = fullKey(name);
    if (!s || !key || key === PREFIX) return;
    try {
      s.removeItem(key);
    } catch (e) {}
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var ctx = this;
      var args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        t = null;
        fn.apply(ctx, args);
      }, ms || 200);
    };
  }

  function bindField(el, name, opts) {
    opts = opts || {};
    if (!el || !name) return null;
    if (el._vcDraftBound) return el._vcDraftBound;
    var read =
      opts.read ||
      function () {
        if (el.type === "checkbox") return Boolean(el.checked);
        return el.value;
      };
    var write =
      opts.write ||
      function (v) {
        if (el.type === "checkbox") {
          el.checked = Boolean(v);
          return;
        }
        el.value = v == null ? "" : String(v);
      };
    var saved = load(name);
    if (saved != null && saved !== "") {
      try {
        write(saved);
        if (typeof opts.onRestore === "function") opts.onRestore(saved);
      } catch (eRestore) {}
    }
    var wantNotify = opts.notify !== false;
    var persist = debounce(function () {
      var v = read();
      if (v == null || v === "" || v === false) clear(name);
      else save(name, v, wantNotify ? { notify: true } : {});
    }, opts.debounceMs || 180);
    el.addEventListener("input", persist);
    el.addEventListener("change", persist);
    var api = {
      saveNow: function () {
        var v = read();
        if (v == null || v === "" || v === false) clear(name);
        else save(name, v, wantNotify ? { notify: true } : {});
      },
      clear: function () {
        clear(name);
      },
    };
    el._vcDraftBound = api;
    return api;
  }

  function bindObject(name, getter, setter, opts) {
    opts = opts || {};
    if (!name || typeof getter !== "function" || typeof setter !== "function") return null;
    var saved = load(name);
    if (saved != null) {
      try {
        setter(saved);
      } catch (eSet) {}
    }
    var wantNotify = opts.notify !== false;
    var persist = debounce(function () {
      try {
        var v = getter();
        if (v == null || v === "" || (typeof v === "object" && !Object.keys(v).length)) clear(name);
        else save(name, v, wantNotify ? { notify: true } : {});
      } catch (eGet) {}
    }, opts.debounceMs || 220);
    return {
      saveNow: function () {
        try {
          var v = getter();
          if (v == null || v === "" || (typeof v === "object" && !Object.keys(v).length)) clear(name);
          else save(name, v, wantNotify ? { notify: true } : {});
        } catch (e) {}
      },
      clear: function () {
        clear(name);
      },
      touch: persist,
    };
  }

  function autoBind(root) {
    root = root || document;
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll("[data-vc-draft]");
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      var name = el.getAttribute("data-vc-draft");
      if (!name || el._vcDraftBound) continue;
      bindField(el, name);
    }
  }

  global.VcFormDrafts = {
    save: save,
    load: load,
    clear: clear,
    debounce: debounce,
    bindField: bindField,
    bindObject: bindObject,
    autoBind: autoBind,
    notifySaved: notifySaved,
  };

  function boot() {
    autoBind(document);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : this);
