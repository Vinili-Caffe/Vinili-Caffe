(function () {
  "use strict";

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) {
      el.hidden = true;
      el.setAttribute("hidden", "");
    } else {
      el.hidden = false;
      el.removeAttribute("hidden");
    }
  }

  function resolveEventAccess(data) {
    if (!data || typeof data !== "object") return { open: false, phase: "misconfigured" };
    if (data.enabled === false) return { open: false, phase: "disabled" };
    if (data.previewMode) {
      if (window.__VC_HOGWARTS_STAFF_PREVIEW) return { open: true, phase: "preview" };
      return { open: false, phase: "preview_forbidden" };
    }
    const now = Date.now();
    const start = Number(data.eventStartMs);
    const end = Number(data.eventEndMs);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return { open: false, phase: "misconfigured" };
    if (now < start) return { open: false, phase: "before_start" };
    if (now > end) return { open: false, phase: "after_end" };
    return { open: true, phase: "live" };
  }

  function gateMessage(phase, windowLabel) {
    const window = String(windowLabel || "").trim();
    if (phase === "disabled") return "L'evento Hogwarts non è attivo al momento.";
    if (phase === "before_start") {
      return window
        ? `Il calendario aprirà con l'inizio dell'evento (${window}). Torna quando sarà live!`
        : "Il calendario aprirà con l'inizio dell'evento. Torna quando sarà live!";
    }
    if (phase === "after_end") return "L'evento è terminato. Grazie per aver partecipato!";
    if (phase === "misconfigured") return "Calendario evento temporaneamente non disponibile.";
    if (phase === "preview_forbidden") return "Anteprima riservata all'High Staff del server.";
    return "Calendario non disponibile al momento.";
  }

  function applyHubGate(data) {
    const access = resolveEventAccess(data);
    const gate = document.getElementById("vc-hw-hub-gate");
    const gateMsg = document.getElementById("vc-hw-hub-gate-msg");
    const app = document.getElementById("vc-hw-hub-app");
    if (access.open) {
      setHidden(gate, true);
      setHidden(app, false);
      return true;
    }
    if (gateMsg) gateMsg.textContent = gateMessage(access.phase, data.windowLabel);
    setHidden(gate, false);
    setHidden(app, true);
    return false;
  }

  function todayKey(timezone, nowMs) {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "Europe/Rome" }).format(new Date(nowMs || Date.now()));
    } catch {
      return new Date(nowMs || Date.now()).toISOString().slice(0, 10);
    }
  }

  function parseDayMs(iso) {
    const d = String(iso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(d)) return NaN;
    return new Date(d.includes("T") ? d : `${d}T12:00:00`).getTime();
  }

  function weekPhase(week, nowMs, timezone) {
    const t = parseDayMs(todayKey(timezone, nowMs));
    if (!Number.isFinite(t) || !week) return "upcoming";
    if (t < week.startMs) return "upcoming";
    if (t > week.endMs) return "past";
    return "current";
  }

  function isPotionsHref(href) {
    return /\/evento\/pozioni\/?$/i.test(String(href || "").split("?")[0].split("#")[0]);
  }

  function canLinkStaffPreviewFeature(data, href) {
    if (data && data.previewMode && !window.__VC_HOGWARTS_STAFF_PREVIEW) return false;
    if (isPotionsHref(href)) return canLinkPotions(data);
    return true;
  }

  function canLinkPotions(data) {
    const pot = data && data.potions;
    if (!pot || pot.enabled === false) return false;
    const startMs = Number(pot.startMs);
    if (Number.isFinite(startMs) && Date.now() >= startMs) return true;
    return Boolean(window.__VC_HOGWARTS_STAFF_PREVIEW);
  }

  function renderActivities(container, activities, data) {
    if (!container) return;
    const list = Array.isArray(activities) ? activities : [];
    if (!list.length) {
      container.innerHTML = '<p class="vc-hw-hub-empty">Nessuna attività programmata per questa settimana.</p>';
      return;
    }
    container.innerHTML = list
      .map((a) => {
        const icon = esc(a.icon || "fa-star");
        const title = esc(a.title);
        const summary = esc(a.summary);
        let href = String(a.href || "").trim();
        if (href && !canLinkStaffPreviewFeature(data, href)) href = "";
        const inner = `<div class="vc-hw-hub-activity__ico" aria-hidden="true"><i class="fa ${icon}"></i></div>
          <div class="vc-hw-hub-activity__body">
            <h3 class="vc-hw-hub-activity__title">${title}</h3>
            ${summary ? `<p class="vc-hw-hub-activity__summary">${summary}</p>` : ""}
          </div>`;
        if (href) {
          return `<a class="vc-hw-hub-activity vc-hw-hub-activity--link" href="${esc(href)}">${inner}<span class="vc-hw-hub-activity__chev" aria-hidden="true"><i class="fa fa-chevron-right"></i></span></a>`;
        }
        return `<article class="vc-hw-hub-activity">${inner}</article>`;
      })
      .join("");
  }

  function renderAllWeeks(root, data) {
    if (!root) return;
    const weeks = Array.isArray(data.weeks) ? data.weeks : [];
    const nowMs = Date.now();
    root.innerHTML = weeks
      .map((w) => {
        const phase = weekPhase(w, nowMs, data.timezone);
        const current = w.key === data.currentWeekKey ? " vc-hw-hub-all-week--live" : "";
        return `<article class="vc-hw-hub-all-week vc-hw-hub-all-week--${phase}${current}">
          <header class="vc-hw-hub-all-week__head">
            <h3 class="vc-hw-hub-all-week__title">${esc(w.label)}</h3>
            <p class="vc-hw-hub-all-week__range">${esc(w.rangeLabel)}</p>
          </header>
          <div class="vc-hw-hub-activity-grid mt-4"></div>
        </article>`;
      })
      .join("");
    root.querySelectorAll(".vc-hw-hub-all-week").forEach((block, i) => {
      const grid = block.querySelector(".vc-hw-hub-activity-grid");
      if (grid && weeks[i]) renderActivities(grid, weeks[i].activities, data);
    });
  }

  function renderCurrentWeek(data) {
    const weeks = Array.isArray(data.weeks) ? data.weeks : [];
    const week = weeks.find((w) => w.key === data.currentWeekKey) || weeks[0];
    const range = document.getElementById("vc-hw-hub-current-range");
    const grid = document.getElementById("vc-hw-hub-current-activities");
    const section = document.querySelector(".vc-hw-hub-current");
    if (range && week) range.textContent = week.rangeLabel || "";
    if (grid && week) renderActivities(grid, week.activities, data);
    if (section) section.hidden = false;
  }

  function bootPreviewTools(data) {
    if (!data.previewMode) return;
    const tools = document.getElementById("vc-hw-hub-preview-tools");
    const toggleBtn = document.getElementById("vc-hw-hub-toggle-all");
    const allSection = document.getElementById("vc-hw-hub-all-weeks");
    const currentSection = document.querySelector(".vc-hw-hub-current");
    if (!tools || !toggleBtn || !allSection) return;
    tools.hidden = false;
    tools.removeAttribute("hidden");
    let expanded = false;
    const setExpanded = (on) => {
      expanded = Boolean(on);
      allSection.hidden = !expanded;
      if (currentSection) currentSection.hidden = expanded;
      toggleBtn.innerHTML = expanded
        ? '<i class="fa fa-compress" aria-hidden="true"></i> Solo settimana corrente'
        : '<i class="fa fa-calendar" aria-hidden="true"></i> Mostra tutte le settimane';
      toggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (expanded && !allSection.dataset.rendered) {
        renderAllWeeks(allSection, data);
        allSection.dataset.rendered = "1";
      }
    };
    toggleBtn.addEventListener("click", () => setExpanded(!expanded));
    setExpanded(false);
  }

  function refreshCalendar(data) {
    if (!data || typeof data !== "object") return;
    if (!applyHubGate(data)) return;
    renderCurrentWeek(data);
    const allSection = document.getElementById("vc-hw-hub-all-weeks");
    if (allSection && allSection.dataset.rendered === "1") renderAllWeeks(allSection, data);
  }

  function boot() {
    const data = window.__VC_HOGWARTS_EVENT_CALENDAR;
    if (!data || typeof data !== "object") return;
    refreshCalendar(data);
    bootPreviewTools(data);
  }

  document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
    const data = window.__VC_HOGWARTS_EVENT_CALENDAR;
    if (data) refreshCalendar(data);
  });
  document.addEventListener("vc-hogwarts-potions-unlock", function () {
    const data = window.__VC_HOGWARTS_EVENT_CALENDAR;
    if (data) refreshCalendar(data);
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();