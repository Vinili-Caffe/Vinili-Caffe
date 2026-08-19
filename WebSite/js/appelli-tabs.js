(function () {
  var TAB_UNBAN = "unban";
  var TAB_UNMUTE = "unmute";

  function byId(id) {
    return document.getElementById(id);
  }

  function t(key, fallback) {
    if (window.VcI18n && typeof window.VcI18n.t === "function") {
      var v = window.VcI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function resolveTipo() {
    try {
      var q = new URLSearchParams(window.location.search || "");
      var tipo = String(q.get("tipo") || q.get("type") || "").trim().toLowerCase();
      if (tipo === TAB_UNMUTE) return TAB_UNMUTE;
      var hash = String(window.location.hash || "").replace(/^#/, "").toLowerCase();
      if (hash === TAB_UNMUTE) return TAB_UNMUTE;
    } catch (e) {}
    return TAB_UNBAN;
  }

  function setUrl(tipo, replace) {
    try {
      var u = new URL(window.location.href);
      if (tipo === TAB_UNMUTE) u.searchParams.set("tipo", TAB_UNMUTE);
      else u.searchParams.delete("tipo");
      u.searchParams.delete("type");
      u.hash = "";
      var next = u.pathname + u.search;
      if (replace) window.history.replaceState({}, "", next);
      else window.history.pushState({}, "", next);
    } catch (e2) {}
  }

  function setTabOn(btn, on) {
    if (!btn) return;
    btn.classList.toggle("vc-appelli-mode__opt--on", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  }

  function setShuffleText(el, finalText) {
    if (!el) return;
    var target = String(finalText || "");
    el.__vcShuffleFinal = target;
    if (!target) {
      el.textContent = "";
      return;
    }
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.textContent = target;
      return;
    }
    var root = document.documentElement;
    if (root && root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) {
      el.textContent = target;
      return;
    }
    if (el.__vcShuffleTimer) {
      clearInterval(el.__vcShuffleTimer);
      el.__vcShuffleTimer = null;
    }
    var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    var frame = 0;
    var totalFrames = Math.max(8, Math.min(26, target.length + 8));
    el.__vcShuffleTimer = setInterval(function () {
      frame += 1;
      var fixed = Math.floor((frame / totalFrames) * target.length);
      var out = "";
      for (var i = 0; i < target.length; i++) {
        var ch = target.charAt(i);
        if (ch === " ") out += " ";
        else if (i < fixed) out += ch;
        else out += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      el.textContent = out;
      if (frame >= totalFrames) {
        clearInterval(el.__vcShuffleTimer);
        el.__vcShuffleTimer = null;
        el.textContent = target;
      }
    }, 22);
  }

  function shineHeroCopy(next) {
    var heading = byId("vc-appelli-hero-heading");
    var kicker = document.querySelector(".vc-page-cine-hero-copy > .vc-hero-kicker, .vc-support-page-hero .vc-hero-kicker");
    var welcome = byId(next === TAB_UNMUTE ? "unmute-welcome" : "unban-welcome");
    var nodes = [heading, kicker, welcome];
    for (var i = 0; i < nodes.length; i++) {
      if (!nodes[i]) continue;
      nodes[i].classList.add("vc-home-rise", "is-in");
    }
    if (heading) heading.classList.add("vc-brand-glow");
    if (kicker) kicker.classList.add("vc-hero-kicker");
    if (welcome) welcome.classList.add("vc-hero-about");
  }

  function applyTab(tipo, opts) {
    var next = tipo === TAB_UNMUTE ? TAB_UNMUTE : TAB_UNBAN;
    var panelUnban = byId("vc-appelli-panel-unban");
    var panelUnmute = byId("vc-appelli-panel-unmute");
    var sideUnban = byId("vc-appelli-side-unban");
    var sideUnmute = byId("vc-appelli-side-unmute");
    var welcomeUnban = byId("unban-welcome");
    var welcomeUnmute = byId("unmute-welcome");
    var tabUnban = byId("vc-appelli-tab-unban");
    var tabUnmute = byId("vc-appelli-tab-unmute");
    var accent = byId("vc-appelli-hero-accent");
    var before = accent && accent.previousElementSibling;
    var iconI = byId("vc-appelli-hero-icon-i");

    if (panelUnban) panelUnban.hidden = next !== TAB_UNBAN;
    if (panelUnmute) panelUnmute.hidden = next !== TAB_UNMUTE;
    if (sideUnban) sideUnban.hidden = next !== TAB_UNBAN;
    if (sideUnmute) sideUnmute.hidden = next !== TAB_UNMUTE;
    if (welcomeUnban) welcomeUnban.hidden = next !== TAB_UNBAN;
    if (welcomeUnmute) welcomeUnmute.hidden = next !== TAB_UNMUTE;

    setTabOn(tabUnban, next === TAB_UNBAN);
    setTabOn(tabUnmute, next === TAB_UNMUTE);

    if (before && before.tagName === "SPAN") {
      before.setAttribute(
        "data-i18n",
        next === TAB_UNMUTE ? "unmute.heroTitleBefore" : "unban.heroTitleBefore",
      );
      before.textContent = t(
        next === TAB_UNMUTE ? "unmute.heroTitleBefore" : "unban.heroTitleBefore",
        "Richiesta ",
      );
    }
    if (accent) {
      accent.setAttribute(
        "data-i18n",
        next === TAB_UNMUTE ? "unmute.heroTitleAccent" : "unban.heroTitleAccent",
      );
      var accentText = t(
        next === TAB_UNMUTE ? "unmute.heroTitleAccent" : "unban.heroTitleAccent",
        next === TAB_UNMUTE ? "unmute" : "unban",
      );
      setShuffleText(accent, accentText);
    }
    if (iconI) {
      iconI.className = next === TAB_UNMUTE ? "fa fa-microphone-slash" : "fa fa-unlock";
    }

    shineHeroCopy(next);

    if (!opts || opts.updateUrl !== false) {
      setUrl(next, !!(opts && opts.replace));
    }

    try {
      document.dispatchEvent(new CustomEvent("vc:appelli-tab", { detail: { tipo: next } }));
    } catch (eTab) {}
  }

  function init() {
    var tabUnban = byId("vc-appelli-tab-unban");
    var tabUnmute = byId("vc-appelli-tab-unmute");
    if (!tabUnban && !tabUnmute) return;
    applyTab(resolveTipo(), { replace: true });
    if (tabUnban) {
      tabUnban.addEventListener("click", function () {
        applyTab(TAB_UNBAN);
      });
    }
    if (tabUnmute) {
      tabUnmute.addEventListener("click", function () {
        applyTab(TAB_UNMUTE);
      });
    }
    window.addEventListener("popstate", function () {
      applyTab(resolveTipo(), { updateUrl: false });
    });
    document.addEventListener("vc:page-cine-ready", function () {
      var accent = byId("vc-appelli-hero-accent");
      if (accent && accent.__vcShuffleFinal) setShuffleText(accent, accent.__vcShuffleFinal);
      shineHeroCopy(resolveTipo());
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
