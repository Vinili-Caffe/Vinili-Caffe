(function (global) {
  "use strict";

  /* homeBootFix2: toast SOPRA sipario (z > 2147482990) — su home era invisibile */
  /* loadToastLinger1: boot load toast + hide deferred */
  /* bootToastNoFlash1: show bootLoad idempotente (no hide→remount mid-boot) */
  /* bootToastUnstick1: remount boot NON cancella linger; failsafe max ~7s */
  /* toastUnstickHard1: failsafe 3.5s + hide sempre (anche se già latched) */
  /* toastChrome404Fix1: failsafe 4s duro + latch (no remount forever) */
  var VER = "20261016toastUnstickHard1";
  var HOST_ID = "vc-site-toast-host";
  var HOST_CLASS = "vc-dash-save-toast-host vc-site-toast-host";
  var timer = null;
  var lingerTimer = null;
  var toastGen = 0;
  var bootShownAt = 0;
  var bootFailsafeTimer = null;

  function byId(id) {
    try {
      return global.document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  function looksPending(text) {
    return /[…]$|\.\.\.$/.test(String(text || "").trim());
  }

  function ensureOnBody(host) {
    if (!host || !global.document || !global.document.body) return host;
    try {
      if (host.parentNode !== global.document.body) {
        global.document.body.appendChild(host);
      }
    } catch (eMove) {}
    try {
      host.className = HOST_CLASS;
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "true");
      host.setAttribute("data-vc-toast-align", "1");
      /* homeBootFix2: sopra sipario hard (2147482990) + sheet/modal */
      host.style.setProperty("z-index", "2147483640", "important");
      host.style.setProperty("position", "fixed", "important");
      host.style.setProperty("pointer-events", "none", "important");
    } catch (eCls) {}
    return host;
  }

  function hostEl() {
    var host = byId(HOST_ID);
    if (host) return ensureOnBody(host);

        host =
      byId("vc-dash-save-toast-host") ||
      byId("vc-staff-toast-host") ||
      byId("vc-wt-toast-host");
    if (host) {
      try {
        if (!host.id) host.id = HOST_ID;
      } catch (eId) {}
      return ensureOnBody(host);
    }

    host = global.document.createElement("div");
    host.id = HOST_ID;
    return ensureOnBody(host);
  }

  function hide() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (lingerTimer) {
      clearTimeout(lingerTimer);
      lingerTimer = null;
    }
    if (bootFailsafeTimer) {
      clearTimeout(bootFailsafeTimer);
      bootFailsafeTimer = null;
    }
    var host =
      byId(HOST_ID) ||
      byId("vc-dash-save-toast-host") ||
      byId("vc-staff-toast-host") ||
      byId("vc-wt-toast-host");
    if (host) host.innerHTML = "";
  }

  /* bugListBoot1: failsafe solo a 8s (allineato hard-wall auth) —
     happy path = vc:chrome-load-done; niente kill a 3.5s a metà sipario */
  function armBootFailsafe() {
    if (bootFailsafeTimer) return;
    bootFailsafeTimer = setTimeout(function () {
      bootFailsafeTimer = null;
      try {
        if (global.__vcBootLoadToastLatched) {
          hide();
          return;
        }
        try {
          global.__vcBootLoadToastLatched = 1;
          global.__vcBootLoadToastHold = 0;
        } catch (eL) {}
        hide();
        try {
          global.document.dispatchEvent(
            new CustomEvent("vc:boot-load-toast-latched", { detail: { reason: "failsafe8s" } }),
          );
        } catch (eEv) {}
        try {
          if (typeof global.__vcForceUnlockChromeScroll === "function") {
            global.__vcForceUnlockChromeScroll("bugListBoot1ToastFs");
          }
        } catch (eUn) {}
      } catch (eFs) {}
    }, 8000);
  }

  function isLoadPendingToast(node) {
    if (!node) return false;
    try {
      if (node.getAttribute("data-vc-boot-load-toast") === "1") return true;
      if (!node.classList.contains("is-pending")) return false;
      var p = node.querySelector(".vc-dash-save-toast__text");
      return /caricamento/i.test(String((p && p.textContent) || node.textContent || ""));
    } catch (e) {
      return false;
    }
  }

  /* loadToastLinger1: sparisce DOPO la fine loading, non in sync */
  function hideLoadLinger(ms) {
    var delay = Number(ms);
    if (!Number.isFinite(delay) || delay < 0) delay = 450;
    if (lingerTimer) {
      clearTimeout(lingerTimer);
      lingerTimer = null;
    }
    lingerTimer = setTimeout(function () {
      lingerTimer = null;
      try {
        hide();
      } catch (eH) {}
    }, delay);
  }

  function show(msg, isError, opts) {
    var text = String(msg == null ? "" : msg).trim();
    if (!text) {
      hide();
      return;
    }
    opts = opts || {};
    var host = hostEl();
    var pending = opts.pending === true || opts.sticky === true || (!isError && looksPending(text));
    var isBoot =
      opts.bootLoad === true || (pending && /caricamento/i.test(text));
    /* bootToastUnstick1: se già c’è lo stesso boot toast, non remount;
       NON cancellare lingerTimer (era il bug: remount → toast eterno) */
    if (isBoot) {
      try {
        if (global.__vcBootLoadToastLatched) return;
        var existing = host.querySelector(".vc-dash-save-toast[data-vc-boot-load-toast]");
        if (existing && isLoadPendingToast(existing)) {
          try {
            existing.classList.remove("is-leaving");
            existing.classList.add("is-visible");
          } catch (eVis) {}
          if (!bootShownAt) bootShownAt = Date.now();
          armBootFailsafe();
          return;
        }
      } catch (eKeep) {}
    }
    hide();
    host = hostEl();
    var toast = global.document.createElement("div");
    toast.className =
      "vc-dash-save-toast" +
      (isError ? " is-error" : "") +
      (pending ? " is-pending" : "");
    toast.setAttribute("role", "status");
    if (isBoot) {
      try {
        toast.setAttribute("data-vc-boot-load-toast", "1");
        toastGen += 1;
        toast.setAttribute("data-vc-toast-gen", String(toastGen));
      } catch (eBoot) {}
    }
    var ico = global.document.createElement("span");
    ico.className = "vc-dash-save-toast__icon";
    ico.setAttribute("aria-hidden", "true");
    ico.innerHTML = isError
      ? '<i class="fa fa-times" aria-hidden="true"></i>'
      : pending
        ? '<span class="vc-ui-spinner vc-ui-spinner--on-dark" aria-hidden="true"></span>'
        : '<i class="fa fa-check" aria-hidden="true"></i>';
    var p = global.document.createElement("p");
    p.className = "vc-dash-save-toast__text";
    p.textContent = text;
    toast.appendChild(ico);
    toast.appendChild(p);
    host.appendChild(toast);
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    if (pending) {
      /* bootToastUnstick1: boot load — linger + failsafe 7s (no forever) */
      if (isBoot) {
        bootShownAt = Date.now();
        armBootFailsafe();
        return;
      }
      /* ticketListStuckFix1: pending non resta forever (max ~12s) */
      timer = setTimeout(function () {
        toast.classList.add("is-leaving");
        toast.classList.remove("is-visible");
        setTimeout(function () {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 200);
        timer = null;
      }, 12000);
      return;
    }
    var ms = Number(opts.ms);
    if (!Number.isFinite(ms) || ms <= 0) ms = isError ? 2800 : 1400;
    timer = setTimeout(function () {
      toast.classList.add("is-leaving");
      toast.classList.remove("is-visible");
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 200);
      timer = null;
    }, ms);
  }

  var api = {
    show: show,
    hide: hide,
    hideLoadLinger: hideLoadLinger,
    host: hostEl,
    ver: VER,
  };
  global.VcSiteToast = api;
  if (!global.VcDashToast) global.VcDashToast = api;
})(typeof window !== "undefined" ? window : globalThis);
