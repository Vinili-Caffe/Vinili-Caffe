const fs = require("fs");
const path = require("path");
const { makeStaffPageHtml } = require("./_staffPageTemplate.cjs");

const root = path.join(__dirname, "..");
const pages = [
  {
    dir: "directory",
    title: "Directory staff",
    description: "Elenco staff del server principale.",
    path: "directory",
    kicker: "Directory",
    heading: "Directory staff",
    lead: "Ruoli, membri e chi è in pausa ora.",
    statusId: "vc-staff-dir-status",
    rootId: "vc-staff-dir",
    pageScript: "staff-directory-page.js",
    extraAuthBlocks: `      window.__VC_STAFF_DIRECTORY = {
        apiUrl: "{{STAFF_DIRECTORY_API_URL}}",
        apiUrlLocal: "{{STAFF_DIRECTORY_API_URL_LOCAL}}",
      };`,
  },
  {
    dir: "pm",
    title: "Partner Manager",
    description: "Punti, classifica e blacklist partnership.",
    path: "pm",
    kicker: "PM",
    heading: "Hub Partner Manager",
    lead: "I tuoi punti, la classifica e la blacklist (sola lettura).",
    statusId: "vc-staff-pm-status",
    rootId: "vc-staff-pm",
    pageScript: "staff-pm-page.js",
    extraAuthBlocks: `      window.__VC_STAFF_PM_HUB = {
        apiUrl: "{{STAFF_PM_HUB_API_URL}}",
        apiUrlLocal: "{{STAFF_PM_HUB_API_URL_LOCAL}}",
      };`,
  },
  {
    dir: "valutazioni",
    title: "Valutazioni e warn",
    description: "Valutazioni e warn staff.",
    path: "valutazioni",
    kicker: "Val / Warn",
    heading: "Valutazioni e warn",
    lead: "I tuoi conteggi e, se High Staff, overview del team.",
    statusId: "vc-staff-val-status",
    rootId: "vc-staff-val",
    pageScript: "staff-valwarn-page.js",
    extraAuthBlocks: `      window.__VC_STAFF_VALWARN = {
        apiUrl: "{{STAFF_VALWARN_API_URL}}",
        apiUrlLocal: "{{STAFF_VALWARN_API_URL_LOCAL}}",
      };`,
  },
  {
    dir: "ticket",
    title: "Ticket aperti",
    description: "Ticket aperti in sola lettura.",
    path: "ticket",
    kicker: "Ticket",
    heading: "Ticket aperti",
    lead: "Board read-only: claim e chiusura restano su Discord.",
    statusId: "vc-staff-ticket-status",
    rootId: "vc-staff-ticket",
    pageScript: "staff-tickets-page.js",
    extraAuthBlocks: `      window.__VC_STAFF_TICKETS = {
        apiUrl: "{{STAFF_TICKETS_API_URL}}",
        apiUrlLocal: "{{STAFF_TICKETS_API_URL_LOCAL}}",
      };`,
  },
  {
    dir: "guida",
    title: "Guida staff",
    description: "Manuale ufficiale dello staff Vinili & Caffè.",
    path: "guida",
    kicker: "Guida",
    heading: "Guida staff",
    lead: "Regolamento, limiti, moderazione e procedure — come su Discord.",
    statusId: "vc-staff-guide-status",
    rootId: "vc-staff-guide",
    pageScript: "staff-guide-page.js",
    extraAuthBlocks: `      window.__VC_STAFF_GUIDE = {
        apiUrl: "{{STAFF_GUIDE_API_URL}}",
        apiUrlLocal: "{{STAFF_GUIDE_API_URL_LOCAL}}",
      };`,
  },
];

for (const p of pages) {
  const dir = path.join(root, "staff", p.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), makeStaffPageHtml(p), "utf8");
  console.log("wrote", dir);
}
