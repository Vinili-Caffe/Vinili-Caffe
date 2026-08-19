(function () {
  var cfg = typeof window !== "undefined" ? window.__VC_LIVE : null;
  if (!cfg || cfg.enabled !== true) return;

  var introHasStarted = false;
  var pollStarted = false;
  var ioFallbackTimer = null;
  var staffHoverGroups = [];
  var boostHoverMembers = [];
  var memberPulse = null;
  var communityHours = { slots: [], blurb: "" };
  var staffLoadPending = false;
  var rosterKind = null;

  function el(key) {
    return document.querySelector('[data-live-stat="' + key + '"]');
  }

  function statInnerNode(node) {
    if (!node) return null;
    var inner = node.querySelector(".vc-stat-num-inner");
    if (inner) return inner;
    return node;
  }

  function prefersReducedMotion() {
    try {
      return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (e) {
      return false;
    }
  }

  function readTargetFromDom(node) {
    var raw = node.getAttribute("data-stat-target");
    if (raw != null && String(raw).trim() !== "") {
      var n = parseInt(String(raw).trim(), 10);
      if (Number.isFinite(n) && n >= 0) return n;
    }
    var inner = statInnerNode(node);
    var v = parseInt(String(inner.textContent || "").replace(/\D/g, ""), 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  }

  function durationIntro(to) {
    var t = Math.max(0, Math.floor(Number(to) || 0));
    return Math.min(1500, 420 + Math.log(t + 1) * 200);
  }

  function durationUpdate(from, to) {
    var d = Math.abs(Math.floor(to) - Math.floor(from));
    return Math.min(900, 280 + d * 18);
  }

  function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
  }

  function animateNumber(inner, from, to, durationMs, onDone) {
    if (!inner) {
      if (onDone) onDone();
      return;
    }
    from = Math.floor(Number(from) || 0);
    to = Math.floor(Number(to) || 0);
    if (prefersReducedMotion()) {
      inner.textContent = String(to);
      if (onDone) onDone();
      return;
    }
    if (from === to) {
      inner.textContent = String(to);
      if (onDone) onDone();
      return;
    }
    if (inner._vcStatRaf) {
      cancelAnimationFrame(inner._vcStatRaf);
      inner._vcStatRaf = null;
    }
    var start = performance.now();
    function frame(now) {
      var t = Math.min(1, (now - start) / durationMs);
      var eased = easeOutQuart(t);
      var v = Math.round(from + (to - from) * eased);
      inner.textContent = String(v);
      if (t < 1) {
        inner._vcStatRaf = requestAnimationFrame(frame);
      } else {
        inner.textContent = String(to);
        inner._vcStatRaf = null;
        if (onDone) onDone();
      }
    }
    inner._vcStatRaf = requestAnimationFrame(frame);
  }

  function setText(key, value) {
    var node = el(key);
    if (!node || value === undefined || value === null) return;
    var n = Number(value);
    if (!Number.isFinite(n)) return;
    n = Math.floor(n);
    var inner = statInnerNode(node);
    var cur = parseInt(String(inner.textContent || "").replace(/\D/g, ""), 10) || 0;
    if (cur === n) return;
    animateNumber(inner, cur, n, durationUpdate(cur, n), null);
  }

  function escText(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isGenericStaffGroupRole(roleLabel) {
    var norm = String(roleLabel || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return norm === "staff" || norm === "high staff" || norm === "highstaff";
  }

  function hueFromRoleId(roleId) {
    var s = String(roleId || "");
    var h = 0;
    for (var i = 0; i < s.length; i += 1) {
      h = ((h * 31 + s.charCodeAt(i)) >>> 0);
    }
    return h % 360;
  }

  function normalizeStaffHoverGroups(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (g) {
        var rawMembers = Array.isArray(g && g.members) ? g.members.slice(0, 200) : [];
        return {
          role: String((g && g.role) || "Staff"),
          roleId: String((g && g.roleId) || "").trim(),
          members: rawMembers
            .map(function (entry) {
              if (entry && typeof entry === "object") {
                return {
                  name: String(entry.name || "").trim(),
                  userId: String(entry.userId || "").trim(),
                  avatarUrl: String(entry.avatarUrl || "").trim(),
                  profileUrl: String(entry.profileUrl || "").trim(),
                  isOwner: entry.isOwner === true,
                  isNew: entry.isNew === true,
                  isPaused: entry.isPaused === true,
                  roleId: String(entry.roleId || "").trim(),
                  roleLabel: String(entry.roleLabel || "").trim(),
                };
              }
              return {
                name: String(entry || "").trim(),
                userId: "",
                avatarUrl: "",
                profileUrl: "",
                isOwner: false,
                isNew: false,
                isPaused: false,
                roleId: "",
                roleLabel: "",
              };
            })
            .sort(function (a, b) {
              return (b && b.isOwner ? 1 : 0) - (a && a.isOwner ? 1 : 0);
            })
            .filter(function (entry) {
              return entry.name;
            }),
        };
      })
      .filter(function (g) {
        return g.members.length > 0 && !isGenericStaffGroupRole(g.role);
      });
  }

  function normalizeBoostHoverMembers(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map(function (entry) {
        if (!entry || typeof entry !== "object") return null;
        var boostCount = Math.floor(Number(entry.boostCount || 0));
        if (boostCount < 1) boostCount = 1;
        if (boostCount > 2) boostCount = 2;
        return {
          name: String(entry.name || "").trim(),
          userId: String(entry.userId || "").trim(),
          avatarUrl: String(entry.avatarUrl || "").trim(),
          profileUrl: String(entry.profileUrl || "").trim(),
          boostCount: boostCount,
        };
      })
      .filter(function (entry) {
        return entry && entry.name;
      })
      .sort(function (a, b) {
        var dc = Number(b.boostCount || 0) - Number(a.boostCount || 0);
        if (dc) return dc;
        return String(a.name).localeCompare(String(b.name), "it");
      });
  }

  function normalizeMemberPulse(raw) {
    if (!raw || typeof raw !== "object") return null;
    var online = raw.onlineNow != null && Number.isFinite(Number(raw.onlineNow)) ? Math.max(0, Math.floor(Number(raw.onlineNow))) : null;
    return {
      messages7d: Math.max(0, Math.floor(Number(raw.messages7d || 0))),
      voiceSeconds7d: Math.max(0, Math.floor(Number(raw.voiceSeconds7d || 0))),
      activeMembers7d: Math.max(0, Math.floor(Number(raw.activeMembers7d || 0))),
      onlineNow: online,
    };
  }

  function normalizeCommunityHours(raw) {
    if (!raw || typeof raw !== "object") return { slots: [], blurb: "" };
    var slots = Array.isArray(raw.slots)
      ? raw.slots
          .slice(0, 4)
          .map(function (row) {
            if (!row || typeof row !== "object") return null;
            var pct = Math.max(32, Math.min(100, Math.round(Number(row.pct || 0) || 32)));
            return {
              id: String(row.id || "").trim(),
              label: String(row.label || "").trim(),
              range: String(row.range || "").trim(),
              hint: String(row.hint || "").trim(),
              pct: pct,
              hottest: row.hottest === true,
            };
          })
          .filter(function (row) {
            return row && row.label;
          })
      : [];
    return {
      slots: slots,
      blurb: String(raw.blurb || "").trim(),
    };
  }

  function formatItInt(n) {
    n = Math.max(0, Math.floor(Number(n) || 0));
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function formatVoiceHours(seconds) {
    var hours = Math.max(0, Number(seconds) || 0) / 3600;
    if (hours >= 100) return formatItInt(Math.round(hours)) + " h";
    var rounded = Math.round(hours * 10) / 10;
    return String(rounded).replace(".", ",") + " h";
  }

  function hasPulseNumbers(pulse) {
    return !!(pulse && (pulse.messages7d > 0 || pulse.voiceSeconds7d > 0 || pulse.activeMembers7d > 0));
  }

  function applyExtraStats(extra) {
    if (!extra || typeof extra !== "object") return false;
    var changed = false;
    if (extra.staffNoPm != null) {
      setText("staff", extra.staffNoPm);
      changed = true;
    }
    if (Array.isArray(extra.staffHoverGroups)) {
      staffHoverGroups = normalizeStaffHoverGroups(extra.staffHoverGroups);
      changed = true;
    }
    if (Array.isArray(extra.boostHoverMembers)) {
      boostHoverMembers = normalizeBoostHoverMembers(extra.boostHoverMembers);
      changed = true;
    }
    if (extra.memberPulse && typeof extra.memberPulse === "object") {
      memberPulse = normalizeMemberPulse(extra.memberPulse);
      changed = true;
    }
    if (extra.communityHours && typeof extra.communityHours === "object") {
      communityHours = normalizeCommunityHours(extra.communityHours);
      changed = true;
    }
    if (changed) updateStatRosterUi();
    return changed;
  }

  function prefetchStaffData() {
    if (staffLoadPending) return;
    staffLoadPending = true;
    fetchExtraStatsJson()
      .then(function (extra) {
        applyExtraStats(extra);
      })
      .finally(function () {
        staffLoadPending = false;
        updateStatRosterUi();
      });
  }

  function statsRoot() {
    return document.getElementById("stats");
  }

  function staffCell() {
    var staffNode = el("staff");
    if (!staffNode) return null;
    return staffNode.closest(".vc-stat-cell");
  }

  function boostCell() {
    var boostNode = el("boosts");
    if (!boostNode) return null;
    return boostNode.closest(".vc-stat-cell");
  }

  function membersCell() {
    var membersNode = el("members");
    if (!membersNode) return null;
    return membersNode.closest(".vc-stat-cell");
  }

  function hoursCell() {
    var hoursNode = document.querySelector(".vc-stat-247");
    if (!hoursNode) return null;
    return hoursNode.closest(".vc-stat-cell");
  }

  function rosterEl() {
    return document.getElementById("vc-home-staff-roster");
  }

  function isRosterKind(kind) {
    return kind === "staff" || kind === "boost" || kind === "members" || kind === "hours";
  }

  function rosterMeta(kind) {
    if (kind === "boost") {
      return { cls: "boost", show: "Mostra i booster", hide: "Nascondi i booster" };
    }
    if (kind === "members") {
      return { cls: "members", show: "Mostra l’attività dei membri", hide: "Nascondi l’attività dei membri" };
    }
    if (kind === "hours") {
      return { cls: "hours", show: "Mostra le fasce più attive", hide: "Nascondi le fasce più attive" };
    }
    return { cls: "staff", show: "Mostra lo staff", hide: "Nascondi lo staff" };
  }

  function isStaffOpen() {
    return rosterKind === "staff";
  }

  function isBoostOpen() {
    return rosterKind === "boost";
  }

  function cellVisibleName(cell) {
    var numEl = cell.querySelector(".vc-stat-num-inner") || cell.querySelector(".vc-stat-num");
    var labelEl = cell.querySelector(".vc-stat-label");
    var parts = [];
    if (numEl) parts.push(String(numEl.textContent || "").replace(/\s+/g, " ").trim());
    if (labelEl) parts.push(String(labelEl.textContent || "").replace(/\s+/g, " ").trim());
    return parts.filter(Boolean).join(" ");
  }

  function syncRosterCell(cell, open, showLabel, hideLabel) {
    if (!cell) return;
    cell.setAttribute("aria-expanded", open ? "true" : "false");
    var visible = cellVisibleName(cell);
    var action = open ? hideLabel : showLabel;
    cell.setAttribute("aria-label", visible ? visible + ". " + action : action);
  }

  function setRosterOpen(kind) {
    var next = isRosterKind(kind) ? kind : null;
    var wasOpen = isRosterKind(rosterKind);
    rosterKind = next;
    var root = statsRoot();
    var staff = staffCell();
    var boost = boostCell();
    var members = membersCell();
    var hours = hoursCell();
    var roster = rosterEl();
    if (root) {
      root.classList.toggle("is-staff-open", next === "staff");
      root.classList.toggle("is-boost-open", next === "boost");
      root.classList.toggle("is-members-open", next === "members");
      root.classList.toggle("is-hours-open", next === "hours");
      root.classList.toggle("is-roster-open", next != null);
    }
    if (staff) staff.classList.toggle("vc-stat-cell--staff-open", next === "staff");
    if (boost) boost.classList.toggle("vc-stat-cell--boost-open", next === "boost");
    if (members) members.classList.toggle("vc-stat-cell--members-open", next === "members");
    if (hours) hours.classList.toggle("vc-stat-cell--hours-open", next === "hours");
    syncRosterCell(staff, next === "staff", "Mostra lo staff", "Nascondi lo staff");
    syncRosterCell(boost, next === "boost", "Mostra i booster", "Nascondi i booster");
    syncRosterCell(members, next === "members", "Mostra l’attività dei membri", "Nascondi l’attività dei membri");
    syncRosterCell(hours, next === "hours", "Mostra le fasce più attive", "Nascondi le fasce più attive");
    if (roster) roster.setAttribute("aria-hidden", next ? "false" : "true");
    updateStatRosterBody();
    if (next && !wasOpen && roster && typeof roster.scrollIntoView === "function") {
      window.setTimeout(function () {
        try {
          roster.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "nearest" });
        } catch (e) {}
      }, 80);
    }
  }

  function toggleRoster(kind) {
    if (rosterKind === kind) {
      setRosterOpen(null);
        return;
      }
    if ((kind === "staff" && !staffHoverGroups.length && !staffLoadPending) ||
        (kind === "boost" && !boostHoverMembers.length && !staffLoadPending) ||
        (kind === "members" && !hasPulseNumbers(memberPulse) && !staffLoadPending) ||
        (kind === "hours" && !(communityHours && communityHours.slots && communityHours.slots.length) && !staffLoadPending)) {
      prefetchStaffData();
    }
    setRosterOpen(kind);
  }

  function staffInitial(name) {
    var s = String(name || "").trim();
    if (!s) return "?";
    var ch = s.charAt(0);
    return /[a-z0-9]/i.test(ch) ? ch.toUpperCase() : ch;
  }

  function userIdFromStaffMember(member) {
    var id = String((member && member.userId) || "").trim();
    if (/^\d{16,22}$/.test(id)) return id;
    var href = String((member && member.profileUrl) || "").trim();
    var m = href.match(/[?&]id=(\d{16,22})/);
    return m ? m[1] : "";
  }

  function safeDiscordAvatarUrl(url) {
    var u = String(url || "").trim();
    if (/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(u)) return u;
    return "";
  }

  function defaultDiscordAvatarUrl(userId) {
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

  function renderStaffAvatarHtml(member, hue) {
    var uid = userIdFromStaffMember(member);
    var src = safeDiscordAvatarUrl(member && member.avatarUrl) || (uid ? defaultDiscordAvatarUrl(uid) : "");
    var initial = escText(staffInitial(member && member.name));
    if (!src) {
        return (
        '<span class="vc-home-staff-roster__avatar" style="--vc-staff-badge-h:' +
        hue +
        '" aria-hidden="true">' +
        initial +
        "</span>"
      );
    }
    return (
      '<span class="vc-home-staff-roster__avatar vc-home-staff-roster__avatar--img" style="--vc-staff-badge-h:' +
      hue +
      '" aria-hidden="true">' +
      '<img src="' +
      escText(src) +
      '" alt="" width="40" height="40" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-vc-avatar="1"' +
      (uid ? ' data-user-id="' + escText(uid) + '"' : "") +
      ' onerror="this.onerror=null;this.remove();" />' +
      '<span class="vc-home-staff-roster__avatar-fallback">' +
      initial +
      "</span></span>"
    );
  }

  function renderMarqueeNameHtml(name) {
    return (
      '<span class="vc-home-staff-roster__name vc-marquee" data-vc-marquee>' +
      '<span class="vc-marquee__track">' +
      '<span class="vc-marquee__text">' +
      escText(name) +
      "</span></span></span>"
    );
  }

  function rosterNameAvailableWidth(nameEl) {
    var person = nameEl && nameEl.closest ? nameEl.closest(".vc-home-staff-roster__person") : null;
    if (!person) return Math.floor(nameEl.clientWidth || 0);
    var cs = window.getComputedStyle(person);
    var pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
    var gap = parseFloat(cs.columnGap || cs.gap) || 0;
    var used = 0;
    var extra = 0;
    for (var i = 0; i < person.children.length; i += 1) {
      var child = person.children[i];
      if (child === nameEl) continue;
      used += child.getBoundingClientRect().width;
      extra += 1;
    }
    return Math.max(0, Math.floor(person.clientWidth - pad - used - gap * extra));
  }

  function applyRosterNameMarquee(nameEl) {
    if (!nameEl) return;
    var trackEl = nameEl.querySelector(".vc-marquee__track");
    var textEl = trackEl && trackEl.querySelector(".vc-marquee__text");
    if (!trackEl || !textEl) return;
    var clones = trackEl.querySelectorAll(".vc-marquee__text.is-clone");
    for (var i = 0; i < clones.length; i += 1) clones[i].parentNode.removeChild(clones[i]);
    if (trackEl._vcMarqueeRaf) {
      cancelAnimationFrame(trackEl._vcMarqueeRaf);
      trackEl._vcMarqueeRaf = null;
    }
    nameEl.classList.remove("is-marquee");
    nameEl.style.removeProperty("--vc-marquee-distance");
    nameEl.style.removeProperty("--vc-marquee-duration");
    textEl.style.paddingInlineEnd = "";
    trackEl.style.transform = "";

    window.requestAnimationFrame(function () {
      if (!nameEl.isConnected) return;
      var containerW = rosterNameAvailableWidth(nameEl);
      if (containerW <= 8) return;
      var textW = Math.ceil(textEl.scrollWidth || textEl.offsetWidth || 0);
      if (textW <= containerW + 2) return;
      var clone = textEl.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.classList.add("is-clone");
      trackEl.appendChild(clone);
      textEl.style.paddingInlineEnd = "1.6rem";
      window.requestAnimationFrame(function () {
        if (!nameEl.isConnected) return;
        var segmentW = Math.ceil(textEl.getBoundingClientRect().width || textEl.scrollWidth || textW);
        if (segmentW <= 0) segmentW = textW + 26;
        nameEl.style.setProperty("--vc-marquee-distance", segmentW + "px");
        nameEl.style.setProperty(
          "--vc-marquee-duration",
          Math.max(7, Math.min(22, segmentW / 28)).toFixed(1) + "s",
        );
        nameEl.classList.add("is-marquee");
        startRosterMarqueeTick(trackEl, segmentW, Math.max(7, Math.min(22, segmentW / 28)));
      });
    });
  }

  function startRosterMarqueeTick(trackEl, distance, durationSec) {
    if (!trackEl) return;
    if (trackEl._vcMarqueeRaf) {
      cancelAnimationFrame(trackEl._vcMarqueeRaf);
      trackEl._vcMarqueeRaf = null;
    }
    var dist = Math.max(1, Number(distance) || 1);
    var dur = Math.max(5000, Number(durationSec) * 1000);
    var t0 = performance.now();
    function frame(now) {
      if (!trackEl.isConnected) return;
      var p = ((now - t0) % dur) / dur;
      trackEl.style.transform = "translateX(" + (-dist * p).toFixed(2) + "px)";
      trackEl._vcMarqueeRaf = requestAnimationFrame(frame);
    }
    trackEl._vcMarqueeRaf = requestAnimationFrame(frame);
  }

  function syncRosterNameMarquees() {
    var roster = rosterEl();
    if (!roster) return;
    function run() {
      var nodes = roster.querySelectorAll(".vc-home-staff-roster__name[data-vc-marquee]");
      for (var i = 0; i < nodes.length; i += 1) applyRosterNameMarquee(nodes[i]);
    }
    window.requestAnimationFrame(function () {
      run();
      window.setTimeout(run, 120);
      window.setTimeout(run, 560);
    });
  }

  function renderStaffMember(member, group) {
    var name = String((member && member.name) || member || "").trim();
    var href = String((member && member.profileUrl) || "").trim();
            var isOwner = Boolean(member && member.isOwner === true);
    var rlab = String((member && member.roleLabel) || "").trim() || String((group && group.role) || "").trim();
    var rid = String((member && member.roleId) || "").trim() || String((group && group.roleId) || "").trim();
            if (!name) return "";
    var hue = hueFromRoleId(rid || rlab);
            var ownerB = isOwner
              ? '<span class="vc-owner-badge" title="Server Owner" aria-label="Server Owner">Owner</span>'
              : "";
    var newB = Boolean(member && member.isNew === true)
      ? '<span class="vc-staff-new-badge" title="Nuovo staff" aria-label="Nuovo staff">Nuovo</span>'
      : "";
    var pauseB = Boolean(member && member.isPaused === true)
      ? '<span class="vc-staff-pause-badge" title="In pausa" aria-label="In pausa">Pausa</span>'
      : "";
    var groupRole = String((group && group.role) || "").replace(/^༄\s*/, "").trim().toLowerCase();
    var memberRole = String((member && member.roleLabel) || "").replace(/^༄\s*/, "").trim();
    var roleB = memberRole && memberRole.toLowerCase() !== groupRole
      ? '<span class="vc-staff-role-badge" style="--vc-staff-badge-h:' +
                hue +
                '" title="' +
        escText(memberRole) +
                '">' +
        escText(memberRole) +
        "</span>"
      : "";
    var badges =
      ownerB || newB || pauseB || roleB
        ? '<span class="vc-staff-member-chip__badges">' + ownerB + newB + pauseB + roleB + "</span>"
        : "";
    var inner =
      renderStaffAvatarHtml(member, hue) +
      renderMarqueeNameHtml(name) +
      badges;
    var person = /^\/user\/\?id=\d{16,22}$/i.test(href)
      ? '<a class="vc-home-staff-roster__person" href="' + escText(href) + '">' + inner + "</a>"
      : '<span class="vc-home-staff-roster__person">' + inner + "</span>";
    return "<li>" + person + "</li>";
  }

  function renderStaffRosterHtml() {
    if (!staffHoverGroups.length) {
      return (
        '<p class="vc-home-staff-roster__empty">' +
        (staffLoadPending ? "Caricamento…" : "Nessun membro staff disponibile.") +
        "</p>"
      );
    }
    var shown = "";
    var staffNum = el("staff");
    if (staffNum) {
      shown = String(((staffNum.querySelector(".vc-stat-num-inner") || staffNum).textContent || "")).replace(/\D/g, "");
    }
    var groups = staffHoverGroups
      .map(function (group) {
        if (isGenericStaffGroupRole(group && group.role)) return "";
        var members = Array.isArray(group && group.members) ? group.members : [];
        if (!members.length) return "";
        var hue = hueFromRoleId(String((group && group.roleId) || group.role || ""));
        var role = String((group && group.role) || "Staff").replace(/^༄\s*/, "");
        return (
          '<section class="vc-home-staff-roster__group" style="--vc-staff-badge-h:' +
          hue +
          '">' +
          '<p class="vc-home-staff-roster__group-title">' +
          escText(role) +
          "</p>" +
          '<ul class="vc-home-staff-roster__list">' +
          members.map(function (member) {
            return renderStaffMember(member, group);
          }).join("") +
          "</ul></section>"
        );
      })
      .join("");
    return (
      '<div class="vc-home-staff-roster__head">' +
      '<p class="vc-home-staff-roster__kicker">Lo staff</p>' +
      '<p class="vc-home-staff-roster__count">' +
      escText(shown || "—") +
      " persone</p>" +
      "</div>" +
      '<div class="vc-home-staff-roster__groups">' +
      groups +
      "</div>"
    );
  }

  function renderBoostMember(member) {
    var name = String((member && member.name) || "").trim();
    var href = String((member && member.profileUrl) || "").trim();
    if (!name) return "";
    var count = Math.max(1, Math.min(2, Math.floor(Number((member && member.boostCount) || 1))));
    var hue = count >= 2 ? 28 : 36;
    var badge =
      '<span class="vc-home-boost-count">' +
      count +
      (count === 1 ? " boost" : " boost") +
      "</span>";
    var inner =
      renderStaffAvatarHtml(member, hue) +
      renderMarqueeNameHtml(name) +
      badge;
    var person = /^\/user\/\?id=\d{16,22}$/i.test(href)
      ? '<a class="vc-home-staff-roster__person" href="' + escText(href) + '">' + inner + "</a>"
      : '<span class="vc-home-staff-roster__person">' + inner + "</span>";
    return "<li>" + person + "</li>";
  }

  function renderBoostRosterHtml() {
    if (!boostHoverMembers.length) {
      return (
        '<p class="vc-home-staff-roster__empty">' +
        (staffLoadPending ? "Caricamento…" : "Nessun booster disponibile.") +
        "</p>"
      );
    }
    var people = String(boostHoverMembers.length);
    var boosts = 0;
    for (var i = 0; i < boostHoverMembers.length; i += 1) {
      boosts += Math.max(1, Math.floor(Number(boostHoverMembers[i].boostCount || 1)));
    }
    var shown = "";
    var boostNum = el("boosts");
    if (boostNum) {
      shown = String(((boostNum.querySelector(".vc-stat-num-inner") || boostNum).textContent || "")).replace(/\D/g, "");
    }
    if (!shown) shown = String(boosts);
    var rows = boostHoverMembers
      .map(function (member) {
        return renderBoostMember(member);
      })
      .join("");
    return (
      '<div class="vc-home-staff-roster__head">' +
      '<p class="vc-home-staff-roster__kicker">I booster</p>' +
      '<p class="vc-home-staff-roster__count">' +
      escText(people) +
      " persone · " +
      escText(shown) +
      " boost</p>" +
      "</div>" +
      '<section class="vc-home-staff-roster__group vc-home-boost-roster__panel" style="--vc-staff-badge-h:32">' +
      '<ul class="vc-home-staff-roster__list vc-home-boost-roster__list">' +
      rows +
      "</ul></section>"
    );
  }

  function renderPulseCard(value, label, hint) {
    return (
      '<article class="vc-home-pulse__card">' +
      '<p class="vc-home-pulse__value">' +
      escText(value) +
      "</p>" +
      '<p class="vc-home-pulse__label">' +
      escText(label) +
      "</p>" +
      (hint ? '<p class="vc-home-pulse__hint">' + escText(hint) + "</p>" : "") +
      "</article>"
    );
  }

  function renderMembersPulseHtml() {
    if (!hasPulseNumbers(memberPulse)) {
      return (
        '<p class="vc-home-staff-roster__empty">' +
        (staffLoadPending ? "Caricamento…" : "Stiamo aggiornando i numeri della settimana.") +
        "</p>"
      );
    }
    var cards = "";
    if (memberPulse.messages7d > 0) {
      cards += renderPulseCard(formatItInt(memberPulse.messages7d), "Messaggi", "in chat, negli ultimi 7 giorni");
    }
    if (memberPulse.voiceSeconds7d > 0) {
      cards += renderPulseCard(formatVoiceHours(memberPulse.voiceSeconds7d), "Vocali", "ore passate insieme");
    }
    if (memberPulse.activeMembers7d > 0) {
      cards += renderPulseCard(formatItInt(memberPulse.activeMembers7d), "Membri attivi", "hanno scritto o sono stati in vocale");
    }
    if (memberPulse.onlineNow != null && memberPulse.onlineNow >= 50) {
      cards += renderPulseCard(formatItInt(memberPulse.onlineNow), "Online ora", "già in giro in questo momento");
    }
    return (
      '<div class="vc-home-staff-roster__head">' +
      '<p class="vc-home-staff-roster__kicker">Statistiche server</p>' +
      '<p class="vc-home-staff-roster__count">ultimi 7 giorni</p>' +
      "</div>" +
      '<div class="vc-home-pulse">' +
      cards +
      "</div>"
    );
  }

  function renderHoursSlot(slot) {
    if (!slot || !slot.label) return "";
    var hot = slot.hottest ? " vc-home-hours__row--hot" : "";
    var badge = slot.hottest ? '<span class="vc-home-hours__hot">Il momento clou</span>' : "";
    return (
      '<li class="vc-home-hours__row' +
      hot +
      '">' +
      '<div class="vc-home-hours__meta">' +
      '<span class="vc-home-hours__label">' +
      escText(slot.label) +
      "</span>" +
      '<span class="vc-home-hours__range">' +
      escText(slot.range || "") +
      "</span>" +
      badge +
      "</div>" +
      '<div class="vc-home-hours__track" aria-hidden="true"><span class="vc-home-hours__bar" style="width:' +
      String(slot.pct || 32) +
      '%"></span></div>' +
      (slot.hint ? '<p class="vc-home-hours__hint">' + escText(slot.hint) + "</p>" : "") +
      "</li>"
    );
  }

  function renderHoursPulseHtml() {
    var slots = communityHours && Array.isArray(communityHours.slots) ? communityHours.slots : [];
    var blurb =
      (communityHours && communityHours.blurb) ||
      "C’è sempre qualcuno in giro: chat di giorno, vocal di sera.";
    if (!slots.length) {
      return (
        '<div class="vc-home-staff-roster__head">' +
        '<p class="vc-home-staff-roster__kicker">Sempre aperti</p>' +
        '<p class="vc-home-staff-roster__count">24/7</p>' +
        "</div>" +
        '<p class="vc-home-hours__blurb">' +
        escText(staffLoadPending ? "Caricamento…" : blurb) +
        "</p>"
      );
    }
    return (
      '<div class="vc-home-staff-roster__head">' +
      '<p class="vc-home-staff-roster__kicker">Quando ci trovi</p>' +
      '<p class="vc-home-staff-roster__count">le fasce più vive</p>' +
      "</div>" +
      '<p class="vc-home-hours__blurb">' +
      escText(blurb) +
      "</p>" +
      '<ul class="vc-home-hours">' +
      slots
        .map(function (slot) {
          return renderHoursSlot(slot);
        })
        .join("") +
      "</ul>"
    );
  }

  function bindToggleCell(cell, kind) {
    if (!cell || cell.dataset.vcStatToggle === "1") return;
    var meta = rosterMeta(kind);
    cell.dataset.vcStatToggle = "1";
    cell.classList.add("vc-stat-cell--" + meta.cls);
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-controls", "vc-home-staff-roster");
    if (!cell.getAttribute("aria-expanded")) cell.setAttribute("aria-expanded", "false");
    syncRosterCell(cell, false, meta.show, meta.hide);
    if (!cell.querySelector(".vc-stat-staff-chev")) {
      var chev = document.createElement("span");
      chev.className = "vc-stat-staff-chev";
      chev.setAttribute("aria-hidden", "true");
      cell.appendChild(chev);
    }
    cell.addEventListener("click", function (ev) {
      if (ev && ev.target && ev.target.closest && ev.target.closest("a")) return;
      toggleRoster(kind);
    });
    cell.addEventListener("keydown", function (ev) {
      var key = String((ev && ev.key) || "");
      if (key !== "Enter" && key !== " ") return;
      if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
      cell.click();
    });
  }

  function ensureStatRosterUi() {
    var staff = staffCell();
    var boost = boostCell();
    var members = membersCell();
    var hours = hoursCell();
    var strip =
      (staff && staff.closest(".vc-stat-strip")) ||
      (boost && boost.closest(".vc-stat-strip")) ||
      (members && members.closest(".vc-stat-strip")) ||
      (hours && hours.closest(".vc-stat-strip"));
    bindToggleCell(staff, "staff");
    bindToggleCell(boost, "boost");
    bindToggleCell(members, "members");
    bindToggleCell(hours, "hours");
    var roster = rosterEl();
    if (!roster && strip) {
      roster = document.createElement("div");
      roster.id = "vc-home-staff-roster";
      roster.className = "vc-home-staff-roster";
      roster.setAttribute("aria-hidden", "true");
      roster.innerHTML =
        '<div class="vc-home-staff-roster__clip"><div class="vc-home-staff-roster__inner" data-staff-roster-body></div></div>';
      strip.appendChild(roster);
    }
    var root = statsRoot();
    if (root && root.dataset.vcStatRosterUi === "1") return;
    if (root) root.dataset.vcStatRosterUi = "1";
    document.addEventListener("click", function (ev) {
      var t = ev && ev.target;
      if (!t || !t.closest) return;
      if (
        t.closest(".vc-stat-cell--staff") ||
        t.closest(".vc-stat-cell--boost") ||
        t.closest(".vc-stat-cell--members") ||
        t.closest(".vc-stat-cell--hours") ||
        t.closest("#vc-home-staff-roster")
      ) {
        return;
      }
      setRosterOpen(null);
    });
    document.addEventListener("keydown", function (ev) {
      if (String((ev && ev.key) || "") === "Escape") setRosterOpen(null);
    });
  }

  function updateStatRosterBody() {
    var roster = rosterEl();
    var body = roster && roster.querySelector("[data-staff-roster-body]");
    if (!body) return;
    if (rosterKind === "boost") body.innerHTML = renderBoostRosterHtml();
    else if (rosterKind === "staff") body.innerHTML = renderStaffRosterHtml();
    else if (rosterKind === "members") body.innerHTML = renderMembersPulseHtml();
    else if (rosterKind === "hours") body.innerHTML = renderHoursPulseHtml();
    if (rosterKind === "staff" || rosterKind === "boost") syncRosterNameMarquees();
  }

  function updateStatRosterUi() {
    ensureStatRosterUi();
    updateStatRosterBody();
  }

  function fetchNoStore(url) {
    return fetch(url, { cache: "no-store", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  function inviteUrls() {
    var code = String(cfg.inviteCode || "").trim();
    if (!code) return [];
    var list = [];
    var proxy = cfg.inviteProxyPath;
    if (proxy && String(proxy).trim()) {
      try {
        list.push(new URL(String(proxy).trim(), location.origin).toString());
      } catch (e) {
        /* ignore */
      }
    }
    list.push(
      "https://discord.com/api/v10/invites/" + encodeURIComponent(code) + "?with_counts=true",
    );
    return list;
  }

  function guildIconUrlFromInvitePayload(data) {
    var guild = data && data.guild;
    var gid = guild && guild.id != null ? String(guild.id).trim() : "";
    var icon = guild && guild.icon != null ? String(guild.icon).trim() : "";
    if (!gid || !icon) return "";
    var ext = icon.indexOf("a_") === 0 ? "gif" : "png";
    return "https://cdn.discordapp.com/icons/" + gid + "/" + icon + "." + ext + "?size=128";
  }

  function applyHeaderGuildIcon(url) {
    var u = String(url || "").trim();
    if (!u) return;
    // Dashboard: il logo header è del server selezionato, non del server principale Vinili.
    try {
      if (document.body && document.body.classList.contains("vc-dashboard-page")) return;
    } catch (e0) {}
    var imgs = document.querySelectorAll("img.vc-header-logo-img");
    for (var i = 0; i < imgs.length; i += 1) {
      // Non sovrascrivere logo del server sulla dashboard guild.
      if (imgs[i].getAttribute("data-vc-guild-brand") === "1") continue;
      if (imgs[i].id === "vc-dashboard-header-guild-icon") continue;
      if (imgs[i].getAttribute("src") !== u) imgs[i].setAttribute("src", u);
    }
  }

  function refreshInvite() {
    var urls = inviteUrls();
    if (!urls.length) return Promise.resolve();

    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(new Error("invite_exhausted"));
      return fetchNoStore(urls[i]).then(function (data) {
        applyHeaderGuildIcon(guildIconUrlFromInvitePayload(data));
        return data;
      }).catch(function () {
        return tryOne(i + 1);
      });
    }

    return tryOne(0);
  }

  function resolveExtraStatsPath() {
    var p = cfg.extraStatsPath;
    if (p != null && String(p).trim() !== "") {
      try {
        return new URL(String(p).trim(), location.origin).toString();
      } catch (e) {
        return String(p).trim();
      }
    }
    try {
      return new URL("/live-stats-extra.json", location.origin).toString();
    } catch (e2) {
      return "/live-stats-extra.json";
    }
  }

  function fetchExtraStatsJson() {
    return fetchNoStore(resolveExtraStatsPath()).catch(function () {
      return null;
    });
  }

  /**
   * Membri/boost: stessi valori della classifica (guild dal bot). Priorità a live-stats-extra.json
   * (guildMemberCount / guildBoostCount); fallback invite Discord se mancano nel JSON.
   */
  function tick() {
    Promise.all([fetchExtraStatsJson(), refreshInvite().catch(function () {
      return null;
    })]).then(function (pair) {
      var extra = pair[0];
      var inv = pair[1];
      applyExtraStats(extra);
      var guildMem =
        extra && extra.guildMemberCount != null && Number.isFinite(Number(extra.guildMemberCount))
          ? Number(extra.guildMemberCount)
          : null;
      if (guildMem != null) {
        setText("members", guildMem);
      } else if (inv && inv.approximate_member_count != null) {
        setText("members", inv.approximate_member_count);
      }
      var guildBoost =
        extra && extra.guildBoostCount != null && Number.isFinite(Number(extra.guildBoostCount))
          ? Number(extra.guildBoostCount)
          : null;
      if (guildBoost != null) {
        setText("boosts", guildBoost);
      } else if (inv && inv.guild && inv.guild.premium_subscription_count != null) {
        setText("boosts", inv.guild.premium_subscription_count);
      }
    });
  }

  function reveal247() {
    var n = document.querySelector(".vc-stat-247");
    if (!n) return;
    n.classList.add("vc-stat-247--in");
  }

  function startIntroThenPoll() {
    if (introHasStarted) return;
    introHasStarted = true;
    if (ioFallbackTimer) {
      clearTimeout(ioFallbackTimer);
      ioFallbackTimer = null;
    }
    var keys = ["members", "boosts", "staff"];
    var pending = 0;
    var maxDur = 0;
    function doneOne() {
      pending -= 1;
      if (pending <= 0) {
        setTimeout(reveal247, Math.min(520, maxDur * 0.45));
        tick();
        var ms = Number(cfg.pollIntervalMs) || 45000;
        if (!pollStarted && ms >= 5000 && !isLocalDevHost()) {
          pollStarted = true;
          setInterval(tick, ms);
        }
      }
    }
    keys.forEach(function (k) {
      var node = el(k);
      if (!node) return;
      var inner = statInnerNode(node);
      var target = readTargetFromDom(node);
      inner.textContent = "0";
      var dur = durationIntro(target);
      maxDur = Math.max(maxDur, dur);
      pending += 1;
      animateNumber(inner, 0, target, dur, doneOne);
    });
    if (pending === 0) doneOne();
  }

  function isLocalDevHost() {
    var h = String(location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  function statsIntroTargetEl() {
    var sec = document.getElementById("stats");
    if (!sec) return null;
    var strip = sec.querySelector(".vc-stat-strip");
    return strip || sec;
  }

  function wireIntroObserver() {
    var root = statsIntroTargetEl();
    if (!root) {
      startIntroThenPoll();
      return;
    }
    if (prefersReducedMotion()) {
      startIntroThenPoll();
      return;
    }
    if (typeof IntersectionObserver === "undefined") {
      startIntroThenPoll();
      return;
    }
    var introThreshold = 0.38;
    var obs = new IntersectionObserver(
      function (entries) {
        for (var i = 0; i < entries.length; i += 1) {
          var e = entries[i];
          if (!e.isIntersecting) continue;
          var ratio = typeof e.intersectionRatio === "number" ? e.intersectionRatio : 0;
          if (ratio < introThreshold) continue;
          obs.disconnect();
          if (ioFallbackTimer) {
            clearTimeout(ioFallbackTimer);
            ioFallbackTimer = null;
          }
          startIntroThenPoll();
          return;
        }
      },
      {
        root: null,
        rootMargin: "0px 0px -18% 0px",
        threshold: [0, 0.12, 0.25, introThreshold, 0.5, 0.75, 1],
      },
    );
    obs.observe(root);
    var fallbackMs = Math.max(12000, Math.min(120000, Number(cfg.introFallbackMs) || 45000));
    ioFallbackTimer = setTimeout(function () {
      obs.disconnect();
      if (!introHasStarted) startIntroThenPoll();
    }, fallbackMs);
  }

  function bootstrapStaffList() {
    ensureStatRosterUi();
    applyExtraStats({
      staffHoverGroups: cfg.staffHoverGroups,
      boostHoverMembers: cfg.boostHoverMembers,
      staffNoPm: cfg.staffNoPm,
      memberPulse: cfg.memberPulse,
      communityHours: cfg.communityHours,
    });
    prefetchStaffData();
  }

  wireIntroObserver();
  bootstrapStaffList();
})();
(function () {
  var cfg = typeof window !== "undefined" ? window.__VC_LIVE : null;
  if (!cfg || cfg.enabled !== true) return;
  try {
    if (window.__VC_DISABLE_LIVE_EVENT_UI === true) return;
    if (document.body && document.body.classList.contains("vc-hw-page")) return;
    if (document.body && document.body.classList.contains("vc-seratafilm-page")) return;
  } catch (e0) {}
  var apiProd = String(cfg.liveEventApiUrl || "").trim();
  if (!apiProd) return;

  function isLocalOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedLiveEventUrl() {
    var local = String(cfg.liveEventApiUrlLocal || "").trim();
    if (isLocalOrigin() && local) return local;
    return apiProd;
  }

  var LIVE_EVENT_DISMISS_KEY = "vc_live_event_dismiss_v1";

  function getDismissedEventId() {
    try {
      return String(localStorage.getItem(LIVE_EVENT_DISMISS_KEY) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function setDismissedEventId(id) {
    var s = String(id || "").trim();
    if (!s) return;
    try {
      localStorage.setItem(LIVE_EVENT_DISMISS_KEY, s);
    } catch (e) {}
  }

  function clearDismissedEventId() {
    try {
      localStorage.removeItem(LIVE_EVENT_DISMISS_KEY);
    } catch (e) {}
  }

  function ensureLiveEventRoot() {
    var n = document.getElementById("vc-live-event-home");
    if (!n) {
      n = document.createElement("section");
      n.id = "vc-live-event-home";
      n.className = "vc-live-event-home";
      n.hidden = true;
      n.setAttribute("aria-live", "polite");
      n.setAttribute("role", "region");
      n.setAttribute("aria-label", "Evento Discord in corso");
    }

    if (n.parentNode !== document.body) {
      document.body.appendChild(n);
    }

    n.innerHTML =
      '<div class="vc-live-event-inline">' +
      '<button type="button" class="vc-live-event-inline__x" data-vc-live-event-dismiss aria-label="Nascondi evento live">' +
      '<i class="fa fa-times" aria-hidden="true"></i>' +
      "</button>" +
      '<p class="vc-live-event-inline__badge"><i class="fa fa-bolt" aria-hidden="true"></i> Evento live su Discord</p>' +
      '<h2 id="vc-live-event-title" class="vc-live-event-inline__title">Evento in corso</h2>' +
      '<p id="vc-live-event-desc" class="vc-live-event-inline__desc"></p>' +
      '<div class="vc-live-event-inline__actions">' +
      '<a id="vc-live-event-primary" class="vc-live-event-inline__btn" href="#" target="_blank" rel="noopener noreferrer">Partecipa</a>' +
      "</div>" +
      "</div>";
    return n;
  }

  function ensureReopenButton() {
    var btn = document.getElementById("vc-live-event-reopen");
    if (btn) return btn;
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "vc-live-event-reopen";
    btn.className = "vc-live-event-reopen";
    btn.hidden = true;
    btn.setAttribute("aria-controls", "vc-live-event-home");
    btn.setAttribute("aria-label", "Riapri evento live");
    btn.innerHTML = '<i class="fa fa-bolt" aria-hidden="true"></i><span>Evento live</span>';
    document.body.appendChild(btn);
    return btn;
  }

  var root = ensureLiveEventRoot();
  var reopenBtn = ensureReopenButton();
  var titleEl = document.getElementById("vc-live-event-title");
  var descEl = document.getElementById("vc-live-event-desc");
  var prim = document.getElementById("vc-live-event-primary");
  if (!root || !reopenBtn || !titleEl || !descEl || !prim) return;

  var pollMs = Math.max(20000, Math.min(600000, Number(cfg.liveEventPollMs) || 90000));
  var lastEventPayload = null;
  var lastShownEventId = "";

  function showStrip(data) {
    var ev = data && data.event ? data.event : null;
    var eid = ev && ev.id != null ? String(ev.id).trim() : "";
    if (!ev || !eid) return;
    var dismissed = getDismissedEventId() === eid;
    var wasVisible = !root.hidden && reopenBtn.hidden;
    if (wasVisible && eid === lastShownEventId && !dismissed) {
      titleEl.textContent = ev.name || "Evento in corso";
      descEl.textContent =
        "In questo momento sul server Discord c’è un evento attivo. Unisciti dalla app o dal browser.";
      if (ev.description && String(ev.description).trim()) {
        descEl.textContent = String(ev.description).trim();
      }
      var inviteFast = String(data.inviteUrl || prim.getAttribute("href") || cfg.inviteUrl || "").trim();
      var urlFast = String(ev.buttonUrl || ev.eventUrl || inviteFast).trim();
      var labelFast = String(ev.buttonLabel || "Partecipa").trim() || "Partecipa";
      prim.setAttribute("href", urlFast || inviteFast);
      prim.textContent = labelFast;
      lastEventPayload = data;
      return;
    }

    titleEl.textContent = ev.name || "Evento in corso";
    descEl.textContent =
      "In questo momento sul server Discord c’è un evento attivo. Unisciti dalla app o dal browser.";
    if (ev.description && String(ev.description).trim()) {
      descEl.textContent = String(ev.description).trim();
    }
    var invite = String(data.inviteUrl || prim.getAttribute("href") || cfg.inviteUrl || "").trim();
    var url = String(ev.buttonUrl || ev.eventUrl || invite).trim();
    var label = String(ev.buttonLabel || "Partecipa").trim() || "Partecipa";
    prim.setAttribute("href", url || invite);
    prim.textContent = label;

    lastEventPayload = data;
    lastShownEventId = eid;
    if (dismissed) {
      root.hidden = true;
      reopenBtn.hidden = false;
      return;
    }

    root.hidden = false;
    reopenBtn.hidden = true;
  }

  root.addEventListener("click", function (e) {
    var t = e && e.target;
    if (!t || !t.closest) return;
    if (t.closest("[data-vc-live-event-dismiss]")) {
      var ev0 = lastEventPayload && lastEventPayload.event ? lastEventPayload.event : null;
      var id0 = ev0 && ev0.id != null ? String(ev0.id).trim() : "";
      if (id0) setDismissedEventId(id0);
      root.hidden = true;
      reopenBtn.hidden = false;
    }
  });

  reopenBtn.addEventListener("click", function () {
    clearDismissedEventId();
    reopenBtn.hidden = true;
    if (lastEventPayload) {
      showStrip(lastEventPayload);
      return;
    }
    poll();
  });

  function poll() {
    var u = resolvedLiveEventUrl();
    if (!u) return;
    var sep = u.indexOf("?") >= 0 ? "&" : "?";
    u = u + sep + "_vct=" + encodeURIComponent(String(Date.now()));
    fetch(u, { credentials: "omit", cache: "no-store" })
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (j) {
        if (!j || j.ok !== true) return;
        var jid = j.event && j.event.id != null ? String(j.event.id).trim() : "";
        if (j.active && j.event && jid) {
          showStrip(j);
        } else {
          lastEventPayload = null;
          lastShownEventId = "";
          clearDismissedEventId();
          root.hidden = true;
          reopenBtn.hidden = true;
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(poll, 500);
    });
  } else {
    setTimeout(poll, 500);
  }
  setInterval(poll, pollMs);
})();