(function (global) {
  "use strict";

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

    function normalizeCareerRoleToken(value) {
    var s = String(value == null ? "" : value)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (!s) return "";
    var aliases = {
      mod: "moderator",
      mods: "moderator",
      moderator: "moderator",
      "senior moderator": "senior moderator",
      "sr moderator": "senior moderator",
      srmod: "senior moderator",
      "senior mod": "senior moderator",
      helper: "helper",
      "trial helper": "helper",
      "partner manager": "partner manager",
      pm: "partner manager",
      director: "director",
      admin: "admin",
      manager: "manager",
      founder: "founder",
      member: "member",
    };
    if (aliases[s]) return aliases[s];
    // Label compositi tipo "Senior Moderator & Staff" → prendi il grado ladder.
    if (/\bstaff\b/.test(s)) {
      var withoutStaff = s.replace(/\bstaff\b/g, " ").replace(/\s+/g, " ").trim();
      if (withoutStaff && aliases[withoutStaff]) return aliases[withoutStaff];
      if (withoutStaff === "senior moderator") return "senior moderator";
      if (withoutStaff === "helper") return "helper";
      if (withoutStaff === "moderator") return "moderator";
      if (withoutStaff === "director") return "director";
      if (withoutStaff === "admin") return "admin";
      if (withoutStaff === "manager") return "manager";
      if (withoutStaff === "founder") return "founder";
    }
    if (s.charAt(s.length - 1) === "s" && aliases[s.slice(0, -1)]) return aliases[s.slice(0, -1)];
    return s;
  }

  function careerDayKey(iso) {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(iso));
    } catch (e) {
      return String(iso).slice(0, 10);
    }
  }

  function preferCareerRow(a, b) {
    var aLen =
      String(a && (a.newRole != null ? a.newRole : a.to || "")).length +
      String(a && (a.oldRole != null ? a.oldRole : a.from || "")).length;
    var bLen =
      String(b && (b.newRole != null ? b.newRole : b.to || "")).length +
      String(b && (b.oldRole != null ? b.oldRole : b.from || "")).length;
    if (bLen !== aLen) return bLen > aLen ? b : a;
    return a;
  }

  function careerRowSortMs(row) {
    var iso = row && (row.dateIso || row.date);
    if (!iso) return 0;
    var t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : 0;
  }

  function isOnStaffCareerLadder(token) {
    if (!token) return false;
    if (token === "member" || token === "community" || token === "partner manager") return false;
    var ladder = {
      helper: 1,
      moderator: 1,
      "senior moderator": 1,
      director: 1,
      admin: 1,
      manager: 1,
      founder: 1,
    };
    return !!ladder[token];
  }

  function isPartnerManagerRole(token) {
    return token === "partner manager";
  }

  /* careerPinRecentPex2: scala attuale + ultimo pex PM + ultimo pex →Helper (anche da PM) */
  function isCareerTrackRole(token) {
    return isOnStaffCareerLadder(token) || isPartnerManagerRole(token);
  }

  function isOutsideStaffCareerLadder(token) {
    return !isOnStaffCareerLadder(token);
  }

  function isPexToPartnerManager(from, to) {
    return isPartnerManagerRole(to) && !isPartnerManagerRole(from);
  }

  function isPexToHelper(from, to) {
    /* Ultimo arrivo a Helper: Member→Helper o PM→Helper (niente Helper stale prima dell’ultimo pex). */
    return to === "helper" && from !== "helper";
  }

  function rowCareerTokens(row) {
    return {
      to: normalizeCareerRoleToken(row && (row.newRole != null ? row.newRole : row.to)),
      from: normalizeCareerRoleToken(row && (row.oldRole != null ? row.oldRole : row.from)),
    };
  }

  function sliceLatestStaffLadderStint(chrono, opts) {
    opts = opts || {};
    var stillActive = Boolean(opts.stillActive);
    if (!Array.isArray(chrono) || !chrono.length) return [];
    var startIdx = 0;
    var found = false;
    var onLadder = false;
    for (var i = 0; i < chrono.length; i += 1) {
      var tok = rowCareerTokens(chrono[i]);
      var toOn = isOnStaffCareerLadder(tok.to);
      var fromOut = isOutsideStaffCareerLadder(tok.from);
      if (toOn && (fromOut || !onLadder)) {
        startIdx = i;
        found = true;
        onLadder = true;
        continue;
      }
      if (onLadder && !toOn) onLadder = false;
    }
    if (!found) return [];
    if (!onLadder && !stillActive) return [];
    var kept = [];
    for (var j = startIdx; j < chrono.length; j += 1) {
      var tokJ = rowCareerTokens(chrono[j]);
      if (isOnStaffCareerLadder(tokJ.to) || isOnStaffCareerLadder(tokJ.from)) {
        kept.push(chrono[j]);
      }
    }
    return kept;
  }

  function pinLatestCareerPexRows(chrono) {
    var lastPm = null;
    var lastHelper = null;
    for (var i = 0; i < chrono.length; i += 1) {
      var tok = rowCareerTokens(chrono[i]);
      if (isPexToPartnerManager(tok.from, tok.to)) lastPm = chrono[i];
      if (isPexToHelper(tok.from, tok.to)) lastHelper = chrono[i];
    }
    return [lastPm, lastHelper].filter(Boolean);
  }

  function mergeCareerRowSets(sets) {
    var out = [];
    var seen = Object.create(null);
    for (var s = 0; s < sets.length; s += 1) {
      var rows = sets[s] || [];
      for (var i = 0; i < rows.length; i += 1) {
        var row = rows[i];
        if (!row) continue;
        var tok = rowCareerTokens(row);
        var day = careerDayKey(row.dateIso || row.date || "");
        var key =
          day +
          "|" +
          tok.from +
          "|" +
          tok.to +
          "|" +
          String(row.reason || "")
            .toLowerCase()
            .trim();
        if (seen[key]) continue;
        seen[key] = 1;
        out.push(row);
      }
    }
    return out;
  }

    function slicePartnerManagerCareer(rows, opts) {
    opts = opts || {};
    var stillActive = Boolean(opts.stillActive);
    if (!Array.isArray(rows) || !rows.length) return [];
    var chrono = rows.slice().sort(function (a, b) {
      return careerRowSortMs(a) - careerRowSortMs(b);
    });
    var start = 0;
    var found = false;
    var onPm = false;
    for (var i = 0; i < chrono.length; i += 1) {
      var to = normalizeCareerRoleToken(chrono[i].newRole);
      var from = normalizeCareerRoleToken(chrono[i].oldRole);
      if (isPartnerManagerRole(to) && !isPartnerManagerRole(from)) {
        start = i;
        found = true;
        onPm = true;
        continue;
      }
      if (onPm && isPartnerManagerRole(from) && !isPartnerManagerRole(to)) {
        onPm = false;
      }
    }
    if (!found) return [];
    if (!onPm && !stillActive) return [];
    var kept = [];
    for (var j = start; j < chrono.length; j += 1) {
      var toJ = normalizeCareerRoleToken(chrono[j].newRole);
      var fromJ = normalizeCareerRoleToken(chrono[j].oldRole);
      if (isPartnerManagerRole(toJ)) {
        kept.push(chrono[j]);
        continue;
      }
      if (isPartnerManagerRole(fromJ) && !isPartnerManagerRole(toJ)) break;
    }
    return kept.sort(function (a, b) {
      return careerRowSortMs(b) - careerRowSortMs(a);
    });
  }

    function sliceToLatestCareer(rows, opts) {
    opts = opts || {};
    var stillActive = Boolean(opts.stillActive);
    var currentRole = normalizeCareerRoleToken(opts.currentRole || "");
    var track = String(opts.track || "").trim().toLowerCase();
    if (!Array.isArray(rows) || !rows.length) return [];
    /* careerStaffPmFix1: Staff+PM track staff + currentRole PM → non slice PM-only */
    var forcePmOnly =
      track === "pm" || (isPartnerManagerRole(currentRole) && track !== "staff");
    if (forcePmOnly) {
      return slicePartnerManagerCareer(rows, opts);
    }
    var chrono = rows.slice().sort(function (a, b) {
      return careerRowSortMs(a) - careerRowSortMs(b);
    });
    /* careerPinRecentPex2: scala staff attuale + pin ultimo pex PM + ultimo pex →Helper */
    var scala = sliceLatestStaffLadderStint(chrono, { stillActive: stillActive });
    var pins = pinLatestCareerPexRows(chrono);
    var merged = mergeCareerRowSets([scala, pins]);
    if (!merged.length) {
      var pmFallback = slicePartnerManagerCareer(rows, opts);
      if (pmFallback.length) return pmFallback;
      return [];
    }
    return merged.sort(function (a, b) {
      return careerRowSortMs(b) - careerRowSortMs(a);
    });
  }

  function dedupeCareerRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (!row) continue;
      var reasonRaw = String(row.reason || "");
      var reasonNorm = reasonRaw
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
            if (
        /\bmanualmente\b/.test(reasonNorm) &&
        (/\b(aggiunt[oa]|aggunto|rimoss[oa])\b/.test(reasonNorm) || /\bruolo\b/.test(reasonNorm))
      ) {
        continue;
      }
      var day = careerDayKey(row.dateIso || row.date || "");
      var from = normalizeCareerRoleToken(row.oldRole);
      var to = normalizeCareerRoleToken(row.newRole);
      var reason = reasonNorm;
      var tripKey = from && to ? day + "|" + from + "|" + to : "";
      var key = day + "|" + from + "|" + to + "|" + reason;
      if (!from && !to) {
        out.push(row);
        continue;
      }
            if (tripKey && Object.prototype.hasOwnProperty.call(seen, tripKey)) {
        out[seen[tripKey]] = preferCareerRow(out[seen[tripKey]], row);
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(seen, key)) {
        out[seen[key]] = preferCareerRow(out[seen[key]], row);
        continue;
      }
      var softKey = day + "|*|" + to + "|" + reason;
      if (to && reason && Object.prototype.hasOwnProperty.call(seen, softKey)) {
        out[seen[softKey]] = preferCareerRow(out[seen[softKey]], row);
        continue;
      }
      var idx = out.length;
      if (tripKey) seen[tripKey] = idx;
      seen[key] = idx;
      if (to && reason) seen[softKey] = idx;
      out.push(row);
    }
    return out;
  }

  function pendingBadgeHtml(count) {
    var n = Math.max(0, Math.floor(Number(count) || 0));
    if (!n) return "";
    var label = n > 99 ? "99+" : String(n);
    return (
      '<span class="vc-staff-profile-pending" title="' +
      esc(label) +
      " in attesa" +
      '" aria-label="' +
      esc(label) +
      ' in attesa">' +
      esc(label) +
      "</span>"
    );
  }

  /* resoPendBadge1: aggiorna badge Gestisci/Resoconto dopo conferma-rifiuto senza reload profilo */
  function syncResoPendingBadge(rootOrSheet, pendingCount) {
    var n = Math.max(0, Math.floor(Number(pendingCount) || 0));
    var root =
      (rootOrSheet && rootOrSheet.__vcStatRoot) ||
      (rootOrSheet && rootOrSheet.classList && rootOrSheet.classList.contains("vc-staff-profile-panel")
        ? rootOrSheet
        : null) ||
      (rootOrSheet && rootOrSheet.closest && rootOrSheet.closest(".vc-staff-profile-panel")) ||
      (global.document && global.document.querySelector(".vc-staff-profile-panel"));
    if (!root || !root.querySelector) return;
    var payload =
      root.__vcStaffPayload ||
      (rootOrSheet && rootOrSheet.__vcStatPayload) ||
      null;
    if (payload) {
      if (!payload.resoconto || typeof payload.resoconto !== "object") payload.resoconto = {};
      payload.resoconto.pendingCount = n;
    }
    var wrap = root.querySelector(".vc-staff-manage-cta-wrap");
    if (!wrap) return;
    var badgeHtml = pendingBadgeHtml(n);
    wrap.classList.toggle("has-pending", n > 0);
    var toggle = wrap.querySelector("[data-vc-staff-manage-toggle]");
    if (toggle) {
      toggle.classList.toggle("has-pending", n > 0);
      var aria = "Gestisci";
      if (n) aria += " (" + n + " resoconti in attesa)";
      toggle.setAttribute("aria-label", aria);
      var oldToggleBadge = toggle.querySelector(".vc-staff-profile-pending");
      if (oldToggleBadge) oldToggleBadge.remove();
      if (badgeHtml) toggle.insertAdjacentHTML("afterbegin", badgeHtml);
    }
    var resoItem = wrap.querySelector("[data-vc-staff-reso]");
    if (resoItem) {
      resoItem.classList.toggle("has-pending", n > 0);
      var oldItemBadge = resoItem.querySelector(".vc-staff-profile-pending");
      if (oldItemBadge) oldItemBadge.remove();
      if (badgeHtml) resoItem.insertAdjacentHTML("beforeend", badgeHtml);
    }
  }

  function countPendingResoItems(items) {
    if (!Array.isArray(items) || !items.length) return 0;
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (String((items[i] && items[i].status) || "").toLowerCase() === "pending") n += 1;
    }
    return n;
  }

  /* pausePendBadge1: badge "Giorni di pausa rimanenti" dopo accept/reject senza F5 */
  function syncPausePendingBadge(rootOrSheet, pendingCount, remainingOpt) {
    var n = Math.max(0, Math.floor(Number(pendingCount) || 0));
    var root =
      (rootOrSheet && rootOrSheet.__vcStatRoot) ||
      (rootOrSheet && rootOrSheet.classList && rootOrSheet.classList.contains("vc-staff-profile-panel")
        ? rootOrSheet
        : null) ||
      (rootOrSheet && rootOrSheet.closest && rootOrSheet.closest(".vc-staff-profile-panel")) ||
      (global.document && global.document.querySelector(".vc-staff-profile-panel"));
    if (!root || !root.querySelector) return;
    var payload =
      root.__vcStaffPayload ||
      (rootOrSheet && rootOrSheet.__vcStatPayload) ||
      null;
    if (payload) {
      if (!payload.pause || typeof payload.pause !== "object") payload.pause = {};
      payload.pause.pendingCount = n;
      if (remainingOpt != null && Number.isFinite(Number(remainingOpt))) {
        if (!payload.pause.quota || typeof payload.pause.quota !== "object") payload.pause.quota = {};
        payload.pause.quota.remaining = Math.max(0, Math.floor(Number(remainingOpt)));
      }
    }
    var card = root.querySelector('[data-vc-stat="pause"]');
    if (!card) return;
    var badgeHtml = pendingBadgeHtml(n);
    card.classList.toggle("has-pending", n > 0);
    var oldBadge = card.querySelector(".vc-staff-profile-pending");
    if (oldBadge) oldBadge.remove();
    if (badgeHtml) card.insertAdjacentHTML("afterbegin", badgeHtml);
    if (remainingOpt != null && Number.isFinite(Number(remainingOpt))) {
      var valEl = card.querySelector(".vc-user-profile-stat__value");
      if (valEl) valEl.textContent = String(Math.max(0, Math.floor(Number(remainingOpt))));
    }
  }

  function countPendingPauseItems(items) {
    if (!Array.isArray(items) || !items.length) return 0;
    var n = 0;
    for (var i = 0; i < items.length; i++) {
      if (String((items[i] && items[i].status) || "").toLowerCase() === "pending") n += 1;
    }
    return n;
  }

  function statCard(value, label, opts) {
    opts = opts || {};
    var action = opts.action ? String(opts.action) : "";
    var tip = opts.title ? String(opts.title) : "";
    var pending = Math.max(0, Math.floor(Number(opts.pending) || 0));
    var attrs =
      (action
        ? ' data-vc-stat="' +
          esc(action) +
          '" role="button" tabindex="0"'
        : "") +
      (tip ? ' title="' + esc(tip) + '"' : "") +
      (action ? ' aria-label="' + esc(tip || label) + '"' : "");
    return (
      '<article class="vc-user-profile-stat' +
      (action ? " vc-user-profile-stat--action" : "") +
      (pending ? " has-pending" : "") +
      '"' +
      attrs +
      ">" +
      pendingBadgeHtml(pending) +
      '<span class="vc-user-profile-stat__label">' +
      esc(label) +
      "</span>" +
      '<span class="vc-user-profile-stat__value">' +
      esc(value) +
      "</span></article>"
    );
  }

  function modPeriodHtml(title, pack) {
    pack = pack || {};
    function row(label, value) {
      return (
        "<li><span>" +
        esc(label) +
        "</span><span>" +
        esc(value != null ? value : 0) +
        "</span></li>"
      );
    }
    return (
      '<article class="vc-staff-profile-mod">' +
      '<p class="vc-staff-profile-mod__title">' +
      esc(title) +
      "</p>" +
      '<ul class="vc-staff-profile-mod__list">' +
      row("Mute", pack.mute) +
      row("Ban", pack.ban) +
      row("Kick", pack.kick) +
      row("Warn", pack.warn) +
      '<li class="is-total"><span>Totale</span><span>' +
      esc(pack.total || 0) +
      "</span></li>" +
      "</ul></article>"
    );
  }

  function resolveProfileAvatarUrl(identity) {
    var id = identity || {};
    try {
      if (global.VcDiscordIdentity && typeof global.VcDiscordIdentity.pickAvatarUrl === "function") {
        var picked = global.VcDiscordIdentity.pickAvatarUrl(id, 256);
        if (picked) return picked;
      }
      if (global.VcDiscordAvatar && typeof global.VcDiscordAvatar.pickAvatarUrl === "function") {
        var pickedAv = global.VcDiscordAvatar.pickAvatarUrl(id, 256);
        if (pickedAv) return pickedAv;
      }
    } catch (ePick) {}
    var uid = String(id.userId || id.id || "").trim();
    var url = String(id.avatarUrl || "").trim();
    var isDefaultEmbed = /\/embed\/avatars\//.test(url);
    var isGuild = /\/guilds\/\d+\/users\//i.test(url);
    try {
      if (global.VcDiscordAvatar && typeof global.VcDiscordAvatar.resolveUrl === "function") {
        var hashHint = isGuild ? String(id.memberAvatar || "") : String(id.avatar || "");
        var resolved = global.VcDiscordAvatar.resolveUrl(url, 256, hashHint, uid);
        if (resolved && (!isDefaultEmbed || !url)) return resolved;
      }
    } catch (eAnim) {}
    if (url && !isDefaultEmbed) return url;
    try {
      var sess = global.__VC_DISCORD_PROFILE;
      var server = global.__VC_SERVER_IDENTITY;
      if (server && String(server.userId || "") === uid && server.avatarUrl) {
        return String(server.avatarUrl);
      }
      if (!isGuild && sess && String(sess.id || "") === uid && sess.avatar) {
        var ext = String(sess.avatar).indexOf("a_") === 0 ? "gif" : "png";
        return "https://cdn.discordapp.com/avatars/" + uid + "/" + sess.avatar + "." + ext + "?size=256";
      }
    } catch (eSess) {}
    return url || (global.VCStaffTools && global.VCStaffTools.defaultAvatarUrl
      ? global.VCStaffTools.defaultAvatarUrl(uid)
      : url);
  }

  function buildRoleBadgesHtml(role) {
    var badges = role && Array.isArray(role.badges) ? role.badges : [];
    if (!badges.length && role && role.label) {
      badges = [
        {
          kind: "staff",
          icon: "fa-shield",
          label: compactStaffListRoleLabel(role.label) || role.label,
          color: role.color || "#d4a888",
        },
      ];
    }
    if (!badges.length) return "";
    return (
      '<div class="vc-user-profile-badges">' +
      badges
        .map(function (badge) {
          var kind = String(badge.kind || "staff");
          var icon = String(badge.icon || "fa-shield");
          var color = String(badge.color || role.color || "#d4a888");
          return (
            '<span class="vc-user-profile-badge vc-user-profile-badge--' +
            esc(kind) +
            '" style="--vc-profile-badge:' +
            esc(color) +
            '">' +
            '<span class="vc-user-profile-badge__icon"><i class="fa ' +
            esc(icon) +
            '" aria-hidden="true"></i></span>' +
            '<span class="vc-user-profile-badge__label">' +
            esc(badge.label || "\u2014") +
            "</span></span>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function roleLooksFounder(role) {
    if (!role) return false;
    if (role.isFounder === true) return true;
    if (String(role.kind || "").toLowerCase() === "founder") return true;
    var label = normalizeCareerRoleToken(role.label || "");
    if (label === "founder") return true;
    var badges = Array.isArray(role.badges) ? role.badges : [];
    for (var i = 0; i < badges.length; i += 1) {
      var b = badges[i] || {};
      if (String(b.kind || "").toLowerCase() === "founder") return true;
      if (normalizeCareerRoleToken(b.label || "") === "founder") return true;
    }
    return false;
  }

  function normalizePayloadUserIds(payload, expectedId) {
    expectedId = String(expectedId || "").trim();
    if (!payload || typeof payload !== "object") return "";
    if (!payload.identity || typeof payload.identity !== "object") payload.identity = {};
    var id = payload.identity;
    var payloadId = String(id.userId || id.id || "").trim();
    var tid = String(payload.targetUserId || "").trim();
    /* staffIdLock3: identity di un altro user → reject SEMPRE.
       Anche se targetUserId matcha: riscrivere solo userId lasciava nome/avatar/stats del viewer. */
    if (expectedId && payloadId && expectedId !== payloadId) return "";
    if (expectedId && tid && tid !== expectedId) return "";
    /* manca identity.userId ma targetUserId ok → stamp id */
    if (expectedId && !payloadId) {
      if (tid && tid !== expectedId) return "";
      if (!tid) return "";
      id.userId = expectedId;
      payload.targetUserId = expectedId;
      return expectedId;
    }
    if (!payload.targetUserId && payloadId) payload.targetUserId = payloadId;
    if (!id.userId && payloadId) id.userId = payloadId;
    return payloadId || (tid === expectedId ? expectedId : "") || "";
  }

  function renderPayloadHtml(payload, opts) {
    opts = opts || {};
    if (!payload || !payload.ok) return "";
    var expectedId = String(opts.expectedUserId || "").trim();
    var payloadId = normalizePayloadUserIds(payload, expectedId);
    if (expectedId && !payloadId) return "";
    if (expectedId && payloadId && expectedId !== payloadId) return "";
        if (payload.prospect) return renderProspectPexHtml(payload);
        var role = payload.role || {};
    var badges = Array.isArray(role.badges) ? role.badges : [];
    var hasRole =
      Boolean(String(role.label || "").trim() && String(role.label || "").trim() !== "—") ||
      Boolean(role.roleId) ||
      badges.length > 0 ||
      Boolean(role.isPm) ||
      Boolean(payload.partner);
    if (!hasRole) {
      return renderProspectPexHtml(
        Object.assign({}, payload, {
          prospect: true,
          canProspectPex: true,
          pexOptions: payload.pexOptions || { staff: [], pm: null },
        }),
      );
    }

    /* staffSwitchIdLock1: isSelf solo se esplicito (undefined ≠ self) */
    var isSelf = payload.isSelf === true && opts.isSelf !== false;
    var pmOnly = String(role.kind || "").toLowerCase() === "pm_only";
    var isFounder = roleLooksFounder(role);

    var id = payload.identity || {};
    var pause = payload.pause || {};
    var quota = pause.quota || {};
    var val = payload.valutazioni || {};
    var warn = payload.warn || {};
    var partner = payload.partner;
    var mod = payload.modstats;
    var career = payload.career || {};
    var history = Array.isArray(pause.history) ? pause.history : [];
    var rolesHistory = Array.isArray(career.rolesHistory) ? career.rolesHistory : [];
    var sf = payload.serataFilm;

    var stats = [];
    var canManagePmPointsTop = canWriteStaffManage();
    /* Fan#1 shopSpendFix1: Spesi/Punti/Partner sempre in top se c'e' blocco partner (anche staff+PM) */
    var showPmTopStats = Boolean(partner);
    if (!isFounder) {
      stats.push(
        /* pauseReviewProfile1: HS → form inbox; altri → calendario */
        /* profilePendingBadges1: badge pending pause */
        statCard(quota.remaining != null ? quota.remaining : "\u2014", "Giorni di pausa rimanenti", {
          action: "pause",
          title: canWriteStaffManage()
            ? "Richiesta pausa (revisione High Staff)"
            : "Apri mini calendario pause",
          pending: pause.pendingCount,
        }),
      );
      /* resoInGestisci1: Resoconto non più card — voce del menu Gestisci */
    }
    if (showPmTopStats) {
      stats.push(
        statCard(partner.redeemSpend != null ? partner.redeemSpend : 0, "Spesi in shop", {
          action: "pm-shop-spend",
          title: canManagePmPointsTop
            ? "Riscatta premi e storico shop"
            : "Storico riscatti shop",
        }),
      );
      stats.push(
        statCard(partner.points != null ? partner.points : 0, "Punti PM", {
          action: "pm-points",
          title: canManagePmPointsTop ? "Gestisci punti PM" : "Punti PM",
        }),
      );
      /* partnerPtChrono1: Partner → cronologia punti tolti (self + HS) */
      (function () {
        var canPt = canOpenPmPuntiTolti(payload);
        stats.push(
          statCard(partner.partnerCount != null ? partner.partnerCount : 0, "Partner", {
            action: canPt ? "pm-punti-tolti" : "",
            title: canPt ? "Cronologia punti tolti" : "",
            pending: canPt ? partner.pendingPuntiTolti : 0,
          }),
        );
      })();
    }
    if (!pmOnly && !isFounder) {
      stats.push(
        statCard(val.positive != null ? val.positive : 0, "Valutazioni Positive", {
          action: "val-pos",
          title: "Lista valutazioni positive",
        }),
      );
      stats.push(
        statCard(val.negative != null ? val.negative : 0, "Valutazioni Negative", {
          action: "val-neg",
          title: "Lista valutazioni negative",
        }),
      );
      stats.push(
        statCard(warn.count != null ? warn.count : 0, "Warn Staff", {
          action: "warn",
          title: "Lista warn staff",
        }),
      );
    }

    var pauseRows = history.length
      ? history
          .map(function (row) {
            return (
              '<li class="vc-staff-profile-line vc-staff-profile-line--row" data-pause-start="' +
              esc(row.start || row.startIso || "") +
              '" data-pause-end="' +
              esc(row.end || row.endIso || "") +
              '" data-pause-status="' +
              esc(row.status || "") +
              '" data-pause-phase="' +
              esc(row.phase || "") +
              '">' +
              '<span class="vc-staff-profile-line__main">' +
              esc(row.start || "?") +
              " \u2192 " +
              esc(row.end || "?") +
              "</span>" +
              '<span class="vc-staff-profile-line__tag">' +
              esc(row.statusLabel || row.status || "") +
              "</span>" +
              (row.motivazione
                ? '<span class="vc-staff-profile-line__sub">' + esc(row.motivazione) + "</span>"
                : "") +
              "</li>"
            );
          })
          .join("")
      : '<li class="vc-staff-profile-line vc-staff-profile-line--empty">Nessuna pausa recente.</li>';

    var roleKind = String(role.kind || "").toLowerCase();
    var stillActiveCareer = roleKind === "full" || roleKind === "pm_only";
    var currentCareerRole =
      (career && career.currentRole) ||
      (roleKind === "pm_only" ? "Partner Manager" : "") ||
      (role && role.label) ||
      (Array.isArray(role.badges) && role.badges[0] && role.badges[0].label) ||
      "";
    var careerRows = rolesHistory.length
      ? dedupeCareerRows(
          sliceToLatestCareer(rolesHistory, {
            stillActive: stillActiveCareer,
            currentRole: currentCareerRole,
            track: roleKind === "pm_only" ? "pm" : "staff",
          }),
        )
      : [];
    var roleRows = careerRows.length
      ? careerRows
          .map(function (row) {
            return (
              '<li class="vc-staff-profile-line vc-staff-profile-line--row">' +
              '<span class="vc-staff-profile-line__main">' +
              esc(row.oldRole) +
              " \u2192 " +
              esc(row.newRole) +
              "</span>" +
              (row.dateLabel
                ? '<span class="vc-staff-profile-line__tag">' + esc(row.dateLabel) + "</span>"
                : "") +
              (row.reason
                ? '<span class="vc-staff-profile-line__sub">' + esc(row.reason) + "</span>"
                : "") +
              "</li>"
            );
          })
          .join("")
      : "";

    var roleColor = String(role.color || "#d4a888").trim() || "#d4a888";
    var profileAvatarUrl = resolveProfileAvatarUrl(id);
    var avatarHash = String(id.avatar || id.avatarHash || "").trim();
    if (!avatarHash && profileAvatarUrl && !/\/guilds\//i.test(profileAvatarUrl)) {
      try {
        var hm = String(profileAvatarUrl).match(/\/avatars\/\d+\/((?:a_)?[a-f0-9]+)\./i);
        if (hm) avatarHash = hm[1];
      } catch (eH) {}
    }
    var avatarHtml =
      global.VCStaffTools && global.VCStaffTools.avatarImgHtml
        ? global.VCStaffTools.avatarImgHtml(profileAvatarUrl, id.userId || id.id, {
            width: 120,
            height: 120,
            className: "vc-user-profile-avatar",
            loading: "eager",
            fetchPriority: "high",
            avatarHash: avatarHash,
          })
        : profileAvatarUrl
          ? '<img class="vc-user-profile-avatar" src="' +
            esc(profileAvatarUrl) +
            '" alt="" width="120" height="120" loading="eager" fetchpriority="high" data-vc-avatar="1" data-user-id="' +
            esc(String(id.userId || id.id || "")) +
            '" />'
          : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user" aria-hidden="true"></i></span>';

    var neighbors = (opts && opts.neighbors) || payload.neighbors || null;
    var manageHtml = manageBtnHtml(payload, isSelf);
    var perms = global.__VC_STAFF_PERMS || {};
    var canOpenSerata = Boolean(perms.isHighStaff || perms.canManage || perms.highStaff);
    var sfUnderHtml = sf ? sfUnderManageHtml(sf, { isSelf: isSelf, canOpenSerata: canOpenSerata }) : "";
    var toolsInner = (manageHtml || "") + (sfUnderHtml || "");

    var html = '<section class="vc-user-profile-shell vc-staff-profile-panel">';

    html +=
      '<section class="vc-user-profile-hero vc-staff-profile-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap" style="--vc-rank-ring:' +
      esc(roleColor) +
      ";--vc-avatar-ring:" +
      esc(roleColor) +
      '">' +
      '<span class="vc-user-profile-avatarclip">' +
      avatarHtml +
      "</span></div>" +
      '<div class="vc-user-profile-hero__copy">' +
      '<h1 class="vc-user-profile-name">' +
      esc(id.displayName || "Staff") +
      "</h1>" +
      (id.username ? '<p class="vc-user-profile-handle">@' + esc(id.username) + "</p>" : "") +
      (id.userId || id.id
        ? '<p class="vc-user-profile-id">ID: ' + esc(String(id.userId || id.id)) + "</p>"
        : "") +
      "</div>" +
      (toolsInner
        ? '<div class="vc-user-profile-hero__tools">' + toolsInner + "</div>"
        : "") +
      "</div>" +
      buildRoleBadgesHtml(role) +
      '<div class="vc-user-profile-stats vc-user-profile-stats--staff">' +
      stats.join("") +
      "</div></section>";

        try {
      payload.__vcStaffNeighbors = neighbors;
    } catch (eN) {}

    if (!isFounder) {
      html +=
        '<section class="vc-user-profile-block">' +
        '<div class="vc-user-profile-block__head">' +
        '<span class="vc-user-profile-block__title">Pause</span>' +
        '<a class="vc-user-profile-customize" href="/staff/pause/" title="Calendario pause"><i class="fa fa-calendar" aria-hidden="true"></i></a>' +
        "</div>" +
        '<p class="vc-user-profile-block__sub">' +
        esc(pause.statusLine || "Nessuna pausa in corso") +
        "</p>" +
        '<ul class="vc-staff-profile-lines">' +
        pauseRows +
        "</ul></section>";

            if (roleRows) {
        html +=
          '<section class="vc-user-profile-block vc-staff-career-block">' +
          '<div class="vc-user-profile-block__head">' +
          '<span class="vc-user-profile-block__title">Carriera</span>' +
          '<a class="vc-user-profile-customize" href="/staff/organico/" title="Organico staff"><i class="fa fa-users" aria-hidden="true"></i></a>' +
          "</div>" +
          '<ul class="vc-staff-profile-lines">' +
          roleRows +
          "</ul></section>";
      }
    }

    /* pmCardKill1 / pmCardScroll1: niente card "Partner Manager" — self e other.
       Metriche restano nelle top-stat / Gestisci; shop premi solo self. */
    if (partner && !isFounder) {
      if (isSelf && partner.shop && global.VCStaffPmShop) {
        html += global.VCStaffPmShop.renderShopSection(partner.shop, { readOnly: false });
      }
    }

    if (mod) {
      html +=
        '<section class="vc-user-profile-block">' +
        '<div class="vc-user-profile-block__head">' +
        '<span class="vc-user-profile-block__title">Sanzioni</span>' +
        "</div>" +
        '<div class="vc-staff-profile-mod-grid">' +
        modPeriodHtml("7 giorni", mod.d7) +
        modPeriodHtml("30 giorni", mod.d30) +
        modPeriodHtml("Totale", mod.all) +
        "</div></section>";
    }

    html += "</section>";
    return html;
  }

  function unlockSheetPageChrome() {
    /* sheetUnlock1: stesso sblocco inbox — hold/loader lasciano touch-action:none e click morti */
    try {
      var root = global.document.documentElement;
      root.classList.remove(
        "vc-interaction-hold",
        "vc-notif-staff-loading",
        "vc-notif-early-staff",
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-scroll-soft-lock",
      );
      root.classList.add("vc-soft-fx-ready", "vc-page-cine-ready");
      root.style.setProperty("pointer-events", "auto", "important");
      root.style.setProperty("touch-action", "manipulation", "important");
      if (global.document.body) {
        global.document.body.style.setProperty("pointer-events", "auto", "important");
        global.document.body.style.setProperty("touch-action", "manipulation", "important");
      }
    } catch (eUnlock) {}
    try {
      global.__vcSheetCloseGuardUntil = 0;
    } catch (eG) {}
    try {
      if (typeof global.__vcReleaseInteractionHold === "function") global.__vcReleaseInteractionHold();
    } catch (eRel) {}
  }

  function notifyProfileSheetClosed() {
    try {
      global.document.dispatchEvent(new CustomEvent("vc:staff-profile-sheet-closed"));
    } catch (eEv) {}
  }

  function closeStatSheet() {
    try {
      if (typeof global.__vcArmSheetCloseGuard === "function") global.__vcArmSheetCloseGuard(520);
    } catch (eGhost) {}
    try { closeProfileResoSheet(); } catch (eResoClose) {}
    var existing = global.document.getElementById("vc-staff-stat-sheet");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    try {
      global.document.documentElement.classList.remove("vc-staff-stat-sheet-open");
    } catch (e) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcUnpinPageScroll === "function") global.__vcUnpinPageScroll();
    } catch (eUnpin) {}
    /* staffProfLivePause1: rimonta frecce peer dopo chiusura sheet */
    notifyProfileSheetClosed();
  }

  function reasonEntriesFromPayload(payload, kind) {
    var val = (payload && payload.valutazioni) || {};
    var warn = (payload && payload.warn) || {};
    if (kind === "val-pos") {
      var pos = Array.isArray(val.positiveEntries) ? val.positiveEntries : [];
      if (pos.length) return pos;
      return (Array.isArray(val.recentPositive) ? val.recentPositive : []).map(function (t, i) {
        return { id: i + 1, text: t };
      });
    }
    if (kind === "val-neg") {
      var neg = Array.isArray(val.negativeEntries) ? val.negativeEntries : [];
      if (neg.length) return neg;
      return (Array.isArray(val.recentNegative) ? val.recentNegative : []).map(function (t, i) {
        return { id: i + 1, text: t };
      });
    }
    if (kind === "warn") {
      var w = Array.isArray(warn.entries) ? warn.entries : [];
      if (w.length) return w;
      return (Array.isArray(warn.recent) ? warn.recent : []).map(function (t, i) {
        return { id: i + 1, text: t };
      });
    }
    return [];
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isoDay(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function parsePauseDay(s) {
    var raw = String(s == null ? "" : s)
      .trim()
      .replace(/[\u2044\u2215\uFF0F]/g, "/")
      .replace(/[\u2013\u2014\u2212]/g, "-");
    if (!raw) return null;
        var m = raw.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
    if (m) {
      var day = Number(m[1]);
      var month = Number(m[2]);
      var year = Number(m[3]);
      var dt = new Date(Date.UTC(year, month - 1, day));
      if (
        dt.getUTCFullYear() !== year ||
        dt.getUTCMonth() !== month - 1 ||
        dt.getUTCDate() !== day
      ) {
        return null;
      }
      return dt;
    }
    m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    return null;
  }

  function romeTodayParts() {
    try {
      var fmt = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Rome",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
      var parts = fmt.formatToParts(new Date());
      var map = {};
      for (var i = 0; i < parts.length; i += 1) map[parts[i].type] = parts[i].value;
      return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
    } catch (e) {
      var n = new Date();
      return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate() };
    }
  }

  function monthLabelIt(y, m) {
    var names = [
      "Gennaio",
      "Febbraio",
      "Marzo",
      "Aprile",
      "Maggio",
      "Giugno",
      "Luglio",
      "Agosto",
      "Settembre",
      "Ottobre",
      "Novembre",
      "Dicembre",
    ];
    return names[m - 1] + " " + y;
  }

  function resolvePauseRanges(pauses) {
    return (Array.isArray(pauses) ? pauses : [])
      .map(function (p) {
        if (!p) return null;
        var st = String(p.status || "")
          .toLowerCase()
          .trim();
                if (st === "rejected" || st === "rifiutata") return null;
        var cancelled =
          st === "cancelled" ||
          st === "canceled" ||
          st === "annullata" ||
          st === "annullato";
        var a = parsePauseDay(p.startIso || p.start);
        var b = parsePauseDay(p.endIso || p.end);
        if (!a || !b || b < a) return null;
        var phase = String(p.phase || "").toLowerCase();
        if (cancelled) phase = "cancelled";
        else if (phase !== "planned" && phase !== "ended" && phase !== "active") {
          var today = romeTodayParts();
          var now = new Date(Date.UTC(today.y, today.m - 1, today.d));
          if (now < a) phase = "planned";
          else if (now > b) phase = "ended";
          else phase = "active";
        }
        return {
          start: a,
          end: b,
          phase: phase,
          status: st || "accepted",
          statusLabel: cancelled
            ? p.statusLabel || "Annullata"
            : p.statusLabel || null,
          cancelled: cancelled,
        };
      })
      .filter(Boolean);
  }

  function pickCalendarMonth(ranges) {
    var today = romeTodayParts();
        return { y: today.y, m: today.m };
  }

  function formatRangeLabel(start, end) {
    return (
      pad2(start.getUTCDate()) +
      "/" +
      pad2(start.getUTCMonth() + 1) +
      "/" +
      start.getUTCFullYear() +
      " \u2192 " +
      pad2(end.getUTCDate()) +
      "/" +
      pad2(end.getUTCMonth() + 1) +
      "/" +
      end.getUTCFullYear()
    );
  }

  function phaseTagLabel(phase, statusLabel) {
    if (statusLabel) return String(statusLabel);
    if (phase === "cancelled") return "Annullata";
    if (phase === "planned") return "Programmata";
    if (phase === "ended") return "Finita";
    return "In corso";
  }

  function buildMiniCalHtml(pauses, year, month) {
    var days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    var firstDow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    var mondayFirst = (firstDow + 6) % 7;
    var ranges = resolvePauseRanges(pauses);
    var paintRanges = ranges.filter(function (r) {
      return !r.cancelled;
    });
    var monthStart = new Date(Date.UTC(year, month - 1, 1));
    var monthEnd = new Date(Date.UTC(year, month - 1, days));
    var todayParts = romeTodayParts();
    var todayIso = isoDay(todayParts.y, todayParts.m, todayParts.d);

    function dayMeta(dayIso) {
      var day = parsePauseDay(dayIso);
      if (!day) return null;
      for (var i = 0; i < paintRanges.length; i += 1) {
        var r = paintRanges[i];
        if (day >= r.start && day <= r.end) {
          var isMonthStart = day.getTime() === Math.max(r.start.getTime(), monthStart.getTime());
          var isMonthEnd = day.getTime() === Math.min(r.end.getTime(), monthEnd.getTime());
          return {
            phase: r.phase || "active",
            pending: String(r.status || "").toLowerCase() === "pending",
            isStart: isMonthStart,
            isEnd: isMonthEnd,
            isMid: !isMonthStart && !isMonthEnd,
            range: r,
          };
        }
      }
      return null;
    }

    var cells = "";
    var i;
    for (i = 0; i < mondayFirst; i += 1) {
      cells += '<span class="vc-staff-mini-cal__cell is-empty" aria-hidden="true"></span>';
    }
    var pauseDayCount = 0;
    for (var d = 1; d <= days; d += 1) {
      var iday = isoDay(year, month, d);
      var meta = dayMeta(iday);
      var cls = "vc-staff-mini-cal__cell";
      var label = String(d);
      var title = "";
      if (iday === todayIso) cls += " is-today";
      if (meta) {
        pauseDayCount += 1;
        var phaseCls = String(meta.phase || "active");
        if (phaseCls !== "planned" && phaseCls !== "ended" && phaseCls !== "active") phaseCls = "active";
        cls += " is-pause is-" + phaseCls;
        if (meta.isStart) cls += " is-range-start";
        if (meta.isEnd) cls += " is-range-end";
        if (meta.isMid) cls += " is-range-mid";
        if (meta.pending) cls += " is-pending";
        title =
          "In pausa \u00B7 " +
          formatRangeLabel(meta.range.start, meta.range.end) +
          " \u00B7 " +
          phaseTagLabel(meta.phase, meta.range.statusLabel);
        if (meta.isStart) {
          label =
            '<span class="vc-staff-mini-cal__daynum">' +
            d +
            '</span><span class="vc-staff-mini-cal__pausa">Pausa</span>';
        } else {
          label = '<span class="vc-staff-mini-cal__daynum">' + d + "</span>";
        }
      } else {
        label = '<span class="vc-staff-mini-cal__daynum">' + d + "</span>";
      }
      cells +=
        '<span class="' +
        cls +
        '" data-day="' +
        esc(iday) +
        '"' +
        (title ? ' title="' + esc(title) + '"' : "") +
        (meta ? ' aria-label="' + esc(title) + '"' : "") +
        ">" +
        label +
        "</span>";
    }

    var monthRows = ranges.filter(function (r) {
      return r.end >= monthStart && r.start <= monthEnd;
    });
    monthRows.sort(function (a, b) {
      if (Boolean(a.cancelled) !== Boolean(b.cancelled)) return a.cancelled ? 1 : -1;
      return a.start.getTime() - b.start.getTime();
    });

    var spanHint = "";
    if (monthRows.length) {
      var activeCount = monthRows.filter(function (r) {
        return !r.cancelled;
      }).length;
      var cancelledCount = monthRows.length - activeCount;
      var hintBits = [];
      if (pauseDayCount === 1) hintBits.push("1 giorno di pausa");
      else if (pauseDayCount > 1) hintBits.push(pauseDayCount + " giorni di pausa");
      if (cancelledCount === 1) hintBits.push("1 annullata");
      else if (cancelledCount > 1) hintBits.push(cancelledCount + " annullate");
      if (!hintBits.length) hintBits.push(monthRows.length + " richieste");
      spanHint =
        '<p class="vc-staff-mini-cal__banner">' +
        '<i class="fa fa-moon-o" aria-hidden="true"></i>' +
        "<span>" +
        hintBits.join(" \u00B7 ") +
        " in " +
        monthLabelIt(year, month) +
        "</span></p>";
    }

    var listSource = monthRows.length ? monthRows : ranges.slice(0, 8);
    var listHtml =
      listSource.length > 0
        ? (monthRows.length
            ? '<p class="vc-staff-mini-cal__list-title">Pause del mese</p>'
            : '<p class="vc-staff-stat-sheet__empty">Nessuna pausa in questo mese. Ultime pause:</p>') +
          '<ul class="vc-staff-stat-sheet__list vc-staff-mini-cal__list">' +
          listSource
            .map(function (r) {
              var rowCls =
                "vc-staff-stat-sheet__item is-pause-row" +
                (r.cancelled ? " is-cancelled" : "");
              var ico = r.cancelled ? "fa-ban" : "fa-moon-o";
              return (
                '<li class="' +
                rowCls +
                '">' +
                '<span class="vc-staff-stat-sheet__item-ico" aria-hidden="true"><i class="fa ' +
                ico +
                '"></i></span>' +
                '<div class="vc-staff-stat-sheet__item-copy">' +
                '<span class="vc-staff-stat-sheet__item-kicker">' +
                (r.cancelled ? "Pausa annullata" : "Periodo di pausa") +
                "</span>" +
                '<span class="vc-staff-stat-sheet__item-main">' +
                esc(formatRangeLabel(r.start, r.end)) +
                "</span>" +
                '<span class="vc-staff-stat-sheet__item-tag' +
                (r.cancelled ? " is-cancelled" : "") +
                '">' +
                esc(phaseTagLabel(r.phase, r.statusLabel)) +
                "</span></div></li>"
              );
            })
            .join("") +
          "</ul>"
        : '<div class="vc-staff-stat-sheet__empty-card">' +
          '<span class="vc-staff-stat-sheet__empty-ico" aria-hidden="true"><i class="fa fa-moon-o"></i></span>' +
          '<p class="vc-staff-stat-sheet__empty">Nessuna pausa registrata.</p></div>';

    return (
      '<div class="vc-staff-mini-cal-wrap">' +
      '<div class="vc-staff-mini-cal" data-y="' +
      year +
      '" data-m="' +
      month +
      '">' +
      '<div class="vc-staff-mini-cal__nav">' +
      '<button type="button" class="vc-staff-mini-cal__navbtn" data-cal-nav="-1" aria-label="Mese precedente"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<span class="vc-staff-mini-cal__title">' +
      esc(monthLabelIt(year, month)) +
      "</span>" +
      '<button type="button" class="vc-staff-mini-cal__navbtn" data-cal-nav="1" aria-label="Mese successivo"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-staff-mini-cal__legend" aria-hidden="true">' +
      '<span class="vc-staff-mini-cal__leg is-ended"><span class="vc-staff-mini-cal__swatch"></span>Pausa</span>' +
      '<span class="vc-staff-mini-cal__leg is-active"><span class="vc-staff-mini-cal__swatch"></span>In corso</span>' +
      '<span class="vc-staff-mini-cal__leg is-planned"><span class="vc-staff-mini-cal__swatch"></span>Programmata</span>' +
      '<span class="vc-staff-mini-cal__leg is-cancelled"><span class="vc-staff-mini-cal__swatch"></span>Annullata</span>' +
      "</div>" +
      spanHint +
      '<div class="vc-staff-mini-cal__dows" aria-hidden="true">' +
      "<span>L</span><span>M</span><span>M</span><span>G</span><span>V</span><span>S</span><span>D</span>" +
      "</div>" +
      '<div class="vc-staff-mini-cal__grid">' +
      cells +
      "</div></div>" +
      '<div class="vc-staff-mini-cal__side">' +
      listHtml +
      "</div></div>"
    );
  }

  function historyFromPayloadOrDom(payload, root) {
    var history = ((payload && payload.pause) || {}).history;
    if (Array.isArray(history) && history.length) return history;
    if (!root || !root.querySelectorAll) return [];
    var nodes = root.querySelectorAll("[data-pause-start][data-pause-end]");
    var out = [];
    for (var i = 0; i < nodes.length; i += 1) {
      var el = nodes[i];
      out.push({
        start: el.getAttribute("data-pause-start") || "",
        end: el.getAttribute("data-pause-end") || "",
        status: el.getAttribute("data-pause-status") || "accepted",
        phase: el.getAttribute("data-pause-phase") || "",
        statusLabel: (el.querySelector(".vc-staff-profile-line__tag") || {}).textContent || null,
      });
    }
    return out;
  }

  function reasonListKindMeta(kind) {
    if (kind === "val-pos") {
      return {
        title: "Valutazioni Positive",
        icon: "fa-thumbs-up",
        tone: "pos",
        empty: "Nessuna valutazione positiva.",
      };
    }
    if (kind === "val-neg") {
      return {
        title: "Valutazioni Negative",
        icon: "fa-thumbs-down",
        tone: "neg",
        empty: "Nessuna valutazione negativa.",
      };
    }
    return {
      title: "Warn Staff",
      icon: "fa-exclamation-triangle",
      tone: "warn",
      empty: "Nessun warn staff.",
    };
  }

  function renderProspectPexHtml(payload) {
    var id = payload.identity || {};
    var name = id.displayName || id.username || "Utente";
    try {
      if (global.VcDiscordIdentity && typeof global.VcDiscordIdentity.pickDisplayName === "function") {
        name = global.VcDiscordIdentity.pickDisplayName(id, "Utente");
      }
    } catch (eDn) {}
    var username = String(id.username || "").trim();
    var uid = String(id.userId || id.id || payload.targetUserId || "").trim();
    var ring = "#a67c52";
    var profileAvatarUrl = resolveProfileAvatarUrl(id) || id.avatarUrl || "";
    var avatarHash = String(id.avatar || id.avatarHash || "").trim();
    if (!avatarHash && profileAvatarUrl && !/\/guilds\//i.test(profileAvatarUrl)) {
      try {
        var hm2 = String(profileAvatarUrl).match(/\/avatars\/\d+\/((?:a_)?[a-f0-9]+)\./i);
        if (hm2) avatarHash = hm2[1];
      } catch (eH2) {}
    }
    var avatarHtml =
      global.VCStaffTools && global.VCStaffTools.avatarImgHtml
        ? global.VCStaffTools.avatarImgHtml(profileAvatarUrl, uid, {
            width: 120,
            height: 120,
            className: "vc-user-profile-avatar",
            loading: "eager",
            fetchPriority: "high",
            avatarHash: avatarHash,
          })
        : profileAvatarUrl
          ? '<img class="vc-user-profile-avatar" src="' +
            esc(profileAvatarUrl) +
            '" alt="" width="120" height="120" loading="eager" fetchpriority="high" data-vc-avatar="1" data-user-id="' +
            esc(String(id.userId || id.id || "")) +
            '" />'
          : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user" aria-hidden="true"></i></span>';

    return (
      '<div class="vc-user-profile-shell vc-staff-profile-shell vc-staff-prospect">' +
      '<section class="vc-user-profile-hero vc-staff-profile-hero vc-staff-prospect-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap" style="--vc-rank-ring:' +
      esc(ring) +
      ";--vc-avatar-ring:" +
      esc(ring) +
      '">' +
      '<span class="vc-user-profile-avatarclip">' +
      avatarHtml +
      "</span></div>" +
      '<div class="vc-user-profile-hero__copy">' +
      '<h1 class="vc-user-profile-name">' +
      esc(name) +
      "</h1>" +
      (username ? '<p class="vc-user-profile-handle">@' + esc(username) + "</p>" : "") +
      (uid ? '<p class="vc-user-profile-id">ID: ' + esc(uid) + "</p>" : "") +
      "</div></div>" +
      '<div class="vc-user-profile-badges vc-staff-prospect-badges" aria-label="Stato staff">' +
      '<span class="vc-user-profile-badge vc-user-profile-badge--tone" data-badge-kind="prospect" style="--vc-profile-badge:' +
      esc(ring) +
      '">' +
      '<span class="vc-user-profile-badge__icon"><i class="fa fa-user-plus" aria-hidden="true"></i></span>' +
      '<span class="vc-user-profile-badge__label">Non ancora staff</span>' +
      "</span></div>" +
      '<p class="vc-staff-prospect-note">Nessun profilo staff attivo: puoi promuoverlo con Pex.</p>' +
      "</section>" +
      '<section class="vc-staff-prospect-pex" aria-label="Pex utente">' +
      '<button type="button" class="vc-staff-prospect-pex__btn" data-vc-prospect-pex="1">' +
      '<span class="vc-staff-prospect-pex__ico" aria-hidden="true"><i class="fa fa-arrow-up"></i></span>' +
      '<span class="vc-staff-prospect-pex__title">Pex</span>' +
      '<span class="vc-staff-prospect-pex__hint">Member \u2192 Partner Manager o ruolo staff</span>' +
      "</button></section></div>"
    );
  }

  function runProspectPexFlow(payload, hooks, panelRoot) {
    hooks = hooks || {};
    var opts = payload && payload.pexOptions ? payload.pexOptions : {};
    var staff = Array.isArray(opts.staff) ? opts.staff : [];
    var pm = opts.pm || null;
    var uid = String((payload.identity && payload.identity.userId) || payload.targetUserId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return;
    var arrow = " \u2192 ";
    var root = panelRoot || null;

    var D = global.VcDialog;
    var chooseFn = D && typeof D.choose === "function" ? function (o) { return D.choose(o); } : null;
    var promptFn = D && typeof D.prompt === "function" ? function (o) { return D.prompt(o); } : null;
    var confirmFn = D && typeof D.confirm === "function" ? function (o) { return D.confirm(o); } : null;
    if (!chooseFn || !promptFn || !confirmFn) {
      dlgAlert({ message: "Dialog non disponibili. Ricarica la pagina." });
      return;
    }

    function pexArrowLabel(fromRole, toRole) {
      var to = String(toRole || "Ruolo").trim();
      var from = String(fromRole || "").trim();
      if (from) return from + arrow + to;
      return "Pex" + arrow + to;
    }

    var trackChoices = [];
    if (pm) trackChoices.push({ id: "pm", label: pexArrowLabel("Member", "Partner Manager") });
    if (staff.length === 1) {
      trackChoices.push({
        id: staff[0].action,
        label: pexArrowLabel(
          "Member",
          staff[0].label || String(staff[0].hint || "").replace(/^.*\u2192\s*/, "") || "Staff",
        ),
      });
    } else if (staff.length) {
      trackChoices.push({ id: "staff", label: pexArrowLabel("Member", "ruolo staff") });
    }
    if (!trackChoices.length) {
      dlgAlert({ message: "Nessuna opzione di pex disponibile." });
      return;
    }

    var pickAction = Promise.resolve(null);
    if (trackChoices.length === 1 && trackChoices[0].id === "pm") {
      pickAction = Promise.resolve("pex_pm");
    } else if (trackChoices.length === 1 && trackChoices[0].id !== "staff") {
      pickAction = Promise.resolve(trackChoices[0].id);
    } else {
      pickAction = chooseFn({
        title: "Pex",
        message: "Scegli il tipo di promozione.",
        cancelLabel: "Annulla",
        icon: "fa-arrow-up",
        danger: false,
        choices: trackChoices,
      }).then(function (track) {
        if (!track) return null;
        if (track === "pm") return "pex_pm";
        if (track !== "staff") return track;
        if (staff.length === 1) return staff[0].action;
        return chooseFn({
          title: "Ruolo staff",
          message: "A quale ruolo vuoi promuoverlo?",
          cancelLabel: "Annulla",
          icon: "fa-shield",
          danger: false,
          choices: staff.map(function (r) {
            return {
              id: r.action,
              label: pexArrowLabel(
                "Member",
                r.label || String(r.hint || "").replace(/^.*\u2192\s*/, "") || r.action,
              ),
            };
          }),
        });
      });
    }

    pickAction
      .then(function (action) {
        if (!action) return null;
        var roleLabel =
          action === "pex_pm"
            ? "Partner Manager"
            : (staff.find(function (r) {
                return r.action === action;
              }) || {}).label || action;
        var label = pexArrowLabel("Member", roleLabel);
        return promptFn({
          title: "Motivo pex",
          message: "Motivo per: " + label,
          label: "Motivo",
          placeholder: "Min. 3 caratteri…",
          multiline: true,
          maxLength: 500,
          confirmLabel: "Continua",
          cancelLabel: "Annulla",
          icon: "fa-pencil",
        }).then(function (raw) {
          if (raw == null) return null;
          var reason = String(raw || "").trim();
          if (reason.length < 3) {
            return dlgAlert({
              title: "Motivo troppo corto",
              message: "Serve un motivo di almeno 3 caratteri.",
            }).then(function () {
              return null;
            });
          }
          return confirmFn({
            title: "Conferma pex",
            message: "Confermi " + label + "?\n\nMotivo: " + reason,
            confirmLabel: "Conferma pex",
            cancelLabel: "Annulla",
            icon: "fa-arrow-up",
          }).then(function (ok) {
            return ok ? { action: action, reason: reason } : null;
          });
        });
      })
      .then(function (pack) {
        if (!pack) {
                    try {
            var live = root && root.__vcStaffPayload ? root.__vcStaffPayload : payload;
            if (live && live.prospect && global.VCStaffProfileRender) {
              var panel = root;
              global.VCStaffProfileRender.renderInto(panel, live, {});
            }
          } catch (eKeep) {}
          return;
        }
        return postManageAction({
          action: pack.action,
          userId: uid,
          reason: pack.reason,
        }).then(function (out) {
          if (!out.res.ok || !out.data || !out.data.ok) {
            return dlgAlert({
              title: "Pex non riuscito",
              message: (out.data && out.data.message) || "Operazione non riuscita.",
            });
          }
          if (typeof hooks.onReload === "function") hooks.onReload();
          else if (typeof hooks.reload === "function") hooks.reload();
        });
      })
      .catch(function () {
        dlgAlert({ message: "Errore di rete." });
      });
  }

  function canWriteStaffManage() {
    var p = global.__VC_STAFF_PERMS || {};
    return Boolean(p.canManage || p.isHighStaff || p.highStaff);
  }

  /* partnerPtChrono1 */
  function canOpenPmPuntiTolti(payload) {
    if (canWriteStaffManage()) return true;
    return isOwnStaffProfile(payload);
  }

  /* resoProfile1 */
  function canOpenResoconto(payload) {
    if (canWriteStaffManage()) return true;
    var p = global.__VC_STAFF_PERMS || {};
    if (p.canViewResoconti === true || p.resocontiReview === true) return true;
    if (p.isPmGestore || p.canManagePm) return true;
    return isOwnStaffProfile(payload);
  }

  function isOwnStaffProfile(payload) {
    if (payload && payload.isSelf === true) return true;
    if (payload && payload.isSelf === false) return false;
    var target = targetUserIdFromPayload(payload);
    if (!target) return false;
    try {
      var sess = global.__VC_DISCORD_PROFILE;
      if (sess && String(sess.id || "") === target) return true;
    } catch (e0) {}
    try {
      var raw = global.localStorage.getItem("vc_discord_user");
      if (raw) {
        var u = JSON.parse(raw);
        if (u && String(u.id || "") === target) return true;
      }
    } catch (e1) {}
    return false;
  }

  function manageApiBase() {
    var c = global.__VC_STAFF_MANAGE || {};
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-manage").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (e) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-manage";
    return base;
  }

  function pmActionsApiBase() {
    var c = global.__VC_STAFF_PM_ACTIONS || {};
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-pm-actions").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (e) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-pm-actions";
    return base;
  }

  function postPmPointsAction(body) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    return fetch(pmActionsApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  function pmShopApiBase() {
    var c = global.__VC_STAFF_PM_SHOP || {};
    var T = global.VCStaffTools;
    if (T && typeof T.resolveApiUrl === "function") {
      return T.resolveApiUrl(c, "/webhooks/site-staff-pm-shop");
    }
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-pm-shop").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (eShop) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-pm-shop";
    return base;
  }

  function pmPuntiToltiApiBase() {
    var T = global.VCStaffTools;
    var c = global.__VC_STAFF_PM_POINTS_REMOVED || {};
    if (T && typeof T.resolveApiUrl === "function") {
      return T.resolveApiUrl(c, "/webhooks/site-staff-pm-points-removed");
    }
    var base = String(c.apiUrl || "/webhooks/site-staff-pm-points-removed").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      var local = String(c.apiUrlLocal || "").trim();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (eLoc) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-pm-points-removed";
    return base;
  }

  function fetchPmPuntiTolti(userId) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    var url =
      pmPuntiToltiApiBase() +
      "?pmUserId=" +
      encodeURIComponent(String(userId || "")) +
      "&limit=30";
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer =
      ctrl &&
      global.setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, 12000);
    return fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .finally(function () {
        if (timer) global.clearTimeout(timer);
      });
  }

  function postPmPuntiToltiReview(messageId, action) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    return fetch(pmPuntiToltiApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ action: action, messageId: messageId }),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  function ptStatusLabel(status) {
    if (status === "pending") return "In attesa";
    if (status === "confirmed") return "Confermata";
    if (status === "denied") return "Negata";
    return "Registrata";
  }

  function ptStatusClass(status) {
    if (status === "pending") return "vc-staff-pt-status--pending";
    if (status === "confirmed") return "vc-staff-pt-status--confirmed";
    if (status === "denied") return "vc-staff-pt-status--denied";
    return "vc-staff-pt-status--logged";
  }

  function pmPuntiToltiSheetHtml() {
    return (
      '<div class="vc-staff-pm-punti-tolti vc-no-sfx" data-pm-punti-tolti-host>' +
      '<p class="vc-staff-stat-sheet__hint">Carico cronologia…</p></div>'
    );
  }

  function renderPmPuntiToltiChronology(items, canReview) {
    var rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return (
        '<div class="vc-staff-pm-shop-spend__empty">' +
        "<p>Nessun punto tolto registrato ancora.</p></div>"
      );
    }
    return (
      '<ul class="vc-staff-pm-shop-spend__history vc-staff-pm-punti-tolti__list" data-pm-punti-tolti-list>' +
      rows
        .map(function (item) {
          var who = "";
          if (item.reporter && item.reporter.displayName) {
            who = "Segnalato da " + String(item.reporter.displayName);
          } else if (item.actor && item.actor.displayName) {
            who = "Rimosso da " + String(item.actor.displayName);
          }
          var links = "";
          if (item.messageLink) {
            links +=
              '<a class="vc-staff-pt-card__link" href="' +
              esc(item.messageLink) +
              '" target="_blank" rel="noopener noreferrer">Partnership</a>';
          }
          if (item.discordMessageUrl) {
            links +=
              '<a class="vc-staff-pt-card__link" href="' +
              esc(item.discordMessageUrl) +
              '" target="_blank" rel="noopener noreferrer">Messaggio</a>';
          }
          var actions = "";
          if (canReview && item.canReview && item.status === "pending" && item.messageId) {
            actions =
              '<div class="vc-staff-pt-card__actions">' +
              '<button type="button" class="vc-staff-pt-btn vc-staff-pt-btn--deny" data-pt-deny="' +
              esc(item.messageId) +
              '">Nega</button>' +
              '<button type="button" class="vc-staff-pt-btn vc-staff-pt-btn--ok" data-pt-confirm="' +
              esc(item.messageId) +
              '">Conferma</button></div>';
          }
          return (
            '<li class="vc-staff-pm-shop-spend__row' +
            (item.status === "pending" ? " is-pending" : "") +
            '">' +
            '<div class="vc-staff-pm-shop-spend__row-main">' +
            '<div class="vc-staff-pm-punti-tolti__head">' +
            "<strong>" +
            esc(item.rule || "Punto tolto") +
            '</strong><span class="vc-staff-pt-status ' +
            ptStatusClass(item.status) +
            '">' +
            esc(ptStatusLabel(item.status)) +
            "</span></div>" +
            '<span class="vc-staff-pm-shop-spend__meta">' +
            esc(formatShopRedeemWhen(item.createdAt)) +
            (who ? " \u00B7 " + esc(who) : "") +
            (item.invite ? " \u00B7 " + esc(String(item.invite)) : "") +
            "</span>" +
            (links ? '<div class="vc-staff-pt-card__links">' + links + "</div>" : "") +
            actions +
            "</div></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function wirePmPuntiToltiSheet(wrap) {
    if (!wrap || wrap.__vcPtWired) return;
    wrap.__vcPtWired = true;
    wrap.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var conf = t.closest("[data-pt-confirm]");
      var deny = t.closest("[data-pt-deny]");
      var btn = conf || deny;
      if (!btn || !wrap.contains(btn)) return;
      ev.preventDefault();
      ev.stopPropagation();
      if (btn.disabled || wrap.__vcPtBusy) return;
      var messageId = String(
        btn.getAttribute(conf ? "data-pt-confirm" : "data-pt-deny") || "",
      ).trim();
      if (!messageId) return;
      var action = conf ? "confirm" : "deny";
      wrap.__vcPtBusy = true;
      btn.disabled = true;
      postPmPuntiToltiReview(messageId, action)
        .then(function (out) {
          wrap.__vcPtBusy = false;
          if (!wrap.isConnected) return;
          if (!out.res.ok || !out.data || !out.data.ok) {
            try {
              if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
                global.VcSiteToast.show(
                  (out.data && out.data.message) || "Operazione non riuscita.",
                  true,
                );
              }
            } catch (eT) {}
            btn.disabled = false;
            return;
          }
          loadPmPuntiToltiIntoSheet(wrap);
        })
        .catch(function () {
          wrap.__vcPtBusy = false;
          btn.disabled = false;
        });
    });
  }

  function loadPmPuntiToltiIntoSheet(wrap) {
    if (!wrap) return;
    var payload = wrap.__vcStatPayload || {};
    var uid = targetUserIdFromPayload(payload);
    var host = wrap.querySelector("[data-pm-punti-tolti-host]");
    if (!host) return;
    if (!/^\d{17,20}$/.test(uid)) {
      host.innerHTML =
        '<p class="vc-staff-stat-sheet__hint is-error">Profilo non valido.</p>';
      return;
    }
    host.innerHTML = '<p class="vc-staff-stat-sheet__hint">Carico cronologia…</p>';
    fetchPmPuntiTolti(uid)
      .then(function (out) {
        if (!wrap.isConnected) return;
        var hostEl = wrap.querySelector("[data-pm-punti-tolti-host]");
        if (!hostEl) return;
        if (!out.res.ok || !out.data || !out.data.ok) {
          hostEl.innerHTML =
            '<p class="vc-staff-stat-sheet__hint is-error">' +
            esc((out.data && out.data.message) || "Cronologia non disponibile.") +
            "</p>";
          return;
        }
        hostEl.innerHTML = renderPmPuntiToltiChronology(
          out.data.items || [],
          Boolean(out.data.canReview),
        );
        wirePmPuntiToltiSheet(wrap);
      })
      .catch(function () {
        if (!wrap.isConnected) return;
        var hostEl2 = wrap.querySelector("[data-pm-punti-tolti-host]");
        if (hostEl2) {
          hostEl2.innerHTML =
            '<p class="vc-staff-stat-sheet__hint is-error">Errore nel caricamento.</p>';
        }
      });
  }

  function workflowsApiBase() {
    var T = global.VCStaffTools;
    var c = global.__VC_STAFF_WORKFLOWS || {};
    if (T && typeof T.resolveApiUrl === "function") {
      return T.resolveApiUrl(c, "/webhooks/site-staff-workflows");
    }
    var base = String(c.apiUrl || "/webhooks/site-staff-workflows").trim();
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-workflows";
    return base;
  }

  /* resoInboxUi1: stesso sheet UI dell'inbox (hero/tip/costanza/forge), + freccia settimana/traccia */
  function formatResoVoiceHours(sec) {
    var s = Math.max(0, Number(sec) || 0);
    if (!s) return "0h";
    var h = s / 3600;
    if (h >= 10) return h.toFixed(1).replace(/\.0$/, "") + "h";
    return h.toFixed(2).replace(/0+$/, "").replace(/\.$/, "") + "h";
  }

  function formatHoursLimit(h) {
    var n = Number(h);
    if (!Number.isFinite(n)) return "—";
    if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n));
    return String(n).replace(".", ",");
  }

  var RESOCONTO_ROLE_LIMITS = {
    "1442568904311570555": { label: "Helper", messages: 400, hours: 4, sanctions: 1 },
    "1442568901887000618": { label: "Mod", messages: 500, hours: 5, sanctions: 2 },
    "1544831236868931636": { label: "Senior Moderator", messages: 600, hours: 6, sanctions: 2 },
    "1502322782602530977": { label: "Director", messages: 550, hours: 5.5, sanctions: 1 },
    "1544831242510270464": { label: "Partner Manager", messages: 0, hours: 0, sanctions: 0 },
    "1442568910070349985": { label: "Staff", messages: 0, hours: 0, sanctions: 0 },
  };

  function resoTipHtml(text) {
    var tip = String(text || "").trim();
    if (!tip) return "";
    return (
      '<span class="vc-staff-reso-tip">' +
      '<button type="button" class="vc-staff-reso-tip__btn" aria-label="Info">i</button>' +
      '<span class="vc-staff-reso-tip__pop" role="tooltip">' +
      esc(tip) +
      "</span></span>"
    );
  }

  function resocontoRoleLimits(item) {
    var wfLimits =
      item && item.activityLimits && typeof item.activityLimits === "object"
        ? item.activityLimits
        : null;
    var byId = RESOCONTO_ROLE_LIMITS[String((item && item.roleId) || "")] || null;
    var label =
      String((item && item.roleLabel) || "").trim() ||
      (byId && byId.label) ||
      "questo ruolo";
    var messages =
      wfLimits && wfLimits.messages != null
        ? Number(wfLimits.messages)
        : byId
          ? byId.messages
          : null;
    var hours =
      wfLimits && wfLimits.hours != null ? Number(wfLimits.hours) : byId ? byId.hours : null;
    var sanctions =
      item && item.sanctionLimit != null && Number.isFinite(Number(item.sanctionLimit))
        ? Number(item.sanctionLimit)
        : byId
          ? byId.sanctions
          : null;
    return { label: label, messages: messages, hours: hours, sanctions: sanctions };
  }

  function pickResoItem(items, track, focusId) {
    var rows = Array.isArray(items) ? items : [];
    if (!rows.length) return null;
    var fid = String(focusId || "").trim();
    if (fid) {
      var byFocus = rows.find(function (it) {
        if (!it) return false;
        var mid = String(it.messageId || "").trim();
        var rid = String(it.recordId || it.id || "").trim();
        var dk = String(it.dedupeKey || "").trim();
        if (mid && mid === fid) return true;
        if (rid && rid === fid) return true;
        if (dk && (dk === fid || dk.indexOf(fid) >= 0)) return true;
        if (fid.indexOf(mid) >= 0 && mid) return true;
        return false;
      });
      if (byFocus) return byFocus;
    }
    var want = String(track || "").toLowerCase();
    if (want === "p" || want === "pm") {
      return (
        rows.find(function (it) {
          return String(it.kind || "").toLowerCase() === "p";
        }) || null
      );
    }
    if (want === "s" || want === "staff") {
      return (
        rows.find(function (it) {
          return String(it.kind || "").toLowerCase() === "s";
        }) ||
        rows.find(function (it) {
          return String(it.kind || "").toLowerCase() !== "p";
        }) ||
        null
      );
    }
    return rows[0];
  }

  function availableResoTracks(items) {
    var hasS = false;
    var hasP = false;
    (Array.isArray(items) ? items : []).forEach(function (it) {
      var k = String(it.kind || "").toLowerCase();
      if (k === "p") hasP = true;
      else hasS = true;
    });
    return { staff: hasS, pm: hasP, dual: hasS && hasP };
  }

  function niceChartCeil(value, kind) {
    var v = Math.max(0, Number(value) || 0);
    if (kind === "voice") {
      var paddedV = Math.max(v * 1.55, v + 0.45, 2.5);
      return Math.ceil(paddedV * 4) / 4;
    }
    var padded = Math.max(v * 1.45, v + 18, 50);
    if (padded <= 80) return Math.ceil(padded / 10) * 10;
    if (padded <= 200) return Math.ceil(padded / 25) * 25;
    return Math.ceil(padded / 50) * 50;
  }

  function weekdayShortFromDayKey(dayKey) {
    try {
      var parts = String(dayKey || "").split("-");
      if (parts.length !== 3) return "—";
      var dt = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12));
      return dt.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
    } catch (e) {
      return "—";
    }
  }

  function renderProfileCostanzaChart(chart) {
    var points = Array.isArray(chart)
      ? chart
          .slice()
          .sort(function (a, b) {
            return String(a.dayKey || "").localeCompare(String(b.dayKey || ""));
          })
          .slice(-7)
      : [];
    if (!points.length) {
      return (
        '<div class="vc-staff-reso-chart vc-staff-reso-chart--empty">' +
        "<p>Costanza non disponibile per questo resoconto.</p></div>"
      );
    }
    var maxMsgRaw = 0;
    var maxVoiceRaw = 0;
    points.forEach(function (p) {
      maxMsgRaw = Math.max(maxMsgRaw, Number(p.text) || 0);
      maxVoiceRaw = Math.max(maxVoiceRaw, (Number(p.voiceSeconds) || 0) / 3600);
    });
    var maxMsg = niceChartCeil(maxMsgRaw, "msg");
    var maxVoiceH = niceChartCeil(maxVoiceRaw, "voice");
    var bars = points
      .map(function (p) {
        var msg = Math.max(0, Number(p.text) || 0);
        var voiceH = Math.max(0, (Number(p.voiceSeconds) || 0) / 3600);
        var msgPct = msg > 0 ? Math.max(3, Math.round((100 * msg) / maxMsg)) : 0;
        var voicePct = voiceH > 0.004 ? Math.max(3, Math.round((100 * voiceH) / maxVoiceH)) : 0;
        var label = weekdayShortFromDayKey(p.dayKey);
        var dayNum = String(p.dayKey || "").slice(8, 10);
        var voiceLabel = formatResoVoiceHours(p.voiceSeconds);
        return (
          '<div class="vc-staff-reso-chart__col" title="' +
          esc(label + " " + dayNum + " \u00B7 " + msg + " msg \u00B7 " + voiceLabel) +
          '">' +
          '<div class="vc-staff-reso-chart__pair">' +
          '<div class="vc-staff-reso-chart__slot">' +
          '<span class="vc-staff-reso-chart__val vc-staff-reso-chart__val--msg' +
          (msg > 0 ? "" : " is-empty") +
          '">' +
          esc(msg > 0 ? String(msg) : "0") +
          "</span>" +
          '<div class="vc-staff-reso-chart__track">' +
          '<span class="vc-staff-reso-chart__bar vc-staff-reso-chart__bar--msg" style="height:' +
          msgPct +
          '%"></span></div></div>' +
          '<div class="vc-staff-reso-chart__slot">' +
          '<span class="vc-staff-reso-chart__val vc-staff-reso-chart__val--voice' +
          (voiceH > 0.004 ? "" : " is-empty") +
          '">' +
          esc(voiceH > 0.004 ? voiceLabel : "0h") +
          "</span>" +
          '<div class="vc-staff-reso-chart__track">' +
          '<span class="vc-staff-reso-chart__bar vc-staff-reso-chart__bar--voice" style="height:' +
          voicePct +
          '%"></span></div></div></div>' +
          '<div class="vc-staff-reso-chart__day"><b>' +
          esc(label) +
          "</b><span>" +
          esc(dayNum) +
          "</span></div></div>"
        );
      })
      .join("");
    var active = points.filter(function (p) {
      return (Number(p.text) || 0) > 0 || (Number(p.voiceSeconds) || 0) >= 600;
    }).length;
    return (
      '<section class="vc-staff-reso-section vc-staff-reso-section--chart">' +
      '<div class="vc-staff-reso-section__head">' +
      "<h3>Costanza</h3>" +
      '<span class="vc-staff-reso-pill">' +
      esc(String(active) + "/" + String(points.length) + " giorni attivi") +
      "</span></div>" +
      '<div class="vc-staff-reso-chart__legend">' +
      '<span><i class="vc-staff-reso-chart__swatch vc-staff-reso-chart__swatch--msg"></i> Messaggi</span>' +
      '<span><i class="vc-staff-reso-chart__swatch vc-staff-reso-chart__swatch--voice"></i> Ore in voc</span>' +
      "</div>" +
      '<div class="vc-staff-reso-chart" role="img" aria-label="Grafico costanza messaggi e ore vocali">' +
      bars +
      "</div></section>"
    );
  }

  function splitAutoValutazioneParts(azione) {
    var raw = String(azione || "").trim();
    if (!raw || /^—$|^-$|^nulla$/i.test(raw)) return [];
    return raw
      .split(/\s*\+\s*/)
      .map(function (part) {
        return String(part || "").trim();
      })
      .filter(Boolean);
  }

  function renderPmEsitoBox(azione) {
    var raw = String(azione || "").trim() || "Nulla";
    raw = String(raw)
      .replace(/(?:^|\s*)nulla(?:\s*[+—–-]\s*nulla)+/gi, "Nulla")
      .replace(/\s{2,}/g, " ")
      .trim();
    var label = "Nulla";
    var hint =
      "Esito automatico Partner Manager: sotto 30 partner → Richiamo; sotto soglia critica → Depex; altrimenti Nulla (o promozione in finestra).";
    if (/^depex\b/i.test(raw) || /\bdepex\b/i.test(raw)) label = "Depex";
    else if (/^richiamo\b/i.test(raw) || /\brichiamo\b/i.test(raw)) label = "Richiamo";
    else if (/^pex\b/i.test(raw) || /\bpex\b/i.test(raw)) label = "Pex";
    else if (/^nulla\b/i.test(raw) || /^—$|^-$/i.test(raw)) label = "Nulla";
    else label = raw.slice(0, 64) || "Nulla";
    return (
      '<article id="vc-staff-reso-auto-box" class="vc-staff-reso-grade vc-staff-reso-grade--action vc-staff-reso-grade--wide vc-staff-reso-auto vc-staff-reso-auto--pm">' +
      '<div class="vc-staff-reso-grade__head"><span>Esito proposto</span>' +
      resoTipHtml(hint) +
      "</div>" +
      '<p class="vc-staff-reso-auto__pm-outcome"><strong>' +
      esc(label) +
      "</strong></p></article>"
    );
  }

  function renderAutoValutazioniBox(item, isPm) {
    var azione = String(item.azioneDisplay || item.proposedLabel || "").trim() || "—";
    if (isPm) return renderPmEsitoBox(azione);
    var parts = splitAutoValutazioneParts(azione);
    if (!parts.length && azione && !/^—$/.test(azione)) parts = [azione];
    var autoTip =
      "Proposte automatiche da attività/condotta, limiti, pause e compito sanzioni. Conferma o rifiuta sotto.";
    var rows =
      parts.length > 0
        ? parts
            .map(function (part) {
              var isNeg = /valutazione negativa/i.test(part);
              var isCompito = /compito sanzioni/i.test(part);
              var isPos = /valutazione positiva/i.test(part) || isCompito;
              var tone = isNeg ? "is-neg" : isPos ? "is-pos" : "is-neutral";
              var title = isNeg
                ? "Valutazione negativa"
                : isCompito
                  ? "Compito sanzioni"
                  : isPos
                    ? "Valutazione positiva"
                    : /^nulla\b/i.test(part)
                      ? "Nulla"
                      : /^richiamo\b/i.test(part)
                        ? "Richiamo"
                        : /^depex\b/i.test(part)
                          ? "Depex"
                          : "Esito";
              var already = /gi[aà]\s*registrat/i.test(part);
              var detail = String(part || "")
                .replace(/^Valutazione (Positiva|Negativa)\s*[—–-]?\s*/i, "")
                .replace(/\(\s*gi[aà]\s*registrat[aoe]?\s*\)/gi, "")
                .replace(/\bgi[aà]\s*registrat[aoe]?\b/gi, "")
                .replace(/\s{2,}/g, " ")
                .trim();
              if (!detail || detail.toLowerCase() === title.toLowerCase()) {
                return (
                  '<li class="vc-staff-reso-auto__item ' +
                  tone +
                  ' is-simple"><strong>' +
                  esc(title) +
                  "</strong>" +
                  (already
                    ? '<span class="vc-staff-reso-flag vc-staff-reso-flag--done">già registrata</span>'
                    : "") +
                  "</li>"
                );
              }
              return (
                '<li class="vc-staff-reso-auto__item ' +
                tone +
                '"><span class="vc-staff-reso-auto__kind">' +
                esc(title) +
                (already
                  ? '<span class="vc-staff-reso-flag vc-staff-reso-flag--done">già registrata</span>'
                  : "") +
                "</span><strong>" +
                esc(detail) +
                "</strong></li>"
              );
            })
            .join("")
        : '<li class="vc-staff-reso-auto__item is-neutral is-simple"><strong>Nulla</strong></li>';
    return (
      '<article id="vc-staff-reso-auto-box" class="vc-staff-reso-grade vc-staff-reso-grade--action vc-staff-reso-grade--wide vc-staff-reso-auto">' +
      '<div class="vc-staff-reso-grade__head"><span>Valutazioni automatiche</span>' +
      resoTipHtml(autoTip) +
      "</div>" +
      '<ul class="vc-staff-reso-auto__list">' +
      rows +
      "</ul></article>"
    );
  }

  function resolveResoDecisionVerb(item) {
    var status = String((item && item.status) || "").toLowerCase();
    var actionKey = String((item && (item.actionKey || item.workflowActionKey)) || "")
      .trim()
      .toLowerCase();
    var byKey = {
      vp: "Valutazione positiva",
      vn: "Valutazione negativa",
      nl: "Nulla",
      px: "Pex",
      dp: "Depex",
      rc: "Richiamo",
      batch: "Azioni multiple",
    };
    if (byKey[actionKey]) return byKey[actionKey];
    var statusLabel = String((item && item.statusLabel) || "").trim();
    if (statusLabel && !/^(accettata|rifiutata|annullata|gestita|chiusa|in attesa)$/i.test(statusLabel)) {
      return statusLabel;
    }
    if (status === "rejected") return "Rifiutata";
    if (status === "accepted") return "Accettata";
    if (status === "cancelled") return "Annullata";
    return "Gestita";
  }

  function renderProfileResoDecisionMeta(item) {
    if (!item || item.canAct) return "";
    var status = String(item.status || "").toLowerCase();
    if (status === "pending") return "";
    var by = String(
      (item.decidedBy && (item.decidedBy.displayName || item.decidedBy.username)) ||
        item.decidedByLabel ||
        item.decidedByName ||
        "",
    ).trim();
    var when = "";
    try {
      if (item.decidedAt) {
        when = new Date(item.decidedAt).toLocaleString("it-IT", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    } catch (eWhen) {}
    if (!by && !when) return "";
    /* resoDecisionVerb1: Depex/Richiamo/… non “Accettata” solo perché status=accepted */
    var verb = resolveResoDecisionVerb(item);
    var heading = by ? verb + " da " + by : verb;
    return (
      '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa vc-staff-inbox-detail__field--decision"><h4>' +
      esc(heading) +
      "</h4>" +
      (when ? "<p>" + esc(when) + "</p>" : "") +
      "</div>"
    );
  }

  function renderProfileResoRolesChrono(item, payload) {
    /* careerKeepPmHistory2: stessa finestra di Carriera — preferisci career.rolesHistory
       (già slice lato profilo), non la cronologia grezza del workflow. */
    var careerHist =
      payload &&
      payload.career &&
      Array.isArray(payload.career.rolesHistory) &&
      payload.career.rolesHistory.length
        ? payload.career.rolesHistory
        : null;
    var raw =
      careerHist ||
      (item && Array.isArray(item.rolesHistory) && item.rolesHistory) ||
      (payload && Array.isArray(payload.rolesHistory) && payload.rolesHistory) ||
      [];
    if (!raw.length) return "";
    var role = (payload && payload.role) || {};
    var roleKind = String(role.kind || "").toLowerCase();
    var currentCareerRole =
      (payload && payload.career && payload.career.currentRole) ||
      (roleKind === "pm_only" ? "Partner Manager" : "") ||
      (role && role.label) ||
      (item && item.roleLabel) ||
      "";
    var track =
      roleKind === "pm_only" || String((item && item.kind) || "").toLowerCase() === "p"
        ? "pm"
        : "staff";
    var rows = dedupeCareerRows(
      sliceToLatestCareer(raw, {
        stillActive: true,
        currentRole: currentCareerRole,
        track: track,
      }),
    ).slice(0, 12);
    if (!rows.length) return "";
    var items = rows
      .map(function (row) {
        var to = String(row.to || row.newRole || row.role || "").trim();
        var from = String(row.from || row.oldRole || "").trim();
        if (/^\d{16,22}$/.test(to)) to = "";
        if (/^\d{16,22}$/.test(from)) from = "";
        if (!to && !from) return "";
        var when = String(row.dateLabel || "").trim();
        var label = to ? (from ? from + " → " + to : to) : from;
        return (
          "<li><span class=\"vc-staff-reso-hero__role-name\">" +
          esc(label) +
          "</span>" +
          (when ? '<span class="vc-staff-reso-hero__role-date">' + esc(when) + "</span>" : "") +
          "</li>"
        );
      })
      .filter(Boolean)
      .join("");
    if (!items) return "";
    return (
      '<div class="vc-staff-reso-hero__roles" aria-label="Cronologia ruoli">' +
      '<p class="vc-staff-reso-hero__roles-kicker">Cronologia ruoli</p>' +
      '<ul class="vc-staff-reso-hero__roles-list">' +
      items +
      "</ul></div>"
    );
  }

  function profileResoAvatarHtml(payload, item) {
    var id = (payload && payload.identity) || {};
    var uid = String((item && item.userId) || targetUserIdFromPayload(payload) || "").trim();
    var url = String((item && item.avatarUrl) || resolveProfileAvatarUrl(id) || id.avatarUrl || "").trim();
    if (global.VCStaffTools && typeof global.VCStaffTools.avatarImgHtml === "function") {
      return global.VCStaffTools.avatarImgHtml(url, uid, { width: 64, height: 64 });
    }
    if (url) {
      return (
        '<img src="' +
        esc(url) +
        '" alt="" width="64" height="64" loading="eager" data-vc-avatar="1" data-user-id="' +
        esc(uid) +
        '" />'
      );
    }
    return '<span class="vc-staff-avatar-fallback"><i class="fa fa-user" aria-hidden="true"></i></span>';
  }

  function profileResoActionButtons(item) {
    if (!item || !item.canAct) return "";
    var mid = esc(item.messageId || "");
    var uid = esc(item.userId || "");
    var kind = esc(item.kind || "");
    var roleId = esc(item.roleId || "");
    var actionKey = esc(item.actionKey || "");
    var isPm = String(item.kind || "").toLowerCase() === "p";
    var attrs =
      ' data-message-id="' +
      mid +
      '" data-user-id="' +
      uid +
      '" data-kind="' +
      kind +
      '" data-role-id="' +
      roleId +
      '" data-action-key="' +
      actionKey +
      '"';
    var alts = isPm
      ? [
          { key: "rc", label: "Richiamo", reason: "" },
          { key: "dp", label: "Depex", reason: "" },
        ]
      : [
          {
            key: "vp",
            label: "Valutazione positiva \u00B7 limiti raggiunti",
            reason: "Limiti settimanali completati.",
          },
          {
            key: "vp",
            label: "Valutazione positiva \u00B7 limiti doppi",
            reason: "Limiti settimanali superati almeno del doppio.",
          },
          {
            key: "vn",
            label: "Valutazione negativa \u00B7 limiti non raggiunti",
            reason: "Limiti settimanali non raggiunti.",
          },
          {
            key: "vp",
            label: "Valutazione positiva \u00B7 compito sanzioni",
            reason: "Compito sanzioni completato.",
          },
          {
            key: "vp",
            label: "Valutazione positiva \u00B7 griglia",
            reason: "Valutazione positiva da griglia attività/condotta.",
          },
          {
            key: "vn",
            label: "Valutazione negativa \u00B7 griglia",
            reason: "Valutazione negativa da griglia attività/condotta.",
          },
          { key: "nl", label: "Nulla", reason: "" },
        ];
    return (
      '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--resoconti vc-staff-inbox-actions--forge" data-reso-actions="1">' +
      '<p class="vc-staff-inbox-actions__hint">' +
      esc(
        isPm
          ? "Conferma l’esito automatico oppure rifiuta per scegliere Richiamo o Depex."
          : "Conferma le valutazioni automatiche oppure rifiuta per sceglierne altre.",
      ) +
      "</p>" +
      '<div class="vc-staff-rank-forge__rail vc-staff-inbox-actions__decide vc-staff-inbox-actions__decide--pair">' +
      '<button type="button" class="vc-staff-rank-forge__card is-up vc-staff-inbox-btn--confirm" data-reso-act="accept"' +
      attrs +
      ">" +
      '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
      '<span class="vc-staff-rank-forge__name">Conferma</span>' +
      '<span class="vc-staff-rank-forge__hint">' +
      esc(isPm ? "Applica l’esito proposto" : "Conferma le proposte automatiche") +
      "</span></button>" +
      '<button type="button" class="vc-staff-rank-forge__card is-down" data-reso-reject-ui="1"' +
      attrs +
      ">" +
      '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-times"></i></span>' +
      '<span class="vc-staff-rank-forge__name">Rifiuta</span>' +
      '<span class="vc-staff-rank-forge__hint">' +
      esc(isPm ? "Scegli Richiamo o Depex" : "Scegli un’altra valutazione") +
      "</span></button>" +
      "</div>" +
      '<div class="vc-staff-inbox-alt vc-staff-inbox-alt--reso" hidden data-reso-alts="1" aria-label="Valutazioni alternative">' +
      '<span class="vc-staff-inbox-alt__label">' +
      esc(isPm ? "Scegli azione" : "Valutazioni alternative") +
      "</span>" +
      '<div class="vc-staff-inbox-alt__pills">' +
      alts
        .map(function (alt) {
          return (
            '<button type="button" class="vc-staff-inbox-btn vc-staff-inbox-btn--alt" data-reso-act="accept" data-override-key="' +
            esc(alt.key) +
            '"' +
            (alt.reason ? ' data-reason="' + esc(alt.reason) + '"' : "") +
            attrs +
            ">" +
            esc(alt.label) +
            "</button>"
          );
        })
        .join("") +
      "</div></div></div>"
    );
  }

  function renderProfileResoToolbar(state) {
    var weeks = Array.isArray(state.weeks) ? state.weeks : [];
    var weekIdx = -1;
    weeks.forEach(function (w, i) {
      if (String(w.weekKey || "") === String(state.week || "")) weekIdx = i;
    });
    var item = pickResoItem(state.items, state.track);
    var weekLabel =
      (item && item.weekLabel) ||
      (weekIdx >= 0 && weeks[weekIdx] && weeks[weekIdx].label) ||
      state.week ||
      "—";
    var tracks = availableResoTracks(state.items);
    var html =
      '<div class="vc-staff-profile-reso__toolbar" data-profile-reso-toolbar="1">' +
      '<div class="vc-staff-profile-reso__week">' +
      '<button type="button" class="vc-staff-profile-reso__nav" data-reso-week="-1" aria-label="Settimana precedente"' +
      (weekIdx < 0 || weekIdx >= weeks.length - 1 ? " disabled" : "") +
      ">\u2039</button>" +
      '<span class="vc-staff-profile-reso__week-label">' +
      esc(weekLabel) +
      "</span>" +
      '<button type="button" class="vc-staff-profile-reso__nav" data-reso-week="1" aria-label="Settimana successiva"' +
      (weekIdx <= 0 ? " disabled" : "") +
      ">\u203A</button></div>";
    if (tracks.dual) {
      var isPm = String(state.track || "").toLowerCase() === "p";
      html +=
        '<div class="vc-staff-profile-reso__track">' +
        '<button type="button" class="vc-staff-profile-reso__nav" data-reso-track="prev" aria-label="Cambia traccia">\u2039</button>' +
        '<span class="vc-staff-profile-reso__track-label">' +
        (isPm ? "Partner Manager" : "Staff") +
        "</span>" +
        '<button type="button" class="vc-staff-profile-reso__nav" data-reso-track="next" aria-label="Cambia traccia">\u203A</button></div>';
    }
    html += "</div>";
    return html;
  }

  function renderProfileResoInboxBody(state, payload) {
    var item = pickResoItem(state.items, state.track);
    if (!item) {
      return (
        renderProfileResoToolbar(state) +
        '<div class="vc-staff-pm-shop-spend__empty"><p>Nessun resoconto per questa settimana.</p></div>'
      );
    }
    var isPm = String(item.kind || "").toLowerCase() === "p";
    var kindLabel = isPm ? "Partner Manager" : "Staff";
    var limits = resocontoRoleLimits(item);
    var id = (payload && payload.identity) || {};
    var displayName =
      String(item.displayName || id.displayName || id.username || "Resoconto").trim() || "Resoconto";
    /* resoRolePrecise1: "Staff" generico non batte il ruolo da roleId (Helper/Mod/…) */
    var roleLabel = String(item.roleLabel || "").trim();
    if (!roleLabel || /^(staff)$/i.test(roleLabel)) {
      roleLabel =
        (RESOCONTO_ROLE_LIMITS[String(item.roleId || "")] &&
          RESOCONTO_ROLE_LIMITS[String(item.roleId || "")].label) ||
        "";
    }
    if (!roleLabel) roleLabel = kindLabel;
    var msgTip =
      limits.messages != null
        ? "Limite settimanale " +
          limits.label +
          ": " +
          limits.messages +
          " messaggi. Scambio ammesso: 100 msg ↔ 1 ora vocale."
        : isPm
          ? "I Partner Manager non hanno limite messaggi settimanale."
          : "Nessun limite messaggi per questo ruolo.";
    var oreTip =
      limits.hours != null
        ? "Limite settimanale " +
          limits.label +
          ": " +
          formatHoursLimit(limits.hours) +
          " ore in vocale. Scambio ammesso: 100 msg ↔ 1 ora."
        : isPm
          ? "I Partner Manager non hanno limite ore vocali settimanale."
          : "Nessun limite ore vocali per questo ruolo.";
    var sanzTip =
      limits.sanctions != null
        ? "Minimo settimanale " +
          limits.label +
          ": " +
          limits.sanctions +
          " sanzioni applicate (warn/mute/kick/ban)."
        : "Nessun minimo sanzioni per questo ruolo.";
    var partnerTip = "Minimo settimanale Partner Manager: 30 partner.";
    var activityTip =
      limits.messages != null
        ? "Attività su limiti " +
          limits.label +
          " (" +
          limits.messages +
          " msg / " +
          formatHoursLimit(limits.hours) +
          "h, scambio 100↔1h): Sufficiente = 1×; Discreto = +150 msg/+1,5h; Buono = 2×; Ottimo = 2×+300/+2h; Eccellente = 3×."
        : "Ruolo senza griglia messaggi/vocale: Attività = Nessun limite.";
    var conductTip =
      "Condotta da valutazioni ±: Ottimo ≥3 positive e 0 negative; Discreto se positive > negative; Sufficiente se pari o nessuna; Insufficiente se negative > positive; Non classificato se solo negative.";

    var stats;
    var gradeCards;
    if (isPm) {
      stats =
        '<div class="vc-staff-reso-stats vc-staff-reso-stats--pm">' +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Partner</span>' +
        resoTipHtml(partnerTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        esc(item.weeklyPartners != null ? String(item.weeklyPartners) : "—") +
        "</strong></div></div>" +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Minimo</span>' +
        resoTipHtml(partnerTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>30</strong></div></div></div>';
      gradeCards =
        '<div class="vc-staff-reso-grades vc-staff-reso-grades--pm">' +
        renderAutoValutazioniBox(item, true) +
        "</div>";
    } else {
      stats =
        '<div class="vc-staff-reso-stats">' +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Messaggi</span>' +
        resoTipHtml(msgTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        esc(item.weeklyMessages != null ? String(item.weeklyMessages) : "—") +
        "</strong></div></div>" +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Ore vocali</span>' +
        resoTipHtml(oreTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        esc(formatResoVoiceHours(item.weeklyVoiceSeconds)) +
        "</strong></div></div>" +
        '<div class="vc-staff-reso-stat"><div class="vc-staff-reso-stat__head"><span>Sanzioni</span>' +
        resoTipHtml(sanzTip) +
        '</div><div class="vc-staff-reso-stat__value"><strong>' +
        esc(item.weeklySanctions != null ? String(item.weeklySanctions) : "—") +
        "</strong></div></div></div>";
      gradeCards =
        '<div class="vc-staff-reso-grades">' +
        '<article class="vc-staff-reso-grade"><div class="vc-staff-reso-grade__head"><span>Attività</span>' +
        resoTipHtml(activityTip) +
        "</div><strong>" +
        esc(item.activityGrade || "—") +
        "</strong></article>" +
        '<article class="vc-staff-reso-grade"><div class="vc-staff-reso-grade__head"><span>Condotta</span>' +
        resoTipHtml(conductTip) +
        "</div><strong>" +
        esc(item.behaviorGrade || "—") +
        "</strong></article>" +
        renderAutoValutazioniBox(item, false) +
        "</div>";
    }

    var rolesChrono = renderProfileResoRolesChrono(item, payload);
    var statusLabel = String(item.statusLabel || item.status || "").trim();

    return (
      renderProfileResoToolbar(state) +
      '<div class="vc-staff-reso-hero vc-staff-reso-hero--reso' +
      (rolesChrono ? " has-roles" : "") +
      '">' +
      '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--lg">' +
      profileResoAvatarHtml(payload, item) +
      '</span><div class="vc-staff-reso-hero__main">' +
      '<h3 class="vc-staff-reso-hero__name">' +
      esc(displayName) +
      "</h3>" +
      '<p class="vc-staff-reso-hero__meta">' +
      esc(roleLabel) +
      (statusLabel ? " \u00B7 " + esc(statusLabel) : "") +
      "</p></div>" +
      rolesChrono +
      "</div>" +
      stats +
      (isPm ? "" : renderProfileCostanzaChart(item.costanzaChart)) +
      '<section class="vc-staff-reso-section"><div class="vc-staff-reso-section__head"><h3>' +
      (isPm ? "Esito" : "Valutazione") +
      "</h3></div>" +
      gradeCards +
      "</section>" +
      renderProfileResoDecisionMeta(item)
    );
  }

  function closeProfileResoSheet() {
    teardownPauseReviewChat();
    var sheet = global.document.getElementById("vc-staff-reso-sheet");
    var wasOpen = Boolean(
      sheet &&
        sheet.getAttribute("data-profile-reso") === "1" &&
        !sheet.hidden,
    );
    if (sheet && sheet.getAttribute("data-profile-reso") === "1") {
      try {
        sheet.classList.remove("is-in");
        sheet.hidden = true;
        sheet.setAttribute("hidden", "");
        sheet.style.setProperty("display", "none", "important");
      } catch (eHide) {}
      try {
        if (sheet.parentNode) sheet.parentNode.removeChild(sheet);
      } catch (eRm) {}
    }
    try {
      global.document.documentElement.classList.remove("vc-staff-reso-sheet-open");
    } catch (eCls) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcUnpinPageScroll === "function") global.__vcUnpinPageScroll();
    } catch (eUnpin) {}
    if (wasOpen) notifyProfileSheetClosed();
  }

  function ensureProfileResoSheet() {
    closeProfileResoSheet();
    var sheet = global.document.createElement("div");
    sheet.id = "vc-staff-reso-sheet";
    sheet.className = "vc-staff-reso-sheet is-reso-sheet";
    sheet.setAttribute("data-profile-reso", "1");
    sheet.setAttribute("data-reso-bound", "profileResoInboxUi1");
    sheet.hidden = true;
    sheet.innerHTML =
      '<button type="button" class="vc-staff-reso-sheet__backdrop" data-reso-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-staff-reso-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="vc-staff-reso-title">' +
      '<div class="vc-staff-reso-sheet__head">' +
      '<div><p class="vc-staff-reso-sheet__kicker">Resoconto</p>' +
      '<h2 id="vc-staff-reso-title" class="vc-staff-reso-sheet__title"></h2></div>' +
      '<button type="button" class="vc-staff-reso-sheet__close" data-reso-close="1" aria-label="Chiudi">\u2715</button>' +
      "</div>" +
      '<div class="vc-staff-reso-sheet__body" id="vc-staff-reso-body"></div>' +
      '<div class="vc-staff-reso-sheet__foot" id="vc-staff-reso-foot"></div>' +
      "</div>";
    global.document.body.appendChild(sheet);
    sheet.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-reso-close]")) {
        ev.preventDefault();
        closeProfileResoSheet();
        return;
      }
      var weekBtn = t.closest("[data-reso-week]");
      if (weekBtn && sheet.contains(weekBtn) && !weekBtn.disabled) {
        ev.preventDefault();
        var delta = Number(weekBtn.getAttribute("data-reso-week") || "0");
        var st = sheet.__vcResoState || {};
        var weeks = Array.isArray(st.weeks) ? st.weeks : [];
        var idx = -1;
        weeks.forEach(function (w, i) {
          if (String(w.weekKey || "") === String(st.week || "")) idx = i;
        });
        var next = idx + (delta < 0 ? 1 : -1);
        if (next < 0 || next >= weeks.length) return;
        loadProfileResocontoIntoSheet(sheet, { week: weeks[next].weekKey });
        return;
      }
      var trackBtn = t.closest("[data-reso-track]");
      if (trackBtn && sheet.contains(trackBtn)) {
        ev.preventDefault();
        var st2 = sheet.__vcResoState || {};
        st2.track = String(st2.track || "s").toLowerCase() === "p" ? "s" : "p";
        sheet.__vcResoState = st2;
        paintProfileReso(sheet);
        return;
      }
      var rejectUi = t.closest("[data-reso-reject-ui]");
      if (rejectUi && sheet.contains(rejectUi)) {
        ev.preventDefault();
        var alts = sheet.querySelector("[data-reso-alts]");
        if (alts) {
          alts.hidden = false;
          alts.removeAttribute("hidden");
        }
        var actions = sheet.querySelector("[data-reso-actions]");
        if (actions) actions.classList.add("is-rejected-plan");
        rejectUi.disabled = true;
        rejectUi.setAttribute("aria-pressed", "true");
        var box = sheet.querySelector("#vc-staff-reso-auto-box");
        if (box) {
          box.classList.add("is-cleared");
          var list = box.querySelector(".vc-staff-reso-auto__list");
          if (list) {
            list.innerHTML =
              '<p class="vc-staff-reso-auto__empty">Esito automatico annullato. Scegli un’opzione sotto.</p>';
          }
        }
        return;
      }
      var actBtn = t.closest("[data-reso-act]");
      if (!actBtn || !sheet.contains(actBtn) || actBtn.disabled) return;
      ev.preventDefault();
      if (sheet.__vcResoBusy) return;
      var action = String(actBtn.getAttribute("data-reso-act") || "");
      var messageId = String(actBtn.getAttribute("data-message-id") || "").trim();
      var userId = String(actBtn.getAttribute("data-user-id") || "").trim();
      var kind = String(actBtn.getAttribute("data-kind") || "s").trim();
      if (!messageId || !userId || (action !== "accept" && action !== "reject")) return;
      sheet.__vcResoBusy = true;
      actBtn.disabled = true;
      var body = {
        action: action,
        messageId: messageId,
        userId: userId,
        kind: kind,
        roleId: String(actBtn.getAttribute("data-role-id") || ""),
        actionKey: String(actBtn.getAttribute("data-action-key") || ""),
      };
      var override = String(actBtn.getAttribute("data-override-key") || "").trim();
      if (override) body.overrideActionKey = override;
      var reason = String(actBtn.getAttribute("data-reason") || "").trim();
      if (reason) body.reason = reason;
      postProfileResoDecide(body)
        .then(function (out) {
          sheet.__vcResoBusy = false;
          if (!sheet.isConnected) return;
          if (!out.res.ok || !out.data || !out.data.ok) {
            try {
              if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
                global.VcSiteToast.show(
                  (out.data && out.data.message) || "Operazione non riuscita.",
                  true,
                );
              }
            } catch (eT) {}
            actBtn.disabled = false;
            return;
          }
          try {
            /* resoPendBadge1: togli subito il badge; paint successivo ricalcola dai pending reali */
            syncResoPendingBadge(sheet, 0);
          } catch (eSync) {}
          loadProfileResocontoIntoSheet(sheet, {});
        })
        .catch(function () {
          sheet.__vcResoBusy = false;
          actBtn.disabled = false;
        });
    });
    global.document.addEventListener(
      "keydown",
      function onEsc(ev) {
        if (ev.key !== "Escape") return;
        if (!sheet.isConnected || sheet.hidden) return;
        ev.preventDefault();
        closeProfileResoSheet();
        global.document.removeEventListener("keydown", onEsc, true);
      },
      true,
    );
    return sheet;
  }

  function openProfileResoSheet(payload, root, opts) {
    opts = opts || {};
    closeStatSheet();
    var sheet = ensureProfileResoSheet();
    sheet.__vcStatPayload = payload;
    sheet.__vcStatRoot = root;
    sheet.__vcStatKind = "resoconto";
    sheet.__vcFocusResoId = String(opts.focusId || "").trim();
    sheet.hidden = false;
    try {
      sheet.removeAttribute("hidden");
      sheet.style.removeProperty("display");
      sheet.style.removeProperty("pointer-events");
    } catch (eSt) {}
    try {
      global.document.documentElement.classList.add("vc-staff-reso-sheet-open");
    } catch (eCls) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcPinPageScroll === "function") global.__vcPinPageScroll();
    } catch (ePin) {}
    unlockSheetPageChrome();
    global.requestAnimationFrame(function () {
      try {
        sheet.classList.add("is-in");
      } catch (eIn) {}
    });
    var body = sheet.querySelector("#vc-staff-reso-body");
    if (body) body.innerHTML = '<p class="vc-staff-stat-sheet__hint">Carico resoconto…</p>';
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    if (foot) foot.innerHTML = "";
    loadProfileResocontoIntoSheet(sheet, { focusId: sheet.__vcFocusResoId });
  }

  function paintProfileReso(sheet) {
    if (!sheet || !sheet.__vcResoState) return;
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    var kicker = sheet.querySelector(".vc-staff-reso-sheet__kicker");
    var item = pickResoItem(
      sheet.__vcResoState.items,
      sheet.__vcResoState.track,
      sheet.__vcFocusResoId || sheet.__vcResoState.focusId,
    );
    var isPm = item && String(item.kind || "").toLowerCase() === "p";
    var kindLabel = isPm ? "Partner Manager" : "Staff";
    if (kicker) {
      kicker.textContent =
        "Resoconto \u00B7 " + kindLabel + (item && item.weekLabel ? " \u00B7 " + item.weekLabel : "");
    }
    if (body) {
      body.innerHTML = renderProfileResoInboxBody(sheet.__vcResoState, sheet.__vcStatPayload || {});
    }
    if (foot) {
      foot.innerHTML = item ? profileResoActionButtons(item) : "";
    }
    try {
      syncResoPendingBadge(sheet, countPendingResoItems(sheet.__vcResoState.items));
    } catch (eBadge) {}
    try {
      if (global.VcAvatarFallback && typeof global.VcAvatarFallback.scan === "function") {
        global.VcAvatarFallback.scan(sheet);
      }
    } catch (eAv) {}
  }

  function fetchProfileResoconto(userId, week) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    var url =
      workflowsApiBase() +
      "?queue=resoconti&scope=all&page=1&pageSize=10&userId=" +
      encodeURIComponent(String(userId || ""));
    if (week) url += "&week=" + encodeURIComponent(String(week));
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer =
      ctrl &&
      global.setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, 14000);
    return fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .finally(function () {
        if (timer) global.clearTimeout(timer);
      });
  }

  function postProfileResoDecide(body) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    return fetch(workflowsApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(Object.assign({ queue: "resoconti" }, body || {})),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  function loadProfileResocontoIntoSheet(sheet, opts) {
    opts = opts || {};
    if (!sheet) return;
    var payload = sheet.__vcStatPayload || {};
    var uid = targetUserIdFromPayload(payload);
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    if (!/^\d{17,20}$/.test(uid)) {
      if (body) body.innerHTML = '<p class="vc-staff-stat-sheet__hint is-error">Profilo non valido.</p>';
      if (foot) foot.innerHTML = "";
      return;
    }
    var prev = sheet.__vcResoState || {};
    var week = opts.week != null ? opts.week : prev.week || "";
    if (body) body.innerHTML = '<p class="vc-staff-stat-sheet__hint">Carico resoconto…</p>';
    if (foot) foot.innerHTML = "";
    fetchProfileResoconto(uid, week)
      .then(function (out) {
        if (!sheet.isConnected) return;
        if (!out.res.ok || !out.data || !out.data.ok) {
          if (body) {
            body.innerHTML =
              '<p class="vc-staff-stat-sheet__hint is-error">' +
              esc((out.data && out.data.message) || "Resoconto non disponibile.") +
              "</p>";
          }
          return;
        }
        var items = Array.isArray(out.data.items) ? out.data.items : [];
        var tracks = availableResoTracks(items);
        var track = prev.track || "";
        if (track === "p" && !tracks.pm) track = tracks.staff ? "s" : "";
        if (track === "s" && !tracks.staff) track = tracks.pm ? "p" : "";
        if (!track) track = tracks.pm && !tracks.staff ? "p" : "s";
        sheet.__vcResoState = {
          week: out.data.week || week || "",
          weeks: Array.isArray(out.data.weeks) ? out.data.weeks : [],
          items: items,
          track: track,
          focusId: String(opts.focusId || sheet.__vcFocusResoId || "").trim(),
        };
        paintProfileReso(sheet);
      })
      .catch(function () {
        if (!sheet.isConnected) return;
        if (body) {
          body.innerHTML =
            '<p class="vc-staff-stat-sheet__hint is-error">Errore nel caricamento.</p>';
        }
      });
  }

  function fetchPmShopRedeems(userId) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    var url = pmShopApiBase() + "?userId=" + encodeURIComponent(String(userId || "")) + "&limit=30";
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer =
      ctrl &&
      global.setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, 12000);
    return fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .finally(function () {
        if (timer) global.clearTimeout(timer);
      });
  }

  function postPmShopRedeem(body) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    return fetch(pmShopApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  function valTradeApiBase() {
    var c = global.__VC_STAFF_VALTRADE || {};
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-valtrade").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      if ((h === "localhost" || h === "127.0.0.1") && local && !/\{\{/.test(local)) base = local;
    } catch (e) {}
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-valtrade";
    return base;
  }

  function getStaffToken() {
    try {
      var t = global.localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(global.localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function ensureActionDialogs() {
    var Modal = global.VCStaffManageModal;
    if (Modal && typeof Modal.ensureScripts === "function") return Modal.ensureScripts();
    return Promise.resolve();
  }

  function dlgConfirm(opts) {
    return ensureActionDialogs().then(function () {
      if (global.VcDialog && typeof global.VcDialog.confirm === "function") return global.VcDialog.confirm(opts);
      if (typeof global.__vcEnsureDialog === "function") {
        return global.__vcEnsureDialog().then(function (D) {
          return D && typeof D.confirm === "function" ? D.confirm(opts) : false;
        });
      }
      return false;
    });
  }

  function dlgPrompt(opts) {
    return ensureActionDialogs().then(function () {
      if (global.VcDialog && typeof global.VcDialog.prompt === "function") return global.VcDialog.prompt(opts);
      if (typeof global.__vcEnsureDialog === "function") {
        return global.__vcEnsureDialog().then(function (D) {
          return D && typeof D.prompt === "function" ? D.prompt(opts) : null;
        });
      }
      return null;
    });
  }

  function dlgAlert(opts) {
    return ensureActionDialogs().then(function () {
      if (global.VcDialog && typeof global.VcDialog.alert === "function") return global.VcDialog.alert(opts);
      if (typeof global.__vcEnsureDialog === "function") {
        return global.__vcEnsureDialog().then(function (D) {
          return D && typeof D.alert === "function" ? D.alert(opts) : undefined;
        });
      }
      return undefined;
    });
  }

  /* pmPointsToast1: feedback punti → toast float (niente status inline nella sheet) */
  function showProfileToast(msg, isError) {
    var text = String(msg || "").trim();
    if (!text) return false;
    try {
      if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
        global.VcSiteToast.show(text, Boolean(isError));
        return true;
      }
    } catch (e1) {}
    try {
      if (typeof global.__vcShowSiteToast === "function") {
        global.__vcShowSiteToast(text, Boolean(isError));
        return true;
      }
    } catch (e2) {}
    try {
      var tools = global.VcStaffTools;
      if (tools && typeof tools.showStaffToast === "function") {
        tools.showStaffToast(text, Boolean(isError));
        return true;
      }
      if (tools && typeof tools.showToast === "function") {
        tools.showToast(text, Boolean(isError));
        return true;
      }
      if (tools && typeof tools.setStatus === "function") {
        tools.setStatus("vc-staff-profile-toast", text, Boolean(isError));
        return true;
      }
    } catch (e3) {}
    return false;
  }

  function askReasonAndConfirm(opts) {
    opts = opts || {};
    return ensureActionDialogs().then(function () {
      return dlgPrompt({
        title: opts.title || "Motivo",
        message: opts.message || "Inserisci il motivo.",
        label: "Motivo",
        placeholder: "Min. 3 caratteri\u2026",
        multiline: true,
        maxLength: 500,
        confirmLabel: opts.continueLabel || "Continua",
        cancelLabel: "Annulla",
        danger: Boolean(opts.danger),
        icon: opts.icon || "fa-pencil",
      }).then(function (raw) {
        if (raw == null) return null;
        var reason = String(raw || "").trim();
        if (reason.length < 3) {
          return dlgAlert({
            title: "Motivo troppo corto",
            message: "Serve un motivo di almeno 3 caratteri.",
          }).then(function () {
            return null;
          });
        }
        return dlgConfirm({
          title: opts.confirmTitle || opts.title || "Conferma",
          message: (opts.confirmMessage || "Confermi?") + "\n\nMotivo: " + reason,
          confirmLabel: opts.confirmLabel || "Conferma",
          cancelLabel: "Annulla",
          danger: Boolean(opts.danger),
          icon: opts.icon || "fa-check",
        }).then(function (ok) {
          return ok ? reason : null;
        });
      });
    });
  }

  function postManageAction(body) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("auth"));
    return fetch(manageApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  function postValTradeAction(body) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("auth"));
    return fetch(valTradeApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  function targetUserIdFromPayload(payload) {
    return String(
      (payload && payload.identity && (payload.identity.userId || payload.identity.id)) ||
        (payload && payload.targetUserId) ||
        "",
    ).trim();
  }

  function kindToAddAction(kind) {
    if (kind === "val-pos") return "val_pos";
    if (kind === "val-neg") return "val_neg";
    if (kind === "warn") return "warn_add";
    return "";
  }

  function kindToRmAction(kind) {
    if (kind === "val-pos") return "val_pos_rm";
    if (kind === "val-neg") return "val_neg_rm";
    if (kind === "warn") return "warn_rm";
    return "";
  }

  function sheetActionBarHtml(kind, opts) {
    opts = opts || {};
    if (!canWriteStaffManage()) return "";
        if (opts.isSelf && (kind === "val-neg" || kind === "warn" || kind === "val-pos")) return "";
    var add = kindToAddAction(kind);
    if (!add) return "";
    var label =
      kind === "val-pos"
        ? "Aggiungi valutazione positiva"
        : kind === "val-neg"
          ? "Aggiungi valutazione negativa"
          : "Assegna warn staff";
    var tone =
      kind === "val-pos" ? "is-pos" : kind === "val-neg" ? "is-neg" : "is-warn";
    return (
      '<div class="vc-staff-stat-sheet__actions">' +
      '<button type="button" class="vc-staff-stat-sheet__act ' +
      tone +
      '" data-stat-act="' +
      esc(add) +
      '"><i class="fa fa-plus" aria-hidden="true"></i> ' +
      esc(label) +
      "</button></div>"
    );
  }

  /* pauseReviewProfile1 + pauseReviewHistory1: form HS + lista storico come Inbox Pause */
  function pauseReviewStatusLabel(item) {
    if (!item) return "In attesa";
    if (item.statusLabel) return String(item.statusLabel).trim() || "In attesa";
    var st = String(item.status || "pending").toLowerCase();
    if (st === "accepted") return "Accettata";
    if (st === "rejected") return "Rifiutata";
    if (st === "cancelled" || st === "canceled") return "Annullata";
    var phase = String(item.phase || "").toLowerCase();
    if (phase === "active") return "In corso";
    if (phase === "planned") return "Programmata";
    if (phase === "ended") return "Finita";
    return "In attesa";
  }

  function pauseReviewStatusClass(item) {
    var st = String((item && item.status) || "pending").toLowerCase();
    if (st === "accepted") return "is-ok";
    if (st === "rejected") return "is-no";
    if (st === "cancelled" || st === "canceled") return "is-muted";
    return "is-pending";
  }

  function pauseReviewProfileRoleFallback(payload) {
    var role = (payload && payload.role) || {};
    var career = (payload && payload.career) || {};
    var lab = String(
      (role && role.label) || (career && career.currentRole) || "",
    ).trim();
    lab = lab
      .replace(/<a?:[^:]+:\d+>/gi, "")
      .replace(/^[\s\u0F04\u2726\u2727\u2605\u2606\u25C6\u25C7\u2022\u00B7\u2756\u2735]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!lab || /^(staff|—|-)$/i.test(lab)) return "";
    /* se label composto "Helper \u00B7 …" tieni il primo pezzo staff-like */
    var first = lab.split(/\s*[\u00B7|/]\s*/)[0];
    return String(first || lab).trim();
  }

  function pauseReviewRoleLabels(item, payload) {
    var track = String((item && item.ruoloTrack) || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    var raw = String((item && (item.ruolo || item.ruoloLabel || item.ruoloRichiesto)) || "").trim();
    var low = raw.toLowerCase();
    var profileFallback = pauseReviewProfileRoleFallback(payload);
    function clean(lab) {
      return String(lab || "")
        .replace(/<a?:[^:]+:\d+>/gi, "")
        .replace(/^[\s\u0F04\u2726\u2727\u2605\u2606\u25C6\u25C7\u2022\u00B7\u2756\u2735]+/, "")
        .replace(/\s+/g, " ")
        .trim();
    }
    var both = track === "entrambi" || track === "both" || /\bentrambi\b|\bboth\b/.test(low);
    if (both) {
      var parts = raw
        .split(/\s+e\s+/i)
        .map(clean)
        .filter(Boolean);
      var generic = /^(entrambi|both|staff)$/i;
      if (parts.length >= 2 && parts.every(function (p) { return !generic.test(p); })) {
        return parts.slice(0, 2);
      }
      var rank = parts.find(function (p) {
        return p && !generic.test(p) && !/partner\s*manager/i.test(p);
      });
      if (rank) return [rank, "Partner Manager"];
      if (profileFallback && !/partner\s*manager/i.test(profileFallback)) {
        return [profileFallback, "Partner Manager"];
      }
      return ["Staff", "Partner Manager"];
    }
    if (track === "partnermanager" || track === "pm" || /partner\s*manager|\bpm\b/.test(low)) {
      return ["Partner Manager"];
    }
    var pretty = clean(raw);
    if (pretty && !/^(staff)$/i.test(pretty)) return [pretty];
    if (profileFallback) return [profileFallback];
    if (Array.isArray(item && item.roles)) {
      var fromRoles = [];
      item.roles.forEach(function (r) {
        var lab = clean(String((r && (r.label || r.name || r)) || ""));
        if (lab && !/^(staff)$/i.test(lab)) fromRoles.push(lab);
      });
      if (fromRoles.length) return fromRoles;
    }
    if (pretty) return [pretty];
    return [];
  }

  function pauseReviewRoleBadgesHtml(item, payload) {
    var labels = pauseReviewRoleLabels(item, payload);
    if (!labels.length) return "";
    return labels
      .map(function (lab) {
        return (
          '<span class="vc-staff-inbox-type-badge vc-staff-inbox-type-badge--pause-role">' +
          esc(lab) +
          "</span>"
        );
      })
      .join("");
  }

  function pauseItemKey(item) {
    if (!item) return "";
    var id = String(item.id || item.pauseId || "").trim();
    if (id) return "id:" + id;
    return (
      "r:" +
      String(item.start || item.startIso || "") +
      "|" +
      String(item.end || item.endIso || "") +
      "|" +
      String(item.status || "")
    );
  }

  function pauseReviewCanAct(item) {
    if (!item) return false;
    if (String(item.status || "").toLowerCase() !== "pending") return false;
    var pid = String(item.id || item.pauseId || "").trim();
    var uid = String(item.userId || "").trim();
    /* pauseReviewFix1: pending + id = azioni (anche Entrambi da storico profilo) */
    return Boolean(pid && uid);
  }

  /* pauseCancelAccept1: annulla pause accettate (non finite) come Discord / gestione */
  function pauseReviewCanCancel(item) {
    if (!item) return false;
    if (String(item.status || "").toLowerCase() !== "accepted") return false;
    if (String(item.phase || "").toLowerCase() === "ended") return false;
    var pid = String(item.id || item.pauseId || "").trim();
    var uid = String(item.userId || "").trim();
    return Boolean(pid && uid);
  }

  function pauseReviewActionButtons(item) {
    var uid = esc(String((item && item.userId) || ""));
    var pid = esc(String((item && (item.id || item.pauseId)) || ""));
    if (!uid || !pid) return "";
    if (pauseReviewCanAct(item)) {
      return (
        '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--forge">' +
        '<div class="vc-staff-rank-forge__rail">' +
        '<button type="button" class="vc-staff-rank-forge__card is-up" data-pause-act="accept" data-user-id="' +
        uid +
        '" data-id="' +
        pid +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-check"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Accetta</span>' +
        '<span class="vc-staff-rank-forge__hint">Approva la pausa richiesta</span></button>' +
        '<button type="button" class="vc-staff-rank-forge__card is-down" data-pause-act="reject" data-user-id="' +
        uid +
        '" data-id="' +
        pid +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-times"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Rifiuta</span>' +
        '<span class="vc-staff-rank-forge__hint">Chiudi senza accettare</span></button>' +
        "</div></div>"
      );
    }
    if (pauseReviewCanCancel(item)) {
      return (
        '<div class="vc-staff-inbox-actions vc-staff-inbox-actions--forge">' +
        '<div class="vc-staff-rank-forge__rail">' +
        '<button type="button" class="vc-staff-rank-forge__card is-down" data-pause-act="cancel" data-user-id="' +
        uid +
        '" data-id="' +
        pid +
        '">' +
        '<span class="vc-staff-rank-forge__ico" aria-hidden="true"><i class="fa fa-ban"></i></span>' +
        '<span class="vc-staff-rank-forge__name">Annulla pausa</span>' +
        '<span class="vc-staff-rank-forge__hint">Giorni gi\u00e0 trascorsi scalati dal budget</span></button>' +
        "</div></div>"
      );
    }
    return "";
  }

  function pauseDateStatusKey(item) {
    if (!item) return "";
    /* pauseBothSplit1: stesso periodo su track diversi = due richieste (non collassare) */
    var track = String(
      (item && (item.ruoloTrack || item.ruoloRichiesto || item.ruolo || item.ruoloLabel)) || "",
    )
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "");
    return (
      "r:" +
      String(item.start || item.startIso || "") +
      "|" +
      String(item.end || item.endIso || "") +
      "|" +
      String(item.status || "") +
      "|" +
      track
    );
  }

  function mergePauseReviewItems(apiItems, payload) {
    var out = [];
    var seen = {};
    var uid = targetUserIdFromPayload(payload);
    function markSeen(row) {
      var key = pauseItemKey(row);
      var dateKey = pauseDateStatusKey(row);
      if (key) seen[key] = true;
      if (dateKey) seen[dateKey] = true;
    }
    function alreadySeen(row) {
      var key = pauseItemKey(row);
      var dateKey = pauseDateStatusKey(row);
      return (key && seen[key]) || (dateKey && seen[dateKey]);
    }
    var id = (payload && payload.identity) || {};
    var profileAvatar = String(resolveProfileAvatarUrl(id) || id.avatarUrl || "").trim();
    var profileRole = pauseReviewProfileRoleFallback(payload);
    (Array.isArray(apiItems) ? apiItems : []).forEach(function (it) {
      if (!it) return;
      var row = Object.assign({}, it);
      if (!row.userId && uid) row.userId = uid;
      if (!row.id && row.pauseId) row.id = row.pauseId;
      if (!row.pauseId && row.id) row.pauseId = row.id;
      if (!row.avatarUrl && profileAvatar) row.avatarUrl = profileAvatar;
      var st = String(row.status || "").toLowerCase();
      if (st === "pending" && row.id) row.canAct = true;
      /* pauseCancelAccept1 */
      row.canCancel =
        st === "accepted" && String(row.phase || "").toLowerCase() !== "ended" && Boolean(row.id);
      var ruoloNow = String(row.ruolo || row.ruoloLabel || "").trim();
      if ((!ruoloNow || /^(staff)$/i.test(ruoloNow)) && profileRole) {
        row.ruolo = profileRole;
        row.ruoloLabel = profileRole;
      }
      if (alreadySeen(row)) return;
      markSeen(row);
      out.push(row);
    });
    var hist = historyFromPayloadOrDom(payload, null);
    (Array.isArray(hist) ? hist : []).forEach(function (h) {
      if (!h) return;
      var hid = String(h.id || h.pauseId || "").trim();
      var st = String(h.status || "accepted").trim() || "accepted";
      var ruoloHist = String(h.ruolo || h.ruoloLabel || h.ruoloRichiesto || "").trim();
      if ((!ruoloHist || /^(staff)$/i.test(ruoloHist)) && profileRole) ruoloHist = profileRole;
      var phaseHist = String(h.phase || "").trim();
      var row = {
        id: hid,
        pauseId: hid,
        userId: uid,
        displayName: String(id.displayName || "").trim() || undefined,
        avatarUrl: profileAvatar || undefined,
        start: String(h.start || "").trim(),
        end: String(h.end || "").trim(),
        startIso: String(h.startIso || "").trim(),
        endIso: String(h.endIso || "").trim(),
        status: st,
        statusLabel: h.statusLabel || "",
        phase: phaseHist,
        motivazione: String(h.motivazione || h.reason || "").trim(),
        ruolo: ruoloHist,
        ruoloLabel: String(h.ruoloLabel || ruoloHist || "").trim(),
        ruoloTrack: String(h.ruoloTrack || h.ruoloRichiesto || "").trim(),
        ruoloRichiesto: String(h.ruoloRichiesto || h.ruolo || "").trim(),
        /* pauseReviewFix1: preserva canAct/id dallo storico profilo (Entrambi) */
        canAct: st.toLowerCase() === "pending" && Boolean(hid),
        /* pauseCancelAccept1 */
        canCancel:
          st.toLowerCase() === "accepted" &&
          phaseHist.toLowerCase() !== "ended" &&
          Boolean(hid),
        fromHistory: true,
        dedupeKey: hid && uid ? "pause:" + uid + ":" + hid : "",
      };
      if (alreadySeen(row)) return;
      markSeen(row);
      out.push(row);
    });
    out.sort(function (a, b) {
      var ap = String((a && a.status) || "").toLowerCase() === "pending" ? 0 : 1;
      var bp = String((b && b.status) || "").toLowerCase() === "pending" ? 0 : 1;
      if (ap !== bp) return ap - bp;
      var as = String((a && (a.startIso || a.start)) || "");
      var bs = String((b && (b.startIso || b.start)) || "");
      return bs.localeCompare(as);
    });
    return out;
  }

  function renderProfilePauseListHtml(items, selectedKey, payload) {
    var rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return '<p class="vc-staff-stat-sheet__hint">Nessuna richiesta di pausa in archivio per questo staff.</p>';
    }
    return (
      '<ul class="vc-staff-pause-review-list" role="list">' +
      rows
        .map(function (it) {
          var key = pauseItemKey(it);
          var range =
            it.start && it.end
              ? String(it.start) + " \u2192 " + String(it.end)
              : it.startIso && it.endIso
                ? String(it.startIso) + " \u2192 " + String(it.endIso)
                : "Date non disponibili";
          var motive = String(it.motivazione || it.preview || it.body || "").trim();
          if (motive.length > 110) motive = motive.slice(0, 107) + "\u2026";
          var selected = selectedKey && selectedKey === key;
          return (
            '<li class="vc-staff-pause-review-list__item' +
            (selected ? " is-selected" : "") +
            (String(it.status || "").toLowerCase() === "pending" ? " is-pending" : "") +
            '" role="button" tabindex="0" data-pause-pick="' +
            esc(key) +
            '">' +
            '<div class="vc-staff-pause-review-list__main">' +
            '<p class="vc-staff-pause-review-list__range">' +
            esc(range) +
            "</p>" +
            (pauseReviewRoleBadgesHtml(it, payload) || "") +
            (motive
              ? '<p class="vc-staff-pause-review-list__motive">' + esc(motive) + "</p>"
              : "") +
            "</div>" +
            '<span class="vc-staff-inbox-status ' +
            pauseReviewStatusClass(it) +
            '">' +
            esc(pauseReviewStatusLabel(it)) +
            "</span></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderProfilePauseDetailHtml(item, payload) {
    if (!item) {
      return '<p class="vc-staff-stat-sheet__hint">Seleziona una richiesta.</p>';
    }
    var id = (payload && payload.identity) || {};
    var displayName =
      String((item && item.displayName) || "").trim() ||
      String(id.displayName || "").trim() ||
      "Staff";
    var rangeMeta =
      item.start && item.end
        ? String(item.start) + " \u2192 " + String(item.end)
        : String(item.startIso || "") && String(item.endIso || "")
          ? String(item.startIso) + " \u2192 " + String(item.endIso)
          : "";
    var motivazione = String(
      item.motivazione || item.content || item.body || item.preview || item.reason || "",
    ).trim();
    var uid = String(item.userId || targetUserIdFromPayload(payload) || id.userId || "").trim();
    var avatarUrl = String(item.avatarUrl || "").trim();
    if (!avatarUrl || /cdn\.discordapp\.com\/embed\/avatars\//i.test(avatarUrl)) {
      avatarUrl = String(resolveProfileAvatarUrl(id) || id.avatarUrl || "").trim();
    }
    var avatarHtml = "";
    try {
      if (global.VCStaffTools && typeof global.VCStaffTools.avatarImgHtml === "function") {
        avatarHtml = global.VCStaffTools.avatarImgHtml(avatarUrl, uid, {
          width: 56,
          height: 56,
          avatarHash: id.avatar || id.avatarHash || "",
        });
      }
    } catch (eAv) {}
    if (!avatarHtml) {
      avatarHtml =
        '<span class="vc-staff-avatar-fallback" aria-hidden="true">' +
        esc(displayName.slice(0, 1).toUpperCase()) +
        "</span>";
    }
    return (
      '<button type="button" class="vc-staff-pause-review-back" data-pause-back="1">\u2190 Tutte le richieste</button>' +
      '<div class="vc-staff-reso-hero vc-staff-reso-hero--pause">' +
      '<span class="vc-staff-avatar-wrap vc-staff-avatar-wrap--lg">' +
      avatarHtml +
      '</span><div class="vc-staff-reso-hero__main">' +
      '<div class="vc-staff-reso-hero__name-row">' +
      '<h3 class="vc-staff-reso-hero__name">' +
      esc(displayName) +
      "</h3>" +
      pauseReviewRoleBadgesHtml(item, payload) +
      "</div>" +
      (rangeMeta ? '<p class="vc-staff-reso-hero__meta">' + esc(rangeMeta) + "</p>" : "") +
      "</div>" +
      '<span class="vc-staff-inbox-status vc-staff-reso-hero__status ' +
      pauseReviewStatusClass(item) +
      '">' +
      esc(pauseReviewStatusLabel(item)) +
      "</span></div>" +
      (motivazione
        ? '<div class="vc-staff-inbox-detail__field vc-staff-inbox-detail__qa"><h4>Motivazione</h4><div class="vc-staff-inbox-detail__answer">' +
          esc(motivazione).replace(/\n/g, "<br>") +
          "</div></div>"
        : '<p class="vc-staff-stat-sheet__hint">Nessuna motivazione registrata.</p>') +
      /* pauseInviteOnly1: discussione HS; richiedente solo se aggiunto (come candidature) */
      '<div class="vc-staff-pause-chat" id="vc-staff-pause-chat">' +
      '<div class="vc-staff-pause-chat__intro">' +
      '<p class="vc-staff-pause-chat__kicker">Discussione</p>' +
      '<p class="vc-staff-pause-chat__hint">High staff \u00B7 aggiungi il richiedente se serve</p>' +
      "</div>" +
      '<div id="vc-staff-pause-chat-mount"></div></div>'
    );
  }

  function pauseWorkflowChatApiBase() {
    var T = global.VCStaffTools;
    var c = global.__VC_STAFF_WORKFLOW_CHAT || {};
    if (T && typeof T.resolveApiUrl === "function") {
      return T.resolveApiUrl(c, "/webhooks/site-staff-workflow-chat");
    }
    var base = String(c.apiUrl || "/webhooks/site-staff-workflow-chat").trim();
    if (/\{\{/.test(base)) base = "/webhooks/site-staff-workflow-chat";
    return base;
  }

  function pauseWorkflowDedupeKey(item) {
    if (!item) return "";
    var dk = String(item.dedupeKey || "").trim();
    if (dk.indexOf("pause:") === 0) return dk;
    var uid = String(item.userId || "").trim();
    var pid = String(item.id || item.pauseId || "").trim();
    return uid && pid ? "pause:" + uid + ":" + pid : "";
  }

  function ensurePauseWorkflowChatAssets() {
    if (global.VcWorkflowChat) return Promise.resolve(true);
    return new Promise(function (resolve) {
      var ver = "20261009emojiAnchorPos1";
      try {
        var existing = global.document.querySelector('script[data-vc-wfc="1"]');
        if (existing) {
          var tries = 0;
          var t = global.setInterval(function () {
            tries += 1;
            if (global.VcWorkflowChat || tries > 40) {
              global.clearInterval(t);
              resolve(Boolean(global.VcWorkflowChat));
            }
          }, 50);
          return;
        }
      } catch (eEx) {}
      try {
        if (!global.document.querySelector('link[data-vc-wfc-css="1"]')) {
          var link = global.document.createElement("link");
          link.rel = "stylesheet";
          link.href = "/css/vc-workflow-chat.css?v=" + ver;
          link.setAttribute("data-vc-wfc-css", "1");
          global.document.head.appendChild(link);
        }
      } catch (eCss) {}
      var s = global.document.createElement("script");
      s.src = "/js/vc-workflow-chat.js?v=" + ver;
      s.defer = true;
      s.setAttribute("data-vc-wfc", "1");
      s.onload = function () {
        resolve(Boolean(global.VcWorkflowChat));
      };
      s.onerror = function () {
        resolve(false);
      };
      global.document.head.appendChild(s);
    });
  }

  function bootPauseReviewChat(item) {
    var mount = global.document.getElementById("vc-staff-pause-chat-mount");
    if (!mount || !item) return;
    var key = pauseWorkflowDedupeKey(item);
    if (!key) {
      mount.innerHTML =
        '<p class="vc-staff-stat-sheet__hint">Chat non disponibile per questa richiesta.</p>';
      return;
    }
    ensurePauseWorkflowChatAssets().then(function (ok) {
      if (!ok || !global.VcWorkflowChat) {
        mount.innerHTML =
          '<p class="vc-staff-stat-sheet__hint is-error">Chat non caricata.</p>';
        return;
      }
      var chatItem = Object.assign({}, item, {
        dedupeKey: key,
        status: String(item.status || "pending"),
        canAct: pauseReviewCanAct(item),
      });
      try {
        global.VcWorkflowChat.init({
          apiBase: pauseWorkflowChatApiBase,
          getProfileId: function () {
            return String((global.__VC_DISCORD_PROFILE && global.__VC_DISCORD_PROFILE.id) || "");
          },
          dedupeKeyForItem: function (it) {
            return pauseWorkflowDedupeKey(it);
          },
          formatMessageHtml: function (txt) {
            return esc(String(txt || "")).replace(/\n/g, "<br>");
          },
          esc: esc,
          avatarHtml: function (url, userId, opts) {
            var T = global.VCStaffTools;
            if (T && typeof T.avatarImgHtml === "function") {
              return T.avatarImgHtml(url, userId, opts || {});
            }
            return "";
          },
          fetchJson: function (url, opts) {
            var T = global.VCStaffTools;
            if (T && typeof T.fetchJson === "function") return T.fetchJson(url, opts);
            return fetch(url, opts || {}).then(function (res) {
              return res.json().then(function (data) {
                return { res: res, data: data };
              });
            });
          },
          byId: function (id) {
            return global.document.getElementById(id);
          },
          getToken: getStaffToken,
          sendBtnClass: "vc-staff-inbox-btn vc-staff-inbox-btn--ok",
          forceReadOnly: false,
          panelTitle: "Discussione",
          panelHint: "Emoji \u00B7 @utenti \u00B7 #canali \u00B7 risposte \u00B7 allegati",
          closedHint: "Pratica chiusa",
          closedMessage: "Chat in sola lettura: la pratica non è più in attesa.",
          emptyReadOnlyMessage: "Nessun messaggio in discussione.",
          notify: function (msg, isError) {
            try {
              if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
                global.VcSiteToast.show(msg, Boolean(isError));
              }
            } catch (eN) {}
          },
        });
        mount.innerHTML = global.VcWorkflowChat.renderPanel(chatItem, "pause");
        global.VcWorkflowChat.boot(chatItem, "pause");
      } catch (eBoot) {
        mount.innerHTML =
          '<p class="vc-staff-stat-sheet__hint is-error">Errore avvio chat.</p>';
      }
    });
  }

  function teardownPauseReviewChat() {
    try {
      if (global.VcWorkflowChat && typeof global.VcWorkflowChat.teardown === "function") {
        global.VcWorkflowChat.teardown();
      }
    } catch (eT) {}
  }

  function renderProfilePauseReviewBody(sheet) {
    var payload = (sheet && sheet.__vcStatPayload) || {};
    var items = (sheet && sheet.__vcPauseItems) || [];
    var view = (sheet && sheet.__vcPauseView) || "list";
    var item = (sheet && sheet.__vcPauseItem) || null;
    var hist = historyFromPayloadOrDom(payload, sheet && sheet.__vcStatRoot);
    var ranges = resolvePauseRanges(hist);
    var initial = pickCalendarMonth(ranges);
    var head =
      pauseTradeHtml(payload) +
      '<div data-pause-cal-host class="vc-staff-pause-review-cal">' +
      buildMiniCalHtml(hist, initial.y, initial.m) +
      "</div>";
    if (view === "detail" && item) {
      return head + renderProfilePauseDetailHtml(item, payload);
    }
    return (
      head +
      '<div class="vc-staff-pause-review-section">' +
      '<p class="vc-staff-pause-review-section__title">Richieste</p>' +
      renderProfilePauseListHtml(items, item ? pauseItemKey(item) : "", payload) +
      "</div>"
    );
  }

  function fetchProfilePauseReview(userId) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    var url =
      workflowsApiBase() +
      "?queue=pause&scope=all&page=1&pageSize=40&userId=" +
      encodeURIComponent(String(userId || ""));
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer =
      ctrl &&
      global.setTimeout(function () {
        try {
          ctrl.abort();
        } catch (eAb) {}
      }, 14000);
    return fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .finally(function () {
        if (timer) global.clearTimeout(timer);
      });
  }

  function postProfilePauseDecide(body) {
    var token = getStaffToken();
    if (!token) return Promise.reject(new Error("no_token"));
    return fetch(workflowsApiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(Object.assign({ queue: "pause" }, body || {})),
    }).then(function (res) {
      return res.json().then(function (data) {
        return { res: res, data: data };
      });
    });
  }

  function paintProfilePauseReview(sheet) {
    if (!sheet) return;
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    var kicker = sheet.querySelector(".vc-staff-reso-sheet__kicker");
    var titleEl = sheet.querySelector("#vc-staff-reso-title");
    var item = sheet.__vcPauseItem || null;
    var view = sheet.__vcPauseView || "list";
    teardownPauseReviewChat();
    if (kicker) {
      kicker.textContent =
        view === "detail" ? "Richiesta pausa" : "Pause \u00b7 richieste";
    }
    if (titleEl) {
      titleEl.textContent = "";
      titleEl.setAttribute("aria-hidden", "true");
    }
    if (body) {
      body.innerHTML = renderProfilePauseReviewBody(sheet);
    }
    if (foot) {
      foot.innerHTML = view === "detail" && item ? pauseReviewActionButtons(item) : "";
    }
    if (view === "detail" && item) {
      bootPauseReviewChat(item);
    }
    try {
      if (global.VcAvatarFallback && typeof global.VcAvatarFallback.scan === "function") {
        global.VcAvatarFallback.scan(sheet);
      }
    } catch (eAv) {}
  }

  function loadProfilePauseIntoSheet(sheet) {
    if (!sheet) return;
    var payload = sheet.__vcStatPayload || {};
    var uid = targetUserIdFromPayload(payload);
    var body = sheet.querySelector("#vc-staff-reso-body");
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    if (!/^\d{17,20}$/.test(uid)) {
      if (body) body.innerHTML = '<p class="vc-staff-stat-sheet__hint is-error">Profilo non valido.</p>';
      if (foot) foot.innerHTML = "";
      return;
    }
    if (body) body.innerHTML = '<p class="vc-staff-stat-sheet__hint">Carico richieste pausa\u2026</p>';
    if (foot) foot.innerHTML = "";
    fetchProfilePauseReview(uid)
      .then(function (out) {
        if (!sheet.isConnected) return;
        var apiItems =
          out && out.res && out.res.ok && out.data && out.data.ok && Array.isArray(out.data.items)
            ? out.data.items
            : [];
        if (out && out.res && !out.res.ok && body && !apiItems.length) {
          /* fallback: almeno storico profilo */
        }
        var merged = mergePauseReviewItems(apiItems, payload);
        sheet.__vcPauseItems = merged;
        var pending = merged.filter(function (it) {
          return String((it && it.status) || "").toLowerCase() === "pending";
        });
        /* Lista sempre (anche con pending); auto-open solo se 1 pending e nient'altro? No: lista. */
        sheet.__vcPauseView = "list";
        sheet.__vcPauseItem = pending[0] || null;
        paintProfilePauseReview(sheet);
        /* pausePendBadge1 */
        syncPausePendingBadge(sheet, pending.length);
      })
      .catch(function () {
        if (!sheet.isConnected) return;
        var merged = mergePauseReviewItems([], payload);
        sheet.__vcPauseItems = merged;
        sheet.__vcPauseView = "list";
        sheet.__vcPauseItem = null;
        if (!merged.length && body) {
          body.innerHTML =
            '<p class="vc-staff-stat-sheet__hint is-error">Errore nel caricamento.</p>';
          syncPausePendingBadge(sheet, 0);
          return;
        }
        paintProfilePauseReview(sheet);
        syncPausePendingBadge(sheet, countPendingPauseItems(merged));
      });
  }

  function ensureProfilePauseSheet() {
    closeProfileResoSheet();
    var sheet = global.document.createElement("div");
    sheet.id = "vc-staff-reso-sheet";
    sheet.className = "vc-staff-reso-sheet is-pause-sheet";
    sheet.setAttribute("data-profile-reso", "1");
    sheet.setAttribute("data-profile-pause", "1");
    sheet.setAttribute("data-reso-bound", "pauseReviewHistory1");
    sheet.hidden = true;
    sheet.__vcPauseView = "list";
    sheet.__vcPauseItems = [];
    sheet.__vcPauseItem = null;
    sheet.innerHTML =
      '<button type="button" class="vc-staff-reso-sheet__backdrop" data-reso-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-staff-reso-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="vc-staff-reso-title">' +
      '<div class="vc-staff-reso-sheet__head">' +
      '<div><p class="vc-staff-reso-sheet__kicker">Pause \u00b7 richieste</p>' +
      '<h2 id="vc-staff-reso-title" class="vc-staff-reso-sheet__title"></h2></div>' +
      '<button type="button" class="vc-staff-reso-sheet__close" data-reso-close="1" aria-label="Chiudi">\u2715</button>' +
      "</div>" +
      '<div class="vc-staff-reso-sheet__body" id="vc-staff-reso-body"></div>' +
      '<div class="vc-staff-reso-sheet__foot" id="vc-staff-reso-foot"></div>' +
      "</div>";
    global.document.body.appendChild(sheet);
    sheet.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      if (t.closest("[data-reso-close]")) {
        ev.preventDefault();
        closeProfileResoSheet();
        return;
      }
      var back = t.closest("[data-pause-back]");
      if (back && sheet.contains(back)) {
        ev.preventDefault();
        sheet.__vcPauseView = "list";
        sheet.__vcPauseItem = null;
        paintProfilePauseReview(sheet);
        return;
      }
      var pick = t.closest("[data-pause-pick]");
      if (pick && sheet.contains(pick)) {
        ev.preventDefault();
        var want = String(pick.getAttribute("data-pause-pick") || "").trim();
        var found = null;
        (sheet.__vcPauseItems || []).forEach(function (it) {
          if (!found && pauseItemKey(it) === want) found = it;
        });
        if (!found) return;
        sheet.__vcPauseItem = found;
        sheet.__vcPauseView = "detail";
        paintProfilePauseReview(sheet);
        return;
      }
      var nav = t.closest("[data-cal-nav]");
      if (nav && sheet.contains(nav)) {
        ev.preventDefault();
        var delta = Number(nav.getAttribute("data-cal-nav") || "0");
        var cal = sheet.querySelector(".vc-staff-mini-cal");
        if (!cal) return;
        var cy = Number(cal.getAttribute("data-y") || "0");
        var cm = Number(cal.getAttribute("data-m") || "0");
        cm += delta;
        if (cm < 1) {
          cm = 12;
          cy -= 1;
        } else if (cm > 12) {
          cm = 1;
          cy += 1;
        }
        var hist = historyFromPayloadOrDom(sheet.__vcStatPayload || {}, sheet.__vcStatRoot || null);
        var calHost = sheet.querySelector("[data-pause-cal-host]");
        if (calHost) calHost.innerHTML = buildMiniCalHtml(hist, cy, cm);
        return;
      }
      var actBtn = t.closest("[data-pause-act]");
      if (!actBtn || !sheet.contains(actBtn) || actBtn.disabled) return;
      ev.preventDefault();
      if (sheet.__vcPauseBusy) return;
      var action = String(actBtn.getAttribute("data-pause-act") || "");
      var userId = String(actBtn.getAttribute("data-user-id") || "").trim();
      var pauseId = String(actBtn.getAttribute("data-id") || "").trim();
      if (
        !userId ||
        !pauseId ||
        (action !== "accept" && action !== "reject" && action !== "cancel")
      )
        return;
      var confirmOpts =
        action === "reject"
          ? {
              title: "Rifiuta pausa",
              message: "Rifiutare questa richiesta di pausa?",
              confirmLabel: "Rifiuta",
              danger: true,
            }
          : action === "cancel"
            ? {
                title: "Annulla pausa",
                message:
                  "Annullare la pausa? I giorni gi\u00e0 trascorsi verranno scalati dal budget annuale.",
                confirmLabel: "Annulla pausa",
                danger: true,
              }
            : {
                title: "Accetta pausa",
                message: "Accettare questa richiesta di pausa?",
                confirmLabel: "Accetta",
              };
      dlgConfirm(confirmOpts).then(function (ok) {
        if (!ok) return;
        sheet.__vcPauseBusy = true;
        actBtn.disabled = true;
        postProfilePauseDecide({
          action: action,
          userId: userId,
          pauseId: pauseId,
          id: pauseId,
        })
          .then(function (out) {
            sheet.__vcPauseBusy = false;
            if (!sheet.isConnected) return;
            if (!out.res.ok || !out.data || !out.data.ok) {
              try {
                if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
                  global.VcSiteToast.show(
                    (out.data && out.data.message) || "Operazione non riuscita.",
                    true,
                  );
                }
              } catch (eT) {}
              actBtn.disabled = false;
              return;
            }
            try {
              if (global.VcSiteToast && typeof global.VcSiteToast.show === "function") {
                global.VcSiteToast.show(
                  action === "reject"
                    ? "Pausa rifiutata."
                    : action === "cancel"
                      ? "Pausa annullata."
                      : "Pausa accettata.",
                  false,
                );
              }
            } catch (eOk) {}
            /* pausePendBadge1: aggiorna subito badge (prima del reload async) */
            try {
              var itemsNow = Array.isArray(sheet.__vcPauseItems) ? sheet.__vcPauseItems : [];
              var nextPending = 0;
              var wantKey = "id:" + pauseId;
              for (var pi = 0; pi < itemsNow.length; pi += 1) {
                var it = itemsNow[pi];
                if (!it) continue;
                var idMatch =
                  pauseItemKey(it) === wantKey ||
                  String(it.id || it.pauseId || "").trim() === pauseId ||
                  String(it.messageId || "").trim() === pauseId;
                if (idMatch) {
                  it.status =
                    action === "reject"
                      ? "rejected"
                      : action === "cancel"
                        ? "cancelled"
                        : "accepted";
                  it.statusLabel =
                    action === "reject"
                      ? "Rifiutata"
                      : action === "cancel"
                        ? "Annullata"
                        : "Accettata";
                  it.canAct = false;
                  it.canCancel = false;
                  continue;
                }
                if (String(it.status || "").toLowerCase() === "pending") nextPending += 1;
              }
              var remainHint =
                out.data && out.data.remaining != null
                  ? out.data.remaining
                  : out.data && out.data.quota && out.data.quota.remaining != null
                    ? out.data.quota.remaining
                    : null;
              syncPausePendingBadge(sheet, nextPending, remainHint);
            } catch (eBadge) {}
            sheet.__vcPauseView = "list";
            sheet.__vcPauseItem = null;
            loadProfilePauseIntoSheet(sheet);
            /* pausePendBadge1: era __vcReloadProfile (mai settato) → badge stale fino a F5 */
            var reload =
              (sheet.__vcStatRoot && sheet.__vcStatRoot.__vcStaffReload) ||
              (sheet.__vcStatRoot && sheet.__vcStatRoot.__vcReloadProfile) ||
              null;
            if (typeof reload === "function") {
              try {
                reload();
              } catch (eRel) {}
            }
          })
          .catch(function () {
            sheet.__vcPauseBusy = false;
            actBtn.disabled = false;
          });
      });
    });
    global.document.addEventListener(
      "keydown",
      function onEsc(ev) {
        if (ev.key !== "Escape") return;
        if (!sheet.isConnected || sheet.hidden) return;
        ev.preventDefault();
        closeProfileResoSheet();
        global.document.removeEventListener("keydown", onEsc, true);
      },
      true,
    );
    return sheet;
  }

  function openProfilePauseSheet(payload, root) {
    closeStatSheet();
    var sheet = ensureProfilePauseSheet();
    sheet.__vcStatPayload = payload;
    sheet.__vcStatRoot = root;
    sheet.__vcStatKind = "pause";
    sheet.hidden = false;
    try {
      sheet.removeAttribute("hidden");
      sheet.style.removeProperty("display");
      sheet.style.removeProperty("pointer-events");
    } catch (eSt) {}
    try {
      global.document.documentElement.classList.add("vc-staff-reso-sheet-open");
    } catch (eCls) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcPinPageScroll === "function") global.__vcPinPageScroll();
    } catch (ePin) {}
    unlockSheetPageChrome();
    global.requestAnimationFrame(function () {
      try {
        sheet.classList.add("is-in");
      } catch (eIn) {}
    });
    var body = sheet.querySelector("#vc-staff-reso-body");
    if (body) body.innerHTML = '<p class="vc-staff-stat-sheet__hint">Carico richiesta pausa\u2026</p>';
    var foot = sheet.querySelector("#vc-staff-reso-foot");
    if (foot) foot.innerHTML = "";
    loadProfilePauseIntoSheet(sheet);
  }

  function pauseTradeHtml(payload) {
    if (!canWriteStaffManage()) return "";
    if (String(((payload || {}).role || {}).kind || "").toLowerCase() === "pm_only") return "";
    var pos = Number(
      (((payload || {}).valutazioni || {}).positive != null
        ? payload.valutazioni.positive
        : 0) || 0,
    );
    return (
      '<div class="vc-staff-pause-trade__card vc-no-sfx">' +
      '<div class="vc-staff-pause-trade-card__copy">' +
      "<strong>Valutazioni positive \u2192 giorni pausa</strong>" +
      "<span>Converti valutazioni positive in giorni extra sul budget pausa. Disponibili: <b>" +
      esc(String(pos)) +
      "</b></span></div>" +
      '<div class="vc-staff-pause-trade-card__form">' +
      '<label for="vc-pause-trade-pos"><span>Valutazioni positive</span><input type="number" id="vc-pause-trade-pos" name="pauseTradePos" min="1" max="50" value="1" data-pause-trade-pos autocomplete="off" /></label>' +
      '<label for="vc-pause-trade-days"><span>Giorni</span><input type="number" id="vc-pause-trade-days" name="pauseTradeDays" min="1" max="60" value="1" data-pause-trade-days autocomplete="off" /></label>' +
      '<button type="button" class="vc-staff-stat-sheet__act is-pos" data-stat-act="pos_pause_trade">Scambia</button>' +
      "</div></div>"
    );
  }

  function pmPointsSheetHtml(payload) {
    var partner = ((payload || {}).partner || {}) || {};
    var pts = Number(partner.points != null ? partner.points : 0) || 0;
    var earned = Number(partner.pointsEarned != null ? partner.pointsEarned : pts + Number(partner.redeemSpend || 0)) || 0;
    var spent = Number(partner.redeemSpend != null ? partner.redeemSpend : 0) || 0;
    var canWrite = canWriteStaffManage();
    /* pmSheetTrim1: niente riga Spendibili/Totali/Spesi né blurb sotto */
    var html =
      '<div class="vc-staff-pm-points__card vc-no-sfx">' +
      '<div class="vc-staff-pm-points-card__copy">' +
      "<strong>Punti Partner Manager</strong>" +
      /* hidden hooks for live updates after add/rm */
      '<span class="vc-sr-only" aria-hidden="true">' +
      "<b data-pm-points-balance>" +
      esc(String(pts)) +
      "</b><b data-pm-points-earned>" +
      esc(String(earned)) +
      "</b><b data-pm-points-spent>" +
      esc(String(spent)) +
      "</b></span>" +
      "</div>";
    if (!canWrite) {
      html += "</div>";
      return html;
    }
    html +=
      '<div class="vc-staff-pm-points-card__form">' +
      '<label for="vc-pm-points-amt"><span>Quantit\u00e0</span><input type="number" id="vc-pm-points-amt" name="pmPointsAmt" min="1" max="500" value="1" data-pm-points-amt autocomplete="off" /></label>' +
      '<label class="vc-staff-pm-points-card__reason" for="vc-pm-points-reason"><span>Motivazione <em>(facoltativa)</em></span>' +
      '<input type="text" id="vc-pm-points-reason" name="pmPointsReason" maxlength="400" placeholder="Es. errore shop / premio manuale" data-pm-points-reason autocomplete="off" /></label>' +
      '<div class="vc-staff-pm-points-card__btns">' +
      '<button type="button" class="vc-staff-stat-sheet__act is-pos" data-stat-act="pm_points_add">' +
      '<i class="fa fa-plus" aria-hidden="true"></i> Aggiungi</button>' +
      '<button type="button" class="vc-staff-stat-sheet__act is-neg" data-stat-act="pm_points_rm">' +
      '<i class="fa fa-minus" aria-hidden="true"></i> Rimuovi</button>' +
      "</div>" +
      '<p class="vc-staff-stat-sheet__hint" data-pm-points-status hidden></p>' +
      "</div></div>";
    return html;
  }

  function formatShopRedeemWhen(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "—";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (eFmt) {
      return "—";
    }
  }

  function shopRedeemSourceLabel(source) {
    var s = String(source || "");
    if (s === "site_hs_manual") return "High Staff (sito)";
    if (s === "discord_hs") return "High Staff (Discord)";
    if (s === "site_self") return "Shop PM";
    if (s === "ticket_ack") return "Ticket";
    return s || "Shop";
  }

  /* pmShopOwnedUx1 */
  function ownedShopBadgeLabel(blockedReason) {
    var r = String(blockedReason || "").trim();
    if (!r) return "Già attivo";
    if (/vip\+/i.test(r)) return "VIP+ attivo";
    if (/vip/i.test(r)) return "VIP attivo";
    if (/custom/i.test(r)) return "Custom attivo";
    var m = r.match(/^Hai già\s+(?:il |la |l'|i )?(.+?)\.?$/i);
    if (m && m[1]) return m[1].trim();
    return r.replace(/\.$/, "");
  }

  function applyPartnerShopSnapshot(payload, root, snap) {
    if (!snap || typeof snap !== "object") return;
    if (!payload.partner) payload.partner = {};
    if (snap.points != null) payload.partner.points = snap.points;
    if (snap.redeemSpend != null) payload.partner.redeemSpend = snap.redeemSpend;
    if (snap.pointsEarned != null) payload.partner.pointsEarned = snap.pointsEarned;
    if (snap.shop) payload.partner.shop = snap.shop;
    if (root && root.__vcStaffPayload) {
      if (!root.__vcStaffPayload.partner) root.__vcStaffPayload.partner = {};
      if (snap.points != null) root.__vcStaffPayload.partner.points = snap.points;
      if (snap.redeemSpend != null) root.__vcStaffPayload.partner.redeemSpend = snap.redeemSpend;
      if (snap.shop) root.__vcStaffPayload.partner.shop = snap.shop;
    }
  }

  function rebuildPmShopSpendSheet(wrap, historyItems) {
    if (!wrap) return;
    var bodyEl = wrap.querySelector("[data-stat-body]");
    var payload = wrap.__vcStatPayload || {};
    if (!bodyEl || !payload.partner) return;
    var histKeep = null;
    if (historyItems == null) {
      var hostKeep = wrap.querySelector("[data-pm-shop-history-host]");
      histKeep = hostKeep ? hostKeep.innerHTML : null;
    }
    try {
      bodyEl.innerHTML = pmShopSpendSheetHtml(
        payload,
        Array.isArray(historyItems) ? historyItems : [],
      );
      if (histKeep != null) {
        var hostNew = wrap.querySelector("[data-pm-shop-history-host]");
        if (hostNew) hostNew.innerHTML = histKeep;
      }
    } catch (eRebuild) {}
  }

  function renderPmShopRedeemHistory(items) {
    var rows = Array.isArray(items) ? items : [];
    if (!rows.length) {
      return (
        '<div class="vc-staff-pm-shop-spend__empty" data-pm-shop-history-empty>' +
        "<p>Nessun riscatto registrato ancora.</p></div>"
      );
    }
    return (
      '<ul class="vc-staff-pm-shop-spend__history" data-pm-shop-history>' +
      rows
        .map(function (row) {
          var reason = String(row.reason || "").trim();
          return (
            '<li class="vc-staff-pm-shop-spend__row">' +
            '<div class="vc-staff-pm-shop-spend__row-main">' +
            "<strong>" +
            esc(row.rewardLabel || "Premio " + (row.tier || "")) +
            "</strong>" +
            '<span class="vc-staff-pm-shop-spend__meta">' +
            esc(formatShopRedeemWhen(row.createdAt)) +
            " \u00B7 −" +
            esc(String(row.pointCost != null ? row.pointCost : 0)) +
            " pt \u00B7 " +
            esc(shopRedeemSourceLabel(row.source)) +
            "</span>" +
            (reason
              ? '<span class="vc-staff-pm-shop-spend__why">Perché: ' + esc(reason) + "</span>"
              : "") +
            "</div></li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function pmShopSpendSheetHtml(payload, historyItems) {
    var partner = ((payload || {}).partner || {}) || {};
    var pts = Number(partner.points != null ? partner.points : 0) || 0;
    var spent = Number(partner.redeemSpend != null ? partner.redeemSpend : 0) || 0;
    var canWrite = canWriteStaffManage();
    var shop = partner.shop || {};
    /* pmShopManualOnly1: solo premi a consegna manuale (ticket) — Custom/VIP automatici fuori */
    var tiers = (Array.isArray(shop.tiers) ? shop.tiers : []).filter(function (tier) {
      var mode = String(tier.mode || "");
      var n = Number(tier.tier);
      if (mode === "ticket") return true;
      if (mode === "instant") return false;
      return n === 150 || n === 200 || n === 250;
    });
    /* pmShopCleanSheet1 + pmSheetTrim1: niente Spesi/Spendibili in sheet — solo bottoni + storico */
    var html =
      '<div class="vc-staff-pm-shop-spend__shell vc-no-sfx" data-pm-shop-spend-root>' +
      '<span class="vc-sr-only" aria-hidden="true"><b data-pm-shop-spent>' +
      esc(String(spent)) +
      "</b><b data-pm-shop-balance>" +
      esc(String(pts)) +
      "</b></span>";

    if (canWrite) {
      html += '<div class="vc-staff-pm-shop-spend__tiers" data-pm-shop-tiers>';
      if (!tiers.length) {
        html +=
          '<p class="vc-staff-stat-sheet__hint">Nessun premio manuale nel catalogo. Ricarica il profilo.</p>';
      } else {
        tiers.forEach(function (tier) {
          var costLabel = esc(String(tier.cost != null ? tier.cost : tier.tier)) + " pt";
          var rewardLabel = esc(tier.reward || "Premio " + tier.tier);
          var disabled = Boolean(tier.blocked) || !tier.canAfford;
          html +=
            '<button type="button" class="vc-staff-stat-sheet__act is-pos vc-staff-pm-shop-spend__tier-btn vc-no-sfx' +
            (disabled ? " is-unaffordable" : "") +
            '" data-stat-act="pm_shop_redeem" data-pm-shop-tier="' +
            esc(String(tier.tier)) +
            '"' +
            (disabled ? " disabled" : "") +
            ' title="' +
            esc(tier.reward || "") +
            '">' +
            '<span class="vc-staff-pm-shop-spend__tier-cost">' +
            costLabel +
            "</span> " +
            rewardLabel +
            "</button>";
        });
      }
      html +=
        "</div>" +
        '<p class="vc-staff-stat-sheet__hint" data-pm-shop-status hidden></p>';
    }

    html +=
      '<div class="vc-staff-pm-shop-spend__history-wrap">' +
      "<h3>Storico riscatti</h3>" +
      '<div data-pm-shop-history-host>' +
      renderPmShopRedeemHistory(historyItems) +
      "</div></div></div>";
    return html;
  }

  function buildReasonListHtml(kind, entries, opts) {
    opts = opts || {};
    var meta = reasonListKindMeta(kind);
    var canWrite = Boolean(opts.canWrite);
    var isSelf = Boolean(opts.isSelf);
    var rmAction = kindToRmAction(kind);
    var pos = Number(
      (((opts.payload || {}).valutazioni || {}).positive != null
        ? opts.payload.valutazioni.positive
        : 0) || 0,
    );
        var canTradeNeg =
      kind === "val-neg" &&
      pos >= 3 &&
      (canWrite || isSelf);
    var canTradeWarn = canWrite && !isSelf && kind === "warn" && pos >= 1;
    var canFreeRm =
      canWrite &&
      Boolean(rmAction) &&
      !(isSelf && (kind === "val-neg" || kind === "warn"));
    var listPart = "";
    if (!entries.length) {
      listPart =
        '<div class="vc-staff-stat-sheet__empty-card is-' +
        meta.tone +
        '">' +
        '<span class="vc-staff-stat-sheet__empty-ico" aria-hidden="true"><i class="fa ' +
        meta.icon +
        '"></i></span>' +
        '<p class="vc-staff-stat-sheet__empty">' +
        esc(meta.empty) +
        "</p></div>";
    } else {
      var tradeHint = "";
      if (kind === "val-neg" && (canWrite || isSelf)) {
        if (!canTradeNeg) {
          tradeHint =
            '<p class="vc-staff-stat-sheet__trade-hint">' +
            (isSelf
              ? "Per togliere una val − da soli serve lo scambio obbligatorio di <b>3</b> val + (ora: "
              : "Compensa con scambio: servono almeno <b>3</b> val + (ora: ") +
            esc(String(pos)) +
            ").</p>";
        } else {
          tradeHint =
            '<p class="vc-staff-stat-sheet__trade-hint">Val + disponibili: <b>' +
            esc(String(pos)) +
            "</b>. Usa <b>Compensa 3+</b> sulla voce" +
            (isSelf ? " (rimozione libera non consentita sul proprio profilo)." : ", oppure Rimuovi.") +
            "</p>";
        }
      } else if (kind === "warn" && canWrite && !isSelf) {
        if (!canTradeWarn) {
          tradeHint =
            '<p class="vc-staff-stat-sheet__trade-hint">Scambio val + \u2192 warn: serve almeno <b>1</b> val + (ora: ' +
            esc(String(pos)) +
            ").</p>";
        } else {
          tradeHint =
            '<p class="vc-staff-stat-sheet__trade-hint">Val + disponibili: <b>' +
            esc(String(pos)) +
            "</b>. Usa Compensa / Scambia sulla voce, oppure Rimuovi.</p>";
        }
      } else if (kind === "warn" && isSelf) {
        tradeHint =
          '<p class="vc-staff-stat-sheet__trade-hint">I warn staff <b>non</b> si possono togliere da soli: serve High Staff.</p>';
      }
      listPart =
        '<div class="vc-staff-stat-sheet__summary is-' +
        meta.tone +
        '">' +
        '<span class="vc-staff-stat-sheet__summary-ico" aria-hidden="true"><i class="fa ' +
        meta.icon +
        '"></i></span>' +
        '<div class="vc-staff-stat-sheet__summary-copy">' +
        '<span class="vc-staff-stat-sheet__summary-count">' +
        entries.length +
        "</span>" +
        '<span class="vc-staff-stat-sheet__summary-label">' +
        (entries.length === 1 ? "voce in elenco" : "voci in elenco") +
        "</span></div></div>" +
        tradeHint +
        '<ul class="vc-staff-stat-sheet__list is-' +
        meta.tone +
        '">' +
        entries
          .map(function (row, idx) {
            var id = row.id != null ? row.id : idx + 1;
            var acts = "";
            if (canTradeNeg || canTradeWarn || canFreeRm) {
              acts = '<span class="vc-staff-stat-sheet__acts">';
              if (canTradeNeg) {
                acts +=
                  '<button type="button" class="vc-staff-stat-sheet__trade" data-stat-act="neg_trade" data-rm-id="' +
                  esc(String(id)) +
                  '" title="Scambia 3 val + per rimuovere questa val \u2212">Compensa 3+</button>';
              }
              if (canTradeWarn) {
                acts +=
                  '<button type="button" class="vc-staff-stat-sheet__trade" data-stat-act="warn_trade" data-rm-id="' +
                  esc(String(id)) +
                  '" title="Scambia val + per rimuovere questo warn">Scambia val +</button>';
              }
              if (canFreeRm) {
                acts +=
                  '<button type="button" class="vc-staff-stat-sheet__rm" data-stat-act="' +
                  esc(rmAction) +
                  '" data-rm-id="' +
                  esc(String(id)) +
                  '" aria-label="' +
                  esc(
                    kind === "warn"
                      ? "Rimuovi warn staff"
                      : kind === "val-neg"
                        ? "Rimuovi valutazione negativa"
                        : "Rimuovi valutazione positiva",
                  ) +
                  '">Rimuovi</button>';
              }
              acts += "</span>";
            }
            return (
              '<li class="vc-staff-stat-sheet__item is-reason is-' +
              meta.tone +
              '">' +
              '<span class="vc-staff-stat-sheet__item-ico" aria-hidden="true"><i class="fa ' +
              meta.icon +
              '"></i></span>' +
              '<div class="vc-staff-stat-sheet__item-copy">' +
              '<span class="vc-staff-stat-sheet__item-tag">#' +
              esc(id) +
              "</span>" +
              '<span class="vc-staff-stat-sheet__item-main">' +
              esc(row.text || "") +
              "</span></div>" +
              acts +
              "</li>"
            );
          })
          .join("") +
        "</ul>";
    }
    return sheetActionBarHtml(kind, { isSelf: isSelf }) + listPart;
  }

  function tryConsumeStaffOpenFromUrl(root, payload) {
    /* pauseOutInbox1 / pauseResoNotifProfile1: notifica → staffOpen=pause|resoconto|pm-punti-tolti */
    if (!root || !payload) return;
    try {
      if (root.getAttribute("data-vc-staff-open-done") === "1") return;
      var q = new URLSearchParams(global.location.search || "");
      var open = String(q.get("staffOpen") || "")
        .trim()
        .toLowerCase();
      var kind = "";
      if (open === "pause") kind = "pause";
      else if (open === "pm-punti-tolti" || open === "punti-tolti" || open === "punti") kind = "pm-punti-tolti";
      else if (open === "resoconto" || open === "resoconti") kind = "resoconto";
      if (!kind) return;
      /* notifSheetReadyOpen1: tieni hint id PRIMA di strip URL */
      var focusResoId = String(q.get("resoId") || "").trim();
      var focusPauseId = String(q.get("pauseId") || "").trim();
      root.setAttribute("data-vc-staff-open-done", "1");
      q.delete("staffOpen");
      q.delete("pauseId");
      q.delete("resoId");
      var next = q.toString();
      var path = String(global.location.pathname || "/user/");
      global.history.replaceState({}, "", path + (next ? "?" + next : "") + String(global.location.hash || ""));
      global.setTimeout(function () {
        try {
          if (kind === "resoconto") {
            openProfileResoSheet(root.__vcStaffPayload || payload, root, { focusId: focusResoId });
          } else {
            openStatSheet(root.__vcStaffPayload || payload, kind, root, {
              focusId: focusPauseId || focusResoId,
            });
          }
        } catch (eOpen) {}
      }, 40);
    } catch (eConsume) {}
  }

  function openStatSheet(payload, kind, root, opts) {
    opts = opts || {};
    closeStatSheet();
    if (kind === "pm-punti-tolti" && !canOpenPmPuntiTolti(payload)) return;
    if (kind === "resoconto" && !canOpenResoconto(payload)) return;
    if (kind === "resoconto") {
      openProfileResoSheet(payload, root, opts);
      return;
    }
    var title = "Dettaglio";
    var body = "";
    var pauseHistoryRef = [];
    var toneClass = "";
    var canWrite = canWriteStaffManage();
    var isSelf = isOwnStaffProfile(payload);
    if (kind === "pause") {
      /* pauseReviewProfile1: HS → form inbox accettazione; altri → solo calendario */
      if (canWriteStaffManage()) {
        openProfilePauseSheet(payload, root);
        return;
      }
      title = "Calendario pause";
      toneClass = " is-pause-sheet";
      pauseHistoryRef = historyFromPayloadOrDom(payload, root);
      var ranges = resolvePauseRanges(pauseHistoryRef);
      var initial = pickCalendarMonth(ranges);
      body =
        '<div data-pause-sheet-root>' +
        pauseTradeHtml(payload) +
        '<div data-pause-cal-host>' +
        buildMiniCalHtml(pauseHistoryRef, initial.y, initial.m) +
        "</div></div>";
    } else if (kind === "pm-points") {
      title = "Gestione Punti PM";
      toneClass = " is-pm-points-sheet";
      body = pmPointsSheetHtml(payload);
    } else if (kind === "pm-punti-tolti") {
      title = "Punti tolti";
      toneClass = " is-pm-punti-tolti-sheet";
      body = pmPuntiToltiSheetHtml();
    } else if (kind === "pm-shop-spend") {
      title = "Spesi in shop";
      toneClass = " is-pm-shop-spend-sheet";
      body = pmShopSpendSheetHtml(payload, []);
    } else {
      var meta = reasonListKindMeta(kind);
      title = meta.title;
      toneClass = " is-" + meta.tone + "-sheet";
      body = buildReasonListHtml(kind, reasonEntriesFromPayload(payload, kind), {
        canWrite: canWrite,
        isSelf: isSelf,
        payload: payload,
      });
    }

    var wrap = global.document.createElement("div");
    wrap.id = "vc-staff-stat-sheet";
    wrap.className = "vc-staff-stat-sheet" + toneClass + " vc-no-sfx";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.__vcStatPayload = payload;
    wrap.__vcStatKind = kind;
    wrap.__vcStatRoot = root;
    wrap.innerHTML =
      '<button type="button" class="vc-staff-stat-sheet__backdrop" data-stat-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-staff-stat-sheet__panel vc-no-sfx">' +
      '<div class="vc-staff-stat-sheet__head">' +
      '<h2 class="vc-staff-stat-sheet__title">' +
      esc(title) +
      "</h2>" +
      '<button type="button" class="vc-staff-stat-sheet__close" data-stat-close="1" aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-staff-stat-sheet__body vc-no-sfx" data-stat-body="1">' +
      body +
      "</div></div>";

    wrap.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.closest && t.closest("[data-stat-close]")) {
        closeStatSheet();
        return;
      }
      var actBtn = t.closest ? t.closest("[data-stat-act]") : null;
      if (actBtn && wrap.contains(actBtn)) {
        ev.preventDefault();
        ev.stopPropagation();
        handleStatSheetAction(wrap, actBtn);
        return;
      }
      var nav = t.closest ? t.closest("[data-cal-nav]") : null;
      if (!nav || !wrap.contains(nav)) return;
      ev.preventDefault();
      var delta = Number(nav.getAttribute("data-cal-nav") || "0");
      var cal = wrap.querySelector(".vc-staff-mini-cal");
      if (!cal) return;
      var cy = Number(cal.getAttribute("data-y") || "0");
      var cm = Number(cal.getAttribute("data-m") || "0");
      cm += delta;
      if (cm < 1) {
        cm = 12;
        cy -= 1;
      } else if (cm > 12) {
        cm = 1;
        cy += 1;
      }
      var bodyEl = wrap.querySelector("[data-stat-body]");
      if (bodyEl) {
        var calHost = bodyEl.querySelector("[data-pause-cal-host]");
        if (calHost) {
          calHost.innerHTML = buildMiniCalHtml(pauseHistoryRef, cy, cm);
        } else {
          var trade = bodyEl.querySelector(".vc-staff-pause-trade__card, .vc-staff-pause-trade-card");
          var tradeHtmlKeep = trade ? trade.outerHTML : pauseTradeHtml(wrap.__vcStatPayload);
          bodyEl.innerHTML = tradeHtmlKeep + buildMiniCalHtml(pauseHistoryRef, cy, cm);
        }
      }
    });

    global.document.body.appendChild(wrap);
    try {
      global.document.documentElement.classList.add("vc-staff-stat-sheet-open");
    } catch (e2) {}
    unlockSheetPageChrome();
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcPinPageScroll === "function") global.__vcPinPageScroll();
    } catch (ePin) {}
    unlockSheetPageChrome();

    if (kind === "pm-punti-tolti") {
      loadPmPuntiToltiIntoSheet(wrap);
    }
    if (kind === "pm-shop-spend") {
      var shopUid = targetUserIdFromPayload(payload);
      var host = wrap.querySelector("[data-pm-shop-history-host]");
      if (host) host.innerHTML = '<p class="vc-staff-stat-sheet__hint">Carico storico…</p>';
      fetchPmShopRedeems(shopUid)
        .then(function (out) {
          if (!wrap.isConnected) return;
          var hostEl = wrap.querySelector("[data-pm-shop-history-host]");
          if (!hostEl) return;
          if (!out.res.ok || !out.data || !out.data.ok) {
            hostEl.innerHTML =
              '<p class="vc-staff-stat-sheet__hint is-error">' +
              esc((out.data && out.data.message) || "Storico non disponibile.") +
              "</p>";
            return;
          }
          if (out.data.partner) {
            applyPartnerShopSnapshot(payload, wrap.__vcStatRoot, out.data.partner);
            rebuildPmShopSpendSheet(wrap, out.data.items || []);
            return;
          }
          hostEl.innerHTML = renderPmShopRedeemHistory(out.data.items || []);
        })
        .catch(function () {
          if (!wrap.isConnected) return;
          var hostEl2 = wrap.querySelector("[data-pm-shop-history-host]");
          if (hostEl2) {
            hostEl2.innerHTML =
              '<p class="vc-staff-stat-sheet__hint is-error">Errore nel caricamento storico.</p>';
          }
        });
    }
  }

  function askOptionalPosTrade(payload, kindLabel) {
    var pos = Number(
      (((payload || {}).valutazioni || {}).positive != null
        ? payload.valutazioni.positive
        : 0) || 0,
    );
    return dlgPrompt({
      title: "Scambio opzionale",
      message:
        "Quante valutazioni positive scambiare insieme alla rimozione di questa " +
        kindLabel +
        "? Disponibili: " +
        pos +
        ". Lascia vuoto o 0 per non scambiare.",
      label: "Valutazioni positive",
      placeholder: "vuoto = nessuna",
      defaultValue: "",
      confirmLabel: "Continua",
      cancelLabel: "Annulla",
      danger: false,
      icon: "fa-exchange",
      maxLength: 3,
    }).then(function (raw) {
      if (raw == null) return null;
      var t = String(raw || "").trim();
      if (!t) return 0;
      var n = parseInt(t, 10);
      if (!Number.isInteger(n) || n < 0) {
        return dlgAlert({
          title: "Numero non valido",
          message: "Inserisci un intero ≥ 0, oppure lascia vuoto.",
        }).then(function () {
          return null;
        });
      }
      if (n === 0) return 0;
      if (n > pos) {
        return dlgAlert({
          title: "Positive insufficienti",
          message: "Ne ha solo " + pos + ", non puoi scambiarne " + n + ".",
        }).then(function () {
          return null;
        });
      }
      return n;
    });
  }

  function handleStatSheetAction(wrap, btn) {
    if (!wrap || !btn || btn.disabled) return;
    var action = String(btn.getAttribute("data-stat-act") || "");
    var payload = wrap.__vcStatPayload || {};
    var uid = targetUserIdFromPayload(payload);
    if (!/^\d{17,20}$/.test(uid)) return;
    var root = wrap.__vcStatRoot;
    var reload =
      root && root.__vcStaffReload
        ? root.__vcStaffReload
        : function () {
            closeStatSheet();
          };

    if (action === "pm_shop_redeem") {
      if (!canWriteStaffManage()) {
        dlgAlert({ message: "Solo High Staff pu\u00f2 riscattare premi da qui." });
        return;
      }
      var tier = Number(btn.getAttribute("data-pm-shop-tier"));
      var statusElShop = wrap.querySelector("[data-pm-shop-status]");
      if (!Number.isFinite(tier) || tier < 1) {
        dlgAlert({ message: "Premio non valido." });
        return;
      }
      btn.disabled = true;
      btn.classList.add("is-busy");
      btn.setAttribute("aria-busy", "true");
      if (statusElShop) {
        statusElShop.hidden = true;
        statusElShop.textContent = "";
        statusElShop.classList.remove("is-error");
      }
      showProfileToast("Riscatto in corso…", false);
      postPmShopRedeem({
        tier: tier,
        userId: uid,
        reason: "Riscatto manuale High Staff (sito)",
      })
        .then(function (out) {
          btn.classList.remove("is-busy");
          btn.removeAttribute("aria-busy");
          if (!out.res.ok || !out.data || !out.data.ok) {
            var errMsg = (out.data && out.data.message) || "Riscatto non riuscito.";
            if (out.data && (out.data.shop || out.data.error === "already_owned")) {
              applyPartnerShopSnapshot(payload, root, out.data);
              rebuildPmShopSpendSheet(wrap, Array.isArray(out.data.redeems) ? out.data.redeems : null);
            } else {
              btn.disabled = false;
            }
            if (!showProfileToast(errMsg, true)) {
              if (statusElShop) {
                statusElShop.hidden = false;
                statusElShop.classList.add("is-error");
                statusElShop.textContent = errMsg;
              } else {
                dlgAlert({ message: errMsg });
              }
            }
            return;
          }
          var okMsg = (out.data && out.data.message) || "Premio riscattato.";
          showProfileToast(okMsg, false);
          applyPartnerShopSnapshot(payload, root, out.data);
          var balShop = wrap.querySelector("[data-pm-shop-balance]");
          var spentShop = wrap.querySelector("[data-pm-shop-spent]");
          if (balShop && out.data.points != null) balShop.textContent = String(out.data.points);
          if (spentShop && out.data.redeemSpend != null) {
            spentShop.textContent = String(out.data.redeemSpend);
          }
          try {
            if (root) {
              var spentCards = root.querySelectorAll(
                '[data-vc-stat="pm-shop-spend"] .vc-user-profile-mini__value, [data-vc-stat="pm-shop-spend"] .vc-user-profile-stat__value',
              );
              for (var si = 0; si < spentCards.length; si += 1) {
                if (out.data.redeemSpend != null) spentCards[si].textContent = String(out.data.redeemSpend);
              }
              var ptsCards = root.querySelectorAll(
                '[data-vc-stat="pm-points"] .vc-user-profile-mini__value, [data-vc-stat="pm-points"] .vc-user-profile-stat__value',
              );
              for (var pi = 0; pi < ptsCards.length; pi += 1) {
                if (out.data.points != null) ptsCards[pi].textContent = String(out.data.points);
              }
            }
          } catch (eUpd) {}
          rebuildPmShopSpendSheet(
            wrap,
            Array.isArray(out.data.redeems) ? out.data.redeems : [],
          );
          if (!Array.isArray(out.data.redeems) && /^\d{17,20}$/.test(uid)) {
            fetchPmShopRedeems(uid).then(function (hOut) {
              if (!wrap.isConnected || !hOut.data || !hOut.data.ok) return;
              var h = wrap.querySelector("[data-pm-shop-history-host]");
              if (h) h.innerHTML = renderPmShopRedeemHistory(hOut.data.items || []);
            });
          }
          /* no full profile reload — evita spinner/remount mentre lo sheet è aperto */
        })
        .catch(function () {
          btn.disabled = false;
          btn.classList.remove("is-busy");
          btn.removeAttribute("aria-busy");
          showProfileToast("Errore di rete sul riscatto.", true);
        });
      return;
    }

    if (action === "pm_points_add" || action === "pm_points_rm") {
      if (!canWriteStaffManage()) {
        dlgAlert({ message: "Solo High Staff pu\u00f2 gestire i punti PM." });
        return;
      }
      var amtEl = wrap.querySelector("[data-pm-points-amt]");
      var reasonEl = wrap.querySelector("[data-pm-points-reason]");
      var statusEl = wrap.querySelector("[data-pm-points-status]");
      var amount = amtEl ? Number.parseInt(String(amtEl.value || "1"), 10) : 1;
      var reason = reasonEl ? String(reasonEl.value || "").trim() : "";
      if (!Number.isInteger(amount) || amount < 1 || amount > 500) {
        dlgAlert({ message: "Quantit\u00e0 punti tra 1 e 500." });
        return;
      }
      var apiAction = action === "pm_points_add" ? "points_add" : "points_remove";
      var label = action === "pm_points_add" ? "Aggiunta" : "Rimozione";
      btn.disabled = true;
      if (statusEl) {
        statusEl.hidden = true;
        statusEl.textContent = "";
        statusEl.classList.remove("is-error");
      }
      showProfileToast(label + " in corso…", false);
      postPmPointsAction({
        action: apiAction,
        userId: uid,
        amount: amount,
        reason: reason,
      })
        .then(function (out) {
          btn.disabled = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            var errMsg = (out.data && out.data.message) || "Operazione non riuscita.";
            if (!showProfileToast(errMsg, true)) {
              if (statusEl) {
                statusEl.hidden = false;
                statusEl.classList.add("is-error");
                statusEl.textContent = errMsg;
              } else {
                dlgAlert({ message: errMsg });
              }
            }
            return;
          }
          var bal = wrap.querySelector("[data-pm-points-balance]");
          if (bal && out.data.points != null) bal.textContent = String(out.data.points);
          var earnedEl = wrap.querySelector("[data-pm-points-earned]");
          var spentEl = wrap.querySelector("[data-pm-points-spent]");
          if (spentEl && out.data.redeemSpend != null) spentEl.textContent = String(out.data.redeemSpend);
          if (earnedEl) {
            var earnedNow =
              out.data.pointsEarned != null
                ? out.data.pointsEarned
                : Number(out.data.points || 0) + Number(out.data.redeemSpend || 0);
            earnedEl.textContent = String(earnedNow);
          }
          if (payload.partner) {
            if (out.data.points != null) payload.partner.points = out.data.points;
            if (out.data.redeemSpend != null) payload.partner.redeemSpend = out.data.redeemSpend;
            if (out.data.partnerCount != null) payload.partner.partnerCount = out.data.partnerCount;
            if (out.data.pointsEarned != null) payload.partner.pointsEarned = out.data.pointsEarned;
            else if (out.data.points != null || out.data.redeemSpend != null) {
              payload.partner.pointsEarned =
                Number(payload.partner.points || 0) + Number(payload.partner.redeemSpend || 0);
            }
          }
          if (root && root.__vcStaffPayload && root.__vcStaffPayload.partner) {
            if (out.data.points != null) root.__vcStaffPayload.partner.points = out.data.points;
            if (out.data.redeemSpend != null) root.__vcStaffPayload.partner.redeemSpend = out.data.redeemSpend;
            if (out.data.partnerCount != null) root.__vcStaffPayload.partner.partnerCount = out.data.partnerCount;
            if (payload.partner && payload.partner.pointsEarned != null) {
              root.__vcStaffPayload.partner.pointsEarned = payload.partner.pointsEarned;
            }
          }
          var mini = root
            ? root.querySelector(
                '[data-vc-stat="pm-points"] .vc-user-profile-mini__value, [data-vc-stat="pm-points"] .vc-user-profile-stat__value',
              )
            : null;
          if (mini && out.data.points != null) mini.textContent = String(out.data.points);
          /* Aggiorna "Spesi in shop" / Partner se presenti nel grid. */
          try {
            if (root && (out.data.redeemSpend != null || out.data.partnerCount != null)) {
              var minis = root.querySelectorAll(".vc-user-profile-mini, .vc-user-profile-stat");
              for (var mi = 0; mi < minis.length; mi += 1) {
                var lab = minis[mi].querySelector(
                  ".vc-user-profile-mini__label, .vc-user-profile-stat__label",
                );
                var val = minis[mi].querySelector(
                  ".vc-user-profile-mini__value, .vc-user-profile-stat__value",
                );
                if (!lab || !val) continue;
                var lt = String(lab.textContent || "").trim().toLowerCase();
                if (out.data.redeemSpend != null && lt.indexOf("spesi") !== -1) {
                  val.textContent = String(out.data.redeemSpend);
                }
                if (out.data.partnerCount != null && lt === "partner") {
                  val.textContent = String(out.data.partnerCount);
                }
              }
            }
          } catch (eSpendUi) {}
          var okMsg =
            (out.data.message || "Punti aggiornati.") +
            (action === "pm_points_rm" ? " Registrato in Punti tolti." : "");
          if (!showProfileToast(okMsg, false) && statusEl) {
            statusEl.hidden = false;
            statusEl.classList.remove("is-error");
            statusEl.textContent = okMsg;
          }
          try {
            closeStatSheet();
          } catch (eClose) {}
          if (typeof reload === "function") {
            try {
              reload();
            } catch (eRel) {}
          }
        })
        .catch(function () {
          btn.disabled = false;
          if (!showProfileToast("Errore di rete.", true)) {
            if (statusEl) {
              statusEl.hidden = false;
              statusEl.classList.add("is-error");
              statusEl.textContent = "Errore di rete.";
            } else {
              dlgAlert({ message: "Errore di rete." });
            }
          }
        });
      return;
    }

    if (action === "pos_pause_trade") {
      var posEl = wrap.querySelector("[data-pause-trade-pos]");
      var daysEl = wrap.querySelector("[data-pause-trade-days]");
      var posCount = posEl ? Number(posEl.value || 0) : 0;
      var pauseDays = daysEl ? Number(daysEl.value || 0) : 0;
      if (!Number.isInteger(posCount) || posCount < 1 || !Number.isInteger(pauseDays) || pauseDays < 1) {
        dlgAlert({
          message: "Inserisci un numero valido di valutazioni positive e giorni (≥ 1).",
        });
        return;
      }
      ensureActionDialogs()
        .then(function () {
          return dlgConfirm({
            title: "Valutazioni positive → pausa",
            message:
              "Convertire " +
              posCount +
              " valutazion" +
              (posCount === 1 ? "e positiva" : "i positive") +
              " in +" +
              pauseDays +
              " giorn" +
              (pauseDays === 1 ? "o" : "i") +
              " di pausa?",
            confirmLabel: "Scambia",
            cancelLabel: "Annulla",
            icon: "fa-coffee",
          });
        })
        .then(function (ok) {
          if (!ok) return;
          btn.disabled = true;
          return postValTradeAction({
            action: "pos_pause_trade",
            userId: uid,
            positiveCount: posCount,
            pauseDays: pauseDays,
          }).then(function (out) {
            btn.disabled = false;
            if (!out.res.ok || !out.data || !out.data.ok) {
              return dlgAlert({
                title: "Operazione non riuscita",
                message: (out.data && out.data.message) || "Scambio non riuscito.",
              });
            }
            closeStatSheet();
            if (typeof reload === "function") reload();
          });
        })
        .catch(function () {
          btn.disabled = false;
          dlgAlert({ message: "Errore di rete." });
        });
      return;
    }

    if (action === "neg_trade" || action === "warn_trade") {
      var tradeId = Number(btn.getAttribute("data-rm-id") || 0);
      if (!Number.isInteger(tradeId) || tradeId < 1) {
        dlgAlert({ message: "ID voce non valido." });
        return;
      }
      var viewingSelf = isOwnStaffProfile(payload);
      if (action === "warn_trade" && (viewingSelf || !canWriteStaffManage())) {
        dlgAlert({
          message: viewingSelf
            ? "Non puoi toglierti i warn da solo: serve High Staff."
            : "Solo High Staff pu\u00f2 scambiare val + per rimuovere un warn.",
        });
        return;
      }
      if (action === "neg_trade" && !viewingSelf && !canWriteStaffManage()) {
        dlgAlert({ message: "Non autorizzato." });
        return;
      }
      var posAvail = Number(
        (((payload || {}).valutazioni || {}).positive != null ? payload.valutazioni.positive : 0) || 0,
      );
      ensureActionDialogs()
        .then(function () {
          if (action === "neg_trade") {
            if (posAvail < 3) {
              return dlgAlert({
                message: "Servono almeno 3 val + per compensare (ora: " + posAvail + ").",
              }).then(function () {
                return null;
              });
            }
            return dlgConfirm({
              title: "Compensa val −",
              message: "Scambiare 3 val + per rimuovere la val − #" + tradeId + "?",
              confirmLabel: "Compensa",
              cancelLabel: "Annulla",
              icon: "fa-exchange",
            }).then(function (ok) {
              return ok ? { mode: "neg_trade", negativeId: tradeId } : null;
            });
          }
          return dlgPrompt({
            title: "Scambia val + → warn",
            message:
              "Quante val + usare per togliere il warn #" + tradeId + "? Disponibili: " + posAvail + ".",
            label: "Val + da scambiare",
            placeholder: "es. 1",
            defaultValue: String(Math.min(Math.max(1, posAvail), 10) || 1),
            confirmLabel: "Continua",
            cancelLabel: "Annulla",
            maxLength: 3,
            icon: "fa-exchange",
          }).then(function (raw) {
            if (raw == null) return null;
            var n = Math.floor(Number(String(raw).trim()));
            if (!Number.isInteger(n) || n < 1) {
              return dlgAlert({ message: "Numero val + non valido." }).then(function () {
                return null;
              });
            }
            if (n > posAvail) {
              return dlgAlert({
                message: "Non ci sono abbastanza val + (ne ha " + posAvail + ").",
              }).then(function () {
                return null;
              });
            }
            return dlgConfirm({
              title: "Conferma scambio warn",
              message: "Scambiare " + n + " val + e rimuovere il warn #" + tradeId + "?",
              confirmLabel: "Scambia",
              cancelLabel: "Annulla",
              danger: true,
              icon: "fa-exchange",
            }).then(function (ok) {
              return ok
                ? {
                    mode: "warn_rm",
                    removeId: tradeId,
                    positiveTradeCount: n,
                    reason: "Scambio " + n + " val + → rimozione warn #" + tradeId,
                  }
                : null;
            });
          });
        })
        .then(function (pack) {
          if (!pack) return;
          btn.disabled = true;
          var post =
            pack.mode === "neg_trade"
              ? postValTradeAction({
                  action: "neg_trade",
                  userId: uid,
                  negativeId: pack.negativeId,
                })
              : postManageAction({
                  action: "warn_rm",
                  userId: uid,
                  removeId: pack.removeId,
                  positiveTradeCount: pack.positiveTradeCount,
                  reason: pack.reason,
                });
          return post.then(function (out) {
            btn.disabled = false;
            if (!out.res.ok || !out.data || !out.data.ok) {
              return dlgAlert({
                title: "Operazione non riuscita",
                message: (out.data && out.data.message) || "Scambio non riuscito.",
              });
            }
            closeStatSheet();
            if (typeof reload === "function") reload();
          });
        })
        .catch(function () {
          btn.disabled = false;
          dlgAlert({ message: "Errore di rete." });
        });
      return;
    }

    var isRm = action.indexOf("_rm") >= 0;
    var rmId = Number(btn.getAttribute("data-rm-id") || 0);
    var titles = {
      val_pos: {
        title: "Valutazione positiva",
        msg: "Assegnare una valutazione positiva?",
        confirmLabel: "Assegna",
        danger: false,
        icon: "fa-thumbs-up",
      },
      val_neg: {
        title: "Valutazione negativa",
        msg: "Assegnare una valutazione negativa?",
        confirmLabel: "Assegna",
        danger: true,
        icon: "fa-thumbs-down",
      },
      warn_add: {
        title: "Warn staff",
        msg: "Assegnare un warn staff?",
        confirmLabel: "Assegna",
        danger: true,
        icon: "fa-exclamation-triangle",
      },
      val_pos_rm: {
        title: "Rimuovi valutazione positiva",
        msg: "Rimuovere la valutazione positiva #" + rmId + "?",
        confirmLabel: "Rimuovi",
        danger: true,
        icon: "fa-trash-o",
      },
      val_neg_rm: {
        title: "Rimuovi valutazione negativa",
        msg: "Rimuovere la valutazione negativa #" + rmId + "?",
        confirmLabel: "Rimuovi",
        danger: true,
        icon: "fa-trash-o",
      },
      warn_rm: {
        title: "Rimuovi warn staff",
        msg: "Rimuovere il warn staff #" + rmId + "?",
        confirmLabel: "Rimuovi",
        danger: true,
        icon: "fa-trash-o",
      },
    };
    var meta = titles[action];
    if (!meta) return;

    var viewingSelfRm = isOwnStaffProfile(payload);
    if (viewingSelfRm && (action === "val_neg_rm" || action === "warn_rm")) {
      dlgAlert({
        message:
          action === "warn_rm"
            ? "Non puoi toglierti i warn da solo: serve High Staff."
            : "Sul tuo profilo puoi togliere una val − solo con Compensa 3+ (scambio obbligatorio).",
      });
      return;
    }
    if (!canWriteStaffManage()) {
      dlgAlert({ message: "Solo High Staff pu\u00f2 eseguire questa azione." });
      return;
    }

    var wantsOptionalTrade = action === "warn_rm" || action === "val_neg_rm";
    var tradeKindLabel = action === "warn_rm" ? "warn staff" : "valutazione negativa";

    var flow = isRm
      ? ensureActionDialogs()
          .then(function () {
            return dlgConfirm({
              title: meta.title,
              message: meta.msg,
              confirmLabel: meta.confirmLabel || "Rimuovi",
              cancelLabel: "Annulla",
              danger: true,
              icon: meta.icon,
            });
          })
          .then(function (ok) {
            if (!ok) return null;
            if (!wantsOptionalTrade) return { reason: "", trade: 0 };
            return askOptionalPosTrade(payload, tradeKindLabel).then(function (trade) {
              if (trade == null) return null;
              if (!trade) return { reason: "", trade: 0 };
              return dlgConfirm({
                title: "Conferma scambio",
                message:
                  "Rimuovere questa " +
                  tradeKindLabel +
                  " e scambiare anche " +
                  trade +
                  " valutazion" +
                  (trade === 1 ? "e positiva" : "i positive") +
                  "?",
                confirmLabel: "Conferma",
                cancelLabel: "Annulla",
                danger: true,
                icon: "fa-exchange",
              }).then(function (ok2) {
                return ok2 ? { reason: "", trade: trade } : null;
              });
            });
          })
      : askReasonAndConfirm({
          title: meta.title,
          message: meta.msg + " Inserisci il motivo.",
          confirmTitle: meta.title,
          confirmMessage: meta.msg,
          confirmLabel: meta.confirmLabel || "Conferma",
          danger: meta.danger,
          icon: meta.icon,
        }).then(function (reason) {
          return reason == null ? null : { reason: reason, trade: 0 };
        });

    flow
      .then(function (pack) {
        if (pack == null) return;
        var reason = typeof pack === "string" ? pack : pack.reason;
        var trade = typeof pack === "object" && pack ? Number(pack.trade || 0) : 0;
        btn.disabled = true;
        var body = { action: action, userId: uid };
        if (!isRm) body.reason = reason;
        if (isRm) body.removeId = rmId;
        if (isRm && trade > 0) body.positiveTradeCount = trade;
        return postManageAction(body).then(function (out) {
          btn.disabled = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            return dlgAlert({
              title: "Operazione non riuscita",
              message: (out.data && out.data.message) || "Azione non riuscita.",
            });
          }
          closeStatSheet();
          if (typeof reload === "function") reload();
        });
      })
      .catch(function () {
        btn.disabled = false;
        dlgAlert({ message: "Errore di rete." });
      });
  }

  function viewerCanManageProfile(payload) {
    var Modal = global.VCStaffManageModal;
    if (Modal && typeof Modal.viewerCanManageProfile === "function") {
      return Modal.viewerCanManageProfile(payload);
    }
    var p = global.__VC_STAFF_PERMS || {};
    var staffOk = Boolean(p.ok) || global.__VC_STAFF_MENU_ALLOWED === true;
    if (!staffOk) return false;
    var isSelf = payload && payload.isSelf === true;
    if (p.canManage || p.isHighStaff || p.highStaff) return true;
    if (p.isPmGestore || p.canManagePm) return true;
    if (isSelf && staffOk) return true;
    return false;
  }

  function manageBtnHtml(payload, isSelf) {
    var canManage = viewerCanManageProfile(payload);
    var canReso = canOpenResoconto(payload);
    if (!canManage && !canReso) return "";
    var uid = String((payload.identity && payload.identity.userId) || payload.targetUserId || "").trim();
    if (!uid) return "";
    var label = "Gestisci";
    var resoPending = canReso
      ? Math.max(0, Math.floor(Number((payload.resoconto && payload.resoconto.pendingCount) || 0)))
      : 0;
    var items = "";
    if (canManage) {
      items +=
        '<button type="button" class="vc-staff-manage-menu__item" data-vc-staff-manage="' +
        esc(uid) +
        '"><i class="fa fa-sliders" aria-hidden="true"></i><span>Carriera</span><em>Pex &amp; Depex</em></button>';
    }
    if (canReso) {
      items +=
        '<button type="button" class="vc-staff-manage-menu__item' +
        (resoPending ? " has-pending" : "") +
        '" data-vc-staff-reso="1">' +
        '<i class="fa fa-bar-chart" aria-hidden="true"></i><span>Resoconto</span><em>Settimanale</em>' +
        pendingBadgeHtml(resoPending) +
        "</button>";
    }
    return (
      '<div class="vc-staff-manage-cta-wrap' +
      (resoPending ? " has-pending" : "") +
      '">' +
      '<button type="button" class="vc-staff-manage-cta vc-staff-manage-cta--hero' +
      (resoPending ? " has-pending" : "") +
      '" data-vc-staff-manage-toggle="1" aria-expanded="false" aria-haspopup="true" aria-label="' +
      esc(label) +
      (resoPending ? " (" + resoPending + " resoconti in attesa)" : "") +
      '" title="' +
      esc(label) +
      '">' +
      pendingBadgeHtml(resoPending) +
      '<span class="vc-staff-manage-cta__ico" aria-hidden="true"><i class="fa fa-sliders"></i></span>' +
      '<span class="vc-staff-manage-cta__label">' +
      esc(label) +
      "</span></button>" +
      '<div class="vc-staff-manage-menu" data-vc-staff-manage-menu hidden role="menu" aria-label="Gestisci">' +
      items +
      "</div></div>"
    );
  }

  function staffListPickerHtml() {
    return (
      '<div id="vc-staff-list-dock" class="vc-staff-list-dock">' +
      '<button type="button" class="vc-staff-list-fab" data-vc-staff-list-toggle aria-expanded="false" aria-haspopup="true" title="Lista staff" aria-label="Lista staff">' +
      '<span class="vc-staff-list-fab__ico" aria-hidden="true"><i class="fa fa-users"></i></span>' +
      '<span class="vc-staff-list-fab__label">Lista staff</span></button>' +
      '<div class="vc-staff-list-pop" data-vc-staff-list-pop hidden>' +
      '<p class="vc-staff-list-pop__kicker">Organico</p>' +
      '<ul class="vc-staff-list-pop__list" data-vc-staff-list-ul>' +
      '<li class="vc-staff-list-pop__empty">Caricamento\u2026</li>' +
      "</ul></div></div>"
    );
  }

  function compactStaffListRoleLabel(raw) {
    var s = String(raw == null ? "" : raw).trim();
    if (!s) return "";
    var parts = s.split(/\s*&\s*/);
    var keep = [];
    for (var i = 0; i < parts.length; i += 1) {
      var part = String(parts[i] || "").trim();
      if (!part) continue;
            var core = part.replace(/^[^A-Za-z0-9]+/, "").replace(/\s+/g, " ").trim();
      var low = core.toLowerCase();
      if (
        low === "staff" ||
        low === "high staff" ||
        low === "highstaff" ||
        low === "staffer del mese" ||
        low === "staff del mese" ||
        low.indexOf("staffer del mese") !== -1 ||
        low.indexOf("staff del mese") !== -1 ||
        low === "staffer della settimana" ||
        low === "staff della settimana" ||
        low.indexOf("staffer della settimana") !== -1 ||
        low.indexOf("staff della settimana") !== -1
      ) {
        continue;
      }
      keep.push(part);
    }
    return keep.join(" & ");
  }

  function fillStaffListPop(people, currentUserId) {
    var dock = global.document.getElementById("vc-staff-list-dock");
    if (!dock) return;
    var ul = dock.querySelector("[data-vc-staff-list-ul]");
    if (!ul) return;
    var cur = String(currentUserId || "").trim();
    var list = Array.isArray(people) ? people : [];
    // staffTabOrganico1: non sovrascrivere lista piena con [] mentre un fetch è in corso.
    if (
      !list.length &&
      Array.isArray(dock.__vcStaffListLastPeople) &&
      dock.__vcStaffListLastPeople.length
    ) {
      var fabBusy = dock.querySelector("[data-vc-staff-list-toggle]");
      if (fabBusy && fabBusy.classList.contains("is-loading")) return;
    }
    dock.__vcStaffListLastPeople = list;
    if (!list.length) {
      ul.innerHTML = '<li class="vc-staff-list-pop__empty">Nessuno in organico.</li>';
      return;
    }
    ul.innerHTML = list
      .map(function (p) {
        var id = String((p && p.userId) || "").trim();
        if (!id) return "";
        var name = String((p && p.displayName) || id).trim() || id;
        var role = compactStaffListRoleLabel((p && p.roleLabel) || "");
        var avatar = String((p && p.avatarUrl) || "").trim();
        try {
          if (avatar && global.VcDiscordAvatar && typeof global.VcDiscordAvatar.preferStaticUrl === "function") {
            avatar = global.VcDiscordAvatar.preferStaticUrl(avatar, 64) || avatar;
          }
        } catch (eAv) {}
        var isCur = id === cur;
        var chips = "";
        if (p && p.isNew) {
          chips +=
            '<span class="vc-staff-list-pop__chip vc-staff-list-pop__chip--new" title="Nuovo in staff">Nuovo</span>';
        }
        if (p && p.onPause) {
          chips +=
            '<span class="vc-staff-list-pop__chip vc-staff-list-pop__chip--pause" title="In pausa">Pausa</span>';
        }
        if (p && p.isStaffDelMese) {
          chips +=
            '<span class="vc-staff-list-pop__chip vc-staff-list-pop__chip--best" title="Best staff">Best</span>';
        }
        if (p && p.isStaffDelSettimana) {
          chips +=
            '<span class="vc-staff-list-pop__chip vc-staff-list-pop__chip--week" title="Staffer della settimana">Week</span>';
        }
        var avHtml = avatar
          ? '<img src="' +
            esc(avatar) +
            '" alt="" width="22" height="22" loading="eager" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1" data-vc-avatar-static="1" data-user-id="' +
            esc(id) +
            '" onerror="this.onerror=null;this.remove()" />'
          : '<i class="fa fa-user" aria-hidden="true"></i>';
        return (
          '<li class="vc-staff-list-pop__item' +
          (isCur ? " is-current" : "") +
          (p && p.onPause ? " is-paused" : "") +
          '">' +
          '<button type="button" class="vc-staff-list-pop__btn" data-vc-staff-list-go="' +
          esc(id) +
          '"' +
          (isCur ? ' disabled aria-current="page"' : "") +
          ">" +
          '<span class="vc-staff-list-pop__av" aria-hidden="true">' +
          avHtml +
          "</span>" +
          '<span class="vc-staff-list-pop__meta">' +
          '<span class="vc-staff-list-pop__name-row">' +
          '<span class="vc-staff-list-pop__name">' +
          esc(name) +
          "</span>" +
          (chips ? '<span class="vc-staff-list-pop__chips">' + chips + "</span>" : "") +
          "</span>" +
          (role ? '<span class="vc-staff-list-pop__role">' + esc(role) + "</span>" : "") +
          "</span></button></li>"
        );
      })
      .join("");
    try {
      if (typeof global.VcWakeDeferredMedia === "function") global.VcWakeDeferredMedia(ul);
    } catch (eWakeFill) {}
  }

  function setStaffListOpen(dock, open) {
    if (!dock) return;
    var btn = dock.querySelector("[data-vc-staff-list-toggle]");
    var pop = dock.querySelector("[data-vc-staff-list-pop]");
    if (!btn || !pop) return;
    if (open) {
      pop.hidden = false;
      dock.classList.add("is-open");
      btn.setAttribute("aria-expanded", "true");
      try {
        if (typeof global.VcWakeDeferredMedia === "function") {
          global.VcWakeDeferredMedia(dock);
          global.requestAnimationFrame(function () {
            global.VcWakeDeferredMedia(dock);
          });
        }
      } catch (eWake) {}
    } else {
      pop.hidden = true;
      dock.classList.remove("is-open");
      btn.setAttribute("aria-expanded", "false");
    }
  }

  function unmountStaffListDock() {
    var dock = global.document.getElementById("vc-staff-list-dock");
    if (dock && dock.parentNode) dock.parentNode.removeChild(dock);
    try {
      global.document.documentElement.classList.remove("vc-staff-list-dock-on");
    } catch (e) {}
  }

  function mountStaffListDock(hooks) {
    hooks = hooks || {};
    var doc = global.document;
    if (!doc || !doc.body) return null;
    var dock = doc.getElementById("vc-staff-list-dock");
    var existed = Boolean(dock);
    if (!dock) {
      var wrap = doc.createElement("div");
      wrap.innerHTML = staffListPickerHtml();
      dock = wrap.firstChild;
      doc.body.appendChild(dock);
    }
    var prevId = String(dock.__vcStaffListCurrentId || "").trim();
    dock.__vcStaffListHooks = hooks;
    dock.__vcStaffListCurrentId = String(hooks.currentUserId || "").trim();

    function loadAndFill() {
      var h = dock.__vcStaffListHooks || {};
      var ul = dock.querySelector("[data-vc-staff-list-ul]");
      var fab = dock.querySelector("[data-vc-staff-list-toggle]");
      var gen = (dock.__vcStaffListLoadGen = (dock.__vcStaffListLoadGen || 0) + 1);
      if (ul) ul.innerHTML = '<li class="vc-staff-list-pop__empty">Caricamento\u2026</li>';
      if (fab) fab.classList.add("is-loading");
      var p = typeof h.getStaffList === "function" ? h.getStaffList() : Promise.resolve([]);
      return Promise.resolve(p)
        .then(function (people) {
          if (dock.__vcStaffListLoadGen !== gen) return;
          fillStaffListPop(people || [], dock.__vcStaffListCurrentId || "");
        })
        .catch(function () {
          if (dock.__vcStaffListLoadGen !== gen) return;
          if (ul) {
            ul.innerHTML =
              '<li class="vc-staff-list-pop__empty">Organico non disponibile. Riprova.</li>';
          }
        })
        .then(function () {
          if (dock.__vcStaffListLoadGen !== gen) return;
          if (fab) fab.classList.remove("is-loading");
        });
    }

    dock.__vcStaffListLoad = loadAndFill;
        if (!existed) {
      loadAndFill();
    } else if (
      Array.isArray(dock.__vcStaffListLastPeople) &&
      dock.__vcStaffListLastPeople.length &&
      prevId !== dock.__vcStaffListCurrentId
    ) {
      fillStaffListPop(dock.__vcStaffListLastPeople, dock.__vcStaffListCurrentId);
    } else if (!Array.isArray(dock.__vcStaffListLastPeople) || !dock.__vcStaffListLastPeople.length) {
      var fabBusy = dock.querySelector("[data-vc-staff-list-toggle]");
      if (!(fabBusy && fabBusy.classList.contains("is-loading"))) loadAndFill();
    }
    
    if (dock.getAttribute("data-vc-staff-list-bound") !== "1") {
      dock.setAttribute("data-vc-staff-list-bound", "1");

      dock.addEventListener("click", function (ev) {
        var toggle = ev.target && ev.target.closest ? ev.target.closest("[data-vc-staff-list-toggle]") : null;
        if (toggle && dock.contains(toggle)) {
          ev.preventDefault();
          ev.stopPropagation();
          var open = !dock.classList.contains("is-open");
          setStaffListOpen(dock, open);
          if (open) loadAndFill();
          return;
        }
        var go = ev.target && ev.target.closest ? ev.target.closest("[data-vc-staff-list-go]") : null;
        if (!go || !dock.contains(go) || go.disabled) return;
        ev.preventDefault();
        ev.stopPropagation();
        var uid = String(go.getAttribute("data-vc-staff-list-go") || "").trim();
        if (!/^\d{17,20}$/.test(uid)) return;
        setStaffListOpen(dock, false);
        var h = dock.__vcStaffListHooks || {};
        if (typeof h.onPeerNavigate === "function") h.onPeerNavigate(uid);
      });

      doc.addEventListener(
        "click",
        function (ev) {
          if (!dock.classList.contains("is-open")) return;
          if (ev.target && dock.contains(ev.target)) return;
          setStaffListOpen(dock, false);
        },
        true,
      );

      doc.addEventListener("keydown", function (ev) {
        if (ev.key === "Escape") setStaffListOpen(dock, false);
      });
    }

    try {
      doc.documentElement.classList.add("vc-staff-list-dock-on");
    } catch (eOn) {}
    return dock;
  }

  function syncStaffListDock(hooks) {
    hooks = hooks || {};
    var show = Boolean(hooks.visible);
    if (!show) {
      unmountStaffListDock();
      return null;
    }
    return mountStaffListDock(hooks);
  }

  function sfMiniHtml() {
    return "";
  }

  function sfUnderManageHtml(sf, opts) {
    if (!sf) return "";
    opts = opts || {};
    var present = Boolean(sf.willAttend);
    var editable = Boolean(opts.isSelf && sf.editable);
    var canOpen = Boolean(opts.canOpenSerata);
    return (
      '<div class="vc-staff-sf-under' +
      (present ? " is-present" : " is-absent") +
      '" data-vc-sf-under="1">' +
      '<div class="vc-staff-sf-under__copy">' +
      '<span class="vc-staff-sf-under__kicker">Serata film</span>' +
      '<span class="vc-staff-sf-under__status">' +
      (present ? "Presente" : "Assente") +
      "</span></div>" +
      '<div class="vc-staff-sf-under__actions">' +
      (editable
        ? '<div class="vc-staff-sf-seg" role="group" aria-label="Presenza Serata Film">' +
          '<button type="button" class="vc-staff-sf-seg__btn' +
          (!present ? " is-active" : "") +
          '" data-sf="absent" aria-pressed="' +
          (!present ? "true" : "false") +
          '">Assente</button>' +
          '<button type="button" class="vc-staff-sf-seg__btn' +
          (present ? " is-active" : "") +
          '" data-sf="present" aria-pressed="' +
          (present ? "true" : "false") +
          '">Presente</button></div>'
        : "") +
      (canOpen
        ? '<a class="vc-staff-sf-under__cta" href="/seratafilm/" target="_blank" rel="noopener noreferrer" title="Apri Serata Film">' +
          '<i class="fa fa-film" aria-hidden="true"></i><span>Apri</span></a>'
        : "") +
      "</div></div>"
    );
  }

  function bindStaffListPicker() {
      }

  function peerDockHost() {
    var doc = global.document;
    return (
      doc.querySelector("[data-vc-profile-staff-pane]") ||
      doc.querySelector(".vc-user-profile-staff-pane") ||
      doc.querySelector("#vc-user-profile-view .vc-user-profile-shell") ||
      doc.getElementById("vc-user-profile-view") ||
      null
    );
  }

  function unmountStaffPeerDock() {
    var dock = global.document.getElementById("vc-staff-peer-dock");
    if (dock) {
      try {
        var host = dock.parentElement;
        if (host && host.classList) host.classList.remove("vc-staff-peer-dock-host");
      } catch (eHost) {}
      dock.remove();
    }
    try {
      global.document.documentElement.classList.remove("vc-staff-peer-dock-on");
    } catch (e) {}
  }

  /* peerArrowsMargin1: dock esteso fuori card; left/right solo CSS (no overlap stats) */
  function pinPeerBtn(btn, side) {
    if (!btn) return;
    btn.style.setProperty("position", "absolute", "important");
    btn.style.setProperty("bottom", "auto", "important");
    btn.style.setProperty("margin", "0", "important");
    btn.style.setProperty("top", "50%", "important");
    btn.style.setProperty("transform", "translateY(-50%)", "important");
    btn.style.setProperty("z-index", "28", "important");
    /* left/right: CSS peerArrowsMargin1 (dock overhang) — no inline che batte !important */
    try {
      btn.style.removeProperty("left");
      btn.style.removeProperty("right");
    } catch (eClr) {}
  }

  function mountStaffPeerDock(neighbors, hooks) {
    hooks = hooks || {};
    var prev = neighbors && neighbors.prev ? String(neighbors.prev) : "";
    var next = neighbors && neighbors.next ? String(neighbors.next) : "";
    /* peerArrowsKeep1: roster ancora vuoto → non smontare frecce già montate */
    if (!prev && !next) {
      return global.document.getElementById("vc-staff-peer-dock");
    }
    unmountStaffPeerDock();

    var dock = global.document.createElement("div");
    dock.id = "vc-staff-peer-dock";
    dock.className = "vc-staff-peer-dock";
    dock.setAttribute("role", "navigation");
    dock.setAttribute("aria-label", "Navigazione profili staff");
    dock.setAttribute("data-vc-staff-peer-fix", "2");
    dock.innerHTML =
      '<button type="button" class="vc-staff-peer-dock__btn vc-staff-peer-dock__btn--prev" data-vc-staff-peer="' +
      esc(prev) +
      '"' +
      (prev ? "" : " disabled") +
      ' aria-label="Profilo staff precedente">' +
      '<span class="vc-staff-peer-dock__glow" aria-hidden="true"></span>' +
      '<span class="vc-staff-peer-dock__ring" aria-hidden="true"></span>' +
      '<i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<button type="button" class="vc-staff-peer-dock__btn vc-staff-peer-dock__btn--next" data-vc-staff-peer="' +
      esc(next) +
      '"' +
      (next ? "" : " disabled") +
      ' aria-label="Profilo staff successivo">' +
      '<span class="vc-staff-peer-dock__glow" aria-hidden="true"></span>' +
      '<span class="vc-staff-peer-dock__ring" aria-hidden="true"></span>' +
      '<i class="fa fa-chevron-right" aria-hidden="true"></i></button>';

    dock.addEventListener("click", function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-staff-peer]") : null;
      if (!btn || btn.disabled) return;
      var uid = String(btn.getAttribute("data-vc-staff-peer") || "").trim();
      if (!/^\d{17,20}$/.test(uid)) return;
      ev.preventDefault();
      btn.classList.add("is-firing");
      global.setTimeout(function () {
        try {
          btn.classList.remove("is-firing");
        } catch (eF) {}
      }, 420);
      try {
        var dd = global.document.getElementById("vc-notif-dropdown");
        if (dd && dd.open) {
          dd.removeAttribute("open");
          dd.open = false;
        }
      } catch (eCloseNotif) {}
      if (hooks && typeof hooks.onPeerNavigate === "function") {
        hooks.onPeerNavigate(uid);
        return;
      }
      try {
        global.location.assign("/user/?id=" + encodeURIComponent(uid) + "&tab=staff");
      } catch (eGo) {
        global.location.href = "/user/?id=" + encodeURIComponent(uid) + "&tab=staff";
      }
    });

    var host = peerDockHost();
    if (host) {
      try {
        host.classList.add("vc-staff-peer-dock-host");
      } catch (eHostCls) {}
      try {
        host.appendChild(dock);
      } catch (eHostApp) {
        (global.document.body || global.document.documentElement).appendChild(dock);
      }
    } else {
      (global.document.body || global.document.documentElement).appendChild(dock);
    }
    pinPeerBtn(dock.querySelector(".vc-staff-peer-dock__btn--prev"), "left");
    pinPeerBtn(dock.querySelector(".vc-staff-peer-dock__btn--next"), "right");
    try {
      global.document.documentElement.classList.add("vc-staff-peer-dock-on");
    } catch (eOn) {}
    dock.classList.add("is-in");
    if (typeof global.requestAnimationFrame === "function") {
      global.requestAnimationFrame(function () {
        pinPeerBtn(dock.querySelector(".vc-staff-peer-dock__btn--prev"), "left");
        pinPeerBtn(dock.querySelector(".vc-staff-peer-dock__btn--next"), "right");
      });
    }
    return dock;
  }

  function bindPeerNav(root, payload, hooks) {
    var neighbors =
      (hooks && hooks.neighbors) ||
      (payload && payload.__vcStaffNeighbors) ||
      (payload && payload.neighbors) ||
      null;
    var prev = neighbors && neighbors.prev ? String(neighbors.prev) : "";
    var next = neighbors && neighbors.next ? String(neighbors.next) : "";
    /* peerArrowsKeep1: senza vicini validi lascia il dock esistente (non unmount) */
    if (!prev && !next) return;
    mountStaffPeerDock(neighbors, hooks);
  }

  function setManageMenuHeroOpen(root, open) {
    try {
      var hero =
        (root && root.querySelector && root.querySelector(".vc-user-profile-hero, .vc-staff-profile-hero")) ||
        (root && root.closest && root.closest(".vc-user-profile-hero, .vc-staff-profile-hero")) ||
        null;
      if (!hero && root && root.classList) {
        if (root.classList.contains("vc-user-profile-hero") || root.classList.contains("vc-staff-profile-hero")) {
          hero = root;
        }
      }
      if (!hero) return;
      hero.classList.toggle("is-manage-menu-open", Boolean(open));
    } catch (eHero) {}
  }

  /* gestisciMenuPortal1: menu in body+fixed — absolute nell'hero resta sotto le card (z-index stacking) */
  function placeManageMenuPortal(menu, toggle) {
    if (!menu || !toggle || !global.document || !global.document.body) return;
    var r = null;
    try {
      r = toggle.getBoundingClientRect();
    } catch (eR) {
      return;
    }
    if (!r) return;
    var gap = 8;
    var vw = Math.max(0, Number(global.innerWidth) || 0);
    var vh = Math.max(0, Number(global.innerHeight) || 0);
    var width = Math.max(216, Math.min(280, Number(r.width) || 216));
    var left = Math.min(Math.max(8, r.right - width), Math.max(8, vw - width - 8));
    var top = r.bottom + gap;
    menu.classList.add("is-portaled");
    menu.style.position = "fixed";
    menu.style.top = Math.round(top) + "px";
    menu.style.left = Math.round(left) + "px";
    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.width = Math.round(width) + "px";
    menu.style.minWidth = Math.round(width) + "px";
    menu.style.zIndex = "2147483640";
    menu.style.margin = "0";
    try {
      var mh = menu.offsetHeight || 0;
      if (mh && top + mh > vh - 8) {
        var above = r.top - gap - mh;
        if (above >= 8) menu.style.top = Math.round(above) + "px";
      }
    } catch (eFlip) {}
  }

  function openManageMenuPortal(root, wrap, menu, toggle) {
    if (!menu || !wrap || !toggle) return;
    if (!menu.__vcManageHome) {
      menu.__vcManageHome = { parent: menu.parentNode, next: menu.nextSibling };
    }
    if (menu.parentNode !== global.document.body) {
      global.document.body.appendChild(menu);
    }
    menu.hidden = false;
    menu.removeAttribute("hidden");
    placeManageMenuPortal(menu, toggle);
    wrap.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    setManageMenuHeroOpen(root, true);
    try {
      if (menu.__vcManageReposition) {
        global.removeEventListener("resize", menu.__vcManageReposition, true);
        global.removeEventListener("scroll", menu.__vcManageReposition, true);
      }
    } catch (eRm) {}
    menu.__vcManageReposition = function () {
      if (!menu.isConnected || menu.hidden) return;
      placeManageMenuPortal(menu, toggle);
    };
    try {
      global.addEventListener("resize", menu.__vcManageReposition, true);
      global.addEventListener("scroll", menu.__vcManageReposition, true);
    } catch (eAdd) {}
  }

  function restoreManageMenuHome(menu) {
    if (!menu) return;
    try {
      if (menu.__vcManageReposition) {
        global.removeEventListener("resize", menu.__vcManageReposition, true);
        global.removeEventListener("scroll", menu.__vcManageReposition, true);
      }
    } catch (eRm2) {}
    menu.__vcManageReposition = null;
    menu.classList.remove("is-portaled");
    try {
      menu.style.position = "";
      menu.style.top = "";
      menu.style.left = "";
      menu.style.right = "";
      menu.style.bottom = "";
      menu.style.width = "";
      menu.style.minWidth = "";
      menu.style.zIndex = "";
      menu.style.margin = "";
    } catch (eSt) {}
    var home = menu.__vcManageHome;
    if (home && home.parent && home.parent.isConnected) {
      try {
        if (home.next && home.next.parentNode === home.parent) {
          home.parent.insertBefore(menu, home.next);
        } else {
          home.parent.appendChild(menu);
        }
      } catch (eIns) {
        try {
          home.parent.appendChild(menu);
        } catch (eAp) {}
      }
    }
  }

  function closeManageMenu(root) {
    try {
      var wrap =
        (root && root.querySelector && root.querySelector(".vc-staff-manage-cta-wrap")) ||
        null;
      var toggle = wrap && wrap.querySelector("[data-vc-staff-manage-toggle]");
      var menu =
        (wrap && wrap.querySelector("[data-vc-staff-manage-menu]")) ||
        global.document.querySelector("body > .vc-staff-manage-menu.is-portaled") ||
        global.document.querySelector(".vc-staff-manage-menu.is-portaled");
      if (menu) {
        menu.hidden = true;
        menu.setAttribute("hidden", "");
        restoreManageMenuHome(menu);
      }
      if (toggle) toggle.setAttribute("aria-expanded", "false");
      if (wrap) wrap.classList.remove("is-open");
      setManageMenuHeroOpen(root, false);
    } catch (eClose) {}
  }

  function openManageCareerFromProfile(root, payload, hooks, uid) {
    var Modal = global.VCStaffManageModal;
    if (!Modal || typeof Modal.open !== "function") return;
    var live = root.__vcStaffPayload || payload || {};
    var name = (live.identity && live.identity.displayName) || "Staff";
    var ensure = typeof Modal.ensureScripts === "function" ? Modal.ensureScripts() : Promise.resolve();
    ensure.then(function () {
      return Modal.open(uid, {
        displayName: name,
        onUpdated: function (info) {
          /* pexCloseSheet1: allinea hardRefresh/joinedLadder al path auto-open manage */
          var reload = null;
          if (typeof root.__vcStaffReload === "function") reload = root.__vcStaffReload;
          else if (hooks && typeof hooks.onReload === "function") reload = hooks.onReload;
          if (!reload) return;
          if (info && info.leftStaff) {
            reload({ leftStaff: true });
            return;
          }
          if (info && (info.hardRefresh || info.joinedLadder)) {
            reload(info);
            return;
          }
          reload(info || null);
        },
      });
    });
  }

  function bindManageButton(root, payload, hooks) {
    if (!root) return;
    /* staffActionReload1: bind once — stacked listeners → N reload concurrent → “non visualizzabile”. */
    if (root.getAttribute("data-vc-manage-bound") === "1") return;
    root.setAttribute("data-vc-manage-bound", "1");

    function handleManageMenuItem(ev, t) {
      var resoBtn = t.closest("[data-vc-staff-reso]");
      if (resoBtn) {
        ev.preventDefault();
        closeManageMenu(root);
        openStatSheet(root.__vcStaffPayload || payload, "resoconto", root);
        return true;
      }
      var careerBtn = t.closest("[data-vc-staff-manage]");
      if (careerBtn) {
        ev.preventDefault();
        closeManageMenu(root);
        var uidCareer = careerBtn.getAttribute("data-vc-staff-manage") || "";
        openManageCareerFromProfile(root, payload, hooks, uidCareer);
        return true;
      }
      return false;
    }

    root.addEventListener("click", function manageClick(ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      if (root.contains(t) || (t.closest && t.closest(".vc-staff-manage-menu.is-portaled"))) {
        if (handleManageMenuItem(ev, t)) return;
      }

      var toggle = t.closest("[data-vc-staff-manage-toggle]");
      if (toggle && root.contains(toggle)) {
        ev.preventDefault();
        var wrap = toggle.closest(".vc-staff-manage-cta-wrap");
        var menu =
          (wrap && wrap.querySelector("[data-vc-staff-manage-menu]")) ||
          global.document.querySelector("body > .vc-staff-manage-menu.is-portaled");
        if (!menu || !wrap) return;
        var open = menu.hasAttribute("hidden") || menu.hidden;
        if (open) {
          openManageMenuPortal(root, wrap, menu, toggle);
        } else {
          closeManageMenu(root);
        }
        return;
      }

      if (!t.closest(".vc-staff-manage-cta-wrap") && !t.closest(".vc-staff-manage-menu")) {
        closeManageMenu(root);
      }
    });
    global.document.addEventListener(
      "click",
      function manageDocClose(ev) {
        if (!root.isConnected) return;
        var t = ev.target;
        if (!t || !t.closest) {
          closeManageMenu(root);
          return;
        }
        /* gestisciMenuPortal1: item portati su body — gestisci click qui */
        if (t.closest(".vc-staff-manage-menu.is-portaled")) {
          handleManageMenuItem(ev, t);
          return;
        }
        if (t.closest(".vc-staff-manage-cta-wrap") || t.closest(".vc-staff-manage-menu")) {
          return;
        }
        closeManageMenu(root);
      },
      true,
    );
  }

  function bindInteractions(root, payload, hooks) {
    hooks = hooks || {};
    if (!root || !payload || !payload.ok) return;
    root.__vcStaffPayload = payload;
    root.__vcStaffReload = hooks.onReload || null;

    if (payload.prospect) {
      if (root.getAttribute("data-vc-prospect-bound") !== "1") {
        root.setAttribute("data-vc-prospect-bound", "1");
        root.addEventListener("click", function prospectClick(ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-prospect-pex]") : null;
          if (!btn || !root.contains(btn)) return;
          ev.preventDefault();
          var Modal = global.VCStaffManageModal;
          var ensure =
            Modal && typeof Modal.ensureScripts === "function" ? Modal.ensureScripts() : Promise.resolve();
          ensure.then(function () {
            runProspectPexFlow(root.__vcStaffPayload || payload, hooks, root);
          });
        });
      }
      bindPeerNav(root, payload, hooks);
      return;
    }

    var isSelf = payload.isSelf === true;
    var partner = payload.partner;
    var sf = payload.serataFilm;

    if (root.getAttribute("data-vc-stat-bound") !== "1") {
      root.setAttribute("data-vc-stat-bound", "1");
      root.addEventListener("click", function statClick(ev) {
        var card = ev.target && ev.target.closest ? ev.target.closest("[data-vc-stat]") : null;
        if (!card || !root.contains(card)) return;
        ev.preventDefault();
        var kind = card.getAttribute("data-vc-stat");
        if (!kind) return;
        openStatSheet(root.__vcStaffPayload || payload, kind, root);
      });
      root.addEventListener("keydown", function statKey(ev) {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        var card = ev.target && ev.target.closest ? ev.target.closest("[data-vc-stat]") : null;
        if (!card || !root.contains(card)) return;
        ev.preventDefault();
        var kind = card.getAttribute("data-vc-stat");
        if (!kind) return;
        openStatSheet(root.__vcStaffPayload || payload, kind, root);
      });
    }

    bindManageButton(root, payload, hooks);
    bindPeerNav(root, payload, hooks);
    tryConsumeStaffOpenFromUrl(root, payload);

    if (
      partner &&
      partner.shop &&
      global.VCStaffPmShop &&
      isSelf &&
      !roleLooksFounder(payload.role || {})
    ) {
      global.VCStaffPmShop.bindShop(root, {
        onReload: hooks.onReload || function () {},
        setStatus: hooks.setStatus || function () {},
      });
    }

    if (sf && isSelf && sf.editable && typeof hooks.onSerataFilm === "function") {
      if (root.getAttribute("data-vc-sf-bound") === "1") {
        root.__vcOnSerataFilm = hooks.onSerataFilm;
      } else {
        root.setAttribute("data-vc-sf-bound", "1");
        root.__vcOnSerataFilm = hooks.onSerataFilm;
        root.addEventListener("click", function serataClick(ev) {
          var btn = ev.target && ev.target.closest ? ev.target.closest("[data-sf]") : null;
          if (!btn || !root.contains(btn) || btn.disabled) return;
          ev.preventDefault();
          var willAttend = btn.getAttribute("data-sf") !== "absent";
          var fn = root.__vcOnSerataFilm;
          if (typeof fn === "function") fn(willAttend, root);
        });
      }
    }
  }

  function finalizeStaffAvatars(root) {
    if (!root || !root.querySelectorAll) return;
    var imgs = root.querySelectorAll("img[data-vc-avatar], img.vc-avatar, .vc-staff-profile-identity__avatar-wrap img");
    for (var i = 0; i < imgs.length; i += 1) {
      var img = imgs[i];
      try {
        img.classList.add("vc-avatar");
      } catch (eCls) {}
      /* gifFailPng1: coffee stuck (GIF demoted) → ricostruisci da data-avatar-hash */
      try {
        var src0 = String(img.getAttribute("src") || "");
        if (
          (/^data:image\/svg\+xml/i.test(src0) || img.getAttribute("data-vc-avatar-fallback") === "1") &&
          global.VcAvatarFallback &&
          typeof global.VcAvatarFallback.recoverCoffee === "function"
        ) {
          if (global.VcAvatarFallback.recoverCoffee(img)) continue;
        }
      } catch (eRec) {}
      if (img.complete && img.naturalWidth > 0) {
        try {
          img.classList.add("vc-avatar--ready");
          img.classList.remove("vc-avatar--pending");
        } catch (eReady) {}
        if (global.VcAvatarFallback && typeof global.VcAvatarFallback.markReady === "function") {
          global.VcAvatarFallback.markReady(img);
        }
        continue;
      }
      if (global.VcDiscordAvatar && typeof global.VcDiscordAvatar.applyToImage === "function") {
        try {
          global.VcDiscordAvatar.applyToImage(img);
        } catch (eApply) {}
      }
      if (img.complete && img.naturalWidth > 0) {
        try {
          img.classList.add("vc-avatar--ready");
          img.classList.remove("vc-avatar--pending");
        } catch (eReady2) {}
        if (global.VcAvatarFallback && typeof global.VcAvatarFallback.markReady === "function") {
          global.VcAvatarFallback.markReady(img);
        }
      }
    }
    if (global.VcAvatarFallback && typeof global.VcAvatarFallback.scan === "function") {
      try {
        global.VcAvatarFallback.scan(root);
      } catch (eScan) {}
    }
  }

  function renderInto(root, payload, opts) {
    if (!root || !payload || !payload.ok) return false;
    // staffPeerFix2: ensure panel is still in the live document (community render may detach panes).
    try {
      if (root.isConnected === false) {
        var live =
          global.document.getElementById("vc-user-profile-staff-panel") ||
          (global.document.querySelector &&
            global.document.querySelector("#vc-user-profile-view #vc-user-profile-staff-panel"));
        if (live) root = live;
        else return false;
      }
    } catch (eLive) {}
    /* staffPeerPaintRetry1: catch throw render (career/retention edge) → empty false, non crash */
    var html = "";
    try {
      html = renderPayloadHtml(payload, opts);
    } catch (eHtml) {
      try {
        console.error("[vc-staff-profile] renderPayloadHtml failed", eHtml);
      } catch (eLog) {}
      return false;
    }
    // staffPeerEmpty1 / staffSwitchStuck1 / staffPeerFix2 / staffTabOrganico1: never treat empty as OK.
    if (!String(html || "").trim()) return false;
    try {
      if (root.isConnected === false) {
        var live2 =
          global.document.getElementById("vc-user-profile-staff-panel") ||
          (global.document.querySelector &&
            global.document.querySelector("#vc-user-profile-view #vc-user-profile-staff-panel"));
        if (live2) root = live2;
        else return false;
      }
    } catch (eLive2) {}
    root.innerHTML = html;
    root.hidden = false;
    finalizeStaffAvatars(root);
    try {
      if (typeof global.requestAnimationFrame === "function") {
        global.requestAnimationFrame(function () {
          finalizeStaffAvatars(root);
        });
      } else {
        global.setTimeout(function () {
          finalizeStaffAvatars(root);
        }, 0);
      }
      global.setTimeout(function () {
        finalizeStaffAvatars(root);
      }, 120);
    } catch (eFin) {}
    return true;
  }

  global.VCStaffProfileRender = {
    esc: esc,
    dedupeCareerRows: dedupeCareerRows,
    sliceToLatestCareer: sliceToLatestCareer,
    renderPayloadHtml: renderPayloadHtml,
    renderInto: renderInto,
    bindInteractions: bindInteractions,
    resolveProfileAvatarUrl: resolveProfileAvatarUrl,
    finalizeStaffAvatars: finalizeStaffAvatars,
    mountStaffPeerDock: mountStaffPeerDock,
    unmountStaffPeerDock: unmountStaffPeerDock,
    mountStaffListDock: mountStaffListDock,
    unmountStaffListDock: unmountStaffListDock,
    syncStaffListDock: syncStaffListDock,
    fillStaffListPop: fillStaffListPop,
    runProspectPexFlow: runProspectPexFlow,
  };
})(typeof window !== "undefined" ? window : globalThis);
