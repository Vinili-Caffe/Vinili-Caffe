(function (global) {
  "use strict";

  var HOST_ID = "vc-site-toast-host";
  var HOST_CLASS = "vc-dash-save-toast-host vc-site-toast-host";
  var timer = null;

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
    var host =
      byId(HOST_ID) ||
      byId("vc-dash-save-toast-host") ||
      byId("vc-staff-toast-host") ||
      byId("vc-wt-toast-host");
    if (host) host.innerHTML = "";
  }

  function show(msg, isError, opts) {
    var text = String(msg == null ? "" : msg).trim();
    if (!text) {
      hide();
      return;
    }
    opts = opts || {};
    var host = hostEl();
    hide();
        host = hostEl();
    var pending = opts.pending === true || opts.sticky === true || (!isError && looksPending(text));
    var toast = global.document.createElement("div");
    toast.className =
      "vc-dash-save-toast" +
      (isError ? " is-error" : "") +
      (pending ? " is-pending" : "");
    toast.setAttribute("role", "status");
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
    if (pending) return;
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

  var api = { show: show, hide: hide, host: hostEl };
  global.VcSiteToast = api;
  if (!global.VcDashToast) global.VcDashToast = api;
})(typeof window !== "undefined" ? window : globalThis);
