(function (global) {
  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function cfgValueOrEmpty(v) {
    var s = String(v == null ? "" : v).trim();
    return s && !/\{\{/.test(s) ? s : "";
  }

  function resolveApiUrl(cfgObj, fallbackPath) {
    var c = cfgObj || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    var base = isLocalOrigin() && local ? local : cfgValueOrEmpty(c.apiUrl) || fallbackPath;
    try {
      if (/^https?:\/\//i.test(base)) {
        var apiU = new URL(base);
        var pageU = new URL(window.location.href);
        if (apiU.host !== pageU.host && apiU.protocol === pageU.protocol) {
          base = apiU.pathname + (apiU.search || "");
        }
      }
    } catch (eN) {}
    return base;
  }

  function getToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setStatus(elId, text, isError) {
    var el = byId(elId);
    if (!el) return;
    el.textContent = String(text || "");
    el.hidden = !text;
    el.classList.toggle("is-error", Boolean(isError));
  }

  function fetchJson(url, options) {
    var opts = options || {};
    var headers = Object.assign({ Authorization: "Bearer " + getToken() }, opts.headers || {});
    return fetch(url, {
      method: opts.method || "GET",
      headers: headers,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      body: opts.body,
    }).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { res: res, data: data };
        });
    });
  }

  function formatAge(iso) {
    if (!iso) return "—";
    var t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    var mins = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (mins < 60) return mins + "m";
    var hours = Math.floor(mins / 60);
    if (hours < 48) return hours + "h";
    return Math.floor(hours / 24) + "g";
  }

  /** Discord default avatar index (new: id >> 22 % 6). */
  function defaultAvatarUrl(userId) {
    var id = String(userId || "").trim();
    var idx = 0;
    if (/^\d{5,24}$/.test(id)) {
      try {
        idx = Number((BigInt(id) >> 22n) % 6n);
      } catch (e) {
        var n = 0;
        for (var i = 0; i < id.length; i += 1) n = (n + id.charCodeAt(i)) % 6;
        idx = n;
      }
    }
    return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
  }

  /**
   * Avatar <img> with data-user-id + onerror → Discord default → never broken icon.
   */
  function avatarImgHtml(avatarUrl, userId, attrs) {
    var a = attrs || {};
    var w = a.width != null ? a.width : 40;
    var h = a.height != null ? a.height : 40;
    var cls = a.className ? String(a.className) : "vc-staff-avatar";
    var uid = String(userId || "").trim();
    var src = String(avatarUrl || "").trim() || defaultAvatarUrl(uid);
    var fb = defaultAvatarUrl(uid);
    // Due step: default Discord → SVG data-uri (mai icona spezzata del browser).
    var svg =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(%23g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>',
      );
    var onerr =
      "this.onerror=function(){this.onerror=null;this.src='" +
      svg.replace(/'/g, "%27") +
      "';};this.src='" +
      fb.replace(/'/g, "\\'") +
      "';";
    return (
      '<img class="' +
      esc(cls) +
      '" src="' +
      esc(src) +
      '" alt="" width="' +
      esc(w) +
      '" height="' +
      esc(h) +
      '" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1"' +
      (uid ? ' data-user-id="' + esc(uid) + '"' : "") +
      ' onerror="' +
      onerr +
      '" />'
    );
  }

  global.VCStaffTools = {
    resolveApiUrl: resolveApiUrl,
    getToken: getToken,
    byId: byId,
    esc: esc,
    setStatus: setStatus,
    fetchJson: fetchJson,
    formatAge: formatAge,
    defaultAvatarUrl: defaultAvatarUrl,
    avatarImgHtml: avatarImgHtml,
  };
})(window);
