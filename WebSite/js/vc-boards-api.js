/**
 * Bacheca — API helpers + card rendering.
 */
(function (global) {
  "use strict";

  var CFG = global.__VC_BOARDS || {};
  var BASE = String(CFG.apiUrl || "/webhooks/site-boards").replace(/\/+$/, "") || "/webhooks/site-boards";

  function token() {
    try {
      if (typeof global.__vcDiscordGetAccessToken === "function") {
        return String(global.__vcDiscordGetAccessToken() || "").trim();
      }
    } catch (_) {}
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (_) {
      return "";
    }
  }

  function authHeaders(extra) {
    var h = Object.assign({ Accept: "application/json" }, extra || {});
    var t = token();
    if (t) h.Authorization = "Bearer " + t;
    return h;
  }

  async function parseJson(res) {
    var text = "";
    try {
      text = await res.text();
    } catch (_) {}
    var data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_) {
      data = null;
    }
    if (!data || typeof data !== "object") {
      data = { ok: false, status: res.status, error: "bad_json", message: "Risposta non valida." };
    }
    if (data.status == null) data.status = res.status;
    return data;
  }

  async function api(path, opts) {
    opts = opts || {};
    var url = BASE + path;
    var init = {
      method: opts.method || "GET",
      headers: authHeaders(opts.json ? { "Content-Type": "application/json" } : {}),
      credentials: "omit",
    };
    if (opts.json) init.body = JSON.stringify(opts.json);
    var res = await fetch(url, init);
    return parseJson(res);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* boardsDescMd1: formattazione leggera sulla descrizione (niente campo markdown separato) */
  function formatDescHtml(raw) {
    var s = esc(raw);
    if (!s) return "";
    s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    s = s.replace(/^### (.+)$/gm, "<h4>$1</h4>");
    s = s.replace(/^## (.+)$/gm, "<h3>$1</h3>");
    s = s.replace(/^# (.+)$/gm, "<h2>$1</h2>");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(^|[^*])\*(?!\s)(.+?)(?!\s)\*(?!\*)/g, "$1<em>$2</em>");
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(
      /\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
    s = s.replace(/^(?:- |\* )(.+)$/gm, "<li>$1</li>");
    s = s.replace(/(?:<li>[\s\S]*?<\/li>\n?)+/g, function (block) {
      return "<ul>" + block.replace(/\n/g, "") + "</ul>";
    });
    s = s.replace(/\n{2,}/g, "</p><p>");
    s = s.replace(/\n/g, "<br>");
    if (!/^<[hul]/.test(s)) s = "<p>" + s + "</p>";
    return s;
  }

  function listingUrl(slug) {
    return "/bacheca/scheda/?slug=" + encodeURIComponent(String(slug || "").trim());
  }

  function kindLabel(kind) {
    return kind === "bot" ? "Bot" : "Server";
  }

  function statusLabel(st) {
    var map = {
      draft: "Bozza",
      pending: "In moderazione",
      approved: "Approvata",
      rejected: "Rifiutata",
      suspended: "Sospesa",
    };
    return map[st] || st || "—";
  }

  function fmtNum(n) {
    n = Number(n) || 0;
    try {
      return n.toLocaleString("it-IT");
    } catch (_) {
      return String(n);
    }
  }

  function cardHtml(item) {
    if (!item) return "";
    var banner = item.bannerUrl
      ? ' style="--bc-card-banner:url(' + esc(item.bannerUrl) + ");background-image:url(" + esc(item.bannerUrl) + ')"'
      : item.accent
        ? ' style="background:linear-gradient(120deg,' + esc(item.accent) + '66,#1a1410)"'
        : "";
    var icon = item.iconUrl
      ? '<img class="vc-boards-card__icon" src="' + esc(item.iconUrl) + '" alt="" width="56" height="56" loading="lazy" />'
      : '<span class="vc-boards-card__icon vc-boards-card__icon--empty" aria-hidden="true"><i class="fa fa-server"></i></span>';
    var tags = (item.tags || [])
      .slice(0, 4)
      .map(function (t) {
        return '<span class="vc-boards-tag">' + esc(t) + "</span>";
      })
      .join("");
    var members =
      item.stats && item.stats.members != null
        ? '<span title="Membri"><i class="fa fa-users" aria-hidden="true"></i> ' + esc(fmtNum(item.stats.members)) + "</span>"
        : "";
    return (
      '<a class="vc-boards-card" href="' +
      esc(listingUrl(item.slug)) +
      '">' +
      '<div class="vc-boards-card__banner"' +
      banner +
      "></div>" +
      '<div class="vc-boards-card__body">' +
      icon +
      '<div><span class="vc-boards-card__kind">' +
      esc(kindLabel(item.kind)) +
      "</span>" +
      '<h3 class="vc-boards-card__name">' +
      esc(item.name) +
      "</h3>" +
      (item.tagline ? '<p class="vc-boards-card__tagline">' + esc(item.tagline) + "</p>" : "") +
      "</div>" +
      (tags ? '<div class="vc-boards-card__tags">' + tags + "</div>" : "") +
      '<div class="vc-boards-card__foot">' +
      '<span class="vc-boards-card__votes"><i class="fa fa-thumbs-up" aria-hidden="true"></i> ' +
      esc(fmtNum(item.votes30d || 0)) +
      "</span>" +
      '<div class="vc-boards-card__meta">' +
      members +
      "<span title=\"Punteggio\"><i class=\"fa fa-star\" aria-hidden=\"true\"></i> " +
      esc(fmtNum(item.score || 0)) +
      "</span></div></div></div></a>"
    );
  }

  function navHtml(active) {
    /* boardsToolsFix2: sand active + vc-no-sfx */
    var items = [
      { href: "/bacheca/", id: "browse", label: "Esplora", icon: "fa-compass" },
      { href: "/bacheca/invia/", id: "submit", label: "Pubblica", icon: "fa-plus" },
      { href: "/bacheca/le-mie/", id: "manage", label: "Le mie", icon: "fa-folder-o" },
    ];
    var act = active === "hub" ? "browse" : active;
    return (
      '<nav class="vc-boards-chrome" aria-label="Bacheca">' +
      '<div class="vc-boards-chrome__tabs" role="tablist">' +
      items
        .map(function (it) {
          var on = it.id === act;
          return (
            '<a href="' +
            it.href +
            '" class="vc-boards-chrome__tab vc-no-sfx' +
            (on ? " is-active" : "") +
            '" role="tab" aria-selected="' +
            (on ? "true" : "false") +
            '"><i class="fa ' +
            it.icon +
            '" aria-hidden="true"></i><span>' +
            it.label +
            "</span></a>"
          );
        })
        .join("") +
      "</div></nav>"
    );
  }

  /* boardsMsgToast1: status → toast fisso (no barra inline) */
  function toastMsg(text, isErr) {
    var msg = String(text == null ? "" : text).trim();
    var T = global.VcSiteToast;
    if (!msg) {
      if (T && typeof T.hide === "function") T.hide();
      return;
    }
    if (T && typeof T.show === "function") {
      T.show(msg, !!isErr);
      return;
    }
    if (typeof global.__vcShowSiteToast === "function") {
      global.__vcShowSiteToast(msg, !!isErr);
    }
  }

  /* boardsScrollPath1: sblocca restore scroll dopo primo paint utile */
  function markContentReady() {
    try {
      if (global.__vcBoardsContentReady) return;
      global.__vcBoardsContentReady = 1;
      if (document.documentElement) {
        document.documentElement.setAttribute("data-vc-boards-content-ready", "1");
      }
      document.dispatchEvent(new CustomEvent("vc:boards-content-ready"));
    } catch (eReady) {}
  }

  global.VcBoards = {
    api: api,
    token: token,
    esc: esc,
    formatDescHtml: formatDescHtml,
    listingUrl: listingUrl,
    kindLabel: kindLabel,
    statusLabel: statusLabel,
    cardHtml: cardHtml,
    navHtml: navHtml,
    fmtNum: fmtNum,
    toastMsg: toastMsg,
    markContentReady: markContentReady,
    base: BASE,
  };
})(typeof window !== "undefined" ? window : globalThis);
