(function () {
  "use strict";

  var ALIASES = {
    "/richieste": "/staff/pause/",
    "/richieste/stato": "/staff/pause/",
    "/staff/ticket": "/tickets/?view=staff",
    "/staff/tickets": "/tickets/?view=staff",
    "/staff/directory": "/staff/organico/",
    "/staff/valutazioni": "/staff/",
    "/staff/profilo": "/staff/",
    "/staff/pm": "/staff/gestione/?tab=pm",
    "/staff/moderazione": "/staff/gestione/",
  };

  function normPath(pathname) {
    var p = String(pathname || "/").split("?")[0].split("#")[0];
    p = p.replace(/\/index\.html$/i, "");
    p = p.replace(/\/+$/, "");
    return p || "/";
  }

  function go(url) {
    var target = String(url || "/").trim() || "/";
    try {
      window.location.replace(target);
    } catch (e) {
      window.location.href = target;
    }
  }

  function setHint(text) {
    var el = document.getElementById("vc-404-hint");
    if (el) el.textContent = text || "";
  }

  function setSuggest(href, label) {
    var wrap = document.getElementById("vc-404-suggest-wrap");
    var a = document.getElementById("vc-404-suggest");
    if (!wrap || !a || !href) return;
    a.href = href;
    a.textContent = label || href;
    wrap.hidden = false;
  }

  function probeOk(url) {
    return fetch(url, { method: "GET", cache: "no-store", redirect: "follow", credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) return false;
        var ct = String(r.headers.get("content-type") || "").toLowerCase();
        // Evita di trattare JSON/API come “pagina”.
        if (ct && ct.indexOf("text/html") === -1 && ct.indexOf("text/plain") === -1) return false;
        return true;
      })
      .catch(function () {
        return false;
      });
  }

  function parentCandidates(p) {
    var parts = p.split("/").filter(Boolean);
    var out = [];
    while (parts.length > 1) {
      parts.pop();
      out.push("/" + parts.join("/") + "/");
    }
    return out;
  }

  async function resolve() {
    var path = normPath(window.location.pathname);
    var alias = ALIASES[path];
    if (alias) {
      go(alias);
      return;
    }

    var parents = parentCandidates(path);
    for (var i = 0; i < parents.length; i++) {
      var cand = parents[i];
      if (await probeOk(cand)) {
        go(cand);
        return;
      }
    }

    var backBtn = document.getElementById("vc-404-back");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        go("/");
      });
    }

    if (parents.length) {
      setSuggest(parents[0], "Prova " + parents[0]);
      setHint("Questa pagina non esiste più. Puoi tornare indietro, alla home, o alla sezione più vicina.");
    } else {
      setHint("Questa pagina non esiste. Torna indietro o alla home.");
    }

    var main = document.getElementById("vc-404-main");
    if (main) main.hidden = false;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      resolve();
    });
  } else {
    resolve();
  }
})();
