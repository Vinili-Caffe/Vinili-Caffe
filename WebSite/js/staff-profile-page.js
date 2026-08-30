(function () {
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

  function profileApiUrl(opts) {
    var c = window.__VC_STAFF_PROFILE || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    var base = isLocalOrigin() && local ? local : cfgValueOrEmpty(c.apiUrl) || "/webhooks/site-staff-profile";
    try {
      if (/^https?:\/\//i.test(base)) {
        var apiU = new URL(base);
        var pageU = new URL(window.location.href);
        if (apiU.host !== pageU.host && apiU.protocol === pageU.protocol) {
          base = apiU.pathname + (apiU.search || "");
        }
      }
    } catch (eN) {}
    if (opts && opts.fresh) {
      base += (base.indexOf("?") >= 0 ? "&" : "?") + "fresh=1";
    }
    return base;
  }

  function getToken() {
    try {
      if (window.VCStaffTools && typeof window.VCStaffTools.getToken === "function") {
        var shared = String(window.VCStaffTools.getToken() || "").trim();
        if (shared) return shared;
      }
    } catch (eShared) {}
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

  function setStatus(text, isError, opts) {
    var el = byId("vc-staff-profile-status");
    if (el) {
      el.textContent = "";
      el.hidden = true;
      el.classList.remove("is-error");
    }
    var msg = String(text || "").trim();
    var T = window.VCStaffTools;
    if (!msg) {
      if (opts && opts.clearToast && T && T.hideStaffToast) T.hideStaffToast();
      return;
    }
    if (T && T.showStaffToast) {
      T.showStaffToast(msg, Boolean(isError), opts || null);
      return;
    }
    if (el) {
      el.textContent = msg;
      el.hidden = false;
      el.classList.toggle("is-error", Boolean(isError));
    }
  }

  var sfPostBusy = false;
  var sfBoundRoot = null;

  function applySerataFilmUi(root, willAttend) {
    if (!root) return;
    var bar = root.querySelector(".vc-staff-sf-under, .vc-staff-sf-mini, .vc-staff-sf-bar");
    if (!bar) return;
    var present = Boolean(willAttend);
    bar.classList.toggle("is-present", present);
    bar.classList.toggle("is-absent", !present);
    var status = bar.querySelector(
      ".vc-staff-sf-under__status, .vc-staff-sf-mini__status, .vc-staff-sf-bar__status",
    );
    if (status) status.textContent = present ? "Presente" : "Assente";
    bar.querySelectorAll("[data-sf]").forEach(function (btn) {
      var isPresentBtn = btn.getAttribute("data-sf") === "present";
      btn.classList.toggle("is-active", present ? isPresentBtn : !isPresentBtn);
      btn.setAttribute("aria-pressed", present === isPresentBtn ? "true" : "false");
    });
  }

  function setSerataFilmBusy(root, busy) {
    if (!root) return;
    root.querySelectorAll("[data-sf]").forEach(function (btn) {
      btn.disabled = Boolean(busy);
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statCard(value, label) {
    return (
      '<article class="vc-user-profile-stat">' +
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

  function bootProfileLayout() {
    try {
      document.documentElement.classList.add("vc-user-profile-route");
      document.documentElement.classList.remove("vc-page-cine-boot");
      document.documentElement.classList.add("vc-page-cine-ready");
      document.body.classList.add("vc-user-profile-page", "vc-user-profile-route");
      document.body.classList.remove("vc-page-cine-layout");
    } catch (eBoot) {}
  }

  function resolveProfileAvatarUrl(identity) {
    var id = identity || {};
    var uid = String(id.userId || id.id || "").trim();
    var url = String(id.avatarUrl || "").trim();
    var isDefaultEmbed = /\/embed\/avatars\//.test(url);
    if (url && !isDefaultEmbed) return url;
    try {
      var sess = window.__VC_DISCORD_PROFILE;
      if (sess && String(sess.id || "") === uid && sess.avatar) {
        var ext = String(sess.avatar).indexOf("a_") === 0 ? "webp" : "png";
        return "https://cdn.discordapp.com/avatars/" + uid + "/" + sess.avatar + "." + ext + "?size=256";
      }
    } catch (eSess) {}
    return url || (window.VCStaffTools && window.VCStaffTools.defaultAvatarUrl
      ? window.VCStaffTools.defaultAvatarUrl(uid)
      : url);
  }

  function buildRoleBadgesHtml(role) {
    var badges = role && Array.isArray(role.badges) ? role.badges : [];
    if (!badges.length && role && role.label) {
      badges = [
        {
          kind: "staff",
          icon: "fa-shield",
          label: role.label,
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
      String(a && a.newRole != null ? a.newRole : "").length +
      String(a && a.oldRole != null ? a.oldRole : "").length;
    var bLen =
      String(b && b.newRole != null ? b.newRole : "").length +
      String(b && b.oldRole != null ? b.oldRole : "").length;
    if (bLen !== aLen) return bLen > aLen ? b : a;
    return a;
  }

  function dedupeCareerRows(rows) {
    if (window.VCStaffProfileRender && typeof window.VCStaffProfileRender.dedupeCareerRows === "function") {
      return window.VCStaffProfileRender.dedupeCareerRows(rows);
    }
    if (!Array.isArray(rows) || !rows.length) return [];
    var out = [];
    var seen = Object.create(null);
    for (var i = 0; i < rows.length; i += 1) {
      var row = rows[i];
      if (!row) continue;
      var day = careerDayKey(row.dateIso || row.date || "");
      var from = normalizeCareerRoleToken(row.oldRole);
      var to = normalizeCareerRoleToken(row.newRole);
      var reason = String(row.reason || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
      var key = day + "|" + from + "|" + to + "|" + reason;
      if (!from && !to) {
        out.push(row);
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
      seen[key] = out.length;
      if (to && reason) seen[softKey] = out.length;
      out.push(row);
    }
    return out;
  }

  function renderPayload(payload) {
    var root = byId("vc-staff-profile");
    if (!root || !payload || !payload.ok) return;

    var id = payload.identity || {};
    var role = payload.role || {};
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
    var pmOnly = String(role.kind || "").toLowerCase() === "pm_only";
    var isFounder =
      role.isFounder === true ||
      String(role.kind || "").toLowerCase() === "founder" ||
      normalizeCareerRoleToken(role.label || "") === "founder" ||
      (Array.isArray(role.badges) &&
        role.badges.some(function (b) {
          return (
            String((b && b.kind) || "").toLowerCase() === "founder" ||
            normalizeCareerRoleToken((b && b.label) || "") === "founder"
          );
        }));

    var stats = [];
    var showPmTopStats = Boolean(partner) && (pmOnly || isFounder);
    if (!isFounder) {
      stats.push(statCard(quota.remaining != null ? quota.remaining : "\u2014", "Giorni di pausa rimanenti"));
    }
    if (showPmTopStats) {
      stats.push(statCard(partner.redeemSpend != null ? partner.redeemSpend : 0, "Spesi in shop"));
      stats.push(statCard(partner.points != null ? partner.points : 0, "Punti PM"));
      stats.push(statCard(partner.partnerCount != null ? partner.partnerCount : 0, "Partner"));
    } else if (!pmOnly && !isFounder) {
      stats.push(statCard(val.positive != null ? val.positive : 0, "Valutazioni Positive"));
      stats.push(statCard(val.negative != null ? val.negative : 0, "Valutazioni Negative"));
      stats.push(statCard(warn.count != null ? warn.count : 0, "Warn Staff"));
    }

    var pauseRows = history.length
      ? history
          .map(function (row) {
            return (
              '<li class="vc-staff-profile-line vc-staff-profile-line--row">' +
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

    var slicedCareer =
      rolesHistory.length &&
      window.VCStaffProfileRender &&
      typeof window.VCStaffProfileRender.sliceToLatestCareer === "function"
        ? window.VCStaffProfileRender.sliceToLatestCareer(rolesHistory, {
            stillActive:
              String((payload.role && payload.role.kind) || "").toLowerCase() === "full" ||
              String((payload.role && payload.role.kind) || "").toLowerCase() === "pm_only",
            currentRole:
              (career && career.currentRole) ||
              (String((payload.role && payload.role.kind) || "").toLowerCase() === "pm_only"
                ? "Partner Manager"
                : "") ||
              (payload.role && payload.role.label) ||
              "",
          })
        : rolesHistory.length
          ? rolesHistory
          : [];
    var careerRows = slicedCareer.length ? dedupeCareerRows(slicedCareer) : [];
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
    var avatarHtml =
      window.VCStaffTools && window.VCStaffTools.avatarImgHtml
        ? window.VCStaffTools.avatarImgHtml(profileAvatarUrl, id.userId || id.id, {
            width: 120,
            height: 120,
            className: "vc-user-profile-avatar",
            loading: "eager",
            fetchPriority: "high",
          })
        : profileAvatarUrl
          ? '<img class="vc-user-profile-avatar" src="' +
            esc(profileAvatarUrl) +
            '" alt="" width="120" height="120" loading="eager" fetchpriority="high" data-vc-avatar="1" onerror="this.onerror=null;this.src=\'https://cdn.discordapp.com/embed/avatars/0.png\'" />'
          : '<span class="vc-user-profile-avatar vc-user-profile-avatar--fallback"><i class="fa fa-user" aria-hidden="true"></i></span>';

    var html = '<section class="vc-user-profile-shell">';

    html +=
      '<section class="vc-user-profile-hero">' +
      '<div class="vc-user-profile-hero__head">' +
      '<div class="vc-user-profile-avatarwrap" style="--vc-rank-ring:' +
      esc(roleColor) +
      ';--vc-avatar-ring:' +
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
      "</div></div>" +
      buildRoleBadgesHtml(role) +
      '<div class="vc-user-profile-stats vc-user-profile-stats--staff">' +
      stats.join("") +
      "</div></section>";

    if (sf) {
      var perms = window.__VC_STAFF_PERMS || {};
      var canOpenSerata = Boolean(perms.isHighStaff || perms.canManage || perms.highStaff);
      var sfPresent = Boolean(sf.willAttend);
      html +=
        '<section class="vc-user-profile-block vc-staff-sf-block">' +
        '<div class="vc-staff-sf-bar' +
        (sfPresent ? " is-present" : " is-absent") +
        '">' +
        '<div class="vc-staff-sf-bar__copy">' +
        '<span class="vc-staff-sf-bar__kicker">Serata film</span>' +
        '<span class="vc-staff-sf-bar__status">' +
        (sfPresent ? "Presente" : "Assente") +
        "</span></div>" +
        '<div class="vc-staff-sf-bar__actions">' +
        (sf.editable
          ? '<div class="vc-staff-sf-seg" role="group" aria-label="Presenza Serata Film">' +
            '<button type="button" class="vc-staff-sf-seg__btn' +
            (!sfPresent ? " is-active" : "") +
            '" data-sf="absent" aria-pressed="' +
            (!sfPresent ? "true" : "false") +
            '">Assente</button>' +
            '<button type="button" class="vc-staff-sf-seg__btn' +
            (sfPresent ? " is-active" : "") +
            '" data-sf="present" aria-pressed="' +
            (sfPresent ? "true" : "false") +
            '">Presente</button></div>'
          : "") +
        (canOpenSerata
          ? '<a class="vc-staff-sf-bar__cta" href="/seratafilm/" target="_blank" rel="noopener noreferrer">' +
            '<i class="fa fa-film" aria-hidden="true"></i><span>Apri Serata Film</span></a>'
          : "") +
        "</div></div></section>";
    }

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
      if (!pmOnly) {
        html +=
          '<section class="vc-user-profile-block">' +
          '<div class="vc-user-profile-block__head">' +
          '<span class="vc-user-profile-block__title">Partner Manager</span>' +
          "</div>" +
          '<div class="vc-user-profile-grid3">' +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Spesi in shop</span><span class="vc-user-profile-mini__value">' +
          esc(partner.redeemSpend || 0) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Punti PM</span><span class="vc-user-profile-mini__value">' +
          esc(partner.points != null ? partner.points : 0) +
          "</span></div>" +
          '<div class="vc-user-profile-mini"><span class="vc-user-profile-mini__label">Partner</span><span class="vc-user-profile-mini__value">' +
          esc(partner.partnerCount != null ? partner.partnerCount : 0) +
          "</span></div></div></section>";
      }
      if (partner.shop && window.VCStaffPmShop) {
        html += window.VCStaffPmShop.renderShopSection(partner.shop);
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

    root.innerHTML = html;
    root.hidden = false;
    var T = window.VCStaffTools;
    if (T) T.clearPanelLoading("vc-staff-profile");
    sfPostBusy = false;

    if (partner && partner.shop && window.VCStaffPmShop && !isFounder) {
      window.VCStaffPmShop.bindShop(root, {
        onReload: function () {
          loadProfile({ quiet: true });
        },
        setStatus: setStatus,
      });
    }

    if (sfBoundRoot !== root) {
      sfBoundRoot = root;
      root.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-sf]") : null;
        if (!btn || !root.contains(btn) || btn.disabled) return;
        ev.preventDefault();
        var willAttend = btn.getAttribute("data-sf") !== "absent";
        postSerataFilm(willAttend, root);
      });
    }
  }

  function serataApiUrl() {
    var c = window.__VC_STAFF_SERATAFILM || {};
    var local = cfgValueOrEmpty(c.apiUrlLocal);
    var base = isLocalOrigin() && local ? local : cfgValueOrEmpty(c.apiUrl) || "/webhooks/site-staff-seratafilm";
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

  function postSerataFilm(willAttend, rootEl) {
    var root = rootEl || byId("vc-staff-profile");
    var token = getToken();
    if (!token) {
      setStatus("Accedi per continuare.", true);
      return;
    }
    if (sfPostBusy) return;
    var active = root && root.querySelector("[data-sf].is-active");
    var already =
      active &&
      ((willAttend && active.getAttribute("data-sf") === "present") ||
        (!willAttend && active.getAttribute("data-sf") === "absent"));
    if (already) return;

    var prevAttend = !(active && active.getAttribute("data-sf") === "absent");
    sfPostBusy = true;
    setSerataFilmBusy(root, true);
    applySerataFilmUi(root, willAttend);
    setStatus("Aggiorno presenza\u2026", false, { pending: true });

    var T = window.VCStaffTools;
    var req =
      T && T.fetchJson
        ? T.fetchJson(serataApiUrl(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ willAttend: Boolean(willAttend) }),
          })
        : fetch(serataApiUrl(), {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            mode: "cors",
            credentials: "omit",
            cache: "no-store",
            body: JSON.stringify({ willAttend: Boolean(willAttend) }),
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

    Promise.resolve(req)
      .then(function (out) {
        var data = (out && out.data) || {};
        var ok = Boolean(out && out.res && out.res.ok && data.ok);
        sfPostBusy = false;
        setSerataFilmBusy(root, false);
        if (!ok) {
          applySerataFilmUi(root, prevAttend);
          setStatus(data.message || "Impossibile aggiornare la presenza.", true);
          return;
        }
        var nextAttend =
          typeof data.willAttend === "boolean" ? data.willAttend : willAttend;
        applySerataFilmUi(root, nextAttend);
        setStatus(nextAttend ? "Presenza confermata." : "Assenza segnalata.", false);
        loadProfile({ quiet: true });
      })
      .catch(function () {
        sfPostBusy = false;
        setSerataFilmBusy(root, false);
        applySerataFilmUi(root, prevAttend);
        setStatus("Errore di rete sulla presenza.", true);
      });
  }

  var PROFILE_FETCH_MAX_RETRIES = 2;
  var PROFILE_FETCH_TIMEOUT_MS = 35000;

  function profileFailureMessage(out) {
    var data = (out && out.data) || {};
    if (data.message) return data.message;
    var st = out && out.res && out.res.status;
    if (st === 408) return "Timeout: il server impiega troppo tempo. Riprova.";
    if (st === 502 || st === 503 || st === 504) {
      return "Server temporaneamente non disponibile (HTTP " + st + "). Riprova.";
    }
    if (st) return "Impossibile caricare il profilo staff (HTTP " + st + ").";
    return "Impossibile caricare il profilo staff.";
  }

  function isTransientProfileFailure(out) {
    var data = (out && out.data) || {};
    var err = String(data.error || "").toLowerCase();
    if (err === "timeout" || err === "internal" || err === "upstream") return true;
    var st = out && out.res && out.res.status;
    if (!st || st === 0) return true;
    if (st === 408 || st === 429 || st === 502 || st === 503 || st === 504) return true;
    if (st >= 500 && !data.message) return true;
    return false;
  }

  function fetchProfileOnce(opts) {
    var token = getToken();
    var url = profileApiUrl(opts);
    var T = window.VCStaffTools;
    if (T && T.fetchJson) {
      return T.fetchJson(url, {
        method: "GET",
        timeoutMs: PROFILE_FETCH_TIMEOUT_MS,
      });
    }
    return fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token },
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
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

  function loadProfile(opts) {
    var quiet = Boolean(opts && opts.quiet);
    var attempt = Math.max(0, Number(opts && opts.attempt) || 0);
    var fresh = Boolean(quiet || (opts && opts.force) || (opts && opts.fresh));
    var token = getToken();
    if (!token) {
      setStatus("Accedi per continuare.", true);
      return;
    }
    var T = window.VCStaffTools;
    if (T && !quiet && attempt === 0) T.showPanelLoading("vc-staff-profile");
    Promise.resolve(fetchProfileOnce({ fresh: fresh }))
      .then(function (out) {
        if (!out) {
          if (
            !quiet &&
            attempt < PROFILE_FETCH_MAX_RETRIES &&
            isTransientProfileFailure({ res: { status: 0 }, data: {} })
          ) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, 700 + attempt * 900);
            }).then(function () {
              loadProfile({ quiet: quiet, attempt: attempt + 1, fresh: fresh });
            });
          }
          if (!quiet) {
            if (T) T.clearPanelLoading("vc-staff-profile");
            setStatus("Errore di rete nel caricamento profilo.", true);
          }
          return;
        }
        var data = out.data || {};
        var ok = Boolean(out.res && out.res.ok && data.ok);
        if (!ok) {
          if (!quiet && attempt < PROFILE_FETCH_MAX_RETRIES && isTransientProfileFailure(out)) {
            return new Promise(function (resolve) {
              window.setTimeout(resolve, 700 + attempt * 900);
            }).then(function () {
              loadProfile({ quiet: quiet, attempt: attempt + 1, fresh: fresh });
            });
          }
          if (!quiet) {
            if (T) T.clearPanelLoading("vc-staff-profile");
            setStatus(profileFailureMessage(out), true);
            var rootFail = byId("vc-staff-profile");
            if (rootFail) rootFail.hidden = true;
          }
          return;
        }
        renderPayload(data);
      })
      .catch(function () {
        if (!quiet && attempt < PROFILE_FETCH_MAX_RETRIES) {
          return new Promise(function (resolve) {
            window.setTimeout(resolve, 700 + attempt * 900);
          }).then(function () {
            loadProfile({ quiet: quiet, attempt: attempt + 1, fresh: fresh });
          });
        }
        if (!quiet) {
          if (T) T.clearPanelLoading("vc-staff-profile");
          setStatus("Errore di rete nel caricamento profilo.", true);
        }
      });
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
    bootProfileLayout();
    var delayMs = 0;
    if (window.__VC_STAFF_ACCESS_OPTIMISTIC && !window.__VC_STAFF_PERMS) {
      // Lascia completare il gate staff reale prima del profilo (evita doppio cold-start Discord).
      delayMs = 450;
    }
    if (delayMs > 0) {
      window.setTimeout(loadProfile, delayMs);
    } else {
      loadProfile();
    }
  }

  var T = window.VCStaffTools;
  if (T && T.bootPage) {
    T.bootPage(function () {
      initAfterAccess();
      T.registerPtrRefresh(loadProfile);
    });
  } else {
    function boot() {
      if (document.documentElement.classList.contains("vc-staff-app-revealed")) {
        initAfterAccess();
        return;
      }
      window.addEventListener("vc:staff-access-ok", initAfterAccess, { once: true });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot, { once: true });
    } else {
      boot();
    }
  }
})();
