(function () {
  var PER_PAGE = 9;
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var state = {
    loading: false,
    page: 1,
    query: "",
    rows: [],
    filtered: [],
    totalPages: 1,
    summary: null,
    activeRoleId: "",
    activeRequestRoleId: "",
    requestAuthRequired: false,
    submittingRequest: false,
    lastSnapshot: "",
    lastAppliedSummarySig: "",
    lastProfileViewerForGrid: "\u0000",
    lastFocusEl: null
  };
  var liveRolesPollTimer = null;
  var LIVE_ROLES_POLL_MS = 60000;

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_ROLES) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function inviteUrl() {
    return String(cfg().inviteUrl || "").trim() || "#";
  }

  function isTemplatePlaceholder(value) {
    return /\{\{.*\}\}/.test(String(value || ""));
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    var direct = String(c.apiUrl || "").trim();

    if (isLocalFrontendOrigin() && local && !isTemplatePlaceholder(local)) return local;
    if (direct && !isTemplatePlaceholder(direct)) return direct;

    return "/webhooks/site-roles";
  }

  function resolvedRequestApiUrl() {
    var c = cfg();
    var local = String(c.requestApiUrlLocal || "").trim();
    var direct = String(c.requestApiUrl || "").trim();

    if (isLocalFrontendOrigin() && local && !isTemplatePlaceholder(local)) return local;
    if (direct && !isTemplatePlaceholder(direct)) return direct;

    return "/webhooks/site-roles/request";
  }

  function authCfg() {
    return (typeof window !== "undefined" && window.__VC_AUTH) || {};
  }

  function buildDiscordAuthUrl() {
    var c = authCfg();
    var clientId = String(c.clientId || "").trim();
    if (!clientId) return "";
    var redirect = String(c.redirectUri || "").trim();
    if (!redirect) {
      var home = String(c.homeUrl || "").trim();
      redirect = /^https?:\/\//i.test(home) ? (home.endsWith("/") ? home : home + "/") : window.location.origin + "/";
    }
    var here = String(window.location.pathname || "/") + String(window.location.search || "");
    var q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirect,
      response_type: "token",
      scope: "identify",
    });
    q.set("state", here || "/");
    return "https://discord.com/oauth2/authorize?" + q.toString();
  }

  function triggerDiscordLogin() {
    if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
      window.__vcDiscordStartOAuthRedirect(null);
      return;
    }
    var headerBtn = byId("discord-login-btn");
    if (headerBtn && !headerBtn.hidden && typeof headerBtn.click === "function") {
      headerBtn.click();
      return;
    }
    var url = buildDiscordAuthUrl();
    if (url) window.location.href = url;
  }

  async function fetchJsonWithTimeout(url, options, timeoutMs) {
    var ms = Number(timeoutMs);
    if (!Number.isFinite(ms) || ms <= 0) ms = 12000;
    if (typeof AbortController === "undefined") {
      var fallbackRes = await fetch(url, options);
      var fallbackText = await fallbackRes.text();
      return {
        ok: fallbackRes.ok,
        status: fallbackRes.status,
        data: fallbackText ? JSON.parse(fallbackText) : null
      };
    }

    var ctrl = new AbortController();
    var timer = setTimeout(function () {
      ctrl.abort();
    }, ms);

    try {
      var merged = Object.assign({}, options || {}, { signal: ctrl.signal });
      var res = await fetch(url, merged);
      var text = await res.text();
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = null;
      }
      return { ok: res.ok, status: res.status, data: data };
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("timeout");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatIntIt(n) {
    var x = Number(n);
    if (!Number.isFinite(x)) return "0";
    try {
      return Math.round(x).toLocaleString("it-IT");
    } catch (e) {
      return String(Math.round(x));
    }
  }

  function fallbackAvatarById(id) {
    var raw = String(id || "").trim();
    var index = 0;
    if (/^\d+$/.test(raw)) {
      try {
        index = Number(BigInt(raw) % 6n);
      } catch (e) {
        index = 0;
      }
    }
    return "https://cdn.discordapp.com/embed/avatars/" + index + ".png";
  }

  function profileHref(userId) {
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function avatarUrl(row) {
    var fromApi = String(row.ownerAvatarUrl || "").trim();
    if (/^https?:\/\//i.test(fromApi)) return fromApi;

    var id = String(row.ownerId || "").trim();
    var av = String(row.ownerAvatar || "").trim();
    if (id && av) {
      var ext = av.indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + id + "/" + av + "." + ext + "?size=128";
    }
    return fallbackAvatarById(id);
  }

  function memberAvatarUrl(row) {
    var fromApi = String(row.avatarUrl || "").trim();
    if (/^https?:\/\//i.test(fromApi)) return fromApi;

    var id = String(row.userId || "").trim();
    var av = String(row.avatar || "").trim();
    if (id && av) {
      var ext = av.indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + id + "/" + av + "." + ext + "?size=128";
    }
    return fallbackAvatarById(id);
  }

  function formatDateIt(value) {
    if (!value) return "Data sconosciuta";
    var d = new Date(value);
    if (!isFinite(d.getTime())) return "Data sconosciuta";
    try {
      return new Intl.DateTimeFormat("it-IT", {
        timeZone: "Europe/Rome",
        day: "2-digit",
        month: "short",
        year: "numeric"
      }).format(d);
    } catch (e) {
      return d.toLocaleDateString("it-IT");
    }
  }

  function setLoading(on, label, sub) {
    state.loading = Boolean(on);
    var overlay = byId("vc-roles-loading");
    var title = overlay ? overlay.querySelector(".vc-ul-loading-title") : null;
    var subtitle = overlay ? overlay.querySelector(".vc-ul-loading-sub") : null;
    var grid = byId("vc-roles-grid");
    if (overlay) overlay.hidden = !state.loading;
    if (title) title.textContent = label || "Caricamento ruoli";
    if (subtitle) subtitle.textContent = state.loading ? sub || "Sto recuperando tutti i ruoli personalizzati della community…" : "";
    if (grid) grid.setAttribute("aria-busy", state.loading ? "true" : "false");
  }

  function setState(msg, isErr) {
    var el = byId("vc-roles-state");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "vc-user-leader-state" + (isErr ? " vc-user-leader-state--err" : "");
    el.hidden = !msg;
  }

  function syncInitialLoadingOverlay() {
    var overlay = byId("vc-roles-loading");
    var title = overlay ? overlay.querySelector(".vc-ul-loading-title") : null;
    var subtitle = overlay ? overlay.querySelector(".vc-ul-loading-sub") : null;
    var grid = byId("vc-roles-grid");
    if (overlay) overlay.hidden = false;
    if (title) title.textContent = "Caricamento ruoli";
    if (subtitle) subtitle.textContent = "Sto recuperando tutti i ruoli personalizzati della community...";
    if (grid) grid.setAttribute("aria-busy", "true");
  }

  function applyFilter() {
    var q = String(state.query || "").trim().toLowerCase();
    if (!q) {
      state.filtered = state.rows.slice();
    } else {
      state.filtered = state.rows.filter(function (row) {
        return [
          row.roleName,
          row.ownerUsername,
          row.ownerDisplayName,
          row.ownerId,
          row.roleId
        ].some(function (value) {
          return String(value || "").toLowerCase().indexOf(q) !== -1;
        });
      });
    }
    state.totalPages = Math.max(1, Math.ceil(state.filtered.length / PER_PAGE));
    if (state.page > state.totalPages) state.page = state.totalPages;
  }

  function setSummary(summary) {
    var total = byId("vc-roles-stat-total");
    var perm = byId("vc-roles-stat-perm");
    var members = byId("vc-roles-stat-members");
    var sub = byId("vc-roles-sub");
    var countApi = typeof window !== "undefined" ? window.VCCountUp : null;
    var totalValue = Number(summary && summary.totalRoles) || 0;
    var permValue = Number(summary && summary.permanentRoles) || 0;
    var memberValue = Number(summary && summary.totalAssignments) || 0;
    var summarySig = totalValue + "|" + permValue + "|" + memberValue;
    if (state.lastAppliedSummarySig === summarySig) return;
    state.lastAppliedSummarySig = summarySig;
    if (total) {
      if (countApi && typeof countApi.set === "function") countApi.set(total, totalValue, "int");
      else total.textContent = formatIntIt(totalValue);
    }
    if (perm) {
      if (countApi && typeof countApi.set === "function") countApi.set(perm, permValue, "int");
      else perm.textContent = formatIntIt(permValue);
    }
    if (members) {
      if (countApi && typeof countApi.set === "function") countApi.set(members, memberValue, "int");
      else members.textContent = formatIntIt(memberValue);
    }
    if (sub) {
      sub.textContent = "Esplora i ruoli custom della community · " + formatIntIt(summary && summary.totalRoles) + " ruoli";
    }
  }

  function emptyState(title, msg) {
    var empty = byId("vc-roles-empty");
    var grid = byId("vc-roles-grid");
    var pager = byId("vc-roles-pager");
    var t = byId("vc-roles-empty-title");
    var m = byId("vc-roles-empty-msg");
    if (grid) grid.innerHTML = "";
    if (pager) pager.hidden = true;
    if (t) t.textContent = title || "Nessun ruolo personalizzato disponibile.";
    if (m) m.textContent = msg || "";
    if (empty) empty.hidden = false;
  }

  function roleSwatch(row) {
    var hex = String(row.roleColor || "#f8fafc").trim() || "#f8fafc";
    return '<span class="vc-role-card-swatch" style="background:' + esc(hex) + '"></span>';
  }

  function roleIcon(row) {
    var iconUrl = String(row.roleIconUrl || "").trim();
    if (/^https?:\/\//i.test(iconUrl)) {
      return '<img class="vc-role-card-iconimg" src="' + esc(iconUrl) + '" alt="" width="52" height="52" loading="lazy" decoding="async" referrerpolicy="no-referrer" />';
    }
    var emoji = String(row.roleEmoji || "").trim();
    if (emoji) {
      return '<span class="vc-role-card-iconemoji" aria-hidden="true">' + esc(emoji) + "</span>";
    }
    return '<i class="fa fa-paint-brush" aria-hidden="true"></i>';
  }

  function viewerDiscordUserId() {
    try {
      var u = typeof window !== "undefined" ? window.__VC_DISCORD_PROFILE : null;
      return String(u && u.id ? u.id : "").trim();
    } catch (e) {
      return "";
    }
  }

  function viewerIsRoleOwner(row) {
    var vid = viewerDiscordUserId();
    var oid = String(row && row.ownerId ? row.ownerId : "").trim();
    return Boolean(vid && oid && vid === oid);
  }

  function viewerHasRole(row) {
    var vid = viewerDiscordUserId();
    var members = Array.isArray(row && row.members) ? row.members : [];
    if (!vid || !members.length) return false;
    for (var i = 0; i < members.length; i += 1) {
      if (String(members[i] && members[i].userId ? members[i].userId : "").trim() === vid) return true;
    }
    return false;
  }

  function roleRequestCtaHtml(row) {
    var rid = esc(String(row.roleId || ""));
    if (viewerIsRoleOwner(row)) {
      return (
        '<button type="button" class="vc-role-card-cta vc-role-card-cta--owner-self" disabled title="Ruolo che hai creato con +profile: non puoi richiederlo a te stesso">' +
        '<i class="fa fa-user" aria-hidden="true"></i> Il tuo ruolo</button>'
      );
    }
    if (viewerHasRole(row)) {
      return (
        '<button type="button" class="vc-role-card-cta vc-role-card-cta--already-member" disabled title="Hai già questo ruolo">' +
        '<i class="fa fa-check" aria-hidden="true"></i> Già tuo</button>'
      );
    }
    return (
      '<button type="button" class="vc-role-card-cta" data-request-role-id="' +
      rid +
      '" data-role-id="' +
      rid +
      '"><i class="fa fa-shield" aria-hidden="true"></i> Richiedi Ruolo</button>'
    );
  }

  function renderCard(row) {
    var ownerName = String(row.ownerUsername || row.ownerDisplayName || "Utente").trim() || "Utente";
    var expiryChip = row.isPermanent
      ? '<span class="vc-role-chip vc-role-chip--perm"><i class="fa fa-link" aria-hidden="true"></i> Permanente</span>'
      : '<span class="vc-role-chip vc-role-chip--temp"><i class="fa fa-clock-o" aria-hidden="true"></i> ' + esc(formatDateIt(row.expiresAt)) + "</span>";
    return (
      '<article class="vc-role-card" role="listitem" data-role-id="' + esc(row.roleId) + '" tabindex="0" aria-label="Apri membri del ruolo ' + esc(row.roleName || "Ruolo custom") + '">' +
      '<div class="vc-role-card-top">' +
      '<div class="vc-role-card-iconwrap">' +
      roleIcon(row) +
      roleSwatch(row) +
      "</div>" +
      '<div class="vc-role-card-topcopy">' +
      '<h2 class="vc-role-card-name">' + esc(row.roleName || "Ruolo custom") + "</h2>" +
      '<p class="vc-role-card-date"><i class="fa fa-calendar-o" aria-hidden="true"></i> ' + esc(formatDateIt(row.createdAt)) + "</p>" +
      "</div>" +
      "</div>" +
      '<a class="vc-role-card-owner" href="' + esc(profileHref(row.ownerId)) + '">' +
      '<img class="vc-role-card-owneravatar" src="' + esc(avatarUrl(row)) + '" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + esc(fallbackAvatarById(row.ownerId)) + '\'" />' +
      '<span class="vc-role-card-ownername">' + esc(ownerName) + "</span>" +
      "</a>" +
      '<div class="vc-role-card-meta">' +
      '<span class="vc-role-chip vc-role-chip--members"><i class="fa fa-users" aria-hidden="true"></i> ' + esc(formatIntIt(row.memberCount)) + "</span>" +
      expiryChip +
      "</div>" +
      '<div class="vc-role-card-sep"></div>' +
      '<div class="vc-role-card-actions">' +
      '<button type="button" class="vc-role-card-open" data-role-id="' + esc(row.roleId) + '"><i class="fa fa-users" aria-hidden="true"></i> Vedi membri</button>' +
      roleRequestCtaHtml(row) +
      "</div>" +
      "</article>"
    );
  }

  function findRow(roleId) {
    var rid = String(roleId || "").trim();
    if (!rid) return null;
    for (var i = 0; i < state.rows.length; i += 1) {
      if (String((state.rows[i] && state.rows[i].roleId) || "") === rid) return state.rows[i];
    }
    return null;
  }

  function renderModalRoleIcon(row) {
    var iconUrl = String((row && row.roleIconUrl) || "").trim();
    if (/^https?:\/\//i.test(iconUrl)) {
      return '<img class="vc-role-modal-iconimg" src="' + esc(iconUrl) + '" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer" />';
    }
    var emoji = String((row && row.roleEmoji) || "").trim();
    if (emoji) {
      return '<span class="vc-role-modal-iconemoji" aria-hidden="true">' + esc(emoji) + "</span>";
    }
    return '<i class="fa fa-shield" aria-hidden="true"></i>';
  }

  function hueFromRoleId(roleId) {
    var s = String(roleId || "");
    var h = 0;
    for (var i = 0; i < s.length; i += 1) {
      h = (h * 31 + s.charCodeAt(i)) >>> 0;
    }
    return h % 360;
  }

  function renderMemberBadges(member) {
    var parts = [];
    if (member && member.isOwner) {
      parts.push(
        '<span class="vc-role-member-badge vc-role-member-badge--owner" title="Creatore del ruolo custom" aria-label="Creatore del ruolo custom">Owner</span>',
      );
    }
    var sb = Array.isArray(member && member.staffBadges) ? member.staffBadges : [];
    for (var i = 0; i < sb.length; i += 1) {
      var b = sb[i];
      var rid = String((b && b.roleId) || "").trim();
      var label = String((b && b.label) || "").trim();
      if (!rid || !label) continue;
      var hue = hueFromRoleId(rid);
      parts.push(
        '<span class="vc-role-member-badge vc-role-member-badge--staff" style="--vc-role-badge-h:' +
          hue +
          '" title="' +
          esc(label) +
          '">' +
          esc(label) +
          "</span>",
      );
    }
    if (!parts.length) return "";
    return '<div class="vc-role-member-badges" aria-label="Ruoli staff e creatore">' + parts.join("") + "</div>";
  }

  function renderMemberRow(member) {
    var name = String(member.username || "Utente").trim() || "Utente";
    return (
      '<a class="vc-role-member" role="listitem" href="' + esc(profileHref(member.userId)) + '">' +
      '<img class="vc-role-member-avatar" src="' + esc(memberAvatarUrl(member)) + '" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src=\'' + esc(fallbackAvatarById(member.userId)) + '\'" />' +
      '<div class="vc-role-member-copy">' +
      '<div class="vc-role-member-stack">' +
      '<span class="vc-role-member-name">' +
      esc(name) +
      "</span>" +
      renderMemberBadges(member) +
      "</div>" +
      "</div>" +
      '<span class="vc-role-member-arrow" aria-hidden="true"><i class="fa fa-angle-right"></i></span>' +
      "</a>"
    );
  }

  function openRoleModal(roleId) {
    state.lastFocusEl = document.activeElement || null;
    var row = findRow(roleId);
    var modal = byId("vc-role-modal");
    var icon = byId("vc-role-modal-icon");
    var title = byId("vc-role-modal-title");
    var sub = byId("vc-role-modal-sub");
    var list = byId("vc-role-modal-list");
    if (!row || !modal || !icon || !title || !sub || !list) return;
    state.activeRoleId = String(row.roleId || "");
    icon.innerHTML = renderModalRoleIcon(row) + '<span class="vc-role-modal-swatch" style="background:' + esc(String(row.roleColor || "#f8fafc")) + '"></span>';
    title.textContent = String(row.roleName || "Ruolo custom");
    sub.textContent = formatIntIt(row.memberCount) + " membri";
    list.innerHTML = (Array.isArray(row.members) ? row.members : []).map(renderMemberRow).join("");
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    modal.removeAttribute("inert");
    document.body.classList.add("vc-role-modal-open");
  }

  function closeRoleModal() {
    var modal = byId("vc-role-modal");
    if (!modal) return;

    var active = document.activeElement;
    if (active && modal.contains(active) && typeof active.blur === "function") {
      active.blur();
    }

    state.activeRoleId = "";
    modal.setAttribute("inert", "");
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;
    document.body.classList.remove("vc-role-modal-open");

    if (state.lastFocusEl && typeof state.lastFocusEl.focus === "function") {
      state.lastFocusEl.focus();
    } else {
      document.body.focus();
    }

    state.lastFocusEl = null;
  }

  function getToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var fromAuth = window.__vcDiscordGetAccessToken();
        if (fromAuth) return String(fromAuth).trim();
      }
      var token = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!token || !exp || Date.now() >= exp) return "";
      return token;
    } catch (e) {
      return "";
    }
  }

  function renderRequestRoleIcon(row) {
    var icon = byId("vc-role-request-icon");
    if (!icon) return;
    var iconUrl = String((row && row.roleIconUrl) || "").trim();
    var emoji = String((row && row.roleEmoji) || "").trim();
    var swatch = '<span class="vc-role-request-swatch" style="background:' + esc(String((row && row.roleColor) || "#f8fafc")) + '"></span>';
    if (/^https?:\/\//i.test(iconUrl)) {
      icon.innerHTML = '<img class="vc-role-request-iconimg" src="' + esc(iconUrl) + '" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer" />' + swatch;
      return;
    }
    if (emoji) {
      icon.innerHTML = '<span class="vc-role-request-iconemoji" aria-hidden="true">' + esc(emoji) + "</span>" + swatch;
      return;
    }
    icon.innerHTML = '<i class="fa fa-shield" aria-hidden="true"></i>' + swatch;
  }

  function setRequestState(msg, isErr) {
    var el = byId("vc-role-request-state");
    if (!el) return;
    el.hidden = !msg;
    el.className = "vc-role-request-state" + (isErr ? " vc-role-request-state--err" : " vc-role-request-state--ok");
    el.textContent = msg || "";
  }

  function syncRequestModalState() {
    var textarea = byId("vc-role-request-reason");
    var submit = byId("vc-role-request-submit");
    var counter = byId("vc-role-request-counter");
    var len = textarea ? String(textarea.value || "").trim().length : 0;
    if (counter) counter.textContent = len + "/500";
    if (submit) submit.disabled = state.requestAuthRequired || state.submittingRequest || !state.activeRequestRoleId || len < 10 || len > 500;
  }

  function syncRequestAuthUi() {
    var authBox = byId("vc-role-request-auth");
    var label = document.querySelector(".vc-role-request-label");
    var textarea = byId("vc-role-request-reason");
    var meta = document.querySelector(".vc-role-request-meta");
    var cancel = byId("vc-role-request-cancel");
    var submit = byId("vc-role-request-submit");
    var needsLogin = !getToken();

    state.requestAuthRequired = needsLogin;

    if (authBox) authBox.hidden = !needsLogin;
    if (label) label.hidden = needsLogin;
    if (textarea) {
      textarea.hidden = needsLogin;
      textarea.disabled = needsLogin;
    }
    if (meta) meta.hidden = needsLogin;
    if (cancel) cancel.textContent = needsLogin ? "Chiudi" : "Annulla";
    if (submit) submit.hidden = needsLogin;

    syncRequestModalState();
  }

  function openRequestModal(roleId) {
    state.lastFocusEl = document.activeElement || null;
    var row = findRow(roleId);
    var modal = byId("vc-role-request-modal");
    var title = byId("vc-role-request-title");
    var sub = byId("vc-role-request-sub");
    var textarea = byId("vc-role-request-reason");
    if (!row || !modal || !title || !sub || !textarea) return;
    if (viewerIsRoleOwner(row)) {
      setState("Non puoi inviare una richiesta per un ruolo che hai creato tu.", true);
      return;
    }
    if (viewerHasRole(row)) {
      setState("Hai già questo ruolo: non serve inviare una richiesta.", true);
      return;
    }
    state.activeRequestRoleId = String(row.roleId || "");
    state.requestAuthRequired = false;
    state.submittingRequest = false;
    renderRequestRoleIcon(row);
    title.textContent = "Richiedi Ruolo";
    sub.textContent = String(row.roleName || "Ruolo custom");
    textarea.value = "";
    setRequestState("", false);
    syncRequestAuthUi();
    syncRequestModalState();
    modal.hidden = false;
    modal.setAttribute("aria-hidden", "false");
    modal.removeAttribute("inert");
    document.body.classList.add("vc-role-modal-open");
    setTimeout(function () {
      if (!state.requestAuthRequired && textarea && typeof textarea.focus === "function") {
        textarea.focus();
      }
    }, 0);
  }

  function closeRequestModal() {
    var modal = byId("vc-role-request-modal");
    if (!modal) return;

    var active = document.activeElement;
    if (active && modal.contains(active) && typeof active.blur === "function") {
      active.blur();
    }

    state.activeRequestRoleId = "";
    state.requestAuthRequired = false;
    state.submittingRequest = false;
    modal.setAttribute("inert", "");
    modal.setAttribute("aria-hidden", "true");
    modal.hidden = true;
    document.body.classList.remove("vc-role-modal-open");
    setRequestState("", false);
    syncRequestModalState();

    if (state.lastFocusEl && typeof state.lastFocusEl.focus === "function") {
      state.lastFocusEl.focus();
    } else {
      document.body.focus();
    }

    state.lastFocusEl = null;
  }

  async function submitRoleRequest() {
    var token = getToken();
    var textarea = byId("vc-role-request-reason");
    var api = resolvedRequestApiUrl();
    var reason = textarea ? String(textarea.value || "").trim() : "";
    var activeRow = findRow(state.activeRequestRoleId);
    if (activeRow && viewerIsRoleOwner(activeRow)) {
      setRequestState("Sei già il creatore di questo ruolo: non serve inviare una richiesta.", true);
      syncRequestModalState();
      return;
    }
    if (activeRow && viewerHasRole(activeRow)) {
      setRequestState("Hai già questo ruolo: non serve inviare una richiesta.", true);
      syncRequestModalState();
      return;
    }
    if (!token) {
      syncRequestAuthUi();
      syncRequestModalState();
      return;
    }
    if (!api) {
      setRequestState("Manca l'endpoint API per inviare la richiesta ruolo.", true);
      return;
    }
    if (!state.activeRequestRoleId || reason.length < 10) {
      setRequestState("Scrivi una motivazione più chiara prima di continuare.", true);
      syncRequestModalState();
      return;
    }

    state.submittingRequest = true;
    syncRequestModalState();
    setRequestState("Invio richiesta in corso...", false);

    try {
      var res = await fetch(api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          roleId: state.activeRequestRoleId,
          reason: reason
        })
      });
      var text = await res.text();
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = null;
      }
      if (!res.ok || !data || data.ok !== true) {
        var fallbackMsg =
          (data && data.message) ||
          (text && String(text).trim()) ||
          ("Invio non riuscito (HTTP " + res.status + ")");
        throw new Error(fallbackMsg);
      }
      setState("Richiesta inviata all'owner del ruolo tramite DM.", false);
      closeRequestModal();
    } catch (err) {
      setRequestState(err && err.message ? err.message : "Non sono riuscito a inviare la richiesta.", true);
    } finally {
      state.submittingRequest = false;
      syncRequestModalState();
    }
  }

  function renderGrid() {
    var empty = byId("vc-roles-empty");
    var grid = byId("vc-roles-grid");
    if (!grid) return;
    if (empty) empty.hidden = true;
    if (!state.filtered.length) {
      emptyState(
        state.query ? "Nessun ruolo trovato." : "Nessun ruolo personalizzato disponibile.",
        state.query ? "Prova con un altro nome ruolo o utente." : "Quando la community ne creerà di nuovi, compariranno qui."
      );
      return;
    }
    var start = (state.page - 1) * PER_PAGE;
    var pageRows = state.filtered.slice(start, start + PER_PAGE);
    grid.innerHTML = pageRows.map(renderCard).join("");
    renderPager();
  }

  function stableRowsFingerprint(rows) {
    var list = Array.isArray(rows) ? rows : [];
    return list
      .map(function (r) {
        return [
          r.roleId,
          r.roleSlot,
          r.roleName,
          r.roleColor,
          r.roleEmoji,
          r.roleIconUrl,
          r.createdAt,
          r.expiresAt,
          String(r.isPermanent),
          String(r.memberCount || 0),
          r.ownerId,
          r.ownerUsername,
          r.ownerDisplayName,
          r.ownerAvatar,
          r.customVocChannelId
        ].join("\t");
      })
      .sort()
      .join("\n");
  }

  function buildDataSnapshot(rows, summary) {
    try {
      var s = summary || {};
      return JSON.stringify({
        rowsFp: stableRowsFingerprint(rows),
        totalRoles: Number(s.totalRoles) || 0,
        permanentRoles: Number(s.permanentRoles) || 0,
        temporaryRoles: Number(s.temporaryRoles) || 0,
        totalAssignments: Number(s.totalAssignments) || 0
      });
    } catch (e) {
      return String(Date.now());
    }
  }

  function renderPager() {
    var nav = byId("vc-roles-pager");
    var chips = byId("vc-roles-pagechips");
    var prev = byId("vc-roles-prev");
    var next = byId("vc-roles-next");
    if (!nav || !chips || !prev || !next) return;
    if (state.totalPages <= 1) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    prev.disabled = state.page <= 1;
    next.disabled = state.page >= state.totalPages;
    var html = "";
    for (var i = 1; i <= state.totalPages; i += 1) {
      html += '<button type="button" class="vc-roles-pagechip' + (i === state.page ? ' vc-roles-pagechip--on' : "") + '" data-page="' + i + '">' + i + "</button>";
    }
    chips.innerHTML = html;
  }

  function bindPager() {
    var prev = byId("vc-roles-prev");
    var next = byId("vc-roles-next");
    var chips = byId("vc-roles-pagechips");
    if (prev) {
      prev.addEventListener("click", function () {
        if (state.page <= 1) return;
        state.page -= 1;
        renderGrid();
      });
    }
    if (next) {
      next.addEventListener("click", function () {
        if (state.page >= state.totalPages) return;
        state.page += 1;
        renderGrid();
      });
    }
    if (chips) {
      chips.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-page]") : null;
        if (!btn) return;
        var page = parseInt(String(btn.getAttribute("data-page") || ""), 10);
        if (!isFinite(page) || page < 1) return;
        state.page = page;
        renderGrid();
      });
    }
  }

  function bindSearch() {
    var input = byId("vc-roles-search-input");
    if (!input) return;
    input.addEventListener("input", function () {
      state.query = String(input.value || "");
      state.page = 1;
      applyFilter();
      renderGrid();
    });
  }

  function bindModal() {
    var modal = byId("vc-role-modal");
    var requestModal = byId("vc-role-request-modal");
    var closeBtn = byId("vc-role-modal-close");
    var requestClose = byId("vc-role-request-close");
    var requestCancel = byId("vc-role-request-cancel");
    var requestLogin = byId("vc-role-request-login");
    var requestSubmit = byId("vc-role-request-submit");
    var requestTextarea = byId("vc-role-request-reason");
    var grid = byId("vc-roles-grid");
    if (grid) {
      grid.addEventListener("click", function (ev) {
        var target = ev.target;

        var cta = target && target.closest ? target.closest(".vc-role-card-cta") : null;
        if (cta) {
          ev.preventDefault();
          ev.stopPropagation();

          var requestRoleId = String(cta.getAttribute("data-request-role-id") || "").trim();
          if (requestRoleId) {
            openRequestModal(requestRoleId);
          }
          return;
        }

        var openBtn = target && target.closest ? target.closest(".vc-role-card-open") : null;
        if (openBtn) {
          ev.preventDefault();
          ev.stopPropagation();

          var openRoleId = String(openBtn.getAttribute("data-role-id") || "").trim();
          if (openRoleId) {
            openRoleModal(openRoleId);
          }
          return;
        }

        var card = target && target.closest ? target.closest(".vc-role-card") : null;
        if (!card) return;

        if (target && target.closest && target.closest("button")) return;

        var roleId = String(card.getAttribute("data-role-id") || "").trim();
        if (!roleId) return;

        openRoleModal(roleId);
      });
      grid.addEventListener("keydown", function (ev) {
        var card = ev.target && ev.target.closest ? ev.target.closest(".vc-role-card") : null;
        if (!card) return;
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        openRoleModal(card.getAttribute("data-role-id"));
      });
    }
    if (modal) {
      modal.addEventListener("click", function (ev) {
        var closer = ev.target && ev.target.closest ? ev.target.closest("[data-close-role-modal]") : null;
        if (closer) closeRoleModal();
      });
    }
    if (requestModal) {
      requestModal.addEventListener("click", function (ev) {
        var closer = ev.target && ev.target.closest ? ev.target.closest("[data-close-role-request]") : null;
        if (closer && !state.submittingRequest) closeRequestModal();
      });
    }
    if (closeBtn) closeBtn.addEventListener("click", closeRoleModal);
    if (requestCancel) {
      requestCancel.addEventListener("click", function () {
        if (!state.submittingRequest) closeRequestModal();
      });
    }
    if (requestLogin) {
      requestLogin.addEventListener("click", function () {
        triggerDiscordLogin();
      });
    }
    if (requestClose) {
      requestClose.addEventListener("click", function () {
        if (!state.submittingRequest) closeRequestModal();
      });
    }
    if (requestSubmit) requestSubmit.addEventListener("click", submitRoleRequest);
    if (requestTextarea) {
      requestTextarea.addEventListener("input", syncRequestModalState);
    }
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && state.activeRoleId) closeRoleModal();
      if (ev.key === "Escape" && state.activeRequestRoleId && !state.submittingRequest) closeRequestModal();
      if (ev.key === "Enter" && state.activeRequestRoleId && !ev.shiftKey) {
        var target = ev.target;
        if (target && target.id === "vc-role-request-reason") {
          ev.preventDefault();
          if (!state.submittingRequest) submitRoleRequest();
        }
      }
    });
  }

  async function load(options) {
    var opts = options && typeof options === "object" ? options : {};
    var silent = Boolean(opts.silent);
    var api = resolvedApiUrl();
    if (!api) {
      setLoading(false);
      setState("Manca l'URL API dei ruoli personalizzati.", true);
      emptyState("API non configurata.", "Imposta /webhooks/site-roles nel build del sito.");
      return;
    }

    if (!silent) {
      state.lastAppliedSummarySig = "";
      setLoading(true, "Caricamento ruoli", "Sto recuperando tutti i ruoli personalizzati della community…");
      setState("", false);
    }

    try {
      var out = await fetchJsonWithTimeout(
        api,
        { headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit" },
        12000,
      );
      var data = out && out.data;
      if (!out || !out.ok || !data || data.ok !== true) {
        throw new Error((data && data.message) || "Risposta non valida");
      }

      state.rows = Array.isArray(data.rows) ? data.rows : [];
      state.summary = data.summary || { totalRoles: state.rows.length, permanentRoles: 0, totalAssignments: 0 };
      var snapshot = buildDataSnapshot(state.rows, state.summary);
      var sameData = snapshot && state.lastSnapshot && snapshot === state.lastSnapshot;
      state.lastSnapshot = snapshot;

      if (silent && sameData) return;

      state.page = 1;
      applyFilter();
      setSummary(state.summary);
      renderGrid();
    } catch (err) {
      var timedOut = err && String(err.message || "").toLowerCase() === "timeout";
      setState(
        timedOut
          ? "Il caricamento dei ruoli sta impiegando troppo tempo."
          : "Impossibile caricare i ruoli personalizzati in questo momento.",
        true,
      );
      emptyState(
        timedOut ? "Timeout richiesta." : "Errore di caricamento.",
        timedOut
          ? "L'endpoint /webhooks/site-roles non ha risposto in tempo. Controlla proxy/nginx o HTTP del bot."
          : "Controlla GET /webhooks/site-roles e che l'HTTP del bot sia attivo.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }

  function stopLiveRolesPolling() {
    if (liveRolesPollTimer) {
      clearInterval(liveRolesPollTimer);
      liveRolesPollTimer = null;
    }
  }

  function startLiveRolesPolling() {
    stopLiveRolesPolling();
    liveRolesPollTimer = setInterval(function () {
      if (document.visibilityState !== "visible") return;
      if (state.loading || state.submittingRequest || state.activeRoleId || state.activeRequestRoleId) return;
      load({ silent: true });
    }, LIVE_ROLES_POLL_MS);
  }

  function main() {
    syncInitialLoadingOverlay();
    bindPager();
    bindSearch();
    bindModal();
    load();
    startLiveRolesPolling();
    window.addEventListener("vc-discord-profile", function () {
      if (state.activeRequestRoleId) {
        syncRequestAuthUi();
        syncRequestModalState();
      }
      var uid = viewerDiscordUserId();
      if (state.lastProfileViewerForGrid === uid) return;
      state.lastProfileViewerForGrid = uid;
      if (state.filtered.length) renderGrid();
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (!state.activeRequestRoleId) return;
      syncRequestAuthUi();
      syncRequestModalState();
    });
  }

  window.addEventListener("pageshow", function (ev) {
    if (!ev || !ev.persisted) return;
    syncInitialLoadingOverlay();
    load();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (state.loading || state.submittingRequest || state.activeRoleId || state.activeRequestRoleId) return;
    load({ silent: true });
  });

  window.addEventListener("beforeunload", stopLiveRolesPolling);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main, { once: true });
  } else {
    main();
  }
})();