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

  function isOutsideStaffCareerLadder(token) {
    return !isOnStaffCareerLadder(token);
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
    if (!Array.isArray(rows) || !rows.length) return [];
    if (isPartnerManagerRole(currentRole) || opts.track === "pm") {
      return slicePartnerManagerCareer(rows, opts);
    }
    var chrono = rows.slice().sort(function (a, b) {
      return careerRowSortMs(a) - careerRowSortMs(b);
    });
    var start = 0;
    var found = false;
    var onLadder = false;
    for (var i = 0; i < chrono.length; i += 1) {
      var to = normalizeCareerRoleToken(chrono[i].newRole);
      var from = normalizeCareerRoleToken(chrono[i].oldRole);
      var toOn = isOnStaffCareerLadder(to);
      var fromOutside = isOutsideStaffCareerLadder(from);
      if (toOn && (fromOutside || !onLadder)) {
        start = i;
        found = true;
        onLadder = true;
        continue;
      }
      if (onLadder && !toOn) {
        onLadder = false;
      }
    }
    if (!found) {
      if (!stillActive) return [];
      start = 0;
    } else if (!onLadder && !stillActive) {
      return [];
    }

    var endExclusive = chrono.length;
    while (
      endExclusive > start &&
      !isOnStaffCareerLadder(normalizeCareerRoleToken(chrono[endExclusive - 1].newRole))
    ) {
      endExclusive -= 1;
    }
    if (endExclusive <= start) return [];

    return chrono.slice(start, endExclusive).sort(function (a, b) {
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

  function statCard(value, label, opts) {
    opts = opts || {};
    var action = opts.action ? String(opts.action) : "";
    var tip = opts.title ? String(opts.title) : "";
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
      '"' +
      attrs +
      ">" +
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
    var payloadId = String(id.userId || id.id || payload.targetUserId || "").trim();
    // staffPeerFix2: stamp expected id when API/cache omitted identity.userId (empty HTML / mismatch).
    if (expectedId && !payloadId) {
      id.userId = expectedId;
      payload.targetUserId = expectedId;
      return expectedId;
    }
    if (expectedId && payloadId && expectedId !== payloadId) {
      // Prefer explicit targetUserId when it matches the requested peer.
      var tid = String(payload.targetUserId || "").trim();
      if (tid && tid === expectedId) {
        id.userId = expectedId;
        return expectedId;
      }
      return "";
    }
    if (!payload.targetUserId && payloadId) payload.targetUserId = payloadId;
    if (!id.userId && payloadId) id.userId = payloadId;
    return payloadId || expectedId;
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

    var isSelf = payload.isSelf !== false && opts.isSelf !== false;
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
    var showPmTopStats = Boolean(partner) && (pmOnly || isFounder);
    if (!isFounder) {
      stats.push(
        statCard(quota.remaining != null ? quota.remaining : "\u2014", "Giorni di pausa rimanenti", {
          action: "pause",
          title: "Apri mini calendario pause",
        }),
      );
    }
        if (showPmTopStats) {
      stats.push(statCard(partner.redeemSpend != null ? partner.redeemSpend : 0, "Spesi in shop"));
      stats.push(
        statCard(partner.points != null ? partner.points : 0, "Punti PM", {
          action: "pm-points",
          title: canManagePmPointsTop ? "Gestisci punti PM" : "Punti PM",
        }),
      );
      stats.push(statCard(partner.partnerCount != null ? partner.partnerCount : 0, "Partner"));
    } else if (!pmOnly && !isFounder) {
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

        if (partner && !isFounder) {
      var canManagePmPoints = canWriteStaffManage();
      if (!pmOnly) {
        html +=
          '<section class="vc-user-profile-block vc-staff-pm-block">' +
          '<div class="vc-user-profile-block__head">' +
          '<span class="vc-user-profile-block__title">Partner Manager</span>' +
          "</div>" +
          '<div class="vc-user-profile-grid3">' +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Spesi in shop</span><span class="vc-user-profile-mini__value">' +
          esc(partner.redeemSpend || 0) +
          "</span></div>" +
          '<article class="vc-user-profile-mini vc-user-profile-mini--action" data-vc-stat="pm-points" role="button" tabindex="0" title="' +
          (canManagePmPoints ? "Gestisci punti PM" : "Punti PM") +
          '"><span class="vc-user-profile-mini__label">Punti PM</span><span class="vc-user-profile-mini__value">' +
          esc(partner.points != null ? partner.points : 0) +
          "</span></article>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Partner</span><span class="vc-user-profile-mini__value">' +
          esc(partner.partnerCount != null ? partner.partnerCount : 0) +
          "</span></div></div></section>";
      }
      if (partner.shop && global.VCStaffPmShop) {
        html += global.VCStaffPmShop.renderShopSection(partner.shop, { readOnly: !isSelf });
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

  function closeStatSheet() {
    var existing = global.document.getElementById("vc-staff-stat-sheet");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    try {
      global.document.documentElement.classList.remove("vc-staff-stat-sheet-open");
    } catch (e) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcUnpinPageScroll === "function") global.__vcUnpinPageScroll();
    } catch (eUnpin) {}
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
          "In pausa · " +
          formatRangeLabel(meta.range.start, meta.range.end) +
          " · " +
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
        hintBits.join(" · ") +
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

  function pauseTradeHtml(payload) {
    if (!canWriteStaffManage()) return "";
    if (String(((payload || {}).role || {}).kind || "").toLowerCase() === "pm_only") return "";
    var pos = Number(
      (((payload || {}).valutazioni || {}).positive != null
        ? payload.valutazioni.positive
        : 0) || 0,
    );
    return (
      '<div class="vc-staff-pause-trade-card">' +
      '<div class="vc-staff-pause-trade-card__copy">' +
      "<strong>Valutazioni positive \u2192 giorni pausa</strong>" +
      "<span>Converti valutazioni positive in giorni extra sul budget pausa. Disponibili: <b>" +
      esc(String(pos)) +
      "</b></span></div>" +
      '<div class="vc-staff-pause-trade-card__form">' +
      '<label><span>Valutazioni positive</span><input type="number" min="1" max="50" value="1" data-pause-trade-pos /></label>' +
      '<label><span>Giorni</span><input type="number" min="1" max="60" value="1" data-pause-trade-days /></label>' +
      '<button type="button" class="vc-staff-stat-sheet__act is-pos" data-stat-act="pos_pause_trade">Scambia</button>' +
      "</div></div>"
    );
  }

  function pmPointsSheetHtml(payload) {
    var pts = Number(
      (((payload || {}).partner || {}).points != null ? payload.partner.points : 0) || 0,
    );
    var canWrite = canWriteStaffManage();
    var html =
      '<div class="vc-staff-pm-points-card">' +
      '<div class="vc-staff-pm-points-card__copy">' +
      "<strong>Punti Partner Manager</strong>" +
      "<span>Saldo attuale: <b data-pm-points-balance>" +
      esc(String(pts)) +
      "</b></span>" +
      (canWrite
        ? "<span>Aggiungi o rimuovi punti. In caso di rimozione viene creato un record in Punti tolti.</span>"
        : "<span>Solo High Staff pu\u00f2 modificare i punti.</span>") +
      "</div>";
    if (!canWrite) {
      html +=
        '<p class="vc-staff-stat-sheet__hint"><a href="/notifications/?view=staff&inbox=punti-tolti">Apri Punti tolti nell\u2019inbox</a></p></div>';
      return html;
    }
    html +=
      '<div class="vc-staff-pm-points-card__form">' +
      '<label><span>Quantit\u00e0</span><input type="number" min="1" max="500" value="1" data-pm-points-amt /></label>' +
      '<label class="vc-staff-pm-points-card__reason"><span>Motivazione <em>(facoltativa)</em></span>' +
      '<input type="text" maxlength="400" placeholder="Es. errore shop / premio manuale" data-pm-points-reason /></label>' +
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

  function openStatSheet(payload, kind, root) {
    closeStatSheet();
    var title = "Dettaglio";
    var body = "";
    var pauseHistoryRef = [];
    var toneClass = "";
    var canWrite = canWriteStaffManage();
    var isSelf = isOwnStaffProfile(payload);
    if (kind === "pause") {
      title = "Calendario pause";
      toneClass = " is-pause-sheet";
      pauseHistoryRef = historyFromPayloadOrDom(payload, root);
      var ranges = resolvePauseRanges(pauseHistoryRef);
      var initial = pickCalendarMonth(ranges);
      body = pauseTradeHtml(payload) + buildMiniCalHtml(pauseHistoryRef, initial.y, initial.m);
    } else if (kind === "pm-points") {
      title = "Gestione Punti PM";
      toneClass = " is-pm-points-sheet";
      body = pmPointsSheetHtml(payload);
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
    wrap.className = "vc-staff-stat-sheet" + toneClass;
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.__vcStatPayload = payload;
    wrap.__vcStatKind = kind;
    wrap.__vcStatRoot = root;
    wrap.innerHTML =
      '<button type="button" class="vc-staff-stat-sheet__backdrop" data-stat-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-staff-stat-sheet__panel">' +
      '<div class="vc-staff-stat-sheet__head">' +
      '<h2 class="vc-staff-stat-sheet__title">' +
      esc(title) +
      "</h2>" +
      '<button type="button" class="vc-staff-stat-sheet__close" data-stat-close="1" aria-label="Chiudi"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-staff-stat-sheet__body" data-stat-body="1">' +
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
        var trade = bodyEl.querySelector(".vc-staff-pause-trade-card");
        var tradeHtmlKeep = trade ? trade.outerHTML : pauseTradeHtml(wrap.__vcStatPayload);
        bodyEl.innerHTML = tradeHtmlKeep + buildMiniCalHtml(pauseHistoryRef, cy, cm);
      }
    });

    global.document.body.appendChild(wrap);
    try {
      global.document.documentElement.classList.add("vc-staff-stat-sheet-open");
    } catch (e2) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcPinPageScroll === "function") global.__vcPinPageScroll();
    } catch (ePin) {}
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
        statusEl.hidden = false;
        statusEl.classList.remove("is-error");
        statusEl.textContent = label + " in corso\u2026";
      }
      postPmPointsAction({
        action: apiAction,
        userId: uid,
        amount: amount,
        reason: reason,
      })
        .then(function (out) {
          btn.disabled = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            if (statusEl) {
              statusEl.classList.add("is-error");
              statusEl.textContent = (out.data && out.data.message) || "Operazione non riuscita.";
            } else {
              dlgAlert({
                message: (out.data && out.data.message) || "Operazione punti non riuscita.",
              });
            }
            return;
          }
          var bal = wrap.querySelector("[data-pm-points-balance]");
          if (bal && out.data.points != null) bal.textContent = String(out.data.points);
          if (payload.partner) payload.partner.points = out.data.points;
          if (root && root.__vcStaffPayload && root.__vcStaffPayload.partner) {
            root.__vcStaffPayload.partner.points = out.data.points;
          }
          var mini = root
            ? root.querySelector(
                '[data-vc-stat="pm-points"] .vc-user-profile-mini__value, [data-vc-stat="pm-points"] .vc-user-profile-stat__value',
              )
            : null;
          if (mini && out.data.points != null) mini.textContent = String(out.data.points);
          if (statusEl) {
            statusEl.classList.remove("is-error");
            statusEl.textContent =
              (out.data.message || "Punti aggiornati.") +
              (action === "pm_points_rm" ? " Registrato in Punti tolti." : "");
          }
          if (typeof reload === "function") {
            try {
              reload();
            } catch (eRel) {}
          }
        })
        .catch(function () {
          btn.disabled = false;
          if (statusEl) {
            statusEl.classList.add("is-error");
            statusEl.textContent = "Errore di rete.";
          } else {
            dlgAlert({ message: "Errore di rete." });
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
    var isSelf = payload && payload.isSelf !== false;
    if (p.canManage || p.isHighStaff || p.highStaff) return true;
    if (p.isPmGestore || p.canManagePm) return true;
    if (isSelf && staffOk) return true;
    return false;
  }

  function manageBtnHtml(payload, isSelf) {
    if (!viewerCanManageProfile(payload)) return "";
    var uid = String((payload.identity && payload.identity.userId) || payload.targetUserId || "").trim();
    if (!uid) return "";
    var label = isSelf ? "Gestisci" : "Gestisci";
    return (
      '<div class="vc-staff-manage-cta-wrap">' +
      '<button type="button" class="vc-staff-manage-cta vc-staff-manage-cta--hero" data-vc-staff-manage="' +
      esc(uid) +
      '" aria-label="' +
      esc(label) +
      '" title="' +
      esc(label) +
      '">' +
      '<span class="vc-staff-manage-cta__ico" aria-hidden="true"><i class="fa fa-sliders"></i></span>' +
      '<span class="vc-staff-manage-cta__label">' +
      esc(label) +
      "</span></button></div>"
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
        low.indexOf("staff del mese") !== -1
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

  // staffPeerFix2: viewport-fixed near margins, under notif drawer (~10210+), never 10420.
  function pinPeerBtn(btn, side) {
    if (!btn) return;
    var edge = "max(0.65rem, env(safe-area-inset-" + side + ", 0px))";
    btn.style.setProperty("position", "fixed", "important");
    btn.style.setProperty("bottom", "auto", "important");
    btn.style.setProperty("margin", "0", "important");
    btn.style.setProperty("top", "50%", "important");
    btn.style.setProperty("transform", "translateY(-50%)", "important");
    btn.style.setProperty("z-index", "10090", "important");
    if (side === "left") {
      btn.style.setProperty("left", edge, "important");
      btn.style.setProperty("right", "auto", "important");
    } else {
      btn.style.setProperty("right", edge, "important");
      btn.style.setProperty("left", "auto", "important");
    }
  }

  function mountStaffPeerDock(neighbors, hooks) {
    hooks = hooks || {};
    unmountStaffPeerDock();
    var prev = neighbors && neighbors.prev ? String(neighbors.prev) : "";
    var next = neighbors && neighbors.next ? String(neighbors.next) : "";
    if (!prev && !next) return null;

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

    (global.document.body || global.document.documentElement).appendChild(dock);
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
    if (!neighbors) {
      unmountStaffPeerDock();
      return;
    }
    mountStaffPeerDock(neighbors, hooks);
  }

  function bindManageButton(root, payload, hooks) {
    if (!root) return;
    root.addEventListener("click", function manageClick(ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest("[data-vc-staff-manage]") : null;
      if (!btn || !root.contains(btn)) return;
      ev.preventDefault();
      var uid = btn.getAttribute("data-vc-staff-manage") || "";
      var Modal = global.VCStaffManageModal;
      if (!Modal || typeof Modal.open !== "function") return;
      var name = (payload.identity && payload.identity.displayName) || "Staff";
      var ensure = typeof Modal.ensureScripts === "function" ? Modal.ensureScripts() : Promise.resolve();
      ensure.then(function () {
        return Modal.open(uid, {
          displayName: name,
          onUpdated: function () {
            if (hooks && typeof hooks.onReload === "function") hooks.onReload();
          },
        });
      });
    });
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

    var isSelf = payload.isSelf !== false;
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
        global.VcAvatarFallback.scan();
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
    var html = renderPayloadHtml(payload, opts);
    // staffPeerEmpty1 / staffSwitchStuck1 / staffPeerFix2 / staffTabOrganico1: never treat empty as OK.
    if (!String(html || "").trim()) return false;
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
    mountStaffPeerDock: mountStaffPeerDock,
    unmountStaffPeerDock: unmountStaffPeerDock,
    mountStaffListDock: mountStaffListDock,
    unmountStaffListDock: unmountStaffListDock,
    syncStaffListDock: syncStaffListDock,
    fillStaffListPop: fillStaffListPop,
    runProspectPexFlow: runProspectPexFlow,
  };
})(typeof window !== "undefined" ? window : globalThis);
