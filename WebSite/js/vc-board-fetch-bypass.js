/**
 * reviewsSoft429Fix1 + discussSendCt1: board pubbliche via XHR
 * (evita cool-down soft429) e inoltra Content-Type sui POST/PATCH.
 */
(function () {
  "use strict";
  if (window.__vcBoardFetchBypass1) return;
  window.__vcBoardFetchBypass1 = true;

  function isBoardUrl(url) {
    try {
      var base = location && location.origin ? location.origin : "https://localhost";
      var path = String(new URL(String(url || ""), base).pathname || "");
      return (
        path.indexOf("/webhooks/site-reviews") === 0 ||
        path.indexOf("/webhooks/site-suggestions") === 0 ||
        path.indexOf("/webhooks/site-bot-feedback") === 0 ||
        path.indexOf("/webhooks/site-feedback") === 0
      );
    } catch (e) {
      return /\/webhooks\/site-(reviews|suggestions|bot-feedback|feedback)/i.test(String(url || ""));
    }
  }

  function headerFromInit(init, name) {
    try {
      var h = (init && init.headers) || {};
      var lower = String(name || "").toLowerCase();
      if (typeof Headers !== "undefined" && h instanceof Headers) {
        return String(h.get(name) || h.get(lower) || "");
      }
      if (h[name] != null) return String(h[name]);
      if (h[lower] != null) return String(h[lower]);
      for (var k in h) {
        if (Object.prototype.hasOwnProperty.call(h, k) && String(k).toLowerCase() === lower) {
          return String(h[k]);
        }
      }
      return "";
    } catch (eA) {
      return "";
    }
  }

  function xhrBoardFetch(url, init) {
    return new Promise(function (resolve, reject) {
      try {
        var method = String((init && init.method) || "GET").toUpperCase();
        var xhr = new XMLHttpRequest();
        xhr.open(method, String(url), true);
        xhr.setRequestHeader("Accept", "application/json");
        var auth = headerFromInit(init, "Authorization");
        if (auth) xhr.setRequestHeader("Authorization", auth);
        /* discussSendCt1: senza Content-Type Express non parsa il JSON → commento “troppo breve” */
        var ct = headerFromInit(init, "Content-Type");
        var payload = init && init.body != null ? init.body : null;
        if (payload != null && typeof payload === "string" && !ct) {
          ct = "application/json";
        }
        if (ct) {
          try {
            xhr.setRequestHeader("Content-Type", ct);
          } catch (eCtReq) {}
        }
        try {
          if (init && init.cache === "no-store") {
            xhr.setRequestHeader("Cache-Control", "no-store");
          }
        } catch (eC) {}
        xhr.onload = function () {
          var body = xhr.responseText || "";
          var h = new Headers();
          try {
            var ctRes = xhr.getResponseHeader("Content-Type");
            if (ctRes) h.set("Content-Type", ctRes);
          } catch (eCt) {
            h.set("Content-Type", "application/json");
          }
          try {
            var ra = xhr.getResponseHeader("Retry-After");
            if (ra) h.set("Retry-After", ra);
          } catch (eRa) {}
          resolve(
            new Response(body, {
              status: xhr.status || 0,
              statusText: xhr.statusText || "",
              headers: h,
            }),
          );
        };
        xhr.onerror = function () {
          reject(new TypeError("network_error"));
        };
        xhr.ontimeout = function () {
          reject(new TypeError("timeout"));
        };
        xhr.timeout = 20000;
        xhr.send(payload);
      } catch (eX) {
        reject(eX);
      }
    });
  }

  var prev = window.fetch;
  if (typeof prev !== "function") return;
  window.fetch = function (input, init) {
    var url = "";
    try {
      url = typeof input === "string" ? input : input && input.url ? String(input.url) : String(input || "");
    } catch (eU) {
      url = String(input || "");
    }
    if (isBoardUrl(url)) return xhrBoardFetch(url, init);
    return prev.apply(this, arguments);
  };

  try {
    if (window.VcApiCache && typeof window.VcApiCache.clearWebhookBlock === "function") {
      window.VcApiCache.clearWebhookBlock("/webhooks/site-reviews");
      window.VcApiCache.clearWebhookBlock("/webhooks/site-suggestions");
      window.VcApiCache.clearWebhookBlock("/webhooks/site-bot-feedback");
    }
  } catch (eClr) {}
})();
