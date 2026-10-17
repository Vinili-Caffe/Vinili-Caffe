(function () {
  var VER = "20261003compitiDraftAuto1";
  window.__vcStaffCompitiVer = VER;

  var TASKS = [];

  var state = {
    mode: "staff",
    canSubmit: true,
    canReview: false,
    weekKey: "",
    monthKey: "",
    identity: null,
    progress: null,
    deadlines: null,
    plan: null,
    monthEntries: [],
    staffList: [],
    staffIndex: 0,
    pageIndex: 0,
    pendingProofs: [],
    busy: false,
    flipping: false,
    loaded: false,
    bookReady: false,
    bookOpen: false,
    openPending: false,
    newStaffGrace: null,
  };

  var pageInited = false;
  var flipTimer = 0;
  var staffFlipTimer = 0;
  var loadAbort = null;
  var loadSeq = 0;
  var draftAutoTimer = 0;
  var draftAutoSeq = 0;

  function byId(id) {
    return document.getElementById(id);
  }

  function toast(msg, isError) {
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(String(msg || ""), Boolean(isError));
      }
    } catch (e) {}
  }

  /* compitiScrollUnlock2: dopo save/swap/review sblocca soft-lock (scrollbar) */
  function ensureCompitiScrollUnlocked() {
    try {
      var root = document.documentElement;
      root.classList.remove(
        "vc-scroll-soft-lock",
        "vc-loading-scroll-lock",
        "vc-loader-blocking-live",
        "vc-interaction-hold",
        "vc-dialog-open",
      );
      root.style.removeProperty("overflow");
      root.style.removeProperty("overflow-x");
      root.style.removeProperty("overflow-y");
      if (document.body) {
        document.body.style.removeProperty("overflow");
        document.body.style.removeProperty("overflow-x");
        document.body.style.removeProperty("overflow-y");
        document.body.style.removeProperty("position");
        document.body.style.removeProperty("top");
        document.body.style.removeProperty("left");
        document.body.style.removeProperty("right");
        document.body.style.removeProperty("width");
      }
    } catch (eCls) {}
    try {
      if (typeof window.__vcUnpinPageScroll === "function") window.__vcUnpinPageScroll();
    } catch (eUnpin) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eSync) {}
  }

  function getToken() {
    try {
      if (window.VCStaffTools && typeof window.VCStaffTools.getToken === "function") {
        var shared = String(window.VCStaffTools.getToken() || "").trim();
        if (shared) return shared;
      }
      var t = localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function apiBase() {
    var c = window.__VC_STAFF_COMPITI || {};
    if (window.VCStaffTools && typeof window.VCStaffTools.resolveApiUrl === "function") {
      return window.VCStaffTools.resolveApiUrl(c, "/webhooks/site-staff-compiti");
    }
    return String(c.apiUrl || "/webhooks/site-staff-compiti").trim() || "/webhooks/site-staff-compiti";
  }

  function isHsMode() {
    return state.mode === "highstaff" || state.canReview;
  }

  function monthWeeks() {
    return Array.isArray(state.monthEntries) ? state.monthEntries.slice() : [];
  }

  function hsWeekAt(i) {
    return monthWeeks()[i] || null;
  }

  function currentHsWeekIndex() {
    var weeks = monthWeeks();
    for (var i = 0; i < weeks.length; i++) {
      if (weeks[i].isCurrent || weeks[i].weekKey === state.weekKey) return i;
    }
    return 0;
  }

  function activeHsEntry() {
    if (!isHsMode()) return null;
    return hsWeekAt(state.pageIndex) || null;
  }

  function poolTasks() {
    if (state.plan && Array.isArray(state.plan.tasks) && state.plan.tasks.length) {
      return state.plan.tasks.map(function (t) {
        return {
          id: String(t.id || ""),
          label: String(t.label || t.id || "Compito"),
          auto: Boolean(t.auto),
        };
      });
    }
    var ids =
      (state.progress && state.progress.poolTaskIds) ||
      (state.plan && state.plan.taskIds) ||
      [];
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var id = String(ids[i] || "");
      var meta = null;
      for (var t = 0; t < TASKS.length; t++) {
        if (TASKS[t].id === id) {
          meta = TASKS[t];
        break;
        }
      }
      out.push({
        id: id,
        label: (meta && meta.label) || id || "Compito",
        auto: Boolean(meta && meta.auto),
      });
    }
    return out;
  }

  function taskAt(i) {
    return poolTasks()[i] || null;
  }

  function taskIndexById(id) {
    var pool = poolTasks();
    for (var i = 0; i < pool.length; i++) if (pool[i].id === id) return i;
    return 0;
  }

  function lockedSet() {
    var list = (state.progress && state.progress.lockedTaskIds) || [];
    var s = {};
    for (var i = 0; i < list.length; i++) s[list[i]] = true;
    return s;
  }

  function isLocked(taskId) {
    return Boolean(lockedSet()[taskId]);
  }

  function currentStatus() {
    return String((state.progress && state.progress.status) || "draft");
  }

  function isClosed() {
    var st = currentStatus();
    return st === "approved" || st === "missed" || st === "skipped";
  }

  function canRetryNow() {
    var prog = state.progress || {};
    if (prog.isAuto) return false;
    if (prog.canRetry) return true;
    var d = state.deadlines || {};
    return currentStatus() === "rejected" && Boolean(d.submitOpen);
  }

  function staffCanEdit() {
    if (!state.canSubmit || state.busy) return false;
    var d = state.deadlines || {};
    if (!d.submitOpen) return false;
    if (isClosed()) return false;
    var st = currentStatus();
    if (st === "submitted") return false;
    return st === "draft" || st === "rejected" || !st;
  }

  function renderIdentity() {
    var idn = state.identity || {};
    var avatar = byId("vc-compiti-avatar");
    var nameEl = byId("vc-compiti-name");
    var metaEl = byId("vc-compiti-meta");
    var displayName = String(idn.displayName || idn.username || "Staff").trim() || "Staff";
    var username = String(idn.username || "").trim();
    var avatarUrl = String(idn.avatarUrl || "").trim();
    if (avatar) {
      if (avatarUrl) {
        avatar.src = avatarUrl;
        avatar.alt = displayName;
        avatar.hidden = false;
      } else {
        avatar.removeAttribute("src");
        avatar.hidden = true;
      }
    }
    if (nameEl) nameEl.textContent = displayName;
    if (metaEl) metaEl.textContent = username ? "@" + username : "Staff";
  }

  function renderPill() {
    var el = byId("vc-compiti-progress");
    if (!el) return;
    var pill = (state.progress && state.progress.pill) || { label: "Da fare", kind: "todo" };
    el.textContent = pill.label || "Da fare";
    el.className = "vc-compiti-progress";
    if (pill.kind === "done") el.classList.add("is-done");
    else if (pill.kind === "fail") el.classList.add("is-fail");
    else if (pill.kind === "review") el.classList.add("is-review");
    else if (pill.kind === "retry") el.classList.add("is-retry");
  }

  function setNoteLabels(hsView) {
    var noteLab = document.querySelector('label.vc-compiti-note-label[for="vc-compiti-note"]');
    if (!noteLab) noteLab = document.querySelector(".vc-compiti-form .vc-compiti-note-label");
    if (noteLab) noteLab.textContent = hsView ? "Nota dello staff" : "Scrivi";
    var proofsLab = document.querySelector(".vc-compiti-proofs-head .vc-compiti-note-label");
    if (proofsLab) proofsLab.textContent = hsView ? "Prove allegate" : "Prove (foto / file)";
    var tocTitle = document.querySelector(".vc-compiti-toc-title");
    if (tocTitle) tocTitle.textContent = hsView ? "Settimane" : "Indice";
  }

  function weekIsFuture(w) {
    if (!w) return false;
    if (w.isFuture === true) return true;
    if (w.isCurrent) return false;
    var wk = String(w.weekKey || "");
    var cur = String(state.weekKey || "");
    return Boolean(wk && cur && wk > cur);
  }

  function weekStatusBit(w) {
    if (!w) return "—";
    var st = String(w.status || "");
    /* compitiStatusLabel1: non dire "nessun invio" se la settimana è chiusa/inviata */
    if (w.taskId) return w.label || w.taskId;
    if (w.label && w.label !== "Nessun compito") return w.label;
    if (st === "approved") return w.autoSubmitted ? "auto · confermato" : "confermato";
    if (st === "submitted") return w.autoSubmitted ? "auto · in revisione" : "in revisione";
    if (st === "missed") return "non completato";
    if (st === "rejected") return "rifiutato";
    if (weekIsFuture(w)) return "successiva";
    if (w.isCurrent) return "in corso";
    return "nessun invio";
  }

  function hsLeafTitle(hsEntry, future) {
    if (!hsEntry) return "Nessuna settimana";
    if (hsEntry.taskId) return hsEntry.label || hsEntry.taskId;
    if (hsEntry.label && hsEntry.label !== "Nessun compito") return hsEntry.label;
    var st = String(hsEntry.status || "");
    if (st === "approved") return hsEntry.autoSubmitted ? "Confermato (automatico)" : "Compito confermato";
    if (st === "submitted") return hsEntry.autoSubmitted ? "In revisione (automatico)" : "In revisione";
    if (st === "missed") return "Non completato";
    if (st === "rejected") return "Rifiutato";
    if (future) return "Settimana successiva";
    return "Nessun invio";
  }

  function weekNiceLabel(w, index) {
    var n = (typeof index === "number" ? index : monthWeeks().indexOf(w)) + 1;
    if (n < 1) n = 1;
    if (w && w.isCurrent) return "Settimana " + n + " (corrente)";
    if (weekIsFuture(w)) return "Settimana " + n + " (successiva)";
    return "Settimana " + n;
  }

  function renderToc() {
    var list = byId("vc-compiti-toc");
    if (!list) return;
    var html = "";
    if (isHsMode()) {
      var weeks = monthWeeks();
      for (var wi = 0; wi < weeks.length; wi++) {
        var w = weeks[wi];
        var active = state.pageIndex === wi;
        var future = weekIsFuture(w);
        var mark =
          w.status === "approved"
            ? "✓"
            : w.status === "submitted"
              ? "…"
              : w.status === "missed" || w.status === "rejected"
                ? "✗"
                : future
                  ? "·"
                  : String(wi + 1);
        var weekLabel = weekNiceLabel(w, wi);
        var taskBit = weekStatusBit(w);
        html +=
          '<li><button type="button" class="vc-compiti-toc__item' +
          (active ? " is-active" : "") +
          (w.isCurrent ? " is-picked" : "") +
          (future ? " is-future" : "") +
          '" data-page-index="' +
          wi +
          '">' +
          '<span class="vc-compiti-toc__mark" aria-hidden="true">' +
          mark +
          "</span>" +
          '<span class="vc-compiti-toc__label">' +
          weekLabel +
          " · " +
          taskBit +
          "</span>" +
          "</button></li>";
      }
      list.innerHTML = html || "<li><p class=\"vc-compiti-proofs__empty\">Nessuna settimana</p></li>";
      return;
    }
    var locked = lockedSet();
    var pool = poolTasks();
    var selectedId = state.progress && state.progress.taskId;
    var left = swapsLeft();
    for (var i = 0; i < pool.length; i++) {
      var t = pool[i];
      var used = Boolean(locked[t.id]) && selectedId !== t.id;
      var activeS = state.pageIndex === i;
      var picked = selectedId === t.id;
      var showSwap = canSwapTask(t);
      html +=
        '<li class="vc-compiti-toc__row">' +
        '<button type="button" class="vc-compiti-toc__item' +
        (activeS ? " is-active" : "") +
        (used ? " is-locked" : "") +
        (picked ? " is-picked" : "") +
        '" data-page-index="' +
        i +
        '"' +
        (used ? ' disabled aria-disabled="true"' : "") +
        ">" +
        '<span class="vc-compiti-toc__mark" aria-hidden="true">' +
        (used ? "✗" : picked ? "✓" : String(i + 1)) +
        "</span>" +
        '<span class="vc-compiti-toc__label">' +
        escapeHtml(t.label) +
        "</span>" +
        "</button>";
      if (showSwap) {
        html +=
          '<button type="button" class="vc-compiti-toc__swap" data-compiti-swap="' +
          escapeHtml(t.id) +
          '" title="Cambia con un altro a caso" aria-label="Cambia compito">' +
          '<i class="fa fa-exchange" aria-hidden="true"></i>' +
          "</button>";
      } else {
        html += '<span class="vc-compiti-toc__swap-slot" aria-hidden="true"></span>';
      }
      html += "</li>";
    }
    list.innerHTML = html || "<li><p class=\"vc-compiti-proofs__empty\">Pool mensile in preparazione…</p></li>";
    var swapHint = byId("vc-compiti-swap-meta");
    if (swapHint && !isHsMode()) {
      swapHint.hidden = false;
      var bonus = Number((state.plan && state.plan.swapBonus) || 0);
      swapHint.textContent =
        left > 0
          ? "Scambi: " + left + " · tap ⇄ accanto al compito"
          : "Nessuno scambio rimasto" + (bonus ? "" : " (1/mese)");
    }
  }

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function canSwapTask(task) {
    if (!task || isHsMode() || !state.canSubmit || state.busy) return false;
    if (swapsLeft() < 1) return false;
    var locked = isLocked(task.id) && !(state.progress && state.progress.taskId === task.id);
    if (locked) return false;
    if (state.progress && state.progress.taskId === task.id) {
      if (isClosed() || currentStatus() === "submitted") return false;
    }
    return true;
  }

  function renderLeaf() {
    var hsView = isHsMode();
    var hsEntry = activeHsEntry();
    var pool = poolTasks();
    var task = taskAt(state.pageIndex) || pool[0];
    var prog = state.progress || {};
    var title = byId("vc-compiti-leaf-title");
    var pageMeta = byId("vc-compiti-leaf-meta");
    var noteEl = byId("vc-compiti-note");
    var saveEl = byId("vc-compiti-save");
    var submitEl = byId("vc-compiti-submit");
    var status = byId("vc-compiti-leaf-status");
    var formEl = document.querySelector(".vc-compiti-form");

    if (hsView) {
      if (!hsEntry) {
        document.body.classList.toggle("vc-compiti-hs-view", true);
        document.body.classList.toggle("vc-compiti-hs-empty-week", true);
        setNoteLabels(true);
        if (title) title.textContent = "Nessuna settimana";
        if (pageMeta) pageMeta.textContent = "Archivio vuoto";
        if (status) {
          status.textContent = "—";
          status.className = "vc-compiti-leaf__status";
        }
        if (noteEl) {
          noteEl.value = "";
          noteEl.disabled = false;
          noteEl.readOnly = true;
          noteEl.placeholder = "";
        }
        if (saveEl) saveEl.hidden = true;
        if (submitEl) submitEl.hidden = true;
        renderProofs(false);
        renderReviewBar();
        renderDeadlineHint();
        renderMonthHint();
        renderHsNav();
        renderHsEmpty(true, "Nessuna settimana da revisionare per questo staff.");
        return;
      }
      var stHs = String(hsEntry.status || "draft");
      var pillHs = hsEntry.pill || { label: "Da fare", kind: "todo" };
      var future = weekIsFuture(hsEntry);
      var hsProofs = Array.isArray(hsEntry.proofs) ? hsEntry.proofs : [];
      /* compitiProofsVis1: se ci sono prove non nascondere il form (empty-week le faceva sparire) */
      var emptyWeek =
        !hsEntry.taskId &&
        !hsProofs.length &&
        stHs !== "submitted" &&
        stHs !== "approved" &&
        stHs !== "rejected";
      if (title) {
        title.textContent = hsLeafTitle(hsEntry, future);
      }
      if (pageMeta) {
        var metaTail = stHs === "submitted"
          ? " · In revisione"
          : stHs === "approved"
            ? " · Confermato"
            : stHs === "rejected"
              ? " · Rifiutato"
              : stHs === "missed"
                ? " · Non completato"
                : hsEntry.taskId
                  ? " · Bozza staff"
                  : future
                    ? " · Successiva"
                    : " · Nessun invio";
        pageMeta.textContent = weekNiceLabel(hsEntry, state.pageIndex) + metaTail;
      }
      if (status) {
        status.textContent = emptyWeek
          ? future
            ? "Successiva"
            : "Nessun invio"
          : pillHs.label || "Da fare";
        status.className = "vc-compiti-leaf__status";
        if (!emptyWeek) {
          if (pillHs.kind === "done") status.classList.add("is-done");
          else if (pillHs.kind === "fail") status.classList.add("is-fail");
          else if (pillHs.kind === "review") status.classList.add("is-review");
          else if (pillHs.kind === "retry") status.classList.add("is-retry");
        }
      }
      document.body.classList.toggle("vc-compiti-hs-view", true);
      document.body.classList.toggle("vc-compiti-hs-empty-week", emptyWeek);
      setNoteLabels(true);
      if (formEl) formEl.classList.remove("is-auto-task");
      if (noteEl) {
        /* compitiStatusLabel1: mostra nota anche se taskId mancante (settimane chiuse) */
        noteEl.value = String(hsEntry.note || "");
        /* compitiReviewUnlock1: readonly (non disabled) — :disabled prende il cursore loading globale */
        noteEl.disabled = false;
        noteEl.readOnly = true;
        noteEl.placeholder = emptyWeek
          ? future
            ? "Questa settimana non è ancora iniziata."
            : "Lo staff non ha inviato nulla in questa settimana."
          : hsEntry.note
            ? ""
            : stHs === "approved" || stHs === "submitted"
              ? hsEntry.autoSubmitted
                ? "Completato in automatico (niente nota manuale)."
                : "Nessuna nota scritta — ma la settimana risulta confermata."
              : "Nessuna nota scritta dallo staff.";
      }
      if (saveEl) saveEl.hidden = true;
      if (submitEl) submitEl.hidden = true;
      var prev = byId("vc-compiti-prev");
      var next = byId("vc-compiti-next");
      var pager = document.querySelector(".vc-compiti-pager");
      var weeks = monthWeeks();
      if (pager) pager.hidden = false;
      if (prev) {
        prev.hidden = false;
        prev.disabled = state.pageIndex <= 0 || state.flipping;
      }
      if (next) {
        next.hidden = false;
        next.disabled = state.pageIndex >= weeks.length - 1 || state.flipping;
      }
      // Temporary progress swap for proofs renderer
      var savedProg = state.progress;
      state.progress = {
        taskId: hsEntry.taskId,
        note: hsEntry.note,
        proofs: hsProofs,
        status: hsEntry.status,
        pill: hsEntry.pill,
        autoSubmitted: Boolean(hsEntry.autoSubmitted),
      };
      renderProofs(false);
      state.progress = savedProg;
      placeProofsBlock(true);
      renderReviewBar();
      renderDeadlineHint();
      renderMonthHint();
      renderHsNav();
      renderHsEmpty(
        emptyWeek,
        emptyWeek
          ? future
            ? "Settimana successiva: ancora niente da revisionare."
            : "Questo staff non ha ancora inviato prove per la settimana."
          : ""
      );
      return;
    }

    if (!task) return;
    var locked = isLocked(task.id) && prog.taskId !== task.id;
    var isCurrent = prog.taskId === task.id;
    var isAuto = Boolean(task.auto);
    var st = currentStatus();
    var canEdit = !hsView && staffCanEdit() && !locked;

    document.body.classList.toggle("vc-compiti-hs-empty-week", false);
    setNoteLabels(false);
    placeProofsBlock(false);

    if (title) {
      title.textContent = task.label;
    }
    if (pageMeta) {
      if (isAuto) {
        pageMeta.textContent = isCurrent
          ? st === "submitted"
            ? "In attesa High Staff"
            : "Selezionato per questa settimana"
          : "Pagina " + (state.pageIndex + 1) + " di " + Math.max(1, pool.length);
      } else {
        pageMeta.textContent = "Pagina " + (state.pageIndex + 1) + " di " + Math.max(1, pool.length);
      }
    }
    if (status) {
      var pill = prog.pill || { label: "Da fare", kind: "todo" };
      if (isCurrent || !prog.taskId) {
        status.textContent = pill.label;
      } else if (locked) {
        status.textContent = "Usato";
        pill = { kind: "fail" };
      } else {
        status.textContent = "Disponibile";
        pill = { kind: "todo" };
      }
      status.className = "vc-compiti-leaf__status";
      if (pill.kind === "done") status.classList.add("is-done");
      else if (pill.kind === "fail") status.classList.add("is-fail");
      else if (pill.kind === "review") status.classList.add("is-review");
      else if (pill.kind === "retry") status.classList.add("is-retry");
    }

    document.body.classList.toggle("vc-compiti-hs-view", false);
    document.body.classList.toggle("vc-compiti-hs-empty-week", false);
    if (formEl) formEl.classList.toggle("is-auto-task", Boolean(isAuto && (isCurrent || !prog.taskId)));

    if (noteEl) {
      noteEl.readOnly = false;
      if (isAuto) {
        noteEl.value = isCurrent ? String(prog.note || "") : "";
        noteEl.disabled = true;
        noteEl.placeholder = "Questo compito si completa automaticamente";
      } else {
        noteEl.value = isCurrent || !prog.taskId ? String(prog.note || "") : "";
        noteEl.disabled = !canEdit || state.busy || (prog.taskId && !isCurrent && !canRetryNow());
        noteEl.placeholder = "Scrivi cosa hai fatto…";
      }
    }
    if (saveEl) {
      saveEl.hidden = !state.canSubmit;
      saveEl.disabled = !canEdit || state.busy || (isAuto && locked);
      saveEl.textContent = isAuto ? "Seleziona per questa settimana" : "Salva bozza";
    }
    if (submitEl) {
      submitEl.hidden = !state.canSubmit || isAuto;
      submitEl.disabled = !canEdit || state.busy || isAuto;
      submitEl.textContent = canRetryNow() ? "Reinvia prove" : "Invia prove";
    }

    var prevS = byId("vc-compiti-prev");
    var nextS = byId("vc-compiti-next");
    var pagerS = document.querySelector(".vc-compiti-pager");
    if (pagerS) pagerS.hidden = false;
    if (prevS) {
      prevS.hidden = false;
      prevS.disabled = state.pageIndex <= 0 || state.flipping;
    }
    if (nextS) {
      nextS.hidden = false;
      nextS.disabled = state.pageIndex >= pool.length - 1 || state.flipping;
    }

    renderProofs(canEdit && !isAuto && (isCurrent || !prog.taskId || st === "rejected"));
    renderReviewBar();
    renderDeadlineHint();
    renderMonthHint();
    renderHsNav();
    renderHsEmpty(false);
  }

  function renderHsEmpty(show, message) {
    var leaf = byId("vc-compiti-leaf");
    if (!leaf) return;
    var empty = byId("vc-compiti-hs-empty");
    if (show) {
      if (!empty) {
        empty = document.createElement("p");
        empty.id = "vc-compiti-hs-empty";
        empty.className = "vc-compiti-hs-empty";
        leaf.insertBefore(empty, leaf.firstChild);
      }
      empty.textContent =
        message || "Questo staff non ha ancora inviato prove per la settimana.";
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  /* compitiProofsVis1: in HS le prove sopra la nota (prima finivano sotto e su phone sembravano assenti) */
  function placeProofsBlock(hsFirst) {
    var form = document.querySelector(".vc-compiti-form");
    var block = document.querySelector(".vc-compiti-proofs-block");
    if (!form || !block) return;
    var noteWrap = form.querySelector(".vc-compiti-note") && form.querySelector(".vc-compiti-note").closest("div");
    if (!noteWrap || !noteWrap.parentNode) return;
    if (hsFirst) {
      if (block.nextElementSibling !== noteWrap) form.insertBefore(block, noteWrap);
    } else if (noteWrap.nextElementSibling !== block) {
      form.insertBefore(block, noteWrap.nextSibling);
    }
  }

  function renderProofs(canEdit) {
    var host = byId("vc-compiti-proofs");
    var input = byId("vc-compiti-proof-input");
    var addBtn = byId("vc-compiti-proof-add");
    if (!host) return;
    var prog = state.progress || {};
    var existing = Array.isArray(prog.proofs) ? prog.proofs : [];
    var pending = state.pendingProofs || [];
    var html = "";
    existing.forEach(function (p, i) {
      var url = String(p.url || "").trim();
      var mime = String(p.mime || "");
      var isImg = mime.indexOf("image/") === 0 || /\.(jpe?g|png|gif|webp|bmp)(\?|#|$)/i.test(url);
      html +=
        '<a class="vc-compiti-proof vc-no-sfx" href="' +
        (url || "#") +
        '" target="_blank" rel="noopener" data-vc-lightbox="1">' +
        (isImg && url
          ? '<img src="' + url + '" alt="' + String(p.name || "prova").replace(/"/g, "") + '" loading="lazy" />'
          : '<span class="vc-compiti-proof__file">' + String(p.name || "file") + "</span>") +
        "</a>";
    });
    pending.forEach(function (p, i) {
      html +=
        '<div class="vc-compiti-proof is-pending" data-pending="' +
        i +
        '">' +
        (p.preview
          ? '<img src="' + p.preview + '" alt="" />'
          : '<span class="vc-compiti-proof__file">' + String(p.name || "file") + "</span>") +
        (canEdit
          ? '<button type="button" class="vc-compiti-proof__rm" data-rm-pending="' + i + '" aria-label="Rimuovi">×</button>'
          : "") +
        "</div>";
    });
    host.innerHTML =
      html ||
      (function () {
        var st = String(prog.status || "");
        if (st === "approved" && prog.autoSubmitted) {
          return '<p class="vc-compiti-proofs__empty">Completato in automatico · nessuna prova file</p>';
        }
        if (st === "approved" || st === "submitted") {
          return '<p class="vc-compiti-proofs__empty">Nessuna prova file allegata</p>';
        }
        return '<p class="vc-compiti-proofs__empty">Nessuna prova allegata</p>';
      })();
    if (addBtn) addBtn.hidden = !canEdit;
    if (input) input.disabled = !canEdit;
  }

  function renderReviewBar() {
    var bar = byId("vc-compiti-review");
    if (!bar) return;
    var show = false;
    if (!state.canReview || state.busy) {
      bar.hidden = true;
      return;
    }
    if (isHsMode()) {
      var hs = activeHsEntry();
      /* compitiPhoneLoad1: Conferma/Rifiuta su qualsiasi settimana inviata (non solo corrente) */
      show = Boolean(hs && hs.status === "submitted" && !weekIsFuture(hs));
    } else {
      show = currentStatus() === "submitted";
    }
    bar.hidden = !show;
  }

  function renderDeadlineHint() {
    var el = byId("vc-compiti-deadline");
    if (!el) return;
    if (isHsMode()) {
      var hs = activeHsEntry();
      if (!hs) {
        el.textContent = "";
        return;
      }
      if (hs.status === "submitted" && !weekIsFuture(hs)) {
        el.textContent = (hs.isCurrent ? "Settimana corrente" : "Settimana precedente") + " · Conferma o Rifiuta";
      } else if (hs.isCurrent) {
        el.textContent = "Settimana corrente";
      } else if (weekIsFuture(hs)) {
        el.textContent = "Settimana successiva";
      } else {
        el.textContent = "Settimane precedenti";
      }
      return;
    }
    var d = state.deadlines || {};
    var task = taskAt(state.pageIndex);
    var prog = state.progress || {};
    if (prog.isAuto && currentStatus() === "submitted") {
      el.textContent = "In attesa di Conferma / Rifiuta da High Staff";
      return;
    }
    if (task && task.auto && prog.taskId === task.id && currentStatus() === "draft") {
      el.textContent = "Selezionato: si completa quando scatta il trigger";
      return;
    }
    if (task && task.auto && !prog.taskId) {
      el.textContent = "Seleziona questo compito per la settimana";
      return;
    }
    if (!d.submitDeadlineMs) {
      el.textContent = "";
      return;
    }
    if (canRetryNow()) {
      el.textContent = "Rifiutato: puoi riprovare entro domenica 18:00";
      return;
    }
    el.textContent = d.submitOpen ? "Puoi consegnare fino a domenica 18:00" : "Scadenza invio superata";
  }

  function renderMonthHint() {
    var el = byId("vc-compiti-month");
    if (!el || !state.progress) return;
    var used = Number(state.progress.monthDistinct || 0);
    var weeks = Number(state.progress.monthRequired || 0) || monthWeeks().length || poolTasks().length || 4;
    var bridge =
      state.plan && state.plan.monthBridgeNote
        ? " · Pool fisso (no re-roll all'1)"
        : "";
    el.textContent = isHsMode()
      ? "Revisiona le settimane · " + used + " / " + weeks + " chiuse questo mese"
      : "Scegli 1 compito a settimana · " + used + " / " + weeks + " settimane del mese" + bridge;

    var graceEl = byId("vc-compiti-grace");
    if (graceEl) {
      var grace = state.newStaffGrace && state.newStaffGrace.active;
      if (grace && !isHsMode()) {
        graceEl.hidden = false;
        graceEl.textContent =
          state.newStaffGrace.message ||
          "Nuovo staff: compito non obbligatorio questa settimana (dal lunedì prossimo sì).";
      } else {
        graceEl.hidden = true;
        graceEl.textContent = "";
      }
    }
    renderSwapUi();
  }

  function swapsLeft() {
    if (!state.plan) return 0;
    return Math.max(0, Number(state.plan.swapsLeft) || 0);
  }

  function renderSwapUi() {
    var btn = byId("vc-compiti-swap");
    if (btn) btn.hidden = true;
    var meta = byId("vc-compiti-swap-meta");
    if (!meta) return;
    if (isHsMode()) {
      meta.hidden = true;
      meta.textContent = "";
      return;
    }
    /* meta text aggiornato in renderToc */
  }

  function renderHsNav() {
    var n = state.staffList && state.staffList.length ? state.staffList.length : 0;
    /* compitiHsNavEdge1: mostra appena lista pronta (anche a libro chiuso → ready all'apertura) */
    var show = state.mode === "highstaff" && n > 1 && (state.bookOpen || state.bookReady);
    var prev = byId("vc-compiti-hs-prev");
    var next = byId("vc-compiti-hs-next");
    var nav = byId("vc-compiti-hs-nav");
    if (nav) nav.hidden = !show;
    if (prev) {
      prev.hidden = !show;
      prev.disabled = Boolean(state.busy || state.flipping);
    }
    if (next) {
      next.hidden = !show;
      next.disabled = Boolean(state.busy || state.flipping);
    }
  }

  function setCoverHint(text, ready) {
    var hint = byId("vc-compiti-cover-hint");
    var cover = byId("vc-compiti-cover");
    if (hint) hint.textContent = String(text || "");
    if (cover) cover.classList.toggle("is-ready", Boolean(ready));
  }

  function markBookReady() {
    state.bookReady = true;
    if (state.bookOpen) return;
    setCoverHint("Clicca per aprire", true);
    if (state.openPending) openBook();
  }

  function openBook() {
    if (state.bookOpen) return;
    if (!state.bookReady) {
      state.openPending = true;
      setCoverHint("Un attimo…", false);
      return;
    }
    state.openPending = false;
    state.bookOpen = true;
    var board = byId("vc-staff-compiti-board");
    var book = byId("vc-staff-compiti-book");
    var cover = byId("vc-compiti-cover");
    var reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (eM) {}
    if (!board) return;
    if (book) book.setAttribute("aria-hidden", "false");
    if (reduced) {
      board.classList.remove("is-closed", "is-opening");
      board.classList.add("is-open");
      if (cover) cover.hidden = true;
      renderHsNav();
      return;
    }
    board.classList.remove("is-closed");
    board.classList.add("is-opening");
    window.setTimeout(function () {
      board.classList.remove("is-opening");
      board.classList.add("is-open");
      if (cover) cover.hidden = true;
      renderHsNav();
    }, 720);
  }

  function renderAll() {
    renderIdentity();
    renderPill();
    renderToc();
    renderLeaf();
    renderMonthHint();
    renderHsNav();
  }

  function setPage(index, dir) {
    var max = isHsMode() ? Math.max(0, monthWeeks().length - 1) : Math.max(0, poolTasks().length - 1);
    var next = Math.max(0, Math.min(max, Number(index) || 0));
    if (next === state.pageIndex && !dir) {
      renderLeaf();
      renderToc();
      return;
    }
    if (state.flipping) return;
    var leaf = byId("vc-compiti-leaf");
    var stage = byId("vc-compiti-flip-stage");
    var reduced = false;
    try {
      reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch (eM) {}
    if (!leaf || !stage || reduced) {
      state.pageIndex = next;
      renderToc();
      renderLeaf();
      return;
    }
    state.flipping = true;
    var goingNext = dir === "next" || next > state.pageIndex;
    stage.classList.add("is-flipping");
    leaf.classList.remove("is-flip-in-next", "is-flip-in-prev", "is-flip-out-next", "is-flip-out-prev");
    leaf.classList.add(goingNext ? "is-flip-out-next" : "is-flip-out-prev");
    if (flipTimer) window.clearTimeout(flipTimer);
    flipTimer = window.setTimeout(function () {
      state.pageIndex = next;
      state.pendingProofs = [];
      renderToc();
      renderLeaf();
      leaf.classList.remove("is-flip-out-next", "is-flip-out-prev");
      void leaf.offsetWidth;
      leaf.classList.add(goingNext ? "is-flip-in-next" : "is-flip-in-prev");
      flipTimer = window.setTimeout(function () {
        leaf.classList.remove("is-flip-in-next", "is-flip-in-prev");
        stage.classList.remove("is-flipping");
        state.flipping = false;
        renderLeaf();
      }, 320);
    }, 280);
  }

  function applyPayload(data) {
    if (!data || !data.ok) return;
    state.mode = data.mode === "highstaff" ? "highstaff" : "staff";
    state.canSubmit = Boolean(data.canSubmit);
    state.canReview = Boolean(data.canReview);
    state.weekKey = String(data.weekKey || "");
    state.monthKey = String(data.monthKey || "");
    state.identity = data.identity || null;
    state.progress = data.progress || null;
    state.deadlines = data.deadlines || null;
    state.plan = data.plan || null;
    /* HsUi2: always bind month week archive for HS browsing */
    state.monthEntries = Array.isArray(data.monthEntries) ? data.monthEntries.slice() : [];
    if (Array.isArray(data.tasks) && data.tasks.length) {
      TASKS = data.tasks.map(function (t) {
        return {
          id: String(t.id || ""),
          label: String(t.label || t.id || ""),
          auto: Boolean(t.auto),
        };
      });
    }
    if (Array.isArray(data.staffList) && data.staffList.length) {
      state.staffList = data.staffList;
    }
    if (isHsMode()) {
      state.pageIndex = currentHsWeekIndex();
    } else if (state.progress && state.progress.taskId) {
      state.pageIndex = taskIndexById(state.progress.taskId);
    } else {
      state.pageIndex = 0;
    }
    if (state.staffList.length) {
      var tid = String(data.targetUserId || (state.identity && state.identity.userId) || "");
      var idx = 0;
      for (var i = 0; i < state.staffList.length; i++) {
        if (state.staffList[i].userId === tid) {
          idx = i;
          break;
        }
      }
      state.staffIndex = idx;
    }
    state.pendingProofs = [];
    state.loaded = true;
    state.newStaffGrace = data.newStaffGrace || null;
    document.body.classList.toggle("vc-compiti-hs", state.mode === "highstaff");
    renderAll();
  }

  function handleAuthFailure(status, data) {
    try {
      if (typeof window.__vcNotifyAuthFailure === "function") {
        return window.__vcNotifyAuthFailure(status, data, { reason: "compiti-401" });
      }
    } catch (eGlob) {}
    var st = Number(status) || 0;
    var err = String((data && data.error) || "");
    if (st !== 401 && err !== "missing_token" && err !== "invalid_token" && err !== "unauthorized") {
      return false;
    }
    try {
      if (typeof window.__vcDiscordCompleteLogout === "function") {
        window.__vcDiscordCompleteLogout({ reason: "compiti-401", forceToast: true });
      }
    } catch (eLo) {}
    toast("Sessione Discord scaduta in questo browser. Riaccedi qui (ogni browser ha login separato).", true);
    return true;
  }

  function loadCompiti(userId, opts) {
    opts = opts || {};
    var token = getToken();
    if (!token) {
      toast("Accedi con Discord.", true);
      return Promise.resolve({ ok: false, auth: true });
    }
    var url = apiBase();
    var qs = [];
    if (userId) qs.push("userId=" + encodeURIComponent(userId));
    if (opts.skipStaffList) qs.push("skipStaffList=1");
    if (qs.length) url += (url.indexOf("?") >= 0 ? "&" : "?") + qs.join("&");

    /* compitiFfLoad1: ++loadSeq PRIMA di abort — su Firefox abort() può rifiutare
       la fetch in sync; se loadSeq non è ancora salito il catch vecchio toastava
       e lasciava UI ibrida (frecce disabled / "Impossibile caricare"). */
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var seq = loadSeq;
    if (!opts.soft) {
      seq = ++loadSeq;
      var prevAbort = loadAbort;
      loadAbort = ctrl;
      if (prevAbort) {
        try {
          prevAbort.abort();
        } catch (eA) {}
      }
    }
    var timedOut = false;
    var timeoutId = 0;
    var waitMs = opts.soft ? 32000 : 20000;
    try {
      if (window.VCStaffTools && typeof window.VCStaffTools.resolveFetchTimeoutMs === "function") {
        waitMs = window.VCStaffTools.resolveFetchTimeoutMs(waitMs);
      }
    } catch (eTo) {}
    if (ctrl) {
      timeoutId = window.setTimeout(function () {
        timedOut = true;
        try {
          ctrl.abort();
        } catch (eT) {}
      }, waitMs);
    }

    if (!opts.soft) setCoverHint("Caricamento…", false);

    return fetch(url, {
      method: "GET",
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (data) {
            return { res: res, data: data };
          });
      })
      .then(function (out) {
        if (seq !== loadSeq && !opts.soft) return { superseded: true };
        if (!out.res.ok || !out.data || !out.data.ok) {
          if (!opts.soft) {
            if (handleAuthFailure(out.res && out.res.status, out.data)) {
              setCoverHint("Riaccedi con Discord", true);
              state.bookReady = true;
              return { ok: false, auth: true, data: out.data };
            }
            setCoverHint("Riprova più tardi", false);
            toast((out.data && out.data.message) || "Impossibile caricare i compiti.", true);
          }
          return { ok: false, error: true, data: out.data, status: out.res && out.res.status };
        }
        if (opts.soft && Array.isArray(out.data.staffList)) {
          state.staffList = out.data.staffList.slice();
          if (out.data.mode === "highstaff") state.mode = "highstaff";
          document.body.classList.toggle("vc-compiti-hs", state.mode === "highstaff");
          renderHsNav();
          /* compitiFirstStaffer1: se il primo stamp era il viewer, passa al primo in lista */
          try {
            var qUid = bootUserIdFromQuery();
            var first = state.staffList[0];
            var viewer = String(out.data.viewerId || "");
            var cur = String((state.identity && state.identity.userId) || "");
            if (
              !qUid &&
              first &&
              first.userId &&
              viewer &&
              cur === viewer &&
              String(first.userId) !== viewer
            ) {
              state.staffIndex = 0;
              state.identity = first;
              loadCompiti(first.userId, { skipStaffList: true }).catch(function () {});
            } else if (state.staffList.length) {
              var want = String(
                (out.data.targetUserId || (state.identity && state.identity.userId) || ""),
              );
              for (var si = 0; si < state.staffList.length; si++) {
                if (String(state.staffList[si].userId) === want) {
                  state.staffIndex = si;
                  break;
                }
              }
              renderHsNav();
            }
          } catch (eFirst) {}
          return { ok: true, soft: true, data: out.data };
        }
        applyPayload(out.data);
        markBookReady();
        return { ok: true, data: out.data };
      })
      .catch(function (err) {
        /* compitiFfLoad1: abort di supersede = silenzioso (anche sync su Firefox) */
        if (seq !== loadSeq && !opts.soft) return { superseded: true };
        if (opts.soft) return { ok: false, soft: true };
        if (err && err.name === "AbortError") {
          if (timedOut) {
            setCoverHint("Riprova · tocca", true);
            state.bookReady = true;
            toast("Caricamento troppo lento. Riprova.", true);
            return { ok: false, timedOut: true, aborted: true };
          }
          return { superseded: true, aborted: true };
        }
        setCoverHint("Riprova · tocca", true);
        state.bookReady = true;
        toast("Errore di rete.", true);
        return { ok: false, error: true };
      })
      .finally(function () {
        if (timeoutId) window.clearTimeout(timeoutId);
        if (!opts.soft && loadAbort === ctrl) loadAbort = null;
      });
  }

  function readFilesAsProofs(fileList) {
    var files = Array.prototype.slice.call(fileList || [], 0).slice(0, 4);
    return Promise.all(
      files.map(function (file) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            var dataUrl = String(reader.result || "");
            resolve({
              name: file.name,
              mime: file.type || "application/octet-stream",
              dataUrl: dataUrl,
              preview: String(file.type || "").indexOf("image/") === 0 ? dataUrl : "",
            });
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(file);
        });
      }),
    ).then(function (rows) {
      return rows.filter(Boolean);
    });
  }

  function scheduleCompitiDraftAuto() {
    if (!staffCanEdit() || state.busy || isHsMode()) return;
    if (draftAutoTimer) clearTimeout(draftAutoTimer);
    draftAutoTimer = setTimeout(function () {
      draftAutoTimer = 0;
      saveCompiti(false, { soft: true });
    }, 700);
  }

  function saveCompiti(submit, opts) {
    opts = opts || {};
    var soft = !submit && opts.soft === true;
    if (state.busy || !staffCanEdit()) return;
    var task = taskAt(state.pageIndex);
    if (!task) return;
    if (isLocked(task.id) && !(state.progress && state.progress.taskId === task.id)) {
      if (!soft) toast("Compito già usato questo mese.", true);
      return;
    }
    if (submit && task.auto) {
      toast("Questo compito si completa da solo: selezionalo e basta.", true);
      return;
    }
    var token = getToken();
    if (!token) {
      if (!soft) toast("Sessione scaduta in questo browser. Riaccedi qui.", true);
      return;
    }
    var noteEl = byId("vc-compiti-note");
    if (submit) {
      var hasNote = noteEl && String(noteEl.value || "").trim();
      var hasProofs =
        (state.pendingProofs && state.pendingProofs.length) ||
        (state.progress && Array.isArray(state.progress.proofs) && state.progress.proofs.length);
      if (!hasNote && !hasProofs) {
        toast("Per inviare serve una nota e/o almeno una prova.", true);
        return;
      }
    }
    if (soft) {
      var softNote = noteEl ? String(noteEl.value || "").trim() : "";
      var softProofs = (state.pendingProofs && state.pendingProofs.length) || 0;
      if (!softNote && !softProofs && !(state.progress && state.progress.taskId === task.id)) {
        return;
      }
    }
    var body = {
      action: "save",
      taskId: task.id,
      note: noteEl ? String(noteEl.value || "") : "",
      done: Boolean(submit),
      submit: Boolean(submit),
      proofs: (state.pendingProofs || []).map(function (p) {
        return p.dataUrl;
      }),
    };
    var seq = ++draftAutoSeq;
    if (!soft) {
      state.busy = true;
      renderLeaf();
    }
    fetch(apiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        if (soft && seq !== draftAutoSeq) return;
        if (!soft) state.busy = false;
        if (!out.res.ok || !out.data || !out.data.ok) {
          if (!soft) {
            toast((out.data && out.data.message) || "Salvataggio non riuscito.", true);
            renderLeaf();
            ensureCompitiScrollUnlocked();
          }
          return;
        }
        if (out.data.progress) state.progress = out.data.progress;
        if (out.data.deadlines) state.deadlines = out.data.deadlines;
        if (out.data.plan) state.plan = out.data.plan;
        if (soft) {
          if (state.pendingProofs && state.pendingProofs.length) {
            state.pendingProofs = [];
            renderProofs(true);
          }
          if (window.VcFormDrafts && typeof window.VcFormDrafts.notifySaved === "function") {
            window.VcFormDrafts.notifySaved({ message: "Bozza salvata." });
          } else {
            toast("Bozza salvata.");
          }
          return;
        }
        state.pendingProofs = [];
        renderAll();
        ensureCompitiScrollUnlocked();
        toast(submit ? "Inviato in revisione High Staff." : task.auto ? "Compito selezionato per questa settimana." : "Bozza salvata.");
      })
      .catch(function () {
        if (soft && seq !== draftAutoSeq) return;
        if (!soft) {
          state.busy = false;
          renderLeaf();
          ensureCompitiScrollUnlocked();
          toast("Errore di rete.", true);
        }
      });
  }

  function swapCompiti(taskIdOverride) {
    if (state.busy || isHsMode() || !state.canSubmit) return;
    if (swapsLeft() < 1) {
      toast("Nessuno scambio rimasto questo mese.", true);
      return;
    }
    var task = null;
    var wantId = String(taskIdOverride || "").trim();
    if (wantId) {
      var pool = poolTasks();
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].id === wantId) {
          task = pool[i];
          break;
        }
      }
    } else {
      task = taskAt(state.pageIndex);
    }
    if (!task || !canSwapTask(task)) {
      toast("Questo compito non si può cambiare ora.", true);
      return;
    }
    var token = getToken();
    if (!token) {
      toast("Sessione scaduta in questo browser. Riaccedi qui.", true);
      return;
    }

    function doSwap() {
      state.busy = true;
      renderAll();
      fetch(apiBase(), {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify({ action: "swap_one", taskId: task.id }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { res: res, data: data };
          });
        })
        .then(function (out) {
          state.busy = false;
          if (!out.res.ok || !out.data || !out.data.ok) {
            toast((out.data && out.data.message) || "Scambio non riuscito.", true);
            renderAll();
            ensureCompitiScrollUnlocked();
            return;
          }
          if (out.data.progress) state.progress = out.data.progress;
          if (out.data.plan) state.plan = out.data.plan;
          if (Array.isArray(out.data.monthEntries)) state.monthEntries = out.data.monthEntries;
          if (out.data.swapped && out.data.swapped.to) {
            state.pageIndex = taskIndexById(out.data.swapped.to);
          }
          state.pendingProofs = [];
          renderAll();
          ensureCompitiScrollUnlocked();
          toast(out.data.message || "Compito sostituito.");
        })
        .catch(function () {
          state.busy = false;
          renderAll();
          ensureCompitiScrollUnlocked();
          toast("Errore di rete.", true);
        });
    }

    var msg =
      "Sostituire «" +
      task.label +
      "» con un altro compito a caso? Usa 1 scambio (ne restano " +
      swapsLeft() +
      ").";
    var D = window.VcDialog;
    if (D && typeof D.confirm === "function") {
      D.confirm({
        title: "Cambia compito",
        message: msg,
        confirmLabel: "Cambia",
        cancelLabel: "Annulla",
        icon: "fa-exchange",
      }).then(function (ok) {
        ensureCompitiScrollUnlocked();
        if (ok) doSwap();
      });
      return;
    }
    if (window.confirm(msg)) doSwap();
  }

  function review(decision) {
    if (!state.canReview || state.busy) return;
    var token = getToken();
    var userId = state.identity && state.identity.userId;
    if (!token || !userId) return;
    state.busy = true;
    state.flipping = false;
    renderReviewBar();
    renderLeaf();
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timedOut = false;
    var timeoutId = 0;
    if (ctrl) {
      timeoutId = window.setTimeout(function () {
        timedOut = true;
        try {
          ctrl.abort();
        } catch (eT) {}
      }, 25000);
    }
    fetch(apiBase(), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        action: "review",
        userId: userId,
        decision: decision,
        weekKey: (activeHsEntry() && activeHsEntry().weekKey) || state.weekKey || "",
      }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          toast((out.data && out.data.message) || "Revisione non riuscita.", true);
          return;
        }
        if (out.data.progress) state.progress = out.data.progress;
        if (out.data.monthEntries) state.monthEntries = out.data.monthEntries;
        if (out.data.plan) state.plan = out.data.plan;
        toast(
          decision === "approve"
            ? "Confermato · valutazione automatica assegnata."
            : "Rifiutato · può riprovare entro domenica 18:00.",
        );
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") {
          toast(timedOut ? "Conferma troppo lenta. Riprova." : "Revisione interrotta.", true);
          return;
        }
        toast("Errore di rete.", true);
      })
      .finally(function () {
        if (timeoutId) window.clearTimeout(timeoutId);
        /* compitiReviewUnlock1: sempre sblocca UI (busy/flipping/pager) */
        state.busy = false;
        state.flipping = false;
        try {
          var stage = byId("vc-compiti-flip-stage");
          var leaf = byId("vc-compiti-leaf");
          if (stage) stage.classList.remove("is-flipping");
          if (leaf) {
            leaf.classList.remove(
              "is-flip-in-next",
              "is-flip-in-prev",
              "is-flip-out-next",
              "is-flip-out-prev",
            );
          }
        } catch (eUnlock) {}
        renderAll();
        ensureCompitiScrollUnlocked();
      });
  }

  function switchStaff(delta) {
    if (state.mode !== "highstaff" || !state.staffList.length) return;
    /* compitiHsNavStable1: un solo switch alla volta; sblocca sempre le frecce a fine load */
    if (state.busy) return;
    var n = state.staffList.length;
    if (n < 2) return;
    var next = (state.staffIndex + delta) % n;
    if (next < 0) next += n;
    var person = state.staffList[next];
    if (!person || !person.userId) return;

    state.staffIndex = next;
    state.identity = person;
    state.pendingProofs = [];
    state.progress = null;
    state.monthEntries = [];
    state.busy = true;
    document.body.classList.add("vc-compiti-hs-empty-week");
    renderIdentity();
    renderHsNav();
    renderToc();
    renderReviewBar();
    renderHsEmpty(true, "Caricamento profilo…");

    var book = byId("vc-staff-compiti-book");
    if (book) {
      book.classList.remove("is-staff-flip-next", "is-staff-flip-prev");
      void book.offsetWidth;
      book.classList.add(delta > 0 ? "is-staff-flip-next" : "is-staff-flip-prev");
      if (staffFlipTimer) window.clearTimeout(staffFlipTimer);
      staffFlipTimer = window.setTimeout(function () {
        book.classList.remove("is-staff-flip-next", "is-staff-flip-prev");
      }, 320);
    }

    loadCompiti(person.userId, { skipStaffList: true })
      .then(function (result) {
        if (!result || result.superseded) return;
        if (result.ok) {
          renderReviewBar();
          return;
        }
        /* compitiFfLoad1: niente contenuto fantasma dalla scheda precedente */
        var title = byId("vc-compiti-leaf-title");
        var pageMeta = byId("vc-compiti-leaf-meta");
        if (title) title.textContent = "Profilo non caricato";
        if (pageMeta) pageMeta.textContent = "Riprova con le frecce";
        renderHsEmpty(
          true,
          result.auth
            ? "Sessione scaduta in questo browser. Riaccedi qui con Discord."
            : "Impossibile caricare questo profilo. Riprova con le frecce o ricarica.",
        );
        document.body.classList.add("vc-compiti-hs-empty-week");
        renderReviewBar();
      })
      .finally(function () {
        state.busy = false;
        state.flipping = false;
        renderHsNav();
      });
  }

  function wireUi() {
    var toc = byId("vc-compiti-toc");
    if (toc && toc.getAttribute("data-vc-wired") !== "1") {
      toc.setAttribute("data-vc-wired", "1");
      toc.addEventListener("click", function (ev) {
        var swapBtn = ev.target.closest && ev.target.closest("[data-compiti-swap]");
        if (swapBtn) {
          ev.preventDefault();
          ev.stopPropagation();
          swapCompiti(swapBtn.getAttribute("data-compiti-swap"));
          return;
        }
        var btn = ev.target.closest && ev.target.closest("[data-page-index]");
        if (!btn || btn.disabled) return;
        setPage(Number(btn.getAttribute("data-page-index")));
      });
    }
    [["vc-compiti-prev", -1, "prev"], ["vc-compiti-next", 1, "next"]].forEach(function (row) {
      var el = byId(row[0]);
      if (el && el.getAttribute("data-vc-wired") !== "1") {
        el.setAttribute("data-vc-wired", "1");
        el.addEventListener("click", function (ev) {
          ev.preventDefault();
          setPage(state.pageIndex + row[1], row[2]);
        });
      }
    });
    var corner = byId("vc-compiti-flip-corner");
    if (corner && corner.getAttribute("data-vc-wired") !== "1") {
      corner.setAttribute("data-vc-wired", "1");
      corner.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (state.pageIndex < (isHsMode() ? monthWeeks().length : poolTasks().length) - 1)
          setPage(state.pageIndex + 1, "next");
        else setPage(0, "prev");
      });
    }
    var save = byId("vc-compiti-save");
    if (save && save.getAttribute("data-vc-wired") !== "1") {
      save.setAttribute("data-vc-wired", "1");
      save.addEventListener("click", function (ev) {
        ev.preventDefault();
        if (draftAutoTimer) {
          clearTimeout(draftAutoTimer);
          draftAutoTimer = 0;
        }
        saveCompiti(false);
      });
    }
    var noteAuto = byId("vc-compiti-note");
    if (noteAuto && noteAuto.getAttribute("data-vc-draft-auto") !== "1") {
      noteAuto.setAttribute("data-vc-draft-auto", "1");
      noteAuto.addEventListener("input", scheduleCompitiDraftAuto);
      noteAuto.addEventListener("change", scheduleCompitiDraftAuto);
    }
    var swapBtn = byId("vc-compiti-swap");
    if (swapBtn) swapBtn.hidden = true;
    var submit = byId("vc-compiti-submit");
    if (submit && submit.getAttribute("data-vc-wired") !== "1") {
      submit.setAttribute("data-vc-wired", "1");
      submit.addEventListener("click", function (ev) {
        ev.preventDefault();
        saveCompiti(true);
      });
    }
    var add = byId("vc-compiti-proof-add");
    var input = byId("vc-compiti-proof-input");
    if (add && input && add.getAttribute("data-vc-wired") !== "1") {
      add.setAttribute("data-vc-wired", "1");
      add.addEventListener("click", function () {
        input.click();
      });
      input.addEventListener("change", function () {
        readFilesAsProofs(input.files).then(function (rows) {
          state.pendingProofs = (state.pendingProofs || []).concat(rows).slice(0, 4);
          input.value = "";
          renderProofs(true);
          scheduleCompitiDraftAuto();
        });
      });
    }
    var proofs = byId("vc-compiti-proofs");
    if (proofs && proofs.getAttribute("data-vc-wired") !== "1") {
      proofs.setAttribute("data-vc-wired", "1");
      proofs.addEventListener("click", function (ev) {
        var rm = ev.target.closest && ev.target.closest("[data-rm-pending]");
        if (!rm) return;
        var i = Number(rm.getAttribute("data-rm-pending"));
        state.pendingProofs.splice(i, 1);
        renderProofs(true);
      });
    }
    var approve = byId("vc-compiti-approve");
    var reject = byId("vc-compiti-reject");
    if (approve && approve.getAttribute("data-vc-wired") !== "1") {
      approve.setAttribute("data-vc-wired", "1");
      approve.addEventListener("click", function () {
        review("approve");
      });
    }
    if (reject && reject.getAttribute("data-vc-wired") !== "1") {
      reject.setAttribute("data-vc-wired", "1");
      reject.addEventListener("click", function () {
        review("reject");
      });
    }
    var hsPrev = byId("vc-compiti-hs-prev");
    var hsNext = byId("vc-compiti-hs-next");
    if (hsPrev && hsPrev.getAttribute("data-vc-wired") !== "1") {
      hsPrev.setAttribute("data-vc-wired", "1");
      hsPrev.addEventListener("click", function () {
        switchStaff(-1);
      });
    }
    if (hsNext && hsNext.getAttribute("data-vc-wired") !== "1") {
      hsNext.setAttribute("data-vc-wired", "1");
      hsNext.addEventListener("click", function () {
        switchStaff(1);
      });
    }
    var cover = byId("vc-compiti-cover");
    if (cover && cover.getAttribute("data-vc-wired") !== "1") {
      cover.setAttribute("data-vc-wired", "1");
      cover.addEventListener("click", function (ev) {
        ev.preventDefault();
        openBook();
      });
    }
  }

  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
    try {
      document.documentElement.classList.add("vc-compiti-perf");
      /* compitiChromeSync1: NON togliere chrome-bar-loading / scroll-lock qui —
         la barra top (vc-site-chrome-ui) arma lo scroll con vc-chrome-scroll-armed.
         Prima: token → unlock immediato → scrollbar prima della barra. */
      document.documentElement.classList.remove("vc-staff-access-pending");
      document.documentElement.classList.add("vc-staff-app-revealed", "vc-page-cine-ready");
      document.body.classList.add("vc-staff-app-revealed");
      document.body.style.pointerEvents = "auto";
    } catch (e) {}
    try {
      if (typeof window.__vcSyncLoaderScrollLock === "function") window.__vcSyncLoaderScrollLock();
    } catch (eUnlock) {}
    wireUi();
    setCoverHint("Caricamento…", false);
    renderAll();
    var uid = bootUserIdFromQuery();
    /* notifSheetOpenFix1: deep-link ?userId= → apri libro automaticamente */
    if (uid) state.openPending = true;
    /* compitiFfLoad1: niente soft in parallelo al primo GET — su Firefox abort sync
       + doppia hydrate rompeva frecce/toast. Lista staff solo dopo il primo ok. */
    loadCompiti(uid, { skipStaffList: true }).then(function (result) {
      if (!result || !result.ok) return;
      if (state.mode === "highstaff") {
        var softUid = uid || String((state.identity && state.identity.userId) || "");
        loadCompiti(softUid, { soft: true, skipStaffList: false })
          .then(function (softRes) {
            if (softRes && softRes.ok) return softRes;
            if (state.staffList && state.staffList.length > 1) return softRes;
            return loadCompiti(softUid, { soft: true, skipStaffList: false });
          })
          .catch(function () {});
      }
    });
    window.__vcStaffPageRefresh = function () {
      var refreshUid = state.identity && state.identity.userId;
      return loadCompiti(state.mode === "highstaff" ? refreshUid : "");
    };
    window.__vcPtrSoftRefresh = window.__vcStaffPageRefresh;
    /* siteLiveAll1: WS chrome → soft-refresh compiti aperti */
    try {
      var ST = window.VcStaffTools || window.VCStaffTools;
      if (ST && typeof ST.installRealtimeSoftRefreshBus === "function") ST.installRealtimeSoftRefreshBus();
    } catch (eBus) {}
  }

  function bootUserIdFromQuery() {
    /* staffCompitiNotif1: deep-link from inbox */
    try {
      var q = new URLSearchParams(window.location.search || "");
      var uid = String(q.get("userId") || "").trim();
      if (/^\d{17,20}$/.test(uid)) return uid;
    } catch (eQ) {}
    return "";
  }

  function boot() {
    function tryInit() {
      if (pageInited) return true;
      /* compitiChromeSync1: come pause — aspetta access gate, non solo token */
      if (
        document.documentElement.classList.contains("vc-staff-app-revealed") ||
        window.__VC_STAFF_PERMS ||
        window.__VC_ACCESS_OK ||
        window.__VC_STAFF_ACCESS_OPTIMISTIC
      ) {
        initAfterAccess();
        return true;
      }
      return false;
    }
    if (tryInit()) return;
    window.addEventListener("vc:staff-access-ok", initAfterAccess, { once: true });
    window.addEventListener("vc:access-ok", initAfterAccess, { once: true });
    var tries = 0;
    var timer = null;
    /* perfRoiPack1: pause boot poll when tab is hidden, restart on show */
    function _pauseBootTick() {
      if (document.hidden) return;
      tries += 1;
      if (tryInit() || tries > 40) { window.clearInterval(timer); timer = null; }
    }
    timer = window.setInterval(_pauseBootTick, 250);
    document.addEventListener("visibilitychange", function _pauseBootVis() {
      /* perfRoiPack1 */
      if (!document.hidden && !timer) {
        timer = window.setInterval(_pauseBootTick, 250);
      } else if (document.hidden && timer) {
        window.clearInterval(timer); timer = null;
      }
    }, false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
/* compitiChromeSync1 */
