/* navBadgeSyncAll5: bust HTML stale + force reload se script src non è la ver canone */
(function () {
  var VER = "20261015vcStorage2";
  if (window.VcNavBadges && window.VcNavBadges.ver === VER) return;
  /* non far downgrade da CDN stale — confronta YYYYMMDD numerico (stringa grezza rompe 202609>202610) */
  try {
    var prevBadge = window.VcNavBadges && window.VcNavBadges.ver;
    if (prevBadge) {
      var a = String(prevBadge).match(/^(\d{8})/);
      var b = String(VER).match(/^(\d{8})/);
      if (a && b) {
        var an = Number(a[1]);
        var bn = Number(b[1]);
        if (an > bn) return;
        if (an === bn && String(prevBadge) > String(VER)) return;
      } else if (String(prevBadge) > String(VER)) {
        return;
      }
    }
  } catch (ePrev) {}
  window.VcNavBadges = null;
  var BADGE_CLASS = "vc-nav-feat-badge";
  var SEEN_KEY = "vc_nav_feat_seen_v1";
  var applying = false;
  var needsReapply = false;
  var syncBound = false;
  var softPullTimer = 0;
  var lastSoftPullAt = 0;
  /* lsGetStorm1: cache + quiet MO — apply mutava DOM → observer → apply → getItem 20/s */
  var seenMem = null;
  var applyQuietUntil = 0;

  function chromeSyncApi() {
    try {
      return window.VcChromeSync || window.__VC_CHROME_SYNC || null;
    } catch (e) {
      return null;
    }
  }

  /* until = fine giorno (badge sparisce dopo). Seen = visita utente. */
  var CATALOG = [
    /* top + supporta */
    { path: "/wiki", kind: "updated", until: "2026-11-30" },
    { path: "/vote", kind: "updated", until: "2026-11-30" },
    { path: "/recensioni", kind: "updated", until: "2026-11-30" },
    /* community */
    { path: "/classifiche", kind: "updated", until: "2026-11-30", aliases: ["/user", "/users"] },
    { path: "/user", kind: "updated", until: "2026-11-30", aliases: ["/classifiche", "/users"] },
    { path: "/users", kind: "updated", until: "2026-11-30", aliases: ["/classifiche", "/user"] },
    { path: "/ruoli", kind: "updated", until: "2026-11-30" },
    { path: "/regole", kind: "updated", until: "2026-11-30" },
    { path: "/faq", kind: "updated", until: "2026-11-30" },
    /* richieste — /unban|/unmute = alias legacy → stessa voce Appelli */
    { path: "/appelli", kind: "updated", until: "2026-11-30", aliases: ["/unban", "/unmute"] },
    { path: "/unban", kind: "updated", until: "2026-11-30", aliases: ["/appelli", "/unmute"] },
    { path: "/unmute", kind: "updated", until: "2026-11-30", aliases: ["/appelli", "/unban"] },
    { path: "/candidature", kind: "updated", until: "2026-11-30" },
    { path: "/feedback", kind: "updated", until: "2026-11-30", aliases: ["/suggerimenti"] },
    { path: "/suggerimenti", kind: "updated", until: "2026-11-30", aliases: ["/feedback"] },
    { path: "/tickets", kind: "updated", until: "2026-11-30" },
    /* profilo (menu account + dashboard) */
    { path: "/dashboard/profilo", kind: "updated", until: "2026-11-30" },
    { path: "/personalizza", kind: "updated", until: "2026-11-30" },
    /* tutte le pagine staff */
    { path: "/staff", kind: "new", until: "2026-11-30" },
  ];

  function loadSeenLocalOnly() {
    if (seenMem && typeof seenMem === "object") return seenMem;
    try {
      var raw =
        window.VcStorage && typeof window.VcStorage.get === "function"
          ? window.VcStorage.get(SEEN_KEY, { scope: "ls" })
          : window.localStorage.getItem(SEEN_KEY);
      if (!raw) {
        seenMem = {};
        return seenMem;
      }
      var o = JSON.parse(raw);
      seenMem = o && typeof o === "object" ? o : {};
      return seenMem;
    } catch (eLoad) {
      seenMem = {};
      return seenMem;
    }
  }

  function loadSeen() {
    /* hamBadgeSync3: unisci sempre LS + mirror chrome (anche se hydrate ha perso la race) */
    var local = loadSeenLocalOnly();
    try {
      var api = chromeSyncApi();
      var prefs = api && typeof api.get === "function" ? api.get() : null;
      var rem = prefs && prefs.navFeatSeen;
      if (rem && typeof rem === "object") return mergeSeenMaps(local, rem);
    } catch (eMer) {}
    return local;
  }

  function publishSeen(map) {
    function tryPub() {
      try {
        var api = chromeSyncApi();
        if (api && typeof api.publish === "function") {
          api.publish({ navFeatSeen: map || {} });
          return true;
        }
      } catch (ePub) {}
      return false;
    }
    if (tryPub()) return true;
    /* script sync ancora non pronto → retry breve */
    window.setTimeout(tryPub, 600);
    window.setTimeout(tryPub, 1800);
    window.setTimeout(tryPub, 4000);
    return false;
  }

  function saveSeen(map, opts) {
    seenMem = map && typeof map === "object" ? map : {};
    try {
      var json = JSON.stringify(seenMem);
      if (window.VcStorage && typeof window.VcStorage.set === "function") {
        window.VcStorage.set(SEEN_KEY, json, { scope: "ls", immediate: true });
      } else {
        window.localStorage.setItem(SEEN_KEY, json);
      }
    } catch (eSave) {}
    if (!opts || opts.sync !== false) publishSeen(seenMem);
  }

  function mergeSeenMaps(localMap, remoteMap) {
    var out = Object.assign({}, localMap || {});
    var rem = remoteMap || {};
    var k;
    for (k in rem) {
      if (!Object.prototype.hasOwnProperty.call(rem, k)) continue;
      out[k] = Math.max(Number(out[k]) || 0, Number(rem[k]) || 0);
    }
    return out;
  }

  function catalogPathKey(path) {
    return String(path || "").replace(/\/+$/, "") || "/";
  }

  function aliasPathsFor(path) {
    var key = catalogPathKey(path);
    var out = [key];
    var i;
    for (i = 0; i < CATALOG.length; i += 1) {
      var e = CATALOG[i];
      if (!e || !e.path) continue;
      if (catalogPathKey(e.path) === key) {
        if (e.aliases && e.aliases.length) {
          var a;
          for (a = 0; a < e.aliases.length; a += 1) out.push(catalogPathKey(e.aliases[a]));
        }
      } else if (e.aliases && e.aliases.indexOf(key) !== -1) {
        out.push(catalogPathKey(e.path));
        var b;
        for (b = 0; b < e.aliases.length; b += 1) out.push(catalogPathKey(e.aliases[b]));
      }
    }
    return out.filter(function (v, idx, arr) {
      return v && arr.indexOf(v) === idx;
    });
  }

  function isSeenPath(path, seenMap) {
    var seen = seenMap || loadSeen();
    var keys = aliasPathsFor(path);
    var i;
    for (i = 0; i < keys.length; i += 1) {
      if (seen && seen[keys[i]]) return true;
    }
    return false;
  }

  function pathMatchesCatalog(pagePath, catalogPath) {
    var p = String(pagePath || "");
    var ep = catalogPathKey(catalogPath);
    if (!p || !ep) return false;
    return p === ep || p.indexOf(ep + "/") === 0;
  }

  function i18n(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function kindLabel(kind) {
    if (kind === "updated") return i18n("nav.badgeUpdated", "Aggiornato");
    return i18n("nav.badgeNew", "Nuovo");
  }

  function sameSiteOrigin(origin) {
    try {
      var o = String(origin || "").toLowerCase();
      var here = String(window.location.origin || "").toLowerCase();
      if (o === here) return true;
      var host = o.replace(/^https?:\/\//, "").split("/")[0];
      return /(^|\.)viniliecaffe\.(it|gg)$/i.test(host);
    } catch (e) {
      return false;
    }
  }

  function normalizePath(href) {
    var raw = String(href || "").trim();
    if (!raw || raw.charAt(0) === "#") return "";
    try {
      var u = new URL(raw, window.location.href);
      if (u.origin !== window.location.origin && !sameSiteOrigin(u.origin)) {
        if (raw.charAt(0) !== "/" && raw.indexOf("://") !== -1) return "";
      }
      if (u.origin !== window.location.origin && !sameSiteOrigin(u.origin)) return "";
      var p = String(u.pathname || "/").replace(/\/+$/, "") || "/";
      return p;
    } catch (e) {
      return "";
    }
  }

  function untilMs(until) {
    var s = String(until || "").trim();
    if (!s) return Infinity;
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) {
      var t = Date.parse(s);
      return Number.isFinite(t) ? t : Infinity;
    }
    return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 21, 59, 59);
  }

  function activeEntries() {
    var now = Date.now();
    var seen = loadSeen();
    var out = [];
    var i;
    for (i = 0; i < CATALOG.length; i += 1) {
      var e = CATALOG[i];
      if (!e || !e.path) continue;
      if (now > untilMs(e.until)) continue;
      if (isSeenPath(e.path, seen)) continue;
      out.push(e);
    }
    return out;
  }

  function markPathsSeen(paths) {
    if (!paths || !paths.length) return false;
    var seen = loadSeen();
    var changed = false;
    var i;
    for (i = 0; i < paths.length; i += 1) {
      var keys = aliasPathsFor(paths[i]);
      var k;
      for (k = 0; k < keys.length; k += 1) {
        var key = keys[k];
        if (!key || key === "/") continue;
        if (seen[key]) continue;
        seen[key] = Date.now();
        changed = true;
      }
    }
    if (changed) saveSeen(seen);
    return changed;
  }

  /* Marca come viste tutte le voci catalog che matchano la pagina corrente (+ alias). */
  function markCurrentPageSeen() {
    try {
      var pagePath = normalizePath(window.location.pathname || "/");
      if (!pagePath || pagePath === "/") return false;
      var toMark = [];
      var i;
      for (i = 0; i < CATALOG.length; i += 1) {
        var e = CATALOG[i];
        if (!e || !e.path) continue;
        if (!pathMatchesCatalog(pagePath, e.path)) continue;
        toMark.push(e.path);
        if (e.aliases && e.aliases.length) {
          var a;
          for (a = 0; a < e.aliases.length; a += 1) toMark.push(e.aliases[a]);
        }
      }
      return markPathsSeen(toMark);
    } catch (eMark) {
      return false;
    }
  }

  function matchEntry(pathname, entries) {
    var p = String(pathname || "");
    if (!p) return null;
    var best = null;
    var bestLen = -1;
    var i;
    for (i = 0; i < entries.length; i += 1) {
      var e = entries[i];
      var ep = String(e.path || "").replace(/\/+$/, "") || "/";
      if (p === ep || p.indexOf(ep + "/") === 0) {
        if (ep.length > bestLen) {
          best = e;
          bestLen = ep.length;
        }
      }
    }
    return best;
  }

  function preferKind(kinds) {
    if (!kinds || !kinds.length) return null;
    return kinds.indexOf("new") >= 0 ? "new" : "updated";
  }

  function stripBadges(root) {
    if (!root || !root.querySelectorAll) return;
    var nodes = root.querySelectorAll("." + BADGE_CLASS);
    var i;
    for (i = 0; i < nodes.length; i += 1) {
      var n = nodes[i];
      if (n && n.parentNode) n.parentNode.removeChild(n);
    }
    var hosts = root.querySelectorAll(".has-nav-feat-badge, .has-nav-feat-badge-ico");
    for (i = 0; i < hosts.length; i += 1) {
      hosts[i].classList.remove("has-nav-feat-badge", "has-nav-feat-badge-ico");
    }
  }

  function makePip(kind, extraClass) {
    var el = document.createElement("span");
    var labFull = kindLabel(kind);
    el.className =
      BADGE_CLASS +
      " " +
      BADGE_CLASS +
      "--dot " +
      BADGE_CLASS +
      "--ico-pip " +
      BADGE_CLASS +
      "--" +
      (kind === "updated" ? "updated" : "new");
    if (extraClass) el.className += " " + extraClass;
    el.title = labFull;
    el.setAttribute("aria-label", labFull);
    el.setAttribute("aria-hidden", "true");
    el.textContent = "";
    return el;
  }

  function makeMiniChip(kind) {
    var el = document.createElement("span");
    var labFull = kindLabel(kind);
    el.className =
      BADGE_CLASS +
      " " +
      BADGE_CLASS +
      "--mini " +
      BADGE_CLASS +
      "--" +
      (kind === "updated" ? "updated" : "new");
    el.textContent = labFull;
    el.title = labFull;
    el.setAttribute("aria-label", labFull);
    return el;
  }

  function isMobileTile(a) {
    if (!a || !a.classList) return false;
    return a.classList.contains("vc-mobile-nav-tile") || a.classList.contains("vc-mobile-nav-link");
  }

  function isIcoHost(el) {
    if (!el || !el.classList) return false;
    return (
      el.classList.contains("vc-snav-row-ico") ||
      el.classList.contains("vc-mobile-nav-tile__ico") ||
      el.classList.contains("vc-mobile-nav-tile-ico")
    );
  }

  function rowIcon(a) {
    if (!a || !a.querySelector) return null;
    return (
      a.querySelector(":scope > .vc-snav-row-ico") ||
      a.querySelector(":scope > .vc-mobile-nav-tile__ico") ||
      a.querySelector(":scope > .vc-mobile-nav-tile-ico") ||
      a.querySelector(":scope > i.fa") ||
      null
    );
  }

  function summaryLeadIcon(sum) {
    if (!sum || !sum.querySelector) return null;
    var kids = sum.children;
    var i;
    for (i = 0; i < kids.length; i += 1) {
      var c = kids[i];
      if (!c || !c.classList) continue;
      if (c.tagName !== "I") continue;
      if (c.classList.contains("vc-snav-chev")) continue;
      if (c.classList.contains("fa-chevron-down")) continue;
      if (c.classList.contains("vc-mobile-nav-section-chev")) continue;
      if (c.classList.contains("fa")) return c;
    }
    return (
      sum.querySelector(":scope > i.fa:not(.vc-snav-chev):not(.fa-chevron-down):not(.vc-mobile-nav-section-chev)") ||
      null
    );
  }

  function clearSummaryPips(sum) {
    if (!sum) return;
    var olds = sum.querySelectorAll("." + BADGE_CLASS);
    var oi;
    for (oi = 0; oi < olds.length; oi += 1) {
      if (olds[oi] && olds[oi].parentNode) olds[oi].parentNode.removeChild(olds[oi]);
    }
    sum.classList.remove("has-nav-feat-badge", "has-nav-feat-badge-ico");
    var icos = sum.querySelectorAll(".has-nav-feat-badge-ico");
    for (oi = 0; oi < icos.length; oi += 1) icos[oi].classList.remove("has-nav-feat-badge-ico");
  }

  function attachPipToSummary(sum, kind) {
    if (!sum || !kind) return;
    clearSummaryPips(sum);
    var badge = makePip(kind);
    var ico = summaryLeadIcon(sum);
    if (ico) {
      ico.classList.add("has-nav-feat-badge-ico");
      ico.appendChild(badge);
      sum.classList.add("has-nav-feat-badge");
      return;
    }
    sum.classList.add("has-nav-feat-badge", "has-nav-feat-badge-ico");
    sum.appendChild(badge);
  }

  function labelSpan(a) {
    if (!a || !a.children) return null;
    var i;
    for (i = 0; i < a.children.length; i += 1) {
      var c = a.children[i];
      if (!c || !c.classList) continue;
      if (c.classList.contains(BADGE_CLASS)) continue;
      if (isIcoHost(c)) continue;
      if (c.classList.contains("vc-mobile-nav-tile-label")) continue;
      if (c.classList.contains("vc-mobile-nav-tile__label")) continue;
      if (c.classList.contains("vc-snav-chev")) continue;
      if (c.tagName === "I" || c.tagName === "SVG") continue;
      if (c.tagName === "SPAN") return c;
    }
    return null;
  }

  function insertBeforeLabel(host, badge, label) {
    if (!host || !badge) return;
    if (label && label.parentNode === host) {
      host.insertBefore(badge, label);
      return;
    }
    if (host.firstChild) host.insertBefore(badge, host.firstChild);
    else host.appendChild(badge);
  }

  function attachPipToIcon(a, kind) {
    var badge;
    /* hamburger tiles: solo pip minimale (no chip testo Aggiornato/Nuovo) */
    if (isMobileTile(a)) {
      badge = makePip(kind, BADGE_CLASS + "--tile-pip");
      a.classList.add("has-nav-feat-badge");
      a.appendChild(badge);
      return;
    }
    var ico = rowIcon(a);
    badge = makePip(kind);
    if (ico) {
      ico.classList.add("has-nav-feat-badge-ico");
      ico.appendChild(badge);
      a.classList.add("has-nav-feat-badge");
      return;
    }
    a.classList.add("has-nav-feat-badge", "has-nav-feat-badge-ico");
    insertBeforeLabel(a, badge, labelSpan(a));
  }

  function decorateAnchor(a, entries) {
    if (!a || !a.getAttribute) return null;
    var path = normalizePath(a.getAttribute("href"));
    var entry = matchEntry(path, entries);
    if (!entry) return null;
    var olds = a.querySelectorAll("." + BADGE_CLASS);
    var oi;
    for (oi = 0; oi < olds.length; oi += 1) {
      if (olds[oi] && olds[oi].parentNode) olds[oi].parentNode.removeChild(olds[oi]);
    }
    a.classList.remove("has-nav-feat-badge", "has-nav-feat-badge-ico");
    var icos = a.querySelectorAll(".has-nav-feat-badge-ico");
    for (oi = 0; oi < icos.length; oi += 1) icos[oi].classList.remove("has-nav-feat-badge-ico");
    attachPipToIcon(a, entry.kind);
    return entry.kind;
  }

  function decorateDetails(det, entries) {
    if (!det) return;
    var kinds = [];
    var links = det.querySelectorAll("a.vc-snav-row, a.vc-snav-item");
    var i;
    for (i = 0; i < links.length; i += 1) {
      var k = decorateAnchor(links[i], entries);
      if (k) kinds.push(k);
    }
    var sum = det.querySelector(":scope > .vc-snav-summary, .vc-snav-summary");
    if (!sum) return;
    var kind = preferKind(kinds);
    if (!kind) {
      clearSummaryPips(sum);
      return;
    }
    attachPipToSummary(sum, kind);
  }

  function decorateMobileSections(entries) {
    var secs = document.querySelectorAll(
      "#vc-mobile-nav-drawer details.vc-mobile-nav-section, .vc-mobile-nav-drawer details.vc-mobile-nav-section",
    );
    var i;
    for (i = 0; i < secs.length; i += 1) {
      var sec = secs[i];
      var kinds = [];
      var tiles = sec.querySelectorAll("a.vc-mobile-nav-tile, a.vc-mobile-nav-link");
      var t;
      for (t = 0; t < tiles.length; t += 1) {
        var path = normalizePath(tiles[t].getAttribute("href"));
        var entry = matchEntry(path, entries);
        if (entry) kinds.push(entry.kind);
      }
      var sum = sec.querySelector(":scope > summary.vc-mobile-nav-section-title");
      if (!sum) continue;
      var kind = preferKind(kinds);
      if (!kind) {
        clearSummaryPips(sum);
        continue;
      }
      attachPipToSummary(sum, kind);
    }
  }

  function decorateHamburgerToggle(kinds) {
    var btn = document.getElementById("vc-mobile-nav-toggle");
    if (!btn) return;
    var old = btn.querySelector("." + BADGE_CLASS);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    btn.classList.remove("has-nav-feat-badge", "has-nav-feat-badge-ico");
    var kind = preferKind(kinds);
    if (!kind) return;
    var badge = makePip(kind);
    btn.classList.add("has-nav-feat-badge", "has-nav-feat-badge-ico");
    btn.appendChild(badge);
  }

  function apply(root) {
    if (applying) {
      needsReapply = true;
      return;
    }
    applying = true;
    needsReapply = false;
    try {
      var scope = root && root.querySelectorAll ? root : document;
      var entries = activeEntries();
      stripBadges(document);
      if (!entries.length) {
        decorateHamburgerToggle([]);
        return;
      }

      var kindsAll = [];

      var details = scope.querySelectorAll(
        "details.vc-snav-details, details.vc-snav-details--staff, [data-vc-staff-tools-nav]",
      );
      var d;
      for (d = 0; d < details.length; d += 1) {
        decorateDetails(details[d], entries);
      }

      var topItems = scope.querySelectorAll(
        "nav.vc-header-snav > a.vc-snav-item, .vc-header-snav > a.vc-snav-item, a.vc-snav-item",
      );
      var t;
      for (t = 0; t < topItems.length; t += 1) {
        var tk = decorateAnchor(topItems[t], entries);
        if (tk) kindsAll.push(tk);
      }

      var tiles = document.querySelectorAll(
        "#vc-mobile-nav-drawer a.vc-mobile-nav-tile, .vc-mobile-nav-drawer a.vc-mobile-nav-tile, #vc-mobile-nav-drawer a.vc-mobile-nav-link, .vc-mobile-nav-drawer a.vc-mobile-nav-link",
      );
      var m;
      for (m = 0; m < tiles.length; m += 1) {
        var mk = decorateAnchor(tiles[m], entries);
        if (mk) kindsAll.push(mk);
      }

      decorateMobileSections(entries);

      /* anche snav desktop rows fuori details (se presenti) */
      var rows = document.querySelectorAll("nav.vc-header-snav a.vc-snav-row");
      var r;
      for (r = 0; r < rows.length; r += 1) {
        var rk = decorateAnchor(rows[r], entries);
        if (rk) kindsAll.push(rk);
      }

      /* menu account: Vai al profilo */
      var accountLinks = document.querySelectorAll(
        "#discord-profile-menu-link, .discord-account-popover a.discord-account-popover__item, #vc-mobile-nav-drawer-footer a[href*='/user'], #vc-mobile-nav-drawer-footer a[href*='/dashboard/profilo']",
      );
      var al;
      for (al = 0; al < accountLinks.length; al += 1) {
        var ak = decorateAnchor(accountLinks[al], entries);
        if (ak) kindsAll.push(ak);
      }

      /* summary / tile pips: su phone conta il drawer, non lo snav nascosto */
      var kindsFromUi = [];
      var drawer = document.getElementById("vc-mobile-nav-drawer");
      if (drawer) {
        for (m = 0; m < tiles.length; m += 1) {
          if (!tiles[m].classList.contains("has-nav-feat-badge")) continue;
          var pip = tiles[m].querySelector("." + BADGE_CLASS + "--new, ." + BADGE_CLASS + "--updated");
          if (!pip) continue;
          if (pip.classList.contains(BADGE_CLASS + "--new")) kindsFromUi.push("new");
          else kindsFromUi.push("updated");
        }
        var mobSums = drawer.querySelectorAll(
          "details.vc-mobile-nav-section > summary.has-nav-feat-badge ." +
            BADGE_CLASS +
            "--new, details.vc-mobile-nav-section > summary.has-nav-feat-badge ." +
            BADGE_CLASS +
            "--updated",
        );
        var ms;
        for (ms = 0; ms < mobSums.length; ms += 1) {
          if (mobSums[ms].classList.contains(BADGE_CLASS + "--new")) kindsFromUi.push("new");
          else kindsFromUi.push("updated");
        }
      } else {
        var sums = document.querySelectorAll(
          ".vc-snav-summary.has-nav-feat-badge ." +
            BADGE_CLASS +
            "--new, .vc-snav-summary.has-nav-feat-badge ." +
            BADGE_CLASS +
            "--updated",
        );
        var s;
        for (s = 0; s < sums.length; s += 1) {
          if (sums[s].classList.contains(BADGE_CLASS + "--new")) kindsFromUi.push("new");
          else kindsFromUi.push("updated");
        }
      }
      if (kindsFromUi.length) kindsAll = kindsFromUi;

      decorateHamburgerToggle(kindsAll);
    } finally {
      applying = false;
      applyQuietUntil = Date.now() + 280;
      if (needsReapply) {
        needsReapply = false;
        scheduleApply();
      }
    }
  }

  var scheduled = 0;
  /* violKillIdle2 marker */
  /* violKillReflow1 + violKillVis1 marker */
  function scheduleApply() {
    if (scheduled) return;
    /* violKillIdle2: debounce più lungo + skip tab nascosta */
    scheduled = window.setTimeout(function () {
      scheduled = 0;
      try {
        if (document.hidden || document.visibilityState === "hidden") return;
      } catch (eHid) {}
      apply(document);
    }, 280);
  }

  function bindObserver() {
    if (window.__vcNavBadgesObs) return;
    function watch(el) {
      if (!el || !el.nodeType) return;
      try {
        var obs = new MutationObserver(function () {
          if (applying) return;
          if (Date.now() < applyQuietUntil) return;
          scheduleApply();
        });
        obs.observe(el, { childList: true, subtree: true });
        return obs;
      } catch (eObs) {
        return null;
      }
    }
    try {
      var snav = document.querySelector("nav.vc-header-snav");
      var drawer = document.getElementById("vc-mobile-nav-drawer");
      var list = [];
      if (snav) list.push(watch(snav));
      if (drawer) list.push(watch(drawer));
      window.__vcNavBadgesObs = list;
      if (!snav || !drawer) {
        window.setTimeout(function () {
          if (!document.querySelector("nav.vc-header-snav") && !document.getElementById("vc-mobile-nav-drawer"))
            return;
          window.__vcNavBadgesObs = null;
          bindObserver();
        }, 800);
      }
    } catch (eBind) {}
  }

  window.VcNavBadges = {
    ver: VER,
    catalog: CATALOG,
    apply: apply,
    schedule: scheduleApply,
    markCurrentPageSeen: markCurrentPageSeen,
    markPathsSeen: markPathsSeen,
    isSeenPath: isSeenPath,
  };

  function hydrateSeenFromChrome(prefs) {
    try {
      var rem = prefs && prefs.navFeatSeen;
      if (!rem || typeof rem !== "object") return;
      var local = loadSeenLocalOnly();
      var merged = mergeSeenMaps(local, rem);
      var before = JSON.stringify(local);
      var after = JSON.stringify(merged);
      if (before === after) {
        /* anche se LS uguale, riapplica: mirror può aver sbloccato loadSeen */
        scheduleApply();
        return;
      }
      saveSeen(merged, { sync: false });
      scheduleApply();
    } catch (eHyd) {}
  }

  function softPullThenApply(forceOnce) {
    try {
      var api = chromeSyncApi();
      if (!api || typeof api.pullServer !== "function") {
        scheduleApply();
        return;
      }
      /* rateLimitCalm1: al massimo 1 soft-pull / 8s; force solo al primo bind */
      var now = Date.now();
      if (!forceOnce && now - lastSoftPullAt < 8000) {
        scheduleApply();
        return;
      }
      lastSoftPullAt = now;
      var p = api.pullServer(!!forceOnce);
      if (p && typeof p.then === "function") {
        p.then(function () {
          try {
            if (typeof api.get === "function") hydrateSeenFromChrome(api.get());
          } catch (eH) {}
          scheduleApply();
        }).catch(function () {
          scheduleApply();
        });
      } else {
        window.setTimeout(function () {
          try {
            if (typeof api.get === "function") hydrateSeenFromChrome(api.get());
          } catch (eH2) {}
          scheduleApply();
        }, 400);
      }
    } catch (eP) {
      scheduleApply();
    }
  }

  function scheduleSoftPull() {
    if (softPullTimer) return;
    softPullTimer = window.setTimeout(function () {
      softPullTimer = 0;
      softPullThenApply(false);
    }, 350);
  }

  function bindChromeSync() {
    if (syncBound) {
      softPullThenApply(false);
      return;
    }
    syncBound = true;
    try {
      var api = chromeSyncApi();
      if (api && typeof api.subscribe === "function") {
        api.subscribe(function (prefs) {
          hydrateSeenFromChrome(prefs);
        });
      }
    } catch (eSub) {}
    /* push local map once after login so other devices can merge */
    try {
      var map = loadSeen();
      if (map && Object.keys(map).length) publishSeen(map);
    } catch (ePush0) {}
    /* hydrate from mirror already on device (even before network) */
    try {
      var apiGet = chromeSyncApi();
      if (apiGet && typeof apiGet.get === "function") hydrateSeenFromChrome(apiGet.get());
    } catch (eGet) {}
    softPullThenApply(true);
  }

  function bindHamburgerResync() {
    if (window.__vcNavBadgeHamSync) return;
    window.__vcNavBadgeHamSync = 1;
    function resync() {
      scheduleSoftPull();
    }
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev && ev.target;
        if (!t || !t.closest) return;
        if (t.closest("#vc-mobile-nav-toggle, .vc-mobile-nav-toggle")) {
          window.setTimeout(resync, 40);
        }
      },
      true
    );
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        window.setTimeout(function () {
          try {
            resync();
          } catch (eVis) {}
        }, 0);
      }
    });
    window.addEventListener("focus", function () {
      window.setTimeout(function () {
        try {
          resync();
        } catch (eF) {}
      }, 0);
    });
  }

  function boot() {
    markCurrentPageSeen();
    apply(document);
    bindObserver();
    bindChromeSync();
    bindHamburgerResync();
    window.setTimeout(scheduleApply, 400);
    window.setTimeout(function () {
      /* rateLimitCalm1: niente secondo/terzo force-pull — solo reapply badge */
      scheduleApply();
    }, 1200);
    window.setTimeout(function () {
      scheduleApply();
    }, 2800);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
  window.addEventListener("vc:staff-access-ok", scheduleApply);
  window.addEventListener("vc:i18n-ready", scheduleApply);
  window.addEventListener("languagechange", scheduleApply);
  window.addEventListener("vc:discord-auth", bindChromeSync);
  window.addEventListener("vc:access-ok", bindChromeSync);
  window.addEventListener("vc-discord-profile", bindChromeSync);
  window.addEventListener("pageshow", function () {
    window.setTimeout(function () {
      try {
        markCurrentPageSeen();
        softPullThenApply(false);
        scheduleApply();
      } catch (ePs) {}
    }, 0);
  });
})();

/* navBadgeSyncAll5 */
/* extOnlyFix1 */
