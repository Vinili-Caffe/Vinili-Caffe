(function () {
  var PER_PAGE = 9;
  var state = { loading: false, page: 1, query: "", rows: [], filtered: [], totalPages: 1, summary: null, activeRoleId: "" };

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

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    return String(c.apiUrl || "").trim();
  }

  function inviteUrl() {
    return String(cfg().inviteUrl || "").trim() || "#";
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

  function avatarUrl(row) {
    var fromApi = String(row.ownerAvatarUrl || "").trim();
    if (/^https?:\/\//i.test(fromApi)) return fromApi;
    var id = String(row.ownerId || "").trim();
    var av = String(row.ownerAvatar || "").trim();
    if (id && av) {
      var ext = av.indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + id + "/" + av + "." + ext + "?size=128";
    }
    return "https://cdn.discordapp.com/embed/avatars/0.png";
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
    return "https://cdn.discordapp.com/embed/avatars/0.png";
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
    if (total) total.textContent = formatIntIt(summary && summary.totalRoles);
    if (perm) perm.textContent = formatIntIt(summary && summary.permanentRoles);
    if (members) members.textContent = formatIntIt(summary && summary.totalAssignments);
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
      '<div class="vc-role-card-owner">' +
      '<img class="vc-role-card-owneravatar" src="' + esc(avatarUrl(row)) + '" alt="" width="28" height="28" loading="lazy" decoding="async" referrerpolicy="no-referrer" />' +
      '<span class="vc-role-card-ownername">' + esc(ownerName) + "</span>" +
      "</div>" +
      '<div class="vc-role-card-meta">' +
      '<span class="vc-role-chip vc-role-chip--members"><i class="fa fa-users" aria-hidden="true"></i> ' + esc(formatIntIt(row.memberCount)) + "</span>" +
      expiryChip +
      "</div>" +
      '<div class="vc-role-card-sep"></div>' +
      '<div class="vc-role-card-actions">' +
      '<button type="button" class="vc-role-card-open" data-role-id="' + esc(row.roleId) + '"><i class="fa fa-users" aria-hidden="true"></i> Vedi membri</button>' +
      '<a class="vc-role-card-cta" href="' + esc(inviteUrl()) + '" target="_blank" rel="noopener noreferrer"><i class="fa fa-shield" aria-hidden="true"></i> Richiedi Ruolo</a>' +
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

  function renderMemberRow(member) {
    var name = String(member.displayName || member.username || "Utente").trim() || "Utente";
    return (
      '<article class="vc-role-member" role="listitem">' +
      '<img class="vc-role-member-avatar" src="' + esc(memberAvatarUrl(member)) + '" alt="" width="56" height="56" loading="lazy" decoding="async" referrerpolicy="no-referrer" />' +
      '<div class="vc-role-member-copy">' +
      '<div class="vc-role-member-topline">' +
      '<span class="vc-role-member-name">' + esc(name) + "</span>" +
      (member.isOwner ? '<span class="vc-role-member-badge">Owner</span>' : "") +
      "</div>" +
      "</div>" +
      '<span class="vc-role-member-arrow" aria-hidden="true"><i class="fa fa-angle-right"></i></span>' +
      "</article>"
    );
  }

  function openRoleModal(roleId) {
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
    document.body.classList.add("vc-role-modal-open");
  }

  function closeRoleModal() {
    var modal = byId("vc-role-modal");
    if (!modal) return;
    state.activeRoleId = "";
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("vc-role-modal-open");
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
    var closeBtn = byId("vc-role-modal-close");
    var grid = byId("vc-roles-grid");
    if (grid) {
      grid.addEventListener("click", function (ev) {
        var cta = ev.target && ev.target.closest ? ev.target.closest(".vc-role-card-cta") : null;
        if (cta) return;
        var opener = ev.target && ev.target.closest ? ev.target.closest("[data-role-id]") : null;
        if (!opener) return;
        var roleId = String(opener.getAttribute("data-role-id") || "").trim();
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
    if (closeBtn) closeBtn.addEventListener("click", closeRoleModal);
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && state.activeRoleId) closeRoleModal();
    });
  }

  async function load() {
    var api = resolvedApiUrl();
    if (!api) {
      setLoading(false);
      setState("Manca l'URL API dei ruoli personalizzati.", true);
      emptyState("API non configurata.", "Imposta /webhooks/site-roles nel build del sito.");
      return;
    }

    setLoading(true, "Caricamento ruoli", "Sto recuperando tutti i ruoli personalizzati della community…");
    setState("", false);

    try {
      var res = await fetch(api, { headers: { Accept: "application/json" }, cache: "no-store", credentials: "omit" });
      var text = await res.text();
      var data = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch (e) {
        data = null;
      }
      if (!res.ok || !data || data.ok !== true) {
        throw new Error((data && data.message) || "Risposta non valida");
      }

      state.rows = Array.isArray(data.rows) ? data.rows : [];
      state.summary = data.summary || { totalRoles: state.rows.length, permanentRoles: 0, totalAssignments: 0 };
      state.page = 1;
      applyFilter();
      setSummary(state.summary);
      renderGrid();
    } catch (err) {
      setState("Impossibile caricare i ruoli personalizzati in questo momento.", true);
      emptyState("Errore di caricamento.", "Controlla GET /webhooks/site-roles e che l'HTTP del bot sia attivo.");
    } finally {
      setLoading(false);
    }
  }

  function main() {
    bindPager();
    bindSearch();
    bindModal();
    load();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main, { once: true });
  } else {
    main();
  }
})();
